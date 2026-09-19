import { DB } from './dataLayer.js';
import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { viewRenderers } from './nav.js';
import { firebaseAuth, signInWithEmailAndPassword, signOut } from './firebase.js';
import { Sound } from './sound.js';

const ADMIN_EMAIL = 'hillarymmaka@gmail.com';
let adminTab = 'courses';
let pendingImportQuestions = []; // holds parsed questions waiting for confirm

window.unlockAdminPanel = function () {
  Sound.click();
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
  Sound.tap();
  document.getElementById('adminPasswordModal')?.classList.remove('active');
};

window.submitAdminUnlock = async function () {
  const password = document.getElementById('adminPasswordInput')?.value || '';
  if (!password) {
    Sound.error();
    alert('Enter your Firebase admin password.');
    return;
  }
  try {
    await signInWithEmailAndPassword(firebaseAuth, ADMIN_EMAIL, password);
    Sound.powerUp();
    document.getElementById('adminPasswordModal')?.classList.remove('active');
    document.getElementById('adminPanel').classList.add('active');
    setAdminTab('courses');
  } catch (error) {
    Sound.error();
    alert('❌ Invalid admin email or password.');
  }
};
window.closeAdminPanel = async function () {
  Sound.whoosh();
  document.getElementById('adminPanel').classList.remove('active');
  await signOut(firebaseAuth);
};

window.setAdminTab = setAdminTab;
async function setAdminTab(tab) {
  Sound.tap();
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
  el.style.background = isError ? 'linear-gradient(135deg,#ff336633,#cc003333)' : 'linear-gradient(135deg,#00ff8833,#00cc6633)';
  el.style.color = isError ? '#ffaaaa' : '#aaffaa';
  el.style.border = `1px solid ${isError ? 'rgba(255,60,60,0.3)' : 'rgba(0,255,136,0.3)'}`;
  if (isError) Sound.error(); else Sound.coin();
  setTimeout(() => { el.textContent = ''; el.style.background = ''; el.style.border = ''; }, 4000);
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
  Sound.select();
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
  Sound.explosion();
  await DB.deleteCourse(id);
  if (state.currentCourseId === id) state.currentCourseId = null;
  if (state.adminSelectedCourseId === id) closeAdminTopicsPanel();
  await refreshAdminCoursesList();
  await populateAdminCourseDropdown();
  viewRenderers.dashboard?.();
  showAdminStatus('🗑️ Course deleted.');
};

/* ================= TOPICS ================= */
window.adminManageTopics = async function (courseId) {
  Sound.click();
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
  Sound.select();
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
  Sound.explosion();
  await DB.deleteTopic(id);
  await refreshAdminTopicsList();
  await refreshAdminCoursesList();
  showAdminStatus('🗑️ Topic deleted.');
};

/* ================= QUESTIONS ================= */
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
  if (!qs.length) { container.innerHTML = '<p style="color:#aaa;">No questions for this topic yet. Add one above or use bulk import.</p>'; return; }
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
  Sound.select();
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
  Sound.tap();
  await DB.deleteQuestion(id);
  await refreshAdminQuestionList();
  await refreshAdminCoursesList();
  showAdminStatus('🗑️ Question deleted.');
};

