import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { navigateTo, viewRenderers } from './nav.js';
import { Sound } from './sound.js';

export async function loadFlashcardsForScope(topicId) {
  Sound.whoosh();
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
    flashDiv.innerHTML = `<div class="glass-card" style="text-align:center; grid-column: 1/-1;"><div style="font-size:2rem;">🧠</div><p>Select a mission from base to load neural deck.</p></div>`;
    return;
  }

  if (badge) badge.innerText = state.currentTopicName ? `${course.name} • ${state.currentTopicName}` : (course ? course.name : '—');

  const qs = await DB.getQuestions({ courseId: state.currentCourseId, topicId: state.currentTopicId || undefined });
  if (!qs.length) {
    flashDiv.innerHTML = `
      <div class="glass-card" style="text-align:center; grid-column: 1/-1;">
        <div style="font-size:2.5rem;">📭</div>
        <p>No neural cards for this ${state.currentTopicId ? 'topic' : 'course'} yet.</p><br>
        <button class="btn-primary btn-inline" onclick="openTopicsModal('flashcards')">📚 Choose Topic Deck</button>
      </div>`;
    return;
  }
  flashDiv.innerHTML = qs.slice(0, 80).map(q => `
    <div class="flashcard-3d" tabindex="0">
      <div class="flip-inner">
        <div class="front-face">❓ ${escapeHtml(q.q)}</div>
        <div class="back-face">🔮 ${escapeHtml(q.answer)}</div>
      </div>
    </div>`).join('');
  flashDiv.querySelectorAll('.flashcard-3d').forEach(card => {
    const flip = () => { card.classList.toggle('flipped'); Sound.select(); };
    card.addEventListener('click', flip);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
    card.addEventListener('mouseenter', () => Sound.hover());
  });
}
viewRenderers.flashcards = renderFlashcardsView;
