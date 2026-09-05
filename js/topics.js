import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml } from './utils.js';
// NOTE: not importing nav.js here — nav.js calls window.openTopicsModal(), and
// importing nav.js back would create a module cycle. We call window.requireCourseThen
// the same way, for the same reason.
import { initiateFullCourseExam, startExamByTopic, startPracticeByTopic } from './exam.js';
import { loadFlashcardsForScope } from './flashcards.js';

let currentMode = 'exam'; // 'exam' | 'practice' | 'flashcards'

export async function openTopicsModal(mode) {
  currentMode = mode || 'exam';
  if (!state.currentCourseId) { window.requireCourseThen(currentMode === 'flashcards' ? 'flashcards' : 'topics'); return; }

  const topics = await DB.getTopics(state.currentCourseId);
  const container = document.getElementById('topicsListContainer');
  const heading = document.getElementById('topicsModalHint');
  if (heading) {
    heading.innerText = currentMode === 'flashcards'
      ? 'Select a topic to review its flashcards, or study the full course.'
      : currentMode === 'practice'
        ? 'Select a topic to practice without a timer. Answers show immediately.'
        : 'Select a topic to start a focused exam with a 30 min timer.';
  }

  const rows = [];
  const allQs = await DB.getQuestions({ courseId: state.currentCourseId });
  rows.push(`<button class="topic-btn" data-topic="__full__">🌐 Full Course <span class="topic-badge">${allQs.length} Qs</span></button>`);

  for (const topic of topics) {
    const count = (await DB.getQuestions({ courseId: state.currentCourseId, topicId: topic.id })).length;
    rows.push(`<button class="topic-btn" data-topic="${topic.id}">📖 ${escapeHtml(topic.name)} <span class="topic-badge">${count} Qs</span></button>`);
  }

  if (!topics.length && !allQs.length) {
    container.innerHTML = `<p>No topics yet for this course. Ask the admin to add some.</p>`;
  } else {
    container.innerHTML = rows.join('');
    container.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => handleTopicPick(btn.getAttribute('data-topic')));
    });
  }
  document.getElementById('topicsModal').classList.add('active');
}
window.openTopicsModal = openTopicsModal;

function handleTopicPick(topicId) {
  window.closeTopicsModal();
  const isFull = topicId === '__full__';
  if (currentMode === 'practice') {
    if (isFull) startPracticeByTopic(null);
    else startPracticeByTopic(topicId);
  } else if (currentMode === 'exam') {
    if (isFull) initiateFullCourseExam();
    else startExamByTopic(topicId);
  } else {
    loadFlashcardsForScope(isFull ? null : topicId);
  }
}

window.closeTopicsModal = function () { document.getElementById('topicsModal').classList.remove('active'); };
