// The numbers behind the figure: what one pair of busbars has to carry at 54 V DC, 415 V AC and 800 V DC.
// Everything is textbook: I = P / V, loss = I^2 R, and a bar settles where its heat loss equals what it sheds to the air.

export const ARCHS = [
  { id: "dc54", name: "54 V DC", volts: 54, ac: false, live: [1, 1, 0] }, // + and -, third bar is earth
  { id: "ac415", name: "415 V AC", volts: 415, ac: true, live: [1, 1, 1] }, // three phases
  { id: "dc800", name: "800 V DC", volts: 800, ac: false, live: [1, 1, 0] },
];

export const BAR = { widthMm: 100, thickMm: 10 }; // the copper bar every cabinet is built with
export const RHO = 1.72e-8; // copper, ohm metre at 20 C
export const ALPHA = 0.0039; // per kelvin
export const H = 12; // W / m^2 K, natural convection plus radiation
export const PF = 0.95; // power factor of the 415 V AC feed
export const J_LIMIT = 100; // kelvin rise we call the limit for insulation and joints
export const REF_RISE = 30; // rise used to size copper for comparison
export const MIN_KW = 50;
export const MAX_KW = 1000;

const areaM2 = (BAR.widthMm * BAR.thickMm) / 1e6;
const perimeterM = (2 * (BAR.widthMm + BAR.thickMm)) / 1000;

export function current(arch, kw) {
  const watts = kw * 1000;
  return arch.ac ? watts / (Math.sqrt(3) * arch.volts * PF) : watts / arch.volts;
}

// Steady temperature rise of the bar. The loss grows with temperature (copper gets more resistive),
// so there is a current beyond which no steady state exists: the bar runs away.
export function heatRise(amps) {
  const loss0 = (amps * amps * RHO) / areaM2; // W per metre at 20 C
  const cool = H * perimeterM; // W per metre per kelvin
  const denominator = cool - loss0 * ALPHA;
  if (denominator <= 0) return { loss: loss0, rise: Infinity, runaway: true };
  return { loss: loss0 / (1 - (loss0 * ALPHA) / cool) , rise: loss0 / denominator, runaway: false };
}

// Copper section that would hold the same current at REF_RISE, with a bar that keeps a 10:1 shape.
export function copperFor(amps) {
  const rho = RHO * (1 + ALPHA * REF_RISE);
  const shape = 2 * (Math.sqrt(10) + 1 / Math.sqrt(10)); // perimeter = shape * sqrt(area)
  const area = Math.pow((amps * amps * rho) / (H * shape * REF_RISE), 2 / 3);
  return area * 1e6; // mm^2
}

export function solve(arch, kw) {
  const amps = current(arch, kw);
  const heat = heatRise(amps);
  return {
    amps,
    loss: heat.loss,
    rise: heat.rise,
    runaway: heat.runaway,
    copper: copperFor(amps),
    ratio: copperFor(amps) / (BAR.widthMm * BAR.thickMm),
  };
}

// The largest power one bar pair carries before it passes J_LIMIT kelvin.
export function reach(arch) {
  let lo = MIN_KW;
  let hi = 20000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const s = solve(arch, mid);
    if (s.runaway || s.rise > J_LIMIT) hi = mid;
    else lo = mid;
  }
  return lo;
}
