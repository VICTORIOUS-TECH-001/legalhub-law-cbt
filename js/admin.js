import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { viewRenderers } from './nav.js';
import { firebaseAuth, signInWithEmailAndPassword, signOut } from './firebase.js';

const ADMIN_EMAIL = 'hillarymmaka@gmail.com';
let adminTab = 'courses';

window.unlockAdminPanel = function () {
  const passwordModal = document.getElementById('adminPasswordModal');
  const passwordInput = document.getElementById('adminPasswordInput');
  if (!passwordModal || !passwordInput) {
    alert('Admin access is unavailable because the password form could not be loaded.');
    return;
  }
  passwordInput.value = '';
  passwordModal.classList.add('active');
  passwordInput.focus();
};

window.cancelAdminUnlock = function () {
  document.getElementById('adminPasswordModal')?.classList.remove('active');
};

window.submitAdminUnlock = async function () {
  const password = document.getElementById('adminPasswordInput')?.value || '';
  if (!password) {
    alert('Enter your Firebase admin password.');
    return;
  }
  try {
    await signInWithEmailAndPassword(firebaseAuth, ADMIN_EMAIL, password);
    document.getElementById('adminPasswordModal')?.classList.remove('active');
    document.getElementById('adminPanel').classList.add('active');
    setAdminTab('courses');
  } catch (error) {
    alert('❌ Invalid admin email or password.');
  }
};
window.closeAdminPanel = async function () {
  document.getElementById('adminPanel').classList.remove('active');
  await signOut(firebaseAuth);
};

window.setAdminTab = setAdminTab;
async function setAdminTab(tab) {
  adminTab = tab;
  ['courses', 'students', 'questions'].forEach(t => {
    document.getElementById('adminTab-' + t).style.display = (t === tab) ? 'block' : 'none';
    document.getElementById('tabBtn-' + t).classList.toggle('active', t === tab);
  });
  if (tab === 'courses') await refreshAdminCoursesList();
  else if (tab === 'students') await refreshAdminStudentsList();
  else if (tab === 'questions') { await populateAdminCourseDropdown(); }
}

