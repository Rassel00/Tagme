import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../theme.dart';

/// 주소록 연락처 추가·수정. 저장까지 하고 저장된 연락처를 돌려준다 (취소하면 null).
Future<AddressContact?> showContactForm(BuildContext context, {AddressContact? contact}) {
  return showDialog<AddressContact>(
    context: context,
    builder: (_) => _ContactFormDialog(contact: contact),
  );
}

class _ContactFormDialog extends StatefulWidget {
  const _ContactFormDialog({this.contact});

  final AddressContact? contact;

  @override
  State<_ContactFormDialog> createState() => _ContactFormDialogState();
}

class _ContactFormDialogState extends State<_ContactFormDialog> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.contact?.name);
  late final _relation = TextEditingController(text: widget.contact?.relation);
  late final _phone = TextEditingController(text: widget.contact?.phone);
  bool _isSaving = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _relation.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _isSaving = true;
      _error = null;
    });
    try {
      final saved = await ApiClient.instance.saveContact(
        AddressContact(
          contactId: widget.contact?.contactId,
          name: _name.text.trim(),
          relation: _relation.text.trim(),
          phone: _phone.text.replaceAll(RegExp(r'\D'), ''),
        ),
      );
      if (mounted) Navigator.pop(context, saved);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final linked = widget.contact?.tagCount ?? 0;
    return AlertDialog(
      title: Text(widget.contact == null ? '비상연락처 추가' : '비상연락처 수정'),
      scrollable: true,
      content: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextFormField(
              controller: _name,
              maxLength: 30,
              autofocus: widget.contact == null,
              decoration: const InputDecoration(labelText: '이름', counterText: ''),
              validator: (v) => (v ?? '').trim().isEmpty ? '이름을 입력하세요' : null,
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _relation,
              maxLength: 20,
              decoration: const InputDecoration(labelText: '관계 (선택, 예: 엄마, 담임 선생님)', counterText: ''),
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: '휴대폰 번호', hintText: '01012345678'),
              validator: (v) => RegExp(r'^01[016789]\d{7,8}$').hasMatch((v ?? '').replaceAll(RegExp(r'\D'), ''))
                  ? null
                  : '휴대폰 번호 형식이 아니에요',
            ),
            const SizedBox(height: 12),
            if (linked > 0)
              Text(
                '저장하면 이 연락처를 쓰는 태그 $linked개에 모두 반영됩니다.',
                style: const TextStyle(fontSize: 13, color: AppColors.redStrong, height: 1.4),
              ),
            const Text(
              '연락처 주인에게 TagMe 비상연락처로 등록한다는 사실을 알려 주세요.',
              style: TextStyle(fontSize: 13, color: AppColors.text3, height: 1.4),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: AppColors.redStrong)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _isSaving ? null : () => Navigator.pop(context), child: const Text('취소')),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(88, 48)),
          onPressed: _isSaving ? null : _submit,
          child: Text(_isSaving ? '저장 중…' : '저장'),
        ),
      ],
    );
  }
}
