import { ApiRequestError } from './types';

/** API 오류는 서버 메시지, 그 외(네트워크 등)는 기본 안내 */
export function errorMessage(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : '네트워크 연결을 확인한 뒤 다시 시도하세요.';
}

/** 승인 남은 시간 m:ss (시각이 없으면 '-') */
export function remainingText(until: string | undefined, now: number): string {
  const ms = until ? Date.parse(until) - now : NaN;
  if (Number.isNaN(ms)) return '-';
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** 공개 시간 선택지 표시: 30 → '30분', 120 → '2시간' */
export function durationLabel(minutes: number): string {
  return minutes >= 60 ? `${minutes / 60}시간` : `${minutes}분`;
}

export function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

/** 신고 시각: '오후 3:12 (5분 전)', 다른 날이면 앞에 '11/16 ' */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  const minutesAgo = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  const ago = minutesAgo < 1 ? '방금' : minutesAgo < 60 ? `${minutesAgo}분 전` : `${Math.floor(minutesAgo / 60)}시간 전`;
  const sameDay = date.toDateString() === now.toDateString();
  const day = sameDay ? '' : `${date.getMonth() + 1}/${date.getDate()} `;
  return `${day}${time} (${ago})`;
}

/** '2003-05-14' → '2003. 05. 14. (23세)' */
export function formatBirthDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return `${y}. ${String(m).padStart(2, '0')}. ${String(d).padStart(2, '0')}. (${age}세)`;
}
