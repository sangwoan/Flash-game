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
    fun play(rng: Random, maxRounds: Int): GameStats {
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
            if (!plan.survives) return GameStats(score, round, lines, maxStreak, perfects, died = true)
            state = rules.endRound(state)
        }
        return GameStats(score, maxRounds, lines, maxStreak, perfects, died = false)
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
    val mode = args.getOrNull(3)?.let { ComboMode.valueOf(it) } ?: ComboMode.SLIDING
    val rules = Rules(RuleConfig(comboMode = mode))
    val model = ScoreModel()

    val policies: Map<String, Solver> = if (args.getOrNull(4) == "sweep") {
        // healthPerStreak 튜닝용
        val hs = args.getOrNull(5)?.split(",")?.map { it.toDouble() } ?: listOf(0.0, 0.05, 0.1, 0.2, 0.4, 0.8)
        linkedMapOf<String, Solver>("v1 (이전)" to LegacyPolicy.solver(rules)) +
            hs.associate { h -> "v2 h=$h" to Solver(rules = rules, weights = Weights(healthPerStreak = h)) }
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
    println("게임 $games 판 × 최대 $maxRounds 라운드, seed=$seed, 콤보=$mode, 블록 분포=사용자 관찰 기반, 같은 블록 순서로 비교")
    println("%-14s %9s %9s %8s %7s %7s %6s %6s".format("정책", "평균점수", "중앙값", "평균R", "사망%", "줄/R", "최대콤보", "퍼펙트"))
    for ((name, solver) in policies) {
        val sim = Simulator(solver, model)
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
