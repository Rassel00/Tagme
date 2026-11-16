/**
 * 태그 = 대상자 1명 + 주소록에서 고른 비상연락처(최대 3명) + 공통 메시지 + NFC 기록 상태
 */
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { getPool, withTransaction } from '../db.js';
import { LIMITS } from '../domain/constants.js';
import { currentUser } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';
import { param } from '../lib/http.js';
import { generatePublicId } from '../lib/ids.js';
import { parseOrThrow } from '../lib/validate.js';
import { requireOwnedPerson } from './persons-api.js';

const MAX_TAGS_PER_USER = 10;

export function tagUrl(publicId: string): string {
  return `${config.publicBaseUrl}/t/${publicId}`;
}

interface TagRow {
  id: string;
  public_id: string;
  label: string;
  default_message: string;
  is_active: boolean;
  nfc_written_at: Date | null;
  created_at: Date;
  person_id: string | null;
  person_name: string | null;
  contact_count: number;
}

const SELECT_TAGS = `
  SELECT t.id, t.public_id, t.label, t.default_message, t.is_active, t.nfc_written_at, t.created_at,
         t.person_id, p.name AS person_name,
         (SELECT count(*)::int FROM tag_contacts tc WHERE tc.tag_id = t.id) AS contact_count
  FROM tags t LEFT JOIN persons p ON p.id = t.person_id`;

function tagSummary(row: TagRow) {
  return {
    tagId: row.public_id,
    url: tagUrl(row.public_id),
    label: row.label,
    defaultMessage: row.default_message,
    isActive: row.is_active,
    nfcWrittenAt: row.nfc_written_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    personId: row.person_id,
    personName: row.person_name,
    contactCount: row.contact_count,
  };
}

/** 사용자 소유 태그. 남의 태그·없는 태그는 구분하지 않고 404 */
async function requireOwnedTag(publicId: string, userId: string): Promise<TagRow> {
  const { rows } = await getPool().query<TagRow>(`${SELECT_TAGS} WHERE t.public_id = $1 AND t.user_id = $2`, [
    publicId,
    userId,
  ]);
  if (!rows[0]) throw ApiError.notFound('tag_not_found', '태그를 찾을 수 없습니다.');
  return rows[0];
}

async function tagDetail(publicId: string, userId: string) {
  const tag = await requireOwnedTag(publicId, userId);
  const { rows: contacts } = await getPool().query<{ id: string; name: string; relation: string; phone: string }>(
    `SELECT c.id, c.name, c.relation, c.phone FROM tag_contacts tc JOIN contacts c ON c.id = tc.contact_id
     WHERE tc.tag_id = $1 ORDER BY tc.sort_order`,
    [tag.id],
  );
  return {
    ...tagSummary(tag),
    contacts: contacts.map((c) => ({ contactId: c.id, name: c.name, relation: c.relation, phone: c.phone })),
  };
}

const tagBody = z.object({
  label: z.string().trim().max(30).default(''),
  defaultMessage: z.string().trim().max(100).default(''),
  personId: z.uuid().nullable().default(null),
  /** 주소록 연락처 ID, 순서대로 (최대 3명, 중복 불가) */
  contactIds: z
    .array(z.uuid())
    .max(LIMITS.maxContactsPerTag, `연락처는 최대 ${LIMITS.maxContactsPerTag}명까지 선택할 수 있습니다.`)
    .refine((ids) => new Set(ids).size === ids.length, '같은 연락처를 두 번 선택할 수 없습니다.')
    .default([]),
});

const activeBody = z.object({ isActive: z.boolean() });

