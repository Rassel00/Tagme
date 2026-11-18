/**
 * API 통합 테스트: 실제 PostgreSQL 의 임시 스키마에 마이그레이션을 적용하고
 * 시연 시나리오(9.1) 흐름을 HTTP 로 끝까지 확인한다. 끝나면 스키마를 지운다.
 * TEST_DATABASE_URL 이 없으면 건너뛴다. (Neon 은 pooler 가 아닌 direct 주소 사용)
 */
import '@dotenvx/dotenvx/config';
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

/** 토큰 "uid:{uid}"(게스트)·"google:{uid}"(구글) 를 그 uid 로 인정하는 가짜 Firebase 검증기 */
const fakeVerifier: VerifyIdToken = async (token) => {
  if (token.startsWith('uid:')) return { uid: token.slice(4), provider: 'anonymous', email: null };
  if (token.startsWith('google:')) return { uid: token.slice(7), provider: 'google', email: 'test@example.com' };
  throw new Error('invalid token');
};

/** 게스트 계정 삭제 때 Firebase 대신 기록만 */
const deletedAuthUsers: string[] = [];
const fakeDeleteAuthUser = async (uid: string) => {
  deletedAuthUsers.push(uid);
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
    server = createApp({ verifyIdToken: fakeVerifier, deleteAuthUser: fakeDeleteAuthUser, gatewayKey: GATEWAY_KEY }).listen(0);
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

  let personId = '';
  let contactIds: string[] = [];

  it('대상자 등록 (혈액형·알레르기만 공개), 이름 필수·잘못된 공개 항목 400', async () => {
    const saved = await call('POST', '/api/persons', {
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
    assert.equal(saved.status, 201);
    assert.equal(saved.json.birthDate, '2003-05-14');
    personId = saved.json.personId;
    assert.equal((await call('POST', '/api/persons', { token: owner, body: { name: '' } })).status, 400);
    assert.equal(
      (await call('POST', '/api/persons', { token: owner, body: { name: 'x', publicFields: ['phone'] } })).status,
      400,
    );
    const list = await call('GET', '/api/persons', { token: owner });
    assert.equal(list.json.length, 1);
    assert.equal(list.json[0].tagCount, 0);
  });

  it('주소록 연락처 등록', async () => {
    for (const [name, phone] of [['엄마', '010-1111-2222'], ['민수', PHONES[1]!], ['이모', '01055556666']]) {
      const res = await call('POST', '/api/contacts', { token: owner, body: { name, relation: '가족', phone } });
      assert.equal(res.status, 201);
      contactIds.push(res.json.contactId);
    }
    assert.equal((await call('POST', '/api/contacts', { token: owner, body: { name: 'x', phone: '02-123' } })).status, 400);
  });

  it('태그 추가: 대상자·연락처(최대 3명)를 함께 저장, 소유자만', async () => {
    const tooMany = await call('POST', '/api/tags', {
      token: owner,
      body: { label: '키링', personId, contactIds: [...contactIds, contactIds[0]] },
    });
    assert.equal(tooMany.status, 400);

    const created = await call('POST', '/api/tags', {
      token: owner,
      body: {
        label: '키링',
        personId,
        defaultMessage: '긴급상황입니다. 위치 확인 부탁드립니다',
        contactIds: contactIds.slice(0, 2),
      },
    });
    assert.equal(created.status, 201);
    tagId = created.json.tagId;
    assert.match(tagId, /^[0-9A-Za-z]{24}$/);
    assert.ok(created.json.url.endsWith(`/t/${tagId}`));
    assert.equal(created.json.personName, '김지우');
    assert.deepEqual(
      created.json.contacts.map((c: { phone: string }) => c.phone),
      PHONES,
    );

    // 다른 사용자: 남의 태그 404, 남의 대상자·연락처로 태그를 만들 수 없음
    await call('POST', '/api/consents', {
      token: stranger,
      body: { items: REQUIRED_CONSENT_TYPES.map((type) => ({ type, version: CONSENT_VERSION })) },
    });
    assert.equal((await call('GET', `/api/tags/${tagId}`, { token: stranger })).status, 404);
    assert.equal((await call('PUT', `/api/tags/${tagId}`, { token: stranger, body: { label: 'x' } })).status, 404);
    assert.equal((await call('POST', '/api/tags', { token: stranger, body: { personId } })).status, 404);
    assert.equal((await call('POST', '/api/tags', { token: stranger, body: { contactIds } })).status, 400);
    assert.equal((await call('GET', '/api/tags', { token: stranger })).json.length, 0, '실패한 태그를 남기지 않음');

    const list = await call('GET', '/api/tags', { token: owner });
    assert.equal(list.json[0].contactCount, 2);
    assert.equal(list.json[0].acceptedContactCount, 0, '새 연락처는 수락 대기');
    assert.equal((await call('GET', '/api/persons', { token: owner })).json[0].tagCount, 1);
  });

  it('비상연락처 수락: 안내 문자 → 수락한 연락처만 알림 대상, 다시 보내기 규칙', async () => {
    const tag = await call('GET', `/api/tags/${tagId}`, { token: owner });
    assert.deepEqual(
      tag.json.contacts.map((c: { inviteStatus: string }) => c.inviteStatus),
      ['pending', 'pending'],
    );
    // 공개 화면은 수락한 연락처만 센다
    assert.equal((await call('GET', `/api/public/tags/${tagId}`)).json.contactCount, 0);

    const inviteToken = async (phone: string) => {
      const { rows } = await pool.query<{ body: string }>(
        `SELECT body FROM sms_jobs WHERE phone = $1 AND tag_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
        [phone],
      );
      assert.match(rows[0]!.body, /^\[응급안심\] 김지우님의 응급 태그 보호자로 회원님 번호가 등록되었습니다\./);
      return /\/c\/([A-Za-z0-9_-]{43})$/.exec(rows[0]!.body)![1]!;
    };
    const momToken = await inviteToken(PHONES[0]!);
    const view = await call('GET', `/api/invites/${momToken}`);
    assert.deepEqual(view.json, { userName: '김지우', tagLabel: '키링', status: 'pending' });
    assert.ok(!view.text.includes(PHONES[1]!), '다른 연락처 번호 비노출');
    assert.equal((await call('GET', '/api/invites/wrong-token')).status, 404);

    // 거절했다가 같은 링크로 수락할 수 있다
    assert.equal((await call('POST', `/api/invites/${momToken}`, { body: { decision: 'decline' } })).json.status, 'declined');
    assert.equal((await call('POST', `/api/invites/${momToken}`, { body: { decision: 'accept' } })).json.status, 'accepted');

    // 다시 보내기: 수락한 연락처는 409, 수락 대기는 10분 뒤에만, 새 링크를 보내면 이전 링크는 무효
    const resend = (contactId: string) => call('POST', `/api/tags/${tagId}/contacts/${contactId}/invite`, { token: owner });
    assert.equal((await resend(contactIds[0]!)).status, 409);
    assert.equal((await resend(contactIds[1]!)).status, 429);
    const oldToken = await inviteToken(PHONES[1]!);
    await pool.query(`UPDATE tag_contacts SET invited_at = now() - interval '11 minutes' WHERE contact_id = $1`, [contactIds[1]]);
    assert.equal((await resend(contactIds[1]!)).status, 200);
    const newToken = await inviteToken(PHONES[1]!);
    assert.notEqual(newToken, oldToken);
    assert.equal((await call('GET', `/api/invites/${oldToken}`)).status, 404);
    await call('POST', `/api/invites/${newToken}`, { body: { decision: 'accept' } });

    // 태그를 고쳐도(같은 연락처) 수락 상태는 유지되고 안내 문자를 다시 보내지 않는다
    const before = (await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM sms_jobs WHERE tag_id IS NOT NULL')).rows[0]!.n;
    const edited = await call('PUT', `/api/tags/${tagId}`, {
      token: owner,
      body: { label: '키링', personId, defaultMessage: '긴급상황입니다. 위치 확인 부탁드립니다', contactIds: contactIds.slice(0, 2) },
    });
    assert.equal(edited.json.acceptedContactCount, 2);
    assert.equal((await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM sms_jobs WHERE tag_id IS NOT NULL')).rows[0]!.n, before);

    // 이후 게이트웨이 테스트가 신고 문자만 보도록 안내 문자는 보낸 것으로 처리
    await pool.query(`UPDATE sms_jobs SET status = 'sent' WHERE tag_id IS NOT NULL`);
  });

  it('주소록에서 번호를 고치면 태그에 바로 반영', async () => {
    const res = await call('PUT', `/api/contacts/${contactIds[0]}`, {
      token: owner,
      body: { name: '엄마', relation: '가족', phone: PHONES[0] },
    });
    assert.equal(res.json.tagCount, 1);
    const tag = await call('GET', `/api/tags/${tagId}`, { token: owner });
    assert.equal(tag.json.contacts[0].phone, PHONES[0]);
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

  it('대상자 유형·유형별 항목·보험 정보: 공개한 것만 공개 화면에', async () => {
    const base = {
      name: '김지우',
      birthDate: '2003-05-14',
      bloodType: 'A형 (Rh+)',
      conditions: '천식',
      allergies: '페니실린',
      medications: '천식 흡입기 (살부타몰)',
      notes: '응급 시 천식 흡입기 사용이 필요합니다.',
    };
    assert.equal(
      (await call('PUT', `/api/persons/${personId}`, { token: owner, body: { ...base, personType: 'robot' } })).status,
      400,
    );
    assert.equal(
      (
        await call('PUT', `/api/persons/${personId}`, {
          token: owner,
          body: { ...base, insurances: [{ company: 'A', phone: '1588-가나' }] },
        })
      ).status,
      400,
    );
    const four = Array.from({ length: 4 }, () => ({ company: 'A' }));
    assert.equal((await call('PUT', `/api/persons/${personId}`, { token: owner, body: { ...base, insurances: four } })).status, 400);
    const saved = await call('PUT', `/api/persons/${personId}`, {
      token: owner,
      body: {
        ...base,
        personType: 'disabled',
        disabilityType: '청각장애',
        communication: '필담',
        careTips: '글로 써서 보여 주세요',
        insurances: [
          { company: '응급손해보험', phone: '1588-0000', note: '증권번호 123' },
          { company: '실손생명' },
        ],
        // 보험은 공개하지 않음 (승인 후 보기)
        publicFields: ['bloodType', 'allergies', 'disabilityType', 'communication', 'careTips'],
      },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.personType, 'disabled');
    assert.deepEqual(
      saved.json.insurances.map((i: { company: string }) => i.company),
      ['응급손해보험', '실손생명'],
    );
    const pub = await call('GET', `/api/public/tags/${tagId}`);
    assert.equal(pub.json.personType, 'disabled');
    assert.deepEqual(pub.json.publicInfo, {
      bloodType: 'A형 (Rh+)',
      allergies: '페니실린',
      disabilityType: '청각장애',
      communication: '필담',
      careTips: '글로 써서 보여 주세요',
    });
    assert.ok(pub.json.lockedFields.includes('insurances'));
    assert.deepEqual(pub.json.insurances, []);
    assert.equal(pub.json.insuranceCount, 2);
    assert.ok(!pub.text.includes('응급손해보험'));
  });

  it('비상연락망 연락: 신고 생성, 보호자 2명 문자 대기, HttpOnly 세션 쿠키', async () => {
    const res = await call('POST', `/api/public/tags/${tagId}/alerts`, {
      body: { action: 'contact', lat: 37.2939, lng: 126.9744, memo: '010-9999-0000\n  역 출구에서 쓰러짐' },
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

    // 메모는 줄바꿈·공백을 정리해 보호자 문자에 들어간다
    const { rows } = await pool.query<{ body: string }>('SELECT body FROM sms_jobs WHERE alert_id = $1', [alertId]);
    assert.equal(rows.length, 2);
    for (const row of rows) assert.match(row.body, /신고자 메모: 010-9999-0000 역 출구에서 쓰러짐/);
  });

  it('신고자 메모는 100자까지', async () => {
    const res = await call('POST', `/api/public/tags/${tagId}/alerts`, { body: { action: 'contact', memo: 'a'.repeat(101) } });
    assert.equal(res.status, 400);
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
    assert.match(mom.body, /^\[응급안심\] 김지우님 응급 태그가 스캔되었습니다\.\n긴급상황입니다\. 위치 확인 부탁드립니다\n/);
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

  it('같은 IP 의 신규 신고 제한: 새 신고만 막고, 진행 중인 신고에 다시 누르는 것(병합)은 허용', async () => {
    // IP 당 1건으로 줄인 서버
    const limited = createApp({
      verifyIdToken: fakeVerifier,
      deleteAuthUser: fakeDeleteAuthUser,
      gatewayKey: GATEWAY_KEY,
      publicApi: { newAlertIpLimits: [{ windowMs: 60_000, max: 1 }] },
    }).listen(0);
    await new Promise<void>((resolve) => limited.once('listening', resolve));
    const url = `http://127.0.0.1:${(limited.address() as AddressInfo).port}/api/public/tags/${tagId}/alerts`;
    const post = (cookie?: string) =>
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ action: 'contact' }),
      });
    try {
      // 첫 시도는 IP 제한을 통과하고 (같은 태그라) 1분 쿨다운에 걸린다. 두 번째는 IP 제한에 걸린다
      const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
      const first = await post();
      assert.equal(first.status, 429);
      assert.equal(await errorCode(first), 'too_many_requests');
      const second = await post();
      assert.equal(second.status, 429);
      assert.equal(await errorCode(second), 'too_many_alerts');

      const merged = await post(sessionCookie);
      assert.equal(merged.status, 200);
      assert.equal(((await merged.json()) as { isMerged: boolean }).isMerged, true);
    } finally {
      await new Promise((resolve) => limited.close(resolve));
    }
  });

  it('세션 쿠키가 없으면 신고 상태·응급정보를 볼 수 없음 (URL 공유 방지)', async () => {
    assert.equal((await call('GET', `/api/public/alerts/${alertId}`)).status, 403);
    assert.equal((await call('GET', `/api/public/alerts/${alertId}`, { cookie: 'alertSession=forged' })).status, 403);
  });

  it('보호자 승인 페이지: 신고 정보, 거절 후 다른 보호자가 승인', async () => {
    const view = await call('GET', `/api/approvals/${approveTokens[0]}`);
    assert.equal(view.status, 200);
    assert.equal(view.json.userName, '김지우');
    assert.equal(view.json.alert.rescuerMemo, '010-9999-0000 역 출구에서 쓰러짐');
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

  it('대응 중 표시: 다른 보호자에게는 이름으로, 신고자에게는 대응 중 여부만', async () => {
    const before = await call('GET', `/api/approvals/${approveTokens[0]}`);
    assert.equal(before.json.alert.responding, null);
    assert.equal((await call('GET', `/api/public/alerts/${alertId}`, { cookie: sessionCookie })).json.guardianRespondingAt, null);

    const mine = await call('POST', `/api/approvals/${approveTokens[0]}/respond`);
    assert.equal(mine.status, 200);
    assert.equal(mine.json.alert.responding.by, 'me');
    const other = await call('GET', `/api/approvals/${approveTokens[1]}`);
    assert.equal(other.json.alert.responding.by, 'other');
    assert.equal(other.json.alert.responding.name, '엄마');
    const rescuer = await call('GET', `/api/public/alerts/${alertId}`, { cookie: sessionCookie });
    assert.ok(rescuer.json.guardianRespondingAt);
    assert.ok(!rescuer.text.includes('엄마'));
    assert.equal((await call('POST', '/api/approvals/wrong-token/respond')).status, 404);
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
    // 비공개 보험 목록도 승인되면 함께 보인다
    assert.deepEqual(
      open.json.insurances.map((i: { company: string; phone: string }) => [i.company, i.phone]),
      [
        ['응급손해보험', '1588-0000'],
        ['실손생명', ''],
      ],
    );

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

    const before = (await call('GET', `/api/public/alerts/${alertId}`, { cookie: sessionCookie })).json;
    assert.equal(before.rescuerPhone, '01055556666');
    assert.equal(before.isRescuerVerified, false);
    const { code } = before;
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
    const after = (await call('GET', `/api/public/alerts/${alertId}`, { cookie: sessionCookie })).json;
    assert.equal(after.rescuerPhone, '01077778888');
    assert.equal(after.isRescuerVerified, true);
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

  it('주변 AED: 가까운 순, 거리(m), 좌표 범위 밖은 400', async () => {
    await pool.query(
      `INSERT INTO aeds (id, name, place, address, lat, lng) VALUES
         ('a1', '중앙도서관', '1층 로비', '경기 수원시', 37.2944, 126.9759),
         ('a2', '학생회관', '안내데스크 옆', '경기 수원시', 37.2925, 126.9725),
         ('far', '부산역', '대합실', '부산', 35.1151, 129.0422)`,
    );
    const res = await call('GET', '/api/public/aeds?lat=37.2939&lng=126.9744&limit=5');
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.json.map((a: { name: string }) => a.name),
      ['중앙도서관', '학생회관'],
    );
    assert.ok(res.json[0].distanceM > 100 && res.json[0].distanceM < 200);
    assert.equal((await call('GET', '/api/public/aeds?lat=0&lng=0')).status, 400);
  });

  it('보호자 알림 그만 받기: 이 태그 비상연락처에서 내 번호만 빠진다', async () => {
    const before = await call('GET', `/api/approvals/${approveTokens[1]}`);
    assert.equal(before.json.isSubscribed, true);
    const res = await call('POST', `/api/approvals/${approveTokens[1]}/opt-out`);
    assert.equal(res.status, 200);
    assert.equal(res.json.isSubscribed, false);
    // 다른 보호자는 그대로
    assert.equal((await call('GET', `/api/approvals/${approveTokens[0]}`)).json.isSubscribed, true);
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM tag_contacts tc JOIN tags t ON t.id = tc.tag_id
       WHERE t.public_id = $1 AND tc.invite_status = 'accepted'`,
      [tagId],
    );
    assert.equal(Number(rows[0]!.count), 1);
    assert.equal(
      (await call('GET', `/api/tags/${tagId}`, { token: owner })).json.contacts[1].inviteStatus,
      'declined',
      '태그 주인 앱에는 거절로 보인다',
    );
    assert.equal((await call('GET', `/api/public/tags/${tagId}`)).json.contactCount, 1);
    assert.equal((await call('POST', '/api/approvals/wrong-token/opt-out')).status, 404);
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

  it('연락처 번호를 바꾸면 그 연결은 다시 수락 대기', async () => {
    const res = await call('PUT', `/api/contacts/${contactIds[0]}`, {
      token: owner,
      body: { name: '엄마', relation: '가족', phone: '01077770000' },
    });
    assert.equal(res.status, 200);
    const tag = await call('GET', `/api/tags/${tagId}`, { token: owner });
    assert.equal(tag.json.contacts[0].inviteStatus, 'pending');
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM sms_jobs WHERE phone = '01077770000' AND tag_id IS NOT NULL`,
    );
    assert.equal(rows[0]!.n, 1);
  });

  it('보호자·연락처 메모: 열람 요청은 보호자에게만, 연락하기는 보호자 아닌 연락처에게 위치 알림만', async () => {
    // 앞 테스트에서 비활성·번호 변경·만료된 상태를 시연 가능하게 되돌린다
    await call('PATCH', `/api/tags/${tagId}/active`, { token: owner, body: { isActive: true } });
    await pool.query(`UPDATE alerts SET closed_at = now()`);
    await pool.query(`UPDATE tag_contacts SET invite_status = 'accepted'`);
    const put = await call('PUT', `/api/tags/${tagId}`, {
      token: owner,
      body: {
        label: '키링',
        personId,
        defaultMessage: '긴급상황입니다',
        contacts: [
          { contactId: contactIds[0], isGuardian: true },
          { contactId: contactIds[1], isGuardian: false, message: '회사면 엄마에게 연락해 주세요' },
        ],
      },
    });
    assert.equal(put.status, 200);
    assert.deepEqual(
      put.json.contacts.map((c: { isGuardian: boolean; message: string }) => [c.isGuardian, c.message]),
      [
        [true, ''],
        [false, '회사면 엄마에게 연락해 주세요'],
      ],
    );
    const pub = await call('GET', `/api/public/tags/${tagId}`);
    assert.equal(pub.json.contactCount, 2);
    assert.equal(pub.json.guardianCount, 1);

    const jobsOf = async (id: string) =>
      (await pool.query<{ phone: string; body: string }>('SELECT phone, body FROM sms_jobs WHERE alert_id = $1', [id])).rows;
    const guardianPhone = (await pool.query<{ phone: string }>('SELECT phone FROM contacts WHERE id = $1', [contactIds[0]])).rows[0]!.phone;

    // 1) 열람 요청: 보호자 1명에게만 (승인 링크 포함)
    const req = await call('POST', `/api/public/tags/${tagId}/alerts`, { body: { action: 'requestAccess' } });
    assert.equal(req.status, 201);
    assert.equal(req.json.notifiedCount, 1);
    const cookie = req.setCookie.split(';')[0]!;
    let jobs = await jobsOf(req.json.alertId);
    assert.deepEqual(jobs.map((j) => j.phone), [guardianPhone]);
    assert.match(jobs[0]!.body, /\/a\//);

    // 2) 이어서 연락하기: 아직 못 받은 보호자 아닌 연락처에게만 위치 알림 (승인 링크 없음, 등록자 메모 포함)
    const contact = await call('POST', `/api/public/tags/${tagId}/alerts`, { cookie, body: { action: 'contact' } });
    assert.equal(contact.json.notifiedCount, 1);
    jobs = await jobsOf(req.json.alertId);
    const other = jobs.find((j) => j.phone !== guardianPhone)!;
    assert.ok(!other.body.includes('/a/'));
    assert.match(other.body, /메모: 회사면 엄마에게 연락해 주세요/);

    // 3) 보호자가 없으면 열람 요청 불가 (409)
    await call('PUT', `/api/tags/${tagId}`, {
      token: owner,
      body: { label: '키링', personId, contacts: [{ contactId: contactIds[0], isGuardian: false }] },
    });
    await pool.query(`UPDATE alerts SET closed_at = now()`);
    const none = await call('POST', `/api/public/tags/${tagId}/alerts`, { body: { action: 'requestAccess' } });
    assert.equal(none.status, 409);
    assert.equal(none.json.error.code, 'no_guardian');
  });

  it('게스트 계정 삭제: 구글 계정은 403, 게스트는 대상자·태그까지 모두 삭제', async () => {
    const google = await call('DELETE', '/api/users/me', { token: 'google:google-user-1' });
    assert.equal(google.status, 403);
    assert.equal(google.json.error.code, 'guest_only');

    const res = await call('DELETE', '/api/users/me', { token: owner });
    assert.equal(res.status, 204);
    assert.deepEqual(deletedAuthUsers, ['owner-1']);
    for (const table of ['users', 'persons', 'contacts', 'tags']) {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT count(*) FROM ${table} WHERE ${table === 'users' ? 'id' : 'user_id'} = $1`,
        ['owner-1'],
      );
      assert.equal(Number(rows[0]!.count), 0, table);
    }
    assert.equal((await call('GET', `/api/public/tags/${tagId}`)).status, 404);
  });
});
