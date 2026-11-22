// PROTOTYPE, throwaway. Three looks for the Converge step drawn in 3D, switchable from the
// bar at the bottom (#look-a, #look-b, #look-c on the artifact; ?look=a when served locally).
// Lives on the branch proto/three-converge and never merges. No tests, no Meshy model yet.
import * as THREE from 'three';

const TAU = Math.PI * 2, DEG = Math.PI / 180;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const fmt = (x, d = 0) => Number(x).toFixed(d);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const COL = Object.fromEntries(['sky', 'deep', 'ink', 'muted', 'hot', 'warm', 'cold', 'read', 'void', 'line', 'dusk', 'flash'].map(n => [n, token('--' + n)]));
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

/* ── The game's own numbers and models, copied from index.html ── */
const AIRCRAFT = { length: 63.7, span: 60.9, speed: 250 };
const ORBIT = { r: 65, T: 2.5, cam: 132 }; // a matched Formation: distance (m), lap (s), angle between cameras (°)
const THROAT = 64;                           // the Open step's throat width (m)
const TILT = 24 * DEG;
function formation(r, ang, tumble) {
  const ca = Math.cos(tumble), sa = Math.sin(tumble), ct = Math.cos(TILT), st = Math.sin(TILT);
  const u = [ca, sa, 0], v = [-sa * ct, ca * ct, st], out = [];
  for (let i = 0; i < 3; i++) { const a = ang + i * TAU / 3, c = Math.cos(a) * r, s = Math.sin(a) * r; out.push([u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s]); }
  return out;
}
function transitModel(progress, width) {
  const fraction = clamp(progress, 0, 1), duration = AIRCRAFT.length / AIRCRAFT.speed;
  return { fraction, duration, elapsed: fraction * duration, centreY: AIRCRAFT.length * (.5 - fraction), clearance: (width - AIRCRAFT.span) / 2, fits: width >= AIRCRAFT.span };
}

/* ── The sequence on one clock (s): orbit, close in, open at a quarter smaller, flash, gone ── */
const SEQ_END = 6;
function sequenceAt(t) {
  let phase = 'orbit', k = 1, q = 0;
  if (t >= 1 && t < 3.5) { phase = 'closing'; k = 1 - 0.1 * (t - 1); }
  else if (t >= 3.5 && t < 5.1) { phase = 'flash'; k = 0.75; q = (t - 3.5) / 1.6; }
  else if (t >= 5.1) { phase = 'gone'; k = 0.75; q = 1; }
  const forming = phase === 'closing' ? (reduced ? 1 : clamp((1 - k) / 0.5, 0, 1)) : 0;
  return { t, phase, k, q, ang: TAU / ORBIT.T * t, tumble: TAU / 11 * t, forming };
}

