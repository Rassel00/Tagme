/**
 * 비상연락처 수락 웹 /c/{inviteToken} (11/18)
 * 안내 문자 속 링크로 열려, 이 태그의 비상연락처가 될지 수락·거절한다. 수락한 연락처에게만 신고 알림이 간다.
 */
import { useEffect, useState } from 'react';
import { ErrorView, Hero, Loading, Notice } from '../components/common';
import { Icon, IconSprite } from '../components/Icon';
import { errorMessage } from '../lib/format';
import { createInviteApi, type InviteView } from '../lib/invite-api';
import { ApiRequestError } from '../lib/types';

const token = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] ?? '');
const api = createInviteApi(token);

export function InviteApp() {
  const [view, setView] = useState<InviteView>();
  const [error, setError] = useState<unknown>(token ? undefined : new ApiRequestError(404, 'invite_not_found', ''));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    if (!token) return;
    api.get().then(setView, setError);
  }, []);

  async function decide(decision: 'accept' | 'decline'): Promise<void> {
    setIsSubmitting(true);
    setNotice(undefined);
    try {
      setView(await api.decide(decision));
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 404) setError(e);
      else setNotice(`처리하지 못했습니다. ${errorMessage(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  let content;
  if (error) {
    content = (
      <ErrorView
        title="올바르지 않은 링크입니다"
        description={
          error instanceof ApiRequestError && error.status === 404
            ? '문자로 받은 링크 전체가 열렸는지 확인해 주세요. 등록이 취소되었거나 새 안내 문자가 발송된 경우에도 이전 링크는 쓸 수 없습니다.'
            : errorMessage(error)
        }
        hasCall119={false}
      />
    );
  } else if (!view) {
    content = <Loading />;
  } else {
    content = (
      <section className="view">
        <Hero
          isCompact
          title="비상연락처 등록 요청"
          description={`${view.userName}님의 응급 태그${view.tagLabel ? `(${view.tagLabel})` : ''} 비상연락처로 회원님 번호가 등록되었습니다.`}
        />

        <section className="card invite-card">
          <h2 className="card-title">
            <Icon name="phone" />
            수락하면
          </h2>
          <ul className="invite-points">
            <li>이 태그로 응급 신고가 들어오면 위치와 상황 확인 링크를 문자로 받습니다.</li>
            <li>링크에서 비공개 응급정보(지병·복용약 등)를 신고자에게 보여줄지 결정할 수 있습니다.</li>
            <li>회원님 번호는 신고자 화면에 보이지 않습니다.</li>
          </ul>
        </section>

        {view.status === 'pending' ? (
          <div className="decision-actions">
            <button type="button" className="btn btn-primary btn-block" disabled={isSubmitting} onClick={() => void decide('accept')}>
              {isSubmitting ? '처리 중…' : '수락하기'}
            </button>
            <button type="button" className="btn btn-outline btn-block" disabled={isSubmitting} onClick={() => void decide('decline')}>
              거절하기
            </button>
          </div>
        ) : (
          <>
            {view.status === 'accepted' ? (
              <Notice icon="check" title="수락했습니다">
                이제 이 태그로 응급 신고가 들어오면 문자를 받습니다.
              </Notice>
            ) : (
              <Notice kind="warn" icon="lock" title="거절했습니다">
                이 태그의 신고 알림 문자를 받지 않습니다.
              </Notice>
            )}
            <button
              type="button"
              className="btn btn-outline btn-block invite-change"
              disabled={isSubmitting}
              onClick={() => void decide(view.status === 'accepted' ? 'decline' : 'accept')}
            >
              {view.status === 'accepted' ? '알림 받지 않기로 변경' : '수락으로 변경'}
            </button>
          </>
        )}

        {notice && (
          <Notice kind="error" icon="warn">
            {notice}
          </Notice>
        )}

        <p className="footnote">
          <Icon name="warn" />
          본인이 모르는 등록이라면 거절하세요. 거절하면 이 태그로 신고가 들어와도 문자가 가지 않습니다.
        </p>
      </section>
    );
  }

  return (
    <>
      <IconSprite />
      <main className="page" aria-live="polite">
        {content}
      </main>
    </>
  );
}
