package com.tagme.gateway

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telephony.SmsManager
import java.util.concurrent.ConcurrentHashMap

/**
 * 수신자별 개별 발송 (GW-02). 긴 문자는 divideMessage 로 나눠 보내고,
 * 모든 조각의 전송 결과가 모이면 [onComplete] 로 한 번 알려준다.
 */
object SmsSender {

    const val EXTRA_JOB_ID = "jobId"
    const val EXTRA_PART = "part"

    private class Pending(var remaining: Int, var error: String?, val onComplete: (Boolean, String?) -> Unit)

    private val pending = ConcurrentHashMap<String, Pending>()

    private fun smsManager(context: Context): SmsManager =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(SmsManager::class.java)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getDefault()
        }

    /**
     * @param id 결과를 묶을 키 (서버 발송 건 ID 또는 테스트용 임의 값)
     * @return 나눈 조각 수
     */
    fun send(context: Context, id: String, phone: String, body: String, onComplete: (Boolean, String?) -> Unit): Int {
        val manager = smsManager(context)
        val parts = manager.divideMessage(body)
        pending[id] = Pending(parts.size, null, onComplete)

        val sentIntents = ArrayList<PendingIntent>(parts.size)
        for (index in parts.indices) {
            val intent = Intent(context, SmsSentReceiver::class.java)
                .putExtra(EXTRA_JOB_ID, id)
                .putExtra(EXTRA_PART, index)
            // 조각마다 다른 requestCode 로 만들어 PendingIntent 가 덮어써지지 않게
            sentIntents += PendingIntent.getBroadcast(
                context,
                (id + index).hashCode(),
                intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
        }

        try {
            if (parts.size == 1) {
                manager.sendTextMessage(phone, null, body, sentIntents[0], null)
            } else {
                manager.sendMultipartTextMessage(phone, null, parts, sentIntents, null)
            }
        } catch (e: Exception) {
            // 권한 없음·번호 오류 등 즉시 실패
            pending.remove(id)
            onComplete(false, e.javaClass.simpleName + ": " + (e.message ?: ""))
        }
        return parts.size
    }

    /** [SmsSentReceiver] 가 조각 하나의 결과를 받을 때마다 호출 */
    fun onPartResult(id: String, error: String?) {
        val entry = pending[id] ?: return
        val isDone = synchronized(entry) {
            if (error != null && entry.error == null) entry.error = error
            entry.remaining -= 1
            entry.remaining <= 0
        }
        if (isDone) {
            pending.remove(id)
            entry.onComplete(entry.error == null, entry.error)
        }
    }

    fun describeResult(resultCode: Int): String? = when (resultCode) {
        android.app.Activity.RESULT_OK -> null
        SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "RESULT_ERROR_GENERIC_FAILURE"
        SmsManager.RESULT_ERROR_NO_SERVICE -> "RESULT_ERROR_NO_SERVICE"
        SmsManager.RESULT_ERROR_NULL_PDU -> "RESULT_ERROR_NULL_PDU"
        SmsManager.RESULT_ERROR_RADIO_OFF -> "RESULT_ERROR_RADIO_OFF"
        SmsManager.RESULT_ERROR_LIMIT_EXCEEDED -> "RESULT_ERROR_LIMIT_EXCEEDED"
        SmsManager.RESULT_ERROR_SHORT_CODE_NOT_ALLOWED -> "RESULT_ERROR_SHORT_CODE_NOT_ALLOWED"
        else -> "RESULT_ERROR_$resultCode"
    }
}
