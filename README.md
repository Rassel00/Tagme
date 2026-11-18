# 응급안심 (tagme)

NFC 키링·팔찌를 폰에 대면 응급 지원 웹이 열리고, 신고자가 119 신고·보호자 알림·응급정보 열람·주변 AED 찾기를 할 수 있는 시연용 프로토타입.

기획·명세는 [docs/응급안심 개발 문서.docx](docs/응급안심%20개발%20문서.docx), 일정은 [docs/WBS.xlsx](docs/WBS.xlsx), 진행 기록은 [docs/개발-진행.md](docs/개발-진행.md).

## 구조

| 경로 | 내용 | 기술 |
| --- | --- | --- |
| `server/` | 백엔드 API | Node.js + TypeScript, Express, PostgreSQL(Neon) |
| `server/web/` | 응급 지원 웹 `/t/{tagId}`, 보호자 승인 웹 `/a/{approveToken}` | React + Vite + TypeScript, 빌드 결과(`web/dist`)를 백엔드가 서빙 |
| `app/` | 사용자 앱 | Flutter (Android 먼저) |
| `gateway/` | 문자 게이트웨이 앱 | Android, Kotlin |
| `docs/` | 개발 문서, WBS, 진행 기록 | |

## 서버 실행

```bash
cd server
# server/.env 는 dotenvx 로 암호화되어 커밋돼 있다. 비밀번호 관리자의 개인 키를 server/.env.keys 에 넣는다
#   DOTENV_PRIVATE_KEY=...
npm install
npm run migrate        # 스키마 적용
npm run seed           # 시연용 가상 데이터 (앱 없이 웹 개발용)
npm run dev            # http://localhost:3000
```

- 헬스체크: `GET /healthz`
- 키 추가·변경: `npx dotenvx set KEY value` (암호화된 `.env` 를 직접 편집하지 않는다). 키 목록·설명은 `.env.example`, 자세한 내용은 [docs/시크릿-관리-계획.md](docs/시크릿-관리-계획.md)
- 응급 지원 웹: `/t/{tagId}` (시드 출력의 URL, DB 없이 화면만 볼 때는 `/t/demo`)

## 스크립트 (server/)

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 서버(`tsx watch`) + 웹 클라이언트(`vite build --watch`) |
| `npm run build` | 서버(`dist/`)와 웹 클라이언트(`web/dist/`) 빌드 |
| `npm start` | 빌드 결과 실행 (Render) |
| `npm run migrate` | `migrations/*.sql` 순서대로 적용 |
| `npm run seed` | 가상 사용자·응급정보·태그·연락처 입력 |
| `npm test` | 웹 빌드 후 단위·통합 테스트 |
| `npm run typecheck` | 타입 검사 |
