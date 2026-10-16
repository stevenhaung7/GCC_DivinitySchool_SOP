# Desktop computer (Anatomy figure)

An interactive isometric desktop PC: a mid-tower with its side panel off, a monitor, a keyboard and a mouse,
built with the [anatomy](https://github.com/wheresryan22/anatomy) skill (kit vendored in `kit/`).

- `desktop-pc.html` (dark) and `desktop-pc-light.html` (light): standalone pages, open them in a browser.
- `node build.mjs` / `node build.mjs --light` rebuilds them from `build.mjs` (geometry), `live.js` (motion, shader) and `model.mjs` (physics).

## What it shows
Keys **1–4** (idle, browse, game, render), a click, or the arrow keys set the load; **Space** powers the machine on and off.
`model.mjs` turns load into watts, watts into heat, and heat into temperature through each heatsink; the fan curves
answer (the graphics card's fans stay stopped until 52 °C, with hysteresis). The monitor, the fan speeds, the readout
and the WebGL layer (RGB light falling on the tray and air streaks that warm as they cross the board) all read that one model.

## Checks run
`node scripts/lines.mjs <page>` from the skill: `line ends: 0` in both themes. Verified with headless Chrome:
desktop, 390 px phone, reduced motion, and no-WebGL fallback.
