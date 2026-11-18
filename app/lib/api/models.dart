// 서버 앱 API(개발 문서 6.1, 11/16 구조 변경) 응답 모델.
// 대상자(응급정보의 주인) · 주소록 연락처 · 태그(대상자 1명 + 연락처 최대 3명)

/// 응급정보 항목 키. 서버 PROFILE_FIELDS 와 같은 값.
enum ProfileField {
  name('이름'),
  birthDate('생년월일'),
  bloodType('혈액형'),
  conditions('지병'),
  allergies('알레르기'),
  medications('복용 중인 약'),
  notes('유의사항'),
  // 11/18 유형별 항목(주로 장애인) + 보험 정보
  disabilityType('장애 유형'),
  communication('의사소통 방법'),
  careTips('이렇게 대해 주세요'),
  // 보험 목록 전체의 공개 여부 (보험은 여러 개라도 한 번에)
  insurances('보험 정보');

  const ProfileField(this.label);
  final String label;

  static ProfileField? fromKey(String key) {
    for (final field in values) {
      if (field.name == key) return field;
    }
    return null;
  }
}

/// 대상자 유형 (11/18, 사업계획서). 태그를 댔을 때 열리는 응급 화면의 제목과 상단 정보가 달라진다
enum PersonType {
  general('범용', '기본 응급 화면', {
    ProfileField.name,
    ProfileField.birthDate,
    ProfileField.bloodType,
    ProfileField.allergies,
  }),
  disabled('장애인', '"이 분을 도와주세요" · 장애 유형·의사소통 방법을 먼저 보여 줘요', {
    ProfileField.name,
    ProfileField.birthDate,
    ProfileField.bloodType,
    ProfileField.allergies,
    ProfileField.disabilityType,
    ProfileField.communication,
    ProfileField.careTips,
  }),
  elderly('어르신', '"어르신 응급연락" · 성함·혈액형·지병·복용약을 먼저 보여 줘요', {
    ProfileField.name,
    ProfileField.birthDate,
    ProfileField.bloodType,
    ProfileField.allergies,
    ProfileField.conditions,
    ProfileField.medications,
  }),
  child('어린이', '"어린이 응급연락" · 이름·알레르기·복용약을 먼저 보여 줘요', {
    ProfileField.name,
    ProfileField.birthDate,
    ProfileField.bloodType,
    ProfileField.allergies,
  });

  const PersonType(this.label, this.description, this.recommendedPublic);
  final String label;
  final String description;

  /// 유형을 고르면 자동으로 적용하는 추천 공개 범위 (11/18).
  /// 응급 처치에 바로 쓰이는 알레르기·생년월일(나이)은 모든 유형에서 공개, 지병·복용약은 어르신만 기본 공개
  /// (낙인이 될 수 있어 다른 유형은 비공개), 보험은 기본 비공개. docs/개발-진행.md 근거 참고
  final Set<ProfileField> recommendedPublic;

  static PersonType fromKey(String? key) => values.firstWhere((t) => t.name == key, orElse: () => general);
}

/// 대상자의 보험 (최대 3개). 공개 여부는 [ProfileField.insurances] 하나로 정한다
class Insurance {
  Insurance({this.company = '', this.phone = '', this.note = ''});

  /// 보험사·상품 이름 (예: OO손해보험). 종류는 따로 받지 않고 이름에 적는다
  String company;

  /// 사고 접수 번호 (숫자·하이픈)
  String phone;
  String note;

  factory Insurance.fromJson(Map<String, dynamic> json) => Insurance(
    company: json['company'] as String? ?? '',
    phone: json['phone'] as String? ?? '',
    note: json['note'] as String? ?? '',
  );

  Map<String, dynamic> toJson() => {'company': company, 'phone': phone, 'note': note};
}

/// 보호 대상자 (어린이·노약자 등 태그를 지니는 사람)
class Person {
  Person({
    this.personId,
    this.name = '',
    this.birthDate = '',
    this.bloodType = '',
    this.conditions = '',
    this.allergies = '',
    this.medications = '',
    this.notes = '',
    this.personType = PersonType.general,
    this.disabilityType = '',
    this.communication = '',
    this.careTips = '',
    List<Insurance>? insurances,
    Set<ProfileField>? publicFields,
    this.tagCount = 0,
  }) : insurances = insurances ?? [],
       publicFields = publicFields ?? {};

  /// 새로 만들 때는 null
  final String? personId;
  String name;

  /// YYYY-MM-DD, 없으면 빈 문자열
  String birthDate;
  String bloodType;
  String conditions;
  String allergies;
  String medications;
  String notes;
  PersonType personType;
  String disabilityType;
  String communication;
  String careTips;
  List<Insurance> insurances;
  Set<ProfileField> publicFields;
  final int tagCount;

