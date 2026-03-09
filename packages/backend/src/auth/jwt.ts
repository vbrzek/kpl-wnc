import jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: number;
  provider: 'google' | 'discord';
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '30d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
  } catch {
    return null;
  }
}

export function extractUserIdFromCookieHeader(cookieHeader: string): number | null {
  const match = cookieHeader.match(/kpl_token=([^;]+)/);
  if (!match) return null;
  return verifyToken(decodeURIComponent(match[1]))?.userId ?? null;
}
