/* Starts the app: loads three.js, sets up the renderer, lights and camera,
   wires the buttons, and runs the render loop. */
var HM = (window.HM = window.HM || {});

(function () {
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
  const statusEl = document.getElementById('status');
  const veil = document.getElementById('veil');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = { style: 'modern', lot: 'beach' };

  async function boot() {
    try {
      window.THREE = await import(THREE_URL);
    } catch (err) {
      statusEl.textContent = "Couldn't load the 3D engine. Check your internet connection and reload the page.";
      return;
    }
    try {
      start();
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Something went wrong drawing the scene. Reload the page to try again.';
    }
  }

  function start() {
    const canvas = document.getElementById('scene');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 9000);

    const hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
    const sun = new THREE.DirectionalLight('#ffffff', 3);
    sun.castShadow = true;
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 10, far: 400 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(hemi, sun, sun.target);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const director = new HM.Transition(scene, renderer);
    const orbit = new HM.Orbit(camera, canvas, { target: new THREE.Vector3(0, 3.8, 0), distance: 42, theta: 0.6, phi: 1.36, reduceMotion });
    canvas.tabIndex = 0;

    let lot = null, sky = null, envRT = null;

    function applyLot(key) {
      const L = HM.LOTS[key];
      if (lot) {
        scene.remove(lot.group);
        lot.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      }
      if (sky) scene.remove(sky);
      lot = HM.buildLot(key);
      scene.add(lot.group);

      const sunDir = new THREE.Vector3(...L.sun.dir).normalize();
      sky = HM.makeSky({ ...L.sky, sunDir, sunColor: L.sun.color });
      scene.add(sky);
      // Reflections (glass, water) come from a blurred copy of this sky.
      const envScene = new THREE.Scene();
      envScene.add(HM.makeSky({ ...L.sky, sunDir, sunColor: L.sun.color }));
      if (envRT) envRT.dispose();
      envRT = pmrem.fromScene(envScene, 0.02, 1, 6000);
      scene.environment = envRT.texture;

      scene.fog = new THREE.Fog(L.sky.horizon, L.fog.near, L.fog.far);
      hemi.color.set(L.hemi.sky);
      hemi.groundColor.set(L.hemi.ground);
      hemi.intensity = L.hemi.intensity;
      sun.color.set(L.sun.color);
      sun.intensity = L.sun.intensity;
      sun.position.copy(sunDir).multiplyScalar(160);
      renderer.toneMappingExposure = L.exposure;
      // Look a little lower on the hillside so the walk-out basement shows.
      orbit.frame({ target: new THREE.Vector3(0, key === 'mountain' ? 2.4 : 3.8, 0) });
    }

    function buildHouse(withTeardown) {
      const house = HM.buildHouse(state.style, HM.LOTS[state.lot]);
      director.show(house, { withTeardown, instant: reduceMotion });
    }

    // ---------- UI ----------
    const styleButtons = [...document.querySelectorAll('[data-style]')];
    const lotButtons = [...document.querySelectorAll('[data-lot]')];
    const tb = (id, text) => { document.getElementById(id).textContent = text; };

    function refreshUI() {
      styleButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.style === state.style)));
      lotButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lot === state.lot)));
      const S = HM.STYLES[state.style], L = HM.LOTS[state.lot];
      tb('tb-title', S.name);
      tb('tb-sub', `on a ${L.name.toLowerCase()} lot`);
      tb('tb-era', S.era);
      tb('tb-stories', S.stories);
      tb('tb-plan', S.plan);
      tb('tb-roof', S.roof);
      tb('tb-exterior', S.exterior);
      tb('tb-size', L.size);
      tb('tb-grade', L.grade);
      tb('tb-foundation', L.foundationName);
    }

    styleButtons.forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.style === state.style) return;
      state.style = b.dataset.style;
      refreshUI();
      buildHouse(true);
    }));

    let lotTimer = null;
    lotButtons.forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.lot === state.lot) return;
      state.lot = b.dataset.lot;
      refreshUI();
      // Fade out, swap the whole setting, fade back in and build on the new lot.
      veil.classList.remove('clear');
      clearTimeout(lotTimer);
      lotTimer = setTimeout(() => {
        applyLot(state.lot);
        buildHouse(false);
        requestAnimationFrame(() => veil.classList.add('clear'));
      }, reduceMotion ? 0 : 360);
    }));

    // Collapse the spec sheet by default on phones so the house has room.
    if (window.innerWidth <= 720) document.getElementById('titleblock').removeAttribute('open');

    // ---------- sizing ----------
    let framedPortrait = false;
    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Portrait screens need a wider lens and a step back to fit the house,
      // and the view nudged up so the bottom controls don't cover it.
      const portrait = camera.aspect < 0.8;
      camera.fov = portrait ? 62 : camera.aspect < 1.2 ? 50 : 40;
      if (portrait) camera.setViewOffset(w, h, 0, Math.round(h * 0.08), w, h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      orbit.limits.dMax = portrait ? 95 : 80;
      if (portrait && !framedPortrait) { framedPortrait = true; orbit.goal.distance = orbit.cur.distance = 60; }
    }
    new ResizeObserver(resize).observe(canvas);
    resize();

    // ---------- go ----------
    refreshUI();
    applyLot(state.lot);
    buildHouse(false);
    statusEl.hidden = true;
    requestAnimationFrame(() => veil.classList.add('clear'));

    let last = performance.now();
    let time = 0;
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
      lot.update(time);
      director.update(dt);
      orbit.update(dt);
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    HM.app = { scene, camera, renderer, director, orbit, state };
  }

  boot();
})();