  factory Person.fromJson(Map<String, dynamic> json) => Person(
    personId: json['personId'] as String?,
    name: json['name'] as String? ?? '',
    birthDate: json['birthDate'] as String? ?? '',
    bloodType: json['bloodType'] as String? ?? '',
    conditions: json['conditions'] as String? ?? '',
    allergies: json['allergies'] as String? ?? '',
    medications: json['medications'] as String? ?? '',
    notes: json['notes'] as String? ?? '',
    personType: PersonType.fromKey(json['personType'] as String?),
    disabilityType: json['disabilityType'] as String? ?? '',
    communication: json['communication'] as String? ?? '',
    careTips: json['careTips'] as String? ?? '',
    insurances: ((json['insurances'] as List?) ?? const [])
        .map((e) => Insurance.fromJson(e as Map<String, dynamic>))
        .toList(),
    publicFields: ((json['publicFields'] as List?) ?? const [])
        .map((e) => ProfileField.fromKey(e as String))
        .whereType<ProfileField>()
        .toSet(),
    tagCount: (json['tagCount'] as num?)?.toInt() ?? 0,
  );

  Map<String, dynamic> toJson() => {
    'name': name,
    'birthDate': birthDate,
    'bloodType': bloodType,
    'conditions': conditions,
    'allergies': allergies,
    'medications': medications,
    'notes': notes,
    'personType': personType.name,
    'disabilityType': disabilityType,
    'communication': communication,
    'careTips': careTips,
    'insurances': insurances.map((i) => i.toJson()).toList(),
    'publicFields': publicFields.map((f) => f.name).toList(),
  };

  /// 목록에 보여줄 한 줄 요약 (예: "만 8세 · A형 (Rh+) · 천식")
  String get summary {
    final age = ageOf(birthDate);
    return [
      if (personType != PersonType.general) personType.label,
      if (age != null) '만 $age세',
      if (bloodType.isNotEmpty) bloodType,
      if (conditions.isNotEmpty) conditions,
    ].join(' · ');
  }

  /// 만 나이. 생년월일이 없거나 형식이 틀리면 null
  static int? ageOf(String birthDate, {DateTime? today}) {
    final date = DateTime.tryParse(birthDate);
    if (date == null) return null;
    final now = today ?? DateTime.now();
    var age = now.year - date.year;
    if (now.month < date.month || (now.month == date.month && now.day < date.day)) age -= 1;
    return age < 0 ? null : age;
  }
}

/// 주소록 비상연락처. 태그는 이 항목을 참조하므로 고치면 연결된 태그에 모두 반영된다.
class AddressContact {
  AddressContact({
    this.contactId,
    required this.name,
    this.relation = '',
    required this.phone,
    this.tagCount = 0,
    this.inviteStatus,
    this.isGuardian = true,
  });

  final String? contactId;
  final String name;
  final String relation;

  /// 숫자만 (01012345678)
  final String phone;
  final int tagCount;

  /// 태그 상세의 연락처만: 'pending'(수락 대기) / 'accepted'(수락) / 'declined'(거절). 수락한 연락처에게만 신고 알림이 간다
  final String? inviteStatus;

  /// 태그 상세의 연락처만: 보호자면 응급정보 열람 승인 링크를 받는다 (11/18)
  final bool isGuardian;

  bool get isAccepted => inviteStatus == 'accepted';

  String get inviteLabel => switch (inviteStatus) {
    'accepted' => '수락',
    'declined' => '거절',
    'pending' => '수락 대기',
    _ => '',
  };

  factory AddressContact.fromJson(Map<String, dynamic> json) => AddressContact(
    contactId: json['contactId'] as String?,
    name: json['name'] as String,
    relation: json['relation'] as String? ?? '',
    phone: json['phone'] as String,
    tagCount: (json['tagCount'] as num?)?.toInt() ?? 0,
    inviteStatus: json['inviteStatus'] as String?,
    isGuardian: json['isGuardian'] as bool? ?? true,
  );

  Map<String, dynamic> toJson() => {'name': name, 'relation': relation, 'phone': phone};

  String get title => relation.isEmpty ? name : '$name ($relation)';

  static String formatPhone(String phone) {
    final d = phone.replaceAll(RegExp(r'\D'), '');
    if (d.length == 11) return '${d.substring(0, 3)}-${d.substring(3, 7)}-${d.substring(7)}';
    if (d.length == 10) return '${d.substring(0, 3)}-${d.substring(3, 6)}-${d.substring(6)}';
    return phone;
  }
}

class ConsentItem {
  const ConsentItem(this.type, this.title, this.description, {required this.isRequired});

  final String type;
  final String title;
  final String description;
  final bool isRequired;
}

