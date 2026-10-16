import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";
import { glCamera } from "./kit/gl.mjs";
import { kitScript, glScript, modelScript } from "./kit/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 820;
const HEIGHT = 560;

// ---------------------------------------------------------------- world
// The tower is turned so its open side faces +y (toward the viewer's left face), the
// same way the monitor's screen faces. Along x it runs front (-98) to rear (+98).
const TX = -110;
const R = (l) => TX - l; // l grows toward the rear, which is the left end of the tower
const TOWER = { x0: R(98), x1: R(-98), y0: -46, y1: 46, z0: 5, z1: 235 };
// the x range of a stretch of the tower, inset from both ends, ascending
const Rin = (l0, l1, inset = 0) => [R(l1) + inset, R(l0) - inset];
const TRAY_Y = -43; // inner face of the motherboard tray
const PCB_Y = -41.4;
const DESK = { x: -232, y: -104, w: 470, d: 214, r: 10 };
const DESK_H = 10;
const FOOT_H = 5;

const MON = { x0: 24, x1: 180, y0: -48, y1: -40, z0: 70, z1: 176 };
const SCREEN = { x0: 29, x1: 175, z0: 85, z1: 171, r: 2.5, depth: 1.6 };
const KB = { x: 48, y: 0, w: 144, d: 50, r: 3 };
const KB_Z = 1.6;
const KB_TOP = 8.6;
const U = 9.2;
const KEYS_X = KB.x + (KB.w - U * 15) / 2;
const KEYS_Y = KB.y + 2.5;

const P = k.fitProjection(
  [...k.boxCorners(DESK, -DESK_H - FOOT_H, 0), ...k.boxCorners({ x: TOWER.x0, y: TOWER.y0, w: TOWER.x1 - TOWER.x0, d: 92 }, 0, 236), ...k.boxCorners({ x: MON.x0, y: MON.y0, w: 156, d: 8 }, 0, MON.z1)],
  WIDTH,
  HEIGHT,
  { pad: 16, azimuth: 60, elevation: 30 },
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
  r = Math.max(0, Math.min(r, (u1 - u0) / 2, (v1 - v0) / 2));
  if (!r) return `M${n2(u0)} ${n2(v0)}H${n2(u1)}V${n2(v1)}H${n2(u0)}Z`;
  return `M${n2(u0 + r)} ${n2(v0)}H${n2(u1 - r)}A${r} ${r} 0 0 1 ${n2(u1)} ${n2(v0 + r)}V${n2(v1 - r)}A${r} ${r} 0 0 1 ${n2(u1 - r)} ${n2(v1)}H${n2(u0 + r)}A${r} ${r} 0 0 1 ${n2(u0)} ${n2(v1 - r)}V${n2(v0 + r)}A${r} ${r} 0 0 1 ${n2(u0 + r)} ${n2(v0)}Z`;
};
const circ = (cx, cy, r) => `M${n2(cx - r)} ${n2(cy)}a${r} ${r} 0 1 0 ${n2(2 * r)} 0a${r} ${r} 0 1 0 ${n2(-2 * r)} 0Z`;
// Rounded rectangles in each face plane, from world ranges.
const rectY = (x0, x1, z0, z1, r) => rr(x0, -z1, x1, -z0, r); // plane y = const
const rectX = (y0, y1, z0, z1, r) => rr(-y1, -z1, -y0, -z0, r); // plane x = const
const rectZ = (x0, x1, y0, y1, r) => rr(x0, y0, x1, y1, r); // plane z = const

const planOf = (l0, l1, t0, t1, r = 1) => ({ x: R(l1), y: t0, w: l1 - l0, d: t1 - t0, r });
let uid = 0;
// A solid box in tower coordinates: l along the length, t across, z up.
function box(l0, l1, t0, t1, z0, z1, o = {}) {
  const plan = { x: R(l1), y: t0, w: l1 - l0, d: t1 - t0, r: o.r ?? 1 };
  const paths = k.slabOf(plan, z0, z1 - z0, P, o.steps ?? 3, o.bevel ?? 0);
  return S(paths, { tone: o.tone ?? "mid", crease: o.crease, lit: o.lit, inner: o.inner });
}
const worldBox = (x0, x1, y0, y1, z0, z1, o = {}) => {
  const plan = { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r: o.r ?? 1 };
  return S(k.slabOf(plan, z0, z1 - z0, P, o.steps ?? 3, o.bevel ?? 0), { tone: o.tone ?? "mid", crease: o.crease, inner: o.inner });
};

