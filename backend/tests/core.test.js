'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { nextReview } = require('../src/services/srs');
const { generatePlan, rescheduleSkipped, toMin } = require('../src/services/scheduler');
const { parseIcs, buildIcs } = require('../src/services/ics');

test('SRS: ratings map to the promised intervals', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  assert.equal(nextReview(1, 0, now).minutes, 2);
  assert.equal(nextReview(3, 0, now).minutes, 24 * 60);
  assert.equal(nextReview(5, 0, now).minutes, 7 * 24 * 60);
  assert.equal(nextReview(1, 5, now).reps, 0, 'blank answer resets streak');
  assert.ok(nextReview(5, 3, now).minutes > 7 * 24 * 60, 'mastered cards rest longer each time');
});

const busy = [1, 3, 5].map((dow) => ({ dow, start: '16:00', end: '22:00' })); // Mon/Wed/Fri work 4-10 PM

test('Scheduler: spreads sessions, never during work, never on exam day, respects max/day', () => {
  const today = '2026-03-02'; // Monday
  const { blocks } = generatePlan({ today, nowMin: 8 * 60, busy, exams: [{ id: 1, subject_id: 1, title: 'Midterm', date: '2026-03-16' }] });
  assert.ok(blocks.length >= 10, 'should plan many small sessions');
  const days = new Set(blocks.map((b) => b.date));
  assert.ok(days.size >= 10, 'sessions spread over many days (no cramming)');
  assert.ok(!days.has('2026-03-16'), 'nothing on exam day');
  const perDay = {};
  for (const b of blocks) {
    perDay[b.date] = (perDay[b.date] || 0) + 1;
    const dow = new Date(b.date + 'T00:00:00Z').getUTCDay();
    for (const w of busy.filter((x) => x.dow === dow)) {
      const s = toMin(b.start), e = s + b.minutes;
      assert.ok(e <= toMin(w.start) || s >= toMin(w.end), `block ${b.date} ${b.start} overlaps work`);
    }
    assert.ok(b.minutes <= 30);
  }
  assert.ok(Math.max(...Object.values(perDay)) <= 3);
  assert.equal(blocks.at(-1).task, 'recap', 'ends with a light recap');
});

test('Scheduler: very close exam produces a warning instead of silent cramming', () => {
  const { blocks, warnings } = generatePlan({ today: '2026-03-02', nowMin: 600, exams: [{ id: 1, subject_id: 1, title: 'Quiz', date: '2026-03-04' }] });
  assert.ok(blocks.length > 0);
  assert.ok(warnings.length > 0);
});

test('Scheduler: skipped session is split into two short ones on later days', () => {
  const block = { event_id: 1, subject_id: 1, date: '2026-03-03', minutes: 30, task: 'flashcards' };
  const r = rescheduleSkipped({ block, examDate: '2026-03-16', today: '2026-03-03', nowMin: 600, busy });
  assert.equal(r.blocks.length, 2);
  assert.ok(r.blocks.every((b) => b.minutes === 15 && b.date > '2026-03-03' && b.date < '2026-03-16'));
  assert.notEqual(r.blocks[0].date, r.blocks[1].date);
});

test('ICS: finds exams/quizzes/deadlines and ignores normal classes', () => {
  const sample = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:a1', 'DTSTART;VALUE=DATE:20261015', 'SUMMARY:Accounting Midterm Exam', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:a2', 'DTSTART:20261016T080000', 'SUMMARY:Accounting Lecture', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:a3', 'DTSTART:20261020T000000', 'SUMMARY:Project due: Chapter 3', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const { events, ignored } = parseIcs(sample);
  assert.deepEqual(events.map((e) => [e.kind, e.date]), [['exam', '2026-10-15'], ['deadline', '2026-10-20']]);
  assert.equal(ignored, 1);
});

test('ICS: export contains study sessions and is valid-looking', () => {
  const out = buildIcs({ blocks: [{ id: 1, date: '2026-03-05', start: '19:30', minutes: 30, task: 'reviewer', note: 'Read', subject_id: 1, status: 'planned' }], subjectName: () => 'Accounting' });
  assert.match(out, /BEGIN:VCALENDAR/);
  assert.match(out, /DTSTART:20260305T193000/);
  assert.match(out, /DTEND:20260305T200000/);
});

test('SAFETY: Google connector is read-only (only readonly scopes, only GET to Classroom)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'google.js'), 'utf8');
  const scopes = [...src.matchAll(/https:\/\/www\.googleapis\.com\/auth\/[\w.]+/g)].map((m) => m[0]);
  assert.ok(scopes.length > 0);
  assert.ok(scopes.every((s) => s.endsWith('.readonly')), 'every OAuth scope must be read-only');
  assert.ok(!/classroom\.googleapis\.com[^`'"]*[`'"][^;]*method:\s*['"](POST|PUT|PATCH|DELETE)/i.test(src));
  const fetchCalls = src.match(/fetch\(/g) || [];
  assert.equal(fetchCalls.length, 2, 'only the OAuth token call + the single GET helper may call fetch');
  assert.match(src, /fetch\(url, \{ method: 'GET'/, 'the Classroom helper must be GET');
  assert.match(src, /fetch\('https:\/\/oauth2\.googleapis\.com\/token'/, 'the only other call is the OAuth token endpoint');
});
