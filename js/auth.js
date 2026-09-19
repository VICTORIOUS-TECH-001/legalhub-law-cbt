import { DB } from './dataLayer.js';
import { state } from './state.js';
import { navigateTo } from './nav.js';
import { resetExamEnvironment } from './exam.js';
import { Sound } from './sound.js';
import { compactReg, prettyReg, toast } from './utils.js';
import { recordLogin } from './progress.js';

const LOGIN_LABEL = 'Continue';

export async function restoreSession() {
  try {
    state.currentStudent = await DB.getCurrentStudent();
  } catch (error) {
    console.warn('Session restore failed', error);
    state.currentStudent = null;
  }
}

function setLoginBusy(busy) {
  const btn = document.getElementById('loginSubmitBtn');
  const input = document.getElementById('regNumberInput');
  if (btn) {
    btn.disabled = busy;
    btn.textContent = busy ? 'Checking…' : LOGIN_LABEL;
  }
  if (input) input.disabled = busy;
}

function showLoginError(msg) {
  const errorDiv = document.getElementById('loginError');
  if (!errorDiv) return;
  errorDiv.textContent = msg;
  errorDiv.classList.add('show');
}

function hideLoginError() {
  document.getElementById('loginError')?.classList.remove('show');
}

window.studentLogin = async function () {
  const input = document.getElementById('regNumberInput');
  const raw = (input?.value || '').trim();
  hideLoginError();
  if (!raw) {
    Sound.error();
    showLoginError('Enter your registration number to continue.');
    input?.focus();
    return;
  }
  setLoginBusy(true);
  try {
    const match = await DB.findStudentByReg(raw) || await DB.findStudentByReg(prettyReg(raw)) || await DB.findStudentByReg(compactReg(raw));
    if (!match) {
      Sound.error();
      showLoginError('That registration number is not on the class list. Check the format (e.g. 2025/298761) or contact your class rep.');
      return;
    }
    Sound.powerUp();
    state.currentStudent = match;
    state.currentCourseId = null;
    await DB.setCurrentStudent(match);
    recordLogin(match.regNumber);
    if (input) input.value = '';
    toast(`Welcome back, ${match.name.split(' ')[0]}.`, 'success');
    navigateTo('dashboard');
  } catch (error) {
    console.error(error);
    Sound.error();
    showLoginError('We could not reach the student register. Please try again in a moment.');
  } finally {
    setLoginBusy(false);
  }
};

window.studentLogout = async function () {
  Sound.whoosh();
  state.currentStudent = null;
  state.currentCourseId = null;
  await DB.setCurrentStudent(null);
  resetExamEnvironment();
  toast('You have been signed out.', 'info');
  navigateTo('login');
};

window.formatRegInput = function (el) {
  if (!el) return;
  const start = el.selectionStart;
  const before = el.value;
  let value = before.toUpperCase().replace(/[^A-Z0-9/\-]/g, '');
  const compact = compactReg(value);
  if (/^\d{5,}$/.test(compact) && !value.includes('/')) {
    value = compact.slice(0, 4) + (compact.length > 4 ? '/' + compact.slice(4, 12) : '');
  }
  el.value = value;
  if (document.activeElement === el && typeof start === 'number') {
    const delta = el.value.length - before.length;
    el.setSelectionRange(Math.max(0, start + delta), Math.max(0, start + delta));
  }
};
