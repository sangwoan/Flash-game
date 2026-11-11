package com.blockbot.app

import android.graphics.Bitmap
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import com.blockbot.app.BotLog.Companion.json
import com.blockbot.core.Board
import com.blockbot.core.BoardGeometry
import com.blockbot.core.DragModel
import com.blockbot.core.DragObserver
import com.blockbot.core.DragServo
import com.blockbot.core.DragPath
import com.blockbot.core.DragPlanner
import com.blockbot.core.PieceDistribution
import com.blockbot.core.GameState
import com.blockbot.core.GameTracker
import com.blockbot.core.HeuristicEvaluator
import com.blockbot.core.LookaheadConfig
import com.blockbot.core.Piece
import com.blockbot.core.PixelImage
import com.blockbot.core.Plan
import com.blockbot.core.RuleConfig
import com.blockbot.core.Rules
import com.blockbot.core.ScoreModel
import com.blockbot.core.Solver
import com.blockbot.core.Step
import com.blockbot.core.TrackEvent
import com.blockbot.core.Vision
import com.blockbot.core.VisionResult
import com.blockbot.core.Weights
import java.util.concurrent.Executor

enum class Mode { OFF, HINT, AUTO }

/**
 * 캡처 → 인식 → 상태 추적 → 계산 → (힌트 표시 | 드래그 실행) → 재캡처 루프.
 * 모든 처리는 전용 작업 스레드에서 돈다. UI 갱신은 OverlayUi가 메인 스레드로 넘긴다.
 */
