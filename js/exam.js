import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml, shuffleArray, formatTime, toast } from './utils.js';
import { navigateTo, viewRenderers, updateHud } from './nav.js';
import { Sound } from './sound.js';
import { addXp } from './progress.js';

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
  state.practiceCombo = 0;
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
  if (title) title.innerText = course ? `⚔️ ${course.name} // BATTLE MODE` : 'Exam';
  const timerRing = document.querySelector('.timer-ring');
  if (timerRing) timerRing.style.display = state.practiceActive ? 'none' : 'flex';
  const submitBtn = document.getElementById('finalSubmitBtn');
  if (submitBtn) submitBtn.style.display = state.practiceActive ? 'none' : 'block';
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (prevBtn) prevBtn.innerText = state.practiceActive ? '◀ PREVIOUS' : '◀ PREV';
  if (nextBtn) nextBtn.innerText = state.practiceActive ? 'NEXT ▶' : 'NEXT ▶';

  if (!state.examActive || state.activeQuestions.length === 0) {
    const box = qContainer();
    if (!box) return;
    box.innerHTML = `<div class="glass-card" style="text-align:center;">
      <div style="font-size:3rem; margin-bottom:0.5rem; animation:float 3s ease-in-out infinite;">⚡</div>
      <h3 style="font-family:'Orbitron';">NO ACTIVE MISSION</h3>
      <p style="opacity:0.6; font-family:'JetBrains Mono'; font-size:0.85rem; margin-top:0.4rem;">SELECT YOUR BATTLE MODE</p>
      <div style="display:flex; gap:0.8rem; margin-top:1.2rem; flex-wrap:wrap; justify-content:center;">
        <button class="btn-primary btn-inline" onclick="initiateFullCourseExam()">⚔️ FULL COURSE WAR</button>
        <button class="btn-primary btn-inline" style="background: linear-gradient(135deg,#00bcd4,#00897b);" onclick="openTopicsModal('exam')">📚 TOPIC RAID</button>
      </div>
    </div>`;
    const nav = document.getElementById('questionNavContainer');
    if (nav) nav.innerHTML = '';
  } else {
    renderCurrentQuestion();
  }
}
viewRenderers.cbt = renderExamViewEntry;
window.startRestoredExam = function () {
  startTimer(true);
  renderCurrentQuestion();
  Sound.powerUp();
};

export async function initiateFullCourseExam() {
  if (!state.currentCourseId) { window.requireCourseThen('cbt'); return; }
  Sound.powerUp();
  resetExamEnvironment();
  state.activeQuestions = await buildShuffledSet({ courseId: state.currentCourseId });
  if (!state.activeQuestions.length) { toast('No questions available for this course yet.', 'error'); Sound.error(); return; }
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
  Sound.powerUp();
  resetExamEnvironment();
  const filtered = await buildShuffledSet({ courseId: state.currentCourseId, topicId });
  if (!filtered.length) { toast('No questions available for this topic yet.', 'error'); Sound.error(); return; }
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
  Sound.select();
  resetExamEnvironment();
  state.activeQuestions = await buildShuffledSet({ courseId: state.currentCourseId, topicId: topicId || undefined });
  if (!state.activeQuestions.length) { toast('No questions available for this topic yet.', 'error'); Sound.error(); return; }
  state.userSelections = new Array(state.activeQuestions.length).fill(null);
  state.currentQIndex = 0;
  state.examActive = true;
  state.practiceActive = true;
  state.practiceCombo = 0;
  navigateTo('cbt');
  renderCurrentQuestion();
}
window.startPracticeByTopic = startPracticeByTopic;
window.exitPractice = function () {
  Sound.whoosh();
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
  const qData = state.activeQuestions[state.currentQIndex];
  const selectedVal = state.userSelections[state.currentQIndex];
  const hasAnswer = state.practiceActive && selectedVal !== null;
  const combo = state.practiceCombo || 0;
  const optionsHtml = qData.options.map((opt, idx) => `
    <div class="option-item" data-opt-idx="${idx}">
      <label style="display: flex; align-items: center; cursor: pointer; width:100%;">
        <input type="radio" name="dynamicRadio" ${hasAnswer ? 'disabled' : ''} ${selectedVal === opt ? 'checked' : ''}>
        <span>${escapeHtml(opt)}</span>
      </label>
    </div>
  `).join('');
  box.innerHTML = `
    <div class="glass-card">
      <div class="flex-between" style="margin-bottom: 1rem;">
        <span class="progress-badge">🎯 ${state.currentQIndex + 1}/${state.activeQuestions.length} // MISSION</span>
        <span class="progress-badge">⚡ ${escapeHtml(qData.topic || 'General')}</span>
        ${state.practiceActive ? `<span class="progress-badge">🔥 COMBO x${combo}</span><button class="admin-btn" onclick="exitPractice()">Exit practice</button>` : ''}
      </div>
      <p style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1.2rem; line-height:1.4;">${escapeHtml(qData.q)}</p>
      <div id="optionList">${optionsHtml}</div>
      ${hasAnswer ? `<div class="practice-feedback ${selectedVal === qData.answer ? 'practice-correct' : 'practice-wrong'}">
        <strong>${selectedVal === qData.answer ? `✅ CORRECT // +${100 + Math.min(combo, 10) * 10} XP${combo >= 3 ? ` // COMBO x${combo}` : ''}` : '❌ WRONG // COMBO RESET'}</strong>
        <div>Correct answer: <strong>${escapeHtml(qData.answer)}</strong></div>
        ${qData.explanation ? `<div class="explanation-box">💡 ${escapeHtml(qData.explanation)}</div>` : ''}
      </div>` : ''}
    </div>
  `;
  if (!hasAnswer) {
    box.querySelectorAll('.option-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = Number(item.getAttribute('data-opt-idx'));
        const answer = qData.options[idx];
        if (answer != null) window.updateAnswer(state.currentQIndex, answer);
      });
    });
  }
  renderNavigator();
  persistActiveExam();
}

