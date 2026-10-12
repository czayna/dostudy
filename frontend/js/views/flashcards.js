import { get, post, del } from '../api.js';
import { $, $$, esc, md, empty, toast, openModal, closeModal, busy, routeParams } from '../ui.js';
import { state, subjectOptions, subjectName, subjectColor } from '../state.js';

export const meta = { title: 'Flashcards', sub: 'Rate honestly. Hard cards come back sooner, easy ones rest. No time wasted.' };

const RATINGS = [
  [1, '1', 'Blank'],
  [2, '2', 'Hard'],
  [3, '3', 'Okay'],
  [4, '4', 'Good'],
  [5, '5', 'Easy']
];

function checkMatch(guess, target) {
  if (!guess || !guess.trim()) return false;
  const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim().replace(/\s+/g, ' ');
  const g = clean(guess);
  const t = clean(target);
  if (!g || !t) return false;
  if (t === g) return true;
  if (t.includes(g) || g.includes(t)) return true;
  const gWords = g.split(' ').filter((w) => w.length > 2);
  const tWords = t.split(' ').filter((w) => w.length > 2);
  if (!gWords.length || !tWords.length) return false;
  const matches = gWords.filter((w) => tWords.includes(w)).length;
  return matches >= Math.min(2, Math.max(1, Math.ceil(gWords.length * 0.7)));
}

