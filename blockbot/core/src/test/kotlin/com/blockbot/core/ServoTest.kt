package com.blockbot.core

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** 가상의 게임(이동 배율·띄움을 봇이 모름)에서 "보고 맞추기"가 첫 수부터 정확히 놓는지 검증. */
class ServoTest {
    private val geo = BoardGeometry(60.0, 550.0, 120.0, 120.0)
    private val emptyColor = doubleArrayOf(30.0, 30.0, 70.0)
    private val filledColor = doubleArrayOf(240.0, 200.0, 40.0)
    private val dragColor = doubleArrayOf(60.0, 220.0, 90.0)

    private class Game(val gain: Double, val lift: Double, val off: Double, val ghost: Boolean)

    /** 손가락 위치 → 떠 있는 블록의 좌상단 (칸 단위, 연속값). */
    private fun floatPos(g: Game, piece: Piece, sx: Double, sy: Double, fx: Double, fy: Double): Pair<Double, Double> {
        val px = sx + g.gain * (fx - sx) + g.off * geo.cell
        val py = sy + g.gain * (fy - sy) - (g.lift + piece.height / 2.0) * geo.cell
        return ((py - geo.y0) / geo.cellH - piece.height / 2.0) to ((px - geo.x0) / geo.cellW - piece.width / 2.0)
    }

    private fun colors(board: Board): DoubleArray = DoubleArray(64 * 3) { k ->
        (if (board[k / 3 / 8, k / 3 % 8]) filledColor else emptyColor)[k % 3]
    }

    /** 드래그 중 화면: 떠 있는 블록이 각 칸 중심 영역(±0.2칸)을 덮는 비율만큼 색이 섞인다. */
    private fun during(g: Game, board: Board, piece: Piece, top: Double, left: Double): DoubleArray {
        val out = colors(board)
        fun blend(i: Int, c: DoubleArray, a: Double) { for (k in 0..2) out[i * 3 + k] = out[i * 3 + k] * (1 - a) + c[k] * a }
        val sr = round(top).toInt(); val sc = round(left).toInt()
        val valid = sr in 0..8 - piece.height && sc in 0..8 - piece.width && (piece.maskAt(sr, sc) and board.bits) == 0L
        if (g.ghost && valid) for (cell in piece.cells) blend((sr + cell.r) * 8 + sc + cell.c, dragColor, 0.45)
        for (r in 0 until 8) for (c in 0 until 8) {
            var cover = 0.0
            for (cell in piece.cells) {
                val y0 = top + cell.r; val x0 = left + cell.c // 이 칸이 덮는 범위 [y0, y0+1) × [x0, x0+1), 칸 (r,c)의 중심 영역은 [r+0.3, r+0.7]
                val oy = max(0.0, min(y0 + 1, r + 0.7) - max(y0, r + 0.3)); val ox = max(0.0, min(x0 + 1, c + 0.7) - max(x0, c + 0.3))
                cover += oy * ox / 0.16
            }
            if (cover > 0) blend(r * 8 + c, dragColor, min(1.0, cover))
        }
        return out
    }

    private data class Outcome(val landed: Pair<Int, Int>?, val confirmed: Boolean, val corrections: Int, val cancelled: Boolean)

    private val learned = ArrayList<DragObservation>()

    private fun dragOnce(g: Game, board: Board, piece: Piece, slot: Int, row: Int, col: Int, model: DragModel): Outcome {
        val sx = 1080.0 * (2 * slot + 1) / 6; val sy = 1865.0
        val tray = TrayRead(slot, piece, sx.toInt() - 40, sy.toInt() - 35, sx.toInt() + 40, sy.toInt() + 35)
        val path = DragPlanner.plan(geo, tray, piece, row, col, model, 1080, 2340)
        val servo = DragServo(geo, piece, row, col, model, tray.centerX, tray.centerY, 1080, 2340, allowBlindRelease = false)
        val before = colors(board)
        var fx = path.toX.toDouble(); var fy = path.toY.toDouble()
        val trace = ArrayList<String>()
        repeat(12) {
            val (top, left) = floatPos(g, piece, tray.centerX, tray.centerY, fx, fy)
            val seen = DragObserver.locate(before, during(g, board, piece, top, left), board.bits, piece, dragColor)
            if (System.getenv("SERVO_TRACE") != null) trace += "float=%.2f,%.2f seen=%s".format(top, left, seen)
            when (val a = servo.onObservation(fx, fy, seen)) {
                is DragServo.Action.MoveTo -> { fx = a.x; fy = a.y }
                is DragServo.Action.Release -> {
                    learned += servo.observations
                    val r = round(top).toInt(); val c = round(left).toInt()
                    val ok = r in 0..8 - piece.height && c in 0..8 - piece.width && (piece.maskAt(r, c) and board.bits) == 0L
                    if (System.getenv("SERVO_DEBUG") != null && (!ok || (r to c) != (row to col))) println("DBG gain=${g.gain} lift=${g.lift} piece=${piece.pattern()} target=$row,$col float=%.2f,%.2f seen=$seen confirmed=${a.confirmed}\n${board.toAscii()}".format(top, left))
                    return Outcome(if (ok) r to c else null, a.confirmed, servo.corrections, false)
                }
                DragServo.Action.Cancel -> {
                    learned += servo.observations
                    if (trace.isNotEmpty() && g.gain == 1.25) println("TRACE ${piece.pattern()} target=$row,$col: $trace")
                    return Outcome(null, false, servo.corrections, true)
                }
            }
        }
        error("끝나지 않음")
    }

