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
     * 트레이 블록을 집어(잠깐 누름) 목표 지점까지 끌고 가서 잠깐 멈춘 뒤 놓는다.
     * 3단계 스트로크를 이어 붙여 실제 손가락 드래그처럼 보이게 한다.
     */
    fun drag(path: DragPath, handler: Handler, holdMs: Long = 120, moveMs: Long = 320, settleMs: Long = 120, onDone: (Boolean) -> Unit) {
        val p1 = Path().apply { moveTo(path.fromX, path.fromY); lineTo(path.fromX + 1f, path.fromY + 1f) }
        val s1 = GestureDescription.StrokeDescription(p1, 0, holdMs, true)
        val p2 = Path().apply { moveTo(path.fromX + 1f, path.fromY + 1f); lineTo(path.toX, path.toY) }
        val s2 = s1.continueStroke(p2, 0, moveMs, true)
        val p3 = Path().apply { moveTo(path.toX, path.toY); lineTo(path.toX + 1f, path.toY) }
        val s3 = s2.continueStroke(p3, 0, settleMs, false)

        fun dispatch(stroke: GestureDescription.StrokeDescription, next: (() -> Unit)?) {
            val ok = dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) { if (next != null) next() else onDone(true) }
                override fun onCancelled(gestureDescription: GestureDescription?) = onDone(false)
            }, handler)
            if (!ok) onDone(false)
        }
        dispatch(s1) { dispatch(s2) { dispatch(s3, null) } }
    }

    companion object {
        @Volatile var instance: BotService? = null
            private set
    }
}
