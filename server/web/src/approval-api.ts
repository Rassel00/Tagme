/**
 * 보호자 승인 API 클라이언트 (개발 문서 6.3). /a/demo 는 서버 없이 가짜 데이터로 동작한다.
 * ?state=expired | invalid | nolocation | approved | other 로 다른 상태도 확인할 수 있다.
 */
import { request } from './api.js';
import type { AccessStatus } from './types.js';
import { ApiRequestError } from './types.js';

export interface ApprovalView {
  userName: string;
  tagLabel: string;
  alert: {
    createdAt: string;
    location: { lat: number; lng: number; mapUrl: string } | null;
    rescuerPhone: string | null;
    isRescuerVerified: boolean;
    hasContacted: boolean;
    hasRequestedAccess: boolean;
    accessStatus: AccessStatus;
    approvedUntil?: string;
    /** 결정한 보호자: 나 / 다른 보호자 / 아직 없음 */
    decidedBy: 'me' | 'other' | null;
  };
  myDecision: 'approve' | 'deny' | null;
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
}

export const DEMO_APPROVE_TOKEN = 'demo';

function createHttpApprovalApi(token: string): ApprovalApi {
  const url = `/api/approvals/${encodeURIComponent(token)}`;
  return {
    get: () => request<ApprovalView>('GET', url),
    decide: (decision, durationMinutes) => request<DecisionResult>('POST', url, { decision, durationMinutes }),
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
      hasContacted: true,
      hasRequestedAccess: true,
      accessStatus: 'requested',
      decidedBy: null,
    },
    myDecision: null,
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
