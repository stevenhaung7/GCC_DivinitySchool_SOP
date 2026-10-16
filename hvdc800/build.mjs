import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";
import { glCamera } from "./kit/gl.mjs";
import { kitScript, glScript, modelScript } from "./kit/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 880;
const HEIGHT = 560;

// ---------------------------------------------------------------- world
// Two open racks side by side along x, open toward +y. Power rack on the left, compute rack on the right,
// the busbars climb the power rack, cross the gap overhead and come down the compute rack.
const CAB_A = { x0: -270, x1: -120 };
const CAB_B = { x0: -60, x1: 90 };
const Y0 = -46;
const Y1 = 46;
const WALL_Y = -43; // inner face of the back wall
const BAR_Y0 = -43;
const BAR_Y1 = -40.6; // front face of the busbars (the shader plane)
const Z0 = 0;
const Z1 = 235;
const FLOOR = { x: -306, y: -80, w: 556, d: 214, r: 10 };
const FLOOR_H = 10;
const FOOT_H = 5;
const BARW = 12;

// three busbars, nested so no two cross: bar 0 goes highest
const BARS = [0, 1, 2].map((i) => {
  const top = [218, 202, 186][i];
  const ax = -170 + i * 15;
  const bx = 70 - i * 15;
  return { i, ax, bx, top, band: [top - 12, top] };
});
const BUS_Z0_A = 62;
const BUS_Z0_B = 50;

const METER = { x0: 150, x1: 232, y0: 14, y1: 22, z0: 46, z1: 118 };
const SCREEN = { x0: 155, x1: 227, z0: 52, z1: 112, r: 2, depth: 1.4 };
const RAIL = { x0: -262, x1: -92, y: 108 };
const SELECT = { x: 18, y: 108 };

const P = k.fitProjection(
  [...k.boxCorners(FLOOR, -FLOOR_H - FOOT_H, 0), ...k.boxCorners({ x: CAB_A.x0, y: Y0, w: CAB_B.x1 - CAB_A.x0, d: 92 }, 0, Z1), ...k.boxCorners({ x: METER.x0, y: METER.y0, w: 82, d: 8 }, 0, METER.z1)],
  WIDTH,
  HEIGHT,
  { pad: 14, azimuth: 60, elevation: 30 },
);

// ---------------------------------------------------------------- helpers
const n2 = (v) => Math.round(v * 100) / 100;
const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, tone = "lo", extra = {}) => k.lineSvg(d, { tone, ...extra });
const D = (points, style) => k.dotsSvg(points, style);
const F = (d, cls, attrs = "") => `<path class="${cls}"${attrs} d="${d}"/>`;
const dk = (x, y, z) => k.depthOf([x, y, z], P);
const planeY = (y) => k.sideMatrix([0, y], 0, P, "left"); // local (x, -z)
const planeX = (x) => k.sideMatrix([x, 0], 0, P, "right"); // local (-y, -z)
const planeZ = (z) => k.topMatrix([0, 0], z, P, "x"); // local (x, y)
const onPlane = (matrix, inner, attrs = "") => `<g transform="${matrix}"${attrs}>${inner}</g>`;
const rr = (u0, v0, u1, v1, r = 0) => {
  if (u1 < u0) [u0, u1] = [u1, u0];
  if (v1 < v0) [v0, v1] = [v1, v0];
  r = Math.max(0, Math.min(r, (u1 - u0) / 2, (v1 - v0) / 2));
  if (!r) return `M${n2(u0)} ${n2(v0)}H${n2(u1)}V${n2(v1)}H${n2(u0)}Z`;
  return `M${n2(u0 + r)} ${n2(v0)}H${n2(u1 - r)}A${r} ${r} 0 0 1 ${n2(u1)} ${n2(v0 + r)}V${n2(v1 - r)}A${r} ${r} 0 0 1 ${n2(u1 - r)} ${n2(v1)}H${n2(u0 + r)}A${r} ${r} 0 0 1 ${n2(u0)} ${n2(v1 - r)}V${n2(v0 + r)}A${r} ${r} 0 0 1 ${n2(u0 + r)} ${n2(v0)}Z`;
};
const circ = (cx, cy, r) => `M${n2(cx - r)} ${n2(cy)}a${r} ${r} 0 1 0 ${n2(2 * r)} 0a${r} ${r} 0 1 0 ${n2(-2 * r)} 0Z`;
const rectY = (x0, x1, z0, z1, r) => rr(x0, -z1, x1, -z0, r);
const rectX = (y0, y1, z0, z1, r) => rr(-y1, -z1, -y0, -z0, r);
const rectZ = (x0, x1, y0, y1, r) => rr(x0, y0, x1, y1, r);

function box(x0, x1, y0, y1, z0, z1, o = {}) {
  const plan = { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r: o.r ?? 1 };
  return S(k.slabOf(plan, z0, z1 - z0, P, o.steps ?? 3, o.bevel ?? 0), { tone: o.tone ?? "mid", crease: o.crease, lit: o.lit, inner: o.inner });
}

