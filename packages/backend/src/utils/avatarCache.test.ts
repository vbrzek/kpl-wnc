import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

import fs from 'fs';
import { isExternalAvatarUrl, cacheAvatar, AVATARS_DIR } from './avatarCache.js';

function mockFetchOk(contentType: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    headers: new Headers({ 'content-type': contentType }),
    arrayBuffer: async () => new ArrayBuffer(8),
  }));
}

describe('isExternalAvatarUrl', () => {
  it('matches lh3.googleusercontent.com', () => {
    expect(isExternalAvatarUrl('https://lh3.googleusercontent.com/a/pic')).toBe(true);
  });

  it('matches any googleusercontent subdomain', () => {
    expect(isExternalAvatarUrl('https://lh5.googleusercontent.com/a/pic')).toBe(true);
    expect(isExternalAvatarUrl('https://lh6.googleusercontent.com/a/pic')).toBe(true);
  });

  it('matches Discord CDN', () => {
    expect(isExternalAvatarUrl('https://cdn.discordapp.com/avatars/1/abc.png')).toBe(true);
  });

  it('rejects lookalike domains', () => {
    expect(isExternalAvatarUrl('https://evilgoogleusercontent.com/x')).toBe(false);
    expect(isExternalAvatarUrl('https://googleusercontent.com.evil.cz/x')).toBe(false);
  });

  it('rejects null and local URLs', () => {
    expect(isExternalAvatarUrl(null)).toBe(false);
    expect(isExternalAvatarUrl('/uploads/avatars/5.jpg')).toBe(false);
  });
});

describe('cacheAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a relative URL (no baked-in host)', async () => {
    mockFetchOk('image/jpeg');
    const url = await cacheAvatar('https://lh3.googleusercontent.com/a/pic', 5);
    expect(url).toBe('/uploads/avatars/5.jpg');
  });

  it('derives file extension from content-type', async () => {
    mockFetchOk('image/png');
    const url = await cacheAvatar('https://lh3.googleusercontent.com/a/pic', 5);
    expect(url).toBe('/uploads/avatars/5.png');
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.join(AVATARS_DIR, '5.png'),
      expect.anything(),
    );
  });

  it('falls back to jpg for unknown content-type', async () => {
    mockFetchOk('application/octet-stream');
    const url = await cacheAvatar('https://lh3.googleusercontent.com/a/pic', 5);
    expect(url).toBe('/uploads/avatars/5.jpg');
  });

  it('returns null when download fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const url = await cacheAvatar('https://lh3.googleusercontent.com/a/pic', 5);
    expect(url).toBeNull();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
