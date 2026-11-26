import { rimHeight } from "./model.mjs";

export function drawCourt(canvas, { shot, flight, series, samples, ball }) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
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
  const colors = getComputedStyle(canvas);
  const tone = (name) => colors.getPropertyValue("--" + name).trim();
  const left = width < 480 ? 34 : 46;
  const right = width - (width < 480 ? 18 : 29);
  const top = 25;
  const bottom = height - 40;
  const points = series.flatMap((line) => line.points);
  const xMax = Math.ceil(Math.max(shot.distance + 0.9, flight.range + 0.15, ...points.map(({ x }) => x)) / 2) * 2;
  const yMax = Math.ceil(Math.max(rimHeight + 0.8, flight.peak + 0.3, ...points.map(({ y }) => y)));
  const px = (value) => left + value / xMax * (right - left);
  const py = (value) => bottom - value / yMax * (bottom - top);

  function line(x1, y1, x2, y2, stroke, dash = [], weight = 1) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = weight;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  function dot(x, y, radius, fill, stroke) {
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  ctx.fillStyle = "#1b2b40";
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.fillStyle = "#513a35";
  ctx.fillRect(left, bottom, right - left, 8);
  ctx.fillStyle = tone("court-muted");
  ctx.font = "12px Segoe UI, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("y (m)", 9, 11);
  const verticalStep = yMax > 8 ? 2 : 1;
  for (let v = 0; v <= yMax; v += verticalStep) {
    const y = py(v);
    line(left, y, right, y, "#3b4c60");
    ctx.textAlign = "right";
    ctx.fillText(String(v), left - 6, y);
  }
  const horizontalStep = Math.max(2, Math.ceil(xMax / (width < 460 ? 5 : 9) / 2) * 2);
  for (let v = 0; v <= xMax; v += horizontalStep) {
    const x = px(v);
    line(x, top, x, bottom, "#35465c");
    line(x, bottom + 2, x, bottom + 8, "#aa7865");
    ctx.textAlign = "center";
    ctx.fillText(String(v), x, height - 20);
  }
  ctx.textAlign = "right";
  ctx.fillText("x (m)", right, height - 6);

  const rimX = px(shot.distance);
  const rimY = py(rimHeight);
  line(rimX, rimY, rimX, bottom, "#b4977b", [3, 5]);
  line(rimX + 16, rimY - 28, rimX + 16, rimY + 7, "#e5ebf5", [], 2);
  line(rimX - 11, rimY, rimX + 16, rimY, tone("flight"), [], 2);
  line(rimX - 8, rimY + 2, rimX - 3, rimY + 15, "#c3cddd");
  line(rimX + 10, rimY + 2, rimX + 5, rimY + 15, "#c3cddd");
  line(rimX - 3, rimY + 15, rimX + 5, rimY + 15, "#c3cddd");
  line(rimX - 5, rimY + 7, rimX + 8, rimY + 7, "#c3cddd");

  ctx.save();
  ctx.beginPath();
  ctx.rect(left - 2, top - 1, right - left + 4, bottom - top + 2);
  ctx.clip();
  for (const trace of series) {
    ctx.strokeStyle = tone(trace.color);
    ctx.lineWidth = trace.width;
    ctx.setLineDash(trace.dash);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    trace.points.forEach(({ x, y }, index) => {
      if (index === 0) ctx.moveTo(px(x), py(y));
      else ctx.lineTo(px(x), py(y));
    });
    ctx.stroke();
  }
  for (const { x, y } of samples) dot(px(x), py(y), 3, tone("rk4"), "#172539");
  ctx.restore();

  if (ball) {
    const x = px(ball[0]);
    const y = py(Math.max(ball[1], 0));
    dot(x, y, 7.4, "#ffae75", "#fff4df");
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ball[0] * 1.5 + 0.45);
    line(-5.8, 0, 5.8, 0, "#743712");
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.1, 5.8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
