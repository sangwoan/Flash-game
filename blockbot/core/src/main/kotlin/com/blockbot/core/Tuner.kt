package com.blockbot.core

import java.io.File
import kotlin.math.ln
import kotlin.random.Random

/**
 * 평가 가중치 자동 튜닝: 블록 분포로 자기 자신과 대국(시뮬레이션)하며 (1+λ) 진화 전략으로 가중치를 고른다.
 * 목표 = 판별 log(1+점수)의 평균 (오래 살아남고 콤보를 길게 끄는 쪽이 커진다).
 * 세대마다 새 판(시드)으로 부모와 자식을 같은 조건에서 비교하고, 최고 자식은 또 다른 새 판에서 한 번 더 이겨야 채택
 * → 운에 과적합(승자의 저주) 방지. 마지막에 수읽기를 켠 검증에서 기존보다 나을 때만 저장.
 */
object Tuner {
    class Param(val name: String, val lo: Double, val hi: Double, val get: (Weights) -> Double, val set: (Weights, Double) -> Weights)

    private fun probe(label: String, lo: Double) = Param("probe:$label", lo, 0.0,
        { w -> w.probes.firstOrNull { it.label == label }?.missPenalty ?: 0.0 },
        { w, v -> w.copy(probes = w.probes.map { if (it.label == label) it.copy(missPenalty = v) else it }) })

    val PARAMS = listOf(
        Param("filledCell", -3.0, 0.0, { it.filledCell }, { w, v -> w.copy(filledCell = v) }),
        Param("isolatedHole", -30.0, 0.0, { it.isolatedHole }, { w, v -> w.copy(isolatedHole = v) }),
        Param("smallRegion", -20.0, 0.0, { it.smallRegion }, { w, v -> w.copy(smallRegion = v) }),
        Param("roughness", -3.0, 0.0, { it.roughness }, { w, v -> w.copy(roughness = v) }),
        probe("3x3", -50.0), probe("1x5", -30.0), probe("5x1", -30.0), probe("2x2", -20.0),
        Param("comboAlive", 0.0, 30.0, { it.comboAlive }, { w, v -> w.copy(comboAlive = v) }),
        Param("comboRisk", 0.0, 20.0, { it.comboRisk }, { w, v -> w.copy(comboRisk = v) }),
        Param("nearLine", -5.0, 10.0, { it.nearLine }, { w, v -> w.copy(nearLine = v) }),
        Param("healthPerStreak", 0.0, 0.5, { it.healthPerStreak }, { w, v -> w.copy(healthPerStreak = v) }),
    )

    fun fitness(w: Weights, dist: PieceDistribution, rules: Rules, seeds: List<Long>, maxRounds: Int): Double {
        val sim = Simulator(Solver(rules = rules, weights = w), ScoreModel(), dist)
        return seeds.parallelStream().mapToDouble { s -> ln(1.0 + sim.play(Random(s), maxRounds).score) }.average().orElse(0.0)
    }

