// Visual-audit capture: screenshots and frame timings of every scene, in the flat view and
// the 3D view, in a desktop window and a phone window, written to docs/visual-audit/<set>/.
// It is evidence for docs/VISUAL-AUDIT.md, not a test: it changes nothing and fails only when
// the game can't be driven. It drives the installed Chrome or Edge over the DevTools protocol,
// the same way tests/browser-check.mjs does, but on the machine's GPU by default, since the
// audit is about what a player sees; GPU=swiftshader forces the software renderer.
//
//   node tools/visual-capture.mjs <set-name>        e.g. baseline, slice-2
//   --quality=<low|medium|high>   pin the 3D view's quality level (default: high, the desktop
//                                 level under auto; auto's own timing is not what is captured)
//   CHROME_PATH=/path/to/chrome   choose the browser   GPU=swiftshader   software WebGL
//
// For each scene it saves <set>/<scene>-<view>-<window>.png, a screenshot of the scene's canvas
// only, and <set>/index.json with each shot's name, window, view, scene-list size and the 3D
// view's frame time (median and 95th percentile over FRAMES frames). Scenes are the ones
// tests/browser-check.mjs checks in 3D, from the completed-run fixture, so nothing is captured
// that the checks don't already reach.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WINDOWS = [['desktop', 1280, 800, 1], ['phone', 390, 844, 2]];
// Step, the view's button (null for a step with one view), the shot's name, the replay per cent,
// and for a scene the saved run does not reach on its own, the keys that take it there.
const SCENES = [[0, null, 'ignite', null], [1, null, 'hold', null], [1, null, 'hold-open', null, ['ho-pad', 'ArrowDown', 40]],
  [2, null, 'fuel', null], [2, 'fu-screen', 'fuel-screened', null],
  [3, null, 'orbit', null], [4, 'op-plates', 'open-plates', null], [4, 'op-throat', 'open-throat', null], [4, 'op-cavity', 'open-cavity', null],
  [5, 'cv-thermal', 'converge-thermal', 10], [5, 'cv-visible', 'converge-visible', 10], [5, 'cv-transit', 'converge-transit', 30]];
const VIEW_PREFS = 'ion-pumpy-view-v1';
const START_3D_MS = 20000;
// The second the renderer's clock is pinned at for 3D shots.
const FROZEN_AT_S = 1;
const FRAMES = 90;

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const found = spawnSync('which', [name], { encoding: 'utf8' });
    if (found.status === 0) return found.stdout.trim();
  }
  const windows = ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA'].map(name => process.env[name]).filter(Boolean);
  const installs = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ...windows.map(dir => join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    ...windows.map(dir => join(dir, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
  ];
  return installs.find(file => existsSync(file)) || null;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain' };
function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, /[/\\]$/.test(path) ? path + 'index.html' : path);
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function launch(chrome, profile) {
  const gpu = process.env.GPU === 'swiftshader' ? ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--ignore-gpu-blocklist'];
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', ...gpu, '--disable-extensions', '--hide-scrollbars', '--window-size=1280,800', 'about:blank'];
  if (process.getuid?.() === 0) args.unshift('--no-sandbox');
  const proc = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  return new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error(`Chrome did not start:\n${log}`)), 20000);
    proc.stderr.on('data', chunk => {
      log += chunk; const m = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) { clearTimeout(timer); resolve({ proc, browserUrl: m[1] }); }
    });
    proc.on('exit', code => { clearTimeout(timer); reject(new Error(`Chrome exited (${code}):\n${log}`)); });
  });
}

async function connect(browserUrl) {
  const port = new URL(browserUrl).port;
  let page;
  for (let tries = 0; !page && tries < 50; tries++) {
    if (tries) await new Promise(r => setTimeout(r, 100));
    page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p => p.type === 'page');
  }
  if (!page) throw new Error('Chrome started but opened no page.');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0; const pending = new Map(), listeners = [];
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
    else for (const l of listeners) l(msg);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const once = method => new Promise(resolve => { const l = msg => { if (msg.method === method) { listeners.splice(listeners.indexOf(l), 1); resolve(msg.params); } }; listeners.push(l); });
  const on = (method, fn) => listeners.push(msg => { if (msg.method === method) fn(msg.params); });
  return { send, once, on, close: () => ws.close() };
}

