// 영어 문장 문법 풀이(12, 2026-11-21 사용자 요청: 본문 문장의 단어·문장에 마우스를 올리면 문장 속 역할과 문법을 설명).
// 품사 태깅은 오픈소스 compromise(MIT, public/vendor)에 맡기고, 내신 문법 설명(문장 성분·형식·to부정사·동명사·분사·
// 수동태·완료·조동사·관계사·명사절·부사절·가정법·비교·가주어·there 구문·구동사·분사구문)은 이 파일의 규칙으로 만든다.
// 자동 분석이라 틀릴 수 있다(화면에 그렇게 표시). 유료 AI API 를 쓰지 않아 비용·키 없이 바로 동작한다.
// 순수 함수: analyze(nlp, 문장) → { words:[{text, root, pos, role, notes:[그룹 번호…]}], groups:[{label, text, desc, from, to}], sentence }

const PREP = new Set('in on at by with from of for about into onto through near under over between among during without within behind across along against toward towards upon around beside besides beyond inside outside despite throughout via per unlike past beneath below above off'.split(' '));
const SUB = { because: '이유', since: '이유·시간', as: '이유·때', although: '양보', though: '양보', while: '시간·대조', when: '시간', whenever: '시간', if: '조건', unless: '조건(~하지 않으면)', once: '시간(~하자마자)', until: '시간', till: '시간', before: '시간', after: '시간', whereas: '대조' };
const COORD = new Set(['and', 'but', 'or', 'yet', 'nor', 'so']);
const WH = new Set(['why', 'how', 'what', 'where', 'when', 'who', 'whether', 'which', 'if']);
const LINK = new Set(['be', 'become', 'seem', 'appear', 'look', 'feel', 'sound', 'taste', 'smell', 'remain', 'stay', 'grow', 'turn']);
const BE = new Set(['be', 'am', 'is', 'are', 'was', 'were', 'been', 'being', "'s", "'re", "'m", "isn't", "aren't", "wasn't", "weren't"]);
const HAVE = new Set(['have', 'has', 'had', "'ve", "'d"]);
const MODAL = { can: '능력·가능(~할 수 있다)', could: '과거의 능력·공손한 요청·약한 가능성', may: '허락·추측(~일지도 모른다)', might: '약한 추측', must: '의무(~해야 한다)·강한 추측(~임에 틀림없다)', should: '의무·충고(~해야 한다)', would: '과거의 습관·가정·공손한 표현', will: '미래·의지(~할 것이다)', shall: '제안·미래' };
const TO_OBJ = new Set('want decide plan hope try learn need agree promise refuse choose expect wish begin start like love hate prefer intend manage fail afford offer pretend'.split(' '));
const OBJ_TO = new Set('ask tell want allow encourage expect advise force enable help get order cause require invite persuade remind teach warn urge'.split(' '));
const GER_OBJ = new Set('enjoy finish avoid mind keep quit practice consider stop suggest deny imagine miss admit risk postpone'.split(' '));
const THAT_VERB = new Set('think believe know say notice realize hope suggest show find feel learn hear see understand agree explain mean claim argue report decide'.split(' '));
const NPPOS = new Set(['관사', '한정사', '소유격 대명사', '수사']);
const POSS = new Set(['my', 'your', 'his', 'her', 'its', 'our', 'their']);
const DEMO = new Set(['this', 'that', 'these', 'those']);
const ADVW = new Set(['here', 'now', 'then', 'today', 'yesterday', 'tomorrow', 'tonight', 'soon', 'already', 'still', 'abroad', 'together', 'away', 'please', 'very', 'too', 'also', 'just', 'never', 'always', 'often', 'sometimes', 'usually', 'even', 'only', 'not']);
// 목적어 + 형용사(목적격 보어)를 취하는 5형식 동사
const OBJ_ADJ = new Set('make keep find leave get paint consider call name elect think believe set drive turn'.split(' '));

