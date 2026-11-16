/**
 * migrations/*.sql 을 파일명 순서대로 한 번씩 적용한다.
 * 적용 기록은 schema_migrations 테이블에 남긴다. 파일마다 트랜잭션으로 묶는다.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { closePool, getPool, withTransaction } from '../src/db.js';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'migrations');

async function main(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const applied = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
  );
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('[migrate] 적용할 마이그레이션이 없습니다.');
    return;
  }

  for (const file of pending) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    console.log(`[migrate] 적용: ${file}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error('[migrate] 실패', error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
