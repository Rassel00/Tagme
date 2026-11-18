/**
 * 비상연락처 수락 (11/18). 태그에 연락처를 연결하면 그 번호로 수락·거절 링크 문자를 보내고,
 * 수락한 연결(invite_status = 'accepted')에만 신고 알림을 보낸다.
 */
import type pg from 'pg';
import { config } from '../config.js';
import { renderInviteSms } from '../domain/sms-template.js';
import { generateToken, hashToken } from '../lib/ids.js';
import { findPersonForTag } from '../repos/persons.js';

export function inviteUrl(token: string): string {
  return `${config.publicBaseUrl}/c/${token}`;
}

/** 이 연결을 수락 대기로 두고 새 링크로 안내 문자를 보낸다 (이전 링크는 무효) */
export async function sendContactInvite(client: pg.PoolClient, tagId: string, contactId: string): Promise<void> {
  const { rows } = await client.query<{ phone: string }>('SELECT phone FROM contacts WHERE id = $1', [contactId]);
  const phone = rows[0]?.phone;
  if (!phone) return;
  const token = generateToken();
  await client.query(
    `UPDATE tag_contacts SET invite_status = 'pending', invite_token_hash = $3, invited_at = now(), responded_at = NULL
     WHERE tag_id = $1 AND contact_id = $2`,
    [tagId, contactId, hashToken(token)],
  );
  const person = await findPersonForTag(client, tagId);
  await client.query('INSERT INTO sms_jobs (tag_id, phone, body) VALUES ($1, $2, $3)', [
    tagId,
    phone,
    renderInviteSms({ userName: person?.name ?? '', inviteUrl: inviteUrl(token) }),
  ]);
}

/** 이 사용자가 최근 24시간 동안 보낸 수락 안내 수 */
export async function countRecentInvites(db: pg.PoolClient | pg.Pool, userId: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM tag_contacts tc JOIN tags t ON t.id = tc.tag_id
     WHERE t.user_id = $1 AND tc.invited_at > now() - interval '1 day'`,
    [userId],
  );
  return rows[0]?.n ?? 0;
}
