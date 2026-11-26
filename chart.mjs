import { rimHeight } from "./model.mjs";
import { backboard, ballRadius, hoop } from "./physics.mjs";

export function courtBounds(shot, series, frames) {
  let xMin = -2;
  let xMax = shot.distance + 1.1;
  let yMax = backboard.top + 0.4;
  for (const { x, y } of [...frames, ...series.flatMap(({ points }) => points)]) {
    xMin = Math.min(xMin, x - 0.3);
    xMax = Math.max(xMax, x + 0.3);
    yMax = Math.max(yMax, y + 0.25);
  }
  return { xMin: Math.floor(xMin * 2) / 2, xMax: Math.ceil(xMax), yMax: Math.ceil(yMax) };
}

export function courtProjection(canvas, bounds) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const left = width < 460 ? 28 : 38;
  const right = width - 17;
  const top = 19;
  const bottom = height - 46;
  const xScale = (right - left) / (bounds.xMax - bounds.xMin);
  const yScale = (bottom - top) / bounds.yMax;
  return {
    ...bounds, width, height, left, right, top, bottom, xScale, yScale,
    px: (x) => left + (x - bounds.xMin) * xScale,
    py: (y) => bottom - y * yScale,
  };
}

export function drawCourt(canvas, project, { shot, series, samples, selectedLine, ball, grip, aim, netSwing }) {
  const { width, height, left, right, top, bottom, px, py, xMin, xMax, yMax } = project;
  if (width < 100 || height < 80) return;
  const scale = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(width * scale);
  const pixelHeight = Math.round(height * scale);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const style = getComputedStyle(canvas);
  const tone = (key) => style.getPropertyValue("--" + key).trim();

  function line(x1, y1, x2, y2, stroke, dash = [], weight = 1) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = weight;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function dot(x, y, radius, fill, stroke, dash = []) {
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
  }

  function drawPath(points, color, weight, dash) {
    ctx.strokeStyle = color;
    ctx.lineWidth = weight;
    ctx.setLineDash(dash);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (const [index, { x, y }] of points.entries()) {
      if (index === 0) ctx.moveTo(px(x), py(y));
      else ctx.lineTo(px(x), py(y));
    }
    ctx.stroke();
  }

  ctx.fillStyle = "#17242d";
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.font = "11px Segoe UI, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#bdc6c6";
  ctx.textAlign = "left";
  ctx.fillText("m", 10, top - 8);
  const verticalStep = yMax > 7 ? 2 : 1;
  for (let value = 0; value <= yMax; value += verticalStep) {
    const y = py(value);
    line(left, y, right, y, "#2b3c46");
    ctx.textAlign = "right";
    ctx.fillText(String(value), left - 6, y);
  }

  const horizontalStep = Math.max(2, Math.ceil((xMax - xMin) / (width < 460 ? 5 : 10) / 2) * 2);
  const firstTick = Math.ceil(xMin / horizontalStep) * horizontalStep;
  for (let value = firstTick; value <= xMax; value += horizontalStep) {
    line(px(value), top, px(value), bottom, value === 0 ? "#536168" : "#2b3c46");
  }
  const boards = ["#8d593c", "#a16b45", "#966040"];
  boards.forEach((color, i) => {
    const y = bottom + i * 5;
    ctx.fillStyle = color;
    ctx.fillRect(left, y, right - left, 5);
    for (let x = left + 12 + i * 26; x < right; x += 63) line(x, y, x, y + 5, "#6b4531");
  });
  line(left, bottom, right, bottom, "#d8a774");
  ctx.fillStyle = "#bdc6c6";
  ctx.textAlign = "center";
  for (let value = firstTick; value <= xMax; value += horizontalStep) {
    ctx.fillText(String(value), px(value), height - 16);
  }
  ctx.textAlign = "right";
  ctx.fillText("m", right, height - 5);

  const rimY = py(rimHeight);
  const rimX = px(shot.distance);
  const frontX = px(shot.distance - hoop.halfOpening);
  const backX = px(shot.distance + hoop.halfOpening);
  const boardX = px(shot.distance + backboard.offset);
  const supportX = Math.min(right - 2, px(shot.distance + 0.82));
  const supportY = py(backboard.top - 0.26);
  line(supportX, bottom, supportX, supportY, "#4b5e67", [], 3);
  line(supportX, supportY, boardX + 1, supportY, "#4b5e67", [], 2);
  line(rimX, rimY, rimX, bottom, "#61767d", [3, 6]);
  ctx.fillStyle = "#91a5b0";
  ctx.fillRect(boardX - 1.5, py(backboard.top), 3, py(backboard.bottom) - py(backboard.top));
  line(backX, rimY, boardX, rimY, "#dd8760", [], 1.5);
  line(frontX, rimY, backX, rimY, "#f49d72", [], 2.4);
  const netY = py(rimHeight - 0.36);
  const narrow = (backX - frontX) * 0.23;
  const netOffset = netSwing * Math.min(6, (backX - frontX) * 0.3);
  for (let i = 0; i <= 4; i += 1) {
    const x = frontX + (backX - frontX) * i / 4;
    const endX = frontX + narrow + (backX - frontX - 2 * narrow) * i / 4 + netOffset;
    line(x, rimY + 2, endX, netY, "#87999e");
  }
  line(frontX + narrow + netOffset, netY, backX - narrow + netOffset, netY, "#a2b1b4");

  ctx.save();
  ctx.beginPath();
  ctx.rect(left - 1, top - 1, right - left + 2, bottom - top + 2);
  ctx.clip();
  const active = series.find(({ key }) => key === selectedLine);
  for (const trace of series) {
    if (trace === active) continue;
    ctx.globalAlpha = active ? (aim ? 0.16 : 0.47) : 1;
    drawPath(trace.points, tone(trace.color), active ? 1.4 : 2.4, trace.dash);
  }
  if (active) {
    ctx.globalAlpha = aim ? 0.28 : 1;
    drawPath(active.points, tone(active.color), 2.6, active.dash);
  }
  ctx.globalAlpha = 1;
  for (const { x, y } of samples) dot(px(x), py(y), 2.9, tone("rk4"), "#17242d");
  if (aim) {
    line(px(aim.held.x), py(aim.held.y), px(0), py(shot.release), "#f5ca9e", [3, 4], 1.5);
    for (const { x, y } of aim.points) dot(px(x), py(y), 2.2, "#fff1c7");
  }
  ctx.restore();

  if (grip && (!ball || ball.x !== 0 || aim)) dot(px(0), py(shot.release), 13, null, "#baa38d", [2, 3]);
  if (!ball) return;
  const x = px(ball.x);
  const floorRadius = ballRadius * project.yScale;
  const radius = Math.max(3.5, Math.min(10, floorRadius, (backX - frontX) * 0.41));
  const nearFloor = Math.max(0, 1 - (ball.y - ballRadius) / 0.3);
  const y = py(ball.y) + (floorRadius - radius) * nearFloor;
  ctx.fillStyle = "rgba(22, 17, 14, 0.4)";
  ctx.beginPath();
  ctx.ellipse(x, bottom + 2, radius * (1 + ball.y / (2 * yMax)), Math.max(1, 3 - ball.y / yMax), 0, 0, Math.PI * 2);
  ctx.fill();
  dot(x, y, radius, "#e5894a", "#ffd7aa");
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ball.spin);
  line(-radius * 0.88, 0, radius * 0.88, 0, "#5f321d");
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.43, radius * 0.88, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
