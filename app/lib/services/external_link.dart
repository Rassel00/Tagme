import 'package:flutter/services.dart';

/// 외부 브라우저로 URL 열기. 패키지 없이 Android Intent(ACTION_VIEW)를 쓰는 채널 (MainActivity.kt)
class ExternalLink {
  static const _channel = MethodChannel('tagme/external');

  /// @return 열었으면 true
  static Future<bool> open(String url) async {
    try {
      return await _channel.invokeMethod<bool>('openUrl', {'url': url}) ?? false;
    } on PlatformException {
      return false;
    }
  }
}
