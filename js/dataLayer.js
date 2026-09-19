/*
  DATA LAYER — local-first with optional Firestore sync
  -----------------------------------------------------
  Reads prefer the cloud when it has data, then fall back to the local seed
  so the arena never goes blank. Writes always hit localStorage and try cloud
  using the same document IDs so enrollment (c_law) stays consistent.
*/

import { uid, compactReg, regsMatch, normalizeReg } from './utils.js';
import { seedCourses, seedTopics, seedQuestions, seedStudents } from './seedData.js';
import {
  firestore, collection, deleteDoc, doc, getDocs, orderBy, query, setDoc
} from './firebase.js';

const KEYS = {
  courses: 'vt_courses_v4',
  topics: 'vt_topics_v4',
  questions: 'vt_questions_v4',
  students: 'vt_students_v4',
  historyPrefix: 'vt_history_v4_',
  currentStudent: 'vt_current_student_v4'
};

function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

function loadJSON(key, seedFn, { restoreIfTiny = 0 } = {}) {
  const raw = localStorage.getItem(key);
  const seed = () => {
    const data = seedFn();
    saveJSON(key, data);
    return data;
  };
  if (!raw) return seed();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seed();
    if (restoreIfTiny && parsed.length < restoreIfTiny) return seed();
    return parsed;
  } catch {
    return seed();
  }
}

function delay(val) { return Promise.resolve(val); }

function studentDocId(reg) {
  const compact = compactReg(reg);
  return compact || uid('stu');
}

function cloudOn() { return !!firestore; }

const cloudCache = Object.create(null);
function bustCloud(name) { delete cloudCache[name]; }

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label || 'timeout')), ms))
  ]);
}

async function cloudGet(name) {
  if (!cloudOn()) return null;
  if (cloudCache[name]) return cloudCache[name];
  try {
    const snapshot = await withTimeout(getDocs(collection(firestore, name)), 4000, `cloud ${name} timeout`);
    const rows = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    cloudCache[name] = rows;
    return rows;
  } catch (error) {
    console.warn(`Cloud read ${name} failed`, error);
    return null;
  }
}

async function cloudSet(name, id, data) {
  if (!cloudOn() || !id) return;
  bustCloud(name);
  try {
    const payload = { ...data };
    delete payload.id;
    await setDoc(doc(firestore, name, id), payload, { merge: true });
  } catch (error) {
    console.warn(`Cloud write ${name}/${id} failed`, error);
  }
}

async function cloudDelete(name, id) {
  if (!cloudOn() || !id) return;
  try { await deleteDoc(doc(firestore, name, id)); }
  catch (error) { console.warn(`Cloud delete ${name}/${id} failed`, error); }
}

class LocalStorageAdapter {
  async getCourses() { return delay(loadJSON(KEYS.courses, seedCourses)); }
  async addCourse({ name, code }) {
    const courses = loadJSON(KEYS.courses, seedCourses);
    const course = { id: uid('c'), name, code: code || name.toUpperCase().replace(/\s+/g, '').slice(0, 10) };
    courses.push(course);
    saveJSON(KEYS.courses, courses);
    return delay(course);
  }
  async updateCourse(id, patch) {
    const courses = loadJSON(KEYS.courses, seedCourses);
    const c = courses.find(x => x.id === id);
    if (c) Object.assign(c, patch);
    saveJSON(KEYS.courses, courses);
    return delay(c || null);
  }
  async deleteCourse(id) {
    saveJSON(KEYS.courses, loadJSON(KEYS.courses, seedCourses).filter(c => c.id !== id));
    saveJSON(KEYS.topics, loadJSON(KEYS.topics, seedTopics).filter(t => t.courseId !== id));
    saveJSON(KEYS.questions, loadJSON(KEYS.questions, seedQuestions).filter(q => q.courseId !== id));
    const students = loadJSON(KEYS.students, seedStudents, { restoreIfTiny: 10 });
    students.forEach(s => { s.courseIds = (s.courseIds || []).filter(cid => cid !== id); });
    saveJSON(KEYS.students, students);
    return delay(true);
  }

