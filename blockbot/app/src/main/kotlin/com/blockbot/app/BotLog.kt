package com.blockbot.app

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 세션 로그: 폰의 Android/data/com.blockbot.app/files/logs/ 아래 JSONL.
 * 맥에서 mac/pull-logs.sh 로 가져와 가중치 튜닝·인식 개선에 사용.
 */
class BotLog(context: Context) {
    private val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
    val dir: File = File(context.getExternalFilesDir(null), "logs").apply { mkdirs() }
    private val file = File(dir, "session_$stamp.jsonl")
    private val screenDir = File(dir, "screens_$stamp")
    private var screensSaved = 0

    @Synchronized
    fun event(type: String, data: JSONObject = JSONObject()) {
        data.put("t", System.currentTimeMillis())
        data.put("type", type)
        runCatching { file.appendText(data.toString() + "\n") }
            .onFailure { Log.w(TAG, "log write failed", it) }
        Log.d(TAG, "$type ${data.optString("msg")}")
    }

    /** 문제 상황 스크린샷 (세션당 최대 MAX_SCREENS장). */
    fun screenshot(bmp: Bitmap, tag: String): String? {
        if (screensSaved >= MAX_SCREENS) return null
        screenDir.mkdirs()
        val f = File(screenDir, "%03d_%s.png".format(screensSaved++, tag.replace(Regex("[^A-Za-z0-9_-]"), "_")))
        return runCatching { FileOutputStream(f).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }; f.name }.getOrNull()
    }

    companion object {
        const val TAG = "BlockBot"
        const val MAX_SCREENS = 40

        fun json(vararg pairs: Pair<String, Any?>): JSONObject = JSONObject().apply {
            for ((k, v) in pairs) put(k, when (v) {
                is Collection<*> -> JSONArray(v.toList())
                is Map<*, *> -> JSONObject(v.mapKeys { it.key.toString() })
                else -> v ?: JSONObject.NULL
            })
        }
    }
}
