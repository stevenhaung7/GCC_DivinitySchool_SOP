// The physics behind the figure: every number on screen comes from here.
// Power draw, case airflow, fan curves and steady-state temperatures for a
// mid-tower with a 125 W CPU, a 285 W GPU and five case fans.

export const LOADS = [
  { id: "idle", name: "idle", cpu: 0.04, gpu: 0.02 },
  { id: "browse", name: "browse", cpu: 0.22, gpu: 0.1 },
  { id: "game", name: "game", cpu: 0.58, gpu: 0.97 },
  { id: "render", name: "render", cpu: 1, gpu: 0.88 },
];

export const AMBIENT = 24;
export const CPU_W = 125;
export const GPU_W = 285;
export const REST_W = 38; // board, memory, SSD, fans
export const PSU_EFFICIENCY = 0.9;
export const CASE_FANS = { count: 3, cfm: 60, rpm: 1500, impedance: 0.7 }; // exhaust fans: 2 top, 1 rear
export const CPU_FAN = { rpm: 1600 };
export const GPU_FAN = { rpm: 2600, zeroBelow: 52 }; // zero-RPM mode below 52 °C

const mclamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const mSmooth = (a, b, x) => {
  const t = mclamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function watts(load) {
  const cpu = 8 + (CPU_W - 8) * load.cpu;
  const gpu = 18 + (GPU_W - 18) * load.gpu;
  const inside = cpu + gpu + REST_W;
  return { cpu, gpu, inside, wall: inside / PSU_EFFICIENCY };
}

// Fan targets as functions of temperature (a real fan curve).
export const caseRpm = (hot) => 450 + 1050 * mSmooth(45, 80, hot);
export const cpuRpm = (t) => 500 + 1100 * mSmooth(40, 85, t);
// Zero-RPM mode with hysteresis: the fans start above 52 °C and stop again below 44 °C.
export const gpuRpm = (t, running = false) => ((running ? t < GPU_FAN.zeroBelow - 8 : t < GPU_FAN.zeroBelow) ? 0 : 900 + 1700 * mSmooth(GPU_FAN.zeroBelow, 84, t));

// Exhaust airflow through the case, and how much it warms the air that passes.
export const airflow = (rpm) => CASE_FANS.count * CASE_FANS.cfm * CASE_FANS.impedance * (rpm / CASE_FANS.rpm); // CFM
export const airRise = (heatW, cfm) => (1.76 * heatW) / Math.max(cfm, 1); // °C, from P = 0.569 * CFM * dT

// Heatsink thermal resistance (°C/W) falls as the fan speeds up.
export const cpuR = (rpm) => 0.22 + 0.45 / (0.35 + rpm / 1000);
export const gpuR = (rpm) => 0.07 + 0.22 / (0.55 + rpm / 1000);

// Instantaneous equilibrium temperatures for given fan speeds.
export function equilibrium(load, rpm, on = true) {
  const w = on ? watts(load) : { cpu: 0, gpu: 0, inside: 0, wall: 0 };
  const rise = airRise(w.inside, airflow(rpm.case));
  const air = AMBIENT + rise;
  return { air, cpu: air + w.cpu * cpuR(rpm.cpu), gpu: air + w.gpu * gpuR(rpm.gpu), watts: w, cfm: airflow(rpm.case) };
}

// Where everything settles if you wait long enough.
export function steady(load) {
  let rpm = { case: 450, cpu: 500, gpu: 0 };
  let t = equilibrium(load, rpm);
  for (let i = 0; i < 80; i++) {
    rpm = { case: caseRpm(Math.max(t.cpu, t.gpu - 4)), cpu: cpuRpm(t.cpu), gpu: gpuRpm(t.gpu, rpm.gpu > 0) };
    t = equilibrium(load, rpm);
  }
  return { ...t, rpm };
}

export function initial() {
  return { cpu: AMBIENT + 2, gpu: AMBIENT + 2, air: AMBIENT, rpm: { case: 0, cpu: 0, gpu: 0 }, cfm: 0, watts: watts(LOADS[0]) };
}

// Advance the lagging state: temperatures follow heat capacity, fans follow their controllers.
export function step(state, load, on, dt) {
  const hot = Math.max(state.cpu, state.gpu - 4);
  const want = on ? { case: caseRpm(hot), cpu: cpuRpm(state.cpu), gpu: gpuRpm(state.gpu, state.rpm.gpu > 0) } : { case: 0, cpu: 0, gpu: 0 };
  const follow = (a, b, tau) => a + (b - a) * (1 - Math.exp(-dt / tau));
  state.rpm = { case: follow(state.rpm.case, want.case, 1.1), cpu: follow(state.rpm.cpu, want.cpu, 1.1), gpu: follow(state.rpm.gpu, want.gpu, 0.9) };
  for (const key of ["case", "cpu", "gpu"]) if (state.rpm[key] < 8 && want[key] === 0) state.rpm[key] = 0;
  const eq = equilibrium(load, state.rpm, on);
  state.air = follow(state.air, eq.air, 2.5);
  state.cpu = follow(state.cpu, eq.cpu, 2.4);
  state.gpu = follow(state.gpu, eq.gpu, 4.5);
  state.cfm = eq.cfm;
  state.watts = eq.watts;
  return state;
}
