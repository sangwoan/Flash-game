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

    /** 사방(벽 포함)이 막힌 빈칸 수 — 비트 연산만으로 빠르게. */
    fun isolatedHolesFast(bits: Long): Int {
        val up = (bits shl 8) or Bits.ROW[0]
        val down = (bits ushr 8) or Bits.ROW[7]
        val left = ((bits shl 1) and Bits.NOT_COL0) or Bits.COL[0]
        val right = ((bits ushr 1) and Bits.NOT_COL7) or Bits.COL[7]
        return Bits.popcount(bits.inv() and up and down and left and right)
    }

    private val O3 = Piece.parse("XXX/XXX/XXX")

    /** 서로 겹치지 않는 3×3 자리가 두 곳 이상 있는가. */
    fun twoDisjoint3x3(bits: Long): Boolean {
        val fits = O3.masks.filter { (it and bits) == 0L }
        for (i in fits.indices) for (j in i + 1 until fits.size) if ((fits[i] and fits[j]) == 0L) return true
        return false
    }

    /** 빔 탐색 정렬용 가벼운 평가 (영역 탐색 생략). 3×3 자리 유무는 사망 원인 1위라 포함. */
    fun cheapScore(bits: Long, w: Weights): Double {
        var s = w.filledCell * Bits.popcount(bits) + w.isolatedHole * isolatedHolesFast(bits) + w.roughness * roughness(bits)
        if (!O3.fitsAnywhere(bits)) s += w.probes.firstOrNull { it.label == "3x3" }?.missPenalty ?: 0.0
        return s
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

private val ROOM_O3 = Piece.parse("XXX/XXX/XXX")
private val ROOM_I5H = Piece.parse("XXXXX")
private val ROOM_I5V = Piece.parse("X/X/X/X/X")

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
        if (weights.pair3x3 != 0.0) out["pair3x3"] = if (Features.twoDisjoint3x3(state.board.bits)) 0.0 else k * weights.pair3x3
        if (weights.room3x3 != 0.0 || weights.roomLine5 != 0.0) {
            val bits = state.board.bits
            fun count(p: Piece): Int { var n = 0; for (m in p.masks) if ((m and bits) == 0L) { n++; if (n >= weights.roomCap) break }; return n }
            out["room3x3"] = k * weights.room3x3 * count(ROOM_O3)
            out["roomLine5"] = k * weights.roomLine5 * minOf(weights.roomCap, count(ROOM_I5H) + count(ROOM_I5V))
        }
        out["combo"] = if (state.comboStreak > 0)
            state.comboStreak * (weights.comboAlive - weights.comboRisk * state.movesSinceClear) else 0.0
        return out
    }
}
