import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import db from '../db/db.js';
import { verifyToken, signToken } from '../auth/jwt.js';

export interface UserRow {
  id: number;
  provider: string;
  provider_id: string;
  nickname: string | null;
  locale: string;
  avatar_type: 'oauth' | 'dicebear';
  avatar_url: string | null;
  dicebear_style: string | null;
  dicebear_seed: string | null;
}

function setJwtCookie(reply: FastifyReply, payload: { userId: number; provider: 'google' | 'discord' }) {
  const token = signToken(payload);
  reply.setCookie('kpl_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
}

async function verifyJwt(request: FastifyRequest, reply: FastifyReply) {
  const token = (request.headers.cookie ?? '').match(/kpl_token=([^;]+)/)?.[1];
  if (!token) return reply.status(401).send({ error: 'Unauthorized' });
  const payload = verifyToken(decodeURIComponent(token));
  if (!payload) return reply.status(401).send({ error: 'Unauthorized' });
  (request as FastifyRequest & { jwtUser: { userId: number; provider: string } }).jwtUser = payload;
}

function formatUser(user: UserRow) {
  return {
    id: user.id,
    provider: user.provider,
    nickname: user.nickname,
    locale: user.locale,
    avatarType: user.avatar_type,
    avatarUrl: user.avatar_url,
    dicebearStyle: user.dicebear_style,
    dicebearSeed: user.dicebear_seed,
  };
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/me', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = (request as any).jwtUser;
    const user = await db<UserRow>('users').where({ id: userId }).first();
    if (!user) return reply.status(404).send({ error: 'User not found' });
    return formatUser(user);
  });

  fastify.patch('/api/me', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = (request as any).jwtUser;
    const body = request.body as {
      nickname?: string;
      locale?: string;
      avatarType?: 'oauth' | 'dicebear';
      dicebearStyle?: string | null;
      dicebearSeed?: string | null;
    };
    const updates: Partial<UserRow> = {};
    if (body.nickname !== undefined) updates.nickname = body.nickname.trim().slice(0, 50) || null;
    if (body.locale !== undefined) updates.locale = body.locale.slice(0, 5);
    if (body.avatarType !== undefined) updates.avatar_type = body.avatarType;
    if (body.dicebearStyle !== undefined) updates.dicebear_style = body.dicebearStyle;
    if (body.dicebearSeed !== undefined) updates.dicebear_seed = body.dicebearSeed?.slice(0, 100) ?? null;
    await db('users').where({ id: userId }).update(updates);
    const user = await db<UserRow>('users').where({ id: userId }).first();
    return formatUser(user!);
  });

  fastify.post('/auth/logout', async (_request, reply) => {
    reply.clearCookie('kpl_token', { path: '/' });
    return { ok: true };
  });

  fastify.get('/auth/google/callback', async (request, reply) => {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    try {
      const { token } = await (fastify as any).googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch Google user info');
      const googleUser = await res.json() as { sub: string; picture?: string };

      const existing = await db<UserRow>('users')
        .where({ provider: 'google', provider_id: googleUser.sub })
        .first();

      let userId: number;
      let isNew = false;

      if (existing) {
        await db('users').where({ id: existing.id }).update({ avatar_url: googleUser.picture ?? null });
        userId = existing.id;
      } else {
        const [insertedId] = await db('users').insert({
          provider: 'google',
          provider_id: googleUser.sub,
          avatar_url: googleUser.picture ?? null,
        });
        userId = insertedId;
        isNew = true;
      }

      setJwtCookie(reply, { userId, provider: 'google' });
      return reply.redirect(`${frontendUrl}/?auth=${isNew ? 'new' : 'success'}`);
    } catch (err) {
      fastify.log.error(err, 'Google OAuth callback failed');
      return reply.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/?auth=error`);
    }
  });

  fastify.get('/auth/discord/callback', async (request, reply) => {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    try {
      const { token } = await (fastify as any).discordOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
      const res = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch Discord user info');
      const discordUser = await res.json() as { id: string; avatar?: string };
      const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`
        : null;

      const existing = await db<UserRow>('users')
        .where({ provider: 'discord', provider_id: discordUser.id })
        .first();

      let userId: number;
      let isNew = false;

      if (existing) {
        await db('users').where({ id: existing.id }).update({ avatar_url: avatarUrl });
        userId = existing.id;
      } else {
        const [insertedId] = await db('users').insert({
          provider: 'discord',
          provider_id: discordUser.id,
          avatar_url: avatarUrl,
        });
        userId = insertedId;
        isNew = true;
      }

      setJwtCookie(reply, { userId, provider: 'discord' });
      return reply.redirect(`${frontendUrl}/?auth=${isNew ? 'new' : 'success'}`);
    } catch (err) {
      fastify.log.error(err, 'Discord OAuth callback failed');
      return reply.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/?auth=error`);
    }
  });
};

export default authRoutes;
