'use strict';
/* Thin Gemini REST client (no SDK needed). The API key travels in a header, never in a URL or log. */
const config = require('./config');

class AIError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callGemini(body, attempt = 0) {
  if (!config.GEMINI_API_KEY) {
    throw new AIError('Gemini API key is missing. Add GEMINI_API_KEY to the .env file, then restart the server.', 503);
  }
  const url = `${config.GEMINI_BASE_URL}/v1beta/models/${encodeURIComponent(config.GEMINI_MODEL)}:generateContent`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.GEMINI_API_KEY },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AIError('Could not reach Gemini. Check your internet connection.', 503);
  }
  if ((res.status === 429 || res.status === 503) && attempt < 3) {
    await sleep(1500 * 2 ** attempt);
    return callGemini(body, attempt + 1);
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error?.message || ''; } catch (_) { /* ignore */ }
    if (res.status === 400 && /API key/i.test(detail)) throw new AIError('Your Gemini API key looks invalid. Check .env.', 401);
    throw new AIError(`Gemini error (${res.status}). ${detail}`.trim(), res.status === 429 ? 429 : 502);
  }
  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) {
    const why = data.promptFeedback?.blockReason || cand?.finishReason || 'empty response';
    throw new AIError(`Gemini returned nothing (${why}). Try again.`);
  }
  return { text, finishReason: cand?.finishReason };
}

/**
 * Generate text or JSON.
 * @param {object} o  { system, parts (array of Gemini parts), history ([{role,parts}]), json, temperature }
 */
async function generate({ system, parts = [], history = [], json = false, temperature = 0.6, maxOutputTokens = 16384 }) {
  const body = {
    contents: [...history, { role: 'user', parts }],
    generationConfig: { temperature, maxOutputTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const { text } = await callGemini(body);
  if (!json) return text.trim();
  return parseJson(text);
}

function parseJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch (_) { /* try to salvage */ }
  const start = Math.min(...['{', '['].map((c) => { const i = cleaned.indexOf(c); return i < 0 ? Infinity : i; }));
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (start !== Infinity && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) { /* fallthrough */ }
  }
  throw new AIError('The AI answer was cut off or malformed. Please try again.');
}

module.exports = { generate, AIError };