  async getTopics(courseId) {
    const topics = loadJSON(KEYS.topics, seedTopics);
    return delay(courseId ? topics.filter(t => t.courseId === courseId) : topics);
  }
  async addTopic({ courseId, name }) {
    const topics = loadJSON(KEYS.topics, seedTopics);
    const topic = { id: uid('t'), courseId, name };
    topics.push(topic);
    saveJSON(KEYS.topics, topics);
    return delay(topic);
  }
  async updateTopic(id, patch) {
    const topics = loadJSON(KEYS.topics, seedTopics);
    const t = topics.find(x => x.id === id);
    if (t) Object.assign(t, patch);
    saveJSON(KEYS.topics, topics);
    return delay(t || null);
  }
  async deleteTopic(id) {
    saveJSON(KEYS.topics, loadJSON(KEYS.topics, seedTopics).filter(t => t.id !== id));
    saveJSON(KEYS.questions, loadJSON(KEYS.questions, seedQuestions).filter(q => q.topicId !== id));
    return delay(true);
  }

  async getQuestions({ courseId, topicId } = {}) {
    let qs = loadJSON(KEYS.questions, seedQuestions);
    if (courseId) qs = qs.filter(q => q.courseId === courseId);
    if (topicId) qs = qs.filter(q => q.topicId === topicId);
    return delay(qs);
  }
  async addQuestion(question) {
    const questions = loadJSON(KEYS.questions, seedQuestions);
    const record = { id: uid('q'), explanation: '', ...question };
    questions.push(record);
    saveJSON(KEYS.questions, questions);
    return delay(record);
  }
  async updateQuestion(id, patch) {
    const questions = loadJSON(KEYS.questions, seedQuestions);
    const q = questions.find(x => x.id === id);
    if (q) Object.assign(q, patch);
    saveJSON(KEYS.questions, questions);
    return delay(q || null);
  }
  async deleteQuestion(id) {
    saveJSON(KEYS.questions, loadJSON(KEYS.questions, seedQuestions).filter(q => q.id !== id));
    return delay(true);
  }

  loadStudents() {
    const students = loadJSON(KEYS.students, seedStudents, { restoreIfTiny: 10 });
    if (!students.some(s => s?.regNumber && regsMatch(s.regNumber, 'DEMO/000001'))) {
      students.unshift({ regNumber: 'DEMO/000001', name: 'Arena Cadet', courseIds: ['c_law'] });
      saveJSON(KEYS.students, students);
    }
    return students;
  }
  async getStudents() {
    return delay(this.loadStudents());
  }
  async findStudentByReg(reg) {
    const students = this.loadStudents();
    return delay(students.find(s => s?.regNumber && regsMatch(s.regNumber, reg)) || null);
  }
  async upsertStudent(record) {
    const students = loadJSON(KEYS.students, seedStudents, { restoreIfTiny: 10 });
    const idx = students.findIndex(s => regsMatch(s.regNumber, record.regNumber));
    const saved = { ...record, regNumber: prettyOrKeep(record.regNumber) };
    if (idx >= 0) students[idx] = { ...students[idx], ...saved };
    else students.push(saved);
    saveJSON(KEYS.students, students);
    return delay(idx >= 0 ? students[idx] : saved);
  }
  async deleteStudent(regNumber) {
    const students = loadJSON(KEYS.students, seedStudents, { restoreIfTiny: 10 })
      .filter(s => !regsMatch(s.regNumber, regNumber));
    saveJSON(KEYS.students, students);
    return delay(true);
  }
  async bulkImportStudents(records) {
    let students = loadJSON(KEYS.students, seedStudents, { restoreIfTiny: 10 });
    let added = 0, updated = 0;
    records.forEach(record => {
      const idx = students.findIndex(s => regsMatch(s.regNumber, record.regNumber));
      const saved = { ...record, regNumber: prettyOrKeep(record.regNumber) };
      if (idx >= 0) { students[idx] = { ...students[idx], ...saved }; updated++; }
      else { students.push(saved); added++; }
    });
    saveJSON(KEYS.students, students);
    return delay({ added, updated });
  }

