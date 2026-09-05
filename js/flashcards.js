import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { navigateTo, viewRenderers } from './nav.js';

export async function loadFlashcardsForScope(topicId) {
  state.currentTopicId = topicId || null;
  if (topicId) {
    const topics = await DB.getTopics(state.currentCourseId);
    const t = topics.find(x => x.id === topicId);
    state.currentTopicName = t ? t.name : null;
  } else {
    state.currentTopicName = null;
  }
  navigateTo('flashcards');
}
window.loadFlashcardsForScope = loadFlashcardsForScope;

async function renderFlashcardsView() {
  const badge = document.getElementById('flashCourseBadge');
  const courses = await DB.getCourses();
  const course = state.currentCourseId ? courses.find(c => c.id === state.currentCourseId) : null;
  const flashDiv = document.getElementById('flashcardArea');

  if (!state.currentCourseId) {
    if (badge) badge.innerText = '—';
    flashDiv.innerHTML = `<div class="glass-card" style="text-align:center; grid-column: 1/-1;">Pick a course from your dashboard to view its flashcards.</div>`;
    return;
  }

  if (badge) badge.innerText = state.currentTopicName ? `${course.name} • ${state.currentTopicName}` : (course ? course.name : '—');

  const qs = await DB.getQuestions({ courseId: state.currentCourseId, topicId: state.currentTopicId || undefined });
  if (!qs.length) {
    flashDiv.innerHTML = `
      <div class="glass-card" style="text-align:center; grid-column: 1/-1;">
        No flashcards for this ${state.currentTopicId ? 'topic' : 'course'} yet.<br><br>
        <button class="btn-primary btn-inline" onclick="openTopicsModal('flashcards')">📚 Choose a Topic</button>
      </div>`;
    return;
  }
  flashDiv.innerHTML = qs.slice(0, 80).map(q => `
    <div class="flashcard-3d">
      <div class="flip-inner">
        <div class="front-face">❓ ${escapeHtml(q.q)}</div>
        <div class="back-face">🔮 ${escapeHtml(q.answer)}</div>
      </div>
    </div>`).join('');
}
viewRenderers.flashcards = renderFlashcardsView;
