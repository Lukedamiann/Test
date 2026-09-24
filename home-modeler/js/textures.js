/* Procedural materials. Every texture is painted onto a canvas in code, so the
   project ships no image files. Each material records `userData.uvScale`: how
   many meters one repeat of its texture covers in the world (see HM.worldUV). */
var HM = (window.HM = window.HM || {});

(function () {
  const SIZE = 512;

  function canvas(paint) {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const g = c.getContext('2d');
    paint(g, HM.rng(SIZE + paint.length));
    return c;
  }

  function texture(c) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  // Speckle a canvas with light/dark noise so flat colors read as real surfaces.
  function grain(g, rnd, amount, count = 9000, size = 2) {
    for (let i = 0; i < count; i++) {
      const v = rnd() < 0.5 ? 0 : 255;
      g.fillStyle = `rgba(${v},${v},${v},${rnd() * amount})`;
      g.fillRect(rnd() * SIZE, rnd() * SIZE, size, size);
    }
  }

  function shade(hex, f) {
    const c = new THREE.Color(hex);
    c.offsetHSL(0, 0, f);
    return '#' + c.getHexString();
  }

  const painters = {
    // Horizontal lap siding: boards overlap, each casting a thin shadow line.
    lap(color) {
      return canvas((g, rnd) => {
        const rows = 10;
        const h = SIZE / rows;
        for (let r = 0; r < rows; r++) {
          g.fillStyle = shade(color, (rnd() - 0.5) * 0.03);
          g.fillRect(0, r * h, SIZE, h);
          const grad = g.createLinearGradient(0, r * h, 0, r * h + h);
          grad.addColorStop(0, 'rgba(0,0,0,0.28)');
          grad.addColorStop(0.12, 'rgba(0,0,0,0.0)');
          grad.addColorStop(0.9, 'rgba(255,255,255,0.06)');
          grad.addColorStop(1, 'rgba(255,255,255,0.0)');
          g.fillStyle = grad;
          g.fillRect(0, r * h, SIZE, h);
        }
        grain(g, rnd, 0.05);
      });
    },
    // Board-and-batten: wide boards with narrow raised battens every 40 cm.
    batten(color) {
      return canvas((g, rnd) => {
        g.fillStyle = color;
        g.fillRect(0, 0, SIZE, SIZE);
        grain(g, rnd, 0.04);
        const n = 5;
        for (let i = 0; i < n; i++) {
          const x = (i * SIZE) / n;
          g.fillStyle = 'rgba(0,0,0,0.22)';
          g.fillRect(x + 16, 0, 6, SIZE);
          g.fillStyle = shade(color, 0.03);
          g.fillRect(x, 0, 16, SIZE);
          g.fillStyle = 'rgba(0,0,0,0.12)';
          g.fillRect(x - 3, 0, 3, SIZE);
        }
      });
    },
    // Cedar shakes: staggered rows of shingles with random widths and tones.
    shingle(color) {
      return canvas((g, rnd) => {
        const rows = 8;
        const h = SIZE / rows;
        for (let r = 0; r < rows; r++) {
          let x = -rnd() * 40;
          while (x < SIZE) {
            const w = 24 + rnd() * 40;
            g.fillStyle = shade(color, (rnd() - 0.5) * 0.12);
            g.fillRect(x, r * h, w - 3, h);
            g.fillStyle = 'rgba(0,0,0,0.35)';
            g.fillRect(x + w - 3, r * h, 3, h);
            x += w;
          }
          g.fillStyle = 'rgba(0,0,0,0.3)';
          g.fillRect(0, r * h + h - 5, SIZE, 5);
        }
        grain(g, rnd, 0.06);
      });
    },
    // Asphalt roof shingles: tabbed rows in a mix of tones.
    asphalt(color) {
      return canvas((g, rnd) => {
        const rows = 12;
        const h = SIZE / rows;
        for (let r = 0; r < rows; r++) {
          const off = (r % 2) * 21;
          for (let x = -off; x < SIZE; x += 42) {
            g.fillStyle = shade(color, (rnd() - 0.5) * 0.1);
            g.fillRect(x, r * h, 40, h);
          }
          g.fillStyle = 'rgba(0,0,0,0.45)';
          g.fillRect(0, r * h, SIZE, 3);
        }
        grain(g, rnd, 0.14, 16000, 2);
      });
    },
    // Smooth stucco: soft blotches plus fine grain.
    stucco(color) {
      return canvas((g, rnd) => {
        g.fillStyle = color;
        g.fillRect(0, 0, SIZE, SIZE);
        for (let i = 0; i < 260; i++) {
          const r = 10 + rnd() * 50;
          const v = rnd() < 0.5 ? 0 : 255;
          g.fillStyle = `rgba(${v},${v},${v},0.02)`;
          g.beginPath();
          g.arc(rnd() * SIZE, rnd() * SIZE, r, 0, Math.PI * 2);
          g.fill();
        }
        grain(g, rnd, 0.06, 20000, 1.5);
      });
    },
    // Fieldstone: irregular stones set in mortar.
    stone(color) {
      return canvas((g, rnd) => {
        g.fillStyle = '#8d877d';
        g.fillRect(0, 0, SIZE, SIZE);
        let y = 0;
        while (y < SIZE) {
          const h = 36 + rnd() * 40;
          let x = -rnd() * 60;
          while (x < SIZE) {
            const w = 50 + rnd() * 80;
            g.fillStyle = shade(color, (rnd() - 0.5) * 0.18);
            g.beginPath();
            g.roundRect(x + 4, y + 4, w - 8, h - 8, 10);
            g.fill();
            g.fillStyle = 'rgba(255,255,255,0.08)';
            g.fillRect(x + 8, y + 6, w - 20, 4);
            x += w;
          }
          y += h;
        }
        grain(g, rnd, 0.1);
      });
    },
    // Running-bond brick with mortar joints.
    brick(color) {
      return canvas((g, rnd) => {
        g.fillStyle = '#b9b0a3';
        g.fillRect(0, 0, SIZE, SIZE);
        const rows = 16, h = SIZE / rows, w = SIZE / 4;
        for (let r = 0; r < rows; r++) {
          const off = (r % 2) * (w / 2);
          for (let x = -off; x < SIZE; x += w) {
            g.fillStyle = shade(color, (rnd() - 0.5) * 0.12);
            g.fillRect(x + 2, r * h + 2, w - 4, h - 4);
          }
        }
        grain(g, rnd, 0.1);
      });
    },
    // Barrel clay tiles: rounded vertical runs with overlapping courses.
    clay(color) {
      return canvas((g, rnd) => {
        const cols = 8;
        const w = SIZE / cols;
        for (let c = 0; c < cols; c++) {
          const base = shade(color, (rnd() - 0.5) * 0.12);
          const grad = g.createLinearGradient(c * w, 0, c * w + w, 0);
          grad.addColorStop(0, shade(base, -0.16));
          grad.addColorStop(0.45, shade(base, 0.08));
          grad.addColorStop(1, shade(base, -0.2));
          g.fillStyle = grad;
          g.fillRect(c * w, 0, w, SIZE);
        }
        for (let r = 0; r < 6; r++) {
          const y = (r * SIZE) / 6;
          g.fillStyle = 'rgba(0,0,0,0.3)';
          g.fillRect(0, y, SIZE, 5);
          g.fillStyle = 'rgba(255,255,255,0.08)';
          g.fillRect(0, y + 5, SIZE, 3);
        }
        grain(g, rnd, 0.08);
      });
    },
    // Standing-seam metal roof: flat pans with raised seams.
    seam(color) {
      return canvas((g, rnd) => {
        g.fillStyle = color;
        g.fillRect(0, 0, SIZE, SIZE);
        const n = 6;
        for (let i = 0; i < n; i++) {
          const x = (i * SIZE) / n;
          g.fillStyle = shade(color, 0.12);
          g.fillRect(x, 0, 5, SIZE);
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(x + 5, 0, 4, SIZE);
        }
        grain(g, rnd, 0.03);
      });
    },
    // Vertical cedar slats with dark gaps (modern cladding).
    slat(color) {
      return canvas((g, rnd) => {
        const n = 16;
        const w = SIZE / n;
        for (let i = 0; i < n; i++) {
          g.fillStyle = shade(color, (rnd() - 0.5) * 0.08);
          g.fillRect(i * w, 0, w - 7, SIZE);
          g.fillStyle = '#1b1612';
          g.fillRect(i * w + w - 7, 0, 7, SIZE);
          for (let k = 0; k < 14; k++) {
            g.fillStyle = `rgba(60,30,10,${rnd() * 0.12})`;
            g.fillRect(i * w + rnd() * (w - 8), 0, 1.5, SIZE);
          }
        }
      });
    },
    // Poured concrete / sidewalk.
    concrete(color) {
      return canvas((g, rnd) => {
        g.fillStyle = color;
        g.fillRect(0, 0, SIZE, SIZE);
        grain(g, rnd, 0.08, 24000, 1.5);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(0, 0, SIZE, 3);
        g.fillRect(0, 0, 3, SIZE);
      });
    },
    // Plain paint with just enough grain to catch the light.
    paint(color) {
      return canvas((g, rnd) => {
        g.fillStyle = color;
        g.fillRect(0, 0, SIZE, SIZE);
        grain(g, rnd, 0.03, 6000, 1.5);
      });
    },
    // Wood decking / porch floor boards.
    deck(color) {
      return canvas((g, rnd) => {
        const n = 10;
        const h = SIZE / n;
        for (let i = 0; i < n; i++) {
          g.fillStyle = shade(color, (rnd() - 0.5) * 0.1);
          g.fillRect(0, i * h, SIZE, h - 4);
          g.fillStyle = 'rgba(0,0,0,0.4)';
          g.fillRect(0, i * h + h - 4, SIZE, 4);
        }
        grain(g, rnd, 0.06);
      });
    },
    // Ground detail: speckled noise tinted by vertex color on the terrain.
    ground() {
      return canvas((g, rnd) => {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, SIZE, SIZE);
        for (let i = 0; i < 30000; i++) {
          const v = 150 + rnd() * 105;
          g.fillStyle = `rgb(${v},${v},${v})`;
          g.fillRect(rnd() * SIZE, rnd() * SIZE, 2 + rnd() * 3, 2 + rnd() * 3);
        }
      });
    },
  };

  const cache = new Map();

  // HM.mat('lap', '#8a9a7b', {uv: 2, rough: 0.8}) -> a textured, bump-mapped material.
  HM.mat = function (kind, color, opts = {}) {
    const key = kind + color + JSON.stringify(opts);
    if (cache.has(key)) return cache.get(key);
    const tex = texture(painters[kind](color));
    const m = new THREE.MeshStandardMaterial({
      map: tex,
      bumpMap: opts.bump === false ? null : tex,
      bumpScale: opts.bumpScale ?? 1.5,
      roughness: opts.rough ?? 0.85,
      metalness: opts.metal ?? 0,
    });
    m.userData.uvScale = opts.uv ?? 2;
    cache.set(key, m);
    return m;
  };

  // Untextured material for small parts (trim, frames, hardware).
  HM.flat = function (color, opts = {}) {
    const key = 'flat' + color + JSON.stringify(opts);
    if (cache.has(key)) return cache.get(key);
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.7,
      metalness: opts.metal ?? 0,
      transparent: !!opts.opacity,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
    });
    cache.set(key, m);
    return m;
  };

  // Window glass: dark, glossy, reflects the sky environment map.
  HM.glass = function () {
    return HM.flat('#26343d', { rough: 0.04, metal: 0.2, emissive: '#1c140a', emissiveIntensity: 0.35 });
  };

  HM.groundTexture = function () {
    if (cache.has('groundTex')) return cache.get('groundTex');
    const t = texture(painters.ground());
    t.colorSpace = THREE.NoColorSpace;
    cache.set('groundTex', t);
    return t;
  };

  // Soft round sprite used for clouds and dust.
  HM.softSprite = function () {
    if (cache.has('sprite')) return cache.get('sprite');
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    cache.set('sprite', t);
    return t;
  };

  // A puffy cloud texture made of overlapping soft circles.
  HM.cloudTexture = function (seed) {
    const key = 'cloud' + seed;
    if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    const rnd = HM.rng(seed);
    for (let i = 0; i < 38; i++) {
      const x = 90 + rnd() * 330, y = 110 + (rnd() - 0.5) * 60 - Math.sin(((x - 90) / 330) * Math.PI) * 30;
      const r = 30 + rnd() * 55 * Math.sin(((x - 60) / 400) * Math.PI);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    cache.set(key, t);
    return t;
  };
})();
