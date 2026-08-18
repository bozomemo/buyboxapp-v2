/**
 * Exercises `nodeHttpsFetch` against a real, local `http` server — not a live call to any
 * marketplace (doc 10 §10, CLAUDE.md). This is the transport `TrendyolPublicPageSource` now
 * defaults to instead of the platform `fetch`; see node-https-fetch.ts's doc comment for why.
 */
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nodeHttpsFetch } from './node-https-fetch.js';

describe('nodeHttpsFetch', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/redirect-once') {
        res.writeHead(302, { Location: '/target' });
        res.end();
        return;
      }
      if (req.url === '/redirect-loop') {
        res.writeHead(302, { Location: '/redirect-loop' });
        res.end();
        return;
      }
      if (req.url === '/target') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html>ok</html>');
        return;
      }
      if (req.url === '/forbidden') {
        res.writeHead(403);
        res.end('blocked');
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('returns status, ok and body for a direct 200', async () => {
    const res = await nodeHttpsFetch(`${baseUrl}/target`, { headers: {} });
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(await res.text()).toBe('<html>ok</html>');
  });

  it('follows a redirect to its target (doc 04 §1.5: canonical link)', async () => {
    const res = await nodeHttpsFetch(`${baseUrl}/redirect-once`, { headers: {} });
    expect(res.status).toBe(200);
    expect(res.url).toBe(`${baseUrl}/target`);
    expect(await res.text()).toBe('<html>ok</html>');
  });

  it('gives up on a redirect loop rather than hanging forever', async () => {
    // Redirects stop being followed once the budget is spent; the caller sees the still-3xx
    // response (not `ok`) rather than the request hanging indefinitely.
    const res = await nodeHttpsFetch(`${baseUrl}/redirect-loop`, { headers: {} });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(302);
  });

  it('reports a non-2xx as not ok, without throwing', async () => {
    const res = await nodeHttpsFetch(`${baseUrl}/forbidden`, { headers: {} });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
  });

  it('sends the given headers verbatim', async () => {
    let seen: string | undefined;
    const probe = http.createServer((req, res) => {
      seen = req.headers['user-agent'];
      res.writeHead(200);
      res.end('ok');
    });
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const { port } = probe.address() as AddressInfo;
    try {
      await nodeHttpsFetch(`http://127.0.0.1:${port}/`, { headers: { 'User-Agent': 'BuyBoxApp/1.0 (+reporting)' } });
      expect(seen).toBe('BuyBoxApp/1.0 (+reporting)');
    } finally {
      await new Promise<void>((resolve) => probe.close(() => resolve()));
    }
  });

  it('aborts an already-aborted signal immediately', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(nodeHttpsFetch(`${baseUrl}/target`, { headers: {}, signal: controller.signal })).rejects.toThrow();
  });
});
