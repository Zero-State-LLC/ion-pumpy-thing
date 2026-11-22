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


test('locked navigation text clears contrast with margin for antialiasing', () => {
  const css = styles.at(-1);
  const color = name => {
    const match = css.match(new RegExp(name + ':\\s*(#[0-9a-f]{6})\\s*;', 'i'));
    assert.ok(match, name + ' token exists');
    const channels = [1, 3, 5].map(i => Number.parseInt(match[1].slice(i, i + 2), 16) / 255);
    const linear = channels.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const dark = color('--deep'), label = color('--locked');
  const contrast = (Math.max(label, dark) + 0.05) / (Math.min(label, dark) + 0.05);
  assert.ok(contrast >= 5.5, 'locked button contrast has a safety margin; got ' + contrast.toFixed(2));
});
