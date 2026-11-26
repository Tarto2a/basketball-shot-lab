import {
  defaults, exactState, fitDrag, gravity, integrate, maxError, referenceFlight, rimHeight, samplePositions, solveAngles,
} from "./model.mjs";
import { aimShot, ballAt, ballRadius, playFlight } from "./physics.mjs";
import { courtBounds, courtProjection, defaultCourtView, drawCourt } from "./chart.mjs";

const byId = (id) => document.getElementById(id);
const show = (id, text) => { byId(id).textContent = text; };
const canvas = byId("court-plot");
const timeInput = byId("time");
const playButton = byId("play");
const grip = byId("ball-grip");
const statusLabel = byId("shot-status");
const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
const lineButtons = Array.from(byId("legend").querySelectorAll("button"));
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const predictionTitles = {
  exact: "Laplace trajectory",
  euler: "Euler update",
  rk4: "Runge–Kutta 4 update",
  quadratic: "RK4 with quadratic drag",
};
const explanations = {
  exact: "Orange · Exact Laplace solution for linear drag. This is the ball’s path before it hits a surface.",
  euler: "Purple · Euler uses the velocity at the start of each step. At the default step size its path runs high. Reduce the time step to bring it closer to Laplace.",
  rk4: "Teal · Runge–Kutta 4 samples the slope four times per step. Its linear-drag path is often close enough to overlap the exact line.",
  quadratic: "Gold · Runge–Kutta 4 with drag proportional to speed squared. This compares two drag models.",
};
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
let selectedLine = "exact";
let seed = initialSeed;
let data;
let visual;
let projection;
let viewBounds = defaultCourtView;
let time = 0;
let frame = null;
let previousTimestamp = null;
let aim = null;
let round = null;
let attempts = 0;
let makes = 0;

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

function predictShot(shot) {
  const flight = referenceFlight(shot);
  const euler = integrate(shot, "euler", flight.t);
  const rk4 = integrate(shot, "rk4", flight.t);
  const quadratic = stopAtGround(integrate(shot, "rk4", flight.t + 1, "quadratic"));
  return {
    flight, euler, rk4,
    series: [
      { key: "exact", points: exactPoints(shot, flight.t), color: "flight", dash: [] },
      { key: "euler", points: euler, color: "euler", dash: [6, 5] },
      { key: "rk4", points: rk4, color: "rk4", dash: [1, 6] },
      { key: "quadratic", points: quadratic, color: "quadratic", dash: [2, 4, 7, 4] },
    ],
  };
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
    : count === 1 ? "1 descending angle" : count + " descending angles");
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

function renderEquations(shot) {
  const [, , u0, w0] = exactState(shot, 0);
  const speed = number(shot.speed, 1);
  const angle = labelAngle(shot.angle);
  const drag = number(shot.drag, 2);
  const g = number(gravity, 2);
  show("live-y0", "y(0) = " + number(shot.release, 2) + " m");
  show("live-u0", "u(0) = " + speed + " cos(" + angle + ") ≈ " + number(u0, 3) + " m/s");
  show("live-w0", "w(0) = " + speed + " sin(" + angle + ") ≈ " + number(w0, 3) + " m/s");
  show("live-u-prime", shot.drag === 0 ? "u′ = 0" : "u′ = −" + drag + "u");
  show("live-w-prime", "w′ = −" + g + (shot.drag === 0 ? "" : " − " + drag + "w"));
  show("live-target", "y(x = " + number(shot.distance, 1) + " m) = " + number(rimHeight, 2) + " m");
  show("live-step", "xₙ₊₁ = xₙ + " + number(shot.step, 2) + "uₙ");

  if (shot.drag === 0) {
    show("live-laplace-u", "U(s) ≈ " + number(u0, 3) + "/s");
    show("live-laplace-w", "W(s) ≈ " + number(w0, 3) + "/s − " + g + "/s²");
    show("inverse-note", "With k = 0, invert u₀/s and w₀/s − g/s² to get constant horizontal velocity and uniform vertical acceleration.");
    show("inverse-formula", "x(t) = u₀t,  y(t) = y₀ + w₀t − gt²/2");
  } else {
    const denominator = "(s + " + drag + ")";
    show("live-laplace-u", "U(s) ≈ " + number(u0, 3) + "/" + denominator);
    show("live-laplace-w", "W(s) ≈ " + number(w0, 3) + "/" + denominator + " − " + g + "/[s" + denominator + "]");
    show("inverse-note", "Invert each velocity and integrate from release. Set A(t) = (1 − e⁻ᵏᵗ)/k.");
    show("inverse-formula", "x(t) = u₀A(t),  y(t) = y₀ + w₀A(t) − g[t − A(t)]/k");
  }
}

