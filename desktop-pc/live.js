const D = __DATA__;
const P = D.P;
const stage = document.querySelector(".pc-stage");
const q = (selector) => stage.querySelector(selector);
const qa = (selector) => [...stage.querySelectorAll(selector)];
const readout = document.querySelector("[data-readout]");
const statusEl = document.querySelector("[data-status]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const LIGHT = document.body.dataset.theme === "light" ? 1 : 0;
const MAX_RPM = { gpu: 2600, cpu: 1600, case: 1500 };

// ---------------------------------------------------------------- the machine's state
let loadIndex = 0;
let power = 1;
let model = (() => {
  const s = steady(LOADS[0]);
  return { cpu: s.cpu, gpu: s.gpu, air: s.air, rpm: { ...s.rpm }, cfm: s.cfm, watts: s.watts };
})();
const shown = { cpu: LOADS[0].cpu, gpu: LOADS[0].gpu }; // utilisation, eased
const glow = { x: 1, v: 0 };
const flow = { x: 0, v: 0 };
const heat = { x: 0, v: 0 };
let hueClock = 0.1;
let flowPhase = 0;
let clock = 0;

// ---------------------------------------------------------------- fans
const fans = D.fans.map((fan, index) => ({
  ...fan,
  index,
  angle: (index * 37) % 360,
  rot: q('[data-rot="' + fan.id + '"]'),
  blur: q('[data-blur="' + fan.id + '"]'),
  rgb: q('[data-rgb="' + fan.id + '"]'),
}));
const rgbLines = qa("[data-rgbline]");
const ledRing = q('[data-led="ring"]');
const ledFront = q('[data-led="front"]');
const monLed = q('[data-part="led"]');
const color = (hue, alpha) => "hsl(" + Math.round(hue * 360) + " 85% " + (LIGHT ? 46 : 64) + "% / " + alpha.toFixed(2) + ")";

// ---------------------------------------------------------------- the monitor
const content = q('[data-part="content"]');
const glass = q(".pc-glass");
const modeText = q('[data-part="mode"]');
const graph = q('[data-part="graph"]');
const bars = Object.fromEntries(qa("[data-bar]").map((el) => [el.dataset.bar, el]));
const values = Object.fromEntries(qa("[data-val]").map((el) => [el.dataset.val, el]));
const history = [];
let historyClock = 0;
const BAR_W = D.bar.x1 - D.bar.x0;
function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}
function drawScreen() {
  const on = power || model.rpm.case > 5 || model.watts.wall > 1;
  const wall = model.watts.wall;
  bars.CPU.setAttribute("width", Math.max(0, shown.cpu * BAR_W).toFixed(1));
  bars.GPU.setAttribute("width", Math.max(0, shown.gpu * BAR_W).toFixed(1));
  const fastest = Math.max(model.rpm.case, model.rpm.cpu, model.rpm.gpu);
  bars.FAN.setAttribute("width", Math.max(0, (fastest / 2600) * BAR_W).toFixed(1));
  bars.PWR.setAttribute("width", Math.max(0, Math.min(1, wall / 520) * BAR_W).toFixed(1));
  setText(values.CPU, Math.round(shown.cpu * 100) + "% " + Math.round(model.cpu) + "°");
  setText(values.GPU, Math.round(shown.gpu * 100) + "% " + Math.round(model.gpu) + "°");
  setText(values.FAN, Math.round(fastest / 10) * 10 + " rpm");
  setText(values.PWR, Math.round(wall) + " W");
  setText(modeText, power ? LOADS[loadIndex].name : "off");
  const gx0 = D.graph.x0, gx1 = D.graph.x1, gz0 = D.graph.z0, gz1 = D.graph.z1;
  const n = history.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const x = gx1 - (n - 1 - i) * ((gx1 - gx0) / 59);
    const z = gz0 + 0.6 + Math.min(1, history[i] / 520) * (gz1 - gz0 - 1.2);
    d += (i ? "L" : "M") + x.toFixed(1) + " " + (-z).toFixed(1);
  }
  graph.setAttribute("d", d);
  glass.toggleAttribute("data-on", !!power);
  content.style.opacity = power ? "1" : "0";
  monLed.style.opacity = power ? "" : "0.15";
}

