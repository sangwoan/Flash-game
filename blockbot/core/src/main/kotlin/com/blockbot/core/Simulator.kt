package com.blockbot.core

import kotlin.random.Random

data class GameStats(
    val score: Double,
    val rounds: Int,
    val lines: Int,
    val maxStreak: Int,
    val perfects: Int,
    val died: Boolean,
)

/**
 * 오프라인 자가 대국. 매 라운드 블록 3개를 [distribution]에서 무작위로 뽑는다.
 * 실제 게임의 블록 출현 분포는 모르므로(균등 가정) 절대 점수보다 정책 간 "비교"에 쓴다.
 * 점수는 항상 [scoreModel](실제 점수 모델)로 매긴다 — 정책이 내부적으로 무엇을 최적화하든.
 */
class Simulator(
    val solver: Solver,
    val scoreModel: ScoreModel = ScoreModel(),
    val distribution: PieceDistribution = PieceDistribution.DEFAULT,
) {
    /** 게임 오버 순간: 보드와 못 놓은 블록. */
    data class Death(val board: Board, val stuck: List<Piece>)

    fun play(rng: Random, maxRounds: Int): GameStats = playWithDeath(rng, maxRounds).first

    fun playWithDeath(rng: Random, maxRounds: Int): Pair<GameStats, Death?> {
        val rules = solver.rules
        var state = GameState(Board.EMPTY)
        var score = 0.0
        var lines = 0
        var maxStreak = 0
        var perfects = 0
        for (round in 1..maxRounds) {
            val tray = distribution.sampleTray(rng, state.board)
            val plan = solver.solve(state, tray).best
            for (st in plan.steps) {
                val r = rules.apply(state, st.piece.maskAt(st.row, st.col))
                score += scoreModel.points(r)
                lines += r.lines
                if (r.perfectClear) perfects++
                state = r.state
                maxStreak = maxOf(maxStreak, state.comboStreak)
            }
            if (!plan.survives) {
                val placed = plan.steps.map { it.slot }.toSet()
                val stuck = tray.indices.filter { it !in placed }.map { tray[it] }
                return GameStats(score, round, lines, maxStreak, perfects, died = true) to Death(state.board, stuck)
            }
            state = rules.endRound(state)
        }
        return GameStats(score, maxRounds, lines, maxStreak, perfects, died = false) to null
    }
}

/** 이전(v1) 정책: 게임 점수 대신 임의 가중치로 클리어를 평가하고 콤보 이어가기를 고려하지 않음. */
object LegacyPolicy {
    val pathScorer = PathScorer { r ->
        var s = 0.0
        if (r.lines > 0) {
            s += 10.0 * r.lines + 12.0 * (r.lines - 1)
            if (r.state.comboStreak >= 2) s += 8.0 * (r.state.comboStreak - 1)
        }
        if (r.perfectClear) s += 500.0
        s
    }
    val weights = Weights(comboAlive = 0.0, comboRisk = 0.0, nearLine = 0.0, healthPerStreak = 0.0)

    fun solver(rules: Rules) = Solver(rules = rules, weights = weights, pathScorer = pathScorer)
}

/**
 * 사용: ./gradlew :core:simulate -PsimArgs="게임수 최대라운드 시드 콤보모드"
 * 예:   ./gradlew :core:simulate -PsimArgs="30 150 1 SLIDING"
 *       ./gradlew :core:simulate -PsimArgs="30 300 7 PER_ROUND sweep 0.05,0.2"   (healthPerStreak 튜닝)
 *       ./gradlew :core:simulate -PsimArgs="60 300 5 SLIDING lookahead 16/10/500,32/20/1000"   (수읽기 설정 비교)
 */