  async getHistory(reg) {
    const keys = [KEYS.historyPrefix + normalizeReg(reg), KEYS.historyPrefix + compactReg(reg), KEYS.historyPrefix + reg];
    for (const key of keys) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (Array.isArray(parsed) && parsed.length) return delay(parsed);
      } catch { /* ignore */ }
    }
    try { return delay(JSON.parse(localStorage.getItem(KEYS.historyPrefix + reg) || '[]')); }
    catch { return delay([]); }
  }
  async addHistoryEntry(reg, entry) {
    const key = KEYS.historyPrefix + normalizeReg(reg);
    let history = [];
    try { history = JSON.parse(localStorage.getItem(key) || '[]'); } catch { history = []; }
    history.unshift(entry);
    if (history.length > 25) history.pop();
    saveJSON(key, history);
    return delay(entry);
  }
  async deleteHistoryEntry(reg, idx) {
    const key = KEYS.historyPrefix + normalizeReg(reg);
    let history = [];
    try { history = JSON.parse(localStorage.getItem(key) || '[]'); } catch { history = []; }
    if (idx >= 0 && idx < history.length) history.splice(idx, 1);
    saveJSON(key, history);
    return delay(true);
  }

  async getCurrentStudent() {
    try {
      const raw = sessionStorage.getItem(KEYS.currentStudent);
      return delay(raw ? JSON.parse(raw) : null);
    } catch { return delay(null); }
  }
  async setCurrentStudent(student) {
    if (student) sessionStorage.setItem(KEYS.currentStudent, JSON.stringify(student));
    else sessionStorage.removeItem(KEYS.currentStudent);
    return delay(student);
  }

  async resetToDefaults() {
    saveJSON(KEYS.courses, seedCourses());
    saveJSON(KEYS.topics, seedTopics());
    saveJSON(KEYS.questions, seedQuestions());
    saveJSON(KEYS.students, seedStudents());
    return delay(true);
  }
}

function prettyOrKeep(reg) {
  const compact = compactReg(reg);
  if (/^\d{4}\d{5,}$/.test(compact)) return compact.slice(0, 4) + '/' + compact.slice(4);
  return normalizeReg(reg);
}

class HybridAdapter extends LocalStorageAdapter {
  async getCourses() {
    const remote = await cloudGet('courses');
    if (remote?.length) {
      saveJSON(KEYS.courses, remote);
      return remote.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    }
    return super.getCourses();
  }
  async addCourse(payload) {
    const course = await super.addCourse(payload);
    await cloudSet('courses', course.id, { name: course.name, code: course.code });
    return course;
  }
  async updateCourse(id, patch) {
    const course = await super.updateCourse(id, patch);
    if (course) await cloudSet('courses', id, { name: course.name, code: course.code });
    return course;
  }
  async deleteCourse(id) {
    const topics = await super.getTopics(id);
    const questions = await super.getQuestions({ courseId: id });
    await super.deleteCourse(id);
    await Promise.all([
      ...topics.map(t => cloudDelete('topics', t.id)),
      ...questions.map(q => cloudDelete('questions', q.id)),
      cloudDelete('courses', id)
    ]);
    return true;
  }

  async getTopics(courseId) {
    const remote = await cloudGet('topics');
    if (remote?.length) {
      saveJSON(KEYS.topics, remote);
      return remote
        .filter(topic => !courseId || topic.courseId === courseId)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    }
    return super.getTopics(courseId);
  }
  async addTopic(payload) {
    const topic = await super.addTopic(payload);
    await cloudSet('topics', topic.id, { courseId: topic.courseId, name: topic.name });
    return topic;
  }
  async updateTopic(id, patch) {
    const topic = await super.updateTopic(id, patch);
    if (topic) await cloudSet('topics', id, { courseId: topic.courseId, name: topic.name });
    return topic;
  }
  async deleteTopic(id) {
    const questions = await super.getQuestions({ topicId: id });
    await super.deleteTopic(id);
    await Promise.all([
      ...questions.map(q => cloudDelete('questions', q.id)),
      cloudDelete('topics', id)
    ]);
    return true;
  }

