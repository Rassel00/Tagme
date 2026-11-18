import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../config.dart';
import '../services/auth_service.dart';
import '../services/external_link.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/sign_out_dialog.dart';
import 'contact_form_dialog.dart';
import 'guide_page.dart';
import 'nfc_write_sheet.dart';
import 'person_form_page.dart';
import 'tag_editor_page.dart';

/// 하단 탭: 홈(태그) / 대상자 / 연락처 / 설정
class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int _tab = 0;
  final _tagsKey = GlobalKey<_TagsTabState>();
  final _personsKey = GlobalKey<_PersonsTabState>();
  final _contactsKey = GlobalKey<_ContactsTabState>();

  /// 다른 탭에서 바뀐 내용(대상자 이름, 연락처 수 등)을 반영하려고 탭을 열 때마다 새로 읽는다
  void _select(int tab) {
    setState(() => _tab = tab);
    switch (tab) {
      case 0:
        _tagsKey.currentState?.reload();
      case 1:
        _personsKey.currentState?.reload();
      case 2:
        _contactsKey.currentState?.reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    const titles = [AppConfig.appName, '대상자', '비상연락처', '설정'];
    return Scaffold(
      appBar: AppBar(title: Text(titles[_tab])),
      body: IndexedStack(
        index: _tab,
        children: [
          _TagsTab(key: _tagsKey),
          _PersonsTab(key: _personsKey),
          _ContactsTab(key: _contactsKey),
          const _SettingsTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: _select,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: '홈'),
          NavigationDestination(icon: Icon(Icons.people_outline), selectedIcon: Icon(Icons.people), label: '대상자'),
          NavigationDestination(
            icon: Icon(Icons.contact_phone_outlined),
            selectedIcon: Icon(Icons.contact_phone),
            label: '연락처',
          ),
          NavigationDestination(icon: Icon(Icons.settings_outlined), selectedIcon: Icon(Icons.settings), label: '설정'),
        ],
      ),
    );
  }
}

/// 목록 로딩·오류·내용을 한 곳에서 처리
Widget _asyncList<T>({
  required List<T>? items,
  required String? error,
  required VoidCallback onRetry,
  required Widget Function(List<T>) builder,
}) {
  if (error != null) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Text(error, textAlign: TextAlign.center),
            TextButton(onPressed: onRetry, child: const Text('다시 시도')),
          ],
        ),
      ),
    );
  }
  if (items == null) {
    return const Padding(
      padding: EdgeInsets.all(32),
      child: Center(child: CircularProgressIndicator()),
    );
  }
  return builder(items);
}

// ---------------------------------------------------------------- 홈: 태그 추가 + 태그 목록 + AED

class _TagsTab extends StatefulWidget {
  const _TagsTab({super.key});

  @override
  State<_TagsTab> createState() => _TagsTabState();
}

class _TagsTabState extends State<_TagsTab> {
  List<TagInfo>? _tags;
  String? _error;

  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload() async {
    try {
      final tags = await ApiClient.instance.getTags();
      if (!mounted) return;
      setState(() {
        _tags = tags;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _openEditor([String? tagId]) async {
    await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => TagEditorPage(tagId: tagId)));
    reload();
  }

  Future<void> _writeNfc(TagInfo tag) async {
    if (await showNfcWriteSheet(context, tagId: tag.tagId, url: tag.url)) reload();
  }

  Future<void> _openAed() async {
    final isOpened = await ExternalLink.open('${AppConfig.apiBaseUrl}/aed');
    if (!isOpened && mounted) showMessage(context, '브라우저를 열 수 없어요.');
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: reload,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
        children: [
          _AddTagCard(onTap: () => _openEditor()),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _openAed,
            icon: const Icon(Icons.heart_broken_outlined),
            label: const Text('주변 AED 찾기 ↗'),
          ),
          const SizedBox(height: 24),
          const Text(
            '등록한 태그',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.text2),
          ),
          const SizedBox(height: 10),
          _asyncList<TagInfo>(
            items: _tags,
            error: _error,
            onRetry: reload,
            builder: (tags) => tags.isEmpty
                ? const EmptyState(
                    icon: Icons.nfc,
                    title: '첫 태그를 등록해 주세요',
                    description: '대상자의 응급정보와 비상연락처를 연결하고\nNFC 키링·팔찌에 기록할 수 있어요.',
                  )
                : Column(
                    children: [
                      for (final tag in tags) ...[
                        _TagCard(tag: tag, onTap: () => _openEditor(tag.tagId), onWriteNfc: () => _writeNfc(tag)),
                        const SizedBox(height: 10),
                      ],
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _AddTagCard extends StatelessWidget {
  const _AddTagCard({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.red,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: const Padding(
          padding: EdgeInsets.all(20),
          child: Row(
            children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: Colors.white24,
                child: Icon(Icons.add, color: Colors.white, size: 32),
              ),
              SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '태그 추가',
                      style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800),
                    ),
                    SizedBox(height: 2),
                    Text('대상자 정보 → 비상연락처 → NFC 기록', style: TextStyle(color: Colors.white, fontSize: 14, height: 1.4)),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: Colors.white),
            ],
          ),
        ),
      ),
    );
  }
}

