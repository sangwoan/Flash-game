package com.blockbot.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BoardRulesTest {
    private val rules = Rules(RuleConfig(comboMode = ComboMode.SLIDING, comboGrace = 0))

    @Test
    fun `보드 파싱과 출력이 왕복된다`() {
        val text = """
            X....XXX
            XX...X..
            XXXXXX..
            XXXXXX.X
            XXX.XX.X
            XX..X..X
            XX..X...
            ........
        """.trimIndent()
        val b = Board.parse(text)
        assertEquals(text, b.toAscii())
        assertTrue(b[0, 0]); assertFalse(b[0, 1]); assertTrue(b[3, 7]); assertFalse(b[7, 7])
    }

    @Test
    fun `블록 파싱은 좌상단 기준으로 정규화되고 모양으로 비교된다`() {
        val a = Piece.parse("..X/..X/.XX")
        val b = Piece.parse(".X/.X/XX")
        assertEquals(a, b)
        assertEquals(3, a.height); assertEquals(2, a.width); assertEquals(4, a.size)
        assertEquals(".X/.X/XX", a.pattern())
    }

    @Test
    fun `보드 밖 위치는 후보에 없다`() {
        val p = Piece.parse("XXXXX")
        assertEquals(8 * 4, p.masks.size) // 행 8 × 좌상단 열 0..3
        assertTrue(p.cols.all { it <= 3 })
    }

    @Test
    fun `가로 줄 클리어`() {
        val b = Board.parse("XXXXXXX.\n" + "........\n".repeat(7))
        val r = rules.apply(GameState(b), Piece.parse("X").maskAt(0, 7))
        assertEquals(1, r.lines); assertEquals(1, r.clearedRows); assertEquals(0, r.clearedCols)
        assertTrue(r.state.board.isEmpty); assertTrue(r.perfectClear)
    }

    @Test
    fun `가로 세로 동시 클리어 - 교차 칸은 한 번만`() {
        // 0행과 0열이 (0,0) 하나만 비어 있음 + (5,5) 하나 남김
        val rows = Array(8) { CharArray(8) { '.' } }
        for (i in 1 until 8) { rows[0][i] = 'X'; rows[i][0] = 'X' }
        rows[5][5] = 'X'
        val b = Board.parse(rows.joinToString("\n") { String(it) })
        val r = rules.apply(GameState(b), Bits.bit(0, 0))
        assertEquals(2, r.lines)
        assertEquals(Board(Bits.bit(5, 5)), r.state.board)
        assertFalse(r.perfectClear)
    }

    @Test
    fun `콤보 - grace 0이면 못 지우는 순간 끊긴다`() {
        val s = GameState(Board.EMPTY, comboStreak = 3)
        val r = rules.apply(s, Bits.bit(4, 4))
        assertEquals(0, r.state.comboStreak)
    }

    @Test
    fun `콤보 - grace 2이면 두 번까지 버틴다`() {
        val rules2 = Rules(RuleConfig(comboMode = ComboMode.SLIDING, comboGrace = 2))
        var s = GameState(Board.EMPTY, comboStreak = 1)
        s = rules2.apply(s, Bits.bit(4, 4)).state; assertEquals(1, s.comboStreak)
        s = rules2.apply(s, Bits.bit(5, 5)).state; assertEquals(1, s.comboStreak)
        s = rules2.apply(s, Bits.bit(6, 6)).state; assertEquals(0, s.comboStreak)
        assertEquals(0, s.movesSinceClear)
    }

    @Test
    fun `특징값 - 고립 칸, 작은 영역, 울퉁불퉁함`() {
        val b = Board.parse(
            """
            .X..XXXX
            XX..XXXX
            XXXXXXXX
            XXXXXXXX
            XXXXXXXX
            XXXXXXXX
            XXXXXXXX
            XXXXXXX.
            """.trimIndent()
        )
        val sizes = Features.emptyRegionSizes(b.bits).sorted()
        assertEquals(listOf(1, 1, 4), sizes)
        val f = Features.extract(b.bits, Weights())
        assertEquals(2, f.isolatedHoles)
        assertEquals(1, f.smallRegions)
        assertEquals(listOf("3x3", "1x5", "5x1"), f.missingProbes) // 2x2는 들어감
        assertEquals(0, Features.roughness(0L))
        assertEquals(0, Features.roughness(-1L))
        assertEquals(4, Features.roughness(Bits.bit(3, 3))) // 가운데 한 칸: 경계 4개
    }

    @Test
    fun `표준 블록 목록에 중복 모양이 없다`() {
        assertEquals(Pieces.STANDARD.size, Pieces.STANDARD.toSet().size)
        assertEquals(4, Pieces.STANDARD.count { it.name.startsWith("V3") })
        assertEquals(8, Pieces.STANDARD.count { it.name.startsWith("L4") })
        assertEquals(2, Pieces.STANDARD.count { it.name.startsWith("I5") })
    }
}
