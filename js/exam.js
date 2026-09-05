import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml, shuffleArray, formatTime } from './utils.js';
import { navigateTo, viewRenderers } from './nav.js';

const EXAM_DURATION_SECONDS = 30 * 60;
const ACTIVE_EXAM_KEY = 'vt_active_exam_v1';

function qContainer() { return document.getElementById('question-container'); }

async function buildShuffledSet({ courseId, topicId }) {
  const rawQs = await DB.getQuestions({ courseId, topicId });
  const topics = await DB.getTopics(courseId);
  const topicNameById = Object.fromEntries(topics.map(t => [t.id, t.name]));
  let source = rawQs.map(q => ({
    q: q.q,
    answer: q.answer,
    options: [...q.options],
    explanation: q.explanation || '',
    topic: topicNameById[q.topicId] || 'General'
  }));
  for (const q of source) q.options = shuffleArray(q.options);
  return shuffleArray(source);
}

export function resetExamEnvironment() {
  stopTimer();
  sessionStorage.removeItem(ACTIVE_EXAM_KEY);
  localStorage.removeItem(ACTIVE_EXAM_KEY);
  state.activeQuestions = [];
  state.userSelections = [];
  state.currentQIndex = 0;
  state.secondsLeft = EXAM_DURATION_SECONDS;
  state.examStartedAt = null;
  updateTimerUI();
  state.isFinalizing = false;
  state.examActive = false;
  sessionStorage.removeItem(ACTIVE_EXAM_KEY);
  localStorage.removeItem(ACTIVE_EXAM_KEY);
  state.practiceActive = false;
  const navContainer = document.getElementById('questionNavContainer');
  if (navContainer) navContainer.innerHTML = '';
}
window.resetExamEnvironment = resetExamEnvironment;

function persistActiveExam() {
  if (!state.examActive || state.practiceActive || !state.activeQuestions.length) return;
  const serialized = JSON.stringify({
    courseId: state.currentCourseId,
    activeQuestions: state.activeQuestions,
    userSelections: state.userSelections,
    currentQIndex: state.currentQIndex,
    secondsLeft: state.secondsLeft,
    examStartedAt: state.examStartedAt
  });
  localStorage.setItem(ACTIVE_EXAM_KEY, serialized);
}

export async function restoreActiveExam() {
  const raw = localStorage.getItem(ACTIVE_EXAM_KEY) || sessionStorage.getItem(ACTIVE_EXAM_KEY);
  if (!raw) return false;
  try {
    const saved = JSON.parse(raw);
    if (!saved.courseId || !Array.isArray(saved.activeQuestions) || !saved.activeQuestions.length ||
        !Array.isArray(saved.userSelections) || !saved.examStartedAt) {
      sessionStorage.removeItem(ACTIVE_EXAM_KEY);
      localStorage.removeItem(ACTIVE_EXAM_KEY);
      return false;
    }
    const elapsed = Math.floor((Date.now() - saved.examStartedAt) / 1000);
    state.currentCourseId = saved.courseId;
    state.activeQuestions = saved.activeQuestions;
    state.userSelections = saved.userSelections;
    state.currentQIndex = Math.min(Math.max(saved.currentQIndex || 0, 0), saved.activeQuestions.length - 1);
    state.secondsLeft = Math.max(0, Math.min(EXAM_DURATION_SECONDS, saved.secondsLeft - elapsed));
    state.examStartedAt = saved.examStartedAt;
    state.examActive = state.secondsLeft > 0;
    state.practiceActive = false;
    if (!state.examActive) {
      sessionStorage.removeItem(ACTIVE_EXAM_KEY);
      localStorage.removeItem(ACTIVE_EXAM_KEY);
      return false;
    }
    return true;
  } catch (error) {
    sessionStorage.removeItem(ACTIVE_EXAM_KEY);
    localStorage.removeItem(ACTIVE_EXAM_KEY);
    return false;
  }
}

async function renderExamViewEntry() {
  const badge = document.getElementById('examCourseBadge');
  const courses = await DB.getCourses();
  const course = state.currentCourseId ? courses.find(c => c.id === state.currentCourseId) : null;
  if (badge) badge.innerText = course ? `${course.name}` : '—';
  const title = document.getElementById('examCourseTitle');
  if (title) title.innerText = course ? course.name : 'Exam';
  document.querySelector('.timer-ring').style.display = state.practiceActive ? 'none' : 'flex';
  document.getElementById('finalSubmitBtn').style.display = state.practiceActive ? 'none' : 'block';
  document.getElementById('prevBtn').innerText = state.practiceActive ? '◀ PREVIOUS' : '◀ PREV';
  document.getElementById('nextBtn').innerText = state.practiceActive ? 'NEXT ▶' : 'NEXT ▶';

  if (!state.examActive || state.activeQuestions.length === 0) {
    qContainer().innerHTML = `<div class="glass-card" style="text-align:center;">
      <span>⚡</span><h3>No active exam</h3>
      <div style="display:flex; gap:1rem; margin-top:1rem; flex-wrap:wrap; justify-content:center;">
        <button class="btn-primary btn-inline" onclick="initiateFullCourseExam()">Start Full Course Exam</button>
        <button class="btn-primary btn-inline" style="background: linear-gradient(135deg,#00bcd4,#00897b);" onclick="openTopicsModal('exam')">📚 Start by Topic</button>
      </div>
    </div>`;
    document.getElementById('questionNavContainer').innerHTML = '';
  } else {
    renderCurrentQuestion();
  }
}
viewRenderers.cbt = renderExamViewEntry;
window.startRestoredExam = function () {
  startTimer(true);
  renderCurrentQuestion();
};

