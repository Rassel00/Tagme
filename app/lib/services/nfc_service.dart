import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:nfc_manager/ndef_record.dart';
import 'package:nfc_manager/nfc_manager.dart';
import 'package:nfc_manager/nfc_manager_android.dart';

class NfcWriteException implements Exception {
  NfcWriteException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// NDEF URI 레코드 (NFC Forum URI RTD). 태그에는 URL 만 기록한다 (APP-07).
class NdefUri {
  /// 자주 쓰는 접두어는 1바이트 코드로 줄여 저장한다
  static const _prefixes = {0x04: 'https://', 0x03: 'http://', 0x02: 'https://www.', 0x01: 'http://www.'};

  static NdefRecord encode(String url) {
    var code = 0x00;
    var rest = url;
    for (final entry in _prefixes.entries.toList()..sort((a, b) => b.value.length.compareTo(a.value.length))) {
      if (url.startsWith(entry.value)) {
        code = entry.key;
        rest = url.substring(entry.value.length);
        break;
      }
    }
    return NdefRecord(
      typeNameFormat: TypeNameFormat.wellKnown,
      type: Uint8List.fromList([0x55]), // 'U'
      identifier: Uint8List(0),
      payload: Uint8List.fromList([code, ...utf8.encode(rest)]),
    );
  }

  /// 메시지의 첫 URI 레코드를 URL 로 (없으면 null)
  static String? decode(NdefMessage? message) {
    if (message == null) return null;
    for (final record in message.records) {
      if (record.typeNameFormat == TypeNameFormat.wellKnown &&
          record.type.length == 1 &&
          record.type[0] == 0x55 &&
          record.payload.isNotEmpty) {
        final prefix = _prefixes[record.payload[0]] ?? '';
        return prefix + utf8.decode(record.payload.sublist(1));
      }
    }
    return null;
  }
}

/// 태그에 URL 을 쓰고 다시 읽어 검증한다 (Android). 태그 잠금(read-only)은 하지 않는다.
class NfcService {
  NfcService._();

  static final instance = NfcService._();

  Future<NfcAvailability> availability() => NfcManager.instance.checkAvailability();

  /// 태그를 댈 때까지 기다렸다가 기록·검증한다. [cancel] 이 완료되면 중단.
  Future<void> writeUrl(String url, {Future<void>? cancel}) async {
    final completer = Completer<void>();
    final message = NdefMessage(records: [NdefUri.encode(url)]);

    cancel?.then((_) {
      if (!completer.isCompleted) completer.completeError(NfcWriteException('취소했습니다.'));
    });

    await NfcManager.instance.startSession(
      pollingOptions: {NfcPollingOption.iso14443, NfcPollingOption.iso15693},
      onDiscovered: (NfcTag tag) async {
        if (completer.isCompleted) return;
        try {
          await _writeAndVerify(tag, message, url);
          completer.complete();
        } catch (e) {
          completer.completeError(
            e is NfcWriteException ? e : NfcWriteException('기록에 실패했습니다. 태그를 떼지 말고 다시 시도하세요. ($e)'),
          );
        }
      },
    );

    try {
      await completer.future;
    } finally {
      await NfcManager.instance.stopSession();
    }
  }

  Future<void> _writeAndVerify(NfcTag tag, NdefMessage message, String url) async {
    final ndef = NdefAndroid.from(tag);
    if (ndef == null) {
      // 한 번도 쓰지 않은 태그는 NDEF 형식이 아닐 수 있어 포맷하면서 기록
      final formatable = NdefFormatableAndroid.from(tag);
      if (formatable == null) throw NfcWriteException('URL 을 기록할 수 없는 태그입니다. NTAG213 이상 태그를 사용하세요.');
      await formatable.format(message);
      // 포맷 직후에는 같은 세션에서 NDEF 로 다시 열 수 없다. format 이 성공하면 메시지까지 기록된 것
      return;
    } else {
      if (!ndef.isWritable) throw NfcWriteException('쓰기가 잠긴 태그입니다.');
      if (message.byteLength > ndef.maxSize) {
        throw NfcWriteException('태그 용량(${ndef.maxSize}바이트)이 부족합니다.');
      }
      await ndef.writeNdefMessage(message);
    }

    // 다시 읽어 같은 URL 인지 확인
    final readBack = await NdefAndroid.from(tag)?.getNdefMessage();
    final readUrl = NdefUri.decode(readBack);
    if (readUrl != url) throw NfcWriteException('기록한 내용을 확인하지 못했습니다. 다시 시도하세요.');
  }
}
