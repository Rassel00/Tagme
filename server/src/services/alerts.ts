import type pg from 'pg';
import { config } from '../config.js';
import type { AccessStatus } from '../domain/constants.js';
import { LIMITS } from '../domain/constants.js';
import { renderGuardianSms } from '../domain/sms-template.js';
import { generateToken, hashToken } from '../lib/ids.js';
import { findPersonForTag } from '../repos/persons.js';

export interface AlertRow {
  id: string;
  tagId: string;
  code: string;
  lat: number | null;
  lng: number | null;
  rescuerPhone: string | null;
  isRescuerVerified: boolean;
  rescuerMemo: string | null;
  sessionTokenHash: string;
  hasContacted: boolean;
  hasRequestedAccess: boolean;
  accessStatus: AccessStatus;
  approvedUntil: Date | null;
  decidedByContactId: string | null;
  /** [제가 대응할게요]를 마지막으로 누른 보호자 (11/18) */
  respondingContactId: string | null;
  respondingAt: Date | null;
  lastNotifiedAt: Date | null;
  createdAt: Date;
  closedAt: Date | null;
}

const ALERT_COLUMNS = `
  id, tag_id AS "tagId", code, lat, lng, rescuer_phone AS "rescuerPhone",
  is_rescuer_verified AS "isRescuerVerified", rescuer_memo AS "rescuerMemo", session_token_hash AS "sessionTokenHash",
  has_contacted AS "hasContacted", has_requested_access AS "hasRequestedAccess",
  access_status AS "accessStatus", approved_until AS "approvedUntil",
  decided_by_contact_id AS "decidedByContactId", responding_contact_id AS "respondingContactId",
  responding_at AS "respondingAt", last_notified_at AS "lastNotifiedAt",
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
 * 문자를 받을 연락처 (11/18):
 * - all: 비상연락망 연락. 수락한 연락처 전원 (보호자는 승인 링크, 아닌 연락처는 위치 알림만)
 * - guardians: 열람 요청. 보호자만
 * - others: 열람 요청 뒤 처음 연락하기를 누른 경우, 아직 못 받은 보호자 아닌 연락처
 */
export type NotifyAudience = 'all' | 'guardians' | 'others';

/**
 * 연락처마다 문자 1통씩. 보호자에게는 보호자별 승인 링크(토큰은 해시만 저장)를 만들어 넣는다.
 * 재알림 때도 새 승인 링크를 추가로 발급한다(이전 문자 속 링크도 그대로 유효).
 * @returns 문자를 보낸 연락처 수
 */
export async function notifyGuardians(
  client: pg.PoolClient,
  alert: AlertRow,
  tag: { id: string; userId: string; defaultMessage: string },
  now: Date,
  audience: NotifyAudience = 'all',
): Promise<number> {
  // 주소록을 참조하므로 보호자가 번호를 고치면 바로 새 번호로 보낸다. 수락한 연락처에게만 (11/18).
  // 연락처별 등록자 메모(tag_contacts.message)는 11/18 에 기능을 없애 문자에 넣지 않는다
  const { rows: all } = await client.query<{ id: string; phone: string; is_guardian: boolean }>(
    `SELECT c.id, c.phone, tc.is_guardian FROM tag_contacts tc JOIN contacts c ON c.id = tc.contact_id
     WHERE tc.tag_id = $1 AND tc.invite_status = 'accepted' ORDER BY tc.sort_order`,
    [tag.id],
  );
  const contacts = all.filter((c) =>
    audience === 'all' ? true : audience === 'guardians' ? c.is_guardian : !c.is_guardian,
  );
  if (contacts.length === 0) return 0;

  const person = await findPersonForTag(client, tag.id);
  const expiresAt = new Date(alert.createdAt.getTime() + LIMITS.alertLifetimeHours * 3_600_000);

  for (const contact of contacts) {
    let link: string | null = null;
    if (contact.is_guardian) {
      const token = generateToken();
      await client.query(
        'INSERT INTO approvals (alert_id, contact_id, approve_token_hash, expires_at) VALUES ($1, $2, $3, $4)',
        [alert.id, contact.id, hashToken(token), expiresAt],
      );
      link = approveUrl(token);
    }
    const body = renderGuardianSms({
      userName: person?.name ?? '',
      message: tag.defaultMessage,
      lat: alert.lat,
      lng: alert.lng,
      rescuerPhone: alert.rescuerPhone,
      isRescuerVerified: alert.isRescuerVerified,
      rescuerMemo: alert.rescuerMemo,
      hasRequestedAccess: alert.hasRequestedAccess,
      approveUrl: link,
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
