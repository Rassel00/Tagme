# TagMe 사용자 앱 (Flutter, Android)

보호자가 대상자(어린이·어르신 등)의 응급정보와 비상연락처를 등록하고 NFC 태그에 기록하는 앱.

- 패키지 이름 `com.tagme.emergency`, Flutter 3.50 / Dart 3.14
- 패키지: firebase_core, firebase_auth, google_sign_in, nfc_manager, http

## 화면

| 탭 | 내용 |
| --- | --- |
| 홈 | 태그 추가(3단계: 대상자 → 비상연락처 → NFC 기록), 주변 AED 찾기(웹 `/aed`), 등록한 태그 |
| 대상자 | 응급정보와 항목별 공개 범위("누구나 보기 / 승인 후 보기") |
| 연락처 | 비상연락처 주소록 (고치면 연결된 태그에 바로 반영) |
| 설정 | 구글 계정 연결(게스트), 사용 가이드, 로그아웃 |

## 실행

```bash
cd app
E:/dev/sdk/flutter/bin/flutter.bat test
E:/dev/sdk/flutter/bin/flutter.bat build apk --debug
adb install -r build/app/outputs/flutter-apk/app-debug.apk
adb reverse tcp:3000 tcp:3000   # PC 개발 서버를 폰에서 localhost:3000 으로
```

배포 서버를 쓸 때: `flutter build apk --dart-define=API_BASE_URL=https://{서버 주소}`

JDK 17 이 필요하다 (Android Studio JBR: `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`).
