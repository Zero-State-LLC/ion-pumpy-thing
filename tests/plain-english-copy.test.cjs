const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('each lesson brief names an action and the source card stays accessible', () => {
  const section = html.match(/const BRIEFS = \[([\s\S]*?)\];/);
  assert.ok(section, 'BRIEFS section exists');
  const briefs = [...section[1].matchAll(/^\s*'([^']*)',?\s*$/gm)].map(m => m[1]);
  assert.equal(briefs.length, 6);
  for (const brief of briefs) assert.ok(brief.length > 50, 'brief contains useful instructions');
  assert.match(html, /<summary>Explanation and sources<\/summary>/);
});

test('plain-English copy preserves science versus game model distinction', () => {
  assert.match(html, /This is a game model, not a demonstrated method\./);
  assert.match(html, /Beta compares plasma pressure with magnetic pressure\./);
  assert.match(html, /This follows a simplified rule based on the report\./);
});
