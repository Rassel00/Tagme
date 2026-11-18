import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { useInterval, useNow } from '../hooks';
import { errorMessage, formatBirthDate, remainingText } from '../lib/format';
import type { AlertStatus, LatLng, ProfileField, ProfileValues, PublicTag } from '../lib/types';
import { currentPositionForAlert } from './context';
import { Topbar } from './Topbar';

const FIELD_GROUPS: { title: string; icon: IconName; fields: [ProfileField, string][] }[] = [
  { title: '기본정보', icon: 'user', fields: [['name', '이름'], ['birthDate', '생년월일'], ['bloodType', '혈액형']] },
  {
    title: '의료정보',
    icon: 'heart',
    fields: [['conditions', '지병'], ['allergies', '알레르기'], ['medications', '복용 중인 약']],
  },
  { title: '유의사항', icon: 'warn', fields: [['notes', '유의사항']] },
];

/** 사용자 응급정보 (WEB-03) + 보호자 열람 요청 (WEB-04) */
export function InfoView({
  tag,
  alert,
  onBack,
  onRequestAccess,
  onExpired,
  rescuerCard,
}: {
  tag: PublicTag;
  alert?: AlertStatus;
  onBack: () => void;
  onRequestAccess: (position: LatLng | null) => Promise<void>;
  onExpired: () => void;
  /** 신고가 생긴 뒤 보이는 신고자 연락처 카드 (WEB-05) */
  rescuerCard?: ReactNode;
}) {
  const unlocked: ProfileValues = alert?.accessStatus === 'approved' ? alert.emergencyInfo ?? {} : {};

  return (
    <section className="view">
      <Topbar title="사용자 응급정보" onBack={onBack} />
      <div>
        {FIELD_GROUPS.map((group) => (
          <section className="card" key={group.title}>
            <h2 className="card-title">
              <Icon name={group.icon} />
              {group.title}
            </h2>
            {group.fields.map(([field, label]) => {
              const publicValue = tag.publicInfo[field];
              const unlockedValue = unlocked[field];
              const value = publicValue ?? unlockedValue;
              const shown = field === 'birthDate' && value ? formatBirthDate(value) : value;
              const isNote = group.title === '유의사항';
              const classes = ['field'];
              if (isNote) classes.push('field--note');
              if (!publicValue && unlockedValue) classes.push('is-unlocked');
              return (
                <dl className={classes.join(' ')} key={field}>
                  {/* 유의사항 카드는 제목과 항목명이 같아 dt 를 숨긴다 */}
                  {!isNote && <dt>{label}</dt>}
                  <dd>
                    {shown ? (
                      shown
                    ) : tag.lockedFields.includes(field) ? (
                      <span className="locked">
                        <Icon name="lock" />
                        비공개
                      </span>
                    ) : (
                      '-'
                    )}
                  </dd>
                </dl>
              );
            })}
          </section>
        ))}
      </div>
      {tag.lockedFields.length > 0 && (
        <AccessPanel lockedCount={tag.lockedFields.length} alert={alert} onRequestAccess={onRequestAccess} onExpired={onExpired} />
      )}
      {rescuerCard && <div className="rescuer-wrap">{rescuerCard}</div>}
    </section>
  );
}

function AccessPanel({
  lockedCount,
  alert,
  onRequestAccess,
  onExpired,
}: {
  lockedCount: number;
  alert?: AlertStatus;
  onRequestAccess: (position: LatLng | null) => Promise<void>;
  onExpired: () => void;
}) {
  const [isRequesting, setIsRequesting] = useState(false);
  const status = alert?.accessStatus ?? 'none';
  const now = useNow(status === 'approved');

  // 만료 시각이 지나면 다음 폴링을 기다리지 않고 바로 잠근다
  useInterval(
    () => {
      if (alert?.approvedUntil && Date.parse(alert.approvedUntil) <= Date.now()) onExpired();
    },
    status === 'approved' ? 1000 : null,
  );

  async function requestAccess(): Promise<void> {
    if (isRequesting) return;
    setIsRequesting(true);
    try {
      await onRequestAccess(await currentPositionForAlert());
    } catch (error) {
      window.alert(`열람 요청에 실패했습니다.\n${errorMessage(error)}`);
    } finally {
      setIsRequesting(false);
    }
  }

  let body;
  switch (status) {
    case 'none':
      body = (
        <>
          <p className="access-status">
            <Icon name="lock" />
            잠긴 항목 {lockedCount}개
          </p>
          <p>보호자가 승인하면 잠긴 응급정보를 볼 수 있어요.</p>
          <button type="button" className="btn btn-primary btn-block" disabled={isRequesting} onClick={() => void requestAccess()}>
            {isRequesting ? '요청 중…' : '보호자에게 열람 요청'}
          </button>
        </>
      );
      break;
    case 'requested':
      body = (
        <>
          <p className="access-status">
            <span className="spinner" aria-hidden="true" />
            보호자 승인 대기 중
          </p>
          <p>보호자에게 승인 요청을 보냈어요. 승인되면 이 화면에 자동으로 표시됩니다.</p>
        </>
      );
      break;
    case 'approved':
      body = (
        <>
          <p className="access-status">
            <Icon name="check" />
            보호자가 열람을 승인했어요
          </p>
          <p>
            남은 시간 <strong className="timer">{remainingText(alert?.approvedUntil, now)}</strong> · 시간이 지나면 다시 잠깁니다.
          </p>
        </>
      );
      break;
    case 'denied':
      body = (
        <>
          <p className="access-status">
            <Icon name="lock" />
            보호자가 열람을 거절했어요
          </p>
          <p>다른 보호자가 승인하면 자동으로 표시됩니다. 위급하면 119에 신고하세요.</p>
        </>
      );
      break;
    case 'expired':
      body = (
        <>
          <p className="access-status">
            <Icon name="lock" />
            공개 시간이 끝났어요
          </p>
          <p>응급정보가 다시 잠겼습니다.</p>
        </>
      );
      break;
  }

  return <div className={`access access--${status}`}>{body}</div>;
}
