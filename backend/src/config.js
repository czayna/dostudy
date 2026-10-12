'use strict';
/* Central configuration. Secrets only ever come from the environment (.env), never from code. */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

// Tiny .env loader (no dependency). Existing environment variables win.
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const val = m[2].replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
loadEnv(path.join(ROOT, '.env'));

// Where the database and uploaded files live (tests point this at a temporary folder).
const DATA_DIR = process.env.DOSTUDY_DATA_DIR ? path.resolve(process.env.DOSTUDY_DATA_DIR) : path.join(ROOT, 'database');

module.exports = {
  ROOT,
  PORT: Number(process.env.PORT) || 3000,
  HOST: '127.0.0.1', // local only. Nobody else on the network can reach DOSTUDY.
  FRONTEND_DIR: path.join(ROOT, 'frontend'),
  DB_DIR: DATA_DIR,
  DB_FILE: path.join(DATA_DIR, 'dostudy.db'),
  SCHEMA_FILE: path.join(ROOT, 'database', 'schema.sql'),
  UPLOAD_DIR: path.join(DATA_DIR, 'uploads'),
  MAX_UPLOAD_MB: 25,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  GEMINI_BASE_URL: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/google/callback',
};