/** 대상자·연락처가 모두 이 사용자 것인지 확인하고 태그에 반영 */
async function applyTagBody(tagId: string, userId: string, body: z.infer<typeof tagBody>): Promise<void> {
  if (body.personId) await requireOwnedPerson(body.personId, userId);
  if (body.contactIds.length > 0) {
    const { rows } = await getPool().query<{ n: number }>(
      'SELECT count(*)::int AS n FROM contacts WHERE id = ANY($1) AND user_id = $2',
      [body.contactIds, userId],
    );
    if (rows[0]?.n !== body.contactIds.length) {
      throw ApiError.badRequest('주소록에 없는 연락처가 포함되어 있습니다.');
    }
  }
  await withTransaction(async (client) => {
    await client.query(
      'UPDATE tags SET label = $2, default_message = $3, person_id = $4, updated_at = now() WHERE id = $1',
      [tagId, body.label, body.defaultMessage, body.personId],
    );
    await client.query('DELETE FROM tag_contacts WHERE tag_id = $1', [tagId]);
    for (const [index, contactId] of body.contactIds.entries()) {
      await client.query('INSERT INTO tag_contacts (tag_id, contact_id, sort_order) VALUES ($1, $2, $3)', [
        tagId,
        contactId,
        index,
      ]);
    }
  });
}

export function createTagsRouter(): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const { rows } = await getPool().query<TagRow>(`${SELECT_TAGS} WHERE t.user_id = $1 ORDER BY t.created_at`, [
      currentUser(res.locals).uid,
    ]);
    res.json(rows.map(tagSummary));
  });

  // 태그 추가: 대상자·연락처·메시지를 한 번에 받아 만든다
  router.post('/', async (req, res) => {
    const user = currentUser(res.locals);
    const body = parseOrThrow(tagBody, req.body ?? {});
    const { rows } = await getPool().query<{ n: number }>('SELECT count(*)::int AS n FROM tags WHERE user_id = $1', [
      user.uid,
    ]);
    if ((rows[0]?.n ?? 0) >= MAX_TAGS_PER_USER) {
      throw new ApiError(409, 'tag_limit', `태그는 최대 ${MAX_TAGS_PER_USER}개까지 만들 수 있습니다.`);
    }
    const publicId = generatePublicId();
    const { rows: created } = await getPool().query<{ id: string }>(
      'INSERT INTO tags (public_id, user_id) VALUES ($1, $2) RETURNING id',
      [publicId, user.uid],
    );
    try {
      await applyTagBody(created[0]!.id, user.uid, body);
    } catch (error) {
      // 대상자·연락처 검증에 실패하면 빈 태그를 남기지 않는다
      await getPool().query('DELETE FROM tags WHERE id = $1', [created[0]!.id]);
      throw error;
    }
    res.status(201).json(await tagDetail(publicId, user.uid));
  });

  router.get('/:tagId', async (req, res) => {
    res.json(await tagDetail(param(req, 'tagId'), currentUser(res.locals).uid));
  });

  router.put('/:tagId', async (req, res) => {
    const user = currentUser(res.locals);
    const tag = await requireOwnedTag(param(req, 'tagId'), user.uid);
    await applyTagBody(tag.id, user.uid, parseOrThrow(tagBody, req.body));
    res.json(await tagDetail(tag.public_id, user.uid));
  });

  router.delete('/:tagId', async (req, res) => {
    const tag = await requireOwnedTag(param(req, 'tagId'), currentUser(res.locals).uid);
    await getPool().query('DELETE FROM tags WHERE id = $1', [tag.id]);
    res.status(204).end();
  });

  router.post('/:tagId/nfc-written', async (req, res) => {
    const user = currentUser(res.locals);
    const tag = await requireOwnedTag(param(req, 'tagId'), user.uid);
    await getPool().query('UPDATE tags SET nfc_written_at = now(), updated_at = now() WHERE id = $1', [tag.id]);
    res.json(await tagDetail(tag.public_id, user.uid));
  });

  router.patch('/:tagId/active', async (req, res) => {
    const user = currentUser(res.locals);
    const { isActive } = parseOrThrow(activeBody, req.body);
    const tag = await requireOwnedTag(param(req, 'tagId'), user.uid);
    await getPool().query('UPDATE tags SET is_active = $2, updated_at = now() WHERE id = $1', [tag.id, isActive]);
    res.json(await tagDetail(tag.public_id, user.uid));
  });

  return router;
}
