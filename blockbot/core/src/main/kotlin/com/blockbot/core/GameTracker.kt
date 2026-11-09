package com.blockbot.core

data class Transition(val slot: Int, val piece: Piece, val row: Int, val col: Int, val result: PlacementResult)

sealed class TrackEvent {
    /** 아직 믿을 수 없는 프레임 (애니메이션, 드래그 중, 한 번만 보임 등). */
    data class Unstable(val reason: String) : TrackEvent()
    /** 확정 상태와 같음. */
    object Unchanged : TrackEvent()
    /** 블록 배치를 설명해냄 → 콤보 등 상태 갱신. */
    data class Placed(val transitions: List<Transition>, val newRound: Boolean) : TrackEvent()
    /** 설명이 안 돼서 화면 기준으로 다시 맞춤 (첫 화면, 새 게임, 인식 오류 등). */
    data class Resync(val reason: String) : TrackEvent()
}

/**
 * 화면에서 읽은 보드·트레이를 확정 상태와 비교해 "무슨 블록을 어디에 놓았는지"를 역추적한다.
 * 화면에는 콤보 수가 항상 보이지 않으므로 이 추적으로 GameState(콤보 포함)를 유지한다.
 * 힌트 모드에서 사람이 직접 둬도, 자동 모드에서 봇이 둬도 같은 방식으로 동작한다.
 */
class GameTracker(val rules: Rules, private val stableFrames: Int = 2, private val resyncAfter: Int = 4) {
    var state: GameState? = null
        private set
    var tray: List<Piece?> = listOf(null, null, null)
        private set

    private var pendingKey: Pair<Long, List<Piece?>>? = null
    private var pendingCount = 0
    private var unexplained = 0

    fun reset() {
        state = null; tray = listOf(null, null, null); pendingKey = null; pendingCount = 0; unexplained = 0
    }

    fun observe(v: VisionResult): TrackEvent {
        if (!v.clean) { pendingKey = null; return TrackEvent.Unstable("인식 불확실: ${v.issues.joinToString()} 애매한 칸 ${v.uncertainCells}") }
        val key = v.board.bits to v.trayPieces
        if (key != pendingKey) { pendingKey = key; pendingCount = 1 } else pendingCount++
        if (pendingCount < stableFrames) return TrackEvent.Unstable("안정화 대기")

        val cur = state
        if (cur == null) return commitResync(v, "시작")
        if (v.board == cur.board && v.trayPieces == tray) { unexplained = 0; return TrackEvent.Unchanged }

        val prevSlots = tray.indices.filter { tray[it] != null }
        val newTray = v.trayPieces
        // 보드 그대로 + 트레이에서 블록이 빠지기만 함 = 손가락으로 집고 있는 중
        if (v.board == cur.board && newTray.indices.all { newTray[it] == null || newTray[it] == tray[it] }) {
            return TrackEvent.Unstable("드래그 중")
        }

        val refill = newTray.all { it != null } && newTray != tray
        val path = explain(cur, v.board, prevSlots, newTray, refill)
        if (path != null) {
            var s = path.last().result.state
            val roundEnded = refill && path.size == prevSlots.size
            if (roundEnded) s = rules.endRound(s)
            state = s
            tray = newTray
            unexplained = 0
            return TrackEvent.Placed(path, roundEnded)
        }
        // 새 게임: 빈 보드 + 트레이 3개
        if (v.board.isEmpty && refill && !cur.board.isEmpty) return commitResync(v, "새 게임", resetCombo = true)
        unexplained++
        if (unexplained >= resyncAfter) return commitResync(v, "배치를 설명할 수 없어 화면 기준으로 재동기화", resetCombo = true)
        return TrackEvent.Unstable("배치 설명 불가 ($unexplained/$resyncAfter)")
    }

    private fun commitResync(v: VisionResult, reason: String, resetCombo: Boolean = false): TrackEvent {
        val old = state
        state = if (old == null || resetCombo) GameState(v.board) else old.copy(board = v.board)
        tray = v.trayPieces
        unexplained = 0
        return TrackEvent.Resync(reason)
    }

    /** 이전 트레이 블록 1~3개를 순서대로 놓아 target 보드가 되는 경로를 찾는다. */
    private fun explain(start: GameState, target: Board, prevSlots: List<Int>, newTray: List<Piece?>, refill: Boolean): List<Transition>? {
        // 리필이 아니면: 사라진 슬롯만 놓인 것. 리필이면: 남아 있던 블록 전부가 놓인 것.
        val placedSlots = if (refill) prevSlots else prevSlots.filter { newTray[it] == null }
        if (placedSlots.isEmpty()) return null
        var found: List<Transition>? = null
        fun dfs(s: GameState, remaining: List<Int>, acc: List<Transition>) {
            if (found != null) return
            if (remaining.isEmpty()) { if (s.board == target) found = acc; return }
            for (slot in remaining) {
                val p = tray[slot]!!
                for (i in p.masks.indices) {
                    if (!rules.canPlace(s.board, p.masks[i])) continue
                    val r = rules.apply(s, p.masks[i])
                    dfs(r.state, remaining - slot, acc + Transition(slot, p, p.rows[i], p.cols[i], r))
                    if (found != null) return
                }
            }
        }
        dfs(start, placedSlots, emptyList())
        return found
    }
}
