/**
 * 문자 게이트웨이 API (개발 문서 6.4, BE-07). 고정 키(X-Gateway-Key)로 인증한다.
 */
import { timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { getPool } from '../db.js';
import { ApiError } from '../lib/errors.js';
import { param } from '../lib/http.js';
import { parseOrThrow } from '../lib/validate.js';

const MAX_JOBS_PER_POLL = 10;

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function requireGatewayKey(expected: string | undefined): RequestHandler {
  return (req, _res, next) => {
    if (!expected) throw new ApiError(503, 'gateway_not_configured', '서버에 게이트웨이 키가 설정되지 않았습니다.');
    const key = req.get('x-gateway-key') ?? '';
    if (!safeEqual(key, expected)) throw ApiError.unauthorized('게이트웨이 키가 올바르지 않습니다.');
    next();
  };
}

const resultBody = z.object({
  status: z.enum(['sent', 'failed']),
  error: z.string().max(500).optional(),
});

export function createGatewayApiRouter(gatewayKey = config.gatewayKey): Router {
  const router = Router();
  router.use(requireGatewayKey(gatewayKey));

  // 발송 대기 건을 꺼내면서 sending 으로 바꾼다. 동시 폴링에도 같은 건을 두 번 주지 않게 SKIP LOCKED
  router.get('/sms-jobs', async (_req, res) => {
    const { rows } = await getPool().query<{ id: string; phone: string; body: string; created_at: Date }>(
      `UPDATE sms_jobs SET status = 'sending', attempts = attempts + 1
       WHERE id IN (
         SELECT id FROM sms_jobs WHERE status = 'pending' ORDER BY created_at
         LIMIT $1 FOR UPDATE SKIP LOCKED)
       RETURNING id, phone, body, created_at`,
      [MAX_JOBS_PER_POLL],
    );
    rows.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    res.json(rows.map((r) => ({ jobId: r.id, phone: r.phone, body: r.body })));
  });

  router.post('/sms-jobs/:jobId/result', async (req, res) => {
    const body = parseOrThrow(resultBody, req.body);
    const jobId = param(req, 'jobId');
    if (!z.uuid().safeParse(jobId).success) throw ApiError.notFound('job_not_found', '발송 건을 찾을 수 없습니다.');
    const { rowCount } = await getPool().query(
      `UPDATE sms_jobs SET status = $2, sent_at = CASE WHEN $2 = 'sent' THEN now() END, error = $3
       WHERE id = $1 AND status = 'sending'`,
      [jobId, body.status, body.status === 'failed' ? (body.error ?? 'unknown') : null],
    );
    if (!rowCount) throw ApiError.notFound('job_not_found', '발송 중인 건을 찾을 수 없습니다.');
    res.json({ ok: true });
  });

  return router;
}