// Items are boxes; one is drawn before another when something separates them along an axis with the
// viewer on the other side (the viewer is toward +x, +y, +z).
const front = [];
const put = (b, svg) => front.push({ b, svg, centre: [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2] });
function sortFront() {
  const behind = (a, c) => a.b[1] <= c.b[0] + 1e-6 || a.b[3] <= c.b[2] + 1e-6 || a.b[5] <= c.b[4] + 1e-6;
  const left = new Set(front.map((_, i) => i));
  const out = [];
  while (left.size) {
    let pick = -1;
    for (const i of left) {
      let free = true;
      for (const j of left) if (j !== i && behind(front[j], front[i]) && !behind(front[i], front[j])) { free = false; break; }
      if (free && (pick < 0 || dk(...front[i].centre) < dk(...front[pick].centre))) pick = i;
    }
    if (pick < 0) for (const i of left) if (pick < 0 || dk(...front[i].centre) < dk(...front[pick].centre)) pick = i;
    left.delete(pick);
    out.push(front[pick]);
  }
  return out;
}

// ---------------------------------------------------------------- fans
const FANS = [];
function bladePath(cx, cy, r0, r1, count, sweep, wide) {
  let d = "";
  for (let i = 0; i < count; i++) {
    const base = (i / count) * Math.PI * 2;
    const lead = [];
    const trail = [];
    for (let j = 0; j <= 6; j++) {
      const u = j / 6;
      const r = r0 + (r1 - r0) * u;
      const a = base + sweep * u;
      lead.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    for (let j = 6; j >= 0; j--) {
      const u = j / 6;
      const r = r0 + (r1 - r0) * u;
      const w = ((Math.PI * 2) / count) * wide * (0.28 + 0.72 * Math.sin(Math.PI * Math.min(1, 0.12 + u * 0.88)));
      const a = base + sweep * u + w;
      trail.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    d += k.pathOf([...lead, ...trail], true);
  }
  return d;
}
const ptOnCircle = (cx, cy, r, a) => `${n2(cx + r * Math.cos(a))} ${n2(cy + r * Math.sin(a))}`;
function fanLocal(id, cx, cy, Rr, blades = 7) {
  const r0 = Rr * 0.3;
  const r1 = Rr * 0.9;
  const parts = [F(circ(cx, cy, Rr), "hv-well")];
  parts.push(`<g data-rot="${id}"><path class="hv-blade" d="${bladePath(cx, cy, r0 * 0.9, r1, blades, 0.95, 0.62)}"/></g>`);
  parts.push(`<circle class="hv-blur" data-blur="${id}" cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r1)}"/>`);
  let struts = "";
  for (let i = 0; i < 4; i++) struts += `M${ptOnCircle(cx, cy, r0, i * 1.571 + 0.6)}L${ptOnCircle(cx, cy, Rr, i * 1.571 + 0.6)}`;
  parts.push(L(struts, "faint"), L(circ(cx, cy, Rr), "lo"), F(circ(cx, cy, r0), "hv-hub"), L(circ(cx, cy, r0), "mid"), D([[cx, cy]], { size: 0.45, tone: "hi" }));
  FANS.push({ id, cx: n2(cx), cy: n2(cy), r: n2(Rr) });
  return `<g data-fan="${id}">${parts.join("")}</g>`;
}

// ---------------------------------------------------------------- floor and controls
const back = [];

function floor() {
  const out = [`<path class="iso-halo" d="${k.haloOf(FLOOR, -FLOOR_H - FOOT_H, FLOOR_H, P)}"/>`];
  const sorted = [...k.corners(FLOOR, 22)].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of sorted) {
    out.push(S(k.cylinder(x, y, 7, -FLOOR_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -FLOOR_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(FLOOR, -FLOOR_H, FLOOR_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(FLOOR, 5), 0, P), "faint"));
  const screws = k.corners(FLOOR, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), "lo"));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // raised-floor tile seams
  const seams = [];
  for (let x = -250; x <= 160; x += 82) seams.push(k.lineOnTop([x, FLOOR.y + 5], [x, FLOOR.y + FLOOR.d - 5], 0, P));
  out.push(L(seams.join(""), "faint"));
  return out.join("");
}

function controls() {
  const out = [];
  // power slider: a rail with a ruler strip, end stops and a knob
  const rail = { x: RAIL.x0 - 8, y: RAIL.y - 6, w: RAIL.x1 - RAIL.x0 + 16, d: 12, r: 2 };
  out.push(`<path class="iso-halo" d="${k.haloOf(rail, 0, 3, P)}"/>`);
  out.push(S(k.slabOf(rail, 0, 3, P, 4, 0.5), { tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(rail, 2.4), 3, P, 4), "faint"));
  const strip = { x: RAIL.x0 - 4, y: RAIL.y - 18, w: RAIL.x1 - RAIL.x0 + 8, d: 8, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(RAIL.x0, RAIL.x1, (RAIL.x1 - RAIL.x0) / 19, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, "lo"), L(ticks.major, "mid"));
  for (const x of [RAIL.x0 - 8, RAIL.x1 + 2]) out.push(S(k.slabOf({ x, y: RAIL.y - 7, w: 6, d: 14, r: 1.2 }, 0, 6, P, 3, 0.4), { tone: "mid" }));
  out.push(D([at([RAIL.x0 - 5, RAIL.y, 6]), at([RAIL.x1 + 5, RAIL.y, 6])], { size: 0.5 }));
  out.push(`<path class="hv-trail" data-part="trail" d=""/>`);
  // the knob (built at the left end, moved by the live code)
  const knob = [];
  knob.push(S(k.slabOf({ x: RAIL.x0 - 5, y: RAIL.y - 5.5, w: 10, d: 11, r: 2.4 }, 3, 3, P, 4, 0.4), { tone: "mid" }));
  knob.push(S(k.cylinder(RAIL.x0, RAIL.y, 6, 6, 7, P, 36, 0.5), { tone: "hi", lit: true }));
  knob.push(L(k.knurl(RAIL.x0, RAIL.y, 6, 6, 13, 30, P), "lo"));
  knob.push(L(k.lineOnTop([RAIL.x0 - 4, RAIL.y], [RAIL.x0 + 4, RAIL.y], 13, P), "hi"));
  out.push(`<g data-part="knob" class="hv-knob">${knob.join("")}</g>`);
  // selector: a three-way rotary switch
  const r0 = 13;
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: SELECT.x - r0, y: SELECT.y - r0, w: r0 * 2, d: r0 * 2, r: r0 }, 0, 3, P)}"/>`);
  out.push(S(k.cylinder(SELECT.x, SELECT.y, r0, 0, 3, P, 56, 0.5), { tone: "lo" }));
  out.push(L(k.ring(SELECT.x, SELECT.y, r0 - 2.2, 3, P, 56), "faint"));
  const detents = [-52, 0, 52].map((deg) => (deg * Math.PI) / 180);
  detents.forEach((a, index) => {
    const dots = [];
    for (let j = 0; j <= index; j++) {
      const spread = (j - index / 2) * 0.17;
      dots.push(at([SELECT.x + (r0 - 5) * Math.sin(a + spread), SELECT.y - (r0 - 5) * Math.cos(a + spread), 3]));
    }
    out.push(D(dots, { size: 0.55, tone: "hi" }));
    out.push(L(k.lineOnTop([SELECT.x + (r0 - 2.6) * Math.sin(a), SELECT.y - (r0 - 2.6) * Math.cos(a)], [SELECT.x + (r0 - 0.4) * Math.sin(a), SELECT.y - (r0 - 0.4) * Math.cos(a)], 3, P), "mid"));
  });
  out.push(`<g data-part="select" class="hv-select">${S(k.cylinder(SELECT.x, SELECT.y, 7, 3, 7, P, 40, 0.5), { tone: "hi", lit: true })}${L(k.knurl(SELECT.x, SELECT.y, 7, 3, 10, 28, P), "lo")}<path class="iso-line" data-tone="hi" data-part="pointer" d=""/></g>`);
  // label plate
  const label = { x: 54, y: 100, w: 60, d: 14, r: 1.4 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P, 3), "faint"));
  out.push(L([34, 22, 28].map((w, i) => k.lineOnTop([label.x + 5, label.y + 3.6 + i * 3], [label.x + 5 + w, label.y + 3.6 + i * 3], 0.8, P)).join(""), "lo", { free: true }));
  out.push(D([at([label.x + label.w - 3.2, label.y + label.d / 2, 0.8])], { size: 0.45 }));
  return out.join("");
}

