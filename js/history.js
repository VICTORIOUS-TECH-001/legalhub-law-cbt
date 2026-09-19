import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml, pluralize } from './utils.js';
import { viewRenderers } from './nav.js';
import { Sound } from './sound.js';
import { gradeBand } from './exam.js';

async function renderHistoryLog() {
  const histDiv = document.getElementById('historyList');
  const summary = document.getElementById('historySummary');
  if (!state.currentStudent) { histDiv.innerHTML = ''; return; }
  const stored = await DB.getHistory(state.currentStudent.regNumber);

  if (!stored.length) {
    if (summary) summary.innerHTML = '';
    histDiv.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">📄</div>
        <h3>No results yet</h3>
        <p>Your exam results and corrections will appear here after you submit a timed exam.</p>
        <div class="btn-row"><button class="btn btn-primary" onclick="requireCourseThen('exam')">Take an exam</button></div>
      </div>`;
    return;
  }

  if (summary) {
    const avg = Math.round(stored.reduce((sum, e) => sum + (e.scorePercent || 0), 0) / stored.length);
    const best = Math.max(...stored.map(e => e.scorePercent || 0));
    summary.innerHTML = `
      <div class="stat"><span class="stat-value">${stored.length}</span><span class="stat-label">Exams</span></div>
      <div class="stat"><span class="stat-value">${avg}%</span><span class="stat-label">Average</span></div>
      <div class="stat"><span class="stat-value">${best}%</span><span class="stat-label">Best</span></div>`;
  }

  histDiv.innerHTML = stored.map((entry, idx) => {
    const band = gradeBand(entry.scorePercent || 0);
    const wrong = (entry.details || []).filter(d => !d.isCorrect).length;
    const detailsHtml = (entry.details || []).map((d, i) => `
      <div class="review-item ${d.isCorrect ? 'review-correct' : 'review-wrong'}">
        <div class="review-q"><span class="review-index">${i + 1}</span>${escapeHtml(d.question)}</div>
        <div class="review-answers">
          <span>Your answer: <strong>${escapeHtml(d.userAnswer)}</strong></span>
          ${d.isCorrect ? '<span class="review-mark">Correct</span>' : `<span>Correct answer: <strong>${escapeHtml(d.correctAnswer)}</strong></span>`}
        </div>
        ${d.explanation ? `<div class="explanation">${escapeHtml(d.explanation)}</div>` : ''}
      </div>`).join('');

    return `
      <article class="card history-item">
        <header class="history-head">
          <div>
            <div class="history-title">${escapeHtml(entry.courseName || 'Course')} <span class="muted">· ${escapeHtml(entry.topicName || 'Full course')}</span></div>
            <div class="muted small mono">${escapeHtml(entry.date || '')} · ${escapeHtml(entry.timeUsedDisplay || '—')} used</div>
          </div>
          <div class="history-score">
            <span class="score-value">${entry.scorePercent}%</span>
            <span class="chip chip-${band.tone}">${band.label}</span>
          </div>
        </header>
        <div class="progress-track"><div class="progress-fill fill-${band.tone}" style="width:${entry.scorePercent}%"></div></div>
        <div class="history-meta">
          <span>${escapeHtml(entry.scoreDisplay)} correct</span>
          <span>${pluralize(wrong, 'question')} to review</span>
        </div>
        <details class="review">
          <summary>Review answers & explanations</summary>
          <div class="review-list">${detailsHtml}</div>
        </details>
        <div class="history-actions">
          <button class="btn btn-ghost btn-sm btn-danger-text" onclick="deleteHistoryEntry(${idx})">Delete result</button>
        </div>
      </article>`;
  }).join('');
}
viewRenderers.corrections = renderHistoryLog;

window.deleteHistoryEntry = async function (idx) {
  Sound.tap();
  if (!state.currentStudent) return;
  if (!confirm('Delete this result? This cannot be undone.')) return;
  await DB.deleteHistoryEntry(state.currentStudent.regNumber, idx);
  renderHistoryLog();
};
