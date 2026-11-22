// Layout check in real Chrome, with no dependencies: Node 22 drives the
// installed headless Chrome over the DevTools protocol. For a fresh run, for
// every step of a completed run, for what a step's own toggle buttons turn on
// (TOGGLED: a view, or electron screening), and for the Ledger of a run whose
// Fuel step was completed with electron screening on, in each phone window
// (WINDOWS: 390 x 844 and 320 x 640), the page must not scroll sideways, must
// not throw, and must draw no canvas text outside its canvas. Those run in the
// flat view. Then each view with a 3D view (VIEWS_3D) is checked again in 3D:
// WebGL must start and the 3D canvas must draw a frame that isn't blank. See
// docs/adr/0001, docs/adr/0003 and issues #15, #45 and #56.
//
//   npm run test:browser          CHROME_PATH=/path/to/chrome to choose a browser
//
// Without Chrome, or on a Node older than 22, it skips locally and fails in CI.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The phone windows every view is checked in, as [width, height] in CSS pixels: a common
// phone, and the narrowest phones still in use.
const WINDOWS = [[390, 844], [320, 640]];
const STEPS = ['Ignite', 'Hold', 'Fuel', 'Orbit', 'Open', 'Converge', 'Ledger'];
// What a step's own toggle buttons turn on, each checked with its button pressed: the step,
// the button's id, and a name for what it shows.
const TOGGLED = [[2, 'fu-screen', 'electron screening on'], [4, 'op-cavity', 'the plasma-cavity view'], [5, 'cv-transit', 'the transit view']];
// The views drawn in 3D, each checked at a moment of the completed run's replay where it has
// something to draw: the step, the view's button, a name for it, and the replay's per cent.
const VIEWS_3D = [[5, 'cv-thermal', 'Converge, thermal view', 10], [5, 'cv-visible', 'Converge, visible view', 10], [5, 'cv-transit', 'Converge, transit diagram', 0]];
// The 3D view's setting, kept apart from the saved run.
const VIEW_PREFS = 'ion-pumpy-view-v1';
// How long, in milliseconds, the 3D view may take to start before the check fails.
const START_3D_MS = 15000;
// How much of a 3D frame, as a fraction of its pixels, must differ from its corner for it to count as drawn.
// A blank frame has none; the smallest view, the transit diagram on a 320 px phone, has about 0.8 %.
const DRAWN_FRACTION = 0.005;
// How far, in CSS pixels, a glyph may reach past a canvas edge before it counts as cut off.
// Half a pixel absorbs the canvas's whole-pixel rounding of its drawing size and anti-aliasing.
const TOLERANCE = 0.5;
// How long, in milliseconds, a page's fonts may take to load before its text is measured anyway.
const FONT_WAIT_MS = 3000;

