package com.blockbot.core

/**
 * 실제 게임 로그(갤럭시 SM-S948N, 719라운드·블록 2,073개, 2026-11)에서 학습한 블록 출현 확률.
 * 가정과 크게 달랐던 점: 세로 4칸 막대가 가장 흔하고(14%), 3×3(10%)·2×2(8%)가 그다음, 1~3칸짜리 작은 블록은 드묾.
 * mac/learn.sh 로 폰에 올린 분포 파일이 있으면 그쪽이 우선한다.
 */
object RealDistribution {
    val ENTRIES: List<Pair<String, Double>> = listOf(
        "X/X/X/X" to 0.143414,
        "XXX/XXX/XXX" to 0.104422,
        "XX/XX" to 0.083476,
        "X../XXX" to 0.054945,
        "XXXX" to 0.034047,
        ".XX/XX." to 0.034023,
        "XXXXX" to 0.032620,
        "X/X/X/X/X" to 0.031194,
        "X./XX/.X" to 0.030219,
        "XX./.XX" to 0.029743,
        ".X/XX/X." to 0.026890,
        "XXX/XXX" to 0.025464,
        "XXX/..X/..X" to 0.025464,
        ".X/XX/.X" to 0.024037,
        "X../X../XXX" to 0.023562,
        ".X/.X/XX" to 0.023562,
        ".X./XXX" to 0.023562,
        "XX/XX/XX" to 0.022135,
        "XXX/..X" to 0.022135,
        "XX/X./X." to 0.021660,
        "XXX/.X." to 0.020709,
        "..X/..X/XXX" to 0.018331,
        "X./XX/X." to 0.018331,
        "XXX/X../X.." to 0.017380,
        "X/X" to 0.012625,
        "X./XX" to 0.009296,
        "XX" to 0.008821,
        "XXX" to 0.008345,
        "X/X/X" to 0.007394,
        "XX/.X/.X" to 0.006919,
        "X" to 0.006443,
        "XX/.X" to 0.006443,
        "X./.X" to 0.006443,
        "XX/X." to 0.005968,
        "X./X./XX" to 0.005492,
        "..X/XXX" to 0.005017,
        ".X/XX" to 0.004541,
        "XXX/X.." to 0.004066,
        "..X/.X./X.." to 0.003590,
        "X../.X./..X" to 0.003115,
        ".X/X." to 0.002164,
    )
}
