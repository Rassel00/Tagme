/** 응급정보 항목 키. persons.public_fields 와 공개 API 의 키로 쓴다. */
export const PROFILE_FIELDS = [
  'name',
  'birthDate',
  'bloodType',
  'conditions',
  'allergies',
  'medications',
  'notes',
  // 11/18 유형별 항목 (주로 장애인 유형). 다른 항목처럼 공개·비공개를 고른다
  'disabilityType',
  'communication',
  'careTips',
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

/**
 * 공개 여부를 고르는 키: 응급정보 항목 + 보험 목록(11/18). 보험은 여러 개라도 공개 여부를 한 번에 정한다
 */
export const PUBLIC_FIELDS = [...PROFILE_FIELDS, 'insurances'] as const;
export type PublicField = (typeof PUBLIC_FIELDS)[number];

export const MAX_INSURANCES_PER_PERSON = 3;

/** 대상자 유형 (11/18, 사업계획서 19장). 웹 응급 화면의 제목과 상단에 먼저 보여 줄 항목이 달라진다 */
export const PERSON_TYPES = ['general', 'disabled', 'elderly', 'child'] as const;
export type PersonType = (typeof PERSON_TYPES)[number];

/** 동의 항목 (개발 문서 4.1 APP-02) */
export const REQUIRED_CONSENT_TYPES = [
  'terms',
  'personalInfo',
  'sensitiveInfo',
  'thirdParty',
  'contactNotice',
] as const;
/**
 * 선택 동의 항목. 11/18 '신고 알림 수신(alertPush)' 을 뺐다: 아직 없는 기능(APP-11)이고,
 * 스캔·신고 알림은 서비스 알림이라 별도 수신 동의 대상이 아니다 (광고성만 해당). 알림을 만들 때는
 * OS 알림 권한 + 앱 설정 스위치로 처리한다. DB CHECK 제약과 기존 동의 기록에는 남아 있어도 무방
 */
export const OPTIONAL_CONSENT_TYPES = [] as const;
export const CONSENT_TYPES = [...REQUIRED_CONSENT_TYPES, ...OPTIONAL_CONSENT_TYPES] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

/** 약관 버전. 바뀌면 앱이 재동의를 받는다. */
export const CONSENT_VERSION = '2026-11-09';

export const ACCESS_STATUSES = ['none', 'requested', 'approved', 'denied', 'expired'] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export const SMS_JOB_STATUSES = ['pending', 'sending', 'sent', 'failed'] as const;
export type SmsJobStatus = (typeof SMS_JOB_STATUSES)[number];

/** 확정값 (WBS 착수 전 결정 사항, 11/16) */
export const LIMITS = {
  maxContactsPerTag: 3,
  defaultApproveMinutes: 30,
  alertLifetimeHours: 24,
  renotifyIntervalMinutes: 5,
  newAlertCooldownMinutes: 1,
  newAlertsPerTagPerDay: 10,
  publicLookupsPerIpPerMinute: 30,
  /**
   * 같은 IP 의 신규 신고 (장난 신고 방지, 11/18). 이동통신사는 여러 사용자가 IP 하나를 함께 쓰므로(CGNAT)
   * 실제 응급 신고가 막히지 않도록 넉넉하게 둔다. 같은 신고에 다시 누르는 것(병합)은 세지 않는다
   */
  newAlertsPerIpPer10Minutes: 5,
  newAlertsPerIpPerDay: 20,
  /** 신고자 메모 최대 길이. 보호자 문자가 너무 길어지지 않게 */
  rescuerMemoMaxLength: 100,
  /** 비상연락처 수락 안내 문자: 사용자당 하루 (남의 번호로 안내 문자를 반복해 보내는 것 방지) */
  contactInvitesPerUserPerDay: 10,
  /** 같은 연락처에 안내 문자를 다시 보낼 수 있는 간격 */
  contactInviteResendMinutes: 10,
} as const;

/** 태그 비상연락처 수락 상태. accepted 인 연락처에게만 신고 알림을 보낸다 */
export const INVITE_STATUSES = ['pending', 'accepted', 'declined'] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

/** 이름을 공개하지 않은 사용자의 공개 화면 표기 */
export const ANONYMOUS_DISPLAY_NAME = '등록 사용자';
