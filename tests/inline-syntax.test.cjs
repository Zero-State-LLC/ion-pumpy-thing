const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');

test('inline game script parses before runtime and browser checks', () => {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  const inline = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(inline, 'inline game script exists');
  assert.doesNotThrow(() => new Script(inline[1], { filename: 'index.html' }));
});
