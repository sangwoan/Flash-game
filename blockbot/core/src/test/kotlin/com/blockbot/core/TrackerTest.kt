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

    /** 가상의 게임에서 자동 드래그 [moves]번: 적중 여부 목록과 최종 모델. */
    private fun dragSession(gain: Double, lift: Double, off: Double, moves: Int, seed: Int): Pair<List<Boolean>, DragModel> {
        val g = BoardGeometry(60.0, 550.0, 120.0, 120.0)
        val rnd = kotlin.random.Random(seed)
        val obs = ArrayList<DragObservation>()
        var model = DragModel.fit(obs)
        val hits = ArrayList<Boolean>()
        val shapes = listOf("XX/XX", "X", "XXX", "X/X/X", "XXX/XXX/XXX", "XXX/XXX").map { Piece.parse(it) }
        repeat(moves) {
            val piece = shapes[rnd.nextInt(shapes.size)]
            val slot = rnd.nextInt(3)
            val cx = 1080 * (2 * slot + 1) / 6
            val tray = TrayRead(slot, piece, cx - 40, 1830, cx + 40, 1900)
            val row = rnd.nextInt(9 - piece.height); val col = rnd.nextInt(9 - piece.width)
            val path = DragPlanner.plan(g, tray, piece, row, col, model, 1080, 2340)
            // 게임: 블록 중심 = 시작 + gain×(손가락 이동), 세로는 (lift + 높이/2)칸 위, 가로 off칸 치우침 → 가장 가까운 칸에 스냅
            val px = path.fromX + gain * (path.toX - path.fromX) + off * g.cell
            val py = path.fromY + gain * (path.toY - path.fromY) - (lift + piece.height / 2.0) * g.cell
            val c = kotlin.math.round((px - g.x0) / g.cellW - piece.width / 2.0).toInt()
            val r = kotlin.math.round((py - g.y0) / g.cellH - piece.height / 2.0).toInt()
            hits += (r to c) == (row to col)
            if (r in 0..8 - piece.height && c in 0..8 - piece.width) { // 보드 밖이면 게임이 거부 → 정보 없음
                obs += DragPlanner.observe(g, path, piece, r, c)
                model = DragModel.fit(obs)
            }
        }
        return hits to model
    }

    @Test
    fun `드래그 모델 - 1대1로 따라오는 게임이면 띄움이 달라도 2~3수 안에 적중`() {
        for ((lift, off) in listOf(0.8 to 0.0, 2.5 to -0.4, 0.0 to 0.3)) {
            val (hits, model) = dragSession(1.0, lift, off, 20, seed = 1)
            println("[드래그 1:1 lift=$lift] ${hits.joinToString("") { if (it) "O" else "x" }}  ${model.describe()}")
            assertTrue(hits.drop(5).all { it }, "6수째부터는 모두 적중해야 함") // 첫 이동만의 정확도 (실제로는 보고 맞추기가 보정)
        }
    }

    @Test
    fun `드래그 모델 - 손가락보다 더 많이 움직이는 게임(125%)도 학습해 따라잡는다`() {
        var tailHits = 0
        for (seed in 0 until 5) {
            val (hits, model) = dragSession(1.25, 2.0, 0.3, 24, seed)
            if (seed == 0) println("[드래그 125%] ${hits.joinToString("") { if (it) "O" else "x" }}  ${model.describe()}")
            tailHits += hits.takeLast(10).count { it }
        }
        println("[드래그 125%] 마지막 10수 적중 $tailHits/50")
        assertTrue(tailHits >= 38)
    }

    @Test
    fun `드래그 모델 - 관측 저장 형식 왕복`() {
        val o = DragObservation(180.0, 1865.0, 300.5, 1200.25, 310.0, 700.0, 119.5, 2)
        val back = DragObservation.fromText(o.toText())!!
        assertEquals(o.fx, back.fx, 0.06); assertEquals(o.pieceH, back.pieceH)
    }
}