class BotController(
    private val service: BotService,
    private val prefs: Prefs,
    private val log: BotLog,
    private val ui: OverlayUi,
) {
    private val thread = HandlerThread("blockbot-worker").apply { start() }
    private val handler = Handler(thread.looper)
    private val executor = Executor { handler.post(it) }

    @Volatile var mode = Mode.OFF
        private set

    private var weights = Weights()
    private var distribution = PieceDistribution.DEFAULT
    private var modelStamp = ""
    private val scoreModel = ScoreModel()
    private var rules = Rules(RuleConfig(comboMode = prefs.comboMode))
    private var tracker = GameTracker(rules)
    private val lookahead = LookaheadConfig()
    private var solver = newSolver()

    private var geo: BoardGeometry? = null
    private var badFrames = 0
    private var lastVision: VisionResult? = null
    private var plan: Plan? = null
    private var planFor: Pair<GameState, List<Piece?>>? = null
    private var planMs = 0L
    private var dragObs = prefs.dragObservations.toMutableList()
    private var dragModel = DragModel.fit(dragObs)
    private var holdShots = 0
    private var cellColors: DoubleArray? = null             // 마지막 깨끗한 프레임의 칸 색 (드래그 전 기준)
    private val trayColors = arrayOfNulls<DoubleArray>(3)   // 트레이 블록 색
    private var biasCandidate: Pair<Int, Int>? = null
    private var gamePackage: String? = null
    private var pending: PendingMove? = null
    private var pixels: IntArray? = null
    private var lastShotAt = 0L
    private var estScore = 0.0
    private var frames = 0L
    private var unstableSince = 0L
    private var stuckReported = false
    private var screenW = 0
    private var screenH = 0

    private data class PendingMove(
        val step: Step,
        val attempt: Int,
        val extraLift: Double,
        var path: DragPath,
        val boardBefore: Board,
        var startedAt: Long,
        var rawSeenAtRelease: Pair<Int, Int>? = null, // 놓는 순간 화면에서 본 위치 (보정 전)
        var learnedInDrag: Boolean = false,
        var predicted: Board? = null,                 // 계획대로 놓였을 때의 보드
        var unchangedFrames: Int = 0,
    )

    private val tick = Runnable { captureAndProcess() }

    fun setMode(m: Mode) {
        handler.post {
            if (m == mode) return@post
            mode = m
            when (m) {
                Mode.OFF -> {
                    handler.removeCallbacks(tick)
                    pending = null
                    ui.showPlan(null, null)
                    ui.status("정지됨 — [힌트] 또는 [자동]을 누르세요")
                }
                Mode.HINT, Mode.AUTO -> {
                    if (rules.config.comboMode != prefs.comboMode) rebuildRules()
                    loadModels()
                    dragObs = prefs.dragObservations.toMutableList()
                    dragModel = DragModel.fit(dragObs)
                    if (m == Mode.AUTO) gamePackage = service.activePackage()
                    pending = null
                    ui.status(if (m == Mode.AUTO) "자동 시작 — 화면 읽는 중…" else "힌트 시작 — 화면 읽는 중…")
                    schedule(0)
                }
            }
            log.event("mode", json("mode" to m.name, "game" to gamePackage, "comboMode" to rules.config.comboMode.name))
            ui.modeChanged(m)
        }
    }

    private var reports = 0

    /**
     * 📷 버튼: 지금 화면(패널·힌트 포함, 사용자가 보는 그대로)과 인식·추적·계획 상태를 함께 저장.
     * 맥에서 mac/pull-logs.sh로 가져오면 logs-from-phone의 screens 폴더에 report 이름의 PNG로 들어 있다.
     */
    fun saveReport() {
        handler.post {
            val wait = (MIN_SHOT_INTERVAL_MS - (now() - lastShotAt)).coerceAtLeast(0)
            handler.postDelayed({
                lastShotAt = now()
                service.capture(executor) { bmp, err ->
                    reports++
                    val name = bmp?.let { log.screenshot(it, "report") }
                    val v = lastVision
                    val st = tracker.state
                    log.event("report", json(
                        "n" to reports, "screen" to name, "captureError" to (if (bmp == null) err else null),
                        "mode" to mode.name, "status" to ui.currentStatus,
                        "visionIssues" to v?.issues, "visionWarnings" to v?.warnings, "uncertain" to v?.uncertainCells,
                        "board" to v?.board?.toAscii(), "tray" to v?.trayPieces?.map { it?.pattern() },
                        "bevel" to v?.cellBevel?.map { it.toInt() },
                        "trackedBoard" to st?.board?.toAscii(), "combo" to st?.comboStreak,
                        "plan" to plan?.steps?.map { "slot${it.slot}@${it.row},${it.col}" },
                        "geometry" to geo?.let { "%.0f,%.0f,%.1f".format(it.x0, it.y0, it.cell) },
                        "drag" to dragModel.describe(),
                    ))
                    bmp?.recycle()
                    ui.status(if (name != null) "📷 저장됨 #$reports — 맥에서 mac/pull-logs.sh 로 가져오기" else "📷 캡처 실패 (코드 $err)")
                }
            }, wait)
        }
    }

    fun shutdown() {
        handler.removeCallbacksAndMessages(null)
        thread.quitSafely()
    }

    private fun rebuildRules() {
        rules = Rules(RuleConfig(comboMode = prefs.comboMode))
        tracker = GameTracker(rules)
        solver = newSolver()
        plan = null
    }

    /** 다음 라운드 수읽기 포함 솔버. 폰에서는 시간 한도(1.5초) 안에서 샘플 수가 자동 조절됨. */
    private fun newSolver() = Solver(rules = rules, weights = weights, scoreModel = scoreModel, lookahead = lookahead, distribution = distribution)

    /**
     * 맥에서 학습해 올린 모델 파일(mac/learn.sh)이 있으면 읽는다:
     *  model/distribution.txt (실제 블록 분포·관대함), model/weights.txt (튜닝된 평가 가중치)
     */
    private fun loadModels() {
        val dirs = listOfNotNull(service.getExternalFilesDir("model"), java.io.File(service.filesDir, "model"))
        fun find(name: String) = dirs.map { java.io.File(it, name) }.filter { it.isFile }.maxByOrNull { it.lastModified() }
        val df = find("distribution.txt")
        val wf = find("weights.txt")
        val stamp = "${df?.lastModified()}:${wf?.lastModified()}"
        if (stamp == modelStamp) return
        modelStamp = stamp
        distribution = df?.let { runCatching { PieceDistribution.fromText(it.readText()) }.getOrNull() } ?: PieceDistribution.DEFAULT
        weights = wf?.let { runCatching { Weights.fromText(it.readText()) }.getOrNull() } ?: Weights()
        solver = newSolver()
        plan = null
        log.event("models", json(
            "distribution" to (df?.path ?: "기본"), "friendly" to distribution.friendly, "learnedRounds" to distribution.learnedRounds,
            "weights" to (wf?.path ?: "기본"),
        ))
    }

    /** 다음 화면 확인: 자동 모드에서는 스크린샷 최소 간격(0.36초)마다, 힌트 모드는 0.4초마다. */
    private fun poll() = schedule(if (mode == Mode.AUTO) 30L else POLL_MS)

    private fun schedule(delayMs: Long) {
        handler.removeCallbacks(tick)
        if (mode != Mode.OFF) handler.postDelayed(tick, delayMs)
    }

    private fun now() = SystemClock.elapsedRealtime()

    private fun captureAndProcess() {
        if (mode == Mode.OFF) return
        val wait = MIN_SHOT_INTERVAL_MS - (now() - lastShotAt)
        if (wait > 0) { schedule(wait); return }
        lastShotAt = now()
        // 격자를 새로 찾을 때는 힌트 그림이 방해되지 않게 잠깐 숨김
        val hide = geo == null
        if (hide) ui.setHintsVisible(false)
        handler.postDelayed({
            service.capture(executor) { bmp, err ->
                if (bmp == null) {
                    ui.status("화면 캡처 실패 (코드 $err) — 잠시 후 재시도")
                    schedule(POLL_IDLE_MS)
                } else {
                    try {
                        process(bmp)
                    } catch (t: Throwable) {
                        log.event("error", json("msg" to t.toString(), "stack" to t.stackTraceToString().take(2000)))
                        ui.status("오류: ${t.message}")
                        schedule(POLL_IDLE_MS)
                    } finally {
                        bmp.recycle()
                    }
                }
            }
        }, if (hide) 150L else 0L)
    }

    private fun process(bmp: Bitmap) {
        if (mode == Mode.OFF) return
        val w = bmp.width
        val h = bmp.height
        screenW = w; screenH = h
        val px = pixels?.takeIf { it.size == w * h } ?: IntArray(w * h).also { pixels = it }
        bmp.getPixels(px, 0, w, 0, 0, w, h)
        val img = PixelImage(w, h, px)

        pending?.let { p ->
            if (now() - p.startedAt > PENDING_TIMEOUT_MS) {
                log.event("move_timeout", json("slot" to p.step.slot, "row" to p.step.row, "col" to p.step.col))
                pending = null
            }
        }

        var g = geo
        if (g == null) {
            g = Vision.detectGeometry(img)
            ui.setHintsVisible(true)
            if (g == null) {
                ui.status("보드를 찾는 중… 게임 화면을 띄워 주세요")
                schedule(POLL_IDLE_MS)
                return
            }
            geo = g
            log.event("geometry", json("x0" to g.x0, "y0" to g.y0, "cellW" to g.cellW, "cellH" to g.cellH, "w" to w, "h" to h))
        }

        val v = Vision.read(img, g)
        lastVision = v
        if (v.clean) {
            cellColors = DragObserver.cellColors(img, g)
            for (i in 0 until 3) trayColors[i] = v.tray.getOrNull(i)?.let { trayColor(img, it) }
        }
        if (!v.clean) {
            badFrames++
            if (badFrames >= GEOMETRY_RESET_FRAMES) {
                log.event("geometry_reset", json("issues" to v.issues, "uncertain" to v.uncertainCells,
                    "bevel" to v.cellBevel.map { it.toInt() },
                    "screen" to if (prefs.saveScreens) log.screenshot(bmp, "geometry_reset") else null))
                geo = null
                badFrames = 0
            }
        } else badFrames = 0

        frames++
        // 방금 둔 수의 예상 결과와 화면이 정확히 같으면(보드 일치 + 트레이에서 그 블록만 빠짐) 한 프레임으로 확정
        val pm = pending
        val trusted = pm != null && v.clean && v.board == pm.predicted &&
            v.trayPieces == tracker.tray.mapIndexed { i, t -> if (i == pm.step.slot) null else t } && v.trayPieces.any { it != null }
        val ev = tracker.observe(v, trusted)
        if (ev !is TrackEvent.Unstable) { unstableSince = 0L; stuckReported = false }
        when (ev) {
            is TrackEvent.Unstable -> {
                if (unstableSince == 0L) unstableSince = now()
                val waited = (now() - unstableSince) / 1000
                val what = friendly(ev.reason, v)
                if (waited >= STUCK_SECS && !stuckReported) {
                    stuckReported = true
                    log.event("stuck", json(
                        "reason" to ev.reason, "issues" to v.issues, "uncertain" to v.uncertainCells,
                        "board" to v.board.toAscii(), "tray" to v.trayPieces.map { it?.pattern() },
                        "bevel" to v.cellBevel.map { it.toInt() },
                        "screen" to if (prefs.saveScreens) log.screenshot(bmp, "stuck") else null,
                    ))
                }
                if (pending == null) ui.status(
                    if (waited >= STUCK_SECS) "⚠ ${waited}초째 화면 확정 못 함 — $what\n게임 화면이 맞다면 로그를 보내 주세요"
                    else "${spinner()} $what"
                )
                poll()
                return
            }
            is TrackEvent.Resync -> {
                val shot = if (ev.reason != "시작" && prefs.saveScreens) log.screenshot(bmp, "resync") else null
                log.event("resync", json("msg" to ev.reason, "board" to v.board.toAscii(), "tray" to v.trayPieces.map { it?.pattern() }, "screen" to shot))
                if (v.trayPieces.all { it != null }) logRound("resync")
                if (ev.reason == "새 게임") estScore = 0.0
                pending = null
                plan = null
            }
            is TrackEvent.Placed -> onPlaced(ev)
            TrackEvent.Unchanged -> {
                val p = pending
                if (p != null) {
                    p.unchangedFrames++
                    if (p.unchangedFrames >= 2 && now() - p.startedAt > prefs.moveDelayMs + 700) {
                        val shot = if (prefs.saveScreens) log.screenshot(bmp, "drop_rejected") else null
                        dropRejected(p, shot)
                    } else poll()
                    return
                }
            }
        }
        decideAndAct()
    }

    /** 블록 3개가 새로 나온 순간의 보드·트레이 (블록 출현 패턴 학습용). */
    private fun logRound(source: String) {
        val st = tracker.state ?: return
        log.event("round", json(
            "bits" to java.lang.Long.toHexString(st.board.bits),
            "tray" to tracker.tray.map { it?.pattern() },
            "combo" to st.comboStreak,
            "source" to source,
        ))
    }

    private fun onPlaced(ev: TrackEvent.Placed) {
        val st = tracker.state
        if (ev.newRound) logRound("refill")
        for (t in ev.transitions) estScore += scoreModel.points(t.result)
        log.event("placed", json(
            "moves" to ev.transitions.map { "slot${it.slot}:${it.piece.pattern()}@${it.row},${it.col} lines=${it.result.lines}" },
            "newRound" to ev.newRound,
            "combo" to st?.comboStreak,
            "estScore" to estScore.toInt(),
        ))
        // 계획의 첫 수 그대로 놓였으면 남은 수는 다시 계산하지 않고 이어서 쓴다 (수읽기 1.5초 × 2회 절약)
        val pl = plan
        val only = ev.transitions.singleOrNull()
        val newSt = tracker.state
        if (pl != null && only != null && !ev.newRound && newSt != null && pl.steps.size > 1 &&
            pl.steps[0].let { it.slot == only.slot && it.row == only.row && it.col == only.col }) {
            plan = pl.copy(steps = pl.steps.drop(1), totalPieces = pl.totalPieces - 1)
            planFor = newSt to tracker.tray
        }
        val p = pending ?: return
        pending = null
        val g = geo ?: return
        val t = ev.transitions.firstOrNull { it.slot == p.step.slot } ?: return
        learnVisualBias(p, t.row, t.col)
        // 손가락을 뗀 위치 → 실제 착지 위치를 관측으로 쌓고 모델을 다시 맞춘다 (배율·띄움·치우침)
        val obs = DragPlanner.observe(g, p.path, t.piece, t.row, t.col)
        val (prx, pry) = dragModel.predict(obs)
        val errX = (obs.px - prx) / obs.cell
        val errY = (obs.py - pry) / obs.cell
        dragObs.add(obs)
        while (dragObs.size > Prefs.MAX_DRAG_OBS) dragObs.removeAt(0)
        prefs.dragObservations = dragObs
        dragModel = DragModel.fit(dragObs)
        log.event("drag_learn", json(
            "intended" to "${p.step.row},${p.step.col}", "actual" to "${t.row},${t.col}",
            "hit" to (t.row == p.step.row && t.col == p.step.col),
            "predErrCells" to String.format(java.util.Locale.US, "%.2f,%.2f", errX, errY),
            "model" to dragModel.describe(),
        ))
    }

    private fun dropRejected(p: PendingMove, shot: String?) {
        pending = null
        val next = p.attempt + 1
        log.event("drop_rejected", json(
            "slot" to p.step.slot, "row" to p.step.row, "col" to p.step.col, "attempt" to p.attempt, "screen" to shot,
            "from" to "%.0f,%.0f".format(p.path.fromX, p.path.fromY), "to" to "%.0f,%.0f".format(p.path.toX, p.path.toY),
        ))
        if (next >= DragPlanner.MAX_ATTEMPTS) {
            ui.status("드래그가 반영되지 않아 자동을 멈췄습니다. 힌트 모드로 전환합니다.")
            mode = Mode.HINT
            ui.modeChanged(Mode.HINT)
            poll()
            return
        }
        execute(p.step, next)
    }

    private fun decideAndAct() {
        val g = geo ?: return poll()
        val st = tracker.state ?: return poll()
        val tray = tracker.tray
        if (tray.all { it == null }) {
            ui.showPlan(g, null)
            poll()
            return
        }
        if (plan == null || planFor != (st to tray)) {
            val t0 = now()
            val res = solver.solve(st, tray)
            planMs = now() - t0
            plan = res.best
            planFor = st to tray
            log.event("plan", json(
                "board" to st.board.toAscii(),
                "tray" to tray.map { it?.pattern() },
                "combo" to st.comboStreak,
                "steps" to res.best.steps.map { "slot${it.slot}@${it.row},${it.col} lines=${it.linesCleared}" },
                "survives" to res.best.survives,
                "perfect" to res.best.perfectClear,
                "path" to res.best.pathScore,
                "leaf" to res.best.leafScore,
                "nextValue" to res.best.outlook?.value,
                "nextDeathRate" to res.best.outlook?.deathRate,
                "nextSamples" to res.best.outlook?.samples,
                "leafBreakdown" to HeuristicEvaluator(weights).breakdown(res.best.finalState),
                "alternatives" to res.top.drop(1).map { "%.1f %s".format(it.score, it.steps.joinToString(" ") { s -> "${s.slot}@${s.row},${s.col}" }) },
                "ms" to planMs,
                "states" to res.statesExplored,
            ))
        }
        val p = plan!!
        ui.showPlan(g, p)
        ui.status(statusText(st, p))
        if (p.steps.isEmpty()) {
            schedule(POLL_IDLE_MS)
            return
        }
        if (mode == Mode.AUTO && pending == null) execute(p.steps.first(), 0) else poll()
    }

    /** 살아 있음을 보여주는 회전 표시 (화면을 읽을 때마다 바뀜). */
    private fun spinner(): String = SPIN[(frames % SPIN.size).toInt()]

    /** 대기 이유를 짧은 말로. */
    private fun friendly(reason: String, v: VisionResult): String = when {
        v.issues.any { it.contains("꽉 찬") } -> "줄 지우는 애니메이션 기다리는 중"
        v.issues.any { it.startsWith("슬롯") } -> "아래 블록 모양 읽는 중"
        v.issues.any { it.contains("트레이") } -> "블록 영역을 찾는 중"
        v.uncertainCells > 0 -> "화면이 움직이는 중 (애니메이션 끝나길 기다림)"
        reason == "안정화 대기" -> "화면 확인 중"
        reason == "드래그 중" -> "블록 옮기는 중"
        reason.startsWith("배치 설명 불가") -> "방금 둔 수 확인 중"
        else -> reason.take(40)
    }

    private fun statusText(st: GameState, p: Plan): String {
        val order = p.steps.mapIndexed { i, s -> "${CIRCLED[i]}슬롯${s.slot + 1}" }.joinToString(" ")
        val warn = when {
            p.steps.isEmpty() -> "  ⚠ 놓을 곳 없음"
            !p.survives -> "  ⚠ 3개 다 못 놓음"
            p.perfectClear -> "  ★퍼펙트"
            else -> ""
        }
        val head = if (mode == Mode.AUTO) "자동" else "힌트"
        val next = p.outlook?.let { " · 다음 판 생존 ${((1 - it.deathRate) * 100).toInt()}%" } ?: ""
        return "${spinner()} $head · 콤보 ${st.comboStreak} · 이번 +${p.pathScore.toInt()}$next · ${planMs}ms\n$order$warn"
    }

    /** 트레이 블록 한 칸의 가운데 색. */
    private fun trayColor(img: PixelImage, t: com.blockbot.core.TrayRead): DoubleArray {
        val c = t.piece.cells.first()
        val cw = (t.right - t.left + 1).toDouble() / t.piece.width
        val ch = (t.bottom - t.top + 1).toDouble() / t.piece.height
        val cx = t.left + (c.c + 0.5) * cw; val cy = t.top + (c.r + 0.5) * ch
        var r = 0.0; var g = 0.0; var b = 0.0; var n = 0
        val hx = (cw * 0.2).toInt(); val hy = (ch * 0.2).toInt()
        for (y in (cy - hy).toInt()..(cy + hy).toInt()) for (x in (cx - hx).toInt()..(cx + hx).toInt()) {
            if (x !in 0 until img.width || y !in 0 until img.height) continue
            val p = img.rgb(x, y); r += (p shr 16) and 0xFF; g += (p shr 8) and 0xFF; b += p and 0xFF; n++
        }
        return if (n == 0) doubleArrayOf(128.0, 128.0, 128.0) else doubleArrayOf(r / n, g / n, b / n)
    }

    /** 화면에서 본 위치와 실제 착지 칸이 같은 만큼 두 번 연속 다르면 그 차이를 보정값으로 쓴다. */
    private fun learnVisualBias(p: PendingMove, landedRow: Int, landedCol: Int) {
        val raw = p.rawSeenAtRelease ?: return
        val b = (landedRow - raw.first) to (landedCol - raw.second)
        val cur = prefs.visBiasRow to prefs.visBiasCol
        if (b == cur) { biasCandidate = null; return }
        if (kotlin.math.abs(b.first) > 3 || kotlin.math.abs(b.second) > 3) return
        if (biasCandidate == b) {
            prefs.visBiasRow = b.first; prefs.visBiasCol = b.second; biasCandidate = null
            log.event("visual_bias", json("row" to b.first, "col" to b.second))
        } else biasCandidate = b
    }

    /**
     * 자동 드래그 (보고 맞추기): 블록을 집어 예측 위치로 옮긴 뒤, 손가락을 누른 채 화면을 찍어
     * 블록이 실제로 어느 칸 위에 있는지 확인한다. 목표 칸이면 놓고, 아니면 어긋난 만큼 옮겨 다시 확인.
     * 끝내 못 맞추면 트레이로 되돌려 놓고(잘못된 칸에 놓지 않음) 다시 시도한다.
     */
    private fun execute(step: Step, attempt: Int) {
        val pkg = service.activePackage()
        if (gamePackage != null && pkg != null && pkg != gamePackage) {
            ui.status("게임 화면이 아니라서 대기 중 ($pkg)")
            schedule(POLL_IDLE_MS)
            return
        }
        val g = geo ?: return poll()
        val tr = lastVision?.tray?.getOrNull(step.slot) ?: return poll()
        val st = tracker.state ?: return poll()
        val before = cellColors ?: return poll()
        val pieceColor = trayColors[step.slot]
        val useModel = dragModel.forAttempt(attempt)
        // 드래그 모델이 아직 덜 맞춰졌을 때는 보드 가장자리 줄을 살짝 안쪽으로 겨냥한다:
        // 밖으로 지나치면 블록이 안 보여 되찾는 데 오래 걸리지만, 안쪽으로 한 칸 어긋난 건 0.2초면 고친다.
        val edgeBias = if (dragModel.samples >= 25) 0.0 else when {
            step.row == 0 -> 0.3
            step.row + step.piece.height == 8 -> -0.3
            else -> 0.0
        }
        val path = DragPlanner.plan(g, tr, step.piece, step.row, step.col, useModel, screenW, screenH, edgeBias)
        val p = PendingMove(step, attempt, 0.0, path, st.board, now())
        p.predicted = rules.apply(st, step.piece.maskAt(step.row, step.col)).state.board
        val speed = prefs.dragSpeed
        pending = p
        val servo = DragServo(g, step.piece, step.row, step.col, useModel, tr.centerX, tr.centerY, screenW, screenH,
            allowBlindRelease = !prefs.servoWorks)
        val trace = ArrayList<String>()
        log.event("move", json(
            "slot" to step.slot, "piece" to step.piece.pattern(), "row" to step.row, "col" to step.col,
            "attempt" to attempt, "model" to useModel.describe(),
            "from" to "%.0f,%.0f".format(path.fromX, path.fromY), "to" to "%.0f,%.0f".format(path.toX, path.toY),
        ))

        fun finish(how: String, h: BotService.DragHandle?) {
            if (h != null) p.path = DragPath(path.fromX, path.fromY, h.x, h.y)
            p.startedAt = now()
            // 드래그 중 확인한 위치들로 드래그 모델을 바로 갱신
            if (servo.observations.isNotEmpty()) {
                dragObs.addAll(servo.observations)
                while (dragObs.size > Prefs.MAX_DRAG_OBS) dragObs.removeAt(0)
                prefs.dragObservations = dragObs
                dragModel = DragModel.fit(dragObs)
                if (!prefs.servoWorks) prefs.servoWorks = true
            }
            log.event("drag_servo", json("result" to how, "corrections" to servo.corrections, "trace" to trace,
                "target" to "${step.row},${step.col}", "model" to dragModel.describe()))
            schedule(prefs.moveDelayMs.toLong())
        }

        fun look(h: BotService.DragHandle) {
            if (mode != Mode.AUTO) { h.moveTo(path.fromX, path.fromY) { h.release { finish("stopped", h) } }; return }
            var done = false
            var seen: Pair<Int, Int>? = null
            var raw: Pair<Int, Int>? = null
            // 블록이 자리 잡을 시간 + 스크린샷 최소 간격을 지켜 캡처
            val delay = maxOf(prefs.lookDelayMs, MIN_SHOT_INTERVAL_MS - (now() - lastShotAt))
            handler.postDelayed({
                lastShotAt = now()
                service.capture(executor) { bmp, _ ->
                    if (bmp != null) {
                        try {
                            val px = pixels?.takeIf { it.size == bmp.width * bmp.height } ?: IntArray(bmp.width * bmp.height).also { pixels = it }
                            bmp.getPixels(px, 0, bmp.width, 0, 0, bmp.width, bmp.height)
                            val after = DragObserver.cellColors(PixelImage(bmp.width, bmp.height, px), g)
                            raw = DragObserver.locate(before, after, st.board.bits, step.piece, pieceColor)
                            seen = raw?.let { (it.first + prefs.visBiasRow) to (it.second + prefs.visBiasCol) }
                            if (prefs.saveScreens && holdShots < HOLD_SHOTS_PER_SESSION) {
                                holdShots++
                                log.screenshot(bmp, "drag_hold_target_r${step.row}c${step.col}_seen_${seen?.first}_${seen?.second}")
                            }
                        } finally { bmp.recycle() }
                    }
                    done = true
                }
            }, delay)
            h.holdUntil({ done }, 2500) {
                trace += "finger=%.0f,%.0f seen=%s".format(h.x, h.y, seen?.let { "${it.first},${it.second}" } ?: "none")
                ui.status("자동 · 위치 확인: " + (seen?.let { "${it.first + 1}행 ${it.second + 1}열" } ?: "안 보임") + " → 목표 ${step.row + 1}행 ${step.col + 1}열")
                when (val a = servo.onObservation(h.x.toDouble(), h.y.toDouble(), seen)) {
                    is DragServo.Action.MoveTo -> {
                        // 가까운 보정(3칸 이내)은 한 번에 짧게, 먼 이동만 감속 이동
                        val far = kotlin.math.hypot(a.x - h.x, a.y - h.y) > g.cell * 3
                        if (far) h.moveTo(a.x.toFloat(), a.y.toFloat(), BotService.FAST_PX_PER_MS * speed, BotService.SLOW_PX_PER_MS * speed) { look(h) }
                        else h.nudgeTo(a.x.toFloat(), a.y.toFloat(), BotService.NUDGE_PX_PER_MS * speed) { look(h) }
                    }
                    is DragServo.Action.Release -> {
                        p.rawSeenAtRelease = if (a.confirmed) raw else null
                        h.release { finish(if (a.confirmed) "confirmed" else "blind", h) }
                    }
                    DragServo.Action.Cancel -> h.moveTo(path.fromX, path.fromY) { h.release { finish("cancelled", h) } }
                }
            }
        }

        service.beginDrag(path.fromX, path.fromY, handler, prefs.pickupHoldMs, onFail = {
            log.event("gesture_failed", json("slot" to step.slot, "trace" to trace))
            finish("gesture_failed", null)
        }) { h -> h.moveTo(path.toX, path.toY, BotService.FAST_PX_PER_MS * speed, BotService.SLOW_PX_PER_MS * speed) { look(h) } }
    }

    companion object {
        const val MIN_SHOT_INTERVAL_MS = 360L // 접근성 스크린샷 API 최소 간격(약 333ms)
        const val POLL_MS = 400L
        const val POLL_IDLE_MS = 1000L
        const val PENDING_TIMEOUT_MS = 6000L
        const val GEOMETRY_RESET_FRAMES = 10
        const val STUCK_SECS = 6L
        const val HOLD_SHOTS_PER_SESSION = 6
        private val SPIN = arrayOf("◐", "◓", "◑", "◒")
        private val CIRCLED = arrayOf("①", "②", "③", "④", "⑤")
    }
}
