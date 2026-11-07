package com.blockbot.core

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
    val leafScore: Double,      // 최종 상태 평가
) {
    val placedCount: Int get() = steps.size
    val survives: Boolean get() = placedCount == totalPieces
    val score: Double get() = pathScore + leafScore

    fun describe(): String = buildString {
        append("perfect=$perfectClear survives=$survives placed=$placedCount/$totalPieces ")
        append("score=%.2f (path=%.2f leaf=%.2f)".format(score, pathScore, leafScore))
        steps.forEachIndexed { i, s ->
            append("\n  ${i + 1}) slot ${s.slot} [${s.piece.pattern()}] → (r=${s.row}, c=${s.col})")
            if (s.linesCleared > 0) append("  ${s.linesCleared}줄 클리어")
            if (s.perfectClear) append("  ★퍼펙트")
        }
    }
}

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
        val plans = ranked.take(maxOf(1, topK)).map { (n, leaf) -> toPlan(n, finalStates.getValue(n), leaf, total) }
        return SolveResult(
            best = plans.first(),
            top = plans,
            statesExplored = explored,
            leavesEvaluated = scored.size,
            elapsedMs = (System.nanoTime() - t0) / 1_000_000,
        )
    }

    private fun toPlan(n: Node, finalState: GameState, leaf: Double, total: Int): Plan {
        val steps = ArrayList<Step>()
        var cur: Node? = n
        while (cur?.step != null) { steps += cur.step!!; cur = cur.parent }
        steps.reverse()
        return Plan(steps, finalState, total, n.perfect, n.pathScore, leaf)
    }
}
