/*
  QUESTION BANK — pure selection logic for practice & exam sessions
  -----------------------------------------------------------------
  Responsibilities (no DOM, no storage — easy to unit test):
    • dedupeQuestions()          drop duplicate imports (same stem + options)
    • drawQuestions()            pick N at random, preferring questions the
                                 student has not seen yet; when the pool is
                                 exhausted the cycle restarts automatically
    • shuffleOptionsKeepAnswer() reorder options while keeping the correct
                                 answer intact (answers are stored as text)
    • prepareForSession()        the presentation shape the exam engine uses

  Persistence of "seen" questions lives in seenStore.js.
*/

import { shuffleArray } from './utils.js';

export function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s.?!:;,]+$/g, '')
    .trim();
}

function hashString(input) {
  // Small, fast, deterministic (FNV-1a) — only used to key id-less questions.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** Stable identity for a question, even if it has no id (legacy/local rows). */
export function questionKey(question) {
  if (question?.id) return String(question.id);
  return 'h_' + hashString(contentSignature(question));
}

function contentSignature(question) {
  const stem = normalizeText(question?.q);
  const options = (question?.options || []).map(normalizeText).sort().join('|');
  return `${stem}::${options}`;
}

/** Remove duplicate questions (same stem and same option set), keeping the first. */
export function dedupeQuestions(questions) {
  const seen = new Set();
  const out = [];
  for (const question of questions || []) {
    if (!question || !question.q) continue;
    const signature = contentSignature(question);
    if (seen.has(signature)) continue;
    seen.add(signature);
    out.push(question);
  }
  return out;
}

/**
 * Resolve the stored answer to the exact option text.
 * Handles: exact text, letter ("B"), "B." / "B)" prefixes, and case/whitespace drift.
 */
export function resolveAnswer(question) {
  const options = question?.options || [];
  const raw = String(question?.answer ?? '').trim();
  if (!options.length) return raw;
  if (options.includes(raw)) return raw;

  const letterMatch = raw.match(/^([A-Da-d])(?:[.):\-]|$)/);
  if (letterMatch) {
    const idx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
    if (options[idx] != null) return options[idx];
  }

  const target = normalizeText(raw);
  const relaxed = options.find(option => normalizeText(option) === target);
  if (relaxed) return relaxed;

  const partial = options.find(option => {
    const normalized = normalizeText(option);
    return normalized && target && (normalized.includes(target) || target.includes(normalized));
  });
  return partial || raw;
}

/** Shuffle options randomly; the correct answer text is preserved (not its position). */
export function shuffleOptionsKeepAnswer(question, rng = Math.random) {
  const answer = resolveAnswer(question);
  const options = shuffleArray(question.options || [], rng);
  return { ...question, options, answer };
}

/**
 * Draw `count` questions at random from `pool`.
 *
 *  - Questions whose key is in `seenKeys` are avoided while unseen ones remain.
 *  - If unseen questions are insufficient, the remainder comes from seen ones and
 *    `cycled` is true — the caller should reset the seen marks for this pool.
 *  - `count` is clamped to the pool size; a non-positive count means "all".
 */
export function drawQuestions({ pool, count, seenKeys = new Set(), rng = Math.random }) {
  const unique = dedupeQuestions(pool);
  const total = unique.length;
  if (!total) return { questions: [], cycled: false, total: 0, unseenBefore: 0 };

  const wanted = Number.isFinite(count) && count > 0 ? Math.min(Math.floor(count), total) : total;
  const unseen = unique.filter(question => !seenKeys.has(questionKey(question)));
  const seen = unique.filter(question => seenKeys.has(questionKey(question)));

  const fromUnseen = shuffleArray(unseen, rng).slice(0, wanted);
  const shortfall = wanted - fromUnseen.length;
  const fromSeen = shortfall > 0 ? shuffleArray(seen, rng).slice(0, shortfall) : [];

  return {
    questions: shuffleArray([...fromUnseen, ...fromSeen], rng),
    cycled: shortfall > 0,
    total,
    unseenBefore: unseen.length
  };
}

/**
 * Convert raw DB rows into the shape the exam engine renders:
 * options shuffled (answer preserved), topic label attached, key retained so the
 * session can be persisted/restored and marked as seen.
 */
export function prepareForSession(questions, topicNameById = {}, rng = Math.random) {
  return questions.map(question => {
    const shuffled = shuffleOptionsKeepAnswer(question, rng);
    return {
      key: questionKey(question),
      q: question.q,
      options: shuffled.options,
      answer: shuffled.answer,
      explanation: question.explanation || '',
      topicId: question.topicId || null,
      topic: topicNameById[question.topicId] || 'General'
    };
  });
}
