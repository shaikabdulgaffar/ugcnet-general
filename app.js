/* =========================================================
   UGC NET Paper 1 — PYQ Practice
   Single shared app.js — no build step, works straight on GitHub Pages
   ========================================================= */

const State = {
  manifest: null,
  allQuestions: [],
  filters: { years: new Set(), sessions: new Set(), subjects: new Set(), units: new Set(), search: '' },
  test: null
};

let unitMap = {};
const browseState = new Map(); // qid -> { selected: number|null, revealed: boolean }

/* ---------------------------------------------------------
   Utilities
   --------------------------------------------------------- */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching ' + url);
  return res.json();
}

function getBrowseEntry(qid) {
  if (!browseState.has(qid)) browseState.set(qid, { selected: null, revealed: false });
  return browseState.get(qid);
}

function switchView(id) {
  ['browseView', 'testConfigView', 'testRunView', 'testResultView'].forEach(v => {
    document.getElementById(v).classList.toggle('hidden', v !== id);
  });
}

function setSidebarOpen(open) {
  document.getElementById('sidebar').classList.toggle('open', open);
  document.getElementById('backdrop').classList.toggle('show', open);
  document.getElementById('menuToggle').setAttribute('aria-expanded', String(open));
  const icon = document.getElementById('menuToggleIcon');
  icon.classList.toggle('fa-bars', !open);
  icon.classList.toggle('fa-xmark', open);
}

function closeSidebarOnMobile() {
  setSidebarOpen(false);
}

/* ---------------------------------------------------------
   Passage box + explain panel (shared between Browse/Review)
   --------------------------------------------------------- */

/* Detects and converts GitHub-style Markdown tables inside passage text
   into real <table> elements; everything else stays as plain text/para. */
function isTableSeparatorLine(line) {
  // e.g. "| :--- | :--- | :--- |"  or  "|---|---|"
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  return cells.length > 0 && cells.every(c => /^\s*:?-+:?\s*$/.test(c));
}

function splitMarkdownRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

/* Generic rich-text builder: detects Markdown tables (and #-headings) inside
   ANY question-bank string — question text, passage, explanation, option
   notes — and renders real <table> elements for them instead of dumping the
   raw "| a | b |" pipe syntax on screen. Plain text (no table pattern) comes
   out exactly as before, just wrapped in a <p>/<span>, so nothing else changes
   visually. This is the single place that must handle tables — every text
   field from a question JSON should be piped through this function so that
   any future year file with a table in it (question, explanation, or option
   note) renders correctly with zero further code changes.
   `inline: true` renders a bare <span> instead of a paragraph, for spots
   like q-text/option-notes that don't want passage-style paragraph spacing
   when there's no table (falls back to a plain paragraph anyway once a
   table is present, since a table can't sit inside a <span>). */
