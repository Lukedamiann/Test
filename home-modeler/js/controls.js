/* Orbit camera: drag to circle the house, scroll or pinch to zoom, arrow keys
   to turn. It drifts slowly around the house after a few idle seconds. */
var HM = (window.HM = window.HM || {});

(function () {
  HM.Orbit = class {
    constructor(camera, el, { target, distance = 34, theta = 0.55, phi = 1.2, reduceMotion = false }) {
      this.camera = camera;
      this.el = el;
      this.target = target.clone();
      this.goal = { theta, phi, distance };
      this.cur = { theta, phi, distance };
      this.limits = { phiMin: 0.35, phiMax: 1.5, dMin: 16, dMax: 80 };
      this.idle = 0;
      this.reduceMotion = reduceMotion;
      this.pointers = new Map();
      this.pinch = 0;

      el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.idle = 0;
      });
      el.addEventListener('pointermove', (e) => {
        const p = this.pointers.get(e.pointerId);
        if (!p) return;
        if (this.pointers.size === 1) {
          this.goal.theta -= (e.clientX - p.x) * 0.006;
          this.goal.phi -= (e.clientY - p.y) * 0.005;
        } else if (this.pointers.size === 2) {
          const [a, b] = [...this.pointers.values()];
          const before = Math.hypot(a.x - b.x, a.y - b.y);
          p.x = e.clientX; p.y = e.clientY;
          const after = Math.hypot(a.x - b.x, a.y - b.y);
          if (before > 0) this.goal.distance *= before / after;
        }
        p.x = e.clientX; p.y = e.clientY;
        this.idle = 0;
        this.clamp();
      });
      const up = (e) => this.pointers.delete(e.pointerId);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.goal.distance *= Math.exp(e.deltaY * 0.001);
        this.idle = 0;
        this.clamp();
      }, { passive: false });
      window.addEventListener('keydown', (e) => {
        if (e.target.closest && e.target.closest('input, textarea')) return;
        const step = { ArrowLeft: [0.15, 0], ArrowRight: [-0.15, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] }[e.key];
        if (!step) return;
        e.preventDefault();
        this.goal.theta += step[0];
        this.goal.phi += step[1];
        this.idle = 0;
        this.clamp();
      });
    }

    clamp() {
      const L = this.limits, g = this.goal;
      g.phi = Math.min(L.phiMax, Math.max(L.phiMin, g.phi));
      g.distance = Math.min(L.dMax, Math.max(L.dMin, g.distance));
    }

    // Glide to a new framing (used when switching lots).
    frame({ target, distance, phi }) {
      if (target) this.target.copy(target);
      if (distance) this.goal.distance = distance;
      if (phi) this.goal.phi = phi;
      this.clamp();
    }

    update(dt) {
      this.idle += dt;
      if (!this.reduceMotion && this.idle > 6 && this.pointers.size === 0) this.goal.theta += dt * 0.04;
      const k = 1 - Math.exp(-dt * 6);
      for (const key of ['theta', 'phi', 'distance']) this.cur[key] += (this.goal[key] - this.cur[key]) * k;
      const { theta, phi, distance } = this.cur;
      this.camera.position.set(
        this.target.x + distance * Math.sin(phi) * Math.sin(theta),
        this.target.y + distance * Math.cos(phi),
        this.target.z + distance * Math.sin(phi) * Math.cos(theta),
      );
      this.camera.lookAt(this.target);
    }
  };
})();
