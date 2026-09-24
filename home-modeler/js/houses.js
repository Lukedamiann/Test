/* Parametric houses. Every house, yours or a neighbor's, is built from:
     - a style's character (proportions, porch type, trim details), and
     - options you can change (colors, materials, size, roof, features, windows).
   Pieces are added through ctx.add(obj, stage, kind, tag):
     stage: build order (0 foundation, 1 walls, 2 structure, 3 upper walls,
            4 windows & doors, 5 roofs, 6 details)
     kind:  how it arrives in the animation ('rise', 'drop', 'pop')
     tag:   which option it belongs to, so toggling a feature animates just it.
   Coordinates: meters, +y up, the front of the house faces +z. */
var HM = (window.HM = window.HM || {});

(function () {
  // ---------- material catalogs (used by the Customize panel too) ----------
  HM.WALLS = {
    lap: { name: 'Lap siding', kind: 'lap', uv: 2 },
    batten: { name: 'Board & batten', kind: 'batten', uv: 2 },
    shingle: { name: 'Cedar shakes', kind: 'shingle', uv: 1.6 },
    stucco: { name: 'Stucco', kind: 'stucco', uv: 3, bump: 0.5 },
    brick: { name: 'Brick', kind: 'brick', uv: 1.4 },
    stone: { name: 'Stone', kind: 'stone', uv: 2.4 },
    slat: { name: 'Wood slats', kind: 'slat', uv: 1.6, bump: 2 },
  };
  HM.ROOFS = {
    asphalt: { name: 'Asphalt shingle', kind: 'asphalt', uv: 2 },
    seam: { name: 'Standing-seam metal', kind: 'seam', uv: 2.7, rough: 0.4, metal: 0.55, bump: 0.8 },
    clay: { name: 'Clay tile', kind: 'clay', uv: 1.8, rough: 0.7, bump: 2.5 },
    shake: { name: 'Cedar shake', kind: 'shingle', uv: 1.4 },
    membrane: { name: 'Flat membrane', kind: 'paint', uv: 3, rough: 0.85 },
  };
  const wallMat = (key, color) => {
    const W = HM.WALLS[key];
    return HM.mat(W.kind, color, { uv: W.uv, bumpScale: W.bump ?? 1.5 });
  };
  const roofMat = (key, color) => {
    const R = HM.ROOFS[key];
    return HM.mat(R.kind, color, { uv: R.uv, rough: R.rough, metal: R.metal, bumpScale: R.bump ?? 1.5 });
  };

  const FOUNDATION_TOP = { slab: 0.3, crawl: 0.7, pilings: 2.6, walkout: 0.9, stonecrawl: 0.9 };

  // ---------- build context ----------
  // env: the lot (foundation type, ground height, where the road is...)
  // place: where this house sits in the world ({x, z, y, rot: 0 or Math.PI})
  function makeCtx(env, place) {
    const group = new THREE.Group();
    const parts = [];
    const f = env.foundation;
    const flip = place.rot ? -1 : 1;
    const ctx = {
      group, parts, env,
      y0: FOUNDATION_TOP[f],
      front: env.frontGround, // ground height just in front of the house
      footprints: [],
      add(obj, stage, kind = 'rise', tag = 'core') {
        group.add(obj);
        parts.push({ obj, stage, kind, tag });
        return obj;
      },
      // ground height at a local point, relative to this house's base
      ground: (x, z) => env.height(place.x + x * flip, place.z + z * flip) - place.y,
      mats: {
        concrete: HM.mat('concrete', '#b3aea6', { uv: 3 }),
        block: HM.mat('concrete', '#8f8a82', { uv: 1.2 }),
        pile: HM.mat('deck', '#6e5b48', { uv: 1.5 }),
        stone: HM.mat('stone', '#8a8173', { uv: 2.4 }),
      },
    };
    ctx.foot = (r, pad = 0) => ctx.footprints.push({ x: r.x, z: r.z, w: r.w + pad * 2, d: r.d + pad * 2 });

    // Foundation under the footprints; returns the floor height.
    ctx.base = function (rects) {
      const g = new THREE.Group();
      const m = ctx.mats;
      const top = ctx.y0;
      for (const r of rects) {
        if (f === 'slab') g.add(HM.box(r.w + 0.3, top, r.d + 0.3, m.concrete, r.x, 0, r.z));
        if (f === 'crawl') g.add(HM.box(r.w + 0.1, top, r.d + 0.1, m.block, r.x, 0, r.z));
        if (f === 'stonecrawl') g.add(HM.box(r.w + 0.2, top + 1.5, r.d + 0.2, m.stone, r.x, -1.5, r.z));
        if (f === 'walkout') g.add(HM.box(r.w + 0.3, top + 3.2, r.d + 0.3, m.stone, r.x, -3.2, r.z));
        if (f === 'pilings') {
          const nx = Math.max(2, Math.round(r.w / 3) + 1), nz = Math.max(2, Math.round(r.d / 3) + 1);
          for (let i = 0; i < nx; i++) {
            for (let k = 0; k < nz; k++) {
              const px = r.x - r.w / 2 + 0.3 + ((r.w - 0.6) * i) / (nx - 1);
              const pz = r.z - r.d / 2 + 0.3 + ((r.d - 0.6) * k) / (nz - 1);
              g.add(HM.box(0.34, top - 0.3, 0.34, m.pile, px, 0, pz));
            }
          }
          g.add(HM.box(r.w + 0.2, 0.3, r.d + 0.2, m.pile, r.x, top - 0.3, r.z));
        }
      }
      if (f === 'walkout') {
        // walk-out basement windows facing downhill
        const r = rects[0];
        const glass = HM.glass(), frame = HM.flat('#2a2a2a', { rough: 0.5 });
        const face = { face: 'front', cx: r.x, cz: r.z + 0.15, w: r.w, d: r.d };
        g.add(HM.onWall(HM.window({ w: 2.4, h: 1.6, frame, glass, cols: 2, sill: false }), { ...face, along: -r.w / 4, y: ctx.front + 0.5 }));
        g.add(HM.onWall(HM.window({ w: 2.0, h: 2.2, frame, glass, cols: 2, sill: false }), { ...face, along: r.w / 4, y: ctx.front }));
      }
      ctx.add(g, 0, 'rise');
      return top;
    };

    // Posts or a solid base under a porch that sticks out in front.
    ctx.support = function (r, top) {
      const g = new THREE.Group();
      const bottom = ctx.front;
      if (top - bottom < 0.05) return g;
      if (f === 'slab' || f === 'crawl') {
        g.add(HM.box(r.w, top - bottom, r.d, f === 'slab' ? ctx.mats.concrete : ctx.mats.block, r.x, bottom, r.z));
      } else {
        const mat = f === 'pilings' ? ctx.mats.pile : ctx.mats.stone;
        const s = f === 'pilings' ? 0.3 : 0.5;
        const n = Math.max(2, Math.round(r.w / 2.6) + 1);
        for (let i = 0; i < n; i++) {
          const px = r.x - r.w / 2 + s / 2 + ((r.w - s) * i) / (n - 1);
          g.add(HM.box(s, top - bottom, s, mat, px, bottom, r.z + r.d / 2 - s / 2));
        }
      }
      return g;
    };

    // Front steps from `top` down to the ground; returns [group, z where they end].
    ctx.stairs = function (x, z, w, top) {
      const mat = f === 'pilings' ? HM.mat('deck', '#8a7156', { uv: 1.5 }) : f === 'walkout' || f === 'stonecrawl' ? ctx.mats.stone : ctx.mats.concrete;
      const bottom = ctx.front;
      const g = HM.stairs({ x, z, top, bottom, w, mat });
      const steps = Math.max(1, Math.round((top - bottom) / 0.18));
      const run = steps * 0.3;
      if (top - bottom > 1.2) {
        const rail = HM.flat('#2e2e2e', { metal: 0.5, rough: 0.5 });
        for (const s of [-1, 1]) {
          const len = Math.hypot(run, top - bottom);
          const r = HM.box(0.06, 0.06, len, rail);
          r.position.set(x + (s * w) / 2, (top + bottom) / 2 + 0.9, z + run / 2);
          r.rotation.x = Math.atan2(top - bottom, run);
          g.add(r);
          const n = Math.max(2, Math.round(run / 1.2) + 1);
          for (let i = 0; i < n; i++) {
            const pz = z + 0.15 + (i / (n - 1)) * (run - 0.3);
            const py = top - (top - bottom) * ((pz - z) / run);
            g.add(HM.box(0.07, 0.9, 0.07, rail, x + (s * w) / 2, py, pz));
          }
        }
      }
      return [g, z + run];
    };
    return ctx;
  }

  // Shorthand: put a window/door on a wall of box b.
  const place = (obj, b, face, along, y) => HM.onWall(obj, { face, cx: b.x, cz: b.z, w: b.w, d: b.d, along, y });

  // Spread windows evenly along a wall, skipping excluded stretches (doors, wings).
  function spread(from, to, winW, gap, exclude = []) {
    const spots = [];
    const cuts = exclude.map(([a, b]) => [Math.max(a, from), Math.min(b, to)]).filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
    const spans = [];
    let s = from;
    for (const [a, b] of cuts) { if (a > s) spans.push([s, a]); s = Math.max(s, b); }
    if (to > s) spans.push([s, to]);
    for (const [a, b] of spans) {
      const L = b - a;
      const n = Math.floor((L + gap) / (winW + gap));
      if (n < 1) continue;
      const step = L / n;
      for (let i = 0; i < n; i++) spots.push(a + step * (i + 0.5));
    }
    return spots;
  }

  // ======================================================================
  // The builder
  // ======================================================================
  function build(ctx, S, o) {
    const F = S.flavor;
    const w = o.w, d = o.d, st = o.stories, hS = F.storyH;
    const pitch = o.pitch / 12;
    const pitched = o.roofShape !== 'flat';
    const sideGable = o.roofShape === 'gable' && o.ridge === 'side';

    // materials
    const wall = wallMat(o.wallMat, o.wallColor);
    const accent = wallMat(F.accentMat || 'batten', o.accentColor || o.wallColor);
    const trim = HM.flat(o.trimColor, { rough: 0.6 });
    const roof = roofMat(pitched ? (o.roofMat === 'membrane' ? 'asphalt' : o.roofMat) : 'membrane', o.roofColor);
    const doorMat = HM.flat(o.doorColor, { rough: 0.55 });
    const glass = HM.glass();
    const fascia = F.fascia === 'wall' ? HM.flat(new THREE.Color(o.wallColor).offsetHSL(0, 0, -0.05).getStyle()) : F.fascia === 'roof' ? HM.flat(o.roofColor, { rough: 0.8 }) : trim;
    const iron = HM.flat('#1d1d1d', { rough: 0.5, metal: 0.6 });
    const railMat = F.rail === 'iron' ? iron : F.rail === 'wood' ? HM.mat('deck', '#8a6a4a', { uv: 1.2 }) : trim;
    const deck = HM.mat('deck', '#8b6b4c', { uv: 1.6 });

    const M = { x: 0, z: 0, w, d };
    const doorX = F.doorX * w;
    const rects = [M];

    let T = null;
    if (o.tower && F.tower) {
      T = { x: -w / 2 - 1.9, z: d / 2 - 1.6, w: 3.8, d: 3.8 };
      rects.push(T);
    }
    const y0 = ctx.base(rects);
    ctx.foot(M, 0.6);
    if (T) ctx.foot(T, 0.4);

    // ---------- walls ----------
    let R = M, topY;
    const modernUpper = F.upper && st === 2;
    if (modernUpper) {
      ctx.add(HM.box(w, hS, d, wall, 0, y0, 0), 1);
      ctx.add(HM.flatRoof({ w, d, overhang: 0.3, thick: 0.3, mat: HM.flat(o.roofColor, { rough: 0.8 }), y: y0 + hS }), 2, 'drop');
      R = { x: -w * 0.17, z: 1.2, w: w * 0.62, d: d - 0.8 };
      ctx.add(HM.box(R.w, hS, R.d, accent, R.x, y0 + hS + 0.3, R.z), 3);
      topY = y0 + hS * 2 + 0.3;
    } else {
      ctx.add(HM.box(w, hS * st, d, wall, 0, y0, 0), 1);
      if (st === 2 && F.belt) ctx.add(HM.box(w + 0.06, 0.2, d + 0.06, trim, 0, y0 + hS - 0.1, 0), 2);
      topY = y0 + hS * st;
    }
    const upperY = y0 + hS + (modernUpper ? 0.3 : 0);

    // roof height above the wall top
    const rise = o.roofShape === 'gable' ? (o.ridge === 'side' ? R.d / 2 : R.w / 2) * pitch : o.roofShape === 'hip' ? (Math.min(R.w, R.d) / 2) * pitch : 0;
    const ridgeY = topY + rise;

    // ---------- garage wing (sits at ground level, even when the house is raised) ----------
    let G = null;
    if (o.garage) {
      const gw = o.garage === 1 ? 4.4 : 7.0, gd = Math.min(d, 7.5);
      G = { x: w / 2 + gw / 2, z: d / 2 - 0.6 - gd / 2, w: gw, d: gd };
      const gy = ctx.front, gh = 3.0;
      const gm = F.garageAccent ? accent : wall;
      ctx.add(HM.group(
        HM.box(gw + 0.2, 0.15, gd + 0.2, ctx.mats.concrete, G.x, gy, G.z),
        HM.box(gw, gh, gd, gm, G.x, gy + 0.15, G.z),
      ), 1, 'rise', 'garage');
      const gdoor = HM.mat('lap', o.trimColor, { uv: 2.4 });
      const doors = o.garage === 1 ? [0] : [-1.65, 1.65];
      doors.forEach((a) => {
        const p = HM.group(HM.box(2.7, 2.3, 0.1, gdoor), HM.box(2.9, 0.12, 0.14, trim, 0, 2.3, 0));
        p.position.set(G.x + a, gy + 0.15, G.z + gd / 2 + 0.03);
        ctx.add(p, 4, 'pop', 'garage');
      });
      ctx.add(place(HM.window({ w: 1.0, h: 0.9, frame: trim, glass, sill: false }), G, 'right', 0, gy + 1.5), 4, 'pop', 'garage');
      const gTop = gy + 0.15 + gh;
      if (!pitched) ctx.add(HM.flatRoof({ w: gw, d: gd, overhang: 0.3, thick: 0.3, mat: HM.flat(o.roofColor, { rough: 0.8 }), x: G.x, y: gTop, z: G.z }), 5, 'drop', 'garage');
      else if (o.roofShape === 'hip') ctx.add(HM.hipRoof({ w: gw, d: gd, pitch, overhang: 0.4, mat: roof, trimMat: fascia, x: G.x, y: gTop, z: G.z }), 5, 'drop', 'garage');
      else {
        const gr = HM.gableRoof({ w: gd, d: gw, pitch, overhang: 0.4, mat: roof, wallMat: gm, trimMat: fascia, axis: 'z', x: G.x, y: gTop, z: G.z });
        ctx.add(HM.group(gr.gable, gr.roof), 5, 'drop', 'garage');
      }
      ctx.foot(G, 0.3);
    }

    // ---------- tower ----------
    if (T) {
      const th = hS * st + 2.6;
      ctx.add(HM.box(T.w, th, T.d, wall, T.x, y0, T.z), 3, 'rise', 'tower');
      for (let k = 0; k <= st; k++) {
        const y = y0 + 0.9 + k * (th - 1.2) / (st + 0.6);
        ctx.add(place(winFor('arched', 0.8, 1.3, true), T, 'front', 0, y), 4, 'pop', 'tower');
        ctx.add(place(winFor('arched', 0.8, 1.3, true), T, 'left', 0, y), 4, 'pop', 'tower');
      }
      if (pitched) ctx.add(HM.hipRoof({ w: T.w, d: T.d, pitch: 0.6, overhang: 0.5, mat: roof, trimMat: fascia, x: T.x, y: y0 + th, z: T.z }), 5, 'drop', 'tower');
      else ctx.add(parapet(T, y0 + th, wall), 5, 'drop', 'tower');
    }

    // ---------- porch ----------
    let stairTop = y0, stairZ = d / 2, stairW = 1.8, porchRect = null;
    const kind = o.porch ? F.porch : 'none';
    const tagP = 'porch';
    if (kind === 'gable' || kind === 'stoop') {
      const pw = kind === 'stoop' ? 3.2 : Math.min(8.2, w * 0.62), pd = kind === 'stoop' ? 1.8 : 3;
      const P = { x: Math.min(Math.max(doorX, -w / 2 + pw / 2), w / 2 - pw / 2), z: d / 2 + pd / 2, w: pw, d: pd };
      ctx.add(HM.group(ctx.support(P, y0 - 0.15), HM.box(pw, 0.15, pd, kind === 'stoop' ? ctx.mats.concrete : deck, P.x, y0 - 0.15, P.z)), 1, 'rise', tagP);
      const colZ = P.z + pd / 2 - 0.35;
      const stone = HM.mat('stone', '#8e8373', { uv: 2.2 });
      const beamY = y0 + Math.min(hS, 2.9) - 0.4;
      for (const cx of [P.x - pw / 2 + 0.35, P.x + pw / 2 - 0.35]) {
        const g = kind === 'gable'
          ? HM.group(HM.box(0.72, 1.0, 0.72, stone, cx, y0, colZ), HM.column({ h: beamY - y0 - 1.0, wTop: 0.32, wBottom: 0.5, mat: trim, x: cx, y: y0 + 1.0, z: colZ }))
          : HM.column({ h: beamY - y0, wTop: 0.22, wBottom: 0.22, mat: trim, x: cx, y: y0, z: colZ, round: true });
        ctx.add(g, 2, 'rise', tagP);
      }
      ctx.add(HM.box(pw + 0.2, 0.3, 0.38, trim, P.x, beamY, colZ), 2, 'drop', tagP);
      const pr = HM.gableRoof({ w: pd + 0.6, d: pw + 0.2, pitch: Math.max(pitch, 0.4) + 0.03, overhang: 0.4, mat: roof, wallMat: kind === 'gable' ? accent : wall, trimMat: fascia, axis: 'z', x: P.x, y: beamY + 0.3, z: P.z - 0.15, rafters: F.rafters });
      ctx.add(HM.group(pr.roof, pr.gable), 5, 'drop', tagP);
      stairTop = y0; stairZ = P.z + pd / 2; stairW = Math.min(2.2, pw - 1); porchRect = P;
    } else if (kind === 'shed') {
      const pw = w, pd = 2.6;
      const P = { x: 0, z: d / 2 + pd / 2, w: pw, d: pd };
      ctx.add(HM.group(ctx.support(P, y0 - 0.15), HM.box(pw, 0.15, pd, deck, 0, y0 - 0.15, P.z)), 1, 'rise', tagP);
      const eave = topY - (pitched ? F.overhang * pitch : 0);
      const backY = Math.min(y0 + hS + 0.2, eave - 0.12);
      const depth = pd + 0.55, tilt = 0.16;
      const frontY = backY - depth * Math.tan(tilt);
      const postZ = P.z + pd / 2 - 0.2;
      const postH = frontY - y0 - 0.12;
      const posts = HM.group();
      const n = Math.max(2, Math.round(pw / 2.7) + 1);
      for (let i = 0; i < n; i++) posts.add(HM.box(0.22, postH - 0.28, 0.22, trim, -pw / 2 + 0.3 + ((pw - 0.6) * i) / (n - 1), y0, postZ));
      posts.add(HM.box(pw + 0.2, 0.28, 0.3, trim, 0, y0 + postH - 0.28, postZ));
      ctx.add(posts, 2, 'rise', tagP);
      const pr = HM.box(pw + 0.5, 0.12, depth, roof);
      pr.position.set(0, backY - (depth / 2) * Math.tan(tilt), d / 2 + depth / 2 - 0.05);
      pr.rotation.x = tilt;
      ctx.add(pr, 5, 'drop', tagP);
      if (F.porchRail || y0 - ctx.front > 0.6) {
        const gap = 1.3;
        ctx.add(HM.group(
          HM.railing({ x1: -pw / 2 + 0.3, z1: postZ, x2: doorX - gap, z2: postZ, y: y0, h: 0.9, mat: railMat }),
          HM.railing({ x1: doorX + gap, z1: postZ, x2: pw / 2 - 0.3, z2: postZ, y: y0, h: 0.9, mat: railMat }),
        ), 6, 'pop', tagP);
      }
      stairTop = y0; stairZ = P.z + pd / 2; stairW = 2.2; porchRect = P;
    } else if (kind === 'arcade' || kind === 'portal') {
      const pw = Math.min(kind === 'arcade' ? 9 : 10, w * 0.75), pd = kind === 'arcade' ? 1.8 : 2.4;
      const P = { x: Math.min(Math.max(doorX, -w / 2 + pw / 2), w / 2 - pw / 2), z: d / 2 + pd / 2, w: pw, d: pd };
      const tile = HM.mat('concrete', '#b98361', { uv: 0.8 });
      ctx.add(HM.group(ctx.support(P, y0 - 0.15), HM.box(pw, 0.15, pd, tile, P.x, y0 - 0.15, P.z)), 1, 'rise', tagP);
      const H = Math.min(3.0, hS);
      const g = new THREE.Group();
      if (kind === 'arcade') {
        const bays = 3, bw = pw / bays, Rr = (bw - 0.7) / 2, yc = H - 0.45 - Rr;
        for (let i = 0; i < bays; i++) {
          const s = new THREE.Shape();
          s.moveTo(-bw / 2, 0); s.lineTo(-Rr, 0); s.lineTo(-Rr, yc);
          s.absarc(0, yc, Rr, Math.PI, 0, true);
          s.lineTo(Rr, 0); s.lineTo(bw / 2, 0); s.lineTo(bw / 2, H); s.lineTo(-bw / 2, H); s.lineTo(-bw / 2, 0);
          const geo = new THREE.ExtrudeGeometry(s, { depth: 0.45, bevelEnabled: false });
          HM.worldUV(geo, 3);
          const m = HM.mesh(geo, wall);
          m.position.set(P.x - pw / 2 + bw * (i + 0.5), y0, P.z + pd / 2 - 0.45);
          g.add(m);
        }
        g.add(HM.box(pw + 0.1, 0.3, pd + 0.1, wall, P.x, y0 + H, P.z));
      } else {
        const wood = HM.flat('#6b4a2e', { rough: 0.8 });
        const n = Math.max(2, Math.round(pw / 2.6) + 1);
        for (let i = 0; i < n; i++) g.add(HM.box(0.26, H - 0.3, 0.26, wood, P.x - pw / 2 + 0.25 + ((pw - 0.5) * i) / (n - 1), y0, P.z + pd / 2 - 0.25));
        g.add(HM.box(pw + 0.2, 0.3, 0.32, wood, P.x, y0 + H - 0.3, P.z + pd / 2 - 0.25));
        g.add(HM.box(pw + 0.3, 0.22, pd + 0.2, wall, P.x, y0 + H, P.z));
        for (let x = P.x - pw / 2 + 0.4; x < P.x + pw / 2; x += 0.8) {
          const v = HM.mesh(new THREE.CylinderGeometry(0.09, 0.09, pd + 0.7, 8), wood);
          v.rotation.x = Math.PI / 2;
          v.position.set(x, y0 + H - 0.08, P.z + 0.2);
          g.add(v);
        }
      }
      ctx.add(g, 2, 'rise', tagP);
      if (o.balcony && st === 2) {
        const by = y0 + H + 0.3;
        ctx.add(HM.group(
          HM.railing({ x1: P.x - pw / 2 + 0.1, z1: P.z + pd / 2 - 0.05, x2: P.x + pw / 2 - 0.1, z2: P.z + pd / 2 - 0.05, y: by, mat: railMat, spacing: 0.18 }),
          HM.railing({ x1: P.x + pw / 2 - 0.05, z1: P.z + pd / 2, x2: P.x + pw / 2 - 0.05, z2: d / 2, y: by, mat: railMat, spacing: 0.18 }),
          HM.railing({ x1: P.x - pw / 2 + 0.05, z1: P.z + pd / 2, x2: P.x - pw / 2 + 0.05, z2: d / 2, y: by, mat: railMat, spacing: 0.18 }),
        ), 6, 'pop', 'balcony');
      }
      stairTop = y0; stairZ = P.z + pd / 2; stairW = 2.4; porchRect = P;
    } else if (kind === 'canopy') {
      ctx.add(HM.box(2.8, 0.18, 1.9, HM.flat(o.roofColor, { rough: 0.8 }), doorX, y0 + Math.min(hS, 3.0) - 0.1, d / 2 + 0.95), 5, 'drop', tagP);
    }
    if (porchRect) ctx.foot(porchRect, 0.3);

    // ---------- balcony (second floor) ----------
    let balconyDoor = false;
    if (o.balcony && st === 2 && !(kind === 'arcade' || kind === 'portal')) {
      const tag = 'balcony';
      if (modernUpper) {
        // terrace on the lower roof beside the upper floor
        const x1 = R.x + R.w / 2 + 0.2, x2 = w / 2 - 0.1, y = y0 + hS + 0.3;
        const glassRail = HM.flat('#bcd7de', { opacity: 0.28, rough: 0.05 });
        if (x2 - x1 > 1) {
          ctx.add(HM.group(
            HM.railing({ x1, z1: d / 2 + 0.2, x2, z2: d / 2 + 0.2, y, mat: trim, glass: glassRail }),
            HM.railing({ x1: x2, z1: d / 2 + 0.2, x2, z2: -d / 2, y, mat: trim, glass: glassRail }),
          ), 6, 'pop', tag);
        }
      } else {
        const full = F.balconyFull;
        const bw = full ? w : 3.4, bd = full ? 1.5 : 1.3, bx = full ? 0 : doorX;
        const slabMat = F.rail === 'wood' ? HM.mat('deck', '#8a6a4a', { uv: 1.2 }) : trim;
        const g = HM.group(HM.box(bw, 0.2, bd, slabMat, bx, upperY - 0.2, d / 2 + bd / 2));
        const rz = d / 2 + bd - 0.05;
        g.add(HM.railing({ x1: bx - bw / 2 + 0.05, z1: rz, x2: bx + bw / 2 - 0.05, z2: rz, y: upperY, mat: railMat, spacing: 0.16 }));
        g.add(HM.railing({ x1: bx - bw / 2 + 0.05, z1: d / 2, x2: bx - bw / 2 + 0.05, z2: rz, y: upperY, mat: railMat, spacing: 0.16 }));
        g.add(HM.railing({ x1: bx + bw / 2 - 0.05, z1: d / 2, x2: bx + bw / 2 - 0.05, z2: rz, y: upperY, mat: railMat, spacing: 0.16 }));
        for (const s of [-1, 1]) {
          const br = HM.box(0.14, 0.7, bd - 0.2, slabMat, bx + s * (bw / 2 - 0.3), upperY - 0.9, d / 2 + (bd - 0.2) / 2);
          g.add(br);
        }
        ctx.add(g, 6, 'pop', tag);
        balconyDoor = !full;
      }
    }

    // ---------- windows & doors ----------
    function winFor(style, ww, wh, noShutters) {
      const t = F.trimW && style !== 'arched' ? trim : null;
      return HM.window({
        w: ww, h: wh, frame: F.frame === 'dark' ? HM.flat('#1f2123', { rough: 0.5 }) : trim, glass,
        cols: style === 'grid' ? F.gridCols || 2 : 1, rows: style === 'grid' ? 2 : 1,
        top: style === 'arched' ? 'arch' : null, trim: t, trimW: F.trimW || 0.1,
        sill: F.sill !== false, shutters: o.shutters && !noShutters && ww < 1.6 ? HM.flat(o.doorColor, { rough: 0.6 }) : null,
      });
    }
    const ws = o.windowStyle;
    const win = F.win, upWin = F.upperWin || F.win;
    // front, ground floor: leave room for the door
    const doorGap = [[doorX - 1.3, doorX + 1.3]];
    spread(-w / 2 + 0.9, w / 2 - 0.9, win.w, win.gap, doorGap).forEach((a) =>
      ctx.add(place(winFor(ws, win.w, win.h), M, 'front', a, y0 + win.sill), 4, 'pop'));
    // upper floor
    if (st === 2) {
      const U = modernUpper ? R : M;
      const ex = balconyDoor ? [[doorX - 1.3 - U.x, doorX + 1.3 - U.x]] : [];
      spread(-U.w / 2 + 0.9, U.w / 2 - 0.9, upWin.w, upWin.gap, ex).forEach((a) =>
        ctx.add(place(winFor(ws, upWin.w, upWin.h), U, 'front', a, upperY + upWin.sill), 4, 'pop'));
      if (balconyDoor) ctx.add(place(HM.door({ w: 1.5, h: 2.2, mat: trim, frame: trim, glass, lites: 2 }), M, 'front', doorX, upperY), 4, 'pop', 'balcony');
      // upper sides and back
      for (const face of ['left', 'right']) spread(-U.d / 2 + 1, U.d / 2 - 1, upWin.w, upWin.gap + 0.8).forEach((a) => ctx.add(place(winFor(ws, upWin.w, upWin.h), U, face, a, upperY + upWin.sill), 4, 'pop'));
      spread(-U.w / 2 + 1, U.w / 2 - 1, upWin.w, upWin.gap + 0.6).forEach((a) => ctx.add(place(winFor(ws, upWin.w, upWin.h), U, 'back', a, upperY + upWin.sill), 4, 'pop'));
    }
    // ground floor sides and back; wings cover part of the side walls
    const leftEx = T ? [[T.z - T.d / 2 - 0.6, T.z + T.d / 2 + 0.6]] : [];
    const rightEx = G ? [[-(G.z + G.d / 2) - 0.6, -(G.z - G.d / 2) + 0.6]] : [];
    spread(-d / 2 + 1, d / 2 - 1, win.w, win.gap + 0.8, leftEx).forEach((a) => ctx.add(place(winFor(ws, win.w, win.h), M, 'left', a, y0 + win.sill), 4, 'pop'));
    spread(-d / 2 + 1, d / 2 - 1, win.w, win.gap + 0.8, rightEx).forEach((a) => ctx.add(place(winFor(ws, win.w, win.h), M, 'right', a, y0 + win.sill), 4, 'pop'));
    spread(-w / 2 + 1, w / 2 - 1, win.w, win.gap + 0.6).forEach((a) => ctx.add(place(winFor(ws, win.w, win.h), M, 'back', a, y0 + win.sill), 4, 'pop'));
    // small attic windows in side gable ends
    if (sideGable && F.atticWindows && rise > 1.4) {
      for (const face of ['left', 'right']) {
        if (face === 'right' && G && topY < ctx.front + 3.6) continue;
        ctx.add(place(HM.window({ w: 0.9, h: 0.7, frame: trim, glass, cols: 2, trim: F.trimW ? trim : null }), { ...R, w: R.w + 0.02 }, face, 0, topY + 0.35), 4, 'pop');
      }
    }
    // front door
    const ds = o.doorStyle;
    const door = ds === 'arched' ? HM.door({ w: 1.3, h: 2.5, mat: doorMat, frame: F.frame === 'dark' ? trim : HM.flat('#d9c7a5'), top: 'arch', knob: iron })
      : ds === 'modern' ? HM.group(HM.door({ w: 1.2, h: 2.6, mat: doorMat, frame: trim, glass }), (() => { const p = HM.mesh(new THREE.PlaneGeometry(0.4, 2.5), glass); p.position.set(1.0, 1.25, 0.03); return p; })())
      : HM.door({ w: 1.05, h: 2.2, mat: doorMat, frame: trim, glass, lites: ds === 'glass' ? 3 : 0 });
    ctx.add(place(door, M, 'front', doorX, y0), 4, 'pop');

    // ---------- roof ----------
    if (!pitched) {
      if (F.parapet) {
        ctx.add(parapet(R, topY, wall), 5, 'drop');
        if (F.vigas) {
          const wood = HM.flat('#6b4a2e', { rough: 0.8 });
          const g = new THREE.Group();
          for (let x = R.x - R.w / 2 + 0.6; x < R.x + R.w / 2 - 0.3; x += 1.1) {
            const v = HM.mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.9, 8), wood);
            v.rotation.x = Math.PI / 2;
            v.position.set(x, topY - 0.35, R.z + R.d / 2 + 0.3);
            g.add(v);
          }
          ctx.add(g, 6, 'pop');
        }
      } else {
        ctx.add(HM.flatRoof({ w: R.w, d: R.d, overhang: 0.5, thick: 0.35, mat: HM.flat(o.roofColor, { rough: 0.8 }), x: R.x, y: topY, z: R.z }), 5, 'drop');
      }
    } else if (o.roofShape === 'hip') {
      ctx.add(HM.hipRoof({ w: R.w, d: R.d, pitch, overhang: F.overhang, mat: roof, trimMat: fascia, x: R.x, y: topY, z: R.z }), 5, 'drop');
    } else {
      const side = o.ridge === 'side';
      const gr = HM.gableRoof({
        w: side ? R.w : R.d, d: side ? R.d : R.w, pitch, overhang: F.overhang, thick: 0.16,
        mat: roof, wallMat: F.gableAccent ? accent : (modernUpper ? accent : wall), trimMat: fascia,
        axis: side ? 'x' : 'z', x: R.x, y: topY, z: R.z, rafters: F.rafters,
      });
      ctx.add(gr.gable, 3);
      ctx.add(gr.roof, 5, 'drop');
      if (!side && F.gableWindow && rise > 1.3) {
        ctx.add(place(winFor(ws === 'arched' ? 'arched' : 'grid', 1.2, Math.min(1.4, rise - 0.6), true), { ...R, d: R.d + 0.02 }, 'front', 0, topY + 0.3), 5, 'drop');
      }
    }

    // ---------- dormers ----------
    if (o.dormers && pitched && (o.roofShape === 'hip' || o.ridge === 'side') && F.dormer) {
      const g = new THREE.Group();
      const dRoof = roof;
      if (F.dormer === 'shed') addShedDormer(g, R.x + R.w * 0.15, Math.min(4.6, R.w * 0.4));
      else if (F.dormer === 'cross') addCrossGable(g);
      else for (const s of [-1, 1]) addGableDormer(g, R.x + s * R.w * 0.24);
      if (g.children.length) ctx.add(g, 6, 'drop', 'dormers');

      function addShedDormer(g, cx, width) {
        const zf = R.z + R.d / 2 - 1.1;
        const ySurf = topY + 1.1 * pitch;
        const top = Math.min(ySurf + 1.45, ridgeY - 0.15);
        if (top - ySurf < 1.0 || pitch < 0.2) return;
        const zb = R.z + R.d / 2 - (top - topY) / pitch;
        const box = { x: cx, z: (zf + zb) / 2, w: width, d: zf - zb };
        g.add(HM.box(width, top - topY - 0.1, zf - zb, wall, cx, topY + 0.1, box.z));
        const n = Math.max(1, Math.floor(width / 1.4));
        for (let i = 0; i < n; i++) g.add(place(HM.window({ w: 0.85, h: Math.min(0.8, top - ySurf - 0.45), frame: trim, glass, cols: 2, trim: F.trimW ? trim : null, sill: false }), box, 'front', -width / 2 + (width * (i + 0.5)) / n, ySurf + 0.25));
        const r = HM.box(width + 0.5, 0.15, zf - zb + 0.6, dRoof);
        r.position.set(cx, top + 0.05, box.z + 0.25);
        r.rotation.x = 0.1;
        g.add(r);
      }
      function addGableDormer(g, cx) {
        const zf = R.z + R.d / 2 - 0.9;
        const ySurf = topY + 0.9 * pitch;
        const top = ySurf + 1.25;
        if (top > ridgeY - 0.3 || pitch < 0.3) return;
        const zb = R.z + R.d / 2 - (top - topY) / pitch;
        const box = { x: cx, z: (zf + zb) / 2, w: 1.7, d: zf - zb };
        g.add(HM.box(1.7, top - topY - 0.1, zf - zb, wall, cx, topY + 0.1, box.z));
        g.add(place(HM.window({ w: 0.8, h: 0.85, frame: trim, glass, cols: 2, rows: 2, trim: F.trimW ? trim : null, sill: false }), box, 'front', 0, ySurf + 0.2));
        const gr = HM.gableRoof({ w: zf - zb + 0.3, d: 1.7, pitch: 1.0, overhang: 0.2, thick: 0.12, mat: dRoof, wallMat: wall, trimMat: fascia, axis: 'z', x: cx, y: top, z: box.z + 0.15 });
        g.add(gr.roof, gr.gable);
      }
      function addCrossGable(g) {
        const span = Math.min(4.4, R.w * 0.35);
        const p2 = Math.min(1.0, (rise - 0.4) / (span / 2));
        if (p2 < 0.3) return;
        const cg = HM.gableRoof({ w: 3.2, d: span, pitch: p2, overhang: 0.3, thick: 0.12, mat: dRoof, wallMat: wall, trimMat: fascia, axis: 'z', x: R.x + doorX, y: topY, z: R.z + R.d / 2 - 1.6 });
        g.add(cg.gable, cg.roof);
        if (span / 2 * p2 > 1.2) g.add(place(winFor(ws, 0.8, Math.min(0.9, span / 2 * p2 - 0.6), true), R, 'front', doorX, topY + 0.3));
      }
    }

    // ---------- chimney ----------
    if (o.chimney && F.chimney) {
      const tag = 'chimney';
      const cmat = F.chimneyMat === 'brick' ? HM.mat('brick', '#b8674f', { uv: 1.4 }) : F.chimneyMat === 'stone' ? HM.mat('stone', '#8e8373', { uv: 2.2 }) : wall;
      const cap = HM.flat(F.chimneyMat === 'wall' ? o.roofColor : '#5d5a55');
      if (F.chimney === 'metal') {
        const p = HM.mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.8, 12), HM.flat('#9aa0a6', { metal: 0.8, rough: 0.35 }));
        p.position.set(R.x - R.w * 0.3, ridgeY + 0.8, R.z - R.d * 0.2);
        ctx.add(p, 6, 'rise', tag);
      } else if (F.chimney === 'side' && !T) {
        const sides = F.twinChimneys ? [-1, 1] : [-1];
        for (const s of sides) {
          if (s > 0 && G) continue;
          const alongSide = o.ridge === 'side' || o.roofShape !== 'gable';
          const cx = s * (w / 2 + 0.5), cz = alongSide ? 0 : -d * 0.2;
          ctx.add(HM.chimney({ x: cx, z: cz, y: ctx.front, top: ridgeY + 0.9, w: 0.95, d: 1.4, mat: cmat, capMat: cap }), 6, 'rise', tag);
        }
      } else {
        const cx = R.x + R.w * 0.25, cz = R.z - R.d * 0.22;
        const surf = !pitched ? topY : ridgeY - Math.abs(cz - R.z) * pitch;
        ctx.add(HM.chimney({ x: cx, z: cz, y: topY - 0.5, top: Math.max(surf, topY) + 1.3, w: 1.0, d: 1.0, mat: cmat, capMat: cap }), 6, 'rise', tag);
      }
    }

    // ---------- front steps, walkway, driveway, mailbox, planting ----------
    const [stairs, stairEnd] = ctx.stairs(doorX, stairZ, stairW, stairTop);
    ctx.add(stairs, 6, 'rise');
    const env = ctx.env;
    const roadEdge = env.roadEdgeLocal ?? 22;
    if (roadEdge > stairEnd + 1) {
      const walk = HM.ribbon([[doorX, stairEnd], [doorX, stairEnd + 2], [doorX * 0.3, roadEdge - 1.5], [doorX * 0.3, roadEdge + 0.3]], 1.3, env.pathMat, ctx.ground, { lift: 0.1, uvScale: 1.3 });
      ctx.add(walk, 6, 'rise');
      ctx.footprints.push({ x: doorX * 0.5, z: (stairEnd + roadEdge) / 2, w: Math.abs(doorX) * 0.7 + 1.8, d: roadEdge - stairEnd + 1 });
    }
    const driveX = G ? G.x : w / 2 + 2.6;
    const driveZ0 = G ? G.z + G.d / 2 : d / 2 - 3;
    const driveW = G ? G.w - 0.3 : 3.2;
    const drive = HM.ribbon([[driveX, driveZ0], [driveX, roadEdge + 0.4]], driveW, env.driveMat, ctx.ground, { lift: 0.08, uvScale: 3 });
    ctx.add(drive, 6, 'rise', 'garage');
    ctx.footprints.push({ x: driveX, z: (driveZ0 + roadEdge) / 2, w: driveW + 0.6, d: roadEdge - driveZ0 + 1 });
    if (env.mailbox !== false) {
      const mx = driveX + driveW / 2 + 0.9, mz = roadEdge - 0.5, my = ctx.ground(mx, mz);
      ctx.add(HM.group(
        HM.box(0.1, 1.05, 0.1, HM.flat('#f0eee8'), mx, my, mz),
        HM.box(0.28, 0.3, 0.52, HM.flat(env.mailboxColor || '#2a2d31', { metal: 0.4, rough: 0.5 }), mx, my + 1.05, mz),
      ), 6, 'pop');
    }
    plantings(ctx, env, { w, d, doorX, porchRect, G });

    // soft shadow where the house meets the ground
    // (not on a walk-out lot, where the ground drops away in front)
    if (ctx.env.foundation !== 'walkout') {
      const cs = HM.contactShadow(w + (G ? G.w : 0) + 1, d + 1.5, 0.5);
      cs.position.set(G ? G.w / 2 : 0, ctx.ground(0, 0) + 0.03, 0);
      ctx.add(cs, 0, 'pop');
    }

    return { w, d, st, T, G, porch: kind !== 'none', ridgeY, topY };
  }

  // Low parapet walls around a flat roof (Pueblo / Spanish flat roofs).
  function parapet(R, y, mat) {
    const g = new THREE.Group();
    const t = 0.28, h = 0.75;
    g.add(HM.box(R.w, h, t, mat, R.x, y, R.z + R.d / 2 - t / 2));
    g.add(HM.box(R.w, h, t, mat, R.x, y, R.z - R.d / 2 + t / 2));
    g.add(HM.box(t, h, R.d, mat, R.x - R.w / 2 + t / 2, y, R.z));
    g.add(HM.box(t, h, R.d, mat, R.x + R.w / 2 - t / 2, y, R.z));
    g.add(HM.box(R.w - 0.2, 0.1, R.d - 0.2, HM.flat('#8f8a82', { rough: 0.9 }), R.x, y, R.z));
    return g;
  }

  // Foundation planting along the front, chosen by the lot's climate.
  function plantings(ctx, env, { w, d, doorX, porchRect, G }) {
    const g = new THREE.Group();
    const kind = env.shrub || 'boxwood';
    const z = (porchRect ? porchRect.z + porchRect.d / 2 : d / 2) + 0.9;
    const rnd = HM.rng(Math.round(w * 13 + d * 7));
    for (let x = -w / 2 + 0.7; x < w / 2 - 0.4; x += 1.5) {
      if (Math.abs(x - doorX) < 1.8) continue;
      const y = ctx.ground(x, z);
      const s = 0.8 + rnd() * 0.4;
      if (kind === 'boxwood' || kind === 'juniper') {
        const geo = kind === 'juniper' ? new THREE.ConeGeometry(0.45 * s, 1.4 * s, 8) : new THREE.IcosahedronGeometry(0.55 * s, 1);
        const m = HM.mesh(geo, HM.flat(kind === 'juniper' ? '#3d5a3a' : '#4e6e37', { rough: 0.95 }));
        m.position.set(x, y + (kind === 'juniper' ? 0.7 * s : 0.4 * s), z);
        m.scale.y = kind === 'juniper' ? 1 : 0.8;
        g.add(m);
      } else if (kind === 'agave') {
        for (let k = 0; k < 7; k++) {
          const leaf = HM.mesh(new THREE.ConeGeometry(0.09, 0.9 * s, 4), HM.flat('#7f9a78', { rough: 0.9 }));
          leaf.position.set(x, y + 0.35 * s, z);
          leaf.rotation.set(0.7, (k / 7) * Math.PI * 2, 0, 'YXZ');
          g.add(leaf);
        }
      } else {
        for (let k = 0; k < 6; k++) {
          const blade = HM.mesh(new THREE.ConeGeometry(0.05, 0.9 * s, 4), HM.flat('#9aa35a', { rough: 1 }));
          blade.position.set(x + (rnd() - 0.5) * 0.4, y + 0.4 * s, z + (rnd() - 0.5) * 0.4);
          blade.rotation.set((rnd() - 0.5) * 0.6, 0, (rnd() - 0.5) * 0.6);
          g.add(blade);
        }
      }
    }
    if (g.children.length) ctx.add(g, 6, 'pop', 'landscape');
  }

  // ======================================================================
  // Styles. `defaults` are the options a style starts with; `flavor` is its
  // fixed character. Styles marked local:true only appear as neighbors.
  // ======================================================================
  const base = { accentColor: null, ridge: 'side', tower: false };
  HM.STYLES = {
    modern: {
      name: 'Modern', era: '2000s to today',
      defaults: { ...base, wallMat: 'stucco', wallColor: '#e8e6e1', accentColor: '#a36a3a', trimColor: '#1b1d1f', roofMat: 'membrane', roofColor: '#2a2c2e', doorColor: '#7a4c2a', w: 14, d: 9, stories: 2, pitch: 4, roofShape: 'flat', porch: true, garage: 1, chimney: true, dormers: false, balcony: true, windowStyle: 'plain', shutters: false, doorStyle: 'modern' },
      flavor: { storyH: 3.1, overhang: 0.5, porch: 'canopy', doorX: 0.24, upper: true, accentMat: 'slat', garageAccent: false, fascia: 'roof', win: { w: 2.2, h: 2.5, gap: 0.3, sill: 0.2 }, upperWin: { w: 2.0, h: 1.5, gap: 0.2, sill: 0.8 }, chimney: 'metal', dormer: 'shed', sill: false, gableWindow: true, frame: 'trim' },
    },
    craftsman: {
      name: 'Craftsman', era: '1905 to 1930',
      defaults: { ...base, wallMat: 'shingle', wallColor: '#7c8b67', accentColor: '#e8dcc2', trimColor: '#efe6d2', roofMat: 'asphalt', roofColor: '#57493f', doorColor: '#6b3f22', w: 13, d: 10, stories: 1, pitch: 5, roofShape: 'gable', porch: true, garage: 0, chimney: true, dormers: true, balcony: false, windowStyle: 'grid', shutters: false, doorStyle: 'glass' },
      flavor: { storyH: 3.0, overhang: 0.9, rafters: true, porch: 'gable', doorX: -0.12, trimW: 0.16, gridCols: 3, win: { w: 1.3, h: 1.5, gap: 1.2, sill: 0.8 }, dormer: 'shed', chimney: 'side', chimneyMat: 'stone', atticWindows: true, gableAccent: false, gableWindow: true },
    },
    farmhouse: {
      name: 'Colonial Farmhouse', era: '1700s roots, modern revival',
      defaults: { ...base, wallMat: 'batten', wallColor: '#f2f1ec', trimColor: '#f4f3ef', roofMat: 'seam', roofColor: '#2a2c2e', doorColor: '#23272b', w: 14, d: 9, stories: 2, pitch: 10, roofShape: 'gable', porch: true, garage: 0, chimney: true, dormers: true, balcony: false, windowStyle: 'grid', shutters: true, doorStyle: 'panel' },
      flavor: { storyH: 2.9, overhang: 0.35, porch: 'shed', porchRail: true, doorX: 0, trimW: 0.1, frame: 'dark', win: { w: 1.1, h: 1.7, gap: 1.4, sill: 0.7 }, upperWin: { w: 1.1, h: 1.5, gap: 1.4, sill: 0.6 }, dormer: 'cross', chimney: 'side', chimneyMat: 'brick', twinChimneys: true, gableWindow: true },
    },
    mediterranean: {
      name: 'Mediterranean', era: '1920s Spanish Revival',
      defaults: { ...base, wallMat: 'stucco', wallColor: '#eedfc2', trimColor: '#4a2e1d', roofMat: 'clay', roofColor: '#b4532f', doorColor: '#5a351f', w: 12, d: 10, stories: 2, pitch: 4, roofShape: 'hip', porch: true, garage: 1, chimney: true, dormers: false, balcony: true, tower: true, windowStyle: 'arched', shutters: false, doorStyle: 'arched' },
      flavor: { storyH: 2.8, overhang: 0.6, porch: 'arcade', doorX: 0, tower: true, rail: 'iron', fascia: 'wall', win: { w: 1.1, h: 1.8, gap: 1.3, sill: 0.6 }, upperWin: { w: 1.0, h: 1.7, gap: 1.4, sill: 0.5 }, chimney: 'roof', chimneyMat: 'wall', parapet: true, gableWindow: true },
    },
    // ----- neighbors only -----
    cottage: {
      name: 'Beach cottage', local: true,
      defaults: { ...base, wallMat: 'lap', wallColor: '#a9c6cf', trimColor: '#f7f6f1', roofMat: 'seam', roofColor: '#9aa3a8', doorColor: '#2c6e6a', w: 11, d: 9, stories: 1, pitch: 6, roofShape: 'hip', porch: true, garage: 0, chimney: false, dormers: false, balcony: false, windowStyle: 'grid', shutters: true, doorStyle: 'glass' },
      flavor: { storyH: 2.8, overhang: 0.6, porch: 'shed', porchRail: true, rail: 'trim', doorX: 0, trimW: 0.1, win: { w: 1.1, h: 1.5, gap: 1.3, sill: 0.8 }, dormer: 'gable', chimney: null },
    },
    chalet: {
      name: 'Mountain chalet', local: true,
      defaults: { ...base, wallMat: 'slat', wallColor: '#7a5234', trimColor: '#3a2a1e', roofMat: 'seam', roofColor: '#3b3f3a', doorColor: '#3a2a1e', w: 11, d: 10, stories: 2, pitch: 11, roofShape: 'gable', ridge: 'front', porch: false, garage: 0, chimney: true, dormers: false, balcony: true, windowStyle: 'plain', shutters: false, doorStyle: 'glass' },
      flavor: { storyH: 2.8, overhang: 1.0, porch: 'none', doorX: 0, balconyFull: true, rail: 'wood', win: { w: 1.4, h: 1.7, gap: 1.0, sill: 0.6 }, chimney: 'side', chimneyMat: 'stone', gableWindow: true },
    },
    ranch: {
      name: 'Ranch', local: true,
      defaults: { ...base, wallMat: 'brick', wallColor: '#b8674f', trimColor: '#f1efe9', roofMat: 'asphalt', roofColor: '#4b4a4c', doorColor: '#2b3f5a', w: 16, d: 9.5, stories: 1, pitch: 4, roofShape: 'hip', porch: true, garage: 2, chimney: true, dormers: false, balcony: false, windowStyle: 'grid', shutters: true, doorStyle: 'panel' },
      flavor: { storyH: 2.8, overhang: 0.6, porch: 'stoop', doorX: -0.1, trimW: 0.1, win: { w: 1.4, h: 1.4, gap: 1.4, sill: 0.9 }, chimney: 'roof', chimneyMat: 'brick' },
    },
    pueblo: {
      name: 'Pueblo Revival', local: true,
      defaults: { ...base, wallMat: 'stucco', wallColor: '#c99a70', trimColor: '#4a6a7a', roofMat: 'membrane', roofColor: '#6b5b4a', doorColor: '#4a6a7a', w: 13, d: 10, stories: 1, pitch: 3, roofShape: 'flat', porch: true, garage: 1, chimney: false, dormers: false, balcony: false, windowStyle: 'plain', shutters: false, doorStyle: 'panel' },
      flavor: { storyH: 3.0, porch: 'portal', doorX: 0, parapet: true, vigas: true, fascia: 'wall', win: { w: 1.1, h: 1.3, gap: 1.6, sill: 0.9 }, chimney: null },
    },
  };

  // Specs for the title block, worked out from the options.
  HM.planSpecs = function (styleKey, o) {
    const F = HM.STYLES[styleKey].flavor;
    let m2 = o.w * o.d * o.stories;
    if (o.tower && F.tower) m2 += 3.8 * 3.8 * (o.stories + 1);
    const sqft = Math.round((m2 * 10.764) / 10) * 10;
    const beds = Math.min(6, Math.max(1, Math.round(sqft / 700)));
    const baths = Math.max(1, Math.round((sqft / 900) * 2) / 2);
    return { sqft, beds, baths };
  };

  // Build a house. env: the lot; opts: this house's options; placeAt: world spot.
  HM.buildHouse = function (styleKey, env, opts, placeAt = { x: 0, z: 0, y: 0, rot: 0 }) {
    const S = HM.STYLES[styleKey];
    const o = { ...S.defaults, ...opts };
    const ctx = makeCtx(env, placeAt);
    const info = build(ctx, S, o);
    return { group: ctx.group, parts: ctx.parts, footprints: ctx.footprints, style: styleKey, info };
  };
})();
