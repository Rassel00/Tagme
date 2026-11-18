import { useState } from 'react';
import { Btn119, Hero, Notice, Sheet } from '../components/common';
import { Icon } from '../components/Icon';
import { errorMessage } from '../lib/format';
import type { CreateAlertResult, LatLng, PersonType, ProfileValues } from '../lib/types';
import { currentPositionForAlert } from './context';
import { PERSON_TYPE_SCREENS, topRows } from './person-types';

/** 보호자 문자가 너무 길어지지 않게 (서버 LIMITS.rescuerMemoMaxLength 와 같은 값) */
const MEMO_MAX_LENGTH = 100;

type ContactResult = { kind: 'success' | 'error'; title: string; description: string };

/**
 * 메인 (WEB-01) + 비상연락망 연락 (WEB-02).
 * tag 가 없으면 기본 페이지: 119 신고와 주변 AED 찾기만 활성화한다 (태그 없이 열었거나 비활성 태그).
 */
export function MainView({
  tag,
  guardianRespondingAt = null,
}: {
  /** 보호자가 대응 중이라고 알린 시각 (11/18) */
  guardianRespondingAt?: string | null;
  tag?: {
    contactCount: number;
    onContact: (position: LatLng | null, memo: string) => Promise<CreateAlertResult>;
    /** 대상자 유형 (11/18): 제목·설명과 상단 정보 카드 항목이 달라진다 */
    personType: PersonType;
    /** 지금 볼 수 있는 값 (공개 + 승인으로 열린 값) */
    values: ProfileValues;
    /** 보험 정보가 있으면(공개·비공개 무관) "보험 정보" 버튼 */
    hasInsurance: boolean;
  };
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [memo, setMemo] = useState('');
  /** 보내는 중 버튼에 보일 진행 문구 */
  const [progress, setProgress] = useState<string>();
  const [result, setResult] = useState<ContactResult>();

  const isBasic = !tag;
  const contactCount = tag?.contactCount ?? 0;
  const hasContacts = contactCount > 0;
  const isContactDisabled = isBasic || !hasContacts || progress !== undefined;
  const contactLabel = progress ?? (isBasic || hasContacts ? '비상연락망에 연락하기' : '등록된 비상연락처가 없습니다');

  async function sendContact(): Promise<void> {
    if (!tag) return;
    setResult(undefined);
    try {
      setProgress('위치 확인 중…');
      const position = await currentPositionForAlert();
      setProgress('보호자에게 알리는 중…');
      const sent = await tag.onContact(position, memo.trim());
      setMemo('');

      let title: string;
      if (!sent.isMerged) title = `비상연락처 ${sent.notifiedCount}명에게 발송됨`;
      else if (sent.notifiedCount > 0) title = `비상연락처 ${sent.notifiedCount}명에게 다시 알렸습니다`;
      else title = '이미 비상연락처에 알림이 전송되었습니다';
      setResult({
        kind: 'success',
        title,
        description: '비상연락처가 위치를 확인하고 연락할 수 있습니다. 위급하면 119에 먼저 신고하세요.',
      });
    } catch (error) {
      setResult({ kind: 'error', title: '알림을 보내지 못했습니다', description: errorMessage(error) });
    } finally {
      setProgress(undefined);
    }
  }

  const screen = PERSON_TYPE_SCREENS[tag?.personType ?? 'general'];
  const rows = tag ? topRows(tag.personType, tag.values) : [];
  const careTips = tag?.personType === 'disabled' ? tag.values.careTips : undefined;

  return (
    <section className="view">
      <Hero
        title={screen.title}
        description={
          isBasic ? (
            <>
              위급하면 119에 먼저 신고하세요.
              <br />
              주변 AED 위치를 찾을 수 있습니다.
            </>
          ) : (
            screen.description.split('\n').flatMap((line, i) => (i === 0 ? [line] : [<br key={i} />, line]))
          )
        }
      />

      {/* 유형별로 보호자가 공개한 정보를 버튼보다 먼저 (사업계획서 19장) */}
      {careTips && (
        <div className="care-tips">
          <strong>이렇게 대해 주세요</strong>
          <p>{careTips}</p>
        </div>
      )}
      {rows.length > 0 && (
        <dl className="card top-info">
          {rows.map(([label, value]) => (
            <div className="top-info-row" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <Btn119 />

      <nav className="menu" aria-label="응급 지원 메뉴">
        <button
          type="button"
          className="menu-item"
          aria-disabled={isContactDisabled || undefined}
          onClick={() => {
            if (!isContactDisabled) setIsDialogOpen(true);
          }}
        >
          <Icon name="phone" className="menu-icon" />
          <span className="menu-label">{contactLabel}</span>
          <Icon name="chevron" className="menu-chevron" />
        </button>
        {isBasic ? (
          <button type="button" className="menu-item" aria-disabled="true">
            <Icon name="heart" className="menu-icon" />
            <span className="menu-label">사용자 응급정보 확인</span>
            <Icon name="chevron" className="menu-chevron" />
          </button>
        ) : (
          <a className="menu-item" href="#info">
            <Icon name="heart" className="menu-icon" />
            <span className="menu-label">사용자 응급정보 확인</span>
            <Icon name="chevron" className="menu-chevron" />
          </a>
        )}
        {tag?.hasInsurance && (
          <a className="menu-item" href="#insurance">
            <Icon name="shield" className="menu-icon" />
            <span className="menu-label">보험 정보</span>
            <Icon name="chevron" className="menu-chevron" />
          </a>
        )}
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
      {guardianRespondingAt && (
        <Notice icon="check" title="보호자가 확인하고 대응 중이에요">
          곧 보호자에게서 연락이 올 수 있어요. 위급하면 119에 먼저 신고하세요.
        </Notice>
      )}

      <p className="footnote">
        <Icon name="warn" />
        {isBasic
          ? '응급정보 확인과 비상연락망 연락은 등록된 응급 태그를 대면 사용할 수 있습니다.'
          : '해당 정보는 응급상황 대응을 위한 최소한의 정보만 제공됩니다.'}
      </p>

      {tag && (
        <Sheet
          isOpen={isDialogOpen}
          onClose={(value) => {
            setIsDialogOpen(false);
            if (value === 'confirm') void sendContact();
          }}
          icon="phone"
          title="비상연락망에 알릴까요?"
          description={`비상연락처 ${contactCount}명에게 현재 위치와 함께 문자로 알립니다. 연락처 번호는 화면에 표시되지 않습니다.`}
          confirmLabel="알리기"
        >
          <label className="sheet-field">
            <span>신고자 메모 (선택)</span>
            <textarea
              name="memo"
              rows={3}
              maxLength={MEMO_MAX_LENGTH}
              placeholder="신고자 연락처, 현재 상황 등 (예: 010-1234-5678, 길에서 쓰러져 의식 없음)"
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
            />
            <small>남긴 메모는 보호자 문자에 함께 전달됩니다.</small>
          </label>
        </Sheet>
      )}
    </section>
  );
}
