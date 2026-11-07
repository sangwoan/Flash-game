package com.blockbot.core

/** 8×8 비트보드 상수. 비트 인덱스 = row * 8 + col (row 0 = 맨 위, col 0 = 맨 왼쪽). */
object Bits {
    const val SIZE = 8

    fun bit(r: Int, c: Int): Long = 1L shl (r * SIZE + c)

    val ROW: LongArray = LongArray(SIZE) { r -> 0xFFL shl (r * SIZE) }
    val COL: LongArray = LongArray(SIZE) { c ->
        var m = 0L
        for (r in 0 until SIZE) m = m or bit(r, c)
        m
    }
    val NOT_COL0: Long = COL[0].inv()
    val NOT_COL7: Long = COL[7].inv()
    val NOT_ROW7: Long = ROW[7].inv()

    /** 상하좌우로 한 칸씩 번진 마스크 (보드 밖으로 넘어가는 비트는 버림). */
    fun neighbors(m: Long): Long =
        (m shl 8) or (m ushr 8) or ((m shl 1) and NOT_COL0) or ((m ushr 1) and NOT_COL7)

    fun popcount(m: Long): Int = java.lang.Long.bitCount(m)
}

@JvmInline
value class Board(val bits: Long) {
    operator fun get(r: Int, c: Int): Boolean = (bits and Bits.bit(r, c)) != 0L

    val filledCount: Int get() = Bits.popcount(bits)
    val isEmpty: Boolean get() = bits == 0L

    fun toAscii(): String = (0 until 8).joinToString("\n") { r ->
        (0 until 8).joinToString("") { c -> if (this[r, c]) "X" else "." }
    }

    companion object {
        val EMPTY = Board(0L)

        /** 8줄 × 8글자. 채움: X x # 1 / 빈칸: . 0 _ — 공백은 무시. */
        fun parse(text: String): Board {
            val rows = text.lines().map { line -> line.filterNot(Char::isWhitespace) }.filter { it.isNotEmpty() }
            require(rows.size == 8) { "보드는 8줄이어야 함 (현재 ${rows.size}줄)" }
            var b = 0L
            rows.forEachIndexed { r, line ->
                require(line.length == 8) { "${r}번째 줄 길이가 8이 아님: '$line'" }
                line.forEachIndexed { c, ch ->
                    when (ch) {
                        'X', 'x', '#', '1' -> b = b or Bits.bit(r, c)
                        '.', '0', '_' -> Unit
                        else -> throw IllegalArgumentException("알 수 없는 문자 '$ch' (r=$r, c=$c)")
                    }
                }
            }
            return Board(b)
        }
    }
}