// ---------------------------------------------------------------- recess (screen) helper
let clips = 0;
function recess({ x0, x1, z0, z1, r, depth }, y, backSvg = "", backClass = "hv-well", inside = "") {
  const id = `hv-clip-${clips++}`;
  const ring = k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, 6);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const { sinA } = k.cameraOf(P);
  const tops = [];
  const sides = [[], [], [], []];
  ring.forEach(([ax, az], index) => {
    const [bx, bz] = ring[(index + 1) % ring.length];
    const length = Math.hypot(bx - ax, bz - az) || 1;
    let [nx, nz] = [(bz - az) / length, -(bx - ax) / length];
    if (nx * (cx - (ax + bx) / 2) + nz * (cz - (az + bz) / 2) < 0) [nx, nz] = [-nx, -nz];
    if (nx <= 0 && nz <= 0) return;
    const quad = k.pathOf([at([ax, y, az]), at([bx, y, bz]), at([bx, y - depth, bz]), at([ax, y - depth, az])], true);
    if (nz >= nx) tops.push(quad);
    else sides[Math.min(3, Math.max(0, Math.floor(((nx * -sinA + 1) / 2) * 4)))].push(quad);
  });
  const shape = rectY(x0, x1, z0, z1, r);
  return [
    `<clipPath id="${id}"><path transform="${planeY(y)}" d="${shape}"/></clipPath>`,
    `<g clip-path="url(#${id})">`,
    `<path class="iso-top" d="${tops.join("")}"/>`,
    ...sides.map((d, shade) => (d.length ? `<path class="iso-shade" data-shade="${shade}" d="${d}"/>` : "")),
    `<g transform="${planeY(y - depth)}"><path class="${backClass}" d="${shape}"/>${backSvg}<path class="iso-line" data-tone="faint" d="${shape}"/></g>`,
    inside,
    `</g>`,
    `<g transform="${planeY(y)}"><path class="iso-line" data-tone="lo" d="${shape}"/></g>`,
  ].join("");
}

