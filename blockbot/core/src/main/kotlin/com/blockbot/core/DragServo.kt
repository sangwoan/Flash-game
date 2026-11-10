package com.blockbot.core

import kotlin.math.sqrt

/**
 * 드래그 중(손가락을 누른 채 멈춘 상태) 화면에서 "블록이 지금 어느 칸 위에 떠 있는지" 읽는다.
 *
 * 원리: 떠 있는 블록의 각 칸은 자신이 놓일 칸의 중심을 덮는다(가장 가까운 칸으로 스냅되므로).
 * 그래서 드래그 전후로 "원래 빈칸이던 칸의 중심 색이 바뀐 곳"이 곧 착지 예정 칸이다.
 * 게임이 착지 미리보기(그림자)를 그려도 같은 칸이라 결과가 같고, 줄 클리어 예고로 색이 바뀌는
 * 칸은 원래 채워진 칸이라 무시된다.
 */
object DragObserver {
    /** 칸 중심 ±frac 영역의 평균색 (64칸 × RGB). */
    fun cellColors(img: PixelImage, geo: BoardGeometry, frac: Double = 0.2): DoubleArray {
        val out = DoubleArray(64 * 3)
        for (i in 0 until 64) {
            val cx = geo.cellCenterX((i % 8).toDouble()); val cy = geo.cellCenterY((i / 8).toDouble())
            val x0 = (cx - geo.cellW * frac).toInt().coerceIn(0, img.width - 1); val x1 = (cx + geo.cellW * frac).toInt().coerceIn(0, img.width - 1)
            val y0 = (cy - geo.cellH * frac).toInt().coerceIn(0, img.height - 1); val y1 = (cy + geo.cellH * frac).toInt().coerceIn(0, img.height - 1)
            var r = 0L; var g = 0L; var b = 0L; var n = 0
            var y = y0
            while (y <= y1) {
                var x = x0
                while (x <= x1) { val p = img.rgb(x, y); r += (p shr 16) and 0xFF; g += (p shr 8) and 0xFF; b += p and 0xFF; n++; x += 2 }
                y += 2
            }
            out[i * 3] = r.toDouble() / n; out[i * 3 + 1] = g.toDouble() / n; out[i * 3 + 2] = b.toDouble() / n
        }
        return out
    }

    /**
     * @param before 드래그 직전 칸 색, [after] 누른 채 멈췄을 때 칸 색, [boardBits] 드래그 직전 보드
     * @param pieceColor 끌고 있는 블록의 색(트레이에서 미리 읽음). 있으면 "칸 중심이 블록에 덮인 비율"을 계산해
     *   칸 경계에 걸친 애매한 위치를 걸러낸다.
     * @return 블록(바운딩 박스 좌상단)이 떠 있는 (row, col). 확실하지 않으면 null (그러면 손가락을 조금 옮겨 다시 본다).
     */
    fun locate(
        before: DoubleArray, after: DoubleArray, boardBits: Long, piece: Piece,
        pieceColor: DoubleArray? = null,
        minChange: Double = 26.0, minCover: Double = 0.4,
    ): Pair<Int, Int>? {
        val w = DoubleArray(64)       // 변화량 (0이면 변화 없음)
        val hitCell = BooleanArray(64) // 블록이 충분히 덮고 있다고 볼 수 있는 칸
        var changed = 0
        for (i in 0 until 64) {
            if ((boardBits ushr i) and 1L == 1L) continue // 채워진 칸은 판단 근거로 쓰지 않음
            val dr = after[i * 3] - before[i * 3]; val dg = after[i * 3 + 1] - before[i * 3 + 1]; val db = after[i * 3 + 2] - before[i * 3 + 2]
            val d = sqrt(dr * dr + dg * dg + db * db)
            if (d <= minChange) continue
            changed++
            var cover = minOf(d, 120.0) / 120.0
            if (pieceColor != null) {
                val vr = pieceColor[0] - before[i * 3]; val vg = pieceColor[1] - before[i * 3 + 1]; val vb = pieceColor[2] - before[i * 3 + 2]
                val n2 = vr * vr + vg * vg + vb * vb
                if (n2 > 60.0 * 60.0) cover = ((dr * vr + dg * vg + db * vb) / n2).coerceIn(0.05, 1.0)
            }
            w[i] = cover
            hitCell[i] = cover >= minCover
        }
        if (changed == 0 || changed > piece.size + 6) return null // 아무것도 안 보이거나 화면 전체가 바뀜
        val total = w.sum()
        var best: Pair<Int, Int>? = null
        var bestScore = Double.NEGATIVE_INFINITY
        var tie = false
        // 보드 밖으로 일부 걸친 위치도 후보 (가장자리에서 지나친 경우). 보이는 칸 = 보드 안의 빈칸.
        for (r in -piece.height + 1..7) for (c in -piece.width + 1..7) {
            var inside = 0.0; var visible = 0; var ok = true
            for (cell in piece.cells) {
                val rr = r + cell.r; val cc = c + cell.c
                if (rr !in 0..7 || cc !in 0..7) continue
                val i = rr * 8 + cc
                if ((boardBits ushr i) and 1L == 1L) continue
                visible++
                if (hitCell[i]) inside += w[i] else { ok = false; break } // 블록이 여기 있다면 덮였어야 할 빈칸이 안 덮임
            }
            if (!ok || visible == 0) continue
            val score = inside - (total - inside)
            if (score > bestScore + 1e-6) { bestScore = score; best = r to c; tie = false }
            else if (score > bestScore - 1e-6) tie = true
        }
        // 동점(일부가 가려져 여러 위치가 똑같이 설명됨)이면 확실하지 않으므로 null
        return if (bestScore > 0.3 && !tie) best else null
    }
}

