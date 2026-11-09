package com.blockbot.core

import java.io.File

/**
 * 실제 게임 로그 분석: 게임별 라운드·콤보·점수, 힌트를 따른 비율, 게임 오버 원인,
 * 수읽기가 예측한 "다음 판 게임오버 확률"이 실제와 맞는지(= 학습한 블록 분포가 현실적인지).
 */
object LogAnalyzer {
    private fun str(line: String, key: String) =
        Regex("\"$key\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").find(line)?.groupValues?.get(1)?.replace("\\/", "/")
    private fun num(line: String, key: String) =
        Regex("\"$key\"\\s*:\\s*(-?[0-9.]+(?:[eE]-?[0-9]+)?)").find(line)?.groupValues?.get(1)?.toDoubleOrNull()
    private fun bool(line: String, key: String) =
        Regex("\"$key\"\\s*:\\s*(true|false)").find(line)?.groupValues?.get(1)?.toBoolean()
    /** JSON 문자열 배열 → 원소들 (원소 안의 쉼표는 보존: "slot0@0,7" 같은 값). */
    private fun arr(line: String, key: String): List<String?>? {
        val raw = Regex("\"$key\"\\s*:\\s*\\[((?:[^\\]\"]|\"(?:[^\"\\\\]|\\\\.)*\")*)\\]").find(line)?.groupValues?.get(1) ?: return null
        return Regex("\"((?:[^\"\\\\]|\\\\.)*)\"|null").findAll(raw).map { m ->
            if (m.value == "null") null else m.groupValues[1].replace("\\/", "/")
        }.toList()
    }

    class Game {
        var rounds = 0
        var maxCombo = 0
        var estScore = 0
        var placements = 0
        var followed = 0
        var gameOver: Pair<Board, List<Piece>>? = null // (보드, 못 놓은 블록)
    }

    data class Report(val games: List<Game>, val predictedDeath: List<Double>, val actualDeath: List<Boolean>, val text: String)

