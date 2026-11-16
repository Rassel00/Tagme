import { Router } from 'express';
import { getPool, isDbConfigured } from '../db.js';

export const healthRouter = Router();

/**
 * Render 헬스체크 겸 시연 직전 "서버 깨우기" 용.
 * DB 가 설정돼 있으면 연결까지 확인하고, 실패하면 503.
 */
healthRouter.get('/healthz', async (_req, res) => {
  if (!isDbConfigured()) {
    res.json({ status: 'ok', db: 'not_configured' });
    return;
  }
  try {
    await getPool().query('SELECT 1');
    res.json({ status: 'ok', db: 'ok' });
  } catch (error) {
    console.error('[healthz] DB 연결 실패', error);
    res.status(503).json({ status: 'error', db: 'error' });
  }
});
