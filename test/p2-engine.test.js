// P2 엔진: 표기법 파서 · 채점 · 문제 생성기(순수 함수)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSentence, splitSentences, pairSentences } from '../public/js/shared/passage.js';
import * as G from '../public/js/shared/grade.js';
import { buildQuestions, grade } from '../server/generators.js';

test('표기법: 핵심 표현·선택지·escape', () => {
  const p = parseSentence('She {gave up} [smoking|to smoke] last \\{year\\}.');
  assert.equal(p.plain, 'She gave up smoking last {year}.');
  assert.deepEqual(p.tokens.filter(t => t.key !== undefined).map(t => t.text), ['gave', 'up']);
  assert.deepEqual(p.tokens.find(t => t.kind === 'choice').options, ['smoking', 'to smoke']);
  assert.equal(parseSentence('An open { brace').plain, 'An open { brace');
  assert.equal(parseSentence('[only]').plain, '[only]'); // 선택지 1개 = 문자 그대로
});

test('문장 분리: 약어·소수·따옴표', () => {
  assert.deepEqual(splitSentences('Mr. Kim paid $3.5 for it. "Stop!" he said. Then he left.'),
    ['Mr. Kim paid $3.5 for it.', '"Stop!" he said.', 'Then he left.']);
  assert.deepEqual(splitSentences('I live in the U.S. now. Do you?'), ['I live in the U.S. now.', 'Do you?']);
  assert.deepEqual(pairSentences('A b. C d.', '가.\n나.\n다.').map(x => x.ko), ['가.', '나.', '다.']);
});

test('채점: 뜻·철자·문장', () => {
  assert.ok(G.gradeMeaning('~을 포기하다, 그만두다', '포기 하다') === false);
  assert.ok(G.gradeMeaning('~을 포기하다, 그만두다', '을 포기하다'));
  assert.ok(G.gradeMeaning('사과 (과일)', '사과'));
  assert.ok(G.gradeTerm('color/colour', ' Colour '));
  assert.ok(!G.gradeTerm('receive', 'recieve'));
  const r = G.gradeSentence('I don’t like it.', 'i don\'t like it');
  assert.ok(r.correct);
  const w = G.gradeSentence('He gave up smoking.', 'He give up smoking');
  assert.ok(!w.correct);
  assert.deepEqual(w.diff.map(d => d.op), ['ok', 'miss', 'extra', 'ok', 'ok']);
});

const seq = () => { let x = 0.37; return () => (x = (x * 9301 + 49297) % 233280 / 233280); };
const vocab = Array.from({ length: 8 }, (_, i) => ({ _id: `i${i}`, term: `word${i}`, meaning: `뜻${i}` }));
const vsrc = { items: vocab.map(item => ({ set: 's1', item })), pool: vocab.map(v => ({ set: 's1', term: v.term, meaning: v.meaning })) };

test('객관식: 5지선다, 정답 1개, 가짜 보기 없음, 채점', () => {
  const qs = buildQuestions('mc_meaning', vsrc, 5, {}, seq());
  assert.equal(qs.length, 5);
  for (const x of qs) {
    assert.equal(x.q.choices.length, 5);
    assert.equal(new Set(x.q.choices).size, 5);
    assert.ok(x.q.choices.every(c => /^뜻\d$/.test(c)));
    assert.equal(grade(x, x.key.answer).correct, true);
    assert.equal(grade(x, (x.key.answer + 1) % 5).correct, false);
    assert.equal(JSON.stringify(x.q).includes('"answer"'), false); // 공개 문항에 정답 없음
  }
  // 보기가 부족하면 있는 만큼(최소 2지선다)
  const two = buildQuestions('mc_meaning', { items: vsrc.items.slice(0, 2), pool: vsrc.pool.slice(0, 2) }, 2, {}, seq());
  assert.equal(two[0].q.choices.length, 2);
});

const sents = [
  { _id: 'a', en: 'Many teens {give up} their dreams too early.', ko: '많은 십대가 꿈을 너무 일찍 포기한다.' },
  { _id: 'b', en: 'They [are|is] afraid of failing.', ko: '그들은 실패를 두려워한다.' },
  { _id: 'c', en: 'But failure is part of {learning}.', ko: '하지만 실패는 배움의 일부다.' },
  { _id: 'd', en: 'Keep trying.', ko: '' },
];
const psrc = { sets: [{ set: 'p1', setTitle: 'P', sentences: sents }] };

