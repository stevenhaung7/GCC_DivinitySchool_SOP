const D = __DATA__;
const P = D.P;
const stage = document.querySelector(".hv-stage");
const q = (selector) => stage.querySelector(selector);
const qa = (selector) => [...stage.querySelectorAll(selector)];
const readout = document.querySelector("[data-readout]");
const statusEl = document.querySelector("[data-status]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const LIGHT = document.body.dataset.theme === "light" ? 1 : 0;

// ---------------------------------------------------------------- state
let archIndex = 2;
let kwTarget = 500;
const kwNow = { x: 500, v: 0 };
const heatNow = { x: 0, v: 0 };
const mixAc = { x: 0, v: 0 };
const actNow = [{ x: 1, v: 0 }, { x: 1, v: 0 }, { x: 0, v: 0 }];
const heatBars = [{ x: 0, v: 0 }, { x: 0, v: 0 }, { x: 0, v: 0 }];
let phase = 0;
let clock = 0;

// ---------------------------------------------------------------- elements
const knob = q('[data-part="knob"]');
const trail = q('[data-part="trail"]');
const pointer = q('[data-part="pointer"]');
const contentEl = q('[data-part="content"]');
const glass = q(".hv-glass");
const meterLed = q('[data-part="led"]');
const archText = q('[data-part="arch"]');
const powerText = q('[data-part="power"]');
const verdict = q('[data-part="verdict"]');
const bars = Object.fromEntries(qa("[data-bar]").map((el) => [el.dataset.bar, el]));
const values = Object.fromEntries(qa("[data-val]").map((el) => [el.dataset.val, el]));
const heatOverlays = qa("[data-heat]");
const leds = qa("[data-led]");
const fans = D.fans.map((fan, index) => ({ ...fan, index, angle: (index * 41) % 360, rot: q('[data-rot="' + fan.id + '"]'), blur: q('[data-blur="' + fan.id + '"]') }));
const BAR_W = D.bar.x1 - D.bar.x0;
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };

