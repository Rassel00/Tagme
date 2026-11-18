import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * 응급 지원 웹(t.html: /t/:tagId, /aed)과 보호자 승인 웹(a.html: /a/:approveToken).
 * 진입점을 나눠 승인 페이지가 응급 페이지 코드를 받지 않게 한다.
 * 빌드 결과(web/dist)는 Express 가 서빙한다 (src/app.ts).
 */
const root = resolve(import.meta.dirname, 'web');

export default defineConfig({
  root,
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        t: resolve(root, 't.html'),
        a: resolve(root, 'a.html'),
      },
    },
  },
});
