import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { viewRenderers } from './nav.js';

async function renderDashboard() {
  if (!state.currentStudent) return;
  document.getElementById('welcomeName').innerText = `Welcome, ${state.currentStudent.name} 👋`;

  const allCourses = await DB.getCourses();
  document.getElementById('dashCourseCount').innerText = `${allCourses.length} course${allCourses.length === 1 ? '' : 's'}`;

  const grid = document.getElementById('courseGrid');
  const selectedPanel = document.getElementById('selectedCoursePanel');
  if (!allCourses.length) {
    grid.innerHTML = `<div class="glass-card" style="text-align:center;">No courses have been created by the administrator yet.</div>`;
    selectedPanel.style.display = 'none';
    return;
  }

  const selected = allCourses.find(c => c.id === state.currentCourseId);
  const cards = await Promise.all(allCourses.map(async c => {
    const qCount = (await DB.getQuestions({ courseId: c.id })).length;
    return `
      <button class="glass-card course-card ${state.currentCourseId === c.id ? 'course-card-selected' : ''}" onclick="selectCourse('${c.id}')">
        <h3>${escapeHtml(c.name)}</h3>
        <span class="course-code">${escapeHtml(c.code)} • ${qCount} questions</span>
        <span class="course-select-hint">${state.currentCourseId === c.id ? 'Selected' : 'Choose course'}</span>
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
      <div><span class="progress-badge">Selected course</span><h3>${escapeHtml(selected.name)}</h3></div>
      <span class="course-code">${escapeHtml(selected.code)}</span>
    </div>
    <p class="selected-course-copy">Choose what you want to do in this course.</p>
    <div class="course-actions">
      <button class="btn-primary" onclick="pickCourseAndGo('${selected.id}','cbt')">▶ Start Exam</button>
        <button class="btn-primary" style="background: linear-gradient(135deg,#7b3ce7,#5b21b6);" onclick="openTopicsModal('practice')">🎯 Practice</button>
      <button class="btn-primary" style="background: linear-gradient(135deg,#00bcd4,#00897b);" onclick="pickCourseAndGo('${selected.id}','flashcards')">🃏 Flashcards</button>
      <button class="btn-primary" style="background: transparent; border:1px solid cyan;" onclick="navigateTo('corrections')">📜 History</button>
    </div>
    <div class="selected-topic-list">
      <strong>📚 Topics</strong>
      <div class="topic-hub-grid">${topics.length ? topics.map(topic => `
        <div class="topic-hub-card"><strong>${escapeHtml(topic.name)}</strong>
          <span>${questions.filter(q => q.topicId === topic.id).length} questions</span>
          <div class="topic-hub-actions">
            <button class="admin-btn" onclick="startPracticeByTopic('${topic.id}')">Practice</button>
            <button class="admin-btn exam-btn" onclick="startExamByTopic('${topic.id}')">Exam</button>
          </div>
        </div>`).join('') : '<p style="margin-top:0.6rem;">No topics have been added to this course yet.</p>'}</div>
    </div>`;
  selectedPanel.style.display = 'block';
}

viewRenderers.dashboard = renderDashboard;

window.selectCourse = function (courseId) {
  state.currentCourseId = courseId;
  renderDashboard();
};

window.showCourseList = function () {
  if (state.examActive && window.resetExamEnvironment) window.resetExamEnvironment();
  state.currentCourseId = null;
  window.navigateTo('dashboard');
};
