import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { ApiError, toErrorBody } from '../src/lib/errors.js';
import { parseOrThrow, phoneSchema } from '../src/lib/validate.js';

describe('errors / validate', () => {
  it('ApiError 는 { error: { code, message } } 로 직렬화된다', () => {
    const body = toErrorBody(ApiError.forbidden('consent_required', '필수 동의가 필요합니다.'));
    assert.deepEqual(body, { error: { code: 'consent_required', message: '필수 동의가 필요합니다.' } });
  });

  it('검증 실패 시 400 invalid_request 와 필드 경로를 준다', () => {
    const schema = z.object({ action: z.enum(['contact', 'requestAccess']) });
    assert.throws(
      () => parseOrThrow(schema, { action: 'call' }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 400 &&
        error.code === 'invalid_request' &&
        JSON.stringify(error.details).includes('"path":"action"'),
    );
  });

  it('휴대폰 번호는 하이픈·공백을 지우고 검증한다', () => {
    assert.equal(parseOrThrow(phoneSchema, '010-1234-5678'), '01012345678');
    assert.throws(() => parseOrThrow(phoneSchema, '02-123-4567'), ApiError);
  });
});
