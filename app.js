// UI for the math solver: input, keypad, results, graph, history and the Apple Pencil scratchpad.
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
  const HISTORY_KEY = 'math-solver-history';

  const KEYS = [
    ['x', 'x', 'Insert x'], ['x²', '^2', 'Insert squared'], ['xⁿ', '^', 'Insert power'],
    ['√', '√(', 'Insert square root'], ['π', 'π', 'Insert pi'], ['(', '(', 'Insert opening bracket'],
    [')', ')', 'Insert closing bracket'], ['×', ' × ', 'Insert multiply'], ['÷', ' ÷ ', 'Insert divide'],
    ['=', ' = ', 'Insert equals']
  ];
  const EXAMPLES = ['2x + 3 = 11', '3(x − 2) = 2x + 7', 'x² − 5x + 6 = 0', 'x² − 3x + 1 = 0', 'x² + 2x + 5 = 0',
    '(2 + 3) × 4 − 6 ÷ 2', '√144 + 2^5', '(x + 1)^3', 'x³ − 6x² + 11x − 6 = 0', 'sin(x) = 0.5'];

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch (e) { return []; }
  }
  function saveHistory(h) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch (e) { /* storage unavailable */ }
  }
  let history = loadHistory();

  function insertAtCursor(text) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const pos = start + text.length;
    input.setSelectionRange(pos, pos);
  }

  function renderKeys() {
    const box = $('keys');
    KEYS.forEach(([label, insert, aria]) => {
      const b = el('button', 'key', label);
      b.type = 'button';
      b.setAttribute('aria-label', aria);
      // Keep focus in the input so the cursor position is preserved.
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('click', () => insertAtCursor(insert));
      box.appendChild(b);
    });
    const clear = el('button', 'key plain', 'Clear');
    clear.type = 'button';
    clear.addEventListener('click', () => { input.value = ''; input.focus(); });
    box.appendChild(clear);
  }

  function renderList(box, items, emptyText) {
    box.replaceChildren();
    if (!items.length) { box.appendChild(el('p', 'hint', emptyText)); return; }
    items.forEach((t) => {
      const b = el('button', 'item', t);
      b.type = 'button';
      b.addEventListener('click', () => { input.value = t; solve(); });
      box.appendChild(b);
    });
  }

  function renderResult(res) {
    const box = $('result');
    box.replaceChildren();
    if (res.isError) {
      box.appendChild(el('h2', 'error-title', 'Couldn’t solve that'));
      box.appendChild(el('p', 'note', res.error));
      box.appendChild(el('p', 'hint', 'Check for a missing bracket or operator, and use x as the variable.'));
      return;
    }
    const head = el('div', 'answer-head');
    head.appendChild(el('h2', '', 'Answer'));
    head.appendChild(el('span', 'chip', res.kindLabel));
    box.appendChild(head);
    res.answers.forEach((a) => box.appendChild(el('div', 'answer', a.text)));
    if (res.hasNote) box.appendChild(el('p', 'note', res.note));
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

  function renderGraph(res) {
    const box = $('graph');
    box.replaceChildren();
    box.className = 'graph';
    if (!res.hasPlot) {
      box.appendChild(el('p', 'hint', 'A graph appears for any problem that contains x.'));
      return;
    }
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 560 320');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', res.plot.caption);
    [['g-grid', res.plot.grid], ['g-axes', res.plot.axes], ['g-curve', res.plot.curve], ['g-dots', res.plot.dots]].forEach(([cls, d]) => {
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

  function solve() {
    const text = input.value.trim();
    const res = MathSolver.compute(text);
    renderResult(res);
    renderGraph(res);
    if (res.ok) {
      history = [text].concat(history.filter((h) => h !== text)).slice(0, 6);
      saveHistory(history);
      renderList($('history'), history, 'Problems you solve show up here.');
    }
  }

  // Scratchpad: pressure-sensitive drawing with palm rejection once a pen is seen.
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
  renderKeys();
  renderList($('examples'), EXAMPLES, '');
  renderList($('history'), history, 'Problems you solve show up here.');
  setupPad();
  solve();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable */ });
  }
})();
