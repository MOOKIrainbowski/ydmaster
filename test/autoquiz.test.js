// 13: 표시({ } · [정답|오답]) 없는 본문으로도 핵심 표현 빈칸·어법 고르기가 만들어지는지(사용자 요청: "단어만 입력하면 모든 모드")
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuestions } from '../server/generators.js';

const sents = ['Every morning, Mina walks through a small park on her way to school.', 'She notices plastic cups near the benches.', 'She asks classmates to bring reusable bottles.', 'The park was cleaned by students who wanted to help.']
  .map((en, i) => ({ _id: 's' + i, en, ko: '해석' }));
const src = { sets: [{ set: 'x', setTitle: 't', sentences: sents }] };

test('표시 없는 본문: 핵심 표현 빈칸 자동', () => {
  const qs = buildQuestions('cloze_key', src, 10, {});
  assert.equal(qs.length, sents.length);
  for (const q of qs) { assert.ok(q.q.auto); assert.ok(q.key.answers.every(a => a.trim().length >= 3)); }
});

test('표시 없는 본문: 어법 고르기 자동(정답이 원문 단어, 오답은 다름)', () => {
  const qs = buildQuestions('choice', src, 10, {});
  assert.equal(qs.length, sents.length);
  for (const q of qs) {
    const seg = q.q.segments.filter(s => s.options);
    assert.ok(seg.length >= 1);
    seg.forEach((s, k) => { const right = s.options[q.key.answers[k]]; assert.ok(q.key.display.includes(right)); assert.notEqual(s.options[0], s.options[1]); });
  }
});

test('표시가 있으면 표시를 그대로 쓴다', () => {
  const qs = buildQuestions('choice', { sets: [{ set: 'x', setTitle: 't', sentences: [{ _id: 'a', en: 'She [is|are] kind.', ko: '' }] }] }, 5, {});
  assert.equal(qs[0].q.auto, undefined);
  assert.deepEqual([...qs[0].q.segments[1].options].sort(), ['are', 'is']);
});
