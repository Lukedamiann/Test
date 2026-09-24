/* The four property lots: terrain, backdrop, props, sky and sunlight.
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
  function terrain({ size = 3200, seg = 320, height, color }) {
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
  const PAD = { x0: -15, x1: 15, z0: -10, z1: 9 };
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

  function deciduous(x, z, y, s, rnd, leaf = '#557a37') {
    const g = new THREE.Group();
    const trunk = HM.mesh(new THREE.CylinderGeometry(0.18 * s, 0.28 * s, 3 * s, 7), HM.flat('#5d4632', { rough: 1 }));
    trunk.position.y = 1.5 * s;
    g.add(trunk);
    const geo = new THREE.IcosahedronGeometry(2.4 * s, 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const n = 0.8 + HM.noise(vx * 0.9 + x, vy * 0.9 + vz * 0.7) * 0.45;
      p.setXYZ(i, vx * n, vy * n * 0.85, vz * n);
    }
    geo.computeVertexNormals();
    const c = C(leaf).offsetHSL((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.08);
    const crown = HM.mesh(geo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }));
    crown.position.y = 4 * s;
    g.add(crown);
    g.position.set(x, y, z);
    return g;
  }

  function simpleHouse({ x, z, y = 0, w = 11, d = 9, h = 3, wall, roof, rotY = 0, pitch = 0.5 }) {
    const g = new THREE.Group();
    g.add(HM.box(w, 0.5, d, HM.mat('concrete', '#8f8a82', { uv: 1.2 }), 0, y, 0));
    g.add(HM.box(w, h, d, wall, 0, y + 0.5, 0));
    const r = HM.gableRoof({ w, d, pitch, overhang: 0.5, mat: roof, wallMat: wall, trimMat: HM.flat('#f0eee8'), y: y + 0.5 + h });
    g.add(r.roof, r.gable);
    const glass = HM.glass();
    const frame = HM.flat('#f0eee8');
    for (const a of [-3, 0, 3]) g.add(HM.onWall(HM.window({ w: 1.2, h: 1.4, frame, glass, cols: 2, rows: 2 }), { face: 'front', w, d, along: a, y: y + 1.3 }));
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    return g;
  }

  // ======================================================================
  // BEACHFRONT
  // ======================================================================
  function beach() {
    const group = new THREE.Group();
    const rnd = HM.rng(11);
    const WATER = -1.6;
    const height = (x, z) => {
      let h = 0.25 * HM.fbm(x * 0.05, z * 0.05);
      if (z < -20) h -= (-z - 20) * 0.11; // beach slopes down to the water
      const dune = HM.smooth(16, 32, Math.abs(x)) * HM.smooth(-40, -18, z);
      h += dune * (1.2 + 2.6 * HM.fbm(x * 0.03 + 5, z * 0.04));
      h += HM.smooth(22, 60, z) * 1.5 * HM.fbm(x * 0.02, z * 0.03 + 9);
      return lerp(h, 0, rectWeight(x, z, PAD));
    };
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

    // Surf: a band of foam that washes up and back along the shoreline.
    const foamTex = foamTexture();
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(900, 7, 1, 1), new THREE.MeshStandardMaterial({ map: foamTex, transparent: true, opacity: 0.9, roughness: 0.9, depthWrite: false }));
    foam.rotation.x = -Math.PI / 2;
    foamTex.repeat.set(60, 1);
    group.add(foam);
    const shoreZ = -20 - (WATER + 0.05) / -0.11 - 0.5; // where the sand meets the water

    // Dune grass tufts
    const tuftGeo = new THREE.ConeGeometry(0.06, 0.9, 4);
    tuftGeo.translate(0, 0.45, 0);
    const tufts = scatter(rnd, 2600, { x: [-160, 160], z: [-38, 90], avoid: (x, z) => height(x, z) < 0.35 || (Math.abs(x) < 20 && z > -30 && z < 14) || (Math.abs(x - 1) < 2 && z < -8) });
    group.add(instances(tuftGeo, HM.flat('#9aa35a', { rough: 1 }), tufts, (o, [x, z], i, col) => {
      o.position.set(x + (i % 3) * 0.15, height(x, z) - 0.05, z);
      o.rotation.set((rnd() - 0.5) * 0.7, rnd() * 6, (rnd() - 0.5) * 0.7);
      o.scale.setScalar(0.7 + rnd() * 0.8);
      col.set('#9aa35a').offsetHSL((rnd() - 0.5) * 0.05, 0, (rnd() - 0.5) * 0.15);
      return true;
    }));

    // Boardwalk from the back of the house over the dunes to the sand
    const plank = HM.mat('deck', '#9b8263', { uv: 1.2 });
    for (let z = -7; z > shoreZ + 8; z -= 2) {
      const y = Math.max(height(1, z), 0) + 0.45;
      group.add(HM.box(2, 0.12, 2.02, plank, 1, y, z - 1));
      for (const s of [-0.9, 0.9]) group.add(HM.box(0.14, y - height(1 + s, z - 1) + 0.1, 0.14, HM.flat('#6d5a47'), 1 + s, height(1 + s, z - 1) - 0.1, z - 1));
    }
    // Sand fence along the dune line
    for (let x = -60; x < 60; x += 1.6) {
      if (Math.abs(x - 1) < 2.5) continue;
      const z = -24 + Math.sin(x * 0.07) * 2;
      group.add(HM.box(0.08, 1.0, 0.03, HM.flat('#8c7a62'), x, height(x, z) - 0.1, z));
    }
    // Palms, an umbrella and a pair of beach chairs
    [[-14, 6], [15, -3], [-19, -8], [20, 9], [-24, 14]].forEach(([x, z]) => group.add(palm(x, z, height(x, z), rnd)));
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
      group,
      update(t) {
        normalTex.offset.set(t * 0.012, t * 0.02);
        foam.position.set(0, WATER + 0.03, shoreZ + 1.5 + Math.sin(t * 0.8) * 1.6);
        foam.material.opacity = 0.55 + 0.35 * Math.sin(t * 0.8 + 1.2);
        if (frame++ % 2) return; // swell geometry every other frame is plenty
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
  function mountain() {
    const group = new THREE.Group();
    const rnd = HM.rng(23);
    const TERRACE = -2.7;
    const raw = (x, z) => {
      let h = -0.2 * z + (HM.fbm(x * 0.02, z * 0.02) - 0.5) * 8;
      h += Math.min(Math.max(0, -z - 40) * 0.28, 70) * (0.6 + HM.fbm(x * 0.01, z * 0.01)); // steeper uphill behind
      h += HM.smooth(60, 200, Math.abs(x)) * HM.fbm(x * 0.012 + 3, z * 0.012) * 40;
      return h;
    };
    const height = (x, z) => {
      let h = raw(x, z);
      h = lerp(h, TERRACE, rectWeight(x, z, { x0: -17, x1: 17, z0: 4, z1: 17, mx: 6, back: 0.01, front: 8 }));
      h = lerp(h, 0, rectWeight(x, z, { x0: -15, x1: 15, z0: -10, z1: 4.9, mx: 6, back: 7, front: 0.9 }));
      return h;
    };
    const grass = C('#6e7c45'), dryGrass = C('#8c8150'), rock = C('#7b756d'), dirt = C('#6f5d45');
    group.add(terrain({
      height,
      color: (x, z, h, slope) => {
        let c = mixC(grass, dryGrass, HM.fbm(x * 0.04, z * 0.04) * 1.4 - 0.2);
        c = mixC(c, rock, HM.smooth(0.12, 0.3, slope));
        const nearPad = rectWeight(x, z, { x0: -15, x1: 15, z0: -10, z1: 17, mx: 2, back: 2, front: 2 });
        c = mixC(c, dirt, nearPad * 0.15);
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

    // Pine forest: trunk + three stacked cones per tree, all instanced
    const pad = (x, z) => rectWeight(x, z, { x0: -19, x1: 19, z0: -14, z1: 22, mx: 1, back: 1, front: 1 }) > 0.01 || (Math.abs(x - 10) < 4 && z > 0 && z < 60);
    const spots = scatter(rnd, 1400, { rMin: 20, rMax: 380, avoid: pad });
    const scales = spots.map(() => 0.7 + rnd() * 0.7);
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 2.4, 6);
    trunkGeo.translate(0, 1.2, 0);
    group.add(instances(trunkGeo, HM.flat('#4d3a2a', { rough: 1 }), spots, (o, [x, z], i) => {
      o.position.set(x, height(x, z) - 0.2, z);
      o.scale.setScalar(scales[i]);
    }));
    [[2.6, 4.2, 2.0], [2.0, 3.4, 4.1], [1.3, 2.8, 5.9]].forEach(([r, h, y]) => {
      const g = new THREE.ConeGeometry(r, h, 8);
      g.translate(0, y, 0);
      group.add(instances(g, HM.flat('#2f4a2e', { rough: 0.95 }), spots, (o, [x, z], i, col) => {
        o.position.set(x, height(x, z) - 0.2, z);
        o.scale.setScalar(scales[i]);
        o.rotation.y = i;
        col.set('#3b5a36').offsetHSL((HM.noise(x * 0.05, z * 0.05) - 0.5) * 0.06, 0, (HM.noise(x, z) - 0.5) * 0.1);
        return true;
      }));
    });
    // Boulders
    const rocks = scatter(rnd, 160, { rMin: 18, rMax: 200, avoid: pad });
    group.add(instances(new THREE.DodecahedronGeometry(1, 0), HM.flat('#8a847b', { rough: 1 }), rocks, (o, [x, z], i) => {
      o.position.set(x, height(x, z), z);
      o.scale.set(0.6 + rnd() * 1.8, 0.4 + rnd() * 1.0, 0.6 + rnd() * 1.6);
      o.rotation.set(rnd(), rnd() * 6, rnd());
    }));
    // Stone retaining walls where the pad is cut into the hill
    const stone = HM.mat('stone', '#8a8173', { uv: 2.4 });
    group.add(HM.box(34, 3.4, 0.6, stone, 0, -0.4, -16));
    // Gravel drive curving up to the terrace
    const drive = HM.mat('concrete', '#8d8373', { uv: 3 });
    for (let z = 8; z < 60; z += 3) {
      const x = 10 + Math.sin(z * 0.05) * 2;
      const seg = HM.box(4, 0.2, 3.2, drive, x, height(x, z) - 0.12, z);
      seg.rotation.x = Math.atan2(height(x, z - 1.6) - height(x, z + 1.6), 3.2);
      group.add(seg);
    }

    clouds(group, rnd, 7);
    return { group, update() {} };
  }

  // ======================================================================
  // SUBURBAN STREET
  // ======================================================================
  function suburban() {
    const group = new THREE.Group();
    const rnd = HM.rng(37);
    const height = (x, z) => lerp(0.12 * (HM.fbm(x * 0.05, z * 0.05) - 0.5) - 0.02, 0, rectWeight(x, z, PAD));
    const lawn = C('#5d8a3a'), lawn2 = C('#76954a');
    group.add(terrain({
      height,
      color: (x, z) => {
        const stripe = Math.sin(x * 0.9) > 0 ? 0.02 : -0.02; // mowing stripes
        return mixC(lawn, lawn2, HM.fbm(x * 0.08, z * 0.08) * 1.2 - 0.2).offsetHSL(0, 0, stripe);
      },
    }));

    const asphalt = HM.mat('concrete', '#3c3e42', { uv: 4, bumpScale: 0.6 });
    const walk = HM.mat('concrete', '#c3beb4', { uv: 1.5 });
    group.add(HM.box(900, 0.06, 9, asphalt, 0, 0, 22));
    for (let x = -440; x < 440; x += 6) group.add(HM.box(3, 0.02, 0.14, HM.flat('#e2c24a'), x, 0.06, 22));
    for (const z of [16.3, 27.7]) {
      group.add(HM.box(900, 0.12, 1.8, walk, 0, 0, z));
      group.add(HM.box(900, 0.16, 0.25, HM.flat('#b1ada5'), 0, 0, z + (z < 22 ? 1.0 : -1.0)));
    }
    // Driveway to the garage side
    group.add(HM.box(4.6, 0.05, 11, walk, 9, 0, 11.5));
    // Mailbox at the curb
    group.add(HM.group(
      HM.box(0.1, 1.1, 0.1, HM.flat('#f0eee8'), -6, 0, 14.9),
      HM.box(0.3, 0.3, 0.55, HM.flat('#2a2d31', { metal: 0.4 }), -6, 1.1, 14.9),
    ));
    // Neighbours on both sides and across the street
    const walls = [HM.mat('lap', '#c9d2d6', { uv: 2 }), HM.mat('lap', '#e3d8c3', { uv: 2 }), HM.mat('lap', '#9fb1a2', { uv: 2 }), HM.mat('brick', '#9a5a45', { uv: 1.4 }), HM.mat('lap', '#d7c7b0', { uv: 2 })];
    const roofs = [HM.mat('asphalt', '#4b4a4c', { uv: 2 }), HM.mat('asphalt', '#5a4b40', { uv: 2 })];
    [[-34, 0, 0], [34, -1, 0], [-68, 1, 0], [68, 0, 0], [-22, 44, Math.PI], [18, 45, Math.PI], [56, 44, Math.PI], [-60, 45, Math.PI]].forEach(([x, z, r], i) => {
      group.add(simpleHouse({ x, z, w: 11 + (i % 3), d: 9, h: i % 2 ? 5.4 : 3, wall: walls[i % walls.length], roof: roofs[i % 2], rotY: r, pitch: 0.45 + (i % 3) * 0.1 }));
    });
    // Street trees and yard trees
    for (let x = -120; x <= 120; x += 17) {
      if (Math.abs(x - 9) < 5) continue;
      group.add(deciduous(x + rnd() * 2, 14, 0, 0.9 + rnd() * 0.4, rnd));
      group.add(deciduous(x + 8 + rnd() * 2, 30, 0, 0.9 + rnd() * 0.4, rnd));
    }
    [[-18, -12], [16, -15], [-24, 4], [26, 6], [-6, -22], [8, -24]].forEach(([x, z]) => group.add(deciduous(x, z, height(x, z), 1.1 + rnd() * 0.3, rnd, '#4e7334')));
    // Privacy fence along the back of the lot and hedges on the sides
    const fence = HM.mat('batten', '#a88a68', { uv: 1 });
    group.add(HM.box(52, 1.8, 0.1, fence, 0, 0, -20));
    for (const x of [-26, 26]) group.add(HM.box(1.1, 1.3, 32, HM.flat('#3f6130', { rough: 1 }), x, 0, -4));
    const background = scatter(rnd, 120, { x: [-300, 300], z: [-260, -40], avoid: (x, z) => Math.abs(x) < 30 && z > -30 });
    background.forEach(([x, z]) => group.add(deciduous(x, z, height(x, z), 1.0 + rnd() * 0.6, rnd, rnd() < 0.5 ? '#4e7334' : '#62823c')));

    clouds(group, rnd, 12);
    return { group, update() {} };
  }

  // ======================================================================
  // DESERT
  // ======================================================================
  function desert() {
    const group = new THREE.Group();
    const rnd = HM.rng(53);
    const height = (x, z) => {
      const h = (HM.fbm(x * 0.012, z * 0.012) - 0.5) * 6 + (HM.fbm(x * 0.06, z * 0.06) - 0.5) * 0.8;
      return lerp(h, 0, rectWeight(x, z, { ...PAD, mx: 14, back: 14, front: 14 }));
    };
    const sand = C('#d2ad84'), red = C('#bf8a62'), gravel = C('#dcc3a2');
    group.add(terrain({
      height,
      color: (x, z) => {
        let c = mixC(sand, red, HM.fbm(x * 0.02 + 4, z * 0.02) * 1.6 - 0.4);
        c = mixC(c, gravel, rectWeight(x, z, { x0: -17, x1: 17, z0: -12, z1: 14, mx: 3, back: 3, front: 3 }) * 0.7);
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
        const top = vy > h / 2 - 1;
        p.setXYZ(i, vx * n, vy, vz * n * (0.7 + (k % 3) * 0.15));
        const c = bands[Math.floor(t * 9 + k) % bands.length].clone();
        if (top) c.set('#b8784c');
        c.offsetHSL(0, 0, (HM.noise(a * 6, t * 20) - 0.5) * 0.08);
        cols.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
      m.position.set(x, h / 2 - 8, z);
      group.add(m);
    });

    // Saguaro cacti: trunk plus upturned arms
    const cactus = HM.flat('#5d7a45', { rough: 0.9 });
    const avoid = (x, z) => Math.abs(x) < 20 && z > -16 && z < 18;
    scatter(rnd, 70, { rMin: 20, rMax: 260, avoid }).forEach(([x, z]) => {
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
      group.add(g);
    });
    // Agave and low shrubs
    const agaveGeo = new THREE.ConeGeometry(0.12, 1.2, 4);
    agaveGeo.translate(0, 0.6, 0);
    const shrubs = scatter(rnd, 500, { rMin: 14, rMax: 220, avoid });
    const agave = [];
    shrubs.forEach(([x, z]) => { for (let k = 0; k < 7; k++) agave.push([x, z, k]); });
    group.add(instances(agaveGeo, HM.flat('#7f9a78', { rough: 0.9 }), agave, (o, [x, z, k], i, col) => {
      o.position.set(x, height(x, z) - 0.05, z);
      o.rotation.set(0.7 + (k % 2) * 0.2, (k / 7) * Math.PI * 2 + x, 0, 'YXZ');
      o.scale.setScalar(0.7 + ((x * 13 + z) % 1 + 1) % 1 * 0.8);
      col.set(k % 3 ? '#7f9a78' : '#8a8f5e');
      return true;
    }));
    const rocks = scatter(rnd, 220, { rMin: 15, rMax: 250, avoid });
    group.add(instances(new THREE.DodecahedronGeometry(1, 0), HM.flat('#a0644a', { rough: 1 }), rocks, (o, [x, z]) => {
      o.position.set(x, height(x, z), z);
      o.scale.set(0.4 + rnd() * 1.4, 0.3 + rnd() * 0.8, 0.4 + rnd() * 1.2);
      o.rotation.set(rnd(), rnd() * 6, rnd());
    }));

    clouds(group, rnd, 5, '#ffe2c4', 0.75);
    return { group, update() {} };
  }

  // Lot settings. Sun directions point toward the sun; specs describe a typical
  // lot of each kind, shown in the title block.
  HM.LOTS = {
    beach: {
      name: 'Beachfront', build: beach, foundation: 'pilings', frontGround: 0,
      sky: { top: '#3d82d0', horizon: '#d2e7f2', bottom: '#d2e7f2' },
      sun: { dir: [0.45, 0.72, 0.55], color: '#fff3df', intensity: 3.1 },
      hemi: { sky: '#c3def5', ground: '#dcc8a0', intensity: 1.0 },
      fog: { near: 180, far: 1400 }, exposure: 0.95,
      size: '0.35 acre · 90 × 170 ft', grade: 'Level, 1% toward the water', foundationName: 'Raised on wood pilings (flood zone)',
    },
    mountain: {
      name: 'Mountain hillside', build: mountain, foundation: 'walkout', frontGround: -2.7,
      sky: { top: '#2e6db5', horizon: '#c7dbea', bottom: '#c7dbea' },
      sun: { dir: [-0.45, 0.66, 0.6], color: '#fff0da', intensity: 3.0 },
      hemi: { sky: '#bcd6ee', ground: '#58673f', intensity: 0.95 },
      fog: { near: 200, far: 2600 }, exposure: 0.95,
      size: '1.2 acres', grade: '18% slope, downhill to the front', foundationName: 'Stone walk-out basement',
    },
    suburban: {
      name: 'Suburban street', build: suburban, foundation: 'crawl', frontGround: 0,
      sky: { top: '#4a8edb', horizon: '#d9e7f0', bottom: '#d9e7f0' },
      sun: { dir: [0.35, 0.78, 0.52], color: '#fff6e6', intensity: 3.0 },
      hemi: { sky: '#c9e0f5', ground: '#6b7d48', intensity: 1.0 },
      fog: { near: 160, far: 1100 }, exposure: 0.95,
      size: '0.25 acre · 80 × 135 ft', grade: 'Level, 2%', foundationName: 'Block crawlspace',
    },
    desert: {
      name: 'Desert', build: desert, foundation: 'slab', frontGround: 0,
      sky: { top: '#3f6aa8', horizon: '#f1d3b4', bottom: '#e8c29d' },
      sun: { dir: [-0.6, 0.34, 0.72], color: '#ffcf9e', intensity: 3.4 },
      hemi: { sky: '#f1cda8', ground: '#b27b50', intensity: 0.9 },
      fog: { near: 180, far: 1900 }, exposure: 0.9,
      size: '0.8 acre', grade: 'Level, 3%', foundationName: 'Concrete slab on grade',
    },
  };

  HM.buildLot = function (key) {
    return HM.LOTS[key].build();
  };
})();