    fun analyze(files: List<File>): Report {
        val games = ArrayList<Game>()
        val predicted = ArrayList<Double>()
        val actual = ArrayList<Boolean>()
        for (f in files.sortedBy { it.name }) {
            var game: Game? = null
            var lastPlanFirst: String? = null       // "slot@r,c"
            var pendingPrediction: Double? = null    // 직전 라운드 시작 계획이 예측한 다음 판 사망률
            var prevPlanTrayFull = false
            fun newGame() { game = Game().also { games += it }; pendingPrediction = null; prevPlanTrayFull = false; lastPlanFirst = null }
            LogFiles.lines(f).forEach { line ->
                val type = str(line, "type") ?: return@forEach
                when (type) {
                    "resync" -> { val msg = str(line, "msg"); if (msg == "새 게임" || msg == "시작" || game == null) newGame() }
                    "plan" -> {
                        val g = game ?: return@forEach
                        val tray = arr(line, "tray") ?: return@forEach
                        val steps = arr(line, "steps") ?: emptyList()
                        lastPlanFirst = steps.firstOrNull()?.substringBefore(" ")
                        val full = tray.all { it != null }
                        val roundStart = full && !prevPlanTrayFull
                        prevPlanTrayFull = full
                        val survives = bool(line, "survives") ?: true
                        if (roundStart) {
                            g.rounds++
                            // 직전 라운드의 예측 vs 이번 라운드가 실제로 게임오버인지
                            pendingPrediction?.let { predicted += it; actual += !survives }
                            pendingPrediction = num(line, "nextDeathRate")
                        }
                        if (!survives) {
                            val board = str(line, "board")?.replace("\\n", "\n")?.let { runCatching { Board.parse(it) }.getOrNull() }
                            val placedSlots = steps.mapNotNull { it?.substringAfter("slot")?.substringBefore("@")?.toIntOrNull() }.toSet()
                            val stuck = tray.indices.filter { tray[it] != null && it !in placedSlots }.mapNotNull { tray[it]?.let { p -> runCatching { Piece.parse(p) }.getOrNull() } }
                            if (board != null) g.gameOver = board to stuck
                        }
                    }
                    "placed" -> {
                        val g = game ?: return@forEach
                        num(line, "combo")?.let { g.maxCombo = maxOf(g.maxCombo, it.toInt()) }
                        num(line, "estScore")?.let { g.estScore = it.toInt() }
                        val moves = arr(line, "moves") ?: emptyList()
                        g.placements += moves.size
                        // "slot1:XX/X.@3,4 lines=1" → "slot1@3,4"
                        val m = moves.firstOrNull()?.let { "slot" + it.substringAfter("slot").substringBefore(":") + "@" + it.substringAfter("@").substringBefore(" ") }
                        if (moves.size == 1 && m != null && m == lastPlanFirst) g.followed++
                    }
                }
            }
        }
        val played = games.filter { it.rounds > 0 }
        val text = buildString {
            appendLine("== 실제 게임 분석 (로그 ${files.size}개) ==")
            if (played.isEmpty()) { appendLine("분석할 게임이 없습니다 (힌트/자동으로 한 판 이상 플레이 필요)"); return@buildString }
            val overs = played.filter { it.gameOver != null }
            appendLine("게임 ${played.size}판 (게임 오버로 끝남 ${overs.size}판)")
            appendLine("라운드: 평균 %.1f, 최대 %d   |   최대 콤보: 평균 %.1f, 최고 %d".format(
                played.map { it.rounds }.average(), played.maxOf { it.rounds }, played.map { it.maxCombo }.average(), played.maxOf { it.maxCombo }))
            appendLine("봇 추정 점수(점수 공식 추정치 기준): 평균 %,d, 최고 %,d".format(played.map { it.estScore }.average().toInt(), played.maxOf { it.estScore }))
            val pl = played.sumOf { it.placements }
            if (pl > 0) appendLine("힌트 1번 수를 그대로 둔 비율: %.0f%% (%d수 중)".format(100.0 * played.sumOf { it.followed } / pl, pl))
            if (overs.isNotEmpty()) {
                val killers = overs.flatMap { it.gameOver!!.second }.groupingBy { it.pattern() }.eachCount().entries.sortedByDescending { it.value }
                appendLine("게임 오버 때 못 놓은 블록: " + killers.take(8).joinToString { "${it.key}×${it.value}" })
                appendLine("게임 오버 때 보드 채움: 평균 %.1f칸 / 64".format(overs.map { it.gameOver!!.first.filledCount }.average()))
            }
            if (predicted.isNotEmpty()) {
                val p = predicted.average(); val q = actual.count { it }.toDouble() / actual.size
                appendLine("수읽기 예측 검증: 예측한 다음 판 게임오버 확률 평균 %.1f%% vs 실제 %.1f%% (%d라운드)".format(100 * p, 100 * q, predicted.size))
                appendLine(when {
                    q < p * 0.5 -> "  → 실제 게임이 예측보다 훨씬 관대함: 학습한 관대함(friendly)을 더 높여도 됨"
                    q > p * 1.5 + 0.005 -> "  → 실제 게임이 예측보다 가혹함: 관대함을 낮추거나 생존 가중치를 높여야 함"
                    else -> "  → 예측과 실제가 대체로 맞음"
                })
            }
        }
        return Report(games, predicted, actual, text)
    }
}

/**
 * 맥에서 도는 한 번의 개선 루프 (mac/improve.sh):
 *  1) 로그 → 블록 분포 학습  2) 실제 게임 분석  3) 학습한 분포로 시뮬레이션 기준선 + 사망 원인
 *  4) 가중치 튜닝(새 판 재검증)  5) 수읽기 켠 검증에서 나을 때만 채택  → report.txt
 * 사용: ./gradlew :core:improve -PimproveArgs="로그폴더 출력폴더 튜닝분"
 */
