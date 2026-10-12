/* DOSTUDY — Sprint 1: Dashboard, Subject Folders, 1.35 GWA Goal, File Dropzone.
   Everything is stored locally in this browser (localStorage). Nothing is sent anywhere. */
(() => {
  'use strict';

  const STORE_KEY = 'dostudy.v1';
  const COLORS = ['#E0839C', '#F8B4C0', '#C9A0DC', '#9CC5E0', '#A8D5BA', '#F2C48D'];

  // Percent → Philippine grade (1.00 best, 5.00 fail). Edit here if your school differs.
  const GRADE_TABLE = [
    { min: 97, grade: 1.0 }, { min: 94, grade: 1.25 }, { min: 91, grade: 1.5 },
    { min: 88, grade: 1.75 }, { min: 85, grade: 2.0 }, { min: 82, grade: 2.25 },
    { min: 79, grade: 2.5 }, { min: 76, grade: 2.75 }, { min: 75, grade: 3.0 },
    { min: 0, grade: 5.0 },
  ];

  const uid = () => Math.random().toString(36).slice(2, 10);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);

  const defaultComponents = () => [
    { id: uid(), name: 'Quizzes', weight: 20, score: null },
    { id: uid(), name: 'Recitation / Participation', weight: 10, score: null },
    { id: uid(), name: 'Projects', weight: 20, score: null },
    { id: uid(), name: 'Midterm Exam', weight: 20, score: null },
    { id: uid(), name: 'Final Exam', weight: 30, score: null },
  ];

  let state = load();
  let view = 'dashboard';

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved && Array.isArray(saved.subjects)) return saved;
    } catch (_) { /* ignore corrupt data */ }
    return { goal: 1.35, subjects: [] };
  }
  const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(state));

  /* ---------- Grade math ---------- */
  const percentToGrade = (p) => GRADE_TABLE.find((r) => p >= r.min).grade;
  // Lowest percent that still gives a grade at or better than the goal.
  const targetPercent = () => {
    const ok = GRADE_TABLE.filter((r) => r.grade <= state.goal);
    return ok.length ? Math.min(...ok.map((r) => r.min)) : 97;
  };

  function analyze(subject) {
    const comps = subject.components;
    const totalWeight = comps.reduce((a, c) => a + (+c.weight || 0), 0);
    const done = comps.filter((c) => c.score !== null && c.score !== '' && !isNaN(c.score));
    const doneWeight = done.reduce((a, c) => a + (+c.weight || 0), 0);
    const earned = done.reduce((a, c) => a + (+c.score) * (+c.weight) / 100, 0); // points out of 100
    const remainingWeight = totalWeight - doneWeight;
    const target = targetPercent();
    const standing = doneWeight > 0 ? (earned / doneWeight) * 100 : null;
    let needed = null;
    if (remainingWeight > 0) needed = ((target - earned) / remainingWeight) * 100;
    return { totalWeight, doneWeight, earned, remainingWeight, target, standing, needed };
  }

  function overallGwa() {
    let units = 0, sum = 0;
    state.subjects.forEach((s) => {
      const a = analyze(s);
      if (a.standing === null) return;
      units += +s.units || 0;
      sum += percentToGrade(a.standing) * (+s.units || 0);
    });
    return units ? sum / units : null;
  }

  function statusFor(a) {
    if (a.standing === null) return { cls: '', text: 'No grades yet' };
    if (a.remainingWeight <= 0) {
      return a.earned >= a.target ? { cls: 'good', text: 'Goal reached ✓' } : { cls: 'bad', text: 'Final grade below goal' };
    }
    if (a.needed > 100) return { cls: 'bad', text: 'Needs rescue plan' };
    if (a.needed > 92) return { cls: 'warn', text: 'Tight — stay sharp' };
    return { cls: 'good', text: 'On track' };
  }

  const fmt = (n, d = 2) => (n === null || n === undefined || isNaN(n) ? '—' : Number(n).toFixed(d));
  const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

  /* ---------- Modal ---------- */
  function openModal(title, bodyHtml, onMount) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = bodyHtml;
    $('#modal').hidden = false;
    onMount && onMount($('#modal-body'));
  }
  const closeModal = () => { $('#modal').hidden = true; };
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  /* ---------- Views ---------- */
  const titles = {
    dashboard: ['Hi there 🌷', 'You are not behind. One small step today is enough.'],
    subjects: ['Your Subjects 📁', 'One folder per class, so everything has a home.'],
    gwa: ['GWA Goal 🎯', 'Enter your scores and see exactly what you need next.'],
    upload: ['Upload Files 📤', 'Drop your slides, PDFs, and docs into the right subject folder.'],
  };

  function render() {
    const [t, s] = titles[view];
    $('#page-title').textContent = t;
    $('#page-sub').textContent = s;
    $('#goal-chip').innerHTML = `Goal GWA <strong>${fmt(state.goal)}</strong>`;
    document.querySelectorAll('.nav-item[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    const root = $('#view');
    ({ dashboard: renderDashboard, subjects: renderSubjects, gwa: renderGwa, upload: renderUpload })[view](root);
  }

  function renderDashboard(root) {
    const gwa = overallGwa();
    const fileCount = state.subjects.reduce((a, s) => a + s.files.length, 0);
    let msg, cls = '';
    if (gwa === null) msg = 'Add your subjects and scores to see your GWA progress. 💗';
    else if (gwa <= state.goal) { msg = `You're at ${fmt(gwa)}, which is within your ${fmt(state.goal)} goal. Keep it up!`; cls = 'good'; }
    else { msg = `You're at ${fmt(gwa)}, a little above your ${fmt(state.goal)} goal. Check the GWA Goal page for what you need next.`; cls = 'warn'; }

    const attention = state.subjects
      .map((s) => ({ s, a: analyze(s) }))
      .filter(({ a }) => a.standing !== null && a.remainingWeight > 0 && a.needed > 92)
      .sort((x, y) => y.a.needed - x.a.needed);

    root.innerHTML = `
      <div class="stack">
        <div class="grid cols-3">
          <div class="card stat"><div class="num">${fmt(gwa)}</div><div class="label">Current GWA (goal ${fmt(state.goal)})</div></div>
          <div class="card stat"><div class="num">${state.subjects.length}</div><div class="label">Subjects</div></div>
          <div class="card stat"><div class="num">${fileCount}</div><div class="label">Files uploaded</div></div>
        </div>
        <div class="callout ${cls}">${esc(msg)}</div>
        <div class="card">
          <h2>Needs your attention</h2>
          ${attention.length ? `<div class="stack" style="margin-top:12px">${attention.map(({ s, a }) => `
            <div class="row spread"><span><strong>${esc(s.name)}</strong> <span class="muted">— needs about ${fmt(a.needed, 1)}% on the remaining work</span></span>
            <span class="pill ${a.needed > 100 ? 'bad' : 'warn'}">${a.needed > 100 ? 'Rescue plan' : 'Tight'}</span></div>`).join('')}</div>`
          : `<p class="muted" style="margin-top:8px">Nothing urgent. Enter scores in the GWA Goal page and any subject at risk will show up here.</p>`}
        </div>
        ${state.subjects.length ? '' : `<div class="card empty"><div class="big">🌸</div><p>Start by adding your first subject.</p><br/><button class="btn" id="go-add">Add a subject</button></div>`}
      </div>`;
    const b = $('#go-add');
    if (b) b.onclick = () => { view = 'subjects'; render(); openSubjectModal(); };
  }

  function renderSubjects(root) {
    root.innerHTML = `
      <div class="stack">
        <div class="row spread"><span class="muted">${state.subjects.length} subject(s)</span><button class="btn" id="add-subject">+ Add subject</button></div>
        ${state.subjects.length ? `<div class="grid cols-2">${state.subjects.map((s) => {
          const a = analyze(s), st = statusFor(a);
          return `<div class="card subject-card" style="--accent:${s.color}">
            <div class="row spread"><h2>${esc(s.name)}</h2><span class="pill ${st.cls}">${st.text}</span></div>
            <p class="muted">${esc(s.teacher || 'No instructor set')} · ${s.units} unit(s)</p>
            <div style="margin:14px 0 6px" class="row spread"><span class="muted">Standing</span><strong>${a.standing === null ? '—' : fmt(a.standing, 1) + '% (' + fmt(percentToGrade(a.standing)) + ')'}</strong></div>
            <div class="bar"><span style="width:${a.standing === null ? 0 : Math.min(100, a.standing)}%"></span></div>
            <div class="row spread" style="margin-top:14px"><span class="muted">📎 ${s.files.length} file(s)</span>
              <span class="row"><button class="btn ghost small" data-edit="${s.id}">Edit</button><button class="btn danger small" data-del="${s.id}">Delete</button></span></div>
          </div>`;
        }).join('')}</div>` : `<div class="card empty"><div class="big">📁</div><p>No subjects yet. Create one folder per class.</p></div>`}
      </div>`;
    $('#add-subject').onclick = () => openSubjectModal();
    root.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => openSubjectModal(b.dataset.edit)));
    root.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
      const s = state.subjects.find((x) => x.id === b.dataset.del);
      if (s && confirm(`Delete "${s.name}" and its grades and files list? This only affects DOSTUDY.`)) {
        state.subjects = state.subjects.filter((x) => x.id !== s.id); save(); render();
      }
    }));
  }

  function openSubjectModal(id) {
    const existing = id ? state.subjects.find((s) => s.id === id) : null;
    let color = existing ? existing.color : COLORS[state.subjects.length % COLORS.length];
    openModal(existing ? 'Edit subject' : 'New subject', `
      <div class="stack" style="gap:12px">
        <div><label for="f-name">Subject name</label><input id="f-name" placeholder="e.g. Financial Accounting" value="${existing ? esc(existing.name) : ''}" /></div>
        <div><label for="f-teacher">Instructor (optional)</label><input id="f-teacher" value="${existing ? esc(existing.teacher || '') : ''}" /></div>
        <div><label for="f-units">Units</label><input id="f-units" type="number" min="1" max="10" value="${existing ? existing.units : 3}" /></div>
        <div><label>Color</label><div class="swatches">${COLORS.map((c) => `<span class="swatch ${c === color ? 'sel' : ''}" data-c="${c}" style="background:${c}"></span>`).join('')}</div></div>
        <div class="row" style="justify-content:flex-end"><button class="btn ghost" id="f-cancel">Cancel</button><button class="btn" id="f-save">Save</button></div>
      </div>`, (m) => {
      m.querySelectorAll('.swatch').forEach((sw) => (sw.onclick = () => {
        color = sw.dataset.c; m.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('sel', x === sw));
      }));
      $('#f-cancel', m).onclick = closeModal;
      $('#f-save', m).onclick = () => {
        const name = $('#f-name', m).value.trim();
        if (!name) { $('#f-name', m).focus(); return; }
        const data = { name, teacher: $('#f-teacher', m).value.trim(), units: Math.max(1, +$('#f-units', m).value || 3), color };
        if (existing) Object.assign(existing, data);
        else state.subjects.push({ id: uid(), ...data, components: defaultComponents(), files: [] });
        save(); closeModal(); render();
      };
      $('#f-name', m).focus();
    });
  }

  function renderGwa(root) {
    const gwa = overallGwa(), target = targetPercent();
    root.innerHTML = `
      <div class="stack">
        <div class="grid cols-2">
          <div class="card"><h3>Your goal</h3>
            <div class="row" style="margin-top:10px"><div class="field"><label for="goal-input">Target GWA</label><input id="goal-input" type="number" step="0.05" min="1" max="3" value="${state.goal}" /></div></div>
            <p class="muted" style="margin-top:10px">With the grade table in use, a ${fmt(state.goal)} GWA means aiming for about <strong>${target}%</strong> or higher in each subject.</p></div>
          <div class="card stat"><div class="num">${fmt(gwa)}</div><div class="label">Projected GWA from entered scores</div></div>
        </div>
        ${state.subjects.length ? state.subjects.map(gwaCard).join('') : `<div class="card empty"><div class="big">🎯</div><p>Add a subject first, then enter your scores here.</p></div>`}
        <div class="callout">Leave a score empty if it hasn't happened yet. Enter scores as a percentage (0–100).</div>
      </div>`;
    $('#goal-input').onchange = (e) => {
      const v = parseFloat(e.target.value);
      if (v >= 1 && v <= 3) { state.goal = v; save(); render(); }
    };
    root.querySelectorAll('[data-comp]').forEach((inp) => (inp.onchange = () => {
      const [sid, cid, key] = inp.dataset.comp.split('|');
      const comp = state.subjects.find((s) => s.id === sid).components.find((c) => c.id === cid);
      if (key === 'score') {
        const v = inp.value.trim();
        comp.score = v === '' ? null : Math.min(100, Math.max(0, parseFloat(v) || 0));
      } else if (key === 'weight') comp.weight = Math.max(0, parseFloat(inp.value) || 0);
      else comp.name = inp.value.trim() || comp.name;
      save(); render();
    }));
    root.querySelectorAll('[data-addcomp]').forEach((b) => (b.onclick = () => {
      state.subjects.find((s) => s.id === b.dataset.addcomp).components.push({ id: uid(), name: 'New component', weight: 0, score: null });
      save(); render();
    }));
    root.querySelectorAll('[data-rmcomp]').forEach((b) => (b.onclick = () => {
      const [sid, cid] = b.dataset.rmcomp.split('|');
      const s = state.subjects.find((x) => x.id === sid);
      s.components = s.components.filter((c) => c.id !== cid); save(); render();
    }));
  }

  function gwaCard(s) {
    const a = analyze(s), st = statusFor(a);
    let advice = '';
    if (a.totalWeight !== 100) advice = `<div class="callout warn">Your weights add up to ${fmt(a.totalWeight, 0)}%, not 100%. Check them against your syllabus.</div>`;
    else if (a.standing === null) advice = `<div class="callout">Enter at least one score to see your standing.</div>`;
    else if (a.remainingWeight <= 0) advice = `<div class="callout ${a.earned >= a.target ? 'good' : 'bad'}">Final result: <strong>${fmt(a.earned, 1)}%</strong> (${fmt(percentToGrade(a.earned))}).</div>`;
    else if (a.needed > 100) advice = `<div class="callout bad"><strong>Rescue plan:</strong> you'd need ${fmt(a.needed, 1)}% on the remaining ${fmt(a.remainingWeight, 0)}% of the grade, which is more than 100%. Ask about extra credit, ace recitation, and talk to your instructor early. 💪</div>`;
    else advice = `<div class="callout ${a.needed > 92 ? 'warn' : 'good'}">To reach <strong>${a.target}%</strong> overall, you need an average of <strong>${fmt(Math.max(0, a.needed), 1)}%</strong> on the remaining ${fmt(a.remainingWeight, 0)}% of the grade.</div>`;
    return `<div class="card" style="border-left:6px solid ${s.color}">
      <div class="row spread"><h2>${esc(s.name)}</h2><span class="pill ${st.cls}">${st.text}</span></div>
      <table style="margin:12px 0"><thead><tr><th>Component</th><th style="width:100px">Weight %</th><th style="width:110px">Score %</th><th style="width:40px"></th></tr></thead><tbody>
        ${s.components.map((c) => `<tr>
          <td><input aria-label="Component name" data-comp="${s.id}|${c.id}|name" value="${esc(c.name)}" /></td>
          <td><input aria-label="Weight" type="number" min="0" max="100" data-comp="${s.id}|${c.id}|weight" value="${c.weight}" /></td>
          <td><input aria-label="Score" type="number" min="0" max="100" placeholder="—" data-comp="${s.id}|${c.id}|score" value="${c.score === null ? '' : c.score}" /></td>
          <td><button class="btn danger small" title="Remove" data-rmcomp="${s.id}|${c.id}">✕</button></td></tr>`).join('')}
      </tbody></table>
      <div class="row spread" style="margin-bottom:12px"><button class="btn ghost small" data-addcomp="${s.id}">+ Add component</button>
        <span class="muted">Standing: <strong>${a.standing === null ? '—' : fmt(a.standing, 1) + '%'}</strong></span></div>
      ${advice}</div>`;
  }

  function renderUpload(root) {
    if (!state.subjects.length) {
      root.innerHTML = `<div class="card empty"><div class="big">📤</div><p>Create a subject first so your files have a folder to live in.</p></div>`;
      return;
    }
    root.innerHTML = `
      <div class="stack">
        <div class="card"><div class="field" style="max-width:340px"><label for="up-subject">Save into subject</label>
          <select id="up-subject">${state.subjects.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div></div>
        <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="Upload files">
          <div class="big">🌷</div><h2>Drop files here or click to browse</h2>
          <p class="muted">PDF, DOCX, PPTX, images. Only the file name is saved for now; the AI reviewer arrives in Sprint 2.</p>
          <input type="file" id="file-input" multiple hidden />
        </div>
        <div class="card"><h2>Your files</h2><div id="file-list" style="margin-top:8px"></div></div>
      </div>`;
    const dz = $('#dropzone'), input = $('#file-input');
    const add = (files) => {
      const s = state.subjects.find((x) => x.id === $('#up-subject').value);
      [...files].forEach((f) => s.files.push({ id: uid(), name: f.name, size: f.size, added: new Date().toISOString() }));
      save(); renderFileList();
    };
    dz.onclick = () => input.click();
    dz.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
    input.onchange = () => { add(input.files); input.value = ''; };
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', (e) => add(e.dataTransfer.files));
    renderFileList();
  }

  function renderFileList() {
    const box = $('#file-list');
    const all = state.subjects.flatMap((s) => s.files.map((f) => ({ s, f })));
    if (!all.length) { box.innerHTML = `<p class="muted">No files yet.</p>`; return; }
    box.innerHTML = all.map(({ s, f }) => `<div class="file-item">
      <span>📄</span><div style="flex:1"><strong>${esc(f.name)}</strong><div class="muted" style="font-size:13px">${fmtSize(f.size)} · <span class="pill" style="background:${s.color}33">${esc(s.name)}</span></div></div>
      <button class="btn danger small" data-rmfile="${s.id}|${f.id}">Remove</button></div>`).join('');
    box.querySelectorAll('[data-rmfile]').forEach((b) => (b.onclick = () => {
      const [sid, fid] = b.dataset.rmfile.split('|');
      const s = state.subjects.find((x) => x.id === sid);
      s.files = s.files.filter((f) => f.id !== fid); save(); renderFileList();
    }));
  }

  /* ---------- Navigation ---------- */
  document.querySelectorAll('.nav-item[data-view]').forEach((b) => (b.onclick = () => { view = b.dataset.view; render(); }));
  render();
})();
