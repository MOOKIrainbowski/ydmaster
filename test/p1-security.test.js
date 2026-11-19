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

test('ping', async () => {
  const r = await t.call('GET', '/ping');
  assert.equal(r.status, 200);
});

test('옛 클라이언트 채점 경로는 없어짐(점수 위조 차단, R5)', async () => {
  for (const [m, p] of [['POST', '/results'], ['GET', '/tests'], ['POST', '/generate-options'], ['POST', '/wrongnote']])
    assert.equal((await t.call(m, p, m === 'GET' ? undefined : {}, alice.token)).status, 404, p);
});

test('검색어 정규식 주입이 오류를 내지 않음', async () => {
  const r = await t.call('GET', '/sets?scope=explore&q=' + encodeURIComponent('(a+)+$['), undefined, alice.token);
  assert.equal(r.status, 200);
  const u = await t.call('GET', '/users/search?q=' + encodeURIComponent('.*'), undefined, alice.token);
  assert.equal(u.status, 200);
  assert.equal(u.data.length, 0);
});

test('관리자도 자기 자신은 삭제 불가', async () => {
  await t.mongoose.model('User').updateOne({ _id: alice.id }, { isAdmin: true });
  const r = await t.call('DELETE', '/admin/users/' + alice.id, undefined, alice.token);
  assert.equal(r.status, 400);
});

test('탈퇴 시 즐겨찾기 카운트 복구', async () => {
  const carl = await t.makeUser('carl');
  const set = (await t.call('POST', '/sets', { title: 'S', kind: 'vocab', visibility: 'public', items: [{ term: 'a', meaning: '가' }] }, alice.token)).data;
  await t.call('POST', '/sets/' + set._id + '/favorite', {}, carl.token);
  const del = await t.call('POST', '/auth/account/delete', { password: 'pass1234' }, carl.token);
  assert.equal(del.status, 200);
  assert.equal((await t.call('GET', '/sets/' + set._id, undefined, alice.token)).data.favoriteCount, 0);
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

test('배포 버전 조회(DB 불필요, 캐시 금지)', async () => {
  process.env.APP_VERSION = 'v-test-1';
  const r = await t.call('GET', '/version');
  assert.equal(r.status, 200);
  assert.equal(r.data.version, 'v-test-1');
  delete process.env.APP_VERSION;
});

test('비밀번호 찾기: 없는 계정도 같은 응답(가입 여부 비노출), 재설정은 실패', async () => {
  const r = await t.call('POST', '/auth/forgot-password', { email: 'ghost-nobody@test.dev' });
  assert.equal(r.status, 200);
  assert.ok(r.data.token && r.data.token.length >= 32);
  const reset = await t.call('POST', '/auth/reset-password', { token: r.data.token, code: '123456', newPassword: 'abcd1234' });
  assert.equal(reset.status, 400);
});

test('옛 네이버 연결로 loginType 이 바뀐 비밀번호 계정도 비밀번호 변경 가능', async () => {
  const dan = await t.makeUser('dan');
  await t.mongoose.model('User').updateOne({ _id: dan.id }, { loginType: 'naver', naverId: 'n-123' });
  const r = await t.call('PUT', '/auth/profile', { currentPassword: 'pass1234', newPassword: 'newpass123' }, dan.token);
  assert.equal(r.status, 200);
  await t.mongoose.model('Rate').deleteMany({});
  const login = await t.call('POST', '/auth/login', { email: dan.email, password: 'newpass123' });
  assert.equal(login.status, 200);
});

test('/auth/me 는 이미지 원본 없이 URL·비밀번호 유무만', async () => {
  const png = 'data:image/png;base64,' + Buffer.from('img').toString('base64');
  await t.call('PUT', '/auth/profile', { avatarImage: png }, bob.token);
  const me = await t.call('GET', '/auth/me', undefined, bob.token);
  assert.equal(me.data.user.avatarImage, undefined);
  assert.match(me.data.user.avatarUrl, /\/avatar\?v=/);
  assert.equal(me.data.user.hasPassword, true);
});

test('전화번호 계정 로그인(기존 회원)', async () => {
  await t.mongoose.model('Rate').deleteMany({}); // 앞 테스트가 쓴 로그인 횟수 제한 초기화
  const bcrypt = (await import('bcryptjs')).default;
  await t.mongoose.model('User').create({ username: 'phoneuser', email: 'phone_01055556666@ydmaster.local', phone: '01055556666', password: await bcrypt.hash('pass1234', 4), isVerified: true });
  const r = await t.call('POST', '/auth/login', { email: '010-5555-6666', password: 'pass1234' });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.username, 'phoneuser');
});