// ---------------------------------------------------------------- meter
const ROWS = [
  { id: "I", z: 93 },
  { id: "W", z: 83 },
  { id: "K", z: 73 },
  { id: "C", z: 63 },
];
function meter() {
  const out = [];
  const base = { x: 170, y: 4, w: 46, d: 34, r: 6 };
  out.push(`<path class="iso-halo" d="${k.haloOf(base, 0, 4, P)}"/>`);
  out.push(S(k.slabOf(base, 0, 4, P, 8, 0.8), { tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(base, 4), 4, P, 6), "faint"));
  out.push(D([at([178, 12, 4]), at([208, 12, 4]), at([178, 30, 4]), at([208, 30, 4])], { size: 0.45 }));
  out.push(S(k.slabOf({ x: 185, y: 6, w: 16, d: 10, r: 2 }, 4, 44, P, 3, 0.4), { tone: "mid" }));
  out.push(`<g data-part="meter">`);
  out.push(S(k.slabOf({ x: METER.x0, y: METER.y0, w: METER.x1 - METER.x0, d: METER.y1 - METER.y0, r: 3 }, METER.z0, METER.z1 - METER.z0, P, 4, 0.8), { tone: "mid" }));
  out.push(`<g transform="${planeY(METER.y1)}">${L(rectY(METER.x0 + 2, METER.x1 - 2, METER.z0 + 2, METER.z1 - 2, 2.5), "faint")}</g>`);
  const ux0 = SCREEN.x0;
  const ux1 = SCREEN.x1;
  const barX0 = ux0 + 15;
  const barX1 = ux1 - 30;
  const inner = [];
  inner.push(`<text class="hv-text" data-tone="dim" x="${ux0 + 4}" y="${-103.6}" font-size="4.2" data-part="arch">800 V DC</text>`);
  inner.push(`<text class="hv-text" x="${ux1 - 4}" y="${-103.6}" font-size="4.2" text-anchor="end" data-part="power">0 kW</text>`);
  inner.push(L(`M${ux0 - 1} ${-99.4}H${ux1 + 1}`, "faint"));
  const label = { I: "I", W: "LOSS", K: "RISE", C: "CU" };
  for (const row of ROWS) {
    inner.push(`<text class="hv-text" data-tone="dim" x="${ux0 + 4}" y="${-row.z}" font-size="4">${label[row.id]}</text>`);
    inner.push(`<path class="iso-line" data-tone="lo" d="${rr(barX0, -row.z - 3.2, barX1, -row.z + 0.8, 1)}"/>`);
    inner.push(`<rect class="hv-bar" data-bar="${row.id}" x="${barX0 + 0.8}" y="${-row.z - 2.4}" width="0" height="2.4" rx="0.6"/>`);
    inner.push(`<text class="hv-text" data-val="${row.id}" x="${ux1 - 4}" y="${-row.z}" font-size="4" text-anchor="end"></text>`);
  }
  inner.push(`<text class="hv-text" data-part="verdict" x="${(ux0 + ux1) / 2}" y="${-55.6}" font-size="4.2" text-anchor="middle"></text>`);
  const clip = "hv-screen-clip";
  out.push(
    recess(
      SCREEN,
      METER.y1 - 1.6,
      `<g class="hv-content" data-part="content" clip-path="url(#${clip})">${inner.join("")}</g><clipPath id="${clip}"><path d="${rr(SCREEN.x0, -SCREEN.z1, SCREEN.x1, -SCREEN.z0, SCREEN.r)}"/></clipPath>`,
      "hv-glass",
      "",
    ),
  );
  out.push(`<g transform="${planeY(METER.y1)}">${L(rectY(182, 204, 48.2, 51, 1), "faint")}</g>`);
  out.push(`<g data-part="led">${D([at([METER.x1 - 6, METER.y1, 49.5])], { size: 0.8, tone: "hi" })}</g>`);
  out.push(`</g>`);
  return out.join("");
}

