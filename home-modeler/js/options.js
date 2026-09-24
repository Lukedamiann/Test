/* The Customize panel: what can be changed, the color swatches, and the
   controls that change it. Sizes are shown in feet (what US listings use)
   and stored in meters (what the 3D scene uses). */
var HM = (window.HM = window.HM || {});

(function () {
  const FT = 3.28084;
  HM.toFeet = (m) => Math.round(m * FT);

  HM.SWATCHES = {
    wall: [['White', '#f2f1ec'], ['Cream', '#efe2c6'], ['Greige', '#cfc6b8'], ['Sage', '#7f8f6a'], ['Slate blue', '#6f8394'], ['Navy', '#34455a'], ['Charcoal', '#3b3e42'], ['Barn red', '#8a3b2e'], ['Sand', '#dcc3a2'], ['Terracotta', '#c97a55']],
    accent: [['Cedar', '#a36a3a'], ['Walnut', '#6b4a2e'], ['Charcoal', '#3b3e42'], ['Cream', '#e8dcc2'], ['White', '#f2f1ec'], ['Sage', '#7f8f6a']],
    trim: [['White', '#f4f3ef'], ['Cream', '#efe6d2'], ['Black', '#1e2022'], ['Bronze', '#4a3a2c'], ['Gray', '#8d9296'], ['Dark wood', '#4a2e1d']],
    roof: [['Charcoal', '#2e3033'], ['Weathered brown', '#57493f'], ['Black', '#1f2123'], ['Slate', '#4f5a63'], ['Terracotta', '#b4532f'], ['Forest', '#3d5240'], ['Copper', '#9a5b36'], ['Silver', '#a4a9ad']],
    door: [['Walnut', '#6b3f22'], ['Black', '#23272b'], ['Red', '#9b2d24'], ['Navy', '#243a5a'], ['Sage', '#6c7f5c'], ['Teal', '#2c6e6a'], ['Mustard', '#d8a93b'], ['Oak', '#a3723f']],
  };

  // Plain-English name for a color: the closest swatch in its group.
  HM.colorName = function (group, hex) {
    const c = new THREE.Color(hex);
    let best = null, bestD = Infinity;
    for (const [name, h] of HM.SWATCHES[group].concat(group === 'trim' ? [] : HM.SWATCHES.trim)) {
      const s = new THREE.Color(h);
      const d = (c.r - s.r) ** 2 + (c.g - s.g) ** 2 + (c.b - s.b) ** 2;
      if (d < bestD) { bestD = d; best = name; }
    }
    return best.toLowerCase();
  };

  const PORCH_LABEL = { gable: 'Front porch', shed: 'Full-width porch', arcade: 'Arched loggia', canopy: 'Entry canopy', portal: 'Covered portal', stoop: 'Front stoop' };
  HM.porchLabel = (styleKey) => PORCH_LABEL[HM.STYLES[styleKey].flavor.porch] || 'Porch';

  // Why an option doesn't apply right now (or null if it does).
  HM.unavailable = function (styleKey, o, key) {
    const F = HM.STYLES[styleKey].flavor;
    const pitched = o.roofShape !== 'flat';
    switch (key) {
      case 'balcony': return o.stories < 2 ? 'Needs 2 stories' : null;
      case 'dormers': return !F.dormer ? 'Not part of this style' : !pitched ? 'Needs a sloped roof' : (o.roofShape === 'gable' && o.ridge === 'front') ? 'Needs a side-facing gable or hip roof' : null;
      case 'chimney': return F.chimney ? null : 'Not part of this style';
      case 'tower': return F.tower ? null : 'Only on Mediterranean homes';
      case 'porch': return F.porch && F.porch !== 'none' ? null : 'Not part of this style';
      default: return null;
    }
  };

  // Tag of pieces to animate when an option switches on.
  HM.OPTION_TAGS = { porch: 'porch', garage: 'garage', chimney: 'chimney', dormers: 'dormers', balcony: 'balcony', tower: 'tower' };

  // ---------- DOM helpers ----------
  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((k) => k && e.append(k));
    return e;
  }

  let uid = 0;
  function row(label, control, note) {
    const id = 'opt-' + ++uid;
    return el('div', { class: 'opt-row' },
      el('div', { class: 'opt-label', id }, label, note ? el('span', { class: 'opt-note', text: note }) : null),
      (control.setAttribute('aria-labelledby', id), control));
  }

  function segmented(values, current, onPick, disabled) {
    const g = el('div', { class: 'seg', role: 'radiogroup' });
    values.forEach(([v, label]) => g.append(el('button', {
      type: 'button', role: 'radio', class: 'seg-btn', 'aria-checked': String(v === current), disabled: !!disabled,
      onclick: () => onPick(v), text: label,
    })));
    return g;
  }

  function swatches(group, current, onPick) {
    const g = el('div', { class: 'swatches', role: 'radiogroup' });
    let matched = false;
    HM.SWATCHES[group].forEach(([name, hex]) => {
      const on = hex.toLowerCase() === String(current).toLowerCase();
      matched = matched || on;
      g.append(el('button', {
        type: 'button', role: 'radio', class: 'swatch', 'aria-checked': String(on), title: name, 'aria-label': name,
        style: `--c:${hex}`, onclick: () => onPick(hex, false),
      }));
    });
    // Custom color: the native picker, styled as one more swatch.
    const input = el('input', { type: 'color', class: 'swatch-input', value: toHex(current), 'aria-label': 'Custom color' });
    input.addEventListener('input', () => onPick(input.value, true));
    input.addEventListener('change', () => onPick(input.value, false));
    g.append(el('label', { class: 'swatch custom' + (matched ? '' : ' on'), title: 'Custom color', style: `--c:${toHex(current)}` }, input));
    return g;
  }
  const toHex = (c) => '#' + new THREE.Color(c).getHexString();

  function toggle(on, onFlip, disabled) {
    return el('button', { type: 'button', role: 'switch', class: 'switch', 'aria-checked': String(!!on), disabled: !!disabled, onclick: () => onFlip(!on) });
  }

  function slider({ min, max, step, value, format, onInput }) {
    const out = el('output', { class: 'slider-val', text: format(value) });
    const input = el('input', { type: 'range', min, max, step, value });
    input.addEventListener('input', () => { out.textContent = format(+input.value); onInput(+input.value, true); });
    input.addEventListener('change', () => onInput(+input.value, false));
    return el('div', { class: 'slider' }, input, out);
  }

  // ---------- the panel ----------
  // host: element to render into. get() -> {style, opts}. set(key, value, {live}).
  HM.CustomizeUI = class {
    constructor(host, { get, set, reset }) {
      this.host = host; this.get = get; this.set = set; this.reset = reset;
      this.tab = 'colors';
      this.render();
    }

    render() {
      const { style, opts: o } = this.get();
      const S = HM.STYLES[style];
      const tabs = [['colors', 'Colors'], ['shape', 'Shape'], ['features', 'Features'], ['windows', 'Windows']];
      const bar = el('div', { class: 'subtabs', role: 'tablist', 'aria-label': 'Customize sections' },
        tabs.map(([k, label]) => el('button', { type: 'button', role: 'tab', 'aria-selected': String(this.tab === k), class: 'subtab', onclick: () => { this.tab = k; this.render(); }, text: label })));
      const body = el('div', { class: 'custom-body', role: 'tabpanel' });
      const set = (k) => (v, live = false) => this.set(k, v, { live });
      const pitched = o.roofShape !== 'flat';

      if (this.tab === 'colors') {
        body.append(
          row('Walls', el('div', { class: 'stack' },
            segmented(Object.entries(HM.WALLS).map(([k, W]) => [k, W.name]), o.wallMat, set('wallMat')),
            swatches('wall', o.wallColor, set('wallColor')))),
        );
        if (S.defaults.accentColor) body.append(row(S.flavor.upper ? 'Upper floor cladding' : 'Porch gable', swatches('accent', o.accentColor, set('accentColor'))));
        body.append(row('Trim & window frames', swatches('trim', o.trimColor, set('trimColor'))));
        body.append(row('Roof', el('div', { class: 'stack' },
          pitched ? segmented(Object.entries(HM.ROOFS).filter(([k]) => k !== 'membrane').map(([k, R]) => [k, R.name]), o.roofMat === 'membrane' ? 'asphalt' : o.roofMat, set('roofMat')) : null,
          swatches('roof', o.roofColor, set('roofColor')))));
        body.append(row('Front door & shutters', swatches('door', o.doorColor, set('doorColor'))));
      }

      if (this.tab === 'shape') {
        body.append(
          row('Width', slider({ min: 9.2, max: 18.3, step: 0.305, value: o.w, format: (v) => `${HM.toFeet(v)} ft`, onInput: set('w') })),
          row('Depth', slider({ min: 8.5, max: 12.8, step: 0.305, value: o.d, format: (v) => `${HM.toFeet(v)} ft`, onInput: set('d') })),
          row('Stories', segmented([[1, '1 story'], [2, '2 stories']], o.stories, set('stories'))),
          row('Roof shape', segmented([['gable', 'Gable'], ['hip', 'Hip'], ['flat', 'Flat']], o.roofShape, set('roofShape'))),
        );
        if (o.roofShape === 'gable') body.append(row('Gable faces', segmented([['side', 'The sides'], ['front', 'The street']], o.ridge, set('ridge'))));
        if (pitched) body.append(row('Roof pitch', slider({ min: 3, max: 12, step: 1, value: o.pitch, format: (v) => `${v}:12`, onInput: set('pitch') }), 'Inches of rise per foot'));
      }

      if (this.tab === 'features') {
        const feat = (key, label) => {
          const why = HM.unavailable(style, o, key);
          return row(label, toggle(o[key] && !why, set(key), !!why), why);
        };
        body.append(
          feat('porch', HM.porchLabel(style)),
          row('Garage', segmented([[0, 'None'], [1, '1-car'], [2, '2-car']], o.garage, set('garage'))),
          feat('chimney', 'Chimney'),
          feat('dormers', 'Dormers'),
          feat('balcony', 'Balcony'),
        );
        if (S.flavor.tower) body.append(feat('tower', 'Tower'));
      }

      if (this.tab === 'windows') {
        body.append(
          row('Window style', segmented([['grid', 'Divided panes'], ['plain', 'Single pane'], ['arched', 'Arched']], o.windowStyle, set('windowStyle'))),
          row('Shutters', toggle(o.shutters, set('shutters'))),
          row('Front door', segmented([['panel', 'Panel'], ['glass', 'Glass top'], ['arched', 'Arched'], ['modern', 'Modern']], o.doorStyle, set('doorStyle'))),
        );
      }

      const reset = el('button', { type: 'button', class: 'reset', onclick: () => this.reset(), text: `Reset to original ${S.name}` });
      this.host.replaceChildren(bar, body, reset);
    }
  };
})();
