import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@kpl/shared';
import { registerLobbyHandlers } from './socket/lobbyHandlers.js';
import cardSetsRoutes from './routes/cardSets.js';

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

io.on('connection', (socket) => {
  app.log.info(`Client connected: ${socket.id}`);
  io.emit('server:clientCount', io.engine.clientsCount);

  registerLobbyHandlers(io, socket);

  socket.on('disconnect', () => {
    app.log.info(`Client disconnected: ${socket.id}`);
    io.emit('server:clientCount', io.engine.clientsCount);
  });
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
