import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// 대상자 등록·수정: 응급정보와 항목별 공개 범위.
/// 저장하면 저장된 [Person] 을 돌려주며 이전 화면으로 돌아간다.
class PersonFormPage extends StatefulWidget {
  const PersonFormPage({super.key, this.person});

  /// null 이면 새 대상자
  final Person? person;

  @override
  State<PersonFormPage> createState() => _PersonFormPageState();
}

class _PersonFormPageState extends State<PersonFormPage> {
  static const _bloodTypes = [
    'A형 (Rh+)', 'B형 (Rh+)', 'O형 (Rh+)', 'AB형 (Rh+)', //
    'A형 (Rh-)', 'B형 (Rh-)', 'O형 (Rh-)', 'AB형 (Rh-)',
  ];

  // 새 대상자는 범용 유형의 추천 공개 범위로 시작
  late final Person _person = widget.person == null
      ? Person(publicFields: {...PersonType.general.recommendedPublic})
      : Person.fromJson({...?_copy(widget.person!)});

  /// 보험 입력 칸 (보험마다 컨트롤러 3개)
  late final List<_InsuranceDraft> _insurances = _person.insurances.map(_InsuranceDraft.new).toList();
  static const _maxInsurances = 3;
  final _formKey = GlobalKey<FormState>();
  late final _controllers = <ProfileField, TextEditingController>{
    ProfileField.name: TextEditingController(text: _person.name),
    ProfileField.conditions: TextEditingController(text: _person.conditions),
    ProfileField.allergies: TextEditingController(text: _person.allergies),
    ProfileField.medications: TextEditingController(text: _person.medications),
    ProfileField.notes: TextEditingController(text: _person.notes),
    ProfileField.disabilityType: TextEditingController(text: _person.disabilityType),
    ProfileField.communication: TextEditingController(text: _person.communication),
    ProfileField.careTips: TextEditingController(text: _person.careTips),
  };
  /// 생년월일 직접 입력 칸 (YYYY.MM.DD). 달력으로 고르면 이 칸에 채운다 (11/18)
  late final _birthDate = TextEditingController(text: _person.birthDate.replaceAll('-', '.'));
  bool _isSaving = false;
  bool _isDirty = false;

