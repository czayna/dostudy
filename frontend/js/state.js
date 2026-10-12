import { get } from './api.js';

export const state = { subjects: [], goal: 1.35, health: null };

export async function loadCore() {
  const [subjects, settings, health] = await Promise.all([get('/subjects'), get('/settings'), get('/health')]);
  state.subjects = subjects; state.goal = settings.goal; state.health = health;
}
export const reloadSubjects = async () => { state.subjects = await get('/subjects'); };
export const subjectById = (id) => state.subjects.find((s) => s.id === Number(id));
export const subjectName = (id) => subjectById(id)?.name || 'Subject';
export const subjectColor = (id) => subjectById(id)?.color || '#E0839C';
export const subjectOptions = (selected, withAll = false) =>
  (withAll ? `<option value="">All subjects</option>` : '') +
  state.subjects.map((s) => `<option value="${s.id}" ${Number(selected) === s.id ? 'selected' : ''}>${s.name.replace(/</g, '&lt;')}</option>`).join('');
