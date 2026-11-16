import 'package:flutter/material.dart';

import '../theme.dart';

/// 시안의 흰 카드 + 빨간 아이콘 제목
class SectionCard extends StatelessWidget {
  const SectionCard({super.key, required this.icon, required this.title, required this.children, this.trailing});

  final IconData icon;
  final String title;
  final List<Widget> children;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(icon, color: AppColors.red, size: 22),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                ),
                ?trailing,
              ],
            ),
            const SizedBox(height: 8),
            ...children,
          ],
        ),
      ),
    );
  }
}

/// TagMe 로고 (하트 + 심전도)
class AppLogo extends StatelessWidget {
  const AppLogo({super.key, this.size = 72});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: AppColors.red,
        borderRadius: BorderRadius.circular(size * 0.26),
        boxShadow: [BoxShadow(color: AppColors.red.withValues(alpha: 0.3), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Icon(Icons.monitor_heart_rounded, color: Colors.white, size: size * 0.58),
    );
  }
}

/// 상태 배지 (NFC 등록 완료 / 미등록 등)
class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.label, required this.isPositive});

  final String label;
  final bool isPositive;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: isPositive ? AppColors.greenSoft : AppColors.background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isPositive ? Icons.check_circle : Icons.radio_button_unchecked,
            size: 14,
            color: isPositive ? AppColors.green : AppColors.text3,
          ),
          const SizedBox(width: 4),
          // 큰 글씨에서도 배지 안에서 줄바꿈되도록
          Flexible(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: isPositive ? AppColors.green : AppColors.text2,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

void showMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// 화면 하단에 고정되는 저장 버튼 영역
class BottomActionBar extends StatelessWidget {
  const BottomActionBar({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(padding: const EdgeInsets.fromLTRB(20, 8, 20, 12), child: child),
    );
  }
}

/// 연한 배경의 안내 문구
class NoticeBox extends StatelessWidget {
  const NoticeBox({super.key, required this.text, this.icon = Icons.info_outline});

  final String text;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.redSoft, borderRadius: BorderRadius.circular(12)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: AppColors.redStrong),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: const TextStyle(fontSize: 14, height: 1.5, color: AppColors.text)),
          ),
        ],
      ),
    );
  }
}

/// 저장하지 않은 변경을 버릴지 묻는다. @return 나가도 되면 true
Future<bool> confirmDiscard(BuildContext context) async {
  final leave = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('저장하지 않고 나갈까요?'),
      content: const Text('입력한 내용이 저장되지 않습니다.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('계속 입력')),
        TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('나가기')),
      ],
    ),
  );
  return leave ?? false;
}

/// 빈 목록 안내
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, required this.description, this.action});

  final IconData icon;
  final String title;
  final String description;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 28, 20, 20),
        child: Column(
          children: [
            Icon(icon, size: 48, color: AppColors.text3),
            const SizedBox(height: 10),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            Text(
              description,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.text2, height: 1.5),
            ),
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
  }
}