function renderVisual() {
  const { shot, flight } = data;
  const fitMode = selectedPanel === "fit";
  let samples = [];
  let series = data.series;
  if (fitMode) {
    samples = samplePositions(shot, flight.t, byId("noise").valueAsNumber / 100, seed);
    const fit = fitDrag(shot, samples);
    const fittedShot = { ...shot, drag: fit.drag };
    series = [{ points: exactPoints(fittedShot, referenceFlight(fittedShot).t), color: "flight", dash: [] }];
    show("actual-drag", number(shot.drag, 3) + " s⁻¹");
    show("fitted-drag", number(fit.drag, 3) + " s⁻¹");
    show("fit-error", positionError(fit.rmse));
  }
  visual = { shot, series, samples };
  refreshView();
  show("court-title", fitMode ? "Fitted trajectory" : "Practice court");
  show("court-caption", fitMode ? "Fitted curve and simulated positions" : "Pull back and down to preview four paths. Release to shoot.");
  byId("comparison").hidden = fitMode;
  byId("fit-legend").hidden = !fitMode;
  playButton.closest(".playback").hidden = fitMode;
  canvas.setAttribute("aria-label", fitMode ? "Fitted trajectory and simulated position samples" :
    "Side view of the practice court, with the hoop and four predicted trajectories. The moving ball shows the shot with collisions.");
  renderLineSelection();
  paint();
}

function viewPoints() {
  return selectedPanel === "fit" ? visual.samples : data.playable.frames;
}

function renderViewNote() {
  const outside = ({ x, y }) => x < viewBounds.xMin || x > viewBounds.xMax || y > viewBounds.yMax;
  const series = aim?.series ?? visual.series;
  const clipped = series.some(({ points }) => points.some(outside)) || (!aim?.series && viewPoints().some(outside));
  const note = clipped ? "Path extends off-screen" : "";
  if (byId("view-note").textContent !== note) show("view-note", note);
}

function refreshView() {
  projection = courtProjection(canvas, viewBounds);
  renderViewNote();
  byId("reset-view").disabled = viewBounds === defaultCourtView;
}

function setCourtView(nextView) {
  viewBounds = nextView;
  refreshView();
  paint();
}

function renderLineSelection() {
  for (const button of lineButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.line === selectedLine));
  }
  if (byId("line-explanation").textContent !== explanations[selectedLine]) {
    show("line-explanation", explanations[selectedLine]);
  }
  renderPredictionDetails();
}

