import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALERT_CODE_LENGTH,
  PUBLIC_ID_LENGTH,
  generateAlertCode,
  generateAlertId,
  generatePublicId,
  generateToken,
  hashToken,
  isValidAlertCode,
  isValidPublicId,
} from '../src/lib/ids.js';

describe('ids', () => {
  it('publicId 는 base62 24자이고 매번 다르다', () => {
    const ids = new Set(Array.from({ length: 1000 }, generatePublicId));
    assert.equal(ids.size, 1000);
    for (const id of ids) {
      assert.equal(id.length, PUBLIC_ID_LENGTH);
      assert.ok(isValidPublicId(id));
    }
  });

  it('신고 코드는 헷갈리는 문자(0 O 1 I L) 없이 6자', () => {
    for (let i = 0; i < 500; i += 1) {
      const code = generateAlertCode();
      assert.equal(code.length, ALERT_CODE_LENGTH);
      assert.ok(isValidAlertCode(code));
      assert.doesNotMatch(code, /[0O1IL]/);
    }
  });

  it('신고 ID 는 al_ 접두어', () => {
    assert.match(generateAlertId(), /^al_[0-9A-Za-z]{20}$/);
  });

  it('토큰은 base64url 43자, 해시는 원문과 다른 64자 hex 이며 결정적이다', () => {
    const token = generateToken();
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const hash = hashToken(token);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(hashToken(token), hash);
    assert.notEqual(hashToken(generateToken()), hash);
  });

  it('형식 검사는 길이·문자를 확인한다', () => {
    assert.equal(isValidPublicId('short'), false);
    assert.equal(isValidPublicId('a'.repeat(23) + '!'), false);
    assert.equal(isValidAlertCode('ABC0EF'), false);
  });
});
