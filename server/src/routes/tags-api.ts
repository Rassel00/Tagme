/**
 * 태그 = 대상자 1명 + 주소록에서 고른 비상연락처(최대 3명) + 공통 메시지 + NFC 기록 상태
 */
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { getPool, withTransaction } from '../db.js';
import { LIMITS, type InviteStatus } from '../domain/constants.js';
import { currentUser } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';
import { param } from '../lib/http.js';
import { generatePublicId } from '../lib/ids.js';
import { parseOrThrow } from '../lib/validate.js';
import { countRecentInvites, sendContactInvite } from '../services/invites.js';
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
  accepted_contact_count: number;
}

const SELECT_TAGS = `
  SELECT t.id, t.public_id, t.label, t.default_message, t.is_active, t.nfc_written_at, t.created_at,
         t.person_id, p.name AS person_name,
         (SELECT count(*)::int FROM tag_contacts tc WHERE tc.tag_id = t.id) AS contact_count,
         (SELECT count(*)::int FROM tag_contacts tc WHERE tc.tag_id = t.id AND tc.invite_status = 'accepted')
           AS accepted_contact_count
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
    /** 수락한 연락처 수. 신고 알림은 이 연락처에게만 간다 */
    acceptedContactCount: row.accepted_contact_count,
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
  const { rows: contacts } = await getPool().query<{
    id: string;
    name: string;
    relation: string;
    phone: string;
    invite_status: InviteStatus;
    invited_at: Date | null;
    is_guardian: boolean;
    message: string | null;
  }>(
    `SELECT c.id, c.name, c.relation, c.phone, tc.invite_status, tc.invited_at, tc.is_guardian, tc.message
     FROM tag_contacts tc JOIN contacts c ON c.id = tc.contact_id
     WHERE tc.tag_id = $1 ORDER BY tc.sort_order`,
    [tag.id],
  );
  return {
    ...tagSummary(tag),
    contacts: contacts.map((c) => ({
      contactId: c.id,
      name: c.name,
      relation: c.relation,
      phone: c.phone,
      /** pending: 수락 대기 (알림 안 감) / accepted: 수락 / declined: 거절 */
      inviteStatus: c.invite_status,
      invitedAt: c.invited_at?.toISOString() ?? null,
      /** 보호자만 응급정보 열람 승인 링크를 받는다 */
      isGuardian: c.is_guardian,
      /** 이 연락처 문자에 함께 가는 등록자 메모 */
      message: c.message ?? '',
    })),
  };
}

const tagBody = z.object({
  label: z.string().trim().max(30).default(''),
  defaultMessage: z.string().trim().max(100).default(''),
  personId: z.uuid().nullable().default(null),
  /** 주소록 연락처 ID, 순서대로 (최대 3명, 중복 불가). contacts 를 보내면 무시 (이전 앱 호환) */
  contactIds: z.array(z.uuid()).optional(),
  /** 연락처별 보호자 여부·메모 (11/18) */
  contacts: z
    .array(
      z.object({
        contactId: z.uuid(),
        /** 보호자만 응급정보 열람 승인 링크를 받는다 */
        isGuardian: z.boolean().default(true),
        /** 이 연락처 문자에 함께 보낼 등록자 메모 */
        message: z.string().trim().max(100).default(''),
      }),
    )
    .optional(),
}).transform(({ contactIds, contacts, ...rest }) => ({
  ...rest,
  links: contacts ?? (contactIds ?? []).map((contactId) => ({ contactId, isGuardian: true, message: '' })),
})).superRefine((body, ctx) => {
  if (body.links.length > LIMITS.maxContactsPerTag) {
    ctx.addIssue({ code: 'custom', message: `연락처는 최대 ${LIMITS.maxContactsPerTag}명까지 선택할 수 있습니다.` });
  }
  if (new Set(body.links.map((l) => l.contactId)).size !== body.links.length) {
    ctx.addIssue({ code: 'custom', message: '같은 연락처를 두 번 선택할 수 없습니다.' });
  }
});

const activeBody = z.object({ isActive: z.boolean() });

/** 대상자·연락처가 모두 이 사용자 것인지 확인하고 태그에 반영 */
async function applyTagBody(tagId: string, userId: string, body: z.infer<typeof tagBody>): Promise<void> {
  if (body.personId) await requireOwnedPerson(body.personId, userId);
  const contactIds = body.links.map((l) => l.contactId);
  if (contactIds.length > 0) {
    const { rows } = await getPool().query<{ n: number }>(
      'SELECT count(*)::int AS n FROM contacts WHERE id = ANY($1) AND user_id = $2',
      [contactIds, userId],
    );
    if (rows[0]?.n !== contactIds.length) {
      throw ApiError.badRequest('주소록에 없는 연락처가 포함되어 있습니다.');
    }
  }
  // 이미 연결된 연락처는 수락 상태를 유지하고, 새로 연결한 연락처에만 수락 안내 문자를 보낸다
  const { rows: existing } = await getPool().query<{
    contact_id: string;
    invite_status: InviteStatus;
    invite_token_hash: string | null;
    invited_at: Date | null;
    responded_at: Date | null;
  }>(
    'SELECT contact_id, invite_status, invite_token_hash, invited_at, responded_at FROM tag_contacts WHERE tag_id = $1',
    [tagId],
  );
  const kept = new Map(existing.map((row) => [row.contact_id, row]));
  const added = contactIds.filter((id) => !kept.has(id));
  if (added.length > 0 && (await countRecentInvites(getPool(), userId)) + added.length > LIMITS.contactInvitesPerUserPerDay) {
    throw ApiError.tooManyRequests(
      `비상연락처 수락 안내는 하루 ${LIMITS.contactInvitesPerUserPerDay}건까지 보낼 수 있습니다. 내일 다시 시도하세요.`,
    );
  }

  await withTransaction(async (client) => {
    await client.query(
      'UPDATE tags SET label = $2, default_message = $3, person_id = $4, updated_at = now() WHERE id = $1',
      [tagId, body.label, body.defaultMessage, body.personId],
    );
    await client.query('DELETE FROM tag_contacts WHERE tag_id = $1', [tagId]);
    for (const [index, { contactId, isGuardian, message }] of body.links.entries()) {
      const prev = kept.get(contactId);
      await client.query(
        `INSERT INTO tag_contacts (tag_id, contact_id, sort_order, invite_status, invite_token_hash, invited_at, responded_at,
                                   is_guardian, message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          tagId,
          contactId,
          index,
          prev?.invite_status ?? 'pending',
          prev?.invite_token_hash ?? null,
          prev?.invited_at ?? null,
          prev?.responded_at ?? null,
          isGuardian,
          message || null,
        ],
      );
    }
    // 대상자 이름이 들어가므로 대상자를 반영한 뒤에 보낸다
    for (const contactId of added) await sendContactInvite(client, tagId, contactId);
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

  // 수락 대기 중인 연락처에 안내 문자 다시 보내기 (거절·수락한 연락처는 불가, 10분 간격)
  router.post('/:tagId/contacts/:contactId/invite', async (req, res) => {
    const user = currentUser(res.locals);
    const tag = await requireOwnedTag(param(req, 'tagId'), user.uid);
    const contactId = param(req, 'contactId');
    if (!z.uuid().safeParse(contactId).success) throw ApiError.notFound('contact_not_found', '연락처를 찾을 수 없습니다.');
    const { rows } = await getPool().query<{ invite_status: InviteStatus; invited_at: Date | null }>(
      'SELECT invite_status, invited_at FROM tag_contacts WHERE tag_id = $1 AND contact_id = $2',
      [tag.id, contactId],
    );
    const link = rows[0];
    if (!link) throw ApiError.notFound('contact_not_found', '이 태그에 연결된 연락처가 아닙니다.');
    if (link.invite_status !== 'pending') {
      throw new ApiError(409, 'invite_not_pending', '수락 대기 중인 연락처에만 다시 보낼 수 있습니다.');
    }
    const waitMs = LIMITS.contactInviteResendMinutes * 60_000;
    if (link.invited_at && Date.now() - link.invited_at.getTime() < waitMs) {
      throw ApiError.tooManyRequests(`안내 문자는 ${LIMITS.contactInviteResendMinutes}분 뒤에 다시 보낼 수 있습니다.`);
    }
    if ((await countRecentInvites(getPool(), user.uid)) >= LIMITS.contactInvitesPerUserPerDay) {
      throw ApiError.tooManyRequests(`비상연락처 수락 안내는 하루 ${LIMITS.contactInvitesPerUserPerDay}건까지 보낼 수 있습니다.`);
    }
    await withTransaction((client) => sendContactInvite(client, tag.id, contactId));
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
