/**
 * /t/demo 전용 가짜 API. 서버·DB 없이 시안 화면과 흐름(신고 → 승인 대기 → 승인 → 만료)을 확인한다.
 * ?state=notfound | inactive | nocontact 로 예외 화면도 볼 수 있다.
 */
import { distanceMeters } from './geo.js';
import type { Aed, AlertAction, AlertStatus, CreateAlertResult, LatLng, PublicApi, PublicTag } from './types.js';
import { ApiRequestError } from './types.js';

/** 위치 권한이 없을 때 데모에서 쓰는 기준 위치 (개발 문서 예시 좌표) */
export const DEMO_POSITION: LatLng = { lat: 37.2939, lng: 126.9744 };

const DEMO_AEDS: Omit<Aed, 'distanceM'>[] = [
  { name: '중앙도서관', place: '1층 로비 (평일 09:00~22:00)', address: '경기 수원시 장안구 서부로 2066', lat: 37.2944, lng: 126.9759 },
  { name: '학생회관', place: '1층 안내데스크 옆', address: '경기 수원시 장안구 서부로 2066', lat: 37.2925, lng: 126.9725 },
  { name: '체육관', place: '정문 로비', address: '경기 수원시 장안구 서부로 2066', lat: 37.2965, lng: 126.9737 },
  { name: '제1공학관', place: '1층 엘리베이터 앞', address: '경기 수원시 장안구 서부로 2066', lat: 37.2915, lng: 126.9768 },
  { name: '율전동 행정복지센터', place: '민원실 입구', address: '경기 수원시 장안구 율전로 98', lat: 37.2981, lng: 126.9705 },
];

const AUTO_APPROVE_MS = 5000;
const APPROVE_MINUTES = 30;

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function createMockApi(state: string | null): PublicApi {
  const tag: PublicTag = {
    publicInfo: { bloodType: 'A형 (Rh+)', allergies: '페니실린' },
    lockedFields: ['name', 'birthDate', 'conditions', 'medications', 'notes'],
    contactCount: state === 'nocontact' ? 0 : 2,
  };
  const hidden = { name: '김지우', birthDate: '2003-05-14', conditions: '천식', medications: '천식 흡입기 (살부타몰)', notes: '응급 시 천식 흡입기 사용이 필요합니다.' };

  let alert: (AlertStatus & { id: string }) | undefined;
  let requestedAt = 0;

  return {
    async getTag() {
      await delay(250);
      if (state === 'notfound') throw new ApiRequestError(404, 'tag_not_found', '등록되지 않은 태그입니다.');
      if (state === 'inactive') throw new ApiRequestError(410, 'tag_inactive', '사용이 중지된 태그입니다.');
      return tag;
    },

    async createAlert(action: AlertAction, _position: LatLng | null): Promise<CreateAlertResult> {
      await delay(500);
      const isMerged = alert !== undefined;
      alert ??= { id: 'al_demo', accessStatus: 'none' };
      if (action === 'requestAccess' && alert.accessStatus === 'none') {
        alert.accessStatus = 'requested';
        requestedAt = Date.now();
      }
      return { alertId: alert.id, code: 'K4P9QZ', notifiedCount: isMerged ? 0 : tag.contactCount, isMerged };
    },

    async getAlert(_alertId: string): Promise<AlertStatus> {
      await delay(150);
      if (!alert) throw new ApiRequestError(404, 'alert_not_found', '신고를 찾을 수 없습니다.');
      // 데모: 요청 5초 뒤 보호자가 승인한 것으로 처리
      if (alert.accessStatus === 'requested' && Date.now() - requestedAt > AUTO_APPROVE_MS) {
        alert.accessStatus = 'approved';
        alert.approvedUntil = new Date(Date.now() + APPROVE_MINUTES * 60_000).toISOString();
      }
      if (alert.accessStatus === 'approved' && alert.approvedUntil && Date.parse(alert.approvedUntil) <= Date.now()) {
        alert.accessStatus = 'expired';
      }
      return alert.accessStatus === 'approved'
        ? { accessStatus: 'approved', approvedUntil: alert.approvedUntil, emergencyInfo: hidden }
        : { accessStatus: alert.accessStatus };
    },

    async getAeds(position: LatLng, limit: number): Promise<Aed[]> {
      await delay(300);
      return DEMO_AEDS.map((aed) => ({ ...aed, distanceM: distanceMeters(position, aed) }))
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, limit);
    },
  };
}
