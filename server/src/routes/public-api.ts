/**
 * 응급 지원 웹 API (개발 문서 6.2). 공개, 신고 후에는 세션 쿠키로 신고자를 확인한다.
 * 보호자 번호는 어떤 응답에도 넣지 않는다 (WEB-04).
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { getPool, withTransaction, type Queryable } from '../db.js';
import { LIMITS } from '../domain/constants.js';
import {
  effectiveAccessStatus,
  isAlertOpen,
  planMergedAlert,
  toLockedValues,
  toPublicView,
} from '../domain/rules.js';
import { ApiError } from '../lib/errors.js';
import { param, readCookie } from '../lib/http.js';
import { generateAlertCode, generateAlertId, generateToken, hashToken } from '../lib/ids.js';
import { createRateLimiter } from '../lib/rate-limit.js';
import { parseOrThrow, phoneSchema } from '../lib/validate.js';
import { findPersonForTag } from '../repos/persons.js';
import { findAlert, notifyGuardians, type AlertRow } from '../services/alerts.js';

export const ALERT_SESSION_COOKIE = 'alertSession';

interface PublicTag {
  id: string;
  userId: string;
  defaultMessage: string;
}

async function findActiveTag(publicId: string, db: Queryable = getPool(), forUpdate = false): Promise<PublicTag> {
  const { rows } = await db.query<PublicTag & { isActive: boolean }>(
    `SELECT id, user_id AS "userId", default_message AS "defaultMessage", is_active AS "isActive"
     FROM tags WHERE public_id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [publicId],
  );
  const tag = rows[0];
  if (!tag) throw ApiError.notFound('tag_not_found', '등록되지 않은 태그입니다.');
  if (!tag.isActive) throw ApiError.gone('tag_inactive', '사용이 중지된 태그입니다.');
  return tag;
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  res.cookie(ALERT_SESSION_COOKIE, token, {
    httpOnly: true,
    // localhost·LAN 의 http 개발 환경에서도 쿠키가 동작하도록 운영(HTTPS)에서만 Secure 강제
    secure: config.isProduction || req.secure,
    sameSite: 'strict',
    path: '/api/public',
    maxAge: LIMITS.alertLifetimeHours * 3_600_000,
  });
}

const alertBody = z
  .object({
    action: z.enum(['contact', 'requestAccess']),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .refine((b) => (b.lat === undefined) === (b.lng === undefined), '위도와 경도는 함께 보내야 합니다.');

const rescuerPhoneBody = z.object({ rescuerPhone: phoneSchema });

const aedQuery = z.object({
  lat: z.coerce.number().min(33).max(39),
  lng: z.coerce.number().min(124).max(132),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

/** 현재 위치에서 가까운 AED (거리 m). 먼저 약 5km 안에서 찾고, 모자라면 약 20km 까지 넓힌다 */
async function findNearbyAeds(lat: number, lng: number, limit: number) {
  for (const deg of [0.05, 0.2]) {
    const { rows } = await getPool().query<{
      name: string;
      place: string;
      address: string;
      lat: number;
      lng: number;
      distance_m: number;
    }>(
      `SELECT name, place, address, lat, lng,
              round(6371000 * 2 * asin(sqrt(
                power(sin(radians(lat - $1) / 2), 2) +
                cos(radians($1)) * cos(radians(lat)) * power(sin(radians(lng - $2) / 2), 2))))::int AS distance_m
       FROM aeds
       WHERE lat BETWEEN $1 - $4 AND $1 + $4 AND lng BETWEEN $2 - $4 AND $2 + $4
       ORDER BY distance_m LIMIT $3`,
      [lat, lng, limit, deg],
    );
    if (rows.length >= limit || deg === 0.2) {
      return rows.map((r) => ({ name: r.name, place: r.place, address: r.address, lat: r.lat, lng: r.lng, distanceM: r.distance_m }));
    }
  }
  return [];
}

