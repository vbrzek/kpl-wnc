import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const AVATARS_DIR = path.resolve(__dirname, '../../uploads/avatars');

const EXTERNAL_ORIGINS = [
  'https://lh3.googleusercontent.com',
  'https://cdn.discordapp.com',
];

export function isExternalAvatarUrl(url: string | null): boolean {
  if (!url) return false;
  return EXTERNAL_ORIGINS.some(origin => url.startsWith(origin));
}

/**
 * Downloads an external avatar URL and saves it locally.
 * Returns the local public URL, or null on failure.
 */
export async function cacheAvatar(externalUrl: string, userId: number): Promise<string | null> {
  const backendUrl = process.env.PUBLIC_BACKEND_URL ?? 'http://localhost:3000';
  const filePath = path.join(AVATARS_DIR, `${userId}.jpg`);

  try {
    if (!fs.existsSync(AVATARS_DIR)) {
      fs.mkdirSync(AVATARS_DIR, { recursive: true });
    }

    const res = await fetch(externalUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const buffer = await res.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(buffer));

    return `${backendUrl}/uploads/avatars/${userId}.jpg`;
  } catch {
    return null;
  }
}