// ---------------------------------------------------------------- the shader
const FRAGMENT = `
uniform vec3 uSrc[7];
uniform float uAct[7];
uniform float uGlow;
uniform float uHue;
uniform float uFlow;
uniform float uPhase;
uniform float uHeat;
uniform float uLight;
const float PY=${D.tray.y.toFixed(2)};
const vec4 BOX=vec4(${D.tray.x0.toFixed(1)},${D.tray.x1.toFixed(1)},${D.tray.z0.toFixed(1)},${D.tray.z1.toFixed(1)});
vec3 hue(float h){vec3 p=abs(fract(vec3(h)+vec3(0.,.6666667,.3333333))*6.-3.);return clamp(p-1.,0.,1.);}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec3 p=onWallY(vb,PY);
  float px=pixelOf();
  float pz=px/uCam.w;
  float m=smoothstep(BOX.x,BOX.x+7.,p.x)*(1.-smoothstep(BOX.y-7.,BOX.y,p.x))*smoothstep(BOX.z,BOX.z+7.,p.z)*(1.-smoothstep(BOX.w-9.,BOX.w,p.z));
  // light from the fans and strips falling on the tray
  vec3 pool=vec3(0.);
  for(int i=0;i<7;i++){
    vec3 d=uSrc[i]-p;
    float r2=dot(d,d);
    float e=uAct[i]*max(d.y,0.)/pow(r2+260.,1.5);
    pool+=hue(fract(uHue+float(i)*.137+p.x*.0042))*e;
  }
  pool*=2200.*uGlow*m;
  // air crossing the board: streamlines climb toward the top and rear exhausts
  float s=BOX.y-p.x;
  float psi=p.z-.42*s;
  float cell=floor(psi/9.);
  psi+=1.5*sin(s*.045+cell*1.7);
  float id=floor(psi/9.);
  float dz=(fract(psi/9.)-.5)*9.*.92;
  float h1=hash12(vec2(id,3.7));
  float h2=hash12(vec2(id,9.1));
  float h3=hash12(vec2(id,1.3));
  float len=mix(34.,84.,h1);
  float ph=fract((s-uPhase*(.65+.7*h2))/len+h3);
  float dash=smoothstep(.02,.34,ph)*(1.-smoothstep(.34,.42,ph));
  float w=.55*pz;
  float line=1.-smoothstep(w,w+pz,abs(dz));
  float lane=smoothstep(.1,.35,h1*.5+h3*.5+.12);
  float edge=smoothstep(0.,24.,s)*(1.-smoothstep(150.,190.,s));
  float sa=line*dash*lane*edge*m*(.2+.8*uFlow)*.85;
  vec3 cool=mix(vec3(.46,.7,1.),vec3(.2,.38,.78),uLight);
  vec3 warm=mix(vec3(1.,.56,.2),vec3(.85,.34,.06),uLight);
  vec3 sc=mix(cool,warm,clamp(uHeat*smoothstep(10.,190.,s)*1.4,0.,1.));
  float noise=(hash12(gl_FragCoord.xy+uTime)-.5)/255.;
  if(uLight<.5){
    vec3 c=tonemap(pool,1.0)+sc*sa;
    float a=max(c.r,max(c.g,c.b));
    gl_FragColor=a>.002?vec4(c+noise,a+noise):vec4(0.);
  }else{
    float pa=(1.-exp(-1.1*(pool.r+pool.g+pool.b)))*.5;
    vec3 pc=pool/(max(max(pool.r,pool.g),pool.b)+1e-4)*.78;
    float aS=sa*.7;
    float a=aS+pa*(1.-aS);
    vec3 c=sc*aS+pc*pa*(1.-aS);
    gl_FragColor=a>.002?vec4(c+noise,a+noise):vec4(0.);
  }
}`;
const layer = glLayer({
  canvas: q(".pc-gl"),
  fragment: FRAGMENT,
  view: [D.W, D.H],
  camera: D.camera,
  uniforms: ["uAct", "uGlow", "uHue", "uFlow", "uPhase", "uHeat"],
  fixed: { uSrc: D.sources.flatMap((source) => source.p), uLight: LIGHT },
});
if (layer) stage.setAttribute("data-gl", "");
const act = new Float32Array(7);

