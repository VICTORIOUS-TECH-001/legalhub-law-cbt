import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { viewRenderers } from './nav.js';
import { Sound } from './sound.js';

async function renderDashboard() {
  if (!state.currentStudent) return;
  document.getElementById('welcomeName').innerText = `Welcome, ${state.currentStudent.name} // PLAYER ONE`;

  const allCourses = await DB.getCourses();
  document.getElementById('dashCourseCount').innerText = `${allCourses.length} MISSIONS`;

  const grid = document.getElementById('courseGrid');
  const selectedPanel = document.getElementById('selectedCoursePanel');
  if (!allCourses.length) {
    grid.innerHTML = `<div class="glass-card" style="text-align:center;"><div style="font-size:2rem;">🎮</div><p>No missions deployed yet. Contact Command Center.</p></div>`;
    selectedPanel.style.display = 'none';
    return;
  }

  const selected = allCourses.find(c => c.id === state.currentCourseId);
  const cards = await Promise.all(allCourses.map(async c => {
    const qCount = (await DB.getQuestions({ courseId: c.id })).length;
    const tCount = (await DB.getTopics(c.id)).length;
    return `
      <button class="glass-card course-card ${state.currentCourseId === c.id ? 'course-card-selected' : ''}" onclick="selectCourse('${c.id}')">
        <h3>⚔️ ${escapeHtml(c.name)}</h3>
        <span class="course-code">${escapeHtml(c.code)} • ${qCount} Qs • ${tCount} topics • LVL ${Math.min(99, Math.floor(qCount/5)+1)}</span>
        <div class="xp-bar" style="margin-top:0.5rem;"><div class="xp-fill" style="width:${Math.min(100, qCount*2)}%;"></div></div>
        <span class="course-select-hint">${state.currentCourseId === c.id ? '▶ ACTIVE MISSION' : '▶ SELECT MISSION'}</span>
      </button>`;
  }));
  grid.innerHTML = cards.join('');
  grid.style.display = 'grid';
  if (!selected) {
    selectedPanel.innerHTML = '';
    selectedPanel.style.display = 'none';
    return;
  }
  grid.style.display = 'none';

  const topics = await DB.getTopics(selected.id);
  const questions = await DB.getQuestions({ courseId: selected.id });
  selectedPanel.innerHTML = `
    <div class="flex-between">
      <div><span class="progress-badge">🎯 ACTIVE MISSION</span><h3>⚔️ ${escapeHtml(selected.name)}</h3></div>
      <span class="course-code">${escapeHtml(selected.code)} // ${questions.length} TOTAL AMMO</span>
    </div>
    <p class="selected-course-copy">Choose your <span style="color:var(--neon-cyan); font-weight:700;">BATTLE MODE</span> — exam, practice, neural deck, or war logs.</p>
    <div class="course-actions">
      <button class="btn-primary" onclick="pickCourseAndGo('${selected.id}','cbt')">⚔️ START WAR</button>
      <button class="btn-primary" style="background: linear-gradient(135deg,#7b3ce7,#5b21b6);" onclick="openTopicsModal('practice')">🎯 TRAINING</button>
      <button class="btn-primary" style="background: linear-gradient(135deg,#00bcd4,#00897b);" onclick="pickCourseAndGo('${selected.id}','flashcards')">🧠 NEURAL DECK</button>
      <button class="btn-primary" style="background: transparent; border:1px solid var(--neon-cyan); color:var(--neon-cyan);" onclick="navigateTo('corrections')">📜 WAR LOGS</button>
    </div>
    <div class="selected-topic-list" style="margin-top:1.2rem;">
      <strong style="font-family:'Orbitron'; letter-spacing:0.05em;">📚 TOPIC ARSENAL</strong>
      <div class="topic-hub-grid">${topics.length ? topics.map(topic => `
        <div class="topic-hub-card"><strong>📖 ${escapeHtml(topic.name)}</strong>
          <span>⚡ ${questions.filter(q => q.topicId === topic.id).length} questions // READY</span>
          <div class="xp-bar"><div class="xp-fill" style="width:${Math.min(100, questions.filter(q=>q.topicId===topic.id).length*8)}%"></div></div>
          <div class="topic-hub-actions">
            <button class="admin-btn" onclick="startPracticeByTopic('${topic.id}')">🎯 Practice</button>
            <button class="admin-btn exam-btn" onclick="startExamByTopic('${topic.id}')">⚔️ Battle</button>
          </div>
        </div>`).join('') : '<p style="margin-top:0.6rem; opacity:0.6;">No topics deployed yet. Awaiting Command Center input.</p>'}</div>
    </div>
    <div style="margin-top:1rem; text-align:center;">
      <button class="admin-btn" style="background:transparent; border:1px solid rgba(255,255,255,0.15); color:#aaa;" onclick="showCourseList()">◀ BACK TO BASE</button>
    </div>`;
  selectedPanel.style.display = 'block';
}

viewRenderers.dashboard = renderDashboard;

window.selectCourse = function (courseId) {
  Sound.select();
  state.currentCourseId = courseId;
  renderDashboard();
};

window.showCourseList = function () {
  Sound.whoosh();
  if (state.examActive && window.resetExamEnvironment) window.resetExamEnvironment();
  state.currentCourseId = null;
  window.navigateTo('dashboard');
};
