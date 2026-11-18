/**
 * 비상연락처 수락 API 클라이언트 (11/18). /c/demo 는 서버 없이 가짜 데이터로 동작한다.
 * ?state=invalid | accepted | declined 로 다른 상태도 확인할 수 있다.
 */
import { request } from './api';
import { ApiRequestError } from './types';

export type InviteStatus = 'pending' | 'accepted' | 'declined';

export interface InviteView {
  /** 태그 대상자 이름 */
  userName: string;
  tagLabel: string;
  status: InviteStatus;
}

export interface InviteApi {
  get(): Promise<InviteView>;
  decide(decision: 'accept' | 'decline'): Promise<InviteView>;
}

export const DEMO_INVITE_TOKEN = 'demo';

function createMockInviteApi(state: string | null): InviteApi {
  const view: InviteView = {
    userName: '김지우',
    tagLabel: '키링',
    status: state === 'accepted' || state === 'declined' ? state : 'pending',
  };
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return {
    async get() {
      await delay(250);
      if (state === 'invalid') throw new ApiRequestError(404, 'invite_not_found', '링크가 올바르지 않거나 더 이상 유효하지 않습니다.');
      return { ...view };
    },
    async decide(decision) {
      await delay(300);
      view.status = decision === 'accept' ? 'accepted' : 'declined';
      return { ...view };
    },
  };
}

export function createInviteApi(token: string): InviteApi {
  if (token === DEMO_INVITE_TOKEN) return createMockInviteApi(new URLSearchParams(location.search).get('state'));
  const url = `/api/invites/${encodeURIComponent(token)}`;
  return {
    get: () => request<InviteView>('GET', url),
    decide: (decision) => request<InviteView>('POST', url, { decision }),
  };
}
