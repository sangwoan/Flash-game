package com.blockbot.core

import java.awt.image.BufferedImage
import javax.imageio.ImageIO
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** 실제 게임 스크린샷(테마 5종, 해상도 2종)으로 인식 검증. */
class VisionTest {
    private fun load(name: String): PixelImage {
        val stream = javaClass.getResourceAsStream("/screens/$name") ?: error("fixture 없음: $name")
        val bi: BufferedImage = ImageIO.read(stream)
        val px = IntArray(bi.width * bi.height)
        bi.getRGB(0, 0, bi.width, bi.height, px, 0, bi.width)
        return PixelImage(bi.width, bi.height, px)
    }

    private fun readAll(name: String): VisionResult {
        val img = load(name)
        val t0 = System.nanoTime()
        val geo = assertNotNull(Vision.detectGeometry(img), "$name: 보드 못 찾음")
        val t1 = System.nanoTime()
        val v = Vision.read(img, geo)
        val t2 = System.nanoTime()
        println(
            "[$name] ${img.width}x${img.height} geo=(x0=%.0f y0=%.0f cell=%.1f×%.1f) 격자 %dms, 읽기 %dms, issues=%s uncertain=%d".format(
                geo.x0, geo.y0, geo.cellW, geo.cellH, (t1 - t0) / 1_000_000, (t2 - t1) / 1_000_000, v.issues, v.uncertainCells,
            )
        )
        println(v.board.toAscii().prependIndent("    "))
        println("    tray: " + v.tray.map { it?.piece?.pattern() })
        return v
    }

    private fun tray(vararg p: String?) = p.map { it?.let { s -> Piece.parse(s) } }

    @Test
    fun `노랑 테마 진행 중 보드`() {
        val v = readAll("yellow_midgame.jpg")
        assertTrue(v.clean)
        assertEquals(
            Board.parse(
                """
                .X..X...
                .X.XX..X
                .X.X...X
                .X.XXXXX
                .X.XX..X
                X..XX..X
                X..XX..X
                XXXXX..X
                """.trimIndent()
            ), v.board
        )
        assertEquals(tray("X/X/X/X", ".X/XX/.X", "XXX/..X/..X"), v.trayPieces)
    }

    @Test
    fun `보라 테마 빈 보드 - 대각선 블록`() {
        val v = readAll("purple_empty.jpg")
        assertTrue(v.clean)
        assertEquals(Board.EMPTY, v.board)
        assertEquals(tray("XXX", "..X/.X./X..", ".X/XX"), v.trayPieces)
    }

    @Test
    fun `파랑 테마 빈 보드 - 큰 블록`() {
        val v = readAll("blue_empty.jpg")
        assertTrue(v.clean)
        assertEquals(Board.EMPTY, v.board)
        assertEquals(tray("XXX/XXX/XXX", "XX/XX", "XXX/XXX/XXX"), v.trayPieces)
    }

    @Test
    fun `남색 테마, 다른 해상도`() {
        val v = readAll("navy_midgame_1248.jpg")
        assertTrue(v.clean)
        assertEquals(
            Board.parse(
                """
                ......X.
                ......X.
                ....XXXX
                ....X...
                XX..X...
                XX..XX..
                XX..XX..
                XX..XX..
                """.trimIndent()
            ), v.board
        )
        assertEquals(tray("XXX/X..", "XXX/X..", "XXX/X.."), v.trayPieces)
    }

    @Test
    fun `콤보 애니메이션 중인 화면은 믿을 수 없는 프레임으로 판정`() {
        val v = readAll("dark_combo_anim.jpg")
        assertFalse(v.clean, "애니메이션 프레임은 clean이면 안 됨")
        // 트레이는 애니메이션과 무관하게 읽혀야 함
        assertEquals(tray("XX/XX", null, null), v.trayPieces)
    }

    @Test
    fun `해상도가 같으면 테마가 달라도 격자 위치가 같다`() {
        val geos = listOf("yellow_midgame.jpg", "purple_empty.jpg", "blue_empty.jpg", "dark_combo_anim.jpg")
            .map { Vision.detectGeometry(load(it))!! }
        for (g in geos) {
            assertTrue(abs(g.cell - geos[0].cell) < 2.0, "칸 크기 차이: $geos")
            assertTrue(abs(g.y0 - geos[0].y0) < 6.0 && abs(g.x0 - geos[0].x0) < 10.0, "위치 차이: $geos")
        }
    }
}
