import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ApiError } from './errors.js';

type Source = 'body' | 'query' | 'params';

function formatIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

/** zod 스키마로 검증한 값을 그대로 반환. 실패하면 400 invalid_request. */
export function parseOrThrow<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw ApiError.badRequest(undefined, formatIssues(result.error));
  }
  return result.data;
}

/**
 * 요청의 body/query/params 를 검증하는 미들웨어. 검증된 값은 res.locals[source] 에 담는다.
 * (Express 5 에서 req.query 는 읽기 전용이라 덮어쓰지 않는다.)
 */
export function validate<T extends z.ZodType>(source: Source, schema: T): RequestHandler {
  return (req, res, next) => {
    res.locals[source] = parseOrThrow(schema, req[source]);
    next();
  };
}

/** 한국 휴대폰 번호를 숫자만 남긴 형태(01012345678)로 정규화. */
export const phoneSchema = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^01[016789]\d{7,8}$/, '휴대폰 번호 형식이 올바르지 않습니다.'));
