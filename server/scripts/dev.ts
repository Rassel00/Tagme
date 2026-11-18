/**
 * 개발 실행: 웹 클라이언트 `vite build --watch` 와 서버 `tsx watch` 를 함께 띄운다.
 * Vite 개발 서버(5173) 대신 Express(3000)로 보는 이유: 카카오 JavaScript 키 등록 도메인이 localhost:3000.
 * 하나가 끝나면 나머지도 종료한다.
 */
import { spawn, type ChildProcess } from 'node:child_process';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const children: ChildProcess[] = [
  spawn(npx, ['vite', 'build', '--watch'], { stdio: 'inherit', shell: process.platform === 'win32' }),
  spawn(npx, ['tsx', 'watch', 'src/index.ts'], { stdio: 'inherit', shell: process.platform === 'win32' }),
];

let isStopping = false;
function stopAll(code: number): void {
  if (isStopping) return;
  isStopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}

for (const child of children) child.on('exit', (code) => stopAll(code ?? 0));
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
