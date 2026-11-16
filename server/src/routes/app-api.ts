/**
 * 사용자 앱 API (개발 문서 6.1). Authorization: Bearer {Firebase ID 토큰}
 * 사용자·동의 API 를 제외하면 필수 동의가 없을 때 403 consent_required.
 */
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { getPool, withTransaction } from '../db.js';
import {
  CONSENT_TYPES,
  CONSENT_VERSION,
  LIMITS,
  OPTIONAL_CONSENT_TYPES,
  PROFILE_FIELDS,
  REQUIRED_CONSENT_TYPES,
} from '../domain/constants.js';
import { currentUser, requireAuth, type AuthUser, type VerifyIdToken } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';
import { param } from '../lib/http.js';
import { generatePublicId } from '../lib/ids.js';
import { parseOrThrow, phoneSchema } from '../lib/validate.js';
import { EMPTY_PROFILE, findProfile } from '../repos/profiles.js';

const MAX_TAGS_PER_USER = 10;

export function tagUrl(publicId: string): string {
  return `${config.publicBaseUrl}/t/${publicId}`;
}

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

/** 사용자 소유 태그 조회. 남의 태그·없는 태그는 구분하지 않고 404. */
async function findOwnedTag(publicId: string, userId: string) {
  const { rows } = await getPool().query<{
    id: string;
    public_id: string;
    label: string;
    default_message: string;
    is_active: boolean;
    nfc_written_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, public_id, label, default_message, is_active, nfc_written_at, created_at
     FROM tags WHERE public_id = $1 AND user_id = $2`,
    [publicId, userId],
  );
  const tag = rows[0];
  if (!tag) throw ApiError.notFound('tag_not_found', '태그를 찾을 수 없습니다.');
  return tag;
}

async function tagDetail(publicId: string, userId: string) {
  const tag = await findOwnedTag(publicId, userId);
  const { rows: contacts } = await getPool().query<{
    name: string;
    relation: string;
    phone: string;
    message: string | null;
  }>('SELECT name, relation, phone, message FROM contacts WHERE tag_id = $1 ORDER BY sort_order', [tag.id]);
  return {
    tagId: tag.public_id,
    url: tagUrl(tag.public_id),
    label: tag.label,
    defaultMessage: tag.default_message,
    isActive: tag.is_active,
    nfcWrittenAt: tag.nfc_written_at?.toISOString() ?? null,
    createdAt: tag.created_at.toISOString(),
    contacts: contacts.map((c) => ({ name: c.name, relation: c.relation, phone: c.phone, message: c.message })),
  };
}

// ---------------------------------------------------------------- 스키마

const consentBody = z.object({
  items: z
    .array(z.object({ type: z.enum(CONSENT_TYPES), version: z.string() }))
    .min(1)
    .max(CONSENT_TYPES.length),
});

const shortText = (max: number) => z.string().trim().max(max);

const profileBody = z.object({
  name: shortText(30).default(''),
  birthDate: z
    .union([z.literal(''), z.iso.date()])
    .default('')
    .refine((v) => !v || v <= new Date().toISOString().slice(0, 10), '미래 날짜는 입력할 수 없습니다.'),
  bloodType: shortText(20).default(''),
  conditions: shortText(200).default(''),
  allergies: shortText(200).default(''),
  medications: shortText(200).default(''),
  notes: shortText(500).default(''),
  publicFields: z
    .array(z.enum(PROFILE_FIELDS))
    .max(PROFILE_FIELDS.length)
    .default([])
    .transform((fields) => [...new Set(fields)]),
});

const contactSchema = z.object({
  name: shortText(30).min(1),
  relation: shortText(20).default(''),
  phone: phoneSchema,
  message: shortText(100)
    .nullish()
    .transform((v) => v || null),
});

const tagCreateBody = z.object({
  label: shortText(30).default(''),
  defaultMessage: shortText(100).default(''),
});

const tagUpdateBody = z.object({
  label: shortText(30).optional(),
  defaultMessage: shortText(100).optional(),
  contacts: z.array(contactSchema).max(LIMITS.maxContactsPerTag).optional(),
});

const activeBody = z.object({ isActive: z.boolean() });

// ---------------------------------------------------------------- 라우터

export function createAppApiRouter(verify: VerifyIdToken): Router {
  const router = Router();
  router.use(requireAuth(verify));

  // 로그인 직후 호출. 사용자 생성 또는 조회 (계정 연결 후 authProvider·email 갱신)
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

  router.get('/profile', async (_req, res) => {
    res.json((await findProfile(getPool(), currentUser(res.locals).uid)) ?? EMPTY_PROFILE);
  });

  router.put('/profile', async (req, res) => {
    const user = currentUser(res.locals);
    const p = parseOrThrow(profileBody, req.body);
    await getPool().query(
      `INSERT INTO profiles
         (user_id, name, birth_date, blood_type, conditions, allergies, medications, notes, public_fields, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (user_id) DO UPDATE SET
         name = EXCLUDED.name, birth_date = EXCLUDED.birth_date, blood_type = EXCLUDED.blood_type,
         conditions = EXCLUDED.conditions, allergies = EXCLUDED.allergies, medications = EXCLUDED.medications,
         notes = EXCLUDED.notes, public_fields = EXCLUDED.public_fields, updated_at = now()`,
      [user.uid, p.name, p.birthDate || null, p.bloodType, p.conditions, p.allergies, p.medications, p.notes, p.publicFields],
    );
    res.json(await findProfile(getPool(), user.uid));
  });

  router.get('/tags', async (_req, res) => {
    const { rows } = await getPool().query<{
      public_id: string;
      label: string;
      is_active: boolean;
      nfc_written_at: Date | null;
      created_at: Date;
      contact_count: string;
    }>(
      `SELECT t.public_id, t.label, t.is_active, t.nfc_written_at, t.created_at,
              (SELECT count(*) FROM contacts c WHERE c.tag_id = t.id) AS contact_count
       FROM tags t WHERE t.user_id = $1 ORDER BY t.created_at`,
      [currentUser(res.locals).uid],
    );
    res.json(
      rows.map((t) => ({
        tagId: t.public_id,
        url: tagUrl(t.public_id),
        label: t.label,
        isActive: t.is_active,
        nfcWrittenAt: t.nfc_written_at?.toISOString() ?? null,
        contactCount: Number(t.contact_count),
        createdAt: t.created_at.toISOString(),
      })),
    );
  });

  router.post('/tags', async (req, res) => {
    const user = currentUser(res.locals);
    const body = parseOrThrow(tagCreateBody, req.body ?? {});
    const { rows } = await getPool().query<{ count: string }>('SELECT count(*) FROM tags WHERE user_id = $1', [user.uid]);
    if (Number(rows[0]?.count ?? 0) >= MAX_TAGS_PER_USER) {
      throw new ApiError(409, 'tag_limit', `태그는 최대 ${MAX_TAGS_PER_USER}개까지 만들 수 있습니다.`);
    }
    const publicId = generatePublicId();
    await getPool().query(
      'INSERT INTO tags (public_id, user_id, label, default_message) VALUES ($1, $2, $3, $4)',
      [publicId, user.uid, body.label, body.defaultMessage],
    );
    res.status(201).json({ tagId: publicId, url: tagUrl(publicId) });
  });

  router.get('/tags/:tagId', async (req, res) => {
    res.json(await tagDetail(param(req, 'tagId'), currentUser(res.locals).uid));
  });

  router.put('/tags/:tagId', async (req, res) => {
    const user = currentUser(res.locals);
    const publicId = param(req, 'tagId');
    const body = parseOrThrow(tagUpdateBody, req.body);
    const tag = await findOwnedTag(publicId, user.uid);

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE tags SET label = COALESCE($2, label), default_message = COALESCE($3, default_message),
                updated_at = now() WHERE id = $1`,
        [tag.id, body.label ?? null, body.defaultMessage ?? null],
      );
      if (body.contacts) {
        // 순서(sort_order) 기준으로 갱신해 진행 중 신고의 승인 기록(contact_id)이 끊기지 않게 한다
        for (const [index, c] of body.contacts.entries()) {
          await client.query(
            `INSERT INTO contacts (tag_id, name, relation, phone, message, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (tag_id, sort_order) DO UPDATE SET
               name = EXCLUDED.name, relation = EXCLUDED.relation, phone = EXCLUDED.phone, message = EXCLUDED.message`,
            [tag.id, c.name, c.relation, c.phone, c.message, index],
          );
        }
        await client.query('DELETE FROM contacts WHERE tag_id = $1 AND sort_order >= $2', [tag.id, body.contacts.length]);
      }
    });
    res.json(await tagDetail(publicId, user.uid));
  });

  router.delete('/tags/:tagId', async (req, res) => {
    const tag = await findOwnedTag(param(req, 'tagId'), currentUser(res.locals).uid);
    await getPool().query('DELETE FROM tags WHERE id = $1', [tag.id]);
    res.status(204).end();
  });

  router.post('/tags/:tagId/nfc-written', async (req, res) => {
    const user = currentUser(res.locals);
    const tag = await findOwnedTag(param(req, 'tagId'), user.uid);
    await getPool().query('UPDATE tags SET nfc_written_at = now(), updated_at = now() WHERE id = $1', [tag.id]);
    res.json(await tagDetail(tag.public_id, user.uid));
  });

  router.patch('/tags/:tagId/active', async (req, res) => {
    const user = currentUser(res.locals);
    const { isActive } = parseOrThrow(activeBody, req.body);
    const tag = await findOwnedTag(param(req, 'tagId'), user.uid);
    await getPool().query('UPDATE tags SET is_active = $2, updated_at = now() WHERE id = $1', [tag.id, isActive]);
    res.json(await tagDetail(tag.public_id, user.uid));
  });

  return router;
}

/** 앱이 /users/me 전에 다른 API 를 불러도 FK 오류가 나지 않게 */
async function ensureUserExists(user: AuthUser): Promise<void> {
  await getPool().query(
    'INSERT INTO users (id, auth_provider, email) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
    [user.uid, user.provider, user.email],
  );
}
