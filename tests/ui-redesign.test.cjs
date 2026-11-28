// UI/UX Overhaul (#100): viewport-first experimental physics console, complete de-slop cleanup,
// consolidated design system, Hallmark typography hygiene, and adaptive mobile bench.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]);

test('index.html consolidates CSS into one canonical stylesheet with no legacy bolt-on style block', () => {
  assert.equal(styles.length, 1, 'single canonical <style> block');
  assert.doesNotMatch(styles[0], /border-radius:\s*10px/, 'no mismatched 10px rounded bolt-on boxes');
  assert.doesNotMatch(styles[0], /color-scheme:\s*light/, 'no conflicting light color-scheme preamble');
});

test('top console bar eliminates two-tone hero wordmark, side-stripe callout, and monospace prose labels', () => {
  const css = styles[0];
  assert.doesNotMatch(html, /<h1>Ion Pumpy <span>Thing<\/span><\/h1>/, 'single-colour instrument nameplate (clears Hallmark REFLEX 38iii)');
  assert.doesNotMatch(css, /\.brief\s*\{[^}]*border-left:\s*3px/, 'no decorative side stripe on .brief (clears Hallmark WARN 3)');
  for (const sel of ['.tag', '.eyebrow', '.btn.small', '.padlabels', '.mlabels']) {
    const rule = css.split('\n').find(l => l.trim().startsWith(sel + ' {'));
    assert.ok(rule, `rule exists for ${sel}`);
    assert.doesNotMatch(rule, /var\(--mono\)/, `${sel} uses body face, reserving monospace strictly for numeric readouts (clears Hallmark REFLEX 64)`);
  }
});

test('viewport-first layout places the simulation dominant on the left with a docked bench utility bar underneath', () => {
  const css = styles[0];
  assert.match(html, /<div class="stage-col">[\s\S]*?<section class="view"[\s\S]*?<div class="bench-bar">/, 'bench utility strip docked under simulation viewport');
  assert.match(css, /\.deck\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.5\d*fr\)/, 'simulation dominates desktop width (>= 60%)');
  assert.match(css, /\.view\s*\{[^}]*max-height:\s*calc\(100dvh/, 'viewport height capped so simulation + bench bar fit above the fold');
  assert.match(css, /\.reads\s*\{[^}]*gap:\s*1px/, 'telemetry readouts framed as crisp 1px hairline instrument cells');
});

test('purpose-built instrumentation styles custom range sliders, tactile press motion, and reduced-motion safeguards', () => {
  const css = styles[0];
  assert.match(css, /input\[type=range\]::-webkit-slider-thumb/, 'custom machined slider thumb');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, 'reduced-motion CSS safeguard');
  assert.doesNotMatch(css, /transition:\s*all\b/, 'never uses transition: all (Hallmark Floor 2)');
});

test('mobile layout keeps simulation sticky above controls and defers secondary settings below the primary console', () => {
  const css = styles[0];
  const mobile = css.slice(css.indexOf('@media (max-width: 860px)'));
  assert.match(mobile, /\.bench-bar\s*\{[^}]*order:/, 'secondary bench bar defers below active controls on mobile');
  assert.match(mobile, /\.panel\s*\{[^}]*border-top:/, 'docked bottom-sheet console lip on mobile');
});
