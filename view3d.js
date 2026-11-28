// The 3D view's renderer. It draws a step's scene list with three.js on the WebGL canvas
// behind the 2D canvas (docs/adr/0003), and holds no game rules: what it draws, where, how
// big and in what colour or heat all come from the list, in metres. Each view keeps its flat
// view's camera: the same angle and scale, orthographic (docs/adr/0004). A frame holds a view
// for each camera on screen; each draws its own list in its own part of the canvas. Heat-camera views
// shade every surface by its heat on the thermal scale, with thin outlines; the visible view
// is lit; diagrams are flat colour with outlines. All text stays on the 2D canvas.
//
// The game imports this file after its first flat frame and calls window.IonView3D.start.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sector, strip, stripIndex } from './view3d-shapes.js';

const TAU = Math.PI * 2, DEG = Math.PI / 180;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
// The camera's distance from the origin, and its depth range, in metres.
const CAMERA_DISTANCE = 600, NEAR = 1, FAR = 2000;

/* ── The thermal scale, as the layout's legend: void, sky, dusk, warm, hot, flash ── */
function rampTexture() {
  const stops = [[0, '--void'], [.24, '--sky'], [.45, '--dusk'], [.66, '--warm'], [.86, '--hot'], [1, '--flash']]
    .map(([at, name]) => /** @type {[number, number[]]} */ ([at, rgb(token(name) || '#808080')]));
  const n = 256, data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); let j = 0;
    while (j < stops.length - 2 && t > stops[j + 1][0]) j++;
    const [t0, a] = stops[j], [t1, b] = stops[j + 1], f = clamp((t - t0) / (t1 - t0), 0, 1);
    // Mixed in sRGB and written out unchanged, so the ramp matches the legend's colours exactly.
    for (let k = 0; k < 3; k++) data[i * 4 + k] = Math.round(a[k] + (b[k] - a[k]) * f);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, n, 1);
  tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return tex;
}

