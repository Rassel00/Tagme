/**
 * 문자 게이트웨이 API (개발 문서 6.4, BE-07). 고정 키(X-Gateway-Key)로 인증한다.
 */
import { timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { getPool } from '../db.js';
import { LIMITS } from '../domain/constants.js';
import { ApiError } from '../lib/errors.js';
import { param } from '../lib/http.js';
import { parseOrThrow } from '../lib/validate.js';

const MAX_JOBS_PER_POLL = 10;
/** 가져간 뒤 이 시간 안에 결과 보고가 없으면 게이트웨이가 멈춘 것으로 보고 다시 대기로 돌린다 */
const SENDING_TIMEOUT_SECONDS = 120;
/** 총 시도 횟수. 넘으면 failed */
const MAX_ATTEMPTS = 3;

/** +82 10-1234-5678 → 01012345678 */
export function normalizeSender(from: string): string {
  const digits = from.replace(/\D/g, '');
  return digits.startsWith('82') ? `0${digits.slice(2)}` : digits;
}

/** 본문에서 SOS-{코드} 를 찾는다 (대소문자·공백 허용) */
export function parseSosCode(body: string): string | null {
  const match = /SOS\s*-?\s*([A-Z0-9]{6})/i.exec(body);
  return match?.[1]?.toUpperCase() ?? null;
}

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

const inboundBody = z.object({
  from: z.string().min(3).max(30),
  body: z.string().max(2000),
  receivedAt: z.string().optional(),
});

const resultBody = z.object({
  status: z.enum(['sent', 'failed']),
  error: z.string().max(500).optional(),
});

export function createGatewayApiRouter(gatewayKey = config.gatewayKey): Router {
  const router = Router();
  router.use(requireGatewayKey(gatewayKey));

  // 앱의 "연결 확인": 키만 확인하고 발송 건은 건드리지 않는다
  router.get('/ping', (_req, res) => {
    res.json({ ok: true });
  });

  // 발송 대기 건을 꺼내면서 sending 으로 바꾼다. 동시 폴링에도 같은 건을 두 번 주지 않게 SKIP LOCKED
  router.get('/sms-jobs', async (_req, res) => {
    // 결과 보고 없이 멈춘 건: 시도 횟수가 남았으면 다시 대기, 아니면 실패 처리
    // (게이트웨이가 실제로 보낸 뒤 죽었다면 중복 발송될 수 있지만, 응급 알림은 누락보다 중복이 낫다)
    await getPool().query(
      `UPDATE sms_jobs
       SET status = CASE WHEN attempts >= $1 THEN 'failed' ELSE 'pending' END,
           error = CASE WHEN attempts >= $1 THEN 'gateway_timeout' ELSE error END
       WHERE status = 'sending' AND sending_at < now() - make_interval(secs => $2)`,
      [MAX_ATTEMPTS, SENDING_TIMEOUT_SECONDS],
    );
    const { rows } = await getPool().query<{ id: string; phone: string; body: string; created_at: Date }>(
      `UPDATE sms_jobs SET status = 'sending', attempts = attempts + 1, sending_at = now()
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

  // 신고자 본인 확인 문자 SOS-{코드} 를 받으면 발신번호를 해당 신고의 인증된 번호로 연결 (GW-05, BE-09)
  router.post('/inbound-sms', async (req, res) => {
    const body = parseOrThrow(inboundBody, req.body);
    const code = parseSosCode(body.body);
    const phone = normalizeSender(body.from);
    if (!code || !/^01\d{8,9}$/.test(phone)) {
      res.json({ matched: false });
      return;
    }
    const { rowCount } = await getPool().query(
      `UPDATE alerts SET rescuer_phone = $2, is_rescuer_verified = true
       WHERE code = $1 AND closed_at IS NULL AND created_at > now() - make_interval(hours => $3)`,
      [code, phone, LIMITS.alertLifetimeHours],
    );
    // 매칭 실패도 200: 게이트웨이가 같은 문자를 계속 재전송하지 않게
    res.json({ matched: Boolean(rowCount) });
  });

  return router;
}