// ---------------------------------------------------------------- fans
const FANS = [];
function bladePath(cx, cy, r0, r1, count, sweep, wide) {
  let d = "";
  for (let i = 0; i < count; i++) {
    const base = (i / count) * Math.PI * 2;
    const lead = [];
    const trail = [];
    for (let j = 0; j <= 7; j++) {
      const u = j / 7;
      const r = r0 + (r1 - r0) * u;
      const a = base + sweep * u;
      lead.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    for (let j = 7; j >= 0; j--) {
      const u = j / 7;
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

// A fan drawn in whatever face plane the caller wraps it in. (cx, cy, R) are local plane coordinates.
function fanLocal(id, group, cx, cy, Rr, o = {}) {
  const blades = o.blades ?? 9;
  const r0 = Rr * (o.hub ?? 0.3);
  const r1 = Rr * 0.9;
  const parts = [];
  parts.push(F(circ(cx, cy, Rr), "pc-well"));
  parts.push(`<g data-rot="${id}"><path class="pc-blade" d="${bladePath(cx, cy, r0 * 0.9, r1, blades, 0.95, 0.62)}"/></g>`);
  parts.push(`<circle class="pc-blur" data-blur="${id}" cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r1)}"/>`);
  if (o.grille) {
    for (const f of [0.38, 0.66, 0.94]) parts.push(L(circ(cx, cy, Rr * f), "lo"));
    let spokes = "";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      spokes += `M${ptOnCircle(cx, cy, r0, a)}L${ptOnCircle(cx, cy, Rr, a)}`;
    }
    parts.push(L(spokes, "lo"));
  } else {
    let struts = "";
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      struts += `M${ptOnCircle(cx, cy, r0, a)}L${ptOnCircle(cx, cy, Rr, a)}`;
    }
    parts.push(L(struts, "faint"));
  }
  parts.push(L(circ(cx, cy, Rr), "lo"));
  parts.push(`<circle class="pc-rgb" data-rgb="${id}" cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(Rr - 1.1)}"/>`);
  parts.push(F(circ(cx, cy, r0), "pc-hub"));
  parts.push(L(circ(cx, cy, r0), "mid"));
  parts.push(D([[cx, cy]], { size: 0.5, tone: "hi" }));
  FANS.push({ id, group, cx: n2(cx), cy: n2(cy), r: n2(Rr) });
  return `<g data-fan="${id}">${parts.join("")}</g>`;
}

// ---------------------------------------------------------------- tower: back layer
const back = [];
const front = [];
// Items are boxes. A box is drawn before another when something separates them along an axis
// with the viewer on the other side (the viewer is toward +x, +y and +z), so thin panels
// and tall parts order correctly where their centres would not.
const putWorld = (b, svg) => front.push({ b, svg, centre: [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2] });
const putFront = ([l0, l1, t0, t1, z0, z1], svg) => putWorld([R(l1), R(l0), t0, t1, z0, z1], svg);
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

// -- desk
function desk() {
  const out = [`<path class="iso-halo" d="${k.haloOf(DESK, -DESK_H - FOOT_H, DESK_H, P)}"/>`];
  const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of byDepth(k.corners(DESK, 22))) {
    out.push(S(k.cylinder(x, y, 7, -DESK_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -DESK_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(DESK, -DESK_H, DESK_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(DESK, 5), 0, P), "faint"));
  const screws = k.corners(DESK, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), "lo"));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // ruler strip along the near edge
  const strip = { x: -214, y: 94, w: 280, d: 8, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, "lo"), L(ticks.major, "mid"));
  // label plate
  const label = { x: 150, y: 90, w: 60, d: 12, r: 1.4 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P, 3), "faint"));
  out.push(L([34, 22, 28].map((w, i) => k.lineOnTop([label.x + 5, label.y + 3.2 + i * 2.6], [label.x + 5 + w, label.y + 3.2 + i * 2.6], 0.8, P)).join(""), "lo", { free: true }));
  out.push(D([at([label.x + label.w - 3.2, label.y + label.d / 2, 0.8]), at([label.x + 3, label.y + label.d - 2, 0.8])], { size: 0.45 }));
  return out.join("");
}

// -- monitor
let clips = 0;
function recess({ x0, x1, z0, z1, r, depth }, y, backSvg = "", backClass = "pc-well", inside = "") {
  const id = `pc-clip-${clips++}`;
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

const SCR_Y = MON.y1 - 1.6;
function monitor() {
  const out = [];
  const nx0 = 94;
  const nx1 = 110;
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: 70, y: -66, w: 64, d: 42, r: 8 }, 0, 4, P)}"/>`);
  out.push(S(k.slabOf({ x: 70, y: -66, w: 64, d: 42, r: 8 }, 0, 4, P, 8, 0.8), { tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan({ x: 70, y: -66, w: 64, d: 42, r: 8 }, 4), 4, P, 6), "faint"));
  out.push(D([at([78, -58, 4]), at([126, -58, 4]), at([78, -32, 4]), at([126, -32, 4])], { size: 0.45 }));
  out.push(S(k.slabOf({ x: nx0, y: -64, w: nx1 - nx0, d: 16, r: 2 }, 4, 70, P, 3, 0.4), { tone: "mid" }));
  out.push(`<g data-part="monitor">`);
  out.push(S(k.slabOf({ x: MON.x0, y: MON.y0, w: MON.x1 - MON.x0, d: MON.y1 - MON.y0, r: 3 }, MON.z0, MON.z1 - MON.z0, P, 4, 0.8), { tone: "mid" }));
  out.push(`<g transform="${planeY(MON.y1)}">${L(rectY(MON.x0 + 2, MON.x1 - 2, MON.z0 + 2, MON.z1 - 2, 2.5), "faint")}</g>`);
  out.push(screen());
  // chin: mark, led, buttons
  const chin = (MON.z0 + SCREEN.z0) / 2;
  out.push(`<g transform="${planeY(MON.y1)}">${L(rectY(86, 118, chin - 2.4, chin + 2.4, 1.2), "faint")}${D([[(MON.x0 + MON.x1) / 2, -chin]].map(([x, y]) => [x, y]), { size: 0.6, tone: "lo" })}</g>`);
  out.push(`<g data-part="led">${D([at([MON.x1 - 9, MON.y1, chin])], { size: 0.85, tone: "hi" })}</g>`);
  out.push(D([at([MON.x1 - 17, MON.y1, chin]), at([MON.x1 - 22, MON.y1, chin]), at([MON.x1 - 27, MON.y1, chin])], { size: 0.5, tone: "mid" }));
  out.push(`</g>`);
  return out.join("");
}

