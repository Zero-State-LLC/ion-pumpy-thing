// Flat shapes in the plane z = 0 for the 3D view's diagram marks, written in place into typed
// arrays that keep their size frame to frame. A mark whose shape follows the model every frame
// (the Hold step's cusp leaks, which follow beta and the ball's easing) then uploads new
// positions instead of building, uploading and discarding geometry each frame
// (docs/VISUAL-AUDIT.md, finding 4). Every shape is a strip: pairs of vertices along a path,
// drawn as two triangles per pair by the index `stripIndex` gives.

// A ring sector from radius `r0` to `r1`, from angle `a0` to `a1`, sampled at n + 1 angles:
// 2(n + 1) vertices, inner then outer at each angle, 3 floats each, into `out`. Returns `out`.
export function sector(out, r0, r1, a0, a1, n) {
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n, c = Math.cos(a), s = Math.sin(a), k = 6 * i;
    out[k] = c * r0; out[k + 1] = s * r0; out[k + 2] = 0;
    out[k + 3] = c * r1; out[k + 4] = s * r1; out[k + 5] = 0;
  }
  return out;
}

// A path `width` wide along `points` ([x, y] each): at each point two vertices, half the width
// each side of the path along its mitred normal, 3 floats each, into `out`. An open strip is
// offset straight across its first and last segments; a closed one joins its ends. Returns `out`.
export function strip(out, points, width, closed = false) {
  const k = points.length, half = width / 2;
  for (let i = 0; i < k; i++) {
    const [x, y] = points[i];
    const prev = closed || i > 0 ? points[(i + k - 1) % k] : null, next = closed || i + 1 < k ? points[(i + 1) % k] : null;
    // Unit directions into and out of this point; at an open end, the one segment there is.
    const din = unit(prev ? [x - prev[0], y - prev[1]] : [next[0] - x, next[1] - y]);
    const dout = unit(next ? [next[0] - x, next[1] - y] : din);
    // The mitre: the normal of the mean direction, stretched so the strip stays `width` wide
    // through the corner (no further than three widths, for the sharpest corners).
    const t = unit([din[0] + dout[0], din[1] + dout[1]]), n = [-t[1], t[0]];
    const stretch = Math.min(3, 1 / Math.max(1 / 3, -n[0] * din[1] + n[1] * din[0]));
    const ox = n[0] * half * stretch, oy = n[1] * half * stretch, j = 6 * i;
    out[j] = x - ox; out[j + 1] = y - oy; out[j + 2] = 0;
    out[j + 3] = x + ox; out[j + 4] = y + oy; out[j + 5] = 0;
  }
  return out;
}
/** @param {number[]} v */
const unit = ([x, y]) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

// The triangles that draw a strip of `k` vertex pairs: two per segment, six indices each, and
// one more segment from the last pair back to the first when `closed`.
export function stripIndex(k, closed = false) {
  const segments = closed ? k : k - 1, index = new Uint16Array(6 * segments);
  for (let i = 0; i < segments; i++) {
    const a = 2 * i, b = 2 * ((i + 1) % k), j = 6 * i;
    index[j] = a; index[j + 1] = a + 1; index[j + 2] = b;
    index[j + 3] = a + 1; index[j + 4] = b + 1; index[j + 5] = b;
  }
  return index;
}
