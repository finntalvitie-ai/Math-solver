// Math Solver: write a problem with Apple Pencil, Claude reads and solves it, the built-in solver double-checks.
(function () {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const SVG = 'http://www.w3.org/2000/svg';

  const KEY_STORE = 'math-solver-anthropic-key';
  const RECENT_STORE = 'math-solver-recent';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
    remove(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } }
  };

  // ---------- writing pad ----------
  // Strokes are kept as point lists so they can be undone and re-drawn in black for Claude.

  function createPad(canvas) {
    const ctx = canvas.getContext('2d');
    let strokes = [], current = null, tool = 'pen', penSeen = false;

    const ink = () => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#111827';
    const widthAt = (s, p) => (s.tool === 'eraser' ? 28 : s.pointer === 'pen' ? 1.4 + p * 3.6 : 3);

    function segment(c, s, a, b, color) {
      c.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
      c.strokeStyle = color;
      c.fillStyle = color;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.lineWidth = widthAt(s, b.p);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x + (a === b ? 0.01 : 0), b.y);
      c.stroke();
    }
    function drawStroke(c, s, color) {
      s.points.forEach((pt, i) => segment(c, s, s.points[Math.max(0, i - 1)], pt, color));
    }
    function redraw() {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      strokes.forEach((s) => drawStroke(ctx, s, ink()));
    }
    function size() {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w; canvas.height = h;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        redraw();
      }
      return r;
    }
    const point = (e, r) => ({ x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure > 0 ? e.pressure : 0.5 });

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'pen') penSeen = true;
      if (e.pointerType === 'touch' && penSeen) return; // palm rejection once the Pencil has been used
      if (current) return;
      e.preventDefault();
      const r = size();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
      const pt = point(e, r);
      current = { tool, pointer: e.pointerType, id: e.pointerId, points: [pt] };
      strokes.push(current);
      segment(ctx, current, pt, pt, ink());
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!current || e.pointerId !== current.id) return;
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      (list.length ? list : [e]).forEach((ev) => {
        const pt = point(ev, r);
        segment(ctx, current, current.points[current.points.length - 1], pt, ink());
        current.points.push(pt);
      });
    });
    const end = (e) => { if (current && e.pointerId === current.id) current = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    // Stop iOS from scrolling or showing the magnifier while writing.
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    window.addEventListener('resize', size);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);
    size();

    return {
      setTool(t) { tool = t; },
      undo() { strokes.pop(); redraw(); },
      clear() { strokes = []; redraw(); },
      hasInk() { return strokes.some((s) => s.tool === 'pen'); },
      // The writing cropped to its bounding box, black on white, as base64 PNG.
      toImage() {
        const pts = strokes.filter((s) => s.tool === 'pen').reduce((a, s) => a.concat(s.points), []);
        if (!pts.length) return null;
        const pad = 24;
        const minX = Math.min.apply(null, pts.map((p) => p.x)) - pad, maxX = Math.max.apply(null, pts.map((p) => p.x)) + pad;
        const minY = Math.min.apply(null, pts.map((p) => p.y)) - pad, maxY = Math.max.apply(null, pts.map((p) => p.y)) + pad;
        const w = maxX - minX, h = maxY - minY;
        const scale = Math.min(2, 1568 / Math.max(w, h));
        const layer = document.createElement('canvas');
        layer.width = Math.round(w * scale); layer.height = Math.round(h * scale);
        const lc = layer.getContext('2d');
        lc.setTransform(scale, 0, 0, scale, -minX * scale, -minY * scale);
        strokes.forEach((s) => drawStroke(lc, s, '#000000'));
        const out = document.createElement('canvas');
        out.width = layer.width; out.height = layer.height;
        const oc = out.getContext('2d');
        oc.fillStyle = '#FFFFFF';
        oc.fillRect(0, 0, out.width, out.height);
        oc.drawImage(layer, 0, 0);
        return out.toDataURL('image/png').split(',')[1];
      }
    };
  }

  const pad = createPad($('pad'));
  const penBtn = $('tool-pen'), eraserBtn = $('tool-eraser');
  const setTool = (t) => {
    pad.setTool(t);
    penBtn.setAttribute('aria-pressed', String(t === 'pen'));
    eraserBtn.setAttribute('aria-pressed', String(t === 'eraser'));
  };
  penBtn.addEventListener('click', () => setTool('pen'));
  eraserBtn.addEventListener('click', () => setTool('eraser'));
  $('pad-undo').addEventListener('click', () => pad.undo());
  $('pad-clear').addEventListener('click', () => pad.clear());

  // ---------- photo ----------

  let photo = null; // { type, data }
  $('photo').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1568 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', 0.88);
      photo = { type: 'image/jpeg', data: dataUrl.split(',')[1] };
      $('photo-img').src = dataUrl;
      $('photo-preview').hidden = false;
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert('That file couldn’t be opened as an image.'); };
    img.src = url;
  });
  $('photo-remove').addEventListener('click', () => { photo = null; $('photo-preview').hidden = true; });

  // ---------- Claude ----------

  const MODEL = 'claude-opus-5-5';
  const SYSTEM_PROMPT = [
    'You are a patient, careful math tutor inside a handwriting app. Students write problems with Apple Pencil (sent to you as an image), take a photo, or type them.',
    '',
    'For a new problem:',
    '1. Read it carefully. Put exactly what you read in read_as, in plain Unicode math (x², √, ≤, ≥, ≠, ×, ÷, π, fractions as a/b). If some handwriting is unclear, choose the most likely reading and say what was unclear in reading_note; otherwise leave reading_note empty.',
    '2. Solve it completely and correctly. It can be any kind of math: arithmetic, algebra, inequalities, systems, word problems, geometry, trigonometry, calculus, probability, statistics or proofs.',
    '3. In steps, show the working a good teacher would expect, one idea per step: a short plain-language explanation plus the math for that step. Write all math in plain Unicode text. Never use LaTeX or Markdown.',
    '4. In answer, give the final answer briefly, with units when the problem has them.',
    '5. In topic, name the kind of problem in two to four words, for example "Linear equation" or "Word problem: speed".',
    '6. For an independent double-check: if the problem comes down to equations, inequalities or an expression, also write them in check_equations using this syntax: single-letter unknowns (not e or i), operators + - * / ^, brackets, sqrt(), sin(), cos(), tan() in radians, ln(), log(), abs(), pi, and =, <, >, <=, >=, one per item, no units or words. A pure calculation is one expression with no = sign. Put the numeric value of each unknown (or of the calculation, with letter "") in answer_values. For inequalities, or problems that do not reduce to this, leave both arrays empty.',
    '',
    'For a follow-up question about the same problem, leave read_as, reading_note and check_equations empty and answer_values empty, put a direct answer in answer, and use steps for any explanation. Keep it focused on what was asked.',
    '',
    'If the image or text has no math problem in it, say so in answer and leave the other fields empty.'
  ].join('\n');
  const SCHEMA = {
    type: 'object',
    properties: {
      read_as: { type: 'string' },
      reading_note: { type: 'string' },
      topic: { type: 'string' },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: { explanation: { type: 'string' }, math: { type: 'string' } },
          required: ['explanation', 'math'],
          additionalProperties: false
        }
      },
      answer: { type: 'string' },
      check_equations: { type: 'array', items: { type: 'string' } },
      answer_values: {
        type: 'array',
        items: {
          type: 'object',
          properties: { letter: { type: 'string' }, value: { type: 'number' } },
          required: ['letter', 'value'],
          additionalProperties: false
        }
      }
    },
    required: ['read_as', 'reading_note', 'topic', 'steps', 'answer', 'check_equations', 'answer_values'],
    additionalProperties: false
  };

  class ClaudeError extends Error {}

  // Sends the conversation to Claude; returns the parsed reply and the raw content to keep in the history.
  async function askClaude(messages) {
    const key = store.get(KEY_STORE);
    if (!key) throw new ClaudeError('Add your Anthropic API key first (see the box at the top).');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180000);
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
          output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
          system: SYSTEM_PROMPT,
          messages
        })
      });
    } catch (e) {
      if (e.name === 'AbortError') throw new ClaudeError('Claude took too long to answer. Try again.');
      throw new ClaudeError(navigator.onLine === false ? 'No internet connection.' : 'Couldn’t reach Claude. Check your internet connection and try again.');
    } finally {
      clearTimeout(timer);
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const msg = data && data.error && data.error.message ? data.error.message : 'HTTP ' + res.status;
      if (res.status === 401 || res.status === 403) throw new ClaudeError('Anthropic rejected the API key (' + msg + '). Check the key in the Claude panel.');
      if (res.status === 429) throw new ClaudeError('Too many requests, or the account’s limit was reached (' + msg + '). Wait a moment and try again.');
      if (res.status >= 500) throw new ClaudeError('Claude is temporarily unavailable (' + msg + '). Try again shortly.');
      throw new ClaudeError('Claude couldn’t take this request: ' + msg);
    }
    if (data.stop_reason === 'refusal') throw new ClaudeError('Claude declined to answer this.');
    if (data.stop_reason === 'max_tokens') throw new ClaudeError('Claude’s answer was cut off. Try splitting the problem into smaller parts.');
    const block = (data.content || []).find((b) => b.type === 'text');
    try {
      return { reply: JSON.parse(block.text), content: data.content };
    } catch (e) {
      throw new ClaudeError('Claude’s reply couldn’t be read. Try again.');
    }
  }

  // Re-solves Claude's equations with the built-in solver and compares the numbers.
  function doubleCheck(reply) {
    if (!reply.check_equations.length) return { verdict: 'none', res: null };
    const res = MathSolver.compute(reply.check_equations.join('\n'), { forceMath: true });
    if (!res.ok || !res.values.length || !reply.answer_values.length) return { verdict: 'none', res: res.ok ? res : null };
    const close = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
    const ok = reply.answer_values.every((cv) => res.values.some((v) => (v.name === '' || v.name === cv.letter) && close(v.value, cv.value)));
    return { verdict: ok ? 'agree' : 'disagree', res };
  }

  // ---------- rendering ----------

  function renderSteps(box, steps) {
    if (!steps.length) return;
    const ol = el('ol', 'steps');
    steps.forEach((s, i) => {
      const li = el('li', 'step');
      li.appendChild(el('span', 'step-n', String(i + 1)));
      const body = el('div', 'step-body');
      if (s.explanation) body.appendChild(el('span', 'step-label', s.explanation));
      if (s.math) body.appendChild(el('code', 'step-math', s.math));
      li.appendChild(body);
      ol.appendChild(li);
    });
    box.appendChild(ol);
  }

  function renderGraph(res) {
    const card = $('graph-card'), box = $('graph');
    box.replaceChildren();
    if (!res || !res.hasPlot) { card.hidden = true; return; }
    card.hidden = false;
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

  function renderSolution(reply) {
    const box = $('result');
    box.replaceChildren();
    box.removeAttribute('aria-busy');
    box.hidden = false;
    if (reply.read_as) {
      const read = el('div', 'read');
      read.appendChild(el('span', 'read-label', 'I read this as'));
      read.appendChild(el('div', 'read-text', reply.read_as));
      if (reply.reading_note) read.appendChild(el('p', 'read-note', reply.reading_note));
      read.appendChild(el('p', 'hint', 'Not right? Fix it on the pad or type it below the pad, then press Solve again.'));
      box.appendChild(read);
    }
    const head = el('div', 'answer-head');
    head.appendChild(el('h2', '', 'Answer'));
    if (reply.topic) head.appendChild(el('span', 'chip', reply.topic));
    box.appendChild(head);
    box.appendChild(el('div', 'answer', reply.answer));
    const check = doubleCheck(reply);
    if (check.verdict === 'agree') box.appendChild(el('p', 'verdict agree', '✓ Double-checked: the built-in solver worked it out separately and got the same answer.'));
    if (check.verdict === 'disagree') {
      box.appendChild(el('p', 'verdict disagree', '⚠ The built-in solver got ' + check.res.answers.map((a) => a.text).join(', ') +
        ' from the same equations. One of them is wrong. Go through the steps, or ask below.'));
    }
    if (reply.steps.length) {
      box.appendChild(el('div', 'rule'));
      box.appendChild(el('h3', 'steps-title', 'Steps'));
      renderSteps(box, reply.steps);
    }
    renderGraph(check.res);
  }

  function showLoading(box, text) {
    box.hidden = false;
    box.replaceChildren();
    box.setAttribute('aria-busy', 'true');
    const row = el('div', 'loading-row');
    row.appendChild(el('span', 'spinner'));
    row.appendChild(el('span', 'loading', text));
    box.appendChild(row);
  }

  function showError(box, title, message) {
    box.hidden = false;
    box.replaceChildren();
    box.removeAttribute('aria-busy');
    box.appendChild(el('h2', 'error-title', title));
    box.appendChild(el('p', 'note', message));
  }

  // ---------- conversation ----------

  let messages = [];
  const solveBtn = $('solve-btn'), askBtn = $('ask-btn');

  async function solve() {
    const typed = $('typed').value.trim();
    const drawing = pad.hasInk() ? pad.toImage() : null;
    if (!drawing && !photo && !typed) {
      showError($('result'), 'Nothing to solve yet', 'Write a problem on the pad, add a photo, or type it.');
      return;
    }
    if (!store.get(KEY_STORE)) { renderSetup(true); return; }
    const content = [];
    if (drawing) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: drawing } });
    if (photo) content.push({ type: 'image', source: { type: 'base64', media_type: photo.type, data: photo.data } });
    const parts = [];
    if (drawing) parts.push('The first image is my handwriting on the writing pad.');
    if (photo) parts.push('There is also a photo of the problem.');
    parts.push(typed ? 'Typed: ' + typed : 'Solve the problem.');
    content.push({ type: 'text', text: parts.join(' ') });

    const convo = [{ role: 'user', content }];
    solveBtn.disabled = true;
    $('followup').hidden = true;
    $('thread').replaceChildren();
    showLoading($('result'), 'Claude is reading and solving your problem… (usually 10–40 seconds)');
    $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    try {
      const { reply, content: raw } = await askClaude(convo);
      convo.push({ role: 'assistant', content: raw });
      messages = convo;
      renderSolution(reply);
      $('followup').hidden = false;
      if (reply.read_as) remember(reply.read_as, reply.answer);
    } catch (e) {
      if (!(e instanceof ClaudeError)) console.error(e);
      showError($('result'), 'Couldn’t solve that', e instanceof ClaudeError ? e.message : 'Something went wrong. Try again.');
      renderGraph(null);
    } finally {
      solveBtn.disabled = false;
    }
  }

  async function ask(question) {
    const thread = $('thread');
    const q = el('div', 'bubble you');
    q.appendChild(el('span', 'bubble-who', 'You'));
    q.appendChild(el('p', '', question));
    thread.appendChild(q);
    const a = el('div', 'bubble claude');
    thread.appendChild(a);
    showLoading(a, 'Claude is thinking…');
    askBtn.disabled = true;
    const convo = messages.concat([{ role: 'user', content: question }]);
    try {
      const { reply, content: raw } = await askClaude(convo);
      convo.push({ role: 'assistant', content: raw });
      messages = convo;
      a.replaceChildren();
      a.removeAttribute('aria-busy');
      a.appendChild(el('span', 'bubble-who', 'Claude'));
      a.appendChild(el('p', 'bubble-answer', reply.answer));
      renderSteps(a, reply.steps);
    } catch (e) {
      if (!(e instanceof ClaudeError)) console.error(e);
      showError(a, 'Couldn’t answer that', e instanceof ClaudeError ? e.message : 'Something went wrong. Try again.');
    } finally {
      askBtn.disabled = false;
    }
  }

  // ---------- recent problems ----------

  let recent = [];
  try { recent = JSON.parse(store.get(RECENT_STORE)) || []; } catch (e) { recent = []; }
  recent = recent.filter((r) => r && typeof r.problem === 'string');

  function remember(problem, answer) {
    recent = [{ problem, answer }].concat(recent.filter((r) => r.problem !== problem)).slice(0, 8);
    store.set(RECENT_STORE, JSON.stringify(recent));
    renderRecent();
  }
  function renderRecent() {
    const box = $('history');
    box.replaceChildren();
    if (!recent.length) { box.appendChild(el('p', 'hint', 'Problems you solve show up here. Tap one to solve it again.')); return; }
    recent.forEach((r) => {
      const b = el('button', 'item');
      b.type = 'button';
      b.appendChild(el('span', 'item-problem', r.problem));
      b.appendChild(el('span', 'item-answer', r.answer));
      b.addEventListener('click', () => {
        pad.clear();
        photo = null;
        $('photo-preview').hidden = true;
        $('typed').value = r.problem;
        solve();
      });
      box.appendChild(b);
    });
  }

  // ---------- API key ----------

  function keyForm(onSaved) {
    const form = el('form', 'key-form');
    const label = el('label', 'label', 'Anthropic API key');
    label.setAttribute('for', 'api-key');
    const field = el('input');
    field.id = 'api-key';
    field.type = 'password';
    field.autocomplete = 'off';
    field.placeholder = 'sk-ant-…';
    const save = el('button', 'primary small', 'Save key');
    save.type = 'submit';
    const row = el('div', 'key-row');
    row.appendChild(field);
    row.appendChild(save);
    form.appendChild(label);
    form.appendChild(row);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const k = field.value.trim();
      if (!k) return;
      store.set(KEY_STORE, k);
      onSaved();
    });
    return form;
  }

  function renderSetup(focus) {
    const box = $('setup');
    box.replaceChildren();
    if (store.get(KEY_STORE)) { box.hidden = true; return; }
    box.hidden = false;
    box.appendChild(el('h2', '', 'Connect Claude (one time)'));
    const steps = el('ol', 'setup-steps');
    const li1 = el('li');
    li1.appendChild(document.createTextNode('Sign in at '));
    const link = el('a', '', 'console.anthropic.com');
    link.href = 'https://console.anthropic.com/settings/keys';
    link.target = '_blank';
    link.rel = 'noopener';
    li1.appendChild(link);
    li1.appendChild(document.createTextNode(', add some credit, and create an API key.'));
    steps.appendChild(li1);
    steps.appendChild(el('li', '', 'Paste the key here. It is saved only on this device and sent only to Anthropic.'));
    box.appendChild(steps);
    box.appendChild(keyForm(() => { renderSetup(); renderClaudeSettings(); }));
    box.appendChild(el('p', 'hint', 'Each problem costs roughly 3–10 US cents on your Anthropic account; follow-up questions cost about the same.'));
    if (focus) { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); $('api-key').focus(); }
  }

  function renderClaudeSettings() {
    const box = $('claude-settings');
    box.replaceChildren();
    if (store.get(KEY_STORE)) {
      box.appendChild(el('p', 'hint', 'Connected. Problems are sent to Anthropic’s Claude (' + MODEL + ') to be read and solved.'));
      const forget = el('button', 'tool plain', 'Remove API key');
      forget.type = 'button';
      forget.addEventListener('click', () => { store.remove(KEY_STORE); renderClaudeSettings(); renderSetup(); });
      box.appendChild(forget);
    } else {
      box.appendChild(el('p', 'hint', 'Not connected yet. Add your API key in the box at the top.'));
    }
  }

  // ---------- start ----------

  solveBtn.addEventListener('click', solve);
  const askInput = $('ask');
  const autosize = () => { askInput.style.height = 'auto'; askInput.style.height = Math.max(52, askInput.scrollHeight + 3) + 'px'; };
  askInput.addEventListener('input', autosize);
  askInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('ask-form').requestSubmit(); }
  });
  $('ask-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = askInput.value.trim();
    if (!q || askBtn.disabled) return;
    askInput.value = '';
    autosize();
    ask(q);
  });
  renderSetup();
  renderClaudeSettings();
  renderRecent();

  // Remove the offline cache left by earlier versions of the app.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
  }
})();
