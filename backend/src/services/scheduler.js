'use strict';
/* Anti-cramming study scheduler. Pure functions (no DB, no network) so they are easy to test.

   Rules:
   - Spread sessions over the days before each exam (up to `leadDays`), never on the exam day itself.
   - Never inside work shifts / classes / other busy time, only inside your study window.
   - Small sessions (default 30 min), max `maxPerDay` per day.
   - Session type follows a learning arc: read reviewer -> flashcards -> practice test -> final recap.
   - If an exam is very close, sessions are squeezed in and a warning is returned (no silent cramming).
   - Skipped session -> split into two short sessions on the next free days (no guilt backlog). */

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmtDate = (dt) => dt.toISOString().slice(0, 10);
const addDays = (s, n) => fmtDate(new Date(parseDate(s).getTime() + n * 86400000));
const dowOf = (s) => parseDate(s).getUTCDay();
const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);

const DEFAULT_PREFS = { windowStart: '06:00', windowEnd: '22:00', blockMinutes: 30, maxPerDay: 3, leadDays: 14, gapMinutes: 15 };

function makeCtx({ today, nowMin = 0, busy = [], existing = [], prefs = {} }) {
  const p = { ...DEFAULT_PREFS, ...prefs };
  const byDate = new Map();
  for (const b of existing) {
    const list = byDate.get(b.date) || [];
    list.push({ start: toMin(b.start), end: toMin(b.start) + b.minutes });
    byDate.set(b.date, list);
  }
  return { p, today, nowMin, busy, byDate };
}

function freeStart(ctx, date, minutes) {
  const { p } = ctx;
  let lower = toMin(p.windowStart);
  const upper = toMin(p.windowEnd);
  if (date === ctx.today) lower = Math.max(lower, Math.ceil((ctx.nowMin + 15) / 5) * 5);
  const taken = [
    ...ctx.busy.filter((b) => b.dow === dowOf(date)).map((b) => ({ start: toMin(b.start), end: toMin(b.end) })),
    ...(ctx.byDate.get(date) || []),
  ].map((t) => ({ start: t.start - p.gapMinutes, end: t.end + p.gapMinutes })).sort((a, b) => a.start - b.start);
  let cursor = lower;
  for (const t of taken) {
    if (t.start - cursor >= minutes) break;
    cursor = Math.max(cursor, t.end);
  }
  return cursor + minutes <= upper ? cursor : null;
}

function place(ctx, dates, minutes) {
  for (const date of dates) {
    if ((ctx.byDate.get(date) || []).length >= ctx.p.maxPerDay) continue;
    const start = freeStart(ctx, date, minutes);
    if (start === null) continue;
    const list = ctx.byDate.get(date) || [];
    list.push({ start, end: start + minutes });
    ctx.byDate.set(date, list);
    return { date, start: fromMin(start), minutes };
  }
  return null;
}

const NOTES = {
  reviewer: 'Read one part of your reviewer slowly. Use the "I still don\'t get it" button whenever you need.',
  flashcards: 'Flashcards: rate yourself honestly. Hard cards will come back sooner.',
  practice: 'Take a practice test, then read every explanation, even for the ones you got right.',
  recap: 'Last light recap: skim your Exam Traps and hard flashcards, then rest. You are ready.',
};

function taskFor(i, total) {
  if (total >= 3 && i === total - 1) return 'recap';
  const frac = i / total;
  return frac < 0.4 ? 'reviewer' : frac < 0.7 ? 'flashcards' : 'practice';
}

/** Build the whole plan for all upcoming exams. */
function generatePlan({ today, nowMin = 0, exams, busy = [], existing = [], prefs = {} }) {
  const ctx = makeCtx({ today, nowMin, busy, existing, prefs });
  const blocks = [];
  const warnings = [];
  const upcoming = exams.filter((e) => e.date > today).sort((a, b) => a.date.localeCompare(b.date));
  for (const exam of upcoming) {
    const first = addDays(exam.date, -ctx.p.leadDays);
    const startDate = first > today ? first : today;
    const dates = [];
    for (let d = startDate; d < exam.date; d = addDays(d, 1)) dates.push(d);
    if (!dates.length) continue;
    const target = Math.max(dates.length, Math.min(7, dates.length * ctx.p.maxPerDay));
    const tight = dates.length < 5;
    let placed = 0;
    for (let j = 0; j < target; j++) {
      const idx = Math.floor((j * dates.length) / target);
      // try that day first, then later days, then earlier days (never the exam day)
      const order = [...dates.slice(idx), ...dates.slice(0, idx).reverse()];
      const spot = place(ctx, order, ctx.p.blockMinutes);
      if (!spot) continue;
      const task = taskFor(j, target);
      blocks.push({ event_id: exam.id, subject_id: exam.subject_id ?? null, ...spot, task, note: NOTES[task] });
      placed++;
    }
    if (placed < target) warnings.push(`"${exam.title}": only ${placed} of ${target} study sessions could fit before the exam. Consider freeing up time.`);
    else if (tight) warnings.push(`"${exam.title}" is very close (${dates.length} day${dates.length > 1 ? 's' : ''} left), so sessions are packed in. Start today, even 15 minutes helps.`);
  }
  blocks.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return { blocks, warnings };
}

/** A skipped session becomes two short ones on the next free days (before the exam if there is one). */
function rescheduleSkipped({ block, examDate, today, nowMin = 0, busy = [], existing = [], prefs = {} }) {
  const ctx = makeCtx({ today, nowMin, busy, existing, prefs });
  const from = addDays(block.date > today ? block.date : today, 1);
  const last = examDate ? addDays(examDate, -1) : addDays(from, 14);
  const dates = [];
  for (let d = from; d <= last; d = addDays(d, 1)) dates.push(d);
  const half = Math.max(10, Math.ceil(block.minutes / 2));
  const out = [];
  let pool = dates;
  for (let k = 0; k < 2; k++) {
    const spot = place(ctx, pool, half);
    if (!spot) break;
    out.push({ event_id: block.event_id ?? null, subject_id: block.subject_id ?? null, ...spot, task: block.task, note: 'Rescheduled gently. Two short sessions instead of one long one.' });
    pool = pool.filter((d) => d > spot.date); // spread across different days
  }
  const warnings = out.length < 2 ? ['Not much free time is left before the exam. Try a quick session today if you can.'] : [];
  return { blocks: out, warnings };
}

module.exports = { generatePlan, rescheduleSkipped, addDays, diffDays, toMin, fromMin, DEFAULT_PREFS };
