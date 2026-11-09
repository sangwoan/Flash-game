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
    fun `초록 테마 - 빈칸이 블록보다 밝아도, 블록이 배경과 비슷한 색이어도 읽는다`() {
        // 실기기 보고: 이 화면에서 빈칸을 블록으로 읽어 "꽉 찬 행"으로 계속 대기하던 문제
        val v = readAll("green_light_empty_cells.jpg")
        assertTrue(v.clean, "issues=${v.issues} uncertain=${v.uncertainCells}")
        assertEquals(
            Board.parse(
                """
                ........
                ........
                ........
                ........
                ........
                X.......
                XX......
                XXXXX...
                """.trimIndent()
            ), v.board
        )
        assertEquals(tray("XXX/XXX/XXX", "XX/XX", "XXX/XXX/XXX"), v.trayPieces)
    }

    @Test
    fun `힌트 테두리·번호가 그려진 화면도 똑같이 읽는다`() {
        // 앱의 HintView와 같은 위치: 테두리 칸의 18.5% 안쪽(두께 6%), 번호 원은 왼쪽 위 6~26%
        val img = load("green_light_empty_cells.jpg")
        val geo = Vision.detectGeometry(img)!!
        val px = img.argb
        fun fill(x0: Double, y0: Double, x1: Double, y1: Double, color: Int) {
            for (y in y0.toInt()..y1.toInt()) for (x in x0.toInt()..x1.toInt()) px[y * img.width + x] = color
        }
        val pink = 0xFFFF2D95.toInt()
        val cells = listOf(0 to 0, 0 to 1, 1 to 0, 5 to 0, 7 to 3, 6 to 1) // 빈칸·블록 칸 섞어서
        for ((r, c) in cells) {
            val x = geo.x0 + c * geo.cellW; val y = geo.y0 + r * geo.cellH; val cw = geo.cellW; val ch = geo.cellH
            val i0 = 0.185 - 0.03; val i1 = 0.185 + 0.03
            fill(x + i0 * cw, y + i0 * ch, x + (1 - i0) * cw, y + i1 * ch, pink)             // 위
            fill(x + i0 * cw, y + (1 - i1) * ch, x + (1 - i0) * cw, y + (1 - i0) * ch, pink) // 아래
            fill(x + i0 * cw, y + i0 * ch, x + i1 * cw, y + (1 - i0) * ch, pink)             // 왼쪽
            fill(x + (1 - i1) * cw, y + i0 * ch, x + (1 - i0) * cw, y + (1 - i0) * ch, pink) // 오른쪽
            fill(x + 0.06 * cw, y + 0.06 * ch, x + 0.26 * cw, y + 0.26 * ch, 0xFF000000.toInt()) // 번호 원(사각 근사)
        }
        val v = Vision.read(img, geo)
        assertTrue(v.clean, "issues=${v.issues} uncertain=${v.uncertainCells}")
        assertEquals(readAll("green_light_empty_cells.jpg").board, v.board)
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
