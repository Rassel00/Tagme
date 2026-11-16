import type pg from 'pg';
import { config } from '../config.js';
import type { AccessStatus } from '../domain/constants.js';
import { LIMITS } from '../domain/constants.js';
import { renderGuardianSms } from '../domain/sms-template.js';
import { generateToken, hashToken } from '../lib/ids.js';
import { findProfile } from '../repos/profiles.js';

export interface AlertRow {
  id: string;
  tagId: string;
  code: string;
  lat: number | null;
  lng: number | null;
  rescuerPhone: string | null;
  isRescuerVerified: boolean;
  sessionTokenHash: string;
  hasContacted: boolean;
  hasRequestedAccess: boolean;
  accessStatus: AccessStatus;
  approvedUntil: Date | null;
  decidedByContactId: string | null;
  lastNotifiedAt: Date | null;
  createdAt: Date;
  closedAt: Date | null;
}

const ALERT_COLUMNS = `
  id, tag_id AS "tagId", code, lat, lng, rescuer_phone AS "rescuerPhone",
  is_rescuer_verified AS "isRescuerVerified", session_token_hash AS "sessionTokenHash",
  has_contacted AS "hasContacted", has_requested_access AS "hasRequestedAccess",
  access_status AS "accessStatus", approved_until AS "approvedUntil",
  decided_by_contact_id AS "decidedByContactId", last_notified_at AS "lastNotifiedAt",
  created_at AS "createdAt", closed_at AS "closedAt"`;

export async function findAlert(
  db: pg.PoolClient | pg.Pool,
  where: 'id' | 'session',
  value: string,
  options: { forUpdate?: boolean } = {},
): Promise<AlertRow | null> {
  const column = where === 'id' ? 'id' : 'session_token_hash';
  const { rows } = await db.query<AlertRow>(
    `SELECT ${ALERT_COLUMNS} FROM alerts WHERE ${column} = $1${options.forUpdate ? ' FOR UPDATE' : ''}`,
    [value],
  );
  return rows[0] ?? null;
}

export function approveUrl(token: string): string {
  return `${config.publicBaseUrl}/a/${token}`;
}

/**
 * 보호자 전원에게 문자 1통씩: 보호자별 승인 링크(토큰은 해시만 저장)를 만들고 발송 큐에 넣는다.
 * 재알림 때도 새 승인 링크를 추가로 발급한다(이전 문자 속 링크도 그대로 유효).
 * @returns 문자를 보낸 보호자 수
 */
export async function notifyGuardians(
  client: pg.PoolClient,
  alert: AlertRow,
  tag: { id: string; userId: string; defaultMessage: string },
  now: Date,
): Promise<number> {
  const { rows: contacts } = await client.query<{ id: string; phone: string; message: string | null }>(
    'SELECT id, phone, message FROM contacts WHERE tag_id = $1 ORDER BY sort_order',
    [tag.id],
  );
  if (contacts.length === 0) return 0;

  const profile = await findProfile(client, tag.userId);
  const expiresAt = new Date(alert.createdAt.getTime() + LIMITS.alertLifetimeHours * 3_600_000);

  for (const contact of contacts) {
    const token = generateToken();
    await client.query(
      'INSERT INTO approvals (alert_id, contact_id, approve_token_hash, expires_at) VALUES ($1, $2, $3, $4)',
      [alert.id, contact.id, hashToken(token), expiresAt],
    );
    const body = renderGuardianSms({
      userName: profile?.name ?? '',
      message: contact.message ?? tag.defaultMessage,
      lat: alert.lat,
      lng: alert.lng,
      rescuerPhone: alert.rescuerPhone,
      isRescuerVerified: alert.isRescuerVerified,
      hasRequestedAccess: alert.hasRequestedAccess,
      approveUrl: approveUrl(token),
    });
    await client.query('INSERT INTO sms_jobs (alert_id, phone, body) VALUES ($1, $2, $3)', [
      alert.id,
      contact.phone,
      body,
    ]);
  }
  await client.query('UPDATE alerts SET last_notified_at = $2 WHERE id = $1', [alert.id, now]);
  return contacts.length;
}
