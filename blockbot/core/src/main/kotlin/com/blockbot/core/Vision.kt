package com.blockbot.core

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/** ARGB 픽셀 배열 (Android Bitmap.getPixels와 같은 형식: 0xAARRGGBB). */
class PixelImage(val width: Int, val height: Int, val argb: IntArray) {
    init { require(argb.size >= width * height) }
    fun rgb(x: Int, y: Int): Int = argb[y * width + x]
}

/** 보드 격자: 좌상단 칸의 왼쪽 위 모서리 (x0, y0)와 칸 크기. 화면 픽셀 좌표. */
data class BoardGeometry(val x0: Double, val y0: Double, val cellW: Double, val cellH: Double) {
    val cell: Double get() = (cellW + cellH) / 2
    val bottom: Double get() = y0 + 8 * cellH
    fun cellCenterX(c: Double): Double = x0 + (c + 0.5) * cellW
    fun cellCenterY(r: Double): Double = y0 + (r + 0.5) * cellH
}

data class TrayRead(
    val slot: Int,
    val piece: Piece,
    val left: Int, val top: Int, val right: Int, val bottom: Int,
) {
    val centerX: Double get() = (left + right) / 2.0
    val centerY: Double get() = (top + bottom) / 2.0
}

data class VisionResult(
    val geometry: BoardGeometry,
    val board: Board,
    val cellDistance: DoubleArray,  // 칸별: 가장 어두운 칸(빈칸 기준색)과의 색 거리 — 로그·튜닝용
    val uncertainCells: Int,        // 빈칸/채움 판정이 애매한 칸 수 (애니메이션·글자 겹침 등)
    val tray: List<TrayRead?>,      // 슬롯 0..2, 비었으면 null
    val issues: List<String>,
) {
    /** 이 프레임을 믿어도 되는가. */
    val clean: Boolean get() = uncertainCells == 0 && issues.isEmpty()
    val trayPieces: List<Piece?> get() = tray.map { it?.piece }
}

/** 인식 파라미터. 기본값은 실제 스크린샷 5장(테마 5종, 해상도 2종)으로 맞춤. */
data class VisionConfig(
    val minCellFrac: Double = 0.08,     // 칸 크기 / 화면 폭 탐색 범위
    val maxCellFrac: Double = 0.135,
    val patchFrac: Double = 0.2,        // 칸 중앙에서 ±patchFrac×칸 영역의 평균색 사용
    val emptyMaxDist: Double = 50.0,    // 빈칸 기준색과 이보다 가까우면 빈칸
    val filledMinDist: Double = 100.0,  // 이보다 멀면 채움, 그 사이는 애매
    val maxPatchStd: Double = 40.0,     // 칸 중앙 밝기 표준편차가 이보다 크면 애매 (글자·이펙트)
    val trayScale: Double = 0.447,      // 트레이 블록 칸 크기 / 보드 칸 크기 (실측)
    val trayTopCells: Double = 0.6,     // 트레이 영역: 보드 아래 0.6칸 ~ 4.2칸
    val trayBottomCells: Double = 4.2,
    val trayDist: Double = 60.0,        // 배경과 이보다 멀어야 블록 후보
    val trayBrighter: Double = 1.08,    // 배경보다 이만큼 밝거나
    val trayResidual: Double = 45.0,    // 배경과 색조가 이만큼 다르면 블록 (그림자 제외용)
    val trayDimTolerance: Double = 0.3, // 크기/칸 이 정수에서 이만큼 벗어나면 이상
    val minCombContrast: Double = 1.6,  // 격자 검출 신뢰도 하한
)

object Vision {

    private fun lum(p: Int): Int = (((p shr 16) and 0xFF) + ((p shr 8) and 0xFF) + (p and 0xFF)) / 3

    /** 보드 격자를 찾는다. 가로·세로 경계선 강도 프로파일에 9개짜리 등간격 빗(comb)을 맞춘다. */
    fun detectGeometry(img: PixelImage, cfg: VisionConfig = VisionConfig()): BoardGeometry? {
        val w = img.width
        val h = img.height
        val g = IntArray(w * h)
        for (i in 0 until w * h) g[i] = lum(img.argb[i])

        // 세로 방향 밝기 변화(가로선) 강도: y별 합
        val gy = DoubleArray(h)
        for (y in 1 until h - 1) {
            var s = 0L
            val a = (y - 1) * w
            val b = (y + 1) * w
            var x = 0
            while (x < w) { s += abs(g[b + x] - g[a + x]); x += 2 }
            gy[y] = s.toDouble()
        }
        val sMin = cfg.minCellFrac * w
        val sMax = cfg.maxCellFrac * w
        val yFit = fitComb(gy, sMin, sMax) ?: return null
        val y0 = yFit.offset
        val sy = yFit.spacing
        val yEnd = min(h - 2, (y0 + 8 * sy).roundToInt())

        // 보드 행 범위 안에서 가로 방향 밝기 변화(세로선) 강도: x별 합
        val gx = DoubleArray(w)
        for (x in 1 until w - 1) {
            var s = 0L
            var y = y0.roundToInt().coerceAtLeast(0)
            while (y <= yEnd) { s += abs(g[y * w + x + 1] - g[y * w + x - 1]); y += 2 }
            gx[x] = s.toDouble()
        }
        val xFit = fitComb(gx, sy * 0.97, sy * 1.03) ?: return null
        if (yFit.contrast < cfg.minCombContrast || xFit.contrast < cfg.minCombContrast) return null
        if (xFit.offset < 0 || xFit.offset + 8 * xFit.spacing > w) return null
        return BoardGeometry(xFit.offset, y0, xFit.spacing, sy)
    }

