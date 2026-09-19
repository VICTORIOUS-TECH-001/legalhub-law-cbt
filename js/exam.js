/*
  EXAM ENGINE — runs timed exams and untimed practice sessions
  ------------------------------------------------------------
  A session is started through startSession({ mode, topicId, count }). The
  question set is drawn by questionBank.js (random, unseen-first, options
  shuffled with the correct answer preserved) and the served questions are
  recorded in seenStore.js so a student is not shown the same question again
  until the pool has been exhausted.
*/

import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml, formatTime, toast, pluralize } from './utils.js';
import { navigateTo, viewRenderers, updateHud } from './nav.js';
import { Sound } from './sound.js';
import { addXp } from './progress.js';
import { drawQuestions, prepareForSession, dedupeQuestions, questionKey } from './questionBank.js';
import { getSeenKeys, markSeen } from './seenStore.js';

export const EXAM_DURATION_SECONDS = 30 * 60;
const ACTIVE_EXAM_KEY = 'vt_active_exam_v1';
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function qContainer() { return document.getElementById('question-container'); }
function clearPersistedExam() {
  sessionStorage.removeItem(ACTIVE_EXAM_KEY);
  localStorage.removeItem(ACTIVE_EXAM_KEY);
}

/**
 * Build the question set for a session.
 * Returns { questions, total, unseenBefore, cycled }.
 */
export async function buildSessionSet({ courseId, topicId, count }) {
  const [rawQuestions, topics] = await Promise.all([
    DB.getQuestions({ courseId, topicId: topicId || undefined }),
    DB.getTopics(courseId)
  ]);
  const topicNameById = Object.fromEntries(topics.map(t => [t.id, t.name]));
  const pool = dedupeQuestions(rawQuestions);
  const regNumber = state.currentStudent?.regNumber;
  const seenKeys = getSeenKeys(regNumber, courseId);

  const draw = drawQuestions({ pool, count, seenKeys });
  if (draw.questions.length) {
    markSeen(regNumber, courseId, draw.questions.map(questionKey), {
      resetKeys: draw.cycled ? pool.map(questionKey) : null
    });
  }
  return {
    questions: prepareForSession(draw.questions, topicNameById),
    total: draw.total,
    unseenBefore: draw.unseenBefore,
    cycled: draw.cycled
  };
}

export function resetExamEnvironment() {
  stopTimer();
  clearPersistedExam();
  state.activeQuestions = [];
  state.userSelections = [];
  state.currentQIndex = 0;
  state.secondsLeft = EXAM_DURATION_SECONDS;
  state.examStartedAt = null;
  state.isFinalizing = false;
  state.examActive = false;
  state.practiceActive = false;
  state.practiceCombo = 0;
  state.sessionTopicId = null;
  state.sessionTopicName = null;
  updateTimerUI();
  const navContainer = document.getElementById('questionNavContainer');
  if (navContainer) navContainer.innerHTML = '';
}
window.resetExamEnvironment = resetExamEnvironment;

function persistActiveExam() {
  if (!state.examActive || state.practiceActive || !state.activeQuestions.length) return;
  localStorage.setItem(ACTIVE_EXAM_KEY, JSON.stringify({
    courseId: state.currentCourseId,
    topicId: state.sessionTopicId,
    topicName: state.sessionTopicName,
    activeQuestions: state.activeQuestions,
    userSelections: state.userSelections,
    currentQIndex: state.currentQIndex,
    secondsLeft: state.secondsLeft,
    examStartedAt: state.examStartedAt
  }));
}

