import assert from "node:assert/strict";
import test from "node:test";
import { bounds, defaults, exactState, rimHeight } from "./model.mjs";
import { aimShot, ballAt, ballRadius, playFlight } from "./physics.mjs";

test("pull direction uses the chart scales and power stays in range", () => {
  assert.equal(aimShot(0, 1, 20, 50, 120), null);
  assert.equal(aimShot(-20, 45, 20, 50, 120), null);
  assert.equal(aimShot(25, -40, 20, 50, 120), null);
  const diagonal = aimShot(20, 50, 20, 50, 120);
  assert.equal(diagonal.angle, 45);
  assert.ok(diagonal.speed > 5 && diagonal.speed < 15);
  assert.deepEqual(aimShot(0, 150, 20, 50, 120), { angle: bounds.maxAngle, speed: 15 });
});

test("the higher angle clears the net, then the ball bounces and rolls to rest", () => {
  const result = playFlight({ ...defaults, angle: 67.66 });
  assert.ok(result.scoredAt > 0);
  const entry = ballAt(result, result.scoredAt);
  assert.ok(entry.y <= rimHeight - ballRadius);
  assert.ok(result.floorAt > result.scoredAt);
  const bounces = result.collisions.filter(({ surface }) => surface === "floor");
  assert.ok(bounces.length > 1);
  assert.ok(result.frames.every(({ y }) => y >= ballRadius));
  assert.equal(result.frames.at(-1).y, ballRadius);
  const peakAfterBounce = Math.max(...result.frames
    .slice(Math.round(bounces[0].t * 240), Math.round(bounces[1].t * 240))
    .map(({ y }) => y));
  assert.ok(peakAfterBounce > ballRadius + 0.5 && peakAfterBounce < rimHeight);
});

test("the free-flight prediction matches the ball until contact", () => {
  const result = playFlight(defaults);
  const t = 0.4;
  const [x, y] = exactState(defaults, t);
  const animated = ballAt(result, t);
  assert.ok(Math.abs(x - animated.x) < 1e-8 && Math.abs(y - animated.y) < 1e-8);
  const collision = result.collisions[0];
  assert.equal(collision.surface, "backboard");
  assert.ok(ballAt(result, collision.t + 0.08).x < ballAt(result, collision.t).x);
  assert.equal(result.scoredAt, null);
});

test("a shallow center-path solution clips the rim", () => {
  const result = playFlight({ ...defaults, angle: 32.54 });
  assert.equal(result.collisions[0].surface, "rim");
  assert.equal(result.scoredAt, null);
});
