// P2 API 흐름: 세트 CRUD·권한 → 세션 생성 → 서버 채점·멱등 → 종료 → 결과·오답·랭킹·레거시 변환
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let t, a, b;
before(async () => {
  t = await startServer();
  a = await t.makeUser('amy');
  b = await t.makeUser('ben');
});
after(() => t.stop());

const vocabSet = (visibility = 'public') => ({
  title: '고1 단어 1과', kind: 'vocab', visibility, tags: ['고1'],
  items: Array.from({ length: 6 }, (_, i) => ({ term: `word${i}`, meaning: `뜻${i}` })),
});
const passageSet = {
  title: '1과 본문', kind: 'passage', visibility: 'private',
  passage: { source: '고1 1과', sentences: [
    { en: 'Many teens {give up} their dreams.', ko: '많은 십대가 꿈을 포기한다.' },
    { en: 'They [are|is] afraid of failing.', ko: '그들은 실패를 두려워한다.' },
    { en: 'But failure is part of {learning}.', ko: '실패는 배움의 일부다.' },
  ] },
};

test('세트 생성·검증·권한', async () => {
  const bad = await t.call('POST', '/sets', { title: '', kind: 'vocab', items: [] }, a.token);
  assert.equal(bad.status, 400);
  const pub = await t.call('POST', '/sets', vocabSet(), a.token);
  assert.equal(pub.status, 201);
  assert.equal(pub.data.count, 6);
  const priv = await t.call('POST', '/sets', passageSet, a.token);
  assert.equal((await t.call('GET', `/sets/${priv.data._id}`, undefined, b.token)).status, 404);
  const ex = await t.call('GET', '/sets?scope=explore', undefined, b.token);
  assert.deepEqual(ex.data.items.map(x => x.title), ['고1 단어 1과']);
  assert.equal(ex.data.items[0].items, undefined); // 목록엔 내용 없음
  // 수정: 항목 _id 유지, kind 변경 불가, 남의 세트 수정 불가
  const items = pub.data.items.map(x => ({ ...x, meaning: x.meaning + '!' }));
  const up = await t.call('PUT', `/sets/${pub.data._id}`, { ...vocabSet(), kind: 'passage', items }, a.token);
  assert.equal(up.status, 200);
  assert.equal(up.data.kind, 'vocab');
  assert.equal(String(up.data.items[0]._id), String(pub.data.items[0]._id));
  assert.equal((await t.call('PUT', `/sets/${pub.data._id}`, vocabSet(), b.token)).status, 403);
});

test('즐겨찾기 멱등', async () => {
  const s = (await t.call('POST', '/sets', vocabSet(), a.token)).data;
  await t.call('POST', `/sets/${s._id}/favorite`, {}, b.token);
  const r2 = await t.call('POST', `/sets/${s._id}/favorite`, {}, b.token);
  assert.equal(r2.data.favoriteCount, 1);
  const d1 = await t.call('DELETE', `/sets/${s._id}/favorite`, undefined, b.token);
  const d2 = await t.call('DELETE', `/sets/${s._id}/favorite`, undefined, b.token);
  assert.equal(d1.data.favoriteCount, 0);
  assert.equal(d2.data.favoriteCount, 0);
});

