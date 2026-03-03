import { z } from 'zod';
import type { SpecialRule } from '@kpl/shared';

// --- Sdílené schémata ---

const nickname = z.string().min(1).max(24).trim();
const roomCode = z.string().toUpperCase().regex(/^[A-Z2-9]{6}$/, 'Neplatný kód místnosti');

const VALID_RULES: SpecialRule[] = [
  'rando_cardrissian', 'god_mode', 'wheatons_law',
  'rebooting_universe', 'meritocracy', 'high_stakes',
];

const specialRules = z.array(z.enum(VALID_RULES as [SpecialRule, ...SpecialRule[]])).default([]);

// --- Schémata pro jednotlivé eventy ---

export const CreateRoomSchema = z.object({
  name: z.string().min(1).max(30).trim(),
  isPublic: z.boolean(),
  selectedSetIds: z.array(z.number().int().positive()).min(1),
  maxPlayers: z.number().int().min(3).max(10),
  nickname,
  targetScore: z.number().int().refine(v => [8, 10, 15, 20, 30].includes(v), {
    message: 'Cílový počet bodů musí být 8, 10, 15, 20 nebo 30',
  }),
  specialRules,
});

export const JoinRoomSchema = z.object({
  code: roomCode,
  nickname: z.string().max(24).trim(),
  playerToken: z.string().uuid().optional(),
});

export const UpdateSettingsSchema = z.object({
  name: z.string().min(1).max(30).trim().optional(),
  isPublic: z.boolean().optional(),
  selectedSetIds: z.array(z.number().int().positive()).min(1).optional(),
  maxPlayers: z.number().int().min(3).max(10).optional(),
  specialRules: specialRules.optional(),
});

export const ChooseBlackCardSchema = z.number().int().positive();
export const PlaceBetSchema = z.number().int().min(0).max(100);

export const PlayCardsSchema = z.array(z.number().int().positive()).min(1).max(3);

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
