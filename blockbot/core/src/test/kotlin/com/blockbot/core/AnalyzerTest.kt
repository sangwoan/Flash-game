package com.blockbot.core

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AnalyzerTest {
    @Test
    fun `실제 로그 분석 - 게임 구분, 라운드, 콤보, 힌트 따름, 게임오버 원인, 예측 검증`() {
        val board = Board.parse("XXXXXXX.\n" + "X.X.X.X.\n".repeat(7)).toAscii().replace("\n", "\\n")
        val lines = listOf(
            """{"type":"resync","msg":"시작"}""",
            """{"type":"plan","board":"$board","tray":["X","XX","X\/X"],"steps":["slot0@0,7 lines=1","slot1@2,1 lines=0"],"survives":true,"nextDeathRate":0.1}""",
            """{"type":"placed","moves":["slot0:X@0,7 lines=1"],"combo":1,"estScore":20}""",
            """{"type":"plan","board":"$board","tray":[null,"XX","X\/X"],"steps":["slot1@2,1 lines=0"],"survives":true}""",
            """{"type":"placed","moves":["slot1:XX@5,1 lines=0"],"combo":1,"estScore":22}""",
            """{"type":"plan","board":"$board","tray":["XXX\/XXX\/XXX","X","XX"],"steps":["slot1@0,1 lines=0"],"survives":false,"nextDeathRate":0.5}""",
            """{"type":"resync","msg":"새 게임"}""",
            """{"type":"plan","board":"$board","tray":["X","X","X"],"steps":["slot0@0,7 lines=1"],"survives":true,"nextDeathRate":0.0}""",
            """{"type":"placed","moves":["slot0:X@0,7 lines=1"],"combo":3,"estScore":40}""",
        )
        val f = File.createTempFile("session_test", ".jsonl").apply { writeText(lines.joinToString("\n")); deleteOnExit() }
        val r = LogAnalyzer.analyze(listOf(f))
        println(r.text)
        assertEquals(2, r.games.size)
        assertEquals(2, r.games[0].rounds)
        assertEquals(2, r.games[0].placements)
        assertEquals(1, r.games[0].followed)             // 첫 수는 힌트대로, 둘째는 다른 곳
        assertEquals(listOf(Piece.parse("XXX/XXX/XXX"), Piece.parse("XX")), r.games[0].gameOver!!.second)
        assertEquals(3, r.games[1].maxCombo)
        assertEquals(listOf(0.1), r.predictedDeath)      // 1판 1라운드 예측 → 2라운드에 실제 게임오버
        assertEquals(listOf(true), r.actualDeath)
        assertTrue(r.text.contains("게임 2판"))
    }
}
