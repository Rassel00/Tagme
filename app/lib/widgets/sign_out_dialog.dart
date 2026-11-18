import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../services/auth_service.dart';
import '../theme.dart';
import 'common.dart';

/// 로그아웃 (11/18 변경).
/// - 구글 계정: 확인 후 로그아웃. 다시 로그인하면 이어서 쓸 수 있다.
/// - 게스트: 로그아웃하면 다시 들어올 수 없어, 나가기 = 게스트 계정 삭제.
///   서버에서 대상자·연락처·태그를 모두 지운다. 태그가 주인 없이 켜진 채 남아
///   보호자에게 알림이 계속 가는 것을 막기 위해서다.
Future<void> confirmSignOut(BuildContext context) async {
  final isGuest = FirebaseAuth.instance.currentUser?.isAnonymous ?? false;
  if (!isGuest) {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('로그아웃할까요?'),
        content: const Text('다시 구글로 로그인하면 이어서 사용할 수 있어요.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('취소')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('로그아웃')),
        ],
      ),
    );
    if (ok == true) await AuthService.instance.signOut();
    return;
  }

  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('게스트 계정을 삭제할까요?'),
      content: const Text(
        '게스트 계정은 나가면 다시 들어올 수 없어서, 나가려면 계정을 삭제해야 해요.\n\n'
        '등록한 대상자·비상연락처·태그가 모두 삭제되고, 태그를 대도 정보가 보이지 않으며 보호자에게 알림도 가지 않아요.\n\n'
        '정보를 유지하려면 먼저 설정에서 "구글 계정 연결"을 해 주세요.',
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('취소')),
        TextButton(
          onPressed: () => Navigator.pop(context, true),
          style: TextButton.styleFrom(foregroundColor: AppColors.red),
          child: const Text('삭제하고 나가기'),
        ),
      ],
    ),
  );
  if (ok != true) return;

  try {
    await ApiClient.instance.deleteMe();
  } catch (e) {
    // 서버에서 지우지 못했으면 나가지 않는다 (나가면 태그가 주인 없이 남는다)
    if (context.mounted) showMessage(context, '계정을 삭제하지 못했어요. ${e is ApiException ? e.message : '네트워크를 확인하세요.'}');
    return;
  }
  await AuthService.instance.signOut();
}
