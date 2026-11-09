package com.blockbot.app

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import com.blockbot.core.BoardGeometry
import com.blockbot.core.Plan

/**
 * 화면 위에 두 개의 창을 띄운다.
 *  - 조작 패널: [힌트][자동][정지] + 상태 글자. 끌어서 옮길 수 있음 (화면 위쪽 점수 영역에 두기).
 *  - 힌트 그림: 놓을 위치를 칸 테두리 + 순서 번호로 표시. 터치는 통과.
 *    인식이 칸 "중앙"만 보므로 테두리·모서리 번호는 인식을 방해하지 않는다.
 */
class OverlayUi(private val service: BotService, private val prefs: Prefs) {
    private val main = Handler(Looper.getMainLooper())
    private val wm = service.getSystemService(WindowManager::class.java)
    private var controller: BotController? = null

    private var panel: LinearLayout? = null
    private var panelParams: WindowManager.LayoutParams? = null
    private var statusView: TextView? = null
    private val buttons = HashMap<Mode, TextView>()
    private var hintView: HintView? = null

    fun attach(c: BotController) {
        controller = c
        main.post { addHintView(); addPanel() }
    }

    fun detach() {
        main.post {
            panel?.let { runCatching { wm.removeView(it) } }
            hintView?.let { runCatching { wm.removeView(it) } }
            panel = null; hintView = null
        }
    }

    fun status(text: String) = main.post { statusView?.text = text }
    fun showPlan(geo: BoardGeometry?, plan: Plan?) = main.post { hintView?.set(geo, plan) }
    fun setHintsVisible(visible: Boolean) = main.post { hintView?.visibility = if (visible) View.VISIBLE else View.INVISIBLE }

    fun modeChanged(m: Mode) = main.post {
        for ((mode, b) in buttons) {
            val on = mode == m
            (b.background as GradientDrawable).setColor(if (on) ACTIVE[mode]!! else 0x33FFFFFF)
            b.setTextColor(if (on) Color.BLACK else Color.WHITE)
        }
    }

    private fun dp(v: Float): Int = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, service.resources.displayMetrics).toInt()

    private fun addHintView() {
        val v = HintView(service)
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
        }
        wm.addView(v, lp)
        hintView = v
    }

    @SuppressLint("ClickableViewAccessibility", "SetTextI18n")
    private fun addPanel() {
        val root = LinearLayout(service).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(10f), dp(8f), dp(10f), dp(8f))
            background = GradientDrawable().apply { cornerRadius = dp(14f).toFloat(); setColor(0xDD111827.toInt()) }
        }
        val row = LinearLayout(service).apply { orientation = LinearLayout.HORIZONTAL }
        for ((mode, label) in listOf(Mode.HINT to "힌트", Mode.AUTO to "자동", Mode.OFF to "정지")) {
            val b = TextView(service).apply {
                text = label
                setTextColor(Color.WHITE)
                textSize = 14f
                typeface = Typeface.DEFAULT_BOLD
                setPadding(dp(14f), dp(6f), dp(14f), dp(6f))
                background = GradientDrawable().apply { cornerRadius = dp(10f).toFloat(); setColor(0x33FFFFFF) }
                setOnClickListener { controller?.setMode(mode) }
            }
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { rightMargin = dp(6f) }
            row.addView(b, lp)
            buttons[mode] = b
        }
        val handle = TextView(service).apply {
            text = "  ⠿"
            setTextColor(0xAAFFFFFF.toInt())
            textSize = 18f
        }
        row.addView(handle)
        root.addView(row)
        val status = TextView(service).apply {
            text = "BlockBot 준비됨 — [힌트] 또는 [자동]"
            setTextColor(Color.WHITE)
            textSize = 12f
            maxWidth = (service.resources.displayMetrics.widthPixels * 0.8).toInt()
            setPadding(0, dp(6f), 0, 0)
        }
        root.addView(status)

        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = prefs.panelX
            y = prefs.panelY
        }

        // 손잡이(⠿)나 상태 글자를 끌면 패널 이동
        var downX = 0f; var downY = 0f; var startX = 0; var startY = 0
        val mover = View.OnTouchListener { _, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> { downX = e.rawX; downY = e.rawY; startX = lp.x; startY = lp.y; true }
                MotionEvent.ACTION_MOVE -> {
                    lp.x = startX + (e.rawX - downX).toInt()
                    lp.y = startY + (e.rawY - downY).toInt()
                    runCatching { wm.updateViewLayout(root, lp) }
                    true
                }
                MotionEvent.ACTION_UP -> { prefs.panelX = lp.x; prefs.panelY = lp.y; true }
                else -> false
            }
        }
        handle.setOnTouchListener(mover)
        status.setOnTouchListener(mover)

        wm.addView(root, lp)
        panel = root
        panelParams = lp
        statusView = status
        modeChanged(Mode.OFF)
    }

    companion object {
        private val ACTIVE = mapOf(
            Mode.HINT to 0xFF4FD1C5.toInt(),
            Mode.AUTO to 0xFFFFC83D.toInt(),
            Mode.OFF to 0xFFE5E7EB.toInt(),
        )
    }
}

/** 추천 수를 보드 위에 그린다: 1·2·3번 순서별 색 테두리 + 모서리 번호. */
class HintView(context: Context) : View(context) {
    private var geo: BoardGeometry? = null
    private var plan: Plan? = null
    private val loc = IntArray(2)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val label = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Typeface.DEFAULT_BOLD }
    private val labelBg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xCC000000.toInt() }

    fun set(g: BoardGeometry?, p: Plan?) {
        geo = g; plan = p
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val g = geo ?: return
        val p = plan ?: return
        getLocationOnScreen(loc)
        canvas.save()
        canvas.translate(-loc[0].toFloat(), -loc[1].toFloat())
        p.steps.forEachIndexed { i, s ->
            val color = COLORS[i % COLORS.size]
            stroke.color = color
            // 테두리는 칸의 15~22% 안쪽에: 인식이 보는 영역(윗변 5~11%, 아랫변 86~93%, 중앙 30~70%)을 피함
            stroke.strokeWidth = (g.cell * if (i == 0) 0.06 else 0.04).toFloat()
            val inset = g.cell * 0.185
            for (c in s.piece.cells) {
                val x = g.x0 + (s.col + c.c) * g.cellW
                val y = g.y0 + (s.row + c.r) * g.cellH
                canvas.drawRect((x + inset).toFloat(), (y + inset).toFloat(), (x + g.cellW - inset).toFloat(), (y + g.cellH - inset).toFloat(), stroke)
            }
            // 번호: 첫 칸의 왼쪽 위 모서리 (칸 중앙 인식 영역 밖)
            val first = s.piece.cells.first()
            // 원이 칸의 0.06~0.26 구간에 들어가도록 (인식은 칸 0.3~0.7 구간만 봄)
            val lx = (g.x0 + (s.col + first.c) * g.cellW + g.cellW * 0.06).toFloat()
            val ly = (g.y0 + (s.row + first.r) * g.cellH + g.cellH * 0.06).toFloat()
            val r = (g.cell * 0.10).toFloat()
            canvas.drawCircle(lx + r, ly + r, r, labelBg)
            label.color = color
            label.textSize = r * 1.5f
            label.textAlign = Paint.Align.CENTER
            canvas.drawText("${i + 1}", lx + r, ly + r * 1.5f, label)
        }
        canvas.restore()
    }

    companion object {
        private val COLORS = intArrayOf(0xFFFF2D95.toInt(), 0xFF00E5FF.toInt(), 0xFFFFEA00.toInt())
    }
}
