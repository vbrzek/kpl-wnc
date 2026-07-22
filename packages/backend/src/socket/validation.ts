import { z } from 'zod';
import type { SpecialRule, WinCondition, CzarMode } from '@kpl/shared';

// --- Sdílené schémata ---

const nickname = z.string().min(1).max(24).trim();
const roomCode = z.string().toUpperCase().regex(/^[A-Z2-9]{6}$/, 'Neplatný kód místnosti');

const VALID_RULES: SpecialRule[] = [
  'rando_cardrissian', 'wheatons_law',
  'rebooting_universe', 'high_stakes', 'carte_blanche',
];

const specialRules = z.array(z.enum(VALID_RULES as [SpecialRule, ...SpecialRule[]])).default([]);

const VALID_CZAR_MODES: CzarMode[] = ['classic', 'meritocracy', 'god_mode', 'czar_is_dead'];
const czarMode = z.enum(VALID_CZAR_MODES as [CzarMode, ...CzarMode[]]).default('classic');

const VALID_WIN_CONDITIONS: WinCondition[] = ['score', 'time', 'rounds'];
const winCondition = z.enum(VALID_WIN_CONDITIONS as [WinCondition, ...WinCondition[]]).default('score');

// --- Avatar URL allowlist ---
// Avatar URL od klienta se renderuje v <img> všem hráčům v místnosti —
// bez allowlistu jde ostatním podstrčit tracking pixel nebo cizí obsah.

const AVATAR_HOSTS = ['api.dicebear.com', 'cdn.discordapp.com', 'googleusercontent.com'];

function isAllowedAvatarUrl(url: string): boolean {
  if (url.startsWith('/uploads/avatars/')) return !url.includes('..');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const backendUrl = process.env.PUBLIC_BACKEND_URL ?? 'http://localhost:3000';
  if (url.startsWith(`${backendUrl}/uploads/avatars/`)) return true;
  if (parsed.protocol !== 'https:') return false;
  return AVATAR_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
}

// --- Schémata pro jednotlivé eventy ---

const avatarUrlValue = z.string().max(500).refine(isAllowedAvatarUrl, { message: 'Nepovolená avatar URL' });
const avatarUrl = avatarUrlValue.nullable().optional();

export const CreateRoomSchema = z.object({
  name: z.string().min(1).max(30).trim(),
  isPublic: z.boolean(),
  selectedSetIds: z.array(z.number().int().positive()).min(1),
  maxPlayers: z.number().int().min(3).max(10),
  nickname,
  avatarUrl,
  targetScore: z.number().int().refine(v => [8, 10, 15, 20, 30].includes(v), {
    message: 'Cílový počet bodů musí být 8, 10, 15, 20 nebo 30',
  }),
  specialRules,
  czarMode,
  winCondition: winCondition,
  targetRounds: z.number().int().min(5).max(100).default(20),
  gameTimeLimit: z.number().int().refine(v => v >= 5 && v <= 60 && v % 5 === 0, {
    message: 'Časový limit musí být 5–60 minut v krocích 5.',
  }).default(15),
  guestId: z.string().uuid().optional(),
});

export const JoinRoomSchema = z.object({
  code: roomCode,
  nickname: z.string().max(24).trim(),
  avatarUrl,
  playerToken: z.string().uuid().optional(),
  guestId: z.string().uuid().optional(),
});

export const LeaveRoomSchema = z.object({
  playerToken: z.string().uuid().optional(),
}).optional();

export const ProfileUpdateNicknameSchema = z.object({
  guestId: z.string().uuid(),
  nickname,
});

export const UpdateAvatarSchema = avatarUrlValue.nullable();

export const UpdateSettingsSchema = z.object({
  name: z.string().min(1).max(30).trim().optional(),
  isPublic: z.boolean().optional(),
  selectedSetIds: z.array(z.number().int().positive()).min(1).optional(),
  maxPlayers: z.number().int().min(3).max(10).optional(),
  specialRules: specialRules.optional(),
  czarMode: czarMode.optional(),
  winCondition: winCondition.optional(),
  targetScore: z.number().int().refine(v => [8, 10, 15, 20, 30].includes(v), {
    message: 'Cílový počet bodů musí být 8, 10, 15, 20 nebo 30',
  }).optional(),
  targetRounds: z.number().int().min(5).max(100).optional(),
  gameTimeLimit: z.number().int().refine(v => v >= 5 && v <= 60 && v % 5 === 0, {
    message: 'Časový limit musí být 5–60 minut v krocích 5.',
  }).optional(),
});

export const ChooseBlackCardSchema = z.number().int().positive();
export const PlaceBetSchema = z.number().int().min(0).max(100);

export const PlayCardsSchema = z.object({
  cardIds: z.array(z.number().int().min(0)).min(1).max(3),
  blankCardText: z.string().max(200).optional(),
});

export const VoteSchema = z.union([
  z.string().uuid(),
  z.literal('rando_cardrissian'),
]);

export const JudgeSelectSchema = z.union([
  z.string().uuid(),
  z.literal('rando_cardrissian'),
]);

export const KickPlayerSchema = z.string().uuid('Neplatné playerId');

export const UpdateNicknameSchema = z.string().min(1).max(24).trim();

// --- Helper ---

/** Zvaliduje data. Pokud selže, zavolá callback (pokud existuje) a vrátí null. */
export function validate<T>(
  schema: z.ZodType<T>,
  data: unknown,
  callback?: (result: { error: string }) => void
): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues[0]?.message ?? 'Neplatná data.';
    if (callback) callback({ error: msg });
    return null;
  }
  return result.data;
}
