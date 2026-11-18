import { Icon, type IconName } from '../components/Icon';
import { useInterval, useNow } from '../hooks';
import { errorMessage, formatBirthDate, remainingText } from '../lib/format';
import type { AlertStatus, ProfileField, ProfileValues, PublicTag } from '../lib/types';
import { Topbar } from './Topbar';

const FIELD_GROUPS: { title: string; icon: IconName; fields: [ProfileField, string][] }[] = [
  { title: '기본정보', icon: 'user', fields: [['name', '이름'], ['birthDate', '생년월일'], ['bloodType', '혈액형']] },
  {
    title: '의료정보',
    icon: 'heart',
    fields: [['conditions', '지병'], ['allergies', '알레르기'], ['medications', '복용 중인 약']],
  },
  {
    title: '장애·의사소통',
    icon: 'user',
    fields: [['disabilityType', '장애 유형'], ['communication', '의사소통'], ['careTips', '대하는 법']],
  },
  { title: '유의사항', icon: 'warn', fields: [['notes', '유의사항']] },
];

/** 값이 하나도 없는 그룹(공개도 비공개도 아닌)은 숨긴다. 기본 세 그룹은 항상 보인다 */
const OPTIONAL_GROUPS = new Set(['장애·의사소통']);

/** 사용자 응급정보 (WEB-03). 비공개 항목은 비상연락망에 연락하면 보호자가 문자 링크에서 승인할 수 있다 (11/18 열람 요청 버튼 제거) */
export function InfoView({
  tag,
  alert,
  onBack,
  onExpired,
}: {
  tag: PublicTag;
  alert?: AlertStatus;
  onBack: () => void;
  onExpired: () => void;
}) {
  const unlocked: ProfileValues = alert?.accessStatus === 'approved' ? alert.emergencyInfo ?? {} : {};

  return (
    <section className="view">
      <Topbar title="사용자 응급정보" onBack={onBack} />
      <div>
        {FIELD_GROUPS.filter(
          (group) =>
            !OPTIONAL_GROUPS.has(group.title) ||
            group.fields.some(([field]) => tag.publicInfo[field] || tag.lockedFields.includes(field)),
        ).map((group) => (
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
        <AccessPanel lockedCount={tag.lockedFields.length} hasGuardian={(tag.guardianCount ?? 0) > 0} alert={alert} onExpired={onExpired} />
      )}
    </section>
  );
}

function AccessPanel({
  lockedCount,
  hasGuardian,
  alert,
  onExpired,
}: {
  lockedCount: number;
  /** 열람 요청을 승인할 보호자가 있는지 (11/18) */
  hasGuardian: boolean;
  alert?: AlertStatus;
  onExpired: () => void;
}) {
  const status = alert?.accessStatus ?? 'none';
  const now = useNow(status === 'approved');

  // 만료 시각이 지나면 다음 폴링을 기다리지 않고 바로 잠근다
  useInterval(
    () => {
      if (alert?.approvedUntil && Date.parse(alert.approvedUntil) <= Date.now()) onExpired();
    },
    status === 'approved' ? 1000 : null,
  );

  let body;
  switch (status) {
    case 'none':
      body = (
        <>
          <p className="access-status">
            <Icon name="lock" />
            잠긴 항목 {lockedCount}개
          </p>
          {/* 11/18: 열람 요청 버튼 대신 안내. 비상연락망 문자를 받은 보호자가 링크에서 승인하면 이 화면에 자동으로 보인다 */}
          <p>
            {hasGuardian
              ? '비공개 정보를 열람하려면 비상연락망에 연락하여 승인 받으세요.'
              : '열람을 승인할 보호자가 등록되어 있지 않아 잠긴 정보를 볼 수 없어요. 위급하면 119에 신고하세요.'}
          </p>
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
