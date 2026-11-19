// 시험 문제 생성기·채점기 — 계약 §3 의 유일한 구현(R5: 정답은 서버에만 둔다).
// DB 를 모르는 순수 함수. learn.js 가 소스(단어/문장)를 모아 넘겨준다.
import { parseSentence, plainText } from '../public/js/shared/passage.js';
import { gradeMeaning, gradeTerm, gradeSentence, normalize, normalizeKo } from '../public/js/shared/grade.js';

export const MODES = [
  { id: 'mc_meaning', kind: 'vocab', label: '뜻 고르기', desc: '영어 단어를 보고 알맞은 뜻을 고릅니다.' },
  { id: 'mc_term', kind: 'vocab', label: '단어 고르기', desc: '뜻을 보고 알맞은 영어 단어를 고릅니다.' },
  { id: 'write_meaning', kind: 'vocab', label: '뜻 쓰기', desc: '영어 단어를 보고 뜻을 직접 씁니다.' },
  { id: 'write_term', kind: 'vocab', label: '철자 쓰기', desc: '뜻을 보고 영어 철자를 씁니다.', options: ['hint'] },
  { id: 'listen_term', kind: 'vocab', label: '듣고 쓰기', desc: '발음을 듣고 철자를 씁니다.' },
  { id: 'cloze_key', kind: 'passage', label: '핵심 표현 빈칸', desc: '본문에 표시한 핵심 표현을 채웁니다.', options: ['hint'] },
  { id: 'cloze_random', kind: 'passage', label: '무작위 빈칸', desc: '본문의 내용어를 무작위로 비워 채웁니다.', options: ['ratio', 'hint'] },
  { id: 'choice', kind: 'passage', label: '어법·어휘 고르기', desc: '문장 속 [A / B] 중 맞는 것을 고릅니다.' },
  { id: 'word_order', kind: 'passage', label: '어순 배열', desc: '해석을 보고 단어 조각을 순서대로 배열합니다.' },
  { id: 'sentence_order', kind: 'passage', label: '문장 순서', desc: '섞인 문장들을 본문 순서대로 배열합니다.', options: ['size'] },
  { id: 'translate', kind: 'passage', label: '해석 보고 영작', desc: '한글 해석을 보고 영어 문장을 씁니다.' },
];
export const MODE_BY_ID = Object.fromEntries(MODES.map(m => [m.id, m]));

export class GenError extends Error {}

