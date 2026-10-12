'use strict';
const express = require('express');
const multer = require('multer');
const { all, get, run, insert, tx, getSetting, setSetting } = require('../db');
const scheduler = require('../services/scheduler');
const ics = require('../services/ics');
const { HttpError, wrap, intParam, text, num, isDate, isTime, localToday } = require('./helpers');

const router = express.Router();
const KINDS = ['exam', 'quiz', 'deadline'];

const cleanPrefs = (p = {}) => {
  const d = scheduler.DEFAULT_PREFS;
  const ws = isTime(p.windowStart) ? p.windowStart : d.windowStart;
  const we = isTime(p.windowEnd) ? p.windowEnd : d.windowEnd;
  return {
    windowStart: ws, windowEnd: scheduler.toMin(we) > scheduler.toMin(ws) ? we : d.windowEnd,
    blockMinutes: Math.round(num(p.blockMinutes, { min: 10, max: 90, fallback: d.blockMinutes })),
    maxPerDay: Math.round(num(p.maxPerDay, { min: 1, max: 6, fallback: d.maxPerDay })),
    leadDays: Math.round(num(p.leadDays, { min: 3, max: 30, fallback: d.leadDays })),
    gapMinutes: d.gapMinutes,
  };
};
const getPrefs = () => cleanPrefs(getSetting('schedulePrefs', {}));

router.get('/schedule/prefs', wrap((req, res) => res.json(getPrefs())));
router.put('/schedule/prefs', wrap((req, res) => { setSetting('schedulePrefs', cleanPrefs(req.body)); res.json(getPrefs()); }));

/* ----- Weekly busy time (work shifts, classes) ----- */
router.get('/schedule/busy', wrap((req, res) => res.json(all('SELECT * FROM busy_slots ORDER BY dow, start'))));
router.post('/schedule/busy', wrap((req, res) => {
  const b = req.body || {};
  const dows = (Array.isArray(b.dows) ? b.dows : [b.dow]).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (!dows.length) throw new HttpError(400, 'Pick at least one day.');
  if (!isTime(b.start) || !isTime(b.end) || scheduler.toMin(b.end) <= scheduler.toMin(b.start)) throw new HttpError(400, 'End time must be after start time (HH:MM).');
  const kind = ['work', 'class', 'other'].includes(b.kind) ? b.kind : 'work';
  tx(() => dows.forEach((dow) => insert('INSERT INTO busy_slots(kind,label,dow,start,end) VALUES (?,?,?,?,?)', kind, text(b.label, { max: 80 }), dow, b.start, b.end)));
  res.status(201).json({ ok: true });
}));
router.delete('/schedule/busy/:id', wrap((req, res) => { run('DELETE FROM busy_slots WHERE id = ?', intParam(req.params.id)); res.json({ ok: true }); }));

/* ----- Exams, quizzes, deadlines ----- */
router.get('/schedule/events', wrap((req, res) => res.json(all('SELECT * FROM events ORDER BY date, id'))));
router.post('/schedule/events', wrap((req, res) => {
  const b = req.body || {};
  if (!isDate(b.date)) throw new HttpError(400, 'Pick a valid date.');
  const subjectId = b.subject_id ? intParam(b.subject_id, 'subject') : null;
  const id = insert('INSERT INTO events(subject_id,title,kind,date,source) VALUES (?,?,?,?,?)', subjectId,
    text(b.title, { max: 200, required: true, name: 'Title' }), KINDS.includes(b.kind) ? b.kind : 'exam', b.date, 'manual');
  res.status(201).json({ id });
}));
router.delete('/schedule/events/:id', wrap((req, res) => { run('DELETE FROM events WHERE id = ?', intParam(req.params.id)); res.json({ ok: true }); }));

