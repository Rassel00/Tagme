import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { CONSENT_VERSION, OPTIONAL_CONSENT_TYPES, REQUIRED_CONSENT_TYPES } from '../src/domain/constants.js';

// HTML 은 Vite 빌드 결과(web/dist)를 보낸다. npm test 가 먼저 build:web 을 실행한다
describe('웹 페이지 라우트 (DB 불필요)', () => {
  let server: import('node:http').Server;
  let baseUrl = '';

  before(async () => {
    server = createApp({ verifyIdToken: async () => Promise.reject(new Error('unused')) }).listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  // /t·/aed 는 카카오맵 도메인 확인 때문에 도메인만 보내고(strict-origin), /a 는 아예 보내지 않는다
  for (const [path, title, referrer] of [
    ['/t/SomeTagId', '응급 지원 페이지', 'strict-origin'],
    ['/', '응급 지원 페이지', 'strict-origin'],
    ['/t', '응급 지원 페이지', 'strict-origin'],
    ['/aed', '응급 지원 페이지', 'strict-origin'],
    ['/a/SomeApproveToken', '보호자 확인', 'no-referrer'],
    ['/c/SomeInviteToken', '비상연락처 등록 확인', 'no-referrer'],
  ] as const) {
    it(`${path} 는 HTML 을 주고 주소 경로가 새지 않게 막는다`, async () => {
      const res = await fetch(baseUrl + path);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
      assert.equal(res.headers.get('referrer-policy'), referrer);
      assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const html = await res.text();
      assert.ok(html.includes(`<title>${title}`));
      assert.match(html, /<script type="module"[^>]*src="\/assets\/[^"]+\.js"/);
    });
  }

  it('해시가 붙은 /assets/* 는 오래 캐시한다', async () => {
    const html = await (await fetch(`${baseUrl}/t/SomeTagId`)).text();
    const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
    assert.ok(script);
    const res = await fetch(baseUrl + script);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control') ?? '', /immutable/);
  });

  it('동의 약관 버전은 로그인 없이 조회 (게스트는 동의 후 계정 생성)', async () => {
    const res = await fetch(`${baseUrl}/api/public/consents`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { version: string; required: string[]; optional: string[] };
    assert.equal(body.version, CONSENT_VERSION);
    assert.deepEqual(body.required, [...REQUIRED_CONSENT_TYPES]);
    assert.deepEqual(body.optional, [...OPTIONAL_CONSENT_TYPES]);
  });
});
