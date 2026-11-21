// 표기 없는 본문으로도 '핵심 표현 빈칸'·'어법·어휘 고르기' 를 만들 수 있게(13, 2026-11-21 사용자 요청:
// "본문 세트에서 단어만 입력하면 해당 모드들을 모두 사용할 수 있도록"). 사용자가 { } · [정답|오답] 을 표시했으면 그것을 쓰고,
// 없는 문장만 여기서 자동으로 고른다. 품사·활용은 compromise(MIT, public/vendor) — 화면의 문법 풀이와 같은 엔진.
import nlp from '../public/vendor/compromise-14.14.4.mjs';

const keyOf = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const PREP = new Set('in on at by with from of for about into onto through near under over between among during without within behind across along against toward towards upon around beside beyond inside outside despite after before since'.split(' '));
const STOPW = new Set('the a an and or but so to of in on at by for with from is are was were be been being am do does did have has had will would can could may might must should shall it its this that these those he she they we you i me him her them us my your his our their there here very not no yes just also than then when what which who whom whose where why how all any some each every more most much many such own same other into onto'.split(' '));

function terms(plain) {
  return (nlp(plain).json()[0]?.terms || []).filter(t => t.text).map(t => ({ text: t.text, w: t.text.toLowerCase(), tags: new Set(t.tags) }));
}
// 우리 토큰(표기법 토큰) ↔ 분석 단어 짝짓기(글자·숫자만 비교)
function align(tokens, T) {
  const tok2t = new Map(); let j = 0;
  tokens.forEach((tk, ti) => {
    if (tk.kind !== 'word' && tk.kind !== 'choice') return;
    const k = keyOf(tk.text); if (!k) return;
    for (let look = 0; look < 3 && j + look < T.length; look++) if (keyOf(T[j + look].text) === k) { tok2t.set(ti, j + look); j += look + 1; return; }
  });
  const t2tok = new Map([...tok2t].map(([a, b]) => [b, a]));
  return { tok2t, t2tok };
}
const has = (t, x) => !!t && t.tags.has(x);
const conj = w => nlp(w).verbs().conjugate()[0] || nlp(`they ${w}`).verbs().conjugate()[0] || null;

// ── 핵심 표현 자동 선택: 구동사 > 형용사+명사 > 본동사 > 명사·-ly 부사. 긴 문장은 2개 ──
export function autoKeyBlanks(tokens, plain, rnd) {
  const T = terms(plain), { t2tok } = align(tokens, T);
  const cands = [];
  const push = (a, b, score) => { if (t2tok.has(a) && t2tok.has(b)) cands.push({ a, b, score: score + rnd() * 1.5 }); };
  for (let i = 0; i < T.length; i++) {
    const t = T[i], n = T[i + 1];
    if (has(t, 'PhrasalVerb') && has(n, 'PhrasalVerb') && has(n, 'Particle')) push(i, i + 1, 5);
    if (has(t, 'Adjective') && has(n, 'Noun') && !has(n, 'Pronoun') && n.w.length >= 3 && !STOPW.has(t.w)) push(i, i + 1, 4);
    if (has(t, 'Verb') && !has(t, 'Auxiliary') && !has(t, 'Modal') && !has(t, 'Copula') && t.w.length >= 4 && !STOPW.has(t.w)) push(i, i, 3);
    if (has(t, 'Noun') && !has(t, 'Pronoun') && !has(t, 'ProperNoun') && t.w.length >= 4 && !STOPW.has(t.w)) push(i, i, 2);
    if (has(t, 'Adverb') && /ly$/.test(t.w) && t.w.length >= 5) push(i, i, 2);
  }
  const want = T.length >= 14 ? 2 : 1, picked = [];
  for (const c of cands.sort((x, y) => y.score - x.score)) {
    if (picked.length >= want) break;
    if (picked.some(p => !(c.b < p.a - 1 || c.a > p.b + 1))) continue; // 겹치거나 붙어 있으면 건너뜀
    picked.push(c);
  }
  return picked.sort((x, y) => x.a - y.a).map(p => { const s = t2tok.get(p.a), e = t2tok.get(p.b); return Array.from({ length: e - s + 1 }, (_, k) => s + k); });
}

