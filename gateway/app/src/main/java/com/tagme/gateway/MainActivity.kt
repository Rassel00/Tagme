package com.tagme.gateway

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.text.format.DateUtils
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast

/** 서버 설정(GW-03), 권한·배터리 예외 안내(GW-04), 시작·중지, 발송 실험, 상태·로그 표시 */
class MainActivity : Activity() {

    private val handler = Handler(Looper.getMainLooper())
    private val refresher = object : Runnable {
        override fun run() {
            renderStatus()
            handler.postDelayed(this, 1000)
        }
    }

    private lateinit var serverUrl: EditText
    private lateinit var gatewayKey: EditText
    private lateinit var testPhone: EditText

    private val requiredPermissions: Array<String>
        get() = buildList {
            add(Manifest.permission.SEND_SMS)
            add(Manifest.permission.RECEIVE_SMS)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) add(Manifest.permission.POST_NOTIFICATIONS)
        }.toTypedArray()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        serverUrl = findViewById(R.id.serverUrl)
        gatewayKey = findViewById(R.id.gatewayKey)
        testPhone = findViewById(R.id.testPhone)
        serverUrl.setText(Prefs.serverUrl(this))
        gatewayKey.setText(Prefs.gatewayKey(this))

        findViewById<Button>(R.id.saveButton).setOnClickListener { save(showToast = true) }
        findViewById<Button>(R.id.checkButton).setOnClickListener { checkConnection() }
        findViewById<Button>(R.id.permissionButton).setOnClickListener { requestPermissions(requiredPermissions, 1) }
        findViewById<Button>(R.id.batteryButton).setOnClickListener { requestBatteryExemption() }
        findViewById<Button>(R.id.toggleButton).setOnClickListener { toggle() }
        findViewById<Button>(R.id.testButton).setOnClickListener { sendTest() }

        if (!isBatteryExempt()) showBatteryGuide()
    }

    override fun onResume() {
        super.onResume()
        handler.post(refresher)
    }

    override fun onPause() {
        handler.removeCallbacks(refresher)
        super.onPause()
    }

    // ---------------------------------------------------------------- 설정

    private fun save(showToast: Boolean) {
        Prefs.of(this).edit()
            .putString(Prefs.KEY_SERVER_URL, serverUrl.text.toString().trim().trimEnd('/'))
            .putString(Prefs.KEY_GATEWAY_KEY, gatewayKey.text.toString().trim())
            .apply()
        if (showToast) toast("저장했습니다")
    }

    private fun checkConnection() {
        save(showToast = false)
        if (!Prefs.isConfigured(this)) {
            toast("서버 주소(http로 시작)와 게이트웨이 키를 입력하세요")
            return
        }
        val api = ApiClient(Prefs.serverUrl(this), Prefs.gatewayKey(this))
        Thread {
            val result = runCatching { api.ping() }
            runOnUiThread {
                val message = result.fold(
                    onSuccess = { "연결 성공: 서버와 키가 확인되었습니다" },
                    onFailure = { "연결 실패: ${it.message}" },
                )
                Prefs.log(this, message)
                toast(message)
            }
        }.start()
    }

    // ---------------------------------------------------------------- 권한·배터리

    private fun hasPermissions(): Boolean =
        requiredPermissions.all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }

    private fun isBatteryExempt(): Boolean =
        getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)

    private fun showBatteryGuide() {
        AlertDialog.Builder(this)
            .setTitle(R.string.battery_dialog_title)
            .setMessage(R.string.battery_dialog_message)
            .setPositiveButton(R.string.go_settings) { _, _ -> requestBatteryExemption() }
            .setNegativeButton(R.string.later, null)
            .show()
    }

    @SuppressLint("BatteryLife")
    private fun requestBatteryExemption() {
        if (isBatteryExempt()) {
            toast("이미 배터리 최적화에서 제외되어 있습니다")
            return
        }
        val direct = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
        try {
            startActivity(direct)
        } catch (e: Exception) {
            // 일부 기기는 직접 요청 화면이 없어 목록 화면으로 보낸다
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    // ---------------------------------------------------------------- 시작·중지

    private fun toggle() {
        if (Prefs.of(this).getBoolean(Prefs.KEY_RUNNING, false)) {
            GatewayService.stop(this)
            return
        }
        save(showToast = false)
        when {
            !Prefs.isConfigured(this) -> toast("서버 주소와 게이트웨이 키를 먼저 저장하세요")
            !hasPermissions() -> requestPermissions(requiredPermissions, 2)
            else -> GatewayService.start(this)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (!hasPermissions()) {
            toast("문자 권한이 없으면 게이트웨이를 쓸 수 없습니다")
        } else if (requestCode == 2) {
            GatewayService.start(this)
        }
        renderStatus()
    }

    // ---------------------------------------------------------------- 발송 실험 (WBS 1.5)

    private fun sendTest() {
        val phone = testPhone.text.toString().filter { it.isDigit() }
        if (!phone.matches(Regex("^01\\d{8,9}$"))) {
            toast("휴대폰 번호를 입력하세요")
            return
        }
        if (checkSelfPermission(Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(requiredPermissions, 1)
            return
        }
        // 실제 보호자 문자(개발 문서 7.3)와 같은 형식·길이
        val body = listOf(
            "[응급안심] 시험 발송입니다. 실제 신고가 아닙니다.",
            "긴급상황입니다. 위치 확인 부탁드립니다",
            "위치: https://maps.google.com/?q=37.293900,126.974400",
            "신고자: 010-0000-0000 (미인증)",
            "상황 확인·응급정보 열람 승인:",
            "https://tagme.example.com/a/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCd",
        ).joinToString("\n")
        val id = "test-" + System.currentTimeMillis()
        val parts = SmsSender.send(this, id, phone, body) { isSent, error ->
            Prefs.log(this, if (isSent) "시험 발송 완료 ${Prefs.maskPhone(phone)}" else "시험 발송 실패: $error")
        }
        Prefs.log(this, "시험 문자 ${body.length}자 → ${parts}개로 분할해 발송")
    }

    // ---------------------------------------------------------------- 상태

    private fun renderStatus() {
        val prefs = Prefs.of(this)
        val isRunning = prefs.getBoolean(Prefs.KEY_RUNNING, false)
        val lastPoll = prefs.getLong(Prefs.KEY_LAST_POLL, 0)
        val lastError = prefs.getString(Prefs.KEY_LAST_ERROR, "")!!

        findViewById<TextView>(R.id.statusTitle).text = when {
            !isRunning -> "중지됨"
            lastError.isNotEmpty() -> "동작 중 · 서버 연결 오류"
            else -> "동작 중"
        }
        findViewById<TextView>(R.id.statusDetail).text = buildString {
            append("마지막 확인: ")
            append(if (lastPoll == 0L) "-" else DateUtils.getRelativeTimeSpanString(lastPoll))
            append("\n발송 ${prefs.getInt(Prefs.KEY_SENT, 0)} · 실패 ${prefs.getInt(Prefs.KEY_FAILED, 0)}")
            append(" · 본인 확인 수신 ${prefs.getInt(Prefs.KEY_INBOUND, 0)}")
            if (lastError.isNotEmpty()) append("\n오류: $lastError")
        }
        findViewById<Button>(R.id.toggleButton).setText(if (isRunning) R.string.stop else R.string.start)
        findViewById<TextView>(R.id.setupStatus).text = buildString {
            append(if (hasPermissions()) "✓ 문자·알림 권한 허용됨" else "✗ 문자·알림 권한 필요")
            append("\n")
            append(if (isBatteryExempt()) "✓ 배터리 최적화 예외됨" else "✗ 배터리 최적화 예외 필요 (화면이 꺼지면 멈출 수 있음)")
        }
        findViewById<TextView>(R.id.log).text = prefs.getString(Prefs.KEY_LOG, "")
    }

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
}
