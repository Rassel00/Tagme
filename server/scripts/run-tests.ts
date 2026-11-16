/**
 * test/**\/*.test.ts 를 node:test 로 실행한다.
 * Node 20 의 --test 는 .ts 자동 탐색·glob 을 지원하지 않아 파일 목록을 직접 넘긴다.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const testDir = path.resolve(process.cwd(), 'test');
const files = readdirSync(testDir, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => path.join(testDir, f));

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
