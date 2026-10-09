# Math Solver

Write any math problem with Apple Pencil on a writing pad. Claude reads your handwriting, solves the problem step by step, and answers follow-up questions about it. Works on iPad (and any browser) and can be added to the Home Screen as an app.

## How it works

1. Write the problem on the pad (or add a photo of it, or type it).
2. Press **Solve**. The handwriting is sent as an image to Claude (`claude-opus-5-5`).
3. Claude shows what it read ("I read this as"), the answer, and every step.
4. Ask follow-up questions underneath, like "why did you divide by 3?".

It handles any kind of math Claude can do: arithmetic, algebra, inequalities, systems, word problems, geometry, trigonometry, calculus, probability, statistics and proofs.

**Double-check:** when a problem comes down to equations or a calculation, the app's built-in solver (`solver.js`) solves Claude's equations separately and compares the numbers. You see "✓ Double-checked" when they agree and a warning when they don't. Not every problem can be double-checked this way (proofs or geometry reasoning, for example).

## What you need

- An internet connection.
- Your own Anthropic API key with credit: create one at [console.anthropic.com](https://console.anthropic.com/settings/keys) and paste it into the app once. It is stored only in that browser and sent only to Anthropic.
- Each problem costs roughly 3–10 US cents on your Anthropic account; follow-up questions cost about the same.

## Put it on your iPad

The app has to be served over HTTPS. The simplest way is GitHub Pages:

1. On GitHub, open the repository → **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, pick the branch with these files and the `/ (root)` folder, then **Save**.
3. After a minute the site is at `https://<your-user>.github.io/<repo>/`.
4. On the iPad, open that link in **Safari**, tap **Share → Add to Home Screen**.

## Apple Pencil

- Line weight follows pencil pressure.
- Palm touches are ignored once the Pencil has touched the pad.
- Pen, Eraser, Undo and Clear are above the pad.

## Run locally

```sh
npm start   # serves on http://localhost:8000
npm test    # runs the tests for the built-in double-check solver (Node 18+)
```

## Files

- `index.html`, `styles.css`, `app.js`: the writing pad, the Claude connection and the results.
- `solver.js`: the built-in solver used for the double-check. No dependencies.
- `manifest.webmanifest`, `icons/`: Home Screen app icon and name.
- `sw.js`: removes the offline cache left by earlier versions.
- `tests/solver.test.js`: tests for the solver.
