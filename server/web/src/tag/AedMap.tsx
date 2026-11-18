import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getKakaoJsKey } from '../lib/api';
import { loadKakaoMaps, renderKakaoAedMap } from '../lib/kakao-map';
import type { Aed, LatLng } from '../lib/types';

/**
 * 카카오맵으로 그리고, 키가 없거나 불러오지 못하면 약식 지도로.
 * 카카오 SDK 는 컨테이너 안을 직접 바꾸므로, 카카오 모드의 div 에는 React 자식을 두지 않고 key 로 따로 마운트한다.
 */
export function AedMap({ center, aeds }: { center: LatLng; aeds: Aed[] }) {
  // undefined: 확인 중, null: 약식 지도
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [kakaoMaps, setKakaoMaps] = useState<any>();
  const kakaoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isCancelled = false;
    void (async () => {
      const key = await getKakaoJsKey();
      if (!key) {
        if (!isCancelled) setKakaoMaps(null);
        return;
      }
      try {
        const maps = await loadKakaoMaps(key);
        if (!isCancelled) setKakaoMaps(maps);
      } catch (error) {
        console.warn('[aed] 카카오맵 대신 약식 지도를 표시합니다.', error);
        if (!isCancelled) setKakaoMaps(null);
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, []);

  const isKakao = Boolean(kakaoMaps) && aeds.length > 0;

  useLayoutEffect(() => {
    if (isKakao && kakaoRef.current) renderKakaoAedMap(kakaoMaps, kakaoRef.current, center, aeds);
  }, [isKakao, kakaoMaps, center, aeds]);

  if (isKakao) return <div key="kakao" className="aed-map aed-map--kakao" aria-hidden="true" ref={kakaoRef} />;
  return (
    <div key="simple" className="aed-map" aria-hidden="true">
      {kakaoMaps === null && <SimpleAedMap center={center} aeds={aeds} />}
    </div>
  );
}

const W = 360;
const H = 220;
const PAD = 30;
const ROADS = [
  'M0 60 C 90 50, 200 90, 360 70',
  'M0 170 C 120 160, 240 190, 360 150',
  'M80 0 C 95 80, 70 150, 100 220',
  'M260 0 C 245 70, 280 150, 250 220',
];
const BLOCKS = [
  [20, 80, 50, 70], [120, 95, 110, 60], [280, 90, 60, 50], [115, 10, 120, 35], [290, 180, 60, 35], [10, 185, 60, 30],
] as const;

/** 지도 API 없이 현재 위치와 AED 의 상대 위치를 보여주는 약식 지도 */
function SimpleAedMap({ center, aeds }: { center: LatLng; aeds: Aed[] }) {
  if (aeds.length === 0) return null;
  // 경도 1도의 거리는 위도에 따라 줄어들므로 보정
  const kx = Math.cos((center.lat * Math.PI) / 180);
  const points = aeds.map((a) => ({ x: (a.lng - center.lng) * kx, y: -(a.lat - center.lat) }));
  const span = Math.max(...points.map((p) => Math.max(Math.abs(p.x) / (W / 2 - PAD), Math.abs(p.y) / (H / 2 - PAD))), 1e-6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img">
      {BLOCKS.map(([x, y, w, h]) => (
        <rect key={`${x},${y}`} x={x} y={y} width={w} height={h} rx={6} fill="#e3e7df" />
      ))}
      {ROADS.map((d) => (
        <path key={d} d={d} fill="none" stroke="#ffffff" strokeWidth={10} strokeLinecap="round" />
      ))}
      <circle cx={W / 2} cy={H / 2} r={34} fill="rgba(47,124,246,0.15)" stroke="rgba(47,124,246,0.35)" />
      <circle cx={W / 2} cy={H / 2} r={8} fill="#2f7cf6" stroke="#fff" strokeWidth={3} />
      {points.map((p, index) => {
        const x = W / 2 + p.x / span;
        const y = H / 2 + p.y / span;
        return (
          <g key={index} transform={`translate(${x - 13} ${y - 13})`}>
            <circle cx={13} cy={13} r={14} fill="#fff" />
            <svg width={26} height={26} viewBox="0 0 24 24" color="#e5484d">
              <use href="#i-aed" />
            </svg>
          </g>
        );
      })}
    </svg>
  );
}
