import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml, pluralize } from './utils.js';
import { viewRenderers, updateHud } from './nav.js';
import { Sound } from './sound.js';
import { getProgress, rankForXp, formatXp } from './progress.js';
import { dedupeQuestions, questionKey } from './questionBank.js';
import { getSeenKeys } from './seenStore.js';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

async function renderDashboard() {
  if (!state.currentStudent) return;
  const student = state.currentStudent;
  const progress = getProgress(student.regNumber);
  const rank = rankForXp(progress.xp);
  updateHud();

  const welcome = document.getElementById('welcomeName');
  if (welcome) welcome.textContent = `${greeting()}, ${student.name.split(' ')[0]}`;
  const subtitle = document.getElementById('welcomeCopy');
  if (subtitle) subtitle.innerHTML = `<span class="mono">${escapeHtml(student.regNumber)}</span> · ${escapeHtml(student.name)}`;

  const stats = document.getElementById('dashStats');
  if (stats) {
    stats.innerHTML = `
      <div class="stat"><span class="stat-value">${formatXp(progress.xp)}</span><span class="stat-label">Points</span></div>
      <div class="stat"><span class="stat-value">${progress.streak || 0}</span><span class="stat-label">Day streak</span></div>
      <div class="stat"><span class="stat-value">${progress.battles || 0}</span><span class="stat-label">Exams taken</span></div>
      <div class="stat"><span class="stat-value stat-rank">${escapeHtml(rank.title)}</span><span class="stat-label">Level</span></div>`;
  }

  let allCourses = [];
  try { allCourses = await DB.getCourses(); }
  catch (error) { console.error(error); allCourses = []; }

  const grid = document.getElementById('courseGrid');
  const selectedPanel = document.getElementById('selectedCoursePanel');
  const sectionTitle = document.getElementById('coursesSectionTitle');

  if (!allCourses.length) {
    grid.innerHTML = `<div class="card empty-state"><div class="empty-icon" aria-hidden="true">📚</div><h3>No courses yet</h3><p>Courses will appear here once the administrator publishes them.</p></div>`;
    grid.style.display = 'grid';
    selectedPanel.style.display = 'none';
    return;
  }

  // Fetch once, count in memory (avoids one request per course/topic)
  const [allTopics, allQuestionsRaw] = await Promise.all([DB.getTopics(), DB.getQuestions()]);
  const allQuestions = dedupeQuestions(allQuestionsRaw);
  const countBy = (list, key) => list.reduce((acc, item) => { acc[item[key]] = (acc[item[key]] || 0) + 1; return acc; }, {});
  const questionsPerCourse = countBy(allQuestions, 'courseId');
  const topicsPerCourse = countBy(allTopics, 'courseId');

  const selected = allCourses.find(c => c.id === state.currentCourseId);
  if (!selected) {
    if (sectionTitle) sectionTitle.textContent = pluralize(allCourses.length, 'course');
    grid.innerHTML = allCourses.map(c => `
      <button type="button" class="card course-card" onclick="selectCourse('${c.id}')">
        <span class="course-code">${escapeHtml(c.code)}</span>
        <h3>${escapeHtml(c.name)}</h3>
        <span class="course-meta">${pluralize(questionsPerCourse[c.id] || 0, 'question')} · ${pluralize(topicsPerCourse[c.id] || 0, 'topic')}</span>
        <span class="course-cta">Open course <span aria-hidden="true">→</span></span>
      </button>`).join('');
    grid.style.display = 'grid';
    selectedPanel.innerHTML = '';
    selectedPanel.style.display = 'none';
    return;
  }

  grid.style.display = 'none';
  if (sectionTitle) sectionTitle.textContent = 'Current course';

  const topics = allTopics.filter(t => t.courseId === selected.id);
  const questions = allQuestions.filter(q => q.courseId === selected.id);
  const seen = getSeenKeys(student.regNumber, selected.id);
  const seenCount = list => list.filter(q => seen.has(questionKey(q))).length;
  const courseSeen = seenCount(questions);

  const topicCards = topics.map(topic => {
    const pool = questions.filter(q => q.topicId === topic.id);
    const done = seenCount(pool);
    const pct = pool.length ? Math.round((done / pool.length) * 100) : 0;
    return `
      <div class="topic-card">
        <div class="topic-card-head">
          <strong>${escapeHtml(topic.name)}</strong>
          <span class="muted small">${pluralize(pool.length, 'question')}</span>
        </div>
        <div class="progress-track" title="${done} of ${pool.length} seen"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="topic-card-foot">
          <span class="muted small">${pool.length ? `${done}/${pool.length} covered` : 'No questions yet'}</span>
          <div class="btn-row compact">
            <button class="btn btn-ghost btn-sm" ${pool.length ? '' : 'disabled'} onclick="openSessionSetup('practice', { topicId: '${topic.id}' })">Practice</button>
            <button class="btn btn-secondary btn-sm" ${pool.length ? '' : 'disabled'} onclick="openSessionSetup('exam', { topicId: '${topic.id}' })">Exam</button>
          </div>
        </div>
      </div>`;
  });

  selectedPanel.innerHTML = `
    <div class="course-panel-head">
      <div>
        <span class="course-code">${escapeHtml(selected.code)}</span>
        <h3>${escapeHtml(selected.name)}</h3>
        <p class="muted">${pluralize(questions.length, 'question')} across ${pluralize(topics.length, 'topic')} · ${courseSeen} covered so far</p>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="showCourseList()">← All courses</button>
    </div>
    <div class="action-grid">
      <button class="action-tile" onclick="openSessionSetup('practice')">
        <span class="action-icon" aria-hidden="true">✎</span>
        <span class="action-title">Practice</span>
        <span class="action-desc">Untimed, instant feedback</span>
      </button>
      <button class="action-tile action-tile-primary" onclick="openSessionSetup('exam')">
        <span class="action-icon" aria-hidden="true">⏱</span>
        <span class="action-title">Take an exam</span>
        <span class="action-desc">Timed, saved to history</span>
      </button>
      <button class="action-tile" onclick="openSessionSetup('flashcards')">
        <span class="action-icon" aria-hidden="true">▤</span>
        <span class="action-title">Flashcards</span>
        <span class="action-desc">Quick revision</span>
      </button>
      <button class="action-tile" onclick="navigateTo('corrections')">
        <span class="action-icon" aria-hidden="true">≡</span>
        <span class="action-title">Results</span>
        <span class="action-desc">Past exams & corrections</span>
      </button>
    </div>
    <div class="topics-section">
      <div class="section-head"><h4>Topics</h4><span class="muted small">Progress shows how much of each topic you have covered</span></div>
      <div class="topic-grid">${topicCards.length ? topicCards.join('') : '<p class="muted">No topics have been published for this course yet.</p>'}</div>
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

window.goHome = function () {
  Sound.whoosh();
  if (state.examActive && !state.practiceActive) {
    // Never silently abandon a timed exam from the nav — take the student back to it.
    window.navigateTo('cbt');
    return;
  }
  if (state.examActive && window.resetExamEnvironment) window.resetExamEnvironment();
  window.navigateTo('dashboard');
};
