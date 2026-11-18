import { Icon } from '../components/Icon';

/** 내부 화면 머리글. onBack 이 없으면 뒤로 버튼을 숨긴다 (/aed 단독 페이지) */
export function Topbar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <header className="topbar">
      {onBack && (
        <a
          className="topbar-back"
          href="#"
          aria-label="뒤로"
          onClick={(event) => {
            event.preventDefault();
            onBack();
          }}
        >
          <Icon name="back" />
        </a>
      )}
      <h1>{title}</h1>
    </header>
  );
}
