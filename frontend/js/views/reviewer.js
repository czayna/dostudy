import { get, post, del } from '../api.js';
import { $, $$, esc, md, empty, toast, busy } from '../ui.js';
import { state, subjectName, subjectColor } from '../state.js';

export const meta = { title: 'Reviewer', sub: 'Plain English. One small topic at a time. Ask again as many times as you need.' };

const gotKey = (id) => `dostudy.got.${id}`;
const loadGot = (id) => { try { return new Set(JSON.parse(localStorage.getItem(gotKey(id)) || '[]')); } catch { return new Set(); } };
const saveGot = (id, set) => localStorage.setItem(gotKey(id), JSON.stringify([...set]));

export async function render(root, { arg }) {
  if (arg) return openReviewer(root, Number(arg));
  const list = await get('/reviewers');
  if (!list.length) { root.innerHTML = empty('📖', 'No reviewers yet. Upload a file and press "Build everything".', '<br><a class="btn" href="#/files">Upload a file</a>'); return; }
  root.innerHTML = `<div class="grid cols-2">${list.map((r) => {
    const got = loadGot(r.id).size;
    return `<div class="card subject-card" style="--accent:${subjectColor(r.subject_id)}"><span class="pill">${esc(subjectName(r.subject_id))}</span>
      <h2 style="margin:8px 0">${esc(r.title)}</h2><p class="muted">${r.topics} topics · you marked ${got} as understood</p>
      <div class="bar" style="margin:10px 0"><span style="width:${(got / r.topics) * 100}%"></span></div>
      <div class="row"><a class="btn" href="#/reviewer/${r.id}">Open</a><button class="btn danger small" data-del="${r.id}">Delete</button></div></div>`;
  }).join('')}</div>`;
  $$('[data-del]', root).forEach((b) => (b.onclick = async () => { if (confirm('Delete this reviewer?')) { await del(`/reviewers/${b.dataset.del}`); render(root, {}); } }));
}

async function openReviewer(root, id) {
  const rv = await get(`/reviewers/${id}`);
  const got = loadGot(id);
  let idx = 0;

  const draw = () => {
    const t = rv.topics[idx];
    root.innerHTML = `<div class="stack">
      <div class="row spread no-print"><a href="#/reviewer">← All reviewers</a><span class="row"><button class="btn ghost small" id="print">🖨️ Print / Save PDF</button></span></div>
      <div class="card"><span class="pill">${esc(subjectName(rv.subject_id))}</span><h2 style="margin:8px 0">${esc(rv.title)}</h2>
        <details ${idx === 0 ? 'open' : ''}><summary style="cursor:pointer;font-weight:700">⏱️ The 2-minute big picture</summary><div class="prose" style="margin-top:10px">${md(rv.summary)}</div></details>
        <div class="bar" style="margin-top:14px"><span style="width:${(got.size / rv.topics.length) * 100}%"></span></div>
        <p class="muted small-text" style="margin-top:4px">${got.size} of ${rv.topics.length} topics understood. Take your time. 💗</p></div>
      <div class="reviewer-layout">
        <nav class="card toc no-print" aria-label="Topics">${rv.topics.map((x, i) => `<button class="${i === idx ? 'active' : ''}" data-go="${i}"><span>${i + 1}.</span><span>${esc(x.title)}</span><span class="tick">${got.has(i) ? '✅' : ''}</span></button>`).join('')}</nav>
        <div class="stack" id="topic">${topic(t, idx, rv.topics.length)}</div>
      </div></div>`;
    $('#print', root).onclick = () => window.print();
    $$('[data-go]', root).forEach((b) => (b.onclick = () => { idx = +b.dataset.go; draw(); }));
    wire();
  };

  const wire = () => {
    const t = rv.topics[idx];
    const go = (d) => { idx = Math.min(rv.topics.length - 1, Math.max(0, idx + d)); draw(); };
    $('#prev', root).onclick = () => go(-1);
    $('#next', root).onclick = () => go(1);
    $('#got', root).onclick = () => { got.has(idx) ? got.delete(idx) : got.add(idx); saveGot(id, got); if (got.has(idx) && idx < rv.topics.length - 1) idx++; draw(); };
    const rev = $('#reveal', root);
    if (rev) rev.onclick = () => { $('#answer', root).hidden = false; rev.hidden = true; };
    $$('[data-style]', root).forEach((b) => (b.onclick = () => busy(b, 'Thinking…', async () => {
      const r = await post(`/reviewers/${id}/reexplain`, { topicIndex: idx, style: b.dataset.style });
      (t.alternatives ||= []).push(r.explanation);
      draw();
      document.getElementById('alts')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    })));
    const ask = $('#ask', root);
    if (ask) ask.href = `#/tutor?tab=chat&file=${rv.file_id}&q=${encodeURIComponent(`I don't understand "${t.title}". Can you explain it step by step?`)}`;
  };
  draw();
}

