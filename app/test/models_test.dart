import 'package:flutter_test/flutter_test.dart';
import 'package:nfc_manager/ndef_record.dart';
import 'package:tagme_app/api/models.dart';
import 'package:tagme_app/services/nfc_service.dart';

void main() {
  group('NdefUri', () {
    test('https 접두어를 1바이트 코드(0x04)로 줄이고 다시 복원한다', () {
      const url = 'https://tagme.onrender.com/t/SeedDemoTag0000000000001';
      final record = NdefUri.encode(url);
      expect(record.typeNameFormat, TypeNameFormat.wellKnown);
      expect(record.type, [0x55]);
      expect(record.payload.first, 0x04);
      expect(record.payload.length, 1 + 'tagme.onrender.com/t/SeedDemoTag0000000000001'.length);
      expect(NdefUri.decode(NdefMessage(records: [record])), url);
    });

    test('http://localhost 도 기록·복원', () {
      const url = 'http://localhost:3000/t/abc';
      final record = NdefUri.encode(url);
      expect(record.payload.first, 0x03);
      expect(NdefUri.decode(NdefMessage(records: [record])), url);
    });

    test('NTAG213(144바이트)에 들어가는 크기', () {
      final message = NdefMessage(
        records: [NdefUri.encode('https://tagme-server.onrender.com/t/AbCdEfGhIjKlMnOpQrStUvWx')],
      );
      expect(message.byteLength, lessThan(137)); // NTAG213 NDEF 가용 영역
    });

    test('URI 레코드가 없으면 null', () {
      expect(NdefUri.decode(null), isNull);
    });
  });

  group('Person', () {
    test('JSON 왕복, 알 수 없는 공개 항목은 무시', () {
      final person = Person.fromJson({
        'personId': 'p1',
        'name': '김지우',
        'birthDate': '2003-05-14',
        'bloodType': 'A형 (Rh+)',
        'publicFields': ['bloodType', 'allergies', 'unknown'],
        'tagCount': 2,
      });
      expect(person.publicFields, {ProfileField.bloodType, ProfileField.allergies});
      expect(person.toJson()['publicFields'], containsAll(['bloodType', 'allergies']));
      expect(person.toJson().containsKey('personId'), isFalse);
      expect(person.tagCount, 2);
    });

    test('만 나이와 요약', () {
      expect(Person.ageOf('2003-05-14', today: DateTime(2026, 5, 13)), 22);
      expect(Person.ageOf('2003-05-14', today: DateTime(2026, 5, 14)), 23);
      expect(Person.ageOf(''), isNull);
      expect(Person(bloodType: 'A형 (Rh+)', conditions: '천식').summary, 'A형 (Rh+) · 천식');
    });
  });

  group('AddressContact · TagInfo', () {
    test('번호 표기와 관계 표시', () {
      final contact = AddressContact(name: '엄마', relation: '가족', phone: '01012345678');
      expect(AddressContact.formatPhone(contact.phone), '010-1234-5678');
      expect(contact.title, '엄마 (가족)');
      expect(contact.toJson(), {'name': '엄마', 'relation': '가족', 'phone': '01012345678'});
    });

    test('태그 표시 이름: 대상자 · 태그 이름', () {
      TagInfo tag(String? person, String label) => TagInfo.fromJson({
        'tagId': 't',
        'url': 'u',
        'label': label,
        'personName': person,
        'contacts': [
          {'contactId': 'c1', 'name': '엄마', 'phone': '01012345678'},
        ],
      });
      expect(tag('김지우', '키링').displayName, '김지우 · 키링');
      expect(tag(null, '').displayName, '이름 없는 태그');
      expect(tag('김지우', '').contacts.single.name, '엄마');
    });

    test('태그 저장 요청에는 연락처 ID·보호자 여부·메모를 보낸다 (번호는 보내지 않음)', () {
      final input = TagInput(
        label: '키링',
        defaultMessage: 'm',
        personId: 'p1',
        contacts: const [
          TagContactInput(contactId: 'c1'),
          TagContactInput(contactId: 'c2', isGuardian: false, message: '회사면 엄마에게'),
        ],
      );
      expect(input.toJson(), {
        'label': '키링',
        'defaultMessage': 'm',
        'personId': 'p1',
        'contacts': [
          {'contactId': 'c1', 'isGuardian': true, 'message': ''},
          {'contactId': 'c2', 'isGuardian': false, 'message': '회사면 엄마에게'},
        ],
      });
    });

    test('태그 상세 연락처의 보호자 여부·메모 (없으면 보호자)', () {
      final contact = AddressContact.fromJson({'contactId': 'c', 'name': '아빠', 'phone': '01011112222', 'isGuardian': false, 'message': 'm'});
      expect(contact.isGuardian, isFalse);
      expect(contact.message, 'm');
      expect(AddressContact.fromJson({'name': 'x', 'phone': '0'}).isGuardian, isTrue);
    });
  });

  test('필수 동의 5개, 선택 없음 (서버 CONSENT_TYPES 와 같음)', () {
    expect(consentItems.where((i) => i.isRequired).map((i) => i.type), [
      'terms',
      'personalInfo',
      'sensitiveInfo',
      'thirdParty',
      'contactNotice',
    ]);
    expect(consentItems.where((i) => !i.isRequired), isEmpty);
  });

  test('태그 연락처 수락 상태와 수락한 연락처 수를 읽는다', () {
    final tag = TagInfo.fromJson({
      'tagId': 'T',
      'url': 'https://example.com/t/T',
      'contactCount': 2,
      'acceptedContactCount': 1,
      'contacts': [
        {'contactId': 'a', 'name': '엄마', 'phone': '01011112222', 'inviteStatus': 'accepted'},
        {'contactId': 'b', 'name': '민수', 'phone': '01033334444', 'inviteStatus': 'pending'},
      ],
    });
    expect(tag.acceptedContactCount, 1);
    expect(tag.contacts.map((c) => c.inviteLabel), ['수락', '수락 대기']);
    expect(tag.contacts.first.isAccepted, isTrue);
  });

  test('대상자 유형·장애·보험 항목을 읽고 그대로 저장 요청에 담는다', () {
    final person = Person.fromJson({
      'personId': 'p',
      'name': '이민호',
      'personType': 'disabled',
      'disabilityType': '청각장애',
      'communication': '필담',
      'insurances': [
        {'company': '응급손해보험', 'phone': '1588-0000', 'note': ''},
        {'company': '든든실손'},
      ],
      'publicFields': ['disabilityType', 'insurances'],
    });
    expect(person.personType, PersonType.disabled);
    expect(person.publicFields, {ProfileField.disabilityType, ProfileField.insurances});
    expect(person.insurances.map((i) => i.company), ['응급손해보험', '든든실손']);
    final json = person.toJson();
    expect(json['personType'], 'disabled');
    expect(json['communication'], '필담');
    expect((json['insurances'] as List).first, {'company': '응급손해보험', 'phone': '1588-0000', 'note': ''});
    // 추천 공개 범위: 알레르기는 모든 유형에서 공개, 보험은 기본 비공개
    for (final type in PersonType.values) {
      expect(type.recommendedPublic, contains(ProfileField.allergies));
      expect(type.recommendedPublic, isNot(contains(ProfileField.insurances)));
    }
    expect(Person.fromJson({'name': 'x', 'personType': 'unknown'}).personType, PersonType.general);
  });
}