/* ── Looks and views ── */
const LOOKS = [
  { key: 'a', name: 'Smooth heat', note: 'Every surface takes its temperature from the thermal scale, a little cooler where it turns away from the camera.' },
  { key: 'b', name: 'Heat and outlines', note: 'The same shading with thin schematic edges, so the airliner’s shape still reads at phone size.' },
  { key: 'c', name: 'Banded levels', note: 'Temperatures snap to five bands, like a heat camera’s isotherm palette.' }
];
const VIEWS = { thermal: 'Thermal, from the side', visible: 'Visible, from above', transit: 'Transit diagram' };
const fromHash = () => (location.hash.match(/^#look-([abc])$/) || [])[1];
const S = {
  look: fromHash() || (LOOKS.some(l => l.key === params.get('look')) ? params.get('look') : 'a'),
  view: VIEWS[params.get('view')] ? params.get('view') : 'thermal',
  t: params.has('t') ? clamp(Number(params.get('t')) || 0, 0, SEQ_END) : 2.6,
  playing: !reduced && !params.has('t')
};
if (params.get('frame') === '1') document.body.classList.add('frame-only');

/* ── The thermal scale as a texture: void, sky, dusk, warm, hot, flash, as the layout's legend ── */
const RAMP = [[0, COL.void], [.24, COL.sky], [.45, COL.dusk], [.66, COL.warm], [.86, COL.hot], [1, COL.flash]];
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
function rampTexture() {
  const n = 256, data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); let j = 0;
    while (j < RAMP.length - 2 && t > RAMP[j + 1][0]) j++;
    const [t0, c0] = RAMP[j], [t1, c1] = RAMP[j + 1], f = clamp((t - t0) / (t1 - t0), 0, 1), a = rgb(c0), b = rgb(c1);
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(a[c] + (b[c] - a[c]) * f);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, n, 1);
  tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return tex;
}
const RAMP_TEX = rampTexture();
// Heat-camera surface: its temperature, a little cooler where it faces away (sRGB out, as the legend).
function heatMaterial(temp, bands) {
  return new THREE.ShaderMaterial({
    uniforms: { uTemp: { value: temp }, uRamp: { value: RAMP_TEX }, uBands: { value: bands } },
    vertexShader: 'varying vec3 vN; void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTemp; uniform float uBands; uniform sampler2D uRamp; varying vec3 vN;
      void main() {
        float facing = abs(normalize(vN).z);
        float t = uTemp * (0.72 + 0.28 * facing);
        if (uBands > 0.0) t = (floor(t * uBands) + 0.5) / uBands;
        gl_FragColor = vec4(texture2D(uRamp, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb, 1.0);
      }`,
    side: THREE.DoubleSide
  });
}
const TOON = (() => { const d = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]); const t = new THREE.DataTexture(d, 3, 1); t.needsUpdate = true; return t; })();
function litMaterial(colour, look, clip) {
  const o = { color: new THREE.Color(colour), side: THREE.DoubleSide, clippingPlanes: clip };
  return look === 'c' ? new THREE.MeshToonMaterial({ ...o, gradientMap: TOON }) : new THREE.MeshLambertMaterial(o);
}
function glowTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g2 = c.getContext('2d'), g = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, colour] of stops) g.addColorStop(at, colour);
  g2.fillStyle = g; g2.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

/* ── The placeholder airliner, from simple shapes, in metres: nose to -y, up to -z ── */
function polygon(pts) { const s = new THREE.Shape(); pts.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); return s; }
function airlinerGeometry() {
  const parts = [];
  const profile = [[0, -31.85], [1.5, -30.6], [2.5, -28.8], [3.1, -25.5], [3.1, 19], [2.6, 24.5], [1.7, 28.8], [0.7, 31.85]].map(([r, y]) => new THREE.Vector2(r, y));
  parts.push(['body', new THREE.LatheGeometry(profile, 28)]);
  const wing = new THREE.ExtrudeGeometry(polygon([[3, -6], [30.45, 9], [30.45, 12.5], [3, 6], [-3, 6], [-30.45, 12.5], [-30.45, 9], [-3, -6]]), { depth: 0.9, bevelEnabled: false });
  wing.translate(0, 0, 0.9); parts.push(['body', wing]);
  const stab = new THREE.ExtrudeGeometry(polygon([[1.5, 23], [10.7, 29], [10.7, 31.5], [1.5, 29.5], [-1.5, 29.5], [-10.7, 31.5], [-10.7, 29], [-1.5, 23]]), { depth: 0.5, bevelEnabled: false });
  stab.translate(0, 0, -0.75); parts.push(['body', stab]);
  const fin = new THREE.ExtrudeGeometry(polygon([[20.5, 0], [29.2, 9.5], [31.6, 9.5], [31.85, 0]]), { depth: 0.5, bevelEnabled: false });
  fin.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0)));
  fin.translate(0.25, 0, -2.4); parts.push(['body', fin]);
  for (const sx of [-1, 1]) { const e = new THREE.CylinderGeometry(1.7, 1.45, 7.6, 20); e.translate(sx * 9.6, -4, 3.1); parts.push(['engine', e]); }
  return parts;
}
const AIRLINER = airlinerGeometry();

/* ── The scene list: what is on screen, in metres. The renderer only draws this. ── */
function sceneList(s, view) {
  const list = [], thermal = view === 'thermal';
  if (view === 'transit') {
    const m = transitModel(s.q, THROAT);
    list.push({ kind: 'airliner', at: [0, m.centreY, 0], temp: null, clipBeyondEntrance: true });
    list.push({ kind: 'entrance', width: THROAT, fits: m.fits });
    return list;
  }
  const flashing = s.phase === 'flash', gone = s.phase === 'gone';
  if (!gone && !(flashing && s.q > 0.18)) list.push({ kind: 'airliner', at: [0, 0, 0], temp: thermal ? 0.64 : null });
  const r = ORBIT.r * s.k, pts = formation(r, s.ang, s.tumble);
  if (!gone && !(flashing && s.q > 0.45)) {
    list.push({ kind: 'triangle', points: pts });
    pts.forEach((p, i) => {
      list.push({ kind: 'orb', id: i, at: p, temp: thermal ? 0.56 : null });
      if (thermal) list.push({ kind: 'cold mark', id: i, path: Array.from({ length: 9 }, (_, j) => formation(r, s.ang + .14 + j * .035, s.tumble)[i]) });
    });
  }
  if (s.forming > 0) list.push({ kind: 'throat forming', amount: s.forming, points: pts });
  if (flashing) list.push({ kind: 'flash', radius: (THROAT / 2) * (0.4 + Math.sin(Math.PI * s.q)), q: s.q });
  return list;
}

/* ── Rendering ── */
const view = document.querySelector('.view'), glCanvas = document.getElementById('gl'), cv = document.getElementById('cv'), ctx = cv.getContext('2d');
let renderer = null, W = 390, H = 292.5, dpr = 1, world = null, failure = '';
try {
  renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
  renderer.localClippingEnabled = true;
} catch (e) { failure = 'This prototype needs WebGL, which this browser has turned off.'; }

function cameraFor(v) {
  // Orthographic, as the game's camB: the thermal camera turns about the x axis by the angle between the cameras.
  const th = v === 'thermal' ? ORBIT.cam * DEG : 0, D = 600;
  const sc = v === 'transit' ? Math.min((W - 56) / Math.max(THROAT, 85), (H - 130) / (2 * AIRCRAFT.length)) : Math.min(W, H) / 2 / 122;
  const cam = new THREE.OrthographicCamera(-W / 2 / sc, W / 2 / sc, H / 2 / sc, -H / 2 / sc, 1, 2000);
  cam.position.set(0, -D * Math.sin(th), -D * Math.cos(th)); cam.up.set(0, -Math.cos(th), Math.sin(th)); cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(); return { cam, sc };
}
function dispose(obj) { obj.traverse(o => { o.geometry?.dispose(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach(x => { x.map?.dispose(); x.dispose(); }); }); }

function buildWorld() {
  if (world) dispose(world.scene);
  const v = S.view, look = S.look, thermal = v === 'thermal', scene = new THREE.Scene();
  const { cam, sc } = cameraFor(v), px = n => n / sc; // pixels to metres at this view's scale
  scene.background = new THREE.Color(thermal ? COL.sky : v === 'visible' ? '#1b2333' : COL.deep);
  if (!thermal) { scene.add(new THREE.AmbientLight(0xffffff, 1.1)); const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-60, -90, -140); scene.add(sun); }
  const clip = v === 'transit' ? [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)] : null;
  const bands = look === 'c' ? 5 : 0;
  const edge = thermal ? [COL.ink, .85] : v === 'visible' ? ['#2a3045', 1] : [COL.deep, 1];
  // Airliner
  const airliner = new THREE.Group();
  for (const [part, geom] of AIRLINER) {
    const colour = v === 'visible' ? (part === 'engine' ? '#8b94ad' : '#d5dbe8') : (part === 'engine' ? COL.warm : COL.ink);
    const mat = thermal ? heatMaterial(part === 'engine' ? 0.88 : 0.64, bands) : litMaterial(colour, look, clip);
    airliner.add(new THREE.Mesh(geom, mat));
    if (look === 'b') airliner.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom, 28), new THREE.LineBasicMaterial({ color: edge[0], transparent: true, opacity: edge[1], clippingPlanes: clip })));
  }
  scene.add(airliner);
  // Orbs, halos and cold marks
  const orbR = px(4.5), orbs = [], halos = [], marks = [];
  const haloTex = glowTexture(thermal ? [[0, 'rgba(185,112,63,.3)'], [1, 'rgba(0,0,0,0)']] : [[0, 'rgba(255,255,255,.4)'], [1, 'rgba(255,255,255,0)']]);
  for (let i = 0; i < 3; i++) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(orbR, 24, 16), thermal ? heatMaterial(0.56, bands) : litMaterial('#ffffff', look, null));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false }));
    halo.scale.setScalar(orbR * 6);
    const mark = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: COL.void, transparent: true, opacity: .85 }));
    scene.add(halo, orb, mark); orbs.push(orb); halos.push(halo); marks.push(mark);
  }
  // Look B rings each orb in the outline colour, so the orbs read as schematic marks too.
  const orbRings = look === 'b' ? [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.RingGeometry(orbR + px(.5), orbR + px(1.5), 32), new THREE.MeshBasicMaterial({ color: edge[0], transparent: true, opacity: edge[1], side: THREE.DoubleSide })); m.quaternion.copy(cam.quaternion); scene.add(m); return m; }) : [];
  const triangle = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .25 }));
  scene.add(triangle);
  // Throat forming: a ring round each orb and a padded outline round the triangle, drawn over everything
  const glowMat = new THREE.MeshBasicMaterial({ color: thermal ? COL.void : COL.cold, transparent: true, depthTest: false, side: THREE.DoubleSide });
  const glowRings = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.BufferGeometry(), glowMat); m.renderOrder = 5; scene.add(m); return m; });
  const glowEdge = new THREE.Mesh(new THREE.BufferGeometry(), glowMat); glowEdge.renderOrder = 5; scene.add(glowEdge);
  // The flash: black on the heat camera, bright from above; a steady ring under reduced motion
  const flashDark = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: COL.void, depthTest: false }));
  const flashBright = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, 'rgba(255,255,255,1)'], [.55, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,0)']]), transparent: true, depthTest: false }));
  const flashRing = new THREE.Mesh(new THREE.RingGeometry(THROAT / 2 - px(.75), THROAT / 2 + px(.75), 96), new THREE.MeshBasicMaterial({ color: COL.cold, depthTest: false, side: THREE.DoubleSide }));
  for (const f of [flashDark, flashBright, flashRing]) { f.renderOrder = 8; f.quaternion.copy(cam.quaternion); scene.add(f); }
  flashBright.renderOrder = 8;
  // Clouds far below the visible camera
  if (v === 'visible') for (const [x, y, r] of [[.2, .3, .22], [.72, .2, .18], [.8, .75, .26], [.3, .82, .2], [.5, .5, .3]]) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: '#d2daeb', transparent: true, opacity: .10, depthWrite: false }));
    c.scale.set(r * W / sc, r * H * .6 / sc, 1); c.position.set((x * W - W / 2) / sc, (y * H - H / 2) / sc, 300); c.renderOrder = -1; scene.add(c);
  }
  world = { scene, cam, sc, px, airliner, orbs, orbRings, halos, marks, triangle, glowRings, glowEdge, flashDark, flashBright, flashRing, look, view: v };
}

function project(p) { const v = new THREE.Vector3(...p).project(world.cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; }
function tube(points, radius, closed = false) {
  const path = new THREE.CurvePath(), pts = points.map(p => new THREE.Vector3(...p));
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) path.add(new THREE.LineCurve3(pts[i], pts[(i + 1) % pts.length]));
  return new THREE.TubeGeometry(path, pts.length * 6, radius, 6, false);
}
function swapGeometry(mesh, geom) { mesh.geometry.dispose(); mesh.geometry = geom; }

function draw(s) {
  const list = sceneList(s, S.view), w = world;
  const find = kind => list.filter(e => e.kind === kind);
  const air = find('airliner')[0];
  w.airliner.visible = !!air; if (air) w.airliner.position.set(...air.at);
  const orbs = find('orb');
  w.orbs.forEach((o, i) => { const e = orbs[i], ring = w.orbRings[i]; o.visible = w.halos[i].visible = !!e; if (ring) ring.visible = !!e; if (e) { o.position.set(...e.at); w.halos[i].position.set(...e.at); ring?.position.set(...e.at); } });
  const marks = find('cold mark');
  w.marks.forEach((m, i) => { const e = marks[i]; m.visible = !!e; if (e) swapGeometry(m, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(e.path.map(p => new THREE.Vector3(...p))), 16, w.px(1.5), 6, false)); });
  const tri = find('triangle')[0]; w.triangle.visible = !!tri;
  if (tri) swapGeometry(w.triangle, new THREE.BufferGeometry().setFromPoints(tri.points.map(p => new THREE.Vector3(...p))));
  const glow = find('throat forming')[0];
  [...w.glowRings, w.glowEdge].forEach(m => { m.visible = !!glow; });
  if (glow) {
    const a = glow.amount, ring = w.px(16 + 22 * a), pad = 8 + 16 * a, width = w.px(1.25 + 2 * a);
    w.glowRings[0].material.opacity = .22 + .7 * a;
    glow.points.forEach((p, i) => { const r = w.glowRings[i]; swapGeometry(r, new THREE.RingGeometry(ring - width / 2, ring + width / 2, 48)); r.position.set(...p); r.quaternion.copy(w.cam.quaternion); });
    const padded = glow.points.map(p => { const [x, y] = project(p), m = Math.hypot(x - W / 2, y - H / 2), k = m > 0.5 ? (m + pad) / m : 1; return p.map(c => c * k); });
    swapGeometry(w.glowEdge, tube(padded, width / 2, true));
  }
  const flash = find('flash')[0];
  w.flashDark.visible = w.flashBright.visible = w.flashRing.visible = false;
  if (flash) {
    if (reduced) w.flashRing.visible = true;
    else if (S.view === 'thermal') {
      const R = flash.radius, shape = new THREE.Shape();
      for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU, rr = R * (1 + 0.12 * Math.sin(a * 5 + flash.q * 6) + 0.07 * Math.sin(a * 9)); i ? shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      swapGeometry(w.flashDark, new THREE.ShapeGeometry(shape)); w.flashDark.visible = true;
    } else { w.flashBright.scale.setScalar(flash.radius * 3); w.flashBright.visible = true; }
  }
  renderer.render(w.scene, w.cam);
  overlay(s, list);
  return list;
}

/* ── Text and diagram marks stay on the 2D canvas, as in the game ── */
function label(txt, x, y, color = COL.muted, align = 'left', size = 11) {
  ctx.font = `${size}px ${MONO}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(txt, x, y);
}
function overlay(s, list) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2;
  if (failure) { label(failure, cx, cy, COL.warm, 'center', W < 400 ? 9 : 11); return; }
  if (S.view === 'transit') {
    const m = transitModel(s.q, THROAT), half = THROAT * world.sc / 2;
    ctx.fillStyle = 'rgba(185,162,255,.07)'; ctx.fillRect(24, 48, W - 48, cy - 48);
    label('BEYOND ENTRANCE: UNSPECIFIED', cx, 56, COL.read, 'center', W < 400 ? 9 : 10);
    ctx.setLineDash([3, 5]); ctx.strokeStyle = COL.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, 70); ctx.lineTo(cx, H - 65); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = m.fits ? COL.cold : COL.hot; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - half, cy); ctx.lineTo(cx + half, cy); ctx.stroke();
    for (const x of [cx - half, cx + half]) { ctx.beginPath(); ctx.moveTo(x, cy - 8); ctx.lineTo(x, cy + 8); ctx.stroke(); }
    label(`${THROAT} m entrance`, cx, cy - 15, m.fits ? COL.cold : COL.hot, 'center');
    label(m.fits ? `${fmt(m.clearance, 2)} m clearance per wing` : 'Wings do not clear', cx, H - 48, m.fits ? COL.cold : COL.hot, 'center', W < 400 ? 10 : 11);
    label(`${fmt(m.elapsed, 3)} / ${fmt(m.duration, 3)} s at 250 m/s cruise`, cx, H - 28, COL.muted, 'center', W < 400 ? 9 : 11);
    label('4orbs account: constant speed relative to the field', cx, H - 66, COL.read, 'center', W < 440 ? 9 : 11);
    label('TRANSIT DIAGRAM', 34, 24);
    return;
  }
  const th = S.view === 'thermal', orb0 = list.find(e => e.kind === 'orb' && e.id === 0);
  if (th && orb0 && s.phase !== 'flash') { const [x, y] = project(orb0.at); label('cold mark leads', x + 10, y - 8); }
  if (list.some(e => e.kind === 'throat forming')) label('throat forming', cx, 44, COL.cold, 'center', W < 420 ? 10 : 12);
  if (s.phase === 'flash') { if (reduced) label('wormhole aperture', cx, cy, COL.cold, 'center'); label('Slowed for viewing', cx, H - 40, th ? COL.muted : COL.ink, 'center', W < 400 ? 9 : 11); }
  if (s.phase === 'gone') label('nothing warm is left where it was', cx, cy + 4, COL.muted, 'center');
  label(th ? 'THERMAL · SYNTHETIC FALSE COLOUR' : 'VISIBLE LIGHT · FROM ABOVE', 34, 24);
  const x = 34, y = H - 20, sc = world.sc; ctx.strokeStyle = COL.muted; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + 50 * sc, y); ctx.lineTo(x + 50 * sc, y - 4); ctx.stroke();
  label('50 m', x + 50 * sc + 6, y + 1);
}

