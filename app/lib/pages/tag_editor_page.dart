import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'contact_form_dialog.dart';
import 'nfc_write_sheet.dart';
import 'person_form_page.dart';

const _maxContacts = 3;
const _stepTitles = ['대상자', '비상연락처', 'NFC 기록'];

/// 태그 추가·수정 3단계: ① 대상자 선택·등록 → ② 비상연락처 선택·태그 설정(저장) → ③ NFC 기록.
/// 끝나면(또는 "나중에 기록") true 를 돌려주며 홈으로 돌아간다.
class TagEditorPage extends StatefulWidget {
  const TagEditorPage({super.key, this.tagId});

  /// null 이면 새 태그
  final String? tagId;

  @override
  State<TagEditorPage> createState() => _TagEditorPageState();
}

class _TagEditorPageState extends State<TagEditorPage> {
  int _step = 0;
  bool _isLoading = true;
  bool _isSaving = false;
  bool _isDirty = false;
  String? _loadError;

  List<Person> _persons = [];
  List<AddressContact> _contacts = [];
  String? _personId;
  final List<String> _contactIds = [];
  final _label = TextEditingController();
  final _message = TextEditingController(text: '긴급상황입니다. 위치 확인 부탁드립니다');

  /// 2단계에서 저장된 태그 (NFC 기록에 사용)
  TagInfo? _savedTag;

