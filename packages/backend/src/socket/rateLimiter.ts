// Sliding window rate limiter pro Socket.io eventy
// Limity jsou záměrně velkorysé — cílem je ochrana před spamem, ne throttling

const calls = new Map<string, Map<string, number[]>>();

interface Limit {
  max: number;      // max počet volání
  windowMs: number; // za tuto dobu v ms
}

const LIMITS: Record<string, Limit> = {
  'lobby:create':         { max: 3,  windowMs: 30_000 },
  'lobby:join':           { max: 10, windowMs: 10_000 },
  'lobby:updateSettings': { max: 10, windowMs: 5_000  },
  'game:playCards':       { max: 10, windowMs: 5_000  },
  'game:judgeSelect':     { max: 10, windowMs: 5_000  },
  'game:tradeCards':      { max: 3,  windowMs: 10_000 },
};

/**
 * Vrátí true pokud je volání povoleno (v limitu), false pokud je rate limit překročen.
 * Automaticky čistí záznamy starší než windowMs.
 */
export function checkRateLimit(socketId: string, event: string): boolean {
  const limit = LIMITS[event];
  if (!limit) return true; // neomezený event

  if (!calls.has(socketId)) calls.set(socketId, new Map());
  const socketCalls = calls.get(socketId)!;
  if (!socketCalls.has(event)) socketCalls.set(event, []);

  const now = Date.now();
  const timestamps = socketCalls.get(event)!;

  // Odstraň záznamy starší než window
  const cutoff = now - limit.windowMs;
  const recent = timestamps.filter(t => t > cutoff);
  socketCalls.set(event, recent);

  if (recent.length >= limit.max) return false;

  recent.push(now);
  return true;
}

/** Vyčisti záznamy pro socket po odpojení */
export function cleanupSocket(socketId: string): void {
  calls.delete(socketId);
}
