import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../api/models.dart';
import '../firebase_options.dart';

/// 구글·게스트(익명) 로그인 (APP-01), 게스트 → 구글 계정 연결 (APP-03)
class AuthService {
  AuthService._();

  static final instance = AuthService._();
  static bool _isGoogleInitialized = false;

  final FirebaseAuth _auth = FirebaseAuth.instance;

  Stream<User?> get userChanges => _auth.userChanges();
  User? get currentUser => _auth.currentUser;

  Future<void> _ensureGoogleInitialized() async {
    if (_isGoogleInitialized) return;
    await GoogleSignIn.instance.initialize(serverClientId: DefaultFirebaseOptions.googleServerClientId);
    _isGoogleInitialized = true;
  }

  Future<AuthCredential> _googleCredential() async {
    await _ensureGoogleInitialized();
    final account = await GoogleSignIn.instance.authenticate();
    final idToken = account.authentication.idToken;
    if (idToken == null) {
      throw FirebaseAuthException(code: 'missing-id-token', message: 'Google ID 토큰을 받지 못했습니다.');
    }
    return GoogleAuthProvider.credential(idToken: idToken);
  }

  Future<void> signInWithGoogle() async {
    await _auth.signInWithCredential(await _googleCredential());
  }

  /// 게스트 가입 전에 받은 동의. 계정을 만든 직후 AuthGate 가 서버에 저장하고 비운다
  PendingConsents? pendingGuestConsents;

  /// 게스트 계정 생성. 동의 화면에서 동의한 뒤에만 부른다 (11/18: 동의 전에는 계정을 만들지 않음)
  Future<void> signInAsGuest(PendingConsents consents) async {
    pendingGuestConsents = consents;
    try {
      await _auth.signInAnonymously();
    } catch (_) {
      pendingGuestConsents = null;
      rethrow;
    }
  }

  /// 게스트 계정에 구글 계정을 연결한다. uid 가 그대로라 등록한 대상자·태그가 유지된다.
  Future<void> linkGoogle() async {
    final user = _auth.currentUser;
    if (user == null) throw FirebaseAuthException(code: 'no-current-user', message: '로그인이 필요합니다.');
    await user.linkWithCredential(await _googleCredential());
    // 이메일·제공자 정보가 바뀌었으니 새 ID 토큰으로 갱신
    await user.reload();
    await user.getIdToken(true);
  }

  Future<void> signOut() async {
    pendingGuestConsents = null;
    if (_isGoogleInitialized) await GoogleSignIn.instance.signOut();
    await _auth.signOut();
  }

  /// 사용자가 취소했으면 null, 아니면 보여줄 문구
  static String? describeError(Object error) {
    if (error is GoogleSignInException) {
      if (error.code == GoogleSignInExceptionCode.canceled) return null;
      return '구글 로그인에 실패했습니다 (${error.code.name}).';
    }
    if (error is FirebaseAuthException) {
      switch (error.code) {
        case 'credential-already-in-use':
        case 'provider-already-linked':
          return '이미 다른 TagMe 계정에서 쓰고 있는 구글 계정입니다. 다른 구글 계정을 선택하세요.';
        case 'network-request-failed':
          return '네트워크 연결을 확인하세요.';
      }
      return '로그인에 실패했습니다: ${error.message ?? error.code}';
    }
    return '로그인에 실패했습니다: $error';
  }
}