// ---------------------------------------------------------------- cabinets
function frame(cab) {
  const { x0, x1 } = cab;
  const posts = [];
  for (const x of [x0, x1 - 5]) posts.push([x, Y1 - 5]); // the back wall carries the rear corners
  // back wall carries the bus; it sits behind the shader plane
  back.push(box(x0, x1, Y0, WALL_Y, Z0 + 5, Z1, { tone: "mid", r: 0.6, steps: 2, bevel: 0.6 }));
  const wall = [];
  wall.push(L(rectY(x0 + 3, x1 - 3, 14, Z1 - 3, 3), "faint"));
  for (let z = 26; z < Z1 - 6; z += 12) wall.push(D([[x0 + 7, -z], [x1 - 7, -z]], { size: 0.4, tone: "lo" }));
  back.push(onPlane(planeY(WALL_Y), wall.join("")));
  // plinth with feet
  put([x0, x1, Y0, Y1, 0, 12], box(x0, x1, Y0, Y1, 0, 12, { tone: "lo", r: 1.4, steps: 3, bevel: 0.5 }) + onPlane(planeY(Y1), L(rectY(x0 + 6, x1 - 6, 3, 9, 2), "faint") + D([[x0 + 4, -6], [x1 - 4, -6]], { size: 0.5 })));
  for (const [x, y] of posts) {
    const front_ = y > 0;
    put([x, x + 5, y, y + 5, 12, Z1], box(x, x + 5, y, y + 5, 12, Z1, { tone: "mid", r: 0.5, steps: 2, bevel: 0.4 }) + (front_ ? onPlane(planeY(y + 5), L(`M${x + 2.5} ${-14}V${-Z1 + 4}`, "faint", { free: true }) + D(Array.from({ length: 18 }, (_, i) => [x + 2.5, -(24 + i * 11.5)]), { size: 0.4, tone: "lo" })) : ""));
  }
  // top rails and cross ties
  put([x0, x1, Y1 - 5, Y1, Z1 - 3, Z1], box(x0, x1, Y1 - 5, Y1, Z1 - 3, Z1, { tone: "mid", r: 0.5, steps: 2, bevel: 0.4 }));
  put([x0, x1, Y0, Y0 + 5, Z1 - 3, Z1], box(x0, x1, Y0, Y0 + 5, Z1 - 3, Z1, { tone: "mid", r: 0.5, steps: 2, bevel: 0.4 }));
}

// a front-face shelf with fans, a handle, status lights and vents
function shelf(id, x0, x1, z0, z1, o = {}) {
  const { fans = 0, vents = 6 } = o;
  const svg = [box(x0, x1, -34, 40, z0, z1, { tone: "mid", r: 1.4, steps: 3, bevel: 0.5 })];
  const face = [L(rectY(x0 + 2.4, x1 - 2.4, z0 + 2.4, z1 - 2.4, 1.6), "faint")];
  const zc = (z0 + z1) / 2;
  let cx = x0 + 11;
  for (let i = 0; i < fans; i++) {
    face.push(fanLocal(`${id}-f${i}`, cx, -zc, Math.min(8.4, (z1 - z0) / 2 - 2.6)));
    cx += 22;
  }
  const slots = [];
  for (let i = 0; i < vents; i++) slots.push(rectY(cx - 6 + i * 4, cx - 3.4 + i * 4, z0 + 5, z1 - 5, 1.2));
  face.push(L(slots.join(""), "faint"));
  // handle and lights at the right end
  face.push(L(rectY(x1 - 17, x1 - 5, zc - 1.4, zc + 1.4, 1.4), "mid"));
  face.push(`<g data-leds="${id}">${[0, 1, 2].map((i) => `<circle class="hv-led" data-led="${id}-${i}" cx="${n2(x1 - 12 + i * 4)}" cy="${n2(-(z1 - 5))}" r="0.8"/>`).join("")}</g>`);
  face.push(D([[x0 + 3.6, -(z0 + 3.6)], [x1 - 3.6, -(z0 + 3.6)]], { size: 0.45 }));
  svg.push(onPlane(planeY(40), face.join("")));
  put([x0, x1, -34, 40, z0, z1], svg.join(""));
}

// a flat comb that taps the three bars and runs to a shelf
function jumper(xFrom, xTo, z, bars) {
  const svg = [box(Math.min(xFrom, xTo), Math.max(xFrom, xTo), BAR_Y1, BAR_Y1 + 4.4, z - 4, z + 4, { tone: "mid", r: 0.6, steps: 2, bevel: 0.3 })];
  svg.push(onPlane(planeY(BAR_Y1 + 4.4), D(bars.map((x) => [x, -z]), { size: 0.55, tone: "hi" })));
  put([Math.min(xFrom, xTo), Math.max(xFrom, xTo), BAR_Y1, BAR_Y1 + 4.4, z - 4, z + 4], svg.join(""));
}