function predictionEquations(shot, u0, w0) {
  const release = number(shot.release, 2);
  const drag = number(shot.drag, 2);
  const g = number(gravity, 2);
  const step = number(shot.step, 2);
  if (selectedLine === "exact") {
    if (shot.drag === 0) return [
      "x(t) ≈ " + u0 + "t",
      "y(t) ≈ " + release + " + " + w0 + "t − " + number(gravity / 2, 3) + "t²",
    ];
    return [
      "A(t) = (1 − e^(−" + drag + "t))/" + drag,
      "x(t) ≈ " + u0 + " A(t)",
      "y(t) ≈ " + release + " + " + w0 + " A(t) − " + g + "[t − A(t)]/" + drag,
    ];
  }

  const rows = [
    "z = (x, y, u, w)",
    "z₀ ≈ (0, " + release + ", " + u0 + ", " + w0 + ")",
  ];
  if (selectedLine === "quadratic") {
    const speed = number(shot.speed, 1);
    const beta = number(shot.drag / shot.speed, 5);
    rows.push("β = " + drag + "/" + speed + " ≈ " + beta + " m⁻¹  ·  q = √(u² + w²)");
    rows.push("F(z) = (u, w, −βqu, −" + g + " − βqw)");
  } else {
    rows.push(shot.drag === 0 ? "F(z) = (u, w, 0, −" + g + ")"
      : "F(z) = (u, w, −" + drag + "u, −" + g + " − " + drag + "w)");
  }
  if (selectedLine === "euler") {
    rows.push("zₙ₊₁ = zₙ + " + step + " F(zₙ)");
  } else {
    rows.push(
      "h = " + step + " s",
      "K₁ = F(zₙ),  K₂ = F(zₙ + hK₁/2)",
      "K₃ = F(zₙ + hK₂/2),  K₄ = F(zₙ + hK₃)",
      "zₙ₊₁ = zₙ + h(K₁ + 2K₂ + 2K₃ + K₄)/6",
    );
  }
  return rows;
}

function renderPredictionDetails() {
  if (selectedPanel === "fit") return;
  const shot = aim?.candidate ? { ...data.shot, ...aim.candidate } : data.shot;
  const trace = (aim?.series ?? data.series).find(({ key }) => key === selectedLine);
  const [, , u0, w0] = exactState(shot, 0);
  const exact = selectedLine === "exact";
  const t = exact ? Math.min(shot.step, trace.points.at(-1).t) : trace.points[1].t;
  const [exactX, exactY] = exactState(shot, t);
  const { x, y } = exact ? { x: exactX, y: exactY } : trace.points[1];
  show("prediction-title", predictionTitles[selectedLine]);
  show("prediction-launch", "θ = " + labelAngle(shot.angle) + " · v₀ = " + number(shot.speed, 1) + " m/s");
  show("prediction-equations", predictionEquations(shot, number(u0, 3), number(w0, 3)).join("\n"));
  show("prediction-result", "At " + seconds(t) + ", x ≈ " + number(x, 3) + " m and y ≈ " + number(y, 3) + " m");
  const offset = byId("prediction-offset");
  offset.hidden = exact;
  if (!exact) offset.textContent = "Distance from Laplace at this time · " + positionError(Math.hypot(x - exactX, y - exactY));
}

function showStatus(text, state) {
  if (statusLabel.textContent !== text) statusLabel.textContent = text;
  statusLabel.dataset.state = state;
}

function updateStatus() {
  const playable = data.playable;
  if (aim) {
    const shot = aim.candidate;
    showStatus(shot ? labelAngle(shot.angle) + " · " + number(shot.speed, 1) + " m/s" : "Pull back and down", "aim");
    return;
  }
  if (!round) {
    showStatus(time > 0 ? "Preview" : "Ready", "ready");
    return;
  }
  if (playable.scoredAt !== null && time >= playable.scoredAt) {
    showStatus("Made shot", "made");
    return;
  }
  if (playable.floorAt !== null && time >= playable.floorAt) {
    showStatus("Miss", "miss");
    return;
  }
  const contact = playable.collisions.findLast(({ t }) => t <= time);
  showStatus(contact?.surface === "rim" ? "Rim contact" : contact ? "Backboard" : "In flight", "playing");
}

