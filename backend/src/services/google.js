'use strict';
/* Google Classroom connector: STRICTLY READ-ONLY.
   - Only *.readonly OAuth scopes are ever requested.
   - The only Google API calls made are HTTP GET (see `gget`). There is no code path that can post, submit,
     edit, delete or send anything in your school account.
   - Tokens are encrypted at rest (AES-256-GCM) in your local database. */
const crypto = require('node:crypto');
const config = require('../config');
const { get, run, insert, all } = require('../db');
const { encrypt, decrypt } = require('../crypto');
const { classify } = require('./ics');

const SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
];
const COLORS = ['#E0839C', '#F8B4C0', '#C9A0DC', '#9CC5E0', '#A8D5BA', '#F2C48D'];

let pendingState = null; // CSRF protection for the OAuth round trip

const configured = () => Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);

function loadTokens() {
  const row = get('SELECT payload FROM google_auth WHERE id = 1');
  if (!row) return null;
  try { return decrypt(row.payload); } catch (_) { return null; }
}
const saveTokens = (t) => run('INSERT INTO google_auth(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload', encrypt(t));

function status() {
  return { configured: configured(), connected: Boolean(loadTokens()), scopes: SCOPES.map((s) => s.split('/').pop()), redirectUri: config.GOOGLE_REDIRECT_URI };
}

function authUrl() {
  if (!configured()) throw new Error('Google is not set up yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env (see README).');
  pendingState = crypto.randomBytes(16).toString('hex');
  const q = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID, redirect_uri: config.GOOGLE_REDIRECT_URI, response_type: 'code',
    scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', state: pendingState,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenRequest(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.GOOGLE_CLIENT_ID, client_secret: config.GOOGLE_CLIENT_SECRET, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google sign-in failed: ${data.error_description || data.error || res.status}`);
  return data;
}

async function handleCallback(code, state) {
  if (!pendingState || state !== pendingState) throw new Error('Sign-in session expired or invalid. Please try connecting again.');
  pendingState = null;
  const t = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: config.GOOGLE_REDIRECT_URI });
  saveTokens({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + (t.expires_in - 60) * 1000 });
}

async function accessToken() {
  const t = loadTokens();
  if (!t) throw new Error('Google is not connected.');
  if (Date.now() < t.expires_at) return t.access_token;
  if (!t.refresh_token) throw new Error('Google session expired. Please reconnect.');
  const n = await tokenRequest({ refresh_token: t.refresh_token, grant_type: 'refresh_token' });
  saveTokens({ ...t, access_token: n.access_token, expires_at: Date.now() + (n.expires_in - 60) * 1000 });
  return n.access_token;
}

/** The ONLY function that talks to the Classroom API, and it can only GET. */
async function gget(path, params = {}) {
  const url = new URL(`https://classroom.googleapis.com/v1/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (!res.ok) throw new Error(`Google Classroom error (${res.status}).`);
  return res.json();
}

function disconnect() { run('DELETE FROM google_auth WHERE id = 1'); }

/** Import courses as subject folders and assignment due dates as events. Never writes anything to Google. */
async function sync() {
  const { courses = [] } = await gget('courses', { courseStates: 'ACTIVE', pageSize: '50' });
  let newSubjects = 0, newEvents = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const c of courses) {
    const ext = `gc:${c.id}`;
    let subj = get('SELECT id FROM subjects WHERE external_id = ?', ext);
    if (!subj) {
      const id = insert('INSERT INTO subjects(name, teacher, units, color, external_id) VALUES (?,?,?,?,?)',
        String(c.name).slice(0, 120), String(c.section || '').slice(0, 120), 3, COLORS[all('SELECT id FROM subjects').length % COLORS.length], ext);
      const defaults = [['Quizzes', 20], ['Recitation / Participation', 10], ['Projects', 20], ['Midterm Exam', 20], ['Final Exam', 30]];
      defaults.forEach(([n, w], i) => insert('INSERT INTO components(subject_id,name,weight,position) VALUES (?,?,?,?)', id, n, w, i));
      subj = { id }; newSubjects++;
    }
    let work = [];
    try { work = (await gget(`courses/${c.id}/courseWork`, { pageSize: '100' })).courseWork || []; } catch (_) { /* course may have none */ }
    for (const w of work) {
      if (!w.dueDate) continue;
      const date = `${w.dueDate.year}-${String(w.dueDate.month).padStart(2, '0')}-${String(w.dueDate.day).padStart(2, '0')}`;
      if (date < today) continue;
      const extId = `gc:cw:${w.id}`;
      if (get('SELECT id FROM events WHERE external_id = ?', extId)) continue;
      insert('INSERT INTO events(subject_id,title,kind,date,source,external_id) VALUES (?,?,?,?,?,?)',
        subj.id, String(w.title).slice(0, 200), classify(w.title) || 'deadline', date, 'classroom', extId);
      newEvents++;
    }
  }
  return { courses: courses.length, newSubjects, newEvents };
}

module.exports = { status, authUrl, handleCallback, disconnect, sync };
