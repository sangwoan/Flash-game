package com.blockbot.core

import kotlin.math.abs
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class LookaheadTest {
    private val dist = PieceDistribution.ASSUMED // 초기 가정 분포 (그룹 비율이 정해져 있어 검증 가능)

    @Test
    fun `블록 분포 - 3×3 안 모든 연결 모양 + 1×4·1×5, 비율이 설정대로 나온다`() {
        println("[분포] 모양 ${dist.pieces.size}종, friendly=${dist.friendly}")
        assertTrue(dist.pieces.all { Pieces.isPlausible(it) })
        // 3×3 안의 8방향 연결 모양은 전부 포함 (대각선 블록 포함)
        val all = dist.pieces.toSet()
        Pieces.ALL_WITHIN_3X3.filter { Pieces.isConnected8(it) }.forEach { assertTrue(it in all, "누락: ${it.pattern()}") }
        assertTrue(Piece.parse("..X/.X./X..") in all)
        assertTrue(Piece.parse("X/X/X/X/X") in all && Piece.parse("XXXX") in all)

        val rng = Random(1)
        val n = 40_000
        val counts = HashMap<Piece, Int>()
        repeat(n) { val p = dist.sample(rng); counts[p] = (counts[p] ?: 0) + 1 }
        val o3 = (counts[Piece.parse("XXX/XXX/XXX")] ?: 0).toDouble() / n
        val lines5 = ((counts[Piece.parse("XXXXX")] ?: 0) + (counts[Piece.parse("X/X/X/X/X")] ?: 0)).toDouble() / n
        println("[분포] 3×3 꽉 찬 블록 %.3f, 1×5 %.3f".format(o3, lines5))
        assertTrue(abs(o3 - 0.12) < 0.01)
        assertTrue(abs(lines5 - 0.04) < 0.006)
    }

    @Test
    fun `인식 - 표준 목록에 없는 3×3 이내 모양도 정상 블록으로 받아들인다`() {
        assertTrue(Pieces.isPlausible(Piece.parse("X.X/.X./X.X")))
        assertTrue(Pieces.isPlausible(Piece.parse("XXXXX")))
        assertTrue(!Pieces.isPlausible(Piece.parse("XX/XX/XX/XX")))
    }

    @Test
    fun `수읽기 - 빈 보드는 다음 판이 안전하고 거의 찬 보드는 위험하다`() {
        val solver = Solver(lookahead = LookaheadConfig(samples = 24))
        val empty = GameState(Board.EMPTY)
        val diagonalOnly = GameState(Board((0 until 8).fold(-1L) { m, i -> m and Bits.bit(i, i).inv() }))
        val (a, b) = solver.outlook(listOf(empty, diagonalOnly), startNanos = System.nanoTime())
        println("[수읽기] 빈 보드 $a / 대각선만 빈 보드 $b")
        assertTrue(a.deathRate < 0.02) // 표본에 게임오버가 없어도 사전 확률만큼은 남김
        assertTrue(b.deathRate > 0.5)
        assertTrue(a.value > b.value)
    }

    @Test
    fun `수읽기 결과가 계획에 붙고, 같은 입력이면 같은 답 (재현 가능)`() {
        val rng = Random(42)
        val solver = Solver(lookahead = LookaheadConfig(samples = 8, timeBudgetMs = 600_000))
        var bits = 0L
        for (i in 0 until 64) if (rng.nextDouble() < 0.35) bits = bits or (1L shl i)
        for (r in 0 until 8) if ((bits and Bits.ROW[r]) == Bits.ROW[r]) bits = bits and Bits.bit(r, r).inv()
        for (c in 0 until 8) if ((bits and Bits.COL[c]) == Bits.COL[c]) bits = bits and Bits.bit(0, c).inv()
        val st = GameState(Board(bits), comboStreak = 2)
        val tray = listOf(Piece.parse("XX/X."), Piece.parse("XXX"), Piece.parse("X/X"))
        val r1 = solver.solve(st, tray)
        val r2 = solver.solve(st, tray)
        println("[수읽기 계획] ${r1.elapsedMs}ms\n${r1.best.describe()}")
        val o = assertNotNull(r1.best.outlook)
        assertTrue(r1.best.survives)
        assertTrue(o.deathRate in 0.0..1.0 && o.samples == 8)
        assertEquals(r1.best.steps, r2.best.steps)
        assertEquals(r1.best.pathScore + o.value, r1.best.score, 1e-9)
    }

    @Test
    fun `다음 라운드 근사 탐색(빔)의 생존 판정이 정확 탐색과 거의 일치한다`() {
        val rng = Random(7)
        val exact = Solver()
        val beam = Solver(lookahead = LookaheadConfig())
        var mismatch = 0
        var deaths = 0
        val n = 300
        repeat(n) {
            var bits = 0L
            val density = 0.35 + rng.nextDouble() * 0.35
            for (i in 0 until 64) if (rng.nextDouble() < density) bits = bits or (1L shl i)
            for (r in 0 until 8) if ((bits and Bits.ROW[r]) == Bits.ROW[r]) bits = bits and Bits.bit(r, rng.nextInt(8)).inv()
            for (c in 0 until 8) if ((bits and Bits.COL[c]) == Bits.COL[c]) bits = bits and Bits.bit(rng.nextInt(8), c).inv()
            val st = GameState(Board(bits))
            val tray = dist.sampleTray(rng)
            val e = exact.solve(st, tray).best.survives
            val b = beam.bestRoundValue(st, tray) != null
            if (!e) deaths++
            if (e != b) mismatch++
        }
        println("[빔 vs 정확] $n 건 중 불일치 $mismatch 건 (정확 탐색 기준 게임오버 $deaths 건)")
        assertTrue(mismatch <= n * 0.03)
    }

    @Test
    fun `기본 분포는 실제 로그 기반 - 세로 4칸, 3×3, 2×2 순으로 흔하다`() {
        val d = PieceDistribution.DEFAULT
        val top = d.pieces.indices.sortedByDescending { d.probabilities[it] }.take(3).map { d.pieces[it].pattern() }
        assertEquals(listOf("X/X/X/X", "XXX/XXX/XXX", "XX/XX"), top)
        assertTrue(d.pieces.all { Pieces.isPlausible(it) })
        assertTrue(Piece.parse("X.X/.X./X.X") in d.pieces) // 로그에 없던 모양도 낮은 확률로 포함
    }

    @Test
    fun `수읽기 - 표본이 적을 때 한 번의 게임오버로 후보 가치가 무너지지 않는다`() {
        val cfg = LookaheadConfig()
        // 4표본 중 1번 게임오버: 사전값으로 당기면 25%가 아니라 약 9%로 추정
        val p = (1 + cfg.deathPriorWeight * cfg.deathPrior) / (4 + cfg.deathPriorWeight)
        assertTrue(p < 0.1)
    }
}
