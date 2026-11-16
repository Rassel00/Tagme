/// 앱 설정값. 빌드할 때 `--dart-define=API_BASE_URL=https://...` 로 바꾼다.
class AppConfig {
  static const String appName = 'TagMe';

  /// 기본값은 USB 연결 + `adb reverse tcp:3000 tcp:3000` 으로 PC 개발 서버를 쓰는 경우.
  static const String apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:3000');
}