test('본문: 핵심 빈칸', () => {
  const qs = buildQuestions('cloze_key', psrc, 10, { order: 'sequential' }, seq());
  assert.equal(qs.length, 2);
  assert.deepEqual(qs[0].key.answers, ['give up']);
  assert.equal(qs[0].q.segments.filter(s => typeof s !== 'string').length, 1);
  assert.equal(grade(qs[0], ['Give up']).correct, true);
  assert.equal(grade(qs[0], ['gave up']).correct, false);
  assert.throws(() => grade(qs[0], 'give up')); // 형식 오류
});

test('본문: 어법 선택·어순·영작·문장 순서', () => {
  const ch = buildQuestions('choice', psrc, 10, {}, seq());
  assert.equal(ch.length, 1);
  const seg = ch[0].q.segments.find(s => s.options);
  assert.equal(grade(ch[0], [seg.options.indexOf('are')]).correct, true);

  const wo = buildQuestions('word_order', psrc, 10, { order: 'sequential' }, seq());
  assert.equal(wo.length, 3); // "Keep trying." 은 2단어라 제외
  const right = wo[0].key.answer.map(p => wo[0].q.pieces.indexOf(p));
  assert.equal(grade(wo[0], right).correct, true);

  const tr = buildQuestions('translate', psrc, 10, {}, seq());
  assert.equal(tr.length, 3); // 해석 없는 문장 제외
  const t0 = tr.find(x => x.key.answer.startsWith('Many'));
  assert.equal(grade(t0, 'many teens give up their dreams too early').correct, true);

  const so = buildQuestions('sentence_order', psrc, 5, {}, seq());
  assert.equal(so.length, 1);
  assert.equal(so[0].q.pieces.length, 4);
  assert.equal(grade(so[0], so[0].key.answer.map(p => so[0].q.pieces.indexOf(p))).correct, true);
});

test('생성 불가 조건은 이유와 함께 오류', () => {
  assert.throws(() => buildQuestions('cloze_key', { sets: [{ set: 'x', sentences: [{ _id: 'z', en: 'No marks here.' }] }] }, 5), /핵심 표현/);
  assert.throws(() => buildQuestions('sentence_order', { sets: [{ set: 'x', sentences: sents.slice(0, 2) }] }, 5), /3문장/);
});

// Codex golden 데이터(test/fixtures)가 있으면 그대로 검사
const fx = name => { try { return JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url))); } catch { return null; } };
test('golden: markup.json', { skip: !fx('markup.json') }, () => {
  for (const c of fx('markup.json')) {
    const p = parseSentence(c.en);
    assert.equal(p.plain, c.plain, c.name);
    const keys = []; let g = -1;
    for (const t of p.tokens) {
      if (t.key === undefined) continue;
      if (t.key !== g) { keys.push(''); g = t.key; }
    }
    // 핵심 표현 원문은 같은 group 토큰 범위의 글자
    const spans = new Map();
    p.tokens.forEach((t, i) => { if (t.key !== undefined) { const s = spans.get(t.key) || [i, i]; s[1] = i; spans.set(t.key, s); } });
    const got = [...spans.values()].map(([a, b]) => p.tokens.slice(a, b + 1).map(t => t.text).join(''));
    assert.deepEqual(got, c.keys || [], c.name + ' keys');
    assert.deepEqual(p.tokens.filter(t => t.kind === 'choice').map(t => t.options), c.choices || [], c.name + ' choices');
  }
});
test('golden: split.json', { skip: !fx('split.json') }, () => {
  for (const c of fx('split.json')) assert.deepEqual(splitSentences(c.text), c.sentences, c.name);
});
test('golden: grading.json', { skip: !fx('grading.json') }, () => {
  for (const c of fx('grading.json')) {
    const r = G[c.fn](c.expected, c.response);
    assert.equal(typeof r === 'object' ? r.correct : r, c.correct, `${c.fn}(${c.expected} / ${c.response}) ${c.note || ''}`);
  }
});

test('객관식 보기가 1개뿐이면 문항을 만들지 않음(I-059)', () => {
  const one = { items: [{ set: 's', item: { _id: 'x', term: 'solo', meaning: '혼자' } }], pool: [{ set: 's', term: 'solo', meaning: '혼자' }] };
  assert.throws(() => buildQuestions('mc_meaning', one, 5), /2개 이상/);
});