function cabinetA() {
  frame(CAB_A);
  const sx0 = CAB_A.x0 + 10;
  const sx1 = -174;
  // AC input section: breakers, feeders and a gland plate
  const ac = [box(sx0, -124, -34, 40, 12, 58, { tone: "mid", r: 1.4, steps: 3, bevel: 0.5 })];
  const face = [L(rectY(sx0 + 2.4, -126.4, 14.4, 55.6, 1.6), "faint")];
  for (let i = 0; i < 3; i++) {
    const x = sx0 + 12 + i * 26;
    face.push(F(rectY(x, x + 18, 20, 48, 2), "hv-hole"), L(rectY(x, x + 18, 20, 48, 2), "lo"));
    face.push(F(rectY(x + 6, x + 12, 28, 44, 1), "hv-face"), L(rectY(x + 6, x + 12, 28, 44, 1), "mid"));
    face.push(D([[x + 3, -23], [x + 15, -23]], { size: 0.4 }));
  }
  face.push(L(rectY(-176, -132, 22, 46, 2), "faint"), D([[-170, -28], [-166, -28], [-162, -28], [-158, -28]], { size: 0.4, tone: "lo" }));
  ac.push(onPlane(planeY(40), face.join("")));
  put([sx0, -124, -34, 40, 12, 58], ac.join(""));
  // five power shelves
  for (let i = 0; i < 5; i++) {
    const z0 = BUS_Z0_A + 2 + i * 24;
    shelf(`ps${i}`, sx0, sx1, z0, z0 + 22, { fans: 2, vents: 7 });
    jumper(sx1, -126, z0 + 11, BARS.map((b) => b.ax + BARW / 2));
  }
  // three feeder cables across the floor to the input section
  const feeders = [];
  for (let i = 0; i < 3; i++) {
    const x = sx0 + 21 + i * 26;
    const lane = 58 + i * 11;
    feeders.push(cable([[-306, lane, 1.6], [x - 30, lane, 1.8], [x - 4, lane - 4, 1.8], [x, 52, 1.8], [x, 44, 8]], 2.4, `feed${i}`));
    back.push(feeders[i]);
    put([x - 4, x + 4, 40, 46, 12, 22], S(k.slabOf({ x: x - 3, y: 40, w: 6, d: 5, r: 1.6 }, 12, 7, P, 4), { tone: "lo" }) + D([at([x, 45, 17])], { size: 0.5, tone: "hi" }));
  }
}

function cabinetB() {
  frame(CAB_B);
  // 800 V -> 50 V conversion shelf: four modules
  const shelfSvg = [box(-58, 86, -34, 40, 12, 50, { tone: "mid", r: 1.4, steps: 3, bevel: 0.5 })];
  const face = [L(rectY(-55.6, 83.6, 14.4, 47.6, 1.6), "faint")];
  for (let i = 0; i < 4; i++) {
    const x0 = -52 + i * 34;
    face.push(F(rectY(x0, x0 + 30, 16, 46, 2), "hv-hole"), L(rectY(x0, x0 + 30, 16, 46, 2), "lo"));
    const vents = [];
    for (let j = 0; j < 6; j++) vents.push(rectY(x0 + 3 + j * 3.6, x0 + 5.4 + j * 3.6, 20, 34, 1));
    face.push(L(vents.join(""), "faint"));
    face.push(L(rectY(x0 + 4, x0 + 26, 38.5, 41.5, 1.4), "mid"));
    face.push(`<circle class="hv-led" data-led="dc${i}" cx="${x0 + 25}" cy="${-43.2}" r="0.8"/>`);
  }
  shelfSvg.push(onPlane(planeY(40), face.join("")));
  put([-58, 86, -34, 40, 12, 50], shelfSvg.join(""));
  // eight compute trays
  for (let i = 0; i < 6; i++) {
    const z0 = 56 + i * 18;
    const x0 = -54;
    const x1 = 34;
    const svg = [box(x0, x1, -34, 40, z0, z0 + 15, { tone: "hi", r: 1.2, steps: 3, bevel: 0.4 })];
    const f = [L(rectY(x0 + 2, x1 - 2, z0 + 2, z0 + 13, 1.2), "faint")];
    for (let j = 0; j < 4; j++) {
      const cx = x0 + 10 + j * 14;
      f.push(F(circ(cx, -(z0 + 7.5), 4.6), "hv-well"), L(circ(cx, -(z0 + 7.5), 4.6), "lo"), L(circ(cx, -(z0 + 7.5), 2.4), "faint"), D([[cx, -(z0 + 7.5)]], { size: 0.4 }));
    }
    f.push(L(rectY(x1 - 19, x1 - 5, z0 + 6.2, z0 + 8.8, 1.2), "mid"));
    f.push(`<circle class="hv-led" data-led="gpu${i}-0" cx="${x1 - 24}" cy="${-(z0 + 12)}" r="0.8"/><circle class="hv-led" data-led="gpu${i}-1" cx="${x1 - 28}" cy="${-(z0 + 12)}" r="0.8"/>`);
    svg.push(onPlane(planeY(40), f.join("")));
    put([x0, x1, -34, 40, z0, z0 + 15], svg.join(""));
    jumper(x1, 86, z0 + 7.5, BARS.map((b) => b.bx + BARW / 2));
  }
}

