package com.blockbot.app

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Bitmap
import android.graphics.Path
import android.os.Handler
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import com.blockbot.core.DragPath
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
     * 트레이 블록을 집어 목표 지점까지 끌고 가서 멈춘 뒤 놓는다. 사람 손처럼:
     *  1) 누르고 잠깐 대기 (게임이 블록을 집도록)
     *  2) 거리의 85%까지 빠르게
     *  3) 나머지 15%를 천천히 (도착 직전 속도를 줄여 지나치지 않게)
     *  4) 목표점에서 멈춘 채 대기 (게임이 최종 위치를 확정하도록) → 손 뗌
     * 각 단계는 이어지는 스트로크라 손가락은 계속 눌린 상태다.
     * @param onSettle 4단계(멈춰 있는 동안) 시작 시 호출 — 진단용 화면 캡처에 사용
     */
    fun drag(
        path: DragPath, handler: Handler,
        holdMs: Long = 160, fastMs: Long = 260, slowMs: Long = 220, settleMs: Long = 260,
        onSettle: (() -> Unit)? = null, onDone: (Boolean) -> Unit,
    ) {
        val sx = path.fromX; val sy = path.fromY
        val mx = sx + (path.toX - sx) * 0.85f; val my = sy + (path.toY - sy) * 0.85f
        val p1 = Path().apply { moveTo(sx, sy); lineTo(sx + 1f, sy + 1f) }
        val s1 = GestureDescription.StrokeDescription(p1, 0, holdMs, true)
        val p2 = Path().apply { moveTo(sx + 1f, sy + 1f); lineTo(mx, my) }
        val s2 = s1.continueStroke(p2, 0, fastMs, true)
        val p3 = Path().apply { moveTo(mx, my); lineTo(path.toX, path.toY) }
        val s3 = s2.continueStroke(p3, 0, slowMs, true)
        val p4 = Path().apply { moveTo(path.toX, path.toY); lineTo(path.toX + 0.5f, path.toY) }
        val s4 = s3.continueStroke(p4, 0, settleMs, false)

        var finished = false
        fun finish(ok: Boolean) { if (!finished) { finished = true; onDone(ok) } }
        fun dispatch(stroke: GestureDescription.StrokeDescription, next: (() -> Unit)?) {
            val ok = dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) { if (next != null) next() else finish(true) }
                override fun onCancelled(gestureDescription: GestureDescription?) = finish(false)
            }, handler)
            if (!ok) finish(false)
        }
        dispatch(s1) { dispatch(s2) { dispatch(s3) { onSettle?.invoke(); dispatch(s4, null) } } }
    }

    companion object {
        @Volatile var instance: BotService? = null
            private set
    }
}