const norm = w => String(w || '').toLowerCase().replace(/[’']/g, "'");
const has = (t, tag) => !!t && t.tags.has(tag);
const isVerbish = t => !!t && (has(t, 'Verb') || has(t, 'Modal') || has(t, 'Auxiliary') || has(t, 'Copula'));
const isNounish = t => !!t && (has(t, 'Noun') || has(t, 'Pronoun') || has(t, 'ProperNoun'));

// 품사(한국어) — compromise 태그 + 기능어 목록으로 보정(예: who 가 전치사로, near 가 형용사로 잡히는 것)
function posOf(t, prev, next) {
  const w = t.w;
  if (w === 'to') return isVerbish(next) && (has(next, 'Infinitive') || has(next, 'PresentTense')) && !has(next, 'Gerund') ? 'to부정사의 to' : '전치사';
  if (['who', 'whom', 'whose', 'which'].includes(w) && prev && isNounish(prev)) return '관계대명사';
  if ((w === 'where' || w === 'when') && prev && isNounish(prev) && !has(prev, 'Pronoun') && !prev.comma) return '관계부사';
  if (SUB[w] && next && (isNounish(next) || has(next, 'Determiner'))) return '접속사';
  if (COORD.has(w)) return '접속사';
  if (w === 'there' && next && BE.has(next.w)) return '유도부사';
  if (POSS.has(w) && next && !isVerbish(next)) return '소유격 대명사';
  if (DEMO.has(w) && (!next || isVerbish(next) || next.w === ',' )) return '대명사';
  if (ADVW.has(w)) return '부사';
  if (PREP.has(w) && next && !isVerbish(next)) return '전치사';
  if (w === 'like' && prev && isVerbish(prev) && LINK.has(prev.root)) return '전치사';
  if (has(t, 'Modal')) return '조동사';
  if (BE.has(w) || has(t, 'Copula')) return 'be동사';
  if (HAVE.has(w) && next && (has(next, 'Participle') || has(next, 'PastTense') || BE.has(next.w))) return '조동사(have)';
  if (has(t, 'Negative')) return '부정어';
  if (has(t, 'Gerund')) return '동사의 -ing형';
  if (has(t, 'Verb')) return '동사';
  if (has(t, 'QuestionWord')) return '의문사';
  if (has(t, 'Pronoun')) return has(t, 'Possessive') ? '소유격 대명사' : '대명사';
  if (has(t, 'ProperNoun')) return '고유명사';
  if (has(t, 'Noun')) return '명사';
  const er = /er$/.test(w), est = /est$/.test(w);
  if (has(t, 'Comparative') || ((has(t, 'Superlative') || has(t, 'Adjective')) && er && !isNounish(next) && !['other', 'under', 'over', 'never', 'ever', 'however', 'whether', 'rather'].includes(w))) return '비교급';
  if (has(t, 'Superlative') || (has(t, 'Adjective') && est)) return '최상급';
  if (has(t, 'Adjective')) return '형용사';
  if (has(t, 'Adverb')) return '부사';
  if (has(t, 'Determiner')) return w === 'a' || w === 'an' || w === 'the' ? '관사' : '한정사';
  if (has(t, 'Preposition')) return '전치사';
  if (has(t, 'Conjunction')) return '접속사';
  if (has(t, 'Value') || has(t, 'Cardinal')) return '수사';
  if (has(t, 'Expression')) return '감탄사';
  return '';
}

export function analyze(nlp, text) {
  const raw = nlp(text);
  raw.compute('root');
  const T = (raw.json()[0]?.terms || []).filter(t => t.text).map(t => ({ text: t.text, w: norm(t.text), root: t.root || t.normal || norm(t.text), tags: new Set(t.tags), comma: /[,;:—–]/.test(t.post || '') }));
  const n = T.length;
  const groups = [];
  const add = (from, to, label, desc) => { if (from < 0 || to < from || to >= n) return -1; groups.push({ label, from, to, desc, text: T.slice(from, to + 1).map(x => x.text).join(' ') }); return groups.length - 1; };
  const pos = T.map((t, i) => posOf(t, T[i - 1], T[i + 1]));
  const role = new Array(n).fill('');
  const used = new Array(n).fill(false); // 비정형 동사(to부정사·동명사·분사)는 서술어 후보에서 뺌
  const setRole = (a, b, r, force = false) => { for (let j = a; j <= b; j++) if (force || !role[j]) role[j] = r; };
  const isNounPos = k => ['명사', '고유명사', '대명사'].includes(pos[k]) || (pos[k] === '동사의 -ing형' && used[k]);
  // 명사구 끝: [관사·한정사·소유격·수사]* [부사? 형용사·비교·최상]* [명사]+  (대명사는 혼자 한 덩어리)
  const npEnd = (k, lim = n - 1, allowAdj = false) => {
    if (k > lim || k < 0) return -1;
    if (pos[k] === '대명사') return k;
    let e = -1, noun = false;
    for (let j = k; j <= lim; j++) {
      const p = pos[j];
      if (!noun && (NPPOS.has(p) || ['형용사', '비교급', '최상급'].includes(p) || (p === '부사' && ['형용사', '비교급', '최상급'].includes(pos[j + 1])) || (p === '동사의 -ing형' && isNounPos(j + 1)))) { e = j; if (T[j].comma) break; continue; }
      if (p === '명사' || p === '고유명사') { e = j; noun = true; if (T[j].comma) break; continue; }
      break;
    }
    return noun || (allowAdj && e >= k && ['형용사', '비교급', '최상급'].includes(pos[e])) ? e : -1;
  };
  // 명사구 시작(끝에서 거꾸로): 쉼표·절 경계를 넘지 않음
  const npStart = (e, lo) => { let s = e; while (s - 1 >= lo && !T[s - 1].comma && (NPPOS.has(pos[s - 1]) || ['형용사', '비교급', '최상급', '명사', '고유명사'].includes(pos[s - 1]))) s--; return s; };

  // ── 1) to부정사 · -ing ──
  const mainVerbBefore = i => { for (let k = i - 1; k >= 0; k--) { if (T[k].comma && k < i - 1) return null; if (isVerbish(T[k]) && !used[k] && !has(T[k], 'Modal') && !BE.has(T[k].w) && pos[k] !== '조동사(have)') return { ...T[k], i: k }; } return null; };
  for (let i = 0; i < n; i++) {
    const prev = T[i - 1], next = T[i + 1];
    if (pos[i] === 'to부정사의 to' && next) {
      used[i] = used[i + 1] = true;
      const end = Math.max(i + 1, npEnd(i + 2) > 0 && !T[i + 1].comma ? npEnd(i + 2) : i + 1);
      const pv = mainVerbBefore(i);
      let use, why, r = '수식어(to부정사)';
      if (T[0]?.w === 'it' && BE.has(T[1]?.w) && i > 2 && pv === null) { use = '명사적 용법(진주어)'; why = '문장 앞의 it 은 가주어, 이 to부정사구가 진짜 주어예요: "~하는 것은".'; r = '진주어'; }
      else if (i === 0 || (prev && prev.comma)) { use = '부사적 용법(목적) 또는 명사적 용법(주어)'; why = '문장 맨 앞의 to부정사는 "~하기 위해(목적)" 또는 "~하는 것은(주어)" 으로 해석해요.'; }
      else if (prev && (prev.w === 'order' || prev.w === 'as')) { use = '부사적 용법(목적)'; why = 'in order to / so as to = ~하기 위해서.'; }
      else if (pv && OBJ_TO.has(pv.root) && prev && isNounish(prev) && pv.i < i - 1) { use = '목적격 보어(5형식)'; why = `${pv.root}+목적어+to부정사: 목적어(${prev.text})가 ~하도록 ${pv.root}하다. 목적어가 to부정사의 의미상 주어예요.`; r = '목적격 보어'; }
      else if (pv && TO_OBJ.has(pv.root) && pv.i === i - 1) { use = '명사적 용법(목적어)'; why = `${pv.text}의 목적어로 "~하는 것을" 이라는 뜻이에요. (${pv.root} + to부정사)`; r = '목적어'; }
      else if (prev && ['형용사', '비교급'].includes(pos[i - 1])) { use = '부사적 용법(형용사 수식)'; why = `앞의 형용사 ${prev.text}를 꾸며 "~하기에/~해서" 로 해석해요.`; }
      else if (prev && isNounPos(i - 1)) { use = '형용사적 용법'; why = `앞의 명사 ${prev.text}를 꾸며 "~할/~하는 ${prev.text}" 로 해석해요.`; }
      else { use = '부사적 용법(목적·결과)'; why = '완전한 문장 뒤에서 "~하기 위해서/~해서" 로 해석해요.'; }
      add(i, end, `to부정사 · ${use}`, why);
      setRole(i, end, r);
      i = end;
      continue;
    }
    if (pos[i] === '동사의 -ing형' && !used[i]) {
      if (prev && (BE.has(prev.w) || (has(prev, 'Adverb') && BE.has(T[i - 2]?.w)))) continue; // be + -ing = 진행형(서술어)
      used[i] = true;
      const e = Math.max(i, npEnd(i + 1));
      const commaAt = T.slice(0, 7).findIndex(x => x.comma);
      if (i === 0 && commaAt >= 0 && !T.slice(1, commaAt + 1).some(x => isVerbish(x) && !has(x, 'Gerund') && !has(x, 'Participle'))) { add(0, commaAt, '분사구문', '접속사와 주어를 생략하고 -ing 로 시작한 부사구: 때(~할 때)·이유(~해서)·동시 동작(~하면서) 등으로 해석해요. 생략된 주어는 주절의 주어와 같아요.'); setRole(0, commaAt, '수식어(분사구문)'); for (let k = 1; k <= commaAt; k++) used[k] = used[k] || isVerbish(T[k]); }
      else if (i === 0 && !T[e].comma) { add(i, e, '동명사(주어)', '문장 맨 앞의 -ing 가 주어 역할: "~하는 것은". 동명사 주어는 단수 취급해요.'); setRole(i, e, '주어'); }
      else if (prev && pos[i - 1] === '전치사') { add(i, e, '동명사(전치사의 목적어)', `전치사 ${prev.text} 뒤 목적어 자리는 명사만 오므로 동사는 -ing(동명사)로 바꿔요.`); }
      else if (prev && (GER_OBJ.has(prev.root) || has(prev, 'PhrasalVerb'))) { add(i, e, '동명사(목적어)', `${prev.text}는 동명사를 목적어로 써요.${GER_OBJ.has(prev.root) ? ` (${prev.root} + -ing, to부정사 불가)` : ''}`); setRole(i, e, '목적어'); }
      else if (next && (pos[i + 1] === '명사' || pos[i + 1] === '고유명사') && e === i + 1 && !(prev && isVerbish(prev))) { add(i, i, '현재분사(형용사 역할)', `뒤의 명사 ${next.text}를 꾸며 "~하는" 으로 해석해요.`); setRole(i, i, '수식어(분사)'); }
      else if (prev && isNounPos(i - 1)) { add(i, e, '현재분사(명사 뒤 수식)', `앞의 ${prev.text}를 뒤에서 꾸며 "~하고 있는" 으로 해석해요.`); setRole(i, e, '수식어(분사)'); }
      else if (i === 0) { add(i, e, '분사구문', '접속사·주어를 생략하고 -ing 로 시작한 부사구: 때·이유·동시 동작 등으로 해석해요.'); setRole(i, e, '수식어(분사구문)'); }
      else add(i, e, '동명사/현재분사', '-ing 형이 명사(동명사)나 형용사(분사)처럼 쓰였어요.');
    }
  }

  // ── 2) 절 나누기: 접속사·관계사·명사절 앞, 부사절 끝의 쉼표 ──
  const clauses = []; let start = 0, kind = 'main', info = '';
  const cut = (i, k, inf) => { if (i > start) clauses.push({ from: start, to: i - 1, kind, info }); start = i; kind = k; info = inf; };
  const startsClause = k => (pos[k] === '대명사' || isNounPos(k) || NPPOS.has(pos[k]) || ['형용사', '유도부사'].includes(pos[k]) || (T[k]?.w === 'it')) && T.slice(k, k + 6).some((x, j) => isVerbish(x) && !used[k + j]);
  for (let i = 0; i < n; i++) {
    const t = T[i], prev = T[i - 1];
    if (i > start && T[i - 1].comma && kind === 'adv') cut(i, 'main', '');
    if (pos[i] === '관계대명사') cut(i, 'rel', prev.text);
    else if (pos[i] === '관계부사') cut(i, 'reladv', prev.text);
    else if (t.w === 'that' && prev && isNounPos(i - 1) && (isVerbish(T[i + 1]) || startsClause(i + 1)) && !(THAT_VERB.has(prev.root))) { pos[i] = '관계대명사'; cut(i, 'rel', prev.text); }
    else if (t.w === 'that' && prev && (isVerbish(prev) || prev.comma === false && isVerbish(T[i - 2]) && pos[i - 1] === '부사') && startsClause(i + 1)) { pos[i] = '접속사(that)'; cut(i, 'noun', 'that'); }
    else if (WH.has(t.w) && pos[i] !== '관계대명사' && pos[i] !== '관계부사' && pos[i] !== '접속사' && prev && isVerbish(prev) && startsClause(i + 1)) { pos[i] = '의문사(간접의문문)'; cut(i, 'noun', t.w); }
    else if (pos[i] === '접속사' && SUB[t.w]) cut(i, 'adv', t.w);
    else if (prev && THAT_VERB.has(prev.root) && isVerbish(prev) && !used[i - 1] && (pos[i] === '대명사' || NPPOS.has(pos[i]) || isNounPos(i)) && (() => { const e = npEnd(i); return e >= i && isVerbish(T[e + 1]) && !used[e + 1]; })()) cut(i, 'noun', 'that 생략');
    else if (COORD.has(t.w) && i > 0 && startsClause(i + 1)) cut(i, 'coord', t.w);
  }
  cut(n, '', '');
  for (let ci = 0; ci < clauses.length; ci++) {
    const c = clauses[ci];
    if (c.kind !== 'rel' && c.kind !== 'reladv') continue;
    const vIdx = []; for (let k = c.from + 1; k <= c.to; k++) if (isVerbish(T[k]) && !used[k] && !(isVerbish(T[k - 1]) && !used[k - 1]) && !has(T[k - 1], 'Adverb')) vIdx.push(k);
    if (vIdx.length < 2) continue;
    // 선행사 명사구(관계사 바로 앞)
    const antE = c.from - 1, antS = npStart(antE, 0);
    clauses.splice(ci + 1, 0, { from: vIdx[1], to: c.to, kind: 'main', info: '', subj: [antS, antE] });
    c.to = vIdx[1] - 1;
  }

  // ── 3) 절마다 서술어·주어·목적어·보어, 시제·태 ──
  let mainPattern = null;
  const tenses = [];
  for (const [ci, c] of clauses.entries()) {
    let v = -1;
    for (let i = c.from; i <= c.to; i++) if (isVerbish(T[i]) && !used[i] && !pos[i].startsWith('접속사')) { v = i; break; }
    if (v < 0) continue;
    let ve = v;
    while (ve + 1 <= c.to && !T[ve].comma && ((isVerbish(T[ve + 1]) && !used[ve + 1] && !(pos[ve + 1] === '동사의 -ing형' && !BE.has(T[ve].w) && !has(T[ve], 'Adverb'))) || has(T[ve + 1], 'Negative') || (has(T[ve + 1], 'Adverb') && isVerbish(T[ve + 2]) && !used[ve + 2]) || has(T[ve + 1], 'Particle'))) ve++;
    setRole(v, ve, '서술어', true);
    const vs = T.slice(v, ve + 1);
    const head = [...vs].reverse().find(x => isVerbish(x) && !has(x, 'Negative')) || vs[0];
    const passive = vs.some((x, k) => BE.has(x.w) && vs.slice(k + 1).some(y => has(y, 'Participle') || has(y, 'Passive') || (has(y, 'PastTense') && /ed$/.test(y.w))));
    const perfect = vs.some((x, k) => HAVE.has(x.w) && vs.slice(k + 1).some(y => has(y, 'Participle') || has(y, 'PastTense')));
    const prog = vs.some((x, k) => BE.has(x.w) && vs.slice(k + 1).some(y => has(y, 'Gerund')));
    const modal = vs.find(x => MODAL[x.w]);
    let tense = modal ? (['will', 'shall'].includes(modal.w) ? '미래' : `조동사 ${modal.w}`) : (vs.some(x => ['was', 'were', 'had', 'did'].includes(x.w)) || (has(vs[0], 'PastTense') && !perfect)) ? '과거' : '현재';
    if (perfect) tense = modal ? `${modal.w} have p.p.` : `${vs.some(x => x.w === 'had') ? '과거' : '현재'}완료`;
    if (prog) tense += ' 진행';
    tenses.push(`${tense}${passive ? ' · 수동태' : ''}`);
    if (passive) { const by = T.findIndex((x, k) => k > ve && k <= c.to && x.w === 'by'); add(v, by > 0 ? Math.max(by, npEnd(by + 1)) : ve, '수동태(be + p.p.)', `주어가 동작을 "당하는" 형태: "~되다/~받다".${by > 0 ? ' by 뒤가 실제로 동작을 한 쪽(행위자)이에요.' : ''}`); }
    if (perfect && !modal) add(v, ve, tense.startsWith('과거') ? '과거완료(had p.p.)' : '현재완료(have p.p.)', tense.startsWith('과거') ? '과거의 어느 때보다 더 이전에 일어난 일(대과거).' : '과거에 시작된 일이 지금까지 이어지거나(계속) 지금 결과가 남아 있음(완료·경험·결과).');
    if (modal) add(v, ve, `조동사 ${modal.w}`, `${MODAL[modal.w]}.${perfect ? ` ${modal.w} have p.p. = 과거에 대한 ${modal.w === 'should' ? '후회(~했어야 했는데)' : modal.w === 'must' ? '강한 추측(~했음에 틀림없다)' : modal.w === 'would' ? '가정(~했을 텐데)' : modal.w === 'could' ? '가능성(~할 수 있었을 텐데)' : '추측'}.` : ''} 조동사 뒤에는 동사원형이 와요.`);
    const pvs = vs.filter(x => x.tags.has('PhrasalVerb'));
    if (pvs.length > 1) add(T.indexOf(pvs[0]), T.indexOf(pvs[pvs.length - 1]), '구동사', `${pvs.map(x => x.text).join(' ')}: 동사+부사(전치사)가 한 덩어리로 새 뜻을 만들어요. 통째로 외워요.`);
    // 주어: 서술어 바로 앞 명사구(쉼표·절 경계 안)
    if (c.subj) setRole(c.subj[0], c.subj[1], '주어', true);
    let sE = v - 1; while (sE >= c.from && pos[sE] === '부사') sE--;
    if (c.kind === 'rel' && sE === c.from && ['who', 'which', 'that'].includes(T[c.from].w)) setRole(c.from, c.from, '주어(주격 관계대명사)', true);
    else if (sE >= c.from && (isNounPos(sE) || pos[sE] === '대명사')) {
      const g = groups.find(x => x.label.startsWith('동명사(주어)') && x.to === sE);
      const sS = g ? g.from : pos[sE] === '대명사' ? sE : npStart(sE, c.from);
      setRole(sS, sE, '주어', true);
    }
    if (pos[c.from] === '유도부사') setRole(c.from, c.from, '유도부사', true);
    // 동사 뒤 명사구(최대 2개)
    const head0 = head, linking0 = BE.has(head.w) || LINK.has(head.root);
    const objs = []; let k = ve + 1;
    while (k <= c.to && objs.length < 2 && !T[k - 1].comma) {
      if (pos[k] === '부사') { k++; continue; }
      if (used[k] && !groups.some(g => g.from === k && g.label.startsWith('동명사'))) break;
      const e = groups.find(g => g.from === k && g.label.startsWith('동명사'))?.to ?? npEnd(k, c.to, (objs.length === 1 && OBJ_ADJ.has(head0.root) && !groups.some(g => g.from === objs[0][0] && g.label.startsWith('동명사'))) || (objs.length === 0 && linking0));
      if (e < k) break;
      objs.push([k, e]); k = e + 1;
    }
    const mark = ([a, b], r) => setRole(a, b, r, true);
    const linking = BE.has(head.w) || LINK.has(head.root);
    let pattern;
    if (pos[c.from] === '유도부사' && objs.length) { mark(objs[0], '주어(진짜 주어)'); pattern = '1형식(There + be + 주어)'; add(c.from, objs[0][1], 'There + be 구문', 'there 는 뜻이 없는 유도부사, 진짜 주어는 be동사 뒤의 명사예요: "~이 있다". be동사의 수는 진짜 주어에 맞춰요.'); }
    else if (passive) pattern = objs.length ? '수동태(4·5형식의 수동)' : '수동태(1·3형식의 수동)';
    else if (linking && (objs.length || ['형용사', '비교급', '최상급'].includes(pos[ve + 1]))) { if (objs.length) mark(objs[0], '주격 보어'); else setRole(ve + 1, ve + 1, '주격 보어', true); pattern = '2형식(주어 + 동사 + 주격 보어)'; }
    else if (objs.length === 2) {
      const second = objs[1];
      if (['형용사'].includes(pos[second[0]]) && second[0] === second[1]) { mark(objs[0], '목적어'); mark(second, '목적격 보어'); pattern = '5형식(주어 + 동사 + 목적어 + 목적격 보어)'; }
      else { mark(objs[0], '간접목적어'); mark(second, '직접목적어'); pattern = '4형식(주어 + 동사 + 간접목적어 + 직접목적어)'; add(objs[0][0], second[1], '4형식 수여동사', `${head.text}+사람+사물: "(사람)에게 (사물)을 ~해 주다". 3형식으로 바꾸면 사물 + to/for + 사람.`); }
    } else if (objs.length === 1) {
      mark(objs[0], '목적어');
      pattern = groups.some(g => g.from === objs[0][1] + 1 && g.label.includes('목적격 보어')) ? '5형식(주어 + 동사 + 목적어 + 목적격 보어)' : '3형식(주어 + 동사 + 목적어)';
    } else if (groups.some(g => g.from === ve + 1 && /^to부정사|^동명사/.test(g.label))) pattern = '3형식(목적어가 to부정사·동명사)';
    else if (clauses[ci + 1]?.kind === 'noun' && clauses[ci + 1].from <= ve + 2) { pattern = '3형식(목적어가 명사절)'; setRole(clauses[ci + 1].from, clauses[ci + 1].to, '목적어(명사절)'); }
    else pattern = '1형식(주어 + 동사)';
    if (!mainPattern && (c.kind === 'main' || c.kind === 'coord')) mainPattern = pattern;
    if (c.kind === 'main' && (v === 0 || (v === 1 && T[0].w === 'please')) && v === c.from + (T[c.from].w === 'please' ? 1 : 0) && (has(T[v], 'Infinitive') || has(T[v], 'Imperative') || (has(T[v], 'PresentTense') && !/s$/.test(T[v].w)))) { setRole(v, ve, '서술어(명령)', true); add(v, ve, '명령문', '주어(you) 없이 동사원형으로 시작: "~해라".'); }
  }

  // ── 4) 절 설명 ──
  for (const c of clauses) {
    const first = T[c.from];
    if (c.kind === 'rel') add(c.from, c.to, `관계대명사절 (선행사: ${c.info})`, `${first.text} 이하가 앞의 명사 ${c.info}를 꾸며요. ${({ who: 'who = 사람 선행사(주격)', which: 'which = 사물·동물 선행사', whose: 'whose = 소유격(~의)', whom: 'whom = 사람 선행사(목적격)' })[first.w] || 'that = 사람·사물 모두 가능(콤마 뒤·전치사 뒤에는 못 씀)'}.${role[c.from] ? '' : ' 관계사 뒤 문장에 목적어가 빠져 있으면 목적격 관계대명사(생략 가능)예요.'}`);
    if (c.kind === 'reladv') add(c.from, c.to, `관계부사절 (선행사: ${c.info})`, `${first.text} = 전치사 + which. 앞의 ${c.info}를 꾸며 "~하는 ${c.info}". 관계부사 뒤에는 완전한 문장이 와요.`);
    if (c.kind === 'noun' && c.info === 'that 생략') add(c.from, c.to, '명사절(that 생략)', '동사 뒤 목적어 자리의 접속사 that 이 생략된 명사절: "~라고 (생각하다)". 주어 + 동사가 이어지면 that 생략을 의심해요.');
    else if (c.kind === 'noun') add(c.from, c.to, c.info === 'that' ? '명사절(that절)' : `명사절(간접의문문: ${c.info})`, c.info === 'that' ? '접속사 that 이 이끄는 절이 목적어(또는 보어) 역할: "~라는 것을". 목적어 자리의 that 은 생략할 수 있어요.' : `의문사 ${c.info}가 이끄는 절이 목적어 역할. 어순이 "의문사 + 주어 + 동사" 로 평서문 순서예요.`);
    if (c.kind === 'adv') {
      const w = c.info;
      const ifPast = w === 'if' && T.slice(c.from, c.to + 1).some(x => x.w === 'were' || x.w === 'had' || (has(x, 'PastTense') && !BE.has(x.w)));
      const ppMain = T.some(x => MODAL[x.w]) && T.some(x => x.w === 'have');
      const hadIf = T.slice(c.from, c.to + 1).some(x => x.w === 'had');
      add(c.from, c.to, ifPast ? (hadIf ? '가정법 과거완료' : ppMain ? '혼합 가정법' : '가정법 과거') : `부사절(${SUB[w]})`, ifPast ? (hadIf ? '가정법 과거완료: If + 주어 + had p.p., 주어 + 조동사 과거 + have p.p. → 과거 사실의 반대("~했다면 …했을 텐데").' : ppMain ? '혼합 가정법: if절은 가정법 과거(현재 사실의 반대, be는 were), 주절은 조동사 과거 + have p.p.(과거 일에 대한 가정)로 "(지금) ~라면 (그때) …했을 텐데".' : '가정법 과거: If + 주어 + 동사 과거(be는 were), 주어 + 조동사 과거 + 동사원형 → 현재 사실의 반대("~라면 …할 텐데").') : `${first.text}가 이끄는 절이 주절을 꾸며 ${SUB[w]}을(를) 나타내요.`);
    }
    if (c.kind === 'coord') add(c.from, c.from, `등위접속사 ${c.info}`, `${c.info} 앞뒤로 대등한 두 문장을 이어요.`);
  }
  // 비교·최상급·가주어·전치사구·문두 부사구
  for (let i = 0; i < n; i++) {
    const t = T[i];
    if ((pos[i] === '비교급' || t.w === 'more' || t.w === 'less') && T.slice(i + 1, i + 6).some(x => x.w === 'than')) add(i, T.findIndex((x, k) => k > i && x.w === 'than'), '비교급', '형용사·부사 -er / more ~ + than: "~보다 더".');
    else if (pos[i] === '비교급') add(i, i, '비교급', '-er / more ~ 형태로 "더 ~한(하게)".');
    if (t.w === 'the' && T[i + 1] && (pos[i + 1] === '최상급' || ['most', 'best', 'worst', 'least'].includes(T[i + 1].w))) add(i, i + (T[i + 1].w === 'most' ? 2 : 1), '최상급', 'the + -est / most ~: "가장 ~한".');
    if (i === 0 && t.w === 'it' && BE.has(T[1]?.w) && T.some(x => x.w === 'to' || x.w === 'that')) { setRole(0, 0, '가주어', true); add(0, 0, '가주어 it', '진짜 주어(to부정사·that절)가 길어서 뒤로 보내고 그 자리에 it 을 둔 것. 이 it 은 해석하지 않아요.'); }
    if (t.w === 'than' && npEnd(i + 1) > i) { setRole(i, npEnd(i + 1), '비교 대상', true); continue; }
    if (pos[i] === '전치사' && !used[i]) {
      const e = npEnd(i + 1);
      if (e > i) {
        const adj = T[i - 1] && isNounPos(i - 1) && !T[i - 1].comma && (t.w === 'of' || /주어/.test(role[i - 1]));
        add(i, e, adj ? '전치사구(형용사 역할)' : '전치사구(부사 역할)', adj ? `앞의 명사 ${T[i - 1].text}를 꾸며요.` : '동사·문장을 꾸며 장소·시간·방법·이유 등을 더해요(수식어).');
        setRole(i, e, '수식어(전치사구)', true);
      }
    }
  }
  if (n > 2 && T[0] && !role[0] && T.slice(0, 5).some(x => x.comma)) {
    const e = T.findIndex(x => x.comma);
    if (e >= 0 && e < 5 && !T.slice(0, e + 1).some((x, k) => isVerbish(x) && !used[k])) { add(0, e, '문두 부사구', '문장 앞에서 때·장소 등을 알려 주는 수식어. 쉼표 뒤부터 주어가 시작돼요.'); setRole(0, e, '수식어(부사구)'); }
  }
  // 나머지 역할
  for (let i = 0; i < n; i++) {
    if (role[i]) continue;
    if (['형용사', '비교급', '최상급'].includes(pos[i]) && isNounPos(i + 1)) role[i] = '수식어(명사 수식)';
    else if (pos[i] === '부사' || pos[i] === '비교급') role[i] = '수식어(부사)';
    else if (NPPOS.has(pos[i])) role[i] = '명사 앞 한정어';
    else if (pos[i].startsWith('접속사') || pos[i].includes('관계') || pos[i].includes('의문사')) role[i] = '절을 잇는 말';
  }
  const words = T.map((t, i) => ({ text: t.text, root: t.root, pos: pos[i], role: role[i], notes: groups.map((g, gi) => (i >= g.from && i <= g.to ? gi : -1)).filter(x => x >= 0) }));
  const NAME = { main: '주절', rel: '관계사절', reladv: '관계부사절', noun: '명사절', adv: '부사절', coord: '등위절' };
  const structure = clauses.length > 1 ? clauses.map(c => NAME[c.kind] || '주절').join(' + ') : '단문(절 하나)';
  return { words, groups, sentence: { pattern: mainPattern || '분석 어려움', tense: tenses[0] || '', tenses, structure } };
}
