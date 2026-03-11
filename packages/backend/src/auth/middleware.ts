import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from './jwt.js';
import type { JwtPayload } from './jwt.js';

// Type augmentation — importovat v každém souboru, kde se používá jwtUser
declare module 'fastify' {
  interface FastifyRequest {
    jwtUser?: JwtPayload;
  }
}

export async function verifyJwt(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = (request.headers.cookie ?? '').match(/kpl_token=([^;]+)/)?.[1];
  if (!token) { reply.status(401).send({ error: 'Unauthorized' }); return; }
  const payload = verifyToken(decodeURIComponent(token));
  if (!payload) { reply.status(401).send({ error: 'Unauthorized' }); return; }
  request.jwtUser = payload;
}
