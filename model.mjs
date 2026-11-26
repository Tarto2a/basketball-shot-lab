export const gravity = 9.81;
export const rimHeight = 3.05;
export const targetWindow = 0.12;
export const bounds = { minAngle: 15, maxAngle: 80, maxDrag: 0.6 };
export const defaults = Object.freeze({
  speed: 9.1, angle: 45, distance: 4.6, release: 2, drag: 0.16, step: 0.08,
});

const radians = (degrees) => degrees * Math.PI / 180;
const degrees = (angle) => angle * 180 / Math.PI;

function initialState({ speed, angle, release }) {
  const theta = radians(angle);
  return [0, release, speed * Math.cos(theta), speed * Math.sin(theta)];
}

export function exactState(shot, t) {
  const [, y0, u0, w0] = initialState(shot);
  const z = shot.drag * t;
  const exp = Math.exp(-z);
  const a = z === 0 ? t : -Math.expm1(-z) / shot.drag;
  const b = Math.abs(z) < 1e-4
    ? t * t * (1 - z / 3 + z * z / 12) / 2
    : (t - a) / shot.drag;
  return [u0 * a, y0 + w0 * a - gravity * b, u0 * exp, w0 * exp - gravity * a];
}

function atRim(shot) {
  const u0 = initialState(shot)[2];
  const travel = shot.distance / u0;
  const ratio = shot.drag * travel;
  if (ratio >= 1) return null;
  const t = ratio === 0 ? travel : -Math.log1p(-ratio) / shot.drag;
  const [, y, , w] = exactState(shot, t);
  return { t, y, w, residual: y - rimHeight };
}

