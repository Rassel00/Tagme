import 'package:flutter/material.dart';

import '../api/models.dart';
import '../config.dart';
import 'consent_page.dart';
import '../services/auth_service.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// 시작 화면: 구글로 시작하기 / 게스트로 시작하기 (APP-01)
class StartPage extends StatefulWidget {
  const StartPage({super.key});

  @override
  State<StartPage> createState() => _StartPageState();
}

class _StartPageState extends State<StartPage> {
  bool _isBusy = false;

  Future<void> _run(Future<void> Function() signIn) async {
    setState(() => _isBusy = true);
    try {
      await signIn();
    } catch (e) {
      final message = AuthService.describeError(e);
      if (mounted && message != null) showMessage(context, message);
    } finally {
      if (mounted) setState(() => _isBusy = false);
    }
  }

  /// 게스트: 동의 화면을 먼저 보여주고, 동의했을 때만 게스트 계정을 만든다
  Future<void> _startAsGuest() async {
    final consents = await Navigator.push<PendingConsents>(
      context,
      MaterialPageRoute(builder: (_) => const ConsentPage.guestSignUp()),
    );
    if (consents == null || !mounted) return;
    await _run(() => AuthService.instance.signInAsGuest(consents));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      // 작은 화면·큰 글씨에서도 잘리지 않게: 화면 높이를 최소로 채우되 넘치면 스크롤
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: IntrinsicHeight(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Spacer(flex: 2),
                    const Center(child: AppLogo(size: 88)),
                    const SizedBox(height: 20),
                    const Text(
                      AppConfig.appName,
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'NFC 응급정보 시스템',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 16, color: AppColors.text2),
                    ),
                    const SizedBox(height: 18),
                    const Text(
                      '내 정보는 앱에서 등록하고,\n위급할 땐 태그 하나로 누구나 빠르게 확인할 수 있어요.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 15, height: 1.5, color: AppColors.text2),
                    ),
                    const Spacer(flex: 3),
                    FilledButton.icon(
                      onPressed: _isBusy ? null : () => _run(AuthService.instance.signInWithGoogle),
                      icon: const Icon(Icons.account_circle),
                      label: const Text('구글로 시작하기'),
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton(
                      onPressed: _isBusy ? null : _startAsGuest,
                      child: const Text('게스트로 시작하기'),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      '게스트로 시작하면 앱을 삭제했을 때 등록한 정보를 수정할 수 없어요.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: AppColors.text3),
                    ),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
