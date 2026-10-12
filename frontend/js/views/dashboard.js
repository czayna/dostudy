import { get, patch } from '../api.js';
import { $, $$, esc, fmt, empty, todayStr, addDaysStr, prettyDate, time12, toast } from '../ui.js';
import { state, subjectName, subjectColor } from '../state.js';
import { analyze, overallGwa, percentToGrade } from '../gwa-math.js';

export const meta = { title: 'Dashboard', sub: 'You are on track. One small step today is enough.' };

const TASK = { reviewer: ['📖', 'Read reviewer', '#/reviewer'], flashcards: ['🗂️', 'Flashcards', '#/flashcards'], practice: ['📝', 'Practice test', '#/tests'], recap: ['🌙', 'Light recap', '#/flashcards'] };

export async function render(root) {
  const today = todayStr();
  const [cardStats, events, blocks] = await Promise.all([
    get('/flashcards/stats'), get('/schedule/events'), get(`/schedule/blocks?from=${today}&to=${today}`),
  ]);
  const gwa = overallGwa(state.subjects, state.goal);
  const due = cardStats.reduce((a, s) => a + (s.due || 0), 0);
  const upcoming = events.filter((e) => e.date >= today && e.date <= addDaysStr(today, 21)).slice(0, 6);
  const attention = state.subjects.map((s) => ({ s, a: analyze(s, state.goal) }))
    .filter(({ a }) => a.standing !== null && a.remainingWeight > 0 && a.needed > 92).sort((x, y) => y.a.needed - x.a.needed);

  let msg = 'Add your subjects and scores to see your GWA progress. 💗', cls = '';
  if (gwa !== null) {
    if (gwa <= state.goal) { msg = `You're at ${fmt(gwa)}, which is within your ${fmt(state.goal)} goal. Keep it up!`; cls = 'good'; }
    else { msg = `You're at ${fmt(gwa)}, a little above your ${fmt(state.goal)} goal. The GWA Goal page shows what you need next.`; cls = 'warn'; }
  }

  root.innerHTML = `
  <div class="stack">
    <div class="grid cols-3">
      <div class="card stat"><div class="num">${fmt(gwa)}</div><div class="label">Projected GWA (goal ${fmt(state.goal)})</div></div>
      <div class="card stat"><div class="num">${due}</div><div class="label">Flashcards due now</div></div>
      <div class="card stat"><div class="num">${blocks.filter((b) => b.status !== 'skipped').length}</div><div class="label">Study sessions today</div></div>
    </div>
    <div class="callout ${cls}">${esc(msg)}</div>
    <div class="grid cols-2">
      <div class="card"><h2>Today's plan</h2><div id="today" class="stack tight" style="margin-top:12px">
        ${blocks.length ? blocks.map(blockRow).join('') : `<p class="muted">Nothing planned today. ${state.subjects.length ? 'Add an exam in <a href="#/schedule">Schedule</a> and I will plan small sessions for you.' : 'Start by adding a subject.'}</p>`}
      </div>${due ? `<a class="btn" style="margin-top:14px" href="#/flashcards">Review ${due} due card${due > 1 ? 's' : ''} →</a>` : ''}</div>
      <div class="card"><h2>Coming up</h2><div class="stack tight" style="margin-top:12px">
        ${upcoming.length ? upcoming.map((e) => `<div class="row spread"><span><strong>${esc(e.title)}</strong><br><span class="muted small-text">${prettyDate(e.date)}${e.subject_id ? ' · ' + esc(subjectName(e.subject_id)) : ''}</span></span><span class="pill ${e.kind === 'exam' ? 'bad' : e.kind === 'quiz' ? 'warn' : ''}">${e.kind}</span></div>`).join('') : '<p class="muted">No exams or deadlines in the next 3 weeks.</p>'}
      </div></div>
    </div>
    <div class="card"><h2>Needs your attention</h2>
      ${attention.length ? `<div class="stack tight" style="margin-top:12px">${attention.map(({ s, a }) => `<div class="row spread"><span><strong>${esc(s.name)}</strong> <span class="muted">needs about ${fmt(a.needed, 1)}% on the remaining work</span></span><span class="pill ${a.needed > 100 ? 'bad' : 'warn'}">${a.needed > 100 ? 'Rescue plan' : 'Tight'}</span></div>`).join('')}</div>`
        : '<p class="muted" style="margin-top:8px">Nothing urgent. Enter scores on the GWA Goal page and any subject at risk will show up here.</p>'}
    </div>
    ${state.subjects.length ? '' : empty('🌸', 'Start by adding your first subject.', '<br><a class="btn" href="#/subjects">Add a subject</a>')}
  </div>`;

  $$('[data-block]', root).forEach((b) => (b.onclick = async () => {
    const r = await patch(`/schedule/blocks/${b.dataset.block}`, { status: b.dataset.status });
    if (r.created) toast(`No stress. Moved to ${r.created} shorter session(s) later. 💗`, 'good');
    location.reload();
  }));
}

function blockRow(b) {
  const [icon, label, link] = TASK[b.task] || TASK.reviewer;
  return `<div class="block ${b.status}"><span class="time">${time12(b.start)}</span>
    <span class="grow"><span style="color:${subjectColor(b.subject_id)}">●</span> <strong>${icon} ${label}</strong> · ${b.minutes} min<br><span class="muted small-text">${esc(subjectName(b.subject_id))}</span></span>
    ${b.status === 'planned' ? `<a class="btn ghost small" href="${link}">Start</a><button class="btn small" data-block="${b.id}" data-status="done">✓ Done</button>` : `<span class="pill">${b.status}</span>`}</div>`;
}