export async function restoreActiveExam() {
  const raw = localStorage.getItem(ACTIVE_EXAM_KEY) || sessionStorage.getItem(ACTIVE_EXAM_KEY);
  if (!raw) return false;
  try {
    const saved = JSON.parse(raw);
    const valid = saved.courseId && Array.isArray(saved.activeQuestions) && saved.activeQuestions.length &&
      Array.isArray(saved.userSelections) && saved.examStartedAt;
    if (!valid) { clearPersistedExam(); return false; }

    const elapsed = Math.floor((Date.now() - saved.examStartedAt) / 1000);
    state.currentCourseId = saved.courseId;
    state.sessionTopicId = saved.topicId || null;
    state.sessionTopicName = saved.topicName || null;
    state.activeQuestions = saved.activeQuestions;
    state.userSelections = saved.userSelections;
    state.currentQIndex = Math.min(Math.max(saved.currentQIndex || 0, 0), saved.activeQuestions.length - 1);
    state.secondsLeft = Math.max(0, Math.min(EXAM_DURATION_SECONDS, saved.secondsLeft - elapsed));
    state.examStartedAt = saved.examStartedAt;
    state.examActive = state.secondsLeft > 0;
    state.practiceActive = false;
    if (!state.examActive) { clearPersistedExam(); return false; }
    return true;
  } catch {
    clearPersistedExam();
    return false;
  }
}

/* ---------------- view entry ---------------- */
async function renderExamViewEntry() {
  const courses = await DB.getCourses();
  const course = state.currentCourseId ? courses.find(c => c.id === state.currentCourseId) : null;
  const practice = !!state.practiceActive;

  const title = document.getElementById('examCourseTitle');
  if (title) title.textContent = course ? course.name : 'Assessment';
  const kicker = document.getElementById('examModeKicker');
  if (kicker) kicker.textContent = practice ? 'Practice session' : 'Timed examination';
  const scope = document.getElementById('examScopeBadge');
  if (scope) scope.textContent = state.sessionTopicName || 'Full course';

  document.getElementById('examTimerWrap')?.classList.toggle('hidden', practice || !state.examActive);
  document.getElementById('examToolbar')?.classList.toggle('hidden', !state.examActive);
  document.getElementById('finalSubmitBtn')?.classList.toggle('hidden', practice || !state.examActive);
  document.getElementById('exitPracticeBtn')?.classList.toggle('hidden', !practice);
  document.body.classList.toggle('focus-mode', state.examActive && !practice);

  if (!state.examActive || state.activeQuestions.length === 0) {
    const box = qContainer();
    if (!box) return;
    box.innerHTML = `
      <div class="card empty-state">
        <div class="empty-icon" aria-hidden="true">📝</div>
        <h3>No active session</h3>
        <p>Choose a topic and the number of questions to begin a practice session or a timed exam.</p>
        <div class="btn-row">
          <button class="btn btn-secondary" onclick="openSessionSetup('practice')">Start practice</button>
          <button class="btn btn-primary" onclick="openSessionSetup('exam')">Start exam</button>
        </div>
      </div>`;
    const nav = document.getElementById('questionNavContainer');
    if (nav) nav.innerHTML = '';
    return;
  }
  renderCurrentQuestion();
}
viewRenderers.cbt = renderExamViewEntry;

window.startRestoredExam = function () {
  startTimer(true);
  renderCurrentQuestion();
  toast('Your exam was restored — the timer kept running.', 'info');
};

/* ---------------- session start ---------------- */
/**
 * @param {Object} opts
 * @param {'practice'|'exam'} opts.mode
 * @param {string|null} opts.topicId   null = whole course
 * @param {number} opts.count          questions to draw (clamped to the pool)
 */
export async function startSession({ mode, topicId = null, count = 0 }) {
  if (!state.currentStudent) { navigateTo('login'); return false; }
  if (!state.currentCourseId) { window.requireCourseThen(mode === 'exam' ? 'exam' : 'practice'); return false; }

  const topics = await DB.getTopics(state.currentCourseId);
  const topic = topicId ? topics.find(t => t.id === topicId) : null;

  resetExamEnvironment();
  const set = await buildSessionSet({ courseId: state.currentCourseId, topicId, count });
  if (!set.questions.length) {
    toast(topic ? `No questions have been added to “${topic.name}” yet.` : 'No questions are available for this course yet.', 'error');
    Sound.error();
    return false;
  }

  state.activeQuestions = set.questions;
  state.userSelections = new Array(set.questions.length).fill(null);
  state.currentQIndex = 0;
  state.examActive = true;
  state.practiceActive = mode === 'practice';
  state.practiceCombo = 0;
  state.sessionTopicId = topic ? topic.id : null;
  state.sessionTopicName = topic ? topic.name : null;

  if (mode === 'exam') {
    state.examStartedAt = Date.now();
    persistActiveExam();
  }
  navigateTo('cbt');
  if (mode === 'exam') startTimer();
  renderCurrentQuestion();
  Sound.powerUp();

  if (set.cycled) {
    toast(`You had seen every question in this ${topic ? 'topic' : 'course'} — starting a fresh cycle.`, 'info');
  } else {
    toast(`${pluralize(set.questions.length, 'question')} drawn at random${set.total > set.questions.length ? ` from ${set.total}` : ''}.`, 'success');
  }
  return true;
}
window.startSession = startSession;

