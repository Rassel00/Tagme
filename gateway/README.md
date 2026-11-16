# 문자 게이트웨이 앱 (Android, Kotlin)

D4(11/19)에 생성 예정. Play 스토어 없이 APK 직접 설치.

- 포그라운드 서비스에서 3초마다 `GET /api/gateway/sms-jobs` 폴링 (헤더 `X-Gateway-Key`)
- SmsManager 로 수신자별 발송, 장문 분할, `POST /api/gateway/sms-jobs/:jobId/result` 로 결과 보고
- `SOS-{코드}` 수신 문자를 `POST /api/gateway/inbound-sms` 로 전달 (P1)
- 선행: 게이트웨이 실험(WBS 1.5)
