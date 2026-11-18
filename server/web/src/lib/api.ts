import type { Aed, AlertAction, AlertStatus, CreateAlertResult, LatLng, PublicApi, PublicTag, RescuerPhoneResult } from './types';
import { ApiRequestError } from './types';
import { createMockApi } from './mock-api';

/** tagId 가 이 값이면 서버 없이 가짜 데이터로 화면을 보여준다 (/t/demo). */
export const DEMO_TAG_ID = 'demo';

export async function request<T>(method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) {
    let code = 'unknown';
    let message = `요청 실패 (${response.status})`;
    try {
      const data = (await response.json()) as { error?: { code?: string; message?: string } };
      code = data.error?.code ?? code;
      message = data.error?.message ?? message;
    } catch {
      // JSON 이 아닌 응답은 기본 메시지 사용
    }
    throw new ApiRequestError(response.status, code, message);
  }
  return (await response.json()) as T;
}

function createHttpApi(tagId: string): PublicApi {
  const tagPath = `/api/public/tags/${encodeURIComponent(tagId)}`;
  return {
    getTag: () => request<PublicTag>('GET', tagPath),
    createAlert: (action: AlertAction, position: LatLng | null) =>
      request<CreateAlertResult>('POST', `${tagPath}/alerts`, { action, ...(position ?? {}) }),
    getAlert: (alertId: string) =>
      request<AlertStatus>('GET', `/api/public/alerts/${encodeURIComponent(alertId)}`),
    getAeds: (position: LatLng, limit: number) =>
      request<Aed[]>('GET', `/api/public/aeds?lat=${position.lat}&lng=${position.lng}&limit=${limit}`),
    setRescuerPhone: (alertId: string, rescuerPhone: string) =>
      request<RescuerPhoneResult>('PATCH', `/api/public/alerts/${encodeURIComponent(alertId)}`, { rescuerPhone }),
  };
}

export function createApi(tagId: string): PublicApi {
  if (tagId === DEMO_TAG_ID) {
    return createMockApi(new URLSearchParams(location.search).get('state'));
  }
  return createHttpApi(tagId);
}

export interface PublicConfig {
  /** 카카오맵 JavaScript 키 */
  kakaoJsKey: string | null;
  /** 게이트웨이 폰 번호. 신고자 본인 확인 문자의 수신 번호 */
  gatewayPhone: string | null;
}

let configPromise: Promise<PublicConfig> | undefined;

/** 서버의 웹 공개 설정. 한 번만 요청하고, 못 가져오면 모두 null */
export function getPublicConfig(): Promise<PublicConfig> {
  configPromise ??= fetch('/api/public/config', { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<Partial<PublicConfig>>) : {}))
    .then((c: Partial<PublicConfig>) => ({ kakaoJsKey: c.kakaoJsKey ?? null, gatewayPhone: c.gatewayPhone ?? null }))
    .catch(() => ({ kakaoJsKey: null, gatewayPhone: null }));
  return configPromise;
}

/** 카카오맵 JavaScript 키 (없으면 null) */
export async function getKakaoJsKey(): Promise<string | null> {
  return (await getPublicConfig()).kakaoJsKey;
}
