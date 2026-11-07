package com.blockbot.core

data class Cell(val r: Int, val c: Int)

/**
 * 블록 모양. 칸 좌표는 바운딩 박스 좌상단 기준으로 정규화되어 있다.
 * 동등성은 모양으로만 판단한다(이름 무관).
 */
class Piece private constructor(val name: String, val cells: List<Cell>) {
    val height: Int = cells.maxOf { it.r } + 1
    val width: Int = cells.maxOf { it.c } + 1
    val size: Int get() = cells.size

    /** 좌상단을 (0,0)에 뒀을 때의 마스크. */
    val shapeMask: Long = cells.fold(0L) { m, cell -> m or Bits.bit(cell.r, cell.c) }

    /** 보드 안에 들어가는 모든 좌상단 위치와 그 마스크 (행 우선 순서). */
    val rows: IntArray
    val cols: IntArray
    val masks: LongArray

    init {
        val n = (9 - height) * (9 - width)
        rows = IntArray(n)
        cols = IntArray(n)
        masks = LongArray(n)
        var i = 0
        for (r in 0..8 - height) for (c in 0..8 - width) {
            rows[i] = r
            cols[i] = c
            masks[i] = shapeMask shl (r * 8 + c)
            i++
        }
    }

    fun maskAt(r: Int, c: Int): Long {
        require(r in 0..8 - height && c in 0..8 - width) { "$name 은(는) ($r,$c)에 보드 밖으로 나감" }
        return shapeMask shl (r * 8 + c)
    }

    fun fitsAnywhere(boardBits: Long): Boolean = masks.any { (it and boardBits) == 0L }

    fun named(newName: String): Piece = Piece(newName, cells)

    /** "XX/X./X." 형식. */
    fun pattern(): String = (0 until height).joinToString("/") { r ->
        (0 until width).joinToString("") { c -> if (Cell(r, c) in cells) "X" else "." }
    }

    override fun equals(other: Any?): Boolean = other is Piece && other.shapeMask == shapeMask
    override fun hashCode(): Int = shapeMask.hashCode()
    override fun toString(): String = name

    companion object {
        fun of(cells: Collection<Cell>, name: String? = null): Piece {
            require(cells.isNotEmpty()) { "빈 블록" }
            val minR = cells.minOf { it.r }
            val minC = cells.minOf { it.c }
            val norm = cells.map { Cell(it.r - minR, it.c - minC) }.distinct()
                .sortedWith(compareBy({ it.r }, { it.c }))
            require(norm.all { it.r < 8 && it.c < 8 }) { "블록이 8×8보다 큼" }
            val tmp = Piece("", norm)
            return if (name != null) tmp.named(name) else tmp.named(tmp.pattern())
        }

        /** 줄 구분은 '/' 또는 줄바꿈. X=칸, 그 외(. 공백)=빈칸. */
        fun parse(text: String, name: String? = null): Piece {
            val lines = text.split('/', '\n').map { it.trimEnd() }.filter { it.isNotBlank() }
            val cells = buildList {
                lines.forEachIndexed { r, line ->
                    line.forEachIndexed { c, ch -> if (ch == 'X' || ch == 'x' || ch == '#') add(Cell(r, c)) }
                }
            }
            return of(cells, name)
        }
    }
}
