/*
  SESSION SETUP — two-step wizard shown before practice, exams and flashcards
  --------------------------------------------------------------------------
  Step 1  choose a topic (or the whole course)
  Step 2  choose how many questions to draw (practice & exam only)
  The wizard reports how many questions in the chosen scope are still new to
  the student and lets them reset that memory.
*/

import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml, clamp, pluralize, toast } from './utils.js';
import { startSession, EXAM_DURATION_SECONDS } from './exam.js';
import { loadFlashcardsForScope } from './flashcards.js';
import { Sound } from './sound.js';
import { dedupeQuestions, questionKey } from './questionBank.js';
import { getSeenKeys, clearSeen } from './seenStore.js';

const FULL_COURSE = '__full__';
const COUNT_PRESETS = [5, 10, 15, 20, 30, 40, 50];

const setup = {
  mode: 'practice',
  topicId: FULL_COURSE,
  topics: [],
  pool: [],
  seen: new Set()
};

const MODE_COPY = {
  practice: { eyebrow: 'Practice session', hint: 'Untimed. You get instant feedback and an explanation after each answer.' },
  exam: { eyebrow: 'Timed examination', hint: `Timed at ${EXAM_DURATION_SECONDS / 60} minutes. Answers are marked when you submit and the result is saved to your history.` },
  flashcards: { eyebrow: 'Flashcards', hint: 'Pick a topic to review, or revise the whole course.' }
};

function el(id) { return document.getElementById(id); }

function scopePool(topicId) {
  return topicId === FULL_COURSE ? setup.pool : setup.pool.filter(q => q.topicId === topicId);
}
function unseenCount(pool) {
  return pool.filter(q => !setup.seen.has(questionKey(q))).length;
}

async function loadScopeData() {
  const courseId = state.currentCourseId;
  const [topics, questions] = await Promise.all([DB.getTopics(courseId), DB.getQuestions({ courseId })]);
  setup.topics = topics;
  setup.pool = dedupeQuestions(questions);
  setup.seen = getSeenKeys(state.currentStudent?.regNumber, courseId);
}

export async function openSessionSetup(mode = 'practice', { topicId = null } = {}) {
  Sound.whoosh();
  setup.mode = MODE_COPY[mode] ? mode : 'practice';
  if (!state.currentStudent) { window.navigateTo('login'); return; }
  if (!state.currentCourseId) { window.requireCourseThen(setup.mode); return; }

  try { await loadScopeData(); }
  catch (error) {
    console.error(error);
    toast('Could not load the question bank. Please try again.', 'error');
    return;
  }

  const copy = MODE_COPY[setup.mode];
  el('sessionModalEyebrow').textContent = copy.eyebrow;
  el('sessionTopicHint').textContent = copy.hint;
  el('sessionModal')?.classList.add('active');

  const wantsTopic = topicId && setup.topics.some(t => t.id === topicId);
  if (wantsTopic && setup.mode !== 'flashcards') {
    showCountStep(topicId);
  } else {
    renderTopicStep();
  }
}
window.openSessionSetup = openSessionSetup;
window.openTopicsModal = openSessionSetup; // legacy alias

function renderTopicStep() {
  setStep(1);
  el('sessionModalTitle').textContent = 'Choose a topic';
  const container = el('sessionTopicList');
  const rows = [];

  const fullPool = setup.pool;
  rows.push(topicRow(FULL_COURSE, 'Full course', 'Every topic in this course', fullPool.length, unseenCount(fullPool)));
  for (const topic of setup.topics) {
    const pool = scopePool(topic.id);
    rows.push(topicRow(topic.id, topic.name, null, pool.length, unseenCount(pool)));
  }

  if (!setup.topics.length && !fullPool.length) {
    container.innerHTML = '<p class="muted">No topics or questions have been published for this course yet.</p>';
    return;
  }
  container.innerHTML = rows.join('');
  container.querySelectorAll('.topic-row').forEach(btn => {
    btn.addEventListener('click', () => { Sound.select(); onTopicPicked(btn.getAttribute('data-topic')); });
  });
}

function topicRow(id, name, subtitle, total, unseen) {
  const disabled = total === 0;
  const meta = disabled
    ? 'No questions yet'
    : `${pluralize(total, 'question')}${setup.mode !== 'flashcards' ? ` · ${unseen} new to you` : ''}`;
  return `
    <button type="button" class="topic-row" data-topic="${escapeHtml(id)}" ${disabled ? 'disabled' : ''}>
      <span class="topic-row-main">
        <span class="topic-row-name">${escapeHtml(name)}</span>
        ${subtitle ? `<span class="topic-row-sub">${escapeHtml(subtitle)}</span>` : ''}
      </span>
      <span class="topic-row-meta">${meta}</span>
      <span class="topic-row-arrow" aria-hidden="true">›</span>
    </button>`;
}

function onTopicPicked(topicId) {
  if (setup.mode === 'flashcards') {
    closeSessionSetup();
    loadFlashcardsForScope(topicId === FULL_COURSE ? null : topicId);
    return;
  }
  showCountStep(topicId);
}

