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

  setDisplay(document.getElementById('sideNav'), 'none');
  setDisplay(document.getElementById('bottomNav'), authed ? 'flex' : 'none');
  setDisplay(document.getElementById('hudBar'), authed ? 'flex' : 'none');

  const wrapper = document.querySelector('.app-wrapper');
  if (wrapper) {
    wrapper.classList.toggle('exam-mode', examMode);
    wrapper.classList.toggle('practice-mode', !!state.practiceActive);
  }

  if (!authed && view !== 'login') view = 'login';
  const viewEl = document.getElementById(view);
  if (viewEl) {
    viewEl.style.display = view === 'login' ? 'flex' : 'block';
    viewEl.style.animation = 'none';
    void viewEl.offsetHeight;
    viewEl.style.animation = 'pageEnter 0.6s cubic-bezier(0.22,1,0.36,1)';
  }

  document.querySelectorAll('.bottom-nav button[data-view]').forEach(btn => {
    btn.classList.toggle('nav-current', btn.getAttribute('data-view') === view);
  });

  const renderer = viewRenderers[view];
  if (renderer) {
    try { renderer(); } catch (error) { console.error('View render failed', error); }
  }

  if (authed) {
    const tag = document.getElementById('navStudentTag');
    if (tag) tag.innerText = `🧑‍🎓 ${state.currentStudent.name} (${state.currentStudent.regNumber})`;
    updateHud();
    window.updateSoundToggleUI?.();
  }
}
window.navigateTo = navigateTo;

export function updateHud() {
  const student = state.currentStudent;
  if (!student) return;
  const progress = getProgress(student.regNumber);
  const rank = rankForXp(progress.xp);
  const xpEl = document.getElementById('hudXp');
  const streakEl = document.getElementById('hudStreak');
  const rankEl = document.getElementById('hudRank');
  if (xpEl) xpEl.textContent = `XP ${formatXp(progress.xp)}`;
  if (streakEl) streakEl.textContent = `STREAK ${progress.streak || 0}`;
  if (rankEl) {
    rankEl.textContent = rank.title;
    rankEl.style.color = rank.color;
  }
}
window.updateHud = updateHud;

window.requireCourseThen = async function (action) {
  Sound.click();
  if (!state.currentStudent) { navigateTo('login'); return; }
  let allCourses = [];
  try { allCourses = await DB.getCourses(); }
  catch (error) {
    console.error(error);
    toast('Could not load missions. Retrying local arsenal.', 'error');
    return;
  }
  if (!allCourses.length) { toast('No missions deployed yet. Command Center needs to add courses.', 'error'); Sound.error(); return; }
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
  else if (action === 'topics') window.openTopicsModal('exam');
  else if (action === 'flashcards') window.openTopicsModal('flashcards');
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
    <button class="topic-btn" data-course="${c.id}">📘 ${escapeHtml(c.name)} <span class="topic-badge">${escapeHtml(c.code)}</span></button>
  `).join('');
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => { Sound.select(); onPick(btn.getAttribute('data-course')); });
  });
  document.getElementById('courseSelectModal')?.classList.add('active');
}
window.closeSelectModal = function () { Sound.tap(); document.getElementById('courseSelectModal')?.classList.remove('active'); };
