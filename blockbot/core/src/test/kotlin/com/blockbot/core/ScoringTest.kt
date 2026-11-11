package com.blockbot.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ScoringTest {
    private val model = ScoreModel(perCell = 1.0, lineBase = 10.0, comboPerLine = 10.0, perfectBonus = 300.0)

    @Test
    fun `점수 모델 - 배치, 다중 줄, 콤보, 퍼펙트`() {
        val rules = Rules()
        // 클리어 없음: 칸 수만
        val r0 = rules.apply(GameState(Board.EMPTY), Piece.parse("XX/XX").maskAt(3, 3))
        assertEquals(4.0, model.points(r0))
        // 1줄, 콤보 없음: 1 + 10×T(1)=10 → 11 (보드에 다른 칸 남김)
        val b1 = Board(Bits.ROW[0] and Bits.bit(0, 7).inv() or Bits.bit(5, 5))
        val r1 = rules.apply(GameState(b1), Bits.bit(0, 7))
        assertEquals(11.0, model.points(r1))
        // 같은 1줄, 직전 콤보 3: + 10×1×3
        val r2 = rules.apply(GameState(b1, comboStreak = 3), Bits.bit(0, 7))
        assertEquals(41.0, model.points(r2))
        assertEquals(4, r2.state.comboStreak)
        // 행+열 2줄 동시: 1 + 10×T(2)=30 → 31 (+ 남은 칸 있음)
        val b3 = Board((Bits.ROW[0] or Bits.COL[0] or Bits.bit(5, 5)) and Bits.bit(0, 0).inv())
        val r3 = rules.apply(GameState(b3), Bits.bit(0, 0))
        assertEquals(2, r3.lines)
        assertEquals(31.0, model.points(r3))
        // 퍼펙트: 1 + 10 + 300
        val b4 = Board(Bits.ROW[2] and Bits.bit(2, 4).inv())
        assertEquals(311.0, model.points(rules.apply(GameState(b4), Bits.bit(2, 4))))
    }

    @Test
    fun `PER_ROUND - 라운드 안에 한 번이라도 지우면 콤보 유지, 아니면 라운드 끝에 끊김`() {
        val rules = Rules(RuleConfig(comboMode = ComboMode.PER_ROUND))
        val b = Board(Bits.ROW[0] and Bits.bit(0, 7).inv())
        var s = GameState(b, comboStreak = 2)
        s = rules.apply(s, Bits.bit(0, 7)).state       // 클리어 → 3
        s = rules.apply(s, Bits.bit(4, 4)).state
        s = rules.apply(s, Bits.bit(5, 5)).state
        s = rules.endRound(s)
        assertEquals(3, s.comboStreak)
        repeat(3) { i -> s = rules.apply(s, Bits.bit(6, i)).state } // 이번 라운드는 못 지움
        assertEquals(3, s.comboStreak)                  // 라운드 중엔 유지
        assertEquals(0, rules.endRound(s).comboStreak)  // 라운드 끝에 끊김
    }

    @Test
    fun `콤보가 걸려 있으면 당장 점수가 같아도 콤보를 이어가는 수를 고른다`() {
        // SLIDING grace 0: 매 배치마다 지워야 콤보 유지
        val rules = Rules(RuleConfig(comboMode = ComboMode.SLIDING, comboGrace = 0))
        // 0행, 7행이 각각 한 칸씩 비어 있음. 1×1 세 개.
        val b = Board((Bits.ROW[0] and Bits.bit(0, 3).inv()) or (Bits.ROW[7] and Bits.bit(7, 5).inv()) or Bits.bit(4, 4))
        val tray = List(3) { Piece.parse("X") }
        val plan = Solver(rules = rules).solve(GameState(b, comboStreak = 5), tray).best
        println("[콤보 유지]\n${plan.describe()}")
        // 클리어 두 번을 연속으로(1·2번째 배치에) 해야 콤보가 7까지 감
        assertEquals(listOf(1, 1, 0), plan.steps.map { it.linesCleared })
        assertTrue(plan.pathScore >= 3 + 10 + 50 + 10 + 60) // 칸3 + (10+10×5) + (10+10×6)
    }

    @Test
    fun `스크린샷에서 확인한 블록 모양이 표준 목록에 있다`() {
        listOf(
            "X/X/X/X", ".X/XX/.X", "XXX/..X/..X",  // 1번
            "XXX", "..X/.X./X..", ".X/XX",         // 2번 (대각선 3칸)
            "XX/XX", "XXX/XXX/XXX",                // 3·4번
            "XXX/X..",                             // 5번
        ).forEach { assertTrue(Pieces.isKnown(Piece.parse(it)), "목록에 없음: $it") }
    }

    @Test
    fun `확인된 규칙 - 콤보는 지운 줄 수만큼 오르고, 라운드에 한 줄 이상 지우면 유지된다`() {
        val rules = Rules() // 기본값 = 확인된 규칙
        // 0행과 0열이 (0,0)만 비어 있음 → 한 번에 2줄
        val b = Board((Bits.ROW[0] or Bits.COL[0] or Bits.bit(5, 5)) and Bits.bit(0, 0).inv())
        var s = rules.apply(GameState(b, comboStreak = 4), Bits.bit(0, 0)).state
        assertEquals(6, s.comboStreak)                      // 2줄 → +2
        s = rules.apply(s, Bits.bit(3, 3)).state
        s = rules.apply(s, Bits.bit(3, 4)).state
        assertEquals(6, rules.endRound(s).comboStreak)      // 이번 라운드에 지웠으므로 유지
        s = rules.endRound(s)
        repeat(3) { i -> s = rules.apply(s, Bits.bit(6, i + 2)).state }
        assertEquals(0, rules.endRound(s).comboStreak)      // 한 줄도 못 지운 라운드 → 끊김
    }
}