  async getQuestions({ courseId, topicId } = {}) {
    const remote = await cloudGet('questions');
    if (remote?.length) {
      saveJSON(KEYS.questions, remote);
      return remote.filter(q => (!courseId || q.courseId === courseId) && (!topicId || q.topicId === topicId));
    }
    return super.getQuestions({ courseId, topicId });
  }
  async addQuestion(question) {
    const record = await super.addQuestion(question);
    await cloudSet('questions', record.id, {
      courseId: record.courseId,
      topicId: record.topicId,
      q: record.q,
      options: record.options,
      answer: record.answer,
      explanation: record.explanation || ''
    });
    return record;
  }
  async updateQuestion(id, patch) {
    const question = await super.updateQuestion(id, patch);
    if (question) {
      await cloudSet('questions', id, {
        courseId: question.courseId,
        topicId: question.topicId,
        q: question.q,
        options: question.options,
        answer: question.answer,
        explanation: question.explanation || ''
      });
    }
    return question;
  }
  async deleteQuestion(id) {
    await super.deleteQuestion(id);
    await cloudDelete('questions', id);
    return true;
  }

  async getStudents() {
    const local = await super.getStudents();
    const remote = await cloudGet('students');
    if (remote?.length) {
      const byKey = new Map();
      local.forEach(s => byKey.set(compactReg(s.regNumber), s));
      remote.forEach(s => {
        const key = compactReg(s.regNumber);
        if (key) byKey.set(key, { ...byKey.get(key), ...s });
      });
      const merged = [...byKey.values()];
      saveJSON(KEYS.students, merged);
      return merged;
    }
    return local;
  }
  async findStudentByReg(reg) {
    const local = await super.findStudentByReg(reg);
    if (local) return local;
    const remote = await cloudGet('students');
    if (!remote?.length) return null;
    const match = remote.find(s => s?.regNumber && regsMatch(s.regNumber, reg));
    if (match) await super.upsertStudent(match);
    return match || null;
  }
  async upsertStudent(record) {
    const saved = await super.upsertStudent(record);
    await cloudSet('students', studentDocId(saved.regNumber), {
      regNumber: saved.regNumber,
      name: saved.name,
      courseIds: saved.courseIds || []
    });
    return saved;
  }
  async deleteStudent(regNumber) {
    await super.deleteStudent(regNumber);
    await cloudDelete('students', studentDocId(regNumber));
    return true;
  }
  async bulkImportStudents(records) {
    const result = await super.bulkImportStudents(records);
    await Promise.all(records.map(record => cloudSet('students', studentDocId(record.regNumber), {
      regNumber: prettyOrKeep(record.regNumber),
      name: record.name,
      courseIds: record.courseIds || []
    })));
    return result;
  }

  async resetToDefaults() {
    ['courses', 'topics', 'questions', 'students'].forEach(bustCloud);
    await super.resetToDefaults();
    await this.syncLocalSeedToCloud();
    return true;
  }

  async syncLocalSeedToCloud() {
    if (!cloudOn()) return { ok: false, reason: 'offline' };
    try {
      const [courses, topics, questions, students] = await Promise.all([
        super.getCourses(), super.getTopics(), super.getQuestions(), super.getStudents()
      ]);
      await Promise.all([
        ...courses.map(c => cloudSet('courses', c.id, { name: c.name, code: c.code })),
        ...topics.map(t => cloudSet('topics', t.id, { courseId: t.courseId, name: t.name })),
        ...questions.map(q => cloudSet('questions', q.id, {
          courseId: q.courseId, topicId: q.topicId, q: q.q, options: q.options, answer: q.answer, explanation: q.explanation || ''
        })),
        ...students.map(s => cloudSet('students', studentDocId(s.regNumber), {
          regNumber: s.regNumber, name: s.name, courseIds: s.courseIds || []
        }))
      ]);
      return { ok: true, courses: courses.length, topics: topics.length, questions: questions.length, students: students.length };
    } catch (error) {
      console.warn('Cloud seed sync failed', error);
      return { ok: false, reason: error.message };
    }
  }

  async ensureCloudSeed() {
    if (!cloudOn()) return { ok: false, reason: 'offline' };
    try {
      const snapshot = await getDocs(query(collection(firestore, 'courses'), orderBy('name')));
      if (!snapshot.empty) return { ok: true, seeded: false };
    } catch {
      try {
        const rows = await cloudGet('courses');
        if (rows?.length) return { ok: true, seeded: false };
      } catch { /* continue to seed */ }
    }
    return this.syncLocalSeedToCloud();
  }
}

export const DB = new HybridAdapter();
