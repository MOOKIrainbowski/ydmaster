// 15: 빈칸 문항에 다음 문장이 노출되지 않음 · 어순 배열 정답 형식 · 새 꾸미기(카드 효과) 장착 검증
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuestions, grade } from '../server/generators.js';
import { checkEquip, cosmeticsCatalog, COSMETICS } from '../server/game.js';

const seq = () => { let x = 0.37; return () => (x = (x * 9301 + 49297) % 233280 / 233280); };
const sents = ['Small habits change everything over time.', 'People often give up too early.', 'Reading every day builds a strong vocabulary.']
  .map((en, k) => ({ _id: `s${k}`, en, ko: `해석 ${k}` }));
const psrc = { sets: [{ set: 'p1', setTitle: 'P', sentences: sents }] };

test('빈칸 문항은 앞뒤 문장(다른 문항의 정답)을 싣지 않음', () => {
  for (const mode of ['cloze_random', 'cloze_key']) {
    const qs = buildQuestions(mode, psrc, 3, { order: 'sequential' }, seq());
    assert.ok(qs.length);
    for (const x of qs) {
      assert.equal(x.q.context, undefined);
      const text = JSON.stringify(x.q);
      // 이 문항 문장이 아닌 다른 문장의 원문이 통째로 들어 있으면 안 됨
      for (const s of sents) if (!x.q.segments.some(seg => typeof seg === 'string' && s.en.startsWith(seg))) assert.ok(!text.includes(s.en));
    }
  }
});

test('어순 배열 채점의 expected 는 문장 문자열(결과 화면이 배열·문자열 모두 처리)', () => {
  const [x] = buildQuestions('word_order', psrc, 1, { order: 'sequential' }, seq());
  const r = grade(x, x.q.pieces.map((_, k) => k));
  assert.equal(typeof r.expected, 'string');
});

test('카드 효과: 해금된 것만 장착, 목록에 포함', () => {
  assert.equal(checkEquip('effect', 'none', []).value, 'none');
  assert.ok(checkEquip('effect', 'sparkle', []).error);
  assert.equal(checkEquip('effect', 'sparkle', ['perfect']).value, 'sparkle');
  assert.ok(checkEquip('effect', 'nope', ['perfect']).error);
  const cat = cosmeticsCatalog(['perfect']);
  assert.equal(cat.effect.length, COSMETICS.effect.length);
  assert.ok(cat.effect.find(e => e.id === 'sparkle').got);
  for (const k of ['color', 'frame', 'border', 'effect']) assert.equal(new Set(COSMETICS[k].map(c => c.id)).size, COSMETICS[k].length);
});
