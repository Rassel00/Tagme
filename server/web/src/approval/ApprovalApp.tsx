/**
 * 보호자 승인 웹 /a/{approveToken} (GRD-01~04)
 * 문자 속 링크로 열려, 신고 상황을 보고 신고자에게 전화하거나 응급정보 공개를 승인·거절한다.
 */
import { useEffect, useRef, useState } from 'react';
import { ErrorView, Hero, Loading, Sheet } from '../components/common';
import { Icon, IconSprite } from '../components/Icon';
import { useInterval } from '../hooks';
import { createApprovalApi, type ApprovalView } from '../lib/approval-api';
import { durationLabel, errorMessage, formatPhone, formatTime } from '../lib/format';
import { ApiRequestError } from '../lib/types';
import { DecisionPanel } from './DecisionPanel';

const POLL_INTERVAL_MS = 5000;

const token = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] ?? '');
const api = createApprovalApi(token);

function errorTexts(error: unknown): { title: string; description: string } {
  if (error instanceof ApiRequestError && error.status === 410) {
    return {
      title: '링크가 만료되었습니다',
      description: '신고 후 24시간이 지나 이 링크는 더 이상 사용할 수 없습니다. 위급한 상황이면 119에 신고하세요.',
    };
  }
  if (error instanceof ApiRequestError && error.status === 404) {
    return { title: '올바르지 않은 링크입니다', description: '문자로 받은 링크 전체가 열렸는지 확인해 주세요.' };
  }
  return { title: '정보를 불러오지 못했습니다', description: errorMessage(error) };
}

