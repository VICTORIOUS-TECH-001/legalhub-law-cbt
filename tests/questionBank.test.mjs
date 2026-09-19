import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupeQuestions, drawQuestions, questionKey, resolveAnswer,
  shuffleOptionsKeepAnswer, prepareForSession
} from '../js/questionBank.js';

/** Deterministic PRNG (mulberry32) so shuffles are reproducible in tests. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePool(n, topicId = 't1') {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i + 1}`,
    courseId: 'c1',
    topicId,
    q: `Question ${i + 1}?`,
    options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
    answer: 'Gamma',
    explanation: ''
  }));
}

test('dedupeQuestions drops re-imported duplicates but keeps distinct questions', () => {
  const pool = [
    ...makePool(3),
    { id: 'dup', q: 'question 1 ?', options: ['Delta', 'Gamma', 'Beta', 'Alpha'], answer: 'Gamma' },
    { id: 'diff', q: 'Question 1?', options: ['One', 'Two', 'Three', 'Four'], answer: 'One' }
  ];
  const unique = dedupeQuestions(pool);
  assert.deepEqual(unique.map(q => q.id), ['q1', 'q2', 'q3', 'diff']);
});

test('questionKey falls back to a stable content hash when id is missing', () => {
  const a = { q: 'What is law?', options: ['A', 'B'], answer: 'A' };
  const b = { q: 'what is law? ', options: ['B', 'A'], answer: 'A' };
  assert.equal(questionKey(a), questionKey(b));
  assert.equal(questionKey({ id: 'x1', ...a }), 'x1');
});

test('resolveAnswer maps letters, prefixes and case drift to the option text', () => {
  const base = { options: ['Statutory law', 'The Constitution', 'Case law', 'Customary law'] };
  assert.equal(resolveAnswer({ ...base, answer: 'The Constitution' }), 'The Constitution');
  assert.equal(resolveAnswer({ ...base, answer: 'B' }), 'The Constitution');
  assert.equal(resolveAnswer({ ...base, answer: 'b)' }), 'The Constitution');
  assert.equal(resolveAnswer({ ...base, answer: 'the constitution.' }), 'The Constitution');
  assert.equal(resolveAnswer({ ...base, answer: 'Constitution' }), 'The Constitution');
});

test('shuffleOptionsKeepAnswer reorders options and preserves the correct answer', () => {
  const question = makePool(1)[0];
  const rng = seeded(42);
  let sawDifferentOrder = false;
  for (let i = 0; i < 25; i++) {
    const shuffled = shuffleOptionsKeepAnswer(question, rng);
    assert.equal(shuffled.answer, 'Gamma');
    assert.ok(shuffled.options.includes('Gamma'));
    assert.deepEqual([...shuffled.options].sort(), [...question.options].sort());
    if (shuffled.options.join() !== question.options.join()) sawDifferentOrder = true;
  }
  assert.ok(sawDifferentOrder, 'options should actually move around');
  assert.deepEqual(question.options, ['Alpha', 'Beta', 'Gamma', 'Delta'], 'input must not be mutated');
});

test('drawQuestions returns exactly N unique questions, never exceeding the pool', () => {
  const pool = makePool(12);
  const { questions, cycled, total } = drawQuestions({ pool, count: 5, rng: seeded(1) });
  assert.equal(questions.length, 5);
  assert.equal(new Set(questions.map(questionKey)).size, 5);
  assert.equal(cycled, false);
  assert.equal(total, 12);

  const all = drawQuestions({ pool, count: 50, rng: seeded(2) });
  assert.equal(all.questions.length, 12);
  const everything = drawQuestions({ pool, count: 0, rng: seeded(3) });
  assert.equal(everything.questions.length, 12, 'non-positive count means "all"');
});

test('drawQuestions avoids seen questions until the pool is exhausted, then cycles', () => {
  const pool = makePool(10);
  const rng = seeded(7);
  const seen = new Set();

  const first = drawQuestions({ pool, count: 4, seenKeys: seen, rng });
  first.questions.forEach(q => seen.add(questionKey(q)));
  const second = drawQuestions({ pool, count: 4, seenKeys: seen, rng });
  second.questions.forEach(q => seen.add(questionKey(q)));

  const firstKeys = new Set(first.questions.map(questionKey));
  assert.ok(second.questions.every(q => !firstKeys.has(questionKey(q))), 'no repeats across sessions');
  assert.equal(second.cycled, false);

  // Only 2 unseen remain; asking for 4 must include both of them and flag a cycle.
  const third = drawQuestions({ pool, count: 4, seenKeys: seen, rng });
  assert.equal(third.questions.length, 4);
  assert.equal(third.cycled, true);
  assert.equal(third.unseenBefore, 2);
  const unseenKeys = pool.map(questionKey).filter(k => !seen.has(k));
  unseenKeys.forEach(k => assert.ok(third.questions.some(q => questionKey(q) === k), 'unseen questions are prioritised'));
});

test('drawQuestions is random across calls (not the same fixed slice)', () => {
  const pool = makePool(30);
  const a = drawQuestions({ pool, count: 5, rng: seeded(11) }).questions.map(q => q.id).join();
  const b = drawQuestions({ pool, count: 5, rng: seeded(99) }).questions.map(q => q.id).join();
  assert.notEqual(a, b);
});

test('prepareForSession attaches topic labels and keys while shuffling options', () => {
  const pool = makePool(2, 't_ethics');
  const prepared = prepareForSession(pool, { t_ethics: 'Ethics' }, seeded(5));
  assert.equal(prepared.length, 2);
  prepared.forEach((item, i) => {
    assert.equal(item.key, pool[i].id);
    assert.equal(item.topic, 'Ethics');
    assert.equal(item.answer, 'Gamma');
    assert.equal(item.options.length, 4);
  });
});
