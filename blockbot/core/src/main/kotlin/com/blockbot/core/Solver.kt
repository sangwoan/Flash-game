package com.blockbot.core

import kotlin.random.Random

/** row/col = 블록 바운딩 박스 좌상단이 놓이는 보드 칸. slot = 트레이 위치(0..2). */
data class Step(
    val slot: Int,
    val piece: Piece,
    val row: Int,
    val col: Int,
    val linesCleared: Int,
    val perfectClear: Boolean,
)

data class Plan(
    val steps: List<Step>,
    val finalState: GameState,
    val totalPieces: Int,
    val perfectClear: Boolean,  // 수열 중 한 번이라도 보드가 완전히 비었는가
    val pathScore: Double,      // 이번 수열로 얻는 게임 점수 (ScoreModel)
    val leafScore: Double,      // 최종 상태 평가 (휴리스틱)
    val outlook: Outlook? = null, // 다음 라운드 수읽기 결과 (있으면 leafScore 대신 사용)
) {
    val placedCount: Int get() = steps.size
    val survives: Boolean get() = placedCount == totalPieces
    val score: Double get() = pathScore + (outlook?.value ?: leafScore)

    fun describe(): String = buildString {
        append("perfect=$perfectClear survives=$survives placed=$placedCount/$totalPieces ")
        append("score=%.2f (path=%.2f leaf=%.2f)".format(score, pathScore, leafScore))
        outlook?.let { append(" 다음라운드: 기대값 %.1f, 사망률 %.0f%% (%d샘플)".format(it.value, it.deathRate * 100, it.samples)) }
        steps.forEachIndexed { i, s ->
            append("\n  ${i + 1}) slot ${s.slot} [${s.piece.pattern()}] → (r=${s.row}, c=${s.col})")
            if (s.linesCleared > 0) append("  ${s.linesCleared}줄 클리어")
            if (s.perfectClear) append("  ★퍼펙트")
        }
    }
}

/** 다음 라운드 수읽기 결과. value = 다음 라운드 최선 수의 평균 가치(죽으면 큰 감점). */
data class Outlook(val value: Double, val deathRate: Double, val samples: Int)

/**
 * 다음 라운드 수읽기(샘플링 expectimax) 설정.
 * 이번 라운드 후보 중 상위 [candidates]개에 대해, 다음 트레이 [samples]개를 분포에서 뽑아
 * 각각 최선으로 뒀을 때의 가치를 평균낸다. 모든 후보에 같은 샘플을 써서 비교 잡음을 줄인다.
 * 시간이 [timeBudgetMs]를 넘으면 [minSamples] 이상 모인 시점에서 멈춘다 (폰 응답성).
 */
data class LookaheadConfig(
    // 기본값은 시뮬레이션(60판×여러 시드)으로 정함: 생존 라운드 15→25~28, 평균 점수 약 3배
    val candidates: Int = 20,
    val samples: Int = 24,
    val minSamples: Int = 4,
    val timeBudgetMs: Long = 1500,
    val beamWidth: Int = 60,          // 다음 라운드 탐색은 근사(빔): 단계마다 상위 N 상태만 유지
    val finalEvalWidth: Int = 16,     // 마지막 단계에서 정밀 평가할 상태 수
    val deathPenalty: Double = 500.0, // 다음 라운드에 3개를 다 못 놓으면(게임 오버) 감점
    val deathPenaltyPerCombo: Double = 60.0, // 콤보가 클수록 죽으면 잃는 게 큼
    val seed: Long = 0x5EEDL,
)

data class SolveResult(
    val best: Plan,
    val top: List<Plan>,
    val statesExplored: Int,
    val leavesEvaluated: Int,
    val elapsedMs: Long,
)

/**
 * 남은 트레이 블록의 모든 순서 × 모든 위치를 전수 탐색.
 *
 * 깊이(놓은 블록 수)별로 상태를 펼치며, 같은 (보드, 남은 블록, 콤보 상태, 퍼펙트 여부)에
 * 도달한 경로는 배치 점수가 가장 높은 것 하나만 남긴다. 최종 평가는 상태에만 의존하므로
 * 이 중복 제거는 결과를 바꾸지 않는다(테스트에서 단순 전수 탐색과 대조).
 *
 * 순위(사전식): 퍼펙트 클리어 > 놓은 블록 수(생존) > 점수.
 * 점수 = 경로의 실제 게임 점수([ScoreModel]) + 최종 상태 평가([Evaluator]: 생존성·콤보 이어가기).
 */
