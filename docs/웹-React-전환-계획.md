# 응급 지원 웹 React 전환 계획

- 작성: 2026-11-16
- 상태: 계획 (구현 전)
- 대상: `server/web/` (응급 지원 웹 `/t/{tagId}`, `/aed`, 보호자 승인 웹 `/a/{approveToken}`)

## 1. 배경과 결정

### 왜 전환하는가
- 현재 웹은 프레임워크 없는 정적 HTML/CSS + TypeScript(`tsc` 컴파일만, 번들러 없음)다. 화면 3개짜리 시연에는 충분하다.
- 시연 버전이라 실제 확장 계획은 없지만, 실서비스 프로젝트라고 가정하면 화면이 늘어날 때 컴포넌트·상태 관리가 필요하다. NFC 태그 도착 전 남는 시간에 실무 구조로 전환한다.

### 결정 사항
| 항목 | 결정 | 이유 |
|---|---|---|
| 프레임워크 | **Vite + React + TypeScript** | 실무에서 가장 흔한 조합. Next 는 SSR·SEO 가 필요한 페이지(랜딩 등)에서 이점이 크고 응급 페이지에는 차이가 없다 |
| 배포 | **Express 가 빌드 결과를 서빙, Render 하나로 유지** | 신고자 세션 쿠키(`SameSite=Strict`, `Path=/api/public`)가 같은 출처를 전제로 한다. 웹을 Vercel 등으로 분리하면 프록시·CORS·헤더를 다시 설정해야 한다 |
| 페이지 구성 | **multi-page (진입점 2개: `t.html`, `a.html`)** | URL 구조 유지. 승인 페이지 사용자가 응급 페이지 코드를 받지 않게 |
| 화면 전환 | **해시 라우팅 유지(`#info`, `#aed`), 작은 훅으로 구현** | 라우터 라이브러리 불필요. 뒤로가기 동작이 지금과 같다 |
| 디자인 | **변경 없음.** `common.css`·클래스 이름 그대로 | 겉모습은 같고 내부만 바뀌는 전환. 회귀 확인이 쉽다 |
| 개발 방식 | **`vite build --watch` + Express(`localhost:3000`)** | 카카오 JavaScript 키 등록 도메인이 `http://localhost:3000` 이라 Vite 개발 서버(5173)에서는 지도가 안 뜬다 |

### 미결정 (구현 시작 전에 정할 것)
- **React vs Preact**: React 는 gzip 약 45KB, Preact 는 약 4KB. 응급 페이지는 로딩 속도가 중요해 Preact 도 타당하다. 코드 작성법은 거의 같다. 기본안은 React.
- **기존 Next 버전 재활용 여부**: 별도로 만든 Next 웹 버전에서 가져올 디자인·컴포넌트가 있는지 확인. 없으면 현재 `server/web` 기준으로만 진행.

### 추가할 패키지 (설치 전 확인 필요)
- dependencies: `react`, `react-dom`
- devDependencies: `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`

## 2. 현재 구조 (전환 전)

```
server/
  tsconfig.web.json        web/src → web/public/js 컴파일
  web/
    public/
      t.html               응급 지원 (/t/:tagId, /aed 공용)
      a.html               보호자 승인 (/a/:approveToken)
      css/common.css       409줄, 두 페이지 공용
      img/logo.svg
      js/                  빌드 결과 (gitignore)
    src/
      tag-page.ts          551줄  응급 지원 페이지 전체 로직
      approval-page.ts     271줄  승인 페이지 로직
      api.ts                49줄  공개 API 클라이언트 (demo 면 mock 사용)
      approval-api.ts      108줄  승인 API 클라이언트
      mock-api.ts           78줄  /t/demo 용 가짜 API
      kakao-map.ts         108줄  카카오맵 SDK 로드·렌더
      geo.ts                52줄  위치·거리·길찾기 URL
      types.ts              68줄  API 타입, ApiRequestError
      dom.ts                43줄  DOM 생성 헬퍼 (h, icon, svg, byId)
```

- 서빙: [server/src/app.ts](../server/src/app.ts) 의 `sendPage()` 가 `/t/:tagId`, `/aed` → `t.html`, `/a/:approveToken` → `a.html` 을 보내며 `Cache-Control: no-store`, `Referrer-Policy`(`/t`·`/aed` 는 `strict-origin`, `/a` 는 `no-referrer`), `X-Robots-Tag: noindex, nofollow` 를 붙인다. 나머지는 `express.static(config.webRoot)`.
- `config.webRoot` = `web/public` ([server/src/config.ts](../server/src/config.ts))
- 테스트: [server/test/pages.test.ts](../server/test/pages.test.ts) 가 세 경로의 헤더와 HTML 에 `/js/tag-page.js`, `/js/approval-page.js` 가 들어 있는지 확인
- `tag-page.ts` 의 주요 동작
  - 경로에서 tagId 추출, `demo` 면 가짜 API, `/aed` 면 AED 전용 모드
  - 화면: 메인 / 응급정보(`#info`) / 주변 AED(`#aed`) / 오류, `hashchange` 로 전환
  - 비상연락망 알림 확인 `<dialog>`, 위치 5초 타임아웃
  - 열람 요청 → 신고 상태 3초 폴링, 신고 ID 는 `sessionStorage` (`tagme:alert:{tagId}`)
  - AED 가까운 순(3개) / 전체(20개), 카카오맵 또는 약식 지도
