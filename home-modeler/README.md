# Lotline: home style modeler

A 3D browser tool that puts four home styles on four kinds of property lots.
Pick a style and the old house tears down, glowing blueprint lines trace the
new one, and the new house assembles piece by piece: foundation, walls,
windows, roof, then details. Pick a lot and the whole setting changes around it.

| Styles | Lots |
|---|---|
| Modern | Beachfront (ocean, dunes, boardwalk) |
| Craftsman | Mountain hillside (slope, pine forest, snowy peaks) |
| Colonial Farmhouse | Suburban street (road, sidewalks, neighbours) |
| Mediterranean | Desert (mesas, saguaros, warm evening light) |

The foundation changes with the lot, the way it would in real life:

- **Beachfront**: raised on wood pilings, because coastal flood zones require it
- **Mountain hillside**: a stone walk-out basement where the hill drops away
- **Suburban street**: a block crawlspace
- **Desert**: a concrete slab on grade

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
  index.html          page layout, buttons, spec sheet
  css/styles.css      panel styling (drafting-vellum look)
  js/util.js          seeded random numbers, noise, easing, shared helpers
  js/textures.js      procedural materials (siding, stone, clay tile...)
  js/parts.js         roofs, windows, doors, columns, railings, stairs
  js/houses.js        the four styles + lot-aware foundations
  js/lots.js          terrain, sky, ocean, trees, mesas, neighbours
  js/transition.js    teardown -> blueprint -> assembly animation
  js/controls.js      orbit camera
  js/main.js          renderer, lights, UI wiring, render loop
```

### The build animation

Each house is made of pieces tagged with a **stage** and a **kind**:

```js
ctx.add(wall,   1, 'rise'); // stage 1: walls grow up from the foundation
ctx.add(window, 4, 'pop');  // stage 4: windows spring into place
ctx.add(roof,   5, 'drop'); // stage 5: roof falls in and bounces
```

`transition.js` sorts pieces by stage, then left to right inside each stage,
and schedules them. Before the solid pieces arrive, it draws each piece's
edges as blueprint lines that trace themselves in.

### Adding a style

1. Write a builder in `js/houses.js`, following one of the existing ones.
   Call `ctx.base([...footprints])` first to get the floor height for the current lot.
2. Add it to `HM.STYLES` with its specs.
3. Add a button with `data-style="yourkey"` in `index.html`.

### Adding a lot

1. Write a builder in `js/lots.js` that returns `{ group, update(t) }`.
   Keep the ground flat around the origin, where the house sits.
2. Add it to `HM.LOTS` with its sky colours, sun direction, foundation type and specs.
3. Add a button with `data-lot="yourkey"` in `index.html`.

The specs shown for each style and lot describe a typical example, not a real listing.
