package com.blockbot.core

import java.io.File
import kotlin.random.Random

/** 실제 게임 한 라운드의 시작: 블록 3개가 새로 나왔을 때의 보드와 트레이. */
data class RoundRecord(val bits: Long, val tray: List<Piece>)

/**
 * 폰 로그(JSONL)에서 실제 게임의 블록 출현 패턴을 학습한다.
 *  - 블록별 출현 빈도 → 확률 (관측이 적은 모양은 기존 분포 쪽으로 당김)
 *  - 관대함(friendly): 실제 트레이가 "지금 보드에 다 들어가는" 비율이 무작위 기대보다 얼마나 높은지
 *
 * 새 앱은 "round" 이벤트를 남기고, 이전 버전 로그는 "plan" 이벤트에서 라운드 시작을 복원한다.
 */
object LogLearner {
    private val typeRe = Regex("\"type\"\\s*:\\s*\"([a-z_]+)\"")
    private val bitsRe = Regex("\"bits\"\\s*:\\s*\"([0-9a-fA-F]+)\"")
    private val boardRe = Regex("\"board\"\\s*:\\s*\"([X.\\\\n]+)\"")
    private val trayRe = Regex("\"tray\"\\s*:\\s*\\[([^\\]]*)\\]")

    private fun parseTray(raw: String): List<Piece?> = raw.split(",").map { it.trim() }.map { t ->
        if (t == "null" || t.isEmpty()) null else Piece.parse(t.trim('"').replace("\\/", "/"))
    }

    /** 로그 파일 한 개의 줄들 → 라운드 시작 기록. "round" 이벤트가 있으면 그것만, 없으면(이전 버전) "plan"에서 복원. */
    fun parseRounds(lines: Sequence<String>): List<RoundRecord> {
        val all = lines.toList()
        val hasRound = all.any { typeRe.find(it)?.groupValues?.get(1) == "round" }
        val out = ArrayList<RoundRecord>()
        var lastPlanTray: List<Piece?>? = null
        for (line in all) {
            val type = typeRe.find(line)?.groupValues?.get(1) ?: continue
            val trayRaw = trayRe.find(line)?.groupValues?.get(1) ?: continue
            val tray = runCatching { parseTray(trayRaw) }.getOrNull() ?: continue
            if (hasRound && type == "round") {
                val bits = bitsRe.find(line)?.groupValues?.get(1)?.let { java.lang.Long.parseUnsignedLong(it, 16) } ?: continue
                if (tray.all { it != null }) out += RoundRecord(bits, tray.filterNotNull())
            } else if (!hasRound && type == "plan") {
                // 트레이 3개가 꽉 찬 계획이 나왔는데 직전 계획의 트레이가 비어 있었거나 달랐으면 = 새 라운드
                val boardText = boardRe.find(line)?.groupValues?.get(1)?.replace("\\n", "\n") ?: continue
                val bits = runCatching { Board.parse(boardText).bits }.getOrNull() ?: continue
                val full = tray.all { it != null }
                val prev = lastPlanTray
                if (full && (prev == null || prev.any { it == null } || prev != tray)) out += RoundRecord(bits, tray.filterNotNull())
                lastPlanTray = tray
            }
        }
        return out
    }

    data class Result(val distribution: PieceDistribution, val report: String)

