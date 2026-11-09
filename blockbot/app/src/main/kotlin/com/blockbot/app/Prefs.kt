package com.blockbot.app

import android.content.Context
import com.blockbot.core.ComboMode
import com.blockbot.core.DragCalibration

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

    var calibration: DragCalibration
        get() = DragCalibration(
            liftCells = sp.getFloat("lift", 1.5f).toDouble(),
            offsetXCells = sp.getFloat("offX", 0f).toDouble(),
            samples = sp.getInt("calSamples", 0),
        )
        set(v) = sp.edit()
            .putFloat("lift", v.liftCells.toFloat())
            .putFloat("offX", v.offsetXCells.toFloat())
            .putInt("calSamples", v.samples)
            .apply()

    var panelX: Int
        get() = sp.getInt("panelX", 24)
        set(v) = sp.edit().putInt("panelX", v).apply()

    var panelY: Int
        get() = sp.getInt("panelY", 90)
        set(v) = sp.edit().putInt("panelY", v).apply()
}
