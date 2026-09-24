/* Shared helpers: seeded randomness, noise, easing, and geometry utilities.
   Everything hangs off the global HM namespace so the files work as plain
   <script> tags (no build step, opens straight from disk). THREE is loaded by
   main.js before any of these functions run. */
var HM = (window.HM = window.HM || {});

// ---------- randomness ----------
// Same seed -> same trees, rocks and dunes every time the page loads.
HM.rng = function (seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------- 2D value noise ----------
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
HM.noise = function (x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
// Fractal noise: several layers of noise at doubling detail. Returns ~0..1.
HM.fbm = function (x, y, octaves = 4) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * HM.noise(x, y);
    norm += amp;
    x *= 2.03; y *= 2.03; amp *= 0.5;
  }
  return sum / norm;
};

// ---------- easing ----------
HM.clamp01 = (t) => Math.min(1, Math.max(0, t));
HM.smooth = (a, b, x) => {
  const t = HM.clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
HM.ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

// ---------- geometry ----------
// Replace a geometry's UVs with world-size coordinates so a texture repeats
// every `meters` meters no matter how big the box is (brick stays brick-sized).
HM.worldUV = function (geo, meters) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; }
    else if (nx >= nz) { u = z; v = y; }
    else { u = x; v = y; }
    uv[i * 2] = u / meters;
    uv[i * 2 + 1] = v / meters;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
};

// Mesh with shadows on, the default for anything solid in the scene.
HM.mesh = function (geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

// Box positioned by its bottom-center, the way you'd describe a wall or slab.
HM.box = function (w, h, d, mat, x = 0, y = 0, z = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (mat.userData.uvScale) HM.worldUV(geo, mat.userData.uvScale);
  const m = HM.mesh(geo, mat);
  m.position.set(x, y + h / 2, z);
  return m;
};

HM.group = function (...children) {
  const g = new THREE.Group();
  children.forEach((c) => c && g.add(c));
  return g;
};
