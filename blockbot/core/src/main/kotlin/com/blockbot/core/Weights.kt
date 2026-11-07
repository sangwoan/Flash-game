package com.blockbot.core

/**
 * "이 모양 블록이 다음에 나오면 들어갈 자리가 있는가" 검사용.
 * @param missPenalty 들어갈 자리가 하나도 없을 때 더해지는 점수 (음수)
 */
data class Probe(val label: String, val pattern: String, val missPenalty: Double) {
    val piece: Piece = Piece.parse(pattern, label)
}

/**
 * 평가 가중치. 앱에서는 JSON 설정에서 읽어 이 객체로 만든다(튜닝 대상).
 * 수(배치)마다 더하는 점수 + 최종 보드 모양 점수의 합으로 평가.
 */
data class Weights(
    // ── 배치마다 더하는 점수 ──
    val lineClear: Double = 10.0,       // 지운 줄 1개당
    val multiLineBonus: Double = 12.0,  // 한 번에 여러 줄: (줄 수 - 1)당
    val combo: Double = 8.0,            // 연속 클리어: (streak - 1)당
    val perfectClear: Double = 500.0,   // 보드 전체 비움 (우선순위 규칙과 별개로 점수에도 반영)

    // ── 최종 보드 모양 ──
    val filledCell: Double = -0.6,      // 남은 채워진 칸 1개당 (적을수록 퍼펙트에 가까움)
    val isolatedHole: Double = -8.0,    // 사방이 막힌 빈칸 1개당
    val smallRegion: Double = -4.0,     // 크기 2..smallRegionMaxSize인 고립 빈 영역 1개당
    val smallRegionMaxSize: Int = 4,
    val roughness: Double = -0.5,       // 인접 칸 사이 채움/빈칸 경계 1개당 (울퉁불퉁함)
    val probes: List<Probe> = DEFAULT_PROBES,
) {
    companion object {
        val DEFAULT_PROBES = listOf(
            Probe("3x3", "XXX/XXX/XXX", -15.0),
            Probe("1x5", "XXXXX", -6.0),
            Probe("5x1", "X/X/X/X/X", -6.0),
            Probe("2x2", "XX/XX", -4.0),
        )
    }
}
