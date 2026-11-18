import { useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { errorMessage, formatPhone } from '../lib/format';
import { normalizeRescuerPhone, verificationSmsUrl } from '../lib/sms';
import type { AlertStatus } from '../lib/types';
import { ApiRequestError } from '../lib/types';

/**
 * 신고자 연락처 (WEB-05, 개발 문서 3.4). 신고가 생긴 뒤에만 보인다.
 * [문자로 본인 확인]은 게이트웨이 번호로 SOS-{코드} 문자를 보내게 하고, 번호 직접 입력은 미인증으로 전달된다.
 */
export function RescuerCard({
  alert,
  gatewayPhone,
  isAwaitingVerification,
  onVerificationStarted,
  onSavePhone,
}: {
  alert: AlertStatus;
  gatewayPhone: string | null;
  isAwaitingVerification: boolean;
  onVerificationStarted: () => void;
  onSavePhone: (phone: string) => Promise<void>;
}) {
  const [input, setInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();

  const phone = alert.rescuerPhone ?? null;
  const isVerified = Boolean(alert.isRescuerVerified && phone);
  const canVerifyBySms = Boolean(gatewayPhone && alert.code);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const normalized = normalizeRescuerPhone(input);
    if (!normalized) {
      setError('휴대폰 번호를 확인해 주세요. 예: 010-1234-5678');
      return;
    }
    setIsSaving(true);
    setError(undefined);
    try {
      await onSavePhone(normalized);
      setInput('');
    } catch (e) {
      // 409: 그사이 문자로 인증됨 → 상위에서 상태를 다시 가져와 인증된 번호를 보여준다
      setError(e instanceof ApiRequestError && e.status === 409 ? undefined : `번호를 저장하지 못했습니다. ${errorMessage(e)}`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="card rescuer" aria-labelledby="rescuer-title">
      <h2 className="card-title" id="rescuer-title">
        <Icon name="user" />내 연락처 남기기 <small>(선택)</small>
      </h2>

      {isVerified ? (
        <p className="rescuer-status rescuer-status--ok">
          <Icon name="check" />
          <span>
            <strong>{formatPhone(phone!)}</strong> 인증됨 · 보호자 화면에 인증된 번호로 표시됩니다.
          </span>
        </p>
      ) : (
        <>
          <p className="rescuer-desc">
            {phone ? (
              <>
                보호자에게 전달한 번호: <strong>{formatPhone(phone)}</strong> (미인증). 문자로 본인 확인하면 &lsquo;인증됨&rsquo;으로 표시됩니다.
              </>
            ) : (
              '보호자가 신고자에게 바로 전화할 수 있도록 번호를 남길 수 있어요. 남긴 번호는 보호자에게 전달됩니다.'
            )}
          </p>

          {canVerifyBySms && (
            <a
              className="btn btn-primary btn-block"
              href={verificationSmsUrl(gatewayPhone!, alert.code!)}
              onClick={onVerificationStarted}
            >
              <Icon name="phone" />
              문자로 본인 확인
            </a>
          )}
          {isAwaitingVerification && (
            <p className="rescuer-waiting" role="status">
              <span className="spinner" aria-hidden="true" />
              <span>
                문자 앱에서 <strong>전송</strong>을 누르면 자동으로 확인됩니다. 문자가 &lsquo;채팅&rsquo;으로 보내지면 SMS로 보내 주세요.
              </span>
            </p>
          )}

          <form className="rescuer-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
            <label className="visually-hidden" htmlFor="rescuer-phone">
              내 휴대폰 번호
            </label>
            <input
              id="rescuer-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder={canVerifyBySms ? '또는 번호 직접 입력' : '010-1234-5678'}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'rescuer-error' : undefined}
            />
            <button type="submit" className="btn btn-outline" disabled={isSaving || !input.trim()}>
              {isSaving ? '저장 중…' : phone ? '번호 변경' : '번호 저장'}
            </button>
          </form>
          {error && (
            <p className="rescuer-error" id="rescuer-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