// ── 어법·어휘 선택지 자동 생성: [정답, 오답] ──
// 내신 어법 단골: 동사 자리 vs 준동사, 수 일치, to부정사, 전치사 + 동명사, 능동/수동, 관계사, 형용사/부사. 없으면 같은 품사 다른 단어로 어휘 문제.
export function autoChoiceTokens(tokens, plain, rnd, pool = []) {
  const T = terms(plain), { t2tok } = align(tokens, T);
  const opts = [];
  const add = (i, wrong, score, why) => { if (!t2tok.has(i) || !wrong) return; const right = T[i].text; if (keyOf(wrong) === keyOf(right) || !/^[A-Za-z'-]+$/.test(wrong)) return; opts.push({ i, right, wrong: matchCase(right, wrong), score: score + rnd(), why }); };
  for (let i = 0; i < T.length; i++) {
    const t = T[i], p = T[i - 1];
    const verb = has(t, 'Verb') && !has(t, 'Auxiliary') && !has(t, 'Modal') && !has(t, 'Copula');
    if (verb && p?.w === 'to' && has(t, 'Infinitive')) { const c = conj(t.w); add(i, c?.Gerund, 5, 'to부정사'); continue; }
    if (has(t, 'Gerund') && p && (has(p, 'Preposition') || PREP.has(p.w))) { const c = conj(t.w); add(i, c?.Infinitive, 5, '전치사+동명사'); continue; }
    if (verb && p && has(p, 'Copula') && (has(t, 'Passive') || has(t, 'Participle') || (has(t, 'PastTense') && /ed$/.test(t.w)))) { const c = conj(t.w); add(i, c?.Gerund, 5, '능동/수동'); continue; }
    if (verb && has(t, 'PresentTense') && /s$/.test(t.w) && !(p && (has(p, 'Modal') || p.w === 'to'))) { const c = conj(t.w); add(i, c?.Infinitive, 4, '수 일치'); continue; }
    if (verb && has(t, 'PastTense') && !(p && (has(p, 'Copula') || ['have', 'has', 'had'].includes(p.w)))) { const c = conj(t.w); add(i, c?.Gerund, 4, '동사 자리'); continue; }
    if (['who', 'which'].includes(t.w) && p && has(p, 'Noun')) { add(i, t.w === 'who' ? 'which' : 'who', 4, '관계대명사'); continue; }
    if (t.w === 'where' && p && has(p, 'Noun')) { add(i, 'which', 4, '관계부사'); continue; }
    if (has(t, 'Adverb') && /ly$/.test(t.w) && t.w.length > 4) { add(i, t.w.replace(/ily$/, 'y').replace(/ly$/, ''), 3, '형용사/부사'); continue; }
    if (has(t, 'Adjective') && p && has(p, 'Copula')) { const adv = nlp(t.w).adjectives().toAdverb().text(); add(i, adv, 3, '보어 자리 형용사'); continue; }
  }
  if (!opts.length) { // 어휘: 같은 품사의 다른 단어
    for (let i = 0; i < T.length; i++) {
      const t = T[i];
      const kind = has(t, 'Noun') && !has(t, 'Pronoun') && !has(t, 'ProperNoun') ? 'n' : has(t, 'Adjective') ? 'a' : has(t, 'Verb') && !has(t, 'Auxiliary') && !has(t, 'Copula') && !has(t, 'Modal') ? 'v' : '';
      if (!kind || t.w.length < 4 || STOPW.has(t.w)) continue;
      const others = pool.filter(x => x.kind === kind && keyOf(x.text) !== keyOf(t.text) && !keyOf(plain).includes(keyOf(x.text)));
      if (others.length) add(i, others[Math.floor(rnd() * others.length)].text, 1, '어휘');
    }
  }
  const want = T.length >= 16 ? 2 : 1, picked = [];
  for (const o of opts.sort((a, b) => b.score - a.score)) { if (picked.length >= want) break; if (picked.some(p => Math.abs(p.i - o.i) < 3)) continue; picked.push(o); }
  if (!picked.length) return null;
  const out = tokens.map(x => ({ ...x }));
  for (const o of picked) { const ti = t2tok.get(o.i); out[ti] = { text: o.right, kind: 'choice', options: [o.right, o.wrong] }; }
  return out;
}
const matchCase = (model, w) => (/^[A-Z]/.test(model) ? w[0].toUpperCase() + w.slice(1) : w);

// 어휘 오답 후보: 세트의 다른 문장에서 명사·형용사·동사(원형이 아닌 그대로의 모양)
export function vocabPool(plains) {
  const out = [];
  for (const p of plains) for (const t of terms(p)) {
    const kind = has(t, 'Noun') && !has(t, 'Pronoun') && !has(t, 'ProperNoun') ? 'n' : has(t, 'Adjective') ? 'a' : has(t, 'Verb') && !has(t, 'Auxiliary') && !has(t, 'Copula') && !has(t, 'Modal') ? 'v' : '';
    if (kind && t.w.length >= 4 && !STOPW.has(t.w) && /^[a-z]+$/i.test(t.text)) out.push({ text: t.text, kind });
  }
  return out;
}
