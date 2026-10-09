// Math solver engine: parses a problem, solves it, and returns the answer, steps and graph data.
// Works in the browser (self.MathSolver) and in Node (module.exports) for tests.
(function (root) {
  function makeSolver() {
    const FNS = ['sqrt', 'sin', 'cos', 'tan', 'ln', 'log', 'abs'];
    const NAMES = ['sqrt', 'sin', 'cos', 'tan', 'ln', 'log', 'abs', 'pi', 'x', 'e'];
    const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
    const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };
    const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };
    const fail = (msg) => { const e = new Error(msg); e.user = true; throw e; };
    const isInt = (v) => Math.abs(v - Math.round(v)) < 1e-9;
    const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { const t = b; b = a % b; a = t; } return a; };

    function fmt(v) {
      if (!isFinite(v)) return 'undefined';
      let r = Math.round(v * 1e10) / 1e10;
      if (r === 0) r = 0;
      const s = (Math.abs(r) >= 1e12 || (Math.abs(r) < 1e-6 && r !== 0)) ? r.toExponential(6) : String(+r.toPrecision(12));
      return s.replace('-', '−');
    }
    function frac(v) {
      if (!isFinite(v) || isInt(v)) return null;
      for (let q = 2; q <= 1000; q++) {
        const p = Math.round(v * q);
        if (Math.abs(p / q - v) < 1e-9) return (p < 0 ? '−' : '') + Math.abs(p) + '/' + q;
      }
      return null;
    }
    const nice = (v) => frac(v) || fmt(v);
    const paren = (s) => (s.charAt(0) === '−' || s.indexOf('/') >= 0) ? '(' + s + ')' : s;
    const clean = (v) => isInt(v) ? Math.round(v) : v;

    function normalize(s) {
      return s.replace(/\s+/g, '').replace(/[×·∙]/g, '*').replace(/÷/g, '/').replace(/[−–—]/g, '-')
        .replace(/²/g, '^2').replace(/³/g, '^3').replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/,/g, '.');
    }
    function tokenize(s) {
      const t = [];
      let i = 0;
      while (i < s.length) {
        const c = s[i];
        if (/[0-9.]/.test(c)) {
          let j = i;
          while (j < s.length && /[0-9.]/.test(s[j])) j++;
          const txt = s.slice(i, j);
          if (!/^(\d+\.?\d*|\.\d+)$/.test(txt)) fail('“' + txt + '” is not a number.');
          t.push({ k: 'num', v: parseFloat(txt) });
          i = j;
        } else if (/[a-z]/i.test(c)) {
          let j = i;
          while (j < s.length && /[a-z]/i.test(s[j])) j++;
          let w = s.slice(i, j).toLowerCase();
          while (w.length) {
            const m = NAMES.find((n) => w.indexOf(n) === 0);
            if (!m) fail('Unknown letter “' + w[0] + '”. Use x as the variable.');
            if (FNS.indexOf(m) >= 0) t.push({ k: 'fn', v: m });
            else if (m === 'x') t.push({ k: 'var', v: 'x' });
            else t.push({ k: 'const', v: m });
            w = w.slice(m.length);
          }
          i = j;
        } else if ('+-*/^()'.indexOf(c) >= 0) {
          t.push({ k: 'op', v: c });
          i++;
        } else {
          fail('Unexpected symbol “' + c + '”.');
        }
      }
      return t;
    }
    function parse(tokens) {
      let i = 0;
      const peek = () => tokens[i];
      const isOp = (v) => peek() && peek().k === 'op' && peek().v === v;
      const startsAtom = () => { const t = peek(); return t && (t.k !== 'op' || t.v === '('); };
      function expr() {
        let n = term();
        while (isOp('+') || isOp('-')) { const op = tokens[i++].v; n = { t: 'bin', op, a: n, b: term() }; }
        return n;
      }
      function term() {
        let n = unary();
        for (;;) {
          if (isOp('*') || isOp('/')) { const op = tokens[i++].v; n = { t: 'bin', op, a: n, b: unary() }; }
          else if (startsAtom()) n = { t: 'bin', op: '*', a: n, b: power() };
          else break;
        }
        return n;
      }
      function unary() {
        if (isOp('-')) { i++; return { t: 'neg', a: unary() }; }
        if (isOp('+')) { i++; return unary(); }
        return power();
      }
      function power() {
        const base = atom();
        if (isOp('^')) { i++; return { t: 'bin', op: '^', a: base, b: unary() }; }
        return base;
      }
      function atom() {
        const t = tokens[i++];
        if (!t) fail('The problem ends too early — something is missing.');
        if (t.k === 'num') return { t: 'num', v: t.v };
        if (t.k === 'var') return { t: 'var' };
        if (t.k === 'const') return { t: 'const', v: t.v };
        if (t.k === 'fn') return { t: 'fn', f: t.v, a: isOp('(') ? atom() : power() };
        if (t.v === '(') {
          const n = expr();
          if (!isOp(')')) fail('A closing bracket “)” is missing.');
          i++;
          return n;
        }
        fail('Unexpected “' + t.v + '”.');
      }
      const n = expr();
      if (i < tokens.length) fail('Unexpected “' + tokens[i].v + '”.');
      return n;
    }

    function applyFn(f, v) {
      switch (f) {
        case 'sqrt': return Math.sqrt(v);
        case 'sin': return Math.sin(v);
        case 'cos': return Math.cos(v);
        case 'tan': return Math.tan(v);
        case 'ln': return Math.log(v);
        case 'log': return Math.log10(v);
        case 'abs': return Math.abs(v);
      }
      return NaN;
    }
    function binop(op, a, b) {
      switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        case '^': return Math.pow(a, b);
      }
      return NaN;
    }
    function ev(n, x) {
      switch (n.t) {
        case 'num': return n.v;
        case 'var': return x;
        case 'const': return n.v === 'pi' ? Math.PI : Math.E;
        case 'neg': return -ev(n.a, x);
        case 'fn': return applyFn(n.f, ev(n.a, x));
        case 'bin': return binop(n.op, ev(n.a, x), ev(n.b, x));
      }
      return NaN;
    }
    const hasX = (n) => n.t === 'var' || (!!n.a && hasX(n.a)) || (!!n.b && hasX(n.b));

    function show(n, pp) {
      pp = pp || 0;
      switch (n.t) {
        case 'num': { const s = fmt(n.v); return n.v < 0 && pp >= 2 ? '(' + s + ')' : s; }
        case 'var': return 'x';
        case 'const': return n.v === 'pi' ? 'π' : 'e';
        case 'fn': return (n.f === 'sqrt' ? '√' : n.f) + '(' + show(n.a, 0) + ')';
        case 'neg': { const s = '−' + show(n.a, 3); return pp >= 2 ? '(' + s + ')' : s; }
        case 'bin': {
          const p = PREC[n.op];
          let s;
          if (n.op === '^') {
            const base = show(n.a, 5);
            s = (n.b.t === 'num' && isInt(n.b.v) && n.b.v >= 0 && n.b.v < 10) ? base + SUP[String(n.b.v)] : base + '^' + show(n.b, 4);
          } else {
            const L = show(n.a, p), R = show(n.b, p + 1);
            const juxt = n.op === '*' && n.a.t === 'num' && n.a.v >= 0 &&
              (n.b.t === 'var' || n.b.t === 'const' || n.b.t === 'fn' || (n.b.t === 'bin' && n.b.op === '^' && n.b.a.t === 'var'));
            s = juxt ? L + R : L + ' ' + SYM[n.op] + ' ' + R;
          }
          return p < pp ? '(' + s + ')' : s;
        }
      }
      return '';
    }

    function checkedFn(f, v) {
      const r = applyFn(f, v);
      if (f === 'sqrt' && v < 0) fail('The square root of a negative number has no real value.');
      if ((f === 'ln' || f === 'log') && v <= 0) fail('Logarithms are only defined for positive numbers.');
      if (!isFinite(r)) fail(f + ' is undefined at that value.');
      return r;
    }
    function checkedBin(op, a, b) {
      if (op === '/' && b === 0) fail('Division by zero is undefined.');
      const r = binop(op, a, b);
      if (!isFinite(r)) fail('That power has no real value.');
      return r;
    }
    const VERB = { '+': 'Add', '-': 'Subtract', '*': 'Multiply', '/': 'Divide', '^': 'Work out the power' };
    function reduce(n) {
      if (n.t === 'num' || n.t === 'var') return null;
      if (n.t === 'const') { const v = ev(n, 0); return { node: { t: 'num', v }, desc: 'Replace ' + show(n) + ' with its value, about ' + fmt(v) }; }
      if (n.t === 'neg') {
        if (n.a.t === 'num') return { node: { t: 'num', v: -n.a.v }, desc: 'Apply the minus sign' };
        const r = reduce(n.a);
        return r && { node: { t: 'neg', a: r.node }, desc: r.desc };
      }
      if (n.t === 'fn') {
        if (n.a.t === 'num') { const v = checkedFn(n.f, n.a.v); return { node: { t: 'num', v }, desc: 'Evaluate ' + show(n) + ' = ' + fmt(v) }; }
        const r = reduce(n.a);
        return r && { node: { t: 'fn', f: n.f, a: r.node }, desc: r.desc };
      }
      if (n.a.t !== 'num') { const r = reduce(n.a); if (r) return { node: { t: 'bin', op: n.op, a: r.node, b: n.b }, desc: r.desc }; }
      if (n.b.t !== 'num') { const r = reduce(n.b); if (r) return { node: { t: 'bin', op: n.op, a: n.a, b: r.node }, desc: r.desc }; }
      if (n.a.t === 'num' && n.b.t === 'num') {
        const v = checkedBin(n.op, n.a.v, n.b.v);
        return { node: { t: 'num', v }, desc: VERB[n.op] + ': ' + show(n) + ' = ' + fmt(v) };
      }
      return null;
    }

    function trim(p) { p = p.map((c) => Math.abs(c - Math.round(c)) < 1e-10 ? Math.round(c) : c); while (p.length > 1 && Math.abs(p[p.length - 1]) < 1e-12) p.pop(); return p; }
    function padd(p, q, s) { const r = []; for (let i = 0; i < Math.max(p.length, q.length); i++) r[i] = (p[i] || 0) + s * (q[i] || 0); return trim(r); }
    function pmul(p, q) { const r = new Array(p.length + q.length - 1).fill(0); p.forEach((a, i) => q.forEach((b, j) => { r[i + j] += a * b; })); return trim(r); }
    function toPoly(n) {
      switch (n.t) {
        case 'num': return [n.v];
        case 'var': return [0, 1];
        case 'const': return [ev(n, 0)];
        case 'neg': { const p = toPoly(n.a); return p && p.map((c) => -c); }
        case 'fn': { const p = toPoly(n.a); if (!p || p.length > 1) return null; const v = applyFn(n.f, p[0]); return isFinite(v) ? [v] : null; }
        case 'bin': {
          const p = toPoly(n.a), q = toPoly(n.b);
          if (!p || !q) return null;
          if (n.op === '+') return padd(p, q, 1);
          if (n.op === '-') return padd(p, q, -1);
          if (n.op === '*') return pmul(p, q);
          if (n.op === '/') { if (q.length > 1 || q[0] === 0) return null; return trim(p.map((c) => c / q[0])); }
          if (n.op === '^') {
            if (q.length > 1) return null;
            const k = q[0];
            if (p.length === 1) { const v = Math.pow(p[0], k); return isFinite(v) ? [v] : null; }
            if (!isInt(k) || k < 0 || k > 12) return null;
            let r = [1];
            for (let i = 0; i < Math.round(k); i++) r = pmul(r, p);
            return r;
          }
        }
      }
      return null;
    }
    function showPoly(p) {
      let s = '';
      for (let d = p.length - 1; d >= 0; d--) {
        const c = p[d];
        if (Math.abs(c) < 1e-12) continue;
        const neg = c < 0;
        let coef = nice(Math.abs(c));
        if (d > 0 && coef === '1') coef = '';
        else if (d > 0 && coef.indexOf('/') >= 0) coef = '(' + coef + ')';
        const xs = d === 0 ? '' : d === 1 ? 'x' : 'x' + String(d).split('').map((ch) => SUP[ch]).join('');
        const term = coef + xs;
        s += s === '' ? (neg ? '−' : '') + term : (neg ? ' − ' : ' + ') + term;
      }
      return s || '0';
    }

    function safe(f, x) { try { return f(x); } catch (e) { return NaN; } }
    function niceStep(r) { const p = Math.pow(10, Math.floor(Math.log10(r))); const m = r / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
    function makePlot(f, roots, caption) {
      const W = 560, H = 320;
      let x0 = -10, x1 = 10;
      const real = roots.filter((r) => isFinite(r));
      if (real.length) {
        const lo = Math.min.apply(null, real), hi = Math.max.apply(null, real);
        const c = (lo + hi) / 2, half = Math.max(5, (hi - lo) / 2 * 1.25 + 2);
        x0 = c - half; x1 = c + half;
      }
      const N = 320, pts = [];
      for (let i = 0; i <= N; i++) { const x = x0 + (x1 - x0) * i / N; pts.push([x, safe(f, x)]); }
      const ys = pts.map((p) => p[1]).filter((y) => isFinite(y)).sort((a, b) => a - b);
      let y0 = -10, y1 = 10;
      if (ys.length) {
        const q = (t) => ys[Math.min(ys.length - 1, Math.floor(t * (ys.length - 1)))];
        y0 = Math.min(q(0.03), 0); y1 = Math.max(q(0.97), 0);
        if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
        const pad = (y1 - y0) * 0.12; y0 -= pad; y1 += pad;
      }
      const X = (x) => (x - x0) / (x1 - x0) * W, Y = (y) => H - (y - y0) / (y1 - y0) * H;
      const r1 = (v) => Math.round(v * 10) / 10;
      let d = '', pen = false, prev = 0;
      pts.forEach((pt) => {
        if (!isFinite(pt[1])) { pen = false; return; }
        const py = Math.max(-H, Math.min(2 * H, Y(pt[1])));
        if (pen && Math.abs(py - prev) > H * 0.9) pen = false;
        d += (pen ? 'L' : 'M') + r1(X(pt[0])) + ' ' + r1(py) + ' ';
        pen = true; prev = py;
      });
      const sx = niceStep((x1 - x0) / 8), sy = niceStep((y1 - y0) / 6);
      let g = '';
      for (let v = Math.ceil(x0 / sx) * sx; v <= x1; v += sx) g += 'M' + r1(X(v)) + ' 0V' + H + ' ';
      for (let v = Math.ceil(y0 / sy) * sy; v <= y1; v += sy) g += 'M0 ' + r1(Y(v)) + 'H' + W + ' ';
      let ax = '';
      if (y0 <= 0 && y1 >= 0) ax += 'M0 ' + r1(Y(0)) + 'H' + W + ' ';
      if (x0 <= 0 && x1 >= 0) ax += 'M' + r1(X(0)) + ' 0V' + H + ' ';
      const rr = 6;
      let dots = '';
      real.forEach((r) => {
        const cx = r1(X(r)), cy = r1(Y(0));
        dots += 'M' + r1(cx - rr) + ' ' + cy + 'a' + rr + ' ' + rr + ' 0 1 0 ' + (2 * rr) + ' 0a' + rr + ' ' + rr + ' 0 1 0 ' + (-2 * rr) + ' 0Z ';
      });
      const lab = (v) => fmt(Math.round(v * 100) / 100);
      return { grid: g, axes: ax, curve: d, dots, caption, xRange: 'x: ' + lab(x0) + ' to ' + lab(x1), yRange: 'y: ' + lab(y0) + ' to ' + lab(y1) };
    }
    function scan(f, lo, hi, h) {
      const roots = [];
      const push = (r) => { if (!roots.length || Math.abs(roots[roots.length - 1] - r) > 1e-6) roots.push(r); };
      const n = Math.round((hi - lo) / h);
      let xp = lo, yp = safe(f, lo);
      for (let i = 1; i <= n; i++) {
        const x = lo + i * h, y = safe(f, x);
        if (isFinite(yp) && Math.abs(yp) < 1e-9) push(xp);
        else if (isFinite(yp) && isFinite(y) && yp * y < 0) {
          let a = xp, b = x, fa = yp;
          for (let k = 0; k < 70; k++) {
            const m = (a + b) / 2, fm = safe(f, m);
            if (!isFinite(fm)) break;
            if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
          }
          const r = (a + b) / 2;
          if (Math.abs(safe(f, r)) < 1e-6) push(r);
        }
        xp = x; yp = y;
      }
      if (isFinite(yp) && Math.abs(yp) < 1e-9) push(xp);
      return roots;
    }
    const fmt6 = (r) => isInt(r) && Math.abs(r - Math.round(r)) < 1e-7 ? 'x = ' + fmt(Math.round(r)) : 'x ≈ ' + fmt(Math.round(r * 1e6) / 1e6);

    function exactPair(a, b, D, imag) {
      if (![a, b, D].every(isInt)) return null;
      const AD = Math.round(Math.abs(D)), sq = Math.round(Math.sqrt(AD));
      if (sq * sq === AD) return null;
      let k = 1, m = AD;
      for (let f = 2; f * f <= m; f++) while (m % (f * f) === 0) { m /= f * f; k *= f; }
      let B = -Math.round(b), K = k, A = 2 * Math.round(a);
      const g = gcd(gcd(B, K), A);
      B /= g; K /= g; A /= g;
      if (A < 0) { A = -A; B = -B; }
      const rad = (K === 1 ? '' : K) + (imag ? 'i' : '') + '√' + m;
      const mk = (sg) => { const core = (B !== 0 ? fmt(B) + ' ' + sg + ' ' : (sg === '−' ? '−' : '')) + rad; return 'x = ' + (A === 1 ? core : '(' + core + ') / ' + A); };
      return [mk('−'), mk('+')];
    }
    const factor = (r) => Math.abs(r) < 1e-12 ? 'x' : r > 0 ? '(x − ' + nice(r) + ')' : '(x + ' + nice(-r) + ')';

    function solve(raw) {
      const s = normalize(raw);
      const parts = s.split('=');
      if (parts.length > 2) fail('Use at most one “=” sign.');
      const steps = [];
      const add = (label, math) => {
        const last = steps[steps.length - 1];
        if (math && last && last.math === math) return;
        steps.push({ n: steps.length + 1, label, math: math || '', hasMath: !!math });
      };
      const out = (kindLabel, answers, extra) => Object.assign({ kindLabel, answers: answers.map((t) => ({ text: t })), steps, hasNote: false, note: '', hasPlot: false }, extra || {});
      const note = (t) => ({ hasNote: !!t, note: t || '' });

      if (parts.length === 1) {
        const n = parse(tokenize(parts[0]));
        add('Start with the expression', show(n));
        if (!hasX(n)) {
          let cur = n, count = 0;
          while (cur.t !== 'num' && count < 300) {
            const r = reduce(cur);
            if (!r) break;
            cur = r.node; count++;
            if (count <= 24) add(r.desc, show(cur));
          }
          if (count > 24) add('…and ' + (count - 24) + ' more small steps', show(cur));
          const v = cur.v;
          return out('Arithmetic', [nice(v)], note(frac(v) ? 'As a decimal: ' + fmt(v) : ''));
        }
        const p = toPoly(n);
        let answer = show(n), kind = 'Expression in x';
        if (p) {
          answer = showPoly(p);
          add('Expand brackets and combine like terms', answer);
          if (p.length > 1) kind = 'Polynomial in x, degree ' + (p.length - 1);
        } else {
          add('This is not a polynomial, so it stays as written. The graph shows its shape.', '');
        }
        return out(kind, [answer], { hasPlot: true, plot: makePlot((x) => ev(n, x), [], 'Graph of y = ' + answer + '.') });
      }

      if (!parts[0] || !parts[1]) fail('Both sides of “=” need something on them.');
      const L = parse(tokenize(parts[0])), R = parse(tokenize(parts[1]));
      const f = (x) => ev(L, x) - ev(R, x);
      add('Start with the equation', show(L) + ' = ' + show(R));

      if (!hasX(L) && !hasX(R)) {
        const evalAll = (n) => { let c = n; while (c.t !== 'num') { const r = reduce(c); if (!r) break; c = r.node; } return c.v; };
        const a = evalAll(L), b = evalAll(R);
        add('Work out each side', fmt(a) + ' = ' + fmt(b));
        const ok = Math.abs(a - b) < 1e-9 * (1 + Math.abs(a));
        return out(ok ? 'True statement' : 'False statement', [ok ? 'True' : 'False'], note(ok ? 'Both sides are equal.' : 'The two sides are not equal.'));
      }

      const pL = toPoly(L), pR = toPoly(R);
      const plotCap = 'Graph of the left side minus the right side. Orange dots mark the solutions.';
      if (pL && pR) {
        const p = padd(pL, pR, -1), deg = p.length - 1;
        add('Expand brackets and combine like terms on each side', showPoly(pL) + ' = ' + showPoly(pR));

        if (deg === 0) {
          add('The x terms cancel out, leaving', fmt(p[0]) + ' = 0');
          if (Math.abs(p[0]) < 1e-12) return out('Identity', ['Every x is a solution'], note('Both sides are the same expression, so the equation holds for all real numbers.'));
          return out('No solution', ['No solution'], note(fmt(p[0]) + ' = 0 is never true, so no value of x works.'));
        }

        if (deg === 1) {
          const b = p[0], a = p[1], x = -b / a;
          add('Move x terms to the left and numbers to the right', showPoly([0, a]) + ' = ' + nice(-b));
          if (Math.abs(a - 1) > 1e-12) add('Divide both sides by ' + nice(a), 'x = ' + nice(-b) + ' ÷ ' + paren(nice(a)) + ' = ' + nice(x));
          add('Check: put x = ' + nice(x) + ' back into both sides', fmt(ev(L, x)) + ' = ' + fmt(ev(R, x)) + '  ✓');
          return out('Linear equation', ['x = ' + nice(x)], Object.assign(note(frac(x) ? 'As a decimal: x ≈ ' + fmt(x) : ''), { hasPlot: true, plot: makePlot(f, [x], plotCap) }));
        }

        if (deg === 2) {
          const c = p[0], b = p[1], a = p[2];
          add('Move every term to the left (standard form ax² + bx + c = 0)', showPoly(p) + ' = 0');
          add('Read off the coefficients', 'a = ' + nice(a) + ',  b = ' + nice(b) + ',  c = ' + nice(c));
          const D = clean(b * b - 4 * a * c);
          add('Work out the discriminant Δ = b² − 4ac', 'Δ = ' + paren(nice(b)) + '² − 4 · ' + paren(nice(a)) + ' · ' + paren(nice(c)) + ' = ' + nice(D));
          if (Math.abs(D) < 1e-12) {
            const r = -b / (2 * a);
            add('Δ = 0, so there is exactly one (repeated) solution', 'x = −b / 2a = ' + nice(-b) + ' / ' + paren(nice(2 * a)) + ' = ' + nice(r));
            return out('Quadratic equation', ['x = ' + nice(r)], Object.assign(note('Factored: ' + (a === 1 ? '' : nice(a)) + factor(r) + '² = 0'), { hasPlot: true, plot: makePlot((x) => ev(L, x) - ev(R, x), [r], plotCap) }));
          }
          if (D > 0) {
            const sd = Math.sqrt(D);
            const lo = Math.min((-b - sd) / (2 * a), (-b + sd) / (2 * a)), hi = Math.max((-b - sd) / (2 * a), (-b + sd) / (2 * a));
            add('Δ > 0, so there are two real solutions. Use the quadratic formula', 'x = (−b ± √Δ) / 2a');
            add('Put in the values', 'x = (' + nice(-b) + ' ± √' + nice(D) + ') / ' + paren(nice(2 * a)));
            const ex = exactPair(a, b, D, false);
            const extra = { hasPlot: true, plot: makePlot(f, [lo, hi], plotCap) };
            if (ex) {
              add('Simplify the square root', ex[0] + '  or  ' + ex[1]);
              return out('Quadratic equation', ex, Object.assign(note('As decimals: x ≈ ' + fmt(Math.round(lo * 1e6) / 1e6) + '  and  x ≈ ' + fmt(Math.round(hi * 1e6) / 1e6)), extra));
            }
            add('Work out both values', 'x = ' + nice(lo) + '  or  x = ' + nice(hi));
            const fac = (frac(lo) || isInt(lo)) && (frac(hi) || isInt(hi)) ? 'Factored: ' + (a === 1 ? '' : a === -1 ? '−' : nice(a)) + factor(lo) + factor(hi) + ' = 0' : '';
            return out('Quadratic equation', ['x = ' + nice(lo), 'x = ' + nice(hi)], Object.assign(note(fac), extra));
          }
          const re = -b / (2 * a), im = Math.sqrt(-D) / (2 * Math.abs(a));
          add('Δ < 0, so there are no real solutions. The two solutions are complex', 'x = (−b ± i√(−Δ)) / 2a');
          const ex = exactPair(a, b, D, true);
          const reS = Math.abs(re) < 1e-12 ? '' : nice(re) + ' ';
          const ans = ex || ['x = ' + reS + '− ' + nice(im) + 'i', 'x = ' + reS + '+ ' + nice(im) + 'i'];
          add('Put in the values and simplify', ans[0] + '  or  ' + ans[1]);
          return out('Quadratic equation', ans, Object.assign(note('The curve never crosses zero, which is why there is no real solution.'), { hasPlot: true, plot: makePlot(f, [], 'Graph of the left side minus the right side. It never reaches zero.') }));
        }

        add('Move every term to the left', showPoly(p) + ' = 0');
        add('A degree-' + deg + ' polynomial has no short formula here, so the real solutions are found numerically', '');
      } else {
        add('Rewrite with zero on one side', '(' + show(L) + ') − (' + show(R) + ') = 0');
        add('This equation is not a polynomial, so its real solutions are found numerically', '');
      }

      const kind = pL && pR ? 'Polynomial equation, degree ' + (padd(pL, pR, -1).length - 1) : 'Equation, solved numerically';
      const roots = scan(f, -50, 50, 0.005);
      if (!roots.length) {
        add('Scan x from −50 to 50 for a change of sign', 'No sign change found');
        return out(kind, ['No real solution found'], Object.assign(note('Searched −50 ≤ x ≤ 50. A solution where the graph only touches zero, or one outside this range, can be missed.'), { hasPlot: true, plot: makePlot(f, [], 'Graph of the left side minus the right side.') }));
      }
      let shown = roots, more = false;
      if (roots.length > 8) { shown = roots.slice().sort((p, q) => Math.abs(p) - Math.abs(q)).slice(0, 8).sort((p, q) => p - q); more = true; }
      add('Scan x from −50 to 50 for a change of sign', roots.length + ' sign change' + (roots.length > 1 ? 's' : '') + ' found');
      add('Narrow each one down by halving the interval until it is tiny (bisection)', shown.map(fmt6).join('\n'));
      return out(kind, shown.map(fmt6), Object.assign(note(more ? 'Showing the 8 solutions closest to 0, out of ' + roots.length + ' found between −50 and 50.' : 'Numerical answers, rounded to 6 decimal places. Searched −50 ≤ x ≤ 50.'), { hasPlot: true, plot: makePlot(f, shown, plotCap) }));
    }

    return { solve };
  }

  const EMPTY_PLOT = { grid: "", axes: "", curve: "", dots: "", caption: "", xRange: "", yRange: "" };
  const solver = makeSolver();

  function compute(input) {
    const base = { ok: false, isError: false, error: "", kindLabel: "", answers: [], hasNote: false, note: "", steps: [], hasPlot: false, plot: EMPTY_PLOT };
    if (!input || !input.trim()) return Object.assign(base, { isError: true, error: "Type or write a problem first, for example 2x + 3 = 11." });
    try {
      return Object.assign(base, solver.solve(input), { ok: true });
    } catch (e) {
      return Object.assign(base, { isError: true, error: e && e.user ? e.message : "Something went wrong reading that problem." });
    }
  }

  const api = { compute };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MathSolver = api;
})(typeof self !== "undefined" ? self : this);
