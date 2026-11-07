package com.blockbot.core

/**
 * 게임이 실제로 주는 점수의 모델. 공식 공식은 공개돼 있지 않아 커뮤니티 분석에서
 * 공통된 구조만 따르고, 계수는 실제 게임 점수 변화를 로그로 모아 맞춘다.
 *
 *   배치 점수 = perCell × 놓은 칸 수
 *   클리어 점수 = lineBase × T(줄 수) + comboPerLine × 줄 수 × 직전 콤보 수
 *                 (T(n) = n(n+1)/2: 동시에 지운 줄이 많을수록 초선형)
 *   퍼펙트 = perfectBonus (있다/없다 자료가 엇갈림)
 *
 * 핵심: 콤보가 쌓일수록 같은 클리어의 가치가 선형으로 커진다 → 콤보 유지가 고득점의 열쇠.
 */
data class ScoreModel(
    val perCell: Double = 1.0,
    val lineBase: Double = 10.0,
    val comboPerLine: Double = 10.0,
    val perfectBonus: Double = 300.0,
) {
    fun points(r: PlacementResult): Double {
        var s = perCell * r.cellsPlaced
        if (r.lines > 0) {
            s += lineBase * (r.lines * (r.lines + 1) / 2)
            s += comboPerLine * r.lines * r.prevStreak
        }
        if (r.perfectClear) s += perfectBonus
        return s
    }
}

/** 탐색 중 배치 1회의 가치. 기본은 실제 점수 모델 그대로. */
fun interface PathScorer {
    fun score(r: PlacementResult): Double

    companion object {
        fun of(model: ScoreModel) = PathScorer { model.points(it) }
    }
}
