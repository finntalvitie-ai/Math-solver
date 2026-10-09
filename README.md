# Math Solver

A step-by-step math solver that installs as an app on iPad, iPhone, Android and desktop, and works offline. On iPad you can write problems with Apple Pencil.

## What it solves

- **Arithmetic** like `(2 + 3) × 4 − 6 ÷ 2`, one operation per step, with fractions where they apply.
- **Linear equations** like `3(x − 2) = 2x + 7`, ending with a check that puts the answer back into both sides.
- **Quadratics** using the discriminant and quadratic formula, with exact surd answers (`(3 ± √5) / 2`), the factored form, and complex answers.
- **Cubics and higher, and equations with sin, cos, tan, ln, log, abs**: solved numerically between x = −50 and 50 and rounded to 6 decimal places.
- **Expressions in x** like `(x + 1)^3`: expanded and simplified.

Every problem with x gets a graph with the solutions marked.

Not supported: inequalities, systems of equations, and variables other than `x`. The numerical solver can miss a solution where the graph only touches zero without crossing it.

## Apple Pencil

- **Problem box:** write straight into it. iPadOS Scribble turns handwriting into text (Settings → Apple Pencil → Scribble must be on).
- **Scratchpad:** draw your working by hand. Line weight follows pencil pressure, and palm touches are ignored once the Pencil has touched the page. It is for your own working only and is not read by the solver.

## Install it on iPad

The app has to be served over HTTPS first. The simplest way is GitHub Pages:

1. On GitHub, open the repository → **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, pick the branch with these files and the `/ (root)` folder, then **Save**.
3. After a minute the site is at `https://<your-user>.github.io/<repo>/`.
4. On the iPad, open that link in **Safari**, tap **Share → Add to Home Screen**.

It then opens full screen from its own icon and keeps working without internet.

## Run locally

```sh
npm start   # serves on http://localhost:8000
npm test    # runs the solver tests (Node 18+)
```

## Files

- `solver.js`: the solving engine (parsing, steps, graph data). No dependencies.
- `app.js`, `index.html`, `styles.css`: the interface and scratchpad.
- `manifest.webmanifest`, `sw.js`, `icons/`: what makes it installable and work offline.
- `tests/solver.test.js`: tests for the engine.
