import { state } from './state.js';
import { navigateTo } from './nav.js';
import { restoreSession } from './auth.js';
import { restoreActiveExam } from './exam.js';
import { Sound } from './sound.js';
import { hideBootScreen, setBootStatus, toast } from './utils.js';

import './dashboard.js';
import './topics.js';
import './flashcards.js';
import './history.js';
import './admin.js';

function showLoginSafely() {
  const login = document.getElementById('login');
  ['dashboard', 'cbt', 'corrections', 'flashcards'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  if (login) login.style.display = 'flex';
}

function initSoundUI() {
  window.updateSoundToggleUI?.();
  document.addEventListener('click', () => {
    try { if (Sound.enabled) Sound.enabled = Sound.enabled; } catch { /* ignore */ }
  }, { once: true });
}

(async function init() {
  initSoundUI();
  setBootStatus('LINKING NEURAL CORE…');
  try {
    await restoreSession();
    setBootStatus(state.currentStudent ? `PLAYER ${state.currentStudent.name.split(' ')[0]} DETECTED` : 'AWAITING PLAYER ID…');
    const restoredExam = state.currentStudent ? await restoreActiveExam() : false;
    navigateTo(state.currentStudent ? (restoredExam ? 'cbt' : 'dashboard') : 'login');
    if (restoredExam) window.startRestoredExam?.();
    if (state.currentStudent) setTimeout(() => Sound.powerUp(), 400);
  } catch (error) {
    console.error('Arena boot failed', error);
    toast('Boot glitch recovered — local arena is online.', 'error');
    showLoginSafely();
  } finally {
    const login = document.getElementById('login');
    const dashboard = document.getElementById('dashboard');
    const visible = [login, dashboard, document.getElementById('cbt')]
      .some(el => el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none');
    if (!visible) showLoginSafely();
    hideBootScreen();
  }
})();
