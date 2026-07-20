import { buildDiceBearUrl } from '@kpl/shared';

export interface AvatarFields {
  avatar_type?: string | null;
  avatar_url?: string | null;
  dicebear_style?: string | null;
  dicebear_seed?: string | null;
  nickname?: string | null;
}

/** Resolve the avatar a user actually chose (dicebear volba má přednost před OAuth fotkou). */
export function resolveAvatarUrl(user: AvatarFields): string | null {
  if (user.avatar_type === 'dicebear') {
    return buildDiceBearUrl(user.dicebear_style, user.dicebear_seed ?? user.nickname);
  }
  return user.avatar_url ?? null;
}
