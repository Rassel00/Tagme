import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';

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
  for (const [path, script, referrer] of [
    ['/t/SomeTagId', '/js/tag-page.js', 'strict-origin'],
    ['/aed', '/js/tag-page.js', 'strict-origin'],
    ['/a/SomeApproveToken', '/js/approval-page.js', 'no-referrer'],
  ] as const) {
    it(`${path} 는 HTML 을 주고 주소 경로가 새지 않게 막는다`, async () => {
      const res = await fetch(baseUrl + path);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
      assert.equal(res.headers.get('referrer-policy'), referrer);
      assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.ok((await res.text()).includes(script));
    });
  }
});
