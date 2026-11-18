/**
 * 신고자 본인 확인 문자 링크 (개발 문서 3.4). 문자 앱이 게이트웨이 번호와 'SOS-{신고 코드}' 가 채워진 채로 열린다.
 * iOS 는 본문 구분자로 '&body=', Android 는 '?body=' 를 쓴다.
 */
export function verificationSmsUrl(gatewayPhone: string, code: string): string {
  const body = encodeURIComponent(`SOS-${code}`);
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return `sms:${gatewayPhone}${isIos ? '&' : '?'}body=${body}`;
}

/** 신고자가 입력한 번호를 숫자만 남겨 검사. 서버(phoneSchema)와 같은 규칙 */
export function normalizeRescuerPhone(value: string): string | null {
  const digits = value.replace(/[\s-]/g, '');
  return /^01[016789]\d{7,8}$/.test(digits) ? digits : null;
}
