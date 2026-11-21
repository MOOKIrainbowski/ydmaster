// 16: 다른 사람 프로필 사진이 목록(친구·친구 요청·검색·관리자·세트 작성자)에 보이는지 — 사진 원본은 내려보내지 않음
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let t, pic, plain, boss;
before(async () => {
  t = await startServer();
  pic = await t.makeUser('pic', { avatarImage: PNG });
  plain = await t.makeUser('plainuser');
  boss = await t.makeUser('boss', { isAdmin: true });
});
after(() => t.stop());

const hasPic = u => typeof u?.avatarUrl === 'string' && u.avatarUrl.startsWith(`/api/users/${pic.id}/avatar`);
const noRaw = data => assert.ok(!JSON.stringify(data).includes('iVBORw0K'), '사진 원본이 응답에 섞이면 안 됨');

test('검색·친구 요청·친구 목록·관리자 목록·세트 작성자에 avatarUrl', async () => {
  const s = await t.call('GET', '/users/search?q=pic', undefined, plain.token);
  assert.ok(hasPic(s.data.find(u => u.username === 'pic'))); noRaw(s.data);

  assert.equal((await t.call('POST', '/friends/request', { toUserId: plain.id }, pic.token)).status, 201);
  const reqs = await t.call('GET', '/friends/requests', undefined, plain.token);
  assert.ok(hasPic(reqs.data[0].from)); noRaw(reqs.data);
  assert.equal((await t.call('PUT', `/friends/request/${reqs.data[0]._id}`, { action: 'accept' }, plain.token)).status, 200);

  const fr = await t.call('GET', '/friends', undefined, plain.token);
  assert.ok(hasPic(fr.data.find(u => u.username === 'pic'))); noRaw(fr.data);

  const adm = await t.call('GET', '/admin/users', undefined, boss.token);
  assert.equal(adm.status, 200);
  assert.ok(hasPic(adm.data.find(u => u.username === 'pic')));
  assert.equal(adm.data.find(u => u.username === 'plainuser').avatarUrl, '');
  assert.ok(adm.data.every(u => !('password' in u))); noRaw(adm.data);

  const set = await t.call('POST', '/sets', { title: '사진 세트', kind: 'vocab', visibility: 'public', items: [{ term: 'a', meaning: '가' }, { term: 'b', meaning: '나' }] }, pic.token);
  const list = await t.call('GET', '/sets?scope=public', undefined, plain.token);
  const mine = (list.data.items || []).find(x => x._id === set.data._id);
  assert.ok(hasPic(mine?.author)); noRaw(list.data);
});
