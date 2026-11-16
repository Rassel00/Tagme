import { createHash, randomBytes, randomInt } from 'node:crypto';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** 문자로 옮겨 적을 때 헷갈리는 0/O, 1/I/L 을 뺀 대문자·숫자 */
const ALERT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const PUBLIC_ID_LENGTH = 24;
export const ALERT_CODE_LENGTH = 6;

/** 암호학적 난수로 alphabet 에서 균등하게 length 글자를 뽑는다. */
export function randomString(alphabet: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[randomInt(alphabet.length)];
  }
  return out;
}

/** 태그 URL 의 tagId. 추측·순회를 막기 위해 base62 24자 (약 143비트). */
export function generatePublicId(): string {
  return randomString(BASE62, PUBLIC_ID_LENGTH);
}

/** 외부에 노출되는 신고 ID (al_ + base62 20자). */
export function generateAlertId(): string {
  return `al_${randomString(BASE62, 20)}`;
}

/** 신고자 본인 확인 문자용 코드 (SOS-{code}). */
export function generateAlertCode(): string {
  return randomString(ALERT_CODE_ALPHABET, ALERT_CODE_LENGTH);
}

/** 세션 토큰·승인 토큰 원문. 256비트, URL·쿠키에 그대로 쓸 수 있는 base64url. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * 토큰은 원문 대신 이 해시만 DB에 저장한다.
 * 토큰 자체가 256비트 난수라 솔트·느린 해시 없이 SHA-256 으로 충분하다.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isValidPublicId(value: string): boolean {
  return value.length === PUBLIC_ID_LENGTH && [...value].every((ch) => BASE62.includes(ch));
}

export function isValidAlertCode(value: string): boolean {
  return value.length === ALERT_CODE_LENGTH && [...value].every((ch) => ALERT_CODE_ALPHABET.includes(ch));
}