// ---------------------------------------------------------------- shader
const SEGS = D.segs;
const FRAGMENT = `
uniform vec4 uRect[9];
uniform vec4 uInfo[9];
uniform float uHeat[3];
uniform float uAct[3];
uniform float uPhase;
uniform float uAC;
uniform float uLight;
const float PY=${D.planeY.toFixed(2)};
vec3 thermal(float t){
  vec3 c0=vec3(.10,.25,.95);vec3 c1=vec3(.0,.8,.9);vec3 c2=vec3(.25,.85,.3);vec3 c3=vec3(1.,.88,.1);vec3 c4=vec3(1.,.33,.05);vec3 c5=vec3(1.,.95,.9);
  float x=clamp(t,0.,1.)*5.;
  if(x<1.)return mix(c0,c1,x);
  if(x<2.)return mix(c1,c2,x-1.);
  if(x<3.)return mix(c2,c3,x-2.);
  if(x<4.)return mix(c3,c4,x-3.);
  return mix(c4,c5,x-4.);
}
float sdBox(vec2 p,vec2 c,vec2 h){vec2 q=abs(p-c)-h;return length(max(q,0.))+min(max(q.x,q.y),0.);}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec3 p=onWallY(vb,PY);
  float px=pixelOf()/uCam.w;
  vec3 heatCol=vec3(0.);float heatA=0.;float haloA=0.;
  float pulse=0.;
  for(int b=0;b<3;b++){
    float h=uHeat[b];
    float act=uAct[b];
    float dir=b==1?-1.:1.;
    vec3 tc=thermal(h);
    float hf=smoothstep(.015,.1,h);
    for(int j=0;j<3;j++){
      vec4 r=uRect[b*3+j];
      vec4 inf=uInfo[b*3+j];
      vec2 c=vec2((r.x+r.y)*.5,(r.z+r.w)*.5);
      vec2 hs=vec2((r.y-r.x)*.5,(r.w-r.z)*.5);
      float d=sdBox(p.xz,c,hs);
      float m=1.-smoothstep(-.7*px,.7*px,d);
      float halo=exp(-max(d,0.)/6.)*(1.-m);
      float ax=inf.z;
      float s=inf.y+(ax<.5?p.x-inf.w:(ax<1.5?p.z-inf.w:inf.w-p.z));
      float f=fract((s*dir-uPhase)/40.);
      float dc=smoothstep(0.,.2,f)*(1.-smoothstep(.2,.3,f));
      float ac=.5+.5*sin(6.2832*s/70.-uPhase*.15*dir+float(b)*2.0944);
      float pl=mix(dc,ac*ac,uAC)*act;
      heatCol=mix(heatCol,tc,m*hf);
      heatA=max(heatA,m*hf);
      haloA=max(haloA,halo*hf);
      pulse=max(pulse,m*pl);
    }
  }
  float noise=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233))+uTime)*43758.5453)-.5)/255.;
  if(uLight<.5){
    vec3 c=heatCol*heatA*.8+heatCol*haloA*.35+vec3(.6,.85,1.)*pulse*.9;
    float a=max(c.r,max(c.g,c.b));
    gl_FragColor=a>.002?vec4(c+noise,a+noise):vec4(0.);
  }else{
    float aH=heatA*.62+haloA*.2;
    vec3 cH=heatCol*.82;
    float aP=pulse*.7;
    vec3 cP=vec3(.08,.2,.62);
    float a=aP+aH*(1.-aP);
    vec3 c=cP*aP+cH*aH*(1.-aP);
    gl_FragColor=a>.002?vec4(c+noise,a+noise):vec4(0.);
  }
}`;
const layer = glLayer({
  canvas: q(".hv-gl"),
  fragment: FRAGMENT,
  view: [D.W, D.H],
  camera: D.camera,
  uniforms: ["uHeat", "uAct", "uPhase", "uAC"],
  fixed: {
    uRect: SEGS.flatMap((s) => [s.x0, s.x1, s.z0, s.z1]),
    uInfo: SEGS.flatMap((s) => [s.bar, s.off, s.axis, s.ref]),
    uLight: LIGHT,
  },
});
if (layer) stage.setAttribute("data-gl", "");
const heatArray = new Float32Array(5);
const actArray = new Float32Array(5);

