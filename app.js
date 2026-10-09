// UI for the math solver: input, keypad, results, graph, history, word problems and the Apple Pencil scratchpad.
(function () {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const SVG = 'http://www.w3.org/2000/svg';

  const input = $('problem');
  const solveBtn = $('solve-btn');
  const HISTORY_KEY = 'math-solver-history';
  const API_KEY_STORE = 'math-solver-anthropic-key';

  const KEYS = [
    ['x', 'x', 'Insert x'], ['y', 'y', 'Insert y'], ['x²', '^2', 'Insert squared'], ['xⁿ', '^', 'Insert power'],
    ['√', '√(', 'Insert square root'], ['π', 'π', 'Insert pi'], ['(', '(', 'Insert opening bracket'],
    [')', ')', 'Insert closing bracket'], ['×', ' × ', 'Insert multiply'], ['÷', ' ÷ ', 'Insert divide'],
    ['=', ' = ', 'Insert equals'], ['<', ' < ', 'Insert less than'], ['>', ' > ', 'Insert greater than'],
    ['≤', ' ≤ ', 'Insert less than or equal to'], ['≥', ' ≥ ', 'Insert greater than or equal to']
  ];
  const EXAMPLES = [
    '2x + 3 = 11', 'x² − 3x + 1 = 0', '3(x − 2) ≤ 2x + 7', '1 < 2x + 3 ≤ 7', 'x² − 4 ≥ 0',
    'x + y = 10\nx − y = 2', 'x + y = 5\nxy = 6', 'solve for r: A = πr²', '(a + b)²', '15% of 80',
    'x³ − 6x² + 11x − 6 = 0',
    'A cinema sells adult tickets for €12 and child tickets for €7. On Friday it sold 150 tickets for €1450 in total. How many of each were sold?'
  ];

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
    remove(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } }
  };
  let history = [];
  try { history = JSON.parse(store.get(HISTORY_KEY)) || []; } catch (e) { history = []; }

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.max(72, input.scrollHeight + 3) + 'px';
  }
  function setInput(text) { input.value = text; autosize(); }

  function insertAtCursor(text) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const pos = start + text.length;
    input.setSelectionRange(pos, pos);
    autosize();
  }

  function renderKeys() {
    const box = $('keys');
    const addKey = (label, cls, aria, onPress) => {
      const b = el('button', cls, label);
      b.type = 'button';
      if (aria) b.setAttribute('aria-label', aria);
      // Keep focus in the input so the cursor position is preserved.
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('click', onPress);
      box.appendChild(b);
    };
    KEYS.forEach(([label, insert, aria]) => addKey(label, 'key', aria, () => insertAtCursor(insert)));
    addKey('New line', 'key plain', 'Insert a new line for the next equation', () => insertAtCursor('\n'));
    addKey('Clear', 'key plain', null, () => { setInput(''); input.focus(); });
  }

  function renderList(box, items, emptyText) {
    box.replaceChildren();
    if (!items.length) { box.appendChild(el('p', 'hint', emptyText)); return; }
    items.forEach((t) => {
      const b = el('button', 'item', t);
      b.type = 'button';
      b.addEventListener('click', () => { setInput(t); solve(); });
      box.appendChild(b);
    });
  }

  function remember(text) {
    history = [text].concat(history.filter((h) => h !== text)).slice(0, 6);
    store.set(HISTORY_KEY, JSON.stringify(history));
    renderList($('history'), history, 'Problems you solve show up here.');
  }

  // ---------- results ----------

  function renderSteps(box, res) {
    box.appendChild(el('div', 'rule'));
    box.appendChild(el('h3', 'steps-title', 'Steps'));
    const ol = el('ol', 'steps');
    res.steps.forEach((s) => {
      const li = el('li', 'step');
      li.appendChild(el('span', 'step-n', String(s.n)));
      const body = el('div', 'step-body');
      body.appendChild(el('span', 'step-label', s.label));
      if (s.hasMath) body.appendChild(el('code', 'step-math', s.math));
      li.appendChild(body);
      ol.appendChild(li);
    });
    box.appendChild(ol);
  }

  function renderAnswer(box, res) {
    const head = el('div', 'answer-head');
    head.appendChild(el('h2', '', 'Answer'));
    head.appendChild(el('span', 'chip', res.kindLabel));
    box.appendChild(head);
    res.answers.forEach((a) => box.appendChild(el('div', 'answer', a.text)));
    if (res.hasNote) box.appendChild(el('p', 'note', res.note));
  }

  function renderError(box, title, message, hint) {
    box.appendChild(el('h2', 'error-title', title));
    box.appendChild(el('p', 'note', message));
    if (hint) box.appendChild(el('p', 'hint', hint));
  }

  function renderResult(res) {
    const box = $('result');
    box.replaceChildren();
    box.removeAttribute('aria-busy');
    if (res.isError) {
      renderError(box, 'Couldn’t solve that', res.error, 'Check for a missing bracket or operator. Put each equation of a system on its own line.');
      return;
    }
    renderAnswer(box, res);
    renderSteps(box, res);
  }

  function renderGraph(res) {
    const box = $('graph');
    box.replaceChildren();
    box.className = 'graph';
    if (!res || !res.hasPlot) {
      box.appendChild(el('p', 'hint', 'A graph appears for problems with one letter.'));
      return;
    }
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 560 320');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', res.plot.caption);
    [['g-band', res.plot.band], ['g-grid', res.plot.grid], ['g-axes', res.plot.axes], ['g-curve', res.plot.curve],
      ['g-dots', res.plot.dots], ['g-open', res.plot.open]].forEach(([cls, d]) => {
      if (!d) return;
      const p = document.createElementNS(SVG, 'path');
      p.setAttribute('class', cls);
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    box.appendChild(svg);
    const ranges = el('div', 'graph-ranges');
    ranges.appendChild(el('span', '', res.plot.xRange));
    ranges.appendChild(el('span', '', res.plot.yRange));
    box.appendChild(ranges);
    box.appendChild(el('p', 'hint', res.plot.caption));
  }

  // ---------- word problems (Claude) ----------

  const MODEL = 'claude-opus-5-5';
  const SYSTEM_PROMPT = [
    'You turn math word problems into equations for a step-by-step equation solver. The solver does the algebra and shows the working; your own answer is used to check its result.',
    '',
    'Write each equation in this syntax:',
    '- Unknowns are single letters. Pick letters that hint at the meaning (a for adults, c for children). Never use e or i as unknowns.',
    '- Operators: + - * / ^ and brackets. Functions: sqrt(), sin(), cos(), tan() (radians), ln(), log(), abs(). Constant: pi.',
    '- Relations: =, <, >, <=, >=. One equation or inequality per array item, with no units, words, thousands separators or commas inside.',
    '- Percentages as decimals (0.15) or as /100.',
    '- If the question only needs a calculation, give a single expression with no relation sign.',
    '- The solver handles: one equation in one unknown; inequalities in one unknown; linear systems of any size; two-equation systems where one equation is linear. Set the problem up in one of these forms.',
    '',
    'In setup_steps, explain in short sentences how the words of the problem become each equation.',
    'In answer_values, give the value of every unknown in the solution that makes sense in context (for example the positive root of a length). For an inequality, leave answer_values empty.',
    'In final_answer, answer the question in one or two sentences with units.',
    'If the text is not a solvable math problem, set is_math_problem to false, leave the arrays empty and explain why in final_answer.'
  ].join('\n');
  const SCHEMA = {
    type: 'object',
    properties: {
      is_math_problem: { type: 'boolean' },
      variables: {
        type: 'array',
        items: {
          type: 'object',
          properties: { letter: { type: 'string' }, meaning: { type: 'string' } },
          required: ['letter', 'meaning'],
          additionalProperties: false
        }
      },
      setup_steps: { type: 'array', items: { type: 'string' } },
      equations: { type: 'array', items: { type: 'string' } },
      answer_values: {
        type: 'array',
        items: {
          type: 'object',
          properties: { letter: { type: 'string' }, value: { type: 'number' } },
          required: ['letter', 'value'],
          additionalProperties: false
        }
      },
      final_answer: { type: 'string' }
    },
    required: ['is_math_problem', 'variables', 'setup_steps', 'equations', 'answer_values', 'final_answer'],
    additionalProperties: false
  };

  class WordProblemError extends Error {}

  async function askClaude(problem, key) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'server-side-fallback-2026-07-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 16000,
          fallbacks: 'default',
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: problem }]
        })
      });
    } catch (e) {
      if (e.name === 'AbortError') throw new WordProblemError('Claude took too long to answer. Try again.');
      throw new WordProblemError(navigator.onLine === false
        ? 'No internet connection. Word problems need the internet; everything else works offline.'
        : 'Couldn’t reach Claude. Check your internet connection and try again.');
    } finally {
      clearTimeout(timer);
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const msg = data && data.error && data.error.message ? data.error.message : 'HTTP ' + res.status;
      if (res.status === 401 || res.status === 403) throw new WordProblemError('Anthropic rejected the API key (' + msg + '). Check the key in the Word problems panel.');
      if (res.status === 429) throw new WordProblemError('Too many requests, or the account’s limit was reached (' + msg + '). Wait a moment and try again.');
      if (res.status >= 500) throw new WordProblemError('Claude is temporarily unavailable (' + msg + '). Try again shortly.');
      throw new WordProblemError('Claude couldn’t take this request: ' + msg);
    }
    if (data.stop_reason === 'refusal') throw new WordProblemError('Claude declined to answer this problem.');
    if (data.stop_reason === 'max_tokens') throw new WordProblemError('Claude’s answer was cut off. Try a shorter problem.');
    const block = (data.content || []).find((b) => b.type === 'text');
    try {
      return JSON.parse(block.text);
    } catch (e) {
      throw new WordProblemError('Claude’s reply couldn’t be read. Try again.');
    }
  }

  // Does the solver's own result agree with the values Claude gave?
  function verdict(res, claudeValues) {
    if (!res.ok || !res.values.length || !claudeValues.length) return 'unchecked';
    const close = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
    const ok = claudeValues.every((cv) => res.values.some((v) =>
      (v.name === '' || v.name === cv.letter) && close(v.value, cv.value)));
    return ok ? 'agree' : 'disagree';
  }

  function renderWordResult(problem, setup, res) {
    const box = $('result');
    box.replaceChildren();
    box.removeAttribute('aria-busy');
    if (!setup.is_math_problem) {
      renderError(box, 'Not a math problem Claude could set up', setup.final_answer);
      return;
    }
    const check = verdict(res, setup.answer_values);
    if (res.ok) renderAnswer(box, res);

    const words = el('div', 'words');
    const wordsHead = el('div', 'answer-head');
    wordsHead.appendChild(el('h2', '', 'In words'));
    wordsHead.appendChild(el('span', 'chip', 'From Claude'));
    words.appendChild(wordsHead);
    words.appendChild(el('p', 'words-answer', setup.final_answer));
    const msg = {
      agree: '✓ Checked: the solver worked the equations out independently and got the same numbers.',
      disagree: '⚠ The solver’s numbers differ from Claude’s answer. Read the setup below carefully before trusting either.',
      unchecked: res.ok
        ? 'Not checked automatically: compare the solver’s answer above with this one.'
        : '⚠ The solver couldn’t work through Claude’s equations (' + res.error + '), so this answer is not checked.'
    }[check];
    words.appendChild(el('p', 'verdict ' + check, msg));
    box.appendChild(words);

    box.appendChild(el('div', 'rule'));
    box.appendChild(el('h3', 'steps-title', 'Setting it up'));
    if (setup.variables.length) {
      const vars = el('ul', 'setup-vars');
      setup.variables.forEach((v) => {
        const li = el('li');
        li.appendChild(el('code', 'step-math inline', v.letter));
        li.appendChild(document.createTextNode(' = ' + v.meaning));
        vars.appendChild(li);
      });
      box.appendChild(vars);
    }
    const why = el('ul', 'setup-steps');
    setup.setup_steps.forEach((s) => why.appendChild(el('li', '', s)));
    box.appendChild(why);
    if (setup.equations.length) box.appendChild(el('code', 'step-math', setup.equations.join('\n')));

    if (res.ok) renderSteps(box, res);
  }

  async function solveWordProblem(text) {
    const box = $('result');
    const key = store.get(API_KEY_STORE);
    if (!key) {
      box.replaceChildren();
      renderError(box, 'Word problems need Claude',
        'This looks like a word problem. Turning words into equations needs Claude, an AI model, which runs over the internet with your own Anthropic API key.',
        'Add a key in the Word problems panel, then press Solve again. If this is really an equation, use “Solve as math” below.');
      const asMath = el('button', 'tool plain', 'Solve as math');
      asMath.type = 'button';
      asMath.addEventListener('click', () => solveMath(text, true));
      box.appendChild(asMath);
      renderGraph(null);
      const keyInput = $('api-key');
      if (keyInput) keyInput.focus();
      return;
    }
    box.replaceChildren();
    box.setAttribute('aria-busy', 'true');
    box.appendChild(el('h2', 'loading', 'Reading the problem with Claude…'));
    box.appendChild(el('p', 'hint', 'This usually takes a few seconds.'));
    solveBtn.disabled = true;
    try {
      const setup = await askClaude(text, key);
      const res = setup.is_math_problem && setup.equations.length
        ? MathSolver.compute(setup.equations.join('\n'), { forceMath: true })
        : { ok: false, isError: true, error: 'no equations', values: [], hasPlot: false };
      renderWordResult(text, setup, res);
      renderGraph(res.ok ? res : null);
      if (setup.is_math_problem) remember(text);
    } catch (e) {
      box.replaceChildren();
      box.removeAttribute('aria-busy');
      if (!(e instanceof WordProblemError)) console.error(e);
      renderError(box, 'Couldn’t solve that word problem', e instanceof WordProblemError ? e.message : 'Something went wrong. Try again.');
      renderGraph(null);
    } finally {
      solveBtn.disabled = false;
    }
  }

  function renderClaudeSettings() {
    const box = $('claude-settings');
    box.replaceChildren();
    if (store.get(API_KEY_STORE)) {
      box.appendChild(el('p', 'hint', 'Claude is set up on this device. Word problems are sent to Anthropic to be turned into equations; each one costs a few US cents on your Anthropic account.'));
      const forget = el('button', 'tool plain', 'Remove API key');
      forget.type = 'button';
      forget.addEventListener('click', () => { store.remove(API_KEY_STORE); renderClaudeSettings(); });
      box.appendChild(forget);
      return;
    }
    box.appendChild(el('p', 'hint', 'Equations, inequalities and systems are solved on this device. Word problems are read by Claude, which needs the internet and your own Anthropic API key. Each word problem costs a few US cents.'));
    const form = el('form', 'key-form');
    const label = el('label', 'label', 'Anthropic API key');
    label.setAttribute('for', 'api-key');
    const field = el('input');
    field.id = 'api-key';
    field.type = 'password';
    field.autocomplete = 'off';
    field.placeholder = 'sk-ant-…';
    const save = el('button', 'tool', 'Save key');
    save.type = 'submit';
    const row = el('div', 'key-row');
    row.appendChild(field);
    row.appendChild(save);
    form.appendChild(label);
    form.appendChild(row);
    const help = el('p', 'hint');
    help.appendChild(document.createTextNode('Create a key at '));
    const link = el('a', '', 'console.anthropic.com');
    link.href = 'https://console.anthropic.com/settings/keys';
    link.target = '_blank';
    link.rel = 'noopener';
    help.appendChild(link);
    help.appendChild(document.createTextNode('. It is stored only in this browser and sent only to Anthropic.'));
    form.appendChild(help);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const k = field.value.trim();
      if (!k) return;
      store.set(API_KEY_STORE, k);
      renderClaudeSettings();
    });
    box.appendChild(form);
  }

  // ---------- solving ----------

  function solveMath(text, force) {
    const res = MathSolver.compute(text, { forceMath: force });
    renderResult(res);
    renderGraph(res);
    if (res.ok) remember(text);
  }

  function solve() {
    const text = input.value.trim();
    if (text && MathSolver.isWordProblem(text)) solveWordProblem(text);
    else solveMath(text, false);
  }

  // ---------- scratchpad: pressure-sensitive drawing with palm rejection once a pen is seen ----------

  function setupPad() {
    const pad = $('pad');
    const ctx = pad.getContext('2d');
    const penBtn = $('tool-pen'), eraserBtn = $('tool-eraser');
    let tool = 'pen', penSeen = false, activeId = null, last = null;

    function size() {
      const r = pad.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (w > 0 && h > 0 && (pad.width !== w || pad.height !== h)) {
        // Keep the drawing when the pad is resized (rotation, split view).
        const copy = document.createElement('canvas');
        copy.width = pad.width; copy.height = pad.height;
        if (pad.width && pad.height) copy.getContext('2d').drawImage(pad, 0, 0);
        pad.width = w; pad.height = h;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (copy.width && copy.height) ctx.drawImage(copy, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      return r;
    }
    function inkColor() { return getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#111827'; }
    function drawTo(e) {
      const r = pad.getBoundingClientRect();
      const pt = { x: e.clientX - r.left, y: e.clientY - r.top };
      const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = inkColor();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = tool === 'eraser' ? 26 : 1 + pressure * 4;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      last = pt;
    }

    pad.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'pen') penSeen = true;
      if (e.pointerType === 'touch' && penSeen) return;
      if (activeId !== null) return;
      e.preventDefault();
      const r = size();
      pad.setPointerCapture(e.pointerId);
      activeId = e.pointerId;
      last = { x: e.clientX - r.left, y: e.clientY - r.top };
      drawTo({ clientX: e.clientX + 0.01, clientY: e.clientY, pointerType: e.pointerType, pressure: e.pressure });
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId !== activeId) return;
      e.preventDefault();
      const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      (list.length ? list : [e]).forEach(drawTo);
    });
    const end = (e) => { if (e.pointerId === activeId) { activeId = null; last = null; } };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    // Stop iOS from scrolling or showing the magnifier while drawing.
    pad.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

    const setTool = (t) => {
      tool = t;
      penBtn.setAttribute('aria-pressed', String(t === 'pen'));
      eraserBtn.setAttribute('aria-pressed', String(t === 'eraser'));
    };
    penBtn.addEventListener('click', () => setTool('pen'));
    eraserBtn.addEventListener('click', () => setTool('eraser'));
    $('pad-clear').addEventListener('click', () => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, pad.width, pad.height);
      ctx.restore();
    });
    window.addEventListener('resize', size);
    size();
  }

  $('solve-form').addEventListener('submit', (e) => { e.preventDefault(); solve(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); solve(); }
  });
  input.addEventListener('input', autosize);
  renderKeys();
  renderList($('examples'), EXAMPLES, '');
  renderList($('history'), history, 'Problems you solve show up here.');
  renderClaudeSettings();
  setupPad();
  autosize();
  solve();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable */ });
  }
})();
