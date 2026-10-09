# Math Solver

A step-by-step math solver for equations, inequalities, systems, formulas and word problems that installs as an app on iPad, iPhone, Android and desktop, and works offline. On iPad you can write problems with Apple Pencil.

## What it solves

All of this runs on the device, offline:

- **Arithmetic** like `(2 + 3) × 4 − 6 ÷ 2`, `5!`, `15% of 80`, one operation per step, with fractions where they apply.
- **Equations in any letter**: linear (with a check step), quadratic (exact surd and complex answers, factored form), cubic and higher (all real roots), and equations with sin, cos, ln, √, abs and so on (solved numerically between −50 and 50).
- **Inequalities** with `<`, `>`, `≤`, `≥`, `≠`: linear (including flipping the sign when dividing by a negative), quadratic and higher with a sign chart, rational and square-root ones, and double inequalities like `1 < 2x + 3 ≤ 7`. Answers come as inequalities and in interval notation, with the solution shaded on the graph.
- **Systems of equations**, one per line (or separated by `;`): linear systems of any size by elimination, including no-solution and infinitely-many cases, and two-equation non-linear systems where one equation is linear (like `x + y = 5`, `xy = 6`).
- **Formulas**: `solve for r: A = πr²` → `r = ±√(A / π)`; `v = u + at, solve for a` → `a = (v − u) / t`.
- **Expressions in several letters**: `(a + b)²` → `a² + 2ab + b²`.

Not supported: inequalities in more than one letter, non-linear systems with three or more letters, and rearranging formulas where the letter appears cubed or inside a function. The numerical solver can miss a solution where the graph only touches zero without crossing it.

## Word problems

Word problems are read by Claude (model `claude-opus-5-5`), which needs an internet connection and your own Anthropic API key:

1. Create a key at [console.anthropic.com](https://console.anthropic.com/settings/keys) and add credit to the account.
2. Paste it into the **Word problems** panel. It is stored only in that browser and sent only to Anthropic.

Claude writes the equations; the app's own engine then solves them step by step and checks its numbers against Claude's answer, showing "✓ Checked" or a warning if they differ. Each word problem costs a few US cents. Claude can still misread a problem, so read the "Setting it up" section, especially when there is a warning.

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
