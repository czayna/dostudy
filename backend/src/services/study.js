'use strict';
/* AI-powered study features. Every function builds the prompt, calls Gemini, validates the result,
   and returns clean data. Persistence happens in the routes. */
const { generate } = require('../gemini');
const P = require('../prompts');
const { partsFor } = require('./documents');

const str = (v, max = 4000) => String(v ?? '').slice(0, max).trim();
const strList = (v, max = 40) => (Array.isArray(v) ? v.map((x) => str(x, 1200)).filter(Boolean).slice(0, max) : []);

/** Run async tasks with limited concurrency, keeping result order. */
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await worker(items[i], i); }
  }));
  return results;
}

function cleanTopic(t, fallbackTitle) {
  return {
    title: str(t.title, 200) || fallbackTitle,
    why_it_matters: str(t.why_it_matters),
    analogy: str(t.analogy),
    plain_meaning: str(t.plain_meaning, 8000),
    steps: strList(t.steps),
    key_terms: (Array.isArray(t.key_terms) ? t.key_terms : []).map((k) => ({ term: str(k?.term, 200), simple: str(k?.simple, 800) })).filter((k) => k.term).slice(0, 40),
    formulas: (Array.isArray(t.formulas) ? t.formulas : []).map((f) => ({ name: str(f?.name, 200), formula: str(f?.formula, 400), plain: str(f?.plain, 800) })).filter((f) => f.formula).slice(0, 20),
    must_memorize: strList(t.must_memorize),
    exam_traps: strList(t.exam_traps),
    memory_hook: str(t.memory_hook, 800),
    check: { question: str(t.check?.question, 600), answer: str(t.check?.answer, 800) },
    alternatives: [],
  };
}

/** The "Perfect Reviewer": outline everything first (so nothing is skipped), then write each topic in depth. */
async function buildReviewer(file, onProgress = () => {}) {
  const src = partsFor(file);
  const outline = await generate({
    system: P.OUTLINE_SYSTEM, json: true, temperature: 0.3,
    parts: [...src, { text: 'Split this material into a complete list of topics now.' }],
  });
  const topics = (Array.isArray(outline.topics) ? outline.topics : []).slice(0, 40);
  if (!topics.length) throw new Error('The AI could not find topics in this file. Is it readable?');
  const titles = topics.map((t, i) => `${i + 1}. ${str(t.title, 200)}`).join('\n');
  let done = 0;
  const sections = await pool(topics, 3, async (t, i) => {
    const raw = await generate({
      system: P.TOPIC_SYSTEM, json: true, temperature: 0.5,
      parts: [...src, { text: `Full topic list (for context):\n${titles}\n\nWrite the reviewer section for topic ${i + 1}: "${str(t.title, 200)}".\nThis topic must cover: ${str(t.covers, 1500)}` }],
    });
    onProgress(++done, topics.length);
    return cleanTopic(raw, str(t.title, 200) || `Topic ${i + 1}`);
  });
  return { title: str(outline.title, 200) || file.name, summary: str(outline.summary, 3000), topics: sections };
}

async function reexplain(topic, style) {
  const text = await generate({
    system: P.REEXPLAIN_SYSTEM(style), temperature: 0.8,
    parts: [{ text: `Topic: ${topic.title}\nMeaning (previous explanation): ${topic.plain_meaning}\nPrevious analogy: ${topic.analogy}\nPrevious alternative explanations:\n${(topic.alternatives || []).map((a) => `- ${a.slice(0, 300)}`).join('\n') || '(none)'}` }],
  });
  return str(text, 4000);
}

async function buildFlashcards(file) {
  const out = await generate({
    system: P.FLASHCARD_SYSTEM, json: true, temperature: 0.4,
    parts: [...partsFor(file), { text: 'Create the flashcards now.' }],
  });
  const cards = (Array.isArray(out) ? out : out.cards || [])
    .map((c) => ({ front: str(c?.front, 600), back: str(c?.back, 1200), hint: str(c?.hint, 300) }))
    .filter((c) => c.front && c.back);
  if (!cards.length) throw new Error('No flashcards were produced. Please try again.');
  return cards.slice(0, 120);
}