function showCountStep(topicId) {
  setup.topicId = topicId;
  setStep(2);
  const topic = setup.topics.find(t => t.id === topicId);
  const pool = scopePool(topicId);
  const available = pool.length;
  const unseen = unseenCount(pool);

  el('sessionModalTitle').textContent = 'How many questions?';
  el('sessionSummary').innerHTML = `
    <div class="summary-item"><span class="summary-label">Course scope</span><strong>${escapeHtml(topic ? topic.name : 'Full course')}</strong></div>
    <div class="summary-item"><span class="summary-label">Available</span><strong>${available}</strong></div>
    <div class="summary-item"><span class="summary-label">New to you</span><strong>${unseen}</strong></div>
    <div class="summary-item"><span class="summary-label">Mode</span><strong>${setup.mode === 'exam' ? `Timed · ${EXAM_DURATION_SECONDS / 60} min` : 'Untimed practice'}</strong></div>`;

  const suggested = setup.mode === 'exam' ? 30 : 10;
  const defaultCount = available <= suggested ? available : suggested;
  const input = el('sessionCountInput');
  input.min = 1;
  input.max = available;
  input.value = defaultCount;

  const chips = COUNT_PRESETS.filter(n => n < available).map(n => `<button type="button" class="chip chip-btn" data-count="${n}">${n}</button>`);
  chips.push(`<button type="button" class="chip chip-btn" data-count="${available}">All ${available}</button>`);
  const chipRow = el('sessionCountChips');
  chipRow.innerHTML = chips.join('');
  chipRow.querySelectorAll('.chip-btn').forEach(chip => chip.addEventListener('click', () => {
    Sound.tap();
    input.value = chip.getAttribute('data-count');
    syncCountUI();
  }));
  input.oninput = syncCountUI;
  input.onchange = () => { input.value = clamp(parseInt(input.value, 10) || 1, 1, available); syncCountUI(); };

  const resetBtn = el('sessionResetSeenBtn');
  resetBtn.onclick = () => {
    Sound.tap();
    clearSeen(state.currentStudent?.regNumber, state.currentCourseId, pool.map(questionKey));
    setup.seen = getSeenKeys(state.currentStudent?.regNumber, state.currentCourseId);
    toast('Question memory reset for this scope.', 'success');
    showCountStep(topicId);
  };
  resetBtn.classList.toggle('hidden', unseen === available);

  syncCountUI();
  setTimeout(() => input.focus({ preventScroll: true }), 60);
}

function syncCountUI() {
  const input = el('sessionCountInput');
  const available = Number(input.max) || 0;
  const value = clamp(parseInt(input.value, 10) || 0, 0, available);
  const pool = scopePool(setup.topicId);
  const unseen = unseenCount(pool);

  el('sessionCountChips').querySelectorAll('.chip-btn').forEach(chip => {
    chip.classList.toggle('is-active', Number(chip.getAttribute('data-count')) === value);
  });

  const hint = el('sessionCountHint');
  const start = el('sessionStartBtn');
  if (!available) {
    hint.textContent = 'There are no questions in this scope yet.';
    start.disabled = true;
    return;
  }
  if (value < 1) {
    hint.textContent = `Enter a number between 1 and ${available}.`;
    start.disabled = true;
    return;
  }
  start.disabled = false;
  if (value <= unseen) {
    hint.textContent = `${value} ${value === 1 ? 'question' : 'questions'} will be drawn at random from the ${unseen} you have not seen yet.`;
  } else if (unseen > 0) {
    hint.textContent = `All ${unseen} unseen questions will be included; the remaining ${value - unseen} will be repeats from earlier sessions.`;
  } else {
    hint.textContent = 'You have seen every question in this scope — a fresh random cycle will start.';
  }
  start.textContent = setup.mode === 'exam' ? `Start exam · ${value}` : `Start practice · ${value}`;
}

function setStep(step) {
  el('sessionStepTopic').classList.toggle('hidden', step !== 1);
  el('sessionStepCount').classList.toggle('hidden', step !== 2);
  document.querySelectorAll('#sessionModal .step').forEach(s => {
    const n = Number(s.getAttribute('data-step'));
    s.classList.toggle('is-active', n === step);
    s.classList.toggle('is-done', n < step);
  });
}

window.sessionSetupBack = function () { Sound.tap(); renderTopicStep(); };

window.sessionSetupStart = async function () {
  const input = el('sessionCountInput');
  const available = Number(input.max) || 0;
  const count = clamp(parseInt(input.value, 10) || 0, 1, available);
  if (!available) return;
  const startBtn = el('sessionStartBtn');
  startBtn.disabled = true;
  try {
    closeSessionSetup();
    await startSession({ mode: setup.mode, topicId: setup.topicId === FULL_COURSE ? null : setup.topicId, count });
  } finally {
    startBtn.disabled = false;
  }
};

export function closeSessionSetup() {
  Sound.tap();
  el('sessionModal')?.classList.remove('active');
}
window.closeSessionSetup = closeSessionSetup;
window.closeTopicsModal = closeSessionSetup; // legacy alias
