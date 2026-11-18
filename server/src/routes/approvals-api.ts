/**
 * 보호자 승인 API (개발 문서 6.3, BE-06). URL 의 승인 토큰으로 인증한다.
 * 보호자는 신고자 번호를 볼 수 있지만, 다른 보호자의 번호·이름은 보여주지 않는다.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getPool, withTransaction, type Queryable } from '../db.js';
import { ANONYMOUS_DISPLAY_NAME, LIMITS } from '../domain/constants.js';
import { applyDecision, effectiveAccessStatus, isAlertOpen } from '../domain/rules.js';
import { mapUrl } from '../domain/sms-template.js';
import { ApiError } from '../lib/errors.js';
import { param } from '../lib/http.js';
import { hashToken } from '../lib/ids.js';
import { parseOrThrow } from '../lib/validate.js';
import { findAlert, type AlertRow } from '../services/alerts.js';

interface ApprovalRow {
  id: string;
  alertId: string;
  contactId: string | null;
  expiresAt: Date;
  decision: 'approve' | 'deny' | null;
  decidedAt: Date | null;
}

async function findApproval(db: Queryable, token: string): Promise<ApprovalRow> {
  const { rows } = await db.query<ApprovalRow>(
    `SELECT id, alert_id AS "alertId", contact_id AS "contactId", expires_at AS "expiresAt",
            decision, decided_at AS "decidedAt"
     FROM approvals WHERE approve_token_hash = $1`,
    [hashToken(token)],
  );
  const approval = rows[0];
  if (!approval) throw ApiError.notFound('approval_not_found', '승인 링크가 올바르지 않습니다.');
  return approval;
}

function assertUsable(approval: ApprovalRow, alert: AlertRow, now: Date): void {
  if (approval.expiresAt.getTime() <= now.getTime() || !isAlertOpen(alert, now)) {
    throw ApiError.gone('approval_expired', '승인 링크가 만료되었습니다. 신고 후 24시간이 지났습니다.');
  }
}

/**
 * 이 승인 링크를 받은 보호자 번호가 아직 이 태그의 비상연락처인지.
 * 같은 번호가 연락처 여러 개로 들어간 경우도 함께 보려고 번호로 비교한다
 */
async function isStillSubscribed(db: Queryable, approval: ApprovalRow, alert: AlertRow): Promise<boolean> {
  if (!approval.contactId) return false;
  const { rowCount } = await db.query(
    `SELECT 1 FROM tag_contacts tc JOIN contacts c ON c.id = tc.contact_id
     WHERE tc.tag_id = $1 AND tc.invite_status = 'accepted' AND c.phone = (SELECT phone FROM contacts WHERE id = $2)`,
    [alert.tagId, approval.contactId],
  );
  return Boolean(rowCount);
}

async function buildView(approval: ApprovalRow, alert: AlertRow, now: Date) {
  const { rows } = await getPool().query<{ name: string | null; label: string }>(
    `SELECT p.name, t.label FROM tags t LEFT JOIN persons p ON p.id = t.person_id WHERE t.id = $1`,
    [alert.tagId],
  );
  const info = rows[0];
  const status = effectiveAccessStatus(alert.accessStatus, alert.approvedUntil, now);
  const decidedBy =
    alert.decidedByContactId === null ? null : alert.decidedByContactId === approval.contactId ? 'me' : 'other';

  // 대응 중인 보호자: 다른 보호자에게는 주소록 이름(예: 엄마)으로 보여준다
  let responding: { by: 'me' | 'other'; name: string; at: string } | null = null;
  if (alert.respondingContactId && alert.respondingAt) {
    const { rows: who } = await getPool().query<{ name: string }>('SELECT name FROM contacts WHERE id = $1', [
      alert.respondingContactId,
    ]);
    responding = {
      by: alert.respondingContactId === approval.contactId ? 'me' : 'other',
      name: who[0]?.name ?? '다른 보호자',
      at: alert.respondingAt.toISOString(),
    };
  }

  return {
    // 이름은 공개 항목이 아니어도 보호자에게는 표시 (7.3)
    userName: info?.name?.trim() || ANONYMOUS_DISPLAY_NAME,
    tagLabel: info?.label ?? '',
    alert: {
      createdAt: alert.createdAt.toISOString(),
      location: alert.lat !== null && alert.lng !== null ? { lat: alert.lat, lng: alert.lng, mapUrl: mapUrl(alert.lat, alert.lng) } : null,
      rescuerPhone: alert.rescuerPhone,
      isRescuerVerified: alert.isRescuerVerified,
      rescuerMemo: alert.rescuerMemo,
      hasContacted: alert.hasContacted,
      hasRequestedAccess: alert.hasRequestedAccess,
      accessStatus: status,
      approvedUntil: status === 'approved' ? alert.approvedUntil?.toISOString() : undefined,
      decidedBy,
      /** 대응 중인 보호자 (없으면 null) */
      responding,
    },
    myDecision: approval.decision,
    /** false 면 이 보호자는 이 태그 알림을 해제했다 (더 이상 문자를 받지 않음) */
    isSubscribed: await isStillSubscribed(getPool(), approval, alert),
    expiresAt: approval.expiresAt.toISOString(),
    defaultDurationMinutes: LIMITS.defaultApproveMinutes,
  };
}

