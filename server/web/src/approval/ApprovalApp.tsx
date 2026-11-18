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
      if (!document.hidden && !isSubmitting && !isDialogOpen && view) void refresh();
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
        description={`${view?.userName ?? ''}님의 비공개 응급정보를 이 신고를 한 사람에게 ${durationLabel(durationMinutes)} 동안 보여줍니다.`}
        confirmLabel="공개 승인"
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
}: {
  view: ApprovalView;
  durationMinutes: number;
  isSubmitting: boolean;
  notice?: string;
  onDurationChange: (minutes: number) => void;
  onApprove: () => void;
  onDeny: () => void;
  onExpired: () => void;
}) {
  const { alert } = view;

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
        승인하면 이 신고를 한 사람의 화면에서만, 정한 시간 동안 응급정보가 보입니다. 링크는 신고 후 24시간 동안 유효합니다.
      </p>
    </section>
  );
}
