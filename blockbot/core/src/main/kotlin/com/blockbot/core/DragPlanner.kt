package com.blockbot.core

import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * 드래그 1회의 관측: 손가락 시작(S)·끝(F) 좌표, 실제로 놓인 블록의 중심(P), 칸 크기, 블록 높이(칸).
 * 블록이 의도와 다른 칸에 놓였어도 "이 손가락 위치면 여기 놓인다"는 정보이므로 그대로 쓴다.
 */
data class DragObservation(
    val sx: Double, val sy: Double,
    val fx: Double, val fy: Double,
    val px: Double, val py: Double,
    val cell: Double, val pieceH: Int,
) {
    fun toText() = String.format(java.util.Locale.US, "%.1f %.1f %.1f %.1f %.1f %.1f %.2f %d", sx, sy, fx, fy, px, py, cell, pieceH)

    companion object {
        fun fromText(line: String): DragObservation? = runCatching {
            val p = line.trim().split(Regex("\\s+"))
            DragObservation(p[0].toDouble(), p[1].toDouble(), p[2].toDouble(), p[3].toDouble(), p[4].toDouble(), p[5].toDouble(), p[6].toDouble(), p[7].toInt())
        }.getOrNull()
    }
}

/**
 * 손가락 → 블록 위치 모델 (칸 단위, 축별 1차식).
 *   가로: (Px − Sx)/칸 = gainX × (Fx − Sx)/칸 + offX
 *   세로: (Py − Sy)/칸 + 블록높이/2 = gainY × (Fy − Sy)/칸 − lift
 *
 * gain = 이동 배율 (손가락 1칸 움직일 때 블록이 움직이는 칸 수). 1보다 크면 "너무 지나가는" 증상.
 * lift = 블록 아랫변이 손가락보다 위에 뜨는 칸 수. offX = 좌우 치우침.
 * 관측이 쌓일수록 [fit]으로 다시 맞춘다 (적을 때는 사전값 쪽으로 당겨 급격히 흔들리지 않게).
 */
data class DragModel(
    val gainX: Double = 1.0,
    val offX: Double = 0.0,
    val gainY: Double = 1.0,
    val lift: Double = 1.5,
    val samples: Int = 0,
) {
    /** 블록 중심을 (targetCx, targetCy)에 두려면 손가락을 어디서 뗄지. */
    fun fingerFor(sx: Double, sy: Double, targetCx: Double, targetCy: Double, cell: Double, pieceH: Int, extraLift: Double = 0.0): Pair<Double, Double> {
        val dx = ((targetCx - sx) / cell - offX) / gainX
        val dy = ((targetCy - sy) / cell + pieceH / 2.0 + lift + extraLift) / gainY
        return (sx + dx * cell) to (sy + dy * cell)
    }

    /** 이 모델이 관측의 손가락 위치에서 예측하는 블록 중심 (칸 단위 오차 계산용). */
    fun predict(o: DragObservation): Pair<Double, Double> {
        val qx = gainX * (o.fx - o.sx) / o.cell + offX
        val qy = gainY * (o.fy - o.sy) / o.cell - lift - o.pieceH / 2.0
        return (o.sx + qx * o.cell) to (o.sy + qy * o.cell)
    }

    fun describe() = "이동배율 가로 %.2f·세로 %.2f, 띄움 %.2f칸, 좌우 %.2f칸 (관측 %d회)".format(gainX, gainY, lift, offX, samples)

    companion object {
        val PRIOR = DragModel()

        /**
         * 축별 릿지 회귀: 배율은 사전값(1) 근처에 두되 증거가 쌓이면 움직이고([gainPrior]),
         * 절편(띄움·치우침)은 빨리 따라가게([offsetPrior]) 정규화한다.
         * 착지 위치가 칸 단위로만 관측돼서(±0.5칸 오차) 관측이 적을 때 배율과 띄움이 서로 엉키는 걸 막는다.
         * 시뮬레이션: 1:1 게임이면 2~3수째부터 적중, 배율 1.25인 게임도 15수 안팎에서 대부분 적중.
         */
        fun fit(obs: List<DragObservation>, prior: DragModel = PRIOR, gainPrior: Double = 30.0, offsetPrior: Double = 0.3): DragModel {
            fun ridge(points: List<Pair<Double, Double>>, g0: Double, b0: Double): Pair<Double, Double> {
                var a11 = gainPrior; var a12 = 0.0; var a22 = offsetPrior
                var r1 = gainPrior * g0; var r2 = offsetPrior * b0
                for ((d, q) in points) { a11 += d * d; a12 += d; a22 += 1; r1 += d * q; r2 += q }
                val det = a11 * a22 - a12 * a12
                if (abs(det) < 1e-9) return g0 to b0
                return (r1 * a22 - a12 * r2) / det to (a11 * r2 - a12 * r1) / det
            }
            val xs = obs.map { (it.fx - it.sx) / it.cell to (it.px - it.sx) / it.cell }
            val ys = obs.map { (it.fy - it.sy) / it.cell to (it.py - it.sy) / it.cell + it.pieceH / 2.0 }
            val (gx, bx) = ridge(xs, prior.gainX, prior.offX)
            val (gy, by) = ridge(ys, prior.gainY, -prior.lift)
            return DragModel(
                gainX = gx.coerceIn(0.6, 1.8), offX = bx,
                gainY = gy.coerceIn(0.6, 1.8), lift = -by,
                samples = obs.size,
            )
        }
    }
}