class _TagCard extends StatelessWidget {
  const _TagCard({required this.tag, required this.onTap, required this.onWriteNfc});

  final TagInfo tag;
  final VoidCallback onTap;
  final VoidCallback onWriteNfc;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(color: AppColors.redSoft, borderRadius: BorderRadius.circular(14)),
                    child: const Icon(Icons.nfc, color: AppColors.red, size: 26),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tag.displayName, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            StatusBadge(
                              label: tag.isNfcWritten ? 'NFC 기록됨' : 'NFC 기록 필요',
                              isPositive: tag.isNfcWritten,
                            ),
                            StatusBadge(
                              label: tag.contactCount == tag.acceptedContactCount
                                  ? '비상연락처 ${tag.contactCount}명'
                                  : '비상연락처 수락 ${tag.acceptedContactCount}/${tag.contactCount}명',
                              isPositive: tag.acceptedContactCount > 0,
                            ),
                            if (tag.personId == null) const StatusBadge(label: '대상자 없음', isPositive: false),
                            if (!tag.isActive) const StatusBadge(label: '사용 중지', isPositive: false),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: AppColors.text3),
                ],
              ),
              if (!tag.isNfcWritten) ...[
                const SizedBox(height: 12),
                OutlinedButton.icon(onPressed: onWriteNfc, icon: const Icon(Icons.nfc), label: const Text('NFC 기록하기')),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- 대상자

class _PersonsTab extends StatefulWidget {
  const _PersonsTab({super.key});

  @override
  State<_PersonsTab> createState() => _PersonsTabState();
}

class _PersonsTabState extends State<_PersonsTab> {
  List<Person>? _persons;
  String? _error;

  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload() async {
    try {
      final persons = await ApiClient.instance.getPersons();
      if (!mounted) return;
      setState(() {
        _persons = persons;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _open([Person? person]) async {
    final saved = await Navigator.push<Person>(
      context,
      MaterialPageRoute(builder: (_) => PersonFormPage(person: person)),
    );
    if (saved != null && mounted) showMessage(context, '${saved.name}님 정보를 저장했어요.');
    reload();
  }

  Future<void> _delete(Person person) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('${person.name}님을 삭제할까요?'),
        content: Text(
          person.tagCount > 0 ? '연결된 태그 ${person.tagCount}개는 남지만, 태그를 대도 응급정보가 보이지 않게 됩니다.' : '대상자의 응급정보가 삭제됩니다.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('취소')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('삭제')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ApiClient.instance.deletePerson(person.personId!);
      reload();
    } catch (e) {
      if (mounted) showMessage(context, e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: reload,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
        children: [
          const Text(
            '태그를 지니고 다닐 사람(어린이·어르신 등)의 응급정보예요. 같은 대상자의 태그는 정보를 함께 써요.',
            style: TextStyle(color: AppColors.text2, height: 1.5),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () => _open(),
            icon: const Icon(Icons.person_add_alt_1),
            label: const Text('대상자 등록'),
          ),
          const SizedBox(height: 16),
          _asyncList<Person>(
            items: _persons,
            error: _error,
            onRetry: reload,
            builder: (persons) => persons.isEmpty
                ? const EmptyState(
                    icon: Icons.people_outline,
                    title: '등록된 대상자가 없어요',
                    description: '태그 추가 중에도 바로 등록할 수 있어요.',
                  )
                : Column(
                    children: [
                      for (final person in persons) ...[
                        Card(
                          child: ListTile(
                            contentPadding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
                            leading: const CircleAvatar(
                              backgroundColor: AppColors.redSoft,
                              child: Icon(Icons.person, color: AppColors.red),
                            ),
                            title: Text(person.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                            subtitle: Text(
                              [if (person.summary.isNotEmpty) person.summary, '태그 ${person.tagCount}개'].join('\n'),
                            ),
                            isThreeLine: person.summary.isNotEmpty,
                            onTap: () => _open(person),
                            trailing: IconButton(
                              tooltip: '삭제',
                              icon: const Icon(Icons.delete_outline),
                              onPressed: () => _delete(person),
                            ),
                          ),
                        ),
                        const SizedBox(height: 10),
                      ],
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------- 비상연락처 주소록

class _ContactsTab extends StatefulWidget {
  const _ContactsTab({super.key});

  @override
  State<_ContactsTab> createState() => _ContactsTabState();
}

class _ContactsTabState extends State<_ContactsTab> {
  List<AddressContact>? _contacts;
  String? _error;

  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload() async {
    try {
      final contacts = await ApiClient.instance.getContacts();
      if (!mounted) return;
      setState(() {
        _contacts = contacts;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _edit([AddressContact? contact]) async {
    final saved = await showContactForm(context, contact: contact);
    if (saved != null) reload();
  }

  Future<void> _delete(AddressContact contact) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('${contact.name}님을 삭제할까요?'),
        content: Text(
          contact.tagCount > 0
              ? '이 연락처를 쓰는 태그 ${contact.tagCount}개에서도 빠집니다. 신고가 들어와도 이 사람에게는 문자가 가지 않아요.'
              : '주소록에서 삭제합니다.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('취소')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('삭제')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ApiClient.instance.deleteContact(contact.contactId!);
      reload();
    } catch (e) {
      if (mounted) showMessage(context, e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: reload,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
        children: [
          const Text(
            '위급할 때 문자를 받을 사람을 미리 등록해 두세요. 태그를 추가할 때 여기서 최대 3명을 골라요.',
            style: TextStyle(color: AppColors.text2, height: 1.5),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(onPressed: () => _edit(), icon: const Icon(Icons.add), label: const Text('비상연락처 추가')),
          const SizedBox(height: 16),
          _asyncList<AddressContact>(
            items: _contacts,
            error: _error,
            onRetry: reload,
            builder: (contacts) => contacts.isEmpty
                ? const EmptyState(
                    icon: Icons.contact_phone_outlined,
                    title: '등록된 비상연락처가 없어요',
                    description: '가족, 담임 선생님, 요양보호사 등을 추가하세요.',
                  )
                : Column(
                    children: [
                      for (final contact in contacts) ...[
                        Card(
                          child: ListTile(
                            contentPadding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
                            leading: const CircleAvatar(
                              backgroundColor: AppColors.redSoft,
                              child: Icon(Icons.person, color: AppColors.red),
                            ),
                            title: Text(
                              contact.title,
                              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                            ),
                            subtitle: Text(
                              '${AddressContact.formatPhone(contact.phone)}\n태그 ${contact.tagCount}개에서 사용',
                            ),
                            isThreeLine: true,
                            onTap: () => _edit(contact),
                            trailing: IconButton(
                              tooltip: '삭제',
                              icon: const Icon(Icons.delete_outline),
                              onPressed: () => _delete(contact),
                            ),
                          ),
                        ),
                        const SizedBox(height: 10),
                      ],
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------- 설정

class _SettingsTab extends StatefulWidget {
  const _SettingsTab();

  @override
  State<_SettingsTab> createState() => _SettingsTabState();
}

class _SettingsTabState extends State<_SettingsTab> {
  bool _isLinking = false;

  Future<void> _linkGoogle() async {
    setState(() => _isLinking = true);
    try {
      await AuthService.instance.linkGoogle();
      await ApiClient.instance.registerMe();
      if (mounted) showMessage(context, '구글 계정을 연결했어요. 이제 다른 폰에서도 이 정보로 로그인할 수 있어요.');
    } catch (e) {
      final message = AuthService.describeError(e);
      if (mounted && message != null) showMessage(context, message);
    } finally {
      if (mounted) setState(() => _isLinking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: AuthService.instance.userChanges,
      builder: (context, snapshot) {
        final user = snapshot.data ?? FirebaseAuth.instance.currentUser;
        final isGuest = user?.isAnonymous ?? false;
        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
          children: [
            Card(
              child: Column(
                children: [
                  ListTile(
                    leading: Icon(
                      isGuest ? Icons.person_outline : Icons.account_circle,
                      color: AppColors.red,
                      size: 32,
                    ),
                    title: Text(
                      isGuest ? '게스트' : (user?.email ?? '구글 계정'),
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    subtitle: Text(isGuest ? '구글 계정을 연결해야 다른 폰에서도 이어서 쓸 수 있어요' : '구글 계정으로 로그인됨'),
                  ),
                  if (isGuest) ...[
                    const Divider(height: 1),
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: FilledButton.icon(
                        onPressed: _isLinking ? null : _linkGoogle,
                        icon: const Icon(Icons.link),
                        label: Text(_isLinking ? '연결 중…' : '구글 계정 연결'),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.menu_book_outlined),
                    title: const Text('사용 가이드'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const GuidePage())),
                  ),
                  const Divider(height: 1),
                  // 게스트는 로그아웃 대신 계정 삭제 (로그아웃하면 다시 들어올 수 없어 태그가 주인 없이 남는다)
                  ListTile(
                    leading: Icon(isGuest ? Icons.delete_outline : Icons.logout, color: isGuest ? AppColors.red : null),
                    title: Text(
                      isGuest ? '게스트 계정 삭제' : '로그아웃',
                      style: isGuest ? const TextStyle(color: AppColors.red) : null,
                    ),
                    subtitle: isGuest ? const Text('등록한 대상자·태그·연락처가 모두 삭제돼요') : null,
                    onTap: () => confirmSignOut(context),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              '${AppConfig.appName} · 서버 ${AppConfig.apiBaseUrl}',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: AppColors.text3),
            ),
          ],
        );
      },
    );
  }
}
