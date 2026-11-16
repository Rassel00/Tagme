import 'package:flutter/material.dart';

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

  late final Person _person = widget.person == null
      ? Person(publicFields: {ProfileField.bloodType, ProfileField.allergies})
      : Person.fromJson({...?_copy(widget.person!)});
  final _formKey = GlobalKey<FormState>();
  late final _controllers = <ProfileField, TextEditingController>{
    ProfileField.name: TextEditingController(text: _person.name),
    ProfileField.conditions: TextEditingController(text: _person.conditions),
    ProfileField.allergies: TextEditingController(text: _person.allergies),
    ProfileField.medications: TextEditingController(text: _person.medications),
    ProfileField.notes: TextEditingController(text: _person.notes),
  };
  bool _isSaving = false;
  bool _isDirty = false;

  static Map<String, dynamic>? _copy(Person p) => {...p.toJson(), 'personId': p.personId, 'tagCount': p.tagCount};

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
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
      ..notes = _controllers[ProfileField.notes]!.text.trim();
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

  Future<void> _pickBirthDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.tryParse(_person.birthDate) ?? DateTime(2015, 1, 1),
      firstDate: DateTime(1900),
      lastDate: DateTime.now(),
      initialEntryMode: DatePickerEntryMode.input,
      helpText: '생년월일',
    );
    if (picked == null) return;
    setState(() {
      _person.birthDate =
          '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
      _isDirty = true;
    });
  }

  Widget _publicSwitch(ProfileField field) {
    final isPublic = _person.publicFields.contains(field);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          isPublic ? '누구나 보기' : '승인 후 보기',
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
  }) {
    return TextFormField(
      controller: _controllers[field],
      maxLength: maxLength,
      minLines: 1,
      maxLines: maxLines,
      onChanged: (_) => _markDirty(),
      validator: validator,
      decoration: InputDecoration(hintText: hint, counterText: ''),
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
                    '"누구나 보기" 항목은 태그를 댄 사람 누구나 볼 수 있어요. '
                    '"승인 후 보기" 항목은 보호자가 문자로 승인한 경우에만 그 신고자에게 보여요.',
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
                    InkWell(
                      onTap: _pickBirthDate,
                      borderRadius: BorderRadius.circular(10),
                      child: InputDecorator(
                        decoration: const InputDecoration(suffixIcon: Icon(Icons.calendar_today, size: 20)),
                        child: Text(
                          _person.birthDate.isEmpty
                              ? '선택하세요'
                              : '${_person.birthDate.replaceAll('-', '. ')}.${age == null ? '' : ' (만 $age세)'}',
                          style: TextStyle(color: _person.birthDate.isEmpty ? AppColors.text3 : AppColors.text),
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
