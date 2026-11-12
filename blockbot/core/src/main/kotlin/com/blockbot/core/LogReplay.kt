package com.blockbot.core

import java.io.File

/**
 * 정책 설정 문자열 → 솔버. 형식: 이름:키=값;키=값 (시뮬레이션 "exp"와 같은 키)
 *  weights, health, comboAlive, comboRisk, p3, pair, lookahead=off, samples, candidates, death, deathCombo,
 *  beam, iw(이번 라운드 점수 비중), budget, prior, narrowAfter, narrowTo, margin, pathScale, extraClear, multiBonus
 */
object PolicySpec {
    fun parse(spec: String, rules: Rules, dist: PieceDistribution, model: ScoreModel = ScoreModel()): Pair<String, Solver> {
        val name = spec.substringBefore(":")
        val kv = spec.substringAfter(":", "").split(";").filter { it.contains("=") }.associate { it.substringBefore("=") to it.substringAfter("=") }
        var w = kv["weights"]?.let { Weights.fromText(File(it).readText()) } ?: Weights()
        kv["health"]?.let { w = w.copy(healthPerStreak = it.toDouble()) }
        kv["comboAlive"]?.let { w = w.copy(comboAlive = it.toDouble()) }
        kv["comboRisk"]?.let { w = w.copy(comboRisk = it.toDouble()) }
        kv["p3"]?.let { v -> w = w.copy(probes = w.probes.map { if (it.label == "3x3") it.copy(missPenalty = v.toDouble()) else it }) }
        kv["pair"]?.let { w = w.copy(pair3x3 = it.toDouble()) }
        kv["hole"]?.let { w = w.copy(isolatedHole = it.toDouble()) }
        kv["rough"]?.let { w = w.copy(roughness = it.toDouble()) }
        kv["filled"]?.let { w = w.copy(filledCell = it.toDouble()) }
        val la = if (kv["lookahead"] == "off") null else LookaheadConfig(
            samples = kv["samples"]?.toInt() ?: 24, candidates = kv["candidates"]?.toInt() ?: 20,
            deathPenalty = kv["death"]?.toDouble() ?: 500.0, deathPenaltyPerCombo = kv["deathCombo"]?.toDouble() ?: 60.0,
            beamWidth = kv["beam"]?.toInt() ?: 25, immediateWeight = kv["iw"]?.toDouble() ?: 0.7,
            timeBudgetMs = kv["budget"]?.toLong() ?: 600_000, parallel = false,
            deathPriorWeight = kv["prior"]?.toDouble() ?: 8.0, narrowAfter = kv["narrowAfter"]?.toInt() ?: 6,
            narrowTo = kv["narrowTo"]?.toInt() ?: 8, survivalMargin = kv["margin"]?.toDouble(),
        )
        val pathScale = kv["pathScale"]?.toDouble() ?: 1.0
        val extraClear = kv["extraClear"]?.toDouble() ?: 1.0
        val multiBonus = kv["multiBonus"]?.toDouble() ?: 1.0
        val scorer = PathScorer { r ->
            var v = model.points(r)
            if (r.lines > 0 && r.clearedBefore) v *= extraClear
            if (r.lines >= 2) v *= multiBonus
            v * pathScale
        }
        return name to Solver(rules = rules, weights = w, pathScorer = scorer, lookahead = la, distribution = dist)
    }
}

/**
 * 로그 재생: 실제 게임에서 나온 트레이 순서 그대로 각 정책에 두게 해서 비교한다.
 * 블록 분포를 가정하는 시뮬레이션과 달리 "실제로 받은 블록"으로 겨루므로 실전에 가깝다.
 * 죽으면 빈 보드로 새 게임을 시작해 다음 트레이부터 이어 간다.
 * 순서를 여러 지점에서 시작해(원형으로 돌림) 운의 영향을 줄인다.
 */
object LogReplay {
    data class Run(val score: Double, val games: Int, val rounds: Int, val maxCombo: Int, val gameScores: List<Double>, val gameRounds: List<Int>)

    fun play(solver: Solver, trays: List<List<Piece>>, start: Int, model: ScoreModel = ScoreModel()): Run {
        val rules = solver.rules
        var st = GameState(Board.EMPTY)
        var total = 0.0; var gameScore = 0.0; var gameRounds = 0; var maxCombo = 0
        val scores = ArrayList<Double>(); val roundsList = ArrayList<Int>()
        for (k in trays.indices) {
            val tray = trays[(start + k) % trays.size]
            val plan = solver.solve(st, tray).best
            for (s in plan.steps) {
                val r = rules.apply(st, s.piece.maskAt(s.row, s.col))
                val p = model.points(r); total += p; gameScore += p
                st = r.state; maxCombo = maxOf(maxCombo, st.comboStreak)
            }
            gameRounds++
            if (!plan.survives) {
                scores += gameScore; roundsList += gameRounds
                gameScore = 0.0; gameRounds = 0; st = GameState(Board.EMPTY)
            } else st = rules.endRound(st)
        }
        if (gameRounds > 0) { scores += gameScore; roundsList += gameRounds }
        return Run(total, scores.size, trays.size, maxCombo, scores, roundsList)
    }
}

/** 사용: ./gradlew :core:replay -PreplayArgs="로그폴더 시작점개수 정책1 정책2 ..." */
fun main(args: Array<String>) {
    val logs = File(args[0])
    val starts = args.getOrNull(1)?.toInt() ?: 4
    val specs = args.drop(2).ifEmpty { listOf("base:") }
    val rounds = LogFiles.find(logs).flatMap { LogLearner.parseRounds(LogFiles.lines(it).asSequence()) }
    val trays = rounds.map { it.tray }.filter { it.size == 3 }
    println("로그 재생: 실제 트레이 ${trays.size}개 × 시작점 ${starts}곳 (같은 순서로 모든 정책 비교)")
    val rules = Rules()
    val dist = PieceDistribution.DEFAULT
    println("%-14s %10s %10s %8s %8s %8s".format("정책", "총점", "판당평균", "게임수", "판당R", "최대콤보"))
    for (spec in specs) {
        val (name, solver) = PolicySpec.parse(spec, rules, dist)
        val t0 = System.currentTimeMillis()
        val runs = (0 until starts).toList().parallelStream().map { LogReplay.play(solver, trays, it * trays.size / starts) }.toList()
        val total = runs.sumOf { it.score }
        val games = runs.sumOf { it.games }
        println("%-14s %10.0f %10.0f %8d %8.1f %8d   (%.0fs)".format(
            name, total / starts, total / games, games, runs.sumOf { it.rounds }.toDouble() / games,
            runs.maxOf { it.maxCombo }, (System.currentTimeMillis() - t0) / 1000.0))
    }
}
