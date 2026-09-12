import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml } from './utils.js';
// NOTE: deliberately not importing topics.js here (it imports exam.js/flashcards.js,
// which import navigateTo/viewRenderers from this file) — importing it back would
// create a module cycle. topics.js attaches itself to window, so we call it that way.

// Other modules register a render function here for their view, e.g.
//   viewRenderers.dashboard = renderDashboard;
// This avoids circular-import headaches between nav.js and every view module.
export const viewRenderers = {};

const VIEWS = ['login', 'dashboard', 'cbt', 'corrections', 'flashcards'];

export function navigateTo(view) {
  VIEWS.forEach(v => { const el = document.getElementById(v); if (el) el.style.display = 'none'; });

  const authed = !!state.currentStudent;
  const examMode = authed && view === 'cbt' && state.examActive && !state.practiceActive;
  document.getElementById('sideNav').style.display = 'none';
  document.getElementById('bottomNav').style.display = authed ? 'flex' : 'none';
  document.querySelector('.app-wrapper').classList.toggle('exam-mode', examMode);
  document.querySelector('.app-wrapper').classList.toggle('practice-mode', state.practiceActive);

  if (!authed && !state.publicCourseLink && view !== 'login') view = 'login';
  document.getElementById(view).style.display = 'block';

  const renderer = viewRenderers[view];
  if (renderer) renderer();

  if (authed) {
    document.getElementById('navStudentTag').innerText = `🧑‍🎓 ${state.currentStudent.name} (${state.currentStudent.regNumber})`;
  }
}
window.navigateTo = navigateTo;

// "requireCourseThen": nav buttons for Exam/Topics/Flashcards need a course context first
window.requireCourseThen = async function (action) {
  if (!state.currentStudent) { navigateTo('login'); return; }
  const allCourses = await DB.getCourses();
  if (!allCourses.length) { alert('No courses have been created by the admin yet.'); return; }
  if (allCourses.length === 1) {
    state.currentCourseId = allCourses[0].id;
    runCourseAction(action);
    return;
  }
  state.pendingAction = action;
  openSelectModal(allCourses, (id) => { state.currentCourseId = id; window.closeSelectModal(); runCourseAction(state.pendingAction); });
};

function runCourseAction(action) {
  if (action === 'cbt') navigateTo('cbt');
  else if (action === 'course') navigateTo('dashboard');
  else if (action === 'topics') window.openTopicsModal('exam');
  else if (action === 'flashcards') window.openTopicsModal('flashcards');
}

window.pickCourseAndGo = function (courseId, action) {
  state.currentCourseId = courseId;
  runCourseAction(action);
};

function openSelectModal(courses, onPick) {
  const container = document.getElementById('courseSelectListContainer');
  container.innerHTML = courses.map(c => `
    <button class="topic-btn" data-course="${c.id}">📘 ${escapeHtml(c.name)} <span class="topic-badge">${escapeHtml(c.code)}</span></button>
  `).join('');
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => onPick(btn.getAttribute('data-course')));
  });
  document.getElementById('courseSelectModal').classList.add('active');
}
window.closeSelectModal = function () { document.getElementById('courseSelectModal').classList.remove('active'); };
