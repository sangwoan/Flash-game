package com.blockbot.core

import java.io.File

/**
 * "깰 수 있는데 지저분하게 뒀나?" 분석: 로그의 각 라운드 시작 계획(보드·트레이·콤보)에 대해
 * 봇이 실제로 고른 수의 결과와, 같은 라운드에서 가능했던 수들을 전수 비교한다.
 *  - 남은 칸 수(적을수록 깔끔), 지운 줄 수, 콤보 유지 여부
 */
object DebrisAnalyzer {
    data class Outcome(val filled: Int, val lines: Int, val keepsCombo: Boolean, val bits: Long)

    /** 이번 라운드를 다 놓는 모든 방법의 결과 (중복 보드 제거). */
    fun allOutcomes(rules: Rules, st: GameState, tray: List<Piece>): List<Outcome> {
        val out = HashMap<Long, Outcome>()
        fun rec(s: GameState, rem: Int, lines: Int) {
            if (rem == 0) {
                val o = Outcome(s.board.filledCount, lines, s.clearedThisRound || st.comboStreak == 0, s.board.bits)
                val ex = out[s.board.bits]
                if (ex == null || o.lines > ex.lines) out[s.board.bits] = o
                return
            }
            val seen = HashSet<Piece>()
            for (i in tray.indices) {
                if ((rem shr i) and 1 == 0 || !seen.add(tray[i])) continue
                for (m in tray[i].masks) if ((s.board.bits and m) == 0L) {
                    val r = rules.apply(s, m)
                    rec(r.state, rem and (1 shl i).inv(), lines + r.lines)
                }
            }
        }
        rec(st, (1 shl tray.size) - 1, 0)
        return out.values.toList()
    }
}

/** 사용: ./gradlew :core:debris -PdebrisArgs="로그폴더 [파일이름 포함 문자열]" */
fun main(args: Array<String>) {
    val files = LogFiles.find(File(args[0])).filter { args.size < 2 || it.name.contains(args[1]) }
    val rules = Rules()
    val strRe = { k: String -> Regex("\"$k\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"") }
    val arrRe = { k: String -> Regex("\"$k\"\\s*:\\s*\\[((?:[^\\]\"]|\"(?:[^\"\\\\]|\\\\.)*\")*)\\]") }
    fun arr(line: String, k: String) = arrRe(k).find(line)?.groupValues?.get(1)?.let { raw ->
        Regex("\"((?:[^\"\\\\]|\\\\.)*)\"|null").findAll(raw).map { if (it.value == "null") null else it.groupValues[1].replace("\\/", "/") }.toList()
    }
    var n = 0; var messy = 0; var messyKeep = 0; var extraSum = 0
    val examples = ArrayList<String>()
    val extraHist = IntArray(20)
    for (f in files) for (line in LogFiles.lines(f)) {
        if (!line.contains("\"type\":\"plan\"")) continue
        val tray = arr(line, "tray") ?: continue
        if (tray.any { it == null }) continue // 라운드 시작(3개 다 있음)만
        val boardText = strRe("board").find(line)?.groupValues?.get(1)?.replace("\\n", "\n") ?: continue
        val board = runCatching { Board.parse(boardText) }.getOrNull() ?: continue
        val combo = Regex("\"combo\"\\s*:\\s*(\\d+)").find(line)?.groupValues?.get(1)?.toInt() ?: 0
        val steps = arr(line, "steps") ?: continue
        if (steps.size != 3) continue
        val pieces = tray.map { Piece.parse(it!!) }
        // 봇이 고른 수 재현
        var s = GameState(board, comboStreak = combo)
        var lines = 0
        for (st in steps) {
            val slot = st!!.substringAfter("slot").substringBefore("@").toInt()
            val (r, c) = st.substringAfter("@").substringBefore(" ").split(",").map { it.toInt() }
            val res = rules.apply(s, pieces[slot].maskAt(r, c)); s = res.state; lines += res.lines
        }
        val chosen = DebrisAnalyzer.Outcome(s.board.filledCount, lines, s.clearedThisRound || combo == 0, s.board.bits)
        val all = DebrisAnalyzer.allOutcomes(rules, GameState(board, comboStreak = combo), pieces)
        val keep = all.filter { it.keepsCombo }
        val cleanest = (if (chosen.keepsCombo && keep.isNotEmpty()) keep else all).minByOrNull { it.filled } ?: continue
        n++
        val extra = chosen.filled - cleanest.filled
        extraHist[minOf(extra, 19)]++
        if (extra >= 4) {
            messy++; extraSum += extra
            if (cleanest.keepsCombo) messyKeep++
            if (examples.size < 6) examples += "콤보 $combo, 트레이 ${tray}: 봇 결과 ${chosen.filled}칸(${chosen.lines}줄) vs 가장 깔끔 ${cleanest.filled}칸(${cleanest.lines}줄)\n" +
                board.toAscii().lines().zip(Board(chosen.bits).toAscii().lines()).zip(Board(cleanest.bits).toAscii().lines())
                    .joinToString("\n") { (ab, c) -> "  ${ab.first}   →봇 ${ab.second}   깔끔 $c" }
        }
    }
    println("라운드 $n 개 분석: 봇이 가장 깔끔한 수보다 4칸 이상 더 남긴 경우 $messy 번 (%.1f%%), 그중 콤보도 지키는 깔끔한 수가 있었던 경우 $messyKeep 번".format(100.0 * messy / maxOf(1, n)))
    println("더 남긴 칸 수 분포(0~19+): ${extraHist.toList()}")
    examples.forEach { println("\n$it") }
}
