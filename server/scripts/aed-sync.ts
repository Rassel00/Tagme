/** 수동 AED 동기화: npm run aed:sync */
import { closePool } from '../src/db.js';
import { syncAeds } from '../src/services/aed-sync.js';

syncAeds()
  .catch((error: unknown) => {
    console.error('[aed] 실패', error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
