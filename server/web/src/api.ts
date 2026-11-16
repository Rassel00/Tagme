import type { Aed, AlertAction, AlertStatus, CreateAlertResult, LatLng, PublicApi, PublicTag } from './types.js';
import { ApiRequestError } from './types.js';
import { createMockApi } from './mock-api.js';

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
  };
}

export function createApi(tagId: string): PublicApi {
  if (tagId === DEMO_TAG_ID) {
    return createMockApi(new URLSearchParams(location.search).get('state'));
  }
  return createHttpApi(tagId);
}
