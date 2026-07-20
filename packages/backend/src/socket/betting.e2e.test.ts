// E2E test sázek (High Stakes) přes reálný Socket.io stack.
// Mockuje se pouze DB modul — handlery, RoomManager i GameEngine běží naostro.
// Scénáře pokrývají hlášený bug: „hráč vsadí, nevyhraje, a body neztratí — a jindy naopak".
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as clientIO, type Socket as ClientSocket } from 'socket.io-client';

const { dbMock } = vi.hoisted(() => {
  const BLACKS = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, text: `Black ${i + 1} ___`, pick: 1 }));
  const WHITES = Array.from({ length: 300 }, (_, i) => ({ id: i + 1, text: `White ${i + 1}` }));
  function makeBuilder(table: string) {
    const dataFor = () =>
      table === 'black_cards' ? BLACKS.map(c => ({ ...c }))
      : table === 'white_cards' ? WHITES.map(c => ({ ...c }))
      : [];
    const builder: any = new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === 'then') {
          return (res: any, rej: any) => Promise.resolve(dataFor()).then(res, rej);
        }
        return (..._args: unknown[]) => builder;
      },
      apply() { return builder; },
    });
    return builder;
  }
  const dbMock: any = (table: string) => makeBuilder(table);
  dbMock.fn = { now: () => new Date() };
  dbMock.transaction = async (cb: any) => cb((table: string) => makeBuilder(table));
  return { dbMock };
});

vi.mock('../db/db.js', () => ({ default: dbMock }));

import { registerLobbyHandlers } from './lobbyHandlers.js';
import { registerGameHandlers } from './gameHandlers.js';
import { roomManager } from '../game/RoomManager.js';

// ---------------------------------------------------------------- infra

let httpServer: HttpServer;
let io: Server;
let port: number;
const openClients: ClientSocket[] = [];

beforeAll(async () => {
  httpServer = createServer();
  io = new Server(httpServer, { cors: { origin: '*' } });
  io.on('connection', (socket) => {
    registerLobbyHandlers(io as any, socket as any);
    registerGameHandlers(io as any, socket as any);
  });
  await new Promise<void>((res) => httpServer.listen(0, res));
  port = (httpServer.address() as { port: number }).port;
});

afterAll(async () => {
  for (const c of openClients) c.disconnect();
  io.close();
  await new Promise<void>((res) => httpServer.close(() => res()));
});

