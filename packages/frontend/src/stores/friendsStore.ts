import { defineStore } from 'pinia';
import { ref } from 'vue';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

export interface FriendEntry {
  friendshipId: number;
  userId: number;
  nickname: string;
  avatarUrl: string | null;
}

export interface FriendRequest {
  friendshipId: number;
  fromUserId: number;
  fromNick: string;
  fromAvatarUrl: string | null;
}

export const useFriendsStore = defineStore('friends', () => {
  const friends = ref<FriendEntry[]>([]);
  const requests = ref<FriendRequest[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchFriends() {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`${BACKEND_URL}/api/friends`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      friends.value = await res.json();
    } catch {
      error.value = 'Nepodařilo se načíst přátele.';
    } finally {
      loading.value = false;
    }
  }

  async function fetchRequests() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/friends/requests`, { credentials: 'include' });
      if (res.ok) requests.value = await res.json();
    } catch { /* silent */ }
  }

  async function sendRequest(addresseeId: number): Promise<string | null> {
    const res = await fetch(`${BACKEND_URL}/api/friends/request`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ addresseeId }),
    });
    if (res.status === 201) return null;
    const body = await res.json().catch(() => ({}));
    return body.error ?? 'Chyba při odesílání žádosti.';
  }

  async function acceptRequest(friendshipId: number) {
    const res = await fetch(`${BACKEND_URL}/api/friends/accept/${friendshipId}`, {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok) {
      const req = requests.value.find(r => r.friendshipId === friendshipId);
      if (req) {
        requests.value = requests.value.filter(r => r.friendshipId !== friendshipId);
        friends.value.push({
          friendshipId,
          userId: req.fromUserId,
          nickname: req.fromNick,
          avatarUrl: req.fromAvatarUrl,
        });
      }
    }
  }

  async function rejectOrRemove(friendshipId: number) {
    const res = await fetch(`${BACKEND_URL}/api/friends/${friendshipId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      requests.value = requests.value.filter(r => r.friendshipId !== friendshipId);
      friends.value = friends.value.filter(f => f.friendshipId !== friendshipId);
    }
  }

  function inviteToGame(friendUserId: number, roomCode: string) {
    // Emitted via socket — handled in component using useSocket
    return { friendUserId, roomCode };
  }

  // Called from socket event listener to update store reactively
  function addIncomingRequest(req: FriendRequest) {
    if (!requests.value.find(r => r.friendshipId === req.friendshipId)) {
      requests.value.unshift(req);
    }
  }

  function markRequestAccepted(friendshipId: number, friend: FriendEntry) {
    requests.value = requests.value.filter(r => r.friendshipId !== friendshipId);
    if (!friends.value.find(f => f.friendshipId === friendshipId)) {
      friends.value.push(friend);
    }
  }

  return {
    friends, requests, loading, error,
    fetchFriends, fetchRequests, sendRequest,
    acceptRequest, rejectOrRemove, inviteToGame,
    addIncomingRequest, markRequestAccepted,
  };
});
