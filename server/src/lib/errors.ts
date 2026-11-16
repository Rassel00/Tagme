import type { ErrorRequestHandler, RequestHandler } from 'express';

/**
 * API 에러 응답 형식: { error: { code, message, details? } }
 * code 는 클라이언트가 분기에 쓰는 고정 문자열 (예: consent_required, tag_inactive).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message = '요청 형식이 올바르지 않습니다.', details?: unknown): ApiError {
    return new ApiError(400, 'invalid_request', message, details);
  }

  static unauthorized(message = '로그인이 필요합니다.'): ApiError {
    return new ApiError(401, 'unauthorized', message);
  }

  static forbidden(code = 'forbidden', message = '권한이 없습니다.'): ApiError {
    return new ApiError(403, code, message);
  }

  static notFound(code = 'not_found', message = '대상을 찾을 수 없습니다.'): ApiError {
    return new ApiError(404, code, message);
  }

  static gone(code: string, message: string): ApiError {
    return new ApiError(410, code, message);
  }

  static tooManyRequests(message = '요청이 너무 많습니다. 잠시 후 다시 시도하세요.'): ApiError {
    return new ApiError(429, 'too_many_requests', message);
  }
}

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function toErrorBody(error: ApiError): ErrorBody {
  const body: ErrorBody = { error: { code: error.code, message: error.message } };
  if (error.details !== undefined) body.error.details = error.details;
  return body;
}

export const apiNotFoundHandler: RequestHandler = (_req, _res, next) => {
  next(ApiError.notFound('route_not_found', '존재하지 않는 API입니다.'));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json(toErrorBody(err));
    return;
  }
  // express.json() 의 잘못된 JSON 본문
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json(toErrorBody(ApiError.badRequest('JSON 형식이 올바르지 않습니다.')));
    return;
  }
  console.error(err);
  res.status(500).json(toErrorBody(new ApiError(500, 'internal_error', '서버 오류가 발생했습니다.')));
};