function connect(): Promise<ClientSocket> {
  return new Promise((res, rej) => {
    const sock = clientIO(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
    openClients.push(sock);
    sock.on('connect', () => res(sock));
    sock.on('connect_error', rej);
  });
}

function emitAck<T = any>(sock: ClientSocket, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((res) => sock.emit(event as any, ...args, (result: T) => res(result)));
}

function waitFor<T = any>(sock: ClientSocket, event: string, timeoutMs = 8000): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout waiting for ${event}`)), timeoutMs);
    sock.once(event as any, (payload: T) => { clearTimeout(t); res(payload); });
  });
}

interface TestPlayer {
  sock: ClientSocket;
  playerId: string;
  nickname: string;
  hand: { id: number; text: string }[];
  mySubmissionId?: string;
}

/** Založí stůl se 4 hráči, spustí hru, vrátí hráče + kód místnosti + czarId prvního kola. */
async function setupGame(opts: {
  specialRules: string[];
  czarMode?: string;
}): Promise<{ players: TestPlayer[]; code: string; czarId: string }> {
  const hostSock = await connect();
  const created = await emitAck(hostSock, 'lobby:create', {
    name: `bet-test-${Math.random().toString(36).slice(2, 8)}`,
    isPublic: false,
    selectedSetIds: [1],
    maxPlayers: 6,
    nickname: 'Host',
    targetScore: 30,
    specialRules: opts.specialRules,
    czarMode: opts.czarMode ?? 'classic',
  });
  expect(created).not.toHaveProperty('error');
  const code: string = created.room.code;

  const players: TestPlayer[] = [
    { sock: hostSock, playerId: created.playerId, nickname: 'Host', hand: [] },
  ];
  for (const nickname of ['Alice', 'Bob', 'Cyril']) {
    const sock = await connect();
    const joined = await emitAck(sock, 'lobby:join', { code, nickname });
    expect(joined).not.toHaveProperty('error');
    players.push({ sock, playerId: joined.playerId, nickname, hand: [] });
  }

  // Posluchače roundStart před startem hry
  const roundStarts = players.map(p => waitFor<any>(p.sock, 'game:roundStart'));
  const started = await emitAck(hostSock, 'lobby:startGame');
  expect(started).not.toHaveProperty('error');
  const startPayloads = await Promise.all(roundStarts);
  players.forEach((p, i) => { p.hand = startPayloads[i].hand.filter((c: any) => !c.isBlank); });
  const czarId: string = startPayloads[0].czarId;
  return { players, code, czarId };
}

/** Zahraje první kartu z ruky a uloží si submissionId. */
async function playFirstCard(p: TestPlayer): Promise<void> {
  const subIdPromise = waitFor<string>(p.sock, 'game:mySubmissionId');
  p.sock.emit('game:playCards', { cardIds: [p.hand[0].id] });
  p.mySubmissionId = await subIdPromise;
}

function scoresOf(code: string): Record<string, number> {
  const room = roomManager.getRoom(code)!;
  return Object.fromEntries(room.players.map(pl => [pl.id, pl.score]));
}

/** Dá hráčům výchozí skóre přímo v room stavu (sdílené objekty s enginem). */
function seedScores(code: string, score: number): void {
  const room = roomManager.getRoom(code)!;
  for (const pl of room.players) pl.score = score;
}

function expireDeadline(code: string): void {
  const room = roomManager.getRoom(code)!;
  room.roundDeadline = Date.now() - 1000;
}

// ---------------------------------------------------------------- scénáře

describe('High Stakes E2E — klasický mód', () => {
  it('vítěz získá 1+sázku, poražený sázku ztratí (baseline)', async () => {
    const { players, code, czarId } = await setupGame({ specialRules: ['high_stakes'] });
    seedScores(code, 3);
    const nonCzars = players.filter(p => p.playerId !== czarId);
    const czar = players.find(p => p.playerId === czarId)!;
    const [a, b, c] = nonCzars;

    expect(await emitAck(a.sock, 'game:placeBet', 2)).toEqual({ ok: true });
    expect(await emitAck(b.sock, 'game:placeBet', 1)).toEqual({ ok: true });

    const judging = waitFor<any[]>(czar.sock, 'game:judging');
    for (const p of nonCzars) await playFirstCard(p);
    await judging;

    const roundEnd = waitFor<any>(czar.sock, 'game:roundEnd');
    czar.sock.emit('game:judgeSelect', a.mySubmissionId);
    const result = await roundEnd;

    expect(result.winnerId).toBe(a.playerId);
    expect(result.scores[a.playerId]).toBe(3 + 1 + 2);           // vítěz: +1 výhra +2 sázka
    expect(result.scores[b.playerId]).toBe(3 - 1);               // prohrál sázku 1
    expect(result.scores[c.playerId]).toBe(3);                   // nesázel
  }, 15000);

  it('když car nesoudí a kolo se přeskočí, sázky se vracejí (nedohrané kolo = neplatné)', async () => {
    const { players, code, czarId } = await setupGame({ specialRules: ['high_stakes'] });
    seedScores(code, 3);
    const nonCzars = players.filter(p => p.playerId !== czarId);
    const [a, b] = nonCzars;

    expect(await emitAck(a.sock, 'game:placeBet', 2)).toEqual({ ok: true });
    expect(await emitAck(b.sock, 'game:placeBet', 1)).toEqual({ ok: true });

    const judging = waitFor<any>(a.sock, 'game:judging');
    for (const p of nonCzars) await playFirstCard(p);
    await judging;

    // Car „usnul" — vyprší deadline a někdo klikne na přeskočení
    expireDeadline(code);
    const skipped = waitFor<any>(a.sock, 'game:roundSkipped');
    a.sock.emit('game:skipCzarJudging');
    await skipped;

    // Další kolo odstartuje po SKIP_DELAY_MS (3 s)
    await waitFor<any>(a.sock, 'game:roundStart', 8000);

    const scores = scoresOf(code);
    // Zvolená sémantika: přeskočené kolo je neplatné → sázky se vracejí (skóre
    // se nemění). Rando větev zůstává — tam kolo reálně proběhlo a Rando vyhrál.
    expect(scores[a.playerId]).toBe(3);
    expect(scores[b.playerId]).toBe(3);
  }, 15000);
});

describe('High Stakes E2E — czar_is_dead (hlasování)', () => {
  it('vítěz hlasování získá 1+sázku, poražený sázku ztratí (baseline)', async () => {
    const { players, code } = await setupGame({ specialRules: ['high_stakes'], czarMode: 'czar_is_dead' });
    seedScores(code, 3);
    const [host, a, b, c] = players;

    expect(await emitAck(a.sock, 'game:placeBet', 2)).toEqual({ ok: true });
    expect(await emitAck(b.sock, 'game:placeBet', 1)).toEqual({ ok: true });

    const judging = waitFor<any>(host.sock, 'game:judging');
    for (const p of players) await playFirstCard(p);
    await judging;

    // Všichni hlasují pro submisi hráče A (A hlasuje pro B — vlastní volit nesmí)
    const roundEnd = waitFor<any>(host.sock, 'game:roundEnd');
    host.sock.emit('game:vote', a.mySubmissionId);
    b.sock.emit('game:vote', a.mySubmissionId);
    c.sock.emit('game:vote', a.mySubmissionId);
    a.sock.emit('game:vote', b.mySubmissionId);
    const result = await roundEnd;

    expect(result.winnerIds).toEqual([a.playerId]);
    expect(result.scores[a.playerId]).toBe(3 + 1 + 2);
    expect(result.scores[b.playerId]).toBe(3 - 1);
    expect(result.scores[c.playerId]).toBe(3);
  }, 15000);

  it('nikdo nehlasuje → skipVoting: sázky se vracejí (kolo bez vítěze = neplatné)', async () => {
    const { players, code } = await setupGame({ specialRules: ['high_stakes'], czarMode: 'czar_is_dead' });
    seedScores(code, 3);
    const [host, a, b] = players;

    expect(await emitAck(a.sock, 'game:placeBet', 2)).toEqual({ ok: true });
    expect(await emitAck(b.sock, 'game:placeBet', 1)).toEqual({ ok: true });

    const judging = waitFor<any>(host.sock, 'game:judging');
    for (const p of players) await playFirstCard(p);
    await judging;

    // Nikdo nehlasuje, deadline vyprší, někdo klikne „přeskočit hlasování"
    expireDeadline(code);
    const roundEnd = waitFor<any>(host.sock, 'game:roundEnd');
    host.sock.emit('game:skipVoting');
    const result = await roundEnd;

    expect(result.winnerId).toBeNull();
    // Zvolená sémantika: nikdo nehlasoval → kolo bez vítěze, sázky se vracejí.
    expect(result.scores[a.playerId]).toBe(3);
    expect(result.scores[b.playerId]).toBe(3);
  }, 15000);

  it('server odmítne game:skipCzarJudging v czar_is_dead módu — odhlasované kolo nelze zrušit špatným skip eventem', async () => {
    const { players, code } = await setupGame({ specialRules: ['high_stakes'], czarMode: 'czar_is_dead' });
    seedScores(code, 3);
    const [host, a, b, c] = players;

    expect(await emitAck(a.sock, 'game:placeBet', 2)).toEqual({ ok: true });
    expect(await emitAck(b.sock, 'game:placeBet', 1)).toEqual({ ok: true });

    const judging = waitFor<any>(host.sock, 'game:judging');
    for (const p of players) await playFirstCard(p);
    await judging;

    // 3 ze 4 hlasují pro A — jasný vítěz hlasování, ale poslední hlas nedorazí
    host.sock.emit('game:vote', a.mySubmissionId);
    b.sock.emit('game:vote', a.mySubmissionId);
    c.sock.emit('game:vote', a.mySubmissionId);
    await waitFor<any>(host.sock, 'game:voteUpdate');

    // Deadline vyprší a hráč B (prohrávající sázkař!) zkusí ŠPATNÝ skip event —
    // server ho musí odmítnout (správná cesta v czar_is_dead je game:skipVoting):
    expireDeadline(code);
    const rejected = waitFor<string>(b.sock, 'game:error');
    b.sock.emit('game:skipCzarJudging');
    await rejected;

    // Kolo pořád běží — dokončí se přes skipVoting a hlasy se vyhodnotí
    const roundEnd = waitFor<any>(host.sock, 'game:roundEnd');
    b.sock.emit('game:skipVoting');
    const result = await roundEnd;

    expect(result.winnerIds).toEqual([a.playerId]);
    expect(result.scores[a.playerId]).toBe(3 + 1 + 2); // vítěz hlasování +1 +sázka
    expect(result.scores[b.playerId]).toBe(3 - 1);     // prohraná sázka
  }, 15000);
});
