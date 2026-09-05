/*
  DATA LAYER — abstracted persistence
  ------------------------------------
  Every method returns a Promise so the UI can use the same interface for
  local student/history data and Firestore-backed course content.

  Data model:
    Course  { id, name, code }
    Topic   { id, courseId, name }
    Question{ id, courseId, topicId, q, options[4], answer, explanation }
    Student { regNumber, name, courseIds[] }
    HistoryEntry (per student, per attempt) { id, date, courseId, courseName,
                    topicId|null, topicName|null, rawScore, total,
                    scorePercent, scoreDisplay, details[] }
*/

import { uid } from './utils.js';
import { seedCourses, seedTopics, seedQuestions, seedStudents } from './seedData.js';
import {
  firestore, addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, setDoc, where
} from './firebase.js';

const KEYS = {
  courses: 'vt_courses_v4',
  topics: 'vt_topics_v4',
  questions: 'vt_questions_v4',
  students: 'vt_students_v4',
  historyPrefix: 'vt_history_v4_',
  currentStudent: 'vt_current_student_v4'
};

function loadJSON(key, seedFn) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    const seed = seedFn();
    localStorage.setItem(key, JSON.stringify(seed));
    return seed;
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : seedFn();
  } catch (e) {
    const seed = seedFn();
    localStorage.setItem(key, JSON.stringify(seed));
    return seed;
  }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function delay(val) { return Promise.resolve(val); } // stand-in for network latency

class LocalStorageAdapter {
  // ---------- Courses ----------
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
    // cascade: remove topics + questions under this course, unenroll students
    let courses = loadJSON(KEYS.courses, seedCourses).filter(c => c.id !== id);
    saveJSON(KEYS.courses, courses);
    let topics = loadJSON(KEYS.topics, seedTopics).filter(t => t.courseId !== id);
    saveJSON(KEYS.topics, topics);
    let questions = loadJSON(KEYS.questions, seedQuestions).filter(q => q.courseId !== id);
    saveJSON(KEYS.questions, questions);
    let students = loadJSON(KEYS.students, seedStudents);
    students.forEach(s => { s.courseIds = (s.courseIds || []).filter(cid => cid !== id); });
    saveJSON(KEYS.students, students);
    return delay(true);
  }

  // ---------- Topics ----------
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
    let topics = loadJSON(KEYS.topics, seedTopics).filter(t => t.id !== id);
    saveJSON(KEYS.topics, topics);
    let questions = loadJSON(KEYS.questions, seedQuestions).filter(q => q.topicId !== id);
    saveJSON(KEYS.questions, questions);
    return delay(true);
  }

  // ---------- Questions (always scoped to a topic) ----------
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
    const questions = loadJSON(KEYS.questions, seedQuestions).filter(q => q.id !== id);
    saveJSON(KEYS.questions, questions);
    return delay(true);
  }

  // ---------- Students ----------
  async getStudents() { return delay(loadJSON(KEYS.students, seedStudents)); }
  async findStudentByReg(reg) {
    const students = loadJSON(KEYS.students, seedStudents);
    const norm = (reg || '').trim().toUpperCase();
    return delay(students.find(s => s.regNumber.trim().toUpperCase() === norm) || null);
  }
  async upsertStudent(record) {
    const students = loadJSON(KEYS.students, seedStudents);
    const idx = students.findIndex(s => s.regNumber.toUpperCase() === record.regNumber.toUpperCase());
    if (idx >= 0) students[idx] = record; else students.push(record);
    saveJSON(KEYS.students, students);
    return delay(record);
  }
  async deleteStudent(regNumber) {
    const students = loadJSON(KEYS.students, seedStudents).filter(s => s.regNumber !== regNumber);
    saveJSON(KEYS.students, students);
    return delay(true);
  }
  async bulkImportStudents(records) {
    let students = loadJSON(KEYS.students, seedStudents);
    let added = 0, updated = 0;
    records.forEach(record => {
      const idx = students.findIndex(s => s.regNumber.toUpperCase() === record.regNumber.toUpperCase());
      if (idx >= 0) { students[idx] = record; updated++; } else { students.push(record); added++; }
    });
    saveJSON(KEYS.students, students);
    return delay({ added, updated });
  }

  // ---------- History ----------
  async getHistory(reg) {
    try { return delay(JSON.parse(localStorage.getItem(KEYS.historyPrefix + reg) || '[]')); }
    catch (e) { return delay([]); }
  }
  async addHistoryEntry(reg, entry) {
    let history = JSON.parse(localStorage.getItem(KEYS.historyPrefix + reg) || '[]');
    history.unshift(entry);
    if (history.length > 25) history.pop();
    saveJSON(KEYS.historyPrefix + reg, history);
    return delay(entry);
  }
  async deleteHistoryEntry(reg, idx) {
    let history = JSON.parse(localStorage.getItem(KEYS.historyPrefix + reg) || '[]');
    if (idx >= 0 && idx < history.length) history.splice(idx, 1);
    saveJSON(KEYS.historyPrefix + reg, history);
    return delay(true);
  }

  // ---------- Session ----------
  async getCurrentStudent() {
    try {
      const raw = sessionStorage.getItem(KEYS.currentStudent);
      return delay(raw ? JSON.parse(raw) : null);
    } catch (e) { return delay(null); }
  }
  async setCurrentStudent(student) {
    if (student) sessionStorage.setItem(KEYS.currentStudent, JSON.stringify(student));
    else sessionStorage.removeItem(KEYS.currentStudent);
    return delay(student);
  }

  // ---------- Full reset ----------
  async resetToDefaults() {
    saveJSON(KEYS.courses, seedCourses());
    saveJSON(KEYS.topics, seedTopics());
    saveJSON(KEYS.questions, seedQuestions());
    saveJSON(KEYS.students, seedStudents());
    return delay(true);
  }
}

