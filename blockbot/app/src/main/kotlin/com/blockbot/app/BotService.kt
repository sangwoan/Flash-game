package com.blockbot.app

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Bitmap
import android.graphics.Path
import android.os.Handler
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import java.util.concurrent.Executor

/**
 * 접근성 서비스 하나로 화면 캡처 + 오버레이 + 드래그 제스처를 모두 처리한다.
 * (TYPE_ACCESSIBILITY_OVERLAY 창을 쓰므로 "다른 앱 위에 표시" 권한이 따로 필요 없음)
 */
class BotService : AccessibilityService() {

    /** 지금 화면 맨 앞에 있는 앱 패키지 (자동 모드에서 게임 화면일 때만 드래그하기 위해). */
    @Volatile var foregroundPackage: String? = null
        private set

    private var ui: OverlayUi? = null
    private var controller: BotController? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        val prefs = Prefs(this)
        val log = BotLog(this)
        val overlay = OverlayUi(this, prefs)
        val ctrl = BotController(this, prefs, log, overlay)
        overlay.attach(ctrl)
        ui = overlay
        controller = ctrl
        instance = this
        log.event("service_connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val pkg = event.packageName?.toString() ?: return
        if (pkg == packageName || pkg == "com.android.systemui") return
        foregroundPackage = pkg
    }

    override fun onInterrupt() {}

    fun reopenPanel() = ui?.reopenPanel()

    /** 맨 앞 앱 패키지. 서비스가 켜지기 전에 이미 열려 있던 앱이면 활성 창에서 읽는다. */
    fun activePackage(): String? =
        runCatching { rootInActiveWindow?.packageName?.toString() }.getOrNull()
            ?.takeIf { it != packageName && it != "com.android.systemui" }
            ?: foregroundPackage

    override fun onDestroy() {
        controller?.shutdown()
        ui?.detach()
        instance = null
        super.onDestroy()
    }

    /** 화면 캡처 → 소프트웨어 비트맵(ARGB_8888). 실패 시 null. */
    fun capture(executor: Executor, onResult: (Bitmap?, Int) -> Unit) {
        takeScreenshot(Display.DEFAULT_DISPLAY, executor, object : TakeScreenshotCallback {
            override fun onSuccess(result: ScreenshotResult) {
                val hb = result.hardwareBuffer
                val bmp = try {
                    Bitmap.wrapHardwareBuffer(hb, result.colorSpace)?.copy(Bitmap.Config.ARGB_8888, false)
                } finally {
                    hb.close()
                }
                onResult(bmp, 0)
            }

            override fun onFailure(errorCode: Int) = onResult(null, errorCode)
        })
    }

    /**
     * 진행 중인 드래그 한 번. 손가락을 누른 채로 이동·대기·놓기를 이어서 할 수 있다
     * (각 동작은 앞 스트로크에 이어지는 스트로크라 손가락이 떨어지지 않는다).
     * 모든 콜백은 [handler] 스레드에서 불린다.
     */
    inner class DragHandle internal constructor(
        private val handler: Handler, x0: Float, y0: Float,
        private var last: GestureDescription.StrokeDescription, private val onFail: () -> Unit,
    ) {
        var x = x0; private set
        var y = y0; private set
        private var dead = false
        private var jitter = 1f

        private fun stroke(toX: Float, toY: Float, ms: Long, willContinue: Boolean, next: () -> Unit) {
            if (dead) return
            val s = last.continueStroke(Path().apply { moveTo(x, y); lineTo(toX, toY) }, 0, maxOf(1L, ms), willContinue)
            last = s; x = toX; y = toY
            val ok = dispatchGesture(GestureDescription.Builder().addStroke(s).build(), object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) = next()
                override fun onCancelled(gestureDescription: GestureDescription?) = fail()
            }, handler)
            if (!ok) fail()
        }

        private fun fail() { if (!dead) { dead = true; onFail() } }

        /** 속도 상한을 지켜 이동: 80%는 [fastPxPerMs], 마지막 20%는 [slowPxPerMs]로 감속. */
        fun moveTo(tx: Float, ty: Float, fastPxPerMs: Double = FAST_PX_PER_MS, slowPxPerMs: Double = SLOW_PX_PER_MS, next: () -> Unit) {
            val dist = kotlin.math.hypot((tx - x).toDouble(), (ty - y).toDouble())
            if (dist < 2.0) { hold(60, next); return }
            val mx = x + (tx - x) * 0.8f; val my = y + (ty - y) * 0.8f
            stroke(mx, my, maxOf(MIN_FAST_MS, (dist * 0.8 / fastPxPerMs).toLong()), true) {
                stroke(tx, ty, maxOf(MIN_SLOW_MS, (dist * 0.2 / slowPxPerMs).toLong()), true, next)
            }
        }

        /** 짧은 보정 이동: 감속 구간 없이 한 번에 (한 칸 ≈ 0.2초). */
        fun nudgeTo(tx: Float, ty: Float, next: () -> Unit) {
            val dist = kotlin.math.hypot((tx - x).toDouble(), (ty - y).toDouble())
            if (dist < 2.0) { hold(40, next); return }
            stroke(tx, ty, maxOf(90L, (dist / NUDGE_PX_PER_MS).toLong()), true, next)
        }

        /** 제자리에서 누른 채 대기 (1px 흔들림: 길이 0인 경로는 허용되지 않음). */
        fun hold(ms: Long, next: () -> Unit) { jitter = -jitter; stroke(x + jitter, y, ms, true, next) }

        /** [ready]가 true가 될 때까지 누른 채 대기 (최대 [maxMs]). */
        fun holdUntil(ready: () -> Boolean, maxMs: Long, then: () -> Unit) {
            if (ready() || maxMs <= 0) then() else hold(50) { holdUntil(ready, maxMs - 50, then) }
        }

        /** 손가락을 뗀다. */
        fun release(done: () -> Unit) { jitter = -jitter; stroke(x + jitter, y, 80, false) { dead = true; done() } }
    }

    /** 트레이 블록을 누르고(집고) [onPicked]에 핸들을 넘긴다. 제스처가 끊기면 [onFail]. */
    fun beginDrag(fromX: Float, fromY: Float, handler: Handler, onFail: () -> Unit, onPicked: (DragHandle) -> Unit) {
        val s1 = GestureDescription.StrokeDescription(Path().apply { moveTo(fromX, fromY); lineTo(fromX + 1f, fromY + 1f) }, 0, HOLD_MS, true)
        var failed = false
        val fail = { if (!failed) { failed = true; onFail() } }
        val h = DragHandle(handler, fromX + 1f, fromY + 1f, s1, fail)
        val ok = dispatchGesture(GestureDescription.Builder().addStroke(s1).build(), object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) = onPicked(h)
            override fun onCancelled(gestureDescription: GestureDescription?) = fail()
        }, handler)
        if (!ok) fail()
    }

    companion object {
        // 드래그 속도: 1080px 폭 화면 기준 빠른 구간 초당 약 1100px, 감속 구간 초당 약 450px
        const val HOLD_MS = 180L
        const val FAST_PX_PER_MS = 1.1
        const val SLOW_PX_PER_MS = 0.45
        const val NUDGE_PX_PER_MS = 0.6
        const val MIN_FAST_MS = 220L
        const val MIN_SLOW_MS = 200L

        @Volatile var instance: BotService? = null
            private set
    }
}
