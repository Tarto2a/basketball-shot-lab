import {
  defaults, exactState, fitDrag, integrate, maxError, referenceFlight, rimHeight,
  samplePositions, solveAngles, targetWindow,
} from "./model.mjs";
import { drawCourt } from "./chart.mjs";

const byId = (id) => document.getElementById(id);
const show = (id, text) => { byId(id).textContent = text; };
const canvas = byId("court-plot");
const timeInput = byId("time");
const playButton = byId("play");
const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
const fields = {
  angle: [2, "°"], speed: [1, " m/s"], distance: [1, " m"],
  release: [2, " m"], drag: [2, " s⁻¹"], step: [2, " s"],
};
const defaultNoise = 4;
const initialSeed = 1267;
const number = (value, digits) => value.toFixed(digits).replace("-", "−");
const labelAngle = (angle) => number(angle, 2) + "°";
const seconds = (time) => number(time, 2) + " s";
let selectedPanel = "angle";
let seed = initialSeed;
let data;
let visual;
let time = 0;
let frame = null;
let previousTimestamp = null;

function readShot() {
  const shot = {};
  for (const [key, [digits, unit]] of Object.entries(fields)) {
    const input = byId(key);
    const value = input.valueAsNumber;
    shot[key] = value;
    const text = number(value, digits) + unit;
    show(key + "-value", text);
    input.setAttribute("aria-valuetext", text);
  }
  return shot;
}

function exactPoints(shot, end) {
  return Array.from({ length: 161 }, (_, index) => {
    const t = end * index / 160;
    const [x, y] = exactState(shot, t);
    return { t, x, y };
  });
}

function stopAtGround(points) {
  const nonpositive = points.findIndex(({ y }) => y <= 0);
  if (nonpositive <= 0) return points;
  const a = points[nonpositive - 1];
  const b = points[nonpositive];
  const part = a.y / (a.y - b.y);
  return [...points.slice(0, nonpositive), {
    t: a.t + part * (b.t - a.t), x: a.x + part * (b.x - a.x), y: 0,
  }];
}

function statusAtRim(rim) {
  if (!rim) return { text: "Falls short", hit: false };
  if (rim.w >= 0) return { text: "Still rising at hoop", hit: false };
  if (Math.abs(rim.residual) <= targetWindow) return { text: "In target window", hit: true };
  return { text: rim.residual > 0 ? "High at hoop" : "Low at hoop", hit: false };
}

function positionError(meters) {
  const centimeters = meters * 100;
  if (centimeters > 1e-8 && centimeters < 0.001) return centimeters.toExponential(2) + " cm";
  return number(centimeters, 3) + " cm";
}

function buildTrace(title, trace) {
  if (!trace.length) return null;
  const frame = document.createElement("div");
  frame.className = "table-wrap";
  const table = document.createElement("table");
  table.createCaption().textContent = title;
  const header = table.createTHead().insertRow();
  for (const text of ["Iteration", "Angle (°)", "Height residual (cm)"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = text;
    header.append(cell);
  }
  const body = table.createTBody();
  trace.forEach(({ angle, value }, i) => {
    const row = body.insertRow();
    for (const text of [i + 1, number(angle, 6), (100 * value).toExponential(2)]) {
      row.insertCell().textContent = text;
    }
  });
  frame.append(table);
  return frame;
}

function renderAngles(angles) {
  const count = angles.length;
  show("angle-summary", count === 0 ? "No descending solution in the current angle range"
    : count === 1 ? "1 descending solution" : count + " descending solutions");
  const cards = [];
  const traces = [];
  for (const { angle, time: reachTime, bisection, newton } of angles) {
    const card = document.createElement("div");
    card.className = "angle-card";
    const line = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = labelAngle(angle) + " · reaches hoop at " + seconds(reachTime);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quiet";
    button.textContent = "Use " + labelAngle(angle);
    button.addEventListener("click", () => {
      byId("angle").value = angle.toFixed(2);
      recalculate();
      playButton.focus();
    });
    const iterations = document.createElement("p");
    iterations.textContent = "Iterations · Bisection " + bisection.trace.length + " · Newton " + newton.trace.length;
    line.append(title, button);
    card.append(line, iterations);
    cards.push(card);
    for (const [name, result] of [["Bisection", bisection], ["Newton", newton]]) {
      const trace = buildTrace(name + " · " + labelAngle(angle), result.trace);
      if (trace) traces.push(trace);
    }
  }
  if (!count) {
    const hint = document.createElement("p");
    hint.textContent = "Try increasing speed or moving closer to the hoop.";
    cards.push(hint);
  }
  byId("angle-results").replaceChildren(...cards);
  byId("history").replaceChildren(...traces);
  byId("history-wrap").hidden = !traces.length;
}

function renderDerivation(shot) {
  if (shot.drag === 0) {
    show("inverse-note", "With k = 0, invert u₀/s and w₀/s − g/s² to get constant horizontal velocity and uniform vertical acceleration.");
    show("inverse-formula", "x(t) = u₀t,  y(t) = y₀ + w₀t − gt²/2");
  } else {
    show("inverse-note", "Invert each velocity and integrate from release. Set A(t) = (1 − e⁻ᵏᵗ)/k.");
    show("inverse-formula", "x(t) = u₀A(t),  y(t) = y₀ + w₀A(t) − g[t − A(t)]/k");
  }
}

function renderLegend(series, samples) {
  const entries = samples.length ? [...series, { color: "samples", name: "Simulated samples" }] : series;
  byId("legend").replaceChildren(...entries.map(({ color, name }) => {
    const label = document.createElement("span");
    const icon = document.createElement("i");
    icon.className = color;
    icon.setAttribute("aria-hidden", "true");
    label.append(icon, name);
    return label;
  }));
}

function renderVisual() {
  const { shot, flight, euler, rk4 } = data;
  const fitMode = selectedPanel === "fit";
  let samples = [];
  let series;
  if (fitMode) {
    samples = samplePositions(shot, flight.t, byId("noise").valueAsNumber / 100, seed);
    const fit = fitDrag(shot, samples);
    const fittedShot = { ...shot, drag: fit.drag };
    series = [{ points: exactPoints(fittedShot, referenceFlight(fittedShot).t), name: "Fitted path", color: "flight", dash: [], width: 2.7 }];
    show("actual-drag", number(shot.drag, 3) + " s⁻¹");
    show("fitted-drag", number(fit.drag, 3) + " s⁻¹");
    show("fit-error", positionError(fit.rmse));
  } else {
    series = [
      { points: exactPoints(shot, flight.t), name: "Laplace reference", color: "flight", dash: [], width: 2.7 },
      { points: euler, name: "Euler", color: "euler", dash: [6, 5], width: 1.7 },
      { points: rk4, name: "Runge–Kutta 4", color: "rk4", dash: [1, 6], width: 1.65 },
    ];
    if (byId("quadratic").checked) {
      const points = stopAtGround(integrate(shot, "rk4", flight.t + 1, "quadratic"));
      series.push({ points, name: "Quadratic drag (RK4)", color: "quadratic", dash: [2, 4, 7, 4], width: 1.7 });
    }
  }
  visual = { shot, flight, series, samples };
  show("court-title", fitMode ? "Fitted trajectory" : "Shot trajectory");
  show("court-caption", fitMode ? "Fitted curve and simulated measurements · meters" : "Side view · meters");
  canvas.setAttribute("aria-label", fitMode ? "Fitted trajectory and simulated position samples" :
    "Side view comparing the trajectory curves and hoop. " + statusAtRim(flight.rim).text + ".");
  renderLegend(series, samples);
  paint();
}

function paint() {
  timeInput.value = time;
  const clock = seconds(time);
  timeInput.setAttribute("aria-valuetext", clock);
  show("clock", clock);
  drawCourt(canvas, { ...visual, ball: selectedPanel === "fit" ? null : exactState(data.shot, time) });
}

function playbackLabel() {
  playButton.dataset.playing = String(frame !== null);
  show("play-text", frame !== null ? "Pause" : time >= data.flight.t ? "Replay" : time > 0 ? "Resume" : "Shoot");
}

function pause() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  previousTimestamp = null;
  playbackLabel();
}