class FirebaseAdapter extends LocalStorageAdapter {
  async getCourses() {
    const snapshot = await getDocs(query(collection(firestore, 'courses'), orderBy('name')));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  }
  async addCourse({ name, code }) {
    const record = { name, code: code || name.toUpperCase().replace(/\s+/g, '').slice(0, 10) };
    const created = await addDoc(collection(firestore, 'courses'), record);
    return { id: created.id, ...record };
  }
  async updateCourse(id, patch) {
    await setDoc(doc(firestore, 'courses', id), patch, { merge: true });
    return { id, ...patch };
  }
  async deleteCourse(id) {
    const topics = await this.getTopics(id);
    const questions = await this.getQuestions({ courseId: id });
    await Promise.all([
      ...topics.map(topic => deleteDoc(doc(firestore, 'topics', topic.id))),
      ...questions.map(question => deleteDoc(doc(firestore, 'questions', question.id))),
      deleteDoc(doc(firestore, 'courses', id))
    ]);
    return true;
  }
  async getTopics(courseId) {
    const snapshot = await getDocs(collection(firestore, 'topics'));
    return snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(topic => !courseId || topic.courseId === courseId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  async addTopic({ courseId, name }) {
    const record = { courseId, name };
    const created = await addDoc(collection(firestore, 'topics'), record);
    return { id: created.id, ...record };
  }
  async updateTopic(id, patch) {
    await setDoc(doc(firestore, 'topics', id), patch, { merge: true });
    return { id, ...patch };
  }
  async deleteTopic(id) {
    const questions = await this.getQuestions({ topicId: id });
    await Promise.all([
      ...questions.map(question => deleteDoc(doc(firestore, 'questions', question.id))),
      deleteDoc(doc(firestore, 'topics', id))
    ]);
    return true;
  }
  async getQuestions({ courseId, topicId } = {}) {
    const snapshot = await getDocs(collection(firestore, 'questions'));
    return snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(question => (!courseId || question.courseId === courseId) && (!topicId || question.topicId === topicId));
  }
  async addQuestion(question) {
    const record = { explanation: '', ...question };
    const created = await addDoc(collection(firestore, 'questions'), record);
    return { id: created.id, ...record };
  }
  async updateQuestion(id, patch) {
    await setDoc(doc(firestore, 'questions', id), patch, { merge: true });
    return { id, ...patch };
  }
  async deleteQuestion(id) {
    await deleteDoc(doc(firestore, 'questions', id));
    return true;
  }
}

// Course, topic, and question content is stored in Firestore. Student accounts
// and attempt history intentionally remain local to preserve the existing flow.
export const DB = new FirebaseAdapter();