  bool get _isEdit => widget.tagId != null;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _label.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _loadError = null;
    });
    try {
      final results = await Future.wait([
        ApiClient.instance.getPersons(),
        ApiClient.instance.getContacts(),
        if (_isEdit) ApiClient.instance.getTag(widget.tagId!),
      ]);
      _persons = results[0] as List<Person>;
      _contacts = results[1] as List<AddressContact>;
      if (_isEdit) {
        final tag = results[2] as TagInfo;
        _savedTag = tag;
        _personId = tag.personId;
        _contactIds
          ..clear()
          ..addAll(tag.contacts.map((c) => c.contactId!).where((id) => _contacts.any((c) => c.contactId == id)));
        _label.text = tag.label;
        _message.text = tag.defaultMessage;
      } else if (_persons.length == 1) {
        _personId = _persons.first.personId;
      }
      setState(() => _isLoading = false);
    } catch (e) {
      setState(() {
        _isLoading = false;
        _loadError = e.toString();
      });
    }
  }

  void _markDirty() {
    if (!_isDirty) setState(() => _isDirty = true);
  }

  // ---------------------------------------------------------------- 이동

  Future<void> _back() async {
    if (_step > 0) {
      setState(() => _step -= 1);
      return;
    }
    if (_isDirty && !await confirmDiscard(context)) return;
    if (mounted) Navigator.pop(context, _savedTag != null);
  }

  void _finish() => Navigator.pop(context, true);

  // ---------------------------------------------------------------- 1단계: 대상자

  Future<void> _openPersonForm([Person? person]) async {
    final saved = await Navigator.push<Person>(
      context,
      MaterialPageRoute(builder: (_) => PersonFormPage(person: person)),
    );
    if (saved == null) return;
    setState(() {
      final index = _persons.indexWhere((p) => p.personId == saved.personId);
      index >= 0 ? _persons[index] = saved : _persons.add(saved);
      _personId = saved.personId;
      _isDirty = true;
    });
  }

  Widget _personStep() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        const Text('누구의 태그인가요?', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        const Text('태그를 지니고 다닐 대상자를 고르거나 새로 등록하세요.', style: TextStyle(color: AppColors.text2)),
        const SizedBox(height: 16),
        for (final person in _persons) ...[
          _SelectCard(
            isSelected: person.personId == _personId,
            title: person.name,
            subtitle: person.summary.isEmpty ? '응급정보를 입력하세요' : person.summary,
            onTap: () => setState(() {
              _personId = person.personId;
              _isDirty = true;
            }),
            trailing: IconButton(
              tooltip: '정보 수정',
              icon: const Icon(Icons.edit_outlined),
              onPressed: () => _openPersonForm(person),
            ),
          ),
          const SizedBox(height: 10),
        ],
        OutlinedButton.icon(
          onPressed: () => _openPersonForm(),
          icon: const Icon(Icons.person_add_alt_1),
          label: const Text('새 대상자 등록'),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------- 2단계: 연락처·태그 설정

  Future<void> _addContact() async {
    final saved = await showContactForm(context);
    if (saved == null) return;
    setState(() {
      _contacts.add(saved);
      if (_contactIds.length < _maxContacts) _contactIds.add(saved.contactId!);
      _isDirty = true;
    });
  }

  void _toggleContact(AddressContact contact) {
    final id = contact.contactId!;
    setState(() {
      if (_contactIds.contains(id)) {
        _contactIds.remove(id);
      } else if (_contactIds.length < _maxContacts) {
        _contactIds.add(id);
      } else {
        showMessage(context, '비상연락처는 태그당 최대 $_maxContacts명이에요. 다른 사람을 먼저 빼 주세요.');
        return;
      }
      _isDirty = true;
    });
  }

  Future<void> _saveTag() async {
    if (_contactIds.isEmpty) {
      showMessage(context, '비상연락처를 1명 이상 선택하세요. 신고가 들어오면 이 사람들에게 문자가 갑니다.');
      return;
    }
    setState(() => _isSaving = true);
    try {
      final saved = await ApiClient.instance.saveTag(
        TagInput(
          label: _label.text.trim(),
          defaultMessage: _message.text.trim(),
          personId: _personId,
          contactIds: List.of(_contactIds),
        ),
        tagId: _savedTag?.tagId,
      );
      setState(() {
        _savedTag = saved;
        _isDirty = false;
        _step = 2;
      });
    } catch (e) {
      if (mounted) showMessage(context, e.toString());
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Widget _contactStep() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        Text(
          '비상연락처 선택 (${_contactIds.length}/$_maxContacts)',
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 4),
        const Text('태그가 스캔되어 신고가 들어오면 이 사람들에게 위치와 함께 문자가 가요.', style: TextStyle(color: AppColors.text2, height: 1.4)),
        const SizedBox(height: 16),
        if (_contacts.isEmpty) const NoticeBox(text: '아직 등록된 비상연락처가 없어요. 아래에서 추가하세요. 추가한 연락처는 "연락처" 탭에서 관리할 수 있어요.'),
        for (final contact in _contacts) ...[
          _SelectCard(
            isSelected: _contactIds.contains(contact.contactId),
            isCheckbox: true,
            title: contact.title,
            subtitle: AddressContact.formatPhone(contact.phone),
            onTap: () => _toggleContact(contact),
          ),
          const SizedBox(height: 10),
        ],
        OutlinedButton.icon(onPressed: _addContact, icon: const Icon(Icons.add), label: const Text('새 연락처 추가')),
        const SizedBox(height: 24),
        const Text('태그 설정', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        TextField(
          controller: _label,
          maxLength: 30,
          onChanged: (_) => _markDirty(),
          decoration: const InputDecoration(labelText: '태그 이름 (선택)', hintText: '예: 키링, 책가방, 팔찌', counterText: ''),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _message,
          maxLength: 100,
          minLines: 2,
          maxLines: 3,
          onChanged: (_) => _markDirty(),
          decoration: const InputDecoration(labelText: '문자에 넣을 메시지', counterText: ''),
        ),
        const SizedBox(height: 6),
        const Text(
          '보호자 문자에는 대상자 이름, 위치, 신고자 번호, 응급정보 승인 링크가 함께 들어가요.',
          style: TextStyle(fontSize: 13, color: AppColors.text3, height: 1.4),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------- 3단계: NFC

  Future<void> _writeNfc() async {
    final tag = _savedTag!;
    final isWritten = await showNfcWriteSheet(context, tagId: tag.tagId, url: tag.url);
    if (isWritten && mounted) {
      showMessage(context, 'NFC 등록을 마쳤어요.');
      _finish();
    }
  }

  Future<void> _copyUrl() async {
    await Clipboard.setData(ClipboardData(text: _savedTag!.url));
    if (mounted) showMessage(context, 'URL 을 복사했어요. NFC Tools 앱에서 "URL" 레코드로 기록할 수 있어요.');
  }

  Widget _nfcStep() {
    final tag = _savedTag!;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        const Text('NFC 태그에 기록', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        const Text(
          '태그에는 응급 지원 페이지 주소만 기록돼요. 개인정보는 태그에 저장되지 않아요.',
          style: TextStyle(color: AppColors.text2, height: 1.4),
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tag.displayName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    StatusBadge(label: tag.isNfcWritten ? 'NFC 기록됨' : 'NFC 기록 전', isPositive: tag.isNfcWritten),
                    StatusBadge(label: '비상연락처 ${tag.contactCount}명', isPositive: tag.contactCount > 0),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        const _NfcGuide(),
        const SizedBox(height: 12),
        TextButton.icon(
          onPressed: _copyUrl,
          icon: const Icon(Icons.copy, size: 18),
          label: const Text('URL 복사 (NFC Tools 백업용)'),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------- 화면

  Widget _bottomBar() {
    switch (_step) {
      case 0:
        return FilledButton(
          onPressed: _personId == null ? null : () => setState(() => _step = 1),
          child: const Text('다음'),
        );
      case 1:
        return FilledButton(onPressed: _isSaving ? null : _saveTag, child: Text(_isSaving ? '저장 중…' : '저장하고 다음'));
      default:
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            FilledButton.icon(onPressed: _writeNfc, icon: const Icon(Icons.nfc), label: const Text('NFC 태그에 기록')),
            const SizedBox(height: 8),
            TextButton(onPressed: _finish, child: Text(_savedTag!.isNfcWritten ? '완료' : '나중에 기록하고 홈으로')),
          ],
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(_isEdit ? '태그 수정' : '태그 추가'),
          leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: _back),
          bottom: _isLoading || _loadError != null
              ? null
              : PreferredSize(
                  preferredSize: const Size.fromHeight(44),
                  child: _StepIndicator(step: _step),
                ),
        ),
        body: _loadError != null
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_loadError!, textAlign: TextAlign.center),
                      TextButton(onPressed: _load, child: const Text('다시 시도')),
                    ],
                  ),
                ),
              )
            : _isLoading
            ? const Center(child: CircularProgressIndicator())
            : switch (_step) {
                0 => _personStep(),
                1 => _contactStep(),
                _ => _nfcStep(),
              },
        bottomNavigationBar: _isLoading || _loadError != null ? null : BottomActionBar(child: _bottomBar()),
      ),
    );
  }
}

