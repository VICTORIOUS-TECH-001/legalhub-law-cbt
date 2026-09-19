import './theme.js';
import { state } from './state.js';
import { navigateTo } from './nav.js';
import { restoreSession } from './auth.js';
import { restoreActiveExam } from './exam.js';
import { hideBootScreen, setBootStatus, toast } from './utils.js';

import './dashboard.js';
import './sessionSetup.js';
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

(async function init() {
  window.updateSoundToggleUI?.();
  setBootStatus('Loading your workspace…');
  try {
    await restoreSession();
    setBootStatus(state.currentStudent ? `Welcome back, ${state.currentStudent.name.split(' ')[0]}` : 'Ready');
    const restoredExam = state.currentStudent ? await restoreActiveExam() : false;
    navigateTo(state.currentStudent ? (restoredExam ? 'cbt' : 'dashboard') : 'login');
    if (restoredExam) window.startRestoredExam?.();
  } catch (error) {
    console.error('Startup failed', error);
    toast('Something went wrong while starting up — running in offline mode.', 'error');
    showLoginSafely();
  } finally {
    const visible = ['login', 'dashboard', 'cbt']
      .map(id => document.getElementById(id))
      .some(el => el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none');
    if (!visible) showLoginSafely();
    hideBootScreen();
  }
})();
