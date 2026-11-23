const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync, spawn } = require('node:child_process');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Skip, rather than fail, on hosts where node cannot spawn bash.
function cannotSpawnBash(t, err) {
  if (err && (err.code === 'ENOENT' || err.code === 'EPERM')) {
    t.skip(`cannot spawn bash (${err.code}); run scripts/build-dist.sh, then DIST_PREBUILT=1`);
    return true;
  }
  return false;
}

// Build dist/ once for the tests below. Set DIST_PREBUILT=1 to check an
// existing dist/ instead of rebuilding (for hosts where node cannot spawn bash).
let built = null;
function buildDist(t) {
  if (process.env.DIST_PREBUILT) return true;
  if (built === null) {
    try {
      execFileSync('bash', [path.join(root, 'scripts', 'build-dist.sh')], { cwd: root, stdio: 'pipe' });
      built = true;
    } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'EPERM') throw err;
      built = err;
    }
  }
  return built === true || !cannotSpawnBash(t, built);
}

const missingFromDist = (files) => files.filter((f) => !fs.existsSync(path.join(dist, f)));

test('dist/ contains every local file the pages and audio cues load', (t) => {
  if (!buildDist(t)) return;

  const refs = new Set();
  for (const page of ['index.html', '404.html', 'privacy.html']) {
    for (const m of read(page).matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)="([^"]+)"/g)) {
      const ref = m[1];
      if (/^(?:[a-z]+:)?\/\//i.test(ref) || ref.startsWith('#') || ref.startsWith('data:')) continue;
      refs.add(ref.replace(/^\//, '').split(/[?#]/)[0]);
    }
  }
  const cues = [...read('audio-cues.js').matchAll(/assets\/audio\/[\w.-]+\.mp3/g)].map((m) => m[0]);
  assert.ok(cues.length > 0, 'audio-cues.js should reference assets/audio files');
  for (const cue of cues) refs.add(cue);

  for (const name of ['audio.js', 'audio-cues.js']) {
    assert.ok(refs.has(name), `index.html should load ${name}`);
  }

  const missing = [...refs].filter((ref) => ref && !fs.existsSync(path.join(dist, ref)));
  assert.deepEqual(missing, [], `missing from dist/: ${missing.join(', ')}`);
});

// The 3D view's files, found the way the browser finds them: index.html's
// import('./view3d.js'), then every module's static, re-exported and dynamic
// imports, bare ones through the page's import map. Then the props index.html
// passes to IonView3D.start.
function view3dFiles() {
  const html = read('index.html');
  const mapJson = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(mapJson, 'index.html should have an import map');
  const map = JSON.parse(mapJson[1]).imports;
  const resolve = (spec, from) => {
    if (/^\.{1,2}\//.test(spec)) return path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    if (map[spec]) return path.posix.normalize(map[spec]);
    const prefix = Object.keys(map).filter((k) => k.endsWith('/') && spec.startsWith(k)).sort((a, b) => b.length - a.length)[0];
    assert.ok(prefix, `${from} imports "${spec}", which the import map does not resolve`);
    return path.posix.normalize(map[prefix] + spec.slice(prefix.length));
  };

  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const entries = [...inline.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => resolve(m[1], 'index.html'));
  assert.ok(entries.includes('view3d.js'), "index.html should import('./view3d.js')");

  const IMPORT = /\b(?:import|export)\s*(?:[\w$*{}\s,]*?\sfrom\s*)?['"]([^'"\n]+)['"]|\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g;
  const modules = new Set();
  const todo = [...entries];
  while (todo.length) {
    const file = todo.pop();
    if (modules.has(file)) continue;
    modules.add(file);
    for (const m of read(file).matchAll(IMPORT)) todo.push(resolve(m[1] || m[2], file));
  }

  const start = inline.match(/IonView3D\.start\([\s\S]*?props:\s*\{([^}]*)\}/);
  assert.ok(start, 'index.html should pass props to IonView3D.start');
  const props = [...start[1].matchAll(/['"]([^'"]+\.glb)['"]/g)].map((m) => m[1]);
  assert.ok(props.length > 0, 'IonView3D.start should be given at least one prop');
  return { modules: [...modules].sort(), props };
}

test("dist/ contains the 3D view: view3d.js, every module it imports through the import map, three.js's licence and every prop", (t) => {
  if (!buildDist(t)) return;
  const { modules, props } = view3dFiles();
  for (const expected of ['view3d.js', 'vendor/three/three.module.js', 'vendor/three/three.core.js', 'vendor/three/addons/loaders/GLTFLoader.js']) {
    assert.ok(modules.includes(expected), `the 3D view should load ${expected}`);
  }
  const missing = missingFromDist([...modules, 'vendor/three/LICENSE', ...props]);
  assert.deepEqual(missing, [], `missing from dist/: ${missing.join(', ')}`);
});

test('dist/ leaves out tests, docs, tools, scripts and .github', (t) => {
  if (!buildDist(t)) return;
  const present = ['tests', 'docs', 'tools', 'scripts', '.github', 'node_modules', 'types'].filter((d) => fs.existsSync(path.join(dist, d)));
  assert.deepEqual(present, []);
  const vendorExtras = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(dist, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (!rel.endsWith('.js') && rel !== 'vendor/three/LICENSE') vendorExtras.push(rel);
    }
  };
  if (fs.existsSync(path.join(dist, 'vendor'))) walk('vendor');
  assert.deepEqual(vendorExtras, [], 'dist/vendor should hold only JavaScript and the licence');
});

