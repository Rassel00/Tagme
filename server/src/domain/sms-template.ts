/** 보호자 문자 템플릿 (개발 문서 7.3) */
import { ANONYMOUS_DISPLAY_NAME } from './constants.js';

export interface GuardianSmsInput {
  /** 이름은 공개 항목이 아니어도 보호자에게는 표시한다 */
  userName: string;
  message: string;
  lat: number | null;
  lng: number | null;
  rescuerPhone: string | null;
  isRescuerVerified: boolean;
  /** 신고자가 확인 팝업에 남긴 메모 (연락처·상황 등) */
  rescuerMemo: string | null;
  hasRequestedAccess: boolean;
  approveUrl: string;
}

/** 01012345678 → 010-1234-5678 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

/** 단축 URL 은 스팸 필터에 걸릴 수 있어 원본 지도 링크를 쓴다. 한글 없는 ASCII URL. */
export function mapUrl(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export interface InviteSmsInput {
  userName: string;
  inviteUrl: string;
}

/** 비상연락처 수락 안내 (11/18). 수락해야 신고 알림을 받는다 */
export function renderInviteSms(input: InviteSmsInput): string {
  const name = input.userName.trim() || ANONYMOUS_DISPLAY_NAME;
  return [
    `[응급안심] ${name}님의 응급 태그 비상연락처로 회원님 번호가 등록되었습니다.`,
    '수락하면 응급 상황에 위치와 상황 확인 링크를 문자로 받습니다.',
    '수락·거절:',
    input.inviteUrl,
  ].join('\n');
}

export function renderGuardianSms(input: GuardianSmsInput): string {
  const name = input.userName.trim() || ANONYMOUS_DISPLAY_NAME;
  const location = input.lat !== null && input.lng !== null ? mapUrl(input.lat, input.lng) : '위치 정보 없음';
  const lines = [`[응급안심] ${name}님 응급 태그가 스캔되었습니다.`];
  if (input.message.trim()) lines.push(input.message.trim());
  if (input.hasRequestedAccess) lines.push('신고자가 응급정보 열람을 요청했습니다.');
  if (input.rescuerMemo?.trim()) lines.push(`신고자 메모: ${input.rescuerMemo.trim()}`);
  lines.push(`위치: ${location}`);
  // 신고자 번호는 문자 본인 확인 등으로 있을 때만 (없으면 줄을 빼서 문자를 짧게)
  if (input.rescuerPhone) {
    lines.push(`신고자: ${formatPhone(input.rescuerPhone)} (${input.isRescuerVerified ? '인증됨' : '미인증'})`);
  }
  lines.push('상황 확인·응급정보 열람 승인:', input.approveUrl);
  return lines.join('\n');
}
