/**
 * 신고 처리 규칙 (개발 문서 7.1·7.2). DB 와 분리한 순수 함수라 단위 테스트로 검증한다.
 */
import { LIMITS, PROFILE_FIELDS, type AccessStatus, type ProfileField } from './constants.js';

const MINUTE = 60_000;

export type AlertAction = 'contact' | 'requestAccess';

/** 신고 생성 후 24시간이 지나거나 closedAt 이 있으면 종료된 신고 */
export function isAlertOpen(alert: { createdAt: Date; closedAt: Date | null }, now: Date): boolean {
  if (alert.closedAt) return false;
  return now.getTime() - alert.createdAt.getTime() < LIMITS.alertLifetimeHours * 60 * MINUTE;
}

/** approved 인데 공개 시간이 지났으면 expired 로 본다 (7.2 approved → expired) */
export function effectiveAccessStatus(
  status: AccessStatus,
  approvedUntil: Date | null,
  now: Date,
): AccessStatus {
  if (status === 'approved' && approvedUntil && approvedUntil.getTime() <= now.getTime()) return 'expired';
  return status;
}

export interface MergeState {
  hasContacted: boolean;
  hasRequestedAccess: boolean;
  accessStatus: AccessStatus;
  approvedUntil: Date | null;
  lastNotifiedAt: Date | null;
}

export interface MergePlan {
  /** 보호자에게 문자를 다시 보낼지 */
  shouldNotify: boolean;
  hasContacted: boolean;
  hasRequestedAccess: boolean;
  accessStatus: AccessStatus;
}

/**
 * 진행 중인 신고에 버튼을 다시 누른 경우 (7.1)
 * - 다른 버튼을 처음 누름: 플래그만 표시, 문자 추가 발송 없음
 * - 같은 버튼을 다시 누름: 마지막 알림 후 5분이 지났으면 재알림
 * - 열람 요청: none·expired 이면 requested 로. approved 는 그대로(바로 공개), denied 는 다른 보호자 승인 대기
 */
export function planMergedAlert(state: MergeState, action: AlertAction, now: Date): MergePlan {
  const isRepeat = action === 'contact' ? state.hasContacted : state.hasRequestedAccess;
  const sinceLastNotify = state.lastNotifiedAt ? now.getTime() - state.lastNotifiedAt.getTime() : Infinity;
  const shouldNotify = isRepeat && sinceLastNotify >= LIMITS.renotifyIntervalMinutes * MINUTE;

  let accessStatus = effectiveAccessStatus(state.accessStatus, state.approvedUntil, now);
  if (action === 'requestAccess' && (accessStatus === 'none' || accessStatus === 'expired')) {
    accessStatus = 'requested';
  }

  return {
    shouldNotify,
    hasContacted: state.hasContacted || action === 'contact',
    hasRequestedAccess: state.hasRequestedAccess || action === 'requestAccess',
    accessStatus,
  };
}

export type Decision = 'approve' | 'deny';

/**
 * 보호자 결정 (7.2). 변경이 없으면 null.
 * - approve: 언제든 가능(요청 전 미리 승인, 거절·만료 후 재승인 포함). 이미 공개 중이면 변경 없음
 * - deny: none·requested 일 때만. 이미 승인된 공개는 거절로 되돌리지 않는다
 */
export function applyDecision(
  current: AccessStatus,
  decision: Decision,
  durationMinutes: number,
  now: Date,
): { accessStatus: AccessStatus; approvedUntil: Date | null } | null {
  if (decision === 'approve') {
    if (current === 'approved') return null;
    return { accessStatus: 'approved', approvedUntil: new Date(now.getTime() + durationMinutes * MINUTE) };
  }
  if (current === 'none' || current === 'requested') return { accessStatus: 'denied', approvedUntil: null };
  return null;
}

// ---------------------------------------------------------------- 응급정보 공개 범위

export type ProfileRecord = Record<ProfileField, string> & { publicFields: ProfileField[] };

/** 공개 화면: 공개 항목은 값, 비공개 항목은 항목명만 (값이 있는 항목만) */
export function toPublicView(profile: ProfileRecord | null): {
  publicInfo: Partial<Record<ProfileField, string>>;
  lockedFields: ProfileField[];
} {
  const publicInfo: Partial<Record<ProfileField, string>> = {};
  const lockedFields: ProfileField[] = [];
  if (!profile) return { publicInfo, lockedFields };
  for (const field of PROFILE_FIELDS) {
    const value = profile[field];
    if (!value) continue;
    if (profile.publicFields.includes(field)) publicInfo[field] = value;
    else lockedFields.push(field);
  }
  return { publicInfo, lockedFields };
}

/** 승인 후 공개되는 비공개 항목 값 */
export function toLockedValues(profile: ProfileRecord | null): Partial<Record<ProfileField, string>> {
  const values: Partial<Record<ProfileField, string>> = {};
  if (!profile) return values;
  for (const field of PROFILE_FIELDS) {
    const value = profile[field];
    if (value && !profile.publicFields.includes(field)) values[field] = value;
  }
  return values;
}
