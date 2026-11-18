import { Notice } from '../components/common';
import { Icon } from '../components/Icon';
import { useInterval, useNow } from '../hooks';
import type { ApprovalView } from '../lib/approval-api';
import { durationLabel, remainingText } from '../lib/format';

const DURATION_OPTIONS = [10, 30, 60, 120];

/** 응급정보 공개 승인·거절 (GRD-03). 공개 중이면 남은 시간을 보여준다 */
export function DecisionPanel({
  view,
  durationMinutes,
  isSubmitting,
  notice,
  onDurationChange,
  onApprove,
  onDeny,
  onExpired,
}: {
  view: ApprovalView;
  durationMinutes: number;
  isSubmitting: boolean;
  notice?: string;
  onDurationChange: (minutes: number) => void;
  onApprove: () => void;
  onDeny: () => void;
  /** 공개 시간이 끝났을 때 (다음 폴링을 기다리지 않고 상태를 다시 가져오게) */
  onExpired: () => void;
}) {
  const { alert } = view;
  const status = alert.accessStatus;
  const isApproved = status === 'approved';
  const now = useNow(isApproved);

  useInterval(
    () => {
      if (alert.approvedUntil && Date.parse(alert.approvedUntil) <= Date.now()) onExpired();
    },
    isApproved ? 1000 : null,
  );

  const noticeBox = notice ? (
    <Notice kind="info" icon="warn">
      {notice}
    </Notice>
  ) : null;

  if (isApproved) {
    return (
      <section className="card decision decision--approved" aria-labelledby="decision-title">
        <h2 className="access-status" id="decision-title">
          <Icon name="check" />
          응급정보 공개 중
        </h2>
        <p>
          남은 시간 <strong className="timer">{remainingText(alert.approvedUntil, now)}</strong>
          {alert.decidedBy === 'other' ? ' · 다른 보호자가 승인했습니다.' : ' · 승인했습니다.'}
        </p>
        <p>시간이 지나면 신고자 화면에서 다시 잠깁니다.</p>
        {noticeBox}
      </section>
    );
  }

  let title: string;
  let description: string;
  if (status === 'denied') {
    title = alert.decidedBy === 'other' ? '다른 보호자가 열람을 거절했습니다' : '열람을 거절했습니다';
    description = '필요하면 지금 승인할 수 있습니다.';
  } else if (status === 'expired') {
    title = '공개 시간이 끝났습니다';
    description = '응급정보가 다시 잠겼습니다. 필요하면 다시 승인하세요.';
  } else if (status === 'requested') {
    title = '응급정보 열람 요청';
    description = `신고자가 ${view.userName}님의 비공개 응급정보(지병·복용약 등) 열람을 요청했습니다.`;
  } else {
    title = '응급정보 공개';
    description = '신고자가 아직 열람을 요청하지 않았습니다. 미리 승인해 두면 요청하는 즉시 보입니다.';
  }
  const canDeny = status === 'none' || status === 'requested';

  return (
    <section className={`card decision decision--${status}`} aria-labelledby="decision-title">
      <h2 className="access-status" id="decision-title">
        <Icon name="lock" />
        {title}
      </h2>
      <p>{description}</p>
      <fieldset className="durations">
        <legend>공개 시간</legend>
        {DURATION_OPTIONS.map((minutes) => (
          <label key={minutes}>
            <input
              type="radio"
              name="duration"
              value={minutes}
              checked={minutes === durationMinutes}
              onChange={() => onDurationChange(minutes)}
            />
            <span>{durationLabel(minutes)}</span>
          </label>
        ))}
      </fieldset>
      <div className="decision-actions">
        <button type="button" className="btn btn-primary btn-block" disabled={isSubmitting} onClick={onApprove}>
          {isSubmitting ? '처리 중…' : '응급정보 공개 승인'}
        </button>
        {canDeny && (
          <button type="button" className="btn btn-outline btn-block" disabled={isSubmitting} onClick={onDeny}>
            거절
          </button>
        )}
      </div>
      {noticeBox}
    </section>
  );
}
