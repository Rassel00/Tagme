import { useState, type ReactNode } from 'react';
import { Btn119, Hero, Notice, Sheet } from '../components/common';
import { Icon } from '../components/Icon';
import { errorMessage } from '../lib/format';
import type { CreateAlertResult, LatLng } from '../lib/types';
import { currentPositionForAlert } from './context';

type ContactResult = { kind: 'success' | 'error'; title: string; description: string };

/** 메인 (WEB-01) + 비상연락망 연락 (WEB-02) */
export function MainView({
  contactCount,
  onContact,
  rescuerCard,
}: {
  contactCount: number;
  onContact: (position: LatLng | null) => Promise<CreateAlertResult>;
  /** 신고가 생긴 뒤 보이는 신고자 연락처 카드 (WEB-05) */
  rescuerCard?: ReactNode;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  /** 보내는 중 버튼에 보일 진행 문구 */
  const [progress, setProgress] = useState<string>();
  const [result, setResult] = useState<ContactResult>();

  const hasContacts = contactCount > 0;
  const isDisabled = !hasContacts || progress !== undefined;
  const label = progress ?? (hasContacts ? '비상연락망에 연락하기' : '등록된 비상연락처가 없습니다');

  async function sendContact(): Promise<void> {
    setResult(undefined);
    try {
      setProgress('위치 확인 중…');
      const position = await currentPositionForAlert();
      setProgress('보호자에게 알리는 중…');
      const sent = await onContact(position);

      let title: string;
      if (!sent.isMerged) title = `보호자 ${sent.notifiedCount}명에게 발송됨`;
      else if (sent.notifiedCount > 0) title = `보호자 ${sent.notifiedCount}명에게 다시 알렸습니다`;
      else title = '이미 보호자에게 알림이 전송되었습니다';
      setResult({
        kind: 'success',
        title,
        description: '보호자가 위치를 확인하고 연락할 수 있습니다. 위급하면 119에 먼저 신고하세요.',
      });
    } catch (error) {
      setResult({ kind: 'error', title: '알림을 보내지 못했습니다', description: errorMessage(error) });
    } finally {
      setProgress(undefined);
    }
  }

  return (
    <section className="view">
      <Hero
        title="응급 지원 페이지"
        description={
          <>
            이 사용자의 응급정보와
            <br />
            도움이 필요한 상황을 확인할 수 있습니다.
          </>
        }
      />

      <Btn119 />

      <nav className="menu" aria-label="응급 지원 메뉴">
        <button
          type="button"
          className="menu-item"
          aria-disabled={isDisabled || undefined}
          onClick={() => {
            if (!isDisabled) setIsDialogOpen(true);
          }}
        >
          <Icon name="phone" className="menu-icon" />
          <span className="menu-label">{label}</span>
          <Icon name="chevron" className="menu-chevron" />
        </button>
        <a className="menu-item" href="#info">
          <Icon name="heart" className="menu-icon" />
          <span className="menu-label">사용자 응급정보 확인</span>
          <Icon name="chevron" className="menu-chevron" />
        </a>
        <a className="menu-item" href="#aed">
          <Icon name="aed" className="menu-icon" />
          <span className="menu-label">주변 AED 찾기</span>
          <Icon name="chevron" className="menu-chevron" />
        </a>
      </nav>

      {result && (
        <Notice kind={result.kind === 'error' ? 'error' : undefined} icon={result.kind === 'success' ? 'check' : 'warn'} title={result.title}>
          {result.description}
        </Notice>
      )}

      {rescuerCard}

      <p className="footnote">
        <Icon name="warn" />
        해당 정보는 응급상황 대응을 위한 최소한의 정보만 제공됩니다.
      </p>

      <Sheet
        isOpen={isDialogOpen}
        onClose={(value) => {
          setIsDialogOpen(false);
          if (value === 'confirm') void sendContact();
        }}
        icon="phone"
        title="비상연락망에 알릴까요?"
        description={`보호자 ${contactCount}명에게 현재 위치와 함께 문자로 알립니다. 보호자 번호는 화면에 표시되지 않습니다.`}
        confirmLabel="알리기"
      />
    </section>
  );
}
