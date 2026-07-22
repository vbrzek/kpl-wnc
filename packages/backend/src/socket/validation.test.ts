import { describe, it, expect } from 'vitest';
import { UpdateAvatarSchema, JoinRoomSchema, CreateRoomSchema, LeaveRoomSchema } from './validation.js';

describe('UpdateAvatarSchema (avatar URL allowlist)', () => {
  it('accepts null', () => {
    expect(UpdateAvatarSchema.safeParse(null).success).toBe(true);
  });

  it('accepts DiceBear URLs', () => {
    expect(UpdateAvatarSchema.safeParse('https://api.dicebear.com/9.x/bottts/svg?seed=Pepa').success).toBe(true);
  });

  it('accepts any googleusercontent subdomain', () => {
    expect(UpdateAvatarSchema.safeParse('https://lh3.googleusercontent.com/a/pic').success).toBe(true);
    expect(UpdateAvatarSchema.safeParse('https://lh5.googleusercontent.com/a/pic').success).toBe(true);
  });

  it('accepts Discord CDN URLs', () => {
    expect(UpdateAvatarSchema.safeParse('https://cdn.discordapp.com/avatars/1/abc.png').success).toBe(true);
  });

  it('accepts relative cached avatar paths', () => {
    expect(UpdateAvatarSchema.safeParse('/uploads/avatars/5.png').success).toBe(true);
  });

  it('accepts absolute URLs pointing at the backend uploads dir', () => {
    expect(UpdateAvatarSchema.safeParse('http://localhost:3000/uploads/avatars/5.jpg').success).toBe(true);
  });

  it('rejects arbitrary external URLs', () => {
    expect(UpdateAvatarSchema.safeParse('https://evil.example.com/tracker.gif').success).toBe(false);
  });

  it('rejects non-http schemes', () => {
    expect(UpdateAvatarSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(UpdateAvatarSchema.safeParse('data:image/svg+xml,<svg/>').success).toBe(false);
  });

  it('rejects path traversal in relative paths', () => {
    expect(UpdateAvatarSchema.safeParse('/uploads/avatars/../../secret').success).toBe(false);
  });

  it('rejects lookalike hosts', () => {
    expect(UpdateAvatarSchema.safeParse('https://api.dicebear.com.evil.cz/x').success).toBe(false);
  });
});

describe('JoinRoomSchema avatarUrl', () => {
  const base = { code: 'ABC234', nickname: 'Pepa' };

  it('accepts a missing avatarUrl', () => {
    expect(JoinRoomSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a disallowed avatarUrl', () => {
    expect(JoinRoomSchema.safeParse({ ...base, avatarUrl: 'https://evil.example.com/x.png' }).success).toBe(false);
  });

  it('accepts a DiceBear avatarUrl', () => {
    expect(JoinRoomSchema.safeParse({ ...base, avatarUrl: 'https://api.dicebear.com/9.x/bottts/svg?seed=Pepa' }).success).toBe(true);
  });
});

describe('guestId in join/create schemas', () => {
  const base = { code: 'ABC234', nickname: 'Pepa' };
  const GUEST = '11111111-1111-4111-8111-111111111111';

  it('JoinRoomSchema accepts a missing guestId', () => {
    expect(JoinRoomSchema.safeParse(base).success).toBe(true);
  });

  it('JoinRoomSchema accepts a UUID guestId', () => {
    expect(JoinRoomSchema.safeParse({ ...base, guestId: GUEST }).success).toBe(true);
  });

  it('JoinRoomSchema rejects a non-UUID guestId', () => {
    expect(JoinRoomSchema.safeParse({ ...base, guestId: 'not-a-uuid' }).success).toBe(false);
  });

  it('CreateRoomSchema accepts a UUID guestId', () => {
    const settings = {
      name: 'Stul', isPublic: true, selectedSetIds: [1], maxPlayers: 6,
      nickname: 'Pepa', targetScore: 8, guestId: GUEST,
    };
    expect(CreateRoomSchema.safeParse(settings).success).toBe(true);
  });
});

describe('LeaveRoomSchema', () => {
  it('accepts undefined payload', () => {
    expect(LeaveRoomSchema.safeParse(undefined).success).toBe(true);
  });

  it('accepts a payload with a UUID playerToken', () => {
    expect(LeaveRoomSchema.safeParse({ playerToken: '11111111-1111-4111-8111-111111111111' }).success).toBe(true);
  });

  it('rejects a non-UUID playerToken', () => {
    expect(LeaveRoomSchema.safeParse({ playerToken: 'x' }).success).toBe(false);
  });
});
