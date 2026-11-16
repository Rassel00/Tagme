# 문자 게이트웨이 앱 (Android, Kotlin)

팀원 Android 폰을 문자 발송기로 쓰는 앱. 서버가 쌓은 보호자 문자를 3초마다 가져와 보내고, 신고자가 보낸 본인 확인 문자(`SOS-{코드}`)를 서버로 전달한다. Play 스토어 없이 APK 를 직접 설치한다.

- 패키지: `com.tagme.gateway`, minSdk 26 (Android 8.0), targetSdk 34
- 외부 라이브러리 없음 (Android 기본 API + Kotlin 표준 라이브러리)

## 동작

| 기능 | 내용 |
| --- | --- |
| GW-01 발송 대기 조회 | 포그라운드 서비스에서 3초마다 `GET /api/gateway/sms-jobs` |
| GW-02 SMS 발송 | 수신자별 개별 발송, 긴 문자는 자동 분할, 모든 조각 결과를 모아 `POST /api/gateway/sms-jobs/:jobId/result` |
| GW-03 게이트웨이 인증 | 모든 요청에 `X-Gateway-Key` (서버 `.env` 의 `GATEWAY_KEY`) |
| GW-04 배터리 최적화 예외 | 첫 실행 시 안내 팝업, 설정 화면 버튼 |
| GW-05 본인 확인 문자 수신 | `SOS` 가 들어간 문자만 `POST /api/gateway/inbound-sms` 로 전달 (다른 문자는 서버로 보내지 않음) |

결과 보고 없이 앱이 멈추면 서버가 2분 뒤 그 건을 다시 대기로 돌리고, 3번 시도 후 실패로 처리한다.

## 빌드

Android Studio 로 `gateway/` 폴더를 열거나, 명령줄에서:

```bash
cd gateway
./gradlew assembleDebug
```

결과: `gateway/app/build/outputs/apk/debug/app-debug.apk`

- JDK 17 필요 (Android Studio 내장 JBR: `C:\Program Files\Android\Android Studio\jbr`)
- `local.properties` 에 `sdk.dir` 이 없으면 Android Studio 가 만들어 준다 (git 제외 파일)

## 설치 (WBS 5.6)

1. 게이트웨이 폰에서 **개발자 옵션 → USB 디버깅** 켜기 (설정 → 휴대전화 정보 → 빌드번호 7번 탭)
2. PC 와 USB 로 연결하고 폰에서 "USB 디버깅 허용"
3. 설치:
   ```bash
   adb install -r gateway/app/build/outputs/apk/debug/app-debug.apk
   ```
   USB 없이 설치하려면 APK 파일을 폰으로 옮겨 열고 "출처를 알 수 없는 앱" 설치를 허용한다.

## 설정과 시작

1. 앱 실행 → 배터리 최적화 예외 안내에서 **설정하기 → 허용**
2. **서버 주소**와 **게이트웨이 키** 입력 → 저장 → **연결 확인**
   - 배포 서버: `https://{Render 주소}`
   - PC 에서 띄운 개발 서버를 USB 로 쓸 때: PC 에서 `adb reverse tcp:3000 tcp:3000` 실행 후 `http://localhost:3000`
3. **문자·알림 권한 허용**
4. **게이트웨이 시작** → 알림 영역에 "응급안심 게이트웨이 동작 중"이 떠 있으면 정상

## 발송 실험 (WBS 1.5)

"발송 실험"에 동의한 번호를 넣고 **시험 문자 보내기** → 실제 보호자 문자와 같은 길이(약 200자)를 보내고, 몇 개로 나뉘었는지와 결과가 "최근 기록"에 남는다. 확인할 것:

- 받는 폰에서 한 통으로 합쳐 보이는지(장문), 조각으로 나뉘어 보이는지
- 요금제의 문자 한도 (조각 수만큼 차감될 수 있음)

## 시연 전 체크리스트 (개발 문서 9.2)

- **삼성 메시지 → 설정 → 채팅 설정(RCS) 끄기.** 켜져 있으면 신고자의 `SOS-코드` 문자가 RCS 채팅으로 와서 앱이 받지 못할 수 있다 (실기기에서 SOS 수신이 안 됐고 RCS 가 원인으로 추정, 재확인 필요)
- USB 로 PC 서버를 쓸 때 케이블을 다시 꽂으면 `adb reverse tcp:3000 tcp:3000` 을 다시 실행
- 앱 실행·"동작 중" 확인, 와이파이 또는 데이터 연결
- 배터리 최적화 예외 ✓, 충전기 연결
- 제조사 절전 기능(삼성 "사용하지 않는 앱 절전" 등)에서도 제외
