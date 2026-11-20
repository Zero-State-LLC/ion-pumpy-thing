const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const APEX = 'https://ion-pumpy-thing.app';
const index = read('index.html');

function meta(html, attr, name) {
  const re = new RegExp(`<meta\\s+[^>]*${attr}=["']${name}["'][^>]*>`, 'i');
  const tag = html.match(re);
  if (!tag) return null;
  const content = tag[0].match(/content=["']([^"']*)["']/i);
  return content ? content[1] : '';
}

test('robots.txt allows crawlers and points at the production sitemap', () => {
  const robots = read('robots.txt');
  assert.match(robots, /^User-agent:\s*\*/m);
  assert.match(robots, /^Allow:\s*\//m);
  assert.match(robots, /^Sitemap:\s*https:\/\/ion-pumpy-thing\.app\/sitemap\.xml\s*$/m);
});

test('sitemap.xml lists only the official production URLs', () => {
  const sitemap = read('sitemap.xml');
  const locs = [...sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1].trim());
  assert.deepEqual(locs, [`${APEX}/`, `${APEX}/privacy`]);
});

test('index.html has canonical, description, social cards, icons, and theme color', () => {
  assert.match(index, /<title>Ion Pumpy Thing<\/title>/);
  assert.equal(meta(index, 'name', 'description')?.length > 40, true);
  assert.equal(meta(index, 'name', 'theme-color'), '#070c20');
  assert.match(index, /<link\s+rel=["']canonical["']\s+href=["']https:\/\/ion-pumpy-thing\.app\/["']/);
  assert.equal(meta(index, 'property', 'og:url'), `${APEX}/`);
  assert.equal(meta(index, 'property', 'og:image'), `${APEX}/assets/og-image.png`);
  assert.equal(meta(index, 'property', 'og:image:width'), '1200');
  assert.equal(meta(index, 'property', 'og:image:height'), '630');
  assert.ok(meta(index, 'property', 'og:image:alt'));
  assert.equal(meta(index, 'name', 'twitter:card'), 'summary_large_image');
  assert.equal(meta(index, 'name', 'twitter:site'), '@z3r0st4t3');
  assert.equal(meta(index, 'name', 'twitter:image'), `${APEX}/assets/og-image.png`);
  assert.match(index, /rel=["']icon["'][^>]*href=["']favicon\.ico["']/);
  assert.match(index, /rel=["']apple-touch-icon["'][^>]*href=["']assets\/apple-touch-icon\.png["']/);
  assert.match(index, /rel=["']manifest["'][^>]*href=["']site\.webmanifest["']/);
  assert.match(index, /href=["']\/privacy["']/);
});

test('JSON-LD describes the game honestly and invents no ratings or reviews', () => {
  const block = index.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(block, 'JSON-LD block missing');
  const data = JSON.parse(block[1].replace(/\\u003c/g, '<'));
  assert.equal(data['@type'], 'VideoGame');
  assert.equal(data.url, `${APEX}/`);
  assert.match(data.description, /six steps/i);
  assert.match(data.description, /4orbs\.com/);
  assert.match(data.description, /aircraft finale/i);
  assert.equal(data.author?.name, 'Zero State LLC');
  assert.equal(data.isAccessibleForFree, true);
  const blob = JSON.stringify(data);
  assert.doesNotMatch(blob, /aggregateRating|reviewRating|"review"|award/i);
});

test('required static SEO assets exist and the OG image is 1200x630', () => {
  for (const file of [
    'robots.txt',
    'sitemap.xml',
    'site.webmanifest',
    'favicon.ico',
    '404.html',
    'privacy.html',
    'ga4.js',
    'assets/og-image.png',
    'assets/favicon-64.png',
    'assets/apple-touch-icon.png',
  ]) {
    assert.ok(exists(file), `missing ${file}`);
  }
  const buf = fs.readFileSync(path.join(root, 'assets/og-image.png'));
  assert.equal(buf[0], 0x89);
  assert.equal(buf.toString('ascii', 1, 4), 'PNG');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.equal(width, 1200);
  assert.equal(height, 630);
});

test('404 page is noindex and privacy page has a canonical', () => {
  const notFound = read('404.html');
  assert.equal(meta(notFound, 'name', 'robots'), 'noindex');
  const privacy = read('privacy.html');
  assert.match(privacy, /<link\s+rel=["']canonical["']\s+href=["']https:\/\/ion-pumpy-thing\.app\/privacy["']/);
  assert.match(privacy, /G-TEC2RE9FGC/);
  assert.match(privacy, /ion-pumpy-thing\.app/);
});

test('GA4 loader contacts Google only on the production host', () => {
  const loader = read('ga4.js');
  assert.match(loader, /G-TEC2RE9FGC/);
  assert.match(loader, /host !== "ion-pumpy-thing\.app"/);
  assert.match(loader, /www\.googletagmanager\.com\/gtag\/js\?id=/);
  assert.equal((loader.match(/ion-pumpy-thing\.app/g) || []).length, 1);
  assert.doesNotMatch(index, /googletagmanager\.com/);
  assert.match(index, /<script src="ga4\.js" defer><\/script>/);
  // Existing game tests look up the first unattributed <script> block.
  const firstBare = index.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(firstBare);
  assert.match(firstBare[1], /window\.__lab/);
});
