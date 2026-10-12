'use strict';
const fs = require('node:fs');
const path = require('node:path');
const mammoth = require('mammoth');
const JSZip = require('jszip');
const config = require('../config');

const TYPES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain', '.md': 'text/markdown',
};
const INLINE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
const MAX_INLINE_BYTES = 14 * 1024 * 1024; // Gemini inline request limit is ~20MB after base64
const MAX_TEXT_CHARS = 1_500_000;

const mimeFor = (name) => TYPES[path.extname(name).toLowerCase()] || null;
const isSupported = (name) => Boolean(mimeFor(name));
const supportedList = () => Object.keys(TYPES).join(', ');

async function pptxText(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const slides = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
  const out = [];
  for (const [i, name] of slides.entries()) {
    const xml = await zip.files[name].async('string');
    const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
    const decoded = texts.join(' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    out.push(`--- Slide ${i + 1} ---\n${decoded}`);
  }
  return out.join('\n\n');
}

/** Extract text for non-inline types. Returns '' for PDFs/images (Gemini reads those directly). */
async function extractText(filePath, mime) {
  if (INLINE.has(mime)) return '';
  let text = '';
  if (mime.includes('wordprocessingml')) text = (await mammoth.extractRawText({ path: filePath })).value;
  else if (mime.includes('presentationml')) text = await pptxText(filePath);
  else text = fs.readFileSync(filePath, 'utf8');
  text = text.trim();
  if (!text) throw new Error('No readable text was found in this file.');
  return text.slice(0, MAX_TEXT_CHARS);
}

/** Build Gemini "parts" for one stored file. */
function partsFor(file) {
  const full = path.join(config.UPLOAD_DIR, file.stored_name);
  if (INLINE.has(file.mime)) {
    if (!fs.existsSync(full)) throw new Error('The stored file is missing from disk.');
    if (file.size > MAX_INLINE_BYTES) throw new Error('This PDF/image is too large for the AI (max ~14 MB). Split it into smaller parts.');
    return [
      { text: `Study material file: "${file.name}"` },
      { inlineData: { mimeType: file.mime, data: fs.readFileSync(full).toString('base64') } },
    ];
  }
  return [{ text: `Study material "${file.name}":\n\n${file.text_cache || ''}` }];
}

module.exports = { mimeFor, isSupported, supportedList, extractText, partsFor };