window.exitPractice = function () {
  Sound.whoosh();
  resetExamEnvironment();
  navigateTo('dashboard');
};

/* ---------------- timer ---------------- */
function updateTimerUI() {
  const el = document.getElementById('timer');
  if (!el) return;
  el.textContent = formatTime(state.secondsLeft);
  const wrap = document.getElementById('examTimerWrap');
  if (!wrap) return;
  wrap.classList.toggle('timer-warning', state.secondsLeft <= 300 && state.secondsLeft > 60);
  wrap.classList.toggle('timer-danger', state.secondsLeft <= 60);
}
function stopTimer() { if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; } }
function startTimer(preserveTime = false) {
  if (!preserveTime) state.secondsLeft = EXAM_DURATION_SECONDS;
  updateTimerUI();
  stopTimer();
  state.timerInterval = setInterval(() => {
    if (!state.examActive) return;
    if (state.secondsLeft <= 1) {
      state.secondsLeft = 0; updateTimerUI(); stopTimer();
      clearPersistedExam();
      Sound.countdownFinal();
      if (state.examActive && !state.isFinalizing) finalizeExamAndShowScore();
    } else {
      state.secondsLeft--; updateTimerUI();
      persistActiveExam();
      if (state.secondsLeft <= 60 && state.secondsLeft % 10 === 0) Sound.countdown();
      if (state.secondsLeft <= 10) Sound.countdown();
    }
  }, 1000);
}

/* ---------------- rendering ---------------- */
function renderNavigator() {
  const navContainer = document.getElementById('questionNavContainer');
  if (!navContainer) return;
  if (!state.examActive || !state.activeQuestions.length) { navContainer.innerHTML = ''; return; }
  const answered = state.userSelections.filter(v => v != null && v !== '').length;
  let html = `<div class="nav-summary"><span>Question map</span><span>${answered}/${state.activeQuestions.length} answered</span></div><div class="nav-grid">`;
  for (let i = 0; i < state.activeQuestions.length; i++) {
    const isAnswered = state.userSelections[i] != null && state.userSelections[i] !== '';
    let cls = isAnswered ? 'nav-answered' : 'nav-unanswered';
    if (state.practiceActive && isAnswered) {
      cls += state.userSelections[i] === state.activeQuestions[i].answer ? ' nav-correct' : ' nav-wrong';
    }
    if (i === state.currentQIndex) cls += ' nav-active';
    html += `<button type="button" class="nav-q-btn ${cls}" data-qidx="${i}" aria-label="Go to question ${i + 1}">${i + 1}</button>`;
  }
  html += '</div>';
  navContainer.innerHTML = html;
  navContainer.querySelectorAll('.nav-q-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      Sound.tap();
      const idx = parseInt(btn.getAttribute('data-qidx'), 10);
      if (!isNaN(idx) && state.examActive && idx >= 0 && idx < state.activeQuestions.length) {
        state.currentQIndex = idx; renderCurrentQuestion();
      }
    });
  });
}

