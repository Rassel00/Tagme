import 'dart:async';

import 'package:flutter/material.dart';
import 'package:nfc_manager/nfc_manager.dart';

import '../api/api_client.dart';
import '../services/nfc_service.dart';
import '../theme.dart';

enum _WriteState { checking, waiting, done, failed }

/// NFC 등록 (APP-07): 태그에 URL 기록 → 다시 읽어 검증 → 서버에 nfc-written 표시.
/// @return 성공하면 true
Future<bool> showNfcWriteSheet(BuildContext context, {required String tagId, required String url}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isDismissible: false,
    enableDrag: false,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: Colors.white,
    builder: (_) => _NfcWriteSheet(tagId: tagId, url: url),
  );
  return result ?? false;
}

class _NfcWriteSheet extends StatefulWidget {
  const _NfcWriteSheet({required this.tagId, required this.url});

  final String tagId;
  final String url;

  @override
  State<_NfcWriteSheet> createState() => _NfcWriteSheetState();
}

class _NfcWriteSheetState extends State<_NfcWriteSheet> {
  _WriteState _state = _WriteState.checking;
  String _message = '';
  final Completer<void> _cancel = Completer<void>();

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void dispose() {
    if (!_cancel.isCompleted) _cancel.complete();
    super.dispose();
  }

  Future<void> _start() async {
    setState(() => _state = _WriteState.checking);
    final availability = await NfcService.instance.availability();
    if (!mounted) return;
    if (availability != NfcAvailability.enabled) {
      setState(() {
        _state = _WriteState.failed;
        _message = availability == NfcAvailability.disabled
            ? 'NFC 가 꺼져 있어요. 설정에서 NFC 를 켠 뒤 다시 시도하세요.'
            : '이 폰은 NFC 를 지원하지 않아요. URL 을 복사해 다른 폰의 NFC Tools 로 기록하세요.';
      });
      return;
    }
    setState(() => _state = _WriteState.waiting);
    try {
      await NfcService.instance.writeUrl(widget.url, cancel: _cancel.future);
      await ApiClient.instance.markNfcWritten(widget.tagId);
      if (mounted) setState(() => _state = _WriteState.done);
    } catch (e) {
      if (mounted && !_cancel.isCompleted) {
        setState(() {
          _state = _WriteState.failed;
          _message = e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final (IconData icon, Color color, String title, String desc) = switch (_state) {
      _WriteState.checking => (Icons.nfc, AppColors.text3, 'NFC 확인 중', ''),
      _WriteState.waiting => (Icons.nfc, AppColors.red, '태그를 폰 뒷면에 대세요', '기록이 끝날 때까지 태그를 떼지 마세요.'),
      _WriteState.done => (Icons.check_circle, AppColors.green, 'NFC 등록 완료', '이 태그를 대면 응급 지원 페이지가 열립니다.'),
      _WriteState.failed => (Icons.error_outline, AppColors.redStrong, '기록하지 못했어요', _message),
    };

    // 긴 오류 문구·큰 글씨에서도 넘치지 않게 스크롤
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Icon(icon, size: 72, color: color),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
            ),
            if (desc.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                desc,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.text2, height: 1.4),
              ),
            ],
            if (_state == _WriteState.waiting) ...[
              const SizedBox(height: 16),
              const Center(child: SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 3))),
            ],
            const SizedBox(height: 20),
            if (_state == _WriteState.done)
              FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('확인'))
            else ...[
              if (_state == _WriteState.failed) ...[
                FilledButton(onPressed: _start, child: const Text('다시 시도')),
                const SizedBox(height: 8),
              ],
              OutlinedButton(
                onPressed: () {
                  if (!_cancel.isCompleted) _cancel.complete();
                  Navigator.pop(context, false);
                },
                child: const Text('닫기'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
