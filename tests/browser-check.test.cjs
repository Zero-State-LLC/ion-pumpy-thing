// The browser check needs Node 22's built-in WebSocket. On a Node without it,
// it must say so and skip locally, or fail in CI, before it looks for Chrome.
// `--no-experimental-websocket` removes the global, as on Node 20. See #21.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

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

// Where the check looks for a browser when CHROME_PATH isn't set. `--find-chrome`
// prints what it would launch, or "none", without launching it. Each run gets fake
// Windows installs under ProgramFiles, ProgramFiles(x86) and LOCALAPPDATA, and an
// empty PATH, so no real browser is found. See #73.
const WINDOWS_DIRS = ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA'];
function findChromeWith(installs, extra = {}) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'ipt-find-chrome-'));
  try {
    const env = Object.fromEntries(Object.entries(envWithoutCI).filter(([k]) => !/^(path|chrome_path|programfiles(\(x86\))?|localappdata)$/i.test(k)));
    for (const dir of WINDOWS_DIRS) { env[dir] = path.join(top, dir); fs.mkdirSync(env[dir]); }
    env.PATH = path.join(top, 'empty-path');
    fs.mkdirSync(env.PATH);
    const placed = {};
    for (const [dir, rel] of installs) {
      const exe = path.join(env[dir], rel);
      fs.mkdirSync(path.dirname(exe), { recursive: true });
      fs.writeFileSync(exe, '');
      placed[dir + '/' + rel] = exe;
    }
    const run = spawnSync(process.execPath, [check, '--find-chrome'], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 30000 });
    assert.equal(run.status, 0, run.stderr);
    return { found: run.stdout.trim(), placed };
  } finally {
    fs.rmSync(top, { recursive: true, force: true });
  }
}
const CHROME = 'Google/Chrome/Application/chrome.exe';
const EDGE = 'Microsoft/Edge/Application/msedge.exe';
// Windows gives every 64-bit process the real ProgramFiles, whatever its parent
// passes, so on Windows that folder can't be faked and a browser in it is found.
// Those cases skip there and run on Linux CI.
const realProgramFiles = process.platform === 'win32' ? process.env.ProgramFiles : null;
const pinned = realProgramFiles ? `Windows sets ProgramFiles to ${realProgramFiles} for child processes` : false;
const realBrowser = realProgramFiles && [CHROME, EDGE].some(rel => fs.existsSync(path.join(realProgramFiles, rel)))
  ? `a browser is installed under ${realProgramFiles}, which Windows won't let the test hide` : false;

test('with no browser installed, the browser check finds none', { skip: realBrowser }, () => {
  assert.equal(findChromeWith([]).found, 'none');
});

for (const dir of WINDOWS_DIRS) {
  test(`on Windows, the browser check finds Chrome under ${dir}`, { skip: dir === 'ProgramFiles' && pinned }, () => {
    const { found, placed } = findChromeWith([[dir, CHROME]]);
    assert.equal(found, placed[dir + '/' + CHROME]);
  });
}

test('on Windows without Chrome, the browser check falls back to Edge', { skip: realBrowser }, () => {
  const { found, placed } = findChromeWith([['ProgramFiles(x86)', EDGE]]);
  assert.equal(found, placed['ProgramFiles(x86)/' + EDGE]);
});

test('on Windows, the browser check prefers Chrome to Edge', { skip: realBrowser }, () => {
  const { found, placed } = findChromeWith([['ProgramFiles(x86)', EDGE], ['LOCALAPPDATA', CHROME]]);
  assert.equal(found, placed['LOCALAPPDATA/' + CHROME]);
});

test('CHROME_PATH wins over any installed browser', () => {
  assert.equal(findChromeWith([['ProgramFiles', CHROME]], { CHROME_PATH: '/chosen/browser' }).found, '/chosen/browser');
});
