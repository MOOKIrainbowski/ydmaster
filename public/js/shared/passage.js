// 본문 표기법 파서 — 서버(문제 생성)와 프론트(편집기 미리보기·표시)가 같이 쓰는 유일한 원본(계약 §1.2, R7).
//   {text}            핵심 표현(빈칸 우선 후보, 여러 단어 가능)
//   [정답|오답|오답]   어법·어휘 선택(첫 항목이 정답, 2~4개)
//   \{ \} \[ \] \|    문자 그대로
// 닫히지 않은 괄호는 문자 그대로 취급한다(편집 중 문장이 깨지지 않도록).

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*(?:-[\p{L}\p{N}]+)*|\s+|[^\s\p{L}\p{N}]/gu;

// 일반 글을 단어/공백/문장부호 토큰으로
export function tokenize(text) {
  return (String(text).match(WORD_RE) || []).map(t => ({
    text: t,
    kind: /^\s+$/.test(t) ? 'space' : /^[\p{L}\p{N}]/u.test(t) ? 'word' : 'punct',
  }));
}

// 표기법 → 조각 [{ type:'text', text } | { type:'key', text } | { type:'choice', options }]
export function parseMarkup(en) {
  const s = String(en ?? '');
  const parts = [];
  let buf = '';
  const flush = () => { if (buf) { parts.push({ type: 'text', text: buf }); buf = ''; } };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length && '{}[]|\\'.includes(s[i + 1])) { buf += s[++i]; continue; }
    if (c === '{' || c === '[') {
      const close = c === '{' ? '}' : ']';
      const end = findClose(s, i + 1, close);
      const raw = end === -1 ? null : s.slice(i + 1, end);
      if (raw !== null && /[{[]/.test(stripEscapes(raw))) {
        // 중첩 금지: 바깥 괄호 짝까지 통째로 문자 그대로(안쪽만 표기로 해석하면 작성자 의도와 달라짐)
        const outer = findBalanced(s, i);
        buf += unescape(s.slice(i, outer + 1)); i = outer; continue;
      }
      const inner = raw === null ? null : unescape(raw);
      if (inner !== null && inner.trim()) {
        if (c === '{') { flush(); parts.push({ type: 'key', text: inner.trim() }); i = end; continue; }
        const options = splitPipes(s.slice(i + 1, end)).map(o => o.trim()).filter(Boolean);
        if (options.length >= 2 && options.length <= 4) { flush(); parts.push({ type: 'choice', options }); i = end; continue; }
      }
    }
    buf += c;
  }
  flush();
  return parts;
}

// 여는 괄호 i 부터 깊이가 0 이 되는 위치(없으면 문자열 끝)
function findBalanced(s, i) {
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '{' || s[j] === '[') d++;
    else if ((s[j] === '}' || s[j] === ']') && --d === 0) return j;
  }
  return s.length - 1;
}

function findClose(s, from, close) {
  for (let j = from; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === close) return j;
  }
  return -1;
}
function stripEscapes(x) { return x.replace(/\\./g, ''); }
function unescape(x) { return x.replace(/\\([{}[\]|\\])/g, '$1'); }
function splitPipes(x) {
  const out = []; let cur = '';
  for (let j = 0; j < x.length; j++) {
    if (x[j] === '\\' && j + 1 < x.length) { cur += x[++j]; continue; }
    if (x[j] === '|') { out.push(cur); cur = ''; continue; }
    cur += x[j];
  }
  out.push(cur);
  return out;
}

// 문장 하나 → { plain, tokens }. key 토큰엔 같은 표현끼리 묶는 group 번호, choice 토큰엔 options.
export function parseSentence(en) {
  const tokens = [];
  let group = 0;
  for (const p of parseMarkup(en)) {
    if (p.type === 'text') tokens.push(...tokenize(p.text));
    else if (p.type === 'key') { const g = group++; tokenize(p.text).forEach(t => tokens.push(t.kind !== 'space' ? { ...t, key: g } : t)); }
    else tokens.push({ text: p.options[0], kind: 'choice', options: p.options });
  }
  return { plain: tokens.map(t => t.text).join(''), tokens };
}

export const plainText = en => parseSentence(en).plain;

// 문단 → 문장 배열. 약어·소수·이니셜·따옴표 안 문장부호를 문장 끝으로 보지 않는다.
// ABBR: 뒤에 무엇이 와도 문장 끝 아님(호칭 등). ABBR_END: 뒤가 대문자로 시작하면 문장 끝.
const ABBR = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'e.g', 'i.e', 'no', 'fig', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'mt']);
const ABBR_END = new Set(['etc', 'u.s', 'u.k', 'a.m', 'p.m', 'co', 'inc', 'ltd']);
export function splitSentences(text) {
  const src = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!src) return [];
  const out = [];
  let start = 0;
  let depth = 0; // 표기법 괄호 안에서는 자르지 않음
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === '{' || c === '[') depth++;
    else if ((c === '}' || c === ']') && depth > 0) depth--;
    if (c === '\n' && src[i + 1] === '\n') { push(i); start = i + 1; continue; } // 빈 줄 = 문단 경계
    if (depth > 0 || !'.!?…'.includes(c)) continue;
    // 연속 부호(?!, ..., .") 끝까지 확장
    let j = i;
    while (j + 1 < src.length && /[.!?…"'”’)\]]/.test(src[j + 1])) j++;
    const next = src.slice(j + 1);
    if (next && !/^\s/.test(next)) { i = j; continue; }          // 3.5, U.S.A 처럼 바로 붙은 글자
    if (c === '.') {
      const word = (src.slice(start, i).match(/([\p{L}.]+)$/u) || [])[1] || '';
      const w = word.toLowerCase();
      const upperNext = /^\s+["“'‘]?\p{Lu}/u.test(next);
      if (ABBR.has(w) || /^\p{L}$/u.test(word)) { i = j; continue; }
      if ((ABBR_END.has(w) || /^(\p{L}\.)+\p{L}$/u.test(word)) && !upperNext) { i = j; continue; }
    }
    const after = next.trimStart();
    if (after && /^[\p{Ll}]/u.test(after)) { i = j; continue; } // 다음이 소문자면 문장 중간
    push(j + 1); start = j + 1; i = j;
  }
  push(src.length);
  return out;
  function push(end) { const s = src.slice(start, end).replace(/\s+/g, ' ').trim(); if (s) out.push(s); }
}

// 영문·한글 문단을 문장 단위로 짝짓기. 개수가 다르면 남는 쪽은 빈 문자열(편집기에서 사람이 맞춤).
export function pairSentences(enText, koText) {
  const en = splitSentences(enText);
  const ko = splitKorean(koText);
  const n = Math.max(en.length, ko.length);
  return Array.from({ length: n }, (_, i) => ({ en: en[i] || '', ko: ko[i] || '' }));
}

// 한글 해석은 줄 단위가 우선(교재 해석은 보통 문장마다 줄바꿈), 한 줄이면 마침표로 나눈다.
export function splitKorean(text) {
  const src = String(text ?? '').trim();
  if (!src) return [];
  const lines = src.split(/\n+/).map(s => s.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  return src.split(/(?<=[.!?。])\s+/).map(s => s.trim()).filter(Boolean);
}
