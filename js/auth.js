import { DB } from './dataLayer.js';
import { state } from './state.js';
import { navigateTo } from './nav.js';
import { resetExamEnvironment } from './exam.js';

export async function restoreSession() {
  state.currentStudent = await DB.getCurrentStudent();
}

window.studentLogin = async function () {
  const input = document.getElementById('regNumberInput');
  const errorDiv = document.getElementById('loginError');
  const reg = (input.value || '').trim().toUpperCase();
  errorDiv.classList.remove('show');
  if (!reg) {
    errorDiv.textContent = '⚠️ Please enter your registration number.';
    errorDiv.classList.add('show');
    return;
  }
  const match = await DB.findStudentByReg(reg);
  if (!match) {
    errorDiv.textContent = '❌ Registration number not found. Please contact your administrator to be enrolled.';
    errorDiv.classList.add('show');
    return;
  }
  // Fetch name if it exists, then show the welcome screen (dashboard renders "Welcome, <name>")
  state.currentStudent = match;
  state.currentCourseId = null;
  await DB.setCurrentStudent(match);
  input.value = '';
  navigateTo('dashboard');
};

window.studentLogout = async function () {
  state.currentStudent = null;
  state.currentCourseId = null;
  await DB.setCurrentStudent(null);
  resetExamEnvironment();
  navigateTo('login');
};
