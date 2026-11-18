import type { RequestHandler } from 'express';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { config } from '../config.js';
import { ApiError } from './errors.js';

export interface AuthUser {
  uid: string;
  provider: 'anonymous' | 'google';
  email: string | null;
}

/** Firebase ID 토큰 검증 함수. 테스트에서는 가짜 구현을 넣는다. */
export type VerifyIdToken = (idToken: string) => Promise<AuthUser>;

/** Firebase 계정 삭제 함수 (게스트 계정 삭제). 테스트에서는 가짜 구현을 넣는다. */
export type DeleteAuthUser = (uid: string) => Promise<void>;

function initFirebase(): void {
  if (!config.firebaseServiceAccount) {
    throw new ApiError(503, 'auth_not_configured', '서버에 Firebase 설정이 없습니다.');
  }
  if (getApps().length === 0) {
    initializeApp({ credential: cert(JSON.parse(config.firebaseServiceAccount) as object) });
  }
}

export function createFirebaseUserDeleter(): DeleteAuthUser {
  return async (uid) => {
    initFirebase();
    await getAuth().deleteUser(uid);
  };
}

export function createFirebaseVerifier(): VerifyIdToken {
  return async (idToken) => {
    initFirebase();
    const decoded = await getAuth().verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      provider: decoded.firebase.sign_in_provider === 'anonymous' ? 'anonymous' : 'google',
      email: decoded.email ?? null,
    };
  };
}

/** Authorization: Bearer {ID 토큰} 을 검증해 res.locals.user 에 담는다. */
export function requireAuth(verify: VerifyIdToken): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer (.+)$/.exec(req.get('authorization') ?? '');
    if (!match?.[1]) throw ApiError.unauthorized();
    let user: AuthUser;
    try {
      user = await verify(match[1]);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.unauthorized('로그인 정보가 만료되었거나 올바르지 않습니다.');
    }
    res.locals.user = user;
    next();
  };
}

export function currentUser(locals: Record<string, unknown>): AuthUser {
  const user = locals.user as AuthUser | undefined;
  if (!user) throw ApiError.unauthorized();
  return user;
}
