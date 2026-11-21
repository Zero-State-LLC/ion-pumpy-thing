// Layout check in real Chrome, with no dependencies: Node 22 drives the
// installed headless Chrome over the DevTools protocol. For a fresh run and for
// every step of a completed run, in a 390 x 844 phone window, the page must not
// scroll sideways and must not throw. See docs/adr/0001 and issue #15.
//
//   npm run test:browser          CHROME_PATH=/path/to/chrome to choose a browser
//
// Without Chrome it skips locally and fails in CI.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 390, HEIGHT = 844;
const STEPS = ['Ignite', 'Hold', 'Fuel', 'Orbit', 'Open', 'Converge', 'Ledger'];

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
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain' };
function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, path.endsWith('/') ? path + 'index.html' : path);
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function launch(chrome, profile) {
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions', `--window-size=${WIDTH},${HEIGHT}`, 'about:blank'];
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
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
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

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    const message = 'Browser check: no Chrome found (set CHROME_PATH to choose one).';
    if (process.env.CI) { console.error(`${message} CI needs it, so this fails.`); process.exit(1); }
    console.log(`${message} Skipped.`); return;
  }
  const server = await serve(), site = `http://127.0.0.1:${server.address().port}/`;
  const profile = mkdtempSync(join(tmpdir(), 'ipt-chrome-'));
  const { proc, browserUrl } = await launch(chrome, profile);
  const page = await connect(browserUrl);
  const failures = [], errors = [];
  try {
    await page.send('Page.enable'); await page.send('Runtime.enable');
    page.on('Runtime.exceptionThrown', ({ exceptionDetails: e }) => errors.push(e.exception?.description || e.text));
    await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    const pageErrors = label => errors.splice(0).map(e => `${label}: the page threw: ${e.split('\n')[0]}`);
    const evaluate = async expression => (await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
    const load = async () => { const loaded = page.once('Page.loadEventFired'); await page.send('Page.navigate', { url: site }); await loaded; };
    const settle = () => evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))))');
    const check = async label => {
      await settle();
      const m = await evaluate('({ scroll: document.documentElement.scrollWidth, layout: window.innerWidth })');
      if (m.scroll > WIDTH || m.layout > WIDTH) failures.push(`${label}: the page is ${Math.max(m.scroll, m.layout)} px wide in a ${WIDTH} px window, so it scrolls sideways`);
      failures.push(...pageErrors(label));
    };
    const currentStep = () => evaluate(`[...document.querySelectorAll('#steps button')].findIndex(b => b.getAttribute('aria-current') === 'step')`);
    // The game saves its own run as a page unloads, so a saved run goes into
    // storage as the next page starts, before the game's script reads it.
    const loadSavedRun = async name => {
      const run = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', `${name}.json`), 'utf8'));
      const saved = JSON.stringify({ sourceRevision: await evaluate('window.__lab.SOURCE_REVISION'), ...run });
      const { identifier } = await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('ipt-run-v2', ${JSON.stringify(saved)})` });
      await load(); await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      if (await currentStep() !== run.stage) throw new Error(`The ${name} saved run did not load.`);
    };

    await load(); await evaluate('localStorage.clear()'); await load();
    if (await currentStep() !== 0) throw new Error('A fresh run did not open on Ignite.');
    await check('Fresh run, step 1 (Ignite), later steps locked');
    await loadSavedRun('completed-run');
    for (let i = 0; i < STEPS.length; i++) {
      await evaluate(`document.getElementById('step-${i}').click()`);
      if (await currentStep() !== i) {
        failures.push(`Completed run: could not open ${STEPS[i]}`, ...pageErrors(`Completed run, opening ${STEPS[i]}`));
        continue;
      }
      await check(i < 6 ? `Completed run, step ${i + 1} (${STEPS[i]})` : 'Completed run, the Ledger');
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
  console.log(`Browser check: ${STEPS.length + 1} views fit a ${WIDTH} px phone window with no page errors.`);
}

main().catch(e => { console.error(e); process.exit(1); });
