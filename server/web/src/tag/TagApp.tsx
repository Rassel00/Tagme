/**
 * 응급 지원 웹 /t/{tagId} (WEB-01~04, WEB-06), /aed
 * 화면: #(메인) / #info(응급정보) / #aed(주변 AED). 해시로 전환해 뒤로가기가 자연스럽게 동작한다.
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
  | { kind: 'error'; title: string; description: string };

function loadErrorState(error: unknown): LoadState {
  if (error instanceof ApiRequestError && error.status === 404) {
    return { kind: 'error', title: '등록되지 않은 태그입니다', description: '태그 정보를 찾을 수 없습니다. 위급하면 바로 119에 신고하세요.' };
  }
  if (error instanceof ApiRequestError && error.status === 410) {
    return { kind: 'error', title: '사용이 중지된 태그입니다', description: '태그 주인이 이 태그를 비활성화했습니다. 위급하면 바로 119에 신고하세요.' };
  }
  return { kind: 'error', title: '정보를 불러오지 못했습니다', description: `${errorMessage(error)} 위급하면 바로 119에 신고하세요.` };
}

export function TagApp() {
  const [load, setLoad] = useState<LoadState>(() =>
    isAedOnly || tagId
      ? { kind: 'loading' }
      : { kind: 'error', title: '잘못된 주소입니다', description: '태그를 다시 대 주세요. 위급하면 바로 119에 신고하세요.' },
  );
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

  async function createAlert(action: AlertAction, position: LatLng | null): Promise<CreateAlertResult> {
    const result = await api.createAlert(action, position);
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

  const view = isAedOnly ? 'aed' : load.kind !== 'ready' ? load.kind : route === 'info' || route === 'aed' ? route : 'main';

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
        onExpired={() => setAlert({ accessStatus: 'expired' })}
      />
    );
  } else {
    content = <MainView contactCount={load.tag.contactCount} onContact={(position) => createAlert('contact', position)} />;
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