  static Map<String, dynamic>? _copy(Person p) => {...p.toJson(), 'personId': p.personId, 'tagCount': p.tagCount};

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    _birthDate.dispose();
    for (final d in _insurances) {
      d.dispose();
    }
    super.dispose();
  }

  void _markDirty() {
    if (!_isDirty) setState(() => _isDirty = true);
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    _person
      ..name = _controllers[ProfileField.name]!.text.trim()
      ..conditions = _controllers[ProfileField.conditions]!.text.trim()
      ..allergies = _controllers[ProfileField.allergies]!.text.trim()
      ..medications = _controllers[ProfileField.medications]!.text.trim()
      ..notes = _controllers[ProfileField.notes]!.text.trim()
      ..disabilityType = _controllers[ProfileField.disabilityType]!.text.trim()
      ..communication = _controllers[ProfileField.communication]!.text.trim()
      ..careTips = _controllers[ProfileField.careTips]!.text.trim()
      ..insurances = _insurances.map((d) => d.toInsurance()).toList();
    setState(() => _isSaving = true);
    try {
      final saved = await ApiClient.instance.savePerson(_person);
      if (!mounted) return;
      setState(() => _isDirty = false);
      Navigator.pop(context, saved);
    } catch (e) {
      if (mounted) showMessage(context, e.toString());
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  /// 'YYYY.MM.DD' → 있는 날짜(1900년~오늘)면 DateTime, 아니면 null
  static DateTime? _parseBirthDate(String text) {
    final digits = text.replaceAll(RegExp(r'\D'), '');
    if (digits.length != 8) return null;
    final y = int.parse(digits.substring(0, 4));
    final m = int.parse(digits.substring(4, 6));
    final d = int.parse(digits.substring(6, 8));
    final date = DateTime(y, m, d);
    if (date.year != y || date.month != m || date.day != d) return null;
    if (date.isBefore(DateTime(1900)) || date.isAfter(DateTime.now())) return null;
    return date;
  }

  static String _isoDate(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  void _onBirthDateChanged(String text) {
    final date = _parseBirthDate(text);
    setState(() {
      // 다 입력하기 전이나 없는 날짜면 비워 두고, 저장할 때 검증 메시지를 보여준다
      _person.birthDate = date == null ? '' : _isoDate(date);
      _isDirty = true;
    });
  }

  /// 달력 아이콘: 달력으로 고른 날짜를 입력 칸에 채운다
  Future<void> _pickBirthDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _parseBirthDate(_birthDate.text) ?? DateTime(2015, 1, 1),
      firstDate: DateTime(1900),
      lastDate: DateTime.now(),
      initialEntryMode: DatePickerEntryMode.calendarOnly,
      helpText: '생년월일',
    );
    if (picked == null) return;
    _birthDate.text = _isoDate(picked).replaceAll('-', '.');
    _onBirthDateChanged(_birthDate.text);
  }

  /// 유형을 바꾸면 그 유형의 추천 공개 범위로 바꾼다 (보험 공개 여부는 그대로)
  void _selectType(PersonType type) {
    if (_person.personType == type) return;
    setState(() {
      final keepInsurance = _person.publicFields.contains(ProfileField.insurances);
      _person
        ..personType = type
        ..publicFields = {...type.recommendedPublic, if (keepInsurance) ProfileField.insurances};
      _isDirty = true;
    });
    showMessage(context, '${type.label} 유형의 추천 공개 범위로 바꿨어요. 항목별로 다시 바꿀 수 있어요.');
  }

  Widget _publicSwitch(ProfileField field) {
    final isPublic = _person.publicFields.contains(field);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          isPublic ? '공개' : '비공개',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: isPublic ? AppColors.red : AppColors.text3,
          ),
        ),
        Switch(
          value: isPublic,
          onChanged: (value) => setState(() {
            value ? _person.publicFields.add(field) : _person.publicFields.remove(field);
            _isDirty = true;
          }),
        ),
      ],
    );
  }

  Widget _field(ProfileField field, Widget input) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(field.label, style: const TextStyle(fontSize: 15, color: AppColors.text2)),
              ),
              _publicSwitch(field),
            ],
          ),
          input,
        ],
      ),
    );
  }

  Widget _text(
    ProfileField field, {
    String? hint,
    int maxLength = 200,
    int maxLines = 2,
    FormFieldValidator<String>? validator,
    TextInputType? keyboardType,
  }) {
    return TextFormField(
      controller: _controllers[field],
      keyboardType: keyboardType,
      maxLength: maxLength,
      minLines: 1,
      maxLines: maxLines,
      onChanged: (_) => _markDirty(),
      validator: validator,
      decoration: InputDecoration(hintText: hint, counterText: ''),
    );
  }

  Widget _insuranceCard(int index, _InsuranceDraft draft) {
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.fromLTRB(12, 4, 4, 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text('보험 ${index + 1}', style: const TextStyle(fontWeight: FontWeight.w700)),
              const Spacer(),
              IconButton(
                tooltip: '이 보험 삭제',
                icon: const Icon(Icons.delete_outline),
                onPressed: () => setState(() {
                  _insurances.removeAt(index).dispose();
                  _isDirty = true;
                }),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  controller: draft.company,
                  maxLength: 30,
                  onChanged: (_) => _markDirty(),
                  validator: (v) => (v ?? '').trim().isEmpty ? '보험사를 입력하세요' : null,
                  decoration: const InputDecoration(labelText: '보험사', hintText: '예: OO손해보험 자동차', counterText: ''),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: draft.phone,
                  maxLength: 20,
                  keyboardType: TextInputType.phone,
                  onChanged: (_) => _markDirty(),
                  validator: (v) =>
                      RegExp(r'^[0-9-]*$').hasMatch((v ?? '').trim()) ? null : '숫자와 하이픈(-)만 입력하세요',
                  decoration: const InputDecoration(labelText: '사고 접수 번호', hintText: '예: 1588-0000', counterText: ''),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: draft.note,
                  maxLength: 100,
                  onChanged: (_) => _markDirty(),
                  decoration: const InputDecoration(labelText: '메모 (선택)', hintText: '예: 증권번호, 가입 상품', counterText: ''),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final age = Person.ageOf(_person.birthDate);
    return PopScope(
      canPop: !_isDirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await confirmDiscard(context) && context.mounted) {
          setState(() => _isDirty = false);
          Navigator.pop(context);
        }
      },
      child: Scaffold(
        appBar: AppBar(title: Text(widget.person == null ? '대상자 등록' : '대상자 정보 수정')),
        body: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
            children: [
              const NoticeBox(
                text:
                    '공개 항목은 태그를 댄 사람 누구나 볼 수 있어요. '
                    '비공개 항목은 신고자가 열람을 요청하고 보호자가 문자로 승인한 경우에만 그 신고자에게 보여요.',
              ),
              const SizedBox(height: 12),
              // 유형 (11/18): 태그를 댔을 때 열리는 응급 화면의 제목과 상단 정보가 달라진다
              SectionCard(
                icon: Icons.badge_outlined,
                title: '대상자 유형',
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final type in PersonType.values)
                          ChoiceChip(
                            label: Text(type.label),
                            selected: _person.personType == type,
                            onSelected: (_) => _selectType(type),
                          ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 8, bottom: 4),
                    child: Text(
                      _person.personType.description,
                      style: const TextStyle(fontSize: 13, color: AppColors.text3, height: 1.4),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SectionCard(
                icon: Icons.person,
                title: '기본정보',
                children: [
                  _field(
                    ProfileField.name,
                    _text(
                      ProfileField.name,
                      hint: '예: 김지우',
                      maxLength: 30,
                      maxLines: 1,
                      validator: (v) => (v ?? '').trim().isEmpty ? '이름을 입력하세요' : null,
                    ),
                  ),
                  _field(
                    ProfileField.birthDate,
                    TextFormField(
                      controller: _birthDate,
                      keyboardType: TextInputType.number,
                      inputFormatters: [_BirthDateFormatter()],
                      onChanged: _onBirthDateChanged,
                      validator: (v) => (v ?? '').isEmpty || _parseBirthDate(v!) != null
                          ? null
                          : '생년월일을 YYYY.MM.DD 로 입력하세요 (예: 2015.03.14)',
                      decoration: InputDecoration(
                        hintText: 'YYYY.MM.DD (숫자 8자리)',
                        helperText: age == null ? null : '만 $age세',
                        suffixIcon: IconButton(
                          tooltip: '달력에서 고르기',
                          icon: const Icon(Icons.calendar_today, size: 20),
                          onPressed: _pickBirthDate,
                        ),
                      ),
                    ),
                  ),
                  _field(
                    ProfileField.bloodType,
                    DropdownButtonFormField<String>(
                      isExpanded: true,
                      initialValue: _bloodTypes.contains(_person.bloodType) ? _person.bloodType : '',
                      items: [
                        const DropdownMenuItem(value: '', child: Text('모름')),
                        for (final t in _bloodTypes) DropdownMenuItem(value: t, child: Text(t)),
                      ],
                      onChanged: (value) => setState(() {
                        _person.bloodType = value ?? '';
                        _isDirty = true;
                      }),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SectionCard(
                icon: Icons.favorite,
                title: '의료정보',
                children: [
                  _field(ProfileField.conditions, _text(ProfileField.conditions, hint: '예: 천식')),
                  _field(ProfileField.allergies, _text(ProfileField.allergies, hint: '예: 페니실린')),
                  _field(ProfileField.medications, _text(ProfileField.medications, hint: '예: 천식 흡입기 (살부타몰)')),
                ],
              ),
              // 장애인 유형이거나 이미 입력한 값이 있으면 보여 준다
              if (_person.personType == PersonType.disabled ||
                  _person.disabilityType.isNotEmpty ||
                  _person.communication.isNotEmpty ||
                  _person.careTips.isNotEmpty) ...[
                const SizedBox(height: 12),
                SectionCard(
                  icon: Icons.accessibility_new,
                  title: '장애·의사소통',
                  children: [
                    _field(
                      ProfileField.disabilityType,
                      _text(ProfileField.disabilityType, hint: '예: 청각장애, 자폐성 장애', maxLength: 50, maxLines: 1),
                    ),
                    _field(
                      ProfileField.communication,
                      _text(ProfileField.communication, hint: '예: 필담·수어·그림카드', maxLength: 100),
                    ),
                    _field(
                      ProfileField.careTips,
                      _text(
                        ProfileField.careTips,
                        hint: '예: 천천히 짧게 말해 주세요 · 글로 써서 보여 주세요',
                        maxLength: 200,
                        maxLines: 3,
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 12),
              SectionCard(
                icon: Icons.sticky_note_2_outlined,
                title: '유의사항',
                children: [
                  _field(
                    ProfileField.notes,
                    _text(ProfileField.notes, hint: '응급 시 알아야 할 내용', maxLength: 500, maxLines: 4),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              // 보험 정보 (선택): 입력하면 응급 화면에 "보험 정보" 버튼이 생긴다
              SectionCard(
                icon: Icons.health_and_safety_outlined,
                title: '보험 정보 (선택)',
                children: [
                  const Padding(
                    padding: EdgeInsets.only(top: 6),
                    child: Text(
                      '등록하면 응급 화면에 "보험 정보" 버튼이 생겨요. 공개 여부는 보험 전체에 한 번에 적용돼요.',
                      style: TextStyle(fontSize: 13, color: AppColors.text3, height: 1.4),
                    ),
                  ),
                  Row(
                    children: [
                      const Expanded(
                        child: Text('공개 여부 (보험 전체)', style: TextStyle(fontSize: 15, color: AppColors.text2)),
                      ),
                      _publicSwitch(ProfileField.insurances),
                    ],
                  ),
                  for (final (index, draft) in _insurances.indexed) _insuranceCard(index, draft),
                  if (_insurances.length < _maxInsurances)
                    Padding(
                      padding: const EdgeInsets.only(top: 8, bottom: 4),
                      child: OutlinedButton.icon(
                        onPressed: () => setState(() {
                          _insurances.add(_InsuranceDraft(Insurance()));
                          _isDirty = true;
                        }),
                        icon: const Icon(Icons.add),
                        label: Text('보험 추가 (${_insurances.length}/$_maxInsurances)'),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
        bottomNavigationBar: BottomActionBar(
          child: FilledButton(onPressed: _isSaving ? null : _save, child: Text(_isSaving ? '저장 중…' : '저장하기')),
        ),
      ),
    );
  }
}

/// 보험 하나의 입력 상태
class _InsuranceDraft {
  _InsuranceDraft(Insurance insurance)
    : company = TextEditingController(text: insurance.company),
      phone = TextEditingController(text: insurance.phone),
      note = TextEditingController(text: insurance.note);

  final TextEditingController company;
  final TextEditingController phone;
  final TextEditingController note;

  Insurance toInsurance() =>
      Insurance(company: company.text.trim(), phone: phone.text.trim(), note: note.text.trim());

  void dispose() {
    company.dispose();
    phone.dispose();
    note.dispose();
  }
}

/// 숫자만 받아 'YYYY.MM.DD' 로 점을 넣는다 (최대 8자리)
class _BirthDateFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    var digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    if (digits.length > 8) digits = digits.substring(0, 8);
    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i == 4 || i == 6) buffer.write('.');
      buffer.write(digits[i]);
    }
    final text = buffer.toString();
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }
}
