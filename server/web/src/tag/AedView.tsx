import { useEffect, useState } from 'react';
import { Notice } from '../components/common';
import { Icon } from '../components/Icon';
import { errorMessage } from '../lib/format';
import { directionsUrl, formatDistance, getPosition } from '../lib/geo';
import { DEMO_POSITION } from '../lib/mock-api';
import type { Aed, LatLng } from '../lib/types';
import { AedMap } from './AedMap';
import { api, isDemo, POSITION_TIMEOUT_MS } from './context';
import { Topbar } from './Topbar';

const AED_NEAR_LIMIT = 3;
const AED_ALL_LIMIT = 20;

type AedMode = 'near' | 'all';
type AedState =
  | { kind: 'locating' }
  | { kind: 'noPosition'; isDenied: boolean }
  | { kind: 'ready'; aeds: Aed[] }
  | { kind: 'error'; message: string };

/**
 * 주변 AED (WEB-06). 화면에 들어올 때마다 목록을 새로 가져오고, 위치는 한 번 얻으면 position 으로 재사용한다.
 */
export function AedView({
  hasBack,
  onBack,
  position,
  onPosition,
}: {
  hasBack: boolean;
  onBack: () => void;
  position?: LatLng;
  onPosition: (position: LatLng) => void;
}) {
  const [mode, setMode] = useState<AedMode>('near');
  const [state, setState] = useState<AedState>({ kind: 'locating' });

  // 위치 확인
  useEffect(() => {
    if (position) return;
    if (isDemo) {
      onPosition(DEMO_POSITION);
      return;
    }
    let isCancelled = false;
    setState({ kind: 'locating' });
    void getPosition(POSITION_TIMEOUT_MS).then((result) => {
      if (isCancelled) return;
      if (result.ok) onPosition(result.position);
      else setState({ kind: 'noPosition', isDenied: result.reason === 'denied' });
    });
    return () => {
      isCancelled = true;
    };
  }, [position]);

  // 목록 (위치·정렬이 바뀌면 다시)
  useEffect(() => {
    if (!position) return;
    let isCancelled = false;
    api
      .getAeds(position, mode === 'near' ? AED_NEAR_LIMIT : AED_ALL_LIMIT)
      .then((aeds) => {
        if (!isCancelled) setState({ kind: 'ready', aeds });
      })
      .catch((error: unknown) => {
        if (!isCancelled) setState({ kind: 'error', message: errorMessage(error) });
      });
    return () => {
      isCancelled = true;
    };
  }, [position, mode]);

  return (
    <section className="view">
      <Topbar title="주변 AED 찾기" onBack={hasBack ? onBack : undefined} />
      <div className="chips" role="tablist" aria-label="정렬">
        {(['near', 'all'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={mode === value ? 'chip is-active' : 'chip'}
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
          >
            {value === 'near' ? (
              <>
                <Icon name="pin" />
                가까운 순
              </>
            ) : (
              '전체 보기'
            )}
          </button>
        ))}
      </div>
      {position && state.kind === 'ready' ? <AedMap center={position} aeds={state.aeds} /> : <div className="aed-map" aria-hidden="true" />}
      <div>
        <AedBody state={state} />
      </div>
    </section>
  );
}

function AedBody({ state }: { state: AedState }) {
  switch (state.kind) {
    case 'locating':
      return <p className="aed-hint">현재 위치를 확인하는 중…</p>;
    case 'noPosition':
      return (
        <Notice kind="warn" icon="warn" title={state.isDenied ? '위치 권한이 필요해요' : '위치를 확인하지 못했어요'}>
          {state.isDenied
            ? '브라우저 설정에서 이 사이트의 위치 권한을 허용한 뒤 다시 열어 주세요.'
            : '잠시 후 다시 시도하거나, 주변 사람에게 AED 위치를 물어보세요.'}
        </Notice>
      );
    case 'error':
      return (
        <Notice kind="error" icon="warn" title="AED 목록을 불러오지 못했어요">
          {state.message}
        </Notice>
      );
    case 'ready':
      if (state.aeds.length === 0) return <p className="aed-hint">주변에 등록된 AED가 없습니다.</p>;
      return (
        <>
          <ul className="aed-list">
            {state.aeds.map((aed, index) => (
              <li className="aed-item" key={`${aed.lat},${aed.lng},${aed.name}`}>
                <a className="aed-link" href={directionsUrl(aed.name, aed)} target="_blank" rel="noopener">
                  <div className="aed-main">
                    <div className="aed-name">
                      <span>
                        <span className="aed-no">{index + 1}</span>
                        {aed.name}
                      </span>
                      <span className="aed-distance">{formatDistance(aed.distanceM)}</span>
                    </div>
                    <div className="aed-place">{aed.place}</div>
                    <div className="aed-address">{aed.address}</div>
                  </div>
                  <Icon name="chevron" className="menu-chevron" />
                </a>
              </li>
            ))}
          </ul>
          <p className="aed-hint">항목을 누르면 지도 앱에서 길찾기가 열립니다.</p>
        </>
      );
  }
}
