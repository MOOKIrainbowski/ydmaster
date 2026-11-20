// 04 게임 규칙(순수 함수) golden 값 — 서버 집계식(learn.js /stats)과 같은 숫자여야 함
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xpOf, levelOf, xpForLevel, achievementsOf, ACHIEVEMENTS, questsOf, QUESTS, questKey, canClaim, QUEST_BY_ID } from '../server/game.js';

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
  assert.deepEqual(got.sort(), ['attempts10', 'first', 'learned30', 'level5', 'maker', 'maker1', 'perfect', 'streak3'].sort());
  assert.ok(a.every(x => !('test' in x)));
});

test('업적: 하·중·상 단계가 모두 있고 id 가 겹치지 않음', () => {
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, ACHIEVEMENTS.length);
  for (const t of [1, 2, 3]) assert.ok(ACHIEVEMENTS.filter(a => a.tier === t).length >= 8, '단계 ' + t);
  assert.ok(ACHIEVEMENTS.length >= 30);
});

test('퀘스트: 상태·매일 키·받기 판정', () => {
  const m = { sets: 1, attempts: 0, todayAttempts: 1, todayCorrect: 5, passageTests: 0, wrongReviews: 0, modesUsed: 1, publicSets: 0, friends: 0, hasAvatar: false };
  const day = '2026-11-20';
  const qs = questsOf(m, ['first_set'], day);
  const by = Object.fromEntries(qs.map(q => [q.id, q]));
  assert.equal(by.first_set.status, 'claimed');
  assert.equal(by.daily_test.status, 'ready');
  assert.deepEqual(by.daily_correct20.progress, [5, 20]);
  assert.equal(by.first_test.status, 'todo');
  assert.equal(by.first_cards.status, 'todo'); // 보고형은 받기 전까지 todo
  assert.equal(questKey(QUEST_BY_ID.daily_test, day), 'daily_test:2026-11-20');
  assert.equal(questKey(QUEST_BY_ID.first_set, day), 'first_set');
  assert.equal(canClaim(QUEST_BY_ID.first_test, m), false);
  assert.equal(canClaim(QUEST_BY_ID.guide_start, m), true);
  assert.ok(qs.every(q => !('check' in q) && !('goal' in q)));
  assert.equal(new Set(QUESTS.map(q => q.id)).size, QUESTS.length);
});
