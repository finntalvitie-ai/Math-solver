# Math Solver on claude.ai

The version of the app that runs inside Claude: https://claude.ai/artifact/TDYQYrN2j6vZ3S9FcaC5yn

Write a problem with Apple Pencil, press Solve, and Claude reads the handwriting and solves it step by step.
It uses your own Claude account (the page's `sample` capability), so no API key is needed.

`math-solver.template.html` is the page source. The published page is this template with the contents
of `../solver.js` pasted in place of `/*SOLVER*/` (the built-in solver double-checks Claude's answers).
