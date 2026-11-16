/**
 * API 통합 테스트: 실제 PostgreSQL 의 임시 스키마에 마이그레이션을 적용하고
 * 시연 시나리오(9.1) 흐름을 HTTP 로 끝까지 확인한다. 끝나면 스키마를 지운다.
 * TEST_DATABASE_URL 이 없으면 건너뛴다. (Neon 은 pooler 가 아닌 direct 주소 사용)
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { CONSENT_VERSION, REQUIRED_CONSENT_TYPES } from '../src/domain/constants.js';
import { closePool, setPool } from '../src/db.js';
import type { VerifyIdToken } from '../src/lib/auth.js';

const DB_URL = process.env.TEST_DATABASE_URL;
const GATEWAY_KEY = 'test-gateway-key';
const PHONES = ['01011112222', '01033334444'];

/** 토큰 "uid:{uid}" 를 그 uid 로 인정하는 가짜 Firebase 검증기 */
const fakeVerifier: VerifyIdToken = async (token) => {
  if (!token.startsWith('uid:')) throw new Error('invalid token');
  return { uid: token.slice(4), provider: 'anonymous', email: null };
};

describe('API 통합 (DB)', { skip: DB_URL ? false : 'TEST_DATABASE_URL 미설정' }, () => {
  const schema = `test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let admin: pg.Pool;
  let pool: pg.Pool;
  let server: import('node:http').Server;
  let baseUrl = '';

  // 시나리오 진행 중 공유하는 값
  let tagId = '';
  let alertId = '';
  let sessionCookie = '';
  let jobIds: string[] = [];
  let approveTokens: string[] = [];

  interface CallOptions {
    token?: string;
    body?: unknown;
    cookie?: string;
    headers?: Record<string, string>;
  }

  async function call(method: string, url: string, options: CallOptions = {}) {
    const headers: Record<string, string> = { ...options.headers };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.cookie) headers.cookie = options.cookie;
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(baseUrl + url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    return {
      status: response.status,
      text,
      json: text ? (JSON.parse(text) as Record<string, any>) : {},
      setCookie: response.headers.get('set-cookie') ?? '',
    };
  }

  const owner = 'uid:owner-1';
  const stranger = 'uid:stranger-1';
  const gw = { headers: { 'x-gateway-key': GATEWAY_KEY } };

  before(async () => {
    admin = new pg.Pool({ connectionString: DB_URL, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: DB_URL, max: 3, options: `-c search_path=${schema}` });
    const dir = path.resolve(process.cwd(), 'migrations');
    for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
      await pool.query(await readFile(path.join(dir, file), 'utf8'));
    }
    setPool(pool);
    server = createApp({ verifyIdToken: fakeVerifier, gatewayKey: GATEWAY_KEY }).listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise((resolve) => server?.close(resolve));
    await closePool();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it('인증: 토큰 없으면 401, 로그인하면 사용자 생성', async () => {
    assert.equal((await call('POST', '/api/users/me')).status, 401);
    assert.equal((await call('POST', '/api/users/me', { token: 'bad' })).status, 401);
    const me = await call('POST', '/api/users/me', { token: owner });
    assert.equal(me.status, 200);
    assert.equal(me.json.id, 'owner-1');
    assert.equal(me.json.isConsentRequired, true);
  });

  it('동의: 필수 동의 전에는 403 consent_required, 동의 후 통과', async () => {
    const blocked = await call('GET', '/api/profile', { token: owner });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.json.error.code, 'consent_required');

    const old = await call('POST', '/api/consents', {
      token: owner,
      body: { items: [{ type: 'terms', version: '2000-01-01' }] },
    });
    assert.equal(old.status, 400);

    const partial = await call('POST', '/api/consents', {
      token: owner,
      body: { items: [{ type: 'terms', version: CONSENT_VERSION }] },
    });
    assert.equal(partial.json.isComplete, false);

    const items = REQUIRED_CONSENT_TYPES.map((type) => ({ type, version: CONSENT_VERSION }));
    const done = await call('POST', '/api/consents', { token: owner, body: { items } });
    assert.equal(done.status, 200);
    assert.equal(done.json.isComplete, true);
    // 같은 동의를 다시 보내도 중복 저장하지 않음
    const again = await call('POST', '/api/consents', { token: owner, body: { items } });
    assert.equal(again.json.agreed.length, REQUIRED_CONSENT_TYPES.length);
  });

  it('응급정보 저장 (혈액형·알레르기만 공개)', async () => {
    const saved = await call('PUT', '/api/profile', {
      token: owner,
      body: {
        name: '김지우',
        birthDate: '2003-05-14',
        bloodType: 'A형 (Rh+)',
        conditions: '천식',
        allergies: '페니실린',
        medications: '천식 흡입기 (살부타몰)',
        notes: '응급 시 천식 흡입기 사용이 필요합니다.',
        publicFields: ['bloodType', 'allergies'],
      },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.birthDate, '2003-05-14');
    assert.equal((await call('PUT', '/api/profile', { token: owner, body: { publicFields: ['phone'] } })).status, 400);
  });

  it('태그 생성·연락처 설정 (최대 3명, 소유자만)', async () => {
    const created = await call('POST', '/api/tags', { token: owner, body: { label: '키링' } });
    assert.equal(created.status, 201);
    tagId = created.json.tagId;
    assert.match(tagId, /^[0-9A-Za-z]{24}$/);
    assert.ok(created.json.url.endsWith(`/t/${tagId}`));

    const contact = (i: number) => ({ name: `보호자${i}`, relation: '가족', phone: '010-1111-2222' });
    const tooMany = await call('PUT', `/api/tags/${tagId}`, {
      token: owner,
      body: { contacts: [contact(1), contact(2), contact(3), contact(4)] },
    });
    assert.equal(tooMany.status, 400);

    const updated = await call('PUT', `/api/tags/${tagId}`, {
      token: owner,
      body: {
        defaultMessage: '긴급상황입니다. 위치 확인 부탁드립니다',
        contacts: [
          { name: '엄마', relation: '가족', phone: '010-1111-2222', message: '지우 응급 태그가 스캔됐어요' },
          { name: '민수', relation: '친구', phone: PHONES[1] },
        ],
      },
    });
    assert.equal(updated.status, 200);
    assert.deepEqual(
      updated.json.contacts.map((c: { phone: string }) => c.phone),
      PHONES,
    );

    // 다른 사용자는 존재 여부도 알 수 없게 404
    await call('POST', '/api/consents', {
      token: stranger,
      body: { items: REQUIRED_CONSENT_TYPES.map((type) => ({ type, version: CONSENT_VERSION })) },
    });
    assert.equal((await call('GET', `/api/tags/${tagId}`, { token: stranger })).status, 404);
    assert.equal((await call('PUT', `/api/tags/${tagId}`, { token: stranger, body: { label: 'x' } })).status, 404);

    const list = await call('GET', '/api/tags', { token: owner });
    assert.equal(list.json[0].contactCount, 2);
  });

  it('공개 조회: 공개 항목만 값, 보호자 번호 비노출, 없는 태그 404', async () => {
    const pub = await call('GET', `/api/public/tags/${tagId}`);
    assert.equal(pub.status, 200);
    assert.deepEqual(pub.json.publicInfo, { bloodType: 'A형 (Rh+)', allergies: '페니실린' });
    assert.deepEqual(pub.json.lockedFields, ['name', 'birthDate', 'conditions', 'medications', 'notes']);
    assert.equal(pub.json.contactCount, 2);
    for (const phone of PHONES) assert.ok(!pub.text.includes(phone.slice(3)), '보호자 번호 노출');
    assert.ok(!pub.text.includes('김지우'));

    assert.equal((await call('GET', '/api/public/tags/NoSuchTag000000000000000')).status, 404);
  });

  it('비상연락망 연락: 신고 생성, 보호자 2명 문자 대기, HttpOnly 세션 쿠키', async () => {
    const res = await call('POST', `/api/public/tags/${tagId}/alerts`, {
      body: { action: 'contact', lat: 37.2939, lng: 126.9744 },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.notifiedCount, 2);
    assert.equal(res.json.isMerged, false);
    assert.match(res.json.code, /^[A-Z2-9]{6}$/);
    alertId = res.json.alertId;
    assert.match(res.setCookie, /alertSession=[^;]+;/);
    assert.match(res.setCookie, /HttpOnly/);
    assert.match(res.setCookie, /SameSite=Strict/);
    assert.match(res.setCookie, /Path=\/api\/public/);
    sessionCookie = res.setCookie.split(';')[0]!;
    for (const phone of PHONES) assert.ok(!res.text.includes(phone));
  });

  it('게이트웨이: 키 없으면 401, 대기 문자를 sending 으로 꺼냄', async () => {
    assert.equal((await call('GET', '/api/gateway/sms-jobs')).status, 401);
    assert.equal((await call('GET', '/api/gateway/sms-jobs', { headers: { 'x-gateway-key': 'wrong' } })).status, 401);
    assert.equal((await call('GET', '/api/gateway/ping', { headers: { 'x-gateway-key': 'wrong' } })).status, 401);
    assert.deepEqual((await call('GET', '/api/gateway/ping', gw)).json, { ok: true });

    const jobs = await call('GET', '/api/gateway/sms-jobs', gw);
    assert.equal(jobs.status, 200);
    assert.equal(jobs.json.length, 2);
    const list = jobs.json as unknown as { jobId: string; phone: string; body: string }[];
    assert.deepEqual(list.map((j) => j.phone).sort(), [...PHONES].sort());
    const mom = list.find((j) => j.phone === PHONES[0])!;
    assert.match(mom.body, /^\[응급안심\] 김지우님 응급 태그가 스캔되었습니다\.\n지우 응급 태그가 스캔됐어요\n/);
    assert.match(mom.body, /위치: https:\/\/maps\.google\.com\/\?q=37\.293900,126\.974400/);
    const other = list.find((j) => j.phone === PHONES[1])!;
    assert.match(other.body, /긴급상황입니다\. 위치 확인 부탁드립니다/);

    jobIds = list.map((j) => j.jobId);
    approveTokens = [mom, other].map((j) => /\/a\/([A-Za-z0-9_-]{43})$/.exec(j.body)![1]!);
    assert.equal(new Set(approveTokens).size, 2, '보호자별 승인 링크');

    assert.equal((await call('GET', '/api/gateway/sms-jobs', gw)).json.length, 0, '같은 건을 두 번 주지 않음');
  });

  it('병합: 같은 세션에서 다시 연락·열람 요청해도 문자 추가 없음', async () => {
    const again = await call('POST', `/api/public/tags/${tagId}/alerts`, {
      cookie: sessionCookie,
      body: { action: 'contact' },
    });
    assert.equal(again.status, 200);
    assert.deepEqual(again.json, { alertId, code: again.json.code, notifiedCount: 0, isMerged: true });

    const access = await call('POST', `/api/public/tags/${tagId}/alerts`, {
      cookie: sessionCookie,
      body: { action: 'requestAccess' },
    });
    assert.equal(access.json.isMerged, true);
    assert.equal(access.json.notifiedCount, 0);
    assert.equal((await call('GET', '/api/gateway/sms-jobs', gw)).json.length, 0);

    const status = await call('GET', `/api/public/alerts/${alertId}`, { cookie: sessionCookie });
    assert.equal(status.json.accessStatus, 'requested');
    assert.equal(status.json.emergencyInfo, undefined);
  });

  it('쿠키 없이 같은 태그로 새 신고는 1분 쿨다운에 걸림', async () => {
    const res = await call('POST', `/api/public/tags/${tagId}/alerts`, { body: { action: 'contact' } });
    assert.equal(res.status, 429);
  });

  it('세션 쿠키가 없으면 신고 상태·응급정보를 볼 수 없음 (URL 공유 방지)', async () => {
    assert.equal((await call('GET', `/api/public/alerts/${alertId}`)).status, 403);
    assert.equal((await call('GET', `/api/public/alerts/${alertId}`, { cookie: 'alertSession=forged' })).status, 403);
  });

  it('보호자 승인 페이지: 신고 정보, 거절 후 다른 보호자가 승인', async () => {
    const view = await call('GET', `/api/approvals/${approveTokens[0]}`);
    assert.equal(view.status, 200);
    assert.equal(view.json.userName, '김지우');
    assert.equal(view.json.alert.hasRequestedAccess, true);
    assert.equal(view.json.alert.accessStatus, 'requested');
    assert.deepEqual(view.json.alert.location, {
      lat: 37.2939,
      lng: 126.9744,
      mapUrl: 'https://maps.google.com/?q=37.293900,126.974400',
    });
    assert.ok(!view.text.includes(PHONES[1]!), '다른 보호자 번호 비노출');

    const denied = await call('POST', `/api/approvals/${approveTokens[1]}`, { body: { decision: 'deny' } });
    assert.equal(denied.json.alert.accessStatus, 'denied');
    assert.equal(denied.json.isApplied, true);

    const approved = await call('POST', `/api/approvals/${approveTokens[0]}`, {
      body: { decision: 'approve', durationMinutes: 30 },
    });
    assert.equal(approved.json.alert.accessStatus, 'approved');
    assert.equal(approved.json.alert.decidedBy, 'me');
    const until = Date.parse(approved.json.alert.approvedUntil);
    assert.ok(Math.abs(until - Date.now() - 30 * 60_000) < 10_000);

    const otherView = await call('GET', `/api/approvals/${approveTokens[1]}`);
    assert.equal(otherView.json.alert.decidedBy, 'other');
    const late = await call('POST', `/api/approvals/${approveTokens[1]}`, { body: { decision: 'deny' } });
    assert.equal(late.json.isApplied, false);
    assert.equal(late.json.alert.accessStatus, 'approved');

    assert.equal((await call('GET', '/api/approvals/' + 'x'.repeat(43))).status, 404);
  });

  it('승인되면 신고자에게 비공개 항목 공개, 공개 시간이 지나면 다시 잠김', async () => {
    const open = await call('GET', `/api/public/alerts/${alertId}`, { cookie: sessionCookie });
    assert.equal(open.json.accessStatus, 'approved');
    assert.deepEqual(open.json.emergencyInfo, {
      name: '김지우',
      birthDate: '2003-05-14',
      conditions: '천식',
      medications: '천식 흡입기 (살부타몰)',
      notes: '응급 시 천식 흡입기 사용이 필요합니다.',
    });

    await pool.query(`UPDATE alerts SET approved_until = now() - interval '1 second' WHERE id = $1`, [alertId]);
    const closed = await call('GET', `/api/public/alerts/${alertId}`, { cookie: sessionCookie });
    assert.equal(closed.json.accessStatus, 'expired');
    assert.equal(closed.json.emergencyInfo, undefined);
  });

  it('5분이 지나 다시 연락하면 재알림 (새 승인 링크 포함)', async () => {
    await pool.query(`UPDATE alerts SET last_notified_at = now() - interval '6 minutes' WHERE id = $1`, [alertId]);
    const res = await call('POST', `/api/public/tags/${tagId}/alerts`, { cookie: sessionCookie, body: { action: 'contact' } });
    assert.equal(res.json.notifiedCount, 2);
    const jobs = await call('GET', '/api/gateway/sms-jobs', gw);
    assert.equal(jobs.json.length, 2);
    // 이전 문자 속 링크도 그대로 유효
    assert.equal((await call('GET', `/api/approvals/${approveTokens[0]}`)).status, 200);
  });

  it('게이트웨이 결과 보고', async () => {
    const ok = await call('POST', `/api/gateway/sms-jobs/${jobIds[0]}/result`, { ...gw, body: { status: 'sent' } });
    assert.equal(ok.status, 200);
    const failed = await call('POST', `/api/gateway/sms-jobs/${jobIds[1]}/result`, {
      ...gw,
      body: { status: 'failed', error: 'RESULT_ERROR_NO_SERVICE' },
    });
    assert.equal(failed.status, 200);
    assert.equal((await call('POST', `/api/gateway/sms-jobs/${jobIds[0]}/result`, { ...gw, body: { status: 'sent' } })).status, 404);
    const { rows } = await pool.query('SELECT status, error FROM sms_jobs WHERE id = ANY($1) ORDER BY status', [jobIds]);
    assert.deepEqual(rows, [
      { status: 'failed', error: 'RESULT_ERROR_NO_SERVICE' },
      { status: 'sent', error: null },
    ]);
  });

  it('신고자 번호: 직접 입력은 미인증, 문자 본인 확인으로 인증된 번호가 덮어씀', async () => {
    assert.equal((await call('PATCH', `/api/public/alerts/${alertId}`, { body: { rescuerPhone: '01055556666' } })).status, 403);
    const typed = await call('PATCH', `/api/public/alerts/${alertId}`, {
      cookie: sessionCookie,
      body: { rescuerPhone: '010-5555-6666' },
    });
    assert.equal(typed.status, 200);
    let view = await call('GET', `/api/approvals/${approveTokens[0]}`);
    assert.equal(view.json.alert.rescuerPhone, '01055556666');
    assert.equal(view.json.alert.isRescuerVerified, false);

    const { code } = (await call('GET', `/api/public/alerts/${alertId}`, { cookie: sessionCookie })).json;
    const wrong = await call('POST', '/api/gateway/inbound-sms', { ...gw, body: { from: '+821077778888', body: 'SOS-ZZZZZZ' } });
    assert.deepEqual(wrong.json, { matched: false });
    const sms = await call('POST', '/api/gateway/inbound-sms', {
      ...gw,
      body: { from: '+82 10-7777-8888', body: `SOS-${code}`, receivedAt: new Date().toISOString() },
    });
    assert.deepEqual(sms.json, { matched: true });

    view = await call('GET', `/api/approvals/${approveTokens[0]}`);
    assert.equal(view.json.alert.rescuerPhone, '01077778888');
    assert.equal(view.json.alert.isRescuerVerified, true);
    const overwrite = await call('PATCH', `/api/public/alerts/${alertId}`, {
      cookie: sessionCookie,
      body: { rescuerPhone: '01055556666' },
    });
    assert.equal(overwrite.status, 409);
  });

  it('게이트웨이가 결과 보고 없이 멈춘 건은 다시 대기, 3번 시도 후 실패', async () => {
    // 재알림 테스트에서 가져간 뒤 결과를 보고하지 않은 2건 (attempts = 1)
    const stall = () =>
      pool.query(`UPDATE sms_jobs SET sending_at = now() - interval '3 minutes' WHERE status = 'sending'`);
    await stall();
    assert.equal((await call('GET', '/api/gateway/sms-jobs', gw)).json.length, 2);
    await stall();
    assert.equal((await call('GET', '/api/gateway/sms-jobs', gw)).json.length, 2);
    await stall();
    assert.equal((await call('GET', '/api/gateway/sms-jobs', gw)).json.length, 0);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM sms_jobs WHERE status = 'failed' AND error = 'gateway_timeout'`,
    );
    assert.equal(rows[0].n, 2);
  });

  it('비활성 태그는 410, 신고도 불가', async () => {
    const off = await call('PATCH', `/api/tags/${tagId}/active`, { token: owner, body: { isActive: false } });
    assert.equal(off.json.isActive, false);
    const pub = await call('GET', `/api/public/tags/${tagId}`);
    assert.equal(pub.status, 410);
    assert.equal(pub.json.error.code, 'tag_inactive');
    assert.equal((await call('POST', `/api/public/tags/${tagId}/alerts`, { body: { action: 'contact' } })).status, 410);
  });

  it('승인 링크는 24시간 뒤 만료', async () => {
    await pool.query(`UPDATE alerts SET created_at = now() - interval '25 hours' WHERE id = $1`, [alertId]);
    assert.equal((await call('GET', `/api/approvals/${approveTokens[0]}`)).status, 410);
    assert.equal((await call('GET', `/api/public/alerts/${alertId}`, { cookie: sessionCookie })).status, 410);
  });
});
