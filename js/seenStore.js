/*
  SEEN STORE — remembers which questions each student has already been served
  ---------------------------------------------------------------------------
  Keyed per student (registration number) and per course, so a question served
  in a topic practice is not repeated in a full-course session either.
  Storage shape:  { [courseId]: { [questionKey]: lastServedTimestamp } }
*/

const KEY_PREFIX = 'lh_seen_v1_';

function storageKey(regNumber) {
  return KEY_PREFIX + String(regNumber || 'guest').toUpperCase();
}

function readAll(regNumber) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(regNumber)) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(regNumber, data) {
  try { localStorage.setItem(storageKey(regNumber), JSON.stringify(data)); }
  catch (error) { console.warn('Could not persist seen-question log', error); }
}

/** Set of question keys already served to this student for a course. */
export function getSeenKeys(regNumber, courseId) {
  const all = readAll(regNumber);
  return new Set(Object.keys(all[courseId] || {}));
}

/**
 * Mark questions as served. When `resetKeys` is provided (pool exhausted), the
 * marks for those keys are cleared first so the rotation starts a fresh cycle
 * without touching other topics' progress.
 */
export function markSeen(regNumber, courseId, keys, { resetKeys = null } = {}) {
  if (!courseId) return;
  const all = readAll(regNumber);
  const course = { ...(all[courseId] || {}) };
  if (resetKeys) for (const key of resetKeys) delete course[key];
  const now = Date.now();
  for (const key of keys) course[key] = now;
  all[courseId] = course;
  writeAll(regNumber, all);
}

/** Forget served questions for a course, or only for the given keys (e.g. one topic). */
export function clearSeen(regNumber, courseId, keys = null) {
  const all = readAll(regNumber);
  if (!all[courseId]) return;
  if (!keys) delete all[courseId];
  else {
    for (const key of keys) delete all[courseId][key];
    if (!Object.keys(all[courseId]).length) delete all[courseId];
  }
  writeAll(regNumber, all);
}
