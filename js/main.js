import { state } from './state.js';
import { navigateTo } from './nav.js';
import { restoreSession } from './auth.js';
import { restoreActiveExam } from './exam.js';
import { isPublicCourseLink, selectCourseFromUrl } from './courseLinks.js';

// Side-effect imports: each of these attaches window.* handlers and/or
// registers itself into nav.js's viewRenderers registry.
import './dashboard.js';
import './topics.js';
import './flashcards.js';
import './history.js';
import './admin.js';

(async function init() {
  await restoreSession();
  const publicCourseLink = isPublicCourseLink();
  if (publicCourseLink) {
    state.publicCourseLink = await selectCourseFromUrl();
  } else if (state.currentStudent) {
    await selectCourseFromUrl();
  }
  const restoredExam = state.currentStudent ? await restoreActiveExam() : false;
  navigateTo(state.publicCourseLink ? 'dashboard' : (state.currentStudent ? (restoredExam ? 'cbt' : 'dashboard') : 'login'));
  if (restoredExam) {
    window.startRestoredExam?.();
  }
})();
