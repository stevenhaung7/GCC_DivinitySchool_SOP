# 800 V DC power (Anatomy figure)

An interactive isometric figure of an 800 V DC feed for AI racks, built with the
[anatomy](https://github.com/wheresryan22/anatomy) skill (kit vendored in `kit/`).

- `hvdc800.html` (dark) and `hvdc800-light.html` (light): standalone pages, open them in a browser.
- `node build.mjs` / `node build.mjs --light` rebuilds them from `build.mjs` (geometry), `live.js` (motion, shader) and `model.mjs` (physics).

## What it shows
A power rack and a compute rack are joined by three 100 × 10 mm copper busbars. Drag the knob on the floor (50–1000 kW),
turn the switch (or press 1–3) to pick 54 V DC, 415 V AC or 800 V DC.

`model.mjs`: current is I = P / V (three-phase AC: P / (√3 · V · 0.95)); a bar settles where I²R heat, with copper's
resistance rising 0.39 % per kelvin, equals convection and radiation (12 W/m²K). Beyond a threshold there is no steady
state and the bar runs away: about 180 kW at 54 V, but ~2.7 MW at 800 V for the same bar. The meter, the readout and the WebGL
layer (thermal-camera colours and current pulses on the bars) all read that one model.

## Checks run
`scripts/lines.mjs`: `line ends: 0` in both themes. Verified in headless Chrome: desktop, 390 px phone, no-WebGL fallback,
slider drag and switch click.
