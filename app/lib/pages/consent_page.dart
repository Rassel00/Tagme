import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/sign_out_dialog.dart';

/// 개인정보 동의 (APP-02). 필수 항목 전체 동의 시 진행, 약관 버전이 바뀌면 다시 보여준다.
///
/// - 로그인 후(구글, 약관이 바뀐 기존 사용자): 동의를 서버에 저장하고 [onCompleted]. 나가기 = 로그아웃(게스트는 계정 삭제)
/// - 게스트 가입 전([ConsentPage.guestSignUp]): 계정이 아직 없다. 동의하면 고른 항목을 돌려주고(pop),
///   시작 화면이 그때 게스트 계정을 만든다. 나가기 = 시작 화면으로 돌아가기
class ConsentPage extends StatefulWidget {
  const ConsentPage({super.key, required VoidCallback this.onCompleted}) : isGuestSignUp = false;

  const ConsentPage.guestSignUp({super.key}) : onCompleted = null, isGuestSignUp = true;

  final VoidCallback? onCompleted;
  final bool isGuestSignUp;

  @override
  State<ConsentPage> createState() => _ConsentPageState();
}

class _ConsentPageState extends State<ConsentPage> {
  final Set<String> _checked = {};
  String? _version;
  bool _isSaving = false;

  bool get _isRequiredComplete => consentItems.where((i) => i.isRequired).every((i) => _checked.contains(i.type));
  bool get _isAllChecked => consentItems.every((i) => _checked.contains(i.type));

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      if (widget.isGuestSignUp) {
        final version = await ApiClient.instance.getConsentVersion();
        if (mounted) setState(() => _version = version);
        return;
      }
      final status = await ApiClient.instance.getConsents();
      setState(() {
        _version = status.version;
        _checked.addAll(status.agreedTypes);
      });
    } catch (e) {
      if (mounted) showMessage(context, e.toString());
    }
  }

  Future<void> _submit() async {
    final version = _version;
    if (version == null) return;
    if (widget.isGuestSignUp) {
      Navigator.pop(context, PendingConsents(version: version, types: {..._checked}));
      return;
    }
    setState(() => _isSaving = true);
    try {
      final status = await ApiClient.instance.saveConsents(version, _checked);
      if (status.isComplete) widget.onCompleted?.call();
    } catch (e) {
      if (mounted) showMessage(context, e.toString());
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('개인정보 동의'),
        automaticallyImplyLeading: false,
        actions: [
          TextButton(
            onPressed: () => widget.isGuestSignUp ? Navigator.pop(context) : confirmSignOut(context),
            child: const Text('나가기'),
          ),
        ],
      ),
      body: _version == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
              children: [
                const Text(
                  '응급 상황에 내 정보를 전달하려면 아래 항목에 동의해 주세요.',
                  style: TextStyle(fontSize: 15, color: AppColors.text2, height: 1.5),
                ),
                const SizedBox(height: 16),
                Card(
                  child: CheckboxListTile(
                    value: _isAllChecked,
                    onChanged: (value) => setState(() {
                      value == true ? _checked.addAll(consentItems.map((i) => i.type)) : _checked.clear();
                    }),
                    title: const Text('모두 동의', style: TextStyle(fontWeight: FontWeight.w800)),
                    controlAffinity: ListTileControlAffinity.leading,
                  ),
                ),
                const SizedBox(height: 10),
                Card(
                  child: Column(
                    children: [
                      for (final item in consentItems)
                        CheckboxListTile(
                          value: _checked.contains(item.type),
                          onChanged: (value) =>
                              setState(() => value == true ? _checked.add(item.type) : _checked.remove(item.type)),
                          controlAffinity: ListTileControlAffinity.leading,
                          title: Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(
                                  text: item.isRequired ? '[필수] ' : '[선택] ',
                                  style: TextStyle(
                                    color: item.isRequired ? AppColors.red : AppColors.text3,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                TextSpan(
                                  text: item.title,
                                  style: const TextStyle(fontWeight: FontWeight.w700),
                                ),
                              ],
                            ),
                          ),
                          subtitle: Text(item.description, style: const TextStyle(fontSize: 13)),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Text('약관 버전 $_version · 시연용 동의 문구입니다.', style: const TextStyle(fontSize: 12, color: AppColors.text3)),
              ],
            ),
      bottomNavigationBar: BottomActionBar(
        child: FilledButton(
          onPressed: _isRequiredComplete && !_isSaving ? _submit : null,
          child: Text(_isSaving ? '저장 중…' : '동의하고 시작하기'),
        ),
      ),
    );
  }
}