// A copy of the build script in a stand-in site: every listed file present,
// one glob emptied at a time. The build must fail and name the glob.
for (const glob of ['assets/*.glb', 'assets/audio/*.mp3', 'vendor/three/addons/**/*.js']) {
  test(`build-dist.sh fails when ${glob} matches nothing`, (t) => {
    const site = fs.mkdtempSync(path.join(os.tmpdir(), 'ipt-dist-'));
    try {
      const touch = (f) => { fs.mkdirSync(path.dirname(path.join(site, f)), { recursive: true }); fs.writeFileSync(path.join(site, f), ''); };
      fs.mkdirSync(path.join(site, 'scripts'));
      fs.copyFileSync(path.join(root, 'scripts', 'build-dist.sh'), path.join(site, 'scripts', 'build-dist.sh'));
      for (const f of ['404.html', 'favicon.ico', 'ga4.js', 'index.html', 'privacy.html', 'robots.txt', 'site.webmanifest', 'sitemap.xml',
        'assets/apple-touch-icon.png', 'assets/favicon-64.png', 'assets/og-image.png', 'audio.js', 'audio-cues.js', 'view3d.js', 'view3d-shapes.js',
        'vendor/three/three.module.js', 'vendor/three/three.core.js', 'vendor/three/LICENSE']) touch(f);
      const globbed = { 'assets/*.glb': 'assets/airliner.glb', 'assets/audio/*.mp3': 'assets/audio/pump.mp3', 'vendor/three/addons/**/*.js': 'vendor/three/addons/loaders/GLTFLoader.js' };
      for (const [g, f] of Object.entries(globbed)) if (g !== glob) touch(f);

      let failure = null;
      try {
        execFileSync('bash', [path.join(site, 'scripts', 'build-dist.sh')], { cwd: site, stdio: 'pipe', encoding: 'utf8' });
      } catch (err) {
        if (cannotSpawnBash(t, err)) return;
        failure = err;
      }
      assert.ok(failure, `build-dist.sh should fail without ${glob}`);
      assert.equal(failure.status, 1);
      assert.ok(failure.stderr.includes(glob), `its error should name ${glob}: ${failure.stderr}`);
    } finally {
      fs.rmSync(site, { recursive: true, force: true });
    }
  });
}

// The production smoke check, pointed at a local server that serves dist/ as
// Pages does (/privacy is privacy.html). It passes against the whole dist/ and
// fails, naming the file, when a 3D file is missing or served as the wrong type.
function servePages(broken) {
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.png': 'image/png', '.glb': 'model/gltf-binary' };
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    if (!path.extname(rel)) rel += '.html';
    const file = path.join(dist, rel);
    if (broken[rel] === 404 || !file.startsWith(dist) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': broken[rel] || TYPES[path.extname(rel)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function smoke(base) {
  return new Promise((resolve, reject) => {
    const proc = spawn('bash', [path.join(root, 'scripts', 'smoke-production.sh'), 'test'], {
      cwd: root, env: { ...process.env, SMOKE_BASE: base, SMOKE_SECONDS: '3' },
    });
    let out = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { out += d; });
    proc.on('error', reject);
    proc.on('close', (status) => resolve({ status, out }));
  });
}

for (const [name, broken, expected] of [
  ['passes against the whole dist/', {}, null],
  ['fails when view3d.js is missing', { 'view3d.js': 404 }, 'view3d.js'],
  ['fails when three.core.js is not served as JavaScript', { 'vendor/three/three.core.js': 'text/plain' }, 'vendor/three/three.core.js'],
  ['fails when a prop is missing', { 'assets/pump-handle.glb': 404 }, 'assets/pump-handle.glb'],
]) {
  test(`smoke-production.sh ${name}`, async (t) => {
    if (!buildDist(t)) return;
    const server = await servePages(broken);
    try {
      let run;
      try {
        run = await smoke(`http://127.0.0.1:${server.address().port}`);
      } catch (err) {
        if (cannotSpawnBash(t, err)) return;
        throw err;
      }
      if (expected === null) {
        assert.equal(run.status, 0, run.out);
      } else {
        assert.equal(run.status, 1, run.out);
        assert.ok(run.out.includes(expected), `its report should name ${expected}: ${run.out}`);
      }
    } finally {
      server.close();
    }
  });
}