- `approval-page.ts`: 승인 정보 조회·표시, 승인/거절 다이얼로그, 폴링, 남은 시간 표시

## 3. 목표 구조 (전환 후)

```
server/
  vite.config.ts           root: web, multi-page 입력(t.html, a.html), outDir: web/dist
  tsconfig.web.json        jsx: react-jsx, noEmit (타입 검사 전용)
  web/
    t.html, a.html         Vite 진입 HTML (<div id="root"> + <script type="module" src="/src/...">)
    public/                그대로 복사되는 정적 파일 (img/logo.svg 등)
    src/
      styles/common.css    기존 CSS 그대로 이동
      lib/                 api.ts, approval-api.ts, mock-api.ts, kakao-map.ts, geo.ts, types.ts (거의 그대로)
      components/          Icon, IconSprite, Btn119, Sheet(dialog) 등 공용
      hooks/               useHashRoute, usePolling, useNow(남은 시간)
      tag/                 main.tsx, TagApp.tsx, MainView, InfoView, AccessPanel, AedView, AedMap, ErrorView
      approval/            main.tsx, ApprovalApp.tsx, DecisionPanel 등
    dist/                  빌드 결과 (gitignore)
```

폴더 이름은 구현하면서 조정해도 된다. 원칙은 "API·지도·위치 로직(lib)은 React 와 무관하게 유지, 화면만 컴포넌트로".

## 4. 단계별 작업

브랜치 하나(예: `feat/web-react`)에서 진행하고 단계마다 기능 단위로 커밋한다.

### 1단계. 빌드 기반 교체 (화면 코드는 그대로)
- [ ] 패키지 설치 (React/Preact 결정 후)
- [ ] `vite.config.ts` 작성: `root: 'web'`, `build.rollupOptions.input` 에 `t.html`, `a.html`, `outDir: 'dist'`
- [ ] `t.html`, `a.html` 을 `web/` 로 옮기고 스크립트를 `/src/tag-page.ts`, `/src/approval-page.ts` 로 변경 (아직 기존 TS 그대로)
- [ ] `common.css` 는 HTML 의 `<link>` 대신 진입 TS 에서 import 하거나 Vite 가 처리하게
- [ ] `config.webRoot` → `web/dist`
- [ ] `express.static`: 해시가 붙은 `/assets/*` 는 `immutable` 장기 캐시, 나머지는 기존 정책 유지
- [ ] `package.json` 스크립트
  - `build:web`: `vite build`
  - `dev`: 웹 `vite build --watch` 와 서버 `tsx watch` 를 함께 실행 (도구 추가가 필요하면 확인 후. 터미널 두 개로 나눠도 됨)
  - `typecheck`: `tsc -p tsconfig.web.json --noEmit` 유지
- [ ] `.gitignore`: `server/web/public/js/` → `server/web/dist/`
- [ ] `tsconfig.web.json` 정리 (`outDir` 제거, `noEmit`, 이후 `jsx: react-jsx`)
- [ ] `pages.test.ts`: `/js/*.js` 대신 빌드 결과 HTML 기준으로 확인 (예: `<script type="module"` 존재, 페이지별 고유 문구). 테스트 전에 웹 빌드가 필요한지 `scripts/run-tests.ts` 확인
- [ ] **확인**: 기존 코드 그대로 Vite 빌드 → `/t/demo`, `/aed`, `/a/...` 가 전환 전과 똑같이 동작

### 2단계. 공통 모듈 정리
- [ ] `api.ts`, `approval-api.ts`, `mock-api.ts`, `kakao-map.ts`, `geo.ts`, `types.ts` 를 `lib/` 로 이동 (내용 변경 최소화, `.js` 확장자 import 정리)
- [ ] SVG 심볼 정의(`t.html` 의 `<defs>`)를 `IconSprite` 컴포넌트로, `<svg><use href="#i-..."/></svg>` 를 `<Icon name="..."/>` 로
- [ ] 공용 컴포넌트: 119 버튼, 시트(`<dialog>` 를 `ref` 로 `showModal()`)

