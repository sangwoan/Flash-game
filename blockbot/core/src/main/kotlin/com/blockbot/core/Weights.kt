package com.blockbot.core

/**
 * "이 모양 블록이 다음에 나오면 들어갈 자리가 있는가" 검사용.
 * @param missPenalty 들어갈 자리가 하나도 없을 때 더해지는 점수 (음수)
 */
data class Probe(val label: String, val pattern: String, val missPenalty: Double) {
    val piece: Piece = Piece.parse(pattern, label)
}

/**
 * 탐색 끝 상태(라운드 종료)의 평가 가중치. 배치마다 얻는 점수는 [ScoreModel]이 담당.
 * 단위는 게임 점수와 같은 스케일로 맞춘다. 앱에서는 JSON 설정에서 읽어 튜닝.
 */
data class Weights(
    // ── 보드 모양 (생존) ──
    val filledCell: Double = -0.3,      // 남은 채워진 칸 1개당 (적을수록 퍼펙트에 가까움)
    val isolatedHole: Double = -8.0,    // 사방이 막힌 빈칸 1개당
    val smallRegion: Double = -2.3,     // 크기 2..smallRegionMaxSize인 고립 빈 영역 1개당
    val smallRegionMaxSize: Int = 4,
    val roughness: Double = -0.5,       // 인접 칸 사이 채움/빈칸 경계 1개당 (울퉁불퉁함)
    val probes: List<Probe> = DEFAULT_PROBES,

    // ── 콤보 이어가기 (고득점) ──
    val comboAlive: Double = 6.0,       // 다음 라운드로 가져가는 콤보 1당 가치
    val comboRisk: Double = 3.0,        // 콤보 1당, 이미 못 지운 배치 수만큼 가치 감소 (SLIDING)
    val nearLine: Double = 1.0,         // 6~7칸 찬 줄(다음 클리어 재료) 1개당
    // 콤보가 클수록 죽으면 잃을 미래 점수가 크다 → 보드 모양 항목에 (1 + healthPerStreak × 콤보)를 곱함.
    // 이게 없으면 높은 콤보에서 당장 점수가 생존 판단을 압도해 일찍 죽는다(시뮬레이션으로 확인).
    val healthPerStreak: Double = 0.1,
    // ── 여유 공간 (생존) ── 큰 블록이 들어갈 자리가 "몇 군데" 있는지. 한 군데뿐인 보드는 다음 블록 하나에 막힌다.
    val room3x3: Double = 0.0,          // 3×3이 들어갈 위치 1곳당 (최대 roomCap곳)
    val roomLine5: Double = 0.0,        // 1×5·5×1이 들어갈 위치 1곳당 (최대 roomCap곳)
    val roomCap: Int = 6,
    // 사망 분석(시뮬레이션 40판): 33판이 "3×3을 놓을 자리가 없어서" 끝남. 보드는 평균 44%만 차 있었음(빈칸이 흩어짐).
    // 한 라운드에 3×3이 두 개 나올 수도 있으므로, 서로 안 겹치는 3×3 자리 2곳이 없으면 감점.
    val pair3x3: Double = -40.0,
) {
    /** "키 값" 줄 형식 (튜너가 저장, 앱이 로드). */
    fun toText(): String = buildString {
        appendLine("# BlockBot 평가 가중치 (Tuner 생성)")
        appendLine("filledCell $filledCell")
        appendLine("isolatedHole $isolatedHole")
        appendLine("smallRegion $smallRegion")
        appendLine("smallRegionMaxSize $smallRegionMaxSize")
        appendLine("roughness $roughness")
        for (p in probes) appendLine("probe ${p.label} ${p.pattern} ${p.missPenalty}")
        appendLine("comboAlive $comboAlive")
        appendLine("comboRisk $comboRisk")
        appendLine("nearLine $nearLine")
        appendLine("healthPerStreak $healthPerStreak")
        appendLine("room3x3 $room3x3")
        appendLine("roomLine5 $roomLine5")
        appendLine("roomCap $roomCap")
        appendLine("pair3x3 $pair3x3")
    }

    companion object {
        fun fromText(text: String, base: Weights = Weights()): Weights {
            var w = base
            val probes = ArrayList<Probe>()
            for (raw in text.lines()) {
                val line = raw.trim()
                if (line.isEmpty() || line.startsWith("#")) continue
                val p = line.split(Regex("\\s+"))
                fun d() = p[1].toDouble()
                w = when (p[0]) {
                    "filledCell" -> w.copy(filledCell = d())
                    "isolatedHole" -> w.copy(isolatedHole = d())
                    "smallRegion" -> w.copy(smallRegion = d())
                    "smallRegionMaxSize" -> w.copy(smallRegionMaxSize = p[1].toInt())
                    "roughness" -> w.copy(roughness = d())
                    "comboAlive" -> w.copy(comboAlive = d())
                    "comboRisk" -> w.copy(comboRisk = d())
                    "nearLine" -> w.copy(nearLine = d())
                    "healthPerStreak" -> w.copy(healthPerStreak = d())
                    "room3x3" -> w.copy(room3x3 = d())
                    "roomLine5" -> w.copy(roomLine5 = d())
                    "roomCap" -> w.copy(roomCap = p[1].toInt())
                    "pair3x3" -> w.copy(pair3x3 = d())
                    "probe" -> { probes += Probe(p[1], p[2], p[3].toDouble()); w }
                    else -> w
                }
            }
            return if (probes.isNotEmpty()) w.copy(probes = probes) else w
        }

        val DEFAULT_PROBES = listOf(
            // 개선 루프 결과(시뮬레이션, 새 판 80개 검증): 3×3 자리 확보를 크게 중시 → 생존 32.6→41라운드, 평균 점수 +40%
            Probe("3x3", "XXX/XXX/XXX", -80.0),
            Probe("1x5", "XXXXX", 0.0),
            Probe("5x1", "X/X/X/X/X", 0.0),
            Probe("2x2", "XX/XX", -3.7),
        )
    }
}