// Import the school calendar (.ics). Only exams/quizzes/deadlines are picked up; nothing leaves your computer.
const icsUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 } });
router.post('/schedule/import-ics', icsUpload.single('file'), wrap((req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose an .ics file.');
  const { events, ignored } = ics.parseIcs(req.file.buffer.toString('utf8'));
  const subjects = all('SELECT id, name FROM subjects');
  let added = 0;
  tx(() => events.forEach((e) => {
    const ext = `ics:${String(e.uid).slice(0, 200)}`;
    if (get('SELECT id FROM events WHERE external_id = ?', ext)) return;
    const hit = subjects.find((s) => e.title.toLowerCase().includes(s.name.toLowerCase()));
    insert('INSERT INTO events(subject_id,title,kind,date,source,external_id) VALUES (?,?,?,?,?,?)', hit?.id ?? null, e.title, e.kind, e.date, 'ics', ext);
    added++;
  }));
  res.json({ found: events.length, added, ignored });
}));

/* ----- Study blocks ----- */
const blockCtx = () => {
  const { today, nowMin } = localToday();
  return { today, nowMin, busy: all('SELECT dow, start, end FROM busy_slots'), prefs: getPrefs() };
};
const insertBlocks = (blocks) => tx(() => blocks.forEach((b) =>
  insert('INSERT INTO study_blocks(event_id,subject_id,date,start,minutes,task,note) VALUES (?,?,?,?,?,?,?)', b.event_id, b.subject_id, b.date, b.start, b.minutes, b.task, b.note)));

router.get('/schedule/blocks', wrap((req, res) => {
  const from = isDate(req.query.from) ? req.query.from : '0000-01-01';
  const to = isDate(req.query.to) ? req.query.to : '9999-12-31';
  res.json(all('SELECT * FROM study_blocks WHERE date BETWEEN ? AND ? ORDER BY date, start', from, to));
}));

router.post('/schedule/generate', wrap((req, res) => {
  const ctx = blockCtx();
  const exams = all("SELECT id, subject_id, title, date FROM events WHERE kind IN ('exam','quiz') AND date > ?", ctx.today);
  if (!exams.length) throw new HttpError(400, 'Add at least one upcoming exam or quiz first.');
  run("DELETE FROM study_blocks WHERE status = 'planned' AND date >= ?", ctx.today); // fresh plan; keep done/skipped history
  const existing = all('SELECT date, start, minutes FROM study_blocks WHERE date >= ?', ctx.today);
  const { blocks, warnings } = scheduler.generatePlan({ ...ctx, exams, existing });
  insertBlocks(blocks);
  res.json({ created: blocks.length, warnings });
}));

// Mark a session done, skipped ("too tired today") or back to planned. Skipping reschedules gently.
router.patch('/schedule/blocks/:id', wrap((req, res) => {
  const id = intParam(req.params.id);
  const block = get('SELECT * FROM study_blocks WHERE id = ?', id);
  if (!block) throw new HttpError(404, 'Session not found.');
  const status = ['planned', 'done', 'skipped'].includes(req.body?.status) ? req.body.status : null;
  if (!status) throw new HttpError(400, 'Invalid status.');
  run('UPDATE study_blocks SET status = ? WHERE id = ?', status, id);
  let warnings = [], created = 0;
  if (status === 'skipped' && block.status !== 'skipped') {
    const ctx = blockCtx();
    const ev = block.event_id ? get('SELECT date FROM events WHERE id = ?', block.event_id) : null;
    const existing = all("SELECT date, start, minutes FROM study_blocks WHERE date >= ? AND status != 'skipped'", ctx.today);
    const r = scheduler.rescheduleSkipped({ ...ctx, block, examDate: ev?.date, existing });
    insertBlocks(r.blocks); created = r.blocks.length; warnings = r.warnings;
  }
  res.json({ ok: true, created, warnings });
}));

router.delete('/schedule/blocks', wrap((req, res) => { run("DELETE FROM study_blocks WHERE status = 'planned'"); res.json({ ok: true }); }));

// Download everything as .ics to import into Google Calendar (Settings -> Import). No Google sign-in required.
router.get('/schedule/export.ics', wrap((req, res) => {
  const { today } = localToday();
  const names = new Map(all('SELECT id, name FROM subjects').map((s) => [s.id, s.name]));
  const body = ics.buildIcs({
    blocks: all("SELECT * FROM study_blocks WHERE date >= ? AND status != 'skipped'", today),
    events: all('SELECT * FROM events WHERE date >= ?', today),
    subjectName: (id) => names.get(id) || '',
  });
  res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="dostudy-plan.ics"' }).send(body);
}));

module.exports = router;
