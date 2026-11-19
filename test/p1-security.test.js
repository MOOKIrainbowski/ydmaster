// P1 보안 수정 회귀 테스트(계획서 P1, 이슈 색인의 P1 항목)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let t, alice, bob;
before(async () => {
  t = await startServer();
  alice = await t.makeUser('alice');
  bob = await t.makeUser('bob');
});
after(() => t.stop());

const q = [{ question: 'apple', answer: '사과' }, { question: 'pear', answer: '배' }];

test('ping', async () => {
  const r = await t.call('GET', '/ping');
  assert.equal(r.status, 200);
});

test('비공개 테스트는 작성자 외 조회 불가', async () => {
  const c = await t.call('POST', '/tests', { title: '비밀', questions: q, isPublic: false }, alice.token);
  assert.equal(c.status, 201);
  assert.equal((await t.call('GET', `/tests/${c.data._id}`, undefined, bob.token)).status, 404);
  assert.equal((await t.call('GET', `/tests/${c.data._id}`, undefined, alice.token)).status, 200);
  assert.equal((await t.call('GET', '/tests/not-an-id', undefined, alice.token)).status, 404);
});

test('테스트 수정은 허용 필드만 반영(작성자·playCount 위조 불가)', async () => {
  const c = await t.call('POST', '/tests', { title: 'A', questions: q }, alice.token);
  const u = await t.call('PUT', `/tests/${c.data._id}`, { title: 'B', author: bob.id, playCount: 999 }, alice.token);
  assert.equal(u.status, 200);
  assert.equal(u.data.title, 'B');
  assert.equal(String(u.data.author), alice.id);
  assert.equal(u.data.playCount, 0);
});

test('결과 신고값은 문항 수 범위로 제한', async () => {
  const c = await t.call('POST', '/tests', { title: 'C', questions: q }, alice.token);
  const r = await t.call('POST', '/results', { testId: c.data._id, answers: [], correctAnswers: 500, totalQuestions: 500 }, bob.token);
  assert.equal(r.status, 201);
  assert.equal(r.data.totalQuestions, 2);
  assert.equal(r.data.correctAnswers, 2);
});

test('검색어 정규식 주입이 오류를 내지 않음', async () => {
  const r = await t.call('GET', '/tests?search=' + encodeURIComponent('(a+)+$['), undefined, alice.token);
  assert.equal(r.status, 200);
  const u = await t.call('GET', '/users/search?q=' + encodeURIComponent('.*'), undefined, alice.token);
  assert.equal(u.status, 200);
  assert.equal(u.data.length, 0);
});

test('전화번호 신규 가입 차단, 코드 노출 없음', async () => {
  const r = await t.call('POST', '/auth/register', { username: 'phoneguy', phone: '010-1234-5678', password: 'abcd1234', agreedToTerms: true });
  assert.equal(r.status, 400);
  assert.equal(r.data.devCode, undefined);
});

test('배너 그라데이션은 형식 검증', async () => {
  const bad = await t.call('PUT', '/auth/profile', { bannerGradient: 'red;" onmouseover="alert(1)' }, alice.token);
  assert.equal(bad.status, 400);
  const ok = await t.call('PUT', '/auth/profile', { bannerGradient: 'linear-gradient(135deg,#6c63ff,#ff6584)' }, alice.token);
  assert.equal(ok.status, 200);
});

test('닉네임 수정도 가입 규칙 적용', async () => {
  const r = await t.call('PUT', '/auth/profile', { username: 'a b/c' }, alice.token);
  assert.equal(r.status, 400);
});

test('존재하지 않는 사용자에게 친구 요청 불가', async () => {
  const r = await t.call('POST', '/friends/request', { toUserId: '000000000000000000000000' }, alice.token);
  assert.equal(r.status, 404);
});

test('레이트리밋: 로그인 11회째 429', async () => {
  let last;
  for (let i = 0; i < 11; i++) last = await t.call('POST', '/auth/login', { email: 'nobody@test.dev', password: 'x' });
  assert.equal(last.status, 429);
});

test('알 수 없는 API 는 JSON 404', async () => {
  const r = await t.call('GET', '/nope');
  assert.equal(r.status, 404);
  assert.ok(r.data.message);
});