// Runs before the game's script: wraps the renderer's draw so each frame's scene list size and
// draw time can be read, the way the test harness wraps it (docs/adr/0003).
const DRAW_RECORDER = `(() => {
  const times = []; let last = null;
  Object.defineProperty(window, '__capture', { value: {
    reset() { times.length = 0; last = null; },
    take() { return { times: times.slice(), last }; }
  } });
  let real;
  Object.defineProperty(window, 'IonView3D', { configurable: true,
    get() { return real; },
    set(v) {
      real = v; if (!v || typeof v.start !== 'function') return;
      const start = v.start.bind(v);
      v.start = (...a) => start(...a).then(r => {
        const draw = r.draw.bind(r);
        r.draw = frame => { const t0 = performance.now(); const out = draw(frame); times.push(performance.now() - t0);
          last = { views: (frame.views || []).map(v => ({ look: v.look, camera: v.camera, items: (v.list || []).length, kinds: [...new Set((v.list || []).map(i => i.kind))] })), look: frame.look, items: frame.list ? frame.list.length : undefined, kinds: frame.list ? [...new Set(frame.list.map(i => i.kind))] : undefined };
          return out; };
        return r;
      });
    } });
})();`;

async function main() {
  const set = process.argv[2], quality = (process.argv.find(a => a.startsWith('--quality=')) || '--quality=high').slice('--quality='.length);
  if (!set || set.startsWith('-') || !['low', 'medium', 'high'].includes(quality)) { console.error('Usage: node tools/visual-capture.mjs <set-name> [--quality=low|medium|high]'); process.exit(2); }
  const chrome = findChrome();
  if (!chrome) { console.error('No Chrome or Edge found (set CHROME_PATH).'); process.exit(1); }
  const out = join(root, 'docs', 'visual-audit', set); mkdirSync(out, { recursive: true });
  const server = await serve(), site = `http://127.0.0.1:${server.address().port}/`;
  const profile = mkdtempSync(join(tmpdir(), 'ipt-capture-'));
  const { proc, browserUrl } = await launch(chrome, profile);
  const page = await connect(browserUrl);
  const index = { set, quality, browser: chrome, gpu: process.env.GPU === 'swiftshader' ? 'swiftshader' : 'machine', frames: FRAMES, frozenAt: FROZEN_AT_S, shots: [] };
  const errors = [];
  try {
    await page.send('Page.enable'); await page.send('Runtime.enable');
    page.on('Runtime.exceptionThrown', ({ exceptionDetails: e }) => errors.push(e.exception?.description || e.text));
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: DRAW_RECORDER });
    const evaluate = async expression => (await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
    const load = async () => { const loaded = page.once('Page.loadEventFired'); await page.send('Page.navigate', { url: site }); await loaded;
      await evaluate('Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))])'); };
    const settle = () => evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 100))))');
    const currentStep = () => evaluate(`[...document.querySelectorAll('#steps button')].findIndex(b => b.getAttribute('aria-current') === 'step')`);
    const loadWith = async source => { const { identifier } = await page.send('Page.addScriptToEvaluateOnNewDocument', { source }); await load(); await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }); };
    const loadSavedRun = async view3d => {
      const run = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'completed-run.json'), 'utf8'));
      const saved = JSON.stringify({ sourceRevision: await evaluate('window.__lab.SOURCE_REVISION'), ...run });
      await loadWith(`localStorage.setItem('ipt-run-v2', ${JSON.stringify(saved)}); localStorage.setItem('${VIEW_PREFS}', '${JSON.stringify({ on: view3d, quality })}')`);
      if (await currentStep() !== run.stage) throw new Error('The completed-run saved run did not load.');
    };
    const info = await evaluate(`(() => { const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return null;
      const d = gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION) }; })()`);
    index.webgl = info;
    index.browserVersion = (await page.send('Browser.getVersion')).product;
    await loadWith('localStorage.clear()'); // a first page, so the game's source revision can be read
    for (const [name, width, height, dpr] of WINDOWS) {
      await page.send('Emulation.setDeviceMetricsOverride', { width, height, screenWidth: width, screenHeight: height, deviceScaleFactor: dpr, mobile: name === 'phone' });
      for (const view of ['flat', '3d']) {
        await loadSavedRun(view === '3d');
        for (const [step, button, scene, at, keys] of SCENES) {
          const label = `${scene}-${view}-${name}`;
          await evaluate(`document.getElementById('step-${step}').click();` + (button ? ` document.getElementById('${button}').click();` : '')
            + (at === null ? '' : ` (s => { s.value = '${at}'; s.dispatchEvent(new Event('input', { bubbles: true })); })(document.getElementById('cv-scrub'))`)
            + (keys ? ` (e => { for (let i = 0; i < ${keys[2]}; i++) e.dispatchEvent(new KeyboardEvent('keydown', { key: '${keys[1]}', bubbles: true })); })(document.getElementById('${keys[0]}'))` : ''));
          let shown = view === 'flat';
          if (view === '3d') shown = await evaluate(`new Promise(r => { const t0 = performance.now(); (function wait() {
            if (!document.getElementById('gl').hidden) return r(true);
            if (performance.now() - t0 > ${START_3D_MS} || document.getElementById('view-3d').disabled) return r(false);
            setTimeout(wait, 50); })(); })`);
          const shot = { name: label, scene, view, window: name, width, height, dpr, shown, errors: errors.splice(0) };
          if (shown) {
            await settle();
            await evaluate(`document.querySelector('.view').scrollIntoView({ block: 'start' })`);
            // Every 3D shot is taken with the renderer's clock pinned at the same second, so the
            // plasma bodies are caught mid-drift and one set compares with the next.
            if (view === '3d') await evaluate(`window.__lab.view3D().freeze(${FROZEN_AT_S})`);
            await evaluate('window.__capture.reset()');
            // Let FRAMES frames go by, then read their draw times, in the 3D view.
            const stats = await evaluate(`new Promise(r => { let n = 0; (function tick() { if (++n >= ${FRAMES}) return r(window.__capture.take()); requestAnimationFrame(tick); })(); })`);
            if (view === '3d' && stats.times.length) {
              const t = stats.times.sort((a, b) => a - b);
              shot.drawMs = { median: +t[Math.floor(t.length / 2)].toFixed(2), p95: +t[Math.floor(t.length * 0.95)].toFixed(2), frames: t.length };
              shot.sceneList = stats.last;
            }
            const box = await evaluate(`(() => { const r = document.querySelector('.view').getBoundingClientRect(); return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height }; })()`);
            const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 }, captureBeyondViewport: true });
            writeFileSync(join(out, `${label}.png`), Buffer.from(data, 'base64'));
            shot.file = `${label}.png`;
          } else shot.status = await evaluate(`document.getElementById('view-3d-status').textContent`);
          index.shots.push(shot);
          console.log(`${label}: ${shown ? 'captured' : 'NOT SHOWN'}${shot.drawMs ? ` draw ${shot.drawMs.median} ms (p95 ${shot.drawMs.p95})` : ''}${shot.errors.length ? ` ERRORS ${shot.errors.length}` : ''}`);
        }
      }
    }
  } finally {
    page.close(); server.close();
    const exited = new Promise(resolve => proc.once('exit', resolve));
    try { process.kill(-proc.pid); } catch { proc.kill(); }
    await exited;
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch {}
  }
  writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`Wrote ${index.shots.length} shots to docs/visual-audit/${set}/ (WebGL: ${index.webgl?.renderer || 'none'}).`);
}

main().catch(e => { console.error(e); process.exit(1); });
