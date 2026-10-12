import { get, post, del, put } from '../api.js';
import { $, $$, esc, empty, toast, busy, openModal, closeModal, prettyDate, time12 } from '../ui.js';
import { state, subjectOptions, subjectName, subjectColor } from '../state.js';

export const meta = { title: 'Schedule', sub: 'Anti-cramming engine. Spaced 20–30 min study blocks around your work shifts.' };

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function render(root) {
  const draw = async () => {
    const [events, busySlots, blocks] = await Promise.all([
      get('/schedule/events'),
      get('/schedule/busy'),
      get('/schedule/blocks')
    ]);

    root.innerHTML = `
      <div class="stack">
        <div class="grid cols-2">
          <!-- Milestones & Exams -->
          <div class="card">
            <div class="row spread">
              <h2>Exam & Academic Milestones</h2>
              <button class="btn small" id="add-event">+ Add Milestone</button>
            </div>
            <p class="muted small-text" style="margin: 6px 0 14px">Upcoming exams from your academic calendar. DOSTUDY reverse-engineers spaced study sessions before each date.</p>
            <div class="stack tight" id="event-list" style="max-height:360px;overflow-y:auto">
              ${events.length ? events.map(e => `
                <div class="row spread" style="border-bottom: 1px solid var(--border); padding: 10px 0;">
                  <div>
                    <strong>${esc(e.title)}</strong><br>
                    <span class="muted small-text">${prettyDate(e.date)} · <span class="pill">${esc(e.kind.toUpperCase())}</span></span>
                  </div>
                  <button class="btn danger small" data-del-event="${e.id}" title="Remove milestone">✕</button>
                </div>
              `).join('') : '<p class="muted">No upcoming exams added yet.</p>'}
            </div>
          </div>

          <!-- Work Shifts -->
          <div class="card">
            <div class="row spread">
              <h2>Work Shifts & Busy Hours</h2>
              <button class="btn ghost small" id="add-busy">+ Add Shift</button>
            </div>
            <p class="muted small-text" style="margin: 6px 0 14px">Blocks out your working hours so you are never scheduled to study during your job shifts or late tired hours.</p>
            <div class="stack tight" id="busy-list" style="max-height:360px;overflow-y:auto">
              ${busySlots.length ? busySlots.map(b => `
                <div class="row spread" style="border-bottom: 1px solid var(--border); padding: 10px 0;">
                  <div>
                    <strong>${esc(b.label || 'Work Shift')}</strong><br>
                    <span class="muted small-text">${DOW_NAMES[b.dow % 7]} (${time12(b.start)} – ${time12(b.end)})</span>
                  </div>
                  <button class="btn danger small" data-del-busy="${b.id}" title="Remove shift">✕</button>
                </div>
              `).join('') : '<p class="muted">No work shifts configured. Tap "+ Add Shift" to protect your work hours.</p>'}
            </div>
          </div>
        </div>

        <!-- Generated Micro-Study Plan -->
        <div class="card">
          <div class="row spread" style="margin-bottom:12px">
            <div>
              <h2>Anti-Cramming Study Plan</h2>
              <p class="muted small-text" style="margin-top:4px">Bite-sized 20–30 min sessions leading up to your exams. Check them off as you complete them.</p>
            </div>
            <button class="btn" id="gen-plan">Generate Study Schedule</button>
          </div>

          <div class="stack tight" style="margin-top: 14px">
            ${blocks.length ? blocks.map(b => `
              <div class="block ${b.status === 'completed' ? 'done' : ''}" style="cursor:pointer" data-toggle-block="${b.id}">
                <button class="btn ghost small" style="border-radius:6px;padding:4px 8px;min-width:70px">
                  ${b.status === 'completed' ? '✓ Done' : 'Planned'}
                </button>
                <span class="time" style="font-weight:700">${prettyDate(b.date)} ${time12(b.start)}</span>
                <span class="grow">
                  <strong>${esc(b.task)}</strong> · <span class="muted">${b.minutes} mins</span><br>
                  <span class="muted small-text">${esc(b.note || 'Active spaced review')}</span>
                </span>
                <span class="pill ${b.status === 'completed' ? 'good' : ''}">${b.status === 'completed' ? 'Completed' : 'Upcoming'}</span>
              </div>
            `).join('') : `
              <div class="empty" style="text-align:center;padding:30px">
                <p class="muted">No study blocks generated yet. Tap <strong>Generate Study Schedule</strong> above to automatically schedule prep blocks leading up to your upcoming exams.</p>
              </div>
            `}
          </div>
        </div>
      </div>
    `;

    // Event Handlers
    $('#add-event', root).onclick = () => {
      openModal('Add Exam or Milestone', `
        <div class="stack" style="gap:12px">
          <div><label for="ev-title">Milestone Title</label><input id="ev-title" placeholder="e.g. Semi Final Exam, Quiz 3" required /></div>
          <div><label for="ev-date">Date</label><input type="date" id="ev-date" required /></div>
          <div><label for="ev-kind">Type</label>
            <select id="ev-kind">
              <option value="exam">Major Examination</option>
              <option value="quiz">Quiz / Assessment</option>
              <option value="review">Review / Tutoring</option>
              <option value="milestone">Class Milestone</option>
              <option value="break">Holiday / Break</option>
            </select>
          </div>
          <div><label for="ev-subj">Subject</label><select id="ev-subj">${subjectOptions(state.subjects[0]?.id)}</select></div>
          <div class="row" style="justify-content:flex-end"><button class="btn" id="ev-save">Save Milestone</button></div>
        </div>
      `, (m) => {
        $('#ev-save', m).onclick = (e) => busy(e.target, 'Saving…', async () => {
          const title = $('#ev-title', m).value.trim();
          const date = $('#ev-date', m).value;
          if (!title || !date) { toast('Please enter a title and date.', 'bad'); return; }
          await post('/schedule/events', {
            title,
            date,
            kind: $('#ev-kind', m).value,
            subject_id: Number($('#ev-subj', m).value) || null
          });
          closeModal();
          toast('Milestone added.', 'good');
          draw();
        });
      });
    };

    $('#add-busy', root).onclick = () => {
      openModal('Add Work Shift', `
        <div class="stack" style="gap:12px">
          <div><label for="bs-label">Label</label><input id="bs-label" placeholder="e.g. Work Shift, BPO, Office" value="Work Shift" required /></div>
          <div><label for="bs-dow">Day of the Week</label>
            <select id="bs-dow">
              <option value="1">Monday</option>
              <option value="2">Tuesday</option>
              <option value="3">Wednesday</option>
              <option value="4">Thursday</option>
              <option value="5">Friday</option>
              <option value="6">Saturday</option>
              <option value="0">Sunday</option>
            </select>
          </div>
          <div class="row">
            <div class="field"><label for="bs-start">Start Time</label><input type="time" id="bs-start" value="13:00" required /></div>
            <div class="field"><label for="bs-end">End Time</label><input type="time" id="bs-end" value="18:00" required /></div>
          </div>
          <div class="row" style="justify-content:flex-end"><button class="btn" id="bs-save">Save Shift</button></div>
        </div>
      `, (m) => {
        $('#bs-save', m).onclick = (e) => busy(e.target, 'Saving…', async () => {
          const label = $('#bs-label', m).value.trim();
          const dow = Number($('#bs-dow', m).value);
          const start = $('#bs-start', m).value;
          const end = $('#bs-end', m).value;
          if (!start || !end) { toast('Please select start and end times.', 'bad'); return; }
          await post('/schedule/busy', { dow, start, end, label, kind: 'work' });
          closeModal();
          toast('Work shift saved.', 'good');
          draw();
        });
      });
    };

    $('#gen-plan', root).onclick = (e) => busy(e.target, 'Generating…', async () => {
      const res = await post('/schedule/generate');
      toast(`Generated ${res.generated} study session block(s)!`, 'good');
      draw();
    });

    $$('[data-del-event]', root).forEach(b => {
      b.onclick = async () => {
        if (confirm('Delete this milestone?')) {
          await del(`/schedule/events/${b.dataset.delEvent}`);
          toast('Milestone removed.');
          draw();
        }
      };
    });

    $$('[data-del-busy]', root).forEach(b => {
      b.onclick = async () => {
        if (confirm('Delete this shift?')) {
          await del(`/schedule/busy/${b.dataset.delBusy}`);
          toast('Work shift removed.');
          draw();
        }
      };
    });

    $$('[data-toggle-block]', root).forEach(el => {
      el.onclick = async () => {
        const id = el.dataset.toggleBlock;
        await put(`/schedule/blocks/${id}/done`);
        draw();
      };
    });
  };

  await draw();
}

