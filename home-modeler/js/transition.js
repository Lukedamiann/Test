/* The style-switch animation, in three overlapping acts:
     1. Teardown   the old house's pieces lift, spin and shrink away, roof first
     2. Blueprint  glowing lines trace the new house's outline, stage by stage,
                   over a survey grid on the ground
     3. Assembly   solid pieces arrive in build order: foundation rises, walls
                   grow up, windows pop in, roofs drop and bounce, details last
   A new switch can interrupt at any time; whatever is half-built tears down. */
var HM = (window.HM = window.HM || {});

(function () {
  const E = HM.ease;
  const STAGES = 7;

  // ---------- dust puffs ----------
  class Dust {
    constructor(scene) {
      this.n = 500;
      const g = new THREE.BufferGeometry();
      this.pos = new Float32Array(this.n * 3);
      this.alpha = new Float32Array(this.n);
      this.size = new Float32Array(this.n);
      this.vel = new Float32Array(this.n * 3);
      this.life = new Float32Array(this.n);
      this.max = new Float32Array(this.n);
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
      g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
      this.color = new THREE.Color('#d8cbb4');
      this.mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { map: { value: HM.softSprite() }, color: { value: this.color }, scale: { value: 300 } },
        vertexShader: `
          attribute float alpha; attribute float size; varying float vA; uniform float scale;
          void main() {
            vA = alpha;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * scale / -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform sampler2D map; uniform vec3 color; varying float vA;
          void main() {
            float a = texture2D(map, gl_PointCoord).a * vA;
            if (a < 0.01) discard;
            gl_FragColor = vec4(color, a);
            #include <colorspace_fragment>
          }`,
      });
      this.points = new THREE.Points(g, this.mat);
      this.points.frustumCulled = false;
      this.points.renderOrder = 5;
      scene.add(this.points);
      this.next = 0;
    }
    // Spawn a ring of dust around the base of a footprint box.
    burst(box, y, count = 120, strength = 1) {
      const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
      const hw = (box.max.x - box.min.x) / 2 + 0.5, hd = (box.max.z - box.min.z) / 2 + 0.5;
      for (let k = 0; k < count; k++) {
        const i = this.next++ % this.n;
        const edge = Math.random() * 4;
        let x, z;
        if (edge < 1) { x = cx - hw + Math.random() * hw * 2; z = cz + hd; }
        else if (edge < 2) { x = cx - hw + Math.random() * hw * 2; z = cz - hd; }
        else if (edge < 3) { x = cx + hw; z = cz - hd + Math.random() * hd * 2; }
        else { x = cx - hw; z = cz - hd + Math.random() * hd * 2; }
        this.pos.set([x, y + Math.random() * 0.6, z], i * 3);
        const ox = x - cx, oz = z - cz, len = Math.hypot(ox, oz) || 1;
        this.vel.set([(ox / len) * (1 + Math.random() * 2.5) * strength, (0.4 + Math.random() * 1.2) * strength, (oz / len) * (1 + Math.random() * 2.5) * strength], i * 3);
        this.max[i] = this.life[i] = 1.2 + Math.random() * 1.4;
        this.size[i] = 1.5 + Math.random() * 2.5;
      }
    }
    update(dt) {
      for (let i = 0; i < this.n; i++) {
        if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
        this.life[i] -= dt;
        const k = i * 3;
        this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
        this.vel[k] *= 0.96; this.vel[k + 1] *= 0.96; this.vel[k + 2] *= 0.96;
        const t = 1 - this.life[i] / this.max[i];
        this.alpha[i] = Math.sin(Math.min(t, 1) * Math.PI) * 0.45;
        this.size[i] += dt * 1.8;
      }
      const a = this.points.geometry.attributes;
      a.position.needsUpdate = a.alpha.needsUpdate = a.size.needsUpdate = true;
    }
  }

  // ---------- the director ----------
  HM.Transition = class {
    constructor(scene, renderer) {
      this.scene = scene;
      this.renderer = renderer;
      this.clock = 0;
      this.current = null;   // house being built / standing
      this.leaving = [];     // houses tearing down
      this.dust = new Dust(scene);
      this.grid = new THREE.GridHelper(64, 64, '#9fd4ff', '#5aa9ff');
      this.grid.material.transparent = true;
      this.grid.material.opacity = 0;
      this.grid.material.depthWrite = false;
      this.grid.material.toneMapped = false;
      this.grid.renderOrder = 4;
      this.grid.position.y = 0.04; // every lot's building pad sits at height 0
      scene.add(this.grid);
      this.gridAnim = null;
    }

    // Turn a freshly built house into animatable pieces, with blueprint lines
    // when the full build animation will play.
    prepare(house, withLines = true) {
      const root = house.group;
      root.updateMatrixWorld(true);
      const bp = new THREE.Group();
      bp.renderOrder = 6;
      house.box = new THREE.Box3();
      const tmp = new THREE.Box3();
      for (const p of house.parts) {
        tmp.setFromObject(p.obj);
        house.box.union(tmp);
        const pivot = new THREE.Group();
        pivot.position.set((tmp.min.x + tmp.max.x) / 2, tmp.min.y, (tmp.min.z + tmp.max.z) / 2);
        root.remove(p.obj);
        p.obj.position.sub(pivot.position);
        pivot.add(p.obj);
        root.add(pivot);
        p.pivot = pivot;
        p.base = pivot.position.clone();
        p.cx = pivot.position.x;
        // blueprint: an outline of every mesh in the piece, in final position
        p.lineMat = new THREE.LineBasicMaterial({ color: '#8fd0ff', transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
        p.lines = [];
        if (withLines) p.obj.traverse((m) => {
          if (!m.isMesh) return;
          const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 28), p.lineMat);
          l.matrixAutoUpdate = false;
          l.matrix.copy(m.matrixWorld);
          l.userData.count = l.geometry.attributes.position.count;
          l.geometry.setDrawRange(0, 0);
          l.renderOrder = 6;
          bp.add(l);
          p.lines.push(l);
        });
      }
      root.add(bp);
      house.blueprint = bp;
      return house;
    }

    // Show a new house.
    //   withTeardown  animate the old house away first (style switches)
    //   instant       swap with no animation (live edits while dragging)
    //   animateTags   swap instantly, but animate pieces with these tags in
    //                 (e.g. ['garage'] when the garage is switched on)
    show(house, { withTeardown = true, instant = false, animateTags = null } = {}) {
      const quick = instant || !!animateTags;
      this.prepare(house, !quick);
      if (quick) withTeardown = false;
      const t0 = this.clock;
      // Anything already leaving goes immediately; the current house starts leaving.
      this.leaving.forEach((h) => this.dispose(h));
      this.leaving = [];
      if (this.current) {
        if (withTeardown && !instant) this.teardown(this.current, t0);
        else this.dispose(this.current);
      }
      this.current = house;
      this.scene.add(house.group);

      if (quick) {
        house.blueprint.visible = false;
        const tagged = house.parts.filter((p) => animateTags && animateTags.includes(p.tag)).sort((a, b) => a.stage - b.stage || a.cx - b.cx);
        house.parts.forEach((p) => { p.start = -1; p.dur = 0.001; p.lineStart = -10; });
        tagged.forEach((p, i) => {
          p.start = t0 + p.stage * 0.1 + i * 0.05;
          p.dur = p.kind === 'drop' ? 0.7 : p.kind === 'pop' ? 0.45 : 0.55;
          p.pivot.visible = false;
        });
        if (tagged.length) {
          const box = new THREE.Box3();
          tagged.forEach((p) => box.expandByObject(p.pivot));
          this.dust.burst(box, Math.max(box.min.y, 0) + 0.1, 50, 0.5);
        }
        this.pendingDust = [];
        return;
      }

      const tBlue = t0 + (this.leaving.length ? 0.55 : 0.05);
      const tBuild = tBlue + 1.0;
      this.gridAnim = { start: tBlue, end: tBuild + STAGES * 0.36 + 0.8 };

      // Group by stage, sweep left-to-right inside each stage.
      for (let s = 0; s < STAGES; s++) {
        const inStage = house.parts.filter((p) => p.stage === s).sort((a, b) => a.cx - b.cx);
        inStage.forEach((p, i) => {
          const stagger = Math.min(i * 0.04, 0.45);
          p.lineStart = tBlue + s * 0.11 + stagger * 0.5;
          p.start = tBuild + s * 0.36 + stagger;
          p.dur = p.kind === 'drop' ? 0.75 : p.kind === 'pop' ? 0.45 : 0.6;
          p.pivot.visible = false;
        });
      }
      this.pendingDust = [
        { at: tBuild + 0.1, y: house.box.min.y + 0.1, count: 90, strength: 0.7, fired: false },
        { at: tBuild + 5 * 0.36 + 0.5, y: 0.1, count: 70, strength: 0.5, fired: false },
      ];
    }

    teardown(house, t0) {
      house.blueprint.visible = false;
      const maxStage = STAGES - 1;
      house.parts.forEach((p) => {
        p.outStart = t0 + (maxStage - p.stage) * 0.06 + Math.random() * 0.12;
        p.outDur = 0.45;
        p.s0 = p.pivot.visible ? p.pivot.scale.clone() : new THREE.Vector3(0, 0, 0);
        p.y0 = p.pivot.position.y;
        p.spin = (Math.random() - 0.5) * 1.6;
      });
      house.leaveEnd = t0 + maxStage * 0.06 + 0.7;
      this.leaving.push(house);
      if (house.box) this.dust.burst(house.box, Math.max(0.1, house.box.min.y + 0.2), 140, 1.1);
    }

    dispose(house) {
      this.scene.remove(house.group);
      // Geometries belong to this house; materials are shared and cached.
      house.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.isLineSegments || (o.material && o.material.userData.own)) o.material.dispose();
      });
    }

    get busy() {
      if (this.leaving.length) return true;
      const h = this.current;
      return !!h && h.parts.some((p) => this.clock < p.start + p.dur + 0.6);
    }

    update(dt) {
      this.clock += dt;
      const t = this.clock;
      this.dust.update(dt);

      // Act 1: teardown
      this.leaving = this.leaving.filter((h) => {
        for (const p of h.parts) {
          const e = HM.clamp01((t - p.outStart) / p.outDur);
          if (e <= 0) continue;
          const k = 1 - E.inCubic(e);
          p.pivot.scale.set(Math.max(1e-3, p.s0.x * k), Math.max(1e-3, p.s0.y * k), Math.max(1e-3, p.s0.z * k));
          p.pivot.position.y = p.y0 + E.outCubic(e) * 1.6;
          p.pivot.rotation.y = p.spin * e;
          if (e >= 1) p.pivot.visible = false;
        }
        if (t > h.leaveEnd) { this.dispose(h); return false; }
        return true;
      });

      // Survey grid fades in under the blueprint, out after the build.
      if (this.gridAnim) {
        const g = this.gridAnim;
        const a = HM.smooth(g.start, g.start + 0.4, t) * (1 - HM.smooth(g.end - 0.6, g.end, t));
        this.grid.material.opacity = a * 0.45;
        if (t > g.end) this.gridAnim = null;
      }

      const h = this.current;
      if (!h) return;
      for (const d of this.pendingDust || []) {
        if (!d.fired && t >= d.at) { d.fired = true; this.dust.burst(h.box, d.y, d.count, d.strength); }
      }
      // Acts 2 and 3: blueprint lines and assembly
      for (const p of h.parts) {
        const q = HM.clamp01((t - p.lineStart) / 0.6);
        const end = p.start + p.dur;
        const fade = 1 - HM.clamp01((t - end) / 0.6);
        p.lineMat.opacity = Math.min(1, q * 1.6) * fade * 0.9;
        if (q < 1) for (const l of p.lines) l.geometry.setDrawRange(0, Math.floor((l.userData.count * E.outCubic(q)) / 2) * 2);
        else if (!p.linesFull) { p.linesFull = true; for (const l of p.lines) l.geometry.setDrawRange(0, Infinity); }
        const e = HM.clamp01((t - p.start) / p.dur);
        const pv = p.pivot;
        if (e <= 0) { pv.visible = false; continue; }
        pv.visible = true;
        if (p.kind === 'rise') {
          pv.scale.set(1, Math.max(1e-3, E.outBack(e, 0.9)), 1);
        } else if (p.kind === 'pop') {
          pv.scale.setScalar(Math.max(1e-3, E.outBack(e, 2.4)));
        } else if (p.kind === 'drop') {
          pv.position.y = p.base.y + (1 - E.outBounce(e)) * 7;
        }
        if (e >= 1 && !p.settled) {
          p.settled = true;
          pv.scale.set(1, 1, 1);
          pv.position.copy(p.base);
        }
      }
      if (h.parts.every((p) => t > p.start + p.dur + 0.6)) h.blueprint.visible = false;
    }
  };
})();
