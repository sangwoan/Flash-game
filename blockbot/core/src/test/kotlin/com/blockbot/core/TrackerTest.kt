package com.blockbot.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class TrackerTest {
    private val geo = BoardGeometry(0.0, 0.0, 100.0, 100.0)
    private fun frame(board: Board, vararg tray: String?, issues: List<String> = emptyList()) = VisionResult(
        geo, board, DoubleArray(64), 0,
        tray.mapIndexed { i, s -> s?.let { TrayRead(i, Piece.parse(it), 0, 0, 10, 10) } },
        issues,
    )

    private fun stable(t: GameTracker, f: VisionResult): TrackEvent { t.observe(f); return t.observe(f) }

    @Test
    fun `두 프레임 연속 같아야 확정하고, 배치를 역추적해 콤보를 센다`() {
        val t = GameTracker(Rules(RuleConfig(comboMode = ComboMode.SLIDING, comboGrace = 2)))
        val b0 = Board(Bits.ROW[7] and Bits.bit(7, 7).inv())
        assertIs<TrackEvent.Unstable>(t.observe(frame(b0, "X", "XX", "X/X")))
        assertIs<TrackEvent.Resync>(t.observe(frame(b0, "X", "XX", "X/X")))

        // 1×1을 (7,7)에 → 7행 클리어
        val e = stable(t, frame(Board.EMPTY, null, "XX", "X/X"))
        assertIs<TrackEvent.Placed>(e)
        assertEquals(0, e.transitions.single().slot)
        assertEquals(7 to 7, e.transitions.single().row to e.transitions.single().col)
        assertEquals(1, t.state!!.comboStreak)
    }

    @Test
    fun `드래그 중(트레이에서만 빠짐)은 확정하지 않는다`() {
        val t = GameTracker(Rules())
        stable(t, frame(Board.EMPTY, "X", "XX", "X/X"))
        assertIs<TrackEvent.Unstable>(stable(t, frame(Board.EMPTY, "X", null, "X/X")))
        assertEquals(listOf<Piece?>(Piece.parse("X"), Piece.parse("XX"), Piece.parse("X/X")), t.tray)
    }

    @Test
    fun `라운드 마지막 배치 + 리필을 한 번에 인식하고 라운드 종료 처리`() {
        val t = GameTracker(Rules(RuleConfig(comboMode = ComboMode.PER_ROUND)))
        stable(t, frame(Board.EMPTY, null, null, "XX"))
        val e = stable(t, frame(Board(Bits.bit(3, 3) or Bits.bit(3, 4)), "X", "X", "X"))
        assertIs<TrackEvent.Placed>(e)
        assertTrue(e.newRound)
        assertEquals(listOf<Piece?>(Piece.parse("X"), Piece.parse("X"), Piece.parse("X")), t.tray)
    }

    @Test
    fun `인식 오류 프레임은 무시하고, 설명 불가가 반복되면 재동기화`() {
        val t = GameTracker(Rules(), resyncAfter = 2)
        stable(t, frame(Board.EMPTY, "X", "XX", "X/X"))
        assertIs<TrackEvent.Unstable>(t.observe(frame(Board.EMPTY, "X", "XX", "X/X", issues = listOf("꽉 찬 행"))))
        val weird = frame(Board(Bits.ROW[0] and Bits.bit(0, 0).inv()), "X", "XX", "X/X") // 놓인 블록 없이 보드만 변함
        assertIs<TrackEvent.Unstable>(stable(t, weird))   // 설명 불가 1회
        assertIs<TrackEvent.Resync>(t.observe(weird))      // 2회째 → 재동기화
        assertEquals(weird.board, t.state!!.board)
    }

    @Test
    fun `드래그 보정 학습 - 한 칸 아래에 떨어지면 lift 추정을 한 칸 줄인다`() {
        val cal = DragCalibration(liftCells = 1.5, offsetXCells = 0.0)
        val learned = DragPlanner.learn(cal, intendedRow = 3, intendedCol = 2, actualRow = 4, actualCol = 1)
        assertEquals(0.5, learned.liftCells)  // 아래로 떨어짐 = 실제 lift가 추정보다 작음
        assertEquals(-1.0, learned.offsetXCells)
        // 보정 후 경로: 목표 중심 + (lift + h/2)칸 아래가 손가락 위치
        val p = Piece.parse("XX")
        val path = DragPlanner.plan(geo, TrayRead(0, p, 0, 900, 50, 950), p, 3, 2, learned, 1000, 2000)
        assertEquals(300f + 100f, path.toX)                 // 목표 중심 x=300, offset -1칸 보정 → +100
        assertEquals(350f + (0.5f + 0.5f) * 100f, path.toY) // 목표 중심 y=350
    }
}
