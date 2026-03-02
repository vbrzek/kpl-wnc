import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { roomManager } from './game/RoomManager.js';
import type { ManagerSnapshot } from './game/RoomManager.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@kpl/shared';
import { registerLobbyHandlers } from './socket/lobbyHandlers.js';
import { registerGameHandlers } from './socket/gameHandlers.js';
import { startGarbageCollector } from './game/GarbageCollector.js';
import cardSetsRoutes from './routes/cardSets.js';
import cardTranslationsRoute from './routes/cardTranslations.js';
import roomsRoutes from './routes/rooms.js';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const SNAPSHOT_PATH = process.env.SNAPSHOT_PATH ?? '/tmp/kpl-snapshot.json';
const STARTUP_ID = Date.now();

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  },
});

app.get('/health', async () => ({ status: 'ok' }));

await app.register(cardSetsRoutes, { prefix: '/api' });
await app.register(cardTranslationsRoute, { prefix: '/api' });
await app.register(roomsRoutes, { prefix: '/api' });

io.on('connection', (socket) => {
  socket.emit('server:hello', STARTUP_ID);
  app.log.info(`Client connected: ${socket.id}`);
  io.emit('server:clientCount', io.engine.clientsCount);

  registerLobbyHandlers(io, socket);
  registerGameHandlers(io, socket);

  socket.on('disconnect', () => {
    app.log.info(`Client disconnected: ${socket.id}`);
    io.emit('server:clientCount', io.engine.clientsCount);
  });
});

if (fs.existsSync(SNAPSHOT_PATH)) {
  try {
    const raw = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
    const snapshot = JSON.parse(raw) as ManagerSnapshot;
    fs.unlinkSync(SNAPSHOT_PATH); // smazat před restore — při pádu se neopakuje
    roomManager.restore(snapshot);
    app.log.info(`Restored ${snapshot.rooms.length} room(s) from snapshot.`);
  } catch (err) {
    app.log.error({ err }, 'Failed to restore snapshot — starting fresh.');
  }
}

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
startGarbageCollector(io);

function gracefulShutdown(signal: string) {
  app.log.info(`${signal} received — saving snapshot...`);
  try {
    const snapshot = roomManager.serialize();
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot));
    app.log.info(`Snapshot saved to ${SNAPSHOT_PATH}`);
  } catch (err) {
    app.log.error({ err }, 'Failed to write snapshot — state will be lost on restart.');
  }
  app.close().then(() => process.exit(0)).catch(() => process.exit(1));
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