const LABEL_SIZE = 4.6;
function screen() {
  const inner = [];
  const ux0 = SCREEN.x0;
  const ux1 = SCREEN.x1;
  const rows = [
    { name: "CPU", z: 151 },
    { name: "GPU", z: 139 },
    { name: "FAN", z: 127 },
    { name: "PWR", z: 115 },
  ];
  const barX0 = ux0 + 17;
  const barX1 = ux1 - 36;
  inner.push(`<text class="pc-text" data-tone="dim" x="${ux0 + 5}" y="${-162}" font-size="${LABEL_SIZE}" data-part="title">SYSTEM</text>`);
  inner.push(`<text class="pc-text" x="${ux1 - 5}" y="${-162}" font-size="${LABEL_SIZE}" text-anchor="end" data-part="mode">idle</text>`);
  inner.push(L(`M${ux0 - 1} ${-158}H${ux1 + 1}`, "faint"));
  for (const row of rows) {
    inner.push(`<text class="pc-text" data-tone="dim" x="${ux0 + 5}" y="${-row.z}" font-size="${LABEL_SIZE}">${row.name}</text>`);
    inner.push(`<path class="iso-line pc-bar-frame" data-tone="lo" d="${rr(barX0, -row.z - 3.4, barX1, -row.z + 0.8, 1)}"/>`);
    inner.push(`<rect class="pc-bar" data-bar="${row.name}" x="${barX0 + 0.8}" y="${-row.z - 2.6}" width="0" height="2.6" rx="0.6"/>`);
    inner.push(`<text class="pc-text" data-val="${row.name}" x="${ux1 - 5}" y="${-row.z}" font-size="${LABEL_SIZE}" text-anchor="end"></text>`);
  }
  // power history graph
  const gx0 = ux0 + 5;
  const gx1 = ux1 - 5;
  const gz0 = SCREEN.z0 + 5;
  const gz1 = gz0 + 20;
  inner.push(`<path class="iso-line" data-tone="faint" d="${rr(gx0, -gz1, gx1, -gz0, 1.2)}"/>`);
  for (const f of [0.33, 0.66]) inner.push(L(`M${gx0} ${-(gz0 + (gz1 - gz0) * f)}H${gx1}`, "faint"));
  inner.push(`<path class="pc-graph" data-part="graph" d=""/>`);
  const clip = `pc-screen-clip`;
  return recess(
    SCREEN,
    SCR_Y + 0,
    `<g class="pc-content" data-part="content" clip-path="url(#${clip})">${inner.join("")}</g><clipPath id="${clip}"><path d="${rr(SCREEN.x0, -SCREEN.z1, SCREEN.x1, -SCREEN.z0, SCREEN.r)}"/></clipPath>`,
    "pc-glass",
    "",
  );
}

// -- keyboard and mouse
const ROWS = [
  [["`", 1], ["1", 1], ["2", 1], ["3", 1], ["4", 1], ["5", 1], ["6", 1], ["7", 1], ["8", 1], ["9", 1], ["0", 1], ["-", 1], ["=", 1], ["Backspace", 2]],
  [["Tab", 1.5], ["q", 1], ["w", 1], ["e", 1], ["r", 1], ["t", 1], ["y", 1], ["u", 1], ["i", 1], ["o", 1], ["p", 1], ["[", 1], ["]", 1], ["\\", 1.5]],
  [["CapsLock", 1.75], ["a", 1], ["s", 1], ["d", 1], ["f", 1], ["g", 1], ["h", 1], ["j", 1], ["k", 1], ["l", 1], [";", 1], ["'", 1], ["Enter", 2.25]],
  [["Shift", 2.25], ["z", 1], ["x", 1], ["c", 1], ["v", 1], ["b", 1], ["n", 1], ["m", 1], [",", 1], [".", 1], ["/", 1], ["ShiftRight", 2.75]],
  [["Alt", 1.5], ["Meta", 1.5], [" ", 9], ["NumpadEnter", 1.5], ["AltRight", 1.5]],
];
const ROW_H = [5.6, 5.2, 4.8, 4.4, 4];
const keyList = [];
function keyboard() {
  const out = [`<path class="iso-halo" d="${k.haloOf(KB, 0, 4, P)}"/>`];
  const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of byDepth(k.corners(KB, 8))) out.push(S(k.cylinder(x, y, 2.8, 0, KB_Z, P, 16), { tone: "lo" }));
  out.push(S(k.slabOf(KB, KB_Z, KB_TOP - KB_Z, P, 6, 1), { tone: "mid" }));
  const well = { x: KEYS_X - 1.4, y: KEYS_Y - 1.4, w: U * 15 + 2.8, d: U * 5 + 2.8, r: 2 };
  out.push(L(k.planOutline(well, KB_TOP, P, 4), "lo"));
  out.push(D([at([KB.x + 4, KB.y + 2.4, KB_TOP]), at([KB.x + KB.w - 4, KB.y + 2.4, KB_TOP])], { size: 0.45 }));
  ROWS.forEach((row, r) => {
    let x = KEYS_X;
    for (const [code, width] of row) {
      const plan = { x: x + 0.7, y: KEYS_Y + r * U + 0.7, w: width * U - 1.4, d: U - 1.4, r: 1.4 };
      const h = ROW_H[r];
      const index = keyList.length;
      keyList.push(code);
      const dish = k.planOutline(k.insetPlan(plan, code === " " ? 1.8 : 1.6), KB_TOP + h, P, 3);
      out.push(`<g class="pc-key" data-key="${index}">${S(k.slabOf(plan, KB_TOP, h, P, 3, 0.4), { tone: "mid", crease: "faint" })}${L(dish, "faint")}</g>`);
      x += width * U;
    }
  });
  return out.join("");
}

function mouse() {
  const m = { x: 206, y: 8, w: 16, d: 28, r: 7 };
  const out = [`<path class="iso-halo" d="${k.haloOf(m, 0, 3, P)}"/>`];
  out.push(S(k.slabOf(m, 0, 4.6, P, 8, 0.9), { tone: "mid" }));
  out.push(L(k.lineOnTop([m.x + m.w / 2, m.y + m.d - 1.2], [m.x + m.w / 2, m.y + m.d - 13], 4.6, P), "lo"));
  out.push(L(k.planOutline({ x: m.x + 1.6, y: m.y + m.d - 13, w: m.w - 3.2, d: 11.6, r: 5 }, 4.6, P, 6), "faint"));
  out.push(S(k.slabOf({ x: m.x + m.w / 2 - 1, y: m.y + m.d - 10, w: 2, d: 4.4, r: 0.9 }, 4.6, 0.8, P, 3), { tone: "lo", crease: "none" }));
  out.push(D([at([m.x + m.w / 2, m.y + 5, 4.6])], { size: 0.5, tone: "mid" }));
  return out.join("");
}

