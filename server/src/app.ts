import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { apiNotFoundHandler, errorHandler } from './lib/errors.js';
import { healthRouter } from './routes/health.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  // Render 프록시 뒤에서 req.ip·req.secure 가 실제 값이 되도록
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '32kb' }));
  app.use(healthRouter);

  // API 라우터는 D2 에서 여기에 추가한다.
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
