/**
 * 응급 지원 웹 /t/{tagId} (WEB-01~04, WEB-06), 기본 페이지 / · /t, 주변 AED /aed
 * 화면: #(메인) / #info(응급정보) / #aed(주변 AED). 해시로 전환해 뒤로가기가 자연스럽게 동작한다.
 * 기본 페이지(태그 없이 열거나 비활성 태그)는 119 신고와 주변 AED 찾기만 쓸 수 있다.
 */
import { useEffect, useLayoutEffect, useState } from 'react';
import { ErrorView, Loading } from '../components/common';
import { IconSprite } from '../components/Icon';
import { useHashRoute, useInterval } from '../hooks';
import { errorMessage } from '../lib/format';
import type { AlertAction, AlertStatus, CreateAlertResult, LatLng, PublicTag } from '../lib/types';
import { ApiRequestError } from '../lib/types';
import { AedView } from './AedView';
import { api, isAedOnly, readStoredAlertId, storeAlertId, tagId } from './context';
import { InfoView } from './InfoView';
import { MainView } from './MainView';

const POLL_INTERVAL_MS = 3000;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; tag: PublicTag }
  /** 기본 페이지: 태그 없이 열었거나 태그 주인이 비활성화한 태그 */
  | { kind: 'basic' }
  | { kind: 'error'; title: string; description: string };

function loadErrorState(error: unknown): LoadState {
  // 비활성 태그는 안내 없이 기본 페이지로 (태그 주인이 끈 태그의 정보·연락 기능을 막는다)
  if (error instanceof ApiRequestError && error.status === 410) return { kind: 'basic' };
  if (error instanceof ApiRequestError && error.status === 404) {
    return { kind: 'error', title: '등록되지 않은 태그입니다', description: '태그 정보를 찾을 수 없습니다. 위급하면 바로 119에 신고하세요.' };
  }
  return { kind: 'error', title: '정보를 불러오지 못했습니다', description: `${errorMessage(error)} 위급하면 바로 119에 신고하세요.` };
}

export function TagApp() {
  const [load, setLoad] = useState<LoadState>(() => (tagId ? { kind: 'loading' } : { kind: 'basic' }));
  const [alertId, setAlertId] = useState(readStoredAlertId);
  const [alert, setAlert] = useState<AlertStatus>();
  const [aedPosition, setAedPosition] = useState<LatLng>();
  const { route, goBack } = useHashRoute();

  /** 신고 상태 갱신. 세션 쿠키가 없거나(403) 신고가 종료됨(410) → 새 신고를 만들 수 있게 초기화 */
  async function refreshAlert(id: string | undefined = alertId): Promise<void> {
    if (!id) return;
    try {
      setAlert(await api.getAlert(id));
    } catch (error) {
      if (error instanceof ApiRequestError && [401, 403, 404, 410].includes(error.status)) {
        setAlertId(undefined);
        setAlert(undefined);
        storeAlertId(undefined);
      }
    }
  }

  async function createAlert(action: AlertAction, position: LatLng | null, memo?: string): Promise<CreateAlertResult> {
    const result = await api.createAlert(action, position, memo);
    setAlertId(result.alertId);
    storeAlertId(result.alertId);
    return result;
  }

  // 태그 조회 (진행 중인 신고가 있으면 상태도 먼저 가져온다)
  useEffect(() => {
    if (isAedOnly) {
      document.title = '주변 AED 찾기 · TagMe';
      return;
    }
    if (!tagId) return;
    let isCancelled = false;
    void (async () => {
      try {
        const tag = await api.getTag();
        await refreshAlert();
        if (!isCancelled) setLoad({ kind: 'ready', tag });
      } catch (error) {
        if (!isCancelled) setLoad(loadErrorState(error));
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, []);

  // 승인 대기·공개 중·거절 상태면 3초마다 확인 (다른 보호자가 승인할 수 있음)
  const status = alert?.accessStatus;
  const shouldPoll = Boolean(alertId) && (status === 'requested' || status === 'approved' || status === 'denied');
  useInterval(
    () => {
      if (!document.hidden) void refreshAlert();
    },
    shouldPoll ? POLL_INTERVAL_MS : null,
  );

  let view: 'aed' | 'info' | 'main' | 'loading' | 'error';
  if (isAedOnly) view = 'aed';
  else if (load.kind === 'ready') view = route === 'info' || route === 'aed' ? route : 'main';
  else if (load.kind === 'basic') view = route === 'aed' ? 'aed' : 'main';
  else view = load.kind;

  useLayoutEffect(() => {
    document.body.classList.toggle('is-sub', view === 'info' || view === 'aed');
    window.scrollTo(0, 0);
  }, [view]);

  let content;
  if (view === 'aed') {
    content = <AedView hasBack={!isAedOnly} onBack={goBack} position={aedPosition} onPosition={setAedPosition} />;
  } else if (load.kind === 'loading') {
    content = <Loading />;
  } else if (load.kind === 'error') {
    content = <ErrorView title={load.title} description={load.description} hasCall119 />;
  } else if (load.kind === 'basic') {
    content = <MainView />;
  } else if (view === 'info') {
    content = (
      <InfoView
        tag={load.tag}
        alert={alert}
        onBack={goBack}
        onRequestAccess={async (position) => {
          const result = await createAlert('requestAccess', position);
          await refreshAlert(result.alertId);
        }}
        onExpired={() => setAlert((previous) => ({ ...previous, accessStatus: 'expired', approvedUntil: undefined, emergencyInfo: undefined }))}
      />
    );
  } else {
    content = (
      <MainView
        tag={{
          contactCount: load.tag.contactCount,
          onContact: async (position, memo) => {
            const result = await createAlert('contact', position, memo);
            await refreshAlert(result.alertId);
            return result;
          },
        }}
      />
    );
  }

  return (
    <>
      <IconSprite />
      <main className="page" id="app" aria-live="polite">
        {content}
      </main>
    </>
  );
}