    fun tune(
        start: Weights, dist: PieceDistribution, rules: Rules,
        generations: Int, lambda: Int, games: Int, maxRounds: Int, timeLimitMs: Long, seed: Long = 7,
        log: (String) -> Unit = ::println,
    ): Weights {
        val rng = Random(seed)
        val t0 = System.currentTimeMillis()
        var parent = start
        var sigma = 0.25
        for (g in 1..generations) {
            if (System.currentTimeMillis() - t0 > timeLimitMs) { log("시간 한도 도달 — ${g - 1}세대에서 종료"); break }
            val seeds = List(games) { rng.nextLong() }
            val fParent = fitness(parent, dist, rules, seeds, maxRounds)
            var best = parent
            var fBest = fParent
            repeat(lambda) {
                var child = parent
                for (p in PARAMS) if (rng.nextDouble() < 0.5) {
                    val v = p.get(child) + rng.nextGaussian() * sigma * (p.hi - p.lo)
                    child = p.set(child, v.coerceIn(p.lo, p.hi))
                }
                val f = fitness(child, dist, rules, seeds, maxRounds)
                if (f > fBest) { best = child; fBest = f }
            }
            // 승자의 저주 방지: 6개 중 최고는 운이 좋았을 수 있으므로, 새 판들에서 다시 부모를 이겨야 채택
            var improved = false
            if (best !== parent) {
                val fresh = List(games) { rng.nextLong() }
                val fp = fitness(parent, dist, rules, fresh, maxRounds)
                val fc = fitness(best, dist, rules, fresh, maxRounds)
                improved = fc > fp
                if (improved) fBest = fc
            }
            if (improved) parent = best
            sigma = maxOf(0.05, sigma * if (improved) 1.0 else 0.85)
            log("세대 %2d: 부모 %.3f, 후보 재검증 %.3f %s (σ=%.2f, %ds)".format(g, fParent, fBest, if (improved) "✔ 채택" else "", sigma, (System.currentTimeMillis() - t0) / 1000))
        }
        return parent
    }

    private fun Random.nextGaussian(): Double {
        var u: Double; var v: Double; var s: Double
        do { u = nextDouble() * 2 - 1; v = nextDouble() * 2 - 1; s = u * u + v * v } while (s >= 1 || s == 0.0)
        return u * kotlin.math.sqrt(-2 * ln(s) / s)
    }
}

/**
 * 사용: ./gradlew :core:tune -PtuneArgs="분포파일|- 출력폴더 분 [세대] [판수]"
 *   분포파일이 "-"면 기본 분포. 결과: 출력폴더/weights.txt + 검증(수읽기 켠 상태로 기본 가중치와 비교)
 */
fun main(args: Array<String>) {
    val dist = args.getOrNull(0)?.takeIf { it != "-" }?.let { PieceDistribution.fromText(File(it).readText()) } ?: PieceDistribution.DEFAULT
    val out = File(args.getOrNull(1) ?: "model-out").apply { mkdirs() }
    val minutes = args.getOrNull(2)?.toDouble() ?: 15.0
    val generations = args.getOrNull(3)?.toInt() ?: 40
    val games = args.getOrNull(4)?.toInt() ?: 32
    val rules = Rules()
    println("튜닝: 분포 friendly=%.2f, 최대 %.0f분, %d세대 × 자식 6 × %d판".format(dist.friendly, minutes, generations, games))
    val start = File(out, "weights.txt").takeIf { it.exists() }?.let { Weights.fromText(it.readText()) } ?: Weights()
    val tuned = Tuner.tune(start, dist, rules, generations, lambda = 6, games = games, maxRounds = 150, timeLimitMs = (minutes * 60_000).toLong())

    // 검증: 수읽기를 켠 실제 앱 설정으로, 처음 보는 판들에서 기존 가중치와 비교
    println("검증 중 (수읽기 켬, 새 판 40개)…")
    val seeds = List(40) { 900_000L + it }
    fun eval(w: Weights): Pair<Double, Double> {
        val sim = Simulator(Solver(rules = rules, weights = w, lookahead = LookaheadConfig(samples = 12, timeBudgetMs = 600_000), distribution = dist), ScoreModel(), dist)
        val stats = seeds.parallelStream().map { sim.play(Random(it), 150) }.toList()
        return stats.map { it.score }.average() to stats.map { it.rounds.toDouble() }.average()
    }
    val (s0, r0) = eval(start)
    val (s1, r1) = eval(tuned)
    println("  기존: 평균 %.0f점, %.1f라운드\n  튜닝: 평균 %.0f점, %.1f라운드".format(s0, r0, s1, r1))
    if (s1 >= s0) {
        File(out, "weights.txt").writeText(tuned.toText())
        println("저장: ${File(out, "weights.txt").absolutePath}")
    } else println("튜닝 결과가 기존보다 낫지 않아 저장하지 않음")
}