window.adminResetToDefault = async function () {
  if (!confirm('⚠️ RESET ALL DATA (courses, topics, questions, students) to the default demo set? This cannot be undone.')) return;
  Sound.explosion();
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
  Sound.tap();
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

/* ================= ADVANCED IMPORT: PDF / TXT ================= */

function parseQuestionsFromText(rawText) {
  const questions = [];
  const text = rawText.replace(/\r/g, '').trim();
  if (!text) return [];

  // Try JSON first
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json)) {
      json.forEach(item => {
        if (item.q && Array.isArray(item.options) && item.options.length >= 2 && item.answer) {
          const opts = item.options.slice(0, 4);
          while (opts.length < 4) opts.push(`Option ${String.fromCharCode(65 + opts.length)}`);
          questions.push({
            q: String(item.q).trim(),
            options: opts.map(o => String(o).trim()),
            answer: String(item.answer).trim(),
            explanation: String(item.explanation || '').trim()
          });
        }
      });
      if (questions.length) return questions;
    }
  } catch (_) {}

  // Split by separators: --- or blank line blocks that look like new question
  const blocks = text.split(/\n\s*---+\s*\n|\n\s*\n(?=\s*(?:Q\d*[:.]|^\d+[\).]|\bQuestion\b))/im).map(b => b.trim()).filter(Boolean);
  // If splitting didn't work well, also try splitting by "Q:" occurrences
  let rawBlocks = blocks.length > 1 ? blocks : text.split(/(?=\n\s*Q\s*[:.])/g).map(b => b.trim()).filter(Boolean);
  if (rawBlocks.length === 1) {
    // Fallback: split by numbered questions like "1." or "1)"
    const numbered = text.split(/\n(?=\s*\d+\s*[.)]\s*)/g).map(b => b.trim()).filter(Boolean);
    if (numbered.length > 1) rawBlocks = numbered;
  }

  for (const block of rawBlocks) {
    if (!block) continue;
    const parsed = parseSingleQuestionBlock(block);
    if (parsed) questions.push(parsed);
  }

  // If still nothing, try line-based parser for very loose format
  if (!questions.length) {
    const loose = parseLooseFormat(text);
    questions.push(...loose);
  }

  return questions;
}

function parseSingleQuestionBlock(block) {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  let qText = '';
  let optA = '', optB = '', optC = '', optD = '';
  let answerRaw = '';
  let explanation = '';

  for (let line of lines) {
    // Remove numbering prefix for question detection
    const qMatch = line.match(/^(?:Q\d*[:.]\s*|Question\s*\d*[:.]\s*|\d+\s*[.)]\s*)(.+)/i);
    if (qMatch && !qText) {
      qText = qMatch[1].trim();
      continue;
    }
    if (!qText && !/^[A-D][).:\-\s]/i.test(line) && !/^Answer/i.test(line) && !/^Explanation/i.test(line)) {
      // If no explicit Q prefix, first non-option line is question
      if (!optA && !optB && !optC && !optD && !answerRaw) {
        qText = line;
        continue;
      }
    }

    const optMatch = line.match(/^[A-D]\s*[).:\-]\s*(.+)/i);
    if (optMatch) {
      const letter = line[0].toUpperCase();
      const content = optMatch[1].trim();
      if (letter === 'A') optA = content;
      else if (letter === 'B') optB = content;
      else if (letter === 'C') optC = content;
      else if (letter === 'D') optD = content;
      continue;
    }
    // Also handle "A) option" without space issues
    const optMatch2 = line.match(/^(A|B|C|D)\)\s*(.+)/i);
    if (optMatch2) {
      const letter = optMatch2[1].toUpperCase();
      const content = optMatch2[2].trim();
      if (letter === 'A') optA = content;
      else if (letter === 'B') optB = content;
      else if (letter === 'C') optC = content;
      else if (letter === 'D') optD = content;
      continue;
    }

    const ansMatch = line.match(/^Answer\s*[:\-]\s*(.+)/i);
    if (ansMatch) {
      answerRaw = ansMatch[1].trim();
      continue;
    }
    const expMatch = line.match(/^Explanation\s*[:\-]\s*(.+)/i);
    if (expMatch) {
      explanation = expMatch[1].trim();
      continue;
    }
    // If line continues explanation
    if (explanation && !/^[A-D]\s*[).]/i.test(line) && !/^Answer/i.test(line)) {
      explanation += ' ' + line;
    }
  }

  // Fallback: if question still empty, use first line
  if (!qText && lines.length) qText = lines[0];

  if (!qText || !optA || !optB) return null;
  if (!optC) optC = 'Option C';
  if (!optD) optD = 'Option D';

  const options = [optA, optB, optC, optD];
  let answer = '';

  // Resolve answer
  const upperAns = answerRaw.toUpperCase().trim();
  if (['A', 'B', 'C', 'D'].includes(upperAns)) {
    answer = options[upperAns.charCodeAt(0) - 65];
  } else if (upperAns) {
    // Try to match answer text to option
    const found = options.find(o => o.toLowerCase() === upperAns.toLowerCase() || o.toLowerCase().includes(upperAns.toLowerCase()));
    if (found) answer = found;
    else {
      // If answerRaw is full text, use it directly
      answer = answerRaw;
    }
  } else {
    // Default to A if not specified
    answer = options[0];
  }

  if (!answer) answer = options[0];

  return {
    q: qText,
    options,
    answer,
    explanation: explanation.trim()
  };
}

