package com.blockbot.core

import kotlin.random.Random

/**
 * 다음 라운드 블록의 출현 확률 모델 (수읽기 샘플링용).
 * 그룹별 확률을 정하고 그룹 안에서는 균등하게 뽑는다.
 *
 * 사용자 관찰 기반 기본값:
 *  - 3×3 안에서는 어떤 형태로든 나올 수 있음
 *  - 3×3 꽉 찬 블록은 꽤 자주 나옴
 *  - 1×4, 1×5 (가로·세로)는 가끔 나옴
 * 정확한 비율은 모르므로 로그(트레이 기록)로 나중에 보정한다.
 */
class PieceDistribution(groups: List<Group>) {
    data class Group(val name: String, val probability: Double, val pieces: List<Piece>)

    val groups: List<Group> = groups.filter { it.pieces.isNotEmpty() && it.probability > 0 }
    private val pieces: List<Piece>
    private val cumulative: DoubleArray

    init {
        val total = this.groups.sumOf { it.probability }
        val ps = ArrayList<Piece>()
        val ws = ArrayList<Double>()
        for (g in this.groups) for (p in g.pieces) { ps += p; ws += g.probability / total / g.pieces.size }
        pieces = ps
        cumulative = DoubleArray(ws.size)
        var acc = 0.0
        ws.forEachIndexed { i, w -> acc += w; cumulative[i] = acc }
    }

    fun probabilityOf(p: Piece): Double {
        var s = 0.0
        val total = groups.sumOf { it.probability }
        for (g in groups) if (p in g.pieces) s += g.probability / total / g.pieces.size
        return s
    }

    fun sample(rng: Random): Piece {
        val x = rng.nextDouble() * cumulative.last()
        var lo = 0
        var hi = cumulative.size - 1
        while (lo < hi) { val mid = (lo + hi) / 2; if (cumulative[mid] < x) lo = mid + 1 else hi = mid }
        return pieces[lo]
    }

    fun sampleTray(rng: Random, n: Int = 3): List<Piece> = List(n) { sample(rng) }

    companion object {
        private val O3 = Piece.parse("XXX/XXX/XXX")

        /**
         * @param standard  흔한 설계형 블록 (표준 목록 중 3×3 이내, 3×3 꽉 찬 블록 제외)
         * @param square3   3×3 꽉 찬 블록
         * @param other3x3  그 밖의 3×3 이내 모양 (대각선 포함, 8방향으로 이어진 것)
         * @param line4     1×4 / 4×1
         * @param line5     1×5 / 5×1
         */
        fun of(standard: Double = 0.66, square3: Double = 0.12, other3x3: Double = 0.14, line4: Double = 0.04, line5: Double = 0.04): PieceDistribution {
            val std = Pieces.STANDARD.filter { it.height <= 3 && it.width <= 3 && it != O3 }
            val others = Pieces.ALL_WITHIN_3X3.filter { it !in Pieces.STANDARD && Pieces.isConnected8(it) }
            return PieceDistribution(listOf(
                Group("standard", standard, std),
                Group("square3", square3, listOf(O3)),
                Group("other3x3", other3x3, others),
                Group("line4", line4, listOf(Piece.parse("XXXX"), Piece.parse("X/X/X/X"))),
                Group("line5", line5, listOf(Piece.parse("XXXXX"), Piece.parse("X/X/X/X/X"))),
            ))
        }

        val DEFAULT: PieceDistribution = of()
    }
}