function list(items, ordered) {
  if (!items?.length) return '';
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</${tag}>`;
}

function topic(t, i, total) {
  const sec = (cls, title, body) => (body ? `<div class="section ${cls}"><h4>${title}</h4>${body}</div>` : '');
  return `<div class="card stack" style="gap:14px"><h2>${i + 1}. ${esc(t.title)}</h2>
    ${sec('', '🎯 Why this matters', `<div class="prose">${md(t.why_it_matters)}</div>`)}
    ${sec('analogy', '💡 Think of it like this', `<div class="prose">${md(t.analogy)}</div>`)}
    ${sec('', '🧩 What it actually means', `<div class="prose">${md(t.plain_meaning)}</div>`)}
    ${sec('', '🔍 Step by step', list(t.steps, true))}
    ${t.key_terms.length ? sec('', '🗣️ Big words, translated', `<table>${t.key_terms.map((k) => `<tr><td style="width:34%"><strong>${esc(k.term)}</strong></td><td>= ${esc(k.simple)}</td></tr>`).join('')}</table>`) : ''}
    ${t.formulas.length ? sec('', '🧮 Formulas', t.formulas.map((f) => `<p><strong>${esc(f.name)}:</strong> <span class="formula">${esc(f.formula)}</span><br><span class="muted">${esc(f.plain)}</span></p>`).join('')) : ''}
    ${sec('memo', '📌 Must memorize', list(t.must_memorize, false))}
    ${sec('trap', '⚠️ Exam traps', list(t.exam_traps, false))}
    ${sec('hook', '🧠 Memory shortcut', `<div class="prose">${md(t.memory_hook)}</div>`)}
    ${t.check?.question ? sec('', '❓ 10-second self-check', `<p><strong>${esc(t.check.question)}</strong></p><button class="btn ghost small" id="reveal">Show answer</button><p id="answer" hidden style="margin-top:8px">✅ ${esc(t.check.answer)}</p>`) : ''}
    <div class="no-print"><div class="section" style="background:var(--bg-soft)"><h4>😵 I still don't get it</h4><p class="muted small-text" style="margin-bottom:10px">No problem! Pick how you want it explained again. You can press these as many times as you like.</p>
      <div class="row"><button class="btn ghost small" data-style="simpler">Even simpler</button><button class="btn ghost small" data-style="analogy">New analogy</button><button class="btn ghost small" data-style="steps">Super slow steps</button><button class="btn ghost small" data-style="example">Show examples</button><a class="btn ghost small" id="ask" href="#/tutor">Ask my tutor 🎙️</a></div></div></div>
    <div id="alts" class="stack tight">${(t.alternatives || []).map((a, n) => `<div class="alt-explain"><strong>Another way (#${n + 1})</strong><div class="prose" style="margin-top:6px">${md(a)}</div></div>`).join('')}</div>
    <div class="row spread no-print"><button class="btn ghost" id="prev" ${i === 0 ? 'disabled' : ''}>← Previous</button>
      <button class="btn" id="got">${'✅ I got this, next'}</button><button class="btn ghost" id="next" ${i === total - 1 ? 'disabled' : ''}>Next →</button></div></div>`;
}
