'use strict';
/* Calendar import (.ics from school) and export (.ics for Google Calendar). No Google sign-in needed for either. */

const pad = (n) => String(n).padStart(2, '0');

const unfold = (text) => text.replace(/\r?\n[ \t]/g, '');
const unescapeText = (s) => s.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
const escapeText = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

const KIND_RULES = [
  ['exam', /\b(final|finals|midterm|mid-term|exam|examination|periodical|prelim|preliminary|long test)\b/i],
  ['quiz', /\b(quiz|seatwork|recitation|oral)\b/i],
  ['deadline', /\b(due|deadline|submit|submission|project|assignment|activity|paper|report|defense)\b/i],
];
const classify = (text) => (KIND_RULES.find(([, re]) => re.test(text)) || [null])[0];

function icsDate(value) {
  const m = value.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return null;
  if (m[7]) { // UTC time -> convert to local date
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Parse a school .ics. Returns only exams / quizzes / deadlines; ordinary classes are ignored. */
function parseIcs(text) {
  const events = [];
  let ignored = 0;
  const blocks = unfold(text).split(/BEGIN:VEVENT/i).slice(1);
  for (const raw of blocks) {
    const body = raw.split(/END:VEVENT/i)[0];
    const prop = (name) => {
      const m = body.match(new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, 'im'));
      return m ? m[1].trim() : '';
    };
    const summary = unescapeText(prop('SUMMARY'));
    const description = unescapeText(prop('DESCRIPTION'));
    const date = icsDate(prop('DTSTART'));
    if (!summary || !date) { ignored++; continue; }
    const kind = classify(`${summary} ${description.slice(0, 200)}`);
    if (!kind) { ignored++; continue; }
    events.push({ uid: prop('UID') || `${summary}-${date}`, title: summary.slice(0, 200), kind, date });
  }
  return { events, ignored };
}

/** Build an .ics with study sessions (and optionally the exams). Floating local times, so it lands at the right hour. */
function buildIcs({ blocks, events = [], subjectName = () => '' }) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DOSTUDY//Study Plan//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:DOSTUDY Study Plan'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const TASK = { reviewer: 'Read reviewer', flashcards: 'Flashcards', practice: 'Practice test', recap: 'Final recap' };
  for (const b of blocks) {
    if (b.status === 'skipped') continue;
    const [h, m] = b.start.split(':').map(Number);
    const startMin = h * 60 + m, endMin = startMin + b.minutes;
    const d = b.date.replace(/-/g, '');
    const t = (n) => `${pad(Math.floor(n / 60) % 24)}${pad(n % 60)}00`;
    lines.push('BEGIN:VEVENT', `UID:dostudy-block-${b.id}@dostudy.local`, `DTSTAMP:${stamp}`,
      `DTSTART:${d}T${t(startMin)}`, `DTEND:${d}T${t(endMin)}`,
      `SUMMARY:${escapeText(`📖 ${TASK[b.task] || 'Study'}: ${subjectName(b.subject_id) || 'DOSTUDY'}`)}`,
      `DESCRIPTION:${escapeText(b.note || '')}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Study time', 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT');
  }
  for (const e of events) {
    const d = e.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:dostudy-event-${e.id}@dostudy.local`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`, `SUMMARY:${escapeText(`🎯 ${e.kind.toUpperCase()}: ${e.title}`)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

module.exports = { parseIcs, buildIcs, classify };