export function createPublicApiRouter(): Router {
  const router = Router();
  // tagId 를 바꿔가며 조회하는 것을 막기 위해 공개 조회는 IP당 분당 30회 (BE-08)
  const lookupLimiter = createRateLimiter({
    windowMs: 60_000,
    max: LIMITS.publicLookupsPerIpPerMinute,
    key: (req) => req.ip ?? 'unknown',
  });

  // 웹 화면용 공개 설정. 카카오맵 JS 키는 등록 도메인에서만 동작하는 공개 키라 내려줘도 된다
  router.get('/config', (_req, res) => {
    res.json({ kakaoJsKey: config.kakaoJsKey ?? null });
  });

  // 주변 AED 가까운 순 (WEB-06). 앱의 "주변 AED 찾기"도 /aed 웹 페이지로 이 API 를 쓴다
  router.get('/aeds', lookupLimiter, async (req, res) => {
    const { lat, lng, limit } = parseOrThrow(aedQuery, req.query);
    res.json(await findNearbyAeds(lat, lng, limit));
  });

  // 공개 정보 + 잠긴 항목명 (BE-03)
  router.get('/tags/:tagId', lookupLimiter, async (req, res) => {
    const tag = await findActiveTag(param(req, 'tagId'));
    const person = await findPersonForTag(getPool(), tag.id);
    const { rows } = await getPool().query<{ count: string }>('SELECT count(*) FROM tag_contacts WHERE tag_id = $1', [tag.id]);
    res.set('Cache-Control', 'no-store');
    res.json({ ...toPublicView(person), contactCount: Number(rows[0]?.count ?? 0) });
  });

  // 신고 생성 또는 병합 (BE-04, 7.1)
  router.post('/tags/:tagId/alerts', async (req, res) => {
    const body = parseOrThrow(alertBody, req.body);
    const publicId = param(req, 'tagId');
    const sessionToken = readCookie(req, ALERT_SESSION_COOKIE);
    const now = new Date();

    const result = await withTransaction(async (client) => {
      // 같은 태그의 동시 신고를 직렬화
      const tag = await findActiveTag(publicId, client, true);

      const existing = sessionToken ? await findAlert(client, 'session', hashToken(sessionToken), { forUpdate: true }) : null;
      if (existing && existing.tagId === tag.id && isAlertOpen(existing, now)) {
        return mergeAlert(client, existing, tag, body, now);
      }
      return createAlert(client, tag, body, now);
    });

    if (result.sessionToken) setSessionCookie(req, res, result.sessionToken);
    res.status(result.response.isMerged ? 200 : 201).json(result.response);
  });

  // 상태 조회 (폴링). 쿠키가 신고와 맞아야 하며, 승인 중이면 비공개 응급정보 포함 (BE-05)
  router.get('/alerts/:alertId', async (req, res) => {
    const alert = await requireOwnAlert(req);
    const now = new Date();
    res.set('Cache-Control', 'no-store');

    const status = effectiveAccessStatus(alert.accessStatus, alert.approvedUntil, now);
    if (status !== alert.accessStatus) {
      await getPool().query(`UPDATE alerts SET access_status = $2 WHERE id = $1 AND access_status = 'approved'`, [
        alert.id,
        status,
      ]);
    }

    const response: Record<string, unknown> = {
      accessStatus: status,
      hasContacted: alert.hasContacted,
      hasRequestedAccess: alert.hasRequestedAccess,
      code: alert.code,
    };
    if (status === 'approved') {
      const person = await findPersonForTag(getPool(), alert.tagId);
      response.approvedUntil = alert.approvedUntil?.toISOString();
      response.emergencyInfo = toLockedValues(person);
    }
    res.json(response);
  });

  // 신고자 번호 직접 입력 (WEB-05, BE 2.16). 문자로 인증된 번호는 덮어쓰지 않는다
  router.patch('/alerts/:alertId', async (req, res) => {
    const { rescuerPhone } = parseOrThrow(rescuerPhoneBody, req.body);
    const alert = await requireOwnAlert(req);
    if (alert.isRescuerVerified) {
      throw new ApiError(409, 'rescuer_verified', '이미 문자로 인증된 번호가 있습니다.');
    }
    await getPool().query('UPDATE alerts SET rescuer_phone = $2 WHERE id = $1 AND NOT is_rescuer_verified', [
      alert.id,
      rescuerPhone,
    ]);
    res.json({ rescuerPhone, isRescuerVerified: false });
  });

  return router;
}

