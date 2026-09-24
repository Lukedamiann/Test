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

// A flat strip that hugs the ground along a path: roads, driveways, walkways.
// points: [[x, z], ...]; ground(x, z) -> height; the strip sits `lift` above it.
// The texture's u coordinate runs along the path in meters / uvScale.
HM.ribbon = function (points, width, mat, ground, { lift = 0.04, step = 1, uvScale = 4 } = {}) {
  // resample the path every `step` meters so it follows bumps in the terrain
  const pts = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, z1] = points[i], [x2, z2] = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / step));
    for (let k = 0; k < n; k++) pts.push([x1 + ((x2 - x1) * k) / n, z1 + ((z2 - z1) * k) / n]);
  }
  pts.push(points[points.length - 1]);
  const pos = [], uv = [], idx = [];
  let dist = 0;
  pts.forEach(([x, z], i) => {
    const [ax, az] = pts[Math.max(0, i - 1)], [bx, bz] = pts[Math.min(pts.length - 1, i + 1)];
    let dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const nx = -dz * (width / 2), nz = dx * (width / 2);
    if (i > 0) dist += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
    for (const s of [-1, 1]) {
      const px = x + nx * s, pz = z + nz * s;
      pos.push(px, ground(px, pz) + lift, pz);
      uv.push(dist / uvScale, s < 0 ? 0 : 1);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // make sure the strip faces up whichever way the path runs
  if (geo.attributes.normal.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
};

// Bake every mesh under `root` into one mesh per material. A detailed house is
// hundreds of small pieces; merged, a whole street draws in a few dozen calls.
HM.mergeByMaterial = function (root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((m) => {
    if (!m.isMesh || m.isInstancedMesh) return;
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const key = m.material.uuid;
    if (!buckets.has(key)) buckets.set(key, { mat: m.material, geos: [], shadow: m.castShadow });
    buckets.get(key).geos.push(g);
  });
  const out = new THREE.Group();
  for (const { mat, geos, shadow } of buckets.values()) {
    let count = 0;
    geos.forEach((g) => (count += g.attributes.position.count));
    const merged = new THREE.BufferGeometry();
    for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]]) {
      const arr = new Float32Array(count * size);
      let off = 0;
      geos.forEach((g) => { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; });
      merged.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    geos.forEach((g) => g.dispose());
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  root.traverse((m) => { if (m.isMesh && m.geometry) m.geometry.dispose(); });
  return out;
};

// Soft dark patch under a house: the shade where walls meet the ground.
HM.contactShadow = function (w, d, strength = 0.35) {
  if (!HM._shadowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    // stacked translucent rectangles: a soft edge without canvas blur filters
    for (let i = 0; i < 24; i++) {
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(8 + i * 1.6, 8 + i * 1.6, 112 - i * 3.2, 112 - i * 3.2);
    }
    HM._shadowTex = new THREE.CanvasTexture(c);
  }
  const tex = HM._shadowTex;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 1.3, d * 1.3),
    new THREE.MeshBasicMaterial({ color: '#000', alphaMap: tex, transparent: true, opacity: strength, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.material.userData.own = true; // not shared, safe to dispose with the house
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
};
