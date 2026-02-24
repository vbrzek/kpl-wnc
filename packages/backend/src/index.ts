import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@kpl/shared';

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

io.on('connection', (socket) => {
  app.log.info(`Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    app.log.info(`Client disconnected: ${socket.id}`);
  });
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
