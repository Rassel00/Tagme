# 응급안심 (tagme)

NFC 키링·팔찌를 폰에 대면 응급 지원 웹이 열리고, 신고자가 119 신고·보호자 알림·응급정보 열람·주변 AED 찾기를 할 수 있는 시연용 프로토타입.

기획·명세는 [docs/응급안심 개발 문서.docx](docs/응급안심%20개발%20문서.docx), 일정은 [docs/WBS.xlsx](docs/WBS.xlsx), 진행 기록은 [docs/개발-진행.md](docs/개발-진행.md).

## 구조

| 경로 | 내용 | 기술 |
| --- | --- | --- |
| `server/` | 백엔드 API | Node.js + TypeScript, Express, PostgreSQL(Neon) |
| `server/web/` | 응급 지원 웹 `/t/{tagId}`, 보호자 승인 웹 `/a/{approveToken}` | 정적 HTML/CSS + TypeScript, 백엔드가 서빙 |
| `app/` | 사용자 앱 | Flutter (Android 먼저) |
| `gateway/` | 문자 게이트웨이 앱 | Android, Kotlin |
| `docs/` | 개발 문서, WBS, 진행 기록 | |

## 서버 실행

```bash
cd server
cp .env.example .env   # DATABASE_URL 등 채우기
npm install
npm run migrate        # 스키마 적용
npm run seed           # 시연용 가상 데이터 (앱 없이 웹 개발용)
npm run dev            # http://localhost:3000
```

- 헬스체크: `GET /healthz`
- 응급 지원 웹: `/t/{tagId}` (시드 출력의 URL, DB 없이 화면만 볼 때는 `/t/demo`)

## 스크립트 (server/)

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 서버 + 웹 클라이언트 watch |
| `npm run build` | 서버(`dist/`)와 웹 클라이언트(`web/public/js/`) 빌드 |
| `npm start` | 빌드 결과 실행 (Render) |
| `npm run migrate` | `migrations/*.sql` 순서대로 적용 |
| `npm run seed` | 가상 사용자·응급정보·태그·연락처 입력 |
| `npm test` | 단위 테스트 |
| `npm run typecheck` | 타입 검사 |