// ---------------------------------------------------------------- keyboard
const KEYS = D.keys;
const keyEls = KEYS.map((_, i) => q('[data-key="' + i + '"]'));
const keyState = KEYS.map(() => ({ at: 0, held: 0 }));
const activeKeys = new Set();
const down = axisVector(P, [0, 0, -1]);
const DOWN = 2.2;
function press(code, hold = 0.12) {
  const i = KEYS.indexOf(code);
  if (i < 0) return;
  keyState[i].held = hold;
  activeKeys.add(i);
  run();
}

// ---------------------------------------------------------------- control
let visible = false;
let frame = 0;
let previous = 0;
let touring = !still.matches;
let idleTimer = 0;
const TOUR = [[0, 3.6], [1, 3.6], [2, 10], [3, 10], [1, 4]];
let tourAt = 0;
let tourWait = 3.2;

function announce() {
  const text = power ? "Load: " + LOADS[loadIndex].name + "." : "Computer off.";
  if (statusEl.textContent !== text) statusEl.textContent = text;
}
function setLoad(index) {
  loadIndex = (index + LOADS.length) % LOADS.length;
  announce();
  run();
}
function setPower(next) {
  power = next ? 1 : 0;
  announce();
  run();
}
function takeOver() {
  touring = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (still.matches) return;
    touring = true;
    tourWait = 1.5;
    run();
  }, 12000);
}

function tick(now) {
  const dt = previous ? Math.min((now - previous) / 1000, 1 / 30) : 1 / 60;
  previous = now;
  const calm = still.matches;
  clock += dt;
  if (touring) {
    tourWait -= dt;
    if (tourWait <= 0) {
      tourAt = (tourAt + 1) % TOUR.length;
      loadIndex = TOUR[tourAt][0];
      tourWait = TOUR[tourAt][1];
      announce();
    }
  }
  const load = LOADS[loadIndex];
  if (calm) {
    const s = steady(load);
    model = { cpu: s.cpu, gpu: s.gpu, air: s.air, rpm: { ...s.rpm }, cfm: s.cfm, watts: s.watts };
    shown.cpu = power ? load.cpu : 0;
    shown.gpu = power ? load.gpu : 0;
  } else {
    step(model, load, !!power, dt);
    shown.cpu += ((power ? load.cpu : 0) - shown.cpu) * (1 - Math.exp(-dt / 0.6));
    shown.gpu += ((power ? load.gpu : 0) - shown.gpu) * (1 - Math.exp(-dt / 0.6));
  }
  const glowMoving = settle(glow, power ? 1 : 0, dt, power ? 0.7 : 0.9, calm);
  const flowMoving = settle(flow, Math.min(1, model.cfm / 126), dt, 0.6, calm);
  const heatMoving = settle(heat, power ? Math.min(1, (model.air - AMBIENT) / 7) : 0, dt, 1.5, calm);

  hueClock += calm ? 0 : dt / 16;
  flowPhase += calm ? 0 : dt * (6 + 70 * flow.x);
  historyClock += dt;
  if (historyClock >= 0.5) {
    historyClock = 0;
    history.push(model.watts.wall);
    if (history.length > 60) history.shift();
  }

  // fans: the picture spins slowly enough to follow while the blur shows the speed
  let spinning = false;
  for (const fan of fans) {
    const rpm = model.rpm[fan.group];
    const norm = rpm / MAX_RPM[fan.group];
    const speed = Math.min(380, (rpm / 1500) * 330);
    if (!calm) fan.angle = (fan.angle + speed * dt) % 360;
    fan.rot.setAttribute("transform", "rotate(" + fan.angle.toFixed(1) + " " + fan.cx + " " + fan.cy + ")");
    const blurAmount = Math.min(1, norm * 1.7);
    fan.blur.style.opacity = (blurAmount * 0.55).toFixed(2);
    fan.rot.style.opacity = (1 - blurAmount * 0.6).toFixed(2);
    const hueOf = (hueClock + fan.index * 0.11) % 1;
    const alpha = glow.x * (0.45 + 0.55 * Math.min(1, norm * 1.4 + 0.2));
    fan.rgb.style.stroke = alpha > 0.02 ? color(hueOf, alpha) : "";
    if (rpm > 1) spinning = true;
  }
  rgbLines.forEach((line, index) => {
    const alpha = glow.x * 0.9;
    line.style.fill = alpha > 0.02 ? color((hueClock + 0.5 + index * 0.09) % 1, alpha) : "";
  });
  ledRing.style.stroke = power ? "var(--anatomy-lit)" : "";
  ledFront.style.fill = power ? "var(--anatomy-lit)" : "";

  // keys
  for (const i of activeKeys) {
    const s = keyState[i];
    s.held = Math.max(0, s.held - dt);
    const want = s.held > 0 ? DOWN : 0;
    s.at = calm ? want : s.at + (want - s.at) * (1 - Math.exp(-dt / (want ? 0.025 : 0.07)));
    if (Math.abs(want - s.at) < 0.01) s.at = want;
    keyEls[i].setAttribute("transform", "translate(" + (down[0] * s.at).toFixed(2) + " " + (down[1] * s.at).toFixed(2) + ")");
    keyEls[i].toggleAttribute("data-down", s.at > 0.6);
    if (!s.held && s.at === 0) activeKeys.delete(i);
  }

  drawScreen();
  const text = power
    ? LOADS[loadIndex].name + " · " + Math.round(model.watts.wall) + " W · " + Math.round(model.cpu) + "° / " + Math.round(model.gpu) + "° · " + Math.round(Math.max(model.rpm.case, model.rpm.cpu, model.rpm.gpu) / 10) * 10 + " rpm"
    : "off · " + (model.rpm.case > 5 || model.cpu > AMBIENT + 4 ? "cooling · " + Math.round(model.cpu) + "°" : "0 W");
  if (readout.textContent !== text) readout.textContent = text;

  if (layer) {
    const lit = glow.x > 0.003;
    for (let i = 0; i < 7; i++) {
      const group = ["gpu", "gpu", "cpu", "case", "case", "case", "case"][i];
      const rpm = i === 6 ? 1500 : model.rpm[group];
      act[i] = i === 6 ? 0.35 : 0.5 + 0.5 * Math.min(1, (rpm / MAX_RPM[group]) * 1.5 + 0.2);
    }
    if (lit || flow.x > 0.003) layer.draw({ uAct: act, uGlow: glow.x, uHue: hueClock, uFlow: flow.x, uPhase: flowPhase, uHeat: heat.x }, calm ? 0.8 : clock);
    else layer.clear();
  }

  const busy = touring || power || spinning || activeKeys.size || glowMoving || flowMoving || heatMoving || model.cpu > AMBIENT + 3.5 || model.gpu > AMBIENT + 3.5;
  frame = visible && busy && !calm ? requestAnimationFrame(tick) : 0;
}
function run() {
  if (!frame && visible) {
    previous = 0;
    frame = requestAnimationFrame(tick);
  }
}