// ---------------------------------------------------------------- busbars
const SEGS = [];
function busbars() {
  const out = [];
  // a stanchion in the gap carries the overhead run
  out.push(S(k.slabOf({ x: -94, y: -50, w: 8, d: 7, r: 1.2 }, 0, 226, P, 3, 0.5), { tone: "mid" }));
  out.push(onPlane(planeY(-43), L(rectY(-92, -88, 8, 222, 1), "faint") + D([[-90, -204], [-90, -180], [-90, -156]], { size: 0.5 })));
  for (const b of BARS) {
    const [h0, h1] = b.band;
    const rects = [
      { x0: b.ax, x1: b.ax + BARW, z0: BUS_Z0_A - 4, z1: b.top, seg: "a" },
      { x0: b.ax, x1: b.bx + BARW, z0: h0, z1: h1, seg: "h" },
      { x0: b.bx, x1: b.bx + BARW, z0: BUS_Z0_B, z1: b.top, seg: "b" },
    ];
    const L1 = b.top - 6 - (BUS_Z0_A - 4);
    const H = b.bx - b.ax;
    SEGS.push({ bar: b.i, x0: rects[0].x0, x1: rects[0].x1, z0: rects[0].z0, z1: rects[0].z1, off: 0, axis: 1, ref: rects[0].z0 });
    SEGS.push({ bar: b.i, x0: rects[1].x0, x1: rects[1].x1, z0: rects[1].z0, z1: rects[1].z1, off: L1, axis: 0, ref: b.ax + BARW / 2 });
    SEGS.push({ bar: b.i, x0: rects[2].x0, x1: rects[2].x1, z0: rects[2].z0, z1: rects[2].z1, off: L1 + H, axis: 2, ref: b.top - 6 });
    for (const r of rects) out.push(box(r.x0, r.x1, BAR_Y0, BAR_Y1, r.z0, r.z1, { tone: "hi", r: 0.4, steps: 2, bevel: 0.3, lit: true }));
    // bolted lap joints at the two corners and the terminations
    const bolts = [];
    for (const [cx, cz] of [[b.ax + BARW / 2, (h0 + h1) / 2], [b.bx + BARW / 2, (h0 + h1) / 2]]) for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) bolts.push([cx + dx, -(cz + dz)]);
    for (const x of [b.ax + BARW / 2, b.bx + BARW / 2]) for (const z of [BUS_Z0_A - 1.5, BUS_Z0_B + 2.5]) bolts.push([x - 2.4, -z], [x + 2.4, -z]);
    out.push(onPlane(planeY(BAR_Y1), D(bolts, { size: 0.5, tone: "hi" })));
    out.push(onPlane(planeY(BAR_Y1), L(`M${b.ax + 3} ${-(BUS_Z0_A + 4)}V${-(b.top - 14)}M${b.bx + 3} ${-(b.top - 14)}V${-(BUS_Z0_B + 5)}`, "faint", { free: true })));
  }
  // terminations on the shelves below
  for (const b of BARS) {
    out.push(box(b.ax - 0.5, b.ax + BARW + 0.5, BAR_Y0, BAR_Y1 + 1.4, BUS_Z0_A - 4, BUS_Z0_A, { tone: "lo", r: 0.4, steps: 2 }));
    out.push(box(b.bx - 0.5, b.bx + BARW + 0.5, BAR_Y0, BAR_Y1 + 1.4, BUS_Z0_B, BUS_Z0_B + 3.2, { tone: "lo", r: 0.4, steps: 2 }));
  }
  return out.join("");
}

// A cable is drawn as a dark sleeve with a lighter core, along a smoothed 3D route.
function smoothRoute(points, per = 8) {
  const out = [];
  const p = [points[0], ...points, points[points.length - 1]];
  for (let i = 1; i < p.length - 2; i++) {
    for (let s = 0; s < per; s++) {
      const t = s / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1, 2].map((a) => 0.5 * (2 * p[i][a] + (-p[i - 1][a] + p[i + 1][a]) * t + (2 * p[i - 1][a] - 5 * p[i][a] + 4 * p[i + 1][a] - p[i + 2][a]) * t2 + (-p[i - 1][a] + 3 * p[i][a] - 3 * p[i + 1][a] + p[i + 2][a]) * t3)));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}
function cable(route, width, name) {
  const d = k.pathOf(smoothRoute(route).map(at));
  return `<g class="hv-cable" data-cable="${name}"><path class="hv-sleeve" style="stroke-width:${width + 1.1}px" d="${d}"/><path class="hv-core" style="stroke-width:${width}px" d="${d}"/>${D([at(route[0])], { size: 0.5, tone: "hi" })}</g>`;
}

// ---------------------------------------------------------------- assemble
back.unshift(floor());
back.push(controls());
back.push(meter());
cabinetA();
cabinetB();
const busSvg = busbars();
// the bars belong to the back layer, after the walls
back.splice(back.length - 0, 0, busSvg);

// heat overlay for the no-WebGL fallback: the same rectangles as the shader
const heatRects = SEGS.map((s) => `<path class="hv-heat" data-heat="${s.bar}" d="${rectY(s.x0, s.x1, s.z0, s.z1, 0.4)}"/>`).join("");
back.push(onPlane(planeY(BAR_Y1 + 0.02), `<g class="hv-fallback">${heatRects}</g>`));

