import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml, pluralize, shuffleArray } from './utils.js';
import { navigateTo, viewRenderers } from './nav.js';
import { Sound } from './sound.js';
import { dedupeQuestions } from './questionBank.js';

const MAX_CARDS = 80;

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

  if (!state.currentCourseId || !course) {
    if (badge) badge.textContent = 'No course selected';
    flashDiv.innerHTML = `
      <div class="empty-state span-all">
        <div class="empty-icon" aria-hidden="true">▤</div>
        <h3>Choose a course first</h3>
        <p>Open a course from the dashboard, then pick a topic to revise.</p>
        <div class="btn-row"><button class="btn btn-primary" onclick="requireCourseThen('flashcards')">Choose topic</button></div>
      </div>`;
    return;
  }

  if (badge) badge.textContent = state.currentTopicName ? `${course.name} · ${state.currentTopicName}` : `${course.name} · Full course`;

  const qs = dedupeQuestions(await DB.getQuestions({ courseId: state.currentCourseId, topicId: state.currentTopicId || undefined }));
  if (!qs.length) {
    flashDiv.innerHTML = `
      <div class="empty-state span-all">
        <div class="empty-icon" aria-hidden="true">▤</div>
        <h3>No cards in this ${state.currentTopicId ? 'topic' : 'course'} yet</h3>
        <p>Try another topic or check back once questions have been added.</p>
        <div class="btn-row"><button class="btn btn-primary" onclick="openSessionSetup('flashcards')">Choose another topic</button></div>
      </div>`;
    return;
  }

  const cards = shuffleArray(qs).slice(0, MAX_CARDS);
  const countEl = document.getElementById('flashCount');
  if (countEl) countEl.textContent = `${pluralize(cards.length, 'card')}${qs.length > cards.length ? ` of ${qs.length}` : ''} · click a card to flip it`;

  flashDiv.innerHTML = cards.map((q, i) => `
    <div class="flashcard" tabindex="0" role="button" aria-pressed="false" aria-label="Flashcard ${i + 1}">
      <div class="flip-inner">
        <div class="flash-face flash-front"><span class="flash-label">Question</span><span class="flash-text">${escapeHtml(q.q)}</span></div>
        <div class="flash-face flash-back"><span class="flash-label">Answer</span><span class="flash-text">${escapeHtml(q.answer)}</span></div>
      </div>
    </div>`).join('');

  flashDiv.querySelectorAll('.flashcard').forEach(card => {
    const flip = () => {
      const flipped = card.classList.toggle('flipped');
      card.setAttribute('aria-pressed', String(flipped));
      Sound.select();
    };
    card.addEventListener('click', flip);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  });
}
viewRenderers.flashcards = renderFlashcardsView;
