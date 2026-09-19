import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml, toast } from './utils.js';
import { Sound } from './sound.js';
import { getProgress, formatXp, rankForXp } from './progress.js';

export const viewRenderers = {};

const VIEWS = ['login', 'dashboard', 'cbt', 'corrections', 'flashcards'];

function setDisplay(el, value) {
  if (el) el.style.display = value;
}

export function navigateTo(view) {
  try { Sound.whoosh(); } catch { /* audio optional */ }

  VIEWS.forEach(v => setDisplay(document.getElementById(v), 'none'));

  const authed = !!state.currentStudent;
  const examMode = authed && view === 'cbt' && state.examActive && !state.practiceActive;

  setDisplay(document.getElementById('bottomNav'), authed ? 'flex' : 'none');
  setDisplay(document.getElementById('topBar'), authed ? 'block' : 'none');
  document.body.classList.toggle('is-authed', authed);
  document.body.classList.toggle('focus-mode', examMode);

  if (!authed && view !== 'login') view = 'login';
  const viewEl = document.getElementById(view);
  if (viewEl) {
    viewEl.style.display = view === 'login' ? 'flex' : 'block';
    viewEl.style.animation = 'none';
    void viewEl.offsetHeight;
    viewEl.style.animation = 'pageEnter 0.45s cubic-bezier(0.22,1,0.36,1)';
  }

  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.classList.toggle('nav-current', btn.getAttribute('data-view') === view);
  });

  const renderer = viewRenderers[view];
  if (renderer) {
    try { renderer(); } catch (error) { console.error('View render failed', error); }
  }

  if (authed) updateHud();
  window.updateSoundToggleUI?.();
  window.scrollTo({ top: 0, behavior: 'auto' });
}
window.navigateTo = navigateTo;

export function updateHud() {
  const student = state.currentStudent;
  if (!student) return;
  const progress = getProgress(student.regNumber);
  const rank = rankForXp(progress.xp);
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  setText('hudXp', `${formatXp(progress.xp)} pts`);
  setText('hudStreak', `${progress.streak || 0}-day streak`);
  setText('hudRank', rank.title);
  setText('hudName', student.name);
  setText('hudReg', student.regNumber);
  const avatar = document.getElementById('hudAvatar');
  if (avatar) avatar.textContent = initials(student.name);
}
window.updateHud = updateHud;

export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || '?';
}

/**
 * Make sure a course is selected, then run `action`.
 * Actions: 'cbt' | 'course' | 'practice' | 'exam' | 'flashcards'
 */
window.requireCourseThen = async function (action) {
  Sound.click();
  if (!state.currentStudent) { navigateTo('login'); return; }
  let allCourses = [];
  try { allCourses = await DB.getCourses(); }
  catch (error) {
    console.error(error);
    toast('Could not load courses. Please try again.', 'error');
    return;
  }
  if (!allCourses.length) { toast('No courses have been published yet. Ask the administrator to add one.', 'error'); Sound.error(); return; }
  if (state.currentCourseId && allCourses.some(c => c.id === state.currentCourseId)) {
    runCourseAction(action);
    return;
  }
  if (allCourses.length === 1) {
    state.currentCourseId = allCourses[0].id;
    runCourseAction(action);
    return;
  }
  state.pendingAction = action;
  openSelectModal(allCourses, (id) => { state.currentCourseId = id; window.closeSelectModal(); runCourseAction(state.pendingAction); });
};

function runCourseAction(action) {
  Sound.select();
  if (action === 'cbt') navigateTo('cbt');
  else if (action === 'course') navigateTo('dashboard');
  else if (action === 'practice' || action === 'exam' || action === 'flashcards') window.openSessionSetup(action);
  else if (action === 'topics') window.openSessionSetup('exam'); // legacy
}

window.pickCourseAndGo = function (courseId, action) {
  Sound.click();
  state.currentCourseId = courseId;
  runCourseAction(action);
};

function openSelectModal(courses, onPick) {
  Sound.whoosh();
  const container = document.getElementById('courseSelectListContainer');
  if (!container) return;
  container.innerHTML = courses.map(c => `
    <button type="button" class="topic-row" data-course="${c.id}">
      <span class="topic-row-main"><span class="topic-row-name">${escapeHtml(c.name)}</span></span>
      <span class="topic-row-meta">${escapeHtml(c.code)}</span>
      <span class="topic-row-arrow" aria-hidden="true">›</span>
    </button>`).join('');
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => { Sound.select(); onPick(btn.getAttribute('data-course')); });
  });
  document.getElementById('courseSelectModal')?.classList.add('active');
}
window.closeSelectModal = function () { Sound.tap(); document.getElementById('courseSelectModal')?.classList.remove('active'); };