function parseLooseFormat(text) {
  const questions = [];
  // Regex for loose but structured: Q, then A-D, then Answer
  const regex = /Q\s*[:.]\s*(.+?)\s*\n\s*A\s*[:.)]\s*(.+?)\s*\n\s*B\s*[:.)]\s*(.+?)\s*\n\s*C\s*[:.)]\s*(.+?)\s*\n\s*D\s*[:.)]\s*(.+?)\s*\n\s*Answer\s*[:\-]\s*([A-D]|.+?)(?:\n\s*Explanation\s*[:\-]\s*(.+?))?(?=\n\s*Q\s*[:.]|$)/gis;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const [, q, a, b, c, d, ansRaw, exp] = m;
    const options = [a.trim(), b.trim(), c.trim(), d.trim()];
    let answer = '';
    const upper = ansRaw.trim().toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(upper)) answer = options[upper.charCodeAt(0) - 65];
    else answer = ansRaw.trim();
    questions.push({ q: q.trim(), options, answer, explanation: (exp || '').trim() });
  }
  return questions;
}

function renderImportPreview() {
  const previewEl = document.getElementById('importPreview');
  const statsEl = document.getElementById('importStats');
  const areaEl = document.getElementById('importPreviewArea');
  if (!pendingImportQuestions.length) {
    areaEl.style.display = 'none';
    return;
  }
  areaEl.style.display = 'block';
  statsEl.innerHTML = `
    <span class="import-stat">✅ ${pendingImportQuestions.length} QUESTIONS</span>
    <span class="import-stat">📘 ${document.getElementById('adminQCourse')?.selectedOptions[0]?.text || 'Course'}</span>
    <span class="import-stat">🏷️ ${document.getElementById('adminQTopic')?.selectedOptions[0]?.text || 'Topic'}</span>
  `;
  const previewText = pendingImportQuestions.slice(0, 10).map((q, i) => {
    return `${i + 1}. ${q.q}\n   A: ${q.options[0]}\n   B: ${q.options[1]}\n   C: ${q.options[2]}\n   D: ${q.options[3]}\n   Answer: ${q.answer}${q.explanation ? `\n   Explanation: ${q.explanation.substring(0, 80)}` : ''}\n`;
  }).join('\n');
  const more = pendingImportQuestions.length > 10 ? `\n... and ${pendingImportQuestions.length - 10} more questions` : '';
  previewEl.textContent = previewText + more;
  Sound.levelUp();
}

async function extractTextFromPDF(file) {
  if (!window.pdfjsLib) throw new Error('PDF.js not loaded');
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str).join(' ');
    fullText += strings + '\n';
  }
  return fullText;
}

async function processImportText(rawText, fileName = '') {
  const parsed = parseQuestionsFromText(rawText);
  if (!parsed.length) {
    showAdminStatus(`❌ No valid questions detected in ${fileName || 'text'}. Check format guide.`, true);
    return;
  }
  pendingImportQuestions = parsed;
  renderImportPreview();
  showAdminStatus(`✅ Parsed ${parsed.length} questions from ${fileName || 'text'}. Review and confirm.`);
}

