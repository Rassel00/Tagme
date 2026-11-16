package com.tagme.gateway

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * 포그라운드 서비스에서 3초마다 발송 대기 건을 가져와 문자를 보내고 결과를 보고한다 (GW-01·02).
 * 화면이 꺼져도 동작하도록 부분 wake lock 을 잡는다. 시연 중에는 충전기에 꽂아 두는 것을 전제로 한다.
 */
class GatewayService : Service() {

    companion object {
        private const val CHANNEL_ID = "gateway"
        private const val NOTIFICATION_ID = 1
        private const val POLL_SECONDS = 3L
        const val ACTION_STOP = "com.tagme.gateway.STOP"

        fun start(context: Context) {
            val intent = Intent(context, GatewayService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
            else context.startService(intent)
        }

        fun stop(context: Context) {
            context.startService(Intent(context, GatewayService::class.java).setAction(ACTION_STOP))
        }
    }

    private var scheduler: ScheduledExecutorService? = null
    /** 결과 보고는 폴링과 따로 돌려 느린 응답이 폴링을 막지 않게 */
    private val reporter = Executors.newSingleThreadExecutor()
    private var wakeLock: PowerManager.WakeLock? = null
    private var lastErrorLogged: String? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        startInForeground()
        if (scheduler == null) {
            acquireWakeLock()
            Prefs.of(this).edit().putBoolean(Prefs.KEY_RUNNING, true).apply()
            Prefs.log(this, "게이트웨이 시작 (${POLL_SECONDS}초마다 확인)")
            scheduler = Executors.newSingleThreadScheduledExecutor().also {
                it.scheduleWithFixedDelay({ pollSafely() }, 0, POLL_SECONDS, TimeUnit.SECONDS)
            }
        }
        // 시스템이 서비스를 죽였다가 다시 살리면 폴링을 이어간다
        return START_STICKY
    }

    override fun onDestroy() {
        scheduler?.shutdownNow()
        scheduler = null
        reporter.shutdown()
        wakeLock?.takeIf { it.isHeld }?.release()
        Prefs.of(this).edit().putBoolean(Prefs.KEY_RUNNING, false).apply()
        Prefs.log(this, "게이트웨이 중지")
        super.onDestroy()
    }

    private fun pollSafely() {
        try {
            poll()
            Prefs.of(this).edit()
                .putLong(Prefs.KEY_LAST_POLL, System.currentTimeMillis())
                .putString(Prefs.KEY_LAST_ERROR, "")
                .apply()
            lastErrorLogged = null
        } catch (e: Exception) {
            val message = e.message ?: e.javaClass.simpleName
            Prefs.of(this).edit().putString(Prefs.KEY_LAST_ERROR, message).apply()
            // 같은 오류가 3초마다 로그를 채우지 않게 바뀔 때만 기록
            if (message != lastErrorLogged) Prefs.log(this, "서버 연결 오류: $message")
            lastErrorLogged = message
        }
    }

    private fun poll() {
        if (!Prefs.isConfigured(this)) throw IllegalStateException("서버 주소·게이트웨이 키를 설정하세요")
        val api = ApiClient(Prefs.serverUrl(this), Prefs.gatewayKey(this))
        for (job in api.fetchJobs()) {
            val parts = SmsSender.send(this, job.id, job.phone, job.body) { isSent, error ->
                reporter.execute { report(api, job, isSent, error) }
            }
            Prefs.log(this, "발송 요청 ${Prefs.maskPhone(job.phone)} (${parts}개로 분할)")
        }
    }

    private fun report(api: ApiClient, job: ApiClient.SmsJob, isSent: Boolean, error: String?) {
        Prefs.increment(this, if (isSent) Prefs.KEY_SENT else Prefs.KEY_FAILED)
        Prefs.log(this, if (isSent) "발송 완료 ${Prefs.maskPhone(job.phone)}" else "발송 실패 ${Prefs.maskPhone(job.phone)}: $error")
        try {
            api.reportResult(job.id, isSent, error)
        } catch (e: Exception) {
            // 보고에 실패하면 서버가 2분 뒤 다시 대기로 돌려 재발송한다
            Prefs.log(this, "결과 보고 실패: ${e.message}")
        }
        updateNotification()
    }

    // ---------------------------------------------------------------- 알림

    private fun startInForeground() {
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW),
            )
        }
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun updateNotification() {
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification())
    }

    private fun buildNotification(): Notification {
        val prefs = Prefs.of(this)
        val openApp = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setSmallIcon(R.drawable.ic_gateway)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText("발송 ${prefs.getInt(Prefs.KEY_SENT, 0)} · 실패 ${prefs.getInt(Prefs.KEY_FAILED, 0)}")
            .setContentIntent(openApp)
            .setOngoing(true)
            .build()
    }

    private fun acquireWakeLock() {
        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "tagme:gateway")
            .apply {
                setReferenceCounted(false)
                acquire()
            }
    }
}
