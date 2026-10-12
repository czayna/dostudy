import { get, post, del } from '../api.js';
import { $, $$, esc, fmt, empty, toast, busy } from '../ui.js';
import { state, subjectName, subjectColor } from '../state.js';
import { percentToGrade } from '../gwa-math.js';

export const meta = { title: 'Practice Tests', sub: 'Realistic questions with a plain-English reason for every option.' };
const LEVEL = ['', '🌱 Warm-up', '📘 Standard', '🔥 Tricky'];
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export async function render(root, { arg }) {
  if (arg) return take(root, Number(arg));
  const list = await get('/tests');
  if (!list.length) { root.innerHTML = empty('📝', 'No practice tests yet. Upload a file and build one.', '<br><a class="btn" href="#/files">Upload a file</a>'); return; }
  root.innerHTML = `<div class="grid cols-2">${list.map((t) => `<div class="card subject-card" style="--accent:${subjectColor(t.subject_id)}"><span class="pill">${esc(subjectName(t.subject_id))}</span>
    <h2 style="margin:8px 0">${esc(t.title)}</h2><p class="muted">${t.questions} questions · ${t.attempts} attempt(s)${t.best != null ? ` · best ${fmt(t.best, 0)}%` : ''}</p>
    <div class="row" style="margin-top:12px"><a class="btn" href="#/tests/${t.id}">${t.attempts ? 'Try again' : 'Start'}</a><button class="btn danger small" data-del="${t.id}">Delete</button></div></div>`).join('')}</div>`;
  $$('[data-del]', root).forEach((b) => (b.onclick = async () => { if (confirm('Delete this test?')) { await del(`/tests/${b.dataset.del}`); render(root, {}); } }));
}

async function take(root, id) {
  const t = await get(`/tests/${id}`);
  const qs = t.questions;
  let i = 0, score = 0, checked = false; const weak = new Set(); const missed = [];

  const check = (q, given) => {
    if (q.type === 'mcq') return given === q.answer;
    if (q.type === 'tf') return given === q.answer;
    const g = norm(given); return Boolean(g) && [q.answer, ...(q.accept || [])].some((a) => norm(a) === g);
  };

  const draw = () => {
    const q = qs[i]; checked = false;
    root.innerHTML = `<div class="stack"><div class="row spread"><a href="#/tests">← Exit</a><span class="muted">Question ${i + 1} of ${qs.length} · ${LEVEL[q.level]}</span></div>
      <div class="bar"><span style="width:${(i / qs.length) * 100}%"></span></div>
      <div class="card stack"><span class="pill">${esc(q.topic || 'General')}</span><h2>${esc(q.question)}</h2><div id="ans">${answerUi(q)}</div><div id="fb"></div></div></div>`;
    wire(q);
  };

  const answerUi = (q) => {
    if (q.type === 'mcq') return q.options.map((o, n) => `<button class="opt" data-o="${n}"><strong>${'ABCDEF'[n]}.</strong> ${esc(o)}</button>`).join('');
    if (q.type === 'tf') return `<p class="muted">True or false?</p><button class="opt" data-o="true">✅ True</button><button class="opt" data-o="false">❌ False</button>`;
    return `<input id="idin" placeholder="Type your answer…" autocomplete="off" /><div class="row" style="margin-top:10px"><button class="btn" id="idgo">Check answer</button></div>`;
  };

  const wire = (q) => {
    if (q.type === 'id') {
      const go = () => finish(q, $('#idin', root).value); $('#idgo', root).onclick = go;
      $('#idin', root).onkeydown = (e) => { if (e.key === 'Enter') go(); }; $('#idin', root).focus(); return;
    }
    $$('.opt', root).forEach((b) => (b.onclick = () => finish(q, q.type === 'tf' ? b.dataset.o === 'true' : +b.dataset.o)));
  };

  const finish = (q, given) => {
    if (checked) return; checked = true;
    const ok = check(q, given);
    if (ok) score++; else { weak.add(q.topic || 'General'); missed.push(q); }
    let extra = '';
    if (q.type === 'mcq') {
      $$('.opt', root).forEach((b, n) => { b.disabled = true; b.classList.toggle('right', n === q.answer); b.classList.toggle('wrong', n === given && n !== q.answer); b.classList.toggle('picked', n === given); if (q.explanations[n]) b.insertAdjacentHTML('beforeend', `<span class="why">${esc(q.explanations[n])}</span>`); });
    } else if (q.type === 'tf') {
      $$('.opt', root).forEach((b) => { const v = b.dataset.o === 'true'; b.disabled = true; b.classList.toggle('right', v === q.answer); b.classList.toggle('wrong', v === given && v !== q.answer); });
      extra = `<div class="callout">${esc(q.explanation)}</div>`;
    } else {
      $('#idin', root).disabled = true; $('#idgo', root).hidden = true;
      extra = `<div class="callout ${ok ? 'good' : 'warn'}">Answer: <strong>${esc(q.answer)}</strong><br>${esc(q.explanation)}</div>`;
    }
    $('#fb', root).innerHTML = `<div class="callout ${ok ? 'good' : 'bad'}"><strong>${ok ? '✅ Correct! Nice one.' : '❌ Not quite. That is okay, this is how we learn.'}</strong></div>${extra}
      <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn" id="nx">${i === qs.length - 1 ? 'See my result' : 'Next question →'}</button></div>`;
    $('#nx', root).onclick = () => { i++; i < qs.length ? draw() : result(); };
    $('#nx', root).focus();
  };

  const result = async () => {
    const pct = (score / qs.length) * 100;
    try { await post(`/tests/${id}/attempts`, { score, total: qs.length, weakTopics: [...weak] }); } catch (e) { toast(e.message, 'bad'); }
    root.innerHTML = `<div class="stack"><div class="card" style="text-align:center"><div class="big" style="font-size:44px">${pct >= 94 ? '🏆' : pct >= 80 ? '🌟' : '🌱'}</div>
      <div class="stat"><div class="num">${score} / ${qs.length}</div><div class="label">${fmt(pct, 0)}% · about a ${fmt(percentToGrade(pct))} on the usual scale</div></div>
      <p style="margin-top:10px">${pct >= 94 ? 'That is 1.35-GWA level. Keep this up!' : 'Every mistake you read the explanation for is a point you will not lose in the real exam. 💪'}</p></div>
      ${weak.size ? `<div class="card"><h2>Review these topics</h2><div class="row" style="margin-top:10px">${[...weak].map((w) => `<span class="pill warn">${esc(w)}</span>`).join('')}</div></div>` : ''}
      ${missed.length ? `<div class="card"><h2>What you missed</h2>${missed.map((q) => `<div class="section" style="margin-top:10px"><strong>${esc(q.question)}</strong><br><span class="muted">Right answer: ${esc(q.type === 'mcq' ? q.options[q.answer] : String(q.answer))}</span></div>`).join('')}</div>` : ''}
      <div class="row"><a class="btn" href="#/tests/${id}" id="again">Try again</a><a class="btn ghost" href="#/tests">All tests</a><a class="btn ghost" href="#/tutor?tab=chat">Ask my tutor about the hard parts</a></div></div>`;
    $('#again', root).onclick = (e) => { e.preventDefault(); take(root, id); };
  };
  draw();
}
