// 04 게임 규칙(순수 함수) golden 값 — 서버 집계식(learn.js /stats)과 같은 숫자여야 함
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xpOf, levelOf, xpForLevel, achievementsOf } from '../server/game.js';

test('경험치: 맞힘×10 + 완주 20 + 5문항 이상 만점 50', () => {
  assert.equal(xpOf({ correctAnswers: 3, totalQuestions: 10 }), 50);
  assert.equal(xpOf({ correctAnswers: 10, totalQuestions: 10 }), 170);
  assert.equal(xpOf({ correctAnswers: 4, totalQuestions: 4 }), 60); // 5문항 미만 만점은 보너스 없음
  assert.equal(xpOf({ correct: 0, total: 0 }), 20);
});

test('레벨 경계: 0·99 → 1, 100 → 2, 300 → 3, 1000 → 5', () => {
  assert.deepEqual([0, 99, 100, 299, 300, 599, 600, 999, 1000].map(x => levelOf(x).level), [1, 1, 2, 2, 3, 3, 4, 4, 5]);
  for (let n = 1; n < 60; n++) {
    assert.equal(levelOf(xpForLevel(n)).level, n);
    assert.equal(levelOf(xpForLevel(n + 1) - 1).level, n);
  }
  const l = levelOf(150);
  assert.equal(l.into, 50); assert.equal(l.need, 200); assert.equal(l.title, '새싹');
});

test('업적 판정', () => {
  const a = achievementsOf({ attempts: 10, perfects: 1, streakDays: 3, learned: 99, sets: 3, xp: 1000 });
  const got = a.filter(x => x.got).map(x => x.id);
  assert.deepEqual(got.sort(), ['attempts10', 'first', 'level5', 'maker', 'perfect', 'streak3'].sort());
  assert.ok(a.every(x => !('test' in x)));
});
