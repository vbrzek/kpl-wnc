import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const AVATARS_DIR = path.resolve(__dirname, '../../uploads/avatars');

const EXTERNAL_HOSTS = ['googleusercontent.com', 'cdn.discordapp.com'];

export function isExternalAvatarUrl(url: string | null): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return EXTERNAL_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
}

const CONTENT_TYPE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Downloads an external avatar URL and saves it locally.
 * Returns the relative public URL (`/uploads/avatars/<id>.<ext>`), or null on failure.
 * Relativní cesta záměrně — absolutní origin doplňuje až klient, takže změna
 * PUBLIC_BACKEND_URL / LAN vývoj nerozbije uložené avatary.
 */
export async function cacheAvatar(externalUrl: string, userId: number): Promise<string | null> {
  try {
    if (!fs.existsSync(AVATARS_DIR)) {
      fs.mkdirSync(AVATARS_DIR, { recursive: true });
    }

    const res = await fetch(externalUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type')?.split(';')[0].trim() ?? '';
    const ext = CONTENT_TYPE_EXT[contentType] ?? 'jpg';

    const buffer = await res.arrayBuffer();
    fs.writeFileSync(path.join(AVATARS_DIR, `${userId}.${ext}`), Buffer.from(buffer));

    return `/uploads/avatars/${userId}.${ext}`;
  } catch {
    return null;
  }
}
