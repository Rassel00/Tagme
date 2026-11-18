/**
 * 카카오맵 JavaScript SDK 로 주변 AED 지도 표시.
 * SDK 는 AED 화면을 열 때만 불러온다 (응급 페이지 첫 화면을 느리게 하지 않도록).
 * 키가 없거나 불러오지 못하면 호출한 쪽에서 약식 지도로 대신한다.
 */
import { directionsUrl, formatDistance } from './geo';
import type { Aed, LatLng } from './types';

const SDK_TIMEOUT_MS = 8000;

// SDK 전역 객체 (타입 정의 패키지를 쓰지 않으려고 필요한 부분만 any 로 다룬다)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KakaoMaps = any;

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

/** SDK 오버레이에 넘길 DOM 요소 생성. 문자열은 textContent 로만 넣는다 */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

let sdkPromise: Promise<KakaoMaps> | undefined;

/** SDK 를 한 번만 불러온다. 실패하면 다음 호출 때 다시 시도할 수 있게 초기화 */
export function loadKakaoMaps(appKey: string): Promise<KakaoMaps> {
  sdkPromise ??= new Promise<KakaoMaps>((resolve, reject) => {
    if (window.kakao?.maps?.LatLng) {
      resolve(window.kakao.maps);
      return;
    }
    const timer = setTimeout(() => reject(new Error('카카오맵 로딩 시간 초과')), SDK_TIMEOUT_MS);
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.async = true;
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error('카카오맵 스크립트를 불러오지 못했습니다.'));
    };
    script.onload = () => {
      const maps = window.kakao?.maps;
      if (!maps) {
        clearTimeout(timer);
        reject(new Error('카카오맵을 초기화하지 못했습니다.'));
        return;
      }
      maps.load(() => {
        clearTimeout(timer);
        resolve(maps);
      });
    };
    document.head.append(script);
  }).catch((error: unknown) => {
    sdkPromise = undefined;
    throw error;
  });
  return sdkPromise;
}

/**
 * 컨테이너에 지도를 그린다: 내 위치(파란 점) + AED 마커(누르면 이름·거리, 길찾기 링크).
 * 지도가 모든 지점을 담도록 범위를 맞춘다.
 */
export function renderKakaoAedMap(maps: KakaoMaps, container: HTMLElement, center: LatLng, aeds: Aed[]): void {
  const mapEl = el('div', { class: 'kakao-map', role: 'application', 'aria-label': '주변 AED 지도' });
  container.replaceChildren(mapEl);
  container.classList.add('aed-map--kakao');

  const centerPos = new maps.LatLng(center.lat, center.lng);
  const map = new maps.Map(mapEl, { center: centerPos, level: 4 });
  map.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);

  new maps.CustomOverlay({
    map,
    position: centerPos,
    content: '<div class="kakao-me" title="현재 위치"></div>',
    zIndex: 3,
  });

  const bounds = new maps.LatLngBounds();
  bounds.extend(centerPos);

  let openInfo: KakaoMaps | undefined;
  aeds.forEach((aed, index) => {
    const position = new maps.LatLng(aed.lat, aed.lng);
    bounds.extend(position);

    const pin = el('button', { type: 'button', class: 'kakao-pin', 'aria-label': `${aed.name} ${formatDistance(aed.distanceM)}` }, String(index + 1));
    const info = new maps.CustomOverlay({
      position,
      yAnchor: 1.45,
      zIndex: 5,
      content: el(
        'a',
        { class: 'kakao-info', href: directionsUrl(aed.name, aed), target: '_blank', rel: 'noopener' },
        el('strong', {}, aed.name),
        el('span', {}, `${formatDistance(aed.distanceM)} · 길찾기`),
      ),
    });
    pin.addEventListener('click', () => {
      openInfo?.setMap(null);
      info.setMap(map);
      openInfo = info;
    });
    new maps.CustomOverlay({ map, position, content: pin, yAnchor: 1, zIndex: 4 });
  });

  if (aeds.length > 0) map.setBounds(bounds, 40, 40, 40, 40);
}
