package com.tagme.gateway

import android.content.Context
import android.content.SharedPreferences
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** 설정값과 화면에 보여줄 상태를 SharedPreferences 에 둔다 (서비스·화면·수신기가 공유). */
object Prefs {
    private const val NAME = "gateway"
    private const val MAX_LOG_LINES = 40

    const val KEY_SERVER_URL = "serverUrl"
    const val KEY_GATEWAY_KEY = "gatewayKey"
    const val KEY_RUNNING = "running"
    const val KEY_LAST_POLL = "lastPollAt"
    const val KEY_LAST_ERROR = "lastError"
    const val KEY_SENT = "sentCount"
    const val KEY_FAILED = "failedCount"
    const val KEY_INBOUND = "inboundCount"
    const val KEY_LOG = "log"

    fun of(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    fun serverUrl(context: Context): String = of(context).getString(KEY_SERVER_URL, "")!!.trimEnd('/')
    fun gatewayKey(context: Context): String = of(context).getString(KEY_GATEWAY_KEY, "")!!

    fun isConfigured(context: Context): Boolean =
        serverUrl(context).startsWith("http") && gatewayKey(context).isNotBlank()

    fun increment(context: Context, key: String) {
        val prefs = of(context)
        prefs.edit().putInt(key, prefs.getInt(key, 0) + 1).apply()
    }

    /** 최근 로그를 위에서부터 쌓는다 (최대 40줄). 전화번호는 뒤 4자리만 남긴다. */
    @Synchronized
    fun log(context: Context, message: String) {
        val time = SimpleDateFormat("HH:mm:ss", Locale.KOREA).format(Date())
        val prefs = of(context)
        val lines = listOf("$time  $message") + prefs.getString(KEY_LOG, "")!!.lines().filter { it.isNotBlank() }
        prefs.edit().putString(KEY_LOG, lines.take(MAX_LOG_LINES).joinToString("\n")).apply()
    }

    fun maskPhone(phone: String): String {
        val digits = phone.filter { it.isDigit() }
        return if (digits.length >= 4) "***-${digits.takeLast(4)}" else "***"
    }
}
