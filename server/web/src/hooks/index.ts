import { useEffect, useRef, useState } from 'react';

/**
 * callback 을 ms 마다 실행한다. ms 가 null 이면 멈춘다.
 * callback 은 매 렌더의 최신 값을 쓰므로 타이머를 다시 만들지 않는다. 언마운트되면 clearInterval.
 */
export function useInterval(callback: () => void, ms: number | null): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (ms === null) return;
    const timer = setInterval(() => callbackRef.current(), ms);
    return () => clearInterval(timer);
  }, [ms]);
}

/** isActive 동안 1초마다 바뀌는 현재 시각 (남은 시간 표시용) */
export function useNow(isActive: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), isActive ? 1000 : null);
  return isActive ? now : Date.now();
}

/** 화면 이름이 되는 location.hash ('#info' → 'info', 없으면 '') */
function readHash(): string {
  return location.hash.replace('#', '');
}

/**
 * 해시 라우팅. 내부 화면의 뒤로 버튼은 메인에서 들어왔으면 history.back(), 주소로 바로 열었으면 메인으로 간다.
 */
export function useHashRoute(): { route: string; goBack: () => void } {
  const [route, setRoute] = useState(readHash);
  const hasNavigatedInside = useRef(false);

  useEffect(() => {
    const handleChange = () => {
      hasNavigatedInside.current = location.hash !== '';
      setRoute(readHash());
    };
    window.addEventListener('hashchange', handleChange);
    return () => window.removeEventListener('hashchange', handleChange);
  }, []);

  const goBack = () => {
    if (hasNavigatedInside.current) history.back();
    else location.hash = '';
  };

  return { route, goBack };
}