export function ApprovalApp() {
  const [view, setView] = useState<ApprovalView>();
  const [error, setError] = useState<unknown>(token ? undefined : new ApiRequestError(404, 'approval_not_found', ''));
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isOptOutOpen, setIsOptOutOpen] = useState(false);
  const [optOutNotice, setOptOutNotice] = useState<string>();
  const hasLoaded = useRef(false);

  async function refresh(): Promise<void> {
    try {
      const next = await api.get();
      if (!hasLoaded.current) {
        hasLoaded.current = true;
        setDurationMinutes(next.defaultDurationMinutes);
      }
      setView(next);
    } catch (e) {
      setError(e);
    }
  }

  useEffect(() => {
    if (token) void refresh();
  }, []);

  // 다른 보호자의 결정·신고자의 열람 요청을 반영 (오류 화면이면 멈춤)
  useInterval(
    () => {
      if (!document.hidden && !isSubmitting && !isDialogOpen && !isOptOutOpen && view) void refresh();
    },
    error ? null : POLL_INTERVAL_MS,
  );

  async function decide(decision: 'approve' | 'deny'): Promise<void> {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setNotice(undefined);
    try {
      const result = await api.decide(decision, durationMinutes);
      setView(result);
      if (!result.isApplied) setNotice('다른 보호자가 먼저 처리해 현재 상태를 보여드립니다.');
    } catch (e) {
      if (e instanceof ApiRequestError && (e.status === 404 || e.status === 410)) setError(e);
      else setNotice(`처리하지 못했습니다. ${errorMessage(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const [isResponding, setIsResponding] = useState(false);

  async function respond(): Promise<void> {
    setIsResponding(true);
    try {
      setView(await api.respond());
    } catch (e) {
      if (e instanceof ApiRequestError && (e.status === 404 || e.status === 410)) setError(e);
      else setNotice(`대응 중 표시를 하지 못했습니다. ${errorMessage(e)}`);
    } finally {
      setIsResponding(false);
    }
  }

  async function optOut(): Promise<void> {
    setOptOutNotice(undefined);
    try {
      setView(await api.optOut());
    } catch (e) {
      if (e instanceof ApiRequestError && (e.status === 404 || e.status === 410)) setError(e);
      else setOptOutNotice(`알림을 해제하지 못했습니다. ${errorMessage(e)}`);
    }
  }

  let content;
  if (error) {
    const { title, description } = errorTexts(error);
    content = <ErrorView title={title} description={description} hasCall119={false} />;
  } else if (!view) {
    content = <Loading />;
  } else {
    content = (
      <MainView
        view={view}
        durationMinutes={durationMinutes}
        isSubmitting={isSubmitting}
        notice={notice}
        onDurationChange={setDurationMinutes}
        onApprove={() => setIsDialogOpen(true)}
        onDeny={() => void decide('deny')}
        onExpired={() => void refresh()}
        optOutNotice={optOutNotice}
        onOptOut={() => setIsOptOutOpen(true)}
        isResponding={isResponding}
        onRespond={() => void respond()}
      />
    );
  }

  return (
    <>
      <IconSprite />
      <main className="page" aria-live="polite">
        {content}
      </main>
      <Sheet
        isOpen={isDialogOpen}
        onClose={(value) => {
          setIsDialogOpen(false);
          if (value === 'confirm') void decide('approve');
        }}
        icon="check"
        isGreen
        title="응급정보를 공개할까요?"
        description={`${view?.userName ?? ''}님의 비공개 응급정보와 회원님 전화번호를 이 신고를 한 사람에게 ${durationLabel(durationMinutes)} 동안 보여줍니다.`}
        confirmLabel="공개 승인"
      />
      <Sheet
        isOpen={isOptOutOpen}
        onClose={(value) => {
          setIsOptOutOpen(false);
          if (value === 'confirm') void optOut();
        }}
        icon="warn"
        title="이 태그 알림을 그만 받을까요?"
        description={`${view?.userName ?? ''}님 태그로 신고가 접수돼도 이 번호로는 더 이상 문자가 오지 않습니다. 태그를 등록한 사람이 다시 추가하기 전까지 유지됩니다.`}
        confirmLabel="알림 그만 받기"
      />
    </>
  );
}

function MainView({
  view,
  durationMinutes,
  isSubmitting,
  notice,
  onDurationChange,
  onApprove,
  onDeny,
  onExpired,
  optOutNotice,
  onOptOut,
  isResponding,
  onRespond,
}: {
  view: ApprovalView;
  durationMinutes: number;
  isSubmitting: boolean;
  notice?: string;
  onDurationChange: (minutes: number) => void;
  onApprove: () => void;
  onDeny: () => void;
  onExpired: () => void;
  optOutNotice?: string;
  onOptOut: () => void;
  isResponding: boolean;
  onRespond: () => void;
}) {
  const { alert } = view;
  const responding = alert.responding;

  return (
    <section className="view">
      <Hero
        isCompact
        title={`${view.userName}님의 응급 태그가 스캔되었습니다`}
        description={
          view.tagLabel
            ? `태그: ${view.tagLabel} · 상황을 확인하고 신고자에게 연락하거나 응급정보 공개를 결정하세요.`
            : '상황을 확인하고 신고자에게 연락하거나 응급정보 공개를 결정하세요.'
        }
      />

      {/* 신고 정보 (GRD-01) */}
      <section className="card" aria-labelledby="alert-card-title">
        <h2 className="card-title" id="alert-card-title">
          <Icon name="warn" />
          신고 정보
        </h2>
        <dl className="field">
          <dt>신고 시각</dt>
          <dd>{formatTime(alert.createdAt)}</dd>
        </dl>
        <dl className="field">
          <dt>위치</dt>
          <dd>
            {alert.location ? (
              <a href={alert.location.mapUrl} target="_blank" rel="noopener noreferrer">
                지도에서 보기
              </a>
            ) : (
              <span className="muted">위치 정보 없음</span>
            )}
          </dd>
        </dl>
        {/* 신고자 번호는 문자 본인 확인 등으로 있을 때만 (웹 입력은 신고자 메모로 대체, 11/18) */}
        {alert.rescuerPhone && (
          <dl className="field">
            <dt>신고자 번호</dt>
            <dd>
              {formatPhone(alert.rescuerPhone)}
              <span className={alert.isRescuerVerified ? 'badge badge--ok' : 'badge'}>
                {alert.isRescuerVerified ? '인증됨' : '미인증'}
              </span>
            </dd>
          </dl>
        )}
        {alert.rescuerMemo && (
          <dl className="field field--note">
            <dt>신고자 메모</dt>
            <dd>{alert.rescuerMemo}</dd>
          </dl>
        )}
        <dl className="field">
          <dt>응급정보 열람</dt>
          <dd>
            {alert.hasRequestedAccess ? (
              <span className="badge badge--alert">요청됨</span>
            ) : (
              <span className="muted">요청 없음</span>
            )}
          </dd>
        </dl>
      </section>

      {/* 신고자에게 전화 (GRD-02) */}
      {alert.rescuerPhone && (
        <a
          className="btn btn-call btn-block"
          href={`tel:${alert.rescuerPhone.replace(/\D/g, '')}`}
          aria-label={`신고자에게 전화하기 ${formatPhone(alert.rescuerPhone)}`}
        >
          <Icon name="phone" />
          <span>신고자에게 전화하기</span>
        </a>
      )}
      <a className="btn btn-ghost btn-block btn-119-sub" href="tel:119">
        <Icon name="phone" />
        119에 신고하기
      </a>

      {/* 대응 중 표시 (11/18): 보호자가 여러 명이면 누가 대응하고 있는지 서로 알 수 있게 */}
      <section className={responding ? 'card responding responding--on' : 'card responding'} aria-live="polite">
        {responding?.by === 'me' ? (
          <p className="responding-status">
            <Icon name="check" />
            <span>
              <strong>내가 대응 중이에요</strong> · {formatTime(responding.at)}
              <br />
              다른 보호자와 신고자에게 대응 중이라고 보이고 있어요.
            </span>
          </p>
        ) : (
          <>
            <p className="responding-status">
              <Icon name={responding ? 'check' : 'user'} />
              <span>
                {responding ? (
                  <>
                    <strong>{responding.name}님이 대응 중이에요</strong> · {formatTime(responding.at)}
                  </>
                ) : (
                  <>
                    <strong>아직 대응 중인 보호자가 없어요</strong>
                    <br />
                    직접 대응한다면 다른 보호자와 신고자에게 알려 주세요.
                  </>
                )}
              </span>
            </p>
            <button
              type="button"
              className={responding ? 'btn btn-outline btn-block' : 'btn btn-primary btn-block'}
              disabled={isResponding}
              onClick={onRespond}
            >
              {isResponding ? '알리는 중…' : responding ? '저도 대응할게요' : '제가 대응할게요'}
            </button>
          </>
        )}
      </section>

      {/* 승인·거절 (GRD-03) */}
      <DecisionPanel
        view={view}
        durationMinutes={durationMinutes}
        isSubmitting={isSubmitting}
        notice={notice}
        onDurationChange={onDurationChange}
        onApprove={onApprove}
        onDeny={onDeny}
        onExpired={onExpired}
      />

      <p className="footnote">
        <Icon name="lock" />
        승인하면 이 신고를 한 사람의 화면에서만, 정한 시간 동안 응급정보와 회원님 전화번호(바로 전화할 수 있게)가 보입니다. 링크는 신고 후 24시간 동안 유효합니다.
      </p>

      {/* 알림 그만 받기 (11/18): 주인이 관리할 수 없게 된 태그나 동의 없이 등록된 번호도 보호자가 직접 끊을 수 있게 */}
      <div className="opt-out">
        {view.isSubscribed ? (
          <>
            <p>이 사람을 모르거나 더 이상 알림을 받고 싶지 않다면</p>
            <button type="button" className="btn btn-outline btn-block" onClick={onOptOut}>
              이 태그 알림 그만 받기
            </button>
          </>
        ) : (
          <p className="opt-out-done">
            <Icon name="check" />이 태그 알림을 해제했습니다. 이 번호로는 더 이상 문자가 오지 않습니다.
          </p>
        )}
        {optOutNotice && <p className="opt-out-error">{optOutNotice}</p>}
      </div>
    </section>
  );
}
