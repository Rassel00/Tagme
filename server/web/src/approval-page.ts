/**
 * 보호자 승인 웹 /a/{approveToken} (GRD-01~04)
 * 문자 속 링크로 열려, 신고 상황을 보고 신고자에게 전화하거나 응급정보 공개를 승인·거절한다.
 */
import { createApprovalApi, type ApprovalView } from './approval-api.js';
import { byId, h, icon } from './dom.js';
import { ApiRequestError } from './types.js';

const POLL_INTERVAL_MS = 5000;
const DURATION_OPTIONS = [10, 30, 60, 120];

const token = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] ?? '');
const api = createApprovalApi(token);

const state: {
  view?: ApprovalView;
  durationMinutes: number;
  isSubmitting: boolean;
  notice?: string;
} = { durationMinutes: 30, isSubmitting: false };

// ---------------------------------------------------------------- 형식

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  const minutesAgo = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  const ago = minutesAgo < 1 ? '방금' : minutesAgo < 60 ? `${minutesAgo}분 전` : `${Math.floor(minutesAgo / 60)}시간 전`;
  const sameDay = date.toDateString() === now.toDateString();
  const day = sameDay ? '' : `${date.getMonth() + 1}/${date.getDate()} `;
  return `${day}${time} (${ago})`;
}

