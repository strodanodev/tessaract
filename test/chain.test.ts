import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { declare } from '../src/core/actions';
import type { GameConfig } from '../src/core/types';
import { createChainCheck } from '../src/tools/chain-check';
import { createRpc, SEL } from '../src/tools/evm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GAME_PATH = join(ROOT, 'test', 'fixtures', 'sample-duel.game.json');
const game = JSON.parse(readFileSync(GAME_PATH, 'utf8')) as GameConfig;
const tokenCards = game.cards.map((c, i) => ({ i, tokenId: c.token ? String(c.token.tokenId) : null })).filter((c) => c.tokenId);
const OWNED = tokenCards[0], UNOWNED = tokenCards[1];

const WALLET = `0x${'a1'.repeat(20)}`;
const OTHER = `0x${'b2'.repeat(20)}`;
const PROFILE = `0x${'c3'.repeat(20)}`;
const KEY_BOUND = 'd4'.repeat(32), KEY_REVOKED = 'e5'.repeat(32);
const word = (n: bigint | number | string): string => BigInt(n).toString(16).padStart(64, '0');
const addr = (a: string): string => a.slice(2).padStart(64, '0');

/** A JSON-RPC node that knows one wallet holding OWNED's token, coreStats for every token, and two player keys. */
function fakeChain(): Promise<{ url: string; server: Server }> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const { id, params } = JSON.parse(body) as { id: number; params: [{ to: string; data: string }] };
      const { to, data } = params[0];
      const arg = data.slice(10);
      let result: string | null = null;
      if (to.toLowerCase() === PROFILE && data.startsWith(SEL.ownerOfKey)) {
        result = arg === KEY_BOUND ? addr(WALLET) + word(7) + word(1) : arg === KEY_REVOKED ? addr(WALLET) + word(7) + word(0) : word(0) + word(0) + word(0);
      } else if (data.startsWith(SEL.ownerOf)) {
        result = addr(BigInt(`0x${arg}`).toString() === OWNED.tokenId ? WALLET : OTHER);
      } else if (data.startsWith(SEL.coreStats)) {
        result = [60000, 1000, 50000, 20000, 3, 99].map(word).join('');
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result === null ? { jsonrpc: '2.0', id, error: { code: 3, message: 'execution reverted' } } : { jsonrpc: '2.0', id, result: `0x${result}` }));
    });
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server })));
}

test('chain check: champion stats, the wallet behind a player key, and holdings', async () => {
  const { url, server } = await fakeChain();
  try {
    const collection = game.cards.find((c) => c.token)!.token!.collection;
    const chain = createChainCheck({ rpc: createRpc(url, { retries: 0 }), collection, playerProfile: PROFILE });
    assert.deepEqual(await chain.championStats(OWNED.tokenId!), { strength: 60000, agility: 1000, resilience: 50000, intelligence: 20000 });
    assert.equal(await chain.ownerOf(OWNED.tokenId!), WALLET);
    assert.equal(await chain.walletOf(KEY_BOUND), WALLET);
    assert.equal(await chain.walletOf(KEY_REVOKED), null, 'an inactive profile proves nothing');
    assert.equal(await chain.walletOf('f6'.repeat(32)), null, 'an unbound key proves nothing');
    assert.deepEqual([...await chain.holdings(WALLET, [OWNED.tokenId!, UNOWNED.tokenId!])], [OWNED.tokenId]);
  } finally {
    server.close();
  }
});

test('relay: champion stats come from the chain, and owned-only decks reject cards the wallet lacks', async () => {
  const { url, server } = await fakeChain();
  const port = 7900 + Math.floor(Math.random() * 500);
  const tsx = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const relay = spawn(process.execPath, [tsx, join(ROOT, 'src', 'cli.ts'), 'relay'], {
    cwd: ROOT,
    env: { ...process.env, TCG_DEV: '1', TCG_GAME: GAME_PATH, TCG_RPC: url, TCG_OWNED: '1', GAUNTLET_PORT: String(port), TCG_TTL_MS: '20000' },
  });
  try {
    await new Promise<void>((ready, fail) => {
      relay.stdout.on('data', (d: Buffer) => { if (d.toString().includes(`:${port}`)) ready(); });
      relay.on('exit', (code) => fail(new Error(`relay exited ${code}`)));
    });
    type Msg = { t: string; [k: string]: unknown };
    const join_ = (player: string, hello: Record<string, unknown>) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      const inbox: Msg[] = [];
      const waiters: Array<() => void> = [];
      ws.onmessage = (ev) => { inbox.push(JSON.parse(String(ev.data))); for (const w of waiters.splice(0)) w(); };
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', player, ...hello }));
      const next = async (t: string): Promise<Msg> => {
        for (;;) {
          const i = inbox.findIndex((m) => m.t === t);
          if (i >= 0) return inbox.splice(i, 1)[0];
          await new Promise<void>((w) => waiters.push(w));
        }
      };
      return { ws, next, send: (m: unknown) => ws.send(JSON.stringify(m)) };
    };
    // alice claims absurd stats; the relay must ignore them and read the chain.
    const alice = join_('alice', { wallet: WALLET, champion: { tokenId: OWNED.tokenId, stats: { strength: 65535, agility: 65535, resilience: 65535, intelligence: 65535 } } });
    const bob = join_('bob', { wallet: OTHER });
    const start = await alice.next('start');
    await bob.next('start');
    assert.equal(start.ownedOnly, true);
    const champs = start.champions as Record<string, { tokenId: string | null; stats: Record<string, number> }>;
    assert.deepEqual(champs.alice.stats, { strength: 60000, agility: 1000, resilience: 50000, intelligence: 20000 });
    assert.equal(champs.bob.tokenId, null);
    // alice holds OWNED, not UNOWNED; bob holds neither.
    alice.send({ t: 'act', x: declare(UNOWNED.i) });
    assert.equal((await alice.next('reject')).reason, 'not in your wallet');
    alice.send({ t: 'act', x: declare(OWNED.i) });
    const entry = (await alice.next('entry')).entry as { inputs: number[] };
    // seats follow the order the hellos arrive, and both sockets open at once: read alice's seat, don't assume seat 0
    const aliceSeat = (start.participants as string[]).indexOf('alice');
    assert.ok(aliceSeat >= 0, 'alice is seated');
    assert.equal(entry.inputs[aliceSeat], declare(OWNED.i));
    assert.equal(entry.inputs[1 - aliceSeat], 0, "bob's input is empty");
    bob.send({ t: 'act', x: declare(OWNED.i) });
    assert.equal((await bob.next('reject')).reason, 'not in your wallet');
    alice.ws.close(); bob.ws.close();
  } finally {
    relay.kill();
    server.close();
  }
});
