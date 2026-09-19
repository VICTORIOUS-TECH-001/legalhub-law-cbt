import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { viewRenderers } from './nav.js';
import { Sound } from './sound.js';

async function renderHistoryLog() {
  const histDiv = document.getElementById('historyList');
  if (!state.currentStudent) { histDiv.innerHTML = ''; return; }
  const stored = await DB.getHistory(state.currentStudent.regNumber);
  if (!stored.length) {
    histDiv.innerHTML = `<div style="text-align:center; padding:2rem;"><div style="font-size:3rem;">📭</div><p style="font-family:'Orbitron';">NO WAR LOGS YET</p><p style="opacity:0.6; font-size:0.85rem; font-family:'JetBrains Mono';">Start a battle from base to generate logs.</p></div>`;
    return;
  }
  histDiv.innerHTML = stored.map((e, idx) => {
    const detailsHtml = e.details.map((d, i) => {
      const icon = d.isCorrect ? '✅' : '❌';
      const detailClass = d.isCorrect ? 'history-detail-correct' : 'history-detail-wrong';
      const explanationHtml = d.explanation
        ? `<div class="explanation-box">💡 <strong>Intel:</strong> ${escapeHtml(d.explanation)}</div>`
        : '';
      return `<div class="${detailClass} history-detail-item">
        <small><strong>Q${i + 1}:</strong> ${escapeHtml(d.question)}<br>
        <span class="detail-icon">${icon}</span> <strong>Your answer:</strong> ${escapeHtml(d.userAnswer)}
        &nbsp;|&nbsp; ✅ Correct: ${escapeHtml(d.correctAnswer)}</small>
        ${explanationHtml}
      </div>`;
    }).join('');
    const rank = e.scorePercent >= 80 ? 'S-RANK // LEGEND' : e.scorePercent >= 60 ? 'A-RANK // PRO' : e.scorePercent >= 40 ? 'B-RANK // ROOKIE' : 'C-RANK // TRAINING NEEDED';
    const rankColor = e.scorePercent >= 80 ? 'var(--neon-green)' : e.scorePercent >= 60 ? 'var(--neon-cyan)' : e.scorePercent >= 40 ? 'var(--neon-yellow)' : '#ff4444';
    return `<div class="glass-card history-item">
      <div class="flex-between">
        <strong style="font-family:'JetBrains Mono';">📅 ${e.date}</strong>
        <span class="progress-badge">📘 ${escapeHtml(e.courseName || '—')}</span>
        <span style="font-family:'Orbitron'; font-weight:800; color:${rankColor};">⭐ ${e.scoreDisplay} (${e.scorePercent}%)</span>
      </div>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.6rem;">
        <span class="import-stat">⏱️ ${escapeHtml(e.timeUsedDisplay || 'N/A')}</span>
        <span class="import-stat" style="color:${rankColor}; border-color:${rankColor};">${rank}</span>
        <div class="xp-bar" style="flex:1; min-width:120px;"><div class="xp-fill" style="width:${e.scorePercent}%; background:linear-gradient(90deg,${rankColor},var(--neon-cyan));"></div></div>
      </div>
      <div style="margin-top:0.8rem;">${detailsHtml}</div>
      <button class="modal-btn cancel" style="margin-top:0.8rem;" onclick="deleteHistoryEntry(${idx})">🗑️ DELETE LOG</button>
    </div>`;
  }).join('');
}
viewRenderers.corrections = renderHistoryLog;

window.deleteHistoryEntry = async function (idx) {
  Sound.tap();
  if (!state.currentStudent) return;
  if (!confirm('Delete this war log?')) return;
  Sound.explosion();
  await DB.deleteHistoryEntry(state.currentStudent.regNumber, idx);
  renderHistoryLog();
};