function cleanQuestion(q) {
  const base = { level: Math.min(3, Math.max(1, Number(q.level) || 2)), topic: str(q.topic, 200), question: str(q.question, 1200) };
  if (!base.question) return null;
  if (q.type === 'mcq') {
    const options = strList(q.options, 6);
    const answer = Number(q.answer);
    if (options.length < 2 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
    const explanations = Array.isArray(q.explanations) ? q.explanations.map((e) => str(e, 800)) : [];
    return { ...base, type: 'mcq', options, answer, explanations: options.map((_, i) => explanations[i] || '') };
  }
  if (q.type === 'tf') return { ...base, type: 'tf', answer: q.answer === true || q.answer === 'true', explanation: str(q.explanation, 1000) };
  if (q.type === 'id') {
    const answer = str(q.answer, 300);
    if (!answer) return null;
    return { ...base, type: 'id', answer, accept: strList(q.accept, 10).map((s) => s.toLowerCase()), explanation: str(q.explanation, 1000) };
  }
  return null;
}

async function buildTest(file, count) {
  const out = await generate({
    system: P.TEST_SYSTEM(count), json: true, temperature: 0.6,
    parts: [...partsFor(file), { text: `Create the practice exam of ${count} questions now.` }],
  });
  const questions = (Array.isArray(out) ? out : out.questions || []).map(cleanQuestion).filter(Boolean);
  if (!questions.length) throw new Error('No valid questions were produced. Please try again.');
  return { title: str(out.title, 200) || `Practice test: ${file.name}`, questions };
}

async function buildRecitation(file) {
  const out = await generate({
    system: P.RECITATION_SYSTEM, json: true, temperature: 0.7,
    parts: [...partsFor(file), { text: 'Prepare the recitation cheat card now.' }],
  });
  return {
    points: (Array.isArray(out.points) ? out.points : []).slice(0, 5).map((p) => ({ type: str(p.type, 20), say_it: str(p.say_it, 800), why_it_works: str(p.why_it_works, 400) })),
    cold_call_answer: str(out.cold_call_answer, 800),
  };
}

/** One tutor / voice turn. `messages` = [{role:'user'|'model', text}]. Source material is attached to the first turn. */
async function tutorTurn({ file, reviewer, mode, spoken, messages }) {
  const ctx = [];
  if (reviewer) ctx.push({ text: `Reviewer of the study material (use it as your source of truth):\n${JSON.stringify(reviewer).slice(0, 120000)}` });
  else if (file) ctx.push(...partsFor(file));
  const msgs = messages.slice(-24).map((m) => ({ role: m.role === 'model' ? 'model' : 'user', text: str(m.text, 3000) })).filter((m) => m.text);
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw new Error('Nothing to answer.');
  const last = msgs.pop();
  const history = ctx.length ? [{ role: 'user', parts: ctx }, { role: 'model', parts: [{ text: 'Got the material. Ready when you are.' }] }] : [];
  msgs.forEach((m) => history.push({ role: m.role, parts: [{ text: m.text }] }));
  return generate({ system: P.voiceSystem(mode, spoken), history, parts: [{ text: last.text }], temperature: 0.7, maxOutputTokens: spoken ? 400 : 1500 });
}

async function sessionSummary(messages) {
  const transcript = messages.slice(-60).map((m) => `${m.role === 'model' ? 'Buddy' : 'Student'}: ${str(m.text, 1500)}`).join('\n');
  const out = await generate({ system: P.SESSION_SUMMARY_SYSTEM, json: true, temperature: 0.4, parts: [{ text: transcript }] });
  return {
    summary: str(out.summary, 1500), strengths: strList(out.strengths, 8), gaps: strList(out.gaps, 8),
    cards: (Array.isArray(out.cards) ? out.cards : []).map((c) => ({ front: str(c?.front, 600), back: str(c?.back, 1200), hint: str(c?.hint, 300) })).filter((c) => c.front && c.back).slice(0, 8),
  };
}

module.exports = { buildReviewer, reexplain, buildFlashcards, buildTest, buildRecitation, tutorTurn, sessionSummary };
