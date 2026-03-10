import jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: number;
  provider: 'google' | 'discord';
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing required environment variable: JWT_SECRET');
  return secret;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: '30d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

export function extractUserIdFromCookieHeader(cookieHeader: string): number | null {
  const match = cookieHeader.match(/kpl_token=([^;]+)/);
  if (!match) return null;
  return verifyToken(decodeURIComponent(match[1]))?.userId ?? null;
}
