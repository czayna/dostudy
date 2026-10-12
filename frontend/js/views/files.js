import { get, post, del, api } from '../api.js';
import { $, $$, esc, fmtSize, empty, openModal, toast, busy, routeParams } from '../ui.js';
import { state, reloadSubjects, subjectOptions, subjectName, subjectColor } from '../state.js';

export const meta = { title: 'Upload & Build', sub: 'Drop a file. DOSTUDY turns it into a reviewer, flashcards and practice tests.' };

export async function render(root) {
  await reloadSubjects();
  if (!state.subjects.length) {
    root.innerHTML = empty('', 'Create a subject first so your files have a folder to live in.', '<br><a class="btn" href="#/subjects">Add a subject</a>');
    return;
  }
  let subjectId = Number(routeParams().subject) || state.subjects[0].id;
  let autoBuildPref = localStorage.getItem('dostudy.autobuild') !== 'false';

  const draw = async () => {
    const [files, reviewers] = await Promise.all([get('/files'), get('/reviewers')]);
    const rev = new Map(reviewers.map((r) => [r.file_id, r.id]));
    const shown = files.filter((f) => f.subject_id === subjectId);
    const unbuiltCount = shown.filter((f) => !f.reviewers || !f.flashcards || !f.tests).length;

    root.innerHTML = `<div class="stack">
      <div class="card">
        <div class="row spread">
          <div class="field" style="max-width:340px">
            <label for="subj">Subject folder</label>
            <select id="subj">${subjectOptions(subjectId)}</select>
          </div>
          <div class="row" style="align-items:flex-end">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;margin:0">
              <input type="checkbox" id="autobuild-toggle" ${autoBuildPref ? 'checked' : ''} style="width:auto" />
              Auto-build all materials on upload
            </label>
          </div>
        </div>
      </div>

      <div class="dropzone" id="dz" tabindex="0" role="button" aria-label="Upload files">
        <h2>Drop files here or click to browse</h2>
        <p class="muted" style="margin-top:6px">PDF, DOCX, PPTX, TXT. Up to 25 MB each. Auto-build will extract topics, flashcards, and exams.</p>
        <input type="file" id="fi" multiple hidden accept=".pdf,.docx,.pptx,.txt,.md" />
      </div>

      <div class="card">
        <div class="row spread" style="margin-bottom:12px">
          <div>
            <h2>Files in ${esc(subjectName(subjectId))}</h2>
            <p class="muted small-text">${shown.length} file(s) in this subject folder</p>
          </div>
          ${shown.length && unbuiltCount > 0 ? `<button class="btn" id="build-all-subj">Build All Unfinished Files (${unbuiltCount})</button>` : ''}
        </div>
        <div id="list" style="margin-top:6px">
          ${shown.length ? shown.map((f) => row(f, rev.get(f.id))).join('') : '<p class="muted" style="margin-top:8px">No files in this subject yet. Drop your course material above.</p>'}
        </div>
      </div>

      <div class="callout">
        <strong>Automatic Comprehension</strong>: The reviewer reads the full document topic-by-topic so all exam topics are covered. Big files may take 1–2 minutes to process.
      </div>
    </div>`;

    $('#subj', root).onchange = (e) => { subjectId = Number(e.target.value); draw(); };
    
    const tog = $('#autobuild-toggle', root);
    if (tog) {
      tog.onchange = (e) => {
        autoBuildPref = e.target.checked;
        localStorage.setItem('dostudy.autobuild', String(autoBuildPref));
      };
    }

    const dz = $('#dz', root), fi = $('#fi', root);
    dz.onclick = () => fi.click();
    dz.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } };
    fi.onchange = () => { upload(fi.files); fi.value = ''; };
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', (e) => upload(e.dataTransfer.files));

    const buildAllBtn = $('#build-all-subj', root);
    if (buildAllBtn) {
      buildAllBtn.onclick = () => busy(buildAllBtn, 'Building all files…', async () => {
        for (const f of shown) {
          if (!f.reviewers || !f.flashcards || !f.tests) {
            toast(`Building ${f.name}…`);
            try {
              if (!f.reviewers) await post(`/files/${f.id}/reviewer`);
              if (!f.flashcards) await post(`/files/${f.id}/flashcards`);
              if (!f.tests) await post(`/files/${f.id}/tests`, { count: 15 });
            } catch (err) {
              toast(`Error on ${f.name}: ${err.message}`, 'bad');
            }
          }
        }
        toast('All files in subject built successfully!', 'good');
        draw();
      });
    }

    $$('[data-act]', root).forEach((b) => (b.onclick = () => act(b)));
  };

  const upload = async (fileList) => {
    if (!fileList.length) return;
    const fd = new FormData();
    [...fileList].forEach((f) => fd.append('files', f));
    toast('Uploading file(s)…');
    try {
      const r = await api('POST', `/subjects/${subjectId}/files`, fd);
      r.rejected.forEach((x) => toast(`${x.name}: ${x.reason}`, 'bad'));
      await draw();

      if (autoBuildPref && r.saved && r.saved.length) {
        for (const sf of r.saved) {
          toast(`Auto-building Reviewer, Flashcards & Practice Exam for "${sf.name}"…`, 'good');
          try {
            await post(`/files/${sf.id}/reviewer`);
            await post(`/files/${sf.id}/flashcards`);
            await post(`/files/${sf.id}/tests`, { count: 15 });
            toast(`"${sf.name}" is completely built and ready to study!`, 'good');
          } catch (err) {
            toast(`Auto-build error for ${sf.name}: ${err.message}`, 'bad');
          }
        }
        draw();
      } else {
        toast(`Added ${r.saved.length} file(s).`, 'good');
      }
    } catch (e) {
      toast(e.message, 'bad');
    }
    draw();
  };

  const act = async (btn) => {
    const id = btn.dataset.id, kind = btn.dataset.act;
    const actions = {
      reviewer: () => post(`/files/${id}/reviewer`).then((r) => toast(`Reviewer ready: ${r.topics ? r.topics.length : 0} topics`, 'good')),
      cards: () => post(`/files/${id}/flashcards`).then((r) => toast(`${r.added} new flashcards created`, 'good')),
      test: () => post(`/files/${id}/tests`, { count: 15 }).then((r) => toast(`Practice test ready: ${r.questions} questions`, 'good')),
      recite: () => post(`/files/${id}/recitation`).then(showRecitation),
      del: async () => { if (confirm('Delete this file and everything generated from it?')) { await del(`/files/${id}`); toast('File deleted.'); } },
    };
    actions.all = async () => {
      await actions.reviewer();
      await actions.cards();
      await actions.test();
    };
    const labels = {
      reviewer: 'Writing reviewer…',
      cards: 'Making flashcards…',
      test: 'Generating test questions…',
      recite: 'Preparing recitation…',
      all: 'Building everything…',
      del: 'Deleting…'
    };
    await busy(btn, labels[kind], actions[kind]);
    if (kind !== 'recite') draw();
  };

  await draw();
}

