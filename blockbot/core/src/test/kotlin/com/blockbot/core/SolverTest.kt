package com.blockbot.core

import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SolverTest {
    private val solver = Solver()

    /** 계획을 규칙대로 다시 실행해 결과 상태와 클리어 정보가 일치하는지 확인. */
    private fun replay(start: GameState, tray: List<Piece?>, plan: Plan, rules: Rules = solver.rules) {
        var s = start
        val used = HashSet<Int>()
        for (st in plan.steps) {
            assertTrue(used.add(st.slot), "슬롯 중복 사용")
            assertEquals(tray[st.slot], st.piece)
            val mask = st.piece.maskAt(st.row, st.col)
            assertTrue(rules.canPlace(s.board, mask), "겹치는 위치: $st")
            val r = rules.apply(s, mask)
            assertEquals(st.linesCleared, r.lines)
            assertEquals(st.perfectClear, r.perfectClear)
            s = r.state
        }
        assertEquals(plan.finalState, s)
    }

    // ── 사용자 제공 보드 ──
    private val userBoard = Board.parse(
        """
        X....XXX
        XX...X..
        XXXXXX..
        XXXXXX.X
        XXX.XX.X
        XX..X..X
        XX..X...
        ........
        """.trimIndent()
    )
    private val square3 = Piece.parse("XXX/XXX/XXX")

    @Test
    fun `사용자 보드 - 3x3은 처음엔 안 들어가고, 줄을 먼저 지워야 들어간다`() {
        assertFalse(square3.fitsAnywhere(userBoard.bits))
        // 세로 3칸 + 맨 위 오른쪽(Γ)이 2·3행을 동시에 지워 3×3 자리를 만드는 변형
        val tray = listOf(Piece.parse("XX/X./X."), square3, Piece.parse("X./X./XX"))
        val start = GameState(userBoard)
        val res = solver.solve(start, tray)
        val plan = res.best
        println("[사용자 보드 Γ 변형] ${res.elapsedMs}ms, states=${res.statesExplored}, leaves=${res.leavesEvaluated}\n${plan.describe()}")
        assertTrue(plan.survives)
        replay(start, tray, plan)
        val sqIdx = plan.steps.indexOfFirst { it.slot == 1 }
        assertTrue(plan.steps.take(sqIdx).any { it.linesCleared > 0 }, "3×3 전에 줄 클리어가 있어야 함")
    }

    @Test
    fun `사용자 보드 - 설명된 J와 L 모양 그대로는 3개 모두 놓을 수 없다`() {
        val tray = listOf(Piece.parse(".X/.X/XX"), square3, Piece.parse("X./X./XX"))
        val res = solver.solve(GameState(userBoard), tray)
        println("[사용자 보드 J/L 원문] ${res.best.describe()}")
        assertFalse(res.best.survives)
        assertEquals(2, res.best.placedCount)
    }

    @Test
    fun `퍼펙트 클리어가 가능하면 순서까지 맞춰 그 수열을 고른다`() {
        // 0행에 5칸. 1×3을 (0,5)에 "먼저" 놓아야만 보드가 빈다.
        val b = Board.parse("XXXXX...\n" + "........\n".repeat(7))
        val tray = listOf(Piece.parse("XX/XX"), Piece.parse("X"), Piece.parse("XXX"))
        val start = GameState(b)
        val plan = solver.solve(start, tray).best
        println("[퍼펙트]\n${plan.describe()}")
        assertTrue(plan.perfectClear)
        assertEquals(2, plan.steps.first().slot)
        assertEquals(0 to 5, plan.steps.first().row to plan.steps.first().col)
        replay(start, tray, plan)
    }

    @Test
    fun `퍼펙트 클리어는 점수가 더 높은 비퍼펙트 수열보다 우선한다`() {
        // 일부러 "칸이 많이 남을수록 고득점"으로 왜곡하고 퍼펙트 보너스는 0
        val w = Weights(perfectClear = 0.0, filledCell = 100.0)
        val s = Solver(weights = w)
        val b = Board.parse("XXXXX...\n" + "........\n".repeat(7))
        val tray = listOf(Piece.parse("XXX"), Piece.parse("X"), Piece.parse("X"))
        val start = GameState(b)
        val best = s.solve(start, tray).best
        assertTrue(best.perfectClear)

        // 비교 대상: 아무 줄도 안 지우는 수열 (3×1을 3행, 1×1을 5행에)
        var st = start
        var path = 0.0
        for ((p, rc) in listOf(tray[0] to (3 to 0), tray[1] to (5 to 0), tray[2] to (5 to 2))) {
            val r = s.rules.apply(st, p.maskAt(rc.first, rc.second))
            path += MoveScoring.score(w, r); st = r.state
        }
        val nonPerfectScore = path + s.evaluator.score(st)
        println("[퍼펙트 우선] perfect=${"%.1f".format(best.score)} vs 비퍼펙트=${"%.1f".format(nonPerfectScore)}")
        assertTrue(nonPerfectScore > best.score, "비퍼펙트가 점수상 더 높아야 테스트가 의미 있음")
    }

    @Test
    fun `모두 놓을 수 없으면 가장 많이 놓는 순서를 고른다`() {
        // 주대각선만 빈 보드 (꽉 찬 줄 없음). 3×3, 1×5는 처음엔 불가.
        // 1×1을 대각선 칸에 먼저 놓으면 그 행·열이 동시에 지워져 1×5가 들어감 → 최대 2개.
        val b = Board((0 until 8).fold(-1L) { m, i -> m and Bits.bit(i, i).inv() })
        val tray = listOf(square3, Piece.parse("X"), Piece.parse("XXXXX"))
        val start = GameState(b)
        val plan = solver.solve(start, tray).best
        println("[부분 배치]\n${plan.describe()}")
        replay(start, tray, plan)
        assertEquals(2, plan.placedCount)
        assertFalse(plan.survives)
        assertEquals(listOf(1, 2), plan.steps.map { it.slot })
        assertEquals(2, plan.steps[0].linesCleared)
    }

    @Test
    fun `트레이에 빈 슬롯이 있어도 동작하고 슬롯 번호를 유지한다`() {
        val tray = listOf(null, Piece.parse("XX"), null)
        val plan = solver.solve(GameState(Board.EMPTY), tray).best
        assertEquals(1, plan.placedCount)
        assertEquals(1, plan.steps.single().slot)
    }

    @Test
    fun `같은 모양 블록이 여러 개여도 모두 놓는다`() {
        val tray = List(3) { Piece.parse("XXX/XXX/XXX") }
        val start = GameState(Board.EMPTY)
        val plan = solver.solve(start, tray).best
        assertTrue(plan.survives)
        assertEquals(setOf(0, 1, 2), plan.steps.map { it.slot }.toSet())
        replay(start, tray, plan)
    }

    @Test
    fun `이전 라운드 콤보가 이어지면 콤보 점수가 붙는다`() {
        val b = Board.parse("XXXXXXX.\n" + "........\n".repeat(6) + "XXXXXXX.")
        val tray = listOf(Piece.parse("X"), Piece.parse("X"), Piece.parse("X"))
        val withCombo = solver.solve(GameState(b, comboStreak = 3), tray).best
        val noCombo = solver.solve(GameState(b), tray).best
        assertTrue(withCombo.pathScore > noCombo.pathScore)
    }

    @Test
    fun `빈 보드 작은 블록 세 개 - 성능`() {
        val tray = listOf(Piece.parse("X"), Piece.parse("XX"), Piece.parse("X/X"))
        val res = solver.solve(GameState(Board.EMPTY), tray)
        println("[성능 빈 보드] ${res.elapsedMs}ms, states=${res.statesExplored}, leaves=${res.leavesEvaluated}")
        assertTrue(res.elapsedMs < 5000)
    }

    // ── 단순 전수 탐색(중복 제거 없음)과 대조 ──

    private data class OracleBest(val perfect: Boolean, val placed: Int, val score: Double)

    private fun oracle(state: GameState, tray: List<Piece?>, w: Weights, ev: Evaluator, rules: Rules): OracleBest {
        var best: OracleBest? = null
        fun better(a: OracleBest, b: OracleBest?): Boolean {
            if (b == null) return true
            if (a.perfect != b.perfect) return a.perfect
            if (a.placed != b.placed) return a.placed > b.placed
            return a.score > b.score + 1e-9
        }
        fun rec(s: GameState, remaining: Int, placed: Int, perfect: Boolean, path: Double) {
            var any = false
            for (slot in tray.indices) {
                if ((remaining and (1 shl slot)) == 0) continue
                val p = tray[slot]!!
                for (m in p.masks) {
                    if ((s.board.bits and m) != 0L) continue
                    any = true
                    val r = rules.apply(s, m)
                    rec(r.state, remaining and (1 shl slot).inv(), placed + 1, perfect || r.perfectClear, path + MoveScoring.score(w, r))
                }
            }
            if (!any) {
                val cand = OracleBest(perfect, placed, path + ev.score(s))
                if (better(cand, best)) best = cand
            }
        }
        var rem = 0
        tray.forEachIndexed { i, p -> if (p != null) rem = rem or (1 shl i) }
        rec(state, rem, 0, false, 0.0)
        return best!!
    }

    @Test
    fun `무작위 보드 120개 - 단순 전수 탐색과 결과가 같다`() {
        val rnd = Random(20261107)
        val w = Weights()
        val ev = HeuristicEvaluator(w)
        val rules = Rules()
        val s = Solver(rules, w, ev)
        var perfectCases = 0
        var deadCases = 0
        repeat(120) { case ->
            val density = 0.45 + rnd.nextDouble() * 0.35
            var bits = 0L
            for (i in 0 until 64) if (rnd.nextDouble() < density) bits = bits or (1L shl i)
            // 일부 케이스는 거의 찬 줄을 만들어 클리어·퍼펙트 상황을 늘림
            // 1/3: 한 줄을 한 칸만 빼고 채워 클리어 상황을 늘림
            if (case % 3 == 0) {
                val r = rnd.nextInt(8)
                bits = (bits or Bits.ROW[r]) and Bits.bit(r, rnd.nextInt(8)).inv()
            }
            // 1/10: 한 줄에만 몇 칸 → 퍼펙트 클리어 가능 상황
            if (case % 10 == 0) {
                val r = rnd.nextInt(8)
                bits = Bits.ROW[r] and (0x7L shl (r * 8 + rnd.nextInt(6))).inv()
            }
            val tray = MutableList(3) { Pieces.STANDARD[rnd.nextInt(Pieces.STANDARD.size)] }
            if (case % 10 == 0) tray[rnd.nextInt(3)] = Piece.parse("XXX")
            val state = GameState(Board(bits), comboStreak = rnd.nextInt(3))
            val got = s.solve(state, tray).best
            val want = oracle(state, tray, w, ev, rules)
            replay(state, tray, got, rules)
            assertEquals(want.perfect, got.perfectClear, "case $case perfect")
            assertEquals(want.placed, got.placedCount, "case $case placed")
            assertEquals(want.score, got.score, 1e-6, "case $case score")
            if (got.perfectClear) perfectCases++
            if (!got.survives) deadCases++
        }
        println("[오라클 대조] 120건 일치 (퍼펙트 $perfectCases 건, 생존 실패 $deadCases 건)")
    }
}
