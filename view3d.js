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
  return { geometry, edges: new THREE.EdgesGeometry(geometry, 30), height: box.max.y - box.min.y, side: Math.sign(centre.x) || 1 };
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
// The plasma ball: the flat view's radial gradient, from its core colour at the middle to its
// colour at 45 % of the radius on screen, 0.7 as opaque, and out to nothing at the edge.
function plasmaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uCore: { value: new THREE.Vector3() }, uColour: { value: new THREE.Vector3() }, uOpacity: { value: 1 } },
    vertexShader: `varying vec3 vN;
      void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uCore; uniform vec3 uColour; uniform float uOpacity; varying vec3 vN;
      void main() {
        float u = length(normalize(vN).xy);
        vec4 mid = vec4(uColour, uOpacity * 0.7);
        gl_FragColor = u < 0.45 ? mix(vec4(uCore, uOpacity), mid, u / 0.45) : mix(mid, vec4(uColour, 0.0), (u - 0.45) / 0.55);
      }`,
    transparent: true, depthWrite: false
  });
}

/**
 * Starts WebGL on `canvas` and loads the props. Rejects where WebGL can't start.
 * @param {HTMLCanvasElement} canvas
 * @param {{ props: { airliner: string, plateMount: string, vacuumChamber: string }, onLost: () => void }} options
 */
