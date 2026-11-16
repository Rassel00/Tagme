import pg from 'pg';
import { config } from './config.js';

let pool: pg.Pool | undefined;

/** pg.Pool 과 PoolClient 둘 다 받는 쿼리 함수 타입 */
export type Queryable = Pick<pg.Pool, 'query'>;

export function isDbConfigured(): boolean {
  return pool !== undefined || config.databaseUrl !== undefined;
}

export function getPool(): pg.Pool {
  if (pool) return pool;
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL이 설정되지 않았습니다. server/.env 를 확인하세요.');
  }
  pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
  return pool;
}

/** 테스트에서 별도 스키마로 연결한 풀을 끼워 넣을 때 사용 */
export function setPool(next: pg.Pool): void {
  pool = next;
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
