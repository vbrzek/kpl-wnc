import { describe, it, expect, beforeEach } from 'vitest';
import { getGuestId, savePlayerToken, loadPlayerToken, removePlayerToken } from './playerIdentity';

describe('getGuestId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('generates a UUID on first call and persists it', () => {
    const id = getGuestId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(localStorage.getItem('kpl_guestId')).toBe(id);
  });

  it('returns the same id on subsequent calls', () => {
    const first = getGuestId();
    const second = getGuestId();
    expect(second).toBe(first);
  });

  it('keeps an existing stored id', () => {
    localStorage.setItem('kpl_guestId', '11111111-1111-4111-8111-111111111111');
    expect(getGuestId()).toBe('11111111-1111-4111-8111-111111111111');
  });
});

describe('player token storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('save/load round-trips a token', () => {
    savePlayerToken('ABC234', 'token-1');
    expect(loadPlayerToken('ABC234')).toBe('token-1');
  });

  it('normalizes room code case — lowercase URL finds the stored token', () => {
    savePlayerToken('ABC234', 'token-1');
    expect(loadPlayerToken('abc234')).toBe('token-1');
    savePlayerToken('xyz789', 'token-2');
    expect(loadPlayerToken('XYZ789')).toBe('token-2');
  });

  it('removePlayerToken deletes regardless of case', () => {
    savePlayerToken('ABC234', 'token-1');
    removePlayerToken('abc234');
    expect(loadPlayerToken('ABC234')).toBeNull();
  });
});
