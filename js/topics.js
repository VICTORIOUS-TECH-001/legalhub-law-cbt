import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { initiateFullCourseExam, startExamByTopic, startPracticeByTopic } from './exam.js';
import { loadFlashcardsForScope } from './flashcards.js';
import { Sound } from './sound.js';

let currentMode = 'exam';

export async function openTopicsModal(mode) {
  Sound.whoosh();
  currentMode = mode || 'exam';
  if (!state.currentCourseId) { window.requireCourseThen(currentMode === 'flashcards' ? 'flashcards' : 'topics'); return; }

  const topics = await DB.getTopics(state.currentCourseId);
  const container = document.getElementById('topicsListContainer');
  const heading = document.getElementById('topicsModalHint');
  if (heading) {
    heading.innerText = currentMode === 'flashcards'
      ? '🧠 Select topic to load NEURAL DECK, or full course for total brain hack.'
      : currentMode === 'practice'
        ? '🎯 TRAINING MODE // No timer. Instant feedback. Level up your skills.'
        : '⚔️ BATTLE MODE // Select topic for focused 30min war. Full course = ultimate challenge.';
  }

  const rows = [];
  const allQs = await DB.getQuestions({ courseId: state.currentCourseId });
  rows.push(`<button class="topic-btn" data-topic="__full__">🌐 FULL COURSE WAR <span class="topic-badge">${allQs.length} Qs</span></button>`);

  for (const topic of topics) {
    const count = (await DB.getQuestions({ courseId: state.currentCourseId, topicId: topic.id })).length;
    rows.push(`<button class="topic-btn" data-topic="${topic.id}">📖 ${escapeHtml(topic.name)} <span class="topic-badge">${count} Qs</span></button>`);
  }

  if (!topics.length && !allQs.length) {
    container.innerHTML = `<p style="font-family:'JetBrains Mono'; opacity:0.6;">No topics deployed. Contact Command Center.</p>`;
  } else {
    container.innerHTML = rows.join('');
    container.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => { Sound.select(); handleTopicPick(btn.getAttribute('data-topic')); });
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

window.closeTopicsModal = function () { Sound.tap(); document.getElementById('topicsModal').classList.remove('active'); };
