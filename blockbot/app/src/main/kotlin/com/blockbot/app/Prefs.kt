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

    /** 자동 모드에서 한 수를 둔 뒤 다음 화면을 읽기까지 기다리는 시간(ms). */
    var moveDelayMs: Int
        get() = sp.getInt("moveDelayMs", 700)
        set(v) = sp.edit().putInt("moveDelayMs", v).apply()

    var saveScreens: Boolean
        get() = sp.getBoolean("saveScreens", true)
        set(v) = sp.edit().putBoolean("saveScreens", v).apply()

    /** 자동 드래그 관측(손가락 위치 → 실제 착지) 최근 [MAX_DRAG_OBS]개. 드래그 모델은 이걸로 매번 다시 맞춘다. */
    var dragObservations: List<DragObservation>
        get() = sp.getString("dragObs", "")!!.lines().mapNotNull { DragObservation.fromText(it) }
        set(v) = sp.edit().putString("dragObs", v.takeLast(MAX_DRAG_OBS).joinToString("\n") { it.toText() }).apply()

    var panelX: Int
        get() = sp.getInt("panelX", 24)
        set(v) = sp.edit().putInt("panelX", v).apply()

    var panelY: Int
        get() = sp.getInt("panelY", 90)
        set(v) = sp.edit().putInt("panelY", v).apply()

    companion object {
        const val MAX_DRAG_OBS = 40
    }
}
