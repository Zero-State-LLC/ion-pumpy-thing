// The 3D view's renderer. It draws a step's scene list with three.js on the WebGL canvas
// behind the 2D canvas (docs/adr/0003), and holds no game rules: what it draws, where, how
// big and in what colour or heat all come from the list, in metres. Each view keeps its flat
// view's camera: the same angle and scale, orthographic (docs/adr/0004). Heat-camera views
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

// A soft round glow from `colour` at its centre to nothing at its edge, as the flat view's gradients.
const glowTextures = new Map();
function glowTexture(stops) {
  const key = JSON.stringify(stops);
  if (glowTextures.has(key)) return glowTextures.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g2 = c.getContext('2d'), g = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
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

/**
 * Starts WebGL on `canvas` and loads the props. Rejects where WebGL can't start.
 * @param {HTMLCanvasElement} canvas
 * @param {{ props: { airliner: string }, onLost: () => void }} options
 */
async function start(canvas, { props, onLost }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.localClippingEnabled = true;
  canvas.addEventListener('webglcontextlost', () => onLost(), { once: true });
  const airliner = await loadAirliner(props.airliner);
  const ramp = rampTexture();
  let world = null, size = '';

  function build(frame) {
    // The previous world's own geometry and materials go; the prop's shared geometry and the textures stay.
    if (world) world.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Sprite)) return;
      if (!(o instanceof THREE.Sprite) && !Object.values(airliner.parts).includes(o.geometry) && !Object.values(airliner.edges).includes(o.geometry)) o.geometry.dispose();
      o.material.dispose();
    });
    const { look, camera: { angle, scale }, width: W, height: H } = frame;
    const th = angle * DEG, cam = new THREE.OrthographicCamera(-W / 2 / scale, W / 2 / scale, H / 2 / scale, -H / 2 / scale, NEAR, FAR);
    // Turned about the x axis by the view's angle, as the game's camB: screen y is y cos θ - z sin θ.
    cam.position.set(0, -CAMERA_DISTANCE * Math.sin(th), -CAMERA_DISTANCE * Math.cos(th));
    cam.up.set(0, -Math.cos(th), Math.sin(th)); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
    const scene = new THREE.Scene();
    if (look === 'visible') {
      scene.add(new THREE.AmbientLight(0xffffff, 1.1));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-60, -90, -140); scene.add(sun);
    }
    const outline = look === 'heat' ? [token('--ink'), .85] : look === 'visible' ? ['#2a3045', 1] : [token('--deep'), 1];
    world = { look, cam, scene, outline, pools: new Map() };
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
  const project = p => { const v = new THREE.Vector3(...p).project(world.cam); return [v.x * world.halfW, -v.y * world.halfH]; };

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
    'throat forming'(e) {
      const material = m => { m.material.color.set(e.colour); m.material.opacity = e.opacity; m.renderOrder = 5; return m; };
      const make = () => new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, side: THREE.DoubleSide }));
      for (const p of e.points) {
        const r = material(take('throat ring', make));
        swapGeometry(r, new THREE.RingGeometry(e.ring - e.width / 2, e.ring + e.width / 2, 48));
        facing(r).position.set(...p);
      }
      // The outline round the triangle stands `pad` further out from the centre, on screen.
      const padded = e.points.map(p => { const [x, y] = project(p), m = Math.hypot(x, y) / world.scale, k = m > 0.5 ? (m + e.pad) / m : 1; return p.map(c => c * k); });
      swapGeometry(material(take('throat outline', make)), tube(padded, e.width / 2, true));
    },
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
      // 'dark': the heat camera's black flash, its edge rippling as it opens.
      const shape = new THREE.Shape();
      for (let i = 0; i <= 40; i++) {
        const a = i / 40 * TAU, rr = e.radius * (1 + 0.12 * Math.sin(a * 5 + e.q * 6) + 0.07 * Math.sin(a * 9));
        i ? shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      swapGeometry(f, new THREE.ShapeGeometry(shape));
    }
  };

  return {
    /**
     * Draws one frame of a scene list.
     * @param {{ width: number, height: number, pixelRatio: number, look: 'heat' | 'visible' | 'diagram', camera: { angle: number, scale: number }, list: any[] }} frame
     */
    draw(frame) {
      const { width: W, height: H, pixelRatio, look, camera } = frame;
      const key = [W, H, pixelRatio, look, camera.angle, camera.scale].join();
      if (key !== size) {
        renderer.setPixelRatio(Math.min(pixelRatio, 2)); renderer.setSize(W, H, false);
        build(frame); Object.assign(world, { halfW: W / 2, halfH: H / 2, scale: camera.scale }); size = key;
      }
      for (const pool of world.pools.values()) pool.used = 0;
      for (const entry of frame.list) DRAW[entry.kind]?.(entry);
      for (const pool of world.pools.values()) pool.items.forEach((o, i) => { if (i >= pool.used) o.visible = false; });
      renderer.render(world.scene, world.cam);
    }
  };
}

window.IonView3D = { start };
