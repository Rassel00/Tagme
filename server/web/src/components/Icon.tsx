/** 아이콘 심볼 정의. 페이지 최상단에 한 번 렌더링하고 <Icon name="..."/> 로 참조한다. */
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <symbol id="i-phone" viewBox="0 0 24 24"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" /></symbol>
        <symbol id="i-heart" viewBox="0 0 24 24"><path fill="currentColor" d="M12 21.4 10.6 20C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1A6 6 0 0 1 16.5 3C19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.5z" /></symbol>
        <symbol id="i-aed" viewBox="0 0 24 24"><path fill="currentColor" d="M12 21.4 10.6 20C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1A6 6 0 0 1 16.5 3C19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.5z" /><path fill="#fff" d="M12.9 6.5 9 12.6h2.6l-.9 4.9 4.3-6.6h-2.7z" /></symbol>
        <symbol id="i-pulse" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2-4 3 8 2-5 1.5 1H21" /></symbol>
        <symbol id="i-chevron" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" /></symbol>
        <symbol id="i-back" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M20 12H5m6-6-6 6 6 6" /></symbol>
        <symbol id="i-user" viewBox="0 0 24 24"><path fill="currentColor" d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4.4 0-8 2.2-8 5v1.5c0 .3.2.5.5.5h15c.3 0 .5-.2.5-.5V19c0-2.8-3.6-5-8-5z" /></symbol>
        <symbol id="i-warn" viewBox="0 0 24 24"><path fill="currentColor" d="M10.3 3.9a2 2 0 0 1 3.4 0l8.2 14.2A2 2 0 0 1 20.2 21H3.8a2 2 0 0 1-1.7-2.9zM11 9v5h2V9zm0 7v2h2v-2z" /></symbol>
        <symbol id="i-lock" viewBox="0 0 24 24"><path fill="currentColor" d="M17 9V7A5 5 0 0 0 7 7v2a2 2 0 0 0-2 2v9c0 1.1.9 2 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM9 7a3 3 0 0 1 6 0v2H9zm4 9.7V18h-2v-1.3a2 2 0 1 1 2 0z" /></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 4.5 4.5L19 7.5" /></symbol>
        <symbol id="i-pin" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" /></symbol>
        <symbol id="i-clock" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M12 7v5l3 2" /><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /></symbol>
      </defs>
    </svg>
  );
}

export type IconName =
  | 'phone' | 'heart' | 'aed' | 'pulse' | 'chevron' | 'back' | 'user' | 'warn' | 'lock' | 'check' | 'pin' | 'clock';

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}