function bisectTime(fn, lo, hi) {
  for (let i = 0; i < 44; i += 1) {
    const mid = (lo + hi) / 2;
    if (fn(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function referenceFlight(shot) {
  let horizon = 2;
  while (exactState(shot, horizon)[1] > 0) horizon *= 2;
  const t = bisectTime((time) => exactState(shot, time)[1], 0, horizon);
  const [, w0] = initialState(shot).slice(2);
  const peakTime = shot.drag === 0 ? w0 / gravity : Math.log1p(shot.drag * w0 / gravity) / shot.drag;
  const [range] = exactState(shot, t);
  const peak = exactState(shot, peakTime)[1];
  const rim = atRim(shot);
  return { t, range, peak, rim: rim && rim.t <= t ? rim : null };
}

function addScaled(state, velocity, dt) {
  return state.map((value, i) => value + velocity[i] * dt);
}

function rk4(state, h, rate) {
  const k1 = rate(state);
  const k2 = rate(addScaled(state, k1, h / 2));
  const k3 = rate(addScaled(state, k2, h / 2));
  const k4 = rate(addScaled(state, k3, h));
  return state.map((value, i) => value + h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6);
}

export function integrate(shot, method, until, dragLaw = "linear") {
  let state = initialState(shot);
  let t = 0;
  const points = [{ t, x: state[0], y: state[1] }];
  const rate = ([, , u, w]) => {
    const drag = dragLaw === "quadratic" ? shot.drag * Math.hypot(u, w) / shot.speed : shot.drag;
    return [u, w, -drag * u, -gravity - drag * w];
  };
  const steps = Math.ceil(until / shot.step - 1e-12);
  for (let i = 1; i <= steps; i += 1) {
    const next = i === steps ? until : i * shot.step;
    const h = next - t;
    state = method === "euler" ? addScaled(state, rate(state), h) : rk4(state, h, rate);
    t = next;
    points.push({ t, x: state[0], y: state[1] });
  }
  return points;
}

export function maxError(shot, points) {
  return Math.max(...points.map(({ t, x, y }) => {
    const [exactX, exactY] = exactState(shot, t);
    return Math.hypot(x - exactX, y - exactY);
  }));
}

function rimSlope(shot, angle) {
  const slope = Math.tan(radians(angle));
  const ratio = shot.drag * shot.distance * Math.hypot(1, slope) / shot.speed;
  const factor = 1 - gravity * shot.distance * slope / (shot.speed ** 2 * (1 - ratio));
  return { factor, derivative: shot.distance * (1 + slope ** 2) * factor * Math.PI / 180 };
}

function angleRoot(residual, derivative, left, right) {
  const trace = [];
  let a = left;
  let b = right;
  let start = residual(a);
  if (Math.abs(start) <= 1e-8) return { angle: a, trace };
  if (Math.abs(residual(b)) <= 1e-8) return { angle: b, trace };
  let angle = (a + b) / 2;
  for (let i = 0; i < 60; i += 1) {
    const value = residual(angle);
    trace.push({ angle, value });
    if (Math.abs(value) <= 1e-8 || b - a <= 1e-8) break;
    if (Math.sign(value) === Math.sign(start)) {
      a = angle;
      start = value;
    } else b = angle;
    const candidate = derivative ? angle - value / derivative(angle) : NaN;
    angle = candidate > a && candidate < b ? candidate : (a + b) / 2;
  }
  return { angle, trace };
}

export function solveAngles(shot) {
  const lo = bounds.minAngle;
  const reach = shot.drag * shot.distance / shot.speed;
  if (reach >= Math.cos(radians(lo))) return [];
  const hi = Math.min(bounds.maxAngle, degrees(Math.acos(reach)) - 1e-8);
  if (hi <= lo) return [];
  const residual = (angle) => atRim({ ...shot, angle }).residual;
  // Height at the hoop has at most one interior maximum on this positive-angle domain.
  const score = (angle) => rimSlope(shot, angle).factor;
  const peak = score(lo) <= 0 ? lo : score(hi) >= 0 ? hi : bisectTime(score, lo, hi);
  const intervals = peak === lo || peak === hi ? [[lo, hi]] : [[lo, peak], [peak, hi]];
  const solutions = [];
  for (const [a, b] of intervals) {
    const left = residual(a);
    const right = residual(b);
    if (Math.min(Math.abs(left), Math.abs(right)) > 1e-8 && Math.sign(left) === Math.sign(right)) continue;
    const bisection = angleRoot(residual, null, a, b);
    const newton = angleRoot(residual, (angle) => rimSlope(shot, angle).derivative, a, b);
    const rim = atRim({ ...shot, angle: newton.angle });
    if (rim.w < 0 && !solutions.some(({ angle }) => Math.abs(angle - newton.angle) < 1e-5)) {
      solutions.push({ angle: newton.angle, time: rim.t, bisection, newton });
    }
  }
  return solutions;
}

export function samplePositions(shot, time, noise, seed, count = 19) {
  let state = seed >>> 0;
  function offset() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return noise * (2 * state / 4294967296 - 1);
  }
  return Array.from({ length: count }, (_, i) => {
    const t = time * 0.92 * i / (count - 1);
    const [x, y] = exactState(shot, t);
    return { t, x: x + offset(), y: y + offset() };
  });
}

export function fitDrag(shot, samples) {
  const loss = (drag) => samples.reduce((sum, { t, x, y }) => {
    const [u, v] = exactState({ ...shot, drag }, t);
    return sum + (x - u) ** 2 + (y - v) ** 2;
  }, 0);
  const spacing = bounds.maxDrag / 60;
  let best = { drag: 0, loss: loss(0) };
  for (let i = 1; i <= 60; i += 1) {
    const drag = i * spacing;
    const value = loss(drag);
    if (value < best.loss) best = { drag, loss: value };
  }
  let left = Math.max(0, best.drag - spacing);
  let right = Math.min(bounds.maxDrag, best.drag + spacing);
  for (let i = 0; i < 45; i += 1) {
    const a = (2 * left + right) / 3;
    const b = (left + 2 * right) / 3;
    if (loss(a) < loss(b)) right = b;
    else left = a;
  }
  const drag = (left + right) / 2;
  const value = loss(drag);
  if (value < best.loss) best = { drag, loss: value };
  return { drag: best.drag, rmse: Math.sqrt(best.loss / samples.length) };
}
