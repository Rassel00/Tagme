/**
 * 사용자(보호자) 앱 API (개발 문서 6.1, 11/16 구조 변경). Authorization: Bearer {Firebase ID 토큰}
 * 사용자·동의 API 를 제외하면 필수 동의가 없을 때 403 consent_required.
 *
 * - /persons  보호 대상자 (응급정보의 주인)
 * - /contacts 비상연락처 주소록
 * - /tags     태그 (대상자 1명 + 주소록에서 고른 연락처 최대 3명)
 */
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { getPool } from '../db.js';
import {
  CONSENT_TYPES,
  CONSENT_VERSION,
  OPTIONAL_CONSENT_TYPES,
  REQUIRED_CONSENT_TYPES,
} from '../domain/constants.js';
import { currentUser, requireAuth, type AuthUser, type DeleteAuthUser, type VerifyIdToken } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';
import { parseOrThrow } from '../lib/validate.js';
import { createContactsRouter } from './contacts-api.js';
import { createPersonsRouter } from './persons-api.js';
import { createTagsRouter } from './tags-api.js';

async function hasRequiredConsents(userId: string): Promise<boolean> {
  const { rows } = await getPool().query<{ count: string }>(
    `SELECT count(DISTINCT type) AS count FROM consents
     WHERE user_id = $1 AND version = $2 AND withdrawn_at IS NULL AND type = ANY($3)`,
    [userId, CONSENT_VERSION, REQUIRED_CONSENT_TYPES],
  );
  return Number(rows[0]?.count ?? 0) === REQUIRED_CONSENT_TYPES.length;
}

const requireConsent: RequestHandler = async (_req, res, next) => {
  const user = currentUser(res.locals);
  if (!(await hasRequiredConsents(user.uid))) {
    throw ApiError.forbidden('consent_required', '필수 항목에 동의해야 이용할 수 있습니다.');
  }
  next();
};

async function consentStatus(userId: string) {
  const { rows } = await getPool().query<{ type: string; version: string; agreed_at: Date }>(
    `SELECT DISTINCT ON (type) type, version, agreed_at FROM consents
     WHERE user_id = $1 AND withdrawn_at IS NULL ORDER BY type, agreed_at DESC`,
    [userId],
  );
  const agreed = rows.map((r) => ({ type: r.type, version: r.version, agreedAt: r.agreed_at.toISOString() }));
  const current = new Set(agreed.filter((a) => a.version === CONSENT_VERSION).map((a) => a.type));
  return {
    version: CONSENT_VERSION,
    required: REQUIRED_CONSENT_TYPES,
    optional: OPTIONAL_CONSENT_TYPES,
    agreed,
    isComplete: REQUIRED_CONSENT_TYPES.every((t) => current.has(t)),
  };
}

/** 앱이 /users/me 전에 다른 API 를 불러도 FK 오류가 나지 않게 */
async function ensureUserExists(user: AuthUser): Promise<void> {
  await getPool().query(
    'INSERT INTO users (id, auth_provider, email) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
    [user.uid, user.provider, user.email],
  );
}

const consentBody = z.object({
  items: z
    .array(z.object({ type: z.enum(CONSENT_TYPES), version: z.string() }))
    .min(1)
    .max(CONSENT_TYPES.length),
});

export function createAppApiRouter(verify: VerifyIdToken, deleteAuthUser: DeleteAuthUser): Router {
  const router = Router();
  router.use(requireAuth(verify));

  // 로그인 직후·계정 연결 후 호출. 사용자 생성 또는 조회 (게스트 → 구글 연결 시 authProvider·email 갱신)
  router.post('/users/me', async (_req, res) => {
    const user = currentUser(res.locals);
    const { rows } = await getPool().query<{ id: string; auth_provider: string; email: string | null; created_at: Date }>(
      `INSERT INTO users (id, auth_provider, email) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET auth_provider = EXCLUDED.auth_provider, email = EXCLUDED.email
       RETURNING id, auth_provider, email, created_at`,
      [user.uid, user.provider, user.email],
    );
    const row = rows[0]!;
    res.json({
      id: row.id,
      authProvider: row.auth_provider,
      email: row.email,
      createdAt: row.created_at.toISOString(),
      isConsentRequired: !(await hasRequiredConsents(user.uid)),
    });
  });

  // 게스트 계정 삭제 (11/18). 게스트는 로그아웃하면 다시 들어올 수 없어, 나갈 때 데이터를 모두 지운다.
  // 태그가 주인 없이 켜진 채 남아 보호자에게 계속 문자가 가는 것을 막는다.
  // users 를 지우면 대상자·주소록·태그·신고·문자 기록까지 FK 로 함께 지워진다 (태그 URL 은 404)
  router.delete('/users/me', async (_req, res) => {
    const user = currentUser(res.locals);
    if (user.provider !== 'anonymous') {
      throw ApiError.forbidden('guest_only', '게스트 계정만 이 방법으로 삭제할 수 있습니다.');
    }
    await getPool().query('DELETE FROM users WHERE id = $1', [user.uid]);
    try {
      await deleteAuthUser(user.uid);
    } catch (error) {
      // 서버 데이터는 이미 지웠다. Firebase 익명 계정이 남아도 앱이 로그아웃하면 다시 쓸 수 없다
      console.warn('[users] Firebase 계정 삭제 실패', error);
    }
    res.status(204).end();
  });

  router.get('/consents', async (_req, res) => {
    res.json(await consentStatus(currentUser(res.locals).uid));
  });

  router.post('/consents', async (req, res) => {
    const user = currentUser(res.locals);
    const { items } = parseOrThrow(consentBody, req.body);
    if (items.some((item) => item.version !== CONSENT_VERSION)) {
      throw ApiError.badRequest(`약관 버전이 최신(${CONSENT_VERSION})이 아닙니다.`);
    }
    await ensureUserExists(user);
    await getPool().query(
      `INSERT INTO consents (user_id, type, version)
       SELECT $1, t, $2 FROM unnest($3::text[]) AS t
       WHERE NOT EXISTS (
         SELECT 1 FROM consents c
         WHERE c.user_id = $1 AND c.type = t AND c.version = $2 AND c.withdrawn_at IS NULL)`,
      [user.uid, CONSENT_VERSION, [...new Set(items.map((i) => i.type))]],
    );
    res.json(await consentStatus(user.uid));
  });

  // 이하 필수 동의 필요
  router.use(requireConsent);
  router.use('/persons', createPersonsRouter());
  router.use('/contacts', createContactsRouter());
  router.use('/tags', createTagsRouter());

  return router;
}
