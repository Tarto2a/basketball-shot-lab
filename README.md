# Basketball Shot Lab

A browser-based basketball game and lab for Differential Equations & Numerical Analysis. Pull the ball back and down, then release to shoot. The ball can hit the rim or backboard, fall through the hoop, and bounce and roll on the floor.

## Run locally

With Node.js 22.12 or newer, run these commands from the repository.

```sh
npm ci
npm run dev
```

Open [Basketball Shot Lab](http://127.0.0.1:4174/). Keep the server running while using the app. Use `npm test` for the numerical checks and `npm run build` for TypeScript checking and a production build in `dist/`. In PowerShell, use `npm.cmd` if your execution policy blocks `npm.ps1`.

## Math components and shadcn setup

- `components/ui/` is the default component path, defined by `aliases.ui` in `components.json`. The `@/` alias resolves to the repository root in both TypeScript and Vite. The folder matters because it is where shadcn places registry UI components and where the math kit resolves its shared imports.
- `styles/tailwind.css` is the Tailwind CSS entry configured in `components.json`. The court and game layout use `styles.css`.
- `components/ui/math-base-kit.tsx` exports the block and inline equation plugins. `components/ui/demo.tsx` is a self-contained example. The game passes LaTeX strings to `renderMath`, and Plate renders them with KaTeX.

This repository already has the configuration. For a fresh React and TypeScript project, run `npx shadcn@latest init -t vite` and follow the setup prompts. For an existing React and Vite project that needs TypeScript and Tailwind, install the missing packages.

```sh
npm install -D typescript @types/node @types/react @types/react-dom tailwindcss @tailwindcss/vite
npm install platejs @platejs/math katex
```

Register the Tailwind Vite plugin, import Tailwind in your stylesheet, and set the same `@/` alias in TypeScript and Vite. Then run `npx shadcn@latest init`. For a physical `components/ui/` folder at the repository root, point `@/` at that root and set `aliases.ui` to `@/components/ui`. [shadcn Vite setup](https://ui.shadcn.com/docs/installation/vite) · [Tailwind Vite setup](https://tailwindcss.com/docs/installation/using-vite)

## Demonstrate the project

1. Pull the ball back and down to preview all four trajectories as you aim, then release to shoot. A longer pull increases speed. You can also set the sliders and press **Shoot** with a keyboard.
2. Reset the inputs and open **Find an angle**. At the default speed and distance, the ball’s predicted center reaches rim height while descending at approximately 32.54° and 67.66°. The lower shot clips the front rim in the game. The higher shot passes through. Open the iteration history to compare bisection and safeguarded Newton.
3. Select a line to see its equation and first predicted position below the legend. The current angle, speed, drag, and time step feed the values shown. While aiming, the four curves have equal emphasis. Open **Compare solvers** and reduce the time step to observe Euler and RK4 move toward the exact path.
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
