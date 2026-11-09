package com.blockbot.app

import android.graphics.Bitmap
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import com.blockbot.app.BotLog.Companion.json
import com.blockbot.core.Board
import com.blockbot.core.BoardGeometry
import com.blockbot.core.DragModel
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
        val path: DragPath,
        val boardBefore: Board,
        val startedAt: Long,
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
        val ev = tracker.observe(v)
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
                schedule(POLL_MS)
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
                    if (p.unchangedFrames >= 2 && now() - p.startedAt > prefs.moveDelayMs + 400) {
                        val shot = if (prefs.saveScreens) log.screenshot(bmp, "drop_rejected") else null
                        dropRejected(p, shot)
                    } else schedule(POLL_MS)
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
        val p = pending ?: return
        pending = null
        val g = geo ?: return
        val t = ev.transitions.firstOrNull { it.slot == p.step.slot } ?: return
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
        log.event("drop_rejected", json("slot" to p.step.slot, "row" to p.step.row, "col" to p.step.col, "attempt" to p.attempt, "screen" to shot))
        if (next >= DragPlanner.RETRY_EXTRA_LIFT.size) {
            ui.status("드래그가 반영되지 않아 자동을 멈췄습니다. 힌트 모드로 전환합니다.")
            mode = Mode.HINT
            ui.modeChanged(Mode.HINT)
            schedule(POLL_MS)
            return
        }
        execute(p.step, next)
    }

    private fun decideAndAct() {
        val g = geo ?: return schedule(POLL_MS)
        val st = tracker.state ?: return schedule(POLL_MS)
        val tray = tracker.tray
        if (tray.all { it == null }) {
            ui.showPlan(g, null)
            schedule(POLL_MS)
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
        if (mode == Mode.AUTO && pending == null) execute(p.steps.first(), 0) else schedule(POLL_MS)
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

    private fun execute(step: Step, attempt: Int) {
        val pkg = service.activePackage()
        if (gamePackage != null && pkg != null && pkg != gamePackage) {
            ui.status("게임 화면이 아니라서 대기 중 ($pkg)")
            schedule(POLL_IDLE_MS)
            return
        }
        val g = geo ?: return schedule(POLL_MS)
        val tr = lastVision?.tray?.getOrNull(step.slot) ?: return schedule(POLL_MS)
        val st = tracker.state ?: return schedule(POLL_MS)
        val extra = DragPlanner.RETRY_EXTRA_LIFT[attempt]
        val path = DragPlanner.plan(g, tr, step.piece, step.row, step.col, dragModel, screenW, screenH, extra)
        pending = PendingMove(step, attempt, extra, path, st.board, now())
        log.event("move", json(
            "slot" to step.slot, "piece" to step.piece.pattern(), "row" to step.row, "col" to step.col,
            "attempt" to attempt, "extraLift" to extra, "model" to dragModel.describe(),
            "from" to "%.0f,%.0f".format(path.fromX, path.fromY), "to" to "%.0f,%.0f".format(path.toX, path.toY),
        ))
        // 세션 처음 몇 수는 손가락을 누른 채 멈춘 순간의 화면을 저장 (게임이 드래그 중 무엇을 그리는지 분석용)
        val wantHoldShot = prefs.saveScreens && holdShots < HOLD_SHOTS_PER_SESSION
        service.drag(path, handler, onSettle = if (!wantHoldShot) null else ({
            handler.postDelayed({
                if (now() - lastShotAt >= MIN_SHOT_INTERVAL_MS) {
                    lastShotAt = now()
                    holdShots++
                    service.capture(executor) { bmp, _ ->
                        if (bmp != null) {
                            val name = log.screenshot(bmp, "drag_hold_r${step.row}c${step.col}")
                            log.event("drag_hold", json("screen" to name, "to" to "%.0f,%.0f".format(path.toX, path.toY)))
                            bmp.recycle()
                        }
                    }
                }
            }, 60)
        })) { ok ->
            if (!ok) log.event("gesture_failed", json("slot" to step.slot))
            schedule(prefs.moveDelayMs.toLong())
        }
    }

    companion object {
        const val MIN_SHOT_INTERVAL_MS = 360L // 접근성 스크린샷 API 최소 간격(약 333ms)
        const val POLL_MS = 400L
        const val POLL_IDLE_MS = 1000L
        const val PENDING_TIMEOUT_MS = 6000L
        const val GEOMETRY_RESET_FRAMES = 10
        const val STUCK_SECS = 6L
        const val HOLD_SHOTS_PER_SESSION = 3
        private val SPIN = arrayOf("◐", "◓", "◑", "◒")
        private val CIRCLED = arrayOf("①", "②", "③", "④", "⑤")
    }
}
