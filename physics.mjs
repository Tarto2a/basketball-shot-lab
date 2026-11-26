import { bounds, exactState, gravity, rimHeight, rk4Step } from "./model.mjs";

export const ballRadius = 0.12;
export const hoop = { halfOpening: 0.2286, rimRadius: 0.012 };
export const backboard = { offset: 0.38, bottom: 2.9, top: 3.95 };
const dt = 1 / 240;
const maxFlightTime = 8;

// The pull sets direction and speed. Keep every shot within the lab's input range.
export function aimShot(pullX, pullY, xScale, yScale, powerPixels) {
  const pull = Math.hypot(pullX, pullY);
  if (pull < 8 || pullX < 0 || pullY < 0) return null;
  const angle = Math.atan2(pullY / yScale, pullX / xScale) * 180 / Math.PI;
  return {
    angle: Math.min(bounds.maxAngle, Math.max(bounds.minAngle, angle)),
    speed: 5 + 10 * Math.min(1, (pull - 8) / (powerPixels - 8)),
  };
}

function contact(state, x, y, radius, restitution) {
  const dx = state[0] - x;
  const dy = state[1] - y;
  const gap = Math.hypot(dx, dy);
  if (gap >= radius) return false;

  const velocity = Math.hypot(state[2], state[3]) || 1;
  const nx = gap > 1e-10 ? dx / gap : -state[2] / velocity;
  const ny = gap > 1e-10 ? dy / gap : -state[3] / velocity;
  const approach = state[2] * nx + state[3] * ny;
  state[0] = x + nx * radius;
  state[1] = y + ny * radius;
  if (approach >= 0) return false;
  const impulse = -(1 + restitution) * approach;
  state[2] += impulse * nx;
  state[3] += impulse * ny;
  return true;
}

export function playFlight(shot) {
  let state = exactState(shot, 0);
  let spin = 0;
  let rolling = false;
  let throughOpening = false;
  let scoredAt = null;
  let floorAt = null;
  const collisions = [];
  const frames = [{ x: state[0], y: state[1], spin }];
  const rate = ([, , u, w]) => [u, w, -shot.drag * u, -gravity - shot.drag * w];
  const rimX = shot.distance;
  const boardX = rimX + backboard.offset;
  const rimSpacing = hoop.halfOpening + hoop.rimRadius;

  for (let i = 1; i <= maxFlightTime / dt; i += 1) {
    const t = i * dt;
    const previous = state;
    if (rolling) {
      const nextSpeed = Math.sign(state[2]) * Math.max(0, Math.abs(state[2]) - 2.15 * dt);
      state = [state[0] + (state[2] + nextSpeed) * dt / 2, ballRadius, nextSpeed, 0];
    } else {
      state = rk4Step(state, dt, rate);
      const boardY = Math.max(backboard.bottom, Math.min(backboard.top, state[1]));
      if (contact(state, boardX, boardY, ballRadius, 0.72)) collisions.push({ t, surface: "backboard" });
      for (const rimEdge of [rimX - rimSpacing, rimX + rimSpacing]) {
        if (contact(state, rimEdge, rimHeight, ballRadius + hoop.rimRadius, 0.58)) {
          collisions.push({ t, surface: "rim" });
        }
      }

      if (scoredAt === null && state[3] < 0 && previous[1] >= rimHeight && state[1] < rimHeight) {
        const fraction = (previous[1] - rimHeight) / (previous[1] - state[1]);
        const entryX = previous[0] + fraction * (state[0] - previous[0]);
        throughOpening = Math.abs(entryX - rimX) <= hoop.halfOpening - ballRadius;
      }
      if (state[1] > rimHeight) throughOpening = false;
      if (throughOpening && state[1] <= rimHeight - ballRadius && scoredAt === null) {
        scoredAt = t;
        state[2] *= 0.84;
        state[3] *= 0.86;
      }

      if (state[1] <= ballRadius) {
        state[1] = ballRadius;
        if (state[3] < 0) {
          floorAt ??= t;
          collisions.push({ t, surface: "floor" });
          state[2] *= 0.68;
          state[3] *= -0.67;
          if (state[3] < 0.45) {
            rolling = true;
            state[3] = 0;
          }
        }
      }
    }

    spin += state[2] * dt / ballRadius;
    frames.push({ x: state[0], y: state[1], spin });
    if (rolling && Math.abs(state[2]) < 0.02) break;
  }

  return { frames, duration: (frames.length - 1) * dt, scoredAt, floorAt, collisions };
}

export function ballAt(flight, time) {
  const frame = Math.max(0, Math.min(flight.frames.length - 1, time / dt));
  const index = Math.floor(frame);
  const start = flight.frames[index];
  const next = flight.frames[index + 1] ?? start;
  const portion = frame - index;
  return {
    x: start.x + (next.x - start.x) * portion,
    y: start.y + (next.y - start.y) * portion,
    spin: start.spin + (next.spin - start.spin) * portion,
  };
}
