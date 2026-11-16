/**
 * 응급 지원 웹 /t/{tagId} (WEB-01~04, WEB-06)
 * 화면: #(메인) / #info(응급정보) / #aed(주변 AED). 해시로 전환해 뒤로가기가 자연스럽게 동작한다.
 */
import { DEMO_TAG_ID, createApi } from './api.js';
import { byId, h, icon, svg } from './dom.js';
import { directionsUrl, formatDistance, getPosition } from './geo.js';
import { DEMO_POSITION } from './mock-api.js';
import type { Aed, AlertAction, AlertStatus, LatLng, ProfileField, ProfileValues, PublicTag } from './types.js';
import { ApiRequestError } from './types.js';

const POSITION_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 3000;
const AED_NEAR_LIMIT = 3;
const AED_ALL_LIMIT = 20;

const tagId = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] ?? '');
const isDemo = tagId === DEMO_TAG_ID;
const api = createApi(tagId);
const alertStorageKey = `tagme:alert:${tagId}`;

const state: {
  tag?: PublicTag;
  alertId?: string;
  alert?: AlertStatus;
  isRequestingAccess: boolean;
  aedMode: 'near' | 'all';
  aedPosition?: LatLng;
} = {
  alertId: readStoredAlertId(),
  isRequestingAccess: false,
  aedMode: 'near',
};