function buildRichTextBody(text, opts = {}) {
  const frag = document.createDocumentFragment();
  const lines = String(text == null ? '' : text).split('\n');

  let i = 0;
  let paraBuffer = [];
  let sawTable = false;

  function flushParagraph() {
    if (!paraBuffer.length) return;
    const joined = paraBuffer.join('\n');
    if (opts.inline && !sawTable && frag.childNodes.length === 0 && lines.length === paraBuffer.length) {
      // Whole input is a single plain-text block and caller wants inline: span, not <p>.
      const span = document.createElement('span');
      span.style.whiteSpace = 'pre-line';
      span.textContent = joined;
      frag.appendChild(span);
    } else {
      const p = document.createElement('p');
      p.className = 'passage-para';
      p.textContent = joined;
      frag.appendChild(p);
    }
    paraBuffer = [];
  }

  while (i < lines.length) {
    const line = lines[i];

    // Markdown heading, e.g. "## Student-wise marks details"
    const headingMatch = /^(#{1,4})\s+(.*)$/.exec(line.trim());
    if (headingMatch) {
      flushParagraph();
      const h = document.createElement('div');
      h.className = 'passage-subhead';
      h.textContent = headingMatch[2];
      frag.appendChild(h);
      i++;
      continue;
    }

    // Possible start of a Markdown table: a "| ... |" row followed by a separator row
    if (/^\s*\|.*\|\s*$/.test(line) && lines[i + 1] && isTableSeparatorLine(lines[i + 1])) {
      flushParagraph();
      sawTable = true;
      const headerCells = splitMarkdownRow(line);
      i += 2; // skip header + separator
      const bodyRows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        bodyRows.push(splitMarkdownRow(lines[i]));
        i++;
      }

      const tableWrap = document.createElement('div');
      tableWrap.className = 'passage-table-wrap';
      const table = document.createElement('table');
      table.className = 'passage-table';

      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      headerCells.forEach(c => {
        const th = document.createElement('th');
        th.textContent = c;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      bodyRows.forEach(cells => {
        const tr = document.createElement('tr');
        cells.forEach(c => {
          const td = document.createElement('td');
          td.textContent = c;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      frag.appendChild(tableWrap);
      continue;
    }

    // Blank line -> paragraph break
    if (line.trim() === '') {
      flushParagraph();
      i++;
      continue;
    }

    paraBuffer.push(line);
    i++;
  }
  flushParagraph();

  return frag;
}

function passageBoxEl(text) {
  const div = document.createElement('div');
  div.className = 'passage-box';
  const label = document.createElement('span');
  label.className = 'passage-label';
  label.textContent = 'Passage';
  div.appendChild(label);
  const body = document.createElement('div');
  body.appendChild(buildRichTextBody(text));
  div.appendChild(body);
  return div;
}

function buildExplainPanel(q) {
  const panel = document.createElement('div');
  panel.className = 'explain-panel';

  const ansLine = document.createElement('div');
  ansLine.className = 'answer-line';
  const b = document.createElement('b');
  b.textContent = String.fromCharCode(65 + q.answer) + '. ' + q.options[q.answer];
  ansLine.append('Correct answer: ', b);
  panel.appendChild(ansLine);

  const h4a = document.createElement('h4');
  h4a.textContent = 'Explanation';
  const expBody = document.createElement('div');
  expBody.appendChild(buildRichTextBody(q.explanation || '', { inline: true }));
  panel.appendChild(h4a);
  panel.appendChild(expBody);

  const h4b = document.createElement('h4');
  h4b.textContent = 'Why each option is right / wrong';
  const ul = document.createElement('ul');
  ul.className = 'opt-notes';
  q.options.forEach((opt, i) => {
    const li = document.createElement('li');
    if (i === q.answer) li.classList.add('is-correct');
    const key = document.createElement('span');
    key.className = 'opt-key mono';
    key.textContent = String.fromCharCode(65 + i) + '.';
    const txt = document.createElement('span');
    txt.appendChild(buildRichTextBody((q.optionNotes && q.optionNotes[i]) || '', { inline: true }));
    li.appendChild(key);
    li.appendChild(txt);
    ul.appendChild(li);
  });
  panel.appendChild(h4b);
  panel.appendChild(ul);
  return panel;
}

/* ---------------------------------------------------------
   Question card — one renderer, three modes: browse / test / review
   --------------------------------------------------------- */
function renderQuestionCard(q, mode, extra = {}) {
  const card = document.createElement('div');
  card.className = 'q-card';
  card.dataset.qid = q.id;

  const unitName = unitMap[q.unit] || ('Unit ' + q.unit);
  const uVar = `var(--u${q.unit})`;

  const meta = document.createElement('div');
  meta.className = 'q-meta';
  meta.innerHTML = `
    <span class="tag">${escapeHTML(q.year)}</span>
    <span class="tag">${escapeHTML(q.session)}</span>
    ${q.subject ? `<span class="tag tag-subject">${escapeHTML(q.subject)}</span>` : ''}
    <span class="tag"><span class="dot" style="background:${uVar}"></span>${escapeHTML(unitName)}</span>
    <span class="q-id mono">${escapeHTML(q.id)}</span>`;
  card.appendChild(meta);

  const qText = document.createElement('div');
  qText.className = 'q-text';
  qText.appendChild(buildRichTextBody(q.question, { inline: true }));
  card.appendChild(qText);

  const optionsWrap = document.createElement('div');
  optionsWrap.className = 'options';

  const browseEntry = mode === 'browse' ? getBrowseEntry(q.id) : null;
  const testAnswer = mode === 'test' ? State.test.answers[extra.index] : null;
  const reviewAnswer = mode === 'review' ? extra.userAnswer : null;

  q.options.forEach((optText, i) => {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'option';
    opt.dataset.idx = String(i);

    let badgeText = '';
    if (mode === 'browse') {
      if (browseEntry.selected === i) opt.classList.add('selected');
      if (browseEntry.revealed) {
        opt.classList.add('disabled');
        if (i === q.answer) { opt.classList.add('reveal-correct'); badgeText = '✓ Correct'; }
        else if (i === browseEntry.selected) { opt.classList.add('reveal-incorrect'); badgeText = '✗ Your pick'; }
      }
    } else if (mode === 'test') {
      if (testAnswer === i) opt.classList.add('selected');
    } else if (mode === 'review') {
      opt.classList.add('disabled');
      if (i === q.answer) { opt.classList.add('reveal-correct'); badgeText = '✓ Correct'; }
      else if (i === reviewAnswer) { opt.classList.add('reveal-incorrect'); badgeText = '✗ Your answer'; }
    }

    const key = document.createElement('span');
    key.className = 'opt-key mono';
    key.textContent = String.fromCharCode(65 + i);
    const txt = document.createElement('span');
    txt.textContent = optText;
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = badgeText;

    opt.appendChild(key);
    opt.appendChild(txt);
    opt.appendChild(badge);
    optionsWrap.appendChild(opt);
  });
  card.appendChild(optionsWrap);

  if (mode === 'browse') {
    optionsWrap.addEventListener('click', (e) => {
      const optEl = e.target.closest('.option');
      if (!optEl || optEl.classList.contains('disabled')) return;
      browseEntry.selected = Number(optEl.dataset.idx);
      rerenderBrowseCard(q);
    });

    const actions = document.createElement('div');
    actions.className = 'q-actions';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline';
    btn.textContent = browseEntry.revealed ? 'Hide Answer' : 'Show Answer';
    btn.addEventListener('click', () => {
      browseEntry.revealed = !browseEntry.revealed;
      rerenderBrowseCard(q);
    });
    actions.appendChild(btn);
    card.appendChild(actions);

    const panel = buildExplainPanel(q);
    if (!browseEntry.revealed) panel.classList.add('hidden');
    card.appendChild(panel);
  }

  if (mode === 'test') {
    optionsWrap.addEventListener('click', (e) => {
      const optEl = e.target.closest('.option');
      if (!optEl) return;
      State.test.answers[extra.index] = Number(optEl.dataset.idx);
      renderCurrentTestQuestion();
    });
  }

  if (mode === 'review') {
    card.appendChild(buildExplainPanel(q));
  }

  return card;
}

function rerenderBrowseCard(q) {
  const old = document.querySelector(`.q-card[data-qid="${CSS.escape(q.id)}"]`);
  if (!old) return;
  old.replaceWith(renderQuestionCard(q, 'browse'));
}

/* ---------------------------------------------------------
   Sidebar filters
   --------------------------------------------------------- */
function buildFilterUI() {
  const years = [...new Set(State.allQuestions.map(q => q.year))].sort((a, b) => b - a);
  const yearBody = document.getElementById('yearFilterBody');
  yearBody.innerHTML = years.map(y => {
    const cnt = State.allQuestions.filter(q => q.year === y).length;
    return `<label class="check-row"><input type="checkbox" data-group="year" value="${y}" checked>${y}<span class="count">${cnt}</span></label>`;
  }).join('');
  years.forEach(y => State.filters.years.add(y));

  const sessions = [...new Set(State.allQuestions.map(q => q.session))].sort();
  const sessionBody = document.getElementById('sessionFilterBody');
  sessionBody.innerHTML = sessions.map(s => {
    const cnt = State.allQuestions.filter(q => q.session === s).length;
    return `<label class="check-row"><input type="checkbox" data-group="session" value="${escapeHTML(s)}" checked>${escapeHTML(s)}<span class="count">${cnt}</span></label>`;
  }).join('');
  sessions.forEach(s => State.filters.sessions.add(s));

  const subjects = [...new Set(State.allQuestions.map(q => q.subject))].sort();
  const subjectBody = document.getElementById('subjectFilterBody');
  subjectBody.innerHTML = subjects.map(s => {
    const cnt = State.allQuestions.filter(q => q.subject === s).length;
    return `<label class="check-row"><input type="checkbox" data-group="subject" value="${escapeHTML(s)}" checked>${escapeHTML(s)}<span class="count">${cnt}</span></label>`;
  }).join('');
  subjects.forEach(s => State.filters.subjects.add(s));

  const unitBody = document.getElementById('unitFilterBody');
  unitBody.innerHTML = State.manifest.units.map(u => {
    const cnt = State.allQuestions.filter(q => q.unit === u.id).length;
    return `<label class="check-row"><input type="checkbox" data-group="unit" value="${u.id}" checked><span class="dot" style="background:var(--u${u.id})"></span>${escapeHTML(u.name)}<span class="count">${cnt}</span></label>`;
  }).join('');
  State.manifest.units.forEach(u => State.filters.units.add(u.id));

  document.querySelectorAll('#yearFilterBody input, #sessionFilterBody input, #subjectFilterBody input, #unitFilterBody input')
    .forEach(cb => cb.addEventListener('change', onFilterCheckboxChange));

  document.querySelectorAll('[data-selectall]').forEach(cb => cb.addEventListener('change', onSelectAllChange));
  syncAllSelectAllCheckboxes();
}

function onFilterCheckboxChange(e) {
  const group = e.target.dataset.group; // year | session | subject | unit
  const setRef = State.filters[group + 's'];
  const val = (group === 'year' || group === 'unit') ? Number(e.target.value) : e.target.value;
  if (e.target.checked) setRef.add(val); else setRef.delete(val);
  syncSelectAllCheckbox(group);
  renderBrowseList();
}

/* "Select all" checkbox in each filter header — checks/unchecks every
   option in that section, and reflects the section's current state. */
function groupBodyId(group) {
  return { year: 'yearFilterBody', session: 'sessionFilterBody', subject: 'subjectFilterBody', unit: 'unitFilterBody' }[group];
}

function onSelectAllChange(e) {
  const group = e.target.dataset.selectall;
  const checked = e.target.checked;
  const boxes = document.querySelectorAll(`#${groupBodyId(group)} input[type="checkbox"]`);
  const setRef = State.filters[group + 's'];
  boxes.forEach(cb => {
    cb.checked = checked;
    const val = (group === 'year' || group === 'unit') ? Number(cb.value) : cb.value;
    if (checked) setRef.add(val); else setRef.delete(val);
  });
  renderBrowseList();
}

function syncSelectAllCheckbox(group) {
  const boxes = [...document.querySelectorAll(`#${groupBodyId(group)} input[type="checkbox"]`)];
  const allEl = document.querySelector(`[data-selectall="${group}"]`);
  if (!allEl || !boxes.length) return;
  const checkedCount = boxes.filter(cb => cb.checked).length;
  allEl.checked = checkedCount === boxes.length;
  allEl.indeterminate = checkedCount > 0 && checkedCount < boxes.length;
}

function syncAllSelectAllCheckboxes() {
  ['year', 'session', 'subject', 'unit'].forEach(syncSelectAllCheckbox);
}

function resetFilters() {
  document.querySelectorAll('#yearFilterBody input, #sessionFilterBody input, #subjectFilterBody input, #unitFilterBody input')
    .forEach(cb => { cb.checked = true; });
  State.filters.years = new Set(State.allQuestions.map(q => q.year));
  State.filters.sessions = new Set(State.allQuestions.map(q => q.session));
  State.filters.subjects = new Set(State.allQuestions.map(q => q.subject));
  State.filters.units = new Set(State.manifest.units.map(u => u.id));
  document.getElementById('searchBox').value = '';
  State.filters.search = '';
  syncAllSelectAllCheckboxes();
  renderBrowseList();
}

/* ---------------------------------------------------------
   Browse view
   --------------------------------------------------------- */
function applyFilters() {
  const f = State.filters;
  return State.allQuestions.filter(q => {
    if (!f.years.has(q.year)) return false;
    if (!f.sessions.has(q.session)) return false;
    if (!f.subjects.has(q.subject)) return false;
    if (!f.units.has(q.unit)) return false;
    if (f.search) {
      const hay = (q.question + ' ' + (q.passage || '')).toLowerCase();
      if (!hay.includes(f.search)) return false;
    }
    return true;
  });
}

function renderBrowseList() {
  const list = applyFilters();
  document.getElementById('resultCount').textContent =
    `Showing ${list.length} of ${State.allQuestions.length} questions`;

  const container = document.getElementById('questionList');
  container.innerHTML = '';

  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><h3>No questions match these filters</h3>
      <p>Try widening your Year, Session or Unit selection, or clearing the search box.</p></div>`;
    return;
  }

  let lastPassage = null;
  list.forEach(q => {
    if (q.passage && q.passage !== lastPassage) container.appendChild(passageBoxEl(q.passage));
    lastPassage = q.passage || null;
    container.appendChild(renderQuestionCard(q, 'browse'));
  });
}

/* ---------------------------------------------------------
   Practice test — config
   --------------------------------------------------------- */
function chipHTML(group, value, label, dotColor) {
  const dot = dotColor ? `<span class="dot" style="width:8px;height:8px;border-radius:50%;background:${dotColor}"></span>` : '';
  return `<label class="chip checked"><input type="checkbox" data-group="${group}" value="${value}" checked>${dot}${escapeHTML(String(label))}</label>`;
}

function getCheckedChipValues(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)].map(i => i.value);
}

function buildTestConfigUI() {
  const years = [...new Set(State.allQuestions.map(q => q.year))].sort((a, b) => b - a);
  document.getElementById('testYearChips').innerHTML =
    years.map(y => chipHTML('testYear', y, y)).join('') ||
    `<span style="color:var(--text-faint);font-size:13px;">No data loaded yet.</span>`;

  document.getElementById('customUnitChips').innerHTML =
    State.manifest.units.map(u => chipHTML('customUnit', u.id, u.name, `var(--u${u.id})`)).join('');

  document.querySelectorAll('#testYearChips input, #customUnitChips input').forEach(inp => {
    inp.addEventListener('change', () => inp.closest('.chip').classList.toggle('checked', inp.checked));
  });
}

function getPool() {
  const years = getCheckedChipValues('testYearChips').map(Number);
  return State.allQuestions.filter(q => years.includes(q.year));
}

function startFullMock() {
  const pool = getPool();
  const qs = [];
  State.manifest.units.forEach(u => {
    const bucket = shuffle(pool.filter(q => q.unit === u.id));
    qs.push(...bucket.slice(0, 5));
  });
  if (!qs.length) { alert('No questions available for the selected year(s) yet. Add some data first!'); return; }
  startTest(shuffle(qs));
}

function startCustom() {
  const pool = getPool();
  const units = getCheckedChipValues('customUnitChips').map(Number);
  const count = Math.max(1, parseInt(document.getElementById('customCount').value, 10) || 20);
  const candidates = shuffle(pool.filter(q => units.includes(q.unit)));
  const qs = candidates.slice(0, count);
  if (!qs.length) { alert('No questions match the selected units/years yet.'); return; }
  startTest(qs);
}

/* ---------------------------------------------------------
   Practice test — run
   --------------------------------------------------------- */
function startTest(questions) {
  State.test = {
    questions,
    answers: new Array(questions.length).fill(null),
    current: 0,
    startTime: Date.now(),
    timerInterval: null,
    finished: false
  };
  switchView('testRunView');
  renderCurrentTestQuestion();
  startTimer();
}

function renderCurrentTestQuestion() {
  const t = State.test;
  const idx = t.current;
  const q = t.questions[idx];

  document.getElementById('qPos').textContent = idx + 1;
  document.getElementById('qTotal').textContent = t.questions.length;

  const holder = document.getElementById('testQuestionHolder');
  holder.innerHTML = '';
  if (q.passage) holder.appendChild(passageBoxEl(q.passage));
  holder.appendChild(renderQuestionCard(q, 'test', { index: idx }));

  document.getElementById('prevQ').disabled = idx === 0;
  document.getElementById('nextQ').textContent = idx === t.questions.length - 1 ? 'Finish →' : 'Next →';

  updateQnavGrid();
}

function updateQnavGrid() {
  const t = State.test;
  const grid = document.getElementById('qnavGrid');
  grid.innerHTML = '';
  t.questions.forEach((q, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'qnav-btn' + (t.answers[i] != null ? ' answered' : '') + (i === t.current ? ' current' : '');
    b.textContent = String(i + 1);
    b.addEventListener('click', () => { t.current = i; renderCurrentTestQuestion(); });
    grid.appendChild(b);
  });
}

function startTimer() {
  const el = document.getElementById('testTimer');
  clearInterval(State.test.timerInterval);
  State.test.timerInterval = setInterval(() => {
    const secs = Math.floor((Date.now() - State.test.startTime) / 1000);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    el.textContent = `${mm}:${ss}`;
  }, 1000);
}

function submitTest() {
  clearInterval(State.test.timerInterval);
  State.test.finished = true;
  State.test.elapsedMs = Date.now() - State.test.startTime;
  renderResults();
  switchView('testResultView');
}

/* ---------------------------------------------------------
   Practice test — results
   --------------------------------------------------------- */
function renderResults() {
  const t = State.test;
  let correct = 0, incorrect = 0, unanswered = 0;
  const unitStats = {};

  t.questions.forEach((q, i) => {
    const a = t.answers[i];
    if (a == null) unanswered++;
    else if (a === q.answer) correct++;
    else incorrect++;
    unitStats[q.unit] = unitStats[q.unit] || { correct: 0, total: 0 };
    unitStats[q.unit].total++;
    if (a === q.answer) unitStats[q.unit].correct++;
  });

  const total = t.questions.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const mins = Math.floor(t.elapsedMs / 60000);
  const secs = Math.floor((t.elapsedMs % 60000) / 1000);

  document.getElementById('scoreCard').innerHTML = `
    <div class="score-big">${pct}<span>%</span></div>
    <div class="score-stats">
      <div class="score-stat stat-correct"><b>${correct}</b>Correct</div>
      <div class="score-stat stat-incorrect"><b>${incorrect}</b>Incorrect</div>
      <div class="score-stat"><b>${unanswered}</b>Unanswered</div>
      <div class="score-stat"><b>${total}</b>Total</div>
      <div class="score-stat"><b>${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}</b>Time taken</div>
    </div>`;

  const ub = document.getElementById('unitBreakdown');
  ub.innerHTML = '';
  Object.keys(unitStats).sort((a, b) => a - b).forEach(uid => {
    const st = unitStats[uid];
    const pctU = st.total ? Math.round((st.correct / st.total) * 100) : 0;
    const row = document.createElement('div');
    row.className = 'unit-bar-row';
    row.innerHTML = `<span class="u-name">${escapeHTML(unitMap[uid] || ('Unit ' + uid))}</span>
      <span class="unit-bar-track"><span class="unit-bar-fill" style="width:${pctU}%;"></span></span>
      <span class="u-frac">${st.correct}/${st.total}</span>`;
    ub.appendChild(row);
  });

  const rl = document.getElementById('reviewList');
  rl.innerHTML = '';
  let lastPassage = null;
  t.questions.forEach((q, i) => {
    if (q.passage && q.passage !== lastPassage) rl.appendChild(passageBoxEl(q.passage));
    lastPassage = q.passage || null;
    rl.appendChild(renderQuestionCard(q, 'review', { userAnswer: t.answers[i] }));
  });
}

/* ---------------------------------------------------------
   Mode tabs + static event wiring
   --------------------------------------------------------- */
function setTab(which) {
  document.getElementById('tabBrowse').classList.toggle('active', which === 'browse');
  document.getElementById('tabTest').classList.toggle('active', which === 'test');

  const showFilters = which === 'browse';
  document.getElementById('grpYear').classList.toggle('hidden', !showFilters);
  document.getElementById('grpSession').classList.toggle('hidden', !showFilters);
  document.getElementById('grpSubject').classList.toggle('hidden', !showFilters);
  document.getElementById('grpUnit').classList.toggle('hidden', !showFilters);
  document.querySelector('.sidebar-search').classList.toggle('hidden', !showFilters);

  switchView(which === 'browse' ? 'browseView' : 'testConfigView');
  closeSidebarOnMobile();
}

function wireStaticEvents() {
  document.getElementById('menuToggle').addEventListener('click', () => {
    const isOpen = document.getElementById('sidebar').classList.contains('open');
    setSidebarOpen(!isOpen);
  });
  document.getElementById('backdrop').addEventListener('click', closeSidebarOnMobile);

  document.querySelectorAll('.fg-title-btn').forEach(h => {
    h.addEventListener('click', () => document.getElementById(h.dataset.target).classList.toggle('collapsed'));
  });

  document.getElementById('tabBrowse').addEventListener('click', () => setTab('browse'));
  document.getElementById('tabTest').addEventListener('click', () => setTab('test'));

  let searchDebounce;
  document.getElementById('searchBox').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const val = e.target.value;
    searchDebounce = setTimeout(() => {
      State.filters.search = val.trim().toLowerCase();
      renderBrowseList();
    }, 150);
  });

  document.getElementById('resetFilters').addEventListener('click', resetFilters);

  document.getElementById('startFullMock').addEventListener('click', startFullMock);
  document.getElementById('startCustom').addEventListener('click', startCustom);

  document.getElementById('prevQ').addEventListener('click', () => {
    const t = State.test;
    if (t.current > 0) { t.current--; renderCurrentTestQuestion(); }
  });
  document.getElementById('nextQ').addEventListener('click', () => {
    const t = State.test;
    if (t.current < t.questions.length - 1) { t.current++; renderCurrentTestQuestion(); }
    else submitTest();
  });
  document.getElementById('submitTest').addEventListener('click', submitTest);

  document.getElementById('retakeTest').addEventListener('click', () => startTest(shuffle(State.test.questions.slice())));
  document.getElementById('backToSetup').addEventListener('click', () => switchView('testConfigView'));
}

/* ---------------------------------------------------------
   Init — load manifest + every year file it lists
   --------------------------------------------------------- */
async function init() {
  try {
    State.manifest = await fetchJSON('manifest.json');
  } catch (err) {
    document.getElementById('questionList').innerHTML = `<div class="empty-state">
      <h3>Could not load manifest.json</h3>
      <p>Serve this folder over HTTP (a local server or GitHub Pages) rather than opening index.html directly as a file, and make sure manifest.json exists.</p></div>`;
    return;
  }

  unitMap = {};
  State.manifest.units.forEach(u => { unitMap[u.id] = u.name; });

  const yearFiles = State.manifest.years || [];
  const results = await Promise.allSettled(yearFiles.map(y => fetchJSON(y.file)));
  State.allQuestions = [];
  results.forEach((r, idx) => {
    if (r.status === 'fulfilled' && r.value && Array.isArray(r.value.questions)) {
      const yearNum = r.value.year || yearFiles[idx].year;
      const fileSubject = r.value.subject || 'General Paper';
      r.value.questions.forEach(q => State.allQuestions.push({
        ...q,
        year: yearNum,
        subject: q.subject || fileSubject
      }));
    } else {
      console.warn('Could not load', yearFiles[idx].file, r.reason);
    }
  });

  document.getElementById('loadedStat').textContent =
    `${State.allQuestions.length} question(s) loaded across ${yearFiles.length} year file(s)`;

  buildFilterUI();
  buildTestConfigUI();
  renderBrowseList();
  wireStaticEvents();
}

document.addEventListener('DOMContentLoaded', init);