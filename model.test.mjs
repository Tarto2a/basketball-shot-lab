import assert from "node:assert/strict";
import test from "node:test";
import {
  bounds, defaults, exactState, fitDrag, gravity, integrate, maxError, referenceFlight,
  rimHeight, samplePositions, solveAngles,
} from "./model.mjs";

test("the exact solution matches projectiles with zero and very small drag", () => {
  const shot = { ...defaults, drag: 0, angle: 45 };
  const component = shot.speed / Math.SQRT2;
  const t = 1.25;
  const expected = [component * t, shot.release + component * t - gravity * t * t / 2, component, component - gravity * t];
  for (const drag of [0, 1e-10]) {
    const state = exactState({ ...shot, drag }, t);
    state.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-8));
  }
  const flight = referenceFlight(shot);
  assert.ok(Math.abs(exactState(shot, flight.t)[1]) < 1e-10);
});

test("angle solvers agree on both available descending shots", () => {
  const solutions = solveAngles(defaults);
  assert.equal(solutions.length, 2);
  for (const { angle, time, bisection, newton } of solutions) {
    const shot = { ...defaults, angle };
    const [x, y, , verticalSpeed] = exactState(shot, time);
    assert.ok(Math.abs(x - shot.distance) < 1e-9);
    assert.ok(Math.abs(y - rimHeight) < 1e-8);
    assert.ok(verticalSpeed < 0);
    assert.ok(Math.abs(bisection.angle - newton.angle) < 1e-5);
    assert.ok(newton.trace.length < bisection.trace.length);
  }
});

test("the angle search handles unreachable shots and excludes rising solutions", () => {
  assert.deepEqual(solveAngles({ ...defaults, speed: 5, distance: 8, drag: 0.6 }), []);
  const shot = { ...defaults, speed: 9, distance: 3.5, drag: 0 };
  const steep = solveAngles(shot);
  assert.equal(steep.length, 1);
  const [result] = steep;
  assert.ok(result.angle > 70);
  assert.ok(exactState({ ...shot, angle: result.angle }, result.time)[3] < 0);
});

test("RK4 and Euler converge and end at the same reference time", () => {
  const until = referenceFlight(defaults).t;
  for (const method of ["euler", "rk4"]) {
    const coarse = integrate({ ...defaults, step: 0.2 }, method, until);
    const fine = integrate({ ...defaults, step: 0.1 }, method, until);
    assert.equal(coarse.at(-1).t, until);
    assert.equal(fine.at(-1).t, until);
    const improvement = maxError(defaults, coarse) / maxError(defaults, fine);
    assert.ok(improvement > (method === "euler" ? 1.6 : 12));
  }
  const noDrag = { ...defaults, drag: 0 };
  assert.deepEqual(integrate(noDrag, "rk4", until), integrate(noDrag, "rk4", until, "quadratic"));
});

test("curve fitting recovers the known coefficient without noise", () => {
  for (const drag of [0, 0.164, 0.447, bounds.maxDrag]) {
    const shot = { ...defaults, drag };
    const samples = samplePositions(shot, referenceFlight(shot).t, 0, 42);
    const result = fitDrag(defaults, samples);
    assert.equal(samples.length, 19);
    assert.ok(Math.abs(result.drag - drag) < 1e-8);
    assert.ok(result.rmse < 1e-8);
  }
});