function tick(timestamp) {
  if (previousTimestamp !== null) time = Math.min(data.flight.t, time + (timestamp - previousTimestamp) / 1000 * 0.7);
  previousTimestamp = timestamp;
  paint();
  if (time >= data.flight.t) pause();
  else frame = requestAnimationFrame(tick);
}

function recalculate() {
  const shot = readShot();
  const flight = referenceFlight(shot);
  const euler = integrate(shot, "euler", flight.t);
  const rk4 = integrate(shot, "rk4", flight.t);
  data = { shot, flight, euler, rk4 };
  time = 0;
  timeInput.max = flight.t;
  pause();
  const status = statusAtRim(flight.rim);
  byId("shot-status").dataset.hit = status.hit;
  show("shot-status", status.text);
  show("peak", number(flight.peak, 2) + " m");
  show("airtime", seconds(flight.t));
  show("rim-result", flight.rim ? number(flight.rim.y, 2) + " m" : "Falls short");
  show("euler-error", positionError(maxError(shot, euler)));
  show("rk4-error", positionError(maxError(shot, rk4)));
  renderAngles(solveAngles(shot));
  renderDerivation(shot);
  renderVisual();
}

function selectTab(tab) {
  selectedPanel = tab.id.slice(4);
  for (const each of tabs) {
    each.tabIndex = each === tab ? 0 : -1;
    each.setAttribute("aria-selected", String(each === tab));
    byId(each.getAttribute("aria-controls")).hidden = each !== tab;
  }
  if (selectedPanel === "fit") pause();
  byId("play").closest(".playback").hidden = selectedPanel === "fit";
  renderVisual();
}

playButton.addEventListener("click", () => {
  if (frame !== null) {
    pause();
    return;
  }
  if (time >= data.flight.t) time = 0;
  frame = requestAnimationFrame(tick);
  playbackLabel();
});

timeInput.addEventListener("input", () => {
  time = timeInput.valueAsNumber;
  pause();
  paint();
});

function updateNoise() {
  const input = byId("noise");
  const text = "±" + input.value + " cm";
  show("noise-value", text);
  input.setAttribute("aria-valuetext", text);
}

byId("noise").addEventListener("input", () => {
  updateNoise();
  renderVisual();
});
byId("resample").addEventListener("click", () => {
  seed += 1;
  renderVisual();
});
byId("quadratic").addEventListener("change", renderVisual);
for (const id of Object.keys(fields)) byId(id).addEventListener("input", recalculate);
byId("reset").addEventListener("click", () => {
  for (const key of Object.keys(fields)) byId(key).value = defaults[key];
  byId("quadratic").checked = false;
  byId("noise").value = defaultNoise;
  seed = initialSeed;
  updateNoise();
  recalculate();
});

for (const [index, tab] of tabs.entries()) {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    const positions = { ArrowLeft: (index + tabs.length - 1) % tabs.length, ArrowRight: (index + 1) % tabs.length, Home: 0, End: tabs.length - 1 };
    if (!Object.hasOwn(positions, event.key)) return;
    event.preventDefault();
    const next = tabs[positions[event.key]];
    selectTab(next);
    next.focus();
  });
}

updateNoise();
recalculate();
new ResizeObserver(paint).observe(canvas);
