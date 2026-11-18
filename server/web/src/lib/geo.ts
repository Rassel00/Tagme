import type { LatLng } from './types';

export type PositionResult =
  | { ok: true; position: LatLng }
  | { ok: false; reason: 'denied' | 'unavailable' };

/**
 * 현재 위치. timeoutMs 안에 못 얻으면 실패로 돌려준다 (신고는 위치 없이도 진행).
 * GPS 는 HTTPS(또는 localhost)에서만 동작한다.
 */
export function getPosition(timeoutMs: number): Promise<PositionResult> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ ok: false, reason: 'unavailable' });
      return;
    }
    let settled = false;
    const finish = (result: PositionResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    // 브라우저 timeout 은 권한 팝업 대기 시간을 포함하지 않아 별도 타이머를 둔다
    const timer = setTimeout(() => finish({ ok: false, reason: 'unavailable' }), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => finish({ ok: true, position: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      (error) => finish({ ok: false, reason: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
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
