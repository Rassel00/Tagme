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

    test('태그 저장 요청에는 연락처 ID 만 보낸다', () {
      final input = TagInput(label: '키링', defaultMessage: 'm', personId: 'p1', contactIds: ['c1', 'c2']);
      expect(input.toJson(), {
        'label': '키링',
        'defaultMessage': 'm',
        'personId': 'p1',
        'contactIds': ['c1', 'c2'],
      });
    });
  });

  test('필수 동의 5개, 선택 1개 (서버 CONSENT_TYPES 와 같음)', () {
    expect(consentItems.where((i) => i.isRequired).map((i) => i.type), [
      'terms',
      'personalInfo',
      'sensitiveInfo',
      'thirdParty',
      'contactNotice',
    ]);
    expect(consentItems.where((i) => !i.isRequired).map((i) => i.type), ['alertPush']);
  });
}
