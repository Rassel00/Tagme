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

async function buildView(approval: ApprovalRow, alert: AlertRow, now: Date) {
  const { rows } = await getPool().query<{ name: string | null; label: string }>(
    `SELECT p.name, t.label FROM tags t LEFT JOIN persons p ON p.id = t.person_id WHERE t.id = $1`,
    [alert.tagId],
  );
  const info = rows[0];
  const status = effectiveAccessStatus(alert.accessStatus, alert.approvedUntil, now);
  const decidedBy =
    alert.decidedByContactId === null ? null : alert.decidedByContactId === approval.contactId ? 'me' : 'other';

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
    },
    myDecision: approval.decision,
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