function renderCurrentQuestion() {
  if (!state.examActive || !state.activeQuestions.length) return;
  const box = qContainer();
  if (!box) return;
  const total = state.activeQuestions.length;
  const index = state.currentQIndex;
  const qData = state.activeQuestions[index];
  const selectedVal = state.userSelections[index];
  const answeredInPractice = state.practiceActive && selectedVal !== null;
  const combo = state.practiceCombo || 0;
  const isLast = index === total - 1;

  const optionsHtml = qData.options.map((opt, idx) => {
    const isSelected = selectedVal === opt;
    const isCorrect = opt === qData.answer;
    let stateClass = isSelected ? ' is-selected' : '';
    if (answeredInPractice) {
      if (isCorrect) stateClass += ' is-correct';
      else if (isSelected) stateClass += ' is-wrong';
    }
    return `
      <button type="button" class="option${stateClass}" data-opt-idx="${idx}" ${answeredInPractice ? 'disabled' : ''}
              role="radio" aria-checked="${isSelected}">
        <span class="option-letter">${OPTION_LETTERS[idx] || idx + 1}</span>
        <span class="option-text">${escapeHtml(opt)}</span>
      </button>`;
  }).join('');

  let feedbackHtml = '';
  if (answeredInPractice) {
    const correct = selectedVal === qData.answer;
    const gained = 100 + Math.min(combo, 10) * 10;
    feedbackHtml = `
      <div class="feedback ${correct ? 'feedback-correct' : 'feedback-wrong'}" role="status">
        <div class="feedback-title">${correct ? `Correct · +${gained} points${combo >= 3 ? ` · ${combo} in a row` : ''}` : 'Not quite'}</div>
        ${correct ? '' : `<div>Correct answer: <strong>${escapeHtml(qData.answer)}</strong></div>`}
        ${qData.explanation ? `<div class="explanation">${escapeHtml(qData.explanation)}</div>` : ''}
      </div>`;
  }

  box.innerHTML = `
    <article class="card question-card">
      <header class="question-meta">
        <span class="chip chip-accent">Question ${index + 1} of ${total}</span>
        <span class="chip">${escapeHtml(qData.topic || 'General')}</span>
        ${state.practiceActive && combo >= 2 ? `<span class="chip chip-success">${combo} in a row</span>` : ''}
      </header>
      <div class="progress-track" aria-hidden="true"><div class="progress-fill" style="width:${Math.round(((index + 1) / total) * 100)}%"></div></div>
      <p class="question-text">${escapeHtml(qData.q)}</p>
      <div class="option-list" role="radiogroup" aria-label="Answer options">${optionsHtml}</div>
      ${feedbackHtml}
      ${state.practiceActive && isLast && answeredInPractice ? `<div class="btn-row" style="margin-top:1.2rem;"><button class="btn btn-primary" onclick="finishPractice()">Finish practice</button></div>` : ''}
    </article>`;

  if (!answeredInPractice) {
    box.querySelectorAll('.option').forEach(item => {
      item.addEventListener('click', () => {
        const idx = Number(item.getAttribute('data-opt-idx'));
        const answer = qData.options[idx];
        if (answer != null) window.updateAnswer(index, answer);
      });
    });
  }

  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (prevBtn) prevBtn.disabled = index === 0;
  if (nextBtn) nextBtn.disabled = isLast;

  renderNavigator();
  persistActiveExam();
}

window.updateAnswer = function (qIdx, ans) {
  if (!state.examActive || qIdx < 0) return;
  state.userSelections[qIdx] = ans;
  persistActiveExam();
  if (state.practiceActive) {
    const correct = state.activeQuestions[qIdx].answer === ans;
    if (correct) {
      state.practiceCombo = (state.practiceCombo || 0) + 1;
      const gained = 100 + Math.min(state.practiceCombo, 10) * 10;
      if (state.currentStudent) addXp(state.currentStudent.regNumber, gained, { correct: true, combo: state.practiceCombo });
      Sound.success();
      if ([3, 5, 10].includes(state.practiceCombo)) { toast(`${state.practiceCombo} correct in a row — keep going.`, 'success'); Sound.coin(); }
      updateHud();
    } else {
      state.practiceCombo = 0;
      Sound.error();
    }
    renderCurrentQuestion();
  } else {
    Sound.select();
    renderNavigator();
  }
};

window.changeQuestion = function (delta) {
  if (!state.examActive) return;
  Sound.tap();
  const n = state.currentQIndex + delta;
  if (n >= 0 && n < state.activeQuestions.length) { state.currentQIndex = n; renderCurrentQuestion(); }
};

