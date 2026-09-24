# Lotline: home style modeler

A 3D browser tool that puts four home styles on four kinds of property lots,
each on a real street with neighbors. Pick a style and the old house tears
down, glowing blueprint lines trace the new one, and the new house assembles
piece by piece. Then customize it: colors, materials, size, roof, porch,
garage, windows and more.

| Styles | Lots (each with a road and neighbors) |
|---|---|
| Modern | Beachfront: ocean, dunes, boardwalks, cottages on stilts |
| Craftsman | Mountain hillside: slope, pine forest, snowy peaks, chalets |
| Colonial Farmhouse | Suburban street: sidewalks, street trees, mixed homes |
| Mediterranean | Desert: mesas, saguaros, Pueblo Revival neighbors |

The foundation changes with the lot, the way it would in real life:

- **Beachfront**: raised on wood pilings, because coastal flood zones require it
- **Mountain hillside**: a stone walk-out basement where the hill drops away
- **Suburban street**: a block crawlspace
- **Desert**: a concrete slab on grade

## Customizing

Open the **Customize** tab:

- **Colors**: wall material (lap siding, board & batten, cedar shakes, stucco,
  brick, stone, wood slats), plus colors for walls, trim, roof and front door.
  Pick a swatch or any custom color.
- **Shape**: width and depth in feet, 1 or 2 stories, gable / hip / flat roof,
  which way the gable faces, and roof pitch (rise per 12 inches of run).
- **Features**: porch, 1- or 2-car garage, chimney, dormers, balcony, tower
  (Mediterranean). Switching a feature on animates just that piece in.
- **Windows**: divided panes, single pane or arched; shutters; door style.

Each style remembers its own changes while the page is open. **Reset** puts a
style back to its original design. The spec sheet (square feet, bedrooms,
bathrooms, roof, features) updates as you go; its figures are rough estimates.

**High quality** (in the panel) adds ambient occlusion (soft shading where
surfaces meet), sharper shadows and denser grass. It's best on a strong computer.

## Running it

Open `index.html` in a browser. There's no build step. It needs an internet
connection the first time, because three.js (the 3D library) loads from a CDN.

Or serve the folder:

```bash
cd home-modeler
python3 -m http.server 8000
# then visit http://localhost:8000
```

Controls: drag to orbit, scroll or pinch to zoom, arrow keys to turn. After a
few seconds with no input, the camera drifts slowly around the house.

## How it's built

Everything is generated in code: no 3D model files and no images. Textures
like shingles, brick, clay tile and stucco are painted onto canvases at startup.

```
home-modeler/
  index.html          page layout, panels, spec sheet
  css/styles.css      panel styling (drafting-vellum look)
  js/util.js          random numbers, noise, easing, ground-hugging strips, mesh merging
  js/textures.js      procedural materials (siding, stone, clay tile, road...)
  js/parts.js         roofs, windows, doors, columns, railings, stairs
  js/houses.js        the parametric house builder, styles and their defaults
  js/options.js       the Customize panel: swatches, controls, which options apply
  js/lots.js          terrain, sky, ocean, the street, neighbors, trees, grass
  js/transition.js    teardown -> blueprint -> assembly animation
  js/controls.js      orbit camera
  js/main.js          renderer, lights, quality setting, UI wiring, render loop
```

### How houses are built

Every house, yours and each neighbor's, comes from one builder in
`js/houses.js`. A style is two things:

- **defaults**: the options it starts with (colors, size, roof, features...)
- **flavor**: its fixed character (story height, porch type, trim, eaves)

The builder turns options into pieces, each tagged with a **stage**, a
**kind** and a **tag**:

```js
ctx.add(wall,   1, 'rise');           // stage 1: walls grow up from the foundation
ctx.add(window, 4, 'pop');            // stage 4: windows spring into place
ctx.add(roof,   5, 'drop');           // stage 5: roof falls in and bounces
ctx.add(garage, 1, 'rise', 'garage'); // tagged, so toggling the garage animates it alone
```

`transition.js` sorts pieces by stage and schedules them. Before the solid
pieces arrive, it draws each piece's edges as blueprint lines.

Neighbors are built the same way with randomized options, then merged into a
few large meshes (`HM.mergeByMaterial`) so a whole street stays fast on phones.

### Adding a style

1. Add an entry to `HM.STYLES` in `js/houses.js` with `defaults` and `flavor`
   (copy the closest existing style and adjust).
2. Add a button with `data-style="yourkey"` in `index.html`.
   Entries marked `local: true` are used only for neighbors.

### Adding a lot

1. Write a builder in `js/lots.js` that returns `{ group, env, keepOut, height, update(t) }`.
   Use `compose()` to flatten the road and house pads, and `street()` for the
   road, streetlights and neighbors.
2. Add it to `HM.LOTS` with its sky colors, sun direction and specs.
3. Add a button with `data-lot="yourkey"` in `index.html`.

The specs shown for each style and lot describe a typical example, not a real listing.
