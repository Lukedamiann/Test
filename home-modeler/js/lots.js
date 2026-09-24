/* The four property lots: terrain, backdrop, street, neighbors, props, sky and sunlight.
   Every lot keeps a flat building pad around the origin where the house sits;
   the house's front faces +z. */
var HM = (window.HM = window.HM || {});

(function () {
  const C = (hex) => new THREE.Color(hex);

  // ---------- sky ----------
  HM.makeSky = function ({ top, horizon, bottom, sunDir, sunColor }) {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: C(top) }, horizon: { value: C(horizon) }, bottom: { value: C(bottom) },
        sunDir: { value: sunDir.clone() }, sunColor: { value: C(sunColor) },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position.z = gl_Position.w; // always behind everything
        }`,
      fragmentShader: `
        uniform vec3 top, horizon, bottom, sunDir, sunColor;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.35));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 60.0) * 0.35 + pow(s, 6.0) * 0.12);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), mat);
    m.frustumCulled = false;
    m.renderOrder = -1;
    return m;
  };

  // ---------- terrain ----------
  // height(x, z) -> meters; color(x, z, h, slope) -> THREE.Color
  function terrain({ size = 3200, seg = 400, height, color }) {
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const half = size / 2;
    // Pack grid points densely near the house (~0.7 m apart) and sparsely
    // toward the horizon, so detail goes where the camera looks.
    const warp = (v) => Math.sign(v) * Math.pow(Math.abs(v) / half, 2.5) * half;
    for (let i = 0; i < pos.count; i++) {
      const x = warp(pos.getX(i)), z = warp(pos.getZ(i));
      pos.setXYZ(i, x, height(x, z), z);
      uv.setXY(i, x / 6, z / 6);
    }
    geo.computeVertexNormals();
    const nor = geo.attributes.normal;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const c = color(pos.getX(i), pos.getZ(i), pos.getY(i), 1 - nor.getY(i));
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const tex = HM.groundTexture();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 1 }));
    m.receiveShadow = true;
    return m;
  }

  // Weight that is 1 inside a rectangle and fades to 0 over the given margins.
  function rectWeight(x, z, { x0, x1, z0, z1, mx = 6, back = 6, front = 6 }) {
    const wx = 1 - HM.smooth(0, mx, Math.max(x0 - x, x - x1, 0));
    const wb = 1 - HM.smooth(0, back, Math.max(z0 - z, 0));
    const wf = 1 - HM.smooth(0, front, Math.max(z - z1, 0));
    return wx * wb * wf;
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const mixC = (a, b, t) => a.clone().lerp(b, HM.clamp01(t));

  // Scatter points in a ring/region, skipping ones the avoid() test rejects.
  function scatter(rnd, n, { rMin = 20, rMax = 300, avoid = () => false, x = null, z = null }) {
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < n * 30) {
      let px, pz;
      if (x) { px = lerp(x[0], x[1], rnd()); pz = lerp(z[0], z[1], rnd()); }
      else {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(lerp(rMin * rMin, rMax * rMax, rnd()));
        px = Math.cos(a) * r; pz = Math.sin(a) * r;
      }
      if (!avoid(px, pz)) out.push([px, pz]);
    }
    return out;
  }

  // Instanced copies of one geometry at many spots (trees, rocks, grass...).
  function instances(geo, mat, spots, fn) {
    const m = new THREE.InstancedMesh(geo, mat, spots.length);
    let tinted = false;
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    spots.forEach((s, i) => {
      o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
      const c = fn(o, s, i, col);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      if (c) { m.setColorAt(i, col); tinted = true; }
    });
    // Per-instance colors multiply the material color, so start from white.
    if (tinted) {
      m.material = mat.clone();
      m.material.color.set('#ffffff');
    }
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function clouds(group, rnd, n, tint = '#ffffff', opacity = 0.9) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: HM.cloudTexture(i % 5 + 1), color: tint, transparent: true, opacity: opacity * (0.6 + rnd() * 0.4), fog: false, depthWrite: false });
      const s = new THREE.Sprite(mat);
      const a = -Math.PI * 0.9 + rnd() * Math.PI * 0.8 - Math.PI / 2 + Math.PI / 2;
      const r = 1100 + rnd() * 900;
      s.position.set(Math.sin(a) * r * (rnd() < 0.5 ? 1 : -1), 260 + rnd() * 380, -Math.abs(Math.cos(a) * r) - 200);
      const w = 500 + rnd() * 700;
      s.scale.set(w, w * 0.42, 1);
      group.add(s);
    }
  }

  // ---------- shared props ----------
  function palm(x, z, y, rnd) {
    const g = new THREE.Group();
    const trunkMat = HM.flat('#8a7355', { rough: 0.95 });
    const leafMat = HM.flat('#4f7a34', { rough: 0.8, side: THREE.DoubleSide });
    const h = 6 + rnd() * 3, lean = (rnd() - 0.5) * 0.5;
    let px = 0, py = 0;
    const segs = 8;
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      const s = HM.mesh(new THREE.CylinderGeometry(0.2 - t * 0.06, 0.24 - t * 0.06, h / segs + 0.05, 7), trunkMat);
      px = lean * t * t * h;
      s.position.set(px, py + h / segs / 2, 0);
      s.rotation.z = -lean * t * 1.2;
      g.add(s);
      py += h / segs;
    }
    for (let k = 0; k < 9; k++) {
      const leaf = new THREE.PlaneGeometry(0.8, 3.6, 1, 6);
      const p = leaf.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = (p.getY(i) + 1.8) / 3.6;
        p.setZ(i, -v * v * 1.3);
        p.setX(i, p.getX(i) * (1 - v * 0.7));
      }
      leaf.translate(0, 1.8, 0);
      leaf.rotateX(-Math.PI / 2 + 0.35);
      leaf.computeVertexNormals();
      const m = HM.mesh(leaf, leafMat);
      m.position.set(px, py, 0);
      m.rotation.y = (k / 9) * Math.PI * 2 + rnd() * 0.3;
      g.add(m);
    }
    g.position.set(x, y, z);
    g.rotation.y = rnd() * Math.PI * 2;
    return g;
  }

  // Leafy tree: trunk plus a few overlapping lumpy crowns. A small palette of
  // leaf materials keeps many trees mergeable into few draw calls.
  const LEAVES = ['#557a37', '#4e7334', '#62823c', '#5b7a3f'];
  function deciduous(x, z, y, s, rnd, palette = LEAVES) {
    const g = new THREE.Group();
    const trunk = HM.mesh(new THREE.CylinderGeometry(0.16 * s, 0.3 * s, 3.4 * s, 7), HM.flat('#5d4632', { rough: 1 }));
    trunk.position.y = 1.7 * s;
    g.add(trunk);
    const leaf = HM.flat(palette[Math.floor(rnd() * palette.length)], { rough: 0.95 });
    leaf.flatShading = true;
    const clumps = 4 + Math.floor(rnd() * 3);
    for (let k = 0; k < clumps; k++) {
      const r = (1.3 + rnd() * 0.9) * s;
      const geo = new THREE.IcosahedronGeometry(r, 1);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const n = 0.82 + HM.noise(p.getX(i) * 1.3 + k * 3 + x, p.getY(i) * 1.3 + p.getZ(i) + z) * 0.36;
        p.setXYZ(i, p.getX(i) * n, p.getY(i) * n * 0.8, p.getZ(i) * n);
      }
      geo.computeVertexNormals();
      const a = (k / clumps) * Math.PI * 2 + rnd();
      const off = k === 0 ? 0 : 1.2 * s;
      const m = HM.mesh(geo, leaf);
      m.position.set(Math.cos(a) * off, (3.6 + rnd() * 1.4) * s + (k === 0 ? 0.8 * s : 0), Math.sin(a) * off);
      g.add(m);
    }
    g.position.set(x, y, z);
    return g;
  }

  // ---------- grass ----------
  // Tufts of blades scattered over lawns, swaying in the wind. They're
  // re-scattered whenever the house changes so none poke through floors,
  // driveways or paths.
  HM.Grass = class {
    constructor({ area, height, count, colors, keepOut = [] }) {
      this.area = area; this.height = height; this.count = count; this.keepOut = keepOut;
      const blades = [];
      for (let b = 0; b < 3; b++) {
        const g = new THREE.PlaneGeometry(0.05, 1, 1, 3);
        g.translate(0, 0.5, 0);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const t = p.getY(i);
          p.setX(i, p.getX(i) * (1 - t * 0.85));
          p.setZ(i, t * t * 0.12);
        }
        g.rotateY((b / 3) * Math.PI * 2 + 0.4);
        g.translate((b - 1) * 0.05, 0, (b % 2) * 0.04);
        blades.push(g);
      }
      const geo = new THREE.BufferGeometry();
      for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]]) {
        const parts = blades.map((g) => g.toNonIndexed().attributes[name].array);
        const arr = new Float32Array(parts.reduce((n, a) => n + a.length, 0));
        let off = 0;
        parts.forEach((a) => { arr.set(a, off); off += a.length; });
        geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
      }
      // Normals point up so tufts shade like the lawn they stand on.
      const nor = geo.attributes.normal;
      for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, 1, 0);
      const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, side: THREE.DoubleSide });
      this.uTime = { value: 0 };
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.uTime;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          vec3 base = instanceMatrix[3].xyz;
          float sway = sin(uTime * 1.7 + base.x * 0.35 + base.z * 0.22) + 0.5 * sin(uTime * 3.1 + base.x * 0.9);
          transformed.x += sway * 0.07 * position.y * position.y;
          transformed.z += sway * 0.03 * position.y * position.y;`);
      };
      this.mesh = new THREE.InstancedMesh(geo, mat, count);
      this.mesh.receiveShadow = true;
      this.mesh.castShadow = false;
      this.mesh.frustumCulled = false;
      this.colors = colors.map((c) => new THREE.Color(c));
      this.scatter([]);
    }
    // footprints: [{x, z, w, d}] areas to keep clear (houses, driveways...)
    scatter(footprints) {
      const all = this.keepOut.concat(footprints);
      const rnd = HM.rng(5);
      const o = new THREE.Object3D();
      const col = new THREE.Color();
      const A = this.area;
      let n = 0, guard = 0;
      while (n < this.count && guard++ < this.count * 4) {
        const x = A.x0 + rnd() * (A.x1 - A.x0), z = A.z0 + rnd() * (A.z1 - A.z0);
        if (all.some((r) => Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2)) continue;
        o.position.set(x, this.height(x, z) - 0.02, z);
        o.rotation.set(0, rnd() * 6.28, 0);
        const s = 0.18 + rnd() * 0.22;
        o.scale.set(1 + rnd(), s, 1 + rnd());
        o.updateMatrix();
        this.mesh.setMatrixAt(n, o.matrix);
        col.copy(this.colors[Math.floor(rnd() * this.colors.length)]).offsetHSL(0, 0, (rnd() - 0.5) * 0.08);
        this.mesh.setColorAt(n, col);
        n++;
      }
      this.mesh.count = n;
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
    update(t) { this.uTime.value = t; }
  };

  // ---------- the street ----------
  const ROAD_Z = 26, ROAD_HALF = 4;
  HM.ROAD = { z: ROAD_Z, half: ROAD_HALF };

  // Terrain = the lot's natural shape, flattened along the road and under each
  // house pad. pads: [{x0, x1, z0, z1, h, mx, back, front}]
  function compose(raw, roadH, pads) {
    return (x, z) => {
      let h = raw(x, z);
      h = lerp(h, roadH(x), rectWeight(x, z, { x0: -1e9, x1: 1e9, z0: ROAD_Z - ROAD_HALF - 2.5, z1: ROAD_Z + ROAD_HALF + 2.5, mx: 1, back: 7, front: 7 }));
      for (const p of pads) h = lerp(h, p.h, rectWeight(x, z, p));
      return h;
    };
  }

  // Where neighbors go: two to each side on our side of the street, four
  // across the street facing us.
  function neighborSpots(spacing) {
    return [
      { x: -spacing, z: 0, rot: 0 }, { x: spacing, z: 0, rot: 0 },
      { x: -spacing * 2, z: 0, rot: 0 }, { x: spacing * 2, z: 0, rot: 0 },
      { x: -spacing / 2, z: ROAD_Z * 2, rot: Math.PI }, { x: spacing / 2, z: ROAD_Z * 2, rot: Math.PI },
      { x: -spacing * 1.5, z: ROAD_Z * 2, rot: Math.PI }, { x: spacing * 1.5, z: ROAD_Z * 2, rot: Math.PI },
    ];
  }
  const padFor = (s, h) => ({ x0: s.x - 13, x1: s.x + 13, z0: s.z - 11, z1: s.z + 11, mx: 5, back: 5, front: 5, h });

  // Road, streetlights and neighbor houses, merged for speed.
  // pick(i, rnd) -> { style, opts } for neighbor i.
  function street({ group, height, env, spots, pick, rnd, shoulder, sidewalks, lampColor = '#ffe2b0' }) {
    // road surface with shoulders
    const roadGround = (x, z) => height(x, z);
    if (shoulder) group.add(HM.ribbon([[-900, ROAD_Z], [900, ROAD_Z]], ROAD_HALF * 2 + 2.4, shoulder, roadGround, { lift: 0.06, step: 4, uvScale: 3 }));
    group.add(HM.ribbon([[-900, ROAD_Z], [900, ROAD_Z]], ROAD_HALF * 2, HM.roadMaterial(!sidewalks), roadGround, { lift: 0.11, step: 4, uvScale: 12 }));
    const solid = new THREE.Group();
    if (sidewalks) {
      const walk = HM.mat('concrete', '#c7c2b8', { uv: 1.5 });
      const curb = HM.flat('#b5b0a7', { rough: 0.9 });
      for (const s of [-1, 1]) {
        group.add(HM.ribbon([[-900, ROAD_Z + s * (ROAD_HALF + 2.4)], [900, ROAD_Z + s * (ROAD_HALF + 2.4)]], 1.6, walk, roadGround, { lift: 0.13, step: 4, uvScale: 1.5 }));
        solid.add(HM.box(1800, 0.16, 0.22, curb, 0, height(0, ROAD_Z) - 0.02, ROAD_Z + s * (ROAD_HALF + 0.1)));
      }
    }
    // streetlights, alternating sides
    const pole = HM.flat('#4a4d52', { metal: 0.6, rough: 0.45 });
    const lamp = HM.flat('#f4efe2', { emissive: lampColor, emissiveIntensity: 0.4 });
    for (let x = -200, k = 0; x <= 200; x += 48, k++) {
      const s = k % 2 ? 1 : -1;
      const z = ROAD_Z + s * (ROAD_HALF + 1.0), y = height(x, z);
      solid.add(HM.box(0.16, 6.2, 0.16, pole, x, y, z));
      const arm = HM.box(0.1, 0.1, 1.6, pole, x, y + 6.1, z - s * 0.75);
      solid.add(arm);
      solid.add(HM.box(0.5, 0.16, 0.8, lamp, x, y + 5.98, z - s * 1.5));
    }
    // neighbors
    const footprints = [];
    spots.forEach((s, i) => {
      const { style, opts } = pick(i, rnd);
      const y = s.h ?? height(s.x, s.z);
      const roadEdgeLocal = s.rot ? s.z - (ROAD_Z + ROAD_HALF) : (ROAD_Z - ROAD_HALF) - s.z;
      const nEnv = { ...env, foundation: env.neighborFoundation || env.foundation, frontGround: 0, roadEdgeLocal };
      const h = HM.buildHouse(style, nEnv, opts, { x: s.x, z: s.z, y, rot: s.rot });
      const wrap = new THREE.Group();
      wrap.add(h.group);
      wrap.position.set(s.x, y, s.z);
      wrap.rotation.y = s.rot;
      solid.add(wrap);
      const f = s.rot ? -1 : 1;
      h.footprints.forEach((r) => footprints.push({ x: s.x + r.x * f, z: s.z + r.z * f, w: r.w, d: r.d }));
    });
    group.add(HM.mergeByMaterial(solid));
    return footprints;
  }

  // Random pick helpers for neighbor variety
  const pickOf = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (rnd, a, b) => a + rnd() * (b - a);

  const MAIN_PAD = { x0: -22, x1: 24, z0: -14, z1: 13, mx: 6, back: 6, front: 4, h: 0 };

  // ======================================================================
  // BEACHFRONT
  // ======================================================================
  function beach(quality) {
    const group = new THREE.Group();
    const rnd = HM.rng(11);
    const WATER = -1.6;
    const spots = neighborSpots(38);
    const raw = (x, z) => {
      let h = 0.25 * HM.fbm(x * 0.05, z * 0.05);
      if (z < -20) h -= (-z - 20) * 0.11; // beach slopes down to the water
      const dune = HM.smooth(-40, -18, z) * (0.6 + HM.fbm(x * 0.02, 3));
      h += dune * (1.0 + 2.2 * HM.fbm(x * 0.03 + 5, z * 0.04));
      h += HM.smooth(60, 110, z) * 3 * HM.fbm(x * 0.02, z * 0.03 + 9);
      return h;
    };
    const height = compose(raw, () => 0.1, [MAIN_PAD, ...spots.map((s) => padFor(s, 0))]);
    const dry = C('#e3d0a4'), wet = C('#b59b70'), grassy = C('#c7bd86');
    group.add(terrain({
      height,
      color: (x, z, h) => {
        let c = mixC(dry, wet, HM.smooth(-0.6, WATER - 0.2, h));
        const g = HM.smooth(0.9, 2.2, h) * HM.fbm(x * 0.1, z * 0.1);
        c = mixC(c, grassy, g * 1.3);
        return c.offsetHSL(0, 0, (HM.fbm(x * 0.3, z * 0.3) - 0.5) * 0.05);
      },
    }));

    // Ocean: gently heaving surface plus a scrolling ripple normal map.
    const oceanGeo = new THREE.PlaneGeometry(4000, 2420, 160, 80);
    oceanGeo.rotateX(-Math.PI / 2);
    oceanGeo.translate(0, WATER, -1230); // near edge tucks under the sand
    const base = Float32Array.from(oceanGeo.attributes.position.array);
    const normalTex = waterNormals();
    normalTex.repeat.set(160, 97);
    const ocean = new THREE.Mesh(oceanGeo, new THREE.MeshStandardMaterial({
      color: '#1d6a86', roughness: 0.06, metalness: 0.0, normalMap: normalTex, normalScale: new THREE.Vector2(0.4, 0.4), envMapIntensity: 1.1,
    }));
    ocean.receiveShadow = true;
    group.add(ocean);
    const foamTex = foamTexture();
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(900, 7, 1, 1), new THREE.MeshStandardMaterial({ map: foamTex, transparent: true, opacity: 0.9, roughness: 0.9, depthWrite: false }));
    foam.rotation.x = -Math.PI / 2;
    foamTex.repeat.set(60, 1);
    group.add(foam);
    const shoreZ = -20 - (WATER + 0.05) / -0.11 - 0.5;

    const env = {
      foundation: 'pilings', frontGround: 0, height, roadEdgeLocal: ROAD_Z - ROAD_HALF,
      shrub: 'grass', mailboxColor: '#f4f3ef',
      pathMat: HM.mat('deck', '#9b8263', { uv: 1.2 }), driveMat: HM.mat('concrete', '#d3c6a6', { uv: 3 }),
    };
    const pastel = ['#a9c6cf', '#f3e3b5', '#e9b8a8', '#cfe0c9', '#f2f1ec', '#b9c8e6', '#f0d0b0'];
    const keepOut = street({
      group, height, env, spots, rnd, shoulder: HM.mat('concrete', '#d8c9a4', { uv: 3 }), sidewalks: false,
      pick: (i, r) => (i % 4 === 3
        ? { style: 'modern', opts: { stories: 2, w: between(r, 12, 14), d: 9, wallColor: '#f2f1ec', garage: 0, chimney: false } }
        : { style: 'cottage', opts: { wallColor: pickOf(r, pastel), stories: r() < 0.5 ? 1 : 2, roofShape: pickOf(r, ['hip', 'gable']), roofColor: pickOf(r, ['#9aa3a8', '#6f7a80', '#4f5a63']), w: between(r, 10, 13), d: between(r, 8.5, 10), garage: r() < 0.4 ? 1 : 0, balcony: r() < 0.5 } }),
    });

    // Dune grass tufts
    const tuftGeo = new THREE.ConeGeometry(0.06, 0.9, 4);
    tuftGeo.translate(0, 0.45, 0);
    const clear = (x, z) => keepOut.some((r) => Math.abs(x - r.x) < r.w / 2 + 1 && Math.abs(z - r.z) < r.d / 2 + 1);
    const tufts = scatter(rnd, quality === 'high' ? 6000 : 3000, { x: [-170, 170], z: [-38, 120], avoid: (x, z) => height(x, z) < 0.3 || Math.abs(z - ROAD_Z) < ROAD_HALF + 2 || (Math.abs(x) < 24 && z > -16 && z < 22) || clear(x, z) });
    group.add(instances(tuftGeo, HM.flat('#9aa35a', { rough: 1 }), tufts, (o, [x, z], i, col) => {
      o.position.set(x + (i % 3) * 0.15, height(x, z) - 0.05, z);
      o.rotation.set((rnd() - 0.5) * 0.7, rnd() * 6, (rnd() - 0.5) * 0.7);
      o.scale.setScalar(0.7 + rnd() * 0.8);
      col.set('#9aa35a').offsetHSL((rnd() - 0.5) * 0.05, 0, (rnd() - 0.5) * 0.15);
      return true;
    }));
    // Boardwalks over the dunes, from each beach-side house to the sand
    const plank = HM.mat('deck', '#9b8263', { uv: 1.2 });
    const walks = new THREE.Group();
    for (const bx of [1, -38, 38, -76, 76]) {
      for (let z = -7; z > shoreZ + 8; z -= 2) {
        const y = Math.max(height(bx, z), 0) + 0.45;
        walks.add(HM.box(1.8, 0.12, 2.02, plank, bx, y, z - 1));
      }
    }
    // Sand fence along the dune line
    for (let x = -120; x < 120; x += 1.6) {
      if ([1, -38, 38, -76, 76].some((b) => Math.abs(x - b) < 2.5)) continue;
      const z = -24 + Math.sin(x * 0.07) * 2;
      walks.add(HM.box(0.08, 1.0, 0.03, HM.flat('#8c7a62'), x, height(x, z) - 0.1, z));
    }
    group.add(HM.mergeByMaterial(walks));
    [[-17, 8], [-24, -6], [26, 12], [-56, 10], [58, -4], [18, 36], [-30, 40], [70, 42]].forEach(([x, z]) => group.add(palm(x, z, height(x, z), rnd)));
    const um = new THREE.Group();
    um.add(HM.box(0.06, 2.3, 0.06, HM.flat('#dddddd'), 0, 0, 0));
    const canopy = HM.mesh(new THREE.ConeGeometry(1.5, 0.6, 8, 1, true), HM.flat('#e05b3c', { side: THREE.DoubleSide }));
    canopy.position.y = 2.2;
    um.add(canopy);
    for (const s of [-0.8, 0.8]) {
      const chair = HM.box(0.6, 0.08, 1.6, HM.flat('#f4efe4'), s, 0.3, 0.9);
      chair.rotation.x = -0.2;
      um.add(chair);
    }
    um.position.set(-6, height(-6, shoreZ + 7), shoreZ + 7);
    group.add(um);
    clouds(group, rnd, 9);

    const pos = oceanGeo.attributes.position;
    let frame = 0;
    return {
      group, env, keepOut, height,
      update(t) {
        normalTex.offset.set(t * 0.012, t * 0.02);
        foam.position.set(0, WATER + 0.03, shoreZ + 1.5 + Math.sin(t * 0.8) * 1.6);
        foam.material.opacity = 0.55 + 0.35 * Math.sin(t * 0.8 + 1.2);
        if (frame++ % 2) return;
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3], z = base[i * 3 + 2];
          const damp = HM.smooth(-45, -120, z) * 0.7 + 0.3;
          pos.setY(i, WATER + damp * (0.28 * Math.sin(z * 0.09 + t * 1.1) + 0.14 * Math.sin(x * 0.05 + z * 0.06 - t * 0.8) + 0.08 * Math.sin(x * 0.13 - t * 1.7)));
        }
        pos.needsUpdate = true;
        oceanGeo.computeVertexNormals();
      },
    };
  }

  // Ripple normal map: many small waves at random angles, so it tiles without
  // an obvious repeating pattern. Integer frequencies keep the edges seamless.
  function waterNormals() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const rnd = HM.rng(91);
    const waves = [];
    for (let i = 0; i < 22; i++) {
      let kx = 0, ky = 0;
      while (kx === 0 && ky === 0) { kx = Math.round((rnd() - 0.5) * 22); ky = Math.round((rnd() - 0.5) * 22); }
      waves.push({ kx, ky, a: 1 / Math.hypot(kx, ky), p: rnd() * Math.PI * 2 });
    }
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = (x / S) * Math.PI * 2, v = (y / S) * Math.PI * 2;
        let dx = 0, dy = 0;
        for (const w of waves) {
          const cph = Math.cos(w.kx * u + w.ky * v + w.p) * w.a;
          dx += cph * w.kx; dy += cph * w.ky;
        }
        const n = new THREE.Vector3(-dx * 0.12, -dy * 0.12, 1).normalize();
        const i = (y * S + x) * 4;
        img.data[i] = (n.x * 0.5 + 0.5) * 255;
        img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
        img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function foamTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    const rnd = HM.rng(4);
    for (let i = 0; i < 900; i++) {
      const y = 32 + (rnd() - 0.5) * 50 * rnd();
      g.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.5})`;
      g.beginPath();
      g.arc(rnd() * 256, y, 1 + rnd() * 3.5, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ======================================================================
  // MOUNTAIN HILLSIDE
  // ======================================================================
  function mountain(quality) {
    const group = new THREE.Group();
    const rnd = HM.rng(23);
    const TERRACE = -2.7;
    const spots = neighborSpots(40);
    const raw = (x, z) => {
      let h = -0.2 * z + (HM.fbm(x * 0.02, z * 0.02) - 0.5) * 8;
      h += Math.min(Math.max(0, -z - 40) * 0.28, 70) * (0.6 + HM.fbm(x * 0.01, z * 0.01)); // steeper uphill behind
      h += HM.smooth(70, 220, Math.abs(x)) * HM.fbm(x * 0.012 + 3, z * 0.012) * 40;
      return h;
    };
    const roadH = (x) => -0.2 * ROAD_Z + (HM.fbm(x * 0.004, 3) - 0.5) * 4;
    spots.forEach((s) => { s.h = -0.2 * s.z + (HM.fbm(s.x * 0.02, s.z * 0.02) - 0.5) * 4; });
    const height = compose(raw, roadH, [
      ...spots.map((s) => padFor(s, s.h)),
      { x0: -24, x1: 26, z0: 2.5, z1: 12, mx: 6, back: 0.01, front: 6, h: TERRACE },
      { x0: -22, x1: 24, z0: -14, z1: 2.5, mx: 6, back: 7, front: 0.9, h: 0 },
    ]);
    const grass = C('#6e7c45'), dryGrass = C('#8c8150'), rock = C('#7b756d');
    group.add(terrain({
      height,
      color: (x, z, h, slope) => {
        let c = mixC(grass, dryGrass, HM.fbm(x * 0.04, z * 0.04) * 1.4 - 0.2);
        c = mixC(c, rock, HM.smooth(0.12, 0.3, slope));
        return c.offsetHSL(0, 0, (HM.fbm(x * 0.2, z * 0.2) - 0.5) * 0.06);
      },
    }));

    // Distant snow-capped peaks
    const peakMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    [[-700, -1300, 520, 460], [-150, -1600, 700, 640], [500, -1350, 560, 500], [1100, -1100, 480, 380], [-1200, -1000, 460, 360]].forEach(([x, z, r, h], k) => {
      const geo = new THREE.ConeGeometry(r, h, 56, 18);
      const p = geo.attributes.position;
      const cols = [];
      for (let i = 0; i < p.count; i++) {
        const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
        const t = (vy + h / 2) / h;
        const n = 0.75 + HM.fbm(vx * 0.006 + k * 7, vz * 0.006 + vy * 0.004) * 0.55;
        p.setXYZ(i, vx * n, vy + (HM.fbm(vx * 0.01, vz * 0.01) - 0.5) * h * 0.15 * (1 - t), vz * n);
        const snow = HM.smooth(0.55, 0.7, t + (HM.noise(vx * 0.02, vz * 0.02) - 0.5) * 0.2);
        const c = mixC(C('#58606a'), C('#f3f6f8'), snow);
        cols.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, peakMat);
      m.position.set(x, h / 2 - 60, z);
      group.add(m);
    });

    const env = {
      foundation: 'walkout', neighborFoundation: 'stonecrawl', frontGround: TERRACE, height, roadEdgeLocal: ROAD_Z - ROAD_HALF,
      shrub: 'juniper', mailboxColor: '#3a3a3a',
      pathMat: HM.mat('stone', '#8e8373', { uv: 2 }), driveMat: HM.mat('concrete', '#8d8373', { uv: 3 }),
    };
    const woods = ['#7a5234', '#5e4430', '#8c6a4a', '#6b5040'];
    const keepOut = street({
      group, height, env, spots, rnd, shoulder: HM.mat('concrete', '#8a8274', { uv: 3 }), sidewalks: false,
      pick: (i, r) => (i % 3 === 2
        ? { style: 'craftsman', opts: { wallColor: pickOf(r, ['#5e6b55', '#6d5a47', '#4f5d63']), roofColor: '#3b3f3a', roofMat: 'seam', garage: 1, porch: r() < 0.6 } }
        : { style: 'chalet', opts: { wallColor: pickOf(r, woods), w: between(r, 10, 12.5), d: between(r, 9, 11), garage: r() < 0.5 ? 1 : 0, roofColor: pickOf(r, ['#3b3f3a', '#5a2f28', '#2f3a33']) } }),
    });
    const road = { x: 0, z: ROAD_Z, w: 4000, d: ROAD_HALF * 2 + 5 };

    // Pine forest: trunk + three stacked cones per tree, all instanced
    const blocked = (x, z) => rectWeight(x, z, { x0: -24, x1: 26, z0: -16, z1: 16, mx: 1, back: 1, front: 1 }) > 0.01
      || Math.abs(z - ROAD_Z) < ROAD_HALF + 5
      || spots.some((s) => Math.abs(x - s.x) < 15 && Math.abs(z - s.z) < 13);
    const trees = scatter(rnd, quality === 'high' ? 2400 : 1500, { rMin: 18, rMax: 400, avoid: blocked });
    const scales = trees.map(() => 0.7 + rnd() * 0.7);
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 2.4, 6);
    trunkGeo.translate(0, 1.2, 0);
    group.add(instances(trunkGeo, HM.flat('#4d3a2a', { rough: 1 }), trees, (o, [x, z], i) => {
      o.position.set(x, height(x, z) - 0.2, z);
      o.scale.setScalar(scales[i]);
    }));
    [[2.6, 4.2, 2.0], [2.0, 3.4, 4.1], [1.3, 2.8, 5.9]].forEach(([r, h, y]) => {
      const g = new THREE.ConeGeometry(r, h, 8);
      g.translate(0, y, 0);
      group.add(instances(g, HM.flat('#3b5a36', { rough: 0.95 }), trees, (o, [x, z], i, col) => {
        o.position.set(x, height(x, z) - 0.2, z);
        o.scale.setScalar(scales[i]);
        o.rotation.y = i;
        col.set('#3b5a36').offsetHSL((HM.noise(x * 0.05, z * 0.05) - 0.5) * 0.06, 0, (HM.noise(x, z) - 0.5) * 0.1);
        return true;
      }));
    });
    const rocks = scatter(rnd, 160, { rMin: 18, rMax: 200, avoid: blocked });
    group.add(instances(new THREE.DodecahedronGeometry(1, 0), HM.flat('#8a847b', { rough: 1 }), rocks, (o, [x, z]) => {
      o.position.set(x, height(x, z), z);
      o.scale.set(0.6 + rnd() * 1.8, 0.4 + rnd() * 1.0, 0.6 + rnd() * 1.6);
      o.rotation.set(rnd(), rnd() * 6, rnd());
    }));
    // Mountain meadow grass around the houses
    const meadow = new HM.Grass({
      area: { x0: -70, x1: 70, z0: -26, z1: 70 }, height, count: quality === 'high' ? 34000 : 11000,
      colors: ['#6f7d45', '#7d8a4c', '#8c8a52', '#65743f'], keepOut: [road, ...keepOut],
    });
    group.add(meadow.mesh);
    clouds(group, rnd, 7);
    return { group, env, keepOut, height, grass: meadow, update(t) { meadow.update(t); } };
  }

  // ======================================================================
  // SUBURBAN STREET
  // ======================================================================
  function suburban(quality) {
    const group = new THREE.Group();
    const rnd = HM.rng(37);
    const spots = neighborSpots(34);
    const raw = (x, z) => 0.12 * (HM.fbm(x * 0.05, z * 0.05) - 0.5) + HM.smooth(90, 220, Math.hypot(x, z - ROAD_Z)) * (HM.fbm(x * 0.006, z * 0.006) - 0.4) * 20;
    const height = compose(raw, () => 0, [MAIN_PAD, ...spots.map((s) => padFor(s, 0))]);
    const lawn = C('#5d8a3a'), lawn2 = C('#76954a');
    group.add(terrain({
      height,
      color: (x, z) => {
        const stripe = (Math.sin(x * 0.9) > 0 ? 0.012 : -0.012) * (1 - HM.smooth(40, 90, Math.hypot(x, z))); // mowing stripes, near the houses
        return mixC(lawn, lawn2, HM.fbm(x * 0.08, z * 0.08) * 1.2 - 0.2).offsetHSL(0, 0, stripe);
      },
    }));

    const env = {
      foundation: 'crawl', frontGround: 0, height, roadEdgeLocal: ROAD_Z - ROAD_HALF,
      shrub: 'boxwood', pathMat: HM.mat('concrete', '#c3beb4', { uv: 1.3 }), driveMat: HM.mat('concrete', '#bdb8ae', { uv: 3 }),
    };
    const sidings = ['#f2f1ec', '#c9d2d6', '#9fb1a2', '#34455a', '#d7c7b0', '#e3d8c3', '#8a9aa6'];
    const keepOut = street({
      group, height, env, spots, rnd, shoulder: null, sidewalks: true,
      pick: (i, r) => {
        const k = i % 3;
        if (k === 0) return { style: 'ranch', opts: { wallMat: r() < 0.5 ? 'brick' : 'lap', wallColor: r() < 0.5 ? pickOf(r, ['#b8674f', '#a86a58', '#c28468']) : pickOf(r, sidings), roofColor: pickOf(r, ['#4b4a4c', '#5a4b40', '#3f4448']), w: between(r, 15, 17.5) } };
        if (k === 1) return { style: 'farmhouse', opts: { wallMat: pickOf(r, ['lap', 'batten']), wallColor: pickOf(r, sidings), trimColor: '#f4f3ef', roofMat: 'asphalt', roofColor: pickOf(r, ['#4b4a4c', '#3f4448']), pitch: 8, garage: r() < 0.6 ? 2 : 1, dormers: r() < 0.4, chimney: r() < 0.5, doorColor: pickOf(r, ['#9b2d24', '#243a5a', '#23272b']) } };
        return { style: 'craftsman', opts: { wallColor: pickOf(r, ['#7c8b67', '#8a7a62', '#6d7f8a', '#b09a72']), garage: 1, dormers: r() < 0.5 } };
      },
    });
    const road = { x: 0, z: ROAD_Z, w: 4000, d: (ROAD_HALF + 3.3) * 2 };

    const trees = new THREE.Group();
    // street trees in the planting strip between curb and sidewalk
    for (let x = -130; x <= 130; x += 15) {
      for (const s of [-1, 1]) {
        const tx = x + s * 5 + rnd() * 2, tz = ROAD_Z + s * (ROAD_HALF + 1.2);
        if (Math.abs(tx - 12) < 7 || Math.abs(tx) < 3 || keepOut.some((r) => Math.abs(tx - r.x) < r.w / 2 + 1.5 && Math.abs(tz - r.z) < r.d / 2 + 1.5)) continue;
        trees.add(deciduous(tx, tz, 0, 0.85 + rnd() * 0.3, rnd));
      }
    }
    // backyard trees, and the wooded edge of the subdivision
    [[-18, -12], [16, -15], [-8, -20], [-54, -14], [52, -12], [-88, -16], [90, -18], [-36, 72], [30, 74]].forEach(([x, z]) => trees.add(deciduous(x, z, height(x, z), 1.1 + rnd() * 0.3, rnd)));
    scatter(rnd, quality === 'high' ? 220 : 140, { x: [-320, 320], z: [-300, -32], avoid: () => false }).forEach(([x, z]) => trees.add(deciduous(x, z, height(x, z), 1.0 + rnd() * 0.6, rnd)));
    scatter(rnd, quality === 'high' ? 160 : 90, { x: [-320, 320], z: [86, 300], avoid: () => false }).forEach(([x, z]) => trees.add(deciduous(x, z, height(x, z), 1.0 + rnd() * 0.6, rnd)));
    // wood privacy fences along the back lot lines
    const fence = HM.mat('batten', '#a88a68', { uv: 1 });
    trees.add(HM.box(150, 1.8, 0.1, fence, 0, 0, -16));
    for (const x of [-17, 17, -51, 51]) trees.add(HM.box(0.1, 1.8, 12, fence, x, 0, -10));
    group.add(HM.mergeByMaterial(trees));

    const lawnGrass = new HM.Grass({
      area: { x0: -70, x1: 70, z0: -15.5, z1: 66 }, height, count: quality === 'high' ? 50000 : 16000,
      colors: ['#5d8a3a', '#6a9443', '#557f35', '#78994a'], keepOut: [road, ...keepOut],
    });
    group.add(lawnGrass.mesh);
    clouds(group, rnd, 12);
    return { group, env, keepOut, height, grass: lawnGrass, update(t) { lawnGrass.update(t); } };
  }

  // ======================================================================
  // DESERT
  // ======================================================================
  function desert(quality) {
    const group = new THREE.Group();
    const rnd = HM.rng(53);
    const spots = neighborSpots(46);
    const raw = (x, z) => (HM.fbm(x * 0.012, z * 0.012) - 0.5) * 6 + (HM.fbm(x * 0.06, z * 0.06) - 0.5) * 0.8;
    const roadH = (x) => (HM.fbm(x * 0.004, 11) - 0.5) * 3;
    spots.forEach((s) => { s.h = roadH(s.x) * 0.6; });
    const height = compose(raw, roadH, [{ ...MAIN_PAD, mx: 12, back: 12, front: 6 }, ...spots.map((s) => ({ ...padFor(s, s.h), mx: 9, back: 9, front: 6 }))]);
    const sand = C('#d2ad84'), red = C('#bf8a62'), gravel = C('#dcc3a2');
    group.add(terrain({
      height,
      color: (x, z) => {
        let c = mixC(sand, red, HM.fbm(x * 0.02 + 4, z * 0.02) * 1.6 - 0.4);
        const yard = Math.max(rectWeight(x, z, { x0: -20, x1: 22, z0: -13, z1: 20, mx: 3, back: 3, front: 3 }), ...spots.map((s) => rectWeight(x, z, { x0: s.x - 12, x1: s.x + 12, z0: s.z - 11, z1: s.z + 11, mx: 3, back: 3, front: 3 })));
        c = mixC(c, gravel, yard * 0.6);
        return c.offsetHSL(0, 0, (HM.fbm(x * 0.4, z * 0.4) - 0.5) * 0.07);
      },
    }));

    // Mesas: flat-topped buttes with layered rock bands
    const bands = ['#b0674a', '#c27d57', '#d6a47c', '#b8704f', '#a86247', '#cb9270'].map(C);
    [[-480, -1100, 190, 95], [220, -1350, 260, 130], [820, -1000, 150, 80], [-1150, -900, 220, 70], [1300, -1500, 280, 150], [-700, 900, 200, 90]].forEach(([x, z, r, h], k) => {
      const geo = new THREE.CylinderGeometry(r * 0.82, r, h, 64, 14);
      const p = geo.attributes.position;
      const cols = [];
      for (let i = 0; i < p.count; i++) {
        const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
        const a = Math.atan2(vz, vx);
        const t = (vy + h / 2) / h;
        const n = 0.82 + HM.fbm(Math.cos(a) * 3 + k, Math.sin(a) * 3 + t * 2) * 0.4;
        p.setXYZ(i, vx * n, vy, vz * n * (0.7 + (k % 3) * 0.15));
        const c = bands[Math.floor(t * 9 + k) % bands.length].clone();
        if (vy > h / 2 - 1) c.set('#b8784c');
        c.offsetHSL(0, 0, (HM.noise(a * 6, t * 20) - 0.5) * 0.08);
        cols.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
      m.position.set(x, h / 2 - 8, z);
      group.add(m);
    });

    const env = {
      foundation: 'slab', frontGround: 0, height, roadEdgeLocal: ROAD_Z - ROAD_HALF,
      shrub: 'agave', mailboxColor: '#6b4a2e',
      pathMat: HM.mat('stone', '#c9a27e', { uv: 1.6 }), driveMat: HM.mat('concrete', '#c8ae8c', { uv: 3 }),
    };
    const earth = ['#c99a70', '#d8b48c', '#b88660', '#e0c3a0', '#c7a07a'];
    const keepOut = street({
      group, height, env, spots, rnd, shoulder: HM.mat('concrete', '#c4a888', { uv: 3 }), sidewalks: false, lampColor: '#ffd29a',
      pick: (i, r) => {
        if (i % 4 === 1) return { style: 'modern', opts: { stories: 1, wallColor: '#efe9df', garage: 2, w: between(r, 14, 16), chimney: false } };
        if (i % 4 === 3) return { style: 'mediterranean', opts: { stories: 1, tower: false, garage: 1, wallColor: pickOf(r, ['#eedfc2', '#e8d2b0']) } };
        return { style: 'pueblo', opts: { wallColor: pickOf(r, earth), trimColor: pickOf(r, ['#4a6a7a', '#3f7a6e', '#6b4a2e']), w: between(r, 12, 15), garage: r() < 0.6 ? 1 : 0 } };
      },
    });
    const clearOf = (x, z) => (Math.abs(x) < 26 && z > -16 && z < 22) || Math.abs(z - ROAD_Z) < ROAD_HALF + 3 || keepOut.some((r) => Math.abs(x - r.x) < r.w / 2 + 2 && Math.abs(z - r.z) < r.d / 2 + 2);

    // Saguaro cacti: trunk plus upturned arms
    const cactus = HM.flat('#5d7a45', { rough: 0.9 });
    const plants = new THREE.Group();
    scatter(rnd, quality === 'high' ? 110 : 70, { rMin: 16, rMax: 260, avoid: clearOf }).forEach(([x, z]) => {
      const g = new THREE.Group();
      const h = 4 + rnd() * 5;
      const trunk = HM.mesh(new THREE.CapsuleGeometry(0.35, h, 4, 10), cactus);
      trunk.position.y = h / 2;
      g.add(trunk);
      const arms = Math.floor(rnd() * 3);
      for (let a = 0; a < arms; a++) {
        const side = a % 2 ? 1 : -1;
        const ay = h * (0.35 + rnd() * 0.3), up = 1.2 + rnd() * 1.6;
        const out = HM.mesh(new THREE.CapsuleGeometry(0.25, 0.8, 4, 8), cactus);
        out.rotation.z = Math.PI / 2;
        out.position.set(side * 0.7, ay, 0);
        const rise = HM.mesh(new THREE.CapsuleGeometry(0.25, up, 4, 8), cactus);
        rise.position.set(side * 1.1, ay + up / 2, 0);
        g.add(out, rise);
      }
      g.position.set(x, height(x, z) - 0.2, z);
      g.rotation.y = rnd() * 6;
      plants.add(g);
    });
    group.add(HM.mergeByMaterial(plants));
    // Agave and low shrubs
    const agaveGeo = new THREE.ConeGeometry(0.12, 1.2, 4);
    agaveGeo.translate(0, 0.6, 0);
    const agave = [];
    scatter(rnd, quality === 'high' ? 900 : 500, { rMin: 12, rMax: 220, avoid: clearOf }).forEach(([x, z]) => { for (let k = 0; k < 7; k++) agave.push([x, z, k]); });
    group.add(instances(agaveGeo, HM.flat('#7f9a78', { rough: 0.9 }), agave, (o, [x, z, k], i, col) => {
      o.position.set(x, height(x, z) - 0.05, z);
      o.rotation.set(0.7 + (k % 2) * 0.2, (k / 7) * Math.PI * 2 + x, 0, 'YXZ');
      o.scale.setScalar(0.7 + ((((x * 13 + z) % 1) + 1) % 1) * 0.8);
      col.set(k % 3 ? '#7f9a78' : '#8a8f5e');
      return true;
    }));
    const rocks = scatter(rnd, 260, { rMin: 12, rMax: 250, avoid: clearOf });
    group.add(instances(new THREE.DodecahedronGeometry(1, 0), HM.flat('#a0644a', { rough: 1 }), rocks, (o, [x, z]) => {
      o.position.set(x, height(x, z), z);
      o.scale.set(0.4 + rnd() * 1.4, 0.3 + rnd() * 0.8, 0.4 + rnd() * 1.2);
      o.rotation.set(rnd(), rnd() * 6, rnd());
    }));
    clouds(group, rnd, 5, '#ffe2c4', 0.75);
    return { group, env, keepOut, height, update() {} };
  }

  // Lot settings. Sun directions point toward the sun; specs describe a typical
  // lot of each kind, shown in the title block.
  HM.LOTS = {
    beach: {
      name: 'Beachfront', build: beach,
      sky: { top: '#3d82d0', horizon: '#d2e7f2', bottom: '#d2e7f2' },
      sun: { dir: [0.45, 0.72, 0.55], color: '#fff3df', intensity: 3.1 },
      hemi: { sky: '#c3def5', ground: '#dcc8a0', intensity: 1.0 },
      fog: { near: 180, far: 1400 }, exposure: 0.95,
      size: '0.35 acre · 90 × 170 ft', grade: 'Level, 1% toward the water', foundationName: 'Raised on wood pilings (flood zone)',
    },
    mountain: {
      name: 'Mountain hillside', build: mountain,
      sky: { top: '#2e6db5', horizon: '#c7dbea', bottom: '#c7dbea' },
      sun: { dir: [-0.45, 0.66, 0.6], color: '#fff0da', intensity: 3.0 },
      hemi: { sky: '#bcd6ee', ground: '#58673f', intensity: 0.95 },
      fog: { near: 200, far: 2600 }, exposure: 0.95,
      size: '1.2 acres', grade: '18% slope, downhill to the road', foundationName: 'Stone walk-out basement',
    },
    suburban: {
      name: 'Suburban street', build: suburban,
      sky: { top: '#4a8edb', horizon: '#d9e7f0', bottom: '#d9e7f0' },
      sun: { dir: [0.35, 0.78, 0.52], color: '#fff6e6', intensity: 3.0 },
      hemi: { sky: '#c9e0f5', ground: '#6b7d48', intensity: 1.0 },
      fog: { near: 160, far: 1100 }, exposure: 0.95,
      size: '0.25 acre · 80 × 135 ft', grade: 'Level, 2%', foundationName: 'Block crawlspace',
    },
    desert: {
      name: 'Desert', build: desert,
      sky: { top: '#3f6aa8', horizon: '#f1d3b4', bottom: '#e8c29d' },
      sun: { dir: [-0.6, 0.34, 0.72], color: '#ffcf9e', intensity: 3.4 },
      hemi: { sky: '#f1cda8', ground: '#b27b50', intensity: 0.9 },
      fog: { near: 180, far: 1900 }, exposure: 0.9,
      size: '0.8 acre', grade: 'Level, 3%', foundationName: 'Concrete slab on grade',
    },
  };

  HM.buildLot = function (key, quality = 'normal') {
    return HM.LOTS[key].build(quality);
  };
})();
