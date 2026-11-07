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

    fun extract(bits: Long, w: Weights): BoardFeatures {
        val sizes = emptyRegionSizes(bits)
        return BoardFeatures(
            filled = Bits.popcount(bits),
            isolatedHoles = sizes.count { it == 1 },
            smallRegions = sizes.count { it in 2..w.smallRegionMaxSize },
            roughness = roughness(bits),
            missingProbes = w.probes.filterNot { it.piece.fitsAnywhere(bits) }.map { it.label },
        )
    }
}

class HeuristicEvaluator(val weights: Weights = Weights()) : Evaluator {
    override fun score(state: GameState): Double = breakdown(state).values.sum()

    override fun breakdown(state: GameState): Map<String, Double> {
        val f = Features.extract(state.board.bits, weights)
        val out = LinkedHashMap<String, Double>()
        out["filled"] = weights.filledCell * f.filled
        out["isolatedHoles"] = weights.isolatedHole * f.isolatedHoles
        out["smallRegions"] = weights.smallRegion * f.smallRegions
        out["roughness"] = weights.roughness * f.roughness
        for (p in weights.probes) {
            out["probeMiss:${p.label}"] = if (p.label in f.missingProbes) p.missPenalty else 0.0
        }
        return out
    }
}

/** 배치 1회의 점수 (줄 클리어·콤보·퍼펙트). */
object MoveScoring {
    fun score(w: Weights, r: PlacementResult): Double {
        var s = 0.0
        if (r.lines > 0) {
            s += w.lineClear * r.lines
            s += w.multiLineBonus * (r.lines - 1)
            if (r.state.comboStreak >= 2) s += w.combo * (r.state.comboStreak - 1)
        }
        if (r.perfectClear) s += w.perfectClear
        return s
    }
}