const frontOrder = sortFront();
const backSvg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  className: "hv-back",
  label:
    "A power rack and a compute rack side by side on a raised floor, joined by three copper busbars that climb the power rack, cross the gap overhead and come down the compute rack. A slider sets rack power, a three-way switch picks 54 volts DC, 415 volts AC or 800 volts DC, and a meter shows the current, the heat loss and the temperature rise of the busbars.",
  body: back,
});
const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg hv-layer hv-front" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true"><g data-part="racks" class="hv-racks">${frontOrder.map((i) => i.svg).join("")}</g></svg>`;

const DATA = {
  W: WIDTH,
  H: HEIGHT,
  P,
  camera: glCamera(P),
  fans: FANS,
  segs: SEGS,
  planeY: BAR_Y1 + 0.02,
  rail: RAIL,
  select: SELECT,
  screen: { x0: SCREEN.x0, x1: SCREEN.x1 },
  bar: { x0: SCREEN.x0 + 15 + 0.8, x1: SCREEN.x1 - 30 - 0.8 },
  racks: { x0: CAB_A.x0, x1: CAB_B.x1, z0: 6, z1: 232 },
};

const live = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

const css = `<style>
.hv-clip{overflow:hidden}
.hv-stage{position:relative;touch-action:pan-y;outline:none}
.hv-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
@media (max-width:560px){.hv-stage{width:118%;margin-left:-9%}}
.hv-stage>svg,.hv-stage>canvas{display:block;width:100%;height:auto}
.hv-stage>.hv-layer,.hv-stage>.hv-gl{position:absolute;inset:0;height:100%!important;pointer-events:none}
.iso:not([data-theme="light"]) .hv-gl{mix-blend-mode:screen}
.hv-racks{pointer-events:visiblePainted;cursor:default}
.hv-well{fill:var(--anatomy-shade-0)}
.hv-hole{fill:var(--anatomy-shade-0)}
.hv-face{fill:var(--anatomy-top)}
.hv-hub{fill:var(--anatomy-top)}
.hv-glass{fill:var(--anatomy-shade-0);transition:fill .5s var(--anatomy-ease)}
.hv-glass[data-on]{fill:var(--anatomy-lit-shade)}
.hv-blade{fill:var(--anatomy-shade-3);stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight);stroke-linejoin:round}
.hv-blur{fill:var(--anatomy-shade-2);opacity:0}
.hv-led{fill:var(--anatomy-faint);transition:fill .3s var(--anatomy-ease)}
.hv-led[data-on]{fill:var(--anatomy-lit)}
.hv-sleeve{fill:none;stroke:var(--anatomy-mid);stroke-linecap:round;stroke-linejoin:round}
.hv-core{fill:none;stroke:var(--anatomy-shade-2);stroke-linecap:round;stroke-linejoin:round}
.hv-text{fill:var(--anatomy-lit);font-family:var(--anatomy-mono);letter-spacing:.02em}
.hv-text[data-tone="dim"]{fill:var(--anatomy-mid)}
.hv-bar{fill:var(--anatomy-lit);opacity:.9}
.hv-trail{fill:none;stroke:var(--anatomy-lit);stroke-width:1.4px;stroke-linecap:round;vector-effect:non-scaling-stroke;opacity:.8}
.hv-content{transition:opacity .4s var(--anatomy-ease)}
.hv-knob,.hv-select{cursor:grab}
.hv-knob:active{cursor:grabbing}
[data-part="meter"]{cursor:default}
[data-part="led"]{transition:opacity .4s var(--anatomy-ease)}
.hv-heat{fill:var(--hv-heat,#ff7a2a);opacity:0;mix-blend-mode:normal}
.hv-stage[data-gl] .hv-fallback{display:none}
.hv-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
</style>`;

const stage = `<div class="hv-clip"><div class="hv-stage" tabindex="0" role="group" aria-label="800 volt DC power system. Keys 1 to 3 choose 54 volts DC, 415 volts AC or 800 volts DC. Arrow keys change the rack power, drag the knob on the floor to set it.">${backSvg}<canvas class="hv-layer hv-gl" aria-hidden="true"></canvas>${frontSvg}<span class="hv-sr" role="status" aria-live="polite" data-status></span></div></div>`;

const body =
  css +
  k.plateHtml({
    fig: "Fig 4",
    title: "800 V DC power",
    hint: "Drag the knob · keys 1–3 · ←→",
    readout: "800 V DC · 500 kW · 625 A · +3 K",
    keys: [
      { mark: "lit", label: "Current in the bars, drawn moving; thermal colours show their temperature rise" },
      { mark: "raised", label: "Three copper bars, 100 × 10 mm, linking a power rack to a compute rack" },
      { mark: "edge", label: "AC feeders into the power rack" },
      { mark: "flat", label: "Slider: rack power · switch: 54 V DC, 415 V AC, 800 V DC" },
    ],
    caption:
      "The same three copper bars (100 × 10 mm, so 1,000 mm²) carry a rack's power from a power rack to a compute rack. Current is power over voltage, I = P / V (for three-phase AC, P / (√3 · V · 0.95)); a bar settles where its resistive heat, I²R with copper's resistance rising 0.39 % per kelvin, equals what it sheds to the air (12 W per m² per kelvin). At 800 V DC a megawatt is 1,250 A and the bars warm by about 11 K. At 54 V it would be 18,500 A, and the bars run away beyond about 180 kW; to hold that current at 30 K they would need 19,000 mm². The colours are a thermal-camera scale, not glowing metal; in a DC feed the third bar is protective earth and carries nothing.",
    body: stage,
  });

const name = theme === "light" ? "hvdc800-light.html" : "hvdc800.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "800 V DC power", theme, body, width: 920, script: kitScript() + glScript() + modelScript() + live }));
console.log("wrote", name, `${front.length} front items, ${FANS.length} fans, ${SEGS.length} bar segments`);
