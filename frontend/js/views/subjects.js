import { post, put, del } from '../api.js';
import { $, $$, esc, fmt, empty, openModal, closeModal, toast, busy } from '../ui.js';
import { state, reloadSubjects, subjectById } from '../state.js';
import { analyze, percentToGrade, statusFor } from '../gwa-math.js';

export const meta = { title: 'Subjects', sub: 'One folder per class, so everything has a home.' };
const COLORS = ['#E0839C', '#F8B4C0', '#C9A0DC', '#9CC5E0', '#A8D5BA', '#F2C48D'];

export async function render(root) {
  await reloadSubjects();
  const list = state.subjects;
  root.innerHTML = `<div class="stack">
    <div class="row spread"><span class="muted">${list.length} subject(s)</span><button class="btn" id="add">+ Add subject</button></div>
    ${list.length ? `<div class="grid cols-2">${list.map(card).join('')}</div>` : empty('📁', 'No subjects yet. Create one folder per class.')}
  </div>`;
  $('#add', root).onclick = () => form();
  $$('[data-edit]', root).forEach((b) => (b.onclick = () => form(subjectById(b.dataset.edit))));
  $$('[data-del]', root).forEach((b) => (b.onclick = async () => {
    const s = subjectById(b.dataset.del);
    if (!confirm(`Delete "${s.name}" with all its files, reviewers, flashcards and tests? This only affects DOSTUDY.`)) return;
    await del(`/subjects/${s.id}`); toast('Subject deleted.'); render(root);
  }));
}

function card(s) {
  const a = analyze(s, state.goal), st = statusFor(a), c = s.counts;
  return `<div class="card subject-card" style="--accent:${s.color}">
    <div class="row spread"><h2>${esc(s.name)}</h2><span class="pill ${st.cls}">${st.text}</span></div>
    <p class="muted">${esc(s.teacher || 'No instructor set')} · ${s.units} unit(s)</p>
    <div class="row spread" style="margin:14px 0 6px"><span class="muted">Standing</span><strong>${a.standing === null ? '—' : `${fmt(a.standing, 1)}% (${fmt(percentToGrade(a.standing))})`}</strong></div>
    <div class="bar"><span style="width:${a.standing === null ? 0 : Math.min(100, a.standing)}%"></span></div>
    <p class="muted small-text" style="margin-top:12px">📎 ${c.files} files · 📖 ${c.reviewers} reviewers · 🗂️ ${c.flashcards} cards · 📝 ${c.tests} tests</p>
    <div class="row spread" style="margin-top:12px"><a class="btn ghost small" href="#/files?subject=${s.id}">Open files &amp; study tools</a>
      <span class="row"><button class="btn ghost small" data-edit="${s.id}">Edit</button><button class="btn danger small" data-del="${s.id}">Delete</button></span></div>
  </div>`;
}

function form(existing) {
  let color = existing?.color || COLORS[state.subjects.length % COLORS.length];
  openModal(existing ? 'Edit subject' : 'New subject', `<div class="stack" style="gap:12px">
    <div><label for="f-name">Subject name</label><input id="f-name" maxlength="120" placeholder="e.g. Financial Accounting" value="${esc(existing?.name || '')}" /></div>
    <div><label for="f-teacher">Instructor (optional)</label><input id="f-teacher" maxlength="120" value="${esc(existing?.teacher || '')}" /></div>
    <div><label for="f-units">Units</label><input id="f-units" type="number" min="1" max="10" value="${existing?.units || 3}" /></div>
    <div><label>Color</label><div class="swatches">${COLORS.map((c) => `<span class="swatch ${c === color ? 'sel' : ''}" data-c="${c}" style="background:${c}"></span>`).join('')}</div></div>
    <div class="row" style="justify-content:flex-end"><button class="btn ghost" id="f-cancel">Cancel</button><button class="btn" id="f-save">Save</button></div></div>`, (m) => {
    $$('.swatch', m).forEach((sw) => (sw.onclick = () => { color = sw.dataset.c; $$('.swatch', m).forEach((x) => x.classList.toggle('sel', x === sw)); }));
    $('#f-cancel', m).onclick = closeModal;
    $('#f-save', m).onclick = (e) => busy(e.target, 'Saving…', async () => {
      const name = $('#f-name', m).value.trim();
      if (!name) { $('#f-name', m).focus(); return; }
      const body = { name, teacher: $('#f-teacher', m).value.trim(), units: +$('#f-units', m).value || 3, color };
      existing ? await put(`/subjects/${existing.id}`, body) : await post('/subjects', body);
      closeModal(); await reloadSubjects(); location.hash = '#/subjects'; render($('#view'));
    });
    $('#f-name', m).focus();
  });
}
