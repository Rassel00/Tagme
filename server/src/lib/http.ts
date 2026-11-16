import type { Request } from 'express';
import { ApiError } from './errors.js';

/** 쿠키 헤더에서 이름으로 값을 꺼낸다 (cookie-parser 없이) */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** 라우트 파라미터를 문자열로 (Express 5 타입은 string | string[]) */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
    throw ApiError.notFound();
  }
  return value;
}
