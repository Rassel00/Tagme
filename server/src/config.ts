import 'dotenv/config';
import path from 'node:path';

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const port = Number(optional('PORT') ?? 3000);

export const config = {
  port,
  isProduction: process.env.NODE_ENV === 'production',
  publicBaseUrl: (optional('PUBLIC_BASE_URL') ?? `http://localhost:${port}`).replace(/\/+$/, ''),
  /** DB 없이도 웹 화면(/t/demo)과 헬스체크는 뜰 수 있도록 선택값으로 둔다. */
  databaseUrl: optional('DATABASE_URL'),
  gatewayKey: optional('GATEWAY_KEY'),
  gatewayPhone: optional('GATEWAY_PHONE'),
  aedApiKey: optional('AED_API_KEY'),
  /** 카카오맵 JavaScript 키. 브라우저에 그대로 노출되는 공개 키이며, 카카오 콘솔에 등록한 도메인에서만 동작한다 */
  kakaoJsKey: optional('KAKAO_JS_KEY'),
  /** Firebase 서비스 계정 키 JSON (한 줄). 없으면 앱 API 인증이 동작하지 않는다. */
  firebaseServiceAccount: optional('FIREBASE_SERVICE_ACCOUNT'),
  /** npm 스크립트와 Render 모두 server/ 를 작업 디렉터리로 실행한다. */
  webRoot: path.resolve(process.cwd(), 'web/public'),
} as const;
