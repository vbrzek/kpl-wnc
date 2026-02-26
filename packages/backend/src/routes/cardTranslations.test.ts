import { describe, it, expect, vi } from 'vitest';
import { fetchCardTranslations } from './cardTranslations.js';

function makeChain(rows: { id: number; text: string }[]) {
  return {
    select: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    whereIn: vi.fn().mockResolvedValue(rows),
  };
}

describe('fetchCardTranslations', () => {
  it('returns empty objects when no IDs provided, makes no DB calls', async () => {
    const mockKnex = vi.fn() as any;
    const result = await fetchCardTranslations(mockKnex, 'ru', [], []);
    expect(result).toEqual({ black: {}, white: {} });
    expect(mockKnex).not.toHaveBeenCalled();
  });

  it('returns translated black card text', async () => {
    const chain = makeChain([{ id: 1, text: 'Почему ____?' }]);
    const mockKnex = Object.assign(vi.fn(() => chain), {
      raw: vi.fn((s: string) => s),
    }) as any;

    const result = await fetchCardTranslations(mockKnex, 'ru', [1], []);
    expect(result.black['1']).toBe('Почему ____?');
    expect(result.white).toEqual({});
  });

  it('returns translated white card text', async () => {
    const chain = makeChain([{ id: 7, text: 'Путин' }]);
    const mockKnex = Object.assign(vi.fn(() => chain), {
      raw: vi.fn((s: string) => s),
    }) as any;

    const result = await fetchCardTranslations(mockKnex, 'ru', [], [7]);
    expect(result.white['7']).toBe('Путин');
    expect(result.black).toEqual({});
  });

  it('handles both black and white card IDs', async () => {
    let callIdx = 0;
    const mockKnex = Object.assign(
      vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        whereIn: vi.fn().mockImplementation(() => {
          callIdx++;
          if (callIdx === 1) return Promise.resolve([{ id: 3, text: 'Black text' }]);
          return Promise.resolve([{ id: 9, text: 'White text' }]);
        }),
      })),
      { raw: vi.fn((s: string) => s) },
    ) as any;

    const result = await fetchCardTranslations(mockKnex, 'cs', [3], [9]);
    expect(result.black['3']).toBe('Black text');
    expect(result.white['9']).toBe('White text');
  });
});