export async function initiateFullCourseExam() {
  if (!state.currentCourseId) { window.requireCourseThen('cbt'); return; }
  resetExamEnvironment();
  state.activeQuestions = await buildShuffledSet({ courseId: state.currentCourseId });
  if (!state.activeQuestions.length) { alert('No questions available for this course yet.'); return; }
  state.userSelections = new Array(state.activeQuestions.length).fill(null);
  state.currentQIndex = 0;
  state.examActive = true;
  state.practiceActive = false;
  state.examStartedAt = Date.now();
  persistActiveExam();
  navigateTo('cbt');
  startTimer();
  renderCurrentQuestion();
}
window.initiateFullCourseExam = initiateFullCourseExam;

export async function startExamByTopic(topicId) {
  resetExamEnvironment();
  const filtered = await buildShuffledSet({ courseId: state.currentCourseId, topicId });
  if (!filtered.length) { alert('No questions available for this topic yet.'); return; }
  state.activeQuestions = filtered;
  state.userSelections = new Array(state.activeQuestions.length).fill(null);
  state.currentQIndex = 0;
  state.examActive = true;
  state.practiceActive = false;
  state.examStartedAt = Date.now();
  persistActiveExam();
  navigateTo('cbt');
  startTimer();
  renderCurrentQuestion();
}
window.startExamByTopic = startExamByTopic;

export async function startPracticeByTopic(topicId) {
  if (!state.currentCourseId) { window.requireCourseThen('topics'); return; }
  resetExamEnvironment();
  state.activeQuestions = await buildShuffledSet({ courseId: state.currentCourseId, topicId: topicId || undefined });
  if (!state.activeQuestions.length) { alert('No questions available for this topic yet.'); return; }
  state.userSelections = new Array(state.activeQuestions.length).fill(null);
  state.currentQIndex = 0;
  state.examActive = true;
  state.practiceActive = true;
  navigateTo('cbt');
  renderCurrentQuestion();
}
window.startPracticeByTopic = startPracticeByTopic;
window.exitPractice = function () {
  resetExamEnvironment();
  navigateTo('dashboard');
};

// ---------------- timer ----------------
function updateTimerUI() { const el = document.getElementById('timer'); if (el) el.innerText = formatTime(state.secondsLeft); }
function stopTimer() { if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; } }
function startTimer(preserveTime = false) {
  if (!preserveTime) state.secondsLeft = EXAM_DURATION_SECONDS;
  updateTimerUI();
  if (state.timerInterval) stopTimer();
  state.timerInterval = setInterval(() => {
    if (!state.examActive) return;
    if (state.secondsLeft <= 1) {
      state.secondsLeft = 0; updateTimerUI(); stopTimer();
        sessionStorage.removeItem(ACTIVE_EXAM_KEY);
        localStorage.removeItem(ACTIVE_EXAM_KEY);
      if (state.examActive && !state.isFinalizing) finalizeExamAndShowScore();
    } else {
      state.secondsLeft--; updateTimerUI();
      persistActiveExam();
    }
  }, 700);
}

// ---------------- question rendering ----------------
function renderNavigator() {
  const navContainer = document.getElementById('questionNavContainer');
  if (!navContainer) return;
  if (!state.examActive || !state.activeQuestions.length) { navContainer.innerHTML = ''; return; }
  let html = '<div class="nav-grid">';
  for (let i = 0; i < state.activeQuestions.length; i++) {
    const isAnswered = (state.userSelections[i] != null && state.userSelections[i] !== '');
    const statusClass = isAnswered ? 'nav-answered' : 'nav-unanswered';
    const activeClass = (i === state.currentQIndex) ? 'nav-active' : '';
    html += `<button class="nav-q-btn ${statusClass} ${activeClass}" data-qidx="${i}">${i + 1}</button>`;
  }
  html += '</div>';
  navContainer.innerHTML = html;
  navContainer.querySelectorAll('.nav-q-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-qidx'), 10);
      if (!isNaN(idx) && state.examActive && idx >= 0 && idx < state.activeQuestions.length) {
        state.currentQIndex = idx; renderCurrentQuestion();
      }
    });
  });
}

