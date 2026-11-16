import type { Request, RequestHandler } from 'express';
import { ApiError } from './errors.js';

/**
 * 고정 창(fixed window) 방식의 메모리 요청 제한.
 * 서버 1대(Render 무료) 기준이라 메모리로 충분하다. 재시작하면 초기화된다.
 */
export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  key: (req: Request) => string;
  now?: () => number;
}): RequestHandler & { hit: (key: string) => boolean } {
  const now = options.now ?? Date.now;
  const windows = new Map<string, { start: number; count: number }>();
  let lastSweep = now();

  /** 허용되면 true */
  const hit = (key: string): boolean => {
    const t = now();
    // 오래된 창을 가끔 정리해 메모리가 쌓이지 않게
    if (t - lastSweep > options.windowMs * 10) {
      for (const [k, w] of windows) if (t - w.start >= options.windowMs) windows.delete(k);
      lastSweep = t;
    }
    const current = windows.get(key);
    if (!current || t - current.start >= options.windowMs) {
      windows.set(key, { start: t, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= options.max;
  };

  const middleware: RequestHandler = (req, _res, next) => {
    if (!hit(options.key(req))) throw ApiError.tooManyRequests();
    next();
  };
  return Object.assign(middleware, { hit });
}
