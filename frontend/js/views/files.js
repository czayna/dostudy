import { get, post, del, api } from '../api.js';
import { $, $$, esc, fmtSize, empty, openModal, toast, busy, routeParams } from '../ui.js';
import { state, reloadSubjects, subjectOptions, subjectName, subjectColor } from '../state.js';

export const meta = { title: 'Upload & Build', sub: 'Drop a file. DOSTUDY turns it into a reviewer, flashcards and practice tests.' };
const ICON = (mime) => (mime.includes('pdf') ? '📕' : mime.startsWith('image') ? '🖼️' : mime.includes('presentation') ? '📊' : '📄');

export async function render(root) {
  await reloadSubjects();
  if (!state.subjects.length) { root.innerHTML = empty('📤', 'Create a subject first so your files have a folder to live in.', '<br><a class="btn" href="#/subjects">Add a subject</a>'); return; }
  let subjectId = Number(routeParams().subject) || state.subjects[0].id;

  const draw = async () => {
    const [files, reviewers] = await Promise.all([get('/files'), get('/reviewers')]);
    const rev = new Map(reviewers.map((r) => [r.file_id, r.id]));
    const shown = files.filter((f) => f.subject_id === subjectId);
    root.innerHTML = `<div class="stack">
      <div class="card"><div class="field" style="max-width:340px"><label for="subj">Subject folder</label><select id="subj">${subjectOptions(subjectId)}</select></div></div>
      <div class="dropzone" id="dz" tabindex="0" role="button" aria-label="Upload files"><div class="big">🌷</div><h2>Drop files here or click to browse</h2>
        <p class="muted">PDF, DOCX, PPTX, TXT, MD, PNG, JPG. Up to 25 MB each (PDFs/images up to ~14 MB for the AI).</p><input type="file" id="fi" multiple hidden accept=".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp" /></div>
      <div class="card"><h2>Files in ${esc(subjectName(subjectId))}</h2><div id="list" style="margin-top:6px">${shown.length ? shown.map((f) => row(f, rev.get(f.id))).join('') : '<p class="muted" style="margin-top:8px">No files yet. Drop one above. 📎</p>'}</div></div>
      <div class="callout">💡 The reviewer reads <strong>the whole file</strong> topic by topic, so it can take 1–3 minutes for big files. You can leave this page open and get a coffee. ☕</div></div>`;

    $('#subj', root).onchange = (e) => { subjectId = Number(e.target.value); draw(); };
    const dz = $('#dz', root), fi = $('#fi', root);
    dz.onclick = () => fi.click();
    dz.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } };
    fi.onchange = () => { upload(fi.files); fi.value = ''; };
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', (e) => upload(e.dataTransfer.files));
    $$('[data-act]', root).forEach((b) => (b.onclick = () => act(b)));
  };

  const upload = async (fileList) => {
    if (!fileList.length) return;
    const fd = new FormData();
    [...fileList].forEach((f) => fd.append('files', f));
    toast('Uploading…');
    try {
      const r = await api('POST', `/subjects/${subjectId}/files`, fd);
      toast(`Added ${r.saved.length} file(s). Now press "Build everything" ✨`, 'good');
      r.rejected.forEach((x) => toast(`${x.name}: ${x.reason}`, 'bad'));
    } catch (e) { toast(e.message, 'bad'); }
    draw();
  };

  const act = async (btn) => {
    const id = btn.dataset.id, kind = btn.dataset.act;
    const actions = {
      reviewer: () => post(`/files/${id}/reviewer`).then((r) => toast(`Reviewer ready: ${r.topics ? r.topics.length : 0} topics 📖`, 'good')),
      cards: () => post(`/files/${id}/flashcards`).then((r) => toast(`${r.added} new flashcards 🗂️`, 'good')),
      test: () => post(`/files/${id}/tests`, { count: 20 }).then((r) => toast(`Practice test ready: ${r.questions} questions 📝`, 'good')),
      recite: () => post(`/files/${id}/recitation`).then(showRecitation),
      del: async () => { if (confirm('Delete this file and everything generated from it?')) { await del(`/files/${id}`); toast('File deleted.'); } },
    };
    actions.all = async () => {
      await actions.reviewer();
      await actions.cards();
      await actions.test();
    };
    const labels = { reviewer: 'Writing reviewer…', cards: 'Making cards…', test: 'Writing test…', recite: 'Preparing…', all: 'Building everything…', del: 'Deleting…' };
    await busy(btn, labels[kind], actions[kind]);
    if (kind !== 'recite') draw();
  };
  await draw();
}

function row(f, reviewerId) {
  return `<div class="file-item"><span style="font-size:26px">${ICON(f.mime)}</span>
    <div style="flex:1;min-width:200px"><strong>${esc(f.name)}</strong><div class="muted small-text">${fmtSize(f.size)} · ${f.reviewers ? `<a href="#/reviewer/${reviewerId}">📖 reviewer</a>` : '📖 —'} · 🗂️ ${f.flashcards} cards · 📝 ${f.tests} tests</div></div>
    <div class="file-actions"><button class="btn small" data-act="all" data-id="${f.id}">✨ Build everything</button>
      <button class="btn ghost small" data-act="reviewer" data-id="${f.id}">Reviewer</button><button class="btn ghost small" data-act="cards" data-id="${f.id}">Flashcards</button>
      <button class="btn ghost small" data-act="test" data-id="${f.id}">Practice test</button><button class="btn ghost small" data-act="recite" data-id="${f.id}">🙋 Recitation card</button>
      <button class="btn danger small" data-act="del" data-id="${f.id}">Delete</button></div></div>`;
}

export function showRecitation(r) {
  openModal('🙋 Your Recitation Cheat Card', `<div class="stack">
    <p class="muted">Say these in class to show you are engaged. Put them in your own words. 💗</p>
    ${r.points.map((p) => `<div class="section"><h4>${esc(p.type)}</h4><div style="font-size:17px">“${esc(p.say_it)}”</div><div class="muted small-text" style="margin-top:6px">Why it works: ${esc(p.why_it_works)}</div></div>`).join('')}
    ${r.cold_call_answer ? `<div class="section hook"><h4>If the professor calls on you</h4><div style="font-size:17px">“${esc(r.cold_call_answer)}”</div></div>` : ''}
    <a class="btn" href="#/tutor?tab=voice&mode=recitation">Practice it out loud 🎙️</a></div>`);
}