fun main(args: Array<String>) {
    val games = args.getOrNull(0)?.toInt() ?: 20
    val maxRounds = args.getOrNull(1)?.toInt() ?: 150
    val seed = args.getOrNull(2)?.toLong() ?: 1L
    val mode = args.getOrNull(3)?.let { ComboMode.valueOf(it) } ?: ComboMode.PER_ROUND
    val rules = Rules(RuleConfig(comboMode = mode))
    val model = ScoreModel()

    val dist0 = PieceDistribution.DEFAULT
    var expDistribution: PieceDistribution? = null
    val policies: Map<String, Solver> = if (args.getOrNull(4) == "sweep") {
        // healthPerStreak 튜닝용
        val hs = args.getOrNull(5)?.split(",")?.map { it.toDouble() } ?: listOf(0.0, 0.05, 0.1, 0.2, 0.4, 0.8)
        linkedMapOf<String, Solver>("v1 (이전)" to LegacyPolicy.solver(rules)) +
            hs.associate { h -> "v2 h=$h" to Solver(rules = rules, weights = Weights(healthPerStreak = h)) }
    } else if (args.getOrNull(4) == "exp") {
        // 실험: exp <friendly> 이름:키=값;키=값 ...  (키: weights, samples, candidates, death, deathCombo, beam, health)
        expDistribution = dist0.withFriendly(args[5].toDouble())
        args.drop(6).associate { spec ->
            val name = spec.substringBefore(":")
            val kv = spec.substringAfter(":", "").split(";").filter { it.contains("=") }.associate { it.substringBefore("=") to it.substringAfter("=") }
            var w = kv["weights"]?.let { Weights.fromText(java.io.File(it).readText()) } ?: Weights()
            kv["health"]?.let { w = w.copy(healthPerStreak = it.toDouble()) }
            kv["comboAlive"]?.let { w = w.copy(comboAlive = it.toDouble()) }
            kv["comboRisk"]?.let { w = w.copy(comboRisk = it.toDouble()) }
            kv["p3"]?.let { v -> w = w.copy(probes = w.probes.map { if (it.label == "3x3") it.copy(missPenalty = v.toDouble()) else it }) }
            kv["pair"]?.let { w = w.copy(pair3x3 = it.toDouble()) }
            val la = if (kv["lookahead"] == "off") null else LookaheadConfig(
                samples = kv["samples"]?.toInt() ?: 24, candidates = kv["candidates"]?.toInt() ?: 20,
                deathPenalty = kv["death"]?.toDouble() ?: 500.0, deathPenaltyPerCombo = kv["deathCombo"]?.toDouble() ?: 60.0,
                beamWidth = kv["beam"]?.toInt() ?: 60, timeBudgetMs = 600_000,
                survivalMargin = kv["margin"]?.toDouble(),
            )
            // 계획 단계의 점수 평가만 바꾸는 전략들 (실제 점수는 항상 ScoreModel로 매김):
            //  pathScale = 이번 라운드 점수의 비중, extraClear = 이미 콤보를 지킨 뒤 같은 라운드의 추가 클리어 비중,
            //  multiBonus = 한 번에 여러 줄을 지우는 클리어에 곱하는 가산
            val pathScale = kv["pathScale"]?.toDouble() ?: 1.0
            val extraClear = kv["extraClear"]?.toDouble() ?: 1.0
            val multiBonus = kv["multiBonus"]?.toDouble() ?: 1.0
            val scorer = PathScorer { r ->
                var v = model.points(r)
                if (r.lines > 0 && r.clearedBefore) v *= extraClear
                if (r.lines >= 2) v *= multiBonus
                v * pathScale
            }
            name to Solver(rules = rules, weights = w, pathScorer = scorer, lookahead = la, distribution = expDistribution!!)
        }
    } else if (args.getOrNull(4) == "weights") {
        // 가중치 파일 비교 (수읽기 켬): 기본 vs 파일들
        val la = LookaheadConfig(samples = 12, timeBudgetMs = 600_000)
        linkedMapOf<String, Solver>("기본 가중치" to Solver(rules = rules, lookahead = la)) +
            args.drop(5).associate { f ->
                java.io.File(f).name to Solver(rules = rules, weights = Weights.fromText(java.io.File(f).readText()), lookahead = la)
            }
    } else if (args.getOrNull(4) == "lookahead") {
        // 수읽기 설정 비교: 샘플 수 목록 (예: "8,16")
        // 형식: 샘플수/후보수/게임오버감점 (예: "16/10/500,32/20/1000")
        val specs = args.getOrNull(5)?.split(",") ?: listOf("8/10/500", "16/10/500")
        linkedMapOf<String, Solver>("v2 수읽기 없음" to Solver(rules = rules)) +
            specs.associate { spec ->
                val (n, c, d) = (spec.split("/") + listOf("10", "500")).let { Triple(it[0].toInt(), it[1].toInt(), it[2].toDouble()) }
                "v3 $spec" to Solver(rules = rules, lookahead = LookaheadConfig(samples = n, candidates = c, deathPenalty = d, timeBudgetMs = 600_000))
            }
    } else linkedMapOf(
        "v2 수읽기 없음" to Solver(rules = rules),
        "v3 수읽기 (기본)" to Solver(rules = rules, lookahead = LookaheadConfig(timeBudgetMs = 600_000)),
    )
    println("게임 $games 판 × 최대 $maxRounds 라운드, seed=$seed, 콤보=$mode, 블록 분포 friendly=${(expDistribution ?: dist0).friendly}, 같은 블록 순서로 비교")
    println("%-14s %9s %9s %8s %7s %7s %6s %6s".format("정책", "평균점수", "중앙값", "평균R", "사망%", "줄/R", "최대콤보", "퍼펙트"))
    for ((name, solver) in policies) {
        val sim = Simulator(solver, model, expDistribution ?: dist0)
        val t0 = System.currentTimeMillis()
        // 판끼리는 독립이라 병렬 실행
        val stats = (0 until games).toList().parallelStream().map { g -> sim.play(Random(seed * 1000 + g), maxRounds) }.toList()
        val scores = stats.map { it.score }.sorted()
        val avgMs = (System.currentTimeMillis() - t0).toDouble() / stats.sumOf { it.rounds } * Runtime.getRuntime().availableProcessors()
        println(
            "%-14s %9.0f %9.0f %8.1f %6.0f%% %7.2f %6d %6d   (%.1fs, 라운드당 약 %.0fms)".format(
                name,
                scores.average(),
                scores[scores.size / 2],
                stats.map { it.rounds }.average(),
                100.0 * stats.count { it.died } / games,
                stats.sumOf { it.lines }.toDouble() / stats.sumOf { it.rounds },
                stats.maxOf { it.maxStreak },
                stats.sumOf { it.perfects },
                (System.currentTimeMillis() - t0) / 1000.0,
                avgMs,
            )
        )
    }
}
