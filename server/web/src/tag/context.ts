/** 주소로 정해지는 페이지 설정. 페이지가 열린 뒤 바뀌지 않는다 */
import { DEMO_TAG_ID, createApi } from '../lib/api';
import { getPosition } from '../lib/geo';
import { DEMO_POSITION } from '../lib/mock-api';
import type { LatLng } from '../lib/types';

export const POSITION_TIMEOUT_MS = 5000;

export const tagId = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] ?? '');
export const isDemo = tagId === DEMO_TAG_ID;
/** /aed: 태그 없이 주변 AED 만 보는 페이지 (보호자 앱에서 연다) */
export const isAedOnly = location.pathname.replace(/\/+$/, '') === '/aed';
export const api = createApi(tagId);

/** 신고에 붙일 현재 위치. 못 얻으면 null (신고는 위치 없이도 진행) */
export async function currentPositionForAlert(): Promise<LatLng | null> {
  if (isDemo) return DEMO_POSITION;
  const result = await getPosition(POSITION_TIMEOUT_MS);
  return result.ok ? result.position : null;
}

// 진행 중인 신고 ID. 새로고침해도 이어지도록 sessionStorage 에 둔다
const alertStorageKey = `tagme:alert:${tagId}`;

export function readStoredAlertId(): string | undefined {
  try {
    return sessionStorage.getItem(alertStorageKey) ?? undefined;
  } catch {
    return undefined;
  }
}

export function storeAlertId(alertId: string | undefined): void {
  try {
    if (alertId) sessionStorage.setItem(alertStorageKey, alertId);
    else sessionStorage.removeItem(alertStorageKey);
  } catch {
    // 저장 실패해도 현재 탭에서는 동작
  }
}
