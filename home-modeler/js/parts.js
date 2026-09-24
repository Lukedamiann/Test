/* Architectural building blocks: roofs, windows, doors, columns, railings, stairs.
   Conventions: meters; +y is up; a house's front faces +z (toward the street);
   parts are positioned by their bottom so they stack like real construction. */
var HM = (window.HM = window.HM || {});

(function () {
  // ---------- roofs ----------

  // Gable roof over a w x d box whose wall tops sit at height y.
  // The ridge runs along x (use axis:'z' to turn it 90 degrees).
  // pitch = rise / run, e.g. 5:12 -> 0.42. Returns the roof panels and the
  // triangular gable-end walls separately so they can animate in different stages.
  HM.gableRoof = function ({ w, d, pitch, overhang = 0.5, thick = 0.18, mat, wallMat, trimMat, x = 0, y = 0, z = 0, axis = 'x', rafters = false }) {
    const roof = new THREE.Group();
    const gable = new THREE.Group();
    const half = d / 2;
    const run = half + overhang;
    const rise = half * pitch;
    const theta = Math.atan(pitch);
    const L = run / Math.cos(theta) + thick * Math.tan(theta);
    for (const side of [1, -1]) {
      const geo = new THREE.BoxGeometry(w + overhang * 2, thick, L);
      if (mat.userData.uvScale) HM.worldUV(geo, mat.userData.uvScale);
      const p = HM.mesh(geo, mat);
      const zc = (side * run) / 2;
      p.position.set(0, rise - Math.abs(zc) * pitch + thick / (2 * Math.cos(theta)), zc);
      p.rotation.x = side * theta;
      roof.add(p);
      if (trimMat) {
        // fascia board along the eave
        const f = HM.mesh(new THREE.BoxGeometry(w + overhang * 2 + 0.05, 0.22, 0.06), trimMat);
        f.position.set(0, rise - run * pitch + 0.02, side * (run + 0.02));
        roof.add(f);
      }
      if (rafters) {
        // exposed rafter tails under the eave, a Craftsman signature
        for (let rx = -w / 2 - overhang + 0.3; rx <= w / 2 + overhang - 0.2; rx += 0.7) {
          const r = HM.mesh(new THREE.BoxGeometry(0.09, 0.16, overhang), trimMat || mat);
          r.position.set(rx, rise - (half + overhang / 2) * pitch - 0.1, side * (half + overhang / 2));
          r.rotation.x = side * theta;
          roof.add(r);
        }
      }
    }
    // Gable-end wall: a triangle extruded across the full width.
    const shape = new THREE.Shape();
    shape.moveTo(-half, 0);
    shape.lineTo(half, 0);
    shape.lineTo(0, rise);
    shape.closePath();
    const tri = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    if (wallMat.userData.uvScale) {
      tri.computeVertexNormals();
      HM.worldUV(tri, wallMat.userData.uvScale);
    }
    const gm = HM.mesh(tri, wallMat);
    gm.rotation.y = Math.PI / 2;
    gm.position.set(-w / 2, 0, 0);
    gable.add(gm);
    // Rake trim along the sloped gable edges.
    if (trimMat) {
      for (const end of [1, -1]) {
        for (const side of [1, -1]) {
          const t = HM.mesh(new THREE.BoxGeometry(0.08, 0.2, L), trimMat);
          const zc = (side * run) / 2;
          t.position.set(end * (w / 2 + overhang + 0.02), rise - Math.abs(zc) * pitch + 0.02, zc);
          t.rotation.x = side * theta;
          roof.add(t);
        }
      }
    }
    for (const g of [roof, gable]) {
      g.position.set(x, y, z);
      if (axis === 'z') g.rotation.y = Math.PI / 2;
    }
    return { roof, gable, rise };
  };

  // Hip roof: slopes on all four sides meeting at a ridge (a pyramid if w == d).
  HM.hipRoof = function ({ w, d, pitch, overhang = 0.5, mat, trimMat, x = 0, y = 0, z = 0 }) {
    const swap = d > w;
    const a = (swap ? d : w) / 2 + overhang;
    const b = (swap ? w : d) / 2 + overhang;
    const h = b * pitch;
    const r = a - b; // half-length of the ridge
    const P = (px, py, pz) => [px, py, pz];
    const faces = [
      // front, back, right end, left end (counter-clockwise from outside)
      [P(-a, 0, b), P(a, 0, b), P(r, h, 0)], [P(-a, 0, b), P(r, h, 0), P(-r, h, 0)],
      [P(a, 0, -b), P(-a, 0, -b), P(-r, h, 0)], [P(a, 0, -b), P(-r, h, 0), P(r, h, 0)],
      [P(a, 0, b), P(a, 0, -b), P(r, h, 0)],
      [P(-a, 0, -b), P(-a, 0, b), P(-r, h, 0)],
    ];
    const pos = [], uv = [];
    const slope = Math.sqrt(1 + pitch * pitch);
    const s = mat.userData.uvScale || 2;
    faces.forEach((tri, i) => {
      tri.forEach(([px, py, pz]) => {
        pos.push(px, py, pz);
        // u runs along the eave, v runs up the slope
        const along = i < 4 ? px : pz;
        uv.push(along / s, (py * slope) / pitch / s);
      });
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const roof = new THREE.Group();
    const m = HM.mesh(geo, mat);
    roof.add(m);
    // Thickness at the eave so the roof doesn't look paper-thin.
    if (trimMat) {
      const t = 0.2;
      roof.add(HM.box(a * 2 + 0.04, t, 0.06, trimMat, 0, -t, b));
      roof.add(HM.box(a * 2 + 0.04, t, 0.06, trimMat, 0, -t, -b));
      roof.add(HM.box(0.06, t, b * 2, trimMat, a, -t, 0));
      roof.add(HM.box(0.06, t, b * 2, trimMat, -a, -t, 0));
    }
    roof.position.set(x, y - overhang * pitch, z);
    if (swap) roof.rotation.y = Math.PI / 2;
    return roof;
  };

  // Flat roof slab with an overhang, the modern look.
  HM.flatRoof = function ({ w, d, overhang = 0.4, thick = 0.3, mat, x = 0, y = 0, z = 0 }) {
    return HM.box(w + overhang * 2, thick, d + overhang * 2, mat, x, y, z);
  };

  // ---------- openings ----------

  // A window, built facing +z with its bottom-center at the origin.
  // cols/rows: muntin grid (divided lites). top: 'arch' for a round-top window.
  HM.window = function ({ w, h, frame, glass, cols = 1, rows = 1, top, sill = true, trim, trimW = 0.12, shutters }) {
    const g = new THREE.Group();
    const depth = 0.12;
    if (top === 'arch') {
      const r = w / 2;
      g.add(HM.mesh(new THREE.ExtrudeGeometry(archFrame(w, h, 0.09), { depth, bevelEnabled: false }), frame));
      const pane = HM.mesh(new THREE.ShapeGeometry(archShape(w, h, r)), glass);
      pane.position.z = 0.02;
      g.add(pane);
      // center mullion + transom bar
      g.add(HM.box(0.05, h, 0.05, frame, 0, 0, 0.06));
      g.add(HM.box(w, 0.05, 0.05, frame, 0, h - r, 0.06));
    } else {
      const t = 0.07;
      g.add(HM.box(w + t * 2, t, depth, frame, 0, -t, 0.02));
      g.add(HM.box(w + t * 2, t, depth, frame, 0, h, 0.02));
      g.add(HM.box(t, h, depth, frame, -w / 2 - t / 2, 0, 0.02));
      g.add(HM.box(t, h, depth, frame, w / 2 + t / 2, 0, 0.02));
      const pane = HM.mesh(new THREE.PlaneGeometry(w, h), glass);
      pane.position.set(0, h / 2, 0);
      g.add(pane);
      for (let c = 1; c < cols; c++) g.add(HM.box(0.035, h, 0.04, frame, -w / 2 + (w * c) / cols, 0, 0.03));
      for (let r = 1; r < rows; r++) g.add(HM.box(w, 0.035, 0.04, frame, 0, (h * r) / rows - 0.017, 0.03));
    }
    if (trim) {
      // wide flat casing around the window (Craftsman / Colonial)
      const top_ = top === 'arch' ? 0 : trimW;
      g.add(HM.box(w + trimW * 2 + 0.14, top_ + 0.04, 0.04, trim, 0, h + 0.07, 0.0));
      g.add(HM.box(trimW, h + 0.14, 0.04, trim, -w / 2 - 0.07 - trimW / 2, -0.07, 0.0));
      g.add(HM.box(trimW, h + 0.14, 0.04, trim, w / 2 + 0.07 + trimW / 2, -0.07, 0.0));
    }
    if (sill) g.add(HM.box(w + 0.35, 0.06, 0.2, trim || frame, 0, -0.14, 0.08));
    if (shutters) {
      for (const s of [-1, 1]) {
        const sh = HM.box(w * 0.48, h + 0.1, 0.05, shutters, s * (w / 2 + 0.18 + w * 0.24), -0.05, 0.03);
        g.add(sh);
        for (let k = 1; k < 6; k++) g.add(HM.box(w * 0.4, 0.02, 0.02, shutters, s * (w / 2 + 0.18 + w * 0.24), (h * k) / 6, 0.07));
      }
    }
    return g;
  };

  function archShape(w, h, r) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, h - r);
    s.absarc(0, h - r, w / 2, 0, Math.PI, false);
    s.lineTo(-w / 2, 0);
    return s;
  }
  // U-shaped frame of thickness t around a round-top opening w wide, h tall.
  function archFrame(w, h, t) {
    const R = w / 2, yc = h - R;
    const s = new THREE.Shape();
    s.moveTo(-R - t, 0);
    s.lineTo(-R, 0);
    s.lineTo(-R, yc);
    s.absarc(0, yc, R, Math.PI, 0, true);
    s.lineTo(R, 0);
    s.lineTo(R + t, 0);
    s.lineTo(R + t, yc);
    s.absarc(0, yc, R + t, 0, Math.PI, false);
    s.lineTo(-R - t, 0);
    return s;
  }
  HM.archShape = archShape;
  HM.archFrame = archFrame;

  // A front door with frame; `lites` adds a band of small windows (Craftsman),
  // top:'arch' makes a round-top door (Mediterranean).
  HM.door = function ({ w = 1.0, h = 2.2, mat, frame, glass, lites = 0, top, knob }) {
    const g = new THREE.Group();
    if (top === 'arch') {
      const leaf = HM.mesh(new THREE.ExtrudeGeometry(archShape(w, h, w / 2), { depth: 0.08, bevelEnabled: false }), mat);
      g.add(leaf);
      g.add(HM.mesh(new THREE.ExtrudeGeometry(archFrame(w, h, 0.15), { depth: 0.14, bevelEnabled: false }), frame));
      for (let i = 1; i < 4; i++) g.add(HM.box(0.03, h - w / 2, 0.02, frame, -w / 2 + (w * i) / 4, 0, 0.09));
    } else {
      g.add(HM.box(w, h, 0.08, mat, 0, 0, 0));
      g.add(HM.box(w + 0.24, 0.12, 0.12, frame, 0, h, 0.02));
      g.add(HM.box(0.12, h, 0.12, frame, -w / 2 - 0.06, 0, 0.02));
      g.add(HM.box(0.12, h, 0.12, frame, w / 2 + 0.06, 0, 0.02));
      if (lites) {
        const lw = (w - 0.2) / lites;
        for (let i = 0; i < lites; i++) {
          const p = HM.mesh(new THREE.PlaneGeometry(lw - 0.05, 0.3), glass);
          p.position.set(-w / 2 + 0.1 + lw * (i + 0.5), h - 0.4, 0.045);
          g.add(p);
        }
      } else {
        // two recessed panels
        g.add(HM.box(w - 0.3, h * 0.35, 0.02, frame, 0, h * 0.1, 0.045));
        g.add(HM.box(w - 0.3, h * 0.35, 0.02, frame, 0, h * 0.55, 0.045));
      }
    }
    const k = HM.mesh(new THREE.SphereGeometry(0.045, 10, 8), knob || HM.flat('#b08d57', { metal: 0.9, rough: 0.3 }));
    k.position.set(w / 2 - 0.12, 1.0, 0.12);
    g.add(k);
    return g;
  };

  // Place a window/door group on a wall face of a box centered at (cx, cz)
  // with size w x d. face: 'front' (+z), 'back', 'left' (-x), 'right' (+x).
  // `along` is the offset along the wall; `y` the bottom height.
  HM.onWall = function (obj, { face, cx = 0, cz = 0, w, d, along = 0, y = 0, out = 0.02 }) {
    switch (face) {
      case 'front': obj.position.set(cx + along, y, cz + d / 2 + out); break;
      case 'back': obj.position.set(cx - along, y, cz - d / 2 - out); obj.rotation.y = Math.PI; break;
      case 'right': obj.position.set(cx + w / 2 + out, y, cz - along); obj.rotation.y = Math.PI / 2; break;
      case 'left': obj.position.set(cx - w / 2 - out, y, cz + along); obj.rotation.y = -Math.PI / 2; break;
    }
    return obj;
  };

  // ---------- structure & details ----------

  // Tapered square column (Craftsman porch column); set taper 0 for straight.
  HM.column = function ({ h, wTop, wBottom, mat, x = 0, y = 0, z = 0, round = false }) {
    const seg = round ? 16 : 4;
    const geo = new THREE.CylinderGeometry(wTop / (round ? 2 : Math.SQRT2), wBottom / (round ? 2 : Math.SQRT2), h, seg);
    const m = HM.mesh(geo, mat);
    m.position.set(x, y + h / 2, z);
    if (!round) m.rotation.y = Math.PI / 4;
    return m;
  };

  // Straight run of railing between two points at a given height.
  HM.railing = function ({ x1, z1, x2, z2, y = 0, h = 0.95, mat, spacing = 0.14, glass }) {
    const g = new THREE.Group();
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, dz);
    const wrap = new THREE.Group();
    if (glass) {
      wrap.add(HM.box(0.02, h, len, glass, 0, 0, 0));
      wrap.add(HM.box(0.05, 0.05, len, mat, 0, h, 0));
    } else {
      wrap.add(HM.box(0.08, 0.06, len, mat, 0, h - 0.06, 0));
      wrap.add(HM.box(0.06, 0.05, len, mat, 0, 0.08, 0));
      for (let s = -len / 2 + spacing / 2; s < len / 2; s += spacing) wrap.add(HM.box(0.03, h - 0.14, 0.03, mat, 0, 0.08, s));
    }
    wrap.rotation.y = ang;
    wrap.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
    g.add(wrap);
    return g;
  };

  // Steps from height `top` down to height `bottom`, starting at z and
  // descending toward +z (out from the front of the house).
  HM.stairs = function ({ x = 0, z, top, bottom = 0, w = 1.6, mat, rise = 0.18, run = 0.3 }) {
    const g = new THREE.Group();
    const n = Math.max(1, Math.round((top - bottom) / rise));
    const r = (top - bottom) / n;
    for (let i = 0; i < n; i++) {
      const h = top - bottom - r * i;
      g.add(HM.box(w, h, run, mat, x, bottom, z + run * (i + 0.5)));
    }
    return g;
  };

  // Chimney: a stack that rises from `y` to `top`, with a cap.
  HM.chimney = function ({ x, z, y = 0, top, w = 1.1, d = 0.8, mat, capMat }) {
    const g = new THREE.Group();
    g.add(HM.box(w, top - y, d, mat, x, y, z));
    g.add(HM.box(w + 0.16, 0.14, d + 0.16, capMat || mat, x, top, z));
    g.add(HM.box(0.28, 0.35, 0.28, HM.flat('#3d2b24', { rough: 0.8 }), x - w * 0.2, top + 0.14, z));
    return g;
  };

  // Potted plant / shrub: a pot and a leafy blob.
  HM.planter = function ({ x, z, y = 0, size = 0.7, potMat, leafColor = '#4f6b3a', tall = false }) {
    const g = new THREE.Group();
    const pot = HM.mesh(new THREE.CylinderGeometry(size * 0.42, size * 0.32, size * 0.6, 14), potMat || HM.flat('#a65a3a', { rough: 0.9 }));
    pot.position.set(x, y + size * 0.3, z);
    g.add(pot);
    const leafGeo = tall ? new THREE.ConeGeometry(size * 0.38, size * 2.6, 10) : new THREE.IcosahedronGeometry(size * 0.55, 1);
    const leaf = HM.mesh(leafGeo, HM.flat(leafColor, { rough: 0.95 }));
    leaf.position.set(x, y + size * (tall ? 1.8 : 0.95), z);
    g.add(leaf);
    return g;
  };
})();