function remainingText(until: string | undefined): string {
  const ms = until ? Date.parse(until) - Date.now() : NaN;
  if (Number.isNaN(ms)) return '-';
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function errorMessage(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : '네트워크 연결을 확인한 뒤 다시 시도하세요.';
}

// ---------------------------------------------------------------- 화면

function showView(name: 'main' | 'error'): void {
  byId('view-loading').hidden = true;
  byId('view-main').hidden = name !== 'main';
  byId('view-error').hidden = name !== 'error';
}

function showError(error: unknown): void {
  if (error instanceof ApiRequestError && error.status === 410) {
    byId('error-title').textContent = '링크가 만료되었습니다';
    byId('error-desc').textContent =
      '신고 후 24시간이 지나 이 링크는 더 이상 사용할 수 없습니다. 위급한 상황이면 119에 신고하세요.';
  } else if (error instanceof ApiRequestError && error.status === 404) {
    byId('error-title').textContent = '올바르지 않은 링크입니다';
    byId('error-desc').textContent = '문자로 받은 링크 전체가 열렸는지 확인해 주세요.';
  } else {
    byId('error-title').textContent = '정보를 불러오지 못했습니다';
    byId('error-desc').textContent = errorMessage(error);
  }
  showView('error');
}

function render(): void {
  const view = state.view;
  if (!view) return;
  const { alert } = view;

  byId('title').textContent = `${view.userName}님의 응급 태그가 스캔되었습니다`;
  byId('subtitle').textContent = view.tagLabel
    ? `태그: ${view.tagLabel} · 상황을 확인하고 신고자에게 연락하거나 응급정보 공개를 결정하세요.`
    : '상황을 확인하고 신고자에게 연락하거나 응급정보 공개를 결정하세요.';

  byId('alert-time').textContent = formatTime(alert.createdAt);

  byId('alert-location').replaceChildren(
    alert.location
      ? h('a', { href: alert.location.mapUrl, target: '_blank', rel: 'noopener noreferrer' }, '지도에서 보기')
      : h('span', { class: 'muted' }, '위치 정보 없음'),
  );

  byId('alert-rescuer').replaceChildren(
    ...(alert.rescuerPhone
      ? [
          formatPhone(alert.rescuerPhone),
          h('span', { class: alert.isRescuerVerified ? 'badge badge--ok' : 'badge' }, alert.isRescuerVerified ? '인증됨' : '미인증'),
        ]
      : [h('span', { class: 'muted' }, '미입력')]),
  );

  byId('alert-request').replaceChildren(
    alert.hasRequestedAccess
      ? h('span', { class: 'badge badge--alert' }, '요청됨')
      : h('span', { class: 'muted' }, '요청 없음'),
  );

  const call = byId<HTMLAnchorElement>('btn-call-rescuer');
  call.hidden = !alert.rescuerPhone;
  if (alert.rescuerPhone) {
    call.href = `tel:${alert.rescuerPhone.replace(/\D/g, '')}`;
    call.querySelector('span')!.textContent = '신고자에게 전화하기';
    call.setAttribute('aria-label', `신고자에게 전화하기 ${formatPhone(alert.rescuerPhone)}`);
  }

  renderDecision();
  showView('main');
}

function renderDecision(): void {
  const view = state.view!;
  const { alert } = view;
  const panel = byId('decision');
  const status = alert.accessStatus;
  panel.className = `card decision decision--${status}`;
  const notice = state.notice ? h('div', { class: 'notice notice--info' }, icon('warn'), h('div', {}, state.notice)) : null;

  if (status === 'approved') {
    panel.replaceChildren(
      h('h2', { class: 'access-status', id: 'decision-title' }, icon('check'), '응급정보 공개 중'),
      h(
        'p',
        {},
        '남은 시간 ',
        h('strong', { class: 'timer', id: 'approve-timer' }, remainingText(alert.approvedUntil)),
        alert.decidedBy === 'other' ? ' · 다른 보호자가 승인했습니다.' : ' · 승인했습니다.',
      ),
      h('p', {}, '시간이 지나면 신고자 화면에서 다시 잠깁니다.'),
      ...(notice ? [notice] : []),
    );
    return;
  }

  let title: string;
  let desc: string;
  if (status === 'denied') {
    title = alert.decidedBy === 'other' ? '다른 보호자가 열람을 거절했습니다' : '열람을 거절했습니다';
    desc = '필요하면 지금 승인할 수 있습니다.';
  } else if (status === 'expired') {
    title = '공개 시간이 끝났습니다';
    desc = '응급정보가 다시 잠겼습니다. 필요하면 다시 승인하세요.';
  } else if (status === 'requested') {
    title = '응급정보 열람 요청';
    desc = `신고자가 ${view.userName}님의 비공개 응급정보(지병·복용약 등) 열람을 요청했습니다.`;
  } else {
    title = '응급정보 공개';
    desc = '신고자가 아직 열람을 요청하지 않았습니다. 미리 승인해 두면 요청하는 즉시 보입니다.';
  }

  const durations = h(
    'fieldset',
    { class: 'durations' },
    h('legend', {}, '공개 시간'),
    ...DURATION_OPTIONS.map((minutes) => {
      const input = h('input', {
        type: 'radio',
        name: 'duration',
        value: minutes,
        checked: minutes === state.durationMinutes,
      });
      input.addEventListener('change', () => {
        state.durationMinutes = minutes;
      });
      return h('label', {}, input, h('span', {}, minutes >= 60 ? `${minutes / 60}시간` : `${minutes}분`));
    }),
  );

  const approve = h(
    'button',
    { type: 'button', class: 'btn btn-primary btn-block', disabled: state.isSubmitting },
    state.isSubmitting ? '처리 중…' : '응급정보 공개 승인',
  );
  approve.addEventListener('click', openApproveDialog);

  const canDeny = status === 'none' || status === 'requested';
  const deny = canDeny
    ? h('button', { type: 'button', class: 'btn btn-outline btn-block', disabled: state.isSubmitting }, '거절')
    : null;
  deny?.addEventListener('click', () => void decide('deny'));

  panel.replaceChildren(
    h('h2', { class: 'access-status', id: 'decision-title' }, icon('lock'), title),
    h('p', {}, desc),
    durations,
    h('div', { class: 'decision-actions' }, approve, deny),
    ...(notice ? [notice] : []),
  );
}

// ---------------------------------------------------------------- 승인·거절

const approveDialog = byId<HTMLDialogElement>('approve-dialog');

function openApproveDialog(): void {
  const minutes = state.durationMinutes;
  const label = minutes >= 60 ? `${minutes / 60}시간` : `${minutes}분`;
  byId('approve-dialog-desc').textContent =
    `${state.view?.userName ?? ''}님의 비공개 응급정보를 이 신고를 한 사람에게 ${label} 동안 보여줍니다.`;
  approveDialog.showModal();
}

approveDialog.addEventListener('close', () => {
  if (approveDialog.returnValue === 'confirm') void decide('approve');
});

async function decide(decision: 'approve' | 'deny'): Promise<void> {
  if (state.isSubmitting) return;
  state.isSubmitting = true;
  state.notice = undefined;
  renderDecision();
  try {
    const result = await api.decide(decision, state.durationMinutes);
    state.view = result;
    if (!result.isApplied) state.notice = '다른 보호자가 먼저 처리해 현재 상태를 보여드립니다.';
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 410)) {
      showError(error);
      return;
    }
    state.notice = `처리하지 못했습니다. ${errorMessage(error)}`;
  } finally {
    state.isSubmitting = false;
  }
  render();
}

// ---------------------------------------------------------------- 갱신

async function refresh(): Promise<void> {
  try {
    const next = await api.get();
    if (!state.view) state.durationMinutes = next.defaultDurationMinutes;
    const changed = JSON.stringify(next.alert) !== JSON.stringify(state.view?.alert);
    state.view = next;
    // 공개 시간을 고르는 중에 화면이 다시 그려지지 않도록 상태가 바뀔 때만 갱신
    if (changed) render();
  } catch (error) {
    showError(error);
    clearInterval(pollTimer);
  }
}

// 다른 보호자의 결정·신고자의 열람 요청을 반영
const pollTimer = setInterval(() => {
  if (!document.hidden && !state.isSubmitting && !approveDialog.open && state.view) void refresh();
}, POLL_INTERVAL_MS);

setInterval(() => {
  const timer = document.getElementById('approve-timer');
  if (timer && state.view?.alert.accessStatus === 'approved') {
    timer.textContent = remainingText(state.view.alert.approvedUntil);
    if (state.view.alert.approvedUntil && Date.parse(state.view.alert.approvedUntil) <= Date.now()) void refresh();
  }
}, 1000);

if (!token) {
  showError(new ApiRequestError(404, 'approval_not_found', ''));
} else {
  void refresh();
}
