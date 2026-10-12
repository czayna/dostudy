'use strict';
const express = require('express');
const { all, get, run, insert, tx } = require('../db');
const study = require('../services/study');
const { nextReview, toSql } = require('../services/srs');
const { HttpError, wrap, intParam, text, num } = require('./helpers');

const router = express.Router();

const getFile = (id) => {
  const f = get('SELECT * FROM files WHERE id = ?', id);
  if (!f) throw new HttpError(404, 'File not found.');
  return f;
};
const latestReviewer = (fileId) => {
  const r = get('SELECT content FROM reviewers WHERE file_id = ? ORDER BY id DESC LIMIT 1', fileId);
  return r ? JSON.parse(r.content) : null;
};
const addCards = (subjectId, fileId, cards) => {
  const have = new Set(all('SELECT front FROM flashcards WHERE subject_id = ?', subjectId).map((c) => c.front.toLowerCase()));
  let added = 0;
  tx(() => cards.forEach((c) => {
    if (have.has(c.front.toLowerCase())) return;
    insert('INSERT INTO flashcards(subject_id,file_id,front,back,hint) VALUES (?,?,?,?,?)', subjectId, fileId, c.front, c.back, c.hint || '');
    have.add(c.front.toLowerCase()); added++;
  }));
  return added;
};

/* ---------- Reviewer ---------- */
router.post('/files/:id/reviewer', wrap(async (req, res) => {
  const file = getFile(intParam(req.params.id));
  const content = await study.buildReviewer(file);
  const id = tx(() => {
    run('DELETE FROM reviewers WHERE file_id = ?', file.id); // one current reviewer per file
    return insert('INSERT INTO reviewers(subject_id,file_id,title,content) VALUES (?,?,?,?)', file.subject_id, file.id, content.title, JSON.stringify(content));
  });
  res.status(201).json({ id, ...content });
}));

router.get('/reviewers', wrap((req, res) => {
  const rows = all('SELECT id, subject_id, file_id, title, created_at, content FROM reviewers ORDER BY id DESC');
  res.json(rows.map(({ content, ...r }) => ({ ...r, topics: JSON.parse(content).topics.length })));
}));

router.get('/reviewers/:id', wrap((req, res) => {
  const r = get('SELECT * FROM reviewers WHERE id = ?', intParam(req.params.id));
  if (!r) throw new HttpError(404, 'Reviewer not found.');
  res.json({ id: r.id, subject_id: r.subject_id, file_id: r.file_id, created_at: r.created_at, ...JSON.parse(r.content) });
}));

router.delete('/reviewers/:id', wrap((req, res) => { run('DELETE FROM reviewers WHERE id = ?', intParam(req.params.id)); res.json({ ok: true }); }));

// "I still don't get it" - a fresh explanation, saved so you can re-read it later
router.post('/reviewers/:id/reexplain', wrap(async (req, res) => {
  const id = intParam(req.params.id);
  const r = get('SELECT * FROM reviewers WHERE id = ?', id);
  if (!r) throw new HttpError(404, 'Reviewer not found.');
  const content = JSON.parse(r.content);
  const idx = Number(req.body?.topicIndex);
  const topic = content.topics[idx];
  if (!topic) throw new HttpError(400, 'Unknown topic.');
  const style = ['simpler', 'analogy', 'steps', 'example'].includes(req.body?.style) ? req.body.style : 'simpler';
  const explanation = await study.reexplain(topic, style);
  topic.alternatives = [...(topic.alternatives || []), explanation].slice(-8);
  run('UPDATE reviewers SET content = ? WHERE id = ?', JSON.stringify(content), id);
  res.json({ explanation, count: topic.alternatives.length });
}));

/* ---------- Recitation wingman ---------- */
router.post('/files/:id/recitation', wrap(async (req, res) => {
  res.json(await study.buildRecitation(getFile(intParam(req.params.id))));
}));

/* ---------- Flashcards (spaced repetition) ---------- */
router.post('/files/:id/flashcards', wrap(async (req, res) => {
  const file = getFile(intParam(req.params.id));
  const cards = await study.buildFlashcards(file);
  res.status(201).json({ generated: cards.length, added: addCards(file.subject_id, file.id, cards) });
}));

router.post('/flashcards', wrap((req, res) => {
  const subjectId = intParam(req.body?.subject_id, 'subject');
  if (!get('SELECT id FROM subjects WHERE id = ?', subjectId)) throw new HttpError(404, 'Subject not found.');
  const id = insert('INSERT INTO flashcards(subject_id,front,back,hint) VALUES (?,?,?,?)', subjectId,
    text(req.body?.front, { max: 600, required: true, name: 'Front' }), text(req.body?.back, { max: 1200, required: true, name: 'Back' }), text(req.body?.hint, { max: 300 }));
  res.status(201).json({ id });
}));

router.get('/flashcards', wrap((req, res) => {
  const where = [], params = [];
  if (req.query.subjectId) { where.push('subject_id = ?'); params.push(intParam(req.query.subjectId, 'subject')); }
  if (req.query.due === '1') where.push("due_at <= datetime('now')");
  const limit = Math.round(num(req.query.limit, { min: 1, max: 500, fallback: 200 }));
  res.json(all(`SELECT id, subject_id, file_id, front, back, hint, reps, last_rating, due_at FROM flashcards ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY due_at LIMIT ${limit}`, ...params));
}));

