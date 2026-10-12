import { put } from '../api.js';
import { $, $$, esc, fmt, empty, toast } from '../ui.js';
import { state, reloadSubjects, subjectById } from '../state.js';
import { analyze, overallGwa, percentToGrade, statusFor, targetPercent } from '../gwa-math.js';

export const meta = { title: 'GWA Goal 🎯', sub: 'Enter your scores and see exactly what you need next.' };

export async function render(root) {
  await reloadSubjects();
  const draw = () => {
    const gwa = overallGwa(state.subjects, state.goal);
    root.innerHTML = `<div class="stack">
      <div class="grid cols-2">
        <div class="card"><h3>Your goal</h3>
          <div class="row" style="margin-top:10px"><div class="field"><label for="goal">Target GWA</label><input id="goal" type="number" step="0.05" min="1" max="3" value="${state.goal}" /></div></div>
          <p class="muted" style="margin-top:10px">With the grade table in use, a ${fmt(state.goal)} GWA means aiming for about <strong>${targetPercent(state.goal)}%</strong> or higher in each subject.</p></div>
        <div class="card stat"><div class="num">${fmt(gwa)}</div><div class="label">Projected GWA from entered scores</div></div>
      </div>
      ${state.subjects.length ? state.subjects.map(subjectCard).join('') : empty('🎯', 'Add a subject first, then enter your scores here.', '<br><a class="btn" href="#/subjects">Add a subject</a>')}
      <div class="callout">Leave a score empty if it hasn't happened yet. Scores are percentages (0–100). Weights should add up to 100%. Recitation counts too, so speak up in class! 🙋‍♀️</div>
    </div>`;
    $('#goal', root).onchange = async (e) => {
      const v = parseFloat(e.target.value);
      if (v >= 1 && v <= 3) { await put('/settings', { goal: v }); state.goal = v; document.querySelector('#goal-chip').innerHTML = `Goal GWA <strong>${fmt(v)}</strong>`; draw(); }
    };
    $$('[data-c]', root).forEach((inp) => (inp.onchange = () => update(inp)));
    $$('[data-add]', root).forEach((b) => (b.onclick = () => { const s = subjectById(b.dataset.add); s.components.push({ name: 'New component', weight: 0, score: null }); save(s); }));
    $$('[data-rm]', root).forEach((b) => (b.onclick = () => { const [sid, i] = b.dataset.rm.split('|'); const s = subjectById(sid); s.components.splice(+i, 1); save(s); }));
  };
  const save = async (s) => {
    try { const fresh = await put(`/subjects/${s.id}/components`, { components: s.components }); Object.assign(s, fresh); }
    catch (e) { toast(e.message, 'bad'); await reloadSubjects(); }
    draw();
  };
  const update = (inp) => {
    const [sid, i, key] = inp.dataset.c.split('|');
    const s = subjectById(sid), c = s.components[+i];
    if (key === 'score') c.score = inp.value.trim() === '' ? null : Math.min(100, Math.max(0, parseFloat(inp.value) || 0));
    else if (key === 'weight') c.weight = Math.max(0, parseFloat(inp.value) || 0);
    else c.name = inp.value.trim() || c.name;
    save(s);
  };
  draw();
}

function subjectCard(s) {
  const a = analyze(s, state.goal), st = statusFor(a);
  let advice;
  if (a.totalWeight !== 100) advice = `<div class="callout warn">Your weights add up to ${fmt(a.totalWeight, 0)}%, not 100%. Check them against your syllabus.</div>`;
  else if (a.standing === null) advice = '<div class="callout">Enter at least one score to see your standing.</div>';
  else if (a.remainingWeight <= 0) advice = `<div class="callout ${a.earned >= a.target ? 'good' : 'bad'}">Final result: <strong>${fmt(a.earned, 1)}%</strong> (${fmt(percentToGrade(a.earned))}).</div>`;
  else if (a.needed > 100) advice = `<div class="callout bad"><strong>Rescue plan:</strong> you'd need ${fmt(a.needed, 1)}% on the remaining ${fmt(a.remainingWeight, 0)}% of the grade, which is more than 100%. Ask about extra credit, ace your recitation, and talk to your instructor early. 💪</div>`;
  else advice = `<div class="callout ${a.needed > 92 ? 'warn' : 'good'}">To reach <strong>${a.target}%</strong> overall, average <strong>${fmt(Math.max(0, a.needed), 1)}%</strong> on the remaining ${fmt(a.remainingWeight, 0)}% of the grade.</div>`;
  return `<div class="card" style="border-left:6px solid ${s.color}">
    <div class="row spread"><h2>${esc(s.name)}</h2><span class="pill ${st.cls}">${st.text}</span></div>
    <table style="margin:12px 0"><thead><tr><th>Component</th><th style="width:100px">Weight %</th><th style="width:110px">Score %</th><th style="width:44px"></th></tr></thead><tbody>
    ${s.components.map((c, i) => `<tr>
      <td><input aria-label="Component name" maxlength="80" data-c="${s.id}|${i}|name" value="${esc(c.name)}" /></td>
      <td><input aria-label="Weight" type="number" min="0" max="100" data-c="${s.id}|${i}|weight" value="${c.weight}" /></td>
      <td><input aria-label="Score" type="number" min="0" max="100" placeholder="—" data-c="${s.id}|${i}|score" value="${c.score === null ? '' : c.score}" /></td>
      <td><button class="btn danger small" title="Remove" data-rm="${s.id}|${i}">✕</button></td></tr>`).join('')}
    </tbody></table>
    <div class="row spread" style="margin-bottom:12px"><button class="btn ghost small" data-add="${s.id}">+ Add component</button>
      <span class="muted">Standing: <strong>${a.standing === null ? '—' : fmt(a.standing, 1) + '%'}</strong></span></div>${advice}</div>`;
}
