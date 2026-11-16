package com.tagme.gateway

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * 백엔드 게이트웨이 API (개발 문서 6.4). 모든 요청에 X-Gateway-Key 를 붙인다.
 * 네트워크 호출이라 메인 스레드에서 부르면 안 된다.
 */
class ApiClient(private val baseUrl: String, private val gatewayKey: String) {

    data class SmsJob(val id: String, val phone: String, val body: String)

    class HttpException(val status: Int, message: String) : IOException(message)

    /** 키가 맞는지 확인 (발송 건을 가져가지 않음) */
    fun ping() {
        request("GET", "/api/gateway/ping", null)
    }

    /** 발송 대기 건. 서버는 이 응답과 함께 해당 건을 sending 으로 바꾼다. */
    fun fetchJobs(): List<SmsJob> {
        val array = JSONArray(request("GET", "/api/gateway/sms-jobs", null))
        return (0 until array.length()).map { i ->
            val job = array.getJSONObject(i)
            SmsJob(job.getString("jobId"), job.getString("phone"), job.getString("body"))
        }
    }

    fun reportResult(jobId: String, isSent: Boolean, error: String?) {
        val body = JSONObject().put("status", if (isSent) "sent" else "failed")
        if (!isSent) body.put("error", error ?: "unknown")
        request("POST", "/api/gateway/sms-jobs/$jobId/result", body)
    }

    /** @return 신고 코드와 매칭됐는지 */
    fun forwardInbound(from: String, body: String, receivedAtIso: String): Boolean {
        val payload = JSONObject().put("from", from).put("body", body).put("receivedAt", receivedAtIso)
        return JSONObject(request("POST", "/api/gateway/inbound-sms", payload)).optBoolean("matched")
    }

    private fun request(method: String, path: String, body: JSONObject?): String {
        val connection = URL(baseUrl + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 10_000
            connection.readTimeout = 15_000
            connection.setRequestProperty("X-Gateway-Key", gatewayKey)
            connection.setRequestProperty("Accept", "application/json")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            if (status !in 200..299) {
                val message = runCatching { JSONObject(text).getJSONObject("error").getString("message") }
                    .getOrDefault("HTTP $status")
                throw HttpException(status, message)
            }
            return text
        } finally {
            connection.disconnect()
        }
    }
}
