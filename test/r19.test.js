// 19: 주간 퀘스트(키·보상)·오늘의 퀘스트 추가 · 받은 시각 · 아직 못 깬 주간 퀘스트는 거절
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTS, QUEST_BY_ID, questKey, questsOf } from '../server/game.js';
import { startServer } from './helpers.js';

test('주간 퀘스트: 주마다 다른 키, 오늘의 퀘스트보다 큰 보상, 오늘의 퀘스트 9개', () => {
  assert.equal(questKey(QUEST_BY_ID.weekly_days5, '2026-11-25', '2026-11-23'), 'weekly_days5:W2026-11-23');
  assert.equal(questKey(QUEST_BY_ID.daily_test, '2026-11-25', '2026-11-23'), 'daily_test:2026-11-25');
  const daily = QUESTS.filter(q => q.group === 'daily'), weekly = QUESTS.filter(q => q.group === 'weekly');
  assert.ok(daily.length >= 8, '오늘의 퀘스트가 5개 이상 늘어남');
  assert.ok(weekly.length >= 5);
  assert.ok(Math.min(...weekly.map(q => q.xp)) > Math.max(...daily.map(q => q.xp)), '주간 보상이 더 큼');
  const at = '2026-11-24T01:00:00.000Z';
  const qs = questsOf({ weekDays: 5 }, ['weekly_days5:W2026-11-23'], '2026-11-25', '2026-11-23', { 'weekly_days5:W2026-11-23': at });
  const w = qs.find(q => q.id === 'weekly_days5');
  assert.equal(w.status, 'claimed'); assert.equal(w.claimedAt, at);
  assert.equal(questsOf({ weekDays: 5 }, ['weekly_days5:W2026-11-16'], '2026-11-25', '2026-11-23').find(q => q.id === 'weekly_days5').status, 'ready', '지난주에 받은 건 이번 주에 다시');
});

let t;
before(async () => { t = await startServer(); });
after(() => t.stop());

test('API: 주간 퀘스트 진행도 · 조건 전 거절 · 받은 시각', async () => {
  const u = await t.makeUser('quester');
  const r = await t.call('GET', '/quests', undefined, u.token);
  const w = r.data.quests.find(q => q.id === 'weekly_correct300');
  assert.equal(w.group, 'weekly'); assert.deepEqual(w.progress, [0, 300]);
  assert.equal((await t.call('POST', '/quests/weekly_correct300/claim', {}, u.token)).status, 400);
  assert.equal((await t.call('POST', '/quests/guide_start/claim', {}, u.token)).status, 200);
  const g = (await t.call('GET', '/quests', undefined, u.token)).data.quests.find(q => q.id === 'guide_start');
  assert.equal(g.status, 'claimed'); assert.ok(g.claimedAt);
});
