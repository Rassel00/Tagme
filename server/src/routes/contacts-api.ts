/**
 * 비상연락처 주소록. 태그는 주소록 항목을 참조하므로 여기서 고치면 연결된 모든 태그에 반영된다.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getPool, withTransaction } from '../db.js';
import { LIMITS } from '../domain/constants.js';
import { currentUser } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';
import { param } from '../lib/http.js';
import { parseOrThrow, phoneSchema } from '../lib/validate.js';
import { countRecentInvites, sendContactInvite } from '../services/invites.js';

const MAX_CONTACTS_PER_USER = 20;

const contactBody = z.object({
  name: z.string().trim().min(1, '이름을 입력하세요.').max(30),
  relation: z.string().trim().max(20).default(''),
  phone: phoneSchema,
});

interface ContactRow {
  id: string;
  name: string;
  relation: string;
  phone: string;
  tag_count: number;
}

const SELECT_CONTACTS = `
  SELECT c.id, c.name, c.relation, c.phone,
         (SELECT count(*)::int FROM tag_contacts tc WHERE tc.contact_id = c.id) AS tag_count
  FROM contacts c`;

function contactJson(row: ContactRow) {
  return { contactId: row.id, name: row.name, relation: row.relation, phone: row.phone, tagCount: row.tag_count };
}

async function requireOwnedContact(contactId: string, userId: string): Promise<ContactRow> {
  if (!z.uuid().safeParse(contactId).success) throw ApiError.notFound('contact_not_found', '연락처를 찾을 수 없습니다.');
  const { rows } = await getPool().query<ContactRow>(`${SELECT_CONTACTS} WHERE c.id = $1 AND c.user_id = $2`, [
    contactId,
    userId,
  ]);
  if (!rows[0]) throw ApiError.notFound('contact_not_found', '연락처를 찾을 수 없습니다.');
  return rows[0];
}

export function createContactsRouter(): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const { rows } = await getPool().query<ContactRow>(`${SELECT_CONTACTS} WHERE c.user_id = $1 ORDER BY c.created_at`, [
      currentUser(res.locals).uid,
    ]);
    res.json(rows.map(contactJson));
  });

  router.post('/', async (req, res) => {
    const user = currentUser(res.locals);
    const body = parseOrThrow(contactBody, req.body);
    const { rows: count } = await getPool().query<{ n: number }>(
      'SELECT count(*)::int AS n FROM contacts WHERE user_id = $1',
      [user.uid],
    );
    if ((count[0]?.n ?? 0) >= MAX_CONTACTS_PER_USER) {
      throw new ApiError(409, 'contact_limit', `연락처는 최대 ${MAX_CONTACTS_PER_USER}명까지 등록할 수 있습니다.`);
    }
    const { rows } = await getPool().query<{ id: string }>(
      'INSERT INTO contacts (user_id, name, relation, phone) VALUES ($1, $2, $3, $4) RETURNING id',
      [user.uid, body.name, body.relation, body.phone],
    );
    res.status(201).json(contactJson(await requireOwnedContact(rows[0]!.id, user.uid)));
  });

  router.put('/:contactId', async (req, res) => {
    const user = currentUser(res.locals);
    const contact = await requireOwnedContact(param(req, 'contactId'), user.uid);
    const body = parseOrThrow(contactBody, req.body);
    // 번호가 바뀌면 다른 사람일 수 있으므로 연결된 태그마다 다시 수락을 받는다
    const isPhoneChanged = body.phone !== contact.phone;
    const { rows: links } = await getPool().query<{ tag_id: string }>(
      'SELECT tag_id FROM tag_contacts WHERE contact_id = $1',
      [contact.id],
    );
    if (isPhoneChanged && links.length > 0) {
      if ((await countRecentInvites(getPool(), user.uid)) + links.length > LIMITS.contactInvitesPerUserPerDay) {
        throw ApiError.tooManyRequests(
          `비상연락처 수락 안내는 하루 ${LIMITS.contactInvitesPerUserPerDay}건까지 보낼 수 있습니다. 내일 다시 시도하세요.`,
        );
      }
    }
    await withTransaction(async (client) => {
      await client.query('UPDATE contacts SET name = $2, relation = $3, phone = $4 WHERE id = $1', [
        contact.id,
        body.name,
        body.relation,
        body.phone,
      ]);
      if (isPhoneChanged) for (const link of links) await sendContactInvite(client, link.tag_id, contact.id);
    });
    res.json(contactJson(await requireOwnedContact(contact.id, user.uid)));
  });

  // 지우면 연결된 태그에서도 빠진다 (앱에서 tagCount 로 미리 경고)
  router.delete('/:contactId', async (req, res) => {
    const contact = await requireOwnedContact(param(req, 'contactId'), currentUser(res.locals).uid);
    await getPool().query('DELETE FROM contacts WHERE id = $1', [contact.id]);
    res.status(204).end();
  });

  return router;
}
