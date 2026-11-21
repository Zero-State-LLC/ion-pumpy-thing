// The browser check needs Node 22's built-in WebSocket. On a Node without it,
// it must say so and skip locally, or fail in CI, before it looks for Chrome.
// `--no-experimental-websocket` removes the global, as on Node 20. See #21.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const check = path.join(__dirname, 'browser-check.mjs');
function runWithoutWebSocket(env) {
  return spawnSync(process.execPath, ['--no-experimental-websocket', check], { env, encoding: 'utf8', timeout: 30000 });
}
const { CI, ...envWithoutCI } = process.env;

test("without Node 22's built-in WebSocket, the browser check skips locally and names Node 22", () => {
  const run = runWithoutWebSocket(envWithoutCI);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Node 22/);
  assert.match(run.stdout, /Skipped\./);
});

test("without Node 22's built-in WebSocket, the browser check fails in CI and names Node 22", () => {
  const run = runWithoutWebSocket({ ...envWithoutCI, CI: 'true' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Node 22/);
  assert.match(run.stderr, /CI needs it, so this fails\./);
});
