import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRateLimiter } from '../src/lib/rate-limit.js';
import { normalizeSender, parseSosCode } from '../src/routes/gateway-api.js';
import { DEFAULT_NEW_ALERT_IP_LIMITS } from '../src/routes/public-api.js';

describe('수신 문자 파싱 (GW-05)', () => {
  it('SOS-{코드} 를 대소문자·공백과 무관하게 찾는다', () => {
    assert.equal(parseSosCode('SOS-K4P9QZ'), 'K4P9QZ');
    assert.equal(parseSosCode('도와주세요 sos-k4p9qz'), 'K4P9QZ');
    assert.equal(parseSosCode('SOS K4P9QZ'), 'K4P9QZ');
    assert.equal(parseSosCode('안녕하세요'), null);
  });

  it('발신번호를 010 형식으로 정규화', () => {
    assert.equal(normalizeSender('+82 10-1234-5678'), '01012345678');
    assert.equal(normalizeSender('010-1234-5678'), '01012345678');
  });
});

describe('요청 제한 (BE-08)', () => {
  it('창 안에서 max 회까지 허용, 창이 지나면 초기화', () => {
    let t = 0;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3, key: () => 'ip', now: () => t });
    assert.deepEqual([1, 2, 3, 4].map(() => limiter.hit('ip')), [true, true, true, false]);
    assert.equal(limiter.hit('other-ip'), true);
    t = 60_000;
    assert.equal(limiter.hit('ip'), true);
  });

  it('신규 신고 IP 제한 기본값: 10분 5건, 하루 20건', () => {
    assert.deepEqual(DEFAULT_NEW_ALERT_IP_LIMITS, [
      { windowMs: 600_000, max: 5 },
      { windowMs: 86_400_000, max: 20 },
    ]);
  });
});
