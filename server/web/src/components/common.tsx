import { useEffect, useRef, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** 큰 119 신고 버튼 */
export function Btn119() {
  return (
    <a className="btn-119" href="tel:119">
      <Icon name="phone" className="btn-119-icon" />
      <span>
        <strong>119에 신고하기</strong>
        <small>(응급상황 발생 시)</small>
      </span>
    </a>
  );
}

/** 하트 + 맥박 로고가 있는 머리말 */
export function Hero({
  title,
  description,
  isMuted = false,
  isCompact = false,
}: {
  title: ReactNode;
  description: ReactNode;
  isMuted?: boolean;
  isCompact?: boolean;
}) {
  return (
    <header className={isCompact ? 'hero hero--compact' : 'hero'}>
      <div className={isMuted ? 'hero-logo hero-logo--muted' : 'hero-logo'} aria-hidden="true">
        <svg><use href="#i-heart" /></svg>
        <svg className="hero-pulse"><use href="#i-pulse" /></svg>
      </div>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

/** 오류 화면 (없는 태그, 만료된 링크 등) */
export function ErrorView({ title, description, hasCall119 }: { title: string; description: string; hasCall119: boolean }) {
  return (
    <section className="view">
      <Hero title={title} description={description} isMuted />
      {hasCall119 && <Btn119 />}
    </section>
  );
}

export function Loading() {
  return (
    <div className="loading" role="status">
      불러오는 중…
    </div>
  );
}

/** 아이콘 + 굵은 제목 + 설명 안내 상자 */
export function Notice({
  kind,
  icon,
  title,
  children,
}: {
  kind?: 'error' | 'warn' | 'info';
  icon: IconName;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className={kind ? `notice notice--${kind}` : 'notice'}>
      <Icon name={icon} />
      <div>
        {title && <strong>{title}</strong>}
        {children}
      </div>
    </div>
  );
}

/**
 * 확인 시트 (<dialog>). isOpen 이 true 가 되면 showModal(), 닫히면 눌린 버튼 값('confirm' | 'cancel' | '')으로 onClose.
 * ESC·바깥 닫기도 'close' 이벤트로 들어와 isOpen 이 실제 상태와 어긋나지 않는다.
 */
export function Sheet({
  isOpen,
  onClose,
  icon,
  isGreen = false,
  title,
  description,
  confirmLabel,
}: {
  isOpen: boolean;
  onClose: (returnValue: string) => void;
  icon: IconName;
  isGreen?: boolean;
  title: string;
  description: string;
  confirmLabel: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.returnValue = '';
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => onCloseRef.current(dialog.returnValue);
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, []);

  return (
    <dialog className="sheet" ref={ref} aria-labelledby="sheet-title">
      <form method="dialog">
        <div className={isGreen ? 'sheet-icon sheet-icon--green' : 'sheet-icon'} aria-hidden="true">
          <svg><use href={`#i-${icon}`} /></svg>
        </div>
        <h2 id="sheet-title">{title}</h2>
        <p>{description}</p>
        <div className="sheet-actions">
          <button className="btn btn-ghost" value="cancel">취소</button>
          <button className="btn btn-primary" value="confirm">{confirmLabel}</button>
        </div>
      </form>
    </dialog>
  );
}
