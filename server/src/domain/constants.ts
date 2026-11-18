/** 응급정보 항목 키. persons.public_fields 와 공개 API 의 키로 쓴다. */
export const PROFILE_FIELDS = [
  'name',
  'birthDate',
  'bloodType',
  'conditions',
  'allergies',
  'medications',
  'notes',
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

/** 동의 항목 (개발 문서 4.1 APP-02) */
export const REQUIRED_CONSENT_TYPES = [
  'terms',
  'personalInfo',
  'sensitiveInfo',
  'thirdParty',
  'contactNotice',
] as const;
export const OPTIONAL_CONSENT_TYPES = ['alertPush'] as const;
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
} as const;

/** 이름을 공개하지 않은 사용자의 공개 화면 표기 */
export const ANONYMOUS_DISPLAY_NAME = '등록 사용자';
