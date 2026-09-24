/* The four home styles. Each builder adds pieces through ctx.add(obj, stage, kind):
     stage: build order (0 foundation, 1 ground-floor walls, 2 structure, 3 upper walls,
            4 windows & doors, 5 roofs, 6 finishing details)
     kind:  how the piece arrives in the build animation
            'rise' grows up from its base, 'drop' falls into place, 'pop' springs out.
   The foundation depends on the lot (pilings at the beach, a walk-out basement on
   the hillside...), so builders ask ctx.base() for the floor height. */
var HM = (window.HM = window.HM || {});

(function () {
  // ---------- foundation & supports (lot-aware) ----------
  const FOUNDATIONS = {
    slab: { top: 0.3 },     // desert: concrete slab poured on grade
    crawl: { top: 0.7 },    // suburban: short block wall with a crawlspace
    pilings: { top: 2.6 },  // beach: raised above flood level on wood piles
    walkout: { top: 0.9 },  // hillside: stone basement that opens downhill
  };

  function makeCtx(lot) {
    const group = new THREE.Group();
    const parts = [];
    const f = lot.foundation;
    const ctx = {
      group, parts, lot,
      y0: FOUNDATIONS[f].top,
      front: lot.frontGround, // ground height in front of the house
      add(obj, stage, kind = 'rise') {
        group.add(obj);
        parts.push({ obj, stage, kind });
        return obj;
      },
      mats: {
        concrete: HM.mat('concrete', '#b3aea6', { uv: 3 }),
        block: HM.mat('concrete', '#8f8a82', { uv: 1.2 }),
        pile: HM.mat('deck', '#6e5b48', { uv: 1.5 }),
        stone: HM.mat('stone', '#8a8173', { uv: 2.4 }),
      },
    };

    // Foundation under the given footprint rectangles; returns floor height.
    ctx.base = function (rects) {
      const g = new THREE.Group();
      const m = ctx.mats;
      const top = ctx.y0;
      for (const r of rects) {
        if (f === 'slab') g.add(HM.box(r.w + 0.3, top, r.d + 0.3, m.concrete, r.x, 0, r.z));
        if (f === 'crawl') g.add(HM.box(r.w + 0.1, top, r.d + 0.1, m.block, r.x, 0, r.z));
        if (f === 'walkout') {
          // stone basement: buried in back, exposed where the hill drops away
          g.add(HM.box(r.w + 0.3, top + 3.2, r.d + 0.3, m.stone, r.x, -3.2, r.z));
        }
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
        // walk-out basement openings facing downhill
        const r = rects[0];
        const fz = r.z + r.d / 2 + 0.17;
        const glass = HM.glass();
        const frame = HM.flat('#2a2a2a', { rough: 0.5 });
        g.add(HM.onWall(HM.window({ w: 2.4, h: 1.6, frame, glass, cols: 2, sill: false }), { face: 'front', cx: r.x, cz: fz - 0.02, w: r.w, d: 0, along: -r.w / 4, y: ctx.front + 0.5 }));
        g.add(HM.onWall(HM.window({ w: 2.0, h: 2.2, frame, glass, cols: 2, sill: false }), { face: 'front', cx: r.x, cz: fz - 0.02, w: r.w, d: 0, along: r.w / 4, y: ctx.front }));
      }
      ctx.add(g, 0, 'rise');
      return top;
    };

    // Support under a porch/deck that sticks out in front of the foundation.
    ctx.support = function (r, top) {
      const g = new THREE.Group();
      const bottom = ctx.front;
      if (f === 'slab' || f === 'crawl') {
        g.add(HM.box(r.w, top - bottom, r.d, f === 'slab' ? ctx.mats.concrete : ctx.mats.block, r.x, bottom, r.z));
      } else {
        const mat = f === 'pilings' ? ctx.mats.pile : ctx.mats.stone;
        const s = f === 'pilings' ? 0.3 : 0.55;
        const n = Math.max(2, Math.round(r.w / 2.6) + 1);
        for (let i = 0; i < n; i++) {
          const px = r.x - r.w / 2 + s / 2 + ((r.w - s) * i) / (n - 1);
          g.add(HM.box(s, top - bottom, s, mat, px, bottom, r.z + r.d / 2 - s / 2));
        }
      }
      return g;
    };

    // Front steps from the floor down to the ground in front of the house.
    ctx.stairs = function (x, z, w = 1.8, top = ctx.y0) {
      const mat = f === 'pilings' ? HM.mat('deck', '#8a7156', { uv: 1.5 }) : f === 'walkout' ? ctx.mats.stone : ctx.mats.concrete;
      const g = HM.stairs({ x, z, top, bottom: ctx.front, w, mat });
      if (top - ctx.front > 1.2) {
        // tall stair runs need handrails
        const run = ((top - ctx.front) / 0.18) * 0.3;
        const rail = HM.flat('#2e2e2e', { metal: 0.5, rough: 0.5 });
        for (const s of [-1, 1]) {
          const len = Math.hypot(run, top - ctx.front);
          const r = HM.box(0.06, 0.06, len, rail, x + (s * w) / 2, 0, 0);
          r.position.set(x + (s * w) / 2, (top + ctx.front) / 2 + 0.9, z + run / 2);
          r.rotation.x = Math.atan2(top - ctx.front, run);
          g.add(r);
          // posts every ~1.2 m, standing on the treads
          const n = Math.max(2, Math.round(run / 1.2) + 1);
          for (let i = 0; i < n; i++) {
            const f = i / (n - 1);
            const pz = z + 0.15 + f * (run - 0.3);
            const py = top - (top - ctx.front) * ((pz - z) / run);
            g.add(HM.box(0.07, 0.9, 0.07, rail, x + (s * w) / 2, py, pz));
          }
        }
      }
      return g;
    };
    return ctx;
  }

  // Shorthand: put a window/door on a wall of box b.
  function place(obj, b, face, along, y) {
    return HM.onWall(obj, { face, cx: b.x, cz: b.z, w: b.w, d: b.d, along, y });
  }

  // ======================================================================
  // MODERN: stacked boxes, flat roofs, big glass, cedar slats
  // ======================================================================
  function modern(ctx) {
    const white = HM.mat('stucco', '#e8e6e1', { uv: 3, bumpScale: 0.5 });
    const charcoal = HM.mat('stucco', '#3b3e42', { uv: 3, bumpScale: 0.5 });
    const cedar = HM.mat('slat', '#a36a3a', { uv: 1.6, bumpScale: 2 });
    const roofMat = HM.flat('#2a2c2e', { rough: 0.8 });
    const frame = HM.flat('#1b1d1f', { rough: 0.45, metal: 0.4 });
    const glass = HM.glass();
    const railGlass = HM.flat('#bcd7de', { opacity: 0.28, rough: 0.05 });

    const A = { x: -1, z: 0, w: 14, d: 9 };    // main floor
    const C = { x: 8.5, z: 0.5, w: 5, d: 8 };  // garage wing
    const y0 = ctx.base([A, C]);
    const hA = 3.2, slab = 0.3;
    const B = { x: -3.5, z: 1.4, w: 9, d: 8 }; // upper floor, cantilevered forward
    const yB = y0 + hA + slab;

    ctx.add(HM.box(A.w, hA, A.d, white, A.x, y0, A.z), 1);
    ctx.add(HM.box(C.w, 3.0, C.d, charcoal, C.x, y0, C.z), 1);
    ctx.add(HM.flatRoof({ w: A.w, d: A.d, overhang: 0.3, thick: slab, mat: roofMat, x: A.x, y: y0 + hA, z: A.z }), 2, 'drop');
    ctx.add(HM.box(B.w, 3.0, B.d, cedar, B.x, yB, B.z), 3);

    // glass wall across the living room
    [-5.5, -3.0, -0.5].forEach((a) => ctx.add(place(HM.window({ w: 2.3, h: 2.7, frame, glass, sill: false }), A, 'front', a, y0 + 0.2), 4, 'pop'));
    ctx.add(place(HM.door({ w: 1.3, h: 2.8, mat: HM.flat('#7a4c2a', { rough: 0.6 }), frame, glass }), A, 'front', 3.4, y0), 4, 'pop');
    ctx.add(place(HM.window({ w: 1.6, h: 1.6, frame, glass, sill: false }), A, 'front', 5.6, y0 + 1.0), 4, 'pop');
    ctx.add(place(HM.window({ w: 7, h: 1.5, frame, glass, cols: 4, sill: false }), B, 'front', 0, yB + 0.8), 4, 'pop');
    ctx.add(place(HM.window({ w: 3, h: 2.2, frame, glass, cols: 2, sill: false }), B, 'left', 0.8, yB + 0.4), 4, 'pop');
    ctx.add(place(HM.window({ w: 2.4, h: 2.2, frame, glass, sill: false }), A, 'left', 1, y0 + 0.5), 4, 'pop');
    [-4, 2].forEach((a) => ctx.add(place(HM.window({ w: 3, h: 2.2, frame, glass, cols: 2, sill: false }), A, 'back', a, y0 + 0.5), 4, 'pop'));
    ctx.add(place(HM.window({ w: 5, h: 1.4, frame, glass, cols: 3, sill: false }), B, 'back', 0, yB + 0.9), 4, 'pop');
    // garage door: horizontal-groove panel
    const garage = HM.box(4.1, 2.4, 0.1, HM.mat('lap', '#34373a', { uv: 2.4 }), 0, 0, 0);
    garage.position.set(C.x, y0 + 1.2, C.z + C.d / 2 + 0.04);
    ctx.add(garage, 4, 'pop');
    ctx.add(place(HM.window({ w: 1.2, h: 0.5, frame, glass, sill: false }), C, 'right', 0, y0 + 2.0), 4, 'pop');

    ctx.add(HM.flatRoof({ w: B.w, d: B.d, overhang: 0.55, thick: 0.35, mat: roofMat, x: B.x, y: yB + 3.0, z: B.z }), 5, 'drop');
    ctx.add(HM.flatRoof({ w: C.w, d: C.d, overhang: 0.3, thick: 0.3, mat: roofMat, x: C.x, y: y0 + 3.0, z: C.z }), 5, 'drop');
    // entry canopy
    ctx.add(HM.box(2.6, 0.18, 1.8, roofMat, 2.4, y0 + 3.0, A.d / 2 + 0.9), 5, 'drop');

    // rooftop terrace railing (glass) where the upper floor steps back
    const yr = y0 + hA + slab;
    ctx.add(HM.railing({ x1: 1.2, z1: A.d / 2 + 0.2, x2: 6.2, z2: A.d / 2 + 0.2, y: yr, mat: frame, glass: railGlass }), 6, 'pop');
    ctx.add(HM.railing({ x1: 6.2, z1: A.d / 2 + 0.2, x2: 6.2, z2: -A.d / 2, y: yr, mat: frame, glass: railGlass }), 6, 'pop');
    // concrete fin wall and long planters
    ctx.add(HM.box(0.35, y0 + 4.6 - ctx.front, 3.2, charcoal, -8.3, ctx.front, 3.0), 6, 'rise');
    for (const px of [-4.5, 0.5]) {
      const g = HM.group(HM.box(3.2, 0.5, 0.7, HM.mat('concrete', '#6c6f72', { uv: 2 }), px, ctx.front, A.d / 2 + 1.1));
      for (let i = 0; i < 9; i++) {
        const grass = HM.mesh(new THREE.ConeGeometry(0.16, 0.7 + (i % 3) * 0.15, 5), HM.flat('#6e7f43', { rough: 1 }));
        grass.position.set(px - 1.4 + i * 0.35, ctx.front + 0.8, A.d / 2 + 1.1);
        g.add(grass);
      }
      ctx.add(g, 6, 'pop');
    }
    ctx.add(ctx.stairs(2.4, A.d / 2 + 0.05, 2.2), 6, 'rise');
  }

  // ======================================================================
  // CRAFTSMAN: low gable, wide eaves with rafter tails, porch on stone piers
  // ======================================================================
  function craftsman(ctx) {
    const siding = HM.mat('shingle', '#7c8b67', { uv: 1.6 });
    const trim = HM.flat('#efe6d2', { rough: 0.6 });
    const roofMat = HM.mat('asphalt', '#57493f', { uv: 2 });
    const stone = HM.mat('stone', '#8e8373', { uv: 2.2 });
    const deck = HM.mat('deck', '#8b6b4c', { uv: 1.6 });
    const gableFill = HM.mat('batten', '#e8dcc2', { uv: 1.2 });
    const glass = HM.glass();

    const M = { x: 0, z: 0, w: 13, d: 10 };
    const P = { x: -1.5, z: 6.5, w: 8.2, d: 3 };
    const y0 = ctx.base([M]);
    const h = 3.0;

    ctx.add(HM.box(M.w, h, M.d, siding, M.x, y0, M.z), 1);
    ctx.add(HM.group(ctx.support(P, y0 - 0.15), HM.box(P.w, 0.15, P.d, deck, P.x, y0 - 0.15, P.z)), 1);

    const main = HM.gableRoof({ w: M.w, d: M.d, pitch: 0.42, overhang: 0.9, mat: roofMat, wallMat: siding, trimMat: trim, y: y0 + h, rafters: true });
    ctx.add(main.gable, 2);
    // porch: stone piers with tapered columns and a heavy beam
    const colZ = P.z + P.d / 2 - 0.4;
    for (const cx of [P.x - P.w / 2 + 0.4, P.x + P.w / 2 - 0.4]) {
      ctx.add(HM.group(
        HM.box(0.75, 1.0, 0.75, stone, cx, y0, colZ),
        HM.column({ h: 1.75, wTop: 0.32, wBottom: 0.52, mat: trim, x: cx, y: y0 + 1.0, z: colZ }),
      ), 2);
    }
    ctx.add(HM.box(P.w + 0.2, 0.32, 0.4, trim, P.x, y0 + 2.6, colZ), 2, 'drop');

    const win = (w, hh, extra = {}) => HM.window({ w, h: hh, frame: trim, glass, cols: 3, rows: 2, trim, trimW: 0.16, ...extra });
    ctx.add(place(win(1.3, 1.5), M, 'front', -4.3, y0 + 0.8), 4, 'pop');
    ctx.add(place(HM.door({ w: 1.05, h: 2.2, mat: HM.flat('#6b3f22', { rough: 0.55 }), frame: trim, glass, lites: 3 }), M, 'front', -1.5, y0), 4, 'pop');
    ctx.add(place(win(1.3, 1.5), M, 'front', 1.2, y0 + 0.8), 4, 'pop');
    ctx.add(place(win(1.2, 1.5), M, 'front', 4.2, y0 + 0.8), 4, 'pop');
    ctx.add(place(win(1.2, 1.5), M, 'front', 5.6, y0 + 0.8), 4, 'pop');
    [-2.5, 2.5].forEach((a) => {
      ctx.add(place(win(1.2, 1.4), M, 'left', a, y0 + 0.9), 4, 'pop');
      ctx.add(place(win(1.2, 1.4), M, 'right', a, y0 + 0.9), 4, 'pop');
    });
    [-4, 0, 4].forEach((a) => ctx.add(place(win(1.2, 1.4), M, 'back', a, y0 + 0.9), 4, 'pop'));
    // attic windows in the gable ends
    ctx.add(place(HM.window({ w: 0.9, h: 0.7, frame: trim, glass, cols: 2, trim }), { ...M, w: M.w + 0.02 }, 'left', 0, y0 + h + 0.4), 4, 'pop');
    ctx.add(place(HM.window({ w: 0.9, h: 0.7, frame: trim, glass, cols: 2, trim }), { ...M, w: M.w + 0.02 }, 'right', 0, y0 + h + 0.4), 4, 'pop');

    ctx.add(main.roof, 5, 'drop');
    // front-facing porch gable
    const porch = HM.gableRoof({ w: 3.6, d: P.w + 0.2, pitch: 0.45, overhang: 0.45, mat: roofMat, wallMat: gableFill, trimMat: trim, axis: 'z', x: P.x, y: y0 + 2.95, z: P.z - 0.1, rafters: true });
    ctx.add(HM.group(porch.roof, porch.gable), 5, 'drop');
    // shed dormer on the front slope
    const dz = 2.0, dy = y0 + h + 0.25;
    const dormer = HM.group(HM.box(4.6, 1.6, 3.0, siding, 3.2, dy, dz));
    const dm = { x: 3.2, z: dz, w: 4.6, d: 3.0 };
    [-1.3, 0, 1.3].forEach((a) => dormer.add(place(HM.window({ w: 0.9, h: 0.75, frame: trim, glass, cols: 2, trim, sill: false }), dm, 'front', a, dy + 0.5)));
    const dRoof = HM.box(5.4, 0.16, 3.8, roofMat, 3.2, 0, dz + 0.1);
    dRoof.position.y = dy + 1.72;
    dRoof.rotation.x = 0.12;
    dormer.add(dRoof);
    ctx.add(dormer, 6, 'drop');
    // river-rock chimney on the side wall
    ctx.add(HM.chimney({ x: -M.w / 2 - 0.55, z: -1.5, y: ctx.front, top: y0 + h + 3.4, w: 1.1, d: 1.5, mat: stone, capMat: HM.flat('#6e675d') }), 6, 'rise');
    ctx.add(ctx.stairs(P.x, P.z + P.d / 2, 2.0, y0 - 0.15), 6, 'rise');
    ctx.add(HM.planter({ x: P.x - 1.6, z: P.z + P.d / 2 + 0.6, y: ctx.front, size: 0.6, leafColor: '#50683c' }), 6, 'pop');
    ctx.add(HM.planter({ x: P.x + 1.6, z: P.z + P.d / 2 + 0.6, y: ctx.front, size: 0.6, leafColor: '#50683c' }), 6, 'pop');
  }

  // ======================================================================
  // COLONIAL FARMHOUSE: symmetrical two-story, steep metal roof, full porch
  // ======================================================================
  function farmhouse(ctx) {
    const siding = HM.mat('batten', '#f2f1ec', { uv: 2 });
    const roofMat = HM.mat('seam', '#2a2c2e', { uv: 2.7, rough: 0.4, metal: 0.55, bumpScale: 0.8 });
    const black = HM.flat('#1e2022', { rough: 0.5 });
    const white = HM.flat('#f4f3ef', { rough: 0.6 });
    const deck = HM.mat('deck', '#9a7a58', { uv: 1.6 });
    const brick = HM.mat('brick', '#8f4a35', { uv: 1.4 });
    const glass = HM.glass();

    const M = { x: 0, z: 0, w: 14, d: 9 };
    const P = { x: 0, z: 5.8, w: 14, d: 2.6 };
    const y0 = ctx.base([M]);
    const h = 5.8;

    ctx.add(HM.box(M.w, h, M.d, siding, M.x, y0, M.z), 1);
    ctx.add(HM.group(ctx.support(P, y0 - 0.15), HM.box(P.w, 0.15, P.d, deck, P.x, y0 - 0.15, P.z)), 1);
    const main = HM.gableRoof({ w: M.w, d: M.d, pitch: 0.83, overhang: 0.35, thick: 0.12, mat: roofMat, wallMat: siding, trimMat: white, y: y0 + h });
    ctx.add(main.gable, 2);
    const postZ = P.z + P.d / 2 - 0.2;
    const posts = HM.group();
    [-6.8, -4.1, -1.4, 1.4, 4.1, 6.8].forEach((px) => posts.add(HM.box(0.22, 2.75, 0.22, black, px, y0, postZ)));
    posts.add(HM.box(P.w + 0.2, 0.28, 0.3, white, 0, y0 + 2.62, postZ));
    ctx.add(posts, 2);

    const win = (hh) => HM.window({ w: 1.1, h: hh, frame: black, glass, cols: 2, rows: 2, trim: white, trimW: 0.1, shutters: black });
    [-5, -2.4, 2.4, 5].forEach((a) => {
      ctx.add(place(win(1.7), M, 'front', a, y0 + 0.7), 4, 'pop');
      ctx.add(place(win(1.5), M, 'front', a, y0 + 3.5), 4, 'pop');
    });
    ctx.add(place(HM.window({ w: 1.0, h: 1.5, frame: black, glass, cols: 2, rows: 2, trim: white, trimW: 0.1 }), M, 'front', 0, y0 + 3.5), 4, 'pop');
    ctx.add(place(HM.door({ w: 1.15, h: 2.3, mat: HM.flat('#23272b', { rough: 0.4 }), frame: white, glass }), M, 'front', 0, y0), 4, 'pop');
    [-2, 2].forEach((a) => {
      for (const face of ['left', 'right']) {
        ctx.add(place(HM.window({ w: 1.0, h: 1.5, frame: black, glass, cols: 2, rows: 2, trim: white, trimW: 0.1 }), M, face, a, y0 + 0.8), 4, 'pop');
        ctx.add(place(HM.window({ w: 1.0, h: 1.4, frame: black, glass, cols: 2, rows: 2, trim: white, trimW: 0.1 }), M, face, a, y0 + 3.6), 4, 'pop');
      }
    });
    [-4.5, 0, 4.5].forEach((a) => {
      ctx.add(place(win(1.6), M, 'back', a, y0 + 0.8), 4, 'pop');
      ctx.add(place(win(1.4), M, 'back', a, y0 + 3.6), 4, 'pop');
    });

    ctx.add(main.roof, 5, 'drop');
    // center cross gable facing the street, with a small window
    const cg = HM.gableRoof({ w: 3.2, d: 4.4, pitch: 1.0, overhang: 0.3, thick: 0.12, mat: roofMat, wallMat: siding, trimMat: white, axis: 'z', x: 0, y: y0 + h, z: M.d / 2 - 1.6 });
    const cgWin = place(HM.window({ w: 0.8, h: 0.9, frame: black, glass, cols: 2, rows: 2, trim: white, trimW: 0.08, sill: false }), M, 'front', 0, y0 + h + 0.35);
    ctx.add(HM.group(cg.gable, cg.roof, cgWin), 5, 'drop');
    // porch shed roof sloping away from the wall
    const pr = HM.box(P.w + 0.5, 0.12, P.d + 0.55, roofMat, 0, 0, 0);
    pr.position.set(0, y0 + 3.12, P.z + 0.2);
    pr.rotation.x = 0.16;
    ctx.add(pr, 5, 'drop');
    // brick chimneys at both gable ends (a Colonial signature)
    for (const s of [-1, 1]) {
      ctx.add(HM.chimney({ x: s * (M.w / 2 + 0.45), z: 0, y: ctx.front, top: y0 + h + 4.7, w: 0.9, d: 1.4, mat: brick, capMat: HM.flat('#5d5a55') }), 6, 'rise');
    }
    ctx.add(HM.railing({ x1: -6.8, z1: postZ, x2: -1.4, z2: postZ, y: y0, h: 0.9, mat: white }), 6, 'pop');
    ctx.add(HM.railing({ x1: 1.4, z1: postZ, x2: 6.8, z2: postZ, y: y0, h: 0.9, mat: white }), 6, 'pop');
    ctx.add(ctx.stairs(0, P.z + P.d / 2, 2.4, y0 - 0.15), 6, 'rise');
    for (const s of [-1, 1]) {
      const lamp = HM.box(0.22, 0.4, 0.22, HM.flat('#1a1a1a', { emissive: '#ffcf8a', emissiveIntensity: 0.25 }), s * 1.0, y0 + 1.9, M.d / 2 + 0.12);
      ctx.add(lamp, 6, 'pop');
      ctx.add(HM.planter({ x: s * 2.0, z: P.z + P.d / 2 + 0.5, y: ctx.front, size: 0.55, leafColor: '#4c6a3d' }), 6, 'pop');
    }
  }

  // ======================================================================
  // MEDITERRANEAN: stucco, clay tile hip roofs, arches, a tower
  // ======================================================================
  function mediterranean(ctx) {
    const stucco = HM.mat('stucco', '#eedfc2', { uv: 3, bumpScale: 0.5 });
    const clay = HM.mat('clay', '#b4532f', { uv: 1.8, rough: 0.7, bumpScale: 2.5 });
    const wood = HM.flat('#4a2e1d', { rough: 0.6 });
    const iron = HM.flat('#1d1d1d', { rough: 0.5, metal: 0.6 });
    const eave = HM.flat('#e2cfaa', { rough: 0.8 });
    const tile = HM.mat('concrete', '#b98361', { uv: 0.8 });
    const glass = HM.glass();

    const M = { x: 0.5, z: -0.5, w: 12, d: 10 };
    const T = { x: -7.4, z: 1.6, w: 3.8, d: 3.8 };
    const W = { x: 9.25, z: 0, w: 5.5, d: 8 };
    const L = { x: 0.5, z: 5.4, w: 9, d: 1.8 }; // loggia in front of the main block
    const y0 = ctx.base([M, T, W]);
    const hM = 5.6, hT = 8.4, hW = 3.3;

    ctx.add(HM.box(M.w, hM, M.d, stucco, M.x, y0, M.z), 1);
    ctx.add(HM.box(W.w, hW, W.d, stucco, W.x, y0, W.z), 1);
    ctx.add(HM.group(ctx.support(L, y0 - 0.15), HM.box(L.w, 0.15, L.d, tile, L.x, y0 - 0.15, L.z)), 1);
    // arcade: three round arches carrying a balcony
    const arcade = new THREE.Group();
    const bw = L.w / 3, R = (bw - 0.7) / 2, H = 3.0, yc = 2.55 - R;
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Shape();
      s.moveTo(-bw / 2, 0); s.lineTo(-R, 0); s.lineTo(-R, yc);
      s.absarc(0, yc, R, Math.PI, 0, true);
      s.lineTo(R, 0); s.lineTo(bw / 2, 0); s.lineTo(bw / 2, H); s.lineTo(-bw / 2, H); s.lineTo(-bw / 2, 0);
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.45, bevelEnabled: false });
      HM.worldUV(geo, 3);
      const m = HM.mesh(geo, stucco);
      m.position.set(L.x - L.w / 2 + bw * (i + 0.5), y0, L.z + L.d / 2 - 0.45);
      arcade.add(m);
    }
    arcade.add(HM.box(L.w + 0.1, 0.3, L.d + 0.1, stucco, L.x, y0 + H, L.z));
    ctx.add(arcade, 2);
    ctx.add(HM.box(T.w, hT, T.d, stucco, T.x, y0, T.z), 3);

    const arch = (w, hh, extra = {}) => HM.window({ w, h: hh, frame: wood, glass, top: 'arch', trim: null, sill: true, ...extra });
    ctx.add(place(HM.door({ w: 1.4, h: 2.6, mat: HM.flat('#5a351f', { rough: 0.6 }), frame: HM.flat('#d9c7a5'), top: 'arch', knob: iron }), M, 'front', 0, y0), 4, 'pop');
    [-3.2, 3.2].forEach((a) => ctx.add(place(arch(1.1, 1.9), M, 'front', a, y0 + 0.6), 4, 'pop'));
    [-3.2, 0, 3.2].forEach((a) => ctx.add(place(arch(1.1, 2.2, { sill: false }), M, 'front', a, y0 + 3.35), 4, 'pop'));
    ctx.add(place(arch(0.9, 1.7), T, 'front', 0, y0 + 5.4), 4, 'pop');
    ctx.add(place(arch(0.8, 1.4), T, 'front', 0, y0 + 1.6), 4, 'pop');
    ctx.add(place(arch(0.8, 1.4), T, 'left', 0, y0 + 5.4), 4, 'pop');
    ctx.add(place(arch(2.4, 2.1, { }), W, 'front', 0, y0 + 0.6), 4, 'pop');
    ctx.add(place(arch(1.0, 1.6), W, 'right', -1.8, y0 + 0.7), 4, 'pop');
    ctx.add(place(arch(1.0, 1.6), W, 'right', 1.8, y0 + 0.7), 4, 'pop');
    [-3, 0, 3].forEach((a) => {
      ctx.add(place(arch(1.0, 1.7), M, 'back', a, y0 + 0.8), 4, 'pop');
      ctx.add(place(arch(1.0, 1.6), M, 'back', a, y0 + 3.5), 4, 'pop');
    });

    ctx.add(HM.hipRoof({ w: M.w, d: M.d, pitch: 0.33, overhang: 0.6, mat: clay, trimMat: eave, x: M.x, y: y0 + hM, z: M.z }), 5, 'drop');
    ctx.add(HM.hipRoof({ w: W.w, d: W.d, pitch: 0.33, overhang: 0.5, mat: clay, trimMat: eave, x: W.x, y: y0 + hW, z: W.z }), 5, 'drop');
    ctx.add(HM.hipRoof({ w: T.w, d: T.d, pitch: 0.55, overhang: 0.5, mat: clay, trimMat: eave, x: T.x, y: y0 + hT, z: T.z }), 5, 'drop');

    // wrought-iron balcony rail on top of the arcade
    const by = y0 + H + 0.3;
    ctx.add(HM.group(
      HM.railing({ x1: L.x - L.w / 2 + 0.1, z1: L.z + L.d / 2 - 0.05, x2: L.x + L.w / 2 - 0.1, z2: L.z + L.d / 2 - 0.05, y: by, mat: iron, spacing: 0.18 }),
      HM.railing({ x1: L.x + L.w / 2 - 0.05, z1: L.z + L.d / 2, x2: L.x + L.w / 2 - 0.05, z2: M.z + M.d / 2, y: by, mat: iron, spacing: 0.18 }),
      HM.railing({ x1: L.x - L.w / 2 + 0.05, z1: L.z + L.d / 2, x2: L.x - L.w / 2 + 0.05, z2: M.z + M.d / 2, y: by, mat: iron, spacing: 0.18 }),
    ), 6, 'pop');
    // Juliet balcony on the tower
    ctx.add(HM.group(
      HM.box(1.5, 0.12, 0.6, stucco, T.x, y0 + 5.25, T.z + T.d / 2 + 0.3),
      HM.railing({ x1: T.x - 0.7, z1: T.z + T.d / 2 + 0.55, x2: T.x + 0.7, z2: T.z + T.d / 2 + 0.55, y: y0 + 5.37, h: 0.8, mat: iron, spacing: 0.16 }),
    ), 6, 'pop');
    ctx.add(HM.chimney({ x: M.x + 3.5, z: M.z - 2.5, y: y0 + hM - 0.5, top: y0 + hM + 2.6, w: 1.0, d: 1.0, mat: stucco, capMat: clay }), 6, 'rise');
    ctx.add(ctx.stairs(L.x, L.z + L.d / 2, 2.6, y0 - 0.15), 6, 'rise');
    for (const s of [-1, 1]) {
      ctx.add(HM.planter({ x: L.x + s * 3.3, z: L.z + L.d / 2 + 0.7, y: ctx.front, size: 0.75, leafColor: '#56703f' }), 6, 'pop');
      ctx.add(HM.planter({ x: L.x + s * 5.4, z: L.z + L.d / 2 + 0.9, y: ctx.front, size: 0.8, leafColor: '#2f4a2a', tall: true }), 6, 'pop');
    }
  }

  // Specs shown in the title block. These describe a typical example of each
  // style, not a real listing.
  HM.STYLES = {
    modern: {
      name: 'Modern', build: modern,
      era: '2000s to today', stories: '2', plan: '4 bd · 3.5 ba · 3,450 sq ft',
      roof: 'Flat, ¼:12 drainage slope', exterior: 'Smooth stucco, cedar slats, floor-to-ceiling glass',
    },
    craftsman: {
      name: 'Craftsman', build: craftsman,
      era: '1905 to 1930', stories: '1½', plan: '3 bd · 2 ba · 2,100 sq ft',
      roof: 'Low gable, 5:12, exposed rafter tails', exterior: 'Cedar shakes, river-rock piers, tapered columns',
    },
    farmhouse: {
      name: 'Colonial Farmhouse', build: farmhouse,
      era: '1700s roots, modern revival', stories: '2', plan: '4 bd · 3 ba · 2,900 sq ft',
      roof: 'Steep gable, 10:12 standing-seam metal', exterior: 'Board-and-batten, black shutters, full-width porch',
    },
    mediterranean: {
      name: 'Mediterranean', build: mediterranean,
      era: '1920s Spanish Revival', stories: '2 + tower', plan: '4 bd · 3.5 ba · 3,200 sq ft',
      roof: 'Low hip, 4:12 clay barrel tile', exterior: 'Smooth stucco, arched openings, wrought iron',
    },
  };

  // Build a house of the given style for the given lot.
  HM.buildHouse = function (styleKey, lot) {
    const ctx = makeCtx(lot);
    HM.STYLES[styleKey].build(ctx);
    return { group: ctx.group, parts: ctx.parts, style: styleKey };
  };
})();