    @Test
    fun `화면에서 떠 있는 블록 위치 읽기 - 어긋난 위치, 미리보기 유무, 일부가 채워진 칸 위`() {
        val board = Board.parse("XXXX....\n".repeat(2) + "........\n".repeat(6))
        val piece = Piece.parse("XX/X.")
        val before = colors(board)
        for (ghost in listOf(false, true)) {
            val g = Game(1.0, 0.0, 0.0, ghost)
            assertEquals(4 to 3, DragObserver.locate(before, during(g, board, piece, 4.0, 3.0), board.bits, piece, dragColor))
            assertEquals(4 to 3, DragObserver.locate(before, during(g, board, piece, 4.25, 2.8), board.bits, piece, dragColor))
            assertEquals(5 to 2, DragObserver.locate(before, during(g, board, piece, 4.8, 2.2), board.bits, piece, dragColor))
            // 칸 경계에 걸쳐 있으면(0.5칸 어긋남) 확실하지 않으므로 null
            assertNull(DragObserver.locate(before, during(g, board, piece, 4.5, 3.0), board.bits, piece, dragColor).takeIf { !ghost })
        }
        // 보드 밖(위쪽)으로 완전히 나가면 안 보임
        assertNull(DragObserver.locate(before, during(Game(1.0, 0.0, 0.0, false), board, piece, -3.0, 3.0), board.bits, piece))
        // 변화 없음
        assertNull(DragObserver.locate(before, before, board.bits, piece))
    }

    @Test
    fun `보고 맞추기 - 배율과 띄움을 몰라도 틀린 칸에는 절대 놓지 않는다`() {
        val rnd = Random(11)
        val shapes = listOf("X", "XX", "X/X", "XX/XX", "XXX", "X/X/X", "XX/X.", "XXX/XXX/XXX", "XXXXX", "X/X/X/X", "..X/.X./X..", "XXX/X../X..").map { Piece.parse(it) }
        val games = listOf(
            Game(1.0, 1.5, 0.0, true), Game(1.0, 0.4, 0.0, false), Game(1.0, 3.2, -0.6, true),
            Game(1.25, 2.0, 0.3, true), Game(1.4, 2.5, 0.0, false), Game(0.8, 1.0, 0.4, true),
        )
        for (g in games) {
            var wrong = 0; var placed = 0; var unconfirmed = 0; var cancelled = 0; var corr = 0; val n = 300; var looks = 0
            learned.clear() // 게임마다 처음부터: 앱처럼 관측이 쌓이며 모델이 맞춰짐
            repeat(n) {
                var bits = 0L
                for (i in 0 until 64) if (rnd.nextDouble() < 0.4) bits = bits or (1L shl i)
                val board = Board(bits)
                val piece = shapes[rnd.nextInt(shapes.size)]
                val spots = piece.masks.indices.filter { (piece.masks[it] and bits) == 0L }
                if (spots.isEmpty()) return@repeat
                val k = spots[rnd.nextInt(spots.size)]
                val o = dragOnce(g, board, piece, rnd.nextInt(3), piece.rows[k], piece.cols[k], DragModel.fit(learned.takeLast(40)))
                corr += o.corrections
                if (o.cancelled) cancelled++
                if (!o.confirmed && !o.cancelled) unconfirmed++
                if (o.landed != null) { placed++; if (o.landed != piece.rows[k] to piece.cols[k]) wrong++ }
            }
            println("[보고 맞추기] 배율 %.2f 띄움 %.1f 치우침 %.1f 미리보기 %-5s → 놓음 %d, 틀린 칸 %d, 확인 못 하고 놓음 %d, 취소 %d, 평균 보정 %.2f회".format(
                g.gain, g.lift, g.off, g.ghost, placed, wrong, unconfirmed, cancelled, corr.toDouble() / n))
            assertEquals(0, wrong, "틀린 칸에 놓으면 안 됨")
            assertEquals(0, unconfirmed)
            assertTrue(cancelled <= 12, "취소가 너무 많음: $cancelled")
        }
    }
}
