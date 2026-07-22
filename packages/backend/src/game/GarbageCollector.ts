import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@kpl/shared';
import { roomManager } from './RoomManager.js';
import { toPublicRoom, broadcastPublicRooms } from '../socket/roundUtils.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

const LOBBY_IDLE_MS = 15 * 60 * 1000;   // 15 minut
const GAME_IDLE_MS  = 30 * 60 * 1000;   // 30 minut
const STALE_PLAYER_MS = 10 * 60 * 1000; // offline hráč v LOBBY = mrtvá instance
const GC_INTERVAL_MS = 5 * 60 * 1000;   // každých 5 minut

const ACTIVE_STATUSES = new Set(['SELECTION', 'JUDGING', 'RESULTS']);

export function startGarbageCollector(io: IO): void {
  setInterval(() => {
    const now = Date.now();
    for (const room of roomManager.getAllRooms()) {
      const idle = now - room.lastActivityAt;
      if (room.status === 'LOBBY' && idle > LOBBY_IDLE_MS) {
        io.to(`room:${room.code}`).emit('room:deleted');
        roomManager.deleteRoom(room.code);
      } else if (ACTIVE_STATUSES.has(room.status) && idle > GAME_IDLE_MS) {
        io.to(`room:${room.code}`).emit('room:deleted');
        roomManager.deleteRoom(room.code);
      }
    }

    // Mrtvé instance: hráči offline > 10 min v LOBBY (ztracené localStorage,
    // in-app prohlížeč apod.) — uvolní jejich přezdívku pro nový join
    const affected = roomManager.removeStalePlayers(STALE_PLAYER_MS);
    let anyRemoved = false;
    for (const room of affected) {
      anyRemoved = true;
      const stillExists = roomManager.getRoom(room.code);
      if (stillExists) {
        io.to(`room:${room.code}`).emit('lobby:stateUpdate', toPublicRoom(stillExists));
      } else {
        io.to(`room:${room.code}`).emit('room:deleted');
      }
    }
    if (anyRemoved) broadcastPublicRooms(io);
  }, GC_INTERVAL_MS);
}
