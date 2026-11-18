/**
 * /t/demo 전용 가짜 API. 서버·DB 없이 시안 화면과 흐름(신고 → 승인 대기 → 승인 → 만료)을 확인한다.
 * ?state=notfound | inactive | nocontact 로 예외 화면도 볼 수 있다.
 */
import { distanceMeters } from './geo';
import type { Aed, AlertAction, AlertStatus, CreateAlertResult, Insurance, LatLng, PersonType, ProfileField, ProfileValues, PublicApi, PublicTag } from './types';
import { ApiRequestError } from './types';

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
/** 데모: 신고 뒤 이만큼 지나면 보호자가 대응 중인 것으로 */
const AUTO_RESPOND_MS = 7000;
const APPROVE_MINUTES = 30;

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 데모 유형별 정보 (?type=disabled|elderly|child, 없으면 범용). 공개 값과 승인 후 공개되는 값 */
const DEMO_INSURANCES: Insurance[] = [
  { company: '응급손해보험 (자동차)', phone: '1588-0000', note: '증권번호 2026-123456' },
  { company: '든든실손보험', phone: '1544-0000', note: '' },
];

const DEMO_PROFILES: Record<
  PersonType,
  { publicInfo: ProfileValues; hidden: ProfileValues; insurances?: Insurance[]; isInsurancePublic?: boolean }
> = {
  general: {
    publicInfo: { bloodType: 'A형 (Rh+)', allergies: '페니실린' },
    hidden: { name: '김지우', birthDate: '2003-05-14', conditions: '천식', medications: '천식 흡입기 (살부타몰)', notes: '응급 시 천식 흡입기 사용이 필요합니다.' },
  },
  disabled: {
    publicInfo: {
      name: '이민호',
      disabilityType: '청각장애',
      communication: '필담·수어',
      careTips: '천천히 짧게 말해 주세요 · 글로 써서 보여 주세요',
    },
    hidden: { conditions: '뇌전증', medications: '항경련제' },
    // 보험은 비공개
    insurances: DEMO_INSURANCES,
  },
  elderly: {
    publicInfo: { name: '박순자', bloodType: 'O형 (Rh+)', conditions: '고혈압', medications: '혈압약 (아침 1회)' },
    hidden: { birthDate: '1948-03-02', notes: '보청기를 사용합니다.' },
    insurances: DEMO_INSURANCES,
    isInsurancePublic: true,
  },
  child: {
    publicInfo: { name: '김하늘', allergies: '땅콩' },
    hidden: { birthDate: '2019-07-21', medications: '알레르기 비상약(에피펜)', notes: '보호자: 엄마 (어린이집 하원 시간 16시)' },
  },
};

export function createMockApi(state: string | null, typeParam: string | null = null): PublicApi {
  const personType: PersonType =
    typeParam === 'disabled' || typeParam === 'elderly' || typeParam === 'child' ? typeParam : 'general';
  const profile = DEMO_PROFILES[personType];
  const hidden = profile.hidden;
  const insurances = profile.insurances ?? [];
  const isInsuranceLocked = insurances.length > 0 && !profile.isInsurancePublic;
  const tag: PublicTag = {
    personType,
    publicInfo: profile.publicInfo,
    lockedFields: [...(Object.keys(hidden) as ProfileField[]), ...(isInsuranceLocked ? (['insurances'] as const) : [])],
    insurances: isInsuranceLocked ? [] : insurances,
    insuranceCount: insurances.length,
    contactCount: state === 'nocontact' ? 0 : 2,
    guardianCount: state === 'nocontact' || state === 'noguardian' ? 0 : 1,
  };

  let alert: (AlertStatus & { id: string }) | undefined;
  let requestedAt = 0;
  let alertCreatedAt = 0;

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
      if (!alert) alertCreatedAt = Date.now();
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
      const guardianRespondingAt =
        Date.now() - alertCreatedAt > AUTO_RESPOND_MS ? new Date(alertCreatedAt + AUTO_RESPOND_MS).toISOString() : null;
      return alert.accessStatus === 'approved'
        ? {
            accessStatus: 'approved',
            approvedUntil: alert.approvedUntil,
            emergencyInfo: hidden,
            ...(isInsuranceLocked ? { insurances } : {}),
            guardianRespondingAt,
          }
        : { accessStatus: alert.accessStatus, guardianRespondingAt };
    },

    async getAeds(position: LatLng, limit: number): Promise<Aed[]> {
      await delay(300);
      return DEMO_AEDS.map((aed) => ({ ...aed, distanceM: distanceMeters(position, aed) }))
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, limit);
    },
  };
}