/// 동의 항목 (개발 문서 4.1 APP-02). 서버 CONSENT_TYPES 와 같은 키. 보호자가 대상자 정보를 입력하는 구조에 맞춘 문구.
const consentItems = [
  ConsentItem('terms', '서비스 이용약관', '응급 정보 공유 서비스의 목적과 이용 범위', isRequired: true),
  ConsentItem('personalInfo', '개인정보 수집·이용', '대상자 이름·생년월일, 비상연락처, 구글 계정 이메일(구글 로그인 시)', isRequired: true),
  ConsentItem(
    'sensitiveInfo',
    '민감정보(건강정보) 처리',
    '대상자의 혈액형, 지병, 알레르기, 복용약, 유의사항. 대상자(또는 법정대리인)의 동의를 받아 입력합니다',
    isRequired: true,
  ),
  ConsentItem('thirdParty', '응급 시 제3자 제공', '공개 항목은 태그를 댄 사람에게, 비공개 항목은 보호자가 승인한 경우 그 신고자에게 제공', isRequired: true),
  ConsentItem('contactNotice', '비상연락처 등록', '등록하는 연락처의 주인에게 이 사실을 알렸음을 확인', isRequired: true),
];

class ConsentStatus {
  ConsentStatus({required this.version, required this.isComplete, required this.agreedTypes});

  final String version;
  final bool isComplete;
  final Set<String> agreedTypes;

  factory ConsentStatus.fromJson(Map<String, dynamic> json) => ConsentStatus(
    version: json['version'] as String,
    isComplete: json['isComplete'] as bool? ?? false,
    agreedTypes: ((json['agreed'] as List?) ?? const [])
        .where((e) => (e as Map)['version'] == json['version'])
        .map((e) => (e as Map)['type'] as String)
        .toSet(),
  );
}

/// 게스트 가입 전 동의 화면에서 고른 항목. 계정을 만든 직후 서버에 저장한다
class PendingConsents {
  const PendingConsents({required this.version, required this.types});

  final String version;
  final Set<String> types;
}

class TagInfo {
  TagInfo({
    required this.tagId,
    required this.url,
    required this.label,
    required this.defaultMessage,
    required this.isActive,
    required this.nfcWrittenAt,
    required this.personId,
    required this.personName,
    required this.contactCount,
    this.acceptedContactCount = 0,
    this.contacts = const [],
  });

  final String tagId;
  final String url;
  final String label;
  final String defaultMessage;
  final bool isActive;
  final DateTime? nfcWrittenAt;
  final String? personId;
  final String? personName;
  final int contactCount;

  /// 수락한 비상연락처 수. 신고 알림은 이 연락처에게만 간다
  final int acceptedContactCount;

  /// 상세 조회일 때만 채워진다
  final List<AddressContact> contacts;

  bool get isNfcWritten => nfcWrittenAt != null;

  /// "김지우 · 키링"
  String get displayName {
    final parts = [if ((personName ?? '').isNotEmpty) personName!, if (label.isNotEmpty) label];
    return parts.isEmpty ? '이름 없는 태그' : parts.join(' · ');
  }

  factory TagInfo.fromJson(Map<String, dynamic> json) => TagInfo(
    tagId: json['tagId'] as String,
    url: json['url'] as String,
    label: json['label'] as String? ?? '',
    defaultMessage: json['defaultMessage'] as String? ?? '',
    isActive: json['isActive'] as bool? ?? true,
    nfcWrittenAt: DateTime.tryParse(json['nfcWrittenAt'] as String? ?? ''),
    personId: json['personId'] as String?,
    personName: json['personName'] as String?,
    contactCount: (json['contactCount'] as num?)?.toInt() ?? 0,
    acceptedContactCount: (json['acceptedContactCount'] as num?)?.toInt() ?? 0,
    contacts: ((json['contacts'] as List?) ?? const [])
        .map((e) => AddressContact.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

/// 태그 저장 요청 (추가·수정 공용)
/// 태그에 연결할 연락처: 보호자 여부 (11/18)
class TagContactInput {
  const TagContactInput({required this.contactId, this.isGuardian = true});

  final String contactId;

  /// 보호자만 응급정보 열람 승인 링크를 받는다. 아니면 비상연락망 연락 때 위치 알림만
  final bool isGuardian;

  Map<String, dynamic> toJson() => {'contactId': contactId, 'isGuardian': isGuardian};
}

class TagInput {
  TagInput({required this.label, required this.defaultMessage, required this.personId, required this.contacts});

  final String label;
  final String defaultMessage;
  final String? personId;
  final List<TagContactInput> contacts;

  Map<String, dynamic> toJson() => {
    'label': label,
    'defaultMessage': defaultMessage,
    'personId': personId,
    'contacts': contacts.map((c) => c.toJson()).toList(),
  };
}
