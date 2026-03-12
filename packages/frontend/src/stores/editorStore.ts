import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { UserCardSet, EditorCard, EditorCardsPage } from '@kpl/shared';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

export const useEditorStore = defineStore('editor', () => {
  const mySets = ref<UserCardSet[]>([]);
  const currentSet = ref<UserCardSet | null>(null);
  const cards = ref<EditorCard[]>([]);
  const cardsTotal = ref(0);
  const cardsPage = ref(1);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const ownSets = computed(() => mySets.value.filter((s) => s.isOwn));
  const otherSets = computed(() => mySets.value.filter((s) => !s.isOwn));

  async function fetchMySets(view?: 'mine' | 'all'): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const url = view === 'all' ? `${BACKEND_URL}/api/editor/sets?view=all` : `${BACKEND_URL}/api/editor/sets`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Nepodařilo se načíst sady.');
      mySets.value = await res.json();
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function fetchSet(id: number): Promise<void> {
    const res = await fetch(`${BACKEND_URL}/api/editor/sets/${id}`, { credentials: 'include' });
    if (!res.ok) { error.value = 'Sada nenalezena.'; return; }
    currentSet.value = await res.json();
  }

  async function createSet(data: { name: string; description?: string; isPublic: boolean }): Promise<UserCardSet | null> {
    const res = await fetch(`${BACKEND_URL}/api/editor/sets`, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) { error.value = 'Nepodařilo se vytvořit sadu.'; return null; }
    const set = await res.json() as UserCardSet;
    mySets.value.push(set);
    return set;
  }

  async function updateSet(id: number, data: Partial<{ name: string; description: string | null; isPublic: boolean }>): Promise<void> {
    const res = await fetch(`${BACKEND_URL}/api/editor/sets/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) return;
    const updated = await res.json();
    const idx = mySets.value.findIndex((s) => s.id === id);
    if (idx !== -1) mySets.value[idx] = { ...mySets.value[idx], ...updated };
    if (currentSet.value?.id === id) currentSet.value = { ...currentSet.value, ...updated };
  }

  async function deleteSet(id: number): Promise<void> {
    await fetch(`${BACKEND_URL}/api/editor/sets/${id}`, { method: 'DELETE', credentials: 'include' });
    mySets.value = mySets.value.filter((s) => s.id !== id);
    if (currentSet.value?.id === id) currentSet.value = null;
  }

  async function fetchCards(params: { type: 'black' | 'white'; search?: string; setId?: number; excludeSetId?: number; untranslated?: boolean; unassigned?: boolean; page?: number }): Promise<void> {
    const url = new URL(`${BACKEND_URL}/api/editor/cards`);
    url.searchParams.set('type', params.type);
    if (params.search) url.searchParams.set('search', params.search);
    if (params.setId) url.searchParams.set('setId', String(params.setId));
    if (params.excludeSetId) url.searchParams.set('excludeSetId', String(params.excludeSetId));
    if (params.untranslated) url.searchParams.set('untranslated', 'true');
    if (params.unassigned) url.searchParams.set('unassigned', 'true');
    url.searchParams.set('page', String(params.page ?? 1));
    const res = await fetch(url.toString(), { credentials: 'include' });
    if (!res.ok) return;
    const data: EditorCardsPage = await res.json();
    cards.value = data.cards;
    cardsTotal.value = data.total;
    cardsPage.value = data.page;
  }

  async function addCardToSet(setId: number, type: 'black' | 'white', cardId: number): Promise<void> {
    await fetch(`${BACKEND_URL}/api/editor/sets/${setId}/cards`, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, cardId }),
    });
  }

  async function removeCardFromSet(setId: number, type: 'black' | 'white', cardId: number): Promise<void> {
    await fetch(`${BACKEND_URL}/api/editor/sets/${setId}/cards/${type}/${cardId}`, {
      method: 'DELETE', credentials: 'include',
    });
  }

  async function replicateSet(targetSetId: number, sourceSetId: number): Promise<{ blackCount: number; whiteCount: number } | null> {
    const res = await fetch(`${BACKEND_URL}/api/editor/sets/${targetSetId}/replicate`, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceSetId }),
    });
    if (!res.ok) return null;
    return res.json();
  }

  async function fetchCardDetail(type: 'black' | 'white', id: number): Promise<any | null> {
    const res = await fetch(`${BACKEND_URL}/api/editor/cards/${type}/${id}`, { credentials: 'include' });
    if (!res.ok) return null;
    return res.json();
  }

  async function updateCard(type: 'black' | 'white', id: number, data: { text?: string; pick?: number; translations?: Record<string, string> }): Promise<boolean> {
    const res = await fetch(`${BACKEND_URL}/api/editor/cards/${type}/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.ok;
  }

  async function deleteCard(type: 'black' | 'white', id: number): Promise<boolean> {
    const res = await fetch(`${BACKEND_URL}/api/editor/cards/${type}/${id}`, { method: 'DELETE', credentials: 'include' });
    return res.ok;
  }

  async function createCard(data: {
    type: 'black' | 'white'; text: string; pick?: number; setId: number;
    translations?: Partial<Record<'en' | 'ru' | 'uk' | 'es', string>>;
  }): Promise<EditorCard | null> {
    const res = await fetch(`${BACKEND_URL}/api/editor/cards`, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    return res.json();
  }

  return {
    mySets, ownSets, otherSets, currentSet, cards, cardsTotal, cardsPage, loading, error,
    fetchMySets, fetchSet, createSet, updateSet, deleteSet,
    fetchCards, fetchCardDetail, updateCard, deleteCard, addCardToSet, removeCardFromSet, replicateSet, createCard,
  };
});
