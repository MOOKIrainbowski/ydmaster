// 18: 탈퇴하면 퀘스트 보상 기록·알림까지 지워짐(개인정보처리방침 '탈퇴 시 바로 삭제'와 일치)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let t;
before(async () => { t = await startServer(); });
after(() => t.stop());

test('탈퇴: 알림·퀘스트 보상 기록 삭제', async () => {
  const a = await t.makeUser('leaver'), b = await t.makeUser('stayer');
  // 알림: b 가 a 에게 친구 요청 → a 에게 알림
  assert.equal((await t.call('POST', '/friends/request', { toUserId: a.id }, b.token)).status, 201);
  // 퀘스트 보상: 가이드 퀘스트는 보고만으로 받을 수 있음
  assert.equal((await t.call('POST', '/quests/guide_start/claim', {}, a.token)).status, 200);
  const N = t.mongoose.model('Notification'), Q = t.mongoose.model('QuestClaim');
  assert.ok(await N.countDocuments({ user: a.id }) > 0);
  assert.ok(await Q.countDocuments({ user: a.id }) > 0);
  assert.equal((await t.call('POST', '/auth/account/delete', { password: 'pass1234' }, a.token)).status, 200);
  assert.equal(await N.countDocuments({ user: a.id }), 0);
  assert.equal(await Q.countDocuments({ user: a.id }), 0);
});