fun main(args: Array<String>) {
    val logs = File(args.getOrNull(0) ?: "logs-from-phone")
    val out = File(args.getOrNull(1) ?: "model-out").apply { mkdirs() }
    val minutes = args.getOrNull(2)?.toDouble() ?: 20.0
    val report = StringBuilder()
    fun say(s: String) { println(s); report.appendLine(s) }

    val files = LogFiles.find(logs)
    require(files.isNotEmpty()) { "로그 파일(.jsonl)이 없습니다: ${logs.absolutePath}" }

    // 1) 분포 학습
    val rounds = files.flatMap { f -> LogLearner.parseRounds(LogFiles.lines(f).asSequence()) }
    val learned = LogLearner.learn(rounds)
    say("== 1. 블록 출현 패턴 학습 ==\n" + learned.report)
    File(out, "distribution.txt").writeText(learned.distribution.toText())
    val dist = learned.distribution

    // 2) 실제 게임 분석
    say(LogAnalyzer.analyze(files).text)

    // 3) 학습한 분포에서 현재 가중치의 기준선과 사망 원인
    val rules = Rules()
    val current = File(out, "weights.txt").takeIf { it.exists() }?.let { Weights.fromText(it.readText()) } ?: Weights()
    val la = LookaheadConfig(samples = 8, candidates = 12, timeBudgetMs = 600_000)
    fun simulate(w: Weights, seeds: List<Long>): List<Pair<GameStats, Simulator.Death?>> {
        val sim = Simulator(Solver(rules = rules, weights = w, lookahead = la, distribution = dist), ScoreModel(), dist)
        return seeds.parallelStream().map { sim.playWithDeath(kotlin.random.Random(it), 250) }.toList()
    }
    fun summary(name: String, res: List<Pair<GameStats, Simulator.Death?>>) {
        val st = res.map { it.first }
        val deaths = res.mapNotNull { it.second }
        val killers = deaths.flatMap { it.stuck }.groupingBy { it.pattern() }.eachCount().entries.sortedByDescending { it.value }.take(5)
        say("  %-6s 평균 %,d점 · 중앙값 %,d · 생존 %.1f라운드 · 최대콤보 %d · 게임오버 시 보드 %.0f칸 · 못 놓은 블록 %s".format(
            name, st.map { it.score }.average().toInt(), st.map { it.score }.sorted()[st.size / 2].toInt(), st.map { it.rounds }.average(),
            st.maxOf { it.maxStreak }, deaths.map { it.board.filledCount }.average().takeIf { !it.isNaN() } ?: 0.0,
            killers.joinToString { "${it.key}×${it.value}" }))
    }
    say("\n== 3. 학습한 패턴으로 시뮬레이션 (현재 가중치, 24판) ==")
    val base = simulate(current, List(24) { 500_000L + it })
    summary("현재", base)

    // 4) 튜닝
    say("\n== 4. 가중치 튜닝 (최대 %.0f분) ==".format(minutes))
    val tuned = Tuner.tune(current, dist, rules, generations = 60, lambda = 6, games = 24, maxRounds = 150,
        timeLimitMs = (minutes * 60_000).toLong()) { say("  $it") }

    // 5) 검증 (새 판, 수읽기 켬)
    say("\n== 5. 검증 (새 판 40개, 수읽기 켬) ==")
    val seeds = List(40) { 700_000L + it }
    val vBase = simulate(current, seeds); summary("현재", vBase)
    val vTuned = simulate(tuned, seeds); summary("튜닝", vTuned)
    val sBase = vBase.map { it.first.score }.average(); val sTuned = vTuned.map { it.first.score }.average()
    val rBase = vBase.map { it.first.rounds }.average(); val rTuned = vTuned.map { it.first.rounds }.average()
    if (sTuned > sBase && rTuned >= rBase * 0.97) {
        File(out, "weights.txt").writeText(tuned.toText())
        say("→ 채택: 평균 점수 %+.0f%%, 생존 %+.1f라운드. weights.txt 저장".format(100 * (sTuned / sBase - 1), rTuned - rBase))
    } else say("→ 기존 유지 (튜닝 결과가 점수·생존 둘 다 낫지 않음)")
    say("\n변경된 가중치:\n" + tuned.toText().lines().filter { it.isNotBlank() && !it.startsWith("#") }
        .zip(current.toText().lines().filter { it.isNotBlank() && !it.startsWith("#") })
        .filter { (a, b) -> a != b }.joinToString("\n") { (a, b) -> "  $b  →  ${a.substringAfterLast(' ')}" })
    File(out, "report.txt").writeText(report.toString())
    println("\n리포트 저장: ${File(out, "report.txt").absolutePath}")
}
