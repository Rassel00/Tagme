/**
 * 비상연락처 수락 API (11/18). 안내 문자 속 링크 /c/{inviteToken} 의 웹 화면이 쓴다. 토큰으로만 인증한다.
 * 이 화면에는 태그 주인·다른 연락처 정보는 보여주지 않고 대상자 이름만 보여준다.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db.js';
import { ANONYMOUS_DISPLAY_NAME, type InviteStatus } from '../domain/constants.js';
import { ApiError } from '../lib/errors.js';
import { param } from '../lib/http.js';
import { hashToken } from '../lib/ids.js';
import { parseOrThrow } from '../lib/validate.js';

interface InviteRow {
  tag_id: string;
  contact_id: string;
  invite_status: InviteStatus;
  person_name: string | null;
  tag_label: string;
}

async function findInvite(token: string): Promise<InviteRow> {
  const { rows } = await getPool().query<InviteRow>(
    `SELECT tc.tag_id, tc.contact_id, tc.invite_status, p.name AS person_name, t.label AS tag_label
     FROM tag_contacts tc JOIN tags t ON t.id = tc.tag_id LEFT JOIN persons p ON p.id = t.person_id
     WHERE tc.invite_token_hash = $1`,
    [hashToken(token)],
  );
  if (!rows[0]) throw ApiError.notFound('invite_not_found', '링크가 올바르지 않거나 더 이상 유효하지 않습니다.');
  return rows[0];
}

function inviteView(row: InviteRow) {
  return {
    userName: row.person_name?.trim() || ANONYMOUS_DISPLAY_NAME,
    tagLabel: row.tag_label,
    status: row.invite_status,
  };
}

const decisionBody = z.object({ decision: z.enum(['accept', 'decline']) });

export function createInvitesApiRouter(): Router {
  const router = Router();

  router.get('/:inviteToken', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(inviteView(await findInvite(param(req, 'inviteToken'))));
  });

  // 수락·거절. 나중에 마음을 바꿀 수 있도록 같은 링크로 다시 결정할 수 있다
  router.post('/:inviteToken', async (req, res) => {
    const { decision } = parseOrThrow(decisionBody, req.body);
    const invite = await findInvite(param(req, 'inviteToken'));
    const status: InviteStatus = decision === 'accept' ? 'accepted' : 'declined';
    await getPool().query(
      'UPDATE tag_contacts SET invite_status = $3, responded_at = now() WHERE tag_id = $1 AND contact_id = $2',
      [invite.tag_id, invite.contact_id, status],
    );
    res.json(inviteView({ ...invite, invite_status: status }));
  });

  return router;
}