// Runs in the page before the game's script. Every fillText and strokeText call is measured
// where it lands: measureText gives the glyphs' ink box around the anchor, already following
// textAlign and textBaseline; the current transform carries its corners into the canvas's own
// pixels, which are compared with the canvas's drawing size. Text that reaches past an edge is
// kept, with how far it reaches in CSS pixels on each side, until the check reads and clears it.
// Only measurements that succeed are counted. Text that can't be measured is kept too, with the
// error, so the check fails on it; the game's own drawing goes ahead either way.
const CANVAS_TEXT_RECORDER = `(() => {
  const outside = new Map(), unmeasured = new Map(); let measured = 0;
  Object.defineProperty(window, '__canvasText', { value: {
    take() {
      const found = { measured, unmeasured: [...unmeasured.values()], outside: [...outside.values()] };
      outside.clear(); unmeasured.clear(); measured = 0; return found;
    }
  } });
  const proto = CanvasRenderingContext2D.prototype;
  for (const name of ['fillText', 'strokeText']) {
    const draw = proto[name];
    proto[name] = function (text, x, y, maxWidth) {
      try { note(this, String(text), x, y, maxWidth, name === 'strokeText' ? this.lineWidth / 2 : 0); }
      catch (e) { const said = String(text); if (!unmeasured.has(said)) unmeasured.set(said, { text: said, error: String(e && e.message || e) }); }
      return draw.apply(this, arguments);
    };
  }
  function note(ctx, text, x, y, maxWidth, pen) {
    if (!text.trim() || !isFinite(x) || !isFinite(y)) return;
    const m = ctx.measureText(text);
    // A maxWidth narrower than the text squeezes it sideways towards its anchor.
    const squeeze = maxWidth !== undefined && m.width > maxWidth ? Math.max(0, maxWidth) / m.width : 1;
    const x0 = x - m.actualBoundingBoxLeft * squeeze - pen, x1 = x + m.actualBoundingBoxRight * squeeze + pen;
    const y0 = y - m.actualBoundingBoxAscent - pen, y1 = y + m.actualBoundingBoxDescent + pen;
    const t = ctx.getTransform(), xs = [], ys = [];
    for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) { xs.push(t.a * px + t.c * py + t.e); ys.push(t.b * px + t.d * py + t.f); }
    if (![...xs, ...ys].every(isFinite)) throw new Error('measureText gave no ink box');
    measured++;
    const c = ctx.canvas;
    const over = { left: -Math.min(...xs), top: -Math.min(...ys), right: Math.max(...xs) - c.width, bottom: Math.max(...ys) - c.height };
    if (Math.max(over.left, over.top, over.right, over.bottom) <= 0) return;
    const rect = c.getBoundingClientRect(), sx = rect.width ? c.width / rect.width : 1, sy = rect.height ? c.height / rect.height : 1;
    const canvasName = c.id ? '#' + c.id : 'unnamed', key = canvasName + '\\u0000' + text;
    const seen = outside.get(key) || { canvas: canvasName, text, left: 0, top: 0, right: 0, bottom: 0 };
    seen.left = Math.max(seen.left, over.left / sx); seen.right = Math.max(seen.right, over.right / sx);
    seen.top = Math.max(seen.top, over.top / sy); seen.bottom = Math.max(seen.bottom, over.bottom / sy);
    outside.set(key, seen);
  }
})();`;

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const found = spawnSync('which', [name], { encoding: 'utf8' });
    if (found.status === 0) return found.stdout.trim();
  }
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return existsSync(mac) ? mac : null;
}