function paint() {
  const fitMode = selectedPanel === "fit";
  const showGrip = !fitMode && frame === null;
  grip.hidden = !showGrip;
  statusLabel.hidden = fitMode;
  const comparison = byId("comparison");
  const aiming = String(aim !== null);
  if (comparison.dataset.aiming !== aiming) comparison.dataset.aiming = aiming;
  if (showGrip) {
    const spot = aim?.held ?? { x: 0, y: data.shot.release };
    grip.style.transform = "translate(" + projection.px(spot.x) + "px," + projection.py(spot.y) + "px) translate(-50%,-50%)";
    grip.dataset.aiming = String(aim !== null);
  }
  timeInput.value = time;
  const clock = seconds(time);
  if (byId("clock").textContent !== clock) {
    timeInput.setAttribute("aria-valuetext", clock);
    show("clock", clock);
  }
  updateStatus();
  const scoredAt = data.playable.scoredAt;
  const netAge = scoredAt === null ? -1 : time - scoredAt;
  const netSwing = netAge >= 0 && netAge < 0.7 && !reducedMotion.matches
    ? Math.sin(netAge * 26) * Math.exp(-netAge * 6)
    : 0;
  drawCourt(canvas, projection, {
    ...visual, selectedLine, grip: showGrip, aim, netSwing,
    ball: fitMode ? null : aim?.held ?? ballAt(data.playable, time),
  });
}

function playbackLabel() {
  playButton.dataset.playing = String(frame !== null);
  show("play-text", frame !== null ? "Pause"
    : round && time >= data.playable.duration ? "Shoot again"
    : round && time > 0 ? "Resume" : "Shoot");
  playButton.disabled = aim !== null;
}

function pause() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  previousTimestamp = null;
  playbackLabel();
}

function tick(timestamp) {
  if (previousTimestamp !== null) time = Math.min(data.playable.duration, time + (timestamp - previousTimestamp) / 1000);
  previousTimestamp = timestamp;
  settleScore();
  if (time >= data.playable.duration) pause();
  else frame = requestAnimationFrame(tick);
  paint();
}

function renderScore() {
  show("score", makes + " / " + attempts);
  byId("reset-score").disabled = attempts === 0;
}

function settleScore() {
  if (!round || round.counted || data.playable.scoredAt === null || time < data.playable.scoredAt) return;
  round.counted = true;
  makes += 1;
  renderScore();
}

function startShot(restart = false) {
  if (selectedPanel === "fit" || aim || frame !== null) return;
  if (restart || !round || time >= data.playable.duration) {
    time = 0;
    round = { counted: false };
    attempts += 1;
    renderScore();
  }
  if (document.activeElement === grip) playButton.focus({ preventScroll: true });
  if (reducedMotion.matches) {
    time = data.playable.duration;
    settleScore();
  } else frame = requestAnimationFrame(tick);
  playbackLabel();
  paint();
}

function recalculate() {
  const shot = readShot();
  const prediction = predictShot(shot);
  const { flight, euler, rk4 } = prediction;
  const playable = playFlight(shot);
  data = { shot, ...prediction, playable };
  clearAim();
  round = null;
  time = 0;
  timeInput.max = Math.ceil(playable.duration * 1000) / 1000;
  pause();
  show("peak", number(flight.peak, 2) + " m");
  show("airtime", seconds(flight.t));
  show("rim-result", flight.rim ? number(flight.rim.y, 2) + " m" : "Falls short");
  show("euler-error", positionError(maxError(shot, euler)));
  show("rk4-error", positionError(maxError(shot, rk4)));
  renderAngles(solveAngles(shot));
  renderEquations(shot);
  renderVisual();
}

function selectTab(tab) {
  selectedPanel = tab.id.slice(4);
  for (const each of tabs) {
    each.tabIndex = each === tab ? 0 : -1;
    each.setAttribute("aria-selected", String(each === tab));
    byId(each.getAttribute("aria-controls")).hidden = each !== tab;
  }
  if (selectedPanel === "fit") {
    clearAim();
    pause();
  }
  renderVisual();
}

