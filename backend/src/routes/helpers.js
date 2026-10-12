'use strict';
const { AIError } = require('../gemini');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const intParam = (v, name = 'id') => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, `Invalid ${name}.`);
  return n;
};

const text = (v, { max = 200, required = false, name = 'value' } = {}) => {
  const s = String(v ?? '').trim().slice(0, max);
  if (required && !s) throw new HttpError(400, `${name} is required.`);
  return s;
};

const num = (v, { min = -Infinity, max = Infinity, fallback = 0 } = {}) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

function localToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return { today: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, nowMin: d.getHours() * 60 + d.getMinutes() };
}

/** Final error handler: friendly JSON, never leaks stack traces or secrets. */
function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError || err instanceof AIError) return res.status(err.status).json({ error: err.message });
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'That file is too large (max 25 MB).' });
  if (err?.name === 'MulterError') return res.status(400).json({ error: 'Upload failed. Please try again.' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request data.' });
  console.error('[error]', req.method, req.path, err?.message);
  res.status(500).json({ error: err?.message && !/SQLITE|ENOENT|EACCES/.test(err.message) ? err.message : 'Something went wrong on the server.' });
}

module.exports = { HttpError, wrap, intParam, text, num, isDate, isTime, localToday, errorHandler };
