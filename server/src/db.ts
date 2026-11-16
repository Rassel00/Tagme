import pg from 'pg';
import { config } from './config.js';

let pool: pg.Pool | undefined;

export function isDbConfigured(): boolean {
  return config.databaseUrl !== undefined;
}

export function getPool(): pg.Pool {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL이 설정되지 않았습니다. server/.env 를 확인하세요.');
  }
  pool ??= new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
  return pool;
}

/** 하나의 커넥션에서 BEGIN/COMMIT 으로 묶어 실행한다. 예외 시 ROLLBACK. */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