// -- the tower: back layer (tray, board, things that lie on the tray)
function towerBack() {
  const out = [];
  const plan = { x: TOWER.x0, y: TOWER.y0, w: TOWER.x1 - TOWER.x0, d: 92, r: 4 };
  out.push(`<path class="iso-halo" d="${k.haloOf(plan, 0, 8, P)}"/>`);
  const feet = k.corners({ ...plan, x: plan.x + 6, w: plan.w - 12 }, 10);
  feet.sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  // feet go in the front layer with the shell (they hide the tray corners)
  for (const [x, y] of feet) {
    putWorld([x - 6.2, x + 6.2, y - 6.2, y + 6.2, 0, 5], S(k.cylinder(x, y, 6.2, 0, 1.6, P, 24), { tone: "lo" }) + S(k.cylinder(x, y, 4.8, 1.6, TOWER.z0 - 1.6, P, 24), { tone: "mid" }));
  }
  // tray slab, full length between the end panels
  out.push(box(-95, 95, -46, TRAY_Y, TOWER.z0, TOWER.z1, { tone: "mid", r: 0.6, steps: 2, bevel: 0.6 }));
  // tray face details (plane y = TRAY_Y)
  const tray = [];
  // cable-management cut-outs with rubber grommets
  for (const [l0, l1, z0, z1] of [[-62, -46, 112, 152], [-62, -46, 62, 100], [76, 90, 192, 214]]) {
    tray.push(F(rectY(R(l0), R(l1), z0, z1, 3), "pc-hole"));
    tray.push(L(rectY(R(l0), R(l1), z0, z1, 3), "lo"));
    tray.push(L(rectY(R(l0) + 1.6, R(l1) - 1.6, z0 + 1.6, z1 - 1.6, 2), "faint"));
  }
  // ventilation perforations along the bottom of the visible tray
  const holes = [];
  for (let i = 0; i < 18; i++) for (let j = 0; j < 2; j++) holes.push(at([R(-56 + i * 5), TRAY_Y, 52 - j * 3.4]));
  tray.push(`<g class="pc-flat">${D(holes, { size: 0.45, tone: "lo" })}</g>`);
  out.push(tray.join("").replace(/^/, `<g class="pc-tray-detail">`) + "</g>");
  // PCB
  out.push(box(-10, 90, TRAY_Y, PCB_Y, 56, 186, { tone: "lo", r: 1.6, steps: 3 }));
  const board = [];
  board.push(F(rectY(R(-10), R(90), 56, 186, 1.6), "pc-pcb"));
  board.push(L(rectY(R(-10), R(90), 56, 186, 1.6), "lo"));
  board.push(L(rectY(...Rin(-10, 90, 2.6), 58.6, 183.4, 1), "faint"));
  const standoffs = [[-6, 60], [-6, 182], [42, 60], [42, 182], [86, 60], [86, 182], [-6, 121], [42, 121], [86, 121]];
  board.push(L(standoffs.map(([l, z]) => circ(R(l), -z, 2.3)).join(""), "lo"));
  board.push(D(standoffs.map(([l, z]) => [R(l), -z]), { size: 0.55, tone: "hi" }));
  // traces that run between the parts and end tucked under them
  const traces = [
    [[34, 140], [34, 126], [28, 120], [22, 118]],
    [[10, 150], [10, 123]],
    [[78, 150], [70, 150]],
    [[30, 170], [18, 180]],
    [[80, 100], [80, 70]],
  ];
  for (const t of traces) board.push(L(`M${t.map(([l, z]) => `${n2(R(l))} ${-z}`).join("L")}`, "faint"));
  out.push(onPlane(planeY(PCB_Y), board.join("")));
  // 24-pin ATX cable runs down the tray to its gland (lies against the tray, behind the card)
  out.push(cable([[-7, -39.5, 112], [-16, -39.5, 116], [-26, -39.5, 110], [-30, -39.5, 98], [-30, -39.5, 56], [-30, -39.5, 51.5]], 2.6, "atx"));
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
function cable(routeL, width, name, worldX = false) {
  const world = routeL.map(([l, t, z]) => [worldX ? l : R(l), t, z]);
  const d = k.pathOf(smoothRoute(world).map(at));
  const ends = [world[0], world[world.length - 1]];
  return `<g class="pc-cable" data-cable="${name}"><path class="pc-sleeve" style="stroke-width:${width + 1.1}px" d="${d}"/><path class="pc-core" style="stroke-width:${width}px" d="${d}"/>${D([at(ends[0])], { size: 0.5, tone: "hi" })}</g>`;
}

// -- the tower: front layer. Everything that stands in front of the tray, sorted by depth.
function psuShroud() {
  const l0 = -36;
  const l1 = 95;
  const t0 = TRAY_Y;
  const t1 = 40;
  const z0 = 9;
  const z1 = 48;
  const svg = [];
  svg.push(box(l0, l1, t0, t1, z0, z1, { tone: "mid", r: 2, steps: 4, bevel: 0.8 }));
  // vent slots on the open-side face (plane y = t1)
  const slots = [];
  for (let l = -28; l <= 84; l += 8) slots.push(rectY(R(l), R(l) + 3.2, z0 + 8, z1 - 8, 1.6));
  svg.push(onPlane(planeY(t1), L(slots.join(""), "faint") + L(rectY(...Rin(l0, l1, 3), z0 + 3.6, z1 - 3.6, 3), "faint")));
  // top face: label plate, cable glands, cut-outs
  const label = planOf(52, 86, -14, 0, 1.6);
  svg.push(S(k.slabOf(label, z1, 0.8, P, 3), { tone: "lo", crease: "none" }));
  svg.push(L(k.planOutline(k.insetPlan(label, 1.6), z1 + 0.8, P, 3), "faint"));
  svg.push(L([22, 14, 18].map((w, i) => k.lineOnTop([label.x + label.w - 5, label.y + 3.6 + i * 3], [label.x + label.w - 5 - w, label.y + 3.6 + i * 3], z1 + 0.8, P)).join(""), "lo", { free: true }));
  svg.push(L(k.planOutline(planOf(6, 42, -33, -21, 3), z1, P, 4), "faint"));
  svg.push(L(k.planOutline(planOf(6, 42, -8, 0, 2.4), z1, P, 4), "faint"));
  svg.push(box(-34, -26, -40, -32, z1, z1 + 3, { tone: "lo", r: 1.4, steps: 3 }));
  svg.push(D([at([R(-30), -36, z1 + 3])], { size: 0.5, tone: "hi" }));
  return svg.join("");
}

function gpu() {
  const body = { l0: -12, l1: 92, t0: -26, t1: -4, z0: 56, z1: 104 };
  // the upright that carries the card's front end
  putFront([-22, -12, TRAY_Y, -26, 56, 104], box(-22, -12, TRAY_Y, -26, 56, 104, { tone: "lo", r: 1, steps: 2, bevel: 0.4 }) + onPlane(planeY(-26), L(rectY(R(-20), R(-14), 62, 98, 1), "faint") + D([[R(-17), -66], [R(-17), -94]], { size: 0.5 })));
  // the shroud
  const faceY = body.t1;
  const wells = [];
  const centres = [{ id: "gpu1", l: 18 }, { id: "gpu2", l: 66 }];
  for (const c of centres) wells.push(fanLocal(c.id, "gpu", R(c.l), -80, 22.5, { blades: 11, hub: 0.32 }));
  const face = [];
  face.push(L(rectY(...Rin(body.l0, body.l1, 2.4), body.z0 + 2.4, body.z1 - 2.4, 2), "faint"));
  face.push(L(`M${R(-6)} ${-60}H${R(0)}M${R(82)} ${-60}H${R(88)}`, "lo", { free: true }));
  face.push(`<path class="pc-rgb-fill" data-rgbline="gpuedge" d="${rectY(R(90), R(-4), 99.6, 101.8, 1)}"/>`);
  face.push(wells.join(""));
  // inner trim lines tie the fans to the shroud edge
  face.push(L(`M${R(-12) - 2.4} ${-80}H${R(18) + 22.5}M${R(18) - 22.5} ${-80}H${R(66) + 22.5}M${R(66) - 22.5} ${-80}H${R(92) + 2.4}`, "faint"));
  const gpuSvg = [];
  gpuSvg.push(box(body.l0, body.l1, body.t0, body.t1, body.z0, body.z1, { tone: "hi", r: 2.5, steps: 4, bevel: 0.6 }));
  gpuSvg.push(onPlane(planeY(faceY), face.join("")));
  // top face: vents, power sockets
  const vents = [];
  for (let i = 0; i < 7; i++) vents.push(rectZ(R(30 + i * 8), R(30 + i * 8) + 3.2, -22, -8, 1.4));
  gpuSvg.push(onPlane(planeZ(body.z1), L(vents.join(""), "faint") + L(rectZ(...Rin(body.l0, body.l1, 2.4), body.t0 + 2.4, body.t1 - 2.4, 2), "faint")));
  gpuSvg.push(box(0, 13, -21, -8, body.z1, body.z1 + 5, { tone: "lo", r: 1.2, steps: 3, bevel: 0.3 }));
  gpuSvg.push(onPlane(planeZ(body.z1 + 5), L(rectZ(R(1.8), R(11.2), -19.2, -9.8, 0.8), "faint") + D([[R(4), -17], [R(9), -17], [R(4), -12], [R(9), -12]], { size: 0.4 })));
  // gpu power cable goes up behind the lid
  const cableSvg = cable([[6.5, -14.5, 109], [6.5, -14.5, 130], [7.5, -14.5, 160], [7.5, -14.5, 196]], 2.4, "pcie", false);
  putFront([-12, 92, -26, -4, 56, 109], gpuSvg.join(""));
  putFront([5.3, 8.7, -15.7, -13.3, 109, 197], cableSvg);
  // the card's I/O bracket, screwed to the rear panel from inside
  const bracket = box(92, 95, -26, -4, 50, 108, { tone: "lo", r: 0.8, steps: 2 });
  const fixings = onPlane(planeX(R(92)), L(rectX(-24.6, -5.4, 52.4, 105.6, 1), "faint") + L(rectX(-22, -8, 62, 66, 1) + rectX(-22, -8, 70, 74, 1) + rectX(-22, -8, 78, 82, 1) + rectX(-22, -8, 86, 90, 1), "faint") + D([[15, -54.4], [15, -103.6]], { size: 0.5 }));
  putFront([92, 95, -26, -4, 50, 108], bracket + fixings);
}

function cooler() {
  const out = [];
  // base plate and clamp lie on the board
  out.push(box(44, 62, PCB_Y, -36, 138, 162, { tone: "lo", r: 1.2, steps: 3 }));
  // fin stack: edges of the fins show on its +x face; the outer fin is the +y face
  out.push(box(38, 68, -40, 0, 118, 176, { tone: "mid", r: 1.2, steps: 3, bevel: 0.6 }));
  const edges = [];
  for (let y = -38; y <= -2; y += 3) edges.push(`M${-y} ${-118}V${-176}`);
  out.push(onPlane(planeX(R(38)), L(edges.join(""), "faint")));
  // outer fin: heat-pipe ends and a cap
  out.push(box(38, 68, 0, 2.6, 120, 174, { tone: "hi", r: 1.4, steps: 3, bevel: 0.5 }));
  const cap = [];
  cap.push(L(rectY(R(65), R(41), 123, 171, 1.4), "faint"));
  const hp = [];
  for (let i = 0; i < 4; i++) hp.push(circ(R(44 + i * 5.6), -131, 1.9));
  cap.push(L(hp.join(""), "lo"), D(hp.map((_, i) => [R(44 + i * 5.6), -131]), { size: 0.5 }));
  cap.push(L(`M${R(42)} ${-150}H${R(62)}M${R(42)} ${-156}H${R(62)}M${R(42)} ${-162}H${R(54)}`, "lo", { free: true }));
  out.push(onPlane(planeY(2.6), cap.join("")));
  const topFace = [];
  for (let y = -38; y <= -2; y += 3) topFace.push(`M${R(68)} ${y}H${R(38)}`);
  for (let i = 0; i < 4; i++) topFace.push(circ(R(44.5 + i * 6), -22, 1.7));
  out.push(onPlane(planeZ(176), L(topFace.join(""), "faint") + D([0, 1, 2, 3].map((i) => [R(44.5 + i * 6), -22]), { size: 0.5 })));
  putFront([38, 68, PCB_Y, 2.6, 118, 176], out.join(""));
  // 92 mm fan on the front side of the stack, pushing air through the fins toward the rear
  const frame = box(29.5, 38, -40, 0, 126, 166, { tone: "mid", r: 2, steps: 3, bevel: 0.4 });
  const faceX = R(29.5);
  const fan = fanLocal("cpu", "cpu", 20, -146, 18, { blades: 7, hub: 0.3 });
  const corners = [[-37, 129], [-3, 129], [-37, 163], [-3, 163]].map(([y, z]) => [-y, -z]);
  const trim = L(rectX(-38.4, -1.6, 127.6, 164.4, 2), "faint") + D(corners, { size: 0.55 });
  putFront([29.5, 38, -40, 0, 126, 166], frame + onPlane(planeX(faceX), trim + fan));
}

function memory() {
  const slotL = [9, 13.5, 18, 22.5];
  const filled = [1, 3];
  slotL.forEach((l, i) => {
    const isFilled = filled.includes(i);
    if (!isFilled) {
      putFront([l - 1.5, l + 1.5, PCB_Y, -39.6, 124, 178], box(l - 1.5, l + 1.5, PCB_Y, -39.6, 124, 178, { tone: "lo", r: 0.4, steps: 2 }) + onPlane(planeZ(178), L(rectZ(R(l) - 0.6, R(l) + 0.6, -41, -40, 0.3), "faint")));
    } else {
      const svg = [];
      svg.push(box(l - 1.5, l + 1.5, PCB_Y, -26.4, 122, 181, { tone: "mid", r: 0.5, steps: 2, bevel: 0.3 }));
      // heat-spreader seams and a light slot on the +y face (plane y = -26.4)
      svg.push(onPlane(planeY(-26.4), L(`M${R(l) - 1.5} ${-130}H${R(l) + 1.5}M${R(l) - 1.5} ${-174}H${R(l) + 1.5}`, "faint") + `<path class="pc-rgb-fill" data-rgbline="ram${i}" d="${rectY(R(l) - 0.5, R(l) + 0.5, 134, 170, 0.5)}"/>`));
      putFront([l - 1.5, l + 1.5, PCB_Y, -26.4, 122, 181], svg.join(""));
    }
  });
}

function boardParts() {
  // M.2 SSD with a heatsink
  const ssd = box(-6, 24, PCB_Y, -37.2, 113, 119, { tone: "mid", r: 0.8, steps: 2, bevel: 0.3 });
  putFront([-6, 24, PCB_Y, -37.2, 113, 119], ssd + onPlane(planeY(-37.2), L(`M${R(-3)} ${-114.6}H${R(21)}M${R(-3)} ${-117.4}H${R(21)}`, "faint") + D([[R(-4.4), -116], [R(22.4), -116]], { size: 0.45 })));
  // 24-pin ATX socket
  putFront([-10, -4, PCB_Y, -36, 112, 150], box(-10, -4, PCB_Y, -36, 112, 150, { tone: "lo", r: 0.8, steps: 2 }) + onPlane(planeY(-36), L(rectY(R(-9), R(-5), 114, 148, 0.6), "faint")));
  // 8-pin CPU power socket and its cable
  putFront([12, 28, PCB_Y, -36, 182, 186], box(12, 28, PCB_Y, -36, 182, 186, { tone: "lo", r: 0.8, steps: 2 }) + onPlane(planeZ(186), L(rectZ(R(14), R(26), -40.4, -37, 0.6), "faint")));
  putFront([17.9, 20.1, -39.1, -36.9, 186, 213], cable([[19, -38, 186], [19, -38, 198], [19, -38, 212]], 2.2, "eps"));
  // VRM heatsinks: rear I/O shroud and the top bar
  const rear = box(78, 90, PCB_Y, -30, 96, 186, { tone: "mid", r: 0, steps: 1, bevel: 0.5 });
  const fins = [];
  for (let z = 104; z <= 180; z += 4) fins.push(`M${R(78)} ${-z}H${R(90)}`);
  putFront([78, 90, PCB_Y, -30, 96, 186], rear + onPlane(planeY(-30), L(fins.join(""), "faint")) + L(k.segment([R(78), -30, 96], [R(78), -30, 186], P), "faint"));
  const top = box(30, 78, PCB_Y, -33, 178, 186, { tone: "mid", r: 0, steps: 1, bevel: 0.4 });
  const ribs = [];
  for (let l = 33; l <= 76; l += 3) ribs.push(`M${R(l)} ${-178}V${-186}`);
  putFront([30, 78, PCB_Y, -33, 178, 186], top + onPlane(planeY(-33), L(ribs.join(""), "faint")));
  // chipset heatsink sits behind the card; PCIe slot is hidden too
}

function lid() {
  const l0 = -98;
  const l1 = 98;
  const svg = [];
  svg.push(box(l0, l1, -46, 46, 232, 235, { tone: "mid", r: 3, steps: 4, bevel: 1 }));
  const top = [];
  // two exhaust fans
  top.push(fanLocal("top1", "case", R(6), 0, 24, { blades: 9, grille: true, hub: 0.25 }));
  top.push(fanLocal("top2", "case", R(66), 0, 24, { blades: 9, grille: true, hub: 0.25 }));
  top.push(L(rectZ(...Rin(-96, 98, 2.4), -43.6, 43.6, 2.4), "faint"));
  // front I/O: power button, USB, audio
  top.push(L(rectZ(R(-86), R(-36), -34, -6, 2), "faint"));
  const vents = [];
  for (let i = 0; i < 6; i++) vents.push(rectZ(R(-80), R(-42), -30 + i * 4.2, -28.2 + i * 4.2, 0.9));
  top.push(L(vents.join(""), "faint"));
  top.push(`<g data-power class="pc-power"><circle class="pc-hit" cx="${R(-70)}" cy="26" r="9"/>${F(circ(R(-70), 26, 4.6), "pc-face")}${L(circ(R(-70), 26, 4.6), "hi")}${L(circ(R(-70), 26, 2.4), "lo")}<circle class="pc-ring" data-led="ring" cx="${R(-70)}" cy="26" r="6.8"/></g>`);
  top.push(L(rectZ(R(-56), R(-47.5), 24.4, 28, 0.7) + rectZ(R(-44), R(-35.5), 24.4, 28, 0.7) + rectZ(R(-31), R(-25), 24.6, 27.8, 1.6) + circ(R(-17), 26.2, 1.7), "mid"));
  top.push(D([[R(-52), 26.2], [R(-40), 26.2], [R(-17), 26.2]], { size: 0.4 }));
  svg.push(onPlane(planeZ(235), top.join("")));
  putFront([-98, 98, -46, 46, 232, 235], svg.join(""));
}

function rearPanel() {
  // the rear panel is the left end of the tower: we see its inner face, with the exhaust fan on it
  const svg = [];
  svg.push(box(95, 98, -46, 46, TOWER.z0, TOWER.z1, { tone: "mid", r: 0.6, steps: 2, bevel: 0.5 }));
  const face = [];
  face.push(F(rectX(-30, 30, 138, 192, 3), "pc-hole"));
  face.push(L(rectX(-30, 30, 138, 192, 3), "lo"));
  // rear I/O shield for the board
  face.push(L(rectX(-41, -24, 110, 186, 1.6), "lo"));
  const io = [];
  for (let i = 0; i < 4; i++) io.push(rectX(-39.2, -34.8, 176 - i * 8, 180 - i * 8, 0.8) + rectX(-31.6, -27.2, 176 - i * 8, 180 - i * 8, 0.8));
  io.push(rectX(-39.6, -26.6, 138, 150, 1.2), rectX(-39.6, -26.6, 118, 130, 1.2));
  face.push(L(io.join(""), "faint"));
  // expansion slot covers: only the card's bracket is fitted, the rest are blank
  const slots = [];
  for (let z = 52; z <= 108; z += 7) slots.push(`M-38 ${-z}H38`);
  face.push(L(slots.join(""), "faint"));
  face.push(L(rectX(-38, 38, 50, 108, 1.2), "lo"));
  face.push(D([[-34, -112], [34, -112], [-34, -46], [34, -46], [-36, -134], [36, -134], [-36, -196], [36, -196]], { size: 0.45 }));
  svg.push(onPlane(planeX(R(95)), face.join("")));
  putFront([95, 98, -46, 46, 5, 235], svg.join(""));
  // exhaust fan on a frame bolted to the inside of the panel
  const frame = box(87, 95, -23, 23, 142, 188, { tone: "mid", r: 2, steps: 3, bevel: 0.4 });
  const screws = [[-20, 145], [20, 145], [-20, 185], [20, 185]].map(([y, z]) => [-y, -z]);
  const fan = fanLocal("rear", "case", 0, -165, 20, { blades: 9, grille: true, hub: 0.26 });
  putFront([87, 95, -23, 23, 142, 188], frame + onPlane(planeX(R(87)), L(rectX(-21.4, 21.4, 143.6, 186.4, 1.6), "faint") + D(screws, { size: 0.55 }) + fan));
}

function frontPanel() {
  // the right end of the tower: its outside face is the front, with the air intake mesh
  const svg = [box(-98, -95, -46, 46, TOWER.z0, TOWER.z1, { tone: "mid", r: 0.6, steps: 2, bevel: 0.5 })];
  const face = [];
  face.push(L(rectX(-40, 40, 14, 214, 3), "lo"));
  const mesh = [];
  for (let i = 0; i < 13; i++) for (let j = 0; j < 36; j++) mesh.push([-36 + i * 6, -(20 + j * 5.4)]);
  face.push(D(mesh, { size: 0.42, tone: "lo" }));
  face.push(L(rectX(-30, 30, 218, 228, 2), "faint"));
  face.push(`<circle class="pc-led-dot" data-led="front" cx="30" cy="${-223}" r="0.9"/>`);
  face.push(L(`M-22 ${-223}H8`, "lo", { free: true }));
  svg.push(onPlane(planeX(R(-98)), face.join("")));
  putFront([-98, -95, -46, 46, 5, 235], svg.join(""));
}

function floor() {
  putFront([-95, 95, -46, 46, 5, 9], box(-95, 95, -46, 46, TOWER.z0, 9, { tone: "lo", r: 0.6, steps: 2 }));
}

// the monitor cable runs over the desk, behind the tower, to the card's ports at the rear
function monitorCable() {
  const run = [[102, -62, 16], [102, -68, 8], [102, -72, 2], [88, -92, 1.6], [30, -98, 1.6], [-120, -98, 1.6], [-196, -84, 1.6], [-214, -56, 4], [-214, -22, 52], [-214, -15, 92]];
  return cable(run, 2.2, "dp", true);
}

// ---------------------------------------------------------------- assemble
const bodyBack = [];
bodyBack.push(desk());
bodyBack.push(monitorCable());
bodyBack.push(monitor());
bodyBack.push(keyboard());
bodyBack.push(mouse());
bodyBack.push(towerBack());

floor();
frontPanel();
putFront([-36, 95, TRAY_Y, 40, 9, 51], psuShroud());
gpu();
cooler();
memory();
boardParts();
rearPanel();
lid();

const frontOrder = sortFront();
const backSvg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  className: "pc-back",
  label:
    "A desktop computer on a bench: a mid-tower with its side panel off showing a motherboard, a tower CPU cooler, two memory sticks, a vertically mounted graphics card with two fans, a power-supply shroud and exhaust fans in the lid, a monitor that shows the machine's power and temperatures, a keyboard and a mouse.",
  body: bodyBack,
});
const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg pc-layer pc-front" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true"><g data-part="tower" class="pc-tower">${frontOrder.map((i) => i.svg).join("")}</g></svg>`;

// ---------------------------------------------------------------- shader data
const SOURCES = [
  { id: "gpu1", p: [R(18), -4, 80], act: 0 },
  { id: "gpu2", p: [R(66), -4, 80], act: 1 },
  { id: "cpu", p: [R(72.5), -20, 146], act: 2 },
  { id: "top1", p: [R(6), 0, 234], act: 3 },
  { id: "top2", p: [R(66), 0, 234], act: 4 },
  { id: "rear", p: [R(87), 0, 165], act: 5 },
  { id: "ram", p: [R(19), -33, 180.5], act: 6 },
];
const DATA = {
  W: WIDTH,
  H: HEIGHT,
  P,
  camera: glCamera(P),
  fans: FANS,
  keys: keyList,
  tray: { y: PCB_Y + 0.05, x0: R(95), x1: R(-95), z0: 9, z1: 233 },
  sources: SOURCES,
  mon: { x0: SCREEN.x0, x1: SCREEN.x1, z0: SCREEN.z0, z1: SCREEN.z1 },
  graph: { x0: SCREEN.x0 + 5, x1: SCREEN.x1 - 5, z0: SCREEN.z0 + 5, z1: SCREEN.z0 + 25 },
  bar: { x0: SCREEN.x0 + 17 + 0.8, x1: SCREEN.x1 - 36 - 0.8 },
};

const live = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

const css = `<style>
.pc-clip{overflow:hidden}
.pc-stage{position:relative;touch-action:pan-y;outline:none}
@media (max-width:560px){.pc-stage{width:116%;margin-left:-8%}}
.pc-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
.pc-stage>svg,.pc-stage>canvas{display:block;width:100%;height:auto}
.pc-stage>.pc-layer,.pc-stage>.pc-gl{position:absolute;inset:0;height:100%!important;pointer-events:none}
.iso:not([data-theme="light"]) .pc-gl{mix-blend-mode:screen}
.pc-tower{pointer-events:visiblePainted}
.pc-well{fill:var(--anatomy-shade-0)}
.pc-hole{fill:var(--anatomy-shade-0)}
.pc-pcb{fill:var(--anatomy-shade-1)}
.pc-face{fill:var(--anatomy-top)}
.pc-hub{fill:var(--anatomy-top)}
.pc-glass{fill:var(--anatomy-shade-0);transition:fill .5s var(--anatomy-ease)}
.pc-glass[data-on]{fill:var(--anatomy-lit-shade)}
.pc-blade{fill:var(--anatomy-shade-3);stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight);stroke-linejoin:round}
.pc-blur{fill:var(--anatomy-shade-2);opacity:0}
.pc-rgb{fill:none;stroke:var(--anatomy-faint);stroke-width:1.5px;vector-effect:non-scaling-stroke}
.pc-rgb-fill{fill:var(--anatomy-faint);stroke:none}
.pc-ring{fill:none;stroke:var(--anatomy-faint);stroke-width:1.3px;vector-effect:non-scaling-stroke}
.pc-hit{fill:transparent;pointer-events:all}
.pc-led-dot{fill:var(--anatomy-faint);transition:fill .4s var(--anatomy-ease)}
.pc-power{cursor:pointer}
.pc-sleeve{fill:none;stroke:var(--anatomy-mid);stroke-linecap:round;stroke-linejoin:round}
.pc-core{fill:none;stroke:var(--anatomy-shade-2);stroke-linecap:round;stroke-linejoin:round}
.pc-text{fill:var(--anatomy-lit);font-family:var(--anatomy-mono);letter-spacing:.02em}
.pc-text[data-tone="dim"]{fill:var(--anatomy-mid)}
.pc-bar{fill:var(--anatomy-lit);opacity:.9}
.pc-graph{fill:none;stroke:var(--anatomy-lit);stroke-width:1.1px;vector-effect:non-scaling-stroke;stroke-linejoin:round}
.pc-content{transition:opacity .4s var(--anatomy-ease)}
.pc-key,.pc-tower [data-part="tower"]{cursor:pointer}
.pc-key[data-down] .iso-edge{stroke:var(--anatomy-hi)}
[data-part="monitor"]{cursor:pointer}
[data-part="led"]{transition:opacity .4s var(--anatomy-ease)}
.pc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.pc-fallback{opacity:.55}
.pc-stage[data-gl] .pc-fallback{display:none}
</style>`;

const fallback = (() => {
  const lines = [];
  for (let i = 0; i < 7; i++) {
    const z0 = 40 + i * 24;
    lines.push(L(k.pathOf([[R(-90), TRAY_Y + 0.2, z0], [R(-30), TRAY_Y + 0.2, z0 + 20], [R(30), TRAY_Y + 0.2, z0 + 38], [R(88), TRAY_Y + 0.2, z0 + 62]].map(at)), "lo", { flow: true }));
  }
  return lines.join("");
})();
const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg pc-layer pc-fallback" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">${fallback}</svg>`;

