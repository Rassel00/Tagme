package com.tagme.gateway

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** SmsManager 의 조각별 전송 결과를 받는다. */
class SmsSentReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(SmsSender.EXTRA_JOB_ID) ?: return
        SmsSender.onPartResult(id, SmsSender.describeResult(resultCode))
    }
}
