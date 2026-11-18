/**
 * 보호자 승인 API 클라이언트 (개발 문서 6.3). /a/demo 는 서버 없이 가짜 데이터로 동작한다.
 * ?state=expired | invalid | nolocation | approved | other 로 다른 상태도 확인할 수 있다.
 */
import { request } from './api';
import type { AccessStatus } from './types';
import { ApiRequestError } from './types';

export interface ApprovalView {
  userName: string;
  tagLabel: string;
  alert: {
    createdAt: string;
    location: { lat: number; lng: number; mapUrl: string } | null;
    rescuerPhone: string | null;
    isRescuerVerified: boolean;
    /** 신고자가 비상연락망 연락 확인 팝업에 남긴 메모 */
    rescuerMemo: string | null;
    hasContacted: boolean;
    hasRequestedAccess: boolean;
    accessStatus: AccessStatus;
    approvedUntil?: string;
    /** 결정한 보호자: 나 / 다른 보호자 / 아직 없음 */
    decidedBy: 'me' | 'other' | null;
    /** [제가 대응할게요]를 마지막으로 누른 보호자 (11/18). 다른 보호자는 주소록 이름으로 보인다 */
    responding: { by: 'me' | 'other'; name: string; at: string } | null;
  };
  myDecision: 'approve' | 'deny' | null;
  /** false 면 이 보호자는 이 태그 알림을 해제했다 */
  isSubscribed: boolean;
  expiresAt: string;
  defaultDurationMinutes: number;
}

export interface DecisionResult extends ApprovalView {
  /** false 면 다른 보호자가 먼저 처리해 이번 결정은 반영되지 않음 */
  isApplied: boolean;
}

export interface ApprovalApi {
  get(): Promise<ApprovalView>;
  decide(decision: 'approve' | 'deny', durationMinutes: number): Promise<DecisionResult>;
  /** 이 태그의 알림 그만 받기 (태그 비상연락처에서 내 번호를 뺀다) */
  optOut(): Promise<ApprovalView>;
  /** 다른 보호자와 신고자에게 대응 중이라고 알린다 */
  respond(): Promise<ApprovalView>;
}

export const DEMO_APPROVE_TOKEN = 'demo';

function createHttpApprovalApi(token: string): ApprovalApi {
  const url = `/api/approvals/${encodeURIComponent(token)}`;
  return {
    get: () => request<ApprovalView>('GET', url),
    decide: (decision, durationMinutes) => request<DecisionResult>('POST', url, { decision, durationMinutes }),
    optOut: () => request<ApprovalView>('POST', `${url}/opt-out`),
    respond: () => request<ApprovalView>('POST', `${url}/respond`),
  };
}

function createMockApprovalApi(state: string | null): ApprovalApi {
  const now = Date.now();
  const view: ApprovalView = {
    userName: '김지우',
    tagLabel: '키링',
    alert: {
      createdAt: new Date(now - 3 * 60_000).toISOString(),
      location:
        state === 'nolocation'
          ? null
          : { lat: 37.2939, lng: 126.9744, mapUrl: 'https://maps.google.com/?q=37.293900,126.974400' },
      rescuerPhone: '01098765432',
      isRescuerVerified: state !== 'nolocation',
      rescuerMemo: state === 'nolocation' ? null : '010-9876-5432 학생회관 앞에서 쓰러져 의식 없음',
      hasContacted: true,
      hasRequestedAccess: true,
      accessStatus: 'requested',
      decidedBy: null,
      // 데모 ?state=responding: 다른 보호자가 먼저 대응 중
      responding: state === 'responding' ? { by: 'other', name: '아빠', at: new Date(now - 60_000).toISOString() } : null,
    },
    myDecision: null,
    isSubscribed: true,
    expiresAt: new Date(now + 24 * 3_600_000).toISOString(),
    defaultDurationMinutes: 30,
  };
  if (state === 'approved' || state === 'other') {
    view.alert.accessStatus = 'approved';
    view.alert.approvedUntil = new Date(now + 25 * 60_000).toISOString();
    view.alert.decidedBy = state === 'approved' ? 'me' : 'other';
  }

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const snapshot = (): ApprovalView => JSON.parse(JSON.stringify(view)) as ApprovalView;

  return {
    async get() {
      await delay(250);
      if (state === 'invalid') throw new ApiRequestError(404, 'approval_not_found', '승인 링크가 올바르지 않습니다.');
      if (state === 'expired') throw new ApiRequestError(410, 'approval_expired', '승인 링크가 만료되었습니다.');
      return snapshot();
    },
    async respond() {
      await delay(300);
      view.alert.responding = { by: 'me', name: '나', at: new Date().toISOString() };
      return snapshot();
    },
    async optOut() {
      await delay(300);
      view.isSubscribed = false;
      return snapshot();
    },
    async decide(decision, durationMinutes) {
      await delay(400);
      const status = view.alert.accessStatus;
      const isApplied = decision === 'approve' ? status !== 'approved' : status === 'none' || status === 'requested';
      if (isApplied) {
        view.alert.accessStatus = decision === 'approve' ? 'approved' : 'denied';
        view.alert.approvedUntil =
          decision === 'approve' ? new Date(Date.now() + durationMinutes * 60_000).toISOString() : undefined;
        view.alert.decidedBy = 'me';
        view.myDecision = decision;
      }
      return { ...snapshot(), isApplied };
    },
  };
}

export function createApprovalApi(token: string): ApprovalApi {
  if (token === DEMO_APPROVE_TOKEN) {
    return createMockApprovalApi(new URLSearchParams(location.search).get('state'));
  }
  return createHttpApprovalApi(token);
}
