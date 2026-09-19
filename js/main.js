import { state } from './state.js';
import { navigateTo } from './nav.js';
import { restoreSession } from './auth.js';
import { restoreActiveExam } from './exam.js';
import { Sound } from './sound.js';

// Side-effect imports: each of these attaches window.* handlers and/or
// registers itself into nav.js's viewRenderers registry.
import './dashboard.js';
import './topics.js';
import './flashcards.js';
import './history.js';
import './admin.js';

// Initialize sound toggle UI
function initSoundUI() {
  window.updateSoundToggleUI?.();
  // Auto-play subtle whoosh on load after user interaction
  document.addEventListener('click', () => {
    if (Sound.enabled) {
      try { Sound.enabled = Sound.enabled; } catch {}
    }
  }, { once: true });
}

(async function init() {
  initSoundUI();
  await restoreSession();
  const restoredExam = state.currentStudent ? await restoreActiveExam() : false;
  navigateTo(state.currentStudent ? (restoredExam ? 'cbt' : 'dashboard') : 'login');
  if (restoredExam) {
    window.startRestoredExam?.();
  }
  // Gamer welcome sound after short delay if logged in
  if (state.currentStudent) {
    setTimeout(() => Sound.powerUp(), 500);
  }
})();
