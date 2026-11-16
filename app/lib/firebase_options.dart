// Firebase 프로젝트 tagme-90419 의 Android 앱(com.tagme.emergency) 설정.
// google-services.json 에서 옮긴 공개용 값이다 (앱에 그대로 들어가는 값이라 비밀이 아님).
// 서버용 서비스 계정 키는 여기가 아니라 server/.env 에 있다.
import 'package:firebase_core/firebase_core.dart';

class DefaultFirebaseOptions {
  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyBtK6vbIMxNjggTiApuAOwPKRxfjlX14qo',
    appId: '1:893077662553:android:24f2944cfd55363d797a48',
    messagingSenderId: '893077662553',
    projectId: 'tagme-90419',
    storageBucket: 'tagme-90419.firebasestorage.app',
  );

  /// Google 로그인에서 Firebase 용 ID 토큰을 받기 위한 웹 클라이언트 ID (client_type 3)
  static const String googleServerClientId = '893077662553-3f5c7475o3es3t41u6qlrl6esnpqba6b.apps.googleusercontent.com';
}