function row(f, reviewerId) {
  const isBuilt = f.reviewers > 0 && f.flashcards > 0 && f.tests > 0;
  return `<div class="file-item" style="display:flex;align-items:center;gap:14px;padding:12px;border-bottom:1px solid var(--border)">
    <div style="flex:1;min-width:220px">
      <strong>${esc(f.name)}</strong>
      <div class="muted small-text" style="margin-top:4px">
        ${fmtSize(f.size)} · 
        ${f.reviewers ? `<a href="#/reviewer/${reviewerId}" style="font-weight:600">Reviewer ready</a>` : '<span class="pill warn">No reviewer</span>'} · 
        ${f.flashcards ? `<span>${f.flashcards} cards</span>` : '<span class="pill warn">No cards</span>'} · 
        ${f.tests ? `<span>${f.tests} test(s)</span>` : '<span class="pill warn">No test</span>'}
      </div>
    </div>
    <div class="file-actions" style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn small" data-act="all" data-id="${f.id}" style="${!isBuilt ? 'font-weight:800' : ''}">
        ${!isBuilt ? 'Build everything' : 'Rebuild all'}
      </button>
      <button class="btn ghost small" data-act="reviewer" data-id="${f.id}">Reviewer</button>
      <button class="btn ghost small" data-act="cards" data-id="${f.id}">Flashcards</button>
      <button class="btn ghost small" data-act="test" data-id="${f.id}">Practice test</button>
      <button class="btn ghost small" data-act="recite" data-id="${f.id}">Recitation card</button>
      <button class="btn danger small" data-act="del" data-id="${f.id}">Delete</button>
    </div>
  </div>`;
}

export function showRecitation(r) {
  openModal('Your Recitation Cheat Card', `<div class="stack">
    <p class="muted">Say these in class to show you are engaged and boost your class standing.</p>
    ${r.points.map((p) => `<div class="section"><h4>${esc(p.type)}</h4><div style="font-size:17px">“${esc(p.say_it)}”</div><div class="muted small-text" style="margin-top:6px">Why it works: ${esc(p.why_it_works)}</div></div>`).join('')}
    ${r.cold_call_answer ? `<div class="section hook"><h4>If the professor calls on you</h4><div style="font-size:17px">“${esc(r.cold_call_answer)}”</div></div>` : ''}
    <a class="btn" href="#/tutor?tab=voice&mode=recitation">Practice it out loud</a></div>`);
}
