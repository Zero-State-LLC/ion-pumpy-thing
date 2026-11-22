const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]);

test('Hallmark source polish retains document-level overflow clipping', () => {
  assert.match(styles.at(-1), /html, body\s*\{[^}]*overflow-x:\s*clip\s*;/);
  assert.match(styles.at(-1), /\.steps\s*\{[^}]*overflow-x:\s*auto\s*;/);
});

test('Hallmark label typography avoids tracked uppercase on provenance and readout labels', () => {
  const css = styles.at(-1);
  for (const selector of ['.tag', '.hud', '.eyebrow', '.panel h3', '.reads dt']) {
    const rule = css.split('\n').find(line => line.trim().startsWith(selector + ' {'));
    assert.ok(rule, 'rule exists: ' + selector);
    assert.doesNotMatch(rule, /letter-spacing:\s*var\(--track-label\)/, selector);
    assert.doesNotMatch(rule, /text-transform:\s*uppercase/, selector);
  }
});

test('Hallmark display head avoids cap collision and small labels stay untracked', () => {
  const css = styles.at(-1);
  const head = css.split('\n').find(line => line.trim().startsWith('.top h1 {'));
  assert.match(head, /line-height:\s*1\s*;/);
  for (const selector of ['.scale b', '.padlabels', '.mlabels']) {
    const rule = css.split('\n').find(line => line.trim().startsWith(selector + ' {'));
    assert.ok(rule, 'rule exists: ' + selector);
    assert.doesNotMatch(rule, /letter-spacing:\s*var\(--track-label\)/, selector);
  }
});
