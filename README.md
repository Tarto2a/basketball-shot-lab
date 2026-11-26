# Basketball Shot Lab

A browser-based project for Differential Equations & Numerical Analysis. Adjust a basketball shot, display its trajectory, and use numerical methods to find the angles where the ball crosses the rim height while descending.

## Run locally

With Node.js 20 or newer, run the command from this repository.

```sh
node server.mjs
```

Open [Basketball Shot Lab](http://127.0.0.1:4174/). Keep the server running while using the app. Run `node --test` to check the numerical methods. The app uses plain HTML, CSS, and JavaScript and has no packages to install.

## Demonstrate the project

1. Shoot from the default settings. The ball passes high at the hoop.
2. Open **Find an angle**. With the default speed and distance, the model finds two descending solutions, approximately 32.54° and 67.66°. Apply either angle and shoot again. Open the iteration history to compare bisection and safeguarded Newton.
3. Open **Compare solvers**. Change the time step and observe the errors in Euler and RK4 relative to the exact linear-drag solution. Turn on the quadratic-drag trajectory to compare the two drag laws.
4. Open **Fit air resistance**. Adjust the noise on the 19 simulated positions and compare the fitted linear coefficient with the coefficient that generated the data.
5. Open **Laplace derivation** to see the transform and inverse transform for the reference trajectory.

## Mathematical model

The state is `(x, y, u, w)`, with position `(x, y)`, horizontal velocity `u`, and vertical velocity `w`. A point-mass ball under gravity and linear drag follows `x′ = u`, `y′ = w`, `u′ = −ku`, and `w′ = −g − kw`. The release angle and speed determine `u(0)` and `w(0)`. The hoop is at a height of 3.05 m.

- **Laplace and inverse Laplace transforms.** Transform the two velocity equations, invert them, and integrate to get position. The zero-drag case uses the usual constant-acceleration solution.
- **Numerical ODEs.** Euler and RK4 use the same linear model and compare their positions with the exact solution at their integration times. For the optional quadratic comparison, RK4 uses the coefficient `k / speed at release` so both drag laws have the same acceleration magnitude at release.
- **Iterative methods.** For a fixed speed, the root is a release angle where the height at the hoop’s horizontal coordinate equals the rim height. The solver brackets each monotone portion of the angle range. Newton uses the derivative with respect to angle and falls back to the midpoint when a candidate leaves its bracket.
- **Curve fitting.** Least squares minimizes the summed squared residuals in both coordinates by varying the linear drag coefficient. A coarse search locates a candidate interval and ternary search refines it.

The target preview uses a ±12 cm vertical window and requires descending motion. It illustrates a point-mass trajectory and does not simulate contact with the rim or backboard.