/**
 * 드래그 한 번의 "보고 맞추기" 판단. 손가락을 멈출 때마다 [onObservation]에 화면에서 읽은 위치를 주면
 * 다음 행동을 돌려준다: 목표 칸 위에 있으면 놓기, 아니면 어긋난 칸 수만큼 손가락을 옮겨 다시 확인.
 * 이동 배율·띄움 높이를 몰라도(모델이 틀려도) 몇 번의 확인으로 수렴한다.
 */
class DragServo(
    private val geo: BoardGeometry, private val piece: Piece,
    val targetRow: Int, val targetCol: Int,
    private val model: DragModel, private val startX: Double, private val startY: Double,
    private val screenW: Int, private val screenH: Int,
    private val maxCorrections: Int = 5,
    /** 화면에서 블록을 끝내 못 찾았을 때: true면 예측 위치에서 그냥 놓고, false면 취소(트레이로 되돌림). */
    private val allowBlindRelease: Boolean = true,
) {
    sealed class Action {
        data class MoveTo(val x: Double, val y: Double) : Action()
        /** confirmed = 목표 칸 위에 있는 걸 화면으로 확인하고 놓음. false = 화면에서 블록을 못 찾아 예측 위치에서 놓음. */
        data class Release(val confirmed: Boolean) : Action()
        /** 목표에 못 맞춤 → 트레이로 되돌려 놓고(게임이 블록을 돌려줌) 다시 시도. */
        object Cancel : Action()
    }

    val observations = ArrayList<DragObservation>()
    var corrections = 0
        private set
    private var unseen = 0
    private var steps = 0
    private var lastSeenFinger: Pair<Double, Double>? = null
    private var prevErrR = 0; private var prevErrC = 0
    private var prevStepX = 0.0; private var prevStepY = 0.0

    fun onObservation(fingerX: Double, fingerY: Double, seen: Pair<Int, Int>?): Action {
        steps++
        if (seen == null) {
            // 안 보이는 이유: 칸 경계에 걸쳐 애매함 / 채워진 칸 위 / 보드 밖.
            unseen++
            if (steps > MAX_STEPS || unseen > 4) return if (allowBlindRelease && lastSeenFinger == null) Action.Release(confirmed = false) else Action.Cancel
            // 전에 보였던 적이 있으면 그 손가락 위치 쪽으로 절반 되돌아가 다시 본다
            lastSeenFinger?.let { (lx, ly) -> prevStepX /= 2; prevStepY /= 2; return clamp((fingerX + lx) / 2, (fingerY + ly) / 2) }
            return when (unseen) {
                // 1) 살짝 옮겨 본다 (칸 경계에 걸친 경우)
                1 -> clamp(fingerX + 0.3 * geo.cellW * (if (targetCol + piece.width / 2.0 < 4) 1 else -1),
                    fingerY + 0.5 * geo.cellH * (if (targetRow + piece.height / 2.0 < 4) 1 else -1))
                // 2) 보드 한가운데로 (어느 방향으로 몇 칸 틀려도 보드 안에 있게)
                2 -> probeAt(3.5 - piece.height / 2.0, 3.5 - piece.width / 2.0)
                // 3) 가운데가 채워져 있어 안 보일 수 있으니 목표 쪽으로 조금
                else -> probeAt((3.5 - piece.height / 2.0 + targetRow) / 2, (3.5 - piece.width / 2.0 + targetCol) / 2)
            }
        }
        val (px, py) = DragPlanner.pieceCenter(geo, piece, seen.first, seen.second)
        observations += DragObservation(startX, startY, fingerX, fingerY, px, py, geo.cell, piece.height)
        lastSeenFinger = fingerX to fingerY
        val errR = targetRow - seen.first
        val errC = targetCol - seen.second
        if (errR == 0 && errC == 0) return Action.Release(confirmed = true)
        if (corrections >= maxCorrections || steps > MAX_STEPS) return Action.Cancel
        corrections++
        // 축별로: 어긋난 칸 수만큼 이동. 지난번과 반대쪽으로 어긋났으면(지나침) 직전 이동의 절반만 되돌아감(이분법)
        fun step(err: Int, prevErr: Int, prevStep: Double, cell: Double, gain: Double): Double = when {
            err == 0 -> 0.0
            prevErr != 0 && err * prevErr < 0 && prevStep != 0.0 -> err.sign() * maxOf(kotlin.math.abs(prevStep) / 2, cell * 0.2)
            else -> err * cell / gain
        }
        val sx = step(errC, prevErrC, prevStepX, geo.cellW, model.gainX)
        val sy = step(errR, prevErrR, prevStepY, geo.cellH, model.gainY)
        if (errC != 0) { prevErrC = errC; prevStepX = sx }
        if (errR != 0) { prevErrR = errR; prevStepY = sy }
        return clamp(fingerX + sx, fingerY + sy)
    }

    private fun Int.sign() = if (this > 0) 1.0 else if (this < 0) -1.0 else 0.0

    /** 모델 기준으로 블록 좌상단이 (row, col)(연속값)에 오도록 하는 손가락 위치. */
    private fun probeAt(row: Double, col: Double): Action.MoveTo {
        val cx = geo.x0 + (col + piece.width / 2.0) * geo.cellW
        val cy = geo.y0 + (row + piece.height / 2.0) * geo.cellH
        val (fx, fy) = model.fingerFor(startX, startY, cx, cy, geo.cell, piece.height)
        return clamp(fx, fy)
    }

    private fun clamp(x: Double, y: Double) = Action.MoveTo(x.coerceIn(1.0, screenW - 2.0), y.coerceIn(1.0, screenH - 2.0))

    companion object { const val MAX_STEPS = 10 }
}