test('세션: 서버 채점·중복 답 멱등·종료 멱등·결과·오답·랭킹', async () => {
  const s = (await t.call('POST', '/sets', vocabSet(), a.token)).data;
  const ses = await t.call('POST', '/sessions', { source: { type: 'sets', ids: [s._id] }, mode: 'write_meaning', count: 3 }, b.token);
  assert.equal(ses.status, 201);
  assert.equal(ses.data.total, 3);
  assert.equal(JSON.stringify(ses.data).includes('뜻'), false); // 정답(뜻) 미노출
  const q0 = ses.data.questions[0];
  const meaning = s.items.find(x => x.term === q0.prompt.text).meaning;
  const r1 = await t.call('POST', `/sessions/${ses.data._id}/answers`, { i: 0, response: meaning }, b.token);
  assert.equal(r1.data.correct, true);
  const dup = await t.call('POST', `/sessions/${ses.data._id}/answers`, { i: 0, response: '틀린답' }, b.token);
  assert.equal(dup.data.correct, true);
  assert.equal(dup.data.duplicate, true);
  // 동시 제출: 같은 i 두 요청 → 하나만 저장
  await Promise.all([1, 2].map(() => t.call('POST', `/sessions/${ses.data._id}/answers`, { i: 1, response: '모름' }, b.token)));
  const fmt = await t.call('POST', `/sessions/${ses.data._id}/answers`, { i: 2, response: 5 }, b.token);
  assert.equal(fmt.status, 400);
  // 남의 세션 접근 불가
  assert.equal((await t.call('GET', `/sessions/${ses.data._id}`, undefined, a.token)).status, 404);

  const [f1, f2] = await Promise.all([1, 2].map(() => t.call('POST', `/sessions/${ses.data._id}/finish`, {}, b.token)));
  assert.equal(f1.data._id, f2.data._id);
  assert.equal(f1.data.correct, 1);
  assert.equal(f1.data.total, 3);
  assert.equal(f1.data.questions.length, 3);
  assert.equal((await t.call('POST', `/sessions/${ses.data._id}/answers`, { i: 2, response: 'x' }, b.token)).status, 409);

  const wrong = await t.call('GET', '/wrong', undefined, b.token);
  assert.equal(wrong.data.items.length, 1);
  const rank = await t.call('GET', '/ranking', undefined, b.token);
  assert.equal(rank.data.me.learned, 1);
  const stats = await t.call('GET', '/stats', undefined, b.token);
  assert.equal(stats.data.weekLearned, 1);
  assert.equal(stats.data.wrongCount, 1);
  assert.equal(stats.data.streakDays, 1);
  // 게임(04): 결과 경험치 = 맞힘 1×10 + 완주 20, /stats 집계가 game.js 규칙과 같음
  assert.equal(f1.data.xp, 30);
  assert.equal(stats.data.game.xp, 30);
  assert.equal(stats.data.game.level, 1);
  assert.equal(stats.data.game.achievements.find(x => x.id === 'first').got, true);
  assert.equal(stats.data.game.achievements.find(x => x.id === 'perfect').got, false);
  // 퀘스트(05): 조건 미충족은 거절, 충족하면 한 번만(동시 요청도 하나만), 보상은 경험치에 더해짐
  assert.equal((await t.call('POST', '/quests/first_set/claim', {}, b.token)).status, 400); // b 는 세트를 안 만듦
  const [c1, c2] = await Promise.all([1, 2].map(() => t.call('POST', '/quests/first_test/claim', {}, b.token)));
  assert.equal([c1.data.already, c2.data.already].filter(x => x === false).length, 1);
  assert.equal((await t.call('POST', '/quests/guide_start/claim', {}, b.token)).data.xp, 5);
  assert.equal((await t.call('POST', '/quests/guide_start/claim', {}, b.token)).data.already, true);
  assert.equal((await t.call('POST', '/quests/nope/claim', {}, b.token)).status, 404);
  const qs = await t.call('GET', '/quests', undefined, b.token);
  assert.equal(qs.data.quests.find(q => q.id === 'first_test').status, 'claimed');
  assert.equal((await t.call('GET', '/stats', undefined, b.token)).data.game.xp, 30 + 20 + 5);
  const prof = await t.call('GET', '/p/' + encodeURIComponent((await t.call('GET', '/auth/me', undefined, b.token)).data.user.username), undefined, a.token);
  assert.equal(prof.data.game.xp, 55);

  // 오답 복습 세션 → 2번 연속 맞히면 오답에서 빠짐
  for (let k = 0; k < 2; k++) {
    const rv = await t.call('POST', '/sessions', { source: { type: 'wrong' }, mode: 'write_meaning' }, b.token);
    assert.equal(rv.data.total, 1);
    const term = rv.data.questions[0].prompt.text;
    await t.call('POST', `/sessions/${rv.data._id}/answers`, { i: 0, response: s.items.find(x => x.term === term).meaning }, b.token);
    await t.call('POST', `/sessions/${rv.data._id}/finish`, {}, b.token);
  }
  assert.equal((await t.call('GET', '/wrong', undefined, b.token)).data.items.length, 0);
  // 재응시로 learned 가 부풀지 않음(같은 문항은 1번만)
  assert.equal((await t.call('GET', '/ranking', undefined, b.token)).data.me.learned, 2);
});

