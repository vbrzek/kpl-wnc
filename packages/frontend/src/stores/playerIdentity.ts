/**
 * Trvalá identita hráče v tomto prohlížeči.
 *
 * `kpl_guestId` se vygeneruje jednou a NIKDY se nemaže ani nepřepisuje —
 * server podle něj pozná vracejícího se hráče i po ztrátě per-room tokenu.
 * Per-room tokeny zůstávají jako rychlá cesta reconnectu a pro výpis
 * aktivních stolů na HomeView; jejich ztráta už ale identitu nezničí.
 */

const GUEST_ID_KEY = 'kpl_guestId';

/** UUID v4 i mimo secure context (LAN přes http nemá crypto.randomUUID). */
function generateUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getGuestId(): string {
  let id = localStorage.getItem(GUEST_ID_KEY);
  if (!id) {
    id = generateUuid();
    localStorage.setItem(GUEST_ID_KEY, id);
  }
  return id;
}

// Klíč vždy z kanonického (uppercase) kódu — URL může přijít i lowercase
function tokenKey(roomCode: string): string {
  return `playerToken_${roomCode.toUpperCase()}`;
}

export function savePlayerToken(roomCode: string, token: string) {
  localStorage.setItem(tokenKey(roomCode), token);
}

export function loadPlayerToken(roomCode: string): string | null {
  return localStorage.getItem(tokenKey(roomCode));
}

export function removePlayerToken(roomCode: string) {
  localStorage.removeItem(tokenKey(roomCode));
}
