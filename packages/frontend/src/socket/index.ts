import { io } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@kpl/shared';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

export const socket = io<ServerToClientEvents, ClientToServerEvents>(BACKEND_URL, {
  autoConnect: false,
});

socket.on('connect', () => {
  console.log(`[Socket] Connected: ${socket.id}`);
});

socket.on('disconnect', (reason) => {
  console.log(`[Socket] Disconnected: ${reason}`);
});

const STARTUP_ID_KEY = 'kpl-startup-id';

socket.on('server:hello', (startupId) => {
  const stored = localStorage.getItem(STARTUP_ID_KEY);
  localStorage.setItem(STARTUP_ID_KEY, String(startupId));
  if (stored !== null && stored !== String(startupId)) {
    window.location.reload();
  }
});
