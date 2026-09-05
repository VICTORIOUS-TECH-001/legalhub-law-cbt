import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { viewRenderers } from './nav.js';

async function renderHistoryLog() {
  const histDiv = document.getElementById('historyList');
  if (!state.currentStudent) { histDiv.innerHTML = ''; return; }
  const stored = await DB.getHistory(state.currentStudent.regNumber);
  if (!stored.length) {
    histDiv.innerHTML = `<div style="text-align:center;">✨ No previous attempts yet. Start an exam from your dashboard.</div>`;
    return;
  }
  histDiv.innerHTML = stored.map((e, idx) => {
    const detailsHtml = e.details.map((d, i) => {
      const icon = d.isCorrect ? '✅' : '❌';
      const detailClass = d.isCorrect ? 'history-detail-correct' : 'history-detail-wrong';
      const explanationHtml = d.explanation
        ? `<div class="explanation-box">💡 <strong>Explanation:</strong> ${escapeHtml(d.explanation)}</div>`
        : '';
      return `<div class="${detailClass} history-detail-item">
        <small><strong>Q${i + 1}:</strong> ${escapeHtml(d.question)}<br>
        <span class="detail-icon">${icon}</span> <strong>Your answer:</strong> ${escapeHtml(d.userAnswer)}
        &nbsp;|&nbsp; ✅ Correct: ${escapeHtml(d.correctAnswer)}</small>
        ${explanationHtml}
      </div>`;
    }).join('');
    return `<div class="glass-card history-item">
      <div class="flex-between">
        <strong>📅 ${e.date}</strong>
        <span class="progress-badge">📘 ${escapeHtml(e.courseName || '—')}</span>
        <span>⭐ ${e.scoreDisplay} (${e.scorePercent}%)</span>
      </div>
      <p class="history-meta">⏱️ Time used: ${escapeHtml(e.timeUsedDisplay || 'Not recorded')}</p>
      ${detailsHtml}
      <button class="modal-btn cancel" style="margin-top:0.5rem;" onclick="deleteHistoryEntry(${idx})">🗑️ Delete</button>
    </div>`;
  }).join('');
}
viewRenderers.corrections = renderHistoryLog;

window.deleteHistoryEntry = async function (idx) {
  if (!state.currentStudent) return;
  await DB.deleteHistoryEntry(state.currentStudent.regNumber, idx);
  renderHistoryLog();
};
