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
  /** 보호자만 승인 링크를 받는다. null 이면 위치 알림만 (보호자가 아닌 연락처) */
  approveUrl: string | null;
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
  /** 보호자로 등록됐으면 승인 권한도 안내 */
  isGuardian: boolean;
}

/**
 * 문자 구역을 빈 줄로 나눈다 (11/18 가독성). 구역 안의 줄은 줄바꿈 하나, 링크는 제목 다음 줄에 따로 둬서
 * 휴대폰 화면에서 문장과 링크가 섞여 접히지 않게 한다.
 */
function joinBlocks(blocks: (string | false | null | undefined)[]): string {
  return blocks.filter((b): b is string => Boolean(b)).join('\n\n');
}

/** 비상연락처 수락 안내 (11/18). 수락해야 신고 알림을 받는다 */
export function renderInviteSms(input: InviteSmsInput): string {
  const name = input.userName.trim() || ANONYMOUS_DISPLAY_NAME;
  return joinBlocks([
    `[응급안심] ${name}님의 응급 태그 ${input.isGuardian ? '보호자' : '비상연락처'}로 회원님 번호가 등록되었습니다.`,
    input.isGuardian
      ? '수락하면 응급 상황에 위치와 상황 확인 링크를 받고, 응급정보 공개를 승인할 수 있습니다.'
      : '수락하면 응급 상황에 위치 알림 문자를 받습니다.',
    `수락·거절:\n${input.inviteUrl}`,
  ]);
}

export function renderGuardianSms(input: GuardianSmsInput): string {
  const name = input.userName.trim() || ANONYMOUS_DISPLAY_NAME;
  const location = input.lat !== null && input.lng !== null ? mapUrl(input.lat, input.lng) : '위치 정보 없음';
  const memo = input.rescuerMemo?.trim();
  return joinBlocks([
    `[응급안심] ${name}님 응급 태그가 스캔되었습니다.`,
    input.message.trim(),
    input.hasRequestedAccess && input.approveUrl && '신고자가 응급정보 열람을 요청했습니다.',
    memo && `신고자 메모: ${memo}`,
    `위치:\n${location}`,
    // 신고자 번호는 문자 본인 확인 등으로 있을 때만 (없으면 구역을 빼서 문자를 짧게)
    input.rescuerPhone && `신고자: ${formatPhone(input.rescuerPhone)} (${input.isRescuerVerified ? '인증됨' : '미인증'})`,
    input.approveUrl ? `상황 확인·응급정보 열람 승인:\n${input.approveUrl}` : '위급하면 119에 먼저 신고해 주세요.',
  ]);
}