    private class CombFit(val offset: Double, val spacing: Double, val contrast: Double)

    /** profile에서 offset + k×spacing (k=0..8) 지점의 합이 최대인 (offset, spacing). */
    private fun fitComb(profile: DoubleArray, sMin: Double, sMax: Double): CombFit? {
        val n = profile.size
        // ±1 픽셀 허용
        val p = DoubleArray(n) { i ->
            max(profile[i], max(if (i > 0) profile[i - 1] else 0.0, if (i < n - 1) profile[i + 1] else 0.0))
        }
        var best = -1.0
        var bestO = 0
        var bestS = 0.0
        fun search(s0: Double, s1: Double, step: Double) {
            var s = s0
            while (s <= s1) {
                val span = (8 * s).toInt()
                for (o in 0 until n - span - 1) {
                    var sum = 0.0
                    for (k in 0..8) sum += p[(o + k * s).roundToInt()]
                    if (sum > best) { best = sum; bestO = o; bestS = s }
                }
                s += step
            }
        }
        search(sMin, sMax, 0.5)
        if (best <= 0) return null
        val coarse = bestS
        search(max(sMin, coarse - 0.5), min(sMax, coarse + 0.5), 0.05)
        // 신뢰도: 빗살 평균 / 해당 구간 평균
        val span = (8 * bestS).roundToInt()
        var mean = 0.0
        for (i in bestO..min(n - 1, bestO + span)) mean += profile[i]
        mean /= (span + 1)
        val contrast = if (mean > 0) (best / 9) / mean else 0.0
        return CombFit(bestO.toDouble(), bestS, contrast)
    }

    private class Patch(val r: Double, val g: Double, val b: Double, val std: Double)

    private fun patch(img: PixelImage, cx: Double, cy: Double, half: Double): Patch {
        val x0 = (cx - half).roundToInt().coerceIn(0, img.width - 1)
        val x1 = (cx + half).roundToInt().coerceIn(0, img.width - 1)
        val y0 = (cy - half).roundToInt().coerceIn(0, img.height - 1)
        val y1 = (cy + half).roundToInt().coerceIn(0, img.height - 1)
        var r = 0.0; var gg = 0.0; var b = 0.0; var l = 0.0; var l2 = 0.0; var n = 0
        for (y in y0..y1) for (x in x0..x1) {
            val p = img.rgb(x, y)
            val pr = ((p shr 16) and 0xFF).toDouble()
            val pg = ((p shr 8) and 0xFF).toDouble()
            val pb = (p and 0xFF).toDouble()
            r += pr; gg += pg; b += pb
            val lv = (pr + pg + pb) / 3
            l += lv; l2 += lv * lv; n++
        }
        val ml = l / n
        return Patch(r / n, gg / n, b / n, sqrt(max(0.0, l2 / n - ml * ml)))
    }

    fun read(img: PixelImage, geo: BoardGeometry, cfg: VisionConfig = VisionConfig()): VisionResult {
        val issues = ArrayList<String>()

        // ── 보드 ──
        val patches = Array(64) { i ->
            val r = i / 8; val c = i % 8
            patch(img, geo.cellCenterX(c.toDouble()), geo.cellCenterY(r.toDouble()), geo.cell * cfg.patchFrac)
        }
        // 유효한 보드는 모든 행에 빈칸이 있으므로 가장 어두운 칸은 빈칸이다
        val darkest = patches.minBy { it.r + it.g + it.b }
        val dist = DoubleArray(64) { i ->
            val p = patches[i]
            sqrt((p.r - darkest.r).let { it * it } + (p.g - darkest.g).let { it * it } + (p.b - darkest.b).let { it * it })
        }
        var bits = 0L
        var uncertain = 0
        val mid = (cfg.emptyMaxDist + cfg.filledMinDist) / 2
        for (i in 0 until 64) {
            if (dist[i] > mid) bits = bits or (1L shl i)
            val ambiguous = dist[i] > cfg.emptyMaxDist && dist[i] < cfg.filledMinDist
            if (ambiguous || patches[i].std > cfg.maxPatchStd) uncertain++
        }
        for (i in 0 until 8) {
            if ((bits and Bits.ROW[i]) == Bits.ROW[i]) issues += "꽉 찬 행 $i (클리어 애니메이션 중?)"
            if ((bits and Bits.COL[i]) == Bits.COL[i]) issues += "꽉 찬 열 $i (클리어 애니메이션 중?)"
        }

        // ── 트레이 ──
        val tray = readTray(img, geo, cfg, issues)
        return VisionResult(geo, Board(bits), dist, uncertain, tray, issues)
    }

