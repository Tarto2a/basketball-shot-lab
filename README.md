# Basketball Shot Lab

A browser-based basketball game and lab for Differential Equations & Numerical Analysis. Pull the ball back and down, then release to shoot. The ball can hit the rim or backboard, fall through the hoop, and bounce and roll on the floor.

## Run locally

With Node.js 20 or newer, run the command from this repository.

```sh
node server.mjs
```

Open [Basketball Shot Lab](http://127.0.0.1:4174/). Keep the server running while using the app. Run `node --test` to check the numerical methods. The app uses plain HTML, CSS, and JavaScript and has no packages to install.

## Demonstrate the project

1. Pull the ball back and down, then release. A longer pull increases speed. The dotted guide previews the launch. You can also set the sliders and press **Shoot** with a keyboard.
2. Reset the inputs and open **Find an angle**. At the default speed and distance, the ball’s predicted center reaches rim height while descending at approximately 32.54° and 67.66°. The lower shot clips the front rim in the game. The higher shot passes through. Open the iteration history to compare bisection and safeguarded Newton.
3. Select one of the four lines to highlight its prediction. Open **Compare solvers** and reduce the time step to observe Euler and RK4 move toward the exact path.
4. Open **Fit air resistance**. Adjust the noise on the 19 simulated positions and compare the fitted linear coefficient with the coefficient that generated the data.
5. Open **Laplace derivation** to see the transform and inverse transform for the reference trajectory.

## Mathematical model

The state is `(x, y, u, w)`, with position `(x, y)`, horizontal velocity `u`, and vertical velocity `w`. A point-mass ball under gravity and linear drag follows `x′ = u`, `y′ = w`, `u′ = −ku`, and `w′ = −g − kw`. The release angle and speed determine `u(0)` and `w(0)`. The hoop is at a height of 3.05 m.

- **Laplace and inverse Laplace transforms.** Transform the two velocity equations, invert them, and integrate to get position. The zero-drag case uses the usual constant-acceleration solution.
- **Numerical ODEs.** Euler and RK4 use the same linear model and compare their positions with the exact solution at their integration times. For the optional quadratic comparison, RK4 uses the coefficient `k / speed at release` so both drag laws have the same acceleration magnitude at release.
- **Iterative methods.** For a fixed speed, the root is a release angle where the height at the hoop’s horizontal coordinate equals the rim height. The solver brackets each monotone portion of the angle range. Newton uses the derivative with respect to angle and falls back to the midpoint when a candidate leaves its bracket.
- **Curve fitting.** Least squares minimizes the summed squared residuals in both coordinates by varying the linear drag coefficient. A coarse search locates a candidate interval and ternary search refines it.

The four lines are free-flight predictions. Orange is exact Laplace, purple is Euler, teal is RK4 with linear drag, and gold is RK4 with quadratic drag. Euler advances with the velocity at the start of the step, which puts its trajectory above Laplace at the default settings.

The court scale stays fixed while you adjust parameters. Use **Fit shot** to frame a longer or higher trajectory and **Reset view** to return to the practice-court scale.

The played ball uses linear drag, a fixed 1/240-second physics step, and a 12 cm radius. Contact with the rim, backboard, and floor changes its velocity. A make requires the ball to enter from above and clear the rim opening. A brief loss of speed simulates passage through the net. Restitution and rolling resistance are illustrative simulation parameters.