const decisionBody = z.object({
  decision: z.enum(['approve', 'deny']),
  durationMinutes: z.number().int().min(5).max(180).default(LIMITS.defaultApproveMinutes),
});

export function createApprovalsApiRouter(): Router {
  const router = Router();

  router.get('/:approveToken', async (req, res) => {
    const now = new Date();
    const approval = await findApproval(getPool(), param(req, 'approveToken'));
    const alert = (await findAlert(getPool(), 'id', approval.alertId))!;
    assertUsable(approval, alert, now);
    res.set('Cache-Control', 'no-store');
    res.json(await buildView(approval, alert, now));
  });

  // 보호자가 이 태그의 알림을 그만 받기 (11/18). 태그 비상연락처에서 이 번호를 뺀다.
  // 주인이 관리할 수 없게 된 태그(게스트 로그아웃 등)나 동의 없이 등록된 번호도 보호자가 스스로 끊을 수 있게
  // [제가 대응할게요] (11/18): 다른 보호자와 신고자에게 대응 중이라고 알린다. 마지막으로 누른 사람이 표시된다
  router.post('/:approveToken/respond', async (req, res) => {
    const now = new Date();
    const approval = await findApproval(getPool(), param(req, 'approveToken'));
    const alert = (await findAlert(getPool(), 'id', approval.alertId))!;
    assertUsable(approval, alert, now);
    if (!approval.contactId) throw ApiError.notFound('approval_not_found', '승인 링크가 올바르지 않습니다.');
    await getPool().query('UPDATE alerts SET responding_contact_id = $2, responding_at = $3 WHERE id = $1', [
      alert.id,
      approval.contactId,
      now,
    ]);
    res.json(await buildView(approval, { ...alert, respondingContactId: approval.contactId, respondingAt: now }, now));
  });

  router.post('/:approveToken/opt-out', async (req, res) => {
    const now = new Date();
    const approval = await findApproval(getPool(), param(req, 'approveToken'));
    const alert = (await findAlert(getPool(), 'id', approval.alertId))!;
    assertUsable(approval, alert, now);
    if (approval.contactId) {
      // 연결은 남기고 '거절'로: 태그 주인 앱에 거절로 보이고, 다시 수락하려면 수락 링크를 쓴다
      await getPool().query(
        `UPDATE tag_contacts tc SET invite_status = 'declined', responded_at = now() FROM contacts c
         WHERE tc.contact_id = c.id AND tc.tag_id = $1 AND c.phone = (SELECT phone FROM contacts WHERE id = $2)`,
        [alert.tagId, approval.contactId],
      );
    }
    res.json(await buildView(approval, alert, now));
  });

  router.post('/:approveToken', async (req, res) => {
    const now = new Date();
    const body = parseOrThrow(decisionBody, req.body);
    const token = param(req, 'approveToken');

    const { approval, alert, isApplied } = await withTransaction(async (client) => {
      const approval = await findApproval(client, token);
      const alert = (await findAlert(client, 'id', approval.alertId, { forUpdate: true }))!;
      assertUsable(approval, alert, now);

      const current = effectiveAccessStatus(alert.accessStatus, alert.approvedUntil, now);
      const next = applyDecision(current, body.decision, body.durationMinutes, now);
      if (!next) return { approval, alert, isApplied: false };

      await client.query(
        `UPDATE alerts SET access_status = $2, approved_until = $3, decided_by_contact_id = $4 WHERE id = $1`,
        [alert.id, next.accessStatus, next.approvedUntil, approval.contactId],
      );
      await client.query('UPDATE approvals SET decision = $2, decided_at = $3 WHERE id = $1', [
        approval.id,
        body.decision,
        now,
      ]);
      return {
        approval: { ...approval, decision: body.decision, decidedAt: now },
        alert: { ...alert, ...next, decidedByContactId: approval.contactId },
        isApplied: true,
      };
    });

    res.json({ ...(await buildView(approval, alert, now)), isApplied });
  });

  return router;
}