const stage = `<div class="pc-clip"><div class="pc-stage" tabindex="0" role="group" aria-label="Desktop computer. Press 1 to 4 to change what it is doing, Space to switch it on or off.">${backSvg}<canvas class="pc-layer pc-gl" aria-hidden="true"></canvas>${fallbackSvg}${frontSvg}<span class="pc-sr" role="status" aria-live="polite" data-status></span></div></div>`;

const body =
  css +
  k.plateHtml({
    fig: "Fig 3",
    title: "Desktop computer",
    hint: "Keys 1–4 · click · Space",
    readout: "idle · 82 W · 37° / 38° · 500 rpm",
    keys: [
      { mark: "lit", label: "The monitor and the fans' light: what the machine reports and what moves" },
      { mark: "raised", label: "A tower with its side off: board, cooler, memory, card, power supply" },
      { mark: "edge", label: "Cables to the board, and a display cable to the card" },
      { mark: "flat", label: "Air entering at the front, rising to the exhaust fans" },
    ],
    caption:
      "A desktop computer, opened. Press 1 to 4 (idle, browse, game, render) or click it to step through loads: the monitor reads CPU and GPU load, fan speed and wall power, and everything is computed from one small thermal model. Watts become heat, heat becomes temperature through each heatsink, and the fan curves answer with speed: the graphics card's fans stay stopped until it passes 52 °C. The air that crosses the board is drawn from the case's real airflow and warms as it goes. Temperatures in the readout are CPU / GPU. Space switches the machine off; the fans spin down and the light fades.",
    body: stage,
  });

const name = theme === "light" ? "desktop-pc-light.html" : "desktop-pc.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Desktop computer", theme, body, width: 900, script: kitScript() + glScript() + modelScript() + live }));
console.log("wrote", name, `${front.length} front items, ${keyList.length} keys, ${FANS.length} fans`);
