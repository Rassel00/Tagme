import 'package:flutter/material.dart';

import '../theme.dart';

/// 사용 가이드 (설정 → 사용 가이드)
class GuidePage extends StatelessWidget {
  const GuidePage({super.key});

  static const _sections = <(IconData, String, List<String>)>[
    (
      Icons.favorite_outline,
      'TagMe 는 이런 서비스예요',
      [
        '보호자가 앱에 대상자(어린이·어르신 등)의 응급정보와 비상연락처를 등록하고, NFC 키링·팔찌에 기록해요.',
        '위급할 때 주변 사람이 태그를 폰에 대면 응급 지원 페이지가 열려 119 신고, 보호자 알림, 응급정보 확인, 주변 AED 찾기를 할 수 있어요.',
        '태그에는 페이지 주소만 들어 있고, 개인정보는 태그에 저장되지 않아요.',
      ],
    ),
    (
      Icons.people_outline,
      '대상자 등록하기',
      ['"대상자" 탭 또는 태그 추가 1단계에서 이름, 생년월일, 혈액형, 지병, 알레르기, 복용약, 유의사항을 입력해요.', '같은 대상자에게 태그를 여러 개 연결하면 응급정보를 함께 써요.'],
    ),
    (
      Icons.visibility_outlined,
      '공개 범위 정하기',
      [
        '"누구나 보기": 태그를 댄 사람 누구나 바로 볼 수 있어요. 혈액형·알레르기처럼 응급처치에 바로 필요한 정보에 권해요.',
        '"승인 후 보기": 신고자가 열람을 요청하면 보호자에게 문자가 가고, 보호자가 승인한 경우에만 정한 시간 동안 그 신고자에게 보여요.',
      ],
    ),
    (
      Icons.contact_phone_outlined,
      '비상연락처 관리하기',
      [
        '"연락처" 탭에서 가족, 담임 선생님, 요양보호사 등을 미리 등록해요.',
        '태그마다 최대 3명을 골라요. 주소록에서 번호를 고치면 그 연락처를 쓰는 모든 태그에 바로 반영돼요.',
        '연락처 주인에게 비상연락처로 등록한다는 사실을 꼭 알려 주세요.',
      ],
    ),
    (
      Icons.nfc,
      '태그 추가·NFC 기록하기',
      [
        '홈의 "태그 추가" → ① 대상자 → ② 비상연락처·메시지 → ③ NFC 기록 순서로 진행해요.',
        '폰의 NFC 를 켜고, 태그를 폰 뒷면 가운데에 댄 채 "NFC 등록 완료"가 나올 때까지 기다려요.',
        'NFC 기록은 "나중에 기록"할 수 있고, 홈의 태그 카드에서 다시 할 수 있어요.',
        '기록이 안 되면 "URL 복사" 후 NFC Tools 같은 앱으로 기록해도 돼요.',
      ],
    ),
    (
      Icons.sos_outlined,
      '위급할 때는 이렇게 동작해요',
      [
        '태그를 댄 사람이 "비상연락망에 연락하기"를 누르면 비상연락처 전원에게 위치와 승인 링크가 담긴 문자가 가요.',
        '보호자는 문자 속 링크에서 상황과 위치를 확인하고, 신고자에게 전화하거나 응급정보 공개를 승인할 수 있어요.',
        '119 신고 버튼은 항상 맨 위에 있어요.',
      ],
    ),
    (
      Icons.heart_broken_outlined,
      '주변 AED 찾기',
      ['홈의 "주변 AED 찾기"를 누르면 브라우저가 열리고, 위치 권한을 허용하면 가까운 순서로 보여줘요.', '항목을 누르면 지도 앱에서 길찾기가 열려요.'],
    ),
    (
      Icons.manage_accounts_outlined,
      '계정과 문제 해결',
      [
        '게스트로 시작했다면 "설정 → 구글 계정 연결"을 해 두세요. 앱을 지우거나 폰을 바꿔도 정보를 이어서 관리할 수 있어요.',
        '저장이 안 되면 네트워크 연결을 확인하고 다시 시도하세요.',
        'NFC 기록이 실패하면 태그를 조금 옮겨 대거나, 폰 케이스를 벗기고 다시 시도하세요.',
      ],
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('사용 가이드')),
      body: ListView.separated(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
        itemCount: _sections.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          final (icon, title, lines) = _sections[index];
          return Card(
            clipBehavior: Clip.antiAlias,
            child: ExpansionTile(
              initiallyExpanded: index == 0,
              leading: Icon(icon, color: AppColors.red),
              title: Text('${index + 1}. $title', style: const TextStyle(fontWeight: FontWeight.w800)),
              shape: const Border(),
              childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final line in lines)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('•  ', style: TextStyle(height: 1.5)),
                        Expanded(child: Text(line, style: const TextStyle(height: 1.5))),
                      ],
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}