/* ---------------- practice summary ---------------- */
window.finishPractice = function () {
  if (!state.examActive || !state.practiceActive) return;
  const total = state.activeQuestions.length;
  const attempted = state.userSelections.filter(v => v != null).length;
  const correct = state.userSelections.filter((v, i) => v != null && v === state.activeQuestions[i].answer).length;
  const percent = attempted ? Math.round((correct / attempted) * 100) : 0;
  showScoreModal({
    heading: 'Practice complete',
    scoreText: `${correct}/${attempted}`,
    percent,
    subline: `${pluralize(attempted, 'question')} attempted of ${total} · results are not saved for practice sessions`
  });
  resetExamEnvironment();
  navigateTo('dashboard');
};

/* ---------------- submission ---------------- */
function showConfirmModal() {
  Sound.click();
  const unanswered = state.userSelections.filter(v => v == null || v === '').length;
  const note = document.getElementById('confirmUnansweredNote');
  if (note) note.textContent = unanswered ? `${pluralize(unanswered, 'question')} unanswered — they will be marked incorrect.` : 'All questions answered.';
  document.getElementById('confirmModal')?.classList.add('active');
}
function hideConfirmModal() { Sound.tap(); document.getElementById('confirmModal')?.classList.remove('active'); }

function showScoreModal({ heading = 'Exam complete', scoreText, percent, subline = '' }) {
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('scoreModalHeading', heading);
  set('finalScoreDisplay', scoreText);
  set('finalPercentDisplay', `${percent}%`);
  set('finalTimeDisplay', subline);
  const grade = document.getElementById('finalGradeDisplay');
  if (grade) {
    const band = gradeBand(percent);
    grade.textContent = band.label;
    grade.className = `chip chip-${band.tone}`;
  }
  const fill = document.getElementById('scoreProgressFill');
  if (fill) { fill.style.width = '0%'; setTimeout(() => { fill.style.width = `${percent}%`; }, 100); }
  document.getElementById('scoreModal')?.classList.add('active');
  if (percent >= 70) Sound.levelUp(); else if (percent >= 50) Sound.success(); else Sound.error();
}
function hideScoreModal() { Sound.tap(); document.getElementById('scoreModal')?.classList.remove('active'); }

export function gradeBand(percent) {
  if (percent >= 70) return { label: 'Distinction', tone: 'success' };
  if (percent >= 60) return { label: 'Merit', tone: 'accent' };
  if (percent >= 50) return { label: 'Pass', tone: 'info' };
  return { label: 'Needs review', tone: 'danger' };
}

window.requestSubmitConfirmation = function () { if (state.examActive && !state.practiceActive) showConfirmModal(); };

async function finalizeExamAndShowScore() {
  if (!state.examActive || state.isFinalizing) return;
  state.isFinalizing = true;
  stopTimer();
  Sound.submit();

  let correctCount = 0;
  const detailed = state.userSelections.map((ans, idx) => {
    const q = state.activeQuestions[idx];
    const isCorrect = ans === q.answer;
    if (isCorrect) correctCount++;
    return { question: q.q, userAnswer: ans || '(no answer)', correctAnswer: q.answer, isCorrect, explanation: q.explanation || '', topic: q.topic || '' };
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
      topicName: state.sessionTopicName || 'Full course',
      rawScore: correctCount, total, scorePercent: percent, scoreDisplay,
      timeUsedSeconds: timeUsed, timeUsedDisplay: formatTime(timeUsed),
      details: detailed
    });
    addXp(student.regNumber, 200 + correctCount * 20, { battle: true });
    updateHud();
  }

  clearPersistedExam();
  state.examActive = false;
  state.isFinalizing = false;
  document.body.classList.remove('focus-mode');
  showScoreModal({ scoreText: scoreDisplay, percent, subline: `Time used ${formatTime(timeUsed)} · ${state.sessionTopicName || 'Full course'}` });
  navigateTo('corrections');
}

document.getElementById('confirmSubmitBtn')?.addEventListener('click', () => { hideConfirmModal(); if (state.examActive) finalizeExamAndShowScore(); });
document.getElementById('cancelSubmitBtn')?.addEventListener('click', hideConfirmModal);
document.getElementById('closeScoreBtn')?.addEventListener('click', hideScoreModal);