// ---------------------------------------------------------------- input
const ax = axisVector(P, [1, 0, 0]);
const ay = axisVector(P, [0, 1, 0]);
const det = ax[0] * ay[1] - ax[1] * ay[0];
const homeScreen = iso([D.rail.x0, D.rail.y, 3], P);
function worldAt(event) {
  const svg = stage.querySelector("svg");
  const box = svg.getBoundingClientRect();
  const sx = ((event.clientX - box.left) / box.width) * D.W - homeScreen[0];
  const sy = ((event.clientY - box.top) / box.height) * D.H - homeScreen[1];
  const x = (sx * ay[1] - sy * ay[0]) / det;
  const y = (ax[0] * sy - ax[1] * sx) / det;
  return { x: D.rail.x0 + x, y: D.rail.y + y };
}
const RAIL_LEN = D.rail.x1 - D.rail.x0;
const KW_MIN = MIN_KW;
const KW_MAX = MAX_KW;
const clampKw = (value) => Math.min(KW_MAX, Math.max(KW_MIN, Math.round(value / 10) * 10));
let dragging = false;
let touring = !still.matches;
let idleTimer = 0;
function pick(index) {
  archIndex = (index + ARCHS.length) % ARCHS.length;
  announce();
  run();
}
function setKw(value) {
  kwTarget = clampKw(value);
  run();
}
function announce() {
  const text = ARCHS[archIndex].name + ", " + kwTarget + " kilowatts.";
  if (statusEl.textContent !== text) statusEl.textContent = text;
}
function takeOver() {
  touring = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (still.matches) return;
    touring = true;
    tourWait = 1;
    run();
  }, 14000);
}
stage.addEventListener("pointerdown", (event) => {
  const w = worldAt(event);
  const onRail = w.x > D.rail.x0 - 14 && w.x < D.rail.x1 + 14 && Math.abs(w.y - D.rail.y) < 16;
  const onSelect = Math.hypot(w.x - D.select.x, w.y - D.select.y) < 17;
  if (!onRail && !onSelect) return;
  stage.focus({ preventScroll: true });
  takeOver();
  if (onSelect) { pick(archIndex + 1); return; }
  dragging = true;
  setKw(KW_MIN + ((w.x - D.rail.x0) / RAIL_LEN) * (KW_MAX - KW_MIN));
  stage.setPointerCapture?.(event.pointerId);
});
stage.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const w = worldAt(event);
  setKw(KW_MIN + ((w.x - D.rail.x0) / RAIL_LEN) * (KW_MAX - KW_MIN));
});
const release = () => { dragging = false; };
stage.addEventListener("pointerup", release);
stage.addEventListener("pointercancel", release);
stage.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key;
  const big = event.shiftKey ? 250 : 50;
  if (key === "Tab") return;
  takeOver();
  if ("123".includes(key) && key.length === 1) { event.preventDefault(); pick(Number(key) - 1); }
  else if (key === " ") { event.preventDefault(); pick(archIndex + 1); }
  else if (key === "ArrowRight" || key === "ArrowUp") { event.preventDefault(); setKw(kwTarget + big); }
  else if (key === "ArrowLeft" || key === "ArrowDown") { event.preventDefault(); setKw(kwTarget - big); }
  else if (key === "Home") { event.preventDefault(); setKw(KW_MIN); }
  else if (key === "End") { event.preventDefault(); setKw(KW_MAX); }
});

// ---------------------------------------------------------------- the tour
const TOUR = [[2, 300], [2, 1000], [1, 1000], [0, 100], [0, 170], [0, 400], [2, 1000]];
let tourAt = 0;
let tourWait = 3;

let visible = false;
let frame = 0;
let previous = 0;

function fmtAmps(a) { return a >= 10000 ? (a / 1000).toFixed(1) + " kA" : Math.round(a) + " A"; }
function fmtLoss(w) { return w >= 1000 ? (w / 1000).toFixed(1) + " kW/m" : (w >= 100 ? Math.round(w) : w.toFixed(1)) + " W/m"; }
function fmtRise(s) { return s.runaway ? "runaway" : s.rise >= 300 ? ">300 K" : "+" + (s.rise >= 10 ? Math.round(s.rise) : s.rise.toFixed(1)) + " K"; }