new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);

stage.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key;
  if (key === "Tab") return;
  takeOver();
  const digit = "1234".indexOf(key);
  if (digit >= 0) {
    event.preventDefault();
    press(key);
    if (!power) setPower(1);
    setLoad(digit);
    return;
  }
  if (key === " ") { event.preventDefault(); press(" "); setPower(!power); return; }
  if (key === "Escape") { event.preventDefault(); setPower(0); return; }
  if (key === "ArrowRight" || key === "ArrowUp") { event.preventDefault(); setLoad(loadIndex + 1); return; }
  if (key === "ArrowLeft" || key === "ArrowDown") { event.preventDefault(); setLoad(loadIndex - 1); return; }
  if (key.length === 1) press(key.toLowerCase());
  else if (key === "Enter") press("Enter");
  else if (key === "Backspace") press("Backspace");
});
stage.addEventListener("click", (event) => {
  const target = event.target;
  stage.focus({ preventScroll: true });
  if (target.closest("[data-power]")) { takeOver(); setPower(!power); return; }
  const key = target.closest("[data-key]");
  if (key) {
    takeOver();
    const code = KEYS[Number(key.dataset.key)];
    press(code);
    const digit = "1234".indexOf(code);
    if (digit >= 0) { if (!power) setPower(1); setLoad(digit); }
    else if (code === " ") setPower(!power);
    return;
  }
  if (target.closest('[data-part="monitor"]') || target.closest('[data-part="tower"]')) {
    takeOver();
    if (!power) setPower(1);
    else setLoad(loadIndex + 1);
  }
});

for (let i = 0; i < 60; i++) history.push(model.watts.wall);
announce();
drawScreen();
tick(performance.now());