function readStoredAlertId(): string | undefined {
  try {
    return sessionStorage.getItem(alertStorageKey) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeAlertId(alertId: string): void {
  state.alertId = alertId;
  try {
    sessionStorage.setItem(alertStorageKey, alertId);
  } catch {
    // 저장 실패해도 현재 탭에서는 동작
  }
}

// ---------------------------------------------------------------- 라우팅

type ViewName = 'main' | 'info' | 'aed' | 'error';
const VIEWS: ViewName[] = ['main', 'info', 'aed', 'error'];

function showView(name: ViewName): void {
  byId('view-loading').hidden = true;
  for (const view of VIEWS) byId(`view-${view}`).hidden = view !== name;
  document.body.classList.toggle('is-sub', name === 'info' || name === 'aed');
  window.scrollTo(0, 0);
}

function route(): void {
  if (!state.tag) return;
  const hash = location.hash.replace('#', '');
  if (hash === 'info') {
    showView('info');
    renderInfo();
  } else if (hash === 'aed') {
    showView('aed');
    void loadAeds();
  } else {
    showView('main');
  }
}

function showError(title: string, desc: string): void {
  byId('error-title').textContent = title;
  byId('error-desc').textContent = desc;
  showView('error');
}

// 하위 화면의 뒤로 버튼: 메인에서 들어왔으면 history.back(), 직접 열었으면 메인으로
let hasNavigatedInside = false;
document.addEventListener('click', (event) => {
  const back = (event.target as Element).closest('.topbar-back');
  if (!back) return;
  event.preventDefault();
  if (hasNavigatedInside) history.back();
  else location.hash = '';
});
window.addEventListener('hashchange', () => {
  hasNavigatedInside = location.hash !== '';
  route();
});

// ---------------------------------------------------------------- 메인: 비상연락망 연락 (WEB-02)

const contactButton = byId<HTMLButtonElement>('btn-contact');
const contactDialog = byId<HTMLDialogElement>('contact-dialog');
const contactResult = byId('contact-result');

function renderContactButton(): void {
  const count = state.tag?.contactCount ?? 0;
  const label = contactButton.querySelector('.menu-label');
  if (count === 0) {
    contactButton.setAttribute('aria-disabled', 'true');
    if (label) label.textContent = '등록된 비상연락처가 없습니다';
  }
}

contactButton.addEventListener('click', () => {
  if (contactButton.getAttribute('aria-disabled') === 'true') return;
  const count = state.tag?.contactCount ?? 0;
  byId('contact-dialog-desc').textContent =
    `보호자 ${count}명에게 현재 위치와 함께 문자로 알립니다. 보호자 번호는 화면에 표시되지 않습니다.`;
  contactDialog.showModal();
});

contactDialog.addEventListener('close', () => {
  if (contactDialog.returnValue === 'confirm') void sendContact();
});

async function sendContact(): Promise<void> {
  const label = contactButton.querySelector('.menu-label');
  const original = label?.textContent ?? '';
  contactButton.setAttribute('aria-disabled', 'true');
  contactResult.hidden = true;
  try {
    if (label) label.textContent = '위치 확인 중…';
    const position = await currentPositionForAlert();
    if (label) label.textContent = '보호자에게 알리는 중…';
    const result = await createAlert('contact', position);

    let title: string;
    if (!result.isMerged) title = `보호자 ${result.notifiedCount}명에게 발송됨`;
    else if (result.notifiedCount > 0) title = `보호자 ${result.notifiedCount}명에게 다시 알렸습니다`;
    else title = '이미 보호자에게 알림이 전송되었습니다';
    showContactResult('success', title, '보호자가 위치를 확인하고 연락할 수 있습니다. 위급하면 119에 먼저 신고하세요.');
  } catch (error) {
    showContactResult('error', '알림을 보내지 못했습니다', errorMessage(error));
  } finally {
    if (label) label.textContent = original;
    contactButton.removeAttribute('aria-disabled');
  }
}

function showContactResult(kind: 'success' | 'error', title: string, desc: string): void {
  contactResult.className = kind === 'success' ? 'notice' : 'notice notice--error';
  contactResult.replaceChildren(
    icon(kind === 'success' ? 'check' : 'warn'),
    h('div', {}, h('strong', {}, title), desc),
  );
  contactResult.hidden = false;
}

async function currentPositionForAlert(): Promise<LatLng | null> {
  if (isDemo) return DEMO_POSITION;
  const result = await getPosition(POSITION_TIMEOUT_MS);
  return result.ok ? result.position : null;
}

async function createAlert(action: AlertAction, position: LatLng | null) {
  const result = await api.createAlert(action, position);
  storeAlertId(result.alertId);
  return result;
}

// ---------------------------------------------------------------- 응급정보 (WEB-03)

const FIELD_GROUPS: { title: string; icon: string; fields: [ProfileField, string][] }[] = [
  { title: '기본정보', icon: 'user', fields: [['name', '이름'], ['birthDate', '생년월일'], ['bloodType', '혈액형']] },
  {
    title: '의료정보',
    icon: 'heart',
    fields: [['conditions', '지병'], ['allergies', '알레르기'], ['medications', '복용 중인 약']],
  },
  { title: '유의사항', icon: 'warn', fields: [['notes', '유의사항']] },
];

function formatBirthDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return `${y}. ${String(m).padStart(2, '0')}. ${String(d).padStart(2, '0')}. (${age}세)`;
}

function renderInfo(): void {
  const tag = state.tag;
  if (!tag) return;
  const unlocked: ProfileValues = state.alert?.accessStatus === 'approved' ? state.alert.emergencyInfo ?? {} : {};

  const cards = FIELD_GROUPS.map((group) => {
    const rows = group.fields.map(([field, label]) => {
      const publicValue = tag.publicInfo[field];
      const unlockedValue = unlocked[field];
      const isLocked = tag.lockedFields.includes(field);
      const value = publicValue ?? unlockedValue;
      const shown = field === 'birthDate' && value ? formatBirthDate(value) : value;

      const dd = shown
        ? h('dd', {}, shown)
        : isLocked
          ? h('dd', {}, h('span', { class: 'locked' }, icon('lock'), '비공개'))
          : h('dd', {}, '-');
      const classes = ['field'];
      if (group.title === '유의사항') classes.push('field--note');
      if (!publicValue && unlockedValue) classes.push('is-unlocked');
      // 유의사항 카드는 제목과 항목명이 같아 dt 를 숨긴다
      const dt = group.title === '유의사항' ? null : h('dt', {}, label);
      return h('dl', { class: classes.join(' ') }, dt, dd);
    });
    return h('section', { class: 'card' }, h('h2', { class: 'card-title' }, icon(group.icon), group.title), ...rows);
  });

  byId('info-cards').replaceChildren(...cards);
  renderAccessPanel();
}

function renderAccessPanel(): void {
  const panel = byId('access-panel');
  const tag = state.tag;
  if (!tag || tag.lockedFields.length === 0) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const status = state.alert?.accessStatus ?? 'none';
  panel.className = `access access--${status}`;

  const requestButton = (text: string): HTMLButtonElement => {
    const button = h(
      'button',
      { type: 'button', class: 'btn btn-primary btn-block', disabled: state.isRequestingAccess },
      state.isRequestingAccess ? '요청 중…' : text,
    );
    button.addEventListener('click', () => void requestAccess());
    return button;
  };

  switch (status) {
    case 'none':
      panel.replaceChildren(
        h('p', { class: 'access-status' }, icon('lock'), `잠긴 항목 ${tag.lockedFields.length}개`),
        h('p', {}, '보호자가 승인하면 잠긴 응급정보를 볼 수 있어요.'),
        requestButton('보호자에게 열람 요청'),
      );
      break;
    case 'requested':
      panel.replaceChildren(
        h('p', { class: 'access-status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), '보호자 승인 대기 중'),
        h('p', {}, '보호자에게 승인 요청을 보냈어요. 승인되면 이 화면에 자동으로 표시됩니다.'),
      );
      break;
    case 'approved':
      panel.replaceChildren(
        h('p', { class: 'access-status' }, icon('check'), '보호자가 열람을 승인했어요'),
        h('p', {}, '남은 시간 ', h('strong', { class: 'timer', id: 'approve-timer' }, remainingText()), ' · 시간이 지나면 다시 잠깁니다.'),
      );
      break;
    case 'denied':
      panel.replaceChildren(
        h('p', { class: 'access-status' }, icon('lock'), '보호자가 열람을 거절했어요'),
        h('p', {}, '다른 보호자가 승인하면 자동으로 표시됩니다. 위급하면 119에 신고하세요.'),
      );
      break;
    case 'expired':
      panel.replaceChildren(
        h('p', { class: 'access-status' }, icon('lock'), '공개 시간이 끝났어요'),
        h('p', {}, '응급정보가 다시 잠겼습니다.'),
      );
      break;
  }
}

function remainingText(): string {
  const until = state.alert?.approvedUntil ? Date.parse(state.alert.approvedUntil) : NaN;
  if (Number.isNaN(until)) return '-';
  const sec = Math.max(0, Math.floor((until - Date.now()) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

async function requestAccess(): Promise<void> {
  if (state.isRequestingAccess) return;
  state.isRequestingAccess = true;
  renderAccessPanel();
  try {
    const position = await currentPositionForAlert();
    await createAlert('requestAccess', position);
    await refreshAlert();
  } catch (error) {
    window.alert(`열람 요청에 실패했습니다.\n${errorMessage(error)}`);
  } finally {
    state.isRequestingAccess = false;
    renderAccessPanel();
  }
}

// 상태 폴링 (3초) + 승인 남은 시간 표시
async function refreshAlert(): Promise<void> {
  if (!state.alertId) return;
  try {
    const previous = state.alert?.accessStatus;
    state.alert = await api.getAlert(state.alertId);
    if (previous !== state.alert.accessStatus && location.hash === '#info') renderInfo();
  } catch (error) {
    // 세션 쿠키가 없거나 신고가 종료됨 → 새 신고를 만들 수 있게 초기화
    if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403 || error.status === 404)) {
      state.alertId = undefined;
      state.alert = undefined;
      try {
        sessionStorage.removeItem(alertStorageKey);
      } catch {
        // 무시
      }
    }
  }
}

function shouldPoll(): boolean {
  const status = state.alert?.accessStatus;
  return Boolean(state.alertId) && (status === 'requested' || status === 'approved' || status === 'denied');
}

setInterval(() => {
  if (!document.hidden && shouldPoll()) void refreshAlert();
}, POLL_INTERVAL_MS);

setInterval(() => {
  const timer = document.getElementById('approve-timer');
  if (!timer || state.alert?.accessStatus !== 'approved') return;
  timer.textContent = remainingText();
  // 만료 시각이 지나면 다음 폴링을 기다리지 않고 바로 잠근다
  if (state.alert.approvedUntil && Date.parse(state.alert.approvedUntil) <= Date.now()) {
    state.alert = { accessStatus: 'expired' };
    renderInfo();
  }
}, 1000);

// ---------------------------------------------------------------- 주변 AED (WEB-06)

for (const chip of document.querySelectorAll<HTMLButtonElement>('[data-aed-mode]')) {
  chip.addEventListener('click', () => {
    state.aedMode = chip.dataset.aedMode === 'all' ? 'all' : 'near';
    for (const other of document.querySelectorAll<HTMLButtonElement>('[data-aed-mode]')) {
      const isActive = other === chip;
      other.classList.toggle('is-active', isActive);
      other.setAttribute('aria-selected', String(isActive));
    }
    void loadAeds();
  });
}

async function loadAeds(): Promise<void> {
  const body = byId('aed-body');
  const map = byId('aed-map');

  if (!state.aedPosition) {
    map.replaceChildren();
    body.replaceChildren(h('p', { class: 'aed-hint' }, '현재 위치를 확인하는 중…'));
    if (isDemo) {
      state.aedPosition = DEMO_POSITION;
    } else {
      const result = await getPosition(POSITION_TIMEOUT_MS);
      if (!result.ok) {
        body.replaceChildren(
          h(
            'div',
            { class: 'notice notice--warn' },
            icon('warn'),
            h(
              'div',
              {},
              h('strong', {}, result.reason === 'denied' ? '위치 권한이 필요해요' : '위치를 확인하지 못했어요'),
              result.reason === 'denied'
                ? '브라우저 설정에서 이 사이트의 위치 권한을 허용한 뒤 다시 열어 주세요.'
                : '잠시 후 다시 시도하거나, 주변 사람에게 AED 위치를 물어보세요.',
            ),
          ),
        );
        return;
      }
      state.aedPosition = result.position;
    }
  }

  try {
    const limit = state.aedMode === 'near' ? AED_NEAR_LIMIT : AED_ALL_LIMIT;
    const aeds = await api.getAeds(state.aedPosition, limit);
    renderAedMap(state.aedPosition, aeds);
    renderAedList(aeds);
  } catch (error) {
    body.replaceChildren(
      h('div', { class: 'notice notice--error' }, icon('warn'), h('div', {}, h('strong', {}, 'AED 목록을 불러오지 못했어요'), errorMessage(error))),
    );
  }
}

function renderAedList(aeds: Aed[]): void {
  const body = byId('aed-body');
  if (aeds.length === 0) {
    body.replaceChildren(h('p', { class: 'aed-hint' }, '주변에 등록된 AED가 없습니다.'));
    return;
  }
  const items = aeds.map((aed) =>
    h(
      'li',
      { class: 'aed-item' },
      h(
        'a',
        { class: 'aed-link', href: directionsUrl(aed.name, aed), target: '_blank', rel: 'noopener' },
        h(
          'div',
          { class: 'aed-main' },
          h('div', { class: 'aed-name' }, h('span', {}, aed.name), h('span', { class: 'aed-distance' }, formatDistance(aed.distanceM))),
          h('div', { class: 'aed-place' }, aed.place),
          h('div', { class: 'aed-address' }, aed.address),
        ),
        icon('chevron', 'menu-chevron'),
      ),
    ),
  );
  body.replaceChildren(h('ul', { class: 'aed-list' }, ...items), h('p', { class: 'aed-hint' }, '항목을 누르면 지도 앱에서 길찾기가 열립니다.'));
}

/** 지도 API 없이 현재 위치와 AED 의 상대 위치를 보여주는 약식 지도 */
function renderAedMap(center: LatLng, aeds: Aed[]): void {
  const W = 360;
  const H = 220;
  const PAD = 30;
  const map = byId('aed-map');
  if (aeds.length === 0) {
    map.replaceChildren();
    return;
  }
  // 경도 1도의 거리는 위도에 따라 줄어들므로 보정
  const kx = Math.cos((center.lat * Math.PI) / 180);
  const points = aeds.map((a) => ({ x: (a.lng - center.lng) * kx, y: -(a.lat - center.lat) }));
  const span = Math.max(...points.map((p) => Math.max(Math.abs(p.x) / (W / 2 - PAD), Math.abs(p.y) / (H / 2 - PAD))), 1e-6);
  const project = (p: { x: number; y: number }) => ({ x: W / 2 + p.x / span, y: H / 2 + p.y / span });

  const roads = [
    'M0 60 C 90 50, 200 90, 360 70',
    'M0 170 C 120 160, 240 190, 360 150',
    'M80 0 C 95 80, 70 150, 100 220',
    'M260 0 C 245 70, 280 150, 250 220',
  ].map((d) => svg('path', { d, fill: 'none', stroke: '#ffffff', 'stroke-width': 10, 'stroke-linecap': 'round' }));

  const blocks = [
    [20, 80, 50, 70], [120, 95, 110, 60], [280, 90, 60, 50], [115, 10, 120, 35], [290, 180, 60, 35], [10, 185, 60, 30],
  ].map(([x, y, w, hgt]) => svg('rect', { x, y, width: w, height: hgt, rx: 6, fill: '#e3e7df' }));

  const pins = points.map((p) => {
    const { x, y } = project(p);
    return svg(
      'g',
      { transform: `translate(${x - 13} ${y - 13})` },
      svg('circle', { cx: 13, cy: 13, r: 14, fill: '#fff' }),
      svg('svg', { width: 26, height: 26, viewBox: '0 0 24 24', color: '#e5484d' }, svg('use', { href: '#i-aed' })),
    );
  });

  map.replaceChildren(
    svg(
      'svg',
      { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid slice', role: 'img' },
      ...blocks,
      ...roads,
      svg('circle', { cx: W / 2, cy: H / 2, r: 34, fill: 'rgba(47,124,246,0.15)', stroke: 'rgba(47,124,246,0.35)' }),
      svg('circle', { cx: W / 2, cy: H / 2, r: 8, fill: '#2f7cf6', stroke: '#fff', 'stroke-width': 3 }),
      ...pins,
    ),
  );
}

// ---------------------------------------------------------------- 시작

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  return '네트워크 연결을 확인한 뒤 다시 시도하세요.';
}

async function init(): Promise<void> {
  if (!tagId) {
    showError('잘못된 주소입니다', '태그를 다시 대 주세요. 위급하면 바로 119에 신고하세요.');
    return;
  }
  try {
    state.tag = await api.getTag();
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      showError('등록되지 않은 태그입니다', '태그 정보를 찾을 수 없습니다. 위급하면 바로 119에 신고하세요.');
    } else if (error instanceof ApiRequestError && error.status === 410) {
      showError('사용이 중지된 태그입니다', '태그 주인이 이 태그를 비활성화했습니다. 위급하면 바로 119에 신고하세요.');
    } else {
      showError('정보를 불러오지 못했습니다', `${errorMessage(error)} 위급하면 바로 119에 신고하세요.`);
    }
    return;
  }
  renderContactButton();
  if (state.alertId) await refreshAlert();
  route();
}

void init();