function tick(now) {
  const dt = previous ? Math.min((now - previous) / 1000, 1 / 30) : 1 / 60;
  previous = now;
  const calm = still.matches;
  clock += dt;
  if (touring) {
    tourWait -= dt;
    if (tourWait <= 0) {
      tourAt = (tourAt + 1) % TOUR.length;
      archIndex = TOUR[tourAt][0];
      kwTarget = TOUR[tourAt][1];
      tourWait = 4.2;
      announce();
    }
  }
  const arch = ARCHS[archIndex];
  const moving = settle(kwNow, kwTarget, dt, 0.45, calm);
  const kw = kwNow.x;
  const sol = solve(arch, kw);
  const targetHeat = sol.runaway ? 1 : Math.min(1, sol.rise / 120);
  let busy = moving;
  for (let b = 0; b < 3; b++) {
    busy = settle(heatBars[b], arch.live[b] ? targetHeat : 0, dt, 0.5, calm) || busy;
    busy = settle(actNow[b], arch.live[b] ? 1 : 0, dt, 0.5, calm) || busy;
  }
  busy = settle(mixAc, arch.ac ? 1 : 0, dt, 0.5, calm) || busy;
  const speed = 28 + 70 * Math.min(1, Math.sqrt(sol.amps / 3000));
  phase += calm ? 0 : dt * speed;

  // controls
  const dx = ((kw - KW_MIN) / (KW_MAX - KW_MIN)) * RAIL_LEN;
  knob.setAttribute("transform", translateAlong(P, [dx, 0, 0]));
  trail.setAttribute("d", lineOnTop([D.rail.x0, D.rail.y], [D.rail.x0 + dx, D.rail.y], 3.4, P));
  const a = ([-52, 0, 52][archIndex] * Math.PI) / 180;
  pointer.setAttribute("d", lineOnTop([D.select.x, D.select.y], [D.select.x + 5.6 * Math.sin(a), D.select.y - 5.6 * Math.cos(a)], 10, P));

  // racks: fans and lights follow the load
  const load = Math.min(1, kw / KW_MAX);
  for (const fan of fans) {
    const rpm = 0.15 + 0.85 * load;
    if (!calm) fan.angle = (fan.angle + (60 + 300 * rpm) * dt) % 360;
    fan.rot.setAttribute("transform", "rotate(" + fan.angle.toFixed(1) + " " + fan.cx + " " + fan.cy + ")");
    const blurAmount = Math.min(1, rpm * 1.1);
    fan.blur.style.opacity = (blurAmount * 0.5).toFixed(2);
    fan.rot.style.opacity = (1 - blurAmount * 0.55).toFixed(2);
  }
  for (const led of leds) {
    const id = led.dataset.led;
    let on = true;
    const m = /^ps(\d)-(\d)$/.exec(id);
    const g = /^gpu(\d)-(\d)$/.exec(id);
    if (m) on = Number(m[2]) === 0 || (Number(m[2]) === 1 && load > (Number(m[1]) + 0.3) / 5) || (Number(m[2]) === 2 && load > 0.9);
    else if (g) on = Number(g[2]) === 0 || load > Number(g[1]) / 6;
    led.toggleAttribute("data-on", on);
  }

  // meter
  setText(archText, arch.name);
  setText(powerText, Math.round(kw) + " kW");
  bars.I.setAttribute("width", Math.max(0, Math.min(1, sol.amps / 20000) * BAR_W).toFixed(1));
  bars.W.setAttribute("width", Math.max(0, Math.min(1, sol.loss / 6000) * BAR_W).toFixed(1));
  bars.K.setAttribute("width", Math.max(0, (sol.runaway ? 1 : Math.min(1, sol.rise / 150)) * BAR_W).toFixed(1));
  bars.C.setAttribute("width", Math.max(0, Math.min(1, sol.copper / 20000) * BAR_W).toFixed(1));
  setText(values.I, fmtAmps(sol.amps));
  setText(values.W, fmtLoss(sol.loss));
  setText(values.K, fmtRise(sol));
  setText(values.C, Math.round(sol.copper) + " mm²");
  const bad = sol.runaway || sol.rise > J_LIMIT;
  setText(verdict, sol.runaway ? "BARS RUN AWAY" : bad ? "OVER " + J_LIMIT + " K" : "WITHIN LIMITS");
  verdict.style.fill = bad ? "var(--anatomy-red)" : "";
  const bright = 1;
  glass.toggleAttribute("data-on", !!bright);
  contentEl.style.opacity = "1";
  meterLed.style.opacity = "";

  const text = arch.name + " · " + Math.round(kw) + " kW · " + fmtAmps(sol.amps) + " · " + fmtRise(sol);
  if (readout.textContent !== text) readout.textContent = text;

  // shader and its svg fallback
  for (let b = 0; b < 3; b++) {
    heatArray[b] = heatBars[b].x;
    actArray[b] = actNow[b].x;
  }
  if (layer) layer.draw({ uHeat: heatArray, uAct: actArray, uPhase: phase, uAC: mixAc.x }, calm ? 0.8 : clock);
  else heatOverlays.forEach((el) => { el.style.opacity = (heatBars[Number(el.dataset.heat)].x * 0.7).toFixed(2); });

  frame = visible && !calm && (busy || touring || true) ? requestAnimationFrame(tick) : 0;
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

announce();
tick(performance.now());
