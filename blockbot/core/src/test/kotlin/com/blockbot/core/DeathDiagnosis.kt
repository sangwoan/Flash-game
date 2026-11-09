package com.blockbot.core

import kotlin.random.Random

/** 진단용(테스트 아님): ./gradlew :core:test --tests '*DeathDiagnosis*' -Ddiag=1 */
class DeathDiagnosis {
    @org.junit.jupiter.api.Test
    fun diagnose() {
        if (System.getProperty("diag") == null && System.getenv("DIAG") == null) return
        val dist = PieceDistribution.DEFAULT.withFriendly(System.getenv("DIAG_F")?.toDouble() ?: 0.6)
        val rules = Rules()
        val w = System.getenv("DIAG_W")?.let { Weights.fromText(java.io.File(it).readText()) } ?: Weights()
        val solver = Solver(rules = rules, weights = w, lookahead = LookaheadConfig(samples = 12, timeBudgetMs = 600_000), distribution = dist)
        val killers = HashMap<String, Int>()
        val fills = ArrayList<Int>()
        var individuallyFit = 0
        var deaths = 0
        val roundsList = ArrayList<Int>()
        val streakAtDeath = ArrayList<Int>()
        (0 until 40).toList().parallelStream().map { g ->
            val rng = Random(9000L + g)
            var st = GameState(Board.EMPTY)
            var rounds = 0
            var result: Triple<GameState, List<Piece>, Plan>? = null
            while (rounds < 500) {
                val tray = dist.sampleTray(rng, st.board)
                val plan = solver.solve(st, tray).best
                if (!plan.survives) { result = Triple(st, tray, plan); break }
                for (s in plan.steps) st = rules.apply(st, s.piece.maskAt(s.row, s.col)).state
                st = rules.endRound(st)
                rounds++
            }
            rounds to result
        }.toList().forEach { (rounds, r) ->
            roundsList += rounds
            if (r != null) {
                deaths++
                val (st, tray, plan) = r
                fills += st.board.filledCount
                streakAtDeath += st.comboStreak
                if (tray.all { it.fitsAnywhere(st.board.bits) }) individuallyFit++
                // 못 놓은 블록
                val placed = plan.steps.map { it.slot }.toSet()
                tray.indices.filter { it !in placed }.forEach { killers[tray[it].pattern()] = (killers[tray[it].pattern()] ?: 0) + 1 }
            }
        }
        println("[사망 분석] 판 40, 평균 ${roundsList.average()}라운드, 사망 $deaths")
        println("  사망 시 보드 채움 칸: 평균 %.1f, 분포 %s".format(fills.average(), fills.sorted()))
        println("  사망 시 콤보: ${streakAtDeath.sorted()}")
        println("  사망 트레이 중 '세 블록 각각은 들어갈 자리가 있었음': $individuallyFit/$deaths")
        println("  못 놓은 블록 상위: ${killers.entries.sortedByDescending { it.value }.take(10).map { "${it.key}×${it.value}" }}")
    }
}
