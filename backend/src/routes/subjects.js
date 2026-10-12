'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const config = require('../config');
const { all, get, run, insert, tx } = require('../db');
const docs = require('../services/documents');
const { HttpError, wrap, intParam, text, num } = require('./helpers');

const router = express.Router();

const DEFAULT_COMPONENTS = [['Quizzes', 20], ['Recitation / Participation', 10], ['Projects', 20], ['Midterm Exam', 20], ['Final Exam', 30]];

const subjectWithData = (s) => ({
  ...s,
  components: all('SELECT id, name, weight, score FROM components WHERE subject_id = ? ORDER BY position, id', s.id),
  counts: {
    files: get('SELECT COUNT(*) n FROM files WHERE subject_id = ?', s.id).n,
    reviewers: get('SELECT COUNT(*) n FROM reviewers WHERE subject_id = ?', s.id).n,
    flashcards: get('SELECT COUNT(*) n FROM flashcards WHERE subject_id = ?', s.id).n,
    tests: get('SELECT COUNT(*) n FROM tests WHERE subject_id = ?', s.id).n,
  },
});

const getSubject = (id) => {
  const s = get('SELECT * FROM subjects WHERE id = ?', id);
  if (!s) throw new HttpError(404, 'Subject not found.');
  return s;
};

router.get('/subjects', wrap((req, res) => {
  res.json(all('SELECT * FROM subjects ORDER BY id').map(subjectWithData));
}));

router.post('/subjects', wrap((req, res) => {
  const b = req.body || {};
  const id = tx(() => {
    const sid = insert('INSERT INTO subjects(name, teacher, units, color) VALUES (?,?,?,?)',
      text(b.name, { max: 120, required: true, name: 'Subject name' }), text(b.teacher, { max: 120 }),
      Math.round(num(b.units, { min: 1, max: 10, fallback: 3 })), /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#E0839C');
    DEFAULT_COMPONENTS.forEach(([n, w], i) => insert('INSERT INTO components(subject_id,name,weight,position) VALUES (?,?,?,?)', sid, n, w, i));
    return sid;
  });
  res.status(201).json(subjectWithData(getSubject(id)));
}));

router.put('/subjects/:id', wrap((req, res) => {
  const id = intParam(req.params.id); const s = getSubject(id); const b = req.body || {};
  run('UPDATE subjects SET name=?, teacher=?, units=?, color=? WHERE id=?',
    text(b.name ?? s.name, { max: 120, required: true, name: 'Subject name' }), text(b.teacher ?? s.teacher, { max: 120 }),
    Math.round(num(b.units ?? s.units, { min: 1, max: 10, fallback: 3 })), /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : s.color, id);
  res.json(subjectWithData(getSubject(id)));
}));

router.delete('/subjects/:id', wrap((req, res) => {
  const id = intParam(req.params.id); getSubject(id);
  for (const f of all('SELECT stored_name FROM files WHERE subject_id = ?', id)) fs.rmSync(path.join(config.UPLOAD_DIR, f.stored_name), { force: true });
  run('DELETE FROM subjects WHERE id = ?', id);
  res.json({ ok: true });
}));

// Replace all grade components (name / weight % / score % or null)
router.put('/subjects/:id/components', wrap((req, res) => {
  const id = intParam(req.params.id); getSubject(id);
  const list = Array.isArray(req.body?.components) ? req.body.components.slice(0, 30) : [];
  tx(() => {
    run('DELETE FROM components WHERE subject_id = ?', id);
    list.forEach((c, i) => insert('INSERT INTO components(subject_id,name,weight,score,position) VALUES (?,?,?,?,?)', id,
      text(c.name, { max: 80, required: true, name: 'Component name' }), num(c.weight, { min: 0, max: 100 }),
      c.score === null || c.score === '' || c.score === undefined ? null : num(c.score, { min: 0, max: 100 }), i));
  });
  res.json(subjectWithData(getSubject(id)));
}));

/* ---------- Files ---------- */
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, config.UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex')), // random name on disk (no path tricks)
  }),
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 10 },
});

router.get('/files', wrap((req, res) => {
  res.json(all(`SELECT f.id, f.subject_id, f.name, f.mime, f.size, f.created_at,
      (SELECT COUNT(*) FROM reviewers r WHERE r.file_id = f.id) reviewers,
      (SELECT COUNT(*) FROM flashcards c WHERE c.file_id = f.id) flashcards,
      (SELECT COUNT(*) FROM tests t WHERE t.file_id = f.id) tests
    FROM files f ORDER BY f.id DESC`));
}));

router.post('/subjects/:id/files', upload.array('files', 10), wrap(async (req, res) => {
  const subjectId = intParam(req.params.id); getSubject(subjectId);
  const saved = [], rejected = [];
  for (const f of req.files || []) {
    const name = Buffer.from(f.originalname, 'latin1').toString('utf8').replace(/[\\/\0]/g, '_').slice(0, 200);
    const mime = docs.mimeFor(name);
    const discard = (why) => { fs.rmSync(f.path, { force: true }); rejected.push({ name, reason: why }); };
    if (!mime) { discard(`Unsupported type. Use: ${docs.supportedList()}`); continue; }
    try {
      const textCache = await docs.extractText(f.path, mime);
      const id = insert('INSERT INTO files(subject_id,name,stored_name,mime,size,text_cache) VALUES (?,?,?,?,?,?)', subjectId, name, path.basename(f.path), mime, f.size, textCache || null);
      saved.push({ id, name });
    } catch (e) { discard(e.message); }
  }
  res.status(saved.length ? 201 : 400).json({ saved, rejected });
}));

router.delete('/files/:id', wrap((req, res) => {
  const id = intParam(req.params.id);
  const f = get('SELECT stored_name FROM files WHERE id = ?', id);
  if (!f) throw new HttpError(404, 'File not found.');
  fs.rmSync(path.join(config.UPLOAD_DIR, f.stored_name), { force: true });
  run('DELETE FROM files WHERE id = ?', id);
  res.json({ ok: true });
}));

module.exports = router;