class _StepIndicator extends StatelessWidget {
  const _StepIndicator({required this.step});

  final int step;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
      child: Row(
        children: [
          for (var i = 0; i < _stepTitles.length; i++) ...[
            if (i > 0) const SizedBox(width: 6),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    height: 4,
                    decoration: BoxDecoration(
                      color: i <= step ? AppColors.red : AppColors.line,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${i + 1}. ${_stepTitles[i]}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: i == step ? FontWeight.w800 : FontWeight.w500,
                      color: i <= step ? AppColors.text : AppColors.text3,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// 라디오·체크 선택 카드 (큰 터치 영역)
class _SelectCard extends StatelessWidget {
  const _SelectCard({
    required this.isSelected,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.trailing,
    this.isCheckbox = false,
  });

  final bool isSelected;
  final bool isCheckbox;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final icon = isCheckbox
        ? (isSelected ? Icons.check_box : Icons.check_box_outline_blank)
        : (isSelected ? Icons.radio_button_checked : Icons.radio_button_off);
    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: isSelected ? AppColors.red : Colors.transparent, width: 2),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 6, 14),
          child: Row(
            children: [
              Icon(icon, color: isSelected ? AppColors.red : AppColors.text3),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Text(subtitle, style: const TextStyle(color: AppColors.text2)),
                  ],
                ),
              ),
              ?trailing,
            ],
          ),
        ),
      ),
    );
  }
}

class _NfcGuide extends StatelessWidget {
  const _NfcGuide();

  @override
  Widget build(BuildContext context) {
    const steps = [
      '폰 설정에서 NFC 를 켜 주세요.',
      '"NFC 태그에 기록"을 누른 뒤 태그를 폰 뒷면 가운데(카메라 아래)에 대세요.',
      '"NFC 등록 완료"가 나올 때까지 태그를 떼지 마세요.',
    ];
    return SectionCard(
      icon: Icons.tips_and_updates_outlined,
      title: '기록 방법',
      children: [
        for (var i = 0; i < steps.length; i++)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Text('${i + 1}. ${steps[i]}', style: const TextStyle(height: 1.5)),
          ),
      ],
    );
  }
}
