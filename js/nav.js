import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { Sound } from './sound.js';

export const viewRenderers = {};

const VIEWS = ['login', 'dashboard', 'cbt', 'corrections', 'flashcards'];

export function navigateTo(view) {
  try { Sound.whoosh(); } catch {}
  VIEWS.forEach(v => { const el = document.getElementById(v); if (el) el.style.display = 'none'; });

  const authed = !!state.currentStudent;
  const examMode = authed && view === 'cbt' && state.examActive && !state.practiceActive;
  document.getElementById('sideNav').style.display = 'none';
  document.getElementById('bottomNav').style.display = authed ? 'flex' : 'none';
  const hudBar = document.getElementById('hudBar');
  if (hudBar) hudBar.style.display = authed ? 'flex' : 'none';
  document.querySelector('.app-wrapper').classList.toggle('exam-mode', examMode);
  document.querySelector('.app-wrapper').classList.toggle('practice-mode', state.practiceActive);

  if (!authed && view !== 'login') view = 'login';
  document.getElementById(view).style.display = 'block';

  // Gamer transition effect
  const viewEl = document.getElementById(view);
  if (viewEl) {
    viewEl.style.animation = 'none';
    viewEl.offsetHeight; // trigger reflow
    viewEl.style.animation = 'pageEnter 0.6s cubic-bezier(0.22,1,0.36,1)';
  }

  const renderer = viewRenderers[view];
  if (renderer) renderer();

  if (authed) {
    const tag = document.getElementById('navStudentTag');
    if (tag) tag.innerText = `🧑‍🎓 ${state.currentStudent.name} (${state.currentStudent.regNumber})`;
    // Update HUD stats randomly for fun
    const xpEl = document.getElementById('hudXp');
    const streakEl = document.getElementById('hudStreak');
    if (xpEl) xpEl.textContent = `XP ${Math.floor(2000 + Math.random()*1000)}`;
    if (streakEl) streakEl.textContent = `STREAK ${Math.floor(3 + Math.random()*10)}`;
    window.updateSoundToggleUI?.();
  }
}
window.navigateTo = navigateTo;

window.requireCourseThen = async function (action) {
  Sound.click();
  if (!state.currentStudent) { navigateTo('login'); return; }
  const allCourses = await DB.getCourses();
  if (!allCourses.length) { alert('No courses have been created by the admin yet.'); Sound.error(); return; }
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
  container.innerHTML = courses.map(c => `
    <button class="topic-btn" data-course="${c.id}">📘 ${escapeHtml(c.name)} <span class="topic-badge">${escapeHtml(c.code)}</span></button>
  `).join('');
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => { Sound.select(); onPick(btn.getAttribute('data-course')); });
  });
  document.getElementById('courseSelectModal').classList.add('active');
}
window.closeSelectModal = function () { Sound.tap(); document.getElementById('courseSelectModal').classList.remove('active'); };
