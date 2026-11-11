package com.blockbot.core

import kotlin.random.Random

/**
 * 다음 라운드 블록의 출현 확률 모델 (수읽기 샘플링·시뮬레이션용).
 *
 * 두 가지를 담는다.
 *  1. 블록별 출현 확률
 *  2. friendly: 게임이 "지금 보드에 들어가는 블록"을 골라 주는 정도 (0 = 완전 무작위, 1 = 항상 들어가는 것만).
 *     실제 게임은 무작위보다 훨씬 관대한 것으로 보인다(19만 점 플레이 기준). 로그로 추정한다([LogLearner]).
 *
 * 텍스트 형식으로 저장·로드한다 (폰에 올려 앱이 읽음):
 *   friendly 0.72
 *   rounds 312
 *   piece XX/X. 0.0312
 */
class PieceDistribution(entries: List<Pair<Piece, Double>>, val friendly: Double = 0.0, val learnedRounds: Int = 0) {
    val pieces: List<Piece>
    val probabilities: DoubleArray
    private val cumulative: DoubleArray

    init {
        val merged = LinkedHashMap<Piece, Double>()
        for ((p, w) in entries) if (w > 0) merged[p] = (merged[p] ?: 0.0) + w
        require(merged.isNotEmpty()) { "빈 분포" }
        val total = merged.values.sum()
        pieces = merged.keys.toList()
        probabilities = merged.values.map { it / total }.toDoubleArray()
        cumulative = DoubleArray(probabilities.size)
        var acc = 0.0
        probabilities.forEachIndexed { i, w -> acc += w; cumulative[i] = acc }
    }

    fun probabilityOf(p: Piece): Double = pieces.indexOf(p).let { if (it < 0) 0.0 else probabilities[it] }

    fun sample(rng: Random): Piece {
        val x = rng.nextDouble() * cumulative.last()
        var lo = 0
        var hi = cumulative.size - 1
        while (lo < hi) { val mid = (lo + hi) / 2; if (cumulative[mid] < x) lo = mid + 1 else hi = mid }
        return pieces[lo]
    }

    /**
     * 트레이 3개를 뽑는다. board가 주어지면 friendly 확률로 "세 블록 모두 각각 들어갈 자리가 있는" 트레이를 고른다.
     */
    fun sampleTray(rng: Random, board: Board? = null, n: Int = 3): List<Piece> {
        val first = List(n) { sample(rng) }
        if (board == null || friendly <= 0.0 || rng.nextDouble() >= friendly) return first
        var tray = first
        repeat(30) {
            if (tray.all { it.fitsAnywhere(board.bits) }) return tray
            tray = List(n) { sample(rng) }
        }
        return tray
    }

    fun withFriendly(f: Double) = PieceDistribution(pieces.zip(probabilities.toList()), f.coerceIn(0.0, 1.0), learnedRounds)

    fun toText(): String = buildString {
        appendLine("# BlockBot 블록 분포 (LogLearner 생성)")
        appendLine(String.format(java.util.Locale.US, "friendly %.4f", friendly))
        appendLine("rounds $learnedRounds")
        pieces.indices.sortedByDescending { probabilities[it] }.forEach { i ->
            appendLine(String.format(java.util.Locale.US, "piece %s %.6f", pieces[i].pattern(), probabilities[i]))
        }
    }

    companion object {
        private val O3 = Piece.parse("XXX/XXX/XXX")

        fun fromText(text: String): PieceDistribution {
            var friendly = 0.0
            var rounds = 0
            val entries = ArrayList<Pair<Piece, Double>>()
            for (raw in text.lines()) {
                val line = raw.trim()
                if (line.isEmpty() || line.startsWith("#")) continue
                val parts = line.split(Regex("\\s+"))
                when (parts[0]) {
                    "friendly" -> friendly = parts[1].toDouble()
                    "rounds" -> rounds = parts[1].toInt()
                    "piece" -> entries += Piece.parse(parts[1]) to parts[2].toDouble()
                }
            }
            return PieceDistribution(entries, friendly, rounds)
        }

        /**
         * 그룹별 확률로 만든 기본 분포 (사용자 관찰 기반).
         * @param standard  흔한 설계형 블록 (표준 목록 중 3×3 이내, 3×3 꽉 찬 블록 제외)
         * @param square3   3×3 꽉 찬 블록 ("꽤 자주")
         * @param other3x3  그 밖의 3×3 이내 모양 (대각선 포함, 8방향으로 이어진 것)
         * @param line4     1×4 / 4×1 ("가끔")
         * @param line5     1×5 / 5×1 ("가끔")
         * @param friendly  실제 게임의 관대함 추정치 — 로그 학습 전 기본값
         */
        fun of(
            standard: Double = 0.66, square3: Double = 0.12, other3x3: Double = 0.14,
            line4: Double = 0.04, line5: Double = 0.04, friendly: Double = DEFAULT_FRIENDLY,
        ): PieceDistribution {
            val std = Pieces.STANDARD.filter { it.height <= 3 && it.width <= 3 && it != O3 }
            val others = Pieces.ALL_WITHIN_3X3.filter { it !in Pieces.STANDARD && Pieces.isConnected8(it) }
            val groups = listOf(
                standard to std, square3 to listOf(O3), other3x3 to others,
                line4 to listOf(Piece.parse("XXXX"), Piece.parse("X/X/X/X")),
                line5 to listOf(Piece.parse("XXXXX"), Piece.parse("X/X/X/X/X")),
            )
            return PieceDistribution(groups.flatMap { (p, list) -> list.map { it to p / list.size } }, friendly)
        }

        /** 로그 학습 전 관대함 추정치. 완전 무작위면 시뮬레이션이 30라운드 안에 끝나는데 실제로는 훨씬 길게 간다. */
        const val DEFAULT_FRIENDLY = 0.6

        /** 사용자 관찰만으로 만든 초기 가정 (비교·테스트용). */
        val ASSUMED: PieceDistribution = of()

        /**
         * 기본 분포 = 실제 로그에서 학습한 확률 90% + 초기 가정 10%(로그에 안 나온 모양 대비).
         */
        val DEFAULT: PieceDistribution = run {
            val real = RealDistribution.ENTRIES.map { Piece.parse(it.first) to it.second }
            val total = real.sumOf { it.second }
            PieceDistribution(real.map { it.first to 0.9 * it.second / total } +
                ASSUMED.pieces.mapIndexed { i, p -> p to 0.1 * ASSUMED.probabilities[i] }, DEFAULT_FRIENDLY, learnedRounds = 719)
        }
    }
}
