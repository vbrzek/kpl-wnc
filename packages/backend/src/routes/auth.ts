import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import db from '../db/db.js';
import { signToken } from '../auth/jwt.js';
import { verifyJwt } from '../auth/middleware.js';

// #7 — single FRONTEND_URL constant
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

export interface UserRow {
  id: number;
  provider: string;
  provider_id: string;
  email: string | null;
  nickname: string | null;
  locale: string;
  avatar_type: 'oauth' | 'dicebear';
  avatar_url: string | null;
  dicebear_style: string | null;
  dicebear_seed: string | null;
  role: string;
}

// #8 — Zod schema for PATCH /api/me (#9 — nickname max 24)
const UpdateMeSchema = z.object({
  nickname: z.string().max(24).trim().optional(),
  locale: z.string().max(5).optional(),
  avatarType: z.enum(['oauth', 'dicebear']).optional(),
  dicebearStyle: z.string().max(50).nullable().optional(),
  dicebearSeed: z.string().max(100).nullable().optional(),
});

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
    role: user.role,
  };
}

/**
 * Find an existing user by email (cross-provider) or by provider+provider_id,
 * or insert a new record. Returns userId and whether it was newly created.
 */
async function findOrCreateUser(params: {
  email: string | null;
  provider: 'google' | 'discord';
  providerId: string;
  avatarUrl: string | null;
}): Promise<{ userId: number; isNew: boolean }> {
  const { email, provider, providerId, avatarUrl } = params;

  // 1. Cross-provider linking by email
  if (email) {
    const byEmail = await db<UserRow>('users').where({ email }).first();
    if (byEmail) {
      await db('users').where({ id: byEmail.id }).update({
        provider,
        provider_id: providerId,
        avatar_url: avatarUrl,
      });
      return { userId: byEmail.id, isNew: false };
    }
  }

  // 2. Same-provider re-login
  const byProvider = await db<UserRow>('users')
    .where({ provider, provider_id: providerId })
    .first();
  if (byProvider) {
    await db('users').where({ id: byProvider.id }).update({
      avatar_url: avatarUrl,
      ...(email && !byProvider.email ? { email } : {}),
    });
    return { userId: byProvider.id, isNew: false };
  }

  // 3. New user
  const [insertedId] = await db('users').insert({
    provider,
    provider_id: providerId,
    email,
    avatar_url: avatarUrl,
  });
  return { userId: insertedId, isNew: true };
}

// #2 — shared OAuth callback handler
async function handleOAuthCallback(
  fastify: { log: { error: (err: unknown, msg: string) => void } },
  reply: FastifyReply,
  provider: 'google' | 'discord',
  fetchUserInfo: () => Promise<{ email: string | null; providerId: string; avatarUrl: string | null }>,
) {
  try {
    const userInfo = await fetchUserInfo();
    const { userId, isNew } = await findOrCreateUser({
      email: userInfo.email,
      provider,
      providerId: userInfo.providerId,
      avatarUrl: userInfo.avatarUrl,
    });
    setJwtCookie(reply, { userId, provider });
    return reply.redirect(`${FRONTEND_URL}/?auth=${isNew ? 'new' : 'success'}`);
  } catch (err) {
    fastify.log.error(err, `${provider} OAuth callback failed`);
    return reply.redirect(`${FRONTEND_URL}/?auth=error`);
  }
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // #6 — decorateRequest for type-safe jwtUser
  fastify.decorateRequest('jwtUser', undefined);

  fastify.get('/api/me', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const user = await db<UserRow>('users').where({ id: userId }).first();
    if (!user) return reply.status(404).send({ error: 'User not found' });
    return formatUser(user);
  });

  fastify.patch('/api/me', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;

    // #8 — Zod validation
    const parsed = UpdateMeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid data' });
    }
    const body = parsed.data;

    const updates: Partial<UserRow> = {};
    if (body.nickname !== undefined) updates.nickname = body.nickname || null;
    if (body.locale !== undefined) updates.locale = body.locale;
    if (body.avatarType !== undefined) updates.avatar_type = body.avatarType;
    if (body.dicebearStyle !== undefined) updates.dicebear_style = body.dicebearStyle ?? null;
    if (body.dicebearSeed !== undefined) updates.dicebear_seed = body.dicebearSeed ?? null;
    await db('users').where({ id: userId }).update(updates);
    const user = await db<UserRow>('users').where({ id: userId }).first();
    return formatUser(user!);
  });

  fastify.post('/auth/logout', async (_request, reply) => {
    reply.clearCookie('kpl_token', { path: '/' });
    return { ok: true };
  });

  // #2 — deduplicated Google callback
  fastify.get('/auth/google/callback', async (request, reply) => {
    return handleOAuthCallback(fastify, reply, 'google', async () => {
      const { token } = await (fastify as any).googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch Google user info');
      const googleUser = await res.json() as { sub: string; email?: string; picture?: string };
      return {
        email: googleUser.email ?? null,
        providerId: googleUser.sub,
        avatarUrl: googleUser.picture ?? null,
      };
    });
  });

  // #2 — deduplicated Discord callback
  fastify.get('/auth/discord/callback', async (request, reply) => {
    return handleOAuthCallback(fastify, reply, 'discord', async () => {
      const { token } = await (fastify as any).discordOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
      const res = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch Discord user info');
      const discordUser = await res.json() as { id: string; email?: string; avatar?: string };
      const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`
        : null;
      return {
        email: discordUser.email ?? null,
        providerId: discordUser.id,
        avatarUrl,
      };
    });
  });
};

export default authRoutes;
