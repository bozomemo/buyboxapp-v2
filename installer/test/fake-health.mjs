// Test helper for apply-update-harness.ps1: a stand-in for the service's /api/health.
//
//   node fake-health.mjs <port> <state file>
//
// Answers with the JSON in <state file> verbatim, or 503 when the file says "down". The stub
// stop/start scripts in the harness write that file, which is how the fake service starts, stops
// and comes up healthy or broken.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const [port, stateFile] = process.argv.slice(2);
createServer((request, response) => {
  let body = 'down';
  try {
    const raw = readFileSync(stateFile, 'utf8');
    body = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim();
  } catch {
    // no state yet: down
  }
  if (body === 'down' || request.url !== '/api/health') {
    response.writeHead(503).end();
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' }).end(body);
}).listen(Number(port), '127.0.0.1');