async function start(canvas, { props, onLost }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.localClippingEnabled = true;
  canvas.addEventListener('webglcontextlost', () => onLost(), { once: true });
  const [airliner, mount, chamber] = await Promise.all([loadAirliner(props.airliner), loadPlateMount(props.plateMount), loadVacuumChamber(props.vacuumChamber)]);
  // The props' geometry is shared by every world, so it stays when a world goes.
  const shared = new Set([...Object.values(airliner.parts), ...Object.values(airliner.edges), mount.geometry, mount.edges, chamber.geometry, chamber.edges]);
  const ramp = rampTexture();
  // A world for each view: its camera, scene and pooled objects. `world` is the one being drawn.
  let worlds = [], world = null, size = '';

  function dispose(w) {
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
      scene.add(new THREE.AmbientLight(0xffffff, 1.1));
      // The sun turns with the camera, so every camera sees its side lit as camera 1 sees the top,
      // as the flat view draws both cameras alike; a camera from below would otherwise see shadow.
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(-60, -90, -140).applyAxisAngle(new THREE.Vector3(1, 0, 0), -th); scene.add(sun);
    }
    const outline = look === 'heat' ? [token('--ink'), .85] : look === 'visible' ? ['#2a3045', 1] : [token('--deep'), 1];
    return { look, cam, scene, outline, scale, view, pools: new Map() };
  }

  // Objects are pooled by kind and reused frame to frame; what the list leaves out is hidden.
  function take(kind, make) {
    let pool = world.pools.get(kind);
    if (!pool) world.pools.set(kind, pool = { items: [], used: 0 });
    if (pool.used === pool.items.length) { const o = make(); world.scene.add(o); pool.items.push(o); }
    const o = pool.items[pool.used++]; o.visible = true; return o;
  }
  const surface = colour => world.look === 'heat' ? heatMaterial(ramp)
    : world.look === 'visible' ? new THREE.MeshLambertMaterial({ color: colour, side: THREE.DoubleSide })
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
  const roundGlow = kind => e => {
    const material = m => { m.material.color.set(e.colour); m.material.opacity = e.opacity; m.renderOrder = 5; return m; };
    const make = () => new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, side: THREE.DoubleSide }));
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
      const c = take('cloud', () => new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })));
      c.material.color.set(e.colour); c.material.opacity = e.opacity; c.renderOrder = -1;
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
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
        const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), surface('#ffffff'));
        g.add(halo, ball);
        // Heat views ring each orb in the outline colour, so it reads as a schematic mark too.
        if (world.look === 'heat') g.add(facing(new THREE.Mesh(new THREE.RingGeometry(1, 1, 32), new THREE.MeshBasicMaterial({ color: world.outline[0], transparent: true, opacity: world.outline[1], side: THREE.DoubleSide }))));
        // The flat view draws the orbs over the airliner, so an orb the airframe would hide stays in view.
        g.children.forEach(c => { /** @type {any} */ (c).material.depthTest = false; c.renderOrder = 4; });
        return g;
      });
      const [halo, ball, ring] = o.children;
      o.position.set(...e.at);
      ball.scale.setScalar(e.size); paint(/** @type {any} */ (ball).material, e, 'heat', 'colour');
      const hm = /** @type {THREE.SpriteMaterial} */ (/** @type {THREE.Sprite} */ (halo).material);
      const map = glowTexture([[0, e.halo], [1, 'rgba(0,0,0,0)']]);
      if (hm.map !== map) { hm.map = map; hm.needsUpdate = true; }
      halo.scale.setScalar(e.size * 6);
      if (ring) swapGeometry(ring, new THREE.RingGeometry(e.size + 0.5 / world.scale, e.size + 1.5 / world.scale, 32));
    },
    triangle(e) {
      const t = take('triangle', () => new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ transparent: true })));
      t.material.color.set(e.colour); t.material.opacity = e.opacity;
      swapGeometry(t, new THREE.BufferGeometry().setFromPoints(e.points.map(p => new THREE.Vector3(...p))));
    },
    'cold mark'(e) {
      const m = take('cold mark', () => new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true })));
      m.material.color.set(e.colour); m.material.opacity = e.opacity;
      swapGeometry(m, tube(e.path, e.width / 2));
    },
    // Open's plates: boxes, as the list sizes them, outlined.
    plate(e) {
      const p = take('plate', () => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), surface('#ffffff'));
        m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), lineMaterial()));
        return m;
      });
      p.position.set(...e.at); p.scale.set(...e.size); paint(p.material, e, 'heat', 'colour');
    },
    // The glow in the gap, brighter at the plates than in the middle, behind the plates' faces.
    'gap glow'(e) {
      const g = take('gap glow', () => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })));
      const map = glowTexture([[0, e.colour], [.5, e.middle], [1, e.colour]], true);
      if (g.material.map !== map) { g.material.map = map; g.material.needsUpdate = true; }
      g.position.set(...e.at); g.scale.set(e.size[0], e.size[1], 1);
    },
    'plate mount'(e) {
      const g = take('plate mount', () => {
        const outer = new THREE.Group(), inner = new THREE.Group();
        // Into the game's frame: the file's up (+Y) is the game's -y, up the canvas in a side-on view.
        inner.rotation.x = Math.PI; outer.add(inner);
        inner.add(new THREE.Mesh(mount.geometry, surface('#ffffff')), new THREE.LineSegments(mount.edges, lineMaterial()));
        return outer;
      });
      g.position.set(...e.at);
      // Evenly scaled to the list's height, and mirrored so the base stands out away from the view's
      // middle: a presentation choice from the listed place, as the list carries no facing (docs/adr/0003).
      const k = e.height / mount.height, inner = g.children[0];
      inner.scale.set(k * (mount.side === Math.sign(e.at[0] || 1) ? 1 : -1), k, k);
      paint(/** @type {any} */ (inner.children[0]).material, e, 'heat', 'colour');
    },
    // A wormhole's throat, seen down its length: its mouth, void within and a glowing rim, and
    // rings narrowing as they go deeper, all behind whatever is in front of it.
    throat(e) {
      const t = take('throat', () => {
        const g = new THREE.Group();
        const mouth = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        mouth.renderOrder = 1; g.add(mouth);
        const circle = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, i) => new THREE.Vector3(Math.cos(i / 96 * TAU), Math.sin(i / 96 * TAU), 0)));
        for (let i = 1; i <= 5; i++) { const ring = new THREE.LineLoop(i === 1 ? circle : circle.clone(), new THREE.LineBasicMaterial({ transparent: true })); ring.renderOrder = 2; g.add(ring); }
        return g;
      });
      t.position.set(...e.at);
      const [mouth, ...rings] = /** @type {any[]} */ (t.children);
      // The flat view's gradient runs from a fifth of the radius to 1.25 times it; on the mouth's
      // disc, 1.25 times the radius, its stops fall at these fractions.
      const map = glowTexture([[.16, e.colour], [.815, e.colour], [.882, e.rim], [1, e.fade]]);
      if (mouth.material.map !== map) { mouth.material.map = map; mouth.material.needsUpdate = true; }
      mouth.scale.setScalar(e.radius * 1.25);
      rings.forEach((ring, j) => {
        const i = j + 1, r = e.radius * Math.pow(1 - i / 6, 1.4);
        ring.material.color.set(e.rings); ring.material.opacity = e.ringOpacity;
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
        if (e.round) { m.map = glowTexture([[0, 'rgba(255,255,255,1)'], [.8, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]); m.transparent = true; m.depthWrite = false; }
        const points = new THREE.Points(new THREE.BufferGeometry(), m); points.renderOrder = 5; return points;
      });
      p.material.color.set(e.colour); p.material.size = e.size * world.scale;
      const geometry = new THREE.BufferGeometry().setFromPoints(e.points.map(q => new THREE.Vector3(...q)));
      if (e.opacities) geometry.setAttribute('color', new THREE.Float32BufferAttribute(e.opacities.flatMap(a => [1, 1, 1, a]), 4));
      if (p.material.vertexColors !== !!e.opacities) { p.material.vertexColors = !!e.opacities; p.material.transparent = true; p.material.needsUpdate = true; }
      swapGeometry(p, geometry);
    },
    // Fuel's reactor wall, end on: a ring of tube as wide as the flat view's stroke. It writes no
    // depth, so the neutrons' impacts, listed on its middle line, show over it as in the flat view.
    'reactor wall'(e) {
      const w = take('reactor wall', () => { const m = new THREE.Mesh(new THREE.BufferGeometry(), surface('#ffffff')); m.material.depthWrite = false; return m; });
      w.position.set(...e.at); paint(w.material, e, 'heat', 'colour');
      swapGeometry(w, new THREE.TorusGeometry(e.radius, e.width / 2, 12, 128));
    },
    // Fuel's burning core: a disc fading from its middle's colour (`core`), as opaque as `opacity`,
    // to nothing in its edge colour (`colour`), as the flat view's gradient. Its brightness changes
    // with the temperature slider, so the disc repaints its own texture rather than cache one per value.
    'core glow'(e) {
      const g = take('core glow', () => {
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
        const m = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide });
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 96), m); disc.renderOrder = 2; return disc;
      });
      const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',');
      const key = `${e.core} ${e.opacity} ${e.colour}`, map = /** @type {THREE.CanvasTexture} */ (g.material.map);
      if (map.userData.key !== key) {
        const c = /** @type {HTMLCanvasElement} */ (map.image), g2 = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
        const gradient = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, `rgba(${rgb(e.core)},${e.opacity})`); gradient.addColorStop(1, `rgba(${rgb(e.colour)},0)`);
        g2.clearRect(0, 0, 128, 128); g2.fillStyle = gradient; g2.fillRect(0, 0, 128, 128);
        map.userData.key = key; map.needsUpdate = true;
      }
      facing(g).position.set(...e.at); g.scale.setScalar(e.radius);
    },
    // Hold's vacuum chamber, cut away: only its far half, so the ball and coils inside it show.
    'vacuum chamber'(e) {
      const g = take('vacuum chamber', () => {
        const outer = new THREE.Group(), inner = new THREE.Group();
        // Into the game's frame: the file's up (+Y) is the game's -y, up the canvas in a side-on view.
        inner.rotation.x = Math.PI; outer.add(inner);
        const far = [new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)];
        const body = new THREE.Mesh(chamber.geometry, surface('#ffffff')), edges = new THREE.LineSegments(chamber.edges, lineMaterial());
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
    // its top and bottom.
    coil(e) {
      const c = take('coil', () => {
        const g = new THREE.Group();
        for (let i = 0; i < 2; i++) g.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })));
        for (let i = 0; i < 2; i++) g.add(new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()));
        for (let i = 0; i < 2; i++) g.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
        return g;
      });
      c.position.set(...e.at);
      const [left, right, top, bottom, ...backing] = /** @type {any[]} */ (c.children);
      [left, right].forEach((half, i) => {
        // Half a torus, turned to the left (x below 0) or right half, then laid round the y axis.
        const geometry = new THREE.TorusGeometry(e.radius, e.tube, 12, 48, Math.PI).rotateZ(i ? -Math.PI / 2 : Math.PI / 2).rotateX(Math.PI / 2);
        swapGeometry(half, geometry); half.material.color.set(e.colour); half.material.opacity = e.opacity[i];
        // Behind it, the same half in the sky's colour, opaque, so nothing behind shows through.
        swapGeometry(backing[i], geometry.clone()); backing[i].material.color.copy(/** @type {any} */ (world.scene.background) || new THREE.Color(0));
      });
      [top, bottom].forEach((rim, i) => {
        swapGeometry(rim, new THREE.BufferGeometry().setFromPoints(Array.from({ length: 64 }, (_, k) => new THREE.Vector3(Math.cos(k / 64 * TAU) * e.radius, (i ? 1 : -1) * e.tube, Math.sin(k / 64 * TAU) * e.radius))));
        rim.material.color.set(e.edge);
      });
    },
    'plasma ball'(e) {
      const b = take('plasma ball', () => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), plasmaMaterial()); m.renderOrder = 3; return m; });
      const { uCore, uColour, uOpacity } = b.material.uniforms;
      uCore.value.copy(shaderColour(e.core)); uColour.value.copy(shaderColour(e.colour)); uOpacity.value = e.opacity;
      b.position.set(...e.at); b.scale.setScalar(e.radius);
    },
    // The field's edge round the ball, broken at each leak, and the plasma pluming out of each:
    // in the plane facing a side-on camera, in front of everything, as the flat view draws them.
    'cusp leaks'(e) {
      const n = e.angles.length, l = take('cusp leaks', () => {
        const g = new THREE.Group();
        for (let i = 0; i < 3 * n; i++) {
          const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
          m.renderOrder = 6; g.add(m);
        }
        return g;
      });
      l.position.set(...e.at);
      const half = e.halfAngle, parts = /** @type {any[]} */ (l.children);
      e.angles.forEach((a, i) => {
        const next = i + 1 < n ? e.angles[i + 1] : e.angles[0] + TAU, [arc, fill, outline] = [parts[i], parts[n + i], parts[2 * n + i]];
        // The edge from this leak to the next, a tube as wide as the flat view's stroke.
        swapGeometry(arc, new THREE.TorusGeometry(e.edge, e.edgeWidth / 2, 6, 32, next - a - 2 * half).rotateZ(a + half));
        arc.material.color.set(e.colour); arc.material.opacity = e.edgeOpacity;
        // The plume: out from the edge to its reach across the leak's opening, filled and outlined.
        const at = (r, t) => new THREE.Vector2(Math.cos(t) * r, Math.sin(t) * r), plume = new THREE.Shape();
        plume.moveTo(...at(e.edge, a - half).toArray()); plume.lineTo(...at(e.plume, a - half).toArray());
        plume.absarc(0, 0, e.plume, a - half, a + half, false); plume.lineTo(...at(e.edge, a + half).toArray()); plume.closePath();
        swapGeometry(fill, new THREE.ShapeGeometry(plume, 12));
        swapGeometry(outline, tube(plume.getPoints(12).map(p => [p.x, p.y, 0]), e.plumeWidth / 2, true));
        for (const m of [fill, outline]) { m.material.color.set(e.colour); m.material.opacity = e.plumeOpacity; }
      });
    },
    'throat forming': roundGlow('throat'),
    'formation glow': roundGlow('formation glow'),
    flash(e) {
      const make = () => new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, side: THREE.DoubleSide }));
      if (e.style === 'bright') {
        const s = take('flash bright', () => new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, 'rgba(255,255,255,1)'], [.55, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,0)']]), transparent: true, depthTest: false })));
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
     * @param {{ width: number, height: number, pixelRatio: number, look: 'heat' | 'visible' | 'diagram', views: SceneView[] }} frame
     */
    draw(frame) {
      const { width: W, height: H, pixelRatio, look, views } = frame;
      const key = JSON.stringify([W, H, pixelRatio, look, views.map(({ left, width, origin, camera }) => [left, width, origin, camera])]);
      if (key !== size) {
        renderer.setPixelRatio(Math.min(pixelRatio, 2)); renderer.setSize(W, H, false);
        worlds.forEach(dispose); worlds = views.map(view => build(look, view, H)); size = key;
      }
      renderer.setScissorTest(true);
      views.forEach((view, i) => {
        world = worlds[i];
        for (const pool of world.pools.values()) pool.used = 0;
        for (const entry of view.list) DRAW[entry.kind]?.(entry);
        for (const pool of world.pools.values()) pool.items.forEach((o, j) => { if (j >= pool.used) o.visible = false; });
        // Viewports count from the canvas's bottom; each view fills the full height.
        renderer.setViewport(view.left, 0, view.width, H); renderer.setScissor(view.left, 0, view.width, H);
        renderer.render(world.scene, world.cam);
      });
    }
  };
}

window.IonView3D = { start };