data class DragPath(val fromX: Float, val fromY: Float, val toX: Float, val toY: Float)

object DragPlanner {
    /** 트레이 블록을 집어 보드의 (row, col)에 두는 손가락 경로. */
    fun plan(
        geo: BoardGeometry, from: TrayRead, piece: Piece, row: Int, col: Int,
        model: DragModel, screenW: Int, screenH: Int, extraLiftCells: Double = 0.0,
    ): DragPath {
        val (tx, ty) = pieceCenter(geo, piece, row, col)
        val (fx, fy) = model.fingerFor(from.centerX, from.centerY, tx, ty, geo.cell, piece.height, extraLiftCells)
        return DragPath(
            from.centerX.toFloat(), from.centerY.toFloat(),
            fx.coerceIn(1.0, screenW - 2.0).toFloat(), fy.coerceIn(1.0, screenH - 2.0).toFloat(),
        )
    }

    /** 보드 (row, col)에 놓인 블록의 바운딩 박스 중심 (화면 px). */
    fun pieceCenter(geo: BoardGeometry, piece: Piece, row: Int, col: Int): Pair<Double, Double> =
        (geo.x0 + (col + piece.width / 2.0) * geo.cellW) to (geo.y0 + (row + piece.height / 2.0) * geo.cellH)

    /** 성공한 드래그의 관측 생성. */
    fun observe(geo: BoardGeometry, path: DragPath, piece: Piece, landedRow: Int, landedCol: Int): DragObservation {
        val (px, py) = pieceCenter(geo, piece, landedRow, landedCol)
        return DragObservation(path.fromX.toDouble(), path.fromY.toDouble(), path.toX.toDouble(), path.toY.toDouble(), px, py, geo.cell, piece.height)
    }

    /** 드롭이 거부됐을 때(보드 변화 없음) 시도할 추가 띄움 순서 (칸). */
    val RETRY_EXTRA_LIFT = doubleArrayOf(0.0, 1.0, -1.0, 2.0, -2.0)

    fun rowColAt(geo: BoardGeometry, x: Double, y: Double): Pair<Int, Int> =
        ((y - geo.y0) / geo.cellH - 0.5).roundToInt() to ((x - geo.x0) / geo.cellW - 0.5).roundToInt()
}