/* ── Panel, switcher and clock ── */
const $ = id => document.getElementById(id);
const PHASES = { orbit: 'Orbiting', closing: 'Closing in', flash: 'Flash', gone: 'Gone' };
let lastList = 0;
function readouts(s, list) {
  const m = transitModel(s.q, THROAT);
  $('scrub').value = Math.round(s.t * 100); $('scrub-o').textContent = `${fmt(s.t, 2)} s · ${PHASES[s.phase].toLowerCase()}`;
  $('r-k').textContent = fmt(s.k * 100) + ' %'; $('r-phase').textContent = PHASES[s.phase];
  $('r-x').innerHTML = `${fmt(m.elapsed, 3)} s<small>of ${fmt(m.duration, 3)} s: 63.7 m ÷ 250 m/s</small>`;
  $('r-clear').innerHTML = `${fmt(m.clearance, 2)} m<small>each wing, ${THROAT} m throat</small>`;
  $('play').textContent = S.playing ? 'Pause' : 'Play';
  const now = performance.now();
  if (now - lastList > 250) {
    lastList = now;
    const p = a => `(${a.map(c => fmt(c, 1)).join(', ')})`;
    $('list').textContent = [`look ${S.look} · view ${S.view} · ${fmt(s.t, 2)} s · triangle ${fmt(s.k * 100)} %`, ...list.map(e =>
      e.kind === 'airliner' ? `airliner   at ${p(e.at)} m, 63.7 × 60.9 m${e.temp ? `, heat ${e.temp}` : ''}${e.clipBeyondEntrance ? ', cut at the entrance' : ''}` :
      e.kind === 'orb' ? `orb ${e.id + 1}      at ${p(e.at)} m${e.temp ? `, heat ${e.temp}` : ''}` :
      e.kind === 'cold mark' ? `cold mark ${e.id + 1} 9 points, leading orb ${e.id + 1}` :
      e.kind === 'triangle' ? `triangle   joins the three orbs` :
      e.kind === 'throat forming' ? `throat forming ${fmt(e.amount * 100)} %` :
      e.kind === 'flash' ? `flash      radius ${fmt(e.radius, 1)} m, ${fmt(e.q * 100)} % through` :
      `entrance   ${e.width} m, ${e.fits ? 'wings clear' : 'wings do not clear'}`)].join('\n');
  }
}
function paintControls() {
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === S.view)));
  const look = LOOKS.find(l => l.key === S.look);
  $('look-label').textContent = `${look.key.toUpperCase()} · ${look.name}`; $('look-note').textContent = look.note;
  $('scale').hidden = S.view !== 'thermal';
}
function setLook(key) {
  S.look = key; buildWorld(); paintControls();
  try { history.replaceState(null, '', '#look-' + key); } catch (e) { /* the frame may refuse it */ }
}
function step(by) { const i = LOOKS.findIndex(l => l.key === S.look); setLook(LOOKS[(i + by + LOOKS.length) % LOOKS.length].key); }
$('look-prev').onclick = () => step(-1); $('look-next').onclick = () => step(1);
addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea, [contenteditable]')) return;
  if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1);
});
addEventListener('hashchange', () => { const k = fromHash(); if (k && k !== S.look) setLook(k); });
document.querySelectorAll('[data-view]').forEach(b => { b.onclick = () => { S.view = b.dataset.view; buildWorld(); paintControls(); }; });
$('scrub').oninput = () => { S.t = Number($('scrub').value) / 100; S.playing = false; };
$('play').onclick = () => { S.playing = !S.playing; if (S.playing && S.t >= SEQ_END) S.t = 0; };

function resize() {
  const r = view.getBoundingClientRect(); W = r.width; H = r.height; dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  if (renderer) { renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); buildWorld(); }
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (S.playing) { S.t += dt; if (S.t > SEQ_END + 0.6) S.t = 0; }
  const s = sequenceAt(Math.min(S.t, SEQ_END));
  if (renderer && world) readouts(s, draw(s)); else overlay(s, []);
  requestAnimationFrame(frame);
}
new ResizeObserver(resize).observe(view);
resize(); paintControls();
if (!renderer) { $('look-note').textContent = failure; }
addEventListener('error', e => { failure = 'Prototype error: ' + e.message; });
requestAnimationFrame(frame);
