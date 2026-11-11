package com.blockbot.core

/**
 * @param comboStreak 연속 클리어 횟수 (게임 화면의 "Combo N"). 0 = 콤보 없음
 * @param movesSinceClear SLIDING 모드: 마지막 클리어 이후 못 지운 배치 수 (streak 0이면 0)
 * @param clearedThisRound PER_ROUND 모드: 이번 라운드(블록 3개)에 한 줄이라도 지웠는가
 */
data class GameState(
    val board: Board,
    val comboStreak: Int = 0,
    val movesSinceClear: Int = 0,
    val clearedThisRound: Boolean = false,
)

/**
 * 콤보 유지 방식. 공식 규칙이 공개돼 있지 않아 둘 다 지원하고 실제 게임으로 확인한다.
 * - SLIDING: 못 지운 배치가 comboGrace번을 넘으면 끊김 (grace 2 = "3수 안에 다시 지우면 유지")
 * - PER_ROUND: 라운드(블록 3개) 안에 한 번도 못 지우면 라운드 끝에 끊김
 */
enum class ComboMode { SLIDING, PER_ROUND }

data class RuleConfig(
    // 사용자 실기기 확인(2026-11): 라운드마다 한 줄 이상 지우면 콤보 유지, 콤보는 지운 줄 수만큼 오름
    val comboMode: ComboMode = ComboMode.PER_ROUND,
    val comboGrace: Int = 2,
    /** true: 콤보가 지운 줄 수만큼 오름 (3줄 동시 = +3). false: 줄을 지운 배치마다 +1 (이전 가정). */
    val streakPerLine: Boolean = true,
)

data class PlacementResult(
    val state: GameState,
    val cellsPlaced: Int,
    val prevStreak: Int,  // 이 배치 전 콤보 수
    val clearedBefore: Boolean = false, // 이번 라운드에 이 배치 전에 이미 줄을 지웠는가
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
            streak += if (config.streakPerLine) lines else 1
            since = 0
        } else if (config.comboMode == ComboMode.SLIDING && streak > 0) {
            since += 1
            if (since > config.comboGrace) { streak = 0; since = 0 }
        }
        return PlacementResult(
            state = GameState(Board(after), streak, since, state.clearedThisRound || lines > 0),
            cellsPlaced = Bits.popcount(mask),
            prevStreak = state.comboStreak,
            clearedBefore = state.clearedThisRound,
            clearedRows = rowsMask,
            clearedCols = colsMask,
            lines = lines,
            perfectClear = lines > 0 && after == 0L,
        )
    }

    /** 트레이 3개를 모두 놓아 라운드가 끝났을 때. */
    fun endRound(state: GameState): GameState {
        val streak = if (config.comboMode == ComboMode.PER_ROUND && !state.clearedThisRound) 0 else state.comboStreak
        return state.copy(comboStreak = streak, movesSinceClear = if (streak == 0) 0 else state.movesSinceClear, clearedThisRound = false)
    }
}
