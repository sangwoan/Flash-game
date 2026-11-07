package com.blockbot.core

/**
 * 표준 블록 목록. 게임은 회전이 없으므로 방향마다 별개 블록으로 취급한다.
 * 용도: 인식 결과 검증(알려진 모양인지), 미래 블록 샘플링(expectimax).
 * 실제 게임의 출현 목록과 다를 수 있음 — 스크린샷으로 확인하며 보완.
 */
object Pieces {
    /** 시계 방향 90도 회전: (r, c) -> (c, h-1-r) */
    fun rotate90(p: Piece): Piece = Piece.of(p.cells.map { Cell(it.c, p.height - 1 - it.r) })

    /** 좌우 반전 */
    fun mirror(p: Piece): Piece = Piece.of(p.cells.map { Cell(it.r, p.width - 1 - it.c) })

    fun orientations(p: Piece, withMirror: Boolean = false): List<Piece> {
        val out = LinkedHashSet<Piece>()
        val bases = if (withMirror) listOf(p, mirror(p)) else listOf(p)
        for (b in bases) {
            var cur = b
            repeat(4) { out += cur; cur = rotate90(cur) }
        }
        return out.toList()
    }

    private fun family(base: String, pattern: String, withMirror: Boolean = false): List<Piece> =
        orientations(Piece.parse(pattern), withMirror).mapIndexed { i, p -> p.named("$base-$i") }

    val STANDARD: List<Piece> = buildList {
        addAll(family("I1", "X"))
        addAll(family("I2", "XX"))
        addAll(family("I3", "XXX"))
        addAll(family("I4", "XXXX"))
        addAll(family("I5", "XXXXX"))
        addAll(family("O2", "XX/XX"))
        addAll(family("O3", "XXX/XXX/XXX"))
        addAll(family("R23", "XXX/XXX"))
        addAll(family("V3", "XX/X."))            // 작은 ㄱ자 (3칸)
        addAll(family("V5", "XXX/X../X.."))      // 큰 ㄱ자 (5칸)
        addAll(family("L4", "X./X./XX", withMirror = true)) // L/J 테트로미노
        addAll(family("T4", "XXX/.X."))
        addAll(family("S4", ".XX/XX.", withMirror = true))  // S/Z
        addAll(family("D2", "X./.X"))            // 대각선 2칸 (떨어진 칸)
        addAll(family("D3", "X../.X./..X"))      // 대각선 3칸 — 스크린샷에서 확인
    }

    fun byName(name: String): Piece = STANDARD.firstOrNull { it.name == name }
        ?: throw IllegalArgumentException("알 수 없는 블록: $name")

    fun isKnown(p: Piece): Boolean = p in STANDARD
}