function renderCurrentQuestion() {
  if (!state.examActive || !state.activeQuestions.length) return;
  const qData = state.activeQuestions[state.currentQIndex];
  const selectedVal = state.userSelections[state.currentQIndex];
  const hasAnswer = state.practiceActive && selectedVal !== null;
  const optionsHtml = qData.options.map(opt => `
    <div class="option-item">
      <label style="display: flex; align-items: center; cursor: pointer;">
        <input type="radio" name="dynamicRadio" value="${escapeHtml(opt)}"
          onchange="updateAnswer(${state.currentQIndex}, '${escapeHtml(opt).replace(/'/g, "\\'")}')"
          ${hasAnswer ? 'disabled' : ''}
          ${selectedVal === opt ? 'checked' : ''}>
        <span>${escapeHtml(opt)}</span>
      </label>
    </div>
  `).join('');
  qContainer().innerHTML = `
    <div class="glass-card">
      <div class="flex-between" style="margin-bottom: 1rem;">
        <span class="progress-badge">📌 ${state.currentQIndex + 1}/${state.activeQuestions.length}</span>
        <span class="progress-badge">⚡ ${escapeHtml(qData.topic || 'General')}</span>
        ${state.practiceActive ? '<button class="admin-btn" onclick="exitPractice()">Exit practice</button>' : ''}
      </div>
      <p style="font-size: 1.3rem; font-weight: 500; margin-bottom: 1.2rem;">${escapeHtml(qData.q)}</p>
      <div>${optionsHtml}</div>
      ${hasAnswer ? `<div class="practice-feedback ${selectedVal === qData.answer ? 'practice-correct' : 'practice-wrong'}">
        <strong>${selectedVal === qData.answer ? '✅ Correct' : '❌ Incorrect'}</strong>
        <div>Correct answer: <strong>${escapeHtml(qData.answer)}</strong></div>
        ${qData.explanation ? `<div class="explanation-box">💡 ${escapeHtml(qData.explanation)}</div>` : ''}
      </div>` : ''}
    </div>
  `;
  renderNavigator();
  persistActiveExam();
}

window.updateAnswer = function (qIdx, ans) {
  if (state.examActive && qIdx >= 0) {
    state.userSelections[qIdx] = ans;
    persistActiveExam();
    if (state.practiceActive) renderCurrentQuestion();
    else renderNavigator();
  }
};
window.changeQuestion = function (delta) {
  if (state.examActive) {
    const n = state.currentQIndex + delta;
    if (n >= 0 && n < state.activeQuestions.length) { state.currentQIndex = n; renderCurrentQuestion(); }
  }
};

// ---------------- submission ----------------
function showConfirmModal() { document.getElementById('confirmModal')?.classList.add('active'); }
function hideConfirmModal() { document.getElementById('confirmModal')?.classList.remove('active'); }
function showScoreModal(scoreText, percent, timeUsed) {
  document.getElementById('finalScoreDisplay').innerText = scoreText;
  document.getElementById('finalPercentDisplay').innerHTML = `${percent}% • ${scoreText.split('/')[0]} correct`;
  document.getElementById('finalTimeDisplay').innerText = `Time used: ${formatTime(timeUsed)}`;
  document.getElementById('scoreModal')?.classList.add('active');
}
function hideScoreModal() { document.getElementById('scoreModal')?.classList.remove('active'); }

window.requestSubmitConfirmation = function () { if (state.examActive) showConfirmModal(); };

async function finalizeExamAndShowScore() {
  if (!state.examActive || state.isFinalizing) return;
  state.isFinalizing = true;
  stopTimer();

  let correctCount = 0;
  const detailed = state.userSelections.map((ans, idx) => {
    const q = state.activeQuestions[idx];
    const isCor = (ans === q.answer);
    if (isCor) correctCount++;
    // explanation is kept but only shown later, during review on the History page
    return { question: q.q, userAnswer: ans || '(no answer)', correctAnswer: q.answer, isCorrect: isCor, explanation: q.explanation || '' };
  });

  const total = state.activeQuestions.length;
  const percent = total ? Math.round((correctCount / total) * 100) : 0;
  const scoreDisplay = `${correctCount}/${total}`;
  const timeUsed = EXAM_DURATION_SECONDS - state.secondsLeft;

  const student = state.currentStudent;
  if (student) {
    const courses = await DB.getCourses();
    const course = courses.find(c => c.id === state.currentCourseId);
    await DB.addHistoryEntry(student.regNumber, {
      id: Date.now(),
      date: new Date().toLocaleString(),
      courseId: state.currentCourseId,
      courseName: course ? course.name : 'Unknown course',
      rawScore: correctCount, total, scorePercent: percent, scoreDisplay,
      timeUsedSeconds: timeUsed, timeUsedDisplay: formatTime(timeUsed),
      details: detailed
    });
  }

  state.examActive = false;
  state.isFinalizing = false;
  showScoreModal(scoreDisplay, percent, timeUsed);
  navigateTo('corrections');
}

document.getElementById('confirmSubmitBtn')?.addEventListener('click', () => { hideConfirmModal(); if (state.examActive) finalizeExamAndShowScore(); });
document.getElementById('cancelSubmitBtn')?.addEventListener('click', hideConfirmModal);
document.getElementById('closeScoreBtn')?.addEventListener('click', hideScoreModal);
