import { z } from 'zod';

// --- Sdílené schémata ---

const nickname = z.string().min(1).max(24).trim();
const roomCode = z.string().toUpperCase().regex(/^[A-Z2-9]{6}$/, 'Neplatný kód místnosti');

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
});

export const PlayCardsSchema = z.array(z.number().int().positive()).min(1).max(3);

export const JudgeSelectSchema = z.string().uuid('Neplatné submissionId');

export const KickPlayerSchema = z.string().uuid('Neplatné playerId');

// --- Helper ---

/** Zvaliduje data. Pokud selže, zavolá callback (pokud existuje) a vrátí null. */
export function validate<T>(
  schema: z.ZodType<T>,
  data: unknown,
  callback?: (result: { error: string }) => void
): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.errors[0]?.message ?? 'Neplatná data.';
    if (callback) callback({ error: msg });
    return null;
  }
  return result.data;
}
