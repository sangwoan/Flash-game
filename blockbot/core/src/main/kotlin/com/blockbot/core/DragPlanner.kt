package com.blockbot.core

import kotlin.math.roundToInt

/**
 * 드래그 보정값 (칸 단위). 게임은 끌고 있는 블록을 손가락보다 위에 그린다.
 * 모델: 화면에 보이는 블록 중심 = 손가락 + (offsetX, -(lift + 블록높이/2)) × 칸
 *   (= 블록 아랫변이 손가락보다 lift칸 위)
 * 실제 착지 위치를 보고 자동으로 학습한다.
 */
data class DragCalibration(val liftCells: Double = 1.5, val offsetXCells: Double = 0.0, val samples: Int = 0)

data class DragPath(val fromX: Float, val fromY: Float, val toX: Float, val toY: Float)

object DragPlanner {
    fun plan(
        geo: BoardGeometry, from: TrayRead, piece: Piece, row: Int, col: Int,
        cal: DragCalibration, screenW: Int, screenH: Int, extraLiftCells: Double = 0.0,
    ): DragPath {
        val targetCx = geo.x0 + (col + piece.width / 2.0) * geo.cellW
        val targetCy = geo.y0 + (row + piece.height / 2.0) * geo.cellH
        val toX = targetCx - cal.offsetXCells * geo.cellW
        val toY = targetCy + (cal.liftCells + extraLiftCells + piece.height / 2.0) * geo.cellH
        return DragPath(
            from.centerX.toFloat(), from.centerY.toFloat(),
            toX.coerceIn(1.0, screenW - 2.0).toFloat(), toY.coerceIn(1.0, screenH - 2.0).toFloat(),
        )
    }

    /** 의도한 칸 대비 실제 착지 칸 차이로 보정값 갱신. */
    fun learn(cal: DragCalibration, intendedRow: Int, intendedCol: Int, actualRow: Int, actualCol: Int, usedExtraLift: Double = 0.0): DragCalibration {
        val dr = actualRow - intendedRow
        val dc = actualCol - intendedCol
        return cal.copy(
            liftCells = cal.liftCells + usedExtraLift - dr,
            offsetXCells = cal.offsetXCells + dc,
            samples = cal.samples + 1,
        )
    }

    /** 드롭이 거부됐을 때(보드 변화 없음) 시도할 추가 lift 순서. */
    val RETRY_EXTRA_LIFT = doubleArrayOf(0.0, 1.0, -1.0, 2.0, -2.0)

    fun rowColAt(geo: BoardGeometry, x: Double, y: Double): Pair<Int, Int> =
        ((y - geo.y0) / geo.cellH - 0.5).roundToInt() to ((x - geo.x0) / geo.cellW - 0.5).roundToInt()
}