// A heat-camera surface: its heat on the thermal scale, a little cooler where it turns away.
function heatMaterial(ramp) {
  return new THREE.ShaderMaterial({
    uniforms: { uHeat: { value: 0.5 }, uRamp: { value: ramp } },
    vertexShader: `#include <clipping_planes_pars_vertex>
      varying vec3 vN;
      void main() {
        vN = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `#include <clipping_planes_pars_fragment>
      uniform float uHeat; uniform sampler2D uRamp; varying vec3 vN;
      void main() {
        #include <clipping_planes_fragment>
        float facing = abs(normalize(vN).z);
        float t = clamp(uHeat * (0.72 + 0.28 * facing), 0.0, 1.0);
        gl_FragColor = vec4(texture2D(uRamp, vec2(t, 0.5)).rgb, 1.0);
      }`,
    side: THREE.DoubleSide, clipping: true
  });
}

// A soft round glow from `colour` at its centre to nothing at its edge, as the flat view's
// gradients; or, `across`, a gradient from left to right.
const glowTextures = new Map();
function glowTexture(stops, across = false) {
  const key = JSON.stringify([stops, across]);
  if (glowTextures.has(key)) return glowTextures.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g2 = c.getContext('2d'), g = across ? g2.createLinearGradient(0, 0, 128, 0) : g2.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, colour] of stops) g.addColorStop(at, colour);
  g2.fillStyle = g; g2.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  glowTextures.set(key, tex); return tex;
}

function tube(points, radius, closed = false) {
  const pts = points.map(p => new THREE.Vector3(...p)), path = new THREE.CurvePath();
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) path.add(new THREE.LineCurve3(pts[i], pts[(i + 1) % pts.length]));
  return new THREE.TubeGeometry(/** @type {any} */ (path), pts.length * 6, radius, 6, false);
}
function swapGeometry(mesh, geometry) { mesh.geometry.dispose(); mesh.geometry = geometry; }
// A mesh over a strip of `k` vertex pairs (view3d-shapes.js) whose positions are rewritten in
// place each frame by `reshape`, so its buffers live as long as the mesh does.
function stripMesh(k, closed, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * k), 3));
  const uv = new Float32Array(4 * k);
  for (let i = 0; i < k; i++) {
    const u = k > 1 ? i / (k - 1) : 0;
    uv[4 * i] = u; uv[4 * i + 1] = 0;
    uv[4 * i + 2] = u; uv[4 * i + 3] = 1;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(stripIndex(k, closed), 1));
  const m = new THREE.Mesh(g, material); m.frustumCulled = false; return m;
}
function reshape(mesh, write) {
  const position = /** @type {THREE.BufferAttribute} */ (mesh.geometry.getAttribute('position'));
  write(/** @type {Float32Array} */ (position.array)); position.needsUpdate = true;
}

/* ── The airliner prop: its mesh file is presentation, sized by the list ── */
async function loadAirliner(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const parts = {};
  gltf.scene.traverse(o => { if (o instanceof THREE.Mesh) parts[o.name] = o.geometry; });
  if (!parts.airframe || !parts.engines) throw new Error('The airliner prop has no airframe or engines mesh.');
  const box = new THREE.Box3();
  for (const g of Object.values(parts)) { g.computeBoundingBox(); box.union(g.boundingBox); }
  const size = box.getSize(new THREE.Vector3());
  // The file is Y up with the nose toward -Z; its span runs along X and its length along Z.
  return { parts, edges: Object.fromEntries(Object.entries(parts).map(([k, g]) => [k, new THREE.EdgesGeometry(g, 30)])), span: size.x, length: size.z };
}

/* ── The plate mount prop: Y up, its origin at its post's tip, sized by the list ── */
async function loadPlateMount(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  /** @type {THREE.BufferGeometry | null} */
  let geometry = null;
  gltf.scene.traverse(o => { if (o instanceof THREE.Mesh && o.name === 'mount') geometry = o.geometry; });
  if (!geometry) throw new Error('The plate mount prop has no mount mesh.');
  geometry.computeBoundingBox();
  const box = geometry.boundingBox, centre = box.getCenter(new THREE.Vector3());
  // `side`: which way, along X, the base stands out from the post.
  return { geometry, edges: new THREE.EdgesGeometry(geometry, 55), height: box.max.y - box.min.y, side: Math.sign(centre.x) || 1 };
}

/* ── The vacuum chamber prop: Y up at its real size in metres, its origin on its axis at half its
   height, its side wall's distance from the axis in its node's extras; sized by the list ── */
async function loadVacuumChamber(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  /** @type {THREE.BufferGeometry | null} */
  let geometry = null, wallRadius = 0;
  gltf.scene.traverse(o => { if (o instanceof THREE.Mesh && o.name === 'chamber') { geometry = o.geometry; wallRadius = o.userData.wallRadius; } });
  if (!geometry) throw new Error('The vacuum chamber prop has no chamber mesh.');
  if (!(wallRadius > 0)) throw new Error('The vacuum chamber prop gives no wall radius.');
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  // Only its sharpest edges are outlined, the flanges and ribs; its faceted wall is not.
  return { geometry, edges: new THREE.EdgesGeometry(geometry, 60), height: box.max.y - box.min.y, wallRadius };
}

/* ── The pump props: Y up at their real size in metres, the piston housing's origin on its axis at
   half its height and its side wall's distance from the axis in its node's extras, the pump
   handle's origin at its grip bar's middle and the bar's length in its; sized by the list ── */
async function loadPumpPart(url, name, measure) {
  const gltf = await new GLTFLoader().loadAsync(url);
  /** @type {THREE.BufferGeometry | null} */
  let geometry = null, size = 0;
  gltf.scene.traverse(o => { if (o instanceof THREE.Mesh && o.name === name) { geometry = o.geometry; size = o.userData[measure]; } });
  if (!geometry) throw new Error(`The ${name} prop has no ${name} mesh.`);
  if (!(size > 0)) throw new Error(`The ${name} prop gives no ${measure}.`);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  return { geometry, edges: new THREE.EdgesGeometry(geometry, 60), height: box.max.y - box.min.y, [measure]: size };
}

/* ── Slice 7 lab props: reactor vessel (bore along Z), split electromagnet coil (left/right halves
   flat in XZ), and measured single-mesh hardware (jar manifold, piston head, inline pipe union) ── */
async function loadReactorVessel(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  /** @type {THREE.BufferGeometry | null} */
  let geometry = null, boreRadius = 0;
  gltf.scene.traverse(o => { if (o instanceof THREE.Mesh && o.name === 'vessel') { geometry = o.geometry; boreRadius = o.userData.boreRadius; } });
  if (!geometry) throw new Error('The reactor vessel prop has no vessel mesh.');
  if (!(boreRadius > 0)) throw new Error('The reactor vessel prop gives no boreRadius.');
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const outerRadius = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.y), Math.abs(box.max.y));
  return { geometry, edges: new THREE.EdgesGeometry(geometry, 55), boreRadius, outerRadius, depth: box.max.z - box.min.z };
}

async function loadCoil(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const parts = {};
  let majorRadius = 0, halfHeight = 0;
  gltf.scene.traverse(o => {
    if (o instanceof THREE.Mesh && (o.name === 'left' || o.name === 'right')) {
      parts[o.name] = o.geometry;
      majorRadius = o.userData.majorRadius || majorRadius;
      halfHeight = o.userData.halfHeight || halfHeight;
    }
  });
  if (!parts.left || !parts.right) throw new Error('The electromagnet coil prop has no left or right mesh.');
  if (!(majorRadius > 0) || !(halfHeight > 0)) throw new Error('The electromagnet coil prop gives no dimensions.');
  return { parts, majorRadius, halfHeight };
}

async function loadMeasuredProp(url, name, measure) {
  const gltf = await new GLTFLoader().loadAsync(url);
  /** @type {THREE.BufferGeometry | null} */
  let geometry = null, size = 0, extraHeight = 0;
  gltf.scene.traverse(o => {
    if (o instanceof THREE.Mesh && o.name === name) {
      geometry = o.geometry;
      size = Number(o.userData[measure]) || 0;
      extraHeight = Number(o.userData.height) || 0;
    }
  });
  if (!geometry) throw new Error(`The ${name} prop has no ${name} mesh.`);
  if (!(size > 0)) throw new Error(`The ${name} prop gives no ${measure}.`);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  return { geometry, edges: new THREE.EdgesGeometry(geometry, 55), height: extraHeight || (box.max.y - box.min.y), size };
}

// A colour as three.js shader uniforms take it, unconverted, so it matches the flat view's.
const shaderColour = hex => new THREE.Vector3(...rgb(hex).map(v => v / 255));
// The plasma bubble: void inside, its rim, the outer 28 % of its radius on screen, turning to the
// rim colour at the rim's opacity, as the flat view's radial gradient.
function bubbleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uInside: { value: new THREE.Vector3() }, uRim: { value: new THREE.Vector3() }, uRimOpacity: { value: 1 } },
    vertexShader: `varying vec3 vN;
      void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uInside; uniform vec3 uRim; uniform float uRimOpacity; varying vec3 vN;
      void main() {
        vec3 n = normalize(vN); float edge = clamp((length(n.xy) - 0.72) / 0.28, 0.0, 1.0);
        gl_FragColor = vec4(mix(uInside, uRim, edge), mix(1.0, uRimOpacity, edge));
      }`,
    transparent: true, depthWrite: false
  });
}
// Simplex noise in three dimensions, for the plasma body's filaments and edge. Ian McEwan and
// Stefan Gustavson's GLSL implementation (Ashima Arts, MIT licence, github.com/ashima/webgl-noise),
// reproduced so the body needs no texture asset.
const SNOISE = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857; vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z); vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0; vec4 s1 = floor(b1) * 2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0); m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }`;
// How far past the entry's radius a plasma body's turbulent edge may reach: its sphere is drawn
// this much larger and the shader cuts it back to a noisy edge, so nothing lies beyond it.
const BODY_REACH = 1.08;
// A plasma body (GLOSSARY.md): the flat view's radial gradient, its core colour out to 35 % of
// the radius on screen, its colour at 45 %, 0.7 as opaque, and nothing at the edge, with the
// shell's filaments brightened toward the core colour where the noise runs high, and the edge
// moved in and out by the same noise, drifting about 5 % of the radius a second on the
// renderer's clock. The entry gives only size, colours and opacity (docs/adr/0003).
function plasmaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uCore: { value: new THREE.Vector3() }, uColour: { value: new THREE.Vector3() }, uOpacity: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vN;
      void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uCore; uniform vec3 uColour; uniform float uOpacity; uniform float uTime; varying vec3 vN;
      ${SNOISE}
      void main() {
        vec3 n = normalize(vN);
        // The sphere is BODY_REACH times the entry's radius, so radii here are in the entry's units.
        vec3 p = vec3(n.xy * ${BODY_REACH}, n.z); float u = length(p.xy), drift = uTime * 0.15;
        float edge = 1.0 + ${BODY_REACH - 1} * snoise(p * 2.0 + vec3(0.0, 0.0, drift));
        if (u > edge) discard;
        float t = u / edge;
        vec4 core = vec4(uCore, uOpacity), mid = vec4(uColour, uOpacity * 0.7);
        vec4 c = t < 0.35 ? core : t < 0.45 ? mix(core, mid, (t - 0.35) / 0.10) : mix(mid, vec4(uColour, 0.0), (t - 0.45) / 0.55);
        float f = snoise(p * 3.0 + vec3(drift * 0.7, -drift, drift * 0.3));
        float filament = smoothstep(0.35, 0.65, f) * smoothstep(0.3, 0.5, t) * (1.0 - t);
        c.rgb = mix(c.rgb, uCore, filament * 0.8); c.a = min(1.0, c.a + filament * 0.35 * uOpacity);
        gl_FragColor = c;
      }`,
    transparent: true, depthWrite: false
  });
}
// A halo on a plane (Ignite's glow round the jar): its radial gradient texture, read along a
// radius the noise moves in and out by up to 5 % on the renderer's clock, so its edge breathes
// and its structure stays. Not a plasma body (GLOSSARY.md); no core, shell or filaments.
function haloMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform float uTime; varying vec2 vUv;
      ${SNOISE}
      void main() {
        vec2 d = (vUv - 0.5) * 2.0; float r = length(d);
        float breath = 1.0 + 0.05 * snoise(vec3(d * 2.5, uTime * 0.15));
        if (r * breath > 1.0) discard;
        gl_FragColor = texture2D(map, 0.5 + d * breath * 0.5);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide
  });
}
// A glow ring round a formation (Orbit's formation glow): one colour at one opacity, breathing
// by up to 12 % with the noise along its length on the renderer's clock.
function breathMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColour: { value: new THREE.Color() }, uOpacity: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vP;
      void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColour; uniform float uOpacity; uniform float uTime; varying vec3 vP;
      ${SNOISE}
      void main() { gl_FragColor = vec4(uColour, uOpacity * (1.0 + 0.12 * snoise(vec3(vP.xy * 0.08, uTime * 0.2)))); }`,
    transparent: true, depthTest: false, side: THREE.DoubleSide
  });
}
// Parse an rgba(...) or #rrggbb colour string into { rgb: [0..1, 0..1, 0..1], a: 0..1 }.
function parseColour(str) {
  const m = /^rgba?\(([^)]+)\)$/.exec(str);
  if (m) {
    const p = m[1].split(',').map(Number);
    return { rgb: [p[0] / 255, p[1] / 255, p[2] / 255], a: p.length > 3 ? p[3] : 1 };
  }
  return { rgb: rgb(str).map(v => v / 255), a: 1 };
}
// Escaping plasma plume at a Hold cusp leak: luminous near the cusp throat, tapering smoothly
// outward with noise-driven flow filaments so open leaks read as escaping energy without burying
// the plasma ball or chamber behind a solid block.
function plumeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColour: { value: new THREE.Color() }, uOpacity: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColour; uniform float uOpacity; uniform float uTime; varying vec2 vUv;
      ${SNOISE}
      void main() {
        float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
        float radial = pow(max(0.0, 1.0 - vUv.y), 1.35);
        float streak = 0.72 + 0.28 * snoise(vec3(vUv.x * 5.0, vUv.y * 3.5 - uTime * 0.85, uTime * 0.15));
        float throat = smoothstep(0.32, 0.0, vUv.y);
        vec3 col = mix(uColour, vec3(1.0, 0.94, 0.9), throat * 0.45);
        float alpha = uOpacity * edge * (0.14 + 0.62 * radial) * streak;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.85));
      }`,
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide
  });
}
// Casimir cavity field glow between the Open step's plates: stronger at the plates than in the
// middle, with subtle standing-mode interference bands that hold still when the clock is pinned.
function gapGlowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uEdge: { value: new THREE.Vector3() }, uEdgeAlpha: { value: 0.22 },
      uMid: { value: new THREE.Vector3() }, uMidAlpha: { value: 0.04 },
      uTime: { value: 0 }
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uEdge; uniform float uEdgeAlpha; uniform vec3 uMid; uniform float uMidAlpha; uniform float uTime; varying vec2 vUv;
      void main() {
        float d = abs(vUv.x - 0.5) * 2.0;
        float wall = pow(d, 1.4);
        float mode = 0.88 + 0.12 * cos(vUv.x * 3.14159265 * 6.0) * cos(vUv.y * 3.14159265 * 2.0 - uTime * 0.7);
        float vFade = smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
        vec3 col = mix(uMid, uEdge, wall);
        float a = mix(uMidAlpha, uEdgeAlpha * 1.45, wall) * mode * vFade;
        gl_FragColor = vec4(col, clamp(a, 0.0, 0.65));
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide
  });
}
// Wormhole throat mouth (Open's throat view): deep void core with a luminous gravitational-lensing
// curvature horizon and delicate animated metric ripples; stays unaffected by depth fog.
function throatMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uVoid: { value: new THREE.Vector3() }, uRim: { value: new THREE.Vector3() },
      uRimAlpha: { value: 0.8 }, uTime: { value: 0 }
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uVoid; uniform vec3 uRim; uniform float uRimAlpha; uniform float uTime; varying vec2 vUv;
      ${SNOISE}
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        if (r > 1.0) discard;
        float angle = atan(p.y, p.x);
        float swirl = 0.5 + 0.5 * snoise(vec3(cos(angle) * 2.2, sin(angle) * 2.2, r * 4.0 - uTime * 0.35));
        float horizon = exp(-pow((r - 0.80) / 0.065, 2.0));
        float outerHalo = smoothstep(1.0, 0.80, r) * smoothstep(0.74, 0.84, r);
        float innerDepth = smoothstep(0.80, 0.15, r);
        float metricRing = smoothstep(0.92, 1.0, sin(r * 28.0 - uTime * 0.6)) * innerDepth * 0.22;
        vec3 col = mix(uVoid, uRim, clamp(horizon * (0.82 + 0.25 * swirl) + metricRing + outerHalo * 0.55, 0.0, 1.0));
        float insideAlpha = smoothstep(0.84, 0.78, r);
        float alpha = max(insideAlpha, (horizon * 0.95 + outerHalo * 0.65) * uRimAlpha);
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false
  });
}

// The lab look's materials, one per prop kind (docs/adr/0007), each in the colour the scene entry
// gives; no textures, so a heat view still colours the same prop by its temperature (docs/adr/0004).
// The three quality levels (docs/VISUAL-AUDIT.md, slice 5). Low draws the scene list as it is.
// Medium adds a fresnel rim on the lab look's glass and a depth tint: what lies behind the
// scene's origin fades a little into the sky, in the lab and visible looks alone, since the heat
// look's colours are temperatures (docs/adr/0004). High adds a bloom round the plasma bodies,
// Ignite's glow and the bright flash. Under auto the renderer starts high on a desktop and medium
// on a phone, times its own first QUALITY_FRAMES draws, and steps down a level while the median
// is over QUALITY_BUDGET_MS: half a 60 Hz frame, leaving the rest to the flat canvas and the physics.
/** @type {('low' | 'medium' | 'high')[]} */
const QUALITY = ['low', 'medium', 'high'];
const QUALITY_FRAMES = 60;
const QUALITY_BUDGET_MS = 8;
// The layer of what blooms. Everything is on layer 0; these are on both.
const BLOOM = 1;
// How strong the glass's fresnel rim is, 0 at low; one uniform, shared by every pane.
const uFresnel = { value: 1 };

// Gives a material a fresnel rim: brighter and less see-through where its surface turns away
// from the camera, as a real jar's edge catches the light. Added to the physical shader after it
// lights the surface; under an orthographic camera the view direction is the camera's axis.
function fresnel(material) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uFresnel = uFresnel;
    shader.fragmentShader = shader.fragmentShader.replace('uniform float opacity;', 'uniform float opacity;\nuniform float uFresnel;')
      .replace('#include <opaque_fragment>', [
        'float rim = uFresnel * pow(1.0 - saturate(dot(geometryViewDir, normal)), 3.0);',
        'outgoingLight += rim * 0.9;',
        'diffuseColor.a = min(1.0, diffuseColor.a + rim * 0.75);',
        '#include <opaque_fragment>'].join('\n'));
  };
  return material;
}

const LAB = {
  glass: colour => fresnel(new THREE.MeshPhysicalMaterial({ color: colour, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.22, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide, depthWrite: false })),
  copper: colour => new THREE.MeshStandardMaterial({ color: colour, metalness: 0.85, roughness: 0.30, side: THREE.DoubleSide }),
  brushed: colour => new THREE.MeshStandardMaterial({ color: colour, metalness: 0.8, roughness: 0.44, side: THREE.DoubleSide }),
  polished: colour => new THREE.MeshStandardMaterial({ color: colour, metalness: 0.95, roughness: 0.16, side: THREE.DoubleSide })
};
// What the lab's metals reflect: a grey room with soft boxes above, to each side and in front of
// the orthographic camera so front-facing polished plates and brushed housings catch clean sheen.
function studio() {
  const room = new THREE.Scene();
  room.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial({ color: 0x3a3f4c, roughness: 0.9, metalness: 0, side: THREE.BackSide })));
  /** @param {[number, number, number]} at */
  const panel = (w, h, at, strength, tint) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ emissive: tint, emissiveIntensity: strength, color: 0 }));
    m.position.set(...at); m.lookAt(0, 0, 0); room.add(m);
  };
  panel(4, 2, [0, 4.9, 0], 6, 0xfff4e6);
  panel(2, 3, [-4.9, 0.5, -1], 3.2, 0xe8f0ff);
  panel(2, 3, [4.9, -0.5, 1], 1.8, 0xffffff);
  panel(4.5, 3, [0, -0.4, -4.9], 2.8, 0xeef4ff);
  panel(5, 2, [0, -4.9, -1.5], 1.4, 0xc8d8f0);
  room.add(new THREE.PointLight(0xffffff, 40, 0, 2));
  return room;
}

// The bloom's three full-screen passes, each a shader over one triangle: the bright part of the
// bloom layer's render, a blur in one direction, and the blurred glow added over the frame. Not
// the addons' composer: it owns the whole canvas, and each view here draws into its own scissor.
const SCREEN_VERTEX = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
/** @param {string} fragment @param {Record<string, { value: any }>} uniforms @param {THREE.Blending} [blending] */
const screenMaterial = (fragment, uniforms, blending = THREE.NoBlending) => new THREE.ShaderMaterial({ uniforms, vertexShader: SCREEN_VERTEX, fragmentShader: fragment, depthTest: false, depthWrite: false, transparent: blending !== THREE.NoBlending, blending });
// The glow goes over the frame as a screen blend, glow + frame × (1 − glow), not AdditiveBlending:
// it is the same soft halo on the dark around a plasma body, but it cannot push the body itself
// past white, so the speckle inside a body stays legible at high.
const screenBlend = () => ({ blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcColorFactor });
const BRIGHT = `uniform sampler2D map; uniform float threshold; varying vec2 vUv;
void main() { vec3 c = texture2D(map, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(threshold, threshold + 0.3, l), 1.0); }`;
const BLUR = `uniform sampler2D map; uniform vec2 step; varying vec2 vUv;
void main() {
  vec3 sum = texture2D(map, vUv).rgb * 0.227;
  sum += (texture2D(map, vUv + step * 1.385).rgb + texture2D(map, vUv - step * 1.385).rgb) * 0.316;
  sum += (texture2D(map, vUv + step * 3.231).rgb + texture2D(map, vUv - step * 3.231).rgb) * 0.070;
  gl_FragColor = vec4(sum, 1.0);
}`;
const ADD = `uniform sampler2D map; uniform float strength; varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(map, vUv).rgb * strength, 1.0);
#include <colorspace_fragment>
}`;

/**
 * Starts WebGL on `canvas` and loads the props. Rejects where WebGL can't start. `quality` is the
 * player's level or 'auto'; `phone` says auto should start at medium; `onQuality` hears what
 * auto settles on.
 * @param {HTMLCanvasElement} canvas
 * @param {{ props: { airliner: string, plateMount: string, vacuumChamber: string, pistonHousing: string, pumpHandle: string, reactorVessel: string, jarManifold: string, electromagnetCoil: string, pistonHead: string, pipeUnion: string }, onLost: () => void, quality?: 'auto' | 'low' | 'medium' | 'high', phone?: boolean, onQuality?: (q: { level: 'low' | 'medium' | 'high', auto: boolean, median: number | null }) => void }} options
 */
async function start(canvas, { props, onLost, quality = 'auto', phone = false, onQuality = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.localClippingEnabled = true;
  canvas.addEventListener('webglcontextlost', () => onLost(), { once: true });
  // The quality level: the player's choice, or under auto the level the first frames' timing
  // settles on. `samples` holds the draw times still being read; `median` the last one read.
  /** @type {'auto' | 'settled' | 'low' | 'medium' | 'high'} */ let choice = 'auto';
  /** @type {'low' | 'medium' | 'high'} */ let level = 'high';
  /** @type {number[]} */ let samples = [];
  /** @type {number | null} */ let median = null;
  /** @param {'auto' | 'low' | 'medium' | 'high'} c */
  function choose(c) {
    choice = c === 'low' || c === 'medium' || c === 'high' ? c : 'auto';
    level = choice === 'auto' ? (phone ? 'medium' : 'high') : choice;
    samples = []; median = null;
  }
  choose(quality);
  // After each window of frames under auto: down a level while the median is over budget, else settled.
  function judge() {
    const sorted = [...samples].sort((a, b) => a - b); median = sorted[sorted.length >> 1]; samples = [];
    if (median > QUALITY_BUDGET_MS && level !== 'low') { level = QUALITY[QUALITY.indexOf(level) - 1]; return; }
    choice = 'settled'; onQuality({ level, auto: true, median });
  }
  const [airliner, mount, chamber, housing, handle, vessel, jarManifold, coilProp, pistonHead, pipeUnion] = await Promise.all([
    loadAirliner(props.airliner), loadPlateMount(props.plateMount), loadVacuumChamber(props.vacuumChamber),
    loadPumpPart(props.pistonHousing, 'housing', 'wallRadius'), loadPumpPart(props.pumpHandle, 'handle', 'span'),
    loadReactorVessel(props.reactorVessel), loadMeasuredProp(props.jarManifold, 'manifold', 'seatRadius'),
    loadCoil(props.electromagnetCoil), loadMeasuredProp(props.pistonHead, 'piston', 'radius'),
    loadMeasuredProp(props.pipeUnion, 'union', 'length')
  ]);
  // The props' geometry is shared by every world, so it stays when a world goes.
  const shared = new Set([
    ...Object.values(airliner.parts), ...Object.values(airliner.edges), mount.geometry, mount.edges,
    chamber.geometry, chamber.edges, housing.geometry, housing.edges, handle.geometry, handle.edges,
    vessel.geometry, vessel.edges, jarManifold.geometry, jarManifold.edges,
    ...Object.values(coilProp.parts),
    pistonHead.geometry, pistonHead.edges, pipeUnion.geometry, pipeUnion.edges
  ]);
  const ramp = rampTexture();
  const pmrem = new THREE.PMREMGenerator(renderer), environment = pmrem.fromScene(studio(), 0.04).texture; pmrem.dispose();
  // A world for each view: its camera, scene and pooled objects. `world` is the one being drawn.
  let worlds = [], world = null, size = '';
  // The one clock every moving material reads, in seconds since the renderer started. Pinned at
  // `t` it stops advancing, which is how tests and captures hold a frame and how reduced motion
  // keeps the structure and drops the movement (GLOSSARY.md). The setting is read once, at start.
  let clock = 0, pinned = null, last = performance.now();
  /** @param {number | null} t */
  function freeze(t) { pinned = t; if (t !== null) clock = t; }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) freeze(0);
  function tick() { const now = performance.now(); if (pinned === null) clock += (now - last) / 1000; last = now; }
  // A plasma body, a sphere drawn larger than the entry's radius for its edge to move in.
  const body = (kind, order) => e => {
    const b = take(kind, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), plasmaMaterial()); m.renderOrder = order; m.layers.enable(BLOOM); return m; });
    const { uCore, uColour, uOpacity, uTime } = b.material.uniforms;
    uCore.value.copy(shaderColour(e.core)); uColour.value.copy(shaderColour(e.colour)); uOpacity.value = e.opacity; uTime.value = clock;
    b.position.set(...e.at); b.scale.setScalar(e.radius * BODY_REACH);
  };

  function dispose(w) {
    for (const t of w.targets) t.dispose();
    // A world's own geometry and materials go; the prop's shared geometry and the textures stay.
    w.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Sprite)) return;
      if (!(o instanceof THREE.Sprite) && !shared.has(o.geometry)) o.geometry.dispose();
      o.material.dispose();
    });
  }

  function build(look, view, H) {
    const { left, width, origin: [ox, oy], camera: { angle, scale } } = view;
    // The frustum is cut so the scene's origin falls at the view's origin on the canvas.
    const th = angle * DEG, cam = new THREE.OrthographicCamera((left - ox) / scale, (left + width - ox) / scale, oy / scale, (oy - H) / scale, NEAR, FAR);
    // Turned about the x axis by the view's angle, as the game's camB: screen y is y cos θ - z sin θ.
    cam.position.set(0, -CAMERA_DISTANCE * Math.sin(th), -CAMERA_DISTANCE * Math.cos(th));
    cam.up.set(0, -Math.cos(th), Math.sin(th)); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
    const scene = new THREE.Scene();
    if (look === 'visible') {
      const axis = new THREE.Vector3(1, 0, 0);
      scene.add(new THREE.AmbientLight(0xdce6ff, 0.85));
      // The sun and sky fills turn with the camera, so every camera sees its side lit as camera 1
      // sees the top while giving the fuselage and wings clean three-dimensional form.
      const sun = new THREE.DirectionalLight(0xfff8ee, 2.2);
      sun.position.set(-60, -90, -140).applyAxisAngle(axis, -th);
      const skyFill = new THREE.DirectionalLight(0xc2d6ff, 0.65);
      skyFill.position.set(85, 60, -90).applyAxisAngle(axis, -th);
      const rim = new THREE.DirectionalLight(0xffffff, 0.85);
      rim.position.set(45, -70, 130).applyAxisAngle(axis, -th);
      scene.add(sun, skyFill, rim);
    }
    if (look === 'lab') {
      // A key from the upper left in front, a cooler fill from the lower right, a rim from behind
      // the upper right, all turned with the camera as the visible look's sun is, over the studio's
      // reflections (docs/adr/0007). No shadow maps: a side-on orthographic view gains nothing from them.
      const axis = new THREE.Vector3(1, 0, 0);
      const key = new THREE.DirectionalLight(0xfff1e0, 2.6); key.position.set(-70, -110, -120).applyAxisAngle(axis, -th);
      const fill = new THREE.DirectionalLight(0xdbe6ff, 0.9); fill.position.set(90, 50, -90).applyAxisAngle(axis, -th);
      const rim = new THREE.DirectionalLight(0xffffff, 1.6); rim.position.set(50, -80, 130).applyAxisAngle(axis, -th);
      scene.add(new THREE.AmbientLight(0xffffff, 0.35), key, fill, rim);
      scene.environment = environment; scene.environmentIntensity = 1.1;
    }
    const outline = look === 'heat' ? [token('--ink'), .85] : look === 'visible' ? ['#2a3045', 1] : [token('--deep'), 1];
    // The depth tint, from the scene's origin back to three quarters of the view's height behind
    // it, in the sky's colour; draw() hangs it on the scene at medium and above.
    let fog = null;
    if (look === 'lab' || look === 'visible') fog = new THREE.Fog(0x000000, CAMERA_DISTANCE, CAMERA_DISTANCE + 0.75 * H / scale);
    return { look, cam, scene, outline, scale, view, fog, pools: new Map(), targets: /** @type {THREE.WebGLRenderTarget[]} */ ([]) };
  }

  // The bloom at high: the bloom layer alone, drawn through the view's camera into a target a
  // quarter the view's size, its bright part blurred twice each way and added over the frame in
  // the view's part of the canvas. What hides a plasma body in the main pass is not drawn here,
  // so a body behind an opaque prop would still glow through it; no scene list stands one there.
  const bright = screenMaterial(BRIGHT, { map: { value: null }, threshold: { value: 0.5 } });
  const blur = screenMaterial(BLUR, { map: { value: null }, step: { value: new THREE.Vector2() } });
  const add = screenMaterial(ADD, { map: { value: null }, strength: { value: 0.45 } }, THREE.CustomBlending);
  Object.assign(add, screenBlend());
  const screen = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)).setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2)), bright);
  const screenScene = new THREE.Scene(), screenCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); screenScene.add(screen);
  function pass(material, target) { screen.material = material; renderer.setRenderTarget(target); renderer.render(screenScene, screenCam); }
  function bloom(w, H) {
    const { view, cam, scene } = w, dpr = renderer.getPixelRatio();
    const tw = Math.max(1, Math.round(view.width * dpr / 4)), th = Math.max(1, Math.round(H * dpr / 4));
    if (w.targets.length === 0 || w.targets[0].width !== tw || w.targets[0].height !== th) {
      w.targets.forEach(t => t.dispose());
      w.targets = [0, 1, 2].map(() => new THREE.WebGLRenderTarget(tw, th, { depthBuffer: false }));
    }
    const [source, a, b] = w.targets;
    // The bloom layer over black, not the sky: the main pass left the sky as the clear colour.
    const background = scene.background, fog = scene.fog, clearColour = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
    scene.background = null; scene.fog = null; cam.layers.set(BLOOM); renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(source); renderer.setScissorTest(false); renderer.render(scene, cam);
    cam.layers.set(0); scene.background = background; scene.fog = fog;
    bright.uniforms.map.value = source.texture; pass(bright, a);
    for (let i = 0; i < 2; i++) {
      blur.uniforms.map.value = a.texture; blur.uniforms.step.value.set(1 / tw, 0); pass(blur, b);
      blur.uniforms.map.value = b.texture; blur.uniforms.step.value.set(0, 1 / th); pass(blur, a);
    }
    // Added over the frame already drawn, so no clear first.
    renderer.setRenderTarget(null); renderer.setScissorTest(true); renderer.autoClear = false;
    renderer.setViewport(view.left, 0, view.width, H); renderer.setScissor(view.left, 0, view.width, H);
    add.uniforms.map.value = a.texture; pass(add, null);
    renderer.autoClear = true; renderer.setClearColor(clearColour, clearAlpha);
  }

  // Objects are pooled by kind and reused frame to frame; what the list leaves out is hidden.
  function take(kind, make) {
    let pool = world.pools.get(kind);
    if (!pool) world.pools.set(kind, pool = { items: [], used: 0 });
    if (pool.used === pool.items.length) { const o = make(); world.scene.add(o); pool.items.push(o); }
    const o = pool.items[pool.used++]; o.visible = true; return o;
  }
  // A prop's surface for the world's look; `kind` is what the prop is made of, read by the lab look alone.
  const surface = (colour, kind = 'brushed') => world.look === 'heat' ? heatMaterial(ramp)
    : world.look === 'visible' ? new THREE.MeshLambertMaterial({ color: colour, side: THREE.DoubleSide })
    : world.look === 'lab' ? LAB[kind](colour)
    : new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide });
  const paint = (material, entry, heat, colour) => {
    if (material instanceof THREE.ShaderMaterial) material.uniforms.uHeat.value = entry[heat];
    else material.color.set(entry[colour]);
  };
  const facing = o => { o.quaternion.copy(world.cam.quaternion); return o; };
  const lineMaterial = () => new THREE.LineBasicMaterial({ color: world.outline[0], transparent: true, opacity: world.outline[1] });
  // Where a point falls on screen, in pixels from the scene's origin: right and down.
  const project = p => { const v = new THREE.Vector3(...p).applyMatrix4(world.cam.matrixWorldInverse); return [v.x * world.scale, -v.y * world.scale]; };
  // Rings round each point and an outline round their triangle, standing `pad` further out from
  // the centre on screen, as the flat view's orbGlow: the throat forming, the Formation's glow.
  // A ring round each point and an outline round them all; `breathing` rings take the glow ring
  // material and move with the clock, the others hold one colour.
  const roundGlow = (kind, breathing = false) => e => {
    const material = m => {
      if (m.material instanceof THREE.ShaderMaterial) { const u = m.material.uniforms; u.uColour.value.set(e.colour); u.uOpacity.value = e.opacity; u.uTime.value = clock; }
      else { m.material.color.set(e.colour); m.material.opacity = e.opacity; }
      m.renderOrder = 5; return m;
    };
    const make = () => new THREE.Mesh(new THREE.BufferGeometry(), breathing ? breathMaterial() : new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, side: THREE.DoubleSide }));
    for (const p of e.points) {
      const r = material(take(kind + ' ring', make));
      swapGeometry(r, new THREE.RingGeometry(e.ring - e.width / 2, e.ring + e.width / 2, 48));
      facing(r).position.set(...p);
    }
    const padded = e.points.map(p => { const [x, y] = project(p), m = Math.hypot(x, y) / world.scale, k = m > 0.5 ? (m + e.pad) / m : 1; return p.map(c => c * k); });
    swapGeometry(material(take(kind + ' outline', make)), tube(padded, e.width / 2, true));
  };

  const DRAW = {
    sky(e) { world.scene.background = new THREE.Color(e.colour); },
    cloud(e) {
      const c = take('cloud', () => new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({
        map: glowTexture([[0, 'rgba(255,255,255,.92)'], [.45, 'rgba(255,255,255,.52)'], [.8, 'rgba(255,255,255,.12)'], [1, 'rgba(255,255,255,0)']]),
        transparent: true, depthWrite: false
      })));
      c.material.color.set(e.colour); c.material.opacity = Math.min(1, e.opacity * 1.45); c.renderOrder = -1;
      facing(c).position.set(...e.at); c.scale.set(e.size[0], e.size[1], 1);
    },
    airliner(e) {
      const g = take('airliner', () => {
        const outer = new THREE.Group(), inner = new THREE.Group();
        // Into the game's frame: the file's up (+Y) is the game's -z, its nose (-Z) the game's -y.
        inner.rotation.x = -Math.PI / 2; outer.add(inner);
        for (const part of ['airframe', 'engines']) {
          const mesh = new THREE.Mesh(airliner.parts[part], surface('#ffffff')); mesh.name = part;
          const edges = new THREE.LineSegments(airliner.edges[part], lineMaterial());
          inner.add(mesh, edges);
        }
        return outer;
      });
      g.position.set(...e.at);
      const sx = e.size[0] / airliner.span, sz = e.size[1] / airliner.length;
      g.children[0].scale.set(sx, sz, sz);
      // A cut keeps only what is before the entrance line, y >= cutBeyond.
      const clip = e.cutBeyond === undefined ? null : [new THREE.Plane(new THREE.Vector3(0, 1, 0), -e.cutBeyond)];
      for (const o of g.children[0].children) {
        const m = /** @type {any} */ (o).material;
        if (o instanceof THREE.Mesh) paint(m, e, o.name === 'engines' ? 'engineHeat' : 'heat', o.name === 'engines' ? 'engineColour' : 'colour');
        m.clippingPlanes = clip;
      }
    },
    orb(e) {
      const o = take('orb', () => {
        const g = new THREE.Group();
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }));
        const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), surface('#ffffff'));
        g.add(halo, ball);
        // Heat views ring each orb in the outline colour, so it reads as a schematic mark too.
        if (world.look === 'heat') g.add(facing(new THREE.Mesh(new THREE.RingGeometry(1, 1, 32), new THREE.MeshBasicMaterial({ color: world.outline[0], transparent: true, opacity: world.outline[1], side: THREE.DoubleSide }))));
        // The flat view draws the orbs over the airliner, so an orb the airframe would hide stays
        // in view; and an orb is a signal, not scenery, so the depth tint leaves it alone ({ fog: false }).
        g.children.forEach(c => { Object.assign(/** @type {any} */ (c).material, { depthTest: false, fog: false }); c.renderOrder = 4; });
        return g;
      });
      const [halo, ball, ring] = o.children;
      o.position.set(...e.at);
      ball.scale.setScalar(e.size); paint(/** @type {any} */ (ball).material, e, 'heat', 'colour');
      const hm = /** @type {THREE.SpriteMaterial} */ (/** @type {THREE.Sprite} */ (halo).material);
      const map = glowTexture([[0, e.halo], [.3, e.halo], [1, 'rgba(0,0,0,0)']]);
      if (hm.map !== map) { hm.map = map; hm.needsUpdate = true; }
      halo.scale.setScalar(e.size * 6);
      if (ring) swapGeometry(ring, new THREE.RingGeometry(e.size + 0.5 / world.scale, e.size + 1.5 / world.scale, 32));
    },
    triangle(e) {
      const t = take('triangle', () => new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ transparent: true, fog: false })));
      t.material.color.set(e.colour); t.material.opacity = e.opacity;
      swapGeometry(t, new THREE.BufferGeometry().setFromPoints(e.points.map(p => new THREE.Vector3(...p))));
    },
    // A cold mark on the thermal scale, and in the heat look an edge round it in the outline colour:
    // the same tube a little wider, drawn back face only after the mark, so only its rim shows past
    // the mark's own faces, and the cold shape reads at a glance (docs/VISUAL-AUDIT.md, finding 5).
    'cold mark'(e) {
      const m = take('cold mark', () => {
        const mark = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true }));
        const edge = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.BackSide }));
        edge.renderOrder = 1; mark.add(edge); return mark;
      });
      m.material.color.set(e.colour); m.material.opacity = e.opacity;
      swapGeometry(m, tube(e.path, e.width / 2));
      const edge = /** @type {any} */ (m.children[0]); edge.visible = world.look === 'heat';
      if (edge.visible) { edge.material.color.set(world.outline[0]); edge.material.opacity = world.outline[1]; swapGeometry(edge, tube(e.path, e.width / 2 + Math.max(e.width * 0.3, 0.2))); }
    },
    // Open's plates: boxes, as the list sizes them, outlined.
    plate(e) {
      const p = take('plate', () => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), surface('#ffffff', 'polished'));
        m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), lineMaterial()));
        return m;
      });
      p.position.set(...e.at); p.scale.set(...e.size); paint(p.material, e, 'heat', 'colour');
    },
    // The glow in the gap, brighter at the plates than in the middle, behind the plates' faces.
    'gap glow'(e) {
      const g = take('gap glow', () => new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
        world.look === 'lab' ? gapGlowMaterial() : new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })));
      if (g.material instanceof THREE.ShaderMaterial) {
        const edge = parseColour(e.colour), mid = parseColour(e.middle);
        g.material.uniforms.uEdge.value.set(...edge.rgb); g.material.uniforms.uEdgeAlpha.value = edge.a;
        g.material.uniforms.uMid.value.set(...mid.rgb); g.material.uniforms.uMidAlpha.value = mid.a;
        g.material.uniforms.uTime.value = clock;
      } else {
        const map = glowTexture([[0, e.colour], [.5, e.middle], [1, e.colour]], true);
        if (g.material.map !== map) { g.material.map = map; g.material.needsUpdate = true; }
      }
      g.position.set(...e.at); g.scale.set(e.size[0], e.size[1], 1);
    },
    'plate mount'(e) {
      const g = take('plate mount', () => {
        const outer = new THREE.Group(), inner = new THREE.Group();
        // Into the game's frame: the file's up (+Y) is the game's -y, up the canvas in a side-on view.
        inner.rotation.x = Math.PI; outer.add(inner);
        inner.add(new THREE.Mesh(mount.geometry, surface('#ffffff', 'brushed')), new THREE.LineSegments(mount.edges, lineMaterial()));
        return outer;
      });
      g.position.set(...e.at);
      // Evenly scaled to the list's height, and mirrored so the base stands out away from the view's
      // middle: a presentation choice from the listed place, as the list carries no facing (docs/adr/0003).
      const k = e.height / mount.height, inner = g.children[0];
      inner.scale.set(k * (mount.side === Math.sign(e.at[0] || 1) ? 1 : -1), k, k);
      paint(/** @type {any} */ (inner.children[0]).material, e, 'heat', 'colour');
    },
    // A wormhole's throat, seen down its length: its mouth, void within and a glowing curvature rim,
    // and rings narrowing as they go deeper, all behind whatever is in front of it.
    throat(e) {
      const t = take('throat', () => {
        const g = new THREE.Group();
        const mouth = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), throatMaterial());
        mouth.renderOrder = 1; g.add(mouth);
        const circle = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, i) => new THREE.Vector3(Math.cos(i / 96 * TAU), Math.sin(i / 96 * TAU), 0)));
        for (let i = 1; i <= 5; i++) { const ring = new THREE.LineLoop(i === 1 ? circle : circle.clone(), new THREE.LineBasicMaterial({ transparent: true, fog: false })); ring.renderOrder = 2; g.add(ring); }
        return g;
      });
      t.position.set(...e.at);
      const [mouth, ...rings] = /** @type {any[]} */ (t.children);
      const rim = parseColour(e.rim);
      mouth.material.uniforms.uVoid.value.copy(shaderColour(e.colour));
      mouth.material.uniforms.uRim.value.set(...rim.rgb);
      mouth.material.uniforms.uRimAlpha.value = rim.a;
      mouth.material.uniforms.uTime.value = clock;
      mouth.scale.setScalar(e.radius * 1.25);
      rings.forEach((ring, j) => {
        const i = j + 1, r = e.radius * Math.pow(1 - i / 6, 1.4);
        ring.material.color.set(e.rings); ring.material.opacity = e.ringOpacity * (1.15 - j * 0.14);
        ring.scale.set(r, r, 1); ring.position.z = e.radius * i / 6;
      });
    },
    // The plasma bubble and its wall.
    bubble(e) {
      const b = take('bubble', () => {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), bubbleMaterial());
        const wall = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true }));
        wall.renderOrder = 1; ball.add(wall); return ball;
      });
      const { uInside, uRim, uRimOpacity } = b.material.uniforms;
      uInside.value.copy(shaderColour(e.colour)); uRim.value.copy(shaderColour(e.rim)); uRimOpacity.value = e.rimOpacity;
      b.position.set(...e.at); b.scale.setScalar(e.radius);
      const wall = /** @type {any} */ (b.children[0]);
      wall.material.color.set(e.wall); wall.material.opacity = e.wallOpacity;
      // A torus round the bubble, facing the camera, as wide as the flat view's stroke; in the
      // ball's units, which the ball's scale makes metres.
      swapGeometry(wall, new THREE.TorusGeometry(1, e.wallWidth / 2 / e.radius, 8, 96));
      facing(wall); wall.quaternion.premultiply(b.quaternion.clone().invert());
    },
    // Specks the list's size across: squares, or `round` dots; each as opaque as `opacities` gives.
    specks(e) {
      const p = take(e.round ? 'round specks' : 'specks', () => {
        const m = new THREE.PointsMaterial({ sizeAttenuation: false });
        if (e.round) { m.map = glowTexture([[0, 'rgba(255,255,255,1)'], [.45, 'rgba(255,255,255,.95)'], [.75, 'rgba(255,255,255,.4)'], [1, 'rgba(255,255,255,0)']]); m.transparent = true; m.depthWrite = false; }
        m.fog = false; // the specks are a signal, not scenery
        const points = new THREE.Points(new THREE.BufferGeometry(), m); points.renderOrder = 5; return points;
      });
      p.material.color.set(e.colour); p.material.size = e.size * world.scale;
      const geometry = new THREE.BufferGeometry().setFromPoints(e.points.map(q => new THREE.Vector3(...q)));
      if (e.opacities) geometry.setAttribute('color', new THREE.Float32BufferAttribute(e.opacities.flatMap(a => [1, 1, 1, a]), 4));
      if (p.material.vertexColors !== !!e.opacities) { p.material.vertexColors = !!e.opacities; p.material.transparent = true; p.material.needsUpdate = true; }
      swapGeometry(p, geometry);
    },
    // Fuel's reactor wall, end on: the active first-wall torus coloured by neutron exposure,
    // framed by the machined ConFlat reactor vessel viewport and a recessed chamber bore in lab look.
    'reactor wall'(e) {
      const w = take('reactor wall', () => {
        const g = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.BufferGeometry(), surface('#ffffff', 'brushed'));
        ring.material.depthWrite = false;
        g.add(ring);
        if (world.look === 'lab') {
          const liner = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.68, 1, 64, 1, true).rotateX(Math.PI / 2), surface('#141c36', 'brushed'));
          const bulkhead = new THREE.Group();
          bulkhead.add(new THREE.Mesh(vessel.geometry, surface('#364468', 'brushed')), new THREE.LineSegments(vessel.edges, lineMaterial()));
          g.add(liner, bulkhead);
        }
        return g;
      });
      w.position.set(...e.at);
      const [ring, liner, bulkhead] = /** @type {any[]} */ (w.children);
      paint(ring.material, e, 'heat', 'colour');
      swapGeometry(ring, new THREE.TorusGeometry(e.radius, e.width / 2, 12, 128));
      if (liner && bulkhead) {
        const k = e.radius * 1.26 / vessel.outerRadius;
        bulkhead.scale.setScalar(k);
        bulkhead.position.z = vessel.depth * k * 0.55 + e.width * 0.65;
        const depth = e.radius * 0.9;
        liner.scale.set(e.radius, e.radius, depth);
        liner.position.z = depth / 2 + vessel.depth * k * 0.45 + e.width * 0.65;
      }
    },
    // Fuel's burning core: a disc fading from its middle's colour (`core`), as opaque as `opacity`,
    // to nothing in its edge colour (`colour`), as the flat view's gradient. Its brightness changes
    // with the temperature slider, so the disc repaints its own texture rather than cache one per value.
    // Fuel's core: a plasma body, as Hold's ball is.
    'core glow'(e) { body('core glow', 2)(e); },
    // Hold's vacuum chamber, cut away: only its far half, so the ball and coils inside it show.
    'vacuum chamber'(e) {
      const g = take('vacuum chamber', () => {
        const outer = new THREE.Group(), inner = new THREE.Group();
        // Into the game's frame: the file's up (+Y) is the game's -y, up the canvas in a side-on view.
        inner.rotation.x = Math.PI; outer.add(inner);
        const far = [new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)];
        const body = new THREE.Mesh(chamber.geometry, surface('#ffffff', 'brushed')), edges = new THREE.LineSegments(chamber.edges, lineMaterial());
        for (const o of [body, edges]) /** @type {any} */ (o.material).clippingPlanes = far;
        inner.add(body, edges); return outer;
      });
      g.position.set(...e.at);
      // Its side wall at the list's radius and its whole height the list's: sized by the list (docs/adr/0003).
      const inner = g.children[0]; const across = e.radius / chamber.wallRadius; inner.scale.set(across, e.height / chamber.height, across);
      paint(/** @type {any} */ (inner.children[0]).material, e, 'heat', 'colour');
    },
    // A coil: a ring round the y axis, its left and right halves each as opaque as the list gives
    // over the sky's colour, as the flat view fills its coils over the background, outlined round
    // its top and bottom. In the lab look the halves use the split Bitter magnet coil prop in copper,
    // and the list's opacity, the coil's current, shows as how warmly each copper half glows.
    coil(e) {
      const c = take('coil', () => {
        const g = new THREE.Group();
        const sides = ['left', 'right'];
        for (let i = 0; i < 2; i++) {
          if (world.look === 'lab') {
            g.add(new THREE.Mesh(coilProp.parts[sides[i]], surface('#ffffff', 'copper')));
          } else {
            g.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })));
          }
        }
        for (let i = 0; i < 2; i++) g.add(new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()));
        for (let i = 0; i < 2; i++) g.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
        return g;
      });
      c.position.set(...e.at);
      const [left, right, top, bottom, ...backing] = /** @type {any[]} */ (c.children);
      [left, right].forEach((half, i) => {
        half.material.color.set(e.colour);
        if (world.look === 'lab') {
          const sx = e.radius / coilProp.majorRadius, sy = (e.tube / coilProp.halfHeight) * 1.15;
          half.scale.set(sx, sy, sx);
          half.material.emissive.set(e.colour); half.material.emissiveIntensity = 0.35 * e.opacity[i];
        } else {
          // Half a torus, turned to the left (x below 0) or right half, then laid round the y axis.
          const geometry = new THREE.TorusGeometry(e.radius, e.tube, 12, 48, Math.PI).rotateZ(i ? -Math.PI / 2 : Math.PI / 2).rotateX(Math.PI / 2);
          swapGeometry(half, geometry);
          half.material.opacity = e.opacity[i];
          backing[i].visible = true;
          swapGeometry(backing[i], geometry.clone()); backing[i].material.color.copy(/** @type {any} */ (world.scene.background) || new THREE.Color(0));
        }
        if (world.look === 'lab') backing[i].visible = false;
      });
      [top, bottom].forEach((rim, i) => {
        rim.visible = world.look !== 'lab';
        if (rim.visible) {
          swapGeometry(rim, new THREE.BufferGeometry().setFromPoints(Array.from({ length: 64 }, (_, k) => new THREE.Vector3(Math.cos(k / 64 * TAU) * e.radius, (i ? 1 : -1) * e.tube, Math.sin(k / 64 * TAU) * e.radius))));
          rim.material.color.set(e.edge);
        }
      });
    },
    'plasma ball'(e) { body('plasma ball', 3)(e); },
    // The field's edge round the ball, broken at each leak, and the plasma pluming out of each:
    // in the plane facing a side-on camera, in front of everything, as the flat view draws them.
    'cusp leaks'(e) {
      // Each leak: the field's edge from it to the next leak, a ring sector as wide as the flat
      // view's stroke; the plume, a radial-fade plasma jet from the edge out to its reach; and the
      // plume's flared open boundary (no straight chord cutting across the plasma ball). All
      // rewritten in place each frame as the ball eases.
      const n = e.angles.length, ARC = 32, PLUME = 12, l = take('cusp leaks', () => {
        const g = new THREE.Group();
        const basic = () => new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
        for (let i = 0; i < n; i++) { const m = stripMesh(ARC + 1, false, basic()); m.renderOrder = 6; g.add(m); }
        for (let i = 0; i < n; i++) { const m = stripMesh(PLUME + 1, false, plumeMaterial()); m.renderOrder = 6; g.add(m); }
        for (let i = 0; i < n; i++) { const m = stripMesh(PLUME + 3, false, basic()); m.renderOrder = 6; g.add(m); }
        return g;
      });
      l.position.set(...e.at);
      const half = e.halfAngle, parts = /** @type {any[]} */ (l.children);
      const at = (r, t) => [Math.cos(t) * r, Math.sin(t) * r];
      e.angles.forEach((a, i) => {
        const next = i + 1 < n ? e.angles[i + 1] : e.angles[0] + TAU, [arc, fill, outline] = [parts[i], parts[n + i], parts[2 * n + i]];
        reshape(arc, out => sector(out, e.edge - e.edgeWidth / 2, e.edge + e.edgeWidth / 2, a + half, next - half, ARC));
        arc.material.color.set(e.colour); arc.material.opacity = e.edgeOpacity;
        reshape(fill, out => sector(out, e.edge, e.plume, a - half, a + half, PLUME));
        fill.material.uniforms.uColour.value.set(e.colour);
        fill.material.uniforms.uOpacity.value = e.plumeOpacity;
        fill.material.uniforms.uTime.value = clock;
        // Open flared boundary: up its left side, across its reach, down its right side.
        const rim = Array.from({ length: PLUME + 1 }, (_, k) => at(e.plume, a - half + 2 * half * k / PLUME));
        reshape(outline, out => strip(out, [at(e.edge, a - half), ...rim, at(e.edge, a + half)], e.plumeWidth * 0.7, false));
        outline.material.color.set(e.colour); outline.material.opacity = e.plumeOpacity * 0.55;
      });
    },
    // Ignite's pipe from the jar to the pump: a tube as wide as the flat view's stroke, with
    // machined coupling collars at the ends and an inline vacuum flange union in the lab look.
    pipe(e) {
      const p = take('pipe', () => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.BufferGeometry(), surface('#ffffff', 'brushed')));
        if (world.look === 'lab') {
          for (let i = 0; i < 2; i++) g.add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 20).rotateZ(Math.PI / 2), surface('#8f9bbb', 'polished')));
          const union = new THREE.Group();
          union.rotation.x = Math.PI;
          union.add(new THREE.Mesh(pipeUnion.geometry, surface('#98a6c4', 'brushed')), new THREE.LineSegments(pipeUnion.edges, lineMaterial()));
          g.add(union);
        }
        return g;
      });
      const [line, leftCollar, rightCollar, union] = /** @type {any[]} */ (p.children);
      paint(line.material, e, 'heat', 'colour'); swapGeometry(line, tube([e.from, e.to], e.width / 2));
      if (leftCollar && rightCollar && union) {
        const r = e.width * 1.9, len = e.width * 2.8;
        leftCollar.position.set(...e.from); leftCollar.scale.set(len, r, r);
        rightCollar.position.set(...e.to); rightCollar.scale.set(len, r, r);
        const span = Math.hypot(e.to[0] - e.from[0], e.to[1] - e.from[1]);
        union.position.set((e.from[0] + e.to[0]) / 2, (e.from[1] + e.to[1]) / 2, (e.from[2] + e.to[2]) / 2);
        union.scale.setScalar((span * 0.56) / pipeUnion.size);
      }
    },
    // The pump's barrel, cut away as the vacuum chamber is: only its far half, so the piston inside shows.
    'piston housing'(e) {
      const g = take('piston housing', () => {
        const outer = new THREE.Group(), inner = new THREE.Group();
        // Into the game's frame: the file's up (+Y) is the game's -y, up the canvas in a side-on view.
        inner.rotation.x = Math.PI; outer.add(inner);
        const far = [new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)];
        const body = new THREE.Mesh(housing.geometry, surface('#ffffff', 'brushed')), edges = new THREE.LineSegments(housing.edges, lineMaterial());
        for (const o of [body, edges]) /** @type {any} */ (o.material).clippingPlanes = far;
        inner.add(body, edges); return outer;
      });
      g.position.set(...e.at);
      // Its side wall at the list's radius and its whole height the list's: sized by the list (docs/adr/0003).
      const inner = g.children[0], across = e.radius / housing.wallRadius; inner.scale.set(across, e.height / housing.height, across);
      // The cut follows the barrel's axis, wherever the list stands it.
      for (const o of inner.children) /** @type {any} */ (o).material.clippingPlanes[0].constant = -e.at[2];
      paint(/** @type {any} */ (inner.children[0]).material, e, 'heat', 'colour');
    },
    // The pump's handle, sized uniformly to its exact listed grip span.
    'pump handle'(e) {
      const g = take('pump handle', () => {
        const outer = new THREE.Group(), inner = new THREE.Group();
        inner.rotation.x = Math.PI; outer.add(inner);
        inner.add(new THREE.Mesh(handle.geometry, surface('#ffffff', 'brushed')), new THREE.LineSegments(handle.edges, lineMaterial()));
        return outer;
      });
      const s = e.span / handle.span;
      g.position.set(...e.at); g.children[0].scale.set(s, s, s);
      paint(/** @type {any} */ (g.children[0].children[0]).material, e, 'heat', 'colour');
    },
    // The piston, built each frame where the stroke has it: a grooved machined piston head prop
    // inside the cut-away barrel in the lab look, and a rod up from it.
    piston(e) {
      const p = take('piston', () => {
        const g = new THREE.Group();
        if (world.look === 'lab') {
          const head = new THREE.Group();
          head.rotation.x = Math.PI;
          head.add(new THREE.Mesh(pistonHead.geometry, surface('#ffffff', 'brushed')), new THREE.LineSegments(pistonHead.edges, lineMaterial()));
          g.add(head, new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 32), surface('#ffffff', 'brushed')));
        } else {
          for (let i = 0; i < 2; i++) g.add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 32), surface('#ffffff', 'brushed')));
        }
        return g;
      });
      const [head, rod] = /** @type {any[]} */ (p.children);
      head.position.set(...e.at);
      if (world.look === 'lab') {
        const sr = e.radius / pistonHead.size, sh = (e.thickness / pistonHead.height) * 1.25;
        head.scale.set(sr, sh, sr);
        paint(head.children[0].material, e, 'heat', 'colour');
      } else {
        head.scale.set(e.radius, e.thickness, e.radius);
        paint(head.material, e, 'heat', 'colour');
      }
      // From the rod's top down to the head's top face.
      const length = e.at[1] - e.thickness / 2 - e.rodTop[1];
      rod.visible = length > 0; rod.position.set(e.rodTop[0], e.rodTop[1] + length / 2, e.rodTop[2]); rod.scale.set(e.rodWidth / 2, Math.max(length, 1e-6), e.rodWidth / 2);
      paint(rod.material, e, 'heat', 'colour');
    },
    // Ignite's plasma glow: a disc fading through the list's stops, [at, colour, opacity], out to
    // its radius, as the flat view's gradient. The stops change with the pressure, so the disc
    // repaints its own texture rather than cache one per value.
    'plasma glow'(e) {
      const g = take('plasma glow', () => {
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
        const m = haloMaterial(); m.uniforms.map.value = map;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 96), m);
        disc.renderOrder = 1; disc.layers.enable(BLOOM); return disc;
      });
      g.material.uniforms.uTime.value = clock;
      const key = JSON.stringify(e.stops), map = /** @type {THREE.CanvasTexture} */ (g.material.uniforms.map.value);
      if (map.userData.key !== key) {
        const c = /** @type {HTMLCanvasElement} */ (map.image), g2 = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
        const gradient = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
        for (const [at, colour, opacity] of e.stops) gradient.addColorStop(at, `rgba(${rgb(colour)},${opacity})`);
        g2.clearRect(0, 0, 128, 128); g2.fillStyle = gradient; g2.fillRect(0, 0, 128, 128);
        map.userData.key = key; map.needsUpdate = true;
      }
      facing(g).position.set(...e.at); g.scale.setScalar(e.radius);
    },
    // The glass jar: the gas left in it, a ball of haze `inside` across, its outline, and in the
    // lab look a physical glass shell seated on the bolted stainless-steel jar manifold pedestal.
    'glass jar'(e) {
      const j = take('glass jar', () => {
        const haze = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
        // Drawn with the see-through things, in order, so the glow lies under it as in the flat view.
        const rim = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide }));
        // The jar itself, in the lab look: a glass sphere at the jar's radius, over the haze.
        const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), surface('#ffffff', 'glass'));
        const cradle = new THREE.Group();
        cradle.rotation.x = Math.PI;
        cradle.add(new THREE.Mesh(jarManifold.geometry, surface('#6b799c', 'brushed')), new THREE.LineSegments(jarManifold.edges, lineMaterial()));
        haze.renderOrder = 2; rim.renderOrder = 3; shell.renderOrder = 4; cradle.renderOrder = 1;
        const g = new THREE.Group(); g.add(haze, rim, shell, cradle); return g;
      });
      const [haze, rim, shell, cradle] = /** @type {any[]} */ (j.children);
      j.position.set(...e.at);
      haze.scale.setScalar(e.inside); haze.material.color.set(e.hazeColour); haze.material.opacity = e.haze;
      shell.visible = world.look === 'lab'; shell.scale.setScalar(e.radius); if (shell.visible) shell.material.color.set(e.colour);
      cradle.visible = world.look === 'lab';
      if (cradle.visible) {
        cradle.scale.setScalar((e.radius * 0.30) / jarManifold.size);
        cradle.position.set(0, e.radius * 0.945, 0);
      }
      rim.material.color.set(e.colour); facing(rim);
      swapGeometry(rim, new THREE.RingGeometry(e.radius - e.width / 2, e.radius + e.width / 2, 128));
    },
    // The front the piston presses the plasma in to: a dashed ring facing the camera, in front of
    // everything, its dashes and gaps as long round it as the list gives, from the ring's right.
    'compression front'(e) {
      const f = take('compression front', () => {
        const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
        m.renderOrder = 6; return m;
      });
      f.material.color.set(e.colour); f.material.opacity = e.opacity;
      const [dash, gap] = e.dash, around = TAU * e.radius, parts = [];
      for (let s = 0; s < around; s += dash + gap) {
        const ring = new THREE.RingGeometry(e.radius - e.width / 2, e.radius + e.width / 2, 8, 1, s / e.radius, Math.min(dash, around - s) / e.radius);
        parts.push(ring.toNonIndexed()); ring.dispose();
      }
      const positions = parts.flatMap(p => Array.from(p.getAttribute('position').array));
      parts.forEach(p => p.dispose());
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      // Screen y runs down, so the ring is turned to run clockwise on screen, as the canvas's arcs do.
      swapGeometry(f, geometry); facing(f).position.set(...e.at); f.scale.set(1, -1, 1);
    },
    'throat forming': roundGlow('throat'),
    'formation glow': roundGlow('formation glow', true),
    flash(e) {
      const make = () => new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, side: THREE.DoubleSide, fog: false }));
      if (e.style === 'bright') {
        const s = take('flash bright', () => { const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, 'rgba(255,255,255,1)'], [.55, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,0)']]), transparent: true, depthTest: false, fog: false })); b.layers.enable(BLOOM); return b; });
        s.renderOrder = 8; s.material.color.set(e.colour); s.position.set(...e.at); s.scale.setScalar(e.radius * 2);
        return;
      }
      const f = take('flash ' + e.style, make);
      f.material.color.set(e.colour); f.renderOrder = 8; facing(f).position.set(...e.at);
      if (e.style === 'steady') { swapGeometry(f, new THREE.RingGeometry(e.radius - e.width / 2, e.radius + e.width / 2, 96)); return; }
      // 'dark': the heat camera's black flash, filled to the edge the list gives, in metres about its centre.
      swapGeometry(f, new THREE.ShapeGeometry(new THREE.Shape(e.edge.map(([x, y]) => new THREE.Vector2(x, y)))));
    }
  };

  return {
    /**
     * Draws one frame: each view's scene list through its camera, in its part of the canvas.
     * @param {{ width: number, height: number, pixelRatio: number, look: 'heat' | 'visible' | 'lab' | 'diagram', views: SceneView[] }} frame
     */
    draw(frame) {
      const { width: W, height: H, pixelRatio, look, views } = frame;
      const key = JSON.stringify([W, H, pixelRatio, look, views.map(({ left, width, origin, camera, look: viewLook }) => [left, width, origin, camera, viewLook || look])]);
      if (key !== size) {
        renderer.setPixelRatio(Math.min(pixelRatio, 2)); renderer.setSize(W, H, false);
        worlds.forEach(dispose); worlds = views.map(view => build(view.look || look, view, H)); size = key;
      }
      tick();
      const started = performance.now();
      uFresnel.value = level === 'low' ? 0 : 1;
      renderer.setScissorTest(true);
      views.forEach((view, i) => {
        world = worlds[i];
        for (const pool of world.pools.values()) pool.used = 0;
        for (const entry of view.list) DRAW[entry.kind]?.(entry);
        for (const pool of world.pools.values()) pool.items.forEach((o, j) => { if (j >= pool.used) o.visible = false; });
        world.scene.fog = level === 'low' ? null : world.fog;
        if (world.scene.fog) world.scene.fog.color.copy(/** @type {any} */ (world.scene.background) || new THREE.Color(0));
        // Viewports count from the canvas's bottom; each view fills the full height.
        renderer.setViewport(view.left, 0, view.width, H); renderer.setScissor(view.left, 0, view.width, H);
        renderer.render(world.scene, world.cam);
        if (level === 'high') bloom(world, H);
      });
      // Under auto, the first frames' draw time decides the level; the clock's pin is no matter.
      if (choice === 'auto') { samples.push(performance.now() - started); if (samples.length === QUALITY_FRAMES) judge(); }
    },
    /**
     * Takes a level, or auto, which reads the next frames afresh; the next frame draws at it.
     * @param {'auto' | 'low' | 'medium' | 'high'} c
     */
    setQuality(c) { choose(c); },
    // The level in use, whether auto picked it, and the median draw time auto last read, in ms.
    quality() { return { level, auto: choice === 'auto' || choice === 'settled', median }; },
    // Pins the clock at `t` seconds, or lets it run again with null.
    freeze
  };
}

window.IonView3D = { start };
