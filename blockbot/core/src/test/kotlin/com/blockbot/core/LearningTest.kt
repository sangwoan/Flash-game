package com.blockbot.core

import kotlin.math.abs
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class LearningTest {
    /** 정답 분포로 가상의 게임을 돌려 앱과 같은 형식의 로그를 만든다. */
    private fun fakeLog(truth: PieceDistribution, rounds: Int, oldFormat: Boolean, seed: Long): List<String> {
        val rnd = Random(seed)
        val solver = Solver()
        var state = GameState(Board.EMPTY)
        val lines = ArrayList<String>()
        var made = 0
        while (made < rounds) {
            val tray = truth.sampleTray(rnd, state.board)
            val pats = tray.joinToString(",") { "\"" + it.pattern().replace("/", "\\/") + "\"" }
            lines += if (oldFormat)
                "{\"t\":1,\"type\":\"plan\",\"board\":\"${state.board.toAscii().replace("\n", "\\n")}\",\"tray\":[$pats],\"combo\":0}"
            else
                "{\"t\":1,\"type\":\"round\",\"bits\":\"${java.lang.Long.toHexString(state.board.bits)}\",\"tray\":[$pats],\"combo\":0}"
            made++
            val plan = solver.solve(state, tray).best
            if (!plan.survives) { state = GameState(Board.EMPTY); continue }
            for (st in plan.steps) state = Rules().apply(state, st.piece.maskAt(st.row, st.col)).state
            // 이전 버전 로그는 라운드 중간에도 plan을 남긴다 (트레이 일부가 빈 상태)
            if (oldFormat) lines += "{\"t\":1,\"type\":\"plan\",\"board\":\"${state.board.toAscii().replace("\n", "\\n")}\",\"tray\":[null,null,\"X\"]}"
        }
        return lines
    }

    @Test
    fun `로그 학습 - 실제 분포(3×3 30%, 관대함 90%)를 새 형식·이전 형식 로그 모두에서 복원한다`() {
        val o3 = Piece.parse("XXX/XXX/XXX")
        val base = PieceDistribution.of(friendly = 0.0)
        val truth = PieceDistribution(base.pieces.map { it to if (it == o3) 0.30 else base.probabilityOf(it) * 0.70 / (1 - base.probabilityOf(o3)) }, friendly = 0.9)
        for (old in listOf(false, true)) {
            val rounds = LogLearner.parseRounds(fakeLog(truth, 400, old, seed = 11).asSequence())
            assertEquals(400, rounds.size, "라운드 복원 (old=$old)")
            val res = LogLearner.learn(rounds)
            println("[로그 학습 old=$old]\n" + res.report.prependIndent("    "))
            assertTrue(abs(res.distribution.probabilityOf(o3) - 0.30) < 0.04, "3×3 확률 ${res.distribution.probabilityOf(o3)}")
            assertTrue(abs(res.distribution.friendly - 0.9) < 0.15, "관대함 ${res.distribution.friendly}")
        }
    }

    @Test
    fun `분포·가중치 파일 저장과 로드가 왕복된다`() {
        val d = PieceDistribution.DEFAULT.withFriendly(0.77)
        val d2 = PieceDistribution.fromText(d.toText())
        assertEquals(0.77, d2.friendly, 1e-4)
        for (p in d.pieces.take(20)) assertEquals(d.probabilityOf(p), d2.probabilityOf(p), 1e-5)
        val w = Weights(isolatedHole = -12.5, comboAlive = 9.0, probes = Weights.DEFAULT_PROBES.map { it.copy(missPenalty = it.missPenalty * 2) })
        assertEquals(w, Weights.fromText(w.toText()))
    }
}