### 3단계. 보호자 승인 페이지(`/a`) 전환
작고 단순해서 먼저 진행해 패턴을 잡는다.
- [ ] `approval/main.tsx` 에서 `createRoot` 마운트
- [ ] 승인 정보 로드, 오류 화면
- [ ] 승인/거절 다이얼로그, 결정 후 상태 반영
- [ ] 폴링과 남은 시간 표시를 훅으로 (`useEffect` 정리 함수로 `clearInterval`)
- [ ] `dom.ts` 사용처 제거

### 4단계. 응급 지원 페이지(`/t`, `/aed`) 전환
- [ ] `useHashRoute`: `''` / `info` / `aed`, 내부 이동 여부를 기억해 뒤로가기 버튼 동작 유지
- [ ] 초기 로드: tagId·demo·AED 전용 모드 판정, 태그 조회, 없음/비활성 → 오류 화면
- [ ] 메인: 비상연락망 알림 버튼 + 확인 시트, 결과 안내(성공/실패)
- [ ] 응급정보: 프로필 카드, 열람 요청 패널(`AccessPanel`), 승인 시 비공개 항목 표시, 남은 시간
- [ ] 신고 상태: `sessionStorage` 신고 ID, 3초 폴링, 만료 시 키 삭제
- [ ] 주변 AED: 가까운 순/전체 칩, 위치 권한·타임아웃, 목록, 길찾기 링크
- [ ] 카카오맵: `AedMap` 컴포넌트에서 `ref` + `useEffect` 로 기존 `loadKakaoMaps`, `renderKakaoAedMap` 호출, 키 없으면 약식 지도
- [ ] `dom.ts` 삭제

### 5단계. 검증
- [ ] `npm run typecheck`, `npm test` 통과
- [ ] `npm run build` 후 `npm start` 로 운영 모드 확인
- [ ] 브라우저(모바일 크기)에서 확인
  - `/t/demo` 메인 → 비상연락망 알림 → 응급정보 → 열람 요청(5초 뒤 자동 승인) → 잠금 해제·남은 시간
  - `/t/demo?state=notfound`, `?state=inactive`, `?state=nocontact`
  - `/aed` (태그 없는 AED 전용), 지도 표시, 길찾기 링크
  - 뒤로가기: 내부 화면 → 메인, 메인에서 브라우저 뒤로
  - 새로고침 시 진행 중 신고 유지(`sessionStorage`)
- [ ] 시드 태그로 실제 API 흐름: 열람 요청 → 문자 큐 적재 → `/a/...` 승인 → 신고자 화면 자동 잠금 해제
- [ ] 응답 헤더가 전환 전과 같은지 (`no-store`, Referrer-Policy, `X-Robots-Tag`)
- [ ] 콘솔 에러 없음
- [ ] JS 전송 크기를 전환 전과 비교해 기록

### 6단계. 문서
- [ ] `docs/개발-진행.md` 에 전환 결과, 결정(React/Preact 선택 이유 포함), 남은 할 일 기록
- [ ] `README.md` 의 웹 설명과 명령어 갱신
- [ ] 이 문서 상태를 "완료" 로 변경

## 5. 주의할 점
- **로딩 속도**: `/t/{tagId}` 는 응급 상황에서 열린다. 무거운 라이브러리(UI 키트, 상태 관리, 라우터)는 넣지 않는다.
- **보안 헤더·URL 유지**: 태그에 기록된 URL(`/t/{tagId}`)과 승인 링크(`/a/{token}`) 형식은 절대 바꾸지 않는다. 헤더는 Express 의 `sendPage()` 가 계속 붙이므로 HTML 경로만 맞추면 된다.
- **Render 배포 설정 변경 없음**: Build `npm install && npm run build`, Start `npm start` 그대로 동작해야 한다. `vite` 가 devDependencies 에 있으면 Render 빌드에서 설치되는지 확인 (`NODE_ENV=production` 이면 devDependencies 를 건너뛸 수 있음 → 필요하면 `npm install --include=dev` 또는 dependencies 로 이동).
- **폴링 타이머 정리**: 컴포넌트 언마운트·화면 전환 시 `setInterval` 이 남지 않게.
- **React StrictMode**: 개발 모드에서 effect 가 두 번 실행된다. 열람 요청·알림 전송 같은 POST 가 effect 안에서 자동 실행되지 않게(버튼 클릭에서만).
- **TypeScript 버전**: 서버는 `typescript ^7`. Vite 는 TS 를 자체 변환하므로 타입 검사는 `tsc --noEmit` 로 따로 한다.

## 6. 예상 작업량
- 대상 코드 약 1,700줄(TS 1,330줄 + CSS 409줄), 하루~이틀.
