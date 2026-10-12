import { $, $$, closeModal, esc, loading, toast, fmt } from './ui.js?v=2';
import { loadCore, state } from './state.js?v=2';
import * as dashboard from './views/dashboard.js?v=4';
import * as subjects from './views/subjects.js?v=4';
import * as files from './views/files.js?v=4';
import * as reviewer from './views/reviewer.js?v=4';
import * as flashcards from './views/flashcards.js?v=4';
import * as tests from './views/tests.js?v=4';
import * as tutor from './views/tutor.js?v=4';
import * as schedule from './views/schedule.js?v=4';
import * as gwa from './views/gwa.js?v=4';

const routes = { dashboard, subjects, files, reviewer, flashcards, tests, tutor, schedule, gwa };
let cleanup = null; // views can return a cleanup function (e.g. stop the voice call)

export function parseHash() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [name, arg] = path.split('/');
  return { name: routes[name] ? name : 'dashboard', arg, params: Object.fromEntries(new URLSearchParams(query)) };
}

export function updateChrome() {
  const chip = $('#goal-chip');
  if (chip) chip.remove();
  const h = state.health;
  $('#ai-banner').innerHTML = h && !h.ai.configured
    ? `<div class="callout warn" style="margin-bottom:18px"><strong>Gemini key needed for the AI features.</strong> Create a file named <code>.env</code> in the DOSTUDY folder with <code>GEMINI_API_KEY=your_key</code>, then restart. Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. Everything else works without it.</div>`
    : '';
}

export async function render() {
  closeModal();
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } }
  cleanup = null;
  const { name, arg, params } = parseHash();
  const view = routes[name];
  $$('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  $('#page-title').textContent = view.meta.title;
  $('#page-sub').textContent = view.meta.sub;
  updateChrome();
  const root = $('#view');
  loading(root);
  try { cleanup = await view.render(root, { arg, params }); }
  catch (e) { root.innerHTML = `<div class="callout bad">${esc(e.message)}</div>`; }
  window.scrollTo({ top: 0 });
}

(async function boot() {
  try { await loadCore(); } catch (e) { $('#view').innerHTML = `<div class="callout bad">${esc(e.message)}</div>`; return; }
  window.addEventListener('hashchange', render);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  $('#modal-x').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message || 'Something went wrong.', 'bad'));
  if (!location.hash) location.hash = '#/dashboard'; else render();
})();