window.updateAnswer = function (qIdx, ans) {
  if (state.examActive && qIdx >= 0) {
    state.userSelections[qIdx] = ans;
    persistActiveExam();
    if (state.practiceActive) {
      const correct = state.activeQuestions[qIdx].answer === ans;
      if (correct) {
        state.practiceCombo = (state.practiceCombo || 0) + 1;
        const gained = 100 + Math.min(state.practiceCombo, 10) * 10;
        if (state.currentStudent) addXp(state.currentStudent.regNumber, gained, { correct: true, combo: state.practiceCombo });
        Sound.success();
        if (state.practiceCombo === 3 || state.practiceCombo === 5 || state.practiceCombo === 10) {
          toast(`🔥 COMBO x${state.practiceCombo} — keep the streak!`, 'success');
          Sound.coin();
        }
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
  }
};
window.changeQuestion = function (delta) {
  if (state.examActive) {
    Sound.tap();
    const n = state.currentQIndex + delta;
    if (n >= 0 && n < state.activeQuestions.length) { state.currentQIndex = n; renderCurrentQuestion(); }
  }
};

// ---------------- submission ----------------
function showConfirmModal() { Sound.click(); document.getElementById('confirmModal')?.classList.add('active'); }
function hideConfirmModal() { Sound.tap(); document.getElementById('confirmModal')?.classList.remove('active'); }
function showScoreModal(scoreText, percent, timeUsed) {
  document.getElementById('finalScoreDisplay').innerText = scoreText;
  document.getElementById('finalPercentDisplay').innerHTML = `${percent}% • ${scoreText.split('/')[0]} correct`;
  document.getElementById('finalTimeDisplay').innerText = `Time used: ${formatTime(timeUsed)}`;
  const xpFill = document.getElementById('scoreXpFill');
  if (xpFill) {
    xpFill.style.width = '0%';
    setTimeout(() => { xpFill.style.width = `${percent}%`; }, 100);
  }
  document.getElementById('scoreModal')?.classList.add('active');
  if (percent >= 70) Sound.levelUp();
  else if (percent >= 50) Sound.success();
  else Sound.error();
}
function hideScoreModal() { Sound.tap(); document.getElementById('scoreModal')?.classList.remove('active'); }

window.requestSubmitConfirmation = function () { if (state.examActive) showConfirmModal(); };

async function finalizeExamAndShowScore() {
  if (!state.examActive || state.isFinalizing) return;
  state.isFinalizing = true;
  stopTimer();
  Sound.submit();

  let correctCount = 0;
  const detailed = state.userSelections.map((ans, idx) => {
    const q = state.activeQuestions[idx];
    const isCor = (ans === q.answer);
    if (isCor) correctCount++;
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
