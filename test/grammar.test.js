// 12 문법 풀이 golden: 내신 대표 문장에서 문장 형식·성분·문법 포인트가 나와야 함(자동 분석 품질 회귀 방지)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import nlp from '../public/vendor/compromise-14.14.4.mjs';
import { analyze } from '../public/js/shared/grammar.js';

const A = s => analyze(nlp, s);
const roleOf = (a, w) => a.words.find(x => x.text.toLowerCase() === w)?.role || '';
const labels = a => a.groups.map(g => g.label).join(' | ');

test('문장 형식', () => {
  assert.match(A('Mina walks through a small park.').sentence.pattern, /^1형식/);
  assert.match(A('Reading books is the best way to learn.').sentence.pattern, /^2형식/);
  assert.match(A('She notices plastic cups near the benches.').sentence.pattern, /^3형식/);
  assert.match(A('He gave me a book that I had wanted.').sentence.pattern, /^4형식/);
  assert.match(A('She made him happy.').sentence.pattern, /^5형식/);
  assert.match(A('She asks classmates to bring reusable bottles.').sentence.pattern, /^5형식/);
  assert.match(A('There are many students in the library.').sentence.pattern, /There/);
});

test('문장 성분', () => {
  const a = A('The man who lives next door is a doctor.');
  assert.equal(roleOf(a, 'man'), '주어');
  assert.equal(roleOf(a, 'is'), '서술어');
  assert.equal(roleOf(a, 'doctor'), '주격 보어');
  assert.equal(roleOf(a, 'who'), '주어(주격 관계대명사)');
  const b = A('It is important to protect the environment.');
  assert.equal(roleOf(b, 'it'), '가주어');
  assert.equal(roleOf(b, 'protect'), '진주어');
  assert.equal(roleOf(A('There are many students in the library.'), 'students'), '주어(진짜 주어)');
});

test('문법 포인트', () => {
  assert.match(labels(A('The park was cleaned by students who wanted to help.')), /수동태.*관계대명사절|관계대명사절.*수동태/s);
  assert.match(labels(A('The park was cleaned by students who wanted to help.')), /to부정사 · 명사적 용법\(목적어\)/);
  assert.match(labels(A('Reading books is the best way to learn.')), /동명사\(주어\).*형용사적 용법.*최상급/s);
  assert.match(labels(A('Mina believes that small actions can make a difference.')), /명사절\(that절\)/);
  assert.match(labels(A('I think he is kind.')), /명사절\(that 생략\)/);
  assert.match(labels(A('The signs explain why people should reuse bags.')), /간접의문문.*|조동사 should/);
  assert.match(labels(A('If I were you, I would have given up smoking earlier.')), /가정법/);
  assert.match(labels(A('He has lived here for ten years.')), /현재완료/);
  assert.match(labels(A('This is the place where I was born.')), /관계부사절/);
  assert.match(labels(A('Running fast, he caught the bus.')), /분사구문/);
  assert.match(labels(A('My brother is taller than me.')), /비교급/);
  assert.match(labels(A('Please close the door.')), /명령문/);
});