export function shuffle(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// 섞은 결과가 원래 순서와 같으면 한 번 더 섞는다(조각이 2개 이상일 때 "이미 정답" 방지)
function shuffleNotSame(arr, rnd) {
  let s = shuffle(arr, rnd);
  for (let k = 0; k < 5 && arr.length > 1 && s.every((x, i) => x === arr[i]); k++) s = shuffle(arr, rnd);
  return s;
}

const STOP = new Set('a an the and or but so if of to in on at by for from with as is am are was were be been being do does did have has had it its this that these those i you he she we they me him her us them my your his our their not no can could will would shall should may might must there here than then too very just also into over about up out what which who whom whose when where why how all any some such only own same both each few more most other'.split(' '));

/**
 * @param mode    계약 §3 id
 * @param src     vocab: { items: [{ set, setTitle, item:{_id,term,meaning,example} }], pool: [{term,meaning}] }
 *                passage: { sets: [{ set, setTitle, sentences:[{_id,en,ko}] }] }
 * @returns [{ q, key, ref }]
 */
export function buildQuestions(mode, src, count, options = {}, rnd = Math.random) {
  const m = MODE_BY_ID[mode];
  if (!m) throw new GenError('알 수 없는 시험 종류입니다.');
  const n = Math.max(1, Math.min(100, Number(count) || 20));
  const order = list => options.order === 'sequential' ? list : shuffle(list, rnd);
  const out = [];

  if (m.kind === 'vocab') {
    const items = (src.items || []).filter(x => x.item.term && x.item.meaning);
    if (!items.length) throw new GenError('시험에 쓸 단어가 없습니다.');
    for (const x of order(items).slice(0, n)) out.push(vocabQuestion(mode, x, src.pool || [], options, rnd));
  } else if (mode === 'sentence_order') {
    const size = Math.max(3, Math.min(8, Number(options.size) || 5));
    const groups = [];
    for (const s of src.sets || []) {
      const sents = s.sentences.filter(x => plainText(x.en).trim());
      if (sents.length < 3) continue;
      // 마지막 묶음이 3문장 미만이면 앞 묶음과 합친다
      for (let i = 0; i < sents.length; i += size) {
        const g = sents.slice(i, i + size);
        if (g.length < 3 && groups.length && groups[groups.length - 1].set === s.set) groups[groups.length - 1].sents.push(...g);
        else if (g.length >= 3) groups.push({ set: s.set, setTitle: s.setTitle, sents: g });
      }
    }
    if (!groups.length) throw new GenError('문장 순서 배열은 3문장 이상인 본문이 필요합니다.');
    for (const g of order(groups).slice(0, n)) out.push(sentenceOrderQuestion(g, rnd));
  } else {
    const cands = [];
    for (const s of src.sets || []) s.sentences.forEach((sent, idx) => {
      const q = passageQuestion(mode, sent, s.sentences, idx, options, rnd);
      if (q) cands.push({ ...q, ref: { set: s.set, item: sent._id } });
    });
    if (!cands.length) throw new GenError(EMPTY_REASON[mode] || '시험을 만들 수 있는 문장이 없습니다.');
    // 생성은 후보 전부에 대해 했으므로(무작위 빈칸 포함) 순서만 섞어 자른다
    out.push(...order(cands).slice(0, n));
  }
  out.forEach((x, i) => { x.q.i = i; });
  return out;
}

const EMPTY_REASON = {
  cloze_key: '핵심 표현 { } 이 표시된 문장이 없습니다. 본문 편집에서 핵심 표현을 표시해 주세요.',
  choice: '어법·어휘 선택 [정답|오답] 이 표시된 문장이 없습니다.',
  translate: '한글 해석이 있는 문장이 없습니다.',
  word_order: '어순 배열을 만들 수 있는 문장(3단어 이상)이 없습니다.',
  cloze_random: '빈칸을 만들 수 있는 단어가 없습니다.',
};

function vocabQuestion(mode, x, pool, options, rnd) {
  const { term, meaning, example } = x.item;
  const ref = { set: x.set, item: x.item._id };
  if (mode === 'mc_meaning' || mode === 'mc_term') {
    const field = mode === 'mc_meaning' ? 'meaning' : 'term';
    const norm = field === 'meaning' ? normalizeKo : normalize;
    const answer = x.item[field];
    const seen = new Set([norm(answer)]);
    const wrong = [];
    // 같은 세트 단어가 pool 앞쪽에 오도록 learn.js 가 정렬해 넘긴다 → 같은 세트 우선, 부족하면 같은 작성자 다른 세트
    for (const p of shuffleBlocks(pool, x.set, rnd)) {
      const k = norm(p[field]);
      if (!k || seen.has(k) || (field === 'meaning' && normalize(p.term) === normalize(term))) continue;
      seen.add(k); wrong.push(p[field]);
      if (wrong.length === 4) break;
    }
    const choices = shuffle([answer, ...wrong], rnd);
    return {
      q: { type: 'choice', prompt: { text: field === 'meaning' ? term : meaning, lang: field === 'meaning' ? 'en' : 'ko' }, choices },
      key: { kind: 'index', answer: choices.indexOf(answer), display: answer },
      ref,
    };
  }
  if (mode === 'write_meaning')
    return { q: { type: 'text', prompt: { text: term, lang: 'en', sub: example || undefined }, answerLang: 'ko' }, key: { kind: 'meaning', answer: meaning }, ref };
  if (mode === 'write_term')
    return {
      q: { type: 'text', prompt: { text: meaning, lang: 'ko' }, answerLang: 'en', hint: options.hint ? { first: term[0], length: term.length } : { length: term.length } },
      key: { kind: 'term', answer: term }, ref,
    };
  // listen_term: 발음(speak)은 정답 자체지만 듣기 시험의 본질이라 공개. 랭킹은 중복 제거 지표라 영향 없음(계약 v2).
  return { q: { type: 'text', prompt: { text: '들리는 단어를 쓰세요', lang: 'ko', sub: meaning }, speak: term, answerLang: 'en' }, key: { kind: 'term', answer: term }, ref };
}

// pool 을 "같은 세트" / "다른 세트" 두 덩어리로 나눠 각각 섞은 뒤 이어 붙임
function shuffleBlocks(pool, set, rnd) {
  const same = [], other = [];
  for (const p of pool) (String(p.set) === String(set) ? same : other).push(p);
  return [...shuffle(same, rnd), ...shuffle(other, rnd)];
}

function context(all, idx) {
  return { before: idx > 0 ? plainText(all[idx - 1].en) : '', after: idx + 1 < all.length ? plainText(all[idx + 1].en) : '' };
}

function passageQuestion(mode, sent, all, idx, options, rnd) {
  const { tokens, plain } = parseSentence(sent.en);
  if (!plain.trim()) return null;
  const ko = sent.ko || undefined;

  if (mode === 'cloze_key' || mode === 'cloze_random') {
    let blanks; // 토큰 index 배열의 배열
    if (mode === 'cloze_key') {
      const groups = new Map();
      tokens.forEach((t, i) => { if (t.key !== undefined) { if (!groups.has(t.key)) groups.set(t.key, []); groups.get(t.key).push(i); } });
      blanks = [...groups.values()].map(ix => range(ix[0], ix[ix.length - 1]));
    } else {
      const ratio = Math.max(0.1, Math.min(0.5, Number(options.ratio) || 0.25));
      const cand = tokens.map((t, i) => i).filter(i => {
        const t = tokens[i];
        return (t.kind === 'word' || t.kind === 'choice') && t.text.length >= 3 && !STOP.has(t.text.toLowerCase()) && !/^\d+$/.test(t.text);
      });
      if (!cand.length) return null;
      const k = Math.max(1, Math.round(cand.length * ratio));
      blanks = shuffle(cand, rnd).slice(0, k).sort((a, b) => a - b).map(i => [i]);
    }
    if (!blanks.length) return null;
    const answers = blanks.map(ix => ix.map(i => tokens[i].text).join(''));
    const segments = [];
    let cur = '', bi = 0;
    for (let i = 0; i < tokens.length; i++) {
      if (bi < blanks.length && i === blanks[bi][0]) {
        if (cur) segments.push(cur); cur = '';
        const a = answers[bi];
        segments.push({ blank: bi, length: a.length, ...(options.hint ? { hint: a[0] } : {}) });
        i = blanks[bi][blanks[bi].length - 1]; bi++;
      } else cur += tokens[i].text;
    }
    if (cur) segments.push(cur);
    return { q: { type: 'cloze', segments, ko, context: context(all, idx) }, key: { kind: 'cloze', answers } };
  }

  if (mode === 'choice') {
    const chs = tokens.filter(t => t.kind === 'choice');
    if (!chs.length) return null;
    const segments = [], answers = [];
    let cur = '', k = 0;
    for (const t of tokens) {
      if (t.kind !== 'choice') { cur += t.text; continue; }
      if (cur) segments.push(cur); cur = '';
      const opts = shuffle(t.options, rnd);
      answers.push(opts.indexOf(t.options[0]));
      segments.push({ choice: k++, options: opts });
    }
    if (cur) segments.push(cur);
    return { q: { type: 'inline_choice', segments, ko }, key: { kind: 'indexes', answers, display: plain } };
  }

  if (mode === 'word_order') {
    const pieces = chunkWords(plain);
    if (pieces.length < 3) return null;
    return {
      q: { type: 'order', layout: 'inline', prompt: { text: ko || '단어를 순서대로 배열하세요', lang: 'ko' }, pieces: shuffleNotSame(pieces, rnd) },
      key: { kind: 'order', answer: pieces, display: plain },
    };
  }

  if (mode === 'translate') {
    if (!ko) return null;
    const words = plain.split(/\s+/).filter(Boolean).length;
    return { q: { type: 'text', prompt: { text: ko, lang: 'ko' }, answerLang: 'en', multiline: true, hint: { words } }, key: { kind: 'sentence', answer: plain } };
  }
  return null;
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// 문장 → 조각: 단어 하나씩(문장부호는 앞 단어에 붙임). 단어가 12개를 넘으면 2단어씩 묶어 조작량을 줄인다.
export function chunkWords(plain) {
  const words = plain.split(/\s+/).filter(Boolean);
  if (words.length <= 12) return words;
  const out = [];
  for (let i = 0; i < words.length; i += 2) out.push(words.slice(i, i + 2).join(' '));
  return out;
}

function sentenceOrderQuestion(g, rnd) {
  const pieces = g.sents.map(s => plainText(s.en));
  return {
    q: { type: 'order', layout: 'stack', prompt: { text: '문장을 본문 순서대로 배열하세요', lang: 'ko' }, pieces: shuffleNotSame(pieces, rnd) },
    key: { kind: 'order', answer: pieces, display: pieces },
    ref: { set: g.set, item: g.sents[0]._id },
  };
}

// 응답 형식 검사 — 잘못된 형식은 GenError(→ 400)
function check(cond) { if (!cond) throw new GenError('답 형식이 올바르지 않습니다.'); }

/** @returns { correct, score, expected, detail? } */
export function grade(question, response) {
  const { q, key } = question;
  switch (key.kind) {
    case 'index': {
      check(Number.isInteger(response) && response >= -1 && response < q.choices.length); // -1 = 모름/시간초과
      const ok = response === key.answer;
      return { correct: ok, score: ok ? 1 : 0, expected: key.display };
    }
    case 'meaning':
    case 'term': {
      check(typeof response === 'string' && response.length <= 300);
      const ok = key.kind === 'meaning' ? gradeMeaning(key.answer, response) : gradeTerm(key.answer, response);
      return { correct: ok, score: ok ? 1 : 0, expected: key.answer };
    }
    case 'cloze': {
      check(Array.isArray(response) && response.length === key.answers.length && response.every(r => typeof r === 'string' && r.length <= 200));
      const each = key.answers.map((a, i) => gradeTerm(a, response[i]));
      const right = each.filter(Boolean).length;
      return { correct: right === each.length, score: right / each.length, expected: key.answers, detail: { each } };
    }
    case 'indexes': {
      check(Array.isArray(response) && response.length === key.answers.length && response.every(Number.isInteger));
      const each = key.answers.map((a, i) => a === response[i]);
      const right = each.filter(Boolean).length;
      const answers = key.answers.map((a, k) => q.segments.find(s => s.choice === k).options[a]);
      return { correct: right === each.length, score: right / each.length, expected: answers, detail: { each, sentence: key.display } };
    }
    case 'order': {
      // 응답 = pieces index 의 순열. 같은 글자 조각이 여러 개여도 글자로 비교하므로 어느 쪽을 골라도 정답.
      check(Array.isArray(response) && response.length === q.pieces.length && new Set(response).size === response.length
        && response.every(x => Number.isInteger(x) && x >= 0 && x < q.pieces.length));
      const got = response.map(x => q.pieces[x]);
      const each = key.answer.map((a, i) => a === got[i]);
      const right = each.filter(Boolean).length;
      return { correct: right === each.length, score: right / each.length, expected: key.display, detail: { each } };
    }
    case 'sentence': {
      check(typeof response === 'string' && response.length <= 1000);
      const r = gradeSentence(key.answer, response);
      return { correct: r.correct, score: r.score, expected: key.answer, detail: { diff: r.diff } };
    }
  }
  throw new GenError('채점할 수 없는 문항입니다.');
}

// 결과 화면용 정답 표시(세션의 key 에서)
export function expectedOf(question) {
  const k = question.key;
  if (k.kind === 'index') return k.display;
  if (k.kind === 'indexes') return k.answers.map((a, i) => question.q.segments.find(s => s.choice === i).options[a]);
  if (k.kind === 'cloze') return k.answers;
  if (k.kind === 'order') return k.display;
  return k.answer;
}
