/* Starts the app: loads three.js, sets up the renderer, lights and camera,
   wires the panels, and runs the render loop. */
var HM = (window.HM = window.HM || {});

(function () {
  // Fallback when the browser can't use the import map in index.html.
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
  const statusEl = document.getElementById('status');
  const veil = document.getElementById('veil');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const store = {
    get(k) { try { return localStorage.getItem('lotline:' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('lotline:' + k, v); } catch (e) { /* storage blocked: fine */ } },
  };

  const state = {
    style: 'modern',
    lot: 'beach',
    custom: {},  // per style: the options you've changed
    quality: store.get('quality') === 'high' ? 'high' : 'normal',
  };
  let addonsOK = false;

  async function boot() {
    try {
      window.THREE = await import('three');
      addonsOK = true;
    } catch (e) {
      try { window.THREE = await import(THREE_URL); } catch (err) {
        statusEl.textContent = "Couldn't load the 3D engine. Check your internet connection and reload the page.";
        return;
      }
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 9000);
    const hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
    const sun = new THREE.DirectionalLight('#ffffff', 3);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 10, far: 420 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(hemi, sun, sun.target);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const director = new HM.Transition(scene, renderer);
    const orbit = new HM.Orbit(camera, canvas, { target: new THREE.Vector3(0, 3.8, 0), distance: 44, theta: 0.6, phi: 1.36, reduceMotion });
    canvas.tabIndex = 0;

    // ---------- quality ----------
    let composer = null, aoPass = null;
    async function applyQuality() {
      const high = state.quality === 'high';
      const small = Math.min(window.innerWidth, window.innerHeight) < 700;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1.5));
      const size = high ? 4096 : small ? 1024 : 2048;
      if (sun.shadow.mapSize.x !== size) {
        sun.shadow.mapSize.set(size, size);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      }
      if (high && addonsOK && !composer) {
        try {
          const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { OutputPass }] = await Promise.all([
            import('three/addons/postprocessing/EffectComposer.js'),
            import('three/addons/postprocessing/RenderPass.js'),
            import('three/addons/postprocessing/GTAOPass.js'),
            import('three/addons/postprocessing/OutputPass.js'),
          ]);
          composer = new EffectComposer(renderer);
          composer.addPass(new RenderPass(scene, camera));
          // Ambient occlusion: soft darkening where surfaces meet (eaves, corners, porches).
          aoPass = new GTAOPass(scene, camera, canvas.clientWidth, canvas.clientHeight);
          aoPass.updateGtaoMaterial({ radius: 1.2, distanceFallOff: 1, thickness: 1.5, scale: 1.2 });
          aoPass.blendIntensity = 0.85;
          composer.addPass(aoPass);
          composer.addPass(new OutputPass());
        } catch (e) {
          console.warn('Ambient occlusion unavailable', e);
          composer = null;
        }
      }
      resize();
    }

    // ---------- lot ----------
    let lot = null, sky = null, envRT = null;
    function applyLot(key) {
      const L = HM.LOTS[key];
      if (lot) {
        scene.remove(lot.group);
        lot.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      }
      if (sky) scene.remove(sky);
      lot = HM.buildLot(key, state.quality);
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
      sun.position.copy(sunDir).multiplyScalar(170);
      renderer.toneMappingExposure = L.exposure;
      orbit.frame({ target: new THREE.Vector3(0, key === 'mountain' ? 2.4 : 3.8, 0) });
    }

    // ---------- house ----------
    const opts = () => ({ ...HM.STYLES[state.style].defaults, ...(state.custom[state.style] || {}) });
    let current = null;
    function buildHouse(mode, tags) {
      const house = HM.buildHouse(state.style, lot.env, opts());
      if (mode === 'style') director.show(house, { withTeardown: true, instant: reduceMotion });
      else if (mode === 'lot') director.show(house, { withTeardown: false, instant: reduceMotion });
      else if (mode === 'tweak' && tags && !reduceMotion) director.show(house, { animateTags: tags });
      else director.show(house, { instant: true });
      current = house;
      if (lot.grass && mode !== 'live') lot.grass.scatter(house.footprints);
      refreshSpecs();
    }

    // ---------- panels ----------
    const styleButtons = [...document.querySelectorAll('[data-style]')];
    const lotButtons = [...document.querySelectorAll('[data-lot]')];
    const tb = (id, text) => { document.getElementById(id).textContent = text; };

    function refreshSpecs() {
      const S = HM.STYLES[state.style], L = HM.LOTS[state.lot], o = opts();
      const sp = HM.planSpecs(state.style, o);
      tb('tb-title', S.name);
      tb('tb-sub', `on a ${L.name.toLowerCase()} lot`);
      tb('tb-era', S.era);
      tb('tb-stories', o.tower && S.flavor.tower ? `${o.stories} + tower` : String(o.stories));
      tb('tb-plan', `${sp.sqft.toLocaleString()} sq ft · ${sp.beds} bd · ${sp.baths} ba`);
      tb('tb-footprint', `${HM.toFeet(o.w)} × ${HM.toFeet(o.d)} ft`);
      tb('tb-roof', o.roofShape === 'flat' ? 'Flat, membrane' : `${o.roofShape === 'hip' ? 'Hip' : o.ridge === 'front' ? 'Front gable' : 'Side gable'}, ${o.pitch}:12, ${HM.ROOFS[o.roofMat === 'membrane' ? 'asphalt' : o.roofMat].name.toLowerCase()}`);
      const wallName = HM.WALLS[o.wallMat].name.toLowerCase();
      tb('tb-exterior', `${cap(HM.colorName('wall', o.wallColor))} ${wallName}, ${HM.colorName('trim', o.trimColor)} trim`);
      const f = [];
      if (o.porch && !HM.unavailable(state.style, o, 'porch')) f.push(HM.porchLabel(state.style).toLowerCase());
      if (o.garage) f.push(`${o.garage}-car garage`);
      if (o.chimney && !HM.unavailable(state.style, o, 'chimney')) f.push('chimney');
      if (o.dormers && !HM.unavailable(state.style, o, 'dormers')) f.push('dormers');
      if (o.balcony && !HM.unavailable(state.style, o, 'balcony')) f.push('balcony');
      if (o.tower && S.flavor.tower) f.push('tower');
      tb('tb-features', f.length ? cap(f.join(', ')) : 'None');
      tb('tb-size', L.size);
      tb('tb-grade', L.grade);
      tb('tb-foundation', L.foundationName);
      styleButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.style === state.style)));
      lotButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lot === state.lot)));
    }
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    // Live edits (dragging a slider or color picker) rebuild at most once a frame.
    let liveDirty = false;
    const ui = new HM.CustomizeUI(document.getElementById('custom-host'), {
      get: () => ({ style: state.style, opts: opts() }),
      set: (key, value, { live }) => {
        const before = opts();
        (state.custom[state.style] ||= {})[key] = value;
        if (live) { liveDirty = true; return; }
        const tag = HM.OPTION_TAGS[key];
        const turnedOn = tag && (key === 'garage' ? value > 0 && !before.garage : value && !before[key]);
        buildHouse(turnedOn ? 'tweak' : 'instant', turnedOn ? [tag] : null);
        ui.render();
      },
      reset: () => {
        delete state.custom[state.style];
        buildHouse('style');
        ui.render();
      },
    });

    // Tabs: "Style & lot" and "Customize"
    const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
    tabs.forEach((t) => t.addEventListener('click', () => {
      tabs.forEach((x) => {
        const on = x === t;
        x.setAttribute('aria-selected', String(on));
        document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
      });
      if (t.id === 'tab-custom') ui.render();
    }));

    styleButtons.forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.style === state.style) return;
      state.style = b.dataset.style;
      buildHouse('style');
      ui.render();
    }));

    // Swapping the whole setting: fade out, rebuild, fade in, build on the new lot.
    let lotTimer = null;
    function changeLot(key) {
      state.lot = key;
      refreshSpecs();
      veil.classList.remove('clear');
      clearTimeout(lotTimer);
      lotTimer = setTimeout(() => {
        applyLot(state.lot);
        buildHouse('lot');
        requestAnimationFrame(() => veil.classList.add('clear'));
      }, reduceMotion ? 0 : 360);
    }
    lotButtons.forEach((b) => b.addEventListener('click', () => { if (b.dataset.lot !== state.lot) changeLot(b.dataset.lot); }));

    const qualityBox = document.getElementById('quality');
    qualityBox.checked = state.quality === 'high';
    qualityBox.addEventListener('change', () => {
      state.quality = qualityBox.checked ? 'high' : 'normal';
      store.set('quality', state.quality);
      applyQuality();
      changeLot(state.lot); // rebuild the setting with more (or less) grass and trees
    });

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
      if (portrait) camera.setViewOffset(w, h, 0, Math.round(h * 0.1), w, h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      orbit.limits.dMax = portrait ? 100 : 85;
      if (portrait && !framedPortrait) { framedPortrait = true; orbit.goal.distance = orbit.cur.distance = 64; }
      if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
    }
    new ResizeObserver(resize).observe(canvas);

    // ---------- go ----------
    applyQuality();
    applyLot(state.lot);
    buildHouse('lot');
    statusEl.hidden = true;
    requestAnimationFrame(() => veil.classList.add('clear'));

    let last = performance.now();
    let time = 0;
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
      if (liveDirty) { liveDirty = false; buildHouse('live'); }
      lot.update(time);
      director.update(dt);
      orbit.update(dt);
      if (composer && state.quality === 'high') composer.render(dt);
      else renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    HM.app = { scene, camera, renderer, director, orbit, state, ui, get lot() { return lot; }, get house() { return current; } };
  }

  boot();
})();
