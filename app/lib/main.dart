import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'api/api_client.dart';
import 'config.dart';
import 'firebase_options.dart';
import 'pages/consent_page.dart';
import 'pages/home_page.dart';
import 'pages/start_page.dart';
import 'services/auth_service.dart';
import 'theme.dart';
import 'widgets/sign_out_dialog.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.android);
  runApp(const TagmeApp());
}

class TagmeApp extends StatelessWidget {
  const TagmeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConfig.appName,
      theme: buildAppTheme(),
      debugShowCheckedModeBanner: false,
      home: const AuthGate(),
    );
  }
}

/// 로그인 상태에 따라 시작 화면 → (필수 동의) → 홈으로 보낸다.
class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: AuthService.instance.userChanges,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) return const _Splash();
        final user = snapshot.data;
        if (user == null) return const StartPage();
        // uid 가 바뀌면(다른 계정) 사용자 등록·동의 확인을 새로 한다
        return _RegisteredGate(key: ValueKey(user.uid));
      },
    );
  }
}

class _RegisteredGate extends StatefulWidget {
  const _RegisteredGate({super.key});

  @override
  State<_RegisteredGate> createState() => _RegisteredGateState();
}

class _RegisteredGateState extends State<_RegisteredGate> {
  bool? _isConsentRequired;
  String? _error;

  @override
  void initState() {
    super.initState();
    _register();
  }

  /// 로그인 직후 POST /api/users/me 로 사용자 생성·조회
  Future<void> _register() async {
    setState(() => _error = null);
    try {
      final isRequired = await ApiClient.instance.registerMe();
      if (mounted) setState(() => _isConsentRequired = isRequired);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_error!, textAlign: TextAlign.center),
                const SizedBox(height: 12),
                FilledButton(onPressed: _register, child: const Text('다시 시도')),
                TextButton(onPressed: () => confirmSignOut(context), child: const Text('로그아웃')),
              ],
            ),
          ),
        ),
      );
    }
    return switch (_isConsentRequired) {
      null => const _Splash(),
      true => ConsentPage(onCompleted: () => setState(() => _isConsentRequired = false)),
      false => const HomePage(),
    };
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: CircularProgressIndicator()));
}