    fun learn(rounds: List<RoundRecord>, prior: PieceDistribution = PieceDistribution.DEFAULT, alpha: Double = 30.0, seed: Long = 1): Result {
        val rng = Random(seed)
        val priorRandom = prior.withFriendly(0.0)
        // 관대한 게임은 안 들어가는 큰 블록을 바꿔 주므로, 빽빽한 보드의 라운드까지 세면 큰 블록 비율이 낮게 나온다.
        // 그래서 "무작위로 뽑아도 거의 다 들어가는" 여유 있는 보드의 라운드만으로 원래 출현 확률을 센다.
        fun roomy(bits: Long): Double {
            var ok = 0
            repeat(40) { if (priorRandom.sampleTray(rng).all { it.fitsAnywhere(bits) }) ok++ }
            return ok / 40.0
        }
        val roomyRounds = rounds.filter { roomy(it.bits) >= 0.9 }
        val counted = if (roomyRounds.size >= 30) roomyRounds else rounds
        val counts = HashMap<Piece, Int>()
        for (r in counted) for (p in r.tray) counts[p] = (counts[p] ?: 0) + 1
        val n = counts.values.sum()
        val keys = LinkedHashSet<Piece>().apply { addAll(prior.pieces); addAll(counts.keys) }
        val entries = keys.map { p -> p to ((counts[p] ?: 0) + alpha * prior.probabilityOf(p)) / (n + alpha) }
        val base = PieceDistribution(entries, friendly = 0.0, learnedRounds = rounds.size)

        // 관대함 추정: 실제로 "세 블록이 모두 각각 들어간" 비율 vs 같은 보드에서 무작위 트레이의 기대 비율
        val informative = rounds.filter { it.bits != 0L && it.tray.size == 3 }
        var realFit = 0.0
        var modelFit = 0.0
        for (r in informative) {
            if (r.tray.all { it.fitsAnywhere(r.bits) }) realFit++
            var ok = 0
            repeat(40) { if (base.sampleTray(rng).all { it.fitsAnywhere(r.bits) }) ok++ }
            modelFit += ok / 40.0
        }
        val friendly = if (informative.size >= 15) {
            val rf = realFit / informative.size
            val mf = modelFit / informative.size
            if (mf < 0.98) ((rf - mf) / (1 - mf)).coerceIn(0.0, 0.98) else prior.friendly
        } else prior.friendly
        val dist = base.withFriendly(friendly)

        val report = buildString {
            appendLine("라운드 ${rounds.size}개 학습 (출현 확률은 여유 있는 보드 ${counted.size}라운드·블록 ${n}개로 계산)")
            if (informative.isNotEmpty()) appendLine(
                "관대함: 실제로 3개 다 들어간 비율 %.0f%% vs 무작위 기대 %.0f%% → friendly=%.2f%s".format(
                    100 * realFit / informative.size, 100 * modelFit / informative.size, friendly,
                    if (informative.size < 15) " (라운드가 적어 기본값 유지)" else "",
                )
            )
            appendLine("많이 나온 블록 (실제 비율 / 기존 추정):")
            counts.entries.sortedByDescending { it.value }.take(15).forEach { (p, c) ->
                appendLine("  %-12s %5.1f%% / %5.1f%%".format(p.pattern(), 100.0 * c / n, 100 * prior.probabilityOf(p)))
            }
            val o3 = counts[Piece.parse("XXX/XXX/XXX")] ?: 0
            val lines = counts.filterKeys { (it.width == 1 || it.height == 1) && it.size >= 4 }.values.sum()
            appendLine("3×3 꽉 찬 블록 %.1f%%, 1×4·1×5 합계 %.1f%%".format(100.0 * o3 / maxOf(1, n), 100.0 * lines / maxOf(1, n)))
        }
        return Result(dist, report)
    }
}

/** 사용: ./gradlew :core:learn -PlearnArgs="로그폴더 출력폴더" */
fun main(args: Array<String>) {
    val logs = File(args.getOrNull(0) ?: "logs-from-phone")
    val out = File(args.getOrNull(1) ?: "model-out").apply { mkdirs() }
    val files = logs.walkTopDown().filter { it.isFile && it.name.endsWith(".jsonl") }.sortedBy { it.name }.toList()
    require(files.isNotEmpty()) { "로그 파일(.jsonl)이 없습니다: ${logs.absolutePath}" }
    val rounds = files.flatMap { f -> f.useLines { LogLearner.parseRounds(it).toList() } }
    println("로그 ${files.size}개에서 라운드 ${rounds.size}개 읽음")
    val res = LogLearner.learn(rounds)
    println(res.report)
    File(out, "distribution.txt").writeText(res.distribution.toText())
    println("저장: ${File(out, "distribution.txt").absolutePath}")
}
