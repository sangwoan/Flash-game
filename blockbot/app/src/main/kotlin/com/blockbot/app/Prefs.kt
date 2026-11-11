package com.blockbot.app

import android.content.Context
import com.blockbot.core.ComboMode
import com.blockbot.core.DragObservation

/** 앱 설정 (SharedPreferences). */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("blockbot", Context.MODE_PRIVATE)

    var comboMode: ComboMode
        get() = runCatching { ComboMode.valueOf(sp.getString("comboMode", ComboMode.SLIDING.name)!!) }.getOrDefault(ComboMode.SLIDING)
        set(v) = sp.edit().putString("comboMode", v.name).apply()

    /** 자동 모드 속도: 0 = 최고속, 1 = 빠름, 2 = 보통(안전). */
    var autoSpeed: Int
        get() = sp.getInt("autoSpeed", 0).coerceIn(0, 2)
        set(v) = sp.edit().putInt("autoSpeed", v).apply()

    /** 한 수를 둔 뒤 다음 화면을 읽기까지 기다리는 시간(ms). */
    val moveDelayMs: Int get() = intArrayOf(100, 250, 600)[autoSpeed]
    /** 드래그 이동 속도 배수. */
    val dragSpeed: Double get() = doubleArrayOf(2.2, 1.5, 1.0)[autoSpeed]
    /** 블록을 집을 때 누르고 있는 시간(ms). */
    val pickupHoldMs: Long get() = longArrayOf(110, 150, 180)[autoSpeed]
    /** 이동 후 위치 확인 캡처 전 대기(ms). */
    val lookDelayMs: Long get() = longArrayOf(80, 100, 120)[autoSpeed]

    var saveScreens: Boolean
        get() = sp.getBoolean("saveScreens", true)
        set(v) = sp.edit().putBoolean("saveScreens", v).apply()

    /** 자동 드래그 관측(손가락 위치 → 실제 착지) 최근 [MAX_DRAG_OBS]개. 드래그 모델은 이걸로 매번 다시 맞춘다. */
    var dragObservations: List<DragObservation>
        get() = sp.getString("dragObs", "")!!.lines().mapNotNull { DragObservation.fromText(it) }
        set(v) = sp.edit().putString("dragObs", v.takeLast(MAX_DRAG_OBS).joinToString("\n") { it.toText() }).apply()

    /** 드래그 중 화면에서 본 위치와 실제 착지 칸의 일정한 차이 (게임이 블록을 착지점과 다르게 그리는 경우). */
    var visBiasRow: Int
        get() = sp.getInt("visBiasRow", 0)
        set(v) = sp.edit().putInt("visBiasRow", v).apply()
    var visBiasCol: Int
        get() = sp.getInt("visBiasCol", 0)
        set(v) = sp.edit().putInt("visBiasCol", v).apply()

    /** 드래그 중 화면에서 블록을 찾은 적이 있는가 (있으면 못 찾았을 때 그냥 놓지 않고 취소). */
    var servoWorks: Boolean
        get() = sp.getBoolean("servoWorks", false)
        set(v) = sp.edit().putBoolean("servoWorks", v).apply()

    var panelX: Int
        get() = sp.getInt("panelX", 24)
        set(v) = sp.edit().putInt("panelX", v).apply()

    var panelY: Int
        get() = sp.getInt("panelY", 90)
        set(v) = sp.edit().putInt("panelY", v).apply()

    companion object {
        const val MAX_DRAG_OBS = 80
    }
}
