package com.blockbot.core

/**
 * @param comboStreak 연속으로 줄을 지운 횟수 (0 = 콤보 없음)
 * @param movesSinceClear 마지막 클리어 이후 줄을 못 지운 배치 수 (streak이 0이면 항상 0으로 정규화)
 */
data class GameState(
    val board: Board,
    val comboStreak: Int = 0,
    val movesSinceClear: Int = 0,
)

/**
 * 게임 규칙 중 확인되지 않은 부분은 설정으로 둔다.
 * @param comboGrace 줄을 못 지운 배치를 몇 번까지 허용해도 콤보가 유지되는지.
 *   0 = 클리어 못 하면 즉시 끊김. 기본 2 = "3수 안에 다시 지우면 유지" (임시값, 실제 게임으로 확인 필요).
 */
data class RuleConfig(val comboGrace: Int = 2)

data class PlacementResult(
    val state: GameState,
    val clearedRows: Int, // 비트마스크 (bit r = r행 지움)
    val clearedCols: Int, // 비트마스크 (bit c = c열 지움)
    val lines: Int,
    val perfectClear: Boolean,
)

class Rules(val config: RuleConfig = RuleConfig()) {

    fun canPlace(board: Board, mask: Long): Boolean = (board.bits and mask) == 0L

    /** mask는 이미 보드 안 위치로 옮겨진 블록 마스크. 겹치지 않는다고 가정(호출자가 canPlace 확인). */
    fun apply(state: GameState, mask: Long): PlacementResult {
        val b = state.board.bits or mask
        var rowsMask = 0
        var colsMask = 0
        var clear = 0L
        for (i in 0 until 8) {
            if ((b and Bits.ROW[i]) == Bits.ROW[i]) { rowsMask = rowsMask or (1 shl i); clear = clear or Bits.ROW[i] }
            if ((b and Bits.COL[i]) == Bits.COL[i]) { colsMask = colsMask or (1 shl i); clear = clear or Bits.COL[i] }
        }
        val lines = Integer.bitCount(rowsMask) + Integer.bitCount(colsMask)
        val after = b and clear.inv()

        var streak = state.comboStreak
        var since = state.movesSinceClear
        if (lines > 0) {
            streak += 1
            since = 0
        } else if (streak > 0) {
            since += 1
            if (since > config.comboGrace) { streak = 0; since = 0 }
        }
        return PlacementResult(
            state = GameState(Board(after), streak, since),
            clearedRows = rowsMask,
            clearedCols = colsMask,
            lines = lines,
            perfectClear = lines > 0 && after == 0L,
        )
    }
}