function showAdminStatus(msg, isError) {
  const el = document.getElementById('adminStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.background = isError ? '#e74c3c33' : '#2ecc7133';
  el.style.color = isError ? '#ffaaaa' : '#aaffaa';
  setTimeout(() => { el.textContent = ''; el.style.background = ''; }, 3000);
}

/* ================= COURSES ================= */
async function refreshAdminCoursesList() {
  const courses = await DB.getCourses();
  const container = document.getElementById('adminCoursesList');
  if (!courses.length) { container.innerHTML = '<p style="color:#aaa;">No courses yet. Add one above.</p>'; return; }
  const rows = await Promise.all(courses.map(async c => {
    const qCount = (await DB.getQuestions({ courseId: c.id })).length;
    const tCount = (await DB.getTopics(c.id)).length;
    return `<div class="admin-list-item">
      <strong>${escapeHtml(c.name)}</strong> <span style="opacity:0.7;">(${escapeHtml(c.code)})</span><br>
      <small>🏷️ ${tCount} topics • ❓ ${qCount} questions</small><br>
      <button class="admin-btn" style="padding:4px 12px; font-size:0.7rem; margin-top:5px; background:#075e54;" onclick="copyPublicCourseLink('${c.id}')">📱 Copy WhatsApp Course Link</button>
      <button class="admin-btn" style="padding:4px 12px; font-size:0.7rem; margin-top:5px;" onclick="adminManageTopics('${c.id}')">🏷️ Manage Topics</button>
      <button class="admin-btn" style="padding:4px 12px; font-size:0.7rem; margin-top:5px;" onclick="adminEditCourse('${c.id}')">✏️ Edit</button>
      <button class="admin-btn admin-btn-danger" style="padding:4px 12px; font-size:0.7rem;" onclick="adminDeleteCourse('${c.id}')">🗑️ Delete</button>
    </div>`;
  }));
  container.innerHTML = rows.join('');
}

window.adminSaveCourse = async function () {
  const name = document.getElementById('adminCourseName').value.trim();
  const code = document.getElementById('adminCourseCode').value.trim();
  if (!name) { showAdminStatus('❌ Course name required!', true); return; }
  if (state.editingCourseId) {
    await DB.updateCourse(state.editingCourseId, { name, code: code || name.toUpperCase().replace(/\s+/g, '').slice(0, 10) });
    showAdminStatus('✅ Course updated.');
    window.adminCancelCourseEdit();
  } else {
    await DB.addCourse({ name, code });
    showAdminStatus('✅ Course added! Add topics to it, then questions.');
    document.getElementById('adminCourseName').value = '';
    document.getElementById('adminCourseCode').value = '';
  }
  await refreshAdminCoursesList();
  await populateAdminCourseDropdown();
  viewRenderers.dashboard?.();
};

window.adminEditCourse = async function (id) {
  const courses = await DB.getCourses();
  const c = courses.find(x => x.id === id);
  if (!c) return;
  state.editingCourseId = id;
  document.getElementById('adminCourseName').value = c.name;
  document.getElementById('adminCourseCode').value = c.code;
  document.getElementById('adminCourseSaveBtn').innerText = '💾 UPDATE COURSE';
  document.getElementById('adminCourseCancelBtn').style.display = 'inline-block';
};
window.adminCancelCourseEdit = function () {
  state.editingCourseId = null;
  document.getElementById('adminCourseName').value = '';
  document.getElementById('adminCourseCode').value = '';
  document.getElementById('adminCourseSaveBtn').innerText = '➕ ADD COURSE';
  document.getElementById('adminCourseCancelBtn').style.display = 'none';
};

window.adminDeleteCourse = async function (id) {
  if (!confirm('⚠️ Delete this course? Its topics and questions will also be removed, and students unenrolled from it.')) return;
  await DB.deleteCourse(id);
  if (state.currentCourseId === id) state.currentCourseId = null;
  if (state.adminSelectedCourseId === id) closeAdminTopicsPanel();
  await refreshAdminCoursesList();
  await populateAdminCourseDropdown();
  viewRenderers.dashboard?.();
  showAdminStatus('🗑️ Course deleted.');
};

/* ================= TOPICS (nested under a course) ================= */
window.adminManageTopics = async function (courseId) {
  state.adminSelectedCourseId = courseId;
  const courses = await DB.getCourses();
  const course = courses.find(c => c.id === courseId);
  document.getElementById('adminTopicsCourseName').innerText = course ? course.name : '';
  document.getElementById('adminTopicsPanel').style.display = 'block';
  window.adminCancelTopicEdit();
  await refreshAdminTopicsList();
};
function closeAdminTopicsPanel() {
  state.adminSelectedCourseId = null;
  document.getElementById('adminTopicsPanel').style.display = 'none';
}
window.closeAdminTopicsPanel = closeAdminTopicsPanel;

async function refreshAdminTopicsList() {
  if (!state.adminSelectedCourseId) return;
  const topics = await DB.getTopics(state.adminSelectedCourseId);
  const container = document.getElementById('adminTopicsList');
  if (!topics.length) { container.innerHTML = '<p style="color:#aaa;">No topics yet. Add one above.</p>'; return; }
  const rows = await Promise.all(topics.map(async t => {
    const qCount = (await DB.getQuestions({ courseId: state.adminSelectedCourseId, topicId: t.id })).length;
    return `<div class="admin-list-item">
      <strong>${escapeHtml(t.name)}</strong><br>
      <small>❓ ${qCount} questions</small><br>
      <button class="admin-btn" style="padding:4px 12px; font-size:0.7rem; margin-top:5px;" onclick="adminEditTopic('${t.id}')">✏️ Edit</button>
      <button class="admin-btn admin-btn-danger" style="padding:4px 12px; font-size:0.7rem;" onclick="adminDeleteTopic('${t.id}')">🗑️ Delete</button>
    </div>`;
  }));
  container.innerHTML = rows.join('');
}

window.adminSaveTopic = async function () {
  const name = document.getElementById('adminTopicName').value.trim();
  if (!name) { showAdminStatus('❌ Topic name required!', true); return; }
  if (!state.adminSelectedCourseId) return;
  if (state.editingTopicId) {
    await DB.updateTopic(state.editingTopicId, { name });
    showAdminStatus('✅ Topic updated.');
    window.adminCancelTopicEdit();
  } else {
    await DB.addTopic({ courseId: state.adminSelectedCourseId, name });
    showAdminStatus('✅ Topic added! Add questions to it in the Questions tab.');
    document.getElementById('adminTopicName').value = '';
  }
  await refreshAdminTopicsList();
  await refreshAdminCoursesList();
};

window.adminEditTopic = async function (id) {
  const topics = await DB.getTopics(state.adminSelectedCourseId);
  const t = topics.find(x => x.id === id);
  if (!t) return;
  state.editingTopicId = id;
  document.getElementById('adminTopicName').value = t.name;
  document.getElementById('adminTopicSaveBtn').innerText = '💾 UPDATE TOPIC';
  document.getElementById('adminTopicCancelBtn').style.display = 'inline-block';
};
window.adminCancelTopicEdit = function () {
  state.editingTopicId = null;
  const nameInput = document.getElementById('adminTopicName');
  if (nameInput) nameInput.value = '';
  const saveBtn = document.getElementById('adminTopicSaveBtn');
  if (saveBtn) saveBtn.innerText = '➕ ADD TOPIC';
  const cancelBtn = document.getElementById('adminTopicCancelBtn');
  if (cancelBtn) cancelBtn.style.display = 'none';
};

window.adminDeleteTopic = async function (id) {
  if (!confirm('⚠️ Delete this topic? Its questions will also be removed.')) return;
  await DB.deleteTopic(id);
  await refreshAdminTopicsList();
  await refreshAdminCoursesList();
  showAdminStatus('🗑️ Topic deleted.');
};

/* ================= QUESTIONS (course -> topic scoped) ================= */
async function populateAdminCourseDropdown() {
  const sel = document.getElementById('adminQCourse');
  const courses = await DB.getCourses();
  const prev = sel.value;
  sel.innerHTML = courses.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`).join('');
  if (courses.some(c => c.id === prev)) sel.value = prev;
  await onAdminQCourseChange();
}
window.onAdminQCourseChange = onAdminQCourseChange;
async function onAdminQCourseChange() {
  const courseId = document.getElementById('adminQCourse').value;
  const topicSel = document.getElementById('adminQTopic');
  const topics = courseId ? await DB.getTopics(courseId) : [];
  topicSel.innerHTML = topics.length
    ? topics.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')
    : '<option value="">— add a topic first —</option>';
  await refreshAdminQuestionList();
}

async function refreshAdminQuestionList() {
  const courseId = document.getElementById('adminQCourse').value;
  const topicId = document.getElementById('adminQTopic').value;
  const container = document.getElementById('adminQuestionsList');
  if (!courseId || !topicId) { container.innerHTML = '<p style="color:#aaa;">Choose a course and topic to see its questions.</p>'; return; }
  const qs = await DB.getQuestions({ courseId, topicId });
  if (!qs.length) { container.innerHTML = '<p style="color:#aaa;">No questions for this topic yet. Add one above.</p>'; return; }
  container.innerHTML = qs.map(q => `
    <div class="admin-list-item">
      <strong>${escapeHtml(q.q.substring(0, 80))}${q.q.length > 80 ? '...' : ''}</strong><br>
      <small>✅ Ans: ${escapeHtml(q.answer)}</small><br>
      <button class="admin-btn" style="padding:4px 12px; font-size:0.7rem; margin-top:5px;" onclick="adminEditQuestion('${q.id}')">✏️ Edit</button>
      <button class="admin-btn admin-btn-danger" style="padding:4px 12px; font-size:0.7rem;" onclick="adminDeleteQuestion('${q.id}')">🗑️ Delete</button>
    </div>
  `).join('');
}
window.refreshAdminQuestionList = refreshAdminQuestionList;

function readQuestionForm() {
  const courseId = document.getElementById('adminQCourse').value;
  const topicId = document.getElementById('adminQTopic').value;
  const questionText = document.getElementById('adminQuestion').value.trim();
  const optA = document.getElementById('adminOptA').value.trim();
  const optB = document.getElementById('adminOptB').value.trim();
  const optC = document.getElementById('adminOptC').value.trim();
  const optD = document.getElementById('adminOptD').value.trim();
  const correctLetter = document.getElementById('adminCorrect').value;
  const explanation = document.getElementById('adminExplanation').value.trim();
  const opts = { A: optA || 'Option A', B: optB || 'Option B', C: optC || 'Option C', D: optD || 'Option D' };
  return { courseId, topicId, questionText, opts, correctLetter, explanation };
}

window.adminSaveQuestion = async function () {
  const { courseId, topicId, questionText, opts, correctLetter, explanation } = readQuestionForm();
  if (!courseId) { showAdminStatus('❌ Create a course first!', true); return; }
  if (!topicId) { showAdminStatus('❌ Create a topic first — questions must belong to a topic.', true); return; }
  if (!questionText) { showAdminStatus('❌ Question text required!', true); return; }

  const payload = { courseId, topicId, q: questionText, options: [opts.A, opts.B, opts.C, opts.D], answer: opts[correctLetter], explanation };

  if (state.editingQuestionId) {
    await DB.updateQuestion(state.editingQuestionId, payload);
    showAdminStatus('✅ Question updated.');
    window.adminCancelQuestionEdit();
  } else {
    await DB.addQuestion(payload);
    showAdminStatus('✅ Question added! All students on this topic see it.');
    clearQuestionForm();
  }
  await refreshAdminQuestionList();
  await refreshAdminCoursesList();
  viewRenderers.dashboard?.();
};

function clearQuestionForm() {
  ['adminQuestion', 'adminOptA', 'adminOptB', 'adminOptC', 'adminOptD', 'adminExplanation'].forEach(id => { document.getElementById(id).value = ''; });
}

window.adminEditQuestion = async function (id) {
  const courseId = document.getElementById('adminQCourse').value;
  const topicId = document.getElementById('adminQTopic').value;
  const qs = await DB.getQuestions({ courseId, topicId });
  const q = qs.find(x => x.id === id);
  if (!q) return;
  state.editingQuestionId = id;
  document.getElementById('adminQuestion').value = q.q;
  document.getElementById('adminOptA').value = q.options[0] || '';
  document.getElementById('adminOptB').value = q.options[1] || '';
  document.getElementById('adminOptC').value = q.options[2] || '';
  document.getElementById('adminOptD').value = q.options[3] || '';
  const letterIdx = q.options.findIndex(o => o === q.answer);
  document.getElementById('adminCorrect').value = ['A', 'B', 'C', 'D'][letterIdx] || 'A';
  document.getElementById('adminExplanation').value = q.explanation || '';
  document.getElementById('adminQuestionSaveBtn').innerText = '💾 UPDATE QUESTION';
  document.getElementById('adminQuestionCancelBtn').style.display = 'inline-block';
};
window.adminCancelQuestionEdit = function () {
  state.editingQuestionId = null;
  clearQuestionForm();
  document.getElementById('adminQuestionSaveBtn').innerText = '➕ ADD QUESTION';
  document.getElementById('adminQuestionCancelBtn').style.display = 'none';
};

window.adminDeleteQuestion = async function (id) {
  await DB.deleteQuestion(id);
  await refreshAdminQuestionList();
  await refreshAdminCoursesList();
  showAdminStatus('🗑️ Question deleted.');
};

window.adminResetToDefault = async function () {
  if (!confirm('⚠️ RESET ALL DATA (courses, topics, questions, students) to the default demo set? This cannot be undone.')) return;
  await DB.resetToDefaults();
  await refreshAdminCoursesList();
  await refreshAdminStudentsList();
  await populateAdminCourseDropdown();
  closeAdminTopicsPanel();
  viewRenderers.dashboard?.();
  showAdminStatus('🔄 Reset to default demo data.');
};

/* ================= STUDENTS ================= */
async function renderStudentCourseChecks() {
  const courses = await DB.getCourses();
  const container = document.getElementById('adminStudentCourseChecks');
  container.innerHTML = '<div style="font-size:0.8rem; opacity:0.8; margin-bottom:0.3rem;">Enroll in:</div>' + courses.map(c => `
    <label class="admin-checkbox-row"><input type="checkbox" value="${c.id}" class="student-course-check"> ${escapeHtml(c.name)} (${escapeHtml(c.code)})</label>
  `).join('');
}

async function refreshAdminStudentsList() {
  await renderStudentCourseChecks();
  const students = await DB.getStudents();
  const courses = await DB.getCourses();
  const container = document.getElementById('adminStudentsList');
  if (!students.length) { container.innerHTML = '<p style="color:#aaa;">No students yet.</p>'; return; }
  container.innerHTML = students.map(s => {
    const courseNames = (s.courseIds || []).map(id => courses.find(c => c.id === id)?.name).filter(Boolean).join(', ') || '—';
    return `<div class="admin-list-item">
      <strong>${escapeHtml(s.name)}</strong> <span style="opacity:0.7;">(${escapeHtml(s.regNumber)})</span><br>
      <small>📘 ${escapeHtml(courseNames)}</small><br>
      <button class="admin-btn admin-btn-danger" style="padding:4px 12px; font-size:0.7rem; margin-top:5px;" onclick="adminDeleteStudent('${s.regNumber}')">🗑️ Delete</button>
    </div>`;
  }).join('');
}

window.adminAddStudent = async function () {
  const reg = document.getElementById('adminStudentReg').value.trim().toUpperCase();
  const name = document.getElementById('adminStudentName').value.trim();
  if (!reg || !name) { showAdminStatus('❌ Registration number and name required!', true); return; }
  const checked = Array.from(document.querySelectorAll('.student-course-check:checked')).map(cb => cb.value);
  await DB.upsertStudent({ regNumber: reg, name, courseIds: checked });
  await refreshAdminStudentsList();
  showAdminStatus('✅ Student saved.');
  document.getElementById('adminStudentReg').value = '';
  document.getElementById('adminStudentName').value = '';
};

window.adminDeleteStudent = async function (regNumber) {
  await DB.deleteStudent(regNumber);
  await refreshAdminStudentsList();
  showAdminStatus('🗑️ Student deleted.');
};

window.adminBulkImportStudents = async function () {
  const raw = document.getElementById('adminBulkImport').value.trim();
  if (!raw) { showAdminStatus('❌ Paste at least one line first.', true); return; }
  const courses = await DB.getCourses();
  const records = [];
  let skipped = 0;
  raw.split('\n').forEach(line => {
    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) { skipped++; return; }
    const reg = parts[0].toUpperCase();
    const name = parts[1];
    const codes = (parts[2] || '').split('|').map(c => c.trim().toUpperCase()).filter(Boolean);
    const courseIds = courses.filter(c => codes.includes(c.code.toUpperCase())).map(c => c.id);
    records.push({ regNumber: reg, name, courseIds });
  });
  const { added, updated } = await DB.bulkImportStudents(records);
  await refreshAdminStudentsList();
  document.getElementById('adminBulkImport').value = '';
  showAdminStatus(`✅ Imported: ${added} added, ${updated} updated, ${skipped} skipped.`);
};