window.handleImportFile = async function (event) {
  const file = event.target.files[0];
  if (!file) return;
  await handleFileObject(file);
  // reset input so same file can be selected again
  event.target.value = '';
};

async function handleFileObject(file) {
  const courseId = document.getElementById('adminQCourse').value;
  const topicId = document.getElementById('adminQTopic').value;
  if (!courseId || !topicId) {
    showAdminStatus('❌ Select a course and topic first before importing!', true);
    Sound.error();
    return;
  }
  const ext = file.name.split('.').pop().toLowerCase();
  try {
    showAdminStatus(`⏳ Processing ${file.name}...`);
    let text = '';
    if (ext === 'pdf') {
      text = await extractTextFromPDF(file);
    } else if (ext === 'txt' || ext === 'json') {
      text = await file.text();
    } else {
      showAdminStatus('❌ Unsupported file type. Use PDF, TXT, or JSON.', true);
      return;
    }
    await processImportText(text, file.name);
  } catch (err) {
    console.error(err);
    showAdminStatus(`❌ Failed to read ${file.name}: ${err.message}`, true);
    Sound.error();
  }
}

window.handleImportDrop = async function (event) {
  event.preventDefault();
  const zone = document.getElementById('importZone');
  zone.classList.remove('dragover');
  const files = event.dataTransfer.files;
  if (!files.length) return;
  await handleFileObject(files[0]);
};

window.handleImportDragOver = function (event) {
  event.preventDefault();
  document.getElementById('importZone').classList.add('dragover');
};

window.handleImportDragLeave = function (event) {
  event.preventDefault();
  document.getElementById('importZone').classList.remove('dragover');
};

window.confirmImport = async function () {
  if (!pendingImportQuestions.length) {
    showAdminStatus('❌ No questions to import.', true);
    return;
  }
  const courseId = document.getElementById('adminQCourse').value;
  const topicId = document.getElementById('adminQTopic').value;
  if (!courseId || !topicId) {
    showAdminStatus('❌ Select course and topic first!', true);
    return;
  }
  Sound.powerUp();
  showAdminStatus(`⏳ Importing ${pendingImportQuestions.length} questions...`);
  let success = 0;
  let failed = 0;
  for (const q of pendingImportQuestions) {
    try {
      // Ensure answer is one of options; if not, try to map
      let answer = q.answer;
      if (!q.options.includes(answer)) {
        const upper = answer.toUpperCase();
        if (['A', 'B', 'C', 'D'].includes(upper)) {
          answer = q.options[upper.charCodeAt(0) - 65];
        } else {
          // fuzzy match
          const match = q.options.find(o => o.toLowerCase().includes(answer.toLowerCase()) || answer.toLowerCase().includes(o.toLowerCase()));
          if (match) answer = match;
          else answer = q.options[0];
        }
      }
      await DB.addQuestion({
        courseId,
        topicId,
        q: q.q,
        options: q.options,
        answer,
        explanation: q.explanation || ''
      });
      success++;
      if (success % 5 === 0) Sound.coin();
    } catch (e) {
      console.error('Failed to import', q, e);
      failed++;
    }
  }
  pendingImportQuestions = [];
  document.getElementById('importPreviewArea').style.display = 'none';
  await refreshAdminQuestionList();
  await refreshAdminCoursesList();
  viewRenderers.dashboard?.();
  showAdminStatus(`🎮 BOOM! Imported ${success} questions${failed ? `, ${failed} failed` : ''}. Ready to battle!`);
  Sound.levelUp();
  setTimeout(() => Sound.success(), 300);
};

window.cancelImport = function () {
  Sound.tap();
  pendingImportQuestions = [];
  document.getElementById('importPreviewArea').style.display = 'none';
  showAdminStatus('❌ Import cancelled.');
};

// Also allow pasting text directly via prompt
window.importFromPastedText = async function () {
  const text = prompt('Paste your questions text here (supports Q/A/B/C/D/Answer/Explanation format or JSON):');
  if (!text) return;
  await processImportText(text, 'pasted text');
};
