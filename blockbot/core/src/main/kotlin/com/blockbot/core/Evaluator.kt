package com.blockbot.core

/**
 * 탐색 끝(라운드 종료 또는 더 놓을 수 없는 상태)의 상태를 평가.
 * 나중에 다음 라운드 블록을 샘플링하는 ExpectimaxEvaluator로 교체 가능.
 */
interface Evaluator {
    fun score(state: GameState): Double

    /** 로그·튜닝용 항목별 점수. 값의 합 == score(state). */
    fun breakdown(state: GameState): Map<String, Double>
}

data class BoardFeatures(
    val filled: Int,
    val isolatedHoles: Int,
    val smallRegions: Int,
    val roughness: Int,
    val missingProbes: List<String>,
    val nearLines: Int,
)

object Features {
    /** 빈칸 연결 영역(상하좌우) 크기 목록. */
    fun emptyRegionSizes(bits: Long): List<Int> {
        var remaining = bits.inv()
        val sizes = ArrayList<Int>()
        while (remaining != 0L) {
            var region = remaining and -remaining
            while (true) {
                val grown = (region or Bits.neighbors(region)) and remaining
                if (grown == region) break
                region = grown
            }
            sizes += Bits.popcount(region)
            remaining = remaining and region.inv()
        }
        return sizes
    }

    /** 가로·세로로 이웃한 두 칸의 채움 상태가 다른 경계 수 (보드 바깥 벽은 제외). */
    fun roughness(bits: Long): Int {
        val h = (bits xor (bits ushr 1)) and Bits.NOT_COL7
        val v = (bits xor (bits ushr 8)) and Bits.NOT_ROW7
        return Bits.popcount(h) + Bits.popcount(v)
    }

    /** 6~7칸이 찬 행·열 수 (꽉 찬 줄은 이미 지워졌으므로 7이 최대). */
    fun nearLines(bits: Long): Int {
        var n = 0
        for (i in 0 until 8) {
            if (Bits.popcount(bits and Bits.ROW[i]) >= 6) n++
            if (Bits.popcount(bits and Bits.COL[i]) >= 6) n++
        }
        return n
    }

    fun extract(bits: Long, w: Weights): BoardFeatures {
        val sizes = emptyRegionSizes(bits)
        return BoardFeatures(
            filled = Bits.popcount(bits),
            isolatedHoles = sizes.count { it == 1 },
            smallRegions = sizes.count { it in 2..w.smallRegionMaxSize },
            roughness = roughness(bits),
            missingProbes = w.probes.filterNot { it.piece.fitsAnywhere(bits) }.map { it.label },
            nearLines = nearLines(bits),
        )
    }
}

class HeuristicEvaluator(val weights: Weights = Weights()) : Evaluator {
    override fun score(state: GameState): Double = breakdown(state).values.sum()

    override fun breakdown(state: GameState): Map<String, Double> {
        val f = Features.extract(state.board.bits, weights)
        val k = 1.0 + weights.healthPerStreak * state.comboStreak
        val out = LinkedHashMap<String, Double>()
        out["filled"] = k * weights.filledCell * f.filled
        out["isolatedHoles"] = k * weights.isolatedHole * f.isolatedHoles
        out["smallRegions"] = k * weights.smallRegion * f.smallRegions
        out["roughness"] = k * weights.roughness * f.roughness
        for (p in weights.probes) {
            out["probeMiss:${p.label}"] = if (p.label in f.missingProbes) k * p.missPenalty else 0.0
        }
        out["nearLines"] = weights.nearLine * f.nearLines
        out["combo"] = if (state.comboStreak > 0)
            state.comboStreak * (weights.comboAlive - weights.comboRisk * state.movesSinceClear) else 0.0
        return out
    }
}
