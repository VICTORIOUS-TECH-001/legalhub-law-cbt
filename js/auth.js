import { DB } from './dataLayer.js';
import { state } from './state.js';
import { navigateTo } from './nav.js';
import { resetExamEnvironment } from './exam.js';
import { Sound } from './sound.js';

export async function restoreSession() {
  state.currentStudent = await DB.getCurrentStudent();
}

window.studentLogin = async function () {
  const input = document.getElementById('regNumberInput');
  const errorDiv = document.getElementById('loginError');
  const reg = (input.value || '').trim().toUpperCase();
  errorDiv.classList.remove('show');
  if (!reg) {
    Sound.error();
    errorDiv.textContent = '⚠️ Enter your PLAYER ID to enter the arena.';
    errorDiv.classList.add('show');
    return;
  }
  const match = await DB.findStudentByReg(reg);
  if (!match) {
    Sound.error();
    errorDiv.textContent = '❌ PLAYER ID not found. Contact Command Center to be enlisted.';
    errorDiv.classList.add('show');
    return;
  }
  Sound.powerUp();
  state.currentStudent = match;
  state.currentCourseId = null;
  await DB.setCurrentStudent(match);
  input.value = '';
  navigateTo('dashboard');
  setTimeout(() => Sound.levelUp(), 400);
};

window.studentLogout = async function () {
  Sound.whoosh();
  state.currentStudent = null;
  state.currentCourseId = null;
  await DB.setCurrentStudent(null);
  resetExamEnvironment();
  navigateTo('login');
};
