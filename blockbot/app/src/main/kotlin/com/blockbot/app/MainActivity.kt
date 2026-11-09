package com.blockbot.app

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.FrameLayout
import android.widget.Button
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import com.blockbot.core.ComboMode
import com.blockbot.core.DragModel

/** 설정·안내 화면. 실제 동작은 접근성 서비스(BotService)와 화면 위 패널에서. */
class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private lateinit var serviceStatus: TextView
    private lateinit var calText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        val pad = (16 * resources.displayMetrics.density).toInt()
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad * 2, pad, pad) }

        fun title(t: String) = TextView(this).apply { text = t; textSize = 18f; typeface = Typeface.DEFAULT_BOLD; setPadding(0, pad, 0, pad / 3) }
        fun body(t: String) = TextView(this).apply { text = t; textSize = 14f; setTextColor(0xFF374151.toInt()) }

        col.addView(TextView(this).apply { text = "BlockBot"; textSize = 26f; typeface = Typeface.DEFAULT_BOLD })
        col.addView(body("8×8 블록 퍼즐 힌트 / 자동 플레이"))

        col.addView(title("1. 접근성 서비스"))
        serviceStatus = TextView(this).apply { textSize = 15f; typeface = Typeface.DEFAULT_BOLD }
        col.addView(serviceStatus)
        col.addView(Button(this).apply {
            text = "접근성 설정 열기"
            setOnClickListener { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        })
        col.addView(body("맥에서 mac/run.sh로 설치했다면 자동으로 켜져 있습니다. 꺼져 있으면 위 버튼 → 설치된 앱 → BlockBot → 켜기."))
        col.addView(Button(this).apply {
            text = "화면 패널 다시 열기"
            setOnClickListener {
                val svc = BotService.instance
                if (svc != null) { svc.reopenPanel(); android.widget.Toast.makeText(this@MainActivity, "패널을 열었습니다. 게임으로 돌아가세요.", android.widget.Toast.LENGTH_SHORT).show() }
                else android.widget.Toast.makeText(this@MainActivity, "접근성 서비스가 꺼져 있습니다", android.widget.Toast.LENGTH_SHORT).show()
            }
        })

        col.addView(title("2. 사용법"))
        col.addView(body(
            "• 게임을 열면 화면 위쪽에 [힌트][자동][정지] 패널이 뜹니다. 패널은 ⠿를 끌어 옮길 수 있습니다(보드·블록 영역은 피해서).\n" +
            "• 힌트: 놓을 자리를 ①분홍 ②하늘 ③노랑 테두리로 표시. 직접 두면 다음 수를 다시 계산합니다.\n" +
            "• 자동: 봇이 직접 드래그합니다. 처음 몇 수는 드래그 위치를 스스로 보정하느라 한두 칸 빗나갈 수 있습니다.\n" +
            "• 정지: 모든 동작 중지.\n" +
            "• 📷: 지금 화면과 인식 상태를 저장 (문제가 보이면 누르고 맥에서 mac/pull-logs.sh).\n" +
            "• —: 패널을 작은 BB 칩으로 접기 (칩을 탭하면 펼침).  ✕: 멈추고 패널 닫기 (이 화면의 \"화면 패널 다시 열기\"로 복구)."
        ))

        col.addView(title("3. 콤보 규칙"))
        col.addView(body("게임에서 콤보가 이어지는 조건. 모르면 그대로 두세요."))
        val combo = RadioGroup(this)
        val rbSliding = RadioButton(this).apply { id = View.generateViewId(); text = "3수 안에 다시 지우면 유지 (기본)" }
        val rbRound = RadioButton(this).apply { id = View.generateViewId(); text = "라운드(3블록)마다 1번 이상 지우면 유지" }
        combo.addView(rbSliding); combo.addView(rbRound)
        combo.check(if (prefs.comboMode == ComboMode.SLIDING) rbSliding.id else rbRound.id)
        combo.setOnCheckedChangeListener { _, id -> prefs.comboMode = if (id == rbSliding.id) ComboMode.SLIDING else ComboMode.PER_ROUND }
        col.addView(combo)

        col.addView(title("4. 자동 속도"))
        val speed = RadioGroup(this).apply { orientation = RadioGroup.HORIZONTAL }
        val speeds = listOf("빠름" to 450, "보통" to 700, "느림" to 1100)
        speeds.forEach { (label, ms) ->
            val rb = RadioButton(this).apply { id = View.generateViewId(); text = label }
            speed.addView(rb)
            if (prefs.moveDelayMs == ms) speed.check(rb.id)
            rb.setOnClickListener { prefs.moveDelayMs = ms }
        }
        col.addView(speed)

        col.addView(title("5. 학습 상태"))
        calText = body("")
        col.addView(calText)
        col.addView(Button(this).apply {
            text = "드래그 학습 초기화"
            setOnClickListener { prefs.dragObservations = emptyList(); refresh() }
        })

        col.addView(title("6. 로그"))
        col.addView(CheckBox(this).apply {
            text = "문제 상황 스크린샷 저장 (인식 개선용)"
            isChecked = prefs.saveScreens
            setOnCheckedChangeListener { _, b -> prefs.saveScreens = b }
        })
        col.addView(body("로그 위치: Android/data/$packageName/files/logs\n맥에서 mac/pull-logs.sh 로 가져올 수 있습니다."))

        // Android 15부터 앱이 상태바·내비게이션 바 아래까지 그려지므로(edge-to-edge) 그 높이만큼 여백을 줘야
        // 맨 위·맨 아래 내용이 가려지지 않고 끝까지 스크롤된다.
        val scroll = ScrollView(this).apply {
            setBackgroundColor(Color.WHITE)
            isFillViewport = true
            isVerticalScrollBarEnabled = true
            addView(col, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))
            setOnApplyWindowInsetsListener { _, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars())
                col.setPadding(pad, pad + bars.top, pad, pad * 3 + bars.bottom)
                insets
            }
        }
        setContentView(scroll, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun refresh() {
        val on = isServiceEnabled()
        serviceStatus.text = if (on) "● 켜짐 — 게임을 열면 패널이 보입니다" else "○ 꺼짐 — 아래 버튼으로 켜 주세요"
        serviceStatus.setTextColor(if (on) 0xFF059669.toInt() else 0xFFDC2626.toInt())
        val m = DragModel.fit(prefs.dragObservations)
        val models = listOfNotNull(getExternalFilesDir("model"), java.io.File(filesDir, "model"))
            .flatMap { d -> listOf("distribution.txt", "weights.txt").map { java.io.File(d, it) } }.filter { it.isFile }
        calText.text = "자동 드래그: ${m.describe()}\n" +
            "자동 모드로 둘 때마다 손가락 위치와 실제 착지 위치를 비교해 배율·띄움을 다시 맞춥니다.\n" +
            "학습 모델: " + (if (models.isEmpty()) "없음 (기본값 사용) — 맥에서 mac/learn.sh 실행 시 올라옵니다" else models.joinToString { it.name })
    }

    private fun isServiceEnabled(): Boolean {
        val enabled = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        val me = ComponentName(this, BotService::class.java)
        return enabled.split(':').any { ComponentName.unflattenFromString(it) == me }
    }
}