// Serve the site the way a host would, so storage and relative assets behave as on the web.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain' };
function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, /[/\\]$/.test(path) ? path + 'index.html' : path); // normalize gives \ on Windows
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function launch(chrome, profile) {
  // WebGL runs on SwiftShader, Chrome's software renderer, so the check is the same on every machine.
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-extensions', `--window-size=${WINDOWS[0].join(',')}`, 'about:blank'];
  if (process.getuid?.() === 0) args.unshift('--no-sandbox'); // Chrome refuses to sandbox as root
  const proc = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'], detached: true }); // its own group, so helpers stop with it
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

// A minimal DevTools protocol client for one page.
async function connect(browserUrl) {
  const port = new URL(browserUrl).port;
  // Chrome can report its DevTools address before it lists its first page, so wait for the page.
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

// Missing what the check needs: skip locally, but fail in CI so a runner change can't pass silently.
function skipOrFailInCI(message) {
  if (process.env.CI) { console.error(`${message} CI needs it, so this fails.`); process.exit(1); }
  console.log(`${message} Skipped.`);
}

async function main() {
  if (typeof WebSocket === 'undefined') return skipOrFailInCI(`Browser check: needs Node 22 or later, for its built-in WebSocket, which isn't available in this Node (${process.version}).`);
  const chrome = findChrome();
  if (!chrome) return skipOrFailInCI('Browser check: no Chrome found (set CHROME_PATH to choose one).');
  const server = await serve(), site = `http://127.0.0.1:${server.address().port}/`;
  const profile = mkdtempSync(join(tmpdir(), 'ipt-chrome-'));
  const { proc, browserUrl } = await launch(chrome, profile);
  const page = await connect(browserUrl);
  const failures = [], errors = [];
  let views = 0, views3d = 0;
  try {
    await page.send('Page.enable'); await page.send('Runtime.enable');
    page.on('Runtime.exceptionThrown', ({ exceptionDetails: e }) => errors.push(e.exception?.description || e.text));
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: CANVAS_TEXT_RECORDER });
    const evaluate = async expression => (await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
    // Each page's fonts finish loading before it is measured, since a font change moves text. A
    // web font that can't load (offline, or its host blocked) leaves the page on a local font
    // from the stack, which is then what gets measured. The timeout keeps a slow font host from
    // holding the check up; the check then measures with whatever fonts have loaded.
    const fontsLoaded = () => evaluate(`Promise.race([document.fonts.ready.then(() => true), new Promise(r => setTimeout(() => r(false), ${FONT_WAIT_MS}))])`);
    const load = async () => {
      const loaded = page.once('Page.loadEventFired'); await page.send('Page.navigate', { url: site }); await loaded;
      if (!await fontsLoaded()) console.warn(`Browser check: the page's fonts were still loading after ${FONT_WAIT_MS / 1000} s, so it measured with the fonts it had.`);
    };
    const settle = () => evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))))');
    const currentStep = () => evaluate(`[...document.querySelectorAll('#steps button')].findIndex(b => b.getAttribute('aria-current') === 'step')`);
    // The game saves its own run as a page unloads, so storage is changed as the
    // next page starts, before the game's script reads it.
    const loadWith = async source => {
      const { identifier } = await page.send('Page.addScriptToEvaluateOnNewDocument', { source });
      await load(); await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    };
    // A saved run from tests/fixtures, changed first by `edit` when one is given, with the
    // 3D view turned on or off.
    const loadSavedRun = async (name, edit = () => {}, view3d = false) => {
      const run = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', `${name}.json`), 'utf8'));
      edit(run);
      const saved = JSON.stringify({ sourceRevision: await evaluate('window.__lab.SOURCE_REVISION'), ...run });
      await loadWith(`localStorage.setItem('ipt-run-v2', ${JSON.stringify(saved)}); localStorage.setItem('${VIEW_PREFS}', '${JSON.stringify({ on: view3d })}')`);
      if (await currentStep() !== run.stage) throw new Error(`The ${name} saved run did not load.`);
    };
    const ledgerRowCount = () => evaluate(`document.querySelectorAll('.ledger li').length`);
    const past = o => ['left', 'top', 'right', 'bottom'].filter(side => o[side] > TOLERANCE).map(side => `${o[side].toFixed(1)} px past the ${side} edge`).join(' and ');

    for (const [width, height] of WINDOWS) {
      // Each window starts from a fresh page, so the game lays itself out for that phone from the start.
      await page.send('Emulation.setDeviceMetricsOverride', { width, height, screenWidth: width, screenHeight: height, deviceScaleFactor: 2, mobile: true });
      const where = view => `${view}, ${width} × ${height} window`;
      const pageErrors = view => errors.splice(0).map(e => `${where(view)}: the page threw: ${e.split('\n')[0]}`);
      let textMeasured = 0;
      const check = async view => {
        views++; await evaluate('window.__canvasText.take()'); await settle();
        const m = await evaluate('({ scroll: document.documentElement.scrollWidth, layout: window.innerWidth })');
        if (m.scroll > width || m.layout > width) failures.push(`${where(view)}: the page is ${Math.max(m.scroll, m.layout)} px wide in a ${width} px window, so it scrolls sideways`);
        const text = await evaluate('window.__canvasText.take()');
        textMeasured += text.measured;
        for (const u of text.unmeasured) failures.push(`${where(view)}: the canvas text "${u.text}" could not be measured (${u.error}), so the check cannot tell whether it fits its canvas`);
        for (const o of text.outside) if (past(o)) failures.push(`${where(view)}: the canvas text "${o.text}" runs ${past(o)} of its canvas (${o.canvas})`);
        failures.push(...pageErrors(view));
      };

      await loadWith('localStorage.clear()');
      if (await currentStep() !== 0) throw new Error(`A fresh run did not open on Ignite in the ${width} × ${height} window.`);
      await check('Fresh run, step 1 (Ignite), later steps locked');
      await loadSavedRun('completed-run');
      let ledgerRows = 0;
      for (let i = 0; i < STEPS.length; i++) {
        await evaluate(`document.getElementById('step-${i}').click()`);
        if (await currentStep() !== i) {
          failures.push(`${where('Completed run')}: could not open ${STEPS[i]}`, ...pageErrors(`Completed run, opening ${STEPS[i]}`));
          continue;
        }
        if (i === 6) ledgerRows = await ledgerRowCount();
        await check(i < 6 ? `Completed run, step ${i + 1} (${STEPS[i]})` : 'Completed run, the Ledger');
      }
      for (const [step, button, name] of TOGGLED) {
        const view = `Completed run, step ${step + 1} (${STEPS[step]}), ${name}`;
        await evaluate(`document.getElementById('step-${step}').click(); document.getElementById('${button}').click()`);
        if (await evaluate(`document.getElementById('${button}').getAttribute('aria-pressed')`) !== 'true') {
          failures.push(`${where(view)}: could not open it`, ...pageErrors(view));
          continue;
        }
        await check(view);
      }
      // The same run with its Fuel step completed with electron screening on: the Ledger has one
      // more row, the screening row, which a run completed without screening never shows.
      const screened = 'Completed run with Fuel completed with electron screening on, the Ledger';
      await loadSavedRun('completed-run', run => Object.assign(run.stages[2].values, { screening: true, completedScreened: true }));
      await evaluate(`document.getElementById('step-6').click()`);
      if (await currentStep() !== 6) failures.push(`${where(screened)}: could not open it`, ...pageErrors(screened));
      else {
        const rows = await ledgerRowCount();
        if (rows !== ledgerRows + 1) failures.push(`${where(screened)}: the Ledger shows ${rows} rows, not the ${ledgerRows + 1} it has with the screening row`);
        await check(screened);
      }
      // The same views in 3D. Each waits for the 3D canvas to show, which it does once WebGL has
      // started and the renderer has drawn the view's scene list.
      await loadSavedRun('completed-run', undefined, true);
      for (const [step, button, name, at] of VIEWS_3D) {
        const view = `Completed run, ${name} in 3D at ${at} % of the replay`;
        await evaluate(`document.getElementById('step-${step}').click(); document.getElementById('${button}').click();
          (s => { s.value = '${at}'; s.dispatchEvent(new Event('input', { bubbles: true })); })(document.getElementById('cv-scrub'))`);
        const shown = await evaluate(`new Promise(r => { const t0 = performance.now(); (function wait() {
          if (!document.getElementById('gl').hidden) return r(true);
          if (performance.now() - t0 > ${START_3D_MS} || document.getElementById('view-3d').disabled) return r(false);
          setTimeout(wait, 50); })(); })`);
        if (!shown) {
          failures.push(`${where(view)}: the 3D view did not start (${await evaluate(`document.getElementById('view-3d-status').textContent`) || 'no reason given'})`, ...pageErrors(view));
          continue;
        }
        await check(view);
        // Read the frame in the animation frame after the game draws it, before the browser shows it and clears it.
        const drawn = await evaluate(`new Promise(r => requestAnimationFrame(() => {
          const c = document.getElementById('gl'), gl = c.getContext('webgl2') || c.getContext('webgl');
          const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
          let differ = 0; for (let i = 0; i < px.length; i += 4) if (px[i] !== px[0] || px[i + 1] !== px[1] || px[i + 2] !== px[2]) differ++;
          r(differ / (w * h));
        }))`);
        if (!(drawn >= DRAWN_FRACTION)) failures.push(`${where(view)}: the 3D frame is blank (${(drawn * 100).toFixed(2)} % of its pixels differ from its corner)`);
        views3d++;
      }
      // The views draw labels, so measuring none means the measuring has stopped working, not that all is well.
      if (!textMeasured) failures.push(`${width} × ${height} window: no canvas text was measured in any view, so the canvas text check could not run`);
    }
  } finally {
    page.close(); server.close();
    const exited = new Promise(resolve => proc.once('exit', resolve));
    try { process.kill(-proc.pid); } catch { proc.kill(); }
    await exited;
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
    catch { console.warn(`Browser check: could not remove the temporary Chrome profile at ${profile}.`); }
  }
  if (failures.length) { console.error(`Browser check failed:\n${failures.map(f => `  - ${f}`).join('\n')}`); process.exit(1); }
  const windows = WINDOWS.map(([w, h]) => `${w} × ${h}`).join(' and ');
  console.log(`Browser check: ${views} views (${views / WINDOWS.length} in each of the ${windows} phone windows) fit without sideways scrolling, with all canvas text inside its canvas and no page errors. ${views3d} of them are in 3D, each drawing a frame that isn't blank.`);
}

main().catch(e => { console.error(e); process.exit(1); });