playButton.addEventListener("click", () => {
  if (frame !== null) {
    pause();
    paint();
  } else {
    startShot();
  }
});

timeInput.addEventListener("input", () => {
  time = Math.min(data.playable.duration, timeInput.valueAsNumber);
  pause();
  paint();
});

function updateAim(event) {
  const back = aim.clientX - event.clientX;
  const down = event.clientY - aim.clientY;
  const fullPull = Math.min(126, Math.max(83, projection.width * 0.28));
  const direction = aimShot(back, down, projection.xScale, projection.yScale, fullPull);
  const ratio = Math.min(1, fullPull / (Math.hypot(back, down) || 1));
  const x = Math.max(projection.xMin + 0.25, Math.min(0.75, -back * ratio / projection.xScale));
  const y = Math.max(ballRadius, Math.min(projection.yMax - 0.3, data.shot.release - down * ratio / projection.yScale));
  aim.held = { x, y, spin: x };
  const candidate = direction && {
    angle: Number(direction.angle.toFixed(2)), speed: Number(direction.speed.toFixed(1)),
  };
  if (candidate?.angle !== aim.candidate?.angle || candidate?.speed !== aim.candidate?.speed) {
    aim.candidate = candidate;
    aim.series = candidate ? predictShot({ ...data.shot, ...candidate }).series : null;
    renderPredictionDetails();
  }
}

function clearAim() {
  if (aim && aim.frame !== null) cancelAnimationFrame(aim.frame);
  aim = null;
}

function cancelAim() {
  clearAim();
  renderViewNote();
  renderPredictionDetails();
  playbackLabel();
  paint();
}

grip.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || frame !== null || aim) return;
  event.preventDefault();
  grip.setPointerCapture(event.pointerId);
  aim = {
    pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY,
    held: { x: 0, y: data.shot.release, spin: 0 }, candidate: null, series: null, frame: null,
  };
  playbackLabel();
  paint();
});
grip.addEventListener("pointermove", (event) => {
  if (aim?.pointer !== event.pointerId) return;
  aim.latest = event;
  if (aim.frame !== null) return;
  aim.frame = requestAnimationFrame(() => {
    aim.frame = null;
    updateAim(aim.latest);
    renderViewNote();
    paint();
  });
});
grip.addEventListener("pointerup", (event) => {
  if (aim?.pointer !== event.pointerId) return;
  updateAim(event);
  const shot = aim.candidate;
  if (!shot) {
    cancelAim();
    return;
  }
  byId("angle").value = shot.angle;
  byId("speed").value = shot.speed;
  recalculate();
  startShot(true);
});
for (const type of ["pointercancel", "lostpointercapture"]) {
  grip.addEventListener(type, (event) => {
    if (aim?.pointer === event.pointerId) cancelAim();
  });
}
grip.addEventListener("click", (event) => {
  if (event.detail === 0) startShot(true);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && aim) cancelAim();
});
for (const button of lineButtons) {
  button.addEventListener("click", () => {
    selectedLine = button.dataset.line;
    renderLineSelection();
    paint();
  });
}

byId("fit-view").addEventListener("click", () => {
  setCourtView(courtBounds(data.shot, visual.series, viewPoints()));
});
byId("reset-view").addEventListener("click", () => {
  setCourtView(defaultCourtView);
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
for (const id of Object.keys(fields)) byId(id).addEventListener("input", recalculate);
byId("reset").addEventListener("click", () => {
  for (const key of Object.keys(fields)) byId(key).value = defaults[key];
  byId("noise").value = defaultNoise;
  seed = initialSeed;
  updateNoise();
  recalculate();
});
byId("reset-score").addEventListener("click", () => {
  makes = 0;
  attempts = 0;
  if (round) round.counted = true;
  renderScore();
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
renderScore();
recalculate();
new ResizeObserver(() => {
  projection = courtProjection(canvas, viewBounds);
  paint();
}).observe(canvas);
