import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { createFirebaseVerifier, type VerifyIdToken } from './lib/auth.js';
import { apiNotFoundHandler, errorHandler } from './lib/errors.js';
import { createAppApiRouter } from './routes/app-api.js';
import { createApprovalsApiRouter } from './routes/approvals-api.js';
import { createGatewayApiRouter } from './routes/gateway-api.js';
import { healthRouter } from './routes/health.js';
import { createPublicApiRouter } from './routes/public-api.js';

export interface AppOptions {
  /** 기본은 Firebase. 테스트에서 가짜 검증기를 넣는다. */
  verifyIdToken?: VerifyIdToken;
  gatewayKey?: string;
}

export function createApp(options: AppOptions = {}): express.Express {
  const app = express();

  app.disable('x-powered-by');
  // Render 프록시 뒤에서 req.ip·req.secure 가 실제 값이 되도록
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '32kb' }));
  app.use(healthRouter);

  app.use('/api/public', createPublicApiRouter());
  app.use('/api/approvals', createApprovalsApiRouter());
  app.use('/api/gateway', createGatewayApiRouter(options.gatewayKey ?? config.gatewayKey));
  // 앱 API 는 마지막: 인증 미들웨어가 /api 아래 나머지 경로 전체에 걸린다
  app.use('/api', createAppApiRouter(options.verifyIdToken ?? createFirebaseVerifier()));
  app.use('/api', apiNotFoundHandler);

  // 응급 지원 웹: 태그 URL 은 하나의 HTML 을 내려주고, 화면 전환은 클라이언트에서 처리
  app.get('/t/:tagId', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(config.webRoot, 't.html'));
  });
  app.use(express.static(config.webRoot, { index: false, maxAge: config.isProduction ? '1h' : 0 }));

  app.use(errorHandler);
  return app;
}
