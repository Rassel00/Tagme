import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

import '../config.dart';
import 'models.dart';

/// 서버 오류 응답 { error: { code, message } }
class ApiException implements Exception {
  ApiException(this.status, this.code, this.message);

  final int status;
  final String code;
  final String message;

  @override
  String toString() => message;
}

/// 보호자 앱 API (Authorization: Bearer {Firebase ID 토큰}). 토큰 저장·갱신은 Firebase SDK 가 맡는다.
class ApiClient {
  ApiClient({http.Client? client, String? baseUrl})
    : _client = client ?? http.Client(),
      _baseUrl = baseUrl ?? AppConfig.apiBaseUrl;

  static final instance = ApiClient();

  final http.Client _client;
  final String _baseUrl;

  Future<dynamic> _request(String method, String path, {Object? body, bool isAuthRequired = true}) async {
    final request = http.Request(method, Uri.parse('$_baseUrl$path'))..headers['Accept'] = 'application/json';
    if (isAuthRequired) {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) throw ApiException(401, 'unauthorized', '로그인이 필요합니다.');
      request.headers['Authorization'] = 'Bearer ${await user.getIdToken()}';
    }
    if (body != null) {
      request.headers['Content-Type'] = 'application/json; charset=utf-8';
      request.body = jsonEncode(body);
    }

    final http.Response response;
    try {
      response = await http.Response.fromStream(await _client.send(request).timeout(const Duration(seconds: 15)));
    } catch (_) {
      throw ApiException(0, 'network', '서버에 연결할 수 없습니다. 네트워크를 확인하세요.');
    }

    final text = utf8.decode(response.bodyBytes);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return text.isEmpty ? null : jsonDecode(text);
    }
    var code = 'unknown';
    var message = '요청에 실패했습니다 (${response.statusCode}).';
    try {
      final error = (jsonDecode(text) as Map<String, dynamic>)['error'] as Map<String, dynamic>;
      code = error['code'] as String? ?? code;
      message = error['message'] as String? ?? message;
      // 검증 오류는 첫 번째 상세 메시지를 보여준다
      final details = error['details'];
      if (details is List && details.isNotEmpty && details.first is Map) {
        message = (details.first as Map)['message'] as String? ?? message;
      }
    } catch (_) {
      // JSON 이 아닌 오류 응답
    }
    throw ApiException(response.statusCode, code, message);
  }

  Map<String, dynamic> _map(dynamic json) => json as Map<String, dynamic>;
  List<T> _list<T>(dynamic json, T Function(Map<String, dynamic>) parse) =>
      (json as List).map((e) => parse(e as Map<String, dynamic>)).toList();

  // ---------------------------------------------------------------- 사용자·동의

  /// 로그인·계정 연결 직후 호출. 사용자 생성 또는 갱신. @return 필수 동의가 필요한지
  /// 게스트 계정 삭제. 서버에서 대상자·연락처·태그까지 모두 지운다 (게스트만 가능)
  Future<void> deleteMe() => _request('DELETE', '/api/users/me');

  Future<bool> registerMe() async =>
      _map(await _request('POST', '/api/users/me'))['isConsentRequired'] as bool? ?? true;

  /// 현재 약관 버전 (로그인 불필요). 게스트는 동의한 뒤 계정을 만들기 때문에 로그인 전에 쓴다
  Future<String> getConsentVersion() async =>
      _map(await _request('GET', '/api/public/consents', isAuthRequired: false))['version'] as String;

  Future<ConsentStatus> getConsents() async => ConsentStatus.fromJson(_map(await _request('GET', '/api/consents')));

  Future<ConsentStatus> saveConsents(String version, Iterable<String> types) async {
    final items = types.map((t) => {'type': t, 'version': version}).toList();
    return ConsentStatus.fromJson(_map(await _request('POST', '/api/consents', body: {'items': items})));
  }

  // ---------------------------------------------------------------- 대상자

  Future<List<Person>> getPersons() async => _list(await _request('GET', '/api/persons'), Person.fromJson);

  Future<Person> savePerson(Person person) async {
    final id = person.personId;
    final json = id == null
        ? await _request('POST', '/api/persons', body: person.toJson())
        : await _request('PUT', '/api/persons/$id', body: person.toJson());
    return Person.fromJson(_map(json));
  }

  Future<void> deletePerson(String personId) => _request('DELETE', '/api/persons/$personId');

  // ---------------------------------------------------------------- 주소록

  Future<List<AddressContact>> getContacts() async =>
      _list(await _request('GET', '/api/contacts'), AddressContact.fromJson);

  Future<AddressContact> saveContact(AddressContact contact) async {
    final id = contact.contactId;
    final json = id == null
        ? await _request('POST', '/api/contacts', body: contact.toJson())
        : await _request('PUT', '/api/contacts/$id', body: contact.toJson());
    return AddressContact.fromJson(_map(json));
  }

  Future<void> deleteContact(String contactId) => _request('DELETE', '/api/contacts/$contactId');

  // ---------------------------------------------------------------- 태그

  Future<List<TagInfo>> getTags() async => _list(await _request('GET', '/api/tags'), TagInfo.fromJson);

  Future<TagInfo> getTag(String tagId) async => TagInfo.fromJson(_map(await _request('GET', '/api/tags/$tagId')));

  /// [tagId] 가 없으면 새로 만든다
  Future<TagInfo> saveTag(TagInput input, {String? tagId}) async {
    final json = tagId == null
        ? await _request('POST', '/api/tags', body: input.toJson())
        : await _request('PUT', '/api/tags/$tagId', body: input.toJson());
    return TagInfo.fromJson(_map(json));
  }

  Future<void> deleteTag(String tagId) => _request('DELETE', '/api/tags/$tagId');

  Future<TagInfo> markNfcWritten(String tagId) async =>
      TagInfo.fromJson(_map(await _request('POST', '/api/tags/$tagId/nfc-written')));
}
