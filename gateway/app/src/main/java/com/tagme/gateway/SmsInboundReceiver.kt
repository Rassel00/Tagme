package com.tagme.gateway

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * 신고자가 보낸 본인 확인 문자(SOS-{코드})를 서버로 전달한다 (GW-05).
 * SOS 가 들어간 문자만 보내고, 나머지 개인 문자는 서버로 보내지 않는다.
 */
class SmsInboundReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        if (!Prefs.isConfigured(context)) return

        // 긴 문자는 여러 PDU 로 오므로 발신번호별로 이어 붙인다
        val bySender = linkedMapOf<String, StringBuilder>()
        var receivedAt = System.currentTimeMillis()
        for (message in Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return) {
            val sender = message.originatingAddress ?: continue
            bySender.getOrPut(sender) { StringBuilder() }.append(message.messageBody ?: "")
            receivedAt = message.timestampMillis
        }
        val matches = bySender.filterValues { it.contains("SOS", ignoreCase = true) }
        if (matches.isEmpty()) return

        val pending = goAsync()
        Thread {
            try {
                val api = ApiClient(Prefs.serverUrl(context), Prefs.gatewayKey(context))
                for ((sender, body) in matches) {
                    val matched = runCatching { api.forwardInbound(sender, body.toString(), iso(receivedAt)) }
                    Prefs.increment(context, Prefs.KEY_INBOUND)
                    Prefs.log(
                        context,
                        when {
                            matched.isFailure -> "본인 확인 문자 전달 실패 ${Prefs.maskPhone(sender)}: ${matched.exceptionOrNull()?.message}"
                            matched.getOrDefault(false) -> "본인 확인 완료 ${Prefs.maskPhone(sender)}"
                            else -> "본인 확인 문자 수신 (일치하는 신고 없음) ${Prefs.maskPhone(sender)}"
                        },
                    )
                }
            } finally {
                pending.finish()
            }
        }.start()
    }

    private fun iso(millis: Long): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }
            .format(Date(millis))
}
