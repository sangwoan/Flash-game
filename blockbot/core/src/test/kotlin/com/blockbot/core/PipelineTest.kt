package com.blockbot.core

import kotlin.math.roundToInt
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * 폰 없이 전체 루프 검증: 게임 화면을 흉내 내 그린 이미지 → 인식 → 추적 → 계산 → 배치 → 다시 그림.
 * 실제 앱의 BotController가 하는 일과 같은 순서.
 */
class PipelineTest {
    private val w = 1080
    private val h = 2340
    private val geo = BoardGeometry(60.0, 550.0, 120.0, 120.0)
    private val palette = intArrayOf(0xF2C230, 0xE84A5F, 0x4FD1C5, 0x7C5CFF, 0x3DDC84, 0xFF8A3D)

    private fun rgb(r: Int, g: Int, b: Int) = (0xFF shl 24) or (r.coerceIn(0, 255) shl 16) or (g.coerceIn(0, 255) shl 8) or b.coerceIn(0, 255)
    private fun shade(c: Int, k: Double) = rgb((((c shr 16) and 0xFF) * k).roundToInt(), (((c shr 8) and 0xFF) * k).roundToInt(), ((c and 0xFF) * k).roundToInt())

    private fun block(px: IntArray, x0: Int, y0: Int, size: Int, color: Int) {
        val bevel = maxOf(2, size / 8) // 실제 게임 블록의 베벨 두께(칸의 약 12%)
        for (y in y0 until y0 + size) for (x in x0 until x0 + size) {
            if (x !in 0 until w || y !in 0 until h) continue
            val dx = x - x0; val dy = y - y0
            px[y * w + x] = when {
                // 실측(초록 테마): 윗변 = 면 +55, 아랫변 = 면 ×0.75
                dy < bevel || dx < bevel -> rgb(((color shr 16) and 0xFF) + 55, ((color shr 8) and 0xFF) + 55, (color and 0xFF) + 55)
                dy >= size - bevel || dx >= size - bevel -> shade(color, 0.75)
                else -> color
            }
        }
    }

    private fun render(board: Board, tray: List<Piece?>, colors: IntArray): PixelImage {
        val px = IntArray(w * h)
        for (y in 0 until h) {
            val bg = rgb(40, 60 + y * 20 / h, 150 - y * 15 / h) // 세로 그라데이션 배경
            for (x in 0 until w) px[y * w + x] = bg
        }
        // 보드 틀 + 빈칸 + 격자선
        val frame = rgb(25, 30, 90)
        for (y in 530 until 1530) for (x in 40 until 1040) px[y * w + x] = frame
        for (r in 0 until 8) for (c in 0 until 8) {
            val x0 = (geo.x0 + c * geo.cellW).toInt(); val y0 = (geo.y0 + r * geo.cellH).toInt()
            for (y in y0 until y0 + 120) for (x in x0 until x0 + 120) {
                val line = x - x0 < 2 || y - y0 < 2
                px[y * w + x] = if (line) rgb(15, 15, 45) else rgb(22, 24, 62)
            }
            if (board[r, c]) block(px, x0, y0, 120, colors[(r * 8 + c) % colors.size])
        }
        // 트레이: 슬롯 중앙, 칸 크기 0.447배, 오른쪽 아래 그림자
        val ts = (geo.cell * 0.447).roundToInt()
        tray.forEachIndexed { slot, p ->
            if (p == null) return@forEachIndexed
            val cx = w * (2 * slot + 1) / 6
            val cy = (geo.bottom + 2.35 * geo.cellH).roundToInt()
            val left = cx - p.width * ts / 2; val top = cy - p.height * ts / 2
            for (cell in p.cells) {
                val x0 = left + cell.c * ts; val y0 = top + cell.r * ts
                for (y in y0 + 6 until y0 + ts + 6) for (x in x0 + 6 until x0 + ts + 6) px[y * w + x] = shade(px[y * w + x], 0.8)
            }
            for (cell in p.cells) block(px, left + cell.c * ts, top + cell.r * ts, ts, palette[slot])
        }
        return PixelImage(w, h, px)
    }

    @Test
    fun `그린 화면만 보고 두며 상태 추적이 실제와 일치한다 (수읽기 포함, 최대 20라운드)`() {
        val rnd = Random(5)
        val rules = Rules(RuleConfig(comboMode = ComboMode.SLIDING))
        val solver = Solver(rules = rules, lookahead = LookaheadConfig(samples = 8, candidates = 8, timeBudgetMs = 600_000))
        val tracker = GameTracker(rules)
        val colors = IntArray(64) { 0xFF000000.toInt() or palette[rnd.nextInt(palette.size)] }

        var truth = GameState(Board.EMPTY)
        // 사용자 관찰 분포: 3×3 안의 아무 모양(대각선 포함), 3×3 꽉 찬 블록, 가끔 1×4·1×5
        var tray: List<Piece?> = PieceDistribution.DEFAULT.sampleTray(rnd)

        fun observe(): Pair<VisionResult, TrackEvent> {
            val img = render(truth.board, tray, colors)
            val g = assertNotNull(Vision.detectGeometry(img))
            val v = Vision.read(img, g)
            assertTrue(v.clean, "인식 문제: ${v.issues} uncertain=${v.uncertainCells}\n${truth.board.toAscii()}\n" +
                "bevel=" + v.cellBevel.map { it.toInt() }.chunked(8).joinToString("\n") + "\ndist=" + v.cellDistance.map { it.toInt() }.chunked(8).joinToString("\n"))
            assertEquals(truth.board, v.board, "보드 인식 불일치")
            assertEquals(tray, v.trayPieces, "트레이 인식 불일치")
            tracker.observe(v)
            return v to tracker.observe(v)
        }

        val (_, first) = observe()
        assertIs<TrackEvent.Resync>(first)
        var rounds = 0
        var lines = 0
        while (rounds < 20) {
            val plan = solver.solve(tracker.state!!, tracker.tray).best
            if (!plan.survives) break
            for ((i, st) in plan.steps.withIndex()) {
                val r = rules.apply(truth, st.piece.maskAt(st.row, st.col))
                truth = r.state
                lines += r.lines
                tray = tray.toMutableList().also { it[st.slot] = null }
                val last = i == plan.steps.lastIndex
                if (last) {
                    truth = rules.endRound(truth)
                    tray = PieceDistribution.DEFAULT.sampleTray(rnd)
                }
                val (_, ev) = observe()
                assertIs<TrackEvent.Placed>(ev, "라운드 $rounds 단계 $i")
                assertEquals(st.slot to (st.row to st.col), ev.transitions.single().let { it.slot to (it.row to it.col) })
                assertEquals(last, ev.newRound)
                assertEquals(truth, tracker.state, "추적 상태(콤보 포함)가 실제와 다름")
            }
            rounds++
        }
        println("[파이프라인] $rounds 라운드, ${lines}줄 클리어, 최종 콤보 ${truth.comboStreak}")
        assertTrue(rounds >= 5, "너무 빨리 끝남: $rounds 라운드")
    }
}
