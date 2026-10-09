// Math solver engine: parses a problem, solves it, and returns the answer, steps and graph data.
// Handles arithmetic, expressions, equations, inequalities, formulas in several letters and systems.
// Works in the browser (self.MathSolver) and in Node (module.exports) for tests.
(function (root) {
  'use strict';

  // ---------- numbers and formatting ----------

  const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  const sup = (k) => String(k).split('').map((c) => SUP[c] || c).join('');
  const fail = (msg) => { const e = new Error(msg); e.user = true; throw e; };
  const isInt = (v) => Math.abs(v - Math.round(v)) < 1e-9;
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { const t = b; b = a % b; a = t; } return a; };
  // Rounds away floating-point noise near whole numbers (and turns −0 into 0).
  const clean = (v) => (Math.abs(v - Math.round(v)) < 1e-10 ? Math.round(v) : v) || 0;
  const same = (x, y) => x === y || Math.abs(x - y) < 1e-9;

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
  const isNice = (v) => isInt(v) || !!frac(v);
  const approx = (v) => fmt(Math.round(v * 1e6) / 1e6);
  const eqv = (name, v) => (isNice(v) ? name + ' = ' + nice(v) : name + ' ≈ ' + approx(v));
  const paren = (s) => (s.charAt(0) === '−' || s.indexOf('/') >= 0 || s.indexOf(' ') >= 0 ? '(' + s + ')' : s);

  // ---------- reading the input ----------

  const FN_NAMES = ['sqrt', 'sin', 'cos', 'tan', 'abs', 'ln', 'log'];

  function normalize(s) {
    return s
      .replace(/[×·∙⋅]/g, '*').replace(/÷/g, '/').replace(/[−–—]/g, '-')
      .replace(/²/g, '^2').replace(/³/g, '^3').replace(/π/g, 'pi').replace(/√/g, 'sqrt')
      .replace(/<=|=</g, '≤').replace(/>=|=>/g, '≥').replace(/!=|=\/=/g, '≠')
      .replace(/(\d),(\d)/g, '$1.$2')
      .replace(/(\d+(?:\.\d+)?)\s*%\s*of\b/gi, '($1/100)*')
      .replace(/%/g, '/100');
  }

  // Pulls out "solve for y:" / "... for y" and strips "what is", "simplify" and similar lead-ins.
  function extractTarget(s) {
    let target = null;
    s = s.trim();
    let m = s.match(/^(?:solve|find|isolate|make)\s+(?:for\s+)?([a-zA-Z])\b(?:\s+the\s+subject)?\s*(?::|,|\bif\b|\bwhen\b|\bgiven\b|\bin\b|\bfrom\b)\s*/i);
    if (m) { target = m[1]; s = s.slice(m[0].length); }
    m = s.match(/[,;]?\s*(?:solve\s+)?for\s+([a-zA-Z])\s*[.?!]?\s*$/i);
    if (!target && m) { target = m[1]; s = s.slice(0, m.index); }
    s = s.replace(/^(?:what\s+is|what's|calculate|compute|evaluate|work\s+out|simplify|expand|solve|find)\b\s*:?\s*/i, '')
      .replace(/\?+\s*$/, '').replace(/\.\s*$/, '');
    return { text: s.trim(), target };
  }

  // A word problem has at least two real words (with vowels) that are not function names.
  function isWordProblem(raw) {
    const text = extractTarget(normalize(raw || '')).text;
    const words = (text.match(/[a-zA-Z]{3,}/g) || [])
      .filter((w) => FN_NAMES.indexOf(w.toLowerCase()) < 0 && /[aeiou]/i.test(w) && !/^(and|pi)$/i.test(w));
    return words.length >= 2;
  }

  const splitParts = (s) => s.split(/\s*(?:;|\n|,|\band\b)\s*/i).map((p) => p.trim()).filter(Boolean);

  function tokenize(s) {
    s = s.replace(/\s+/g, '');
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
      } else if (/[a-zA-Z]/.test(c)) {
        let j = i;
        while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
        let w = s.slice(i, j);
        while (w.length) {
          const lw = w.toLowerCase();
          const m = FN_NAMES.concat(['pi']).find((n) => lw.indexOf(n) === 0);
          if (m === 'pi') { t.push({ k: 'const', v: 'pi' }); w = w.slice(2); }
          else if (m) { t.push({ k: 'fn', v: m }); w = w.slice(m.length); }
          else { t.push(w[0] === 'e' ? { k: 'const', v: 'e' } : { k: 'var', v: w[0] }); w = w.slice(1); }
        }
        i = j;
      } else if ('+-*/^()!'.indexOf(c) >= 0) {
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
    const isOp = (v) => tokens[i] && tokens[i].k === 'op' && tokens[i].v === v;
    const startsAtom = () => { const t = tokens[i]; return t && (t.k !== 'op' || t.v === '('); };
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
      let base = atom();
      while (isOp('!')) { i++; base = { t: 'fn', f: 'fact', a: base }; }
      if (isOp('^')) { i++; return { t: 'bin', op: '^', a: base, b: unary() }; }
      return base;
    }
    function atom() {
      const t = tokens[i++];
      if (!t) fail('The problem ends too early — something is missing.');
      if (t.k === 'num') return { t: 'num', v: t.v };
      if (t.k === 'var') return { t: 'var', v: t.v };
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
    if (!tokens.length) fail('Something is missing on one side.');
    const n = expr();
    if (i < tokens.length) fail('Unexpected “' + tokens[i].v + '”.');
    return n;
  }

  // Splits "a < b ≤ c" into sides and comparison signs.
  function parseRelation(s) {
    const bits = s.split(/([=<>≤≥≠])/);
    const sides = [], ops = [];
    bits.forEach((b, i) => (i % 2 ? ops : sides).push(b));
    sides.forEach((side) => { if (!side.trim()) fail('Each side of “' + (ops[0] || '=') + '” needs something on it.'); });
    return { sides: sides.map((side) => parse(tokenize(side))), ops };
  }

  // ---------- evaluating and printing expressions ----------

  function applyFn(f, v) {
    switch (f) {
      case 'sqrt': return Math.sqrt(v);
      case 'sin': return Math.sin(v);
      case 'cos': return Math.cos(v);
      case 'tan': return Math.tan(v);
      case 'ln': return Math.log(v);
      case 'log': return Math.log10(v);
      case 'abs': return Math.abs(v);
      case 'fact': {
        if (v < 0 || !isInt(v) || v > 170) return NaN;
        let r = 1;
        for (let k = 2; k <= Math.round(v); k++) r *= k;
        return r;
      }
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
  function ev(n, env) {
    switch (n.t) {
      case 'num': return n.v;
      case 'var': return env[n.v] === undefined ? NaN : env[n.v];
      case 'const': return n.v === 'pi' ? Math.PI : Math.E;
      case 'neg': return -ev(n.a, env);
      case 'fn': return applyFn(n.f, ev(n.a, env));
      case 'bin': return binop(n.op, ev(n.a, env), ev(n.b, env));
    }
    return NaN;
  }
  function varsOf(n, set) {
    set = set || new Set();
    if (n.t === 'var') set.add(n.v);
    if (n.a) varsOf(n.a, set);
    if (n.b) varsOf(n.b, set);
    return set;
  }
  // Alphabetical, with the constants π and e first so formulas read "πr²".
  const varRank = (v) => (v === 'π' || v === 'e' ? 0 : 1);
  const sortVars = (vs) => Array.from(vs).sort((a, b) => varRank(a) - varRank(b) ||
    (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : a < b ? -1 : 1));

  const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };
  const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  const isPowOfVar = (m) => m.t === 'bin' && m.op === '^' && (m.a.t === 'var' || m.a.t === 'const');
  const simpleFactor = (m) => m.t === 'var' || m.t === 'const' || (m.t === 'fn' && m.f !== 'fact') || isPowOfVar(m);
  // Products like 2x, xy and 3x²y print without a × sign.
  const juxt = (n) => n.t === 'bin' && n.op === '*' && simpleFactor(n.b) &&
    ((n.a.t === 'num' && n.a.v >= 0) || (n.a.t === 'neg' && n.a.a.t === 'num') || n.a.t === 'var' || isPowOfVar(n.a) || juxt(n.a));

  function show(n, pp) {
    pp = pp || 0;
    switch (n.t) {
      case 'num': { const s = fmt(n.v); return n.v < 0 && pp >= 2 ? '(' + s + ')' : s; }
      case 'var': return n.v;
      case 'const': return n.v === 'pi' ? 'π' : 'e';
      case 'fn':
        if (n.f === 'fact') return show(n.a, 5) + '!';
        return (n.f === 'sqrt' ? '√' : n.f) + '(' + show(n.a, 0) + ')';
      case 'neg': { const s = '−' + show(n.a, 3); return pp >= 2 ? '(' + s + ')' : s; }
      case 'bin': {
        const p = PREC[n.op];
        let s;
        if (n.op === '^') {
          const base = show(n.a, 5);
          s = n.b.t === 'num' && isInt(n.b.v) && n.b.v >= 0 && n.b.v < 10 ? base + SUP[String(n.b.v)] : base + '^' + show(n.b, 4);
        } else {
          const R = show(n.b, p + 1);
          if (juxt(n)) s = (n.a.t === 'neg' ? '−' + show(n.a.a, 3) : show(n.a, p)) + R;
          else s = show(n.a, p) + ' ' + SYM[n.op] + ' ' + R;
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
    if (f === 'fact' && !isFinite(r)) fail('Factorial needs a whole number from 0 to 170.');
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
  // Performs the innermost, leftmost operation on numbers. Returns null when nothing is left to do.
  function reduce(n) {
    if (n.t === 'num' || n.t === 'var') return null;
    if (n.t === 'const') { const v = ev(n, {}); return { node: { t: 'num', v }, desc: 'Replace ' + show(n) + ' with its value, about ' + fmt(v) }; }
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
  function evalNumber(n) {
    let c = n;
    while (c.t !== 'num') { const r = reduce(c); if (!r) break; c = r.node; }
    return c.v;
  }

  // ---------- polynomials in any number of letters ----------
  // A polynomial is a Map from a monomial key ("x^2*y") to { c: coefficient, m: { letter: power } }.

  const mkey = (m) => Object.keys(m).sort().map((v) => (m[v] === 1 ? v : v + '^' + m[v])).join('*');
  const P = {
    num(c) { const p = new Map(); c = clean(c); if (c !== 0) p.set('', { c, m: {} }); return p; },
    v(name) { const m = {}; m[name] = 1; return new Map([[name, { c: 1, m }]]); },
    add(p, q, s) {
      s = s === undefined ? 1 : s;
      const r = new Map(p);
      q.forEach((t, k) => {
        const e = r.get(k), c = clean((e ? e.c : 0) + s * t.c);
        if (Math.abs(c) < 1e-12) r.delete(k); else r.set(k, { c, m: t.m });
      });
      return r;
    },
    scale(p, s) {
      const r = new Map();
      p.forEach((t, k) => { const c = clean(t.c * s); if (Math.abs(c) >= 1e-12) r.set(k, { c, m: t.m }); });
      return r;
    },
    mul(p, q) {
      const r = new Map();
      p.forEach((a) => q.forEach((b) => {
        const m = Object.assign({}, a.m);
        Object.keys(b.m).forEach((v) => { m[v] = (m[v] || 0) + b.m[v]; });
        const k = mkey(m), e = r.get(k), c = clean((e ? e.c : 0) + a.c * b.c);
        if (Math.abs(c) < 1e-12) r.delete(k); else r.set(k, { c, m });
      }));
      return r;
    },
    pow(p, k) { let r = P.num(1); for (let i = 0; i < k; i++) r = P.mul(r, p); return r; },
    isConst(p) { return p.size === 0 || (p.size === 1 && p.has('')); },
    val(p) { const t = p.get(''); return t ? t.c : 0; },
    vars(p) { const s = new Set(); p.forEach((t) => Object.keys(t.m).forEach((v) => s.add(v))); return s; },
    deg(p, v) { let d = 0; p.forEach((t) => { d = Math.max(d, t.m[v] || 0); }); return d; },
    totalDeg(p) { let d = 0; p.forEach((t) => { d = Math.max(d, Object.keys(t.m).reduce((a, v) => a + t.m[v], 0)); }); return d; },
    // Coefficients of v⁰, v¹, v², … as polynomials in the other letters.
    coeffs(p, v) {
      const out = [];
      for (let i = 0; i <= P.deg(p, v); i++) out.push(new Map());
      p.forEach((t) => {
        const k = t.m[v] || 0, m = Object.assign({}, t.m);
        delete m[v];
        out[k].set(mkey(m), { c: t.c, m });
      });
      return out;
    },
    // Plain number coefficients [c0, c1, …] when v is the only letter, else null.
    toArr(p, v) {
      const cs = P.coeffs(p, v);
      if (!cs.every(P.isConst)) return null;
      const a = cs.map(P.val);
      while (a.length > 1 && a[a.length - 1] === 0) a.pop();
      return a;
    },
    fromArr(a, v) { let r = new Map(); a.forEach((c, k) => { r = P.add(r, P.mul(P.num(c), P.pow(P.v(v), k))); }); return r; },
    evalAt(p, env) {
      let s = 0;
      p.forEach((t) => { let x = t.c; Object.keys(t.m).forEach((v) => { x *= Math.pow(env[v], t.m[v]); }); s += x; });
      return s;
    },
    // Replaces letter v with polynomial e.
    subst(p, v, e) {
      let r = new Map();
      p.forEach((t) => {
        const k = t.m[v] || 0, m = Object.assign({}, t.m);
        delete m[v];
        r = P.add(r, P.mul(new Map([[mkey(m), { c: t.c, m }]]), P.pow(e, k)));
      });
      return r;
    },
    str(p) {
      const terms = Array.from(p.values());
      if (!terms.length) return '0';
      const all = sortVars(P.vars(p));
      const td = (t) => Object.keys(t.m).reduce((a, v) => a + t.m[v], 0);
      terms.sort((a, b) => {
        if (td(a) !== td(b)) return td(b) - td(a);
        for (const v of all) { const d = (b.m[v] || 0) - (a.m[v] || 0); if (d) return d; }
        return 0;
      });
      // Lead with a positive term of the same degree: "v − u" rather than "−u + v".
      if (terms[0].c < 0) {
        const k = terms.findIndex((t) => t.c > 0 && td(t) === td(terms[0]));
        if (k > 0) terms.unshift(terms.splice(k, 1)[0]);
      }
      let s = '';
      terms.forEach((t) => {
        const mono = sortVars(Object.keys(t.m)).map((v) => v + (t.m[v] === 1 ? '' : sup(t.m[v]))).join('');
        let coef = nice(Math.abs(t.c));
        if (mono && coef === '1') coef = '';
        else if (mono && coef.indexOf('/') >= 0) coef = '(' + coef + ')';
        s += (s === '' ? (t.c < 0 ? '−' : '') : (t.c < 0 ? ' − ' : ' + ')) + coef + mono;
      });
      return s;
    }
  };
  const wrap = (p) => (p.size > 1 ? '(' + P.str(p) + ')' : P.str(p));

  // With sym set, π and e stay as symbols (for rearranging formulas like A = πr²).
  function toPoly(n, sym) {
    switch (n.t) {
      case 'num': return P.num(n.v);
      case 'var': return P.v(n.v);
      case 'const': return sym ? P.v(n.v === 'pi' ? 'π' : 'e') : P.num(ev(n, {}));
      case 'neg': { const p = toPoly(n.a, sym); return p && P.scale(p, -1); }
      case 'fn': {
        const p = toPoly(n.a, sym);
        if (!p || !P.isConst(p)) return null;
        const v = applyFn(n.f, P.val(p));
        return isFinite(v) ? P.num(v) : null;
      }
      case 'bin': {
        const p = toPoly(n.a, sym), q = toPoly(n.b, sym);
        if (!p || !q) return null;
        if (n.op === '+') return P.add(p, q, 1);
        if (n.op === '-') return P.add(p, q, -1);
        if (n.op === '*') return P.mul(p, q);
        if (n.op === '/') { if (!P.isConst(q) || P.val(q) === 0) return null; return P.scale(p, 1 / P.val(q)); }
        if (n.op === '^') {
          if (!P.isConst(q)) return null;
          const k = P.val(q);
          if (P.isConst(p)) { const v = Math.pow(P.val(p), k); return isFinite(v) ? P.num(v) : null; }
          if (!isInt(k) || k < 0 || k > 12) return null;
          return P.pow(p, Math.round(k));
        }
      }
    }
    return null;
  }

  // ---------- root finding ----------

  const snap = (r) => (isInt(r) ? Math.round(r) || 0 : r);
  function pv(a, x) { let s = 0; for (let i = a.length - 1; i >= 0; i--) s = s * x + a[i]; return s; }
  // All real roots of a polynomial given as [c0, c1, …]. Roots of the derivative split the line
  // into pieces where the polynomial is monotonic, so each piece holds at most one root.
  function polyRoots(a) {
    a = a.slice();
    while (a.length > 1 && Math.abs(a[a.length - 1]) < 1e-14) a.pop();
    const d = a.length - 1;
    if (d < 1) return [];
    if (d === 1) return [snap(clean(-a[0] / a[1]))];
    if (d === 2) {
      const c = a[0], b = a[1], A = a[2], D = clean(b * b - 4 * A * c);
      if (D < 0) return [];
      if (D === 0) return [snap(clean(-b / (2 * A)))];
      const s = Math.sqrt(D);
      return [(-b - s) / (2 * A), (-b + s) / (2 * A)].sort((x, y) => x - y).map((r) => snap(clean(r)));
    }
    const B = 1 + Math.max.apply(null, a.slice(0, d).map((c) => Math.abs(c / a[d])));
    const crit = polyRoots(a.slice(1).map((c, i) => c * (i + 1)));
    const pts = [-B].concat(crit.filter((c) => c > -B && c < B), [B]);
    const scale = Math.max.apply(null, a.map(Math.abs));
    const roots = [];
    const push = (r) => { r = snap(r); if (!roots.some((q) => Math.abs(q - r) < 1e-7)) roots.push(r); };
    for (let i = 0; i < pts.length; i++) {
      const fp = pv(a, pts[i]);
      if (i > 0 && i < pts.length - 1 && Math.abs(fp) < 1e-9 * scale) push(pts[i]);
      if (i < pts.length - 1) {
        let l = pts[i], r = pts[i + 1], fl = fp;
        const fr = pv(a, r);
        if (fl * fr < 0) {
          for (let k = 0; k < 200; k++) {
            const m = (l + r) / 2, fm = pv(a, m);
            if (m === l || m === r) break;
            if (fl * fm <= 0) r = m; else { l = m; fl = fm; }
          }
          push((l + r) / 2);
        }
      }
    }
    return roots.sort((x, y) => x - y);
  }

  function safe(f, x) { try { const y = f(x); return typeof y === 'number' ? y : NaN; } catch (e) { return NaN; } }
  // Numerical search for zeros, poles and edges of the domain of any function on [lo, hi].
  function scan(f, lo, hi, n) {
    const roots = [], poles = [], edges = [];
    const h = (hi - lo) / n;
    const push = (arr, r) => { r = snap(r); if (!arr.some((q) => Math.abs(q - r) < 1e-6)) arr.push(r); };
    let xp = lo, yp = safe(f, lo);
    for (let i = 1; i <= n; i++) {
      const x = lo + i * h, y = safe(f, x);
      const fp = isFinite(yp), fc = isFinite(y);
      if (fp && Math.abs(yp) < 1e-12) push(roots, xp);
      else if (fp && fc && yp * y < 0) {
        let a = xp, b = x, fa = yp;
        for (let k = 0; k < 80; k++) {
          const m = (a + b) / 2, fm = safe(f, m);
          if (!isFinite(fm)) break;
          if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
        }
        const r = (a + b) / 2;
        if (Math.abs(safe(f, r)) < 1e-6) push(roots, r); else push(poles, r);
      } else if (fp !== fc) {
        let a = xp, b = x;
        for (let k = 0; k < 80; k++) { const m = (a + b) / 2; if (isFinite(safe(f, m)) === fp) a = m; else b = m; }
        push(edges, fp ? a : b);
      }
      xp = x; yp = y;
    }
    if (isFinite(yp) && Math.abs(yp) < 1e-12) push(roots, xp);
    const asc = (p, q) => p - q;
    return { roots: roots.sort(asc), poles: poles.sort(asc), edges: edges.sort(asc) };
  }

  // Exact quadratic roots with simplified square roots, e.g. "(3 − √5) / 2". Null when not needed.
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
    const mk = (sg) => { const core = (B !== 0 ? fmt(B) + ' ' + sg + ' ' : (sg === '−' ? '−' : '')) + rad; return A === 1 ? core : '(' + core + ') / ' + A; };
    return [mk('−'), mk('+')];
  }
  const factor = (r, v) => (Math.abs(r) < 1e-12 ? v : r > 0 ? '(' + v + ' − ' + nice(r) + ')' : '(' + v + ' + ' + nice(-r) + ')');

  // ---------- graph ----------

  function niceStep(r) { const p = Math.pow(10, Math.floor(Math.log10(r))); const m = r / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
  // closed/open: x positions for filled/hollow dots (drawn on the curve). set: intervals to shade.
  function makePlot(f, closed, open, caption, set) {
    const W = 560, H = 320;
    let x0 = -10, x1 = 10;
    const marks = closed.concat(open).filter((r) => isFinite(r));
    if (marks.length) {
      const lo = Math.min.apply(null, marks), hi = Math.max.apply(null, marks);
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
    const circles = (xs) => xs.map((x) => {
      const y = safe(f, x);
      if (!isFinite(y)) return '';
      const cx = r1(X(x)), cy = r1(Math.max(0, Math.min(H, Y(Math.abs(y) < 1e-9 ? 0 : y))));
      return 'M' + r1(cx - rr) + ' ' + cy + 'a' + rr + ' ' + rr + ' 0 1 0 ' + 2 * rr + ' 0a' + rr + ' ' + rr + ' 0 1 0 ' + -2 * rr + ' 0Z ';
    }).join('');
    let band = '';
    (set || []).forEach((iv) => {
      const a = Math.max(x0, iv.lo), b = Math.min(x1, iv.hi);
      if (b > a) band += 'M' + r1(X(a)) + ' 0H' + r1(X(b)) + 'V' + H + 'H' + r1(X(a)) + 'Z ';
    });
    const lab = (v) => fmt(Math.round(v * 100) / 100);
    return {
      grid: g, axes: ax, curve: d, dots: circles(closed.filter(isFinite)), open: circles(open.filter(isFinite)), band, caption,
      xRange: 'x: ' + lab(x0) + ' to ' + lab(x1), yRange: 'y: ' + lab(y0) + ' to ' + lab(y1)
    };
  }

  // ---------- inequalities ----------

  const FLIP = { '<': '>', '>': '<', '≤': '≥', '≥': '≤', '≠': '≠' };
  const HOLDS = { '<': (y) => y < 0, '≤': (y) => y <= 0, '>': (y) => y > 0, '≥': (y) => y >= 0, '≠': (y) => y !== 0 };
  const lessish = (op) => op === '<' || op === '≤';

  function makeLabeler(labels) {
    return (x) => {
      if (x === -Infinity) return '−∞';
      if (x === Infinity) return '∞';
      for (const [k, s] of labels) if (same(k, x)) return s;
      return isNice(x) ? nice(x) : approx(x);
    };
  }

  // Splits the number line at the boundary points and keeps the pieces where the inequality holds.
  function classify(f, pts, holds, excluded) {
    pts = pts.slice().sort((a, b) => a - b).filter((p, i, a) => i === 0 || !same(p, a[i - 1]));
    const test = (x, isPoint) => {
      if (isPoint && excluded.some((e) => same(e, x))) return { y: NaN, ok: false };
      let y = safe(f, x);
      if (!isFinite(y)) return { y, ok: false };
      if (Math.abs(y) < 1e-9) y = 0;
      return { y, ok: holds(y) };
    };
    const inside = (lo, hi) => {
      if (lo === -Infinity && hi === Infinity) return 0;
      if (lo === -Infinity) return Math.floor(hi - 1);
      if (hi === Infinity) return Math.ceil(lo + 1);
      const m = (lo + hi) / 2, k = Math.round(m);
      return k > lo && k < hi ? k : m;
    };
    const pieces = [];
    const addOpen = (lo, hi) => { const t = inside(lo, hi); pieces.push(Object.assign({ lo, hi, pt: false, t }, test(t, false))); };
    if (!pts.length) addOpen(-Infinity, Infinity);
    pts.forEach((p, i) => {
      addOpen(i ? pts[i - 1] : -Infinity, p);
      pieces.push(Object.assign({ lo: p, hi: p, pt: true, t: p }, test(p, true)));
    });
    if (pts.length) addOpen(pts[pts.length - 1], Infinity);
    const set = [];
    let cur = null;
    pieces.forEach((pc) => {
      if (!pc.ok) { if (cur) set.push(cur); cur = null; return; }
      if (!cur) cur = { lo: pc.lo, hi: pc.hi, loC: pc.pt, hiC: pc.pt };
      else { cur.hi = pc.hi; cur.hiC = pc.pt; }
    });
    if (cur) set.push(cur);
    return { set, pieces };
  }

  function intersect(A, B) {
    const out = [];
    A.forEach((a) => B.forEach((b) => {
      let lo, loC, hi, hiC;
      if (same(a.lo, b.lo)) { lo = a.lo; loC = a.loC && b.loC; } else if (a.lo > b.lo) { lo = a.lo; loC = a.loC; } else { lo = b.lo; loC = b.loC; }
      if (same(a.hi, b.hi)) { hi = a.hi; hiC = a.hiC && b.hiC; } else if (a.hi < b.hi) { hi = a.hi; hiC = a.hiC; } else { hi = b.hi; hiC = b.hiC; }
      if ((lo < hi && !same(lo, hi)) || (same(lo, hi) && loC && hiC)) out.push({ lo, hi, loC, hiC });
    }));
    return out.sort((p, q) => p.lo - q.lo);
  }

  function intervalText(set, lab) {
    if (!set.length) return '∅ (no solution)';
    return set.map((s) => (same(s.lo, s.hi) ? '{' + lab(s.lo) + '}'
      : (s.loC ? '[' : '(') + lab(s.lo) + ', ' + lab(s.hi) + (s.hiC ? ']' : ')'))).join(' ∪ ');
  }
  function setText(set, v, lab) {
    if (!set.length) return 'No solution';
    if (set.length === 1 && set[0].lo === -Infinity && set[0].hi === Infinity) return 'Every real number';
    if (set.length === 2 && set[0].lo === -Infinity && set[1].hi === Infinity && same(set[0].hi, set[1].lo) && !set[0].hiC && !set[1].loC) {
      return v + ' ≠ ' + lab(set[0].hi);
    }
    return set.map((s) => {
      if (same(s.lo, s.hi)) return v + ' = ' + lab(s.lo);
      if (s.lo === -Infinity) return v + (s.hiC ? ' ≤ ' : ' < ') + lab(s.hi);
      if (s.hi === Infinity) return v + (s.loC ? ' ≥ ' : ' > ') + lab(s.lo);
      return lab(s.lo) + (s.loC ? ' ≤ ' : ' < ') + v + (s.hiC ? ' ≤ ' : ' < ') + lab(s.hi);
    }).join('  or  ');
  }

  // Solves one inequality L op R in the single letter v, writing steps through add().
  function ineqCore(L, op, R, v, add, labels) {
    const f = (t) => { const env = {}; env[v] = t; return ev(L, env) - ev(R, env); };
    const lab = makeLabeler(labels);
    let pts = [], excluded = [], numeric = false, chart = true;
    const pL = toPoly(L), pR = toPoly(R);
    const p = pL && pR ? P.add(pL, pR, -1) : null;
    const arr = p ? P.toArr(p, v) : null;
    if (arr) {
      const d = arr.length - 1;
      add('Expand brackets and combine like terms on each side', P.str(pL) + ' ' + op + ' ' + P.str(pR));
      if (d === 0) {
        add('The ' + v + ' terms cancel out, leaving', nice(arr[0]) + ' ' + op + ' 0');
        chart = false;
      } else if (d === 1) {
        const a = arr[1], b = arr[0], r = clean(-b / a);
        add('Move ' + v + ' terms to the left and numbers to the right', P.str(P.fromArr([0, a], v)) + ' ' + op + ' ' + nice(-b));
        if (Math.abs(a - 1) > 1e-12) {
          add('Divide both sides by ' + nice(a) + (a < 0 ? '. Dividing by a negative number flips the inequality sign' : ''),
            v + ' ' + (a < 0 ? FLIP[op] : op) + ' ' + nice(r));
        }
        pts = [r];
        chart = false;
      } else {
        add('Move every term to the left', P.str(p) + ' ' + op + ' 0');
        pts = polyRoots(arr);
        if (d === 2) {
          const c = arr[0], b = arr[1], A = arr[2], D = clean(b * b - 4 * A * c);
          const ex = D > 0 ? exactPair(A, b, D, false) : null;
          if (ex && pts.length === 2) { labels.set(pts[0], ex[0]); labels.set(pts[1], ex[1]); }
          add('Find where the left side is zero. The discriminant is Δ = b² − 4ac = ' + nice(D),
            pts.length ? pts.map((r) => v + ' = ' + lab(r)).join(',   ') : 'Δ < 0, so it is never zero');
        } else {
          add('Find every real ' + v + ' where the left side is zero (found numerically)', pts.length ? pts.map((r) => eqv(v, r)).join('\n') : 'It is never zero');
        }
      }
    } else {
      numeric = true;
      add('Move everything to one side', '(' + show(L) + ') − (' + show(R) + ') ' + op + ' 0');
      const sc = scan(f, -50, 50, 20000);
      pts = sc.roots.concat(sc.poles, sc.edges);
      excluded = sc.poles;
      const lines = [];
      if (sc.roots.length) lines.push('zero at ' + sc.roots.map(lab).join(', '));
      if (sc.poles.length) lines.push('undefined at ' + sc.poles.map(lab).join(', '));
      if (sc.edges.length) lines.push('only defined up to ' + sc.edges.map(lab).join(', '));
      add('Find where the left side is zero or undefined, checking −50 ≤ ' + v + ' ≤ 50 numerically', lines.join('\n') || 'never zero or undefined there');
    }
    const res = classify(f, pts, HOLDS[op], excluded);
    if (chart && pts.length) {
      const sign = (y) => (!isFinite(y) ? 'undefined' : y > 0 ? 'positive' : y < 0 ? 'negative' : 'zero');
      const lines = res.pieces.map((pc) => {
        const where = pc.pt ? v + ' = ' + lab(pc.lo)
          : pc.lo === -Infinity ? v + ' < ' + lab(pc.hi) : pc.hi === Infinity ? v + ' > ' + lab(pc.lo) : lab(pc.lo) + ' < ' + v + ' < ' + lab(pc.hi);
        const probe = pc.pt ? '' : ' (try ' + v + ' = ' + (isNice(pc.t) ? nice(pc.t) : approx(pc.t)) + ')';
        return where + probe + ': ' + sign(pc.y) + '  ' + (pc.ok ? '✓' : '✗');
      });
      add('Test each region and each boundary point: the left side must be ' +
        { '<': 'negative', '≤': 'negative or zero', '>': 'positive', '≥': 'positive or zero', '≠': 'non-zero' }[op], lines.join('\n'));
    }
    return { set: res.set, f, numeric };
  }

  // ---------- the solver ----------

  function solve(raw) {
    const ex = extractTarget(normalize(raw));
    const parts = splitParts(ex.text);
    if (!parts.length) fail('Type or write a problem first, for example 2x + 3 = 11.');
    const steps = [];
    const add = (label, math) => {
      const last = steps[steps.length - 1];
      if (math && last && last.math === math) return;
      steps.push({ n: steps.length + 1, label, math: math || '', hasMath: !!math });
    };
    const out = (kindLabel, answers, extra) => Object.assign({
      kindLabel, answers: answers.map((t) => ({ text: t })), steps, hasNote: false, note: '', hasPlot: false, values: []
    }, extra || {});
    const note = (t) => ({ hasNote: !!t, note: t || '' });
    const target = ex.target;

    function pickTarget(vars) {
      if (target) {
        if (!vars.has(target)) fail('There is no “' + target + '” in this problem.');
        return target;
      }
      for (const v of ['x', 'y', 'z', 't', 'n']) if (vars.has(v)) return v;
      return sortVars(vars)[0];
    }

    // ----- expressions -----
    function expression(n) {
      const vars = varsOf(n);
      add('Start with the expression', show(n));
      if (!vars.size) {
        let cur = n, count = 0;
        while (cur.t !== 'num' && count < 300) {
          const r = reduce(cur);
          if (!r) break;
          cur = r.node; count++;
          if (count <= 24) add(r.desc, show(cur));
        }
        if (count > 24) add('…and ' + (count - 24) + ' more small steps', show(cur));
        const v = cur.v;
        return out('Arithmetic', [nice(v)], Object.assign(note(frac(v) ? 'As a decimal: ' + fmt(v) : ''), { values: [{ name: '', value: v }] }));
      }
      const p = toPoly(n);
      let answer = show(n), kind = vars.size > 1 ? 'Expression in ' + sortVars(vars).join(', ') : 'Expression in ' + Array.from(vars)[0];
      let extra = {};
      if (p) {
        answer = P.str(p);
        add('Expand brackets and combine like terms', answer);
        if (vars.size === 1) {
          const v = Array.from(vars)[0], arr = P.toArr(p, v);
          if (arr && arr.length > 1) kind = 'Polynomial in ' + v + ', degree ' + (arr.length - 1);
          const rs = arr && arr.length > 2 ? polyRoots(arr) : [];
          if (arr && arr.length - 1 === rs.length && rs.every(isNice) && arr.length > 2) {
            const lead = arr[arr.length - 1];
            extra = note('Factored: ' + (lead === 1 ? '' : lead === -1 ? '−' : nice(lead)) + rs.map((r) => factor(r, v)).join(''));
          }
        }
      } else {
        add('This is not a polynomial, so it stays as written. The graph shows its shape.', '');
      }
      if (vars.size === 1) {
        const v = Array.from(vars)[0];
        extra.hasPlot = true;
        extra.plot = makePlot((t) => { const env = {}; env[v] = t; return ev(n, env); }, [], [], 'Graph of y = ' + answer + '.');
      }
      return out(kind, [answer], extra);
    }

    // ----- equations in one letter -----
    function equation1(L, R, v) {
      const f = (t) => { const env = {}; env[v] = t; return ev(L, env) - ev(R, env); };
      const plotCap = 'Graph of the left side minus the right side. Orange dots mark the solutions.';
      const plot = (rs) => ({ hasPlot: true, plot: makePlot(f, rs, [], rs.length ? plotCap : 'Graph of the left side minus the right side.') });
      const values = (rs) => ({ values: rs.map((r) => ({ name: v, value: r })) });
      const pL = toPoly(L), pR = toPoly(R);
      if (pL && pR) {
        const p = P.add(pL, pR, -1), arr = P.toArr(p, v), deg = arr.length - 1;
        add('Expand brackets and combine like terms on each side', P.str(pL) + ' = ' + P.str(pR));
        if (deg === 0) {
          add('The ' + v + ' terms cancel out, leaving', nice(arr[0]) + ' = 0');
          if (arr[0] === 0) return out('Identity', ['Every ' + v + ' is a solution'], note('Both sides are the same expression, so the equation holds for all real numbers.'));
          return out('No solution', ['No solution'], note(nice(arr[0]) + ' = 0 is never true, so no value of ' + v + ' works.'));
        }
        if (deg === 1) {
          const b = arr[0], a = arr[1], x = clean(-b / a);
          add('Move ' + v + ' terms to the left and numbers to the right', P.str(P.fromArr([0, a], v)) + ' = ' + nice(-b));
          if (Math.abs(a - 1) > 1e-12) add('Divide both sides by ' + nice(a), v + ' = ' + nice(-b) + ' ÷ ' + paren(nice(a)) + ' = ' + nice(x));
          const env = {}; env[v] = x;
          add('Check: put ' + v + ' = ' + nice(x) + ' back into both sides', fmt(ev(L, env)) + ' = ' + fmt(ev(R, env)) + '  ✓');
          return out('Linear equation', [v + ' = ' + nice(x)], Object.assign(note(frac(x) ? 'As a decimal: ' + v + ' ≈ ' + fmt(x) : ''), plot([x]), values([x])));
        }
        if (deg === 2) {
          const c = arr[0], b = arr[1], a = arr[2];
          add('Move every term to the left (standard form a' + v + '² + b' + v + ' + c = 0)', P.str(p) + ' = 0');
          add('Read off the coefficients', 'a = ' + nice(a) + ',  b = ' + nice(b) + ',  c = ' + nice(c));
          const D = clean(b * b - 4 * a * c);
          add('Work out the discriminant Δ = b² − 4ac', 'Δ = ' + paren(nice(b)) + '² − 4 · ' + paren(nice(a)) + ' · ' + paren(nice(c)) + ' = ' + nice(D));
          const lead = a === 1 ? '' : a === -1 ? '−' : nice(a);
          if (D === 0) {
            const r = clean(-b / (2 * a));
            add('Δ = 0, so there is exactly one (repeated) solution', v + ' = −b / 2a = ' + nice(-b) + ' / ' + paren(nice(2 * a)) + ' = ' + nice(r));
            return out('Quadratic equation', [v + ' = ' + nice(r)], Object.assign(note(isNice(r) ? 'Factored: ' + lead + factor(r, v) + '² = 0' : ''), plot([r]), values([r])));
          }
          if (D > 0) {
            const rs = polyRoots(arr);
            add('Δ > 0, so there are two real solutions. Use the quadratic formula', v + ' = (−b ± √Δ) / 2a');
            add('Put in the values', v + ' = (' + nice(-b) + ' ± √' + nice(D) + ') / ' + paren(nice(2 * a)));
            const exact = exactPair(a, b, D, false);
            if (exact) {
              add('Simplify the square root', v + ' = ' + exact[0] + '  or  ' + v + ' = ' + exact[1]);
              return out('Quadratic equation', exact.map((e) => v + ' = ' + e),
                Object.assign(note('As decimals: ' + v + ' ≈ ' + approx(rs[0]) + '  and  ' + v + ' ≈ ' + approx(rs[1])), plot(rs), values(rs)));
            }
            add('Work out both values', rs.map((r) => eqv(v, r)).join('  or  '));
            const fac = rs.every(isNice) ? 'Factored: ' + lead + rs.map((r) => factor(r, v)).join('') + ' = 0' : '';
            return out('Quadratic equation', rs.map((r) => eqv(v, r)), Object.assign(note(fac), plot(rs), values(rs)));
          }
          const re = -b / (2 * a), im = Math.sqrt(-D) / (2 * Math.abs(a));
          add('Δ < 0, so there are no real solutions. The two solutions are complex', v + ' = (−b ± i√(−Δ)) / 2a');
          const exact = exactPair(a, b, D, true);
          const reS = Math.abs(re) < 1e-12 ? '' : nice(re) + ' ';
          const ans = exact ? exact.map((e) => v + ' = ' + e) : [v + ' = ' + reS + '− ' + nice(im) + 'i', v + ' = ' + reS + '+ ' + nice(im) + 'i'];
          add('Put in the values and simplify', ans[0] + '  or  ' + ans[1]);
          return out('Quadratic equation', ans, Object.assign(note('The curve never reaches zero, which is why there is no real solution.'), plot([])));
        }
        add('Move every term to the left', P.str(p) + ' = 0');
        const rs = polyRoots(arr);
        add('A degree-' + deg + ' polynomial has no short formula, so its real roots are found numerically: split the line at its turning points and narrow each crossing down by bisection',
          rs.length ? rs.map((r) => eqv(v, r)).join('\n') : 'No real roots');
        const anyApprox = rs.some((r) => !isNice(r));
        return out('Polynomial equation, degree ' + deg, rs.length ? rs.map((r) => eqv(v, r)) : ['No real solution'],
          Object.assign(note('Only real solutions are listed.' + (anyApprox ? ' Decimals are rounded to 6 places.' : '')), plot(rs), values(rs)));
      }

      add('Rewrite with zero on one side', '(' + show(L) + ') − (' + show(R) + ') = 0');
      add('This equation is not a polynomial, so its real solutions are found numerically', '');
      const sc = scan(f, -50, 50, 20000);
      const roots = sc.roots;
      const kind = 'Equation, solved numerically';
      if (!roots.length) {
        add('Scan ' + v + ' from −50 to 50 for a change of sign', 'No sign change found');
        return out(kind, ['No real solution found'], Object.assign(note('Searched −50 ≤ ' + v + ' ≤ 50. A solution where the graph only touches zero, or one outside this range, can be missed.'), plot([])));
      }
      let shown = roots, more = false;
      if (roots.length > 8) { shown = roots.slice().sort((p, q) => Math.abs(p) - Math.abs(q)).slice(0, 8).sort((p, q) => p - q); more = true; }
      add('Scan ' + v + ' from −50 to 50 for a change of sign', roots.length + ' sign change' + (roots.length > 1 ? 's' : '') + ' found');
      add('Narrow each one down by halving the interval until it is tiny (bisection)', shown.map((r) => eqv(v, r)).join('\n'));
      return out(kind, shown.map((r) => eqv(v, r)), Object.assign(note(more
        ? 'Showing the 8 solutions closest to 0, out of ' + roots.length + ' found between −50 and 50.'
        : 'Numerical answers, rounded to 6 decimal places. Searched −50 ≤ ' + v + ' ≤ 50.'), plot(shown), values(shown)));
    }

    // ----- equations in several letters: rearrange for one of them -----
    function rearrange(L, R, v, vars) {
      const pL = toPoly(L, true), pR = toPoly(R, true);
      if (!pL || !pR) fail('With more than one letter, the solver can rearrange equations built from + − × ÷ and whole-number powers only. Divide-by-a-letter and functions like sin need one letter.');
      add('Expand brackets and combine like terms on each side', P.str(pL) + ' = ' + P.str(pR));
      const p = P.add(pL, pR, -1), d = P.deg(p, v);
      const others = sortVars(vars).filter((u) => u !== v);
      const tip = ' To solve for a different letter, start with “solve for ' + others[0] + ':”.';
      const known = ' Treated ' + others.join(', ') + ' as known.';
      if (d === 0) fail('After simplifying, ' + v + ' cancels out, so the equation can’t be solved for ' + v + '.');
      const cs = P.coeffs(p, v);
      const neg = (q) => P.str(q).charAt(0) === '−';
      // "top / bottom", dividing by a single term like 2, b or πr² neatly.
      const divide = (top, bottom) => {
        if (P.isConst(bottom)) return P.str(P.scale(top, 1 / P.val(bottom)));
        if (bottom.size === 1) {
          const t = bottom.values().next().value;
          const mono = new Map([[mkey(t.m), { c: 1, m: t.m }]]);
          const den = Object.keys(t.m).length > 1 || Object.keys(t.m).some((u) => t.m[u] > 1) ? '(' + P.str(mono) + ')' : P.str(mono);
          const scaled = P.scale(top, 1 / t.c);
          // Keep whole numbers on top: "C / (2π)" rather than "(1/2)C / π".
          const whole = (q) => Array.from(q.values()).every((u) => isInt(u.c));
          if (t.c !== 1 && whole(top) && !whole(scaled)) return wrap(top) + ' / (' + nice(t.c) + P.str(mono) + ')';
          return wrap(scaled) + ' / ' + den;
        }
        return wrap(top) + ' / ' + wrap(bottom);
      };
      const nonZero = (q) => {
        if (Array.from(P.vars(q)).every((u) => varRank(u) === 0)) return '';
        const shown = q.size === 1 ? new Map(Array.from(q).map(([k, t]) => [k, { c: 1, m: t.m }])) : q;
        return 'This needs ' + P.str(shown) + ' ≠ 0.';
      };
      if (d === 1) {
        let A = cs[1], top = P.scale(cs[0], -1);
        if (neg(A)) { A = P.scale(A, -1); top = P.scale(top, -1); }
        const lhs = A.size === 1 ? P.str(P.mul(A, P.v(v))) : '(' + P.str(A) + ')' + v;
        add('Keep the ' + v + ' terms on the left and move everything else to the right', lhs + ' = ' + P.str(top));
        const answer = v + ' = ' + divide(top, A);
        if (!(P.isConst(A) && P.val(A) === 1)) add('Divide both sides by ' + P.str(A), answer);
        return out('Solved for ' + v, [answer], note((nonZero(A) ? nonZero(A) + ' ' : '') + known.trim() + tip));
      }
      if (d === 2) {
        let a = cs[2];
        const b = cs[1];
        if (!b.size && a.size === 1) {
          let top = P.scale(cs[0], -1);
          if (neg(a)) { a = P.scale(a, -1); top = P.scale(top, -1); }
          const inside = divide(top, a);
          add('Get ' + v + '² on its own', v + '² = ' + inside);
          const answer = v + ' = ±√(' + inside + ')';
          add('Take the square root of both sides', answer);
          return out('Solved for ' + v, [answer], note('Real when ' + inside + ' ≥ 0. If ' + v + ' is a length or another positive quantity, use the + root.' + known + tip));
        }
        const c = cs[0];
        add('This is a quadratic in ' + v + '. Read off a, b and c', 'a = ' + P.str(a) + ',   b = ' + P.str(b) + ',   c = ' + P.str(c));
        const D = P.add(P.mul(b, b), P.scale(P.mul(a, c), 4), -1);
        add('Work out the discriminant Δ = b² − 4ac', 'Δ = ' + P.str(D));
        const twoA = P.scale(a, 2);
        const top = (b.size ? P.str(P.scale(b, -1)) + ' ± ' : '±') + '√(' + P.str(D) + ')';
        const answer = v + ' = ' + (P.isConst(twoA) && P.val(twoA) === 1 ? top : '(' + top + ') / ' + wrap(twoA));
        add('Use the quadratic formula ' + v + ' = (−b ± √Δ) / 2a', answer);
        return out('Solved for ' + v, [answer], note('Real solutions exist where ' + P.str(D) + ' ≥ 0.' + known + tip));
      }
      fail(v + ' appears to the power ' + d + '. Rearranging is supported up to squared terms.');
    }

    function equation(L, R) {
      add('Start with the equation', show(L) + ' = ' + show(R));
      const vars = varsOf(R, varsOf(L));
      if (!vars.size) {
        const a = evalNumber(L), b = evalNumber(R);
        add('Work out each side', fmt(a) + ' = ' + fmt(b));
        const ok = Math.abs(a - b) < 1e-9 * (1 + Math.abs(a));
        return out(ok ? 'True statement' : 'False statement', [ok ? 'True' : 'False'], note(ok ? 'Both sides are equal.' : 'The two sides are not equal.'));
      }
      const v = pickTarget(vars);
      return vars.size === 1 ? equation1(L, R, v) : rearrange(L, R, v, vars);
    }

    // ----- inequalities -----
    function finishIneq(kind, set, v, lab, f, numeric, extraNote) {
      const closed = [], open = [];
      set.forEach((s) => {
        if (isFinite(s.lo)) (s.loC ? closed : open).push(s.lo);
        if (isFinite(s.hi) && !same(s.hi, s.lo)) (s.hiC ? closed : open).push(s.hi);
      });
      const ends = set.reduce((a, s) => a.concat([s.lo, s.hi]), []).filter(isFinite);
      const dec = ends.some((x) => !isNice(x)) && !ends.every((x) => lab(x) !== approx(x));
      const msg = 'Interval notation: ' + intervalText(set, lab) + '.' + (extraNote || '') +
        (numeric ? ' Checked numerically for −50 ≤ ' + v + ' ≤ 50.' : '') + (dec ? ' Decimals are rounded to 6 places.' : '');
      return out(kind, [setText(set, v, lab)], Object.assign(note(msg), {
        hasPlot: true,
        plot: makePlot(f, closed, open, 'Graph of ' + (kind === 'Compound inequality' ? 'the middle expression' : 'the left side minus the right side') +
          '. The shaded band is where the inequality holds; a filled dot means the end point is included, a hollow dot means it is not.', set)
      }));
    }

    function inequality(L, op, R) {
      add('Start with the inequality', show(L) + ' ' + op + ' ' + show(R));
      const vars = varsOf(R, varsOf(L));
      if (!vars.size) {
        const y = evalNumber(L) - evalNumber(R);
        const ok = HOLDS[op](Math.abs(y) < 1e-9 ? 0 : y);
        return out(ok ? 'True statement' : 'False statement', [ok ? 'True' : 'False'], {});
      }
      if (vars.size > 1) fail('An inequality with several letters has no single answer. Use one letter, for example 2x + 3 < 7, or give the other letters values.');
      const v = Array.from(vars)[0], labels = new Map();
      const r = ineqCore(L, op, R, v, add, labels);
      return finishIneq('Inequality', r.set, v, makeLabeler(labels), r.f, r.numeric);
    }

    function compound(rel) {
      const [a, m, b] = rel.sides, [o1, o2] = rel.ops;
      if (lessish(o1) !== lessish(o2)) fail('In a double inequality both signs must point the same way, like 1 < x ≤ 5.');
      const vars = varsOf(b, varsOf(m, varsOf(a)));
      if (vars.size !== 1) fail('A double inequality needs exactly one letter, for example 1 < 2x + 3 ≤ 7.');
      const v = Array.from(vars)[0], labels = new Map(), lab = makeLabeler(labels);
      add('Start with the double inequality', show(a) + ' ' + o1 + ' ' + show(m) + ' ' + o2 + ' ' + show(b));
      add('Split it into two inequalities that must both be true', show(a) + ' ' + o1 + ' ' + show(m) + '   and   ' + show(m) + ' ' + o2 + ' ' + show(b));
      const part = (name) => (label, math) => add(name + ': ' + label.charAt(0).toLowerCase() + label.slice(1), math);
      const r1 = ineqCore(a, o1, m, v, part('Left part'), labels);
      add('The left part gives', setText(r1.set, v, lab));
      const r2 = ineqCore(m, o2, b, v, part('Right part'), labels);
      add('The right part gives', setText(r2.set, v, lab));
      const set = intersect(r1.set, r2.set);
      add('Keep only the values that make both parts true', setText(set, v, lab));
      const fm = (t) => { const env = {}; env[v] = t; return ev(m, env); };
      return finishIneq('Compound inequality', set, v, lab, fm, r1.numeric || r2.numeric);
    }

    // ----- several equations (or inequalities) at once -----
    function system(rels) {
      if (rels.some((r) => r.ops.length !== 1)) fail('Write one equation or inequality per line (or separate them with “;”).');
      const isIneq = rels.map((r) => r.ops[0] !== '=');
      if (isIneq.every(Boolean)) {
        const vars = rels.reduce((s, r) => varsOf(r.sides[1], varsOf(r.sides[0], s)), new Set());
        if (vars.size !== 1) fail('Several inequalities can be combined only when they use the same single letter.');
        const v = Array.from(vars)[0], labels = new Map(), lab = makeLabeler(labels);
        add('Start with the inequalities, which must all be true', rels.map((r) => show(r.sides[0]) + ' ' + r.ops[0] + ' ' + show(r.sides[1])).join('\n'));
        let set = [{ lo: -Infinity, hi: Infinity, loC: false, hiC: false }], numeric = false, f = null;
        rels.forEach((r, i) => {
          const res = ineqCore(r.sides[0], r.ops[0], r.sides[1], v, (label, math) => add('Inequality ' + (i + 1) + ': ' + label.charAt(0).toLowerCase() + label.slice(1), math), labels);
          add('Inequality ' + (i + 1) + ' gives', setText(res.set, v, lab));
          set = intersect(set, res.set);
          numeric = numeric || res.numeric;
          f = f || res.f;
        });
        add('Keep only the values that make every inequality true', setText(set, v, lab));
        return finishIneq('Compound inequality', set, v, lab, f, numeric, ' The graph shows the first inequality.');
      }
      if (isIneq.some(Boolean)) fail('Mixing equations and inequalities isn’t supported. Solve the equations first.');

      const eqs = rels.map((r) => ({ L: r.sides[0], R: r.sides[1], pL: toPoly(r.sides[0]), pR: toPoly(r.sides[1]) }));
      if (eqs.some((e) => !e.pL || !e.pR)) fail('Systems of equations must use + − × ÷ (by numbers) and whole-number powers.');
      const ps = eqs.map((e) => P.add(e.pL, e.pR, -1));
      const vars = sortVars(ps.reduce((s, p) => { P.vars(p).forEach((v) => s.add(v)); return s; }, new Set()));
      if (!vars.length) fail('There are no letters to solve for.');
      add('Start with the system', eqs.map((e, i) => '(' + (i + 1) + ')  ' + show(e.L) + ' = ' + show(e.R)).join('\n'));
      if (ps.every((p) => P.totalDeg(p) <= 1)) return linearSystem(eqs, ps, vars);
      if (ps.length === 2 && vars.length === 2) return substitution(eqs, ps, vars);
      fail('Non-linear systems are supported for two equations in two letters only. Linear systems can be any size.');
    }

    function linearSystem(eqs, ps, vars) {
      const n = vars.length;
      const rows = ps.map((p) => vars.map((v) => { const t = p.get(v); return t ? t.c : 0; }).concat([clean(-P.val(p))]));
      const rowStr = (r) => {
        const lhs = new Map();
        vars.forEach((v, j) => { if (r[j] !== 0) lhs.set(v, { c: r[j], m: { [v]: 1 } }); });
        return P.str(lhs) + ' = ' + nice(r[n]);
      };
      const showRows = () => rows.map((r, i) => '(' + (i + 1) + ')  ' + rowStr(r)).join('\n');
      add('Write each equation with the letters on the left and the number on the right', showRows());
      const pivots = [];
      let r = 0;
      vars.forEach((v, c) => {
        if (r >= rows.length) return;
        let best = -1;
        for (let i = r; i < rows.length; i++) {
          if (rows[i][c] === 0) continue;
          if (best < 0 || (Math.abs(rows[i][c]) === 1 && Math.abs(rows[best][c]) !== 1)) best = i;
        }
        if (best < 0) return;
        if (best !== r) {
          const tmp = rows[best]; rows[best] = rows[r]; rows[r] = tmp;
          add('Swap equations (' + (r + 1) + ') and (' + (best + 1) + ') so that (' + (r + 1) + ') contains ' + v, showRows());
        }
        const k = rows[r][c];
        if (k !== 1) {
          rows[r] = rows[r].map((x) => clean(x / k));
          add('Divide equation (' + (r + 1) + ') by ' + nice(k) + ' so ' + v + ' has coefficient 1', showRows());
        }
        const ops = [];
        rows.forEach((row, i) => {
          if (i === r || row[c] === 0) return;
          const m = row[c];
          rows[i] = row.map((x, j) => clean(x - m * rows[r][j]));
          ops.push('(' + (i + 1) + ') ' + (m > 0 ? '− ' : '+ ') + (Math.abs(m) === 1 ? '' : nice(Math.abs(m)) + ' × ') + '(' + (r + 1) + ')');
        });
        if (ops.length) add('Eliminate ' + v + ' from the other equations: ' + ops.join(',  '), showRows());
        pivots.push({ c, r });
        r++;
      });
      const bad = rows.findIndex((row) => row.slice(0, n).every((x) => x === 0) && row[n] !== 0);
      if (bad >= 0) {
        add('Equation (' + (bad + 1) + ') became 0 = ' + nice(rows[bad][n]) + ', which is impossible', '');
        return out('Linear system', ['No solution'], note('The equations contradict each other, so no values satisfy all of them.'));
      }
      if (pivots.length < n) {
        const free = vars.filter((v, c) => !pivots.some((p) => p.c === c));
        const answers = pivots.map((p) => {
          let e = P.num(rows[p.r][n]);
          vars.forEach((v, j) => { if (j !== p.c && rows[p.r][j] !== 0) e = P.add(e, P.v(v), -rows[p.r][j]); });
          return vars[p.c] + ' = ' + P.str(e);
        });
        add('There are fewer independent equations than letters, so ' + free.join(', ') + (free.length > 1 ? ' are' : ' is') + ' free', answers.join('\n'));
        return out('Linear system', answers, note('Infinitely many solutions: ' + free.join(', ') + ' can be any number' + (free.length > 1 ? 's' : '') + '.'));
      }
      const sol = {};
      pivots.forEach((p) => { sol[vars[p.c]] = rows[p.r][n]; });
      add('Check: put the values back into the original equations',
        eqs.map((e, i) => '(' + (i + 1) + ')  ' + fmt(ev(e.L, sol)) + ' = ' + fmt(ev(e.R, sol)) + '  ' + (Math.abs(ev(e.L, sol) - ev(e.R, sol)) < 1e-6 ? '✓' : '✗')).join('\n'));
      return out('Linear system', vars.map((v) => eqv(v, sol[v])), { values: vars.map((v) => ({ name: v, value: sol[v] })) });
    }

    function substitution(eqs, ps, vars) {
      let pick = null;
      ps.forEach((p, i) => vars.forEach((u) => {
        if (pick) return;
        const cs = P.coeffs(p, u);
        if (cs.length === 2 && P.isConst(cs[1])) pick = { i, u, w: vars.find((x) => x !== u), A: P.val(cs[1]), B: cs[0] };
      }));
      if (!pick) fail('Neither equation can be rearranged simply for one letter, so this system isn’t supported. One equation needs to be linear in one of the letters.');
      const { i, u, w, A, B } = pick, j = 1 - i;
      const expr = P.scale(B, -1 / A);
      add('From equation (' + (i + 1) + '), make ' + u + ' the subject', u + ' = ' + P.str(expr));
      const sub = P.subst(ps[j], u, expr);
      add('Substitute this into equation (' + (j + 1) + ') and simplify', P.str(sub) + ' = 0');
      const arr = P.toArr(sub, w);
      if (arr.length === 1) {
        if (arr[0] === 0) return out('System of equations', ['Infinitely many solutions'], note('Equation (' + (j + 1) + ') adds no new information: every point with ' + u + ' = ' + P.str(expr) + ' works.'));
        return out('System of equations', ['No solution'], note('Substituting leads to ' + nice(arr[0]) + ' = 0, which is impossible.'));
      }
      const rs = polyRoots(arr);
      add('Solve for ' + w, rs.length ? rs.map((r) => eqv(w, r)).join(',   ') : 'No real solutions');
      if (!rs.length) return out('System of equations', ['No real solution'], note('The curves never meet.'));
      const pairs = rs.map((r) => { const env = {}; env[w] = r; const val = clean(P.evalAt(expr, env)); const s = {}; s[w] = r; s[u] = val; return s; });
      add('Put each value back into ' + u + ' = ' + P.str(expr), pairs.map((s) => eqv(w, s[w]) + '  →  ' + eqv(u, s[u])).join('\n'));
      const values = [];
      pairs.forEach((s) => vars.forEach((v) => values.push({ name: v, value: s[v] })));
      return out('System of equations', pairs.map((s) => vars.map((v) => eqv(v, s[v])).join(',  ')),
        Object.assign(note(pairs.length > 1 ? pairs.length + ' solutions. Only real solutions are listed.' : 'Only real solutions are listed.'), { values }));
    }

    // ----- dispatch -----
    if (parts.length > 1) return system(parts.map(parseRelation));
    const rel = parseRelation(parts[0]);
    if (!rel.ops.length) {
      if (target) fail('There is no equation to solve for ' + target + '. Add an “=” sign.');
      return expression(rel.sides[0]);
    }
    if (rel.ops.length === 1) return rel.ops[0] === '=' ? equation(rel.sides[0], rel.sides[1]) : inequality(rel.sides[0], rel.ops[0], rel.sides[1]);
    if (rel.ops.length === 2 && rel.ops.every((o) => o !== '=' && o !== '≠')) return compound(rel);
    fail('That has too many comparison signs. Put one equation per line, or use a double inequality like 1 < 2x + 3 ≤ 7.');
  }

  // ---------- public API ----------

  const EMPTY_PLOT = { grid: '', axes: '', curve: '', dots: '', open: '', band: '', caption: '', xRange: '', yRange: '' };

  // opts.forceMath skips word-problem detection (used for equations Claude wrote, or on request).
  function compute(input, opts) {
    const base = { ok: false, isError: false, isWord: false, error: '', kindLabel: '', answers: [], hasNote: false, note: '', steps: [], hasPlot: false, plot: EMPTY_PLOT, values: [] };
    if (!input || !input.trim()) return Object.assign(base, { isError: true, error: 'Type or write a problem first, for example 2x + 3 = 11.' });
    if (!(opts && opts.forceMath) && isWordProblem(input)) {
      return Object.assign(base, { isError: true, isWord: true, error: 'This looks like a word problem. Word problems are read by Claude, which needs an API key and an internet connection.' });
    }
    try {
      return Object.assign(base, solve(input), { ok: true });
    } catch (e) {
      if (e && e.user) return Object.assign(base, { isError: true, error: e.message });
      if (typeof console !== 'undefined') console.error(e);
      return Object.assign(base, { isError: true, error: 'Something went wrong solving that. Try writing it another way.' });
    }
  }

  const api = { compute, isWordProblem };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MathSolver = api;
})(typeof self !== 'undefined' ? self : this);