router.get('/flashcards/stats', wrap((req, res) => {
  res.json(all(`SELECT subject_id, COUNT(*) total,
      SUM(CASE WHEN due_at <= datetime('now') THEN 1 ELSE 0 END) due,
      SUM(CASE WHEN reps >= 3 THEN 1 ELSE 0 END) mastered FROM flashcards GROUP BY subject_id`));
}));

router.post('/flashcards/:id/rate', wrap((req, res) => {
  const id = intParam(req.params.id);
  const c = get('SELECT reps FROM flashcards WHERE id = ?', id);
  if (!c) throw new HttpError(404, 'Card not found.');
  const rating = Math.round(num(req.body?.rating, { min: 1, max: 5, fallback: 1 }));
  const n = nextReview(rating, c.reps);
  run('UPDATE flashcards SET reps = ?, last_rating = ?, due_at = ? WHERE id = ?', n.reps, rating, toSql(n.dueAt), id);
  res.json({ reps: n.reps, nextInMinutes: n.minutes });
}));

router.delete('/flashcards/:id', wrap((req, res) => { run('DELETE FROM flashcards WHERE id = ?', intParam(req.params.id)); res.json({ ok: true }); }));

/* ---------- Practice tests ---------- */
router.post('/files/:id/tests', wrap(async (req, res) => {
  const file = getFile(intParam(req.params.id));
  const count = Math.round(num(req.body?.count, { min: 5, max: 40, fallback: 20 }));
  const t = await study.buildTest(file, count);
  const id = insert('INSERT INTO tests(subject_id,file_id,title,questions) VALUES (?,?,?,?)', file.subject_id, file.id, t.title, JSON.stringify(t.questions));
  res.status(201).json({ id, title: t.title, questions: t.questions.length });
}));

router.get('/tests', wrap((req, res) => {
  const rows = all(`SELECT t.id, t.subject_id, t.file_id, t.title, t.created_at, t.questions,
    (SELECT MAX(score * 100.0 / total) FROM test_attempts a WHERE a.test_id = t.id) best,
    (SELECT COUNT(*) FROM test_attempts a WHERE a.test_id = t.id) attempts FROM tests t ORDER BY t.id DESC`);
  res.json(rows.map(({ questions, ...t }) => ({ ...t, questions: JSON.parse(questions).length })));
}));

router.get('/tests/:id', wrap((req, res) => {
  const t = get('SELECT * FROM tests WHERE id = ?', intParam(req.params.id));
  if (!t) throw new HttpError(404, 'Test not found.');
  res.json({ ...t, questions: JSON.parse(t.questions) });
}));

router.post('/tests/:id/attempts', wrap((req, res) => {
  const id = intParam(req.params.id);
  if (!get('SELECT id FROM tests WHERE id = ?', id)) throw new HttpError(404, 'Test not found.');
  const total = Math.round(num(req.body?.total, { min: 1, max: 100, fallback: 1 }));
  const score = Math.round(num(req.body?.score, { min: 0, max: total }));
  const weak = Array.isArray(req.body?.weakTopics) ? req.body.weakTopics.map((s) => text(s, { max: 200 })).filter(Boolean).slice(0, 20) : [];
  insert('INSERT INTO test_attempts(test_id,score,total,weak_topics) VALUES (?,?,?,?)', id, score, total, JSON.stringify(weak));
  res.status(201).json({ ok: true });
}));

router.get('/tests/:id/attempts', wrap((req, res) => {
  res.json(all('SELECT id, score, total, weak_topics, created_at FROM test_attempts WHERE test_id = ? ORDER BY id DESC LIMIT 20', intParam(req.params.id)).map((a) => ({ ...a, weak_topics: JSON.parse(a.weak_topics) })));
}));

router.delete('/tests/:id', wrap((req, res) => { run('DELETE FROM tests WHERE id = ?', intParam(req.params.id)); res.json({ ok: true }); }));

/* ---------- Tutor chat + voice call ---------- */
const MODES = ['chat', 'feynman', 'blitz', 'recitation', 'socratic'];
const cleanMessages = (m) => (Array.isArray(m) ? m.slice(-30).map((x) => ({ role: x?.role === 'model' ? 'model' : 'user', text: text(x?.text, { max: 3000 }) })).filter((x) => x.text) : []);

router.post('/tutor/chat', wrap(async (req, res) => {
  const b = req.body || {};
  const file = b.fileId ? getFile(intParam(b.fileId, 'file')) : null;
  const reply = await study.tutorTurn({
    file, reviewer: file ? latestReviewer(file.id) : null,
    mode: MODES.includes(b.mode) ? b.mode : 'chat', spoken: Boolean(b.spoken), messages: cleanMessages(b.messages),
  });
  res.json({ reply });
}));

router.post('/tutor/summary', wrap(async (req, res) => {
  const b = req.body || {};
  const messages = cleanMessages(b.messages);
  if (messages.length < 2) throw new HttpError(400, 'Talk a little first, then I can summarize.');
  const s = await study.sessionSummary(messages);
  let cardsAdded = 0;
  if (b.saveCards && b.subjectId && get('SELECT id FROM subjects WHERE id = ?', intParam(b.subjectId, 'subject'))) {
    cardsAdded = addCards(Number(b.subjectId), b.fileId ? Number(b.fileId) : null, s.cards);
  }
  res.json({ ...s, cardsAdded });
}));

module.exports = router;