class Solver(
    val rules: Rules = Rules(),
    val weights: Weights = Weights(),
    val scoreModel: ScoreModel = ScoreModel(),
    val evaluator: Evaluator = HeuristicEvaluator(weights),
    val pathScorer: PathScorer = PathScorer.of(scoreModel),
    val topK: Int = 5,
    val lookahead: LookaheadConfig? = null,
    val distribution: PieceDistribution = PieceDistribution.DEFAULT,
) {
    private class Node(
        val state: GameState,
        val remaining: Int,
        val perfect: Boolean,
        val pathScore: Double,
        val parent: Node?,
        val step: Step?,
    )

    private data class Key(val bits: Long, val meta: Long)

    private fun keyOf(n: Node): Key {
        val s = n.state
        val meta = n.remaining.toLong() or
            ((if (n.perfect) 1L else 0L) shl 8) or
            (s.comboStreak.toLong() shl 9) or
            (s.movesSinceClear.toLong() shl 40) or
            ((if (s.clearedThisRound) 1L else 0L) shl 50)
        return Key(s.board.bits, meta)
    }

    fun solve(state: GameState, tray: List<Piece?>): SolveResult {
        require(tray.size <= 8) { "트레이 슬롯은 최대 8개" }
        val t0 = System.nanoTime()
        var remaining0 = 0
        tray.forEachIndexed { i, p -> if (p != null) remaining0 = remaining0 or (1 shl i) }
        val total = Integer.bitCount(remaining0)

        val root = Node(state, remaining0, false, 0.0, null, null)
        var layer: Map<Key, Node> = linkedMapOf(keyOf(root) to root)
        val terminals = ArrayList<Node>()
        var explored = 1

        while (layer.isNotEmpty()) {
            val next = LinkedHashMap<Key, Node>()
            for (node in layer.values) {
                if (node.remaining == 0) { terminals += node; continue }
                var expanded = false
                val seenShapes = HashSet<Piece>()
                for (slot in tray.indices) {
                    if ((node.remaining and (1 shl slot)) == 0) continue
                    val piece = tray[slot]!!
                    if (!seenShapes.add(piece)) continue // 같은 모양 슬롯은 한 번만
                    val bits = node.state.board.bits
                    for (i in piece.masks.indices) {
                        val mask = piece.masks[i]
                        if ((bits and mask) != 0L) continue
                        expanded = true
                        val res = rules.apply(node.state, mask)
                        val child = Node(
                            state = res.state,
                            remaining = node.remaining and (1 shl slot).inv(),
                            perfect = node.perfect || res.perfectClear,
                            pathScore = node.pathScore + pathScorer.score(res),
                            parent = node,
                            step = Step(slot, piece, piece.rows[i], piece.cols[i], res.lines, res.perfectClear),
                        )
                        explored++
                        val key = keyOf(child)
                        val existing = next[key]
                        if (existing == null || child.pathScore > existing.pathScore) next[key] = child
                    }
                }
                if (!expanded) terminals += node // 남은 블록을 더 놓을 수 없음
            }
            layer = next
        }

        // 3개를 다 놓은 경로는 라운드 종료 처리(PER_ROUND 콤보 판정) 후 평가
        val finalStates = terminals.associateWith { if (it.remaining == 0) rules.endRound(it.state) else it.state }
        val scored = terminals.map { it to evaluator.score(finalStates.getValue(it)) }
        val ranked = scored.sortedWith(
            compareByDescending<Pair<Node, Double>> { it.first.perfect }
                .thenByDescending { Integer.bitCount(remaining0) - Integer.bitCount(it.first.remaining) }
                .thenByDescending { it.first.pathScore + it.second }
        )
        // ── 다음 라운드 수읽기: 같은 등급(퍼펙트 여부, 3개 다 놓음) 상위 후보만 재평가 ──
        var order: List<Pair<Node, Double>> = ranked
        var outlooks: Map<Node, Outlook> = emptyMap()
        val la = lookahead
        val head = ranked.firstOrNull()?.first
        if (la != null && head != null && head.remaining == 0 && total > 0) {
            val pool = ranked.filter { it.first.remaining == 0 && it.first.perfect == head.perfect }.take(la.candidates)
            if (pool.size > 1) {
                val res = outlook(pool.map { finalStates.getValue(it.first) }, la, t0)
                outlooks = pool.map { it.first }.zip(res).toMap()
                val poolSet = pool.map { it.first }.toSet()
                order = pool.sortedByDescending { it.first.pathScore + outlooks.getValue(it.first).value } +
                    ranked.filter { it.first !in poolSet }
            }
        }
        val plans = order.take(maxOf(1, topK)).map { (n, leaf) -> toPlan(n, finalStates.getValue(n), leaf, total, outlooks[n]) }
        return SolveResult(
            best = plans.first(),
            top = plans,
            statesExplored = explored,
            leavesEvaluated = scored.size,
            elapsedMs = (System.nanoTime() - t0) / 1_000_000,
        )
    }

    private fun toPlan(n: Node, finalState: GameState, leaf: Double, total: Int, outlook: Outlook?): Plan {
        val steps = ArrayList<Step>()
        var cur: Node? = n
        while (cur?.step != null) { steps += cur.step!!; cur = cur.parent }
        steps.reverse()
        return Plan(steps, finalState, total, n.perfect, n.pathScore, leaf, outlook)
    }

    /**
     * 각 상태(라운드 종료 직후)에서 다음 라운드를 [cfg.samples]번 가정해 본 평균 가치.
     * 모든 상태에 같은 트레이 샘플을 쓴다(공통 난수).
     */
    fun outlook(states: List<GameState>, cfg: LookaheadConfig = lookahead ?: LookaheadConfig(), startNanos: Long = System.nanoTime()): List<Outlook> {
        val rng = Random(cfg.seed xor states.first().board.bits)
        val trays = List(cfg.samples) { distribution.sampleTray(rng) }
        val sum = DoubleArray(states.size)
        val deaths = IntArray(states.size)
        var used = 0
        for (tray in trays) {
            for (i in states.indices) {
                val v = bestRoundValue(states[i], tray, cfg)
                if (v == null) {
                    deaths[i]++
                    sum[i] -= cfg.deathPenalty + cfg.deathPenaltyPerCombo * states[i].comboStreak
                } else sum[i] += v
            }
            used++
            if (used >= cfg.minSamples && (System.nanoTime() - startNanos) / 1_000_000 > cfg.timeBudgetMs) break
        }
        return List(states.size) { Outlook(sum[it] / used, deaths[it].toDouble() / used, used) }
    }

    private class BeamNode(val state: GameState, val remaining: Int, val path: Double)

    /**
     * 한 라운드(트레이 전부)를 빔 탐색으로 근사해 최선 가치(경로 점수 + 최종 평가)를 구한다.
     * 3개를 모두 놓을 방법이 없으면 null (= 게임 오버).
     */
    fun bestRoundValue(start: GameState, tray: List<Piece>, cfg: LookaheadConfig = lookahead ?: LookaheadConfig()): Double? {
        var layer = listOf(BeamNode(start, (1 shl tray.size) - 1, 0.0))
        for (depth in 1..tray.size) {
            val next = HashMap<Key, BeamNode>()
            for (node in layer) {
                val seen = HashSet<Piece>()
                for (slot in tray.indices) {
                    if ((node.remaining and (1 shl slot)) == 0) continue
                    val piece = tray[slot]
                    if (!seen.add(piece)) continue
                    val bits = node.state.board.bits
                    for (m in piece.masks) {
                        if ((bits and m) != 0L) continue
                        val res = rules.apply(node.state, m)
                        val child = BeamNode(res.state, node.remaining and (1 shl slot).inv(), node.path + pathScorer.score(res))
                        val s = res.state
                        val key = Key(s.board.bits, child.remaining.toLong() or (s.comboStreak.toLong() shl 9) or
                            (s.movesSinceClear.toLong() shl 40) or ((if (s.clearedThisRound) 1L else 0L) shl 50))
                        val ex = next[key]
                        if (ex == null || child.path > ex.path) next[key] = child
                    }
                }
            }
            if (next.isEmpty()) return null
            val width = if (depth < tray.size) cfg.beamWidth else cfg.finalEvalWidth
            layer = next.values.sortedByDescending { it.path + Features.cheapScore(it.state.board.bits, weights) }.take(width)
        }
        return layer.maxOf { it.path + evaluator.score(rules.endRound(it.state)) }
    }
}
