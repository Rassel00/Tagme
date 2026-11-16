import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyDecision,
  effectiveAccessStatus,
  isAlertOpen,
  planMergedAlert,
  toLockedValues,
  toPublicView,
  type MergeState,
  type ProfileRecord,
} from '../src/domain/rules.js';
import { formatPhone, renderGuardianSms } from '../src/domain/sms-template.js';

const T0 = new Date('2026-11-17T10:00:00+09:00');
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

const base: MergeState = {
  hasContacted: true,
  hasRequestedAccess: false,
  accessStatus: 'none',
  approvedUntil: null,
  lastNotifiedAt: T0,
};

describe('신고 병합 규칙 (7.1)', () => {
  it('연락 후 열람 요청: 문자 추가 없이 requested', () => {
    const plan = planMergedAlert(base, 'requestAccess', minutes(1));
    assert.equal(plan.shouldNotify, false);
    assert.equal(plan.hasRequestedAccess, true);
    assert.equal(plan.accessStatus, 'requested');
  });

  it('열람 요청 후 연락: 문자 추가 없음', () => {
    const state = { ...base, hasContacted: false, hasRequestedAccess: true, accessStatus: 'requested' as const };
    const plan = planMergedAlert(state, 'contact', minutes(1));
    assert.equal(plan.shouldNotify, false);
    assert.equal(plan.hasContacted, true);
    assert.equal(plan.accessStatus, 'requested');
  });

  it('같은 버튼을 5분 안에 다시 누르면 재알림 없음, 5분 지나면 재알림', () => {
    assert.equal(planMergedAlert(base, 'contact', minutes(4.9)).shouldNotify, false);
    assert.equal(planMergedAlert(base, 'contact', minutes(5)).shouldNotify, true);
  });

  it('다른 버튼은 5분이 지나도 재알림하지 않는다', () => {
    assert.equal(planMergedAlert(base, 'requestAccess', minutes(10)).shouldNotify, false);
  });

  it('이미 승인된 상태에서 열람 요청하면 승인 유지 (바로 공개)', () => {
    const state = { ...base, accessStatus: 'approved' as const, approvedUntil: minutes(30) };
    assert.equal(planMergedAlert(state, 'requestAccess', minutes(1)).accessStatus, 'approved');
  });

  it('공개 시간이 끝난 뒤 열람 요청하면 다시 requested', () => {
    const state = { ...base, accessStatus: 'approved' as const, approvedUntil: minutes(30) };
    assert.equal(planMergedAlert(state, 'requestAccess', minutes(31)).accessStatus, 'requested');
  });

  it('거절 상태는 다시 요청해도 거절 유지 (다른 보호자 승인 대기)', () => {
    const state = { ...base, accessStatus: 'denied' as const };
    assert.equal(planMergedAlert(state, 'requestAccess', minutes(1)).accessStatus, 'denied');
  });
});

describe('열람 상태 전이 (7.2)', () => {
  it('none·requested → approved, 공개 시간만큼 approvedUntil', () => {
    for (const status of ['none', 'requested', 'denied', 'expired'] as const) {
      const next = applyDecision(status, 'approve', 30, T0);
      assert.equal(next?.accessStatus, 'approved', status);
      assert.equal(next?.approvedUntil?.getTime(), minutes(30).getTime());
    }
  });

  it('requested → denied, 이미 승인된 공개는 거절로 되돌리지 않음', () => {
    assert.equal(applyDecision('requested', 'deny', 30, T0)?.accessStatus, 'denied');
    assert.equal(applyDecision('approved', 'deny', 30, T0), null);
    assert.equal(applyDecision('approved', 'approve', 30, T0), null);
  });

  it('approved 는 approvedUntil 이 지나면 expired', () => {
    assert.equal(effectiveAccessStatus('approved', minutes(30), minutes(29)), 'approved');
    assert.equal(effectiveAccessStatus('approved', minutes(30), minutes(30)), 'expired');
  });

  it('신고는 24시간 뒤 또는 closedAt 이 있으면 종료', () => {
    assert.equal(isAlertOpen({ createdAt: T0, closedAt: null }, minutes(24 * 60 - 1)), true);
    assert.equal(isAlertOpen({ createdAt: T0, closedAt: null }, minutes(24 * 60)), false);
    assert.equal(isAlertOpen({ createdAt: T0, closedAt: minutes(1) }, minutes(2)), false);
  });
});

describe('공개 범위 (BE-03)', () => {
  const profile: ProfileRecord = {
    name: '김지우',
    birthDate: '2003-05-14',
    bloodType: 'A형 (Rh+)',
    conditions: '천식',
    allergies: '페니실린',
    medications: '',
    notes: '흡입기 필요',
    publicFields: ['bloodType', 'allergies', 'medications'],
  };

  it('공개 항목은 값, 비공개는 항목명만, 빈 항목은 제외', () => {
    const view = toPublicView(profile);
    assert.deepEqual(view.publicInfo, { bloodType: 'A형 (Rh+)', allergies: '페니실린' });
    assert.deepEqual(view.lockedFields, ['name', 'birthDate', 'conditions', 'notes']);
    assert.ok(!JSON.stringify(view).includes('천식'));
  });

  it('승인 후 값은 비공개 항목만', () => {
    assert.deepEqual(toLockedValues(profile), {
      name: '김지우',
      birthDate: '2003-05-14',
      conditions: '천식',
      notes: '흡입기 필요',
    });
  });

  it('응급정보가 없으면 빈 화면', () => {
    assert.deepEqual(toPublicView(null), { publicInfo: {}, lockedFields: [] });
  });
});

describe('문자 템플릿 (7.3)', () => {
  const input = {
    userName: '김지우',
    message: '지우 응급 태그가 스캔됐어요',
    lat: 37.2939,
    lng: 126.9744,
    rescuerPhone: null,
    isRescuerVerified: false,
    hasRequestedAccess: false,
    approveUrl: 'https://example.com/a/TOKEN',
  };

  it('이름·메시지·위치·신고자·승인 링크를 담는다', () => {
    const body = renderGuardianSms(input);
    assert.equal(
      body,
      [
        '[응급안심] 김지우님 응급 태그가 스캔되었습니다.',
        '지우 응급 태그가 스캔됐어요',
        '위치: https://maps.google.com/?q=37.293900,126.974400',
        '신고자: 미입력',
        '상황 확인·응급정보 열람 승인:',
        'https://example.com/a/TOKEN',
      ].join('\n'),
    );
  });

  it('이름 없음·위치 없음·열람 요청·인증된 신고자', () => {
    const body = renderGuardianSms({
      ...input,
      userName: ' ',
      lat: null,
      lng: null,
      hasRequestedAccess: true,
      rescuerPhone: '01012345678',
      isRescuerVerified: true,
    });
    assert.match(body, /^\[응급안심\] 등록 사용자님/);
    assert.match(body, /신고자가 응급정보 열람을 요청했습니다\./);
    assert.match(body, /위치: 위치 정보 없음/);
    assert.match(body, /신고자: 010-1234-5678 \(인증됨\)/);
  });

  it('전화번호 표기', () => {
    assert.equal(formatPhone('01012345678'), '010-1234-5678');
    assert.equal(formatPhone('0101234567'), '010-123-4567');
  });
});