function stripMd(str) {
  return (str || '').replace(/[*_#`[\]]/g, '').trim();
}

export async function render(root) {
  let subjectId = routeParams().subject ? Number(routeParams().subject) : '';
  let studyStyle = localStorage.getItem('dostudy.flashcard_style') || 'standard'; // 'standard' or 'definition_first'
  let cleanupKey = null;

  const home = async () => {
    if (cleanupKey) { document.removeEventListener('keydown', cleanupKey); cleanupKey = null; }
    const [stats, due] = await Promise.all([
      get('/flashcards/stats'),
      get(`/flashcards?due=1${subjectId ? `&subjectId=${subjectId}` : ''}`)
    ]);
    const total = stats
      .filter((s) => !subjectId || s.subject_id === subjectId)
      .reduce((a, s) => ({ t: a.t + s.total, m: a.m + (s.mastered || 0) }), { t: 0, m: 0 });

    root.innerHTML = `<div class="stack">
      <div class="card">
        <div class="row spread" style="gap:16px;flex-wrap:wrap">
          <div class="field" style="max-width:280px">
            <label for="subj">Deck</label>
            <select id="subj">${subjectOptions(subjectId, true)}</select>
          </div>
          <div class="field" style="max-width:320px">
            <label for="style-select">Study Style</label>
            <select id="style-select">
              <option value="standard" ${studyStyle === 'standard' ? 'selected' : ''}>Standard (Term / Question → Definition)</option>
              <option value="definition_first" ${studyStyle === 'definition_first' ? 'selected' : ''}>Definition First (Definition → Identify Term)</option>
            </select>
          </div>
          <div class="row" style="align-self:flex-end">
            <button class="btn ghost" id="browse">Browse / add cards</button>
          </div>
        </div>
      </div>

      ${total.t ? `
        <div class="grid cols-3">
          <div class="card stat"><div class="num">${due.length}</div><div class="label">Due now</div></div>
          <div class="card stat"><div class="num">${total.t}</div><div class="label">Cards in deck</div></div>
          <div class="card stat"><div class="num">${total.m}</div><div class="label">Mastered</div></div>
        </div>
        <div class="card" style="text-align:center">
          ${due.length ? `
            <h2>${due.length} card${due.length > 1 ? 's' : ''} ready</h2>
            <p class="muted" style="margin:6px 0 16px">
              ${studyStyle === 'definition_first' ? 'Mode: Read the definition first, recall/type the term, and check your accuracy.' : 'Mode: Question on front, answer on back. Rate 1 to 5 to train active recall.'}
            </p>
            <button class="btn big" id="start">Start studying</button>
          ` : `
            <h2>All caught up</h2>
            <p class="muted">Nothing is due right now. Come back later or build more cards from a file.</p>
          `}
        </div>
      ` : empty('', 'No flashcards yet. Upload a file and build them with one click.', '<br><a class="btn" href="#/files">Upload a file</a>')}
    </div>`;

    $('#subj', root).onchange = (e) => { subjectId = e.target.value ? Number(e.target.value) : ''; home(); };
    $('#style-select', root).onchange = (e) => {
      studyStyle = e.target.value;
      localStorage.setItem('dostudy.flashcard_style', studyStyle);
      home();
    };
    $('#browse', root).onclick = browse;
    const start = $('#start', root);
    if (start) start.onclick = () => session(due);
  };

  const session = (cards) => {
    const queue = [...cards];
    let flipped = false, done = 0;
    let userTyped = '';
    const total = cards.length;

    const draw = () => {
      if (!queue.length) {
        if (cleanupKey) { document.removeEventListener('keydown', cleanupKey); cleanupKey = null; }
        root.innerHTML = `<div class="card empty">
          <h2>Round complete</h2>
          <p class="muted">You reviewed ${total} card(s). Hard ones will return soon, easy ones will rest.</p>
          <br><button class="btn" id="back">Back to decks</button>
        </div>`;
        $('#back', root).onclick = home;
        return;
      }

      const c = queue[0];
      flipped = false;
      userTyped = '';

      const isDefFirst = studyStyle === 'definition_first';
      const frontContent = isDefFirst ? c.back : c.front;
      const backContent = isDefFirst ? c.front : c.back;
      const frontTag = isDefFirst ? 'Definition · Identify the Term' : 'Question · tap to flip (Space)';
      const backTag = isDefFirst ? 'Correct Term' : 'Answer';

      root.innerHTML = `<div class="stack" style="width:100%;max-width:800px;margin:0 auto">
        <div class="row spread">
          <button class="btn ghost small" id="exit">← Exit</button>
          <div class="row" style="gap:10px">
            <button class="btn ghost small" id="style-toggle" title="Switch study style">
              ${isDefFirst ? 'Style: Definition First' : 'Style: Standard'}
            </button>
            <span class="muted">${done} / ${total} · <span style="color:${subjectColor(c.subject_id)}">●</span> ${esc(subjectName(c.subject_id))}</span>
          </div>
        </div>

        <div class="bar"><span style="width:${(done / total) * 100}%"></span></div>

        <div class="flip" id="flip" style="width:100%;max-width:680px;height:420px;min-height:420px;margin:20px auto;display:block">
          <div class="flip-inner" style="position:relative;width:100%;height:100%;min-height:420px">
            
            <!-- Front Face -->
            <div class="face front" style="position:absolute;top:0;left:0;width:100%;height:100%;min-width:100%;box-sizing:border-box">
              <div class="tag">${esc(frontTag)}</div>
              <div class="prose" style="width:100%;max-width:580px">${md(frontContent)}</div>
              ${c.hint ? `<p class="muted small-text" style="margin-top:10px">Hint: ${esc(c.hint)}</p>` : ''}

              ${isDefFirst ? `
                <div class="term-input-box" style="margin-top:20px;width:100%;max-width:440px;position:relative;z-index:5" onclick="event.stopPropagation()">
                  <div class="row" style="gap:8px">
                    <input type="text" id="term-input" placeholder="Type the term... (Enter to reveal)" autocomplete="off" style="text-align:center" />
                    <button class="btn small" id="reveal-btn">Reveal</button>
                  </div>
                  <p class="muted small-text" style="margin-top:6px;font-size:12px">Type your answer or click the card to reveal</p>
                </div>
              ` : ''}
            </div>

            <!-- Back Face -->
            <div class="face back" style="position:absolute;top:0;left:0;width:100%;height:100%;min-width:100%;box-sizing:border-box">
              <div class="tag">${esc(backTag)}</div>
              <div class="prose" style="width:100%;max-width:580px;font-weight:700;font-size:24px">${md(backContent)}</div>
              
              <div id="typed-result" style="width:100%;max-width:540px"></div>

              ${isDefFirst ? `
                <div class="muted small-text" style="margin-top:16px;text-align:left;border-top:1px solid var(--border);padding-top:10px;width:100%;max-width:540px">
                  <strong>Definition:</strong> ${esc(stripMd(c.back))}
                </div>
              ` : ''}
            </div>

          </div>
        </div>

        <div id="rates" hidden>
          <p class="muted" style="text-align:center;font-size:14px">Rate your recall (1 = Blank, 5 = Mastered)</p>
          <div class="rate-row">
            ${RATINGS.map(([n, num, l]) => `
              <button data-r="${n}">
                <span style="font-size:22px;font-weight:800;display:block;margin-bottom:2px;color:var(--text)">${num}</span>
                <span class="muted small-text">${l}</span>
              </button>
            `).join('')}
          </div>
        </div>
      </div>`;

      $('#exit', root).onclick = home;
      $('#style-toggle', root).onclick = () => {
        studyStyle = studyStyle === 'standard' ? 'definition_first' : 'standard';
        localStorage.setItem('dostudy.flashcard_style', studyStyle);
        toast(`Switched to ${studyStyle === 'definition_first' ? 'Definition First' : 'Standard'} style`, 'good');
        draw();
      };

      const ti = $('#term-input', root);
      const revBtn = $('#reveal-btn', root);
      if (ti) {
        ti.focus();
        ti.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            userTyped = ti.value;
            flip();
          }
        };
      }
      if (revBtn) {
        revBtn.onclick = (e) => {
          e.stopPropagation();
          if (ti) userTyped = ti.value;
          flip();
        };
      }

      $('#flip', root).onclick = (e) => {
        // If clicking inside input or reveal button, do not trigger card flip twice
        if (e.target.closest('.term-input-box')) return;
        if (ti && ti.value) userTyped = ti.value;
        flip();
      };

      $$('[data-r]', root).forEach((b) => (b.onclick = () => rate(+b.dataset.r)));
    };

    const flip = () => {
      if (flipped) return;
      flipped = true;

      const c = queue[0];
      const isDefFirst = studyStyle === 'definition_first';
      const targetTerm = isDefFirst ? c.front : c.back;
      const resContainer = $('#typed-result', root);

      if (resContainer && userTyped.trim()) {
        const match = checkMatch(userTyped, targetTerm);
        resContainer.innerHTML = `
          <div style="margin-top:14px;padding:8px 14px;border-radius:12px;background:${match ? '#E9F5EC' : '#FFF6E8'};border:1px solid ${match ? '#4F8B5D' : '#F5E0BD'};text-align:center">
            <span class="pill ${match ? 'good' : 'warn'}" style="margin-bottom:4px">
              ${match ? 'Accurate Match' : 'Your Answer'}
            </span>
            <div style="font-size:15px;color:var(--text);margin-top:2px">“${esc(userTyped)}”</div>
          </div>
        `;
      }

      $('#flip', root).classList.add('flipped');
      $('#rates', root).hidden = false;
    };

    const rate = async (r) => {
      if (!flipped) return;
      const c = queue.shift();
      try {
        await post(`/flashcards/${c.id}/rate`, { rating: r });
      } catch (e) {
        toast(e.message, 'bad');
      }
      if (r <= 2) queue.push(c);
      else done++;
      draw();
    };

    cleanupKey = (e) => {
      if (e.target.matches('input,textarea,select')) {
        // Allow enter in text input
        if (e.key === 'Enter') {
          e.preventDefault();
          const ti = $('#term-input', root);
          if (ti) userTyped = ti.value;
          flip();
        }
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        flip();
      } else if (/^[1-5]$/.test(e.key)) {
        rate(+e.key);
      }
    };

    document.addEventListener('keydown', cleanupKey);
    draw();
  };

  const browse = async () => {
    const cards = await get(`/flashcards${subjectId ? `?subjectId=${subjectId}` : ''}`);
    root.innerHTML = `<div class="stack">
      <div class="row spread">
        <button class="btn ghost small" id="back">← Back</button>
        <button class="btn small" id="add">+ Add my own card</button>
      </div>
      <div class="card">
        ${cards.length ? cards.map((c) => `
          <div class="file-item">
            <div style="flex:1;min-width:220px">
              <strong>${esc(c.front)}</strong>
              <div class="muted">${esc(c.back)}</div>
            </div>
            <span class="pill">${esc(subjectName(c.subject_id))}</span>
            <button class="btn danger small" data-del="${c.id}">✕</button>
          </div>
        `).join('') : '<p class="muted">No cards here yet.</p>'}
      </div>
    </div>`;

    $('#back', root).onclick = home;
    $('#add', root).onclick = () => addForm(browse);
    $$('[data-del]', root).forEach((b) => (b.onclick = async () => {
      await del(`/flashcards/${b.dataset.del}`);
      browse();
    }));
  };

  const addForm = (after) => openModal('Add a flashcard', `<div class="stack" style="gap:12px">
    <div><label for="c-subj">Subject</label><select id="c-subj">${subjectOptions(subjectId || state.subjects[0]?.id)}</select></div>
    <div><label for="c-front">Front (question / term)</label><textarea id="c-front" maxlength="600"></textarea></div>
    <div><label for="c-back">Back (definition / answer)</label><textarea id="c-back" maxlength="1200"></textarea></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" id="c-save">Save</button></div>
  </div>`, (m) => {
    $('#c-save', m).onclick = (e) => busy(e.target, 'Saving…', async () => {
      await post('/flashcards', { subject_id: +$('#c-subj', m).value, front: $('#c-front', m).value, back: $('#c-back', m).value });
      closeModal();
      toast('Card added.', 'good');
      after();
    });
  });

  if (!state.subjects.length) {
    root.innerHTML = empty('', 'Add a subject and upload a file first.', '<br><a class="btn" href="#/subjects">Add a subject</a>');
    return;
  }
  await home();
  return () => { if (cleanupKey) document.removeEventListener('keydown', cleanupKey); };
}
