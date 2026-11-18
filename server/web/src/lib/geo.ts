import type { LatLng } from './types';

export type PositionResult =
  | { ok: true; position: LatLng }
  | { ok: false; reason: 'denied' | 'unavailable' };

/** 권한 팝업에서 허용을 누를 때까지 기다리는 최대 시간 */
const PERMISSION_PROMPT_MAX_MS = 30_000;
/** 이 정도로 정확하면 더 기다리지 않는다 (m) */
const GOOD_ACCURACY_M = 50;

/**
 * 현재 위치. 못 얻으면 실패로 돌려준다 (신고는 위치 없이도 진행).
 * GPS 는 HTTPS(또는 localhost)에서만 동작한다.
 *
 * (11/18 수정) 예전에는 5초 타이머가 권한 팝업이 떠 있는 동안에도 흘러서, 처음 신고할 때 "허용"을 누르는 사이
 * 시간이 다 돼 위치 없이 문자가 갔다. 이제는
 * - 권한을 아직 묻지 않은 상태면 허용될 때까지(최대 30초) 기다린 뒤 timeoutMs 를 센다
 * - watchPosition 으로 들어오는 위치 중 가장 정확한 것을 쓴다 (휴대폰은 보통 기지국·와이파이 위치가 먼저, GPS 가 나중)
 *   50m 이내면 바로, 아니면 timeoutMs 가 지날 때 그때까지 받은 가장 좋은 위치로 끝낸다
 */
export function getPosition(timeoutMs: number): Promise<PositionResult> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ ok: false, reason: 'unavailable' });
      return;
    }
    let settled = false;
    let best: GeolocationPosition | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let permission: PermissionStatus | undefined;

    const finish = (result: PositionResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      navigator.geolocation.clearWatch(watchId);
      if (permission) permission.onchange = null;
      resolve(result);
    };
    const finishWithBest = (): void => {
      finish(best ? { ok: true, position: { lat: best.coords.latitude, lng: best.coords.longitude } } : { ok: false, reason: 'unavailable' });
    };
    const startTimer = (ms: number): void => {
      clearTimeout(timer);
      timer = setTimeout(finishWithBest, ms);
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        if (pos.coords.accuracy <= GOOD_ACCURACY_M) finishWithBest();
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) finish({ ok: false, reason: 'denied' });
        // 일시적인 실패(신호 없음 등)는 타이머가 끝날 때까지 다음 위치를 기다린다
      },
      { enableHighAccuracy: true, maximumAge: 30_000 },
    );

    // 권한을 아직 묻는 중이면 허용될 때부터 timeoutMs 를 센다. Permissions API 가 없으면 넉넉히 기다린다
    startTimer(timeoutMs);
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((status) => {
        if (settled || status.state !== 'prompt') return;
        permission = status;
        startTimer(PERMISSION_PROMPT_MAX_MS);
        status.onchange = () => {
          if (status.state === 'granted') startTimer(timeoutMs);
          else if (status.state === 'denied') finish({ ok: false, reason: 'denied' });
        };
      })
      .catch(() => {
        if (!settled) startTimer(timeoutMs * 2);
      });
  });
}

/** 두 좌표 사이 거리(m), 하버사인 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** 카카오맵 길찾기 (앱이 있으면 앱, 없으면 웹) */
export function directionsUrl(name: string, position: LatLng): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${position.lat},${position.lng}`;
}