    private fun readTray(img: PixelImage, geo: BoardGeometry, cfg: VisionConfig, issues: MutableList<String>): List<TrayRead?> {
        val w = img.width
        val top = (geo.bottom + cfg.trayTopCells * geo.cellH).roundToInt().coerceIn(0, img.height)
        val bot = (geo.bottom + cfg.trayBottomCells * geo.cellH).roundToInt().coerceIn(0, img.height)
        if (bot - top < 10) { issues += "트레이 영역이 화면 밖"; return listOf(null, null, null) }
        val bh = bot - top
        val mask = BooleanArray(w * bh)
        val bgX0 = (w * 0.01).toInt()
        val bgX1 = max(bgX0 + 1, (w * 0.03).toInt())
        for (yy in 0 until bh) {
            val y = top + yy
            // 행별 배경색 (화면 왼쪽 가장자리)
            var br = 0.0; var bg = 0.0; var bb = 0.0
            for (x in bgX0 until bgX1) {
                val p = img.rgb(x, y)
                br += (p shr 16) and 0xFF; bg += (p shr 8) and 0xFF; bb += p and 0xFF
            }
            val n = (bgX1 - bgX0).toDouble()
            br /= n; bg /= n; bb /= n
            val bgNorm2 = br * br + bg * bg + bb * bb + 1.0
            for (x in 0 until w) {
                val p = img.rgb(x, y)
                val r = ((p shr 16) and 0xFF).toDouble()
                val g = ((p shr 8) and 0xFF).toDouble()
                val b = (p and 0xFF).toDouble()
                val dr = r - br; val dg = g - bg; val db = b - bb
                val d = sqrt(dr * dr + dg * dg + db * db)
                if (d <= cfg.trayDist) continue
                val alpha = (r * br + g * bg + b * bb) / bgNorm2
                val rr = r - alpha * br; val rg = g - alpha * bg; val rb = b - alpha * bb
                val resid = sqrt(rr * rr + rg * rg + rb * rb)
                if (alpha > cfg.trayBrighter || resid > cfg.trayResidual) mask[yy * w + x] = true
            }
        }
        val ts = cfg.trayScale * geo.cell
        val minPixels = (ts * ts * 0.5).toInt()
        return (0 until 3).map { slot ->
            val xa = w * slot / 3
            val xb = w * (slot + 1) / 3
            val colCount = IntArray(xb - xa)
            val rowCount = IntArray(bh)
            var total = 0
            for (yy in 0 until bh) for (x in xa until xb) if (mask[yy * w + x]) {
                colCount[x - xa]++; rowCount[yy]++; total++
            }
            if (total < minPixels) return@map null
            val (cx0, cx1) = trimmedRange(colCount, total)
            val (ry0, ry1) = trimmedRange(rowCount, total)
            val left = xa + cx0; val right = xa + cx1
            val tTop = top + ry0; val tBot = top + ry1
            val fw = (right - left + 1) / ts
            val fh = (tBot - tTop + 1) / ts
            val nc = fw.roundToInt().coerceIn(1, 5)
            val nr = fh.roundToInt().coerceIn(1, 5)
            if (abs(fw - nc) > cfg.trayDimTolerance || abs(fh - nr) > cfg.trayDimTolerance) {
                issues += "슬롯 $slot 크기 이상 (%.2f×%.2f칸)".format(fw, fh)
            }
            val cw = (right - left + 1).toDouble() / nc
            val ch = (tBot - tTop + 1).toDouble() / nr
            val cells = ArrayList<Cell>()
            for (r in 0 until nr) for (c in 0 until nc) {
                val cx = left + (c + 0.5) * cw
                val cy = tTop + (r + 0.5) * ch
                val half = min(cw, ch) * 0.25
                var hit = 0; var cnt = 0
                for (y in (cy - half).roundToInt()..(cy + half).roundToInt()) for (x in (cx - half).roundToInt()..(cx + half).roundToInt()) {
                    val yy = y - top
                    if (yy in 0 until bh && x in 0 until w) { cnt++; if (mask[yy * w + x]) hit++ }
                }
                if (cnt > 0 && hit * 2 > cnt) cells += Cell(r, c)
            }
            if (cells.isEmpty()) { issues += "슬롯 $slot 블록 칸 없음"; return@map null }
            val piece = Piece.of(cells)
            if (piece.height != nr || piece.width != nc) issues += "슬롯 $slot 모양 경계 불일치"
            if (!Pieces.isKnown(piece)) issues += "슬롯 $slot 처음 보는 모양 ${piece.pattern()}"
            TrayRead(slot, piece, left, tTop, right, tBot)
        }
    }

    /** 양 끝 0.5%씩 잘라낸 범위 (잡티 제거). */
    private fun trimmedRange(count: IntArray, total: Int): Pair<Int, Int> {
        val cut = max(1, total / 200)
        var acc = 0
        var a = 0
        while (a < count.size - 1 && acc + count[a] < cut) { acc += count[a]; a++ }
        acc = 0
        var b = count.size - 1
        while (b > 0 && acc + count[b] < cut) { acc += count[b]; b-- }
        return a to b
    }
}