async function requireOwnAlert(req: Request): Promise<AlertRow> {
  const token = readCookie(req, ALERT_SESSION_COOKIE);
  const alert = await findAlert(getPool(), 'id', param(req, 'alertId'));
  // 쿠키 없음·다른 신고의 쿠키·없는 신고 모두 같은 응답 (신고 ID 존재 여부를 알 수 없게)
  if (!alert || !token || alert.sessionTokenHash !== hashToken(token)) {
    throw ApiError.forbidden('session_required', '이 신고를 조회할 권한이 없습니다.');
  }
  if (!isAlertOpen(alert, new Date())) throw ApiError.gone('alert_closed', '종료된 신고입니다.');
  return alert;
}

type AlertBody = z.infer<typeof alertBody>;
type CreateResult = {
  sessionToken?: string;
  response: { alertId: string; code: string; notifiedCount: number; isMerged: boolean };
};

async function mergeAlert(
  client: import('pg').PoolClient,
  alert: AlertRow,
  tag: PublicTag,
  body: AlertBody,
  now: Date,
): Promise<CreateResult> {
  const plan = planMergedAlert(alert, body.action, now);
  const lat = alert.lat ?? body.lat ?? null;
  const lng = alert.lng ?? body.lng ?? null;
  await client.query(
    `UPDATE alerts SET has_contacted = $2, has_requested_access = $3, access_status = $4, lat = $5, lng = $6
     WHERE id = $1`,
    [alert.id, plan.hasContacted, plan.hasRequestedAccess, plan.accessStatus, lat, lng],
  );
  const updated: AlertRow = { ...alert, ...plan, lat, lng };
  const notifiedCount = plan.shouldNotify ? await notifyGuardians(client, updated, tag, now) : 0;
  return { response: { alertId: alert.id, code: alert.code, notifiedCount, isMerged: true } };
}

async function createAlert(
  client: import('pg').PoolClient,
  tag: PublicTag,
  body: AlertBody,
  now: Date,
): Promise<CreateResult> {
  // 장난 신고 방지: 태그당 신규 신고 1분 1회·하루 10회 (7.1, BE-08)
  const { rows: counts } = await client.query<{ lastMinute: string; lastDay: string }>(
    `SELECT count(*) FILTER (WHERE created_at > $2::timestamptz - interval '1 minute') AS "lastMinute",
            count(*) FILTER (WHERE created_at > $2::timestamptz - interval '1 day') AS "lastDay"
     FROM alerts WHERE tag_id = $1`,
    [tag.id, now],
  );
  if (Number(counts[0]?.lastMinute) >= 1 || Number(counts[0]?.lastDay) >= LIMITS.newAlertsPerTagPerDay) {
    throw ApiError.tooManyRequests('방금 다른 신고가 접수되었습니다. 잠시 후 다시 시도하세요. 위급하면 119에 신고하세요.');
  }

  const sessionToken = generateToken();
  const accessStatus = body.action === 'requestAccess' ? 'requested' : 'none';
  let code = generateAlertCode();
  for (let i = 0; i < 5; i += 1) {
    const { rowCount } = await client.query('SELECT 1 FROM alerts WHERE code = $1', [code]);
    if (!rowCount) break;
    code = generateAlertCode();
  }

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO alerts (id, tag_id, code, lat, lng, session_token_hash, has_contacted, has_requested_access,
                         access_status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      generateAlertId(),
      tag.id,
      code,
      body.lat ?? null,
      body.lng ?? null,
      hashToken(sessionToken),
      body.action === 'contact',
      body.action === 'requestAccess',
      accessStatus,
      now,
    ],
  );
  const alert = (await findAlert(client, 'id', rows[0]!.id))!;
  const notifiedCount = await notifyGuardians(client, alert, tag, now);
  return { sessionToken, response: { alertId: alert.id, code: alert.code, notifiedCount, isMerged: false } };
}
