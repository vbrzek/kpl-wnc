import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Module-level cache: survives component remounts within the same page session
const cache = new Map<string, string>();
// Reactive counter: increments after each fetch so computed properties re-evaluate
const cacheVersion = ref(0);

function cacheKey(lang: string, type: 'b' | 'w', id: number): string {
  return `${lang}:${type}:${id}`;
}

export function useCardTranslations() {
  const { locale } = useI18n();
  const backendUrl = import.meta.env.VITE_BACKEND_URL as string;

  async function fetchTranslations(blackIds: number[], whiteIds: number[]): Promise<void> {
    const lang = locale.value;
    const uncachedBlack = blackIds.filter((id) => !cache.has(cacheKey(lang, 'b', id)));
    const uncachedWhite = whiteIds.filter((id) => !cache.has(cacheKey(lang, 'w', id)));
    if (uncachedBlack.length === 0 && uncachedWhite.length === 0) return;

    const params = new URLSearchParams({ lang });
    if (uncachedBlack.length) params.set('blackIds', uncachedBlack.join(','));
    if (uncachedWhite.length) params.set('whiteIds', uncachedWhite.join(','));

    try {
      const res = await fetch(`${backendUrl}/api/cards/translations?${params}`);
      if (!res.ok) return;
      const data = await res.json() as {
        black: Record<string, string>;
        white: Record<string, string>;
      };
      for (const [id, text] of Object.entries(data.black)) {
        cache.set(cacheKey(lang, 'b', Number(id)), text);
      }
      for (const [id, text] of Object.entries(data.white)) {
        cache.set(cacheKey(lang, 'w', Number(id)), text);
      }
      cacheVersion.value++;
    } catch {
      // Silently fail — components fall back to original text
    }
  }

  function getBlack(id: number, fallback: string): string {
    void cacheVersion.value; // reactive dependency — re-evaluates computed when cache is populated
    return cache.get(cacheKey(locale.value, 'b', id)) ?? fallback;
  }

  function getWhite(id: number, fallback: string): string {
    void cacheVersion.value; // reactive dependency — re-evaluates computed when cache is populated
    return cache.get(cacheKey(locale.value, 'w', id)) ?? fallback;
  }

  return { fetchTranslations, getBlack, getWhite };
}
