import { createApp } from './app.js';
import { config } from './config.js';
import { closePool, isDbConfigured } from './db.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[server] ${config.publicBaseUrl} (port ${config.port})`);
  if (!isDbConfigured()) {
    console.warn('[server] DATABASE_URL 미설정: /healthz 와 /t/demo 화면만 동작합니다.');
  }
});

function shutdown(signal: string): void {
  console.log(`[server] ${signal} 수신, 종료합니다.`);
  server.close(() => {
    void closePool().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