test('본문 세션과 종류 불일치 오류', async () => {
  const p = (await t.call('POST', '/sets', passageSet, a.token)).data;
  const bad = await t.call('POST', '/sessions', { source: { type: 'sets', ids: [p._id] }, mode: 'mc_meaning' }, a.token);
  assert.equal(bad.status, 400);
  const ok = await t.call('POST', '/sessions', { source: { type: 'sets', ids: [p._id] }, mode: 'cloze_key', options: { feedback: 'end' } }, a.token);
  assert.equal(ok.data.total, 2);
  const r = await t.call('POST', `/sessions/${ok.data._id}/answers`, { i: 0, response: ['x'] }, a.token);
  assert.deepEqual(r.data, { i: 0, saved: true }); // 종료 전 정답 비공개
  const fin = await t.call('POST', `/sessions/${ok.data._id}/finish`, {}, a.token);
  assert.ok(Array.isArray(fin.data.questions[0].expected));
});

test('레거시 테스트 문서는 단어 세트로 읽힘', async () => {
  const Test = t.mongoose.model('Test');
  // 옛 DB 문서처럼 스키마 검증 없이 넣는다(빈 문항이 섞인 손상 데이터 포함)
  const { insertedId } = await Test.collection.insertOne({ title: '옛 시험', author: new t.mongoose.Types.ObjectId(a.id), isPublic: true, format: 'section',
    questions: [{ question: 'apple', answer: '사과' }, { question: '배', answer: 'pear', questionType: 'ko-to-en' }, { question: '', answer: 'x' }, 'garbage'] });
  const legacy = { _id: insertedId };
  const r = await t.call('GET', `/sets/${legacy._id}`, undefined, b.token);
  assert.equal(r.status, 200);
  assert.equal(r.data.kind, 'vocab');
  assert.deepEqual(r.data.items.map(x => [x.term, x.meaning]), [['apple', '사과'], ['pear', '배']]);
  const ses = await t.call('POST', '/sessions', { source: { type: 'sets', ids: [legacy._id] }, mode: 'mc_meaning' }, b.token);
  assert.equal(ses.status, 201);
});

test('아바타는 URL 로, 바이트는 별도 엔드포인트', async () => {
  const png = 'data:image/png;base64,' + Buffer.from('fakepng').toString('base64');
  await t.call('PUT', '/auth/profile', { avatarImage: png }, a.token);
  const me = await t.call('GET', '/auth/me', undefined, a.token);
  assert.match(me.data.user.avatarUrl, /^\/api\/users\/[0-9a-f]{24}\/avatar\?v=\d+$/);
  const img = await t.call('GET', me.data.user.avatarUrl.replace('/api', ''));
  assert.equal(img.status, 200);
});

test('종료 처리 중 멈춘 세션은 재요청으로 복구(I-055), 결과는 세션당 1개', async () => {
  const s = (await t.call('POST', '/sets', vocabSet(), a.token)).data;
  const ses = (await t.call('POST', '/sessions', { source: { type: 'sets', ids: [s._id] }, mode: 'write_term', count: 2 }, a.token)).data;
  const Session = t.mongoose.model('Session');
  await Session.updateOne({ _id: ses._id }, { $set: { status: 'finishing', finishedAt: new Date(Date.now() - 60e3) } });
  const f = await t.call('POST', `/sessions/${ses._id}/finish`, {}, a.token);
  assert.equal(f.status, 200);
  const again = await t.call('POST', `/sessions/${ses._id}/finish`, {}, a.token);
  assert.equal(again.data._id, f.data._id);
  assert.equal(await t.mongoose.model('Result').countDocuments({ session: ses._id }), 1);
});

test('즐겨찾기 수는 실제 관계로 다시 맞춰짐(I-057)', async () => {
  const s = (await t.call('POST', '/sets', vocabSet(), a.token)).data;
  await t.mongoose.model('Test').updateOne({ _id: s._id }, { favoriteCount: 99 }); // 어긋난 상태
  const r = await t.call('POST', `/sets/${s._id}/favorite`, {}, b.token);
  assert.equal(r.data.favoriteCount, 1);
});
