// 본문 세트 공부 화면(12, 2026-11-21 사용자 요청)
//  - 문장마다 카드, 카드 바로 아래에서 해석 보기/숨기기(모두 보기도)
//  - 단어에 마우스를 올리면(휴대폰은 누르면) 품사·문장 속 역할·관련 문법 설명, 번호에 올리면 문장 전체 요약
//  - '문장 분석' 을 켜면 주어·서술어·목적어·보어·수식어를 색으로, 문법 포인트를 목록으로
// 문법 분석(compromise + shared/grammar.js)은 이 화면을 처음 열 때만 불러온다(다른 화면 용량에 영향 없음).
import { html, render, icon } from './ui.js';
import { parseSentence } from './shared/passage.js';

let libP;
const loadLib = () => (libP ||= Promise.all([import('/vendor/compromise-14.14.4.mjs'), import('./shared/grammar.js')]).then(([m, g]) => ({ nlp: m.default, analyze: g.analyze })));
const keyOf = s => String(s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
// 성분 → 색 묶음(S 주어 · V 서술어 · O 목적어 · C 보어 · M 수식어)
const cat = r => (!r ? '' : /^(주어|가주어|진주어)|진짜 주어|주격 관계/.test(r) ? 'S' : r.startsWith('서술어') ? 'V' : r.includes('목적어') ? 'O' : r.includes('보어') ? 'C' : /수식어|비교 대상|한정어/.test(r) ? 'M' : '');
const CAT_NAME = { S: '주어', V: '서술어', O: '목적어', C: '보어', M: '수식어' };

// 우리 토큰(표기법 포함)과 분석 단어를 글자·숫자만으로 맞춤(10.5 처럼 한 단어가 여러 토큰인 경우도)
function align(tokens, words) {
  const map = new Map(); let j = 0, rest = '';
  tokens.forEach((t, ti) => {
    if (t.kind !== 'word' && t.kind !== 'choice') return;
    const k = keyOf(t.text); if (!k) return;
    for (let look = 0; look < 3 && j + look < words.length; look++) {
      const wk = rest || keyOf(words[j + look].text);
      if (wk === k) { map.set(ti, j + look); j = j + look + 1; rest = ''; return; }
      if (wk.startsWith(k)) { map.set(ti, j + look); j = j + look; rest = wk.slice(k.length); if (!rest) j++; return; }
      if (rest) break;
    }
  });
  return map;
}

export function mountPassageStudy(host, set) {
  const S = set.passage.sentences;
  let mode = 'cards', allKo = false, A = null, loading = true;
  const koOpen = new Set(), anaOpen = new Set();
  const parsed = S.map(s => parseSentence(s.en));

  // 문장 한 줄: 단어마다 span(분석 번호), 핵심 표현은 mark, 선택지는 [A / B] 배지
  const line = si => {
    const { tokens } = parsed[si], an = A?.[si], map = an ? align(tokens, an.words) : new Map();
    const out = []; let keyBuf = null, keyId = null;
    const word = (t, ti) => {
      const wi = map.get(ti), w = wi !== undefined ? an.words[wi] : null;
      const attrs = w ? html` data-s="${si}" data-w="${wi}" data-cat="${cat(w.role)}"` : '';
      return t.kind === 'choice' ? html`<span class="gw gw--choice"${attrs}>${t.options.join(' / ')}</span>` : html`<span class="gw"${attrs}>${t.text}</span>`;
    };
    const flush = () => { if (keyBuf) out.push(html`<mark class="key">${keyBuf}</mark>`); keyBuf = null; keyId = null; };
    tokens.forEach((t, ti) => {
      const piece = t.kind === 'space' ? ' ' : t.kind === 'punct' ? t.text : word(t, ti);
      if (t.key !== undefined) { if (keyId !== t.key) { flush(); keyBuf = []; keyId = t.key; } keyBuf.push(piece); return; }
      if (t.kind === 'space' && keyBuf && tokens[ti + 1]?.key === keyId) { keyBuf.push(piece); return; }
      flush(); out.push(piece);
    });
    flush();
    return out;
  };
  const analysis = si => {
    const an = A?.[si]; if (!an) return html`<p class="muted">문장을 분석하는 중…</p>`;
    return html`<dl class="sa-summary"><div><dt>문장 형식</dt><dd>${an.sentence.pattern}</dd></div><div><dt>시제·태</dt><dd>${an.sentence.tenses.join(' / ') || '-'}</dd></div><div><dt>구조</dt><dd>${an.sentence.structure}</dd></div></dl>
      <p class="sa-legend">${['S', 'V', 'O', 'C', 'M'].map(c => html`<span class="sa-chip sa-chip--${c}">${CAT_NAME[c]}</span>`)}</p>
      ${an.groups.length ? html`<ul class="sa-points">${an.groups.map((g, gi) => html`<li><button type="button" class="sa-point" data-s="${si}" data-g="${gi}"><b>${g.label}</b><span lang="en">${g.text}</span><small>${g.desc}</small></button></li>`)}</ul>` : html`<p class="muted">눈에 띄는 문법 포인트가 없는 단순한 문장이에요.</p>`}
      <p class="sa-note">${icon('info', 14)}자동 분석이라 틀릴 수 있어요. 헷갈리면 선생님·교재 해설로 확인하세요.</p>`;
  };
  const card = (s, si) => {
    const ko = allKo || koOpen.has(si), ana = anaOpen.has(si);
    return html`<article class="sent-card${ana ? ' is-roles' : ''}" data-sent="${si}">
      <div class="sent-card__head"><span class="sent-card__num" data-sent-info="${si}" tabindex="0" aria-label="${si + 1}번 문장 요약">${si + 1}</span>
        <button class="sent-card__btn${ana ? ' is-on' : ''}" type="button" data-ana="${si}" aria-expanded="${ana}">${icon('search', 15)}문장 분석</button></div>
      <p class="sent-card__en" lang="en">${line(si)}</p>
      ${s.ko ? html`<div class="sent-card__ko${ko ? ' is-open' : ''}"><div><p>${s.ko}</p></div></div>
        <button class="sent-card__toggle" type="button" data-ko="${si}" aria-expanded="${ko}">${icon(ko ? 'chevronUp' : 'chevronDown', 15)}${ko ? '해석 숨기기' : '해석 보기'}</button>` : html`<p class="muted sent-card__noko">해석이 없는 문장이에요.</p>`}
      ${ana ? html`<div class="sent-card__ana">${analysis(si)}</div>` : ''}
    </article>`;
  };
  const draw = () => render(host, html`
    <div class="ps-bar">
      <div class="seg seg--toggle ps-mode" role="radiogroup" aria-label="보기 방식"><label class="seg__opt"><input type="radio" name="ps-mode" value="cards" ${mode === 'cards' ? 'checked' : ''}><span>문장 카드</span></label><label class="seg__opt"><input type="radio" name="ps-mode" value="read" ${mode === 'read' ? 'checked' : ''}><span>본문 읽기</span></label></div>
      <button class="btn btn--ghost btn--sm" type="button" data-ko-all>${icon(allKo ? 'eye' : 'eye', 16)}${allKo ? '해석 모두 숨기기' : '해석 모두 보기'}</button>
      <span class="ps-hint">${icon('lightbulb', 15)}${loading ? '문법 분석을 준비하는 중…' : '단어에 마우스를 올리면(휴대폰은 누르면) 문법 설명이 나와요'}</span>
    </div>
    ${mode === 'cards' ? html`<div class="sent-list">${S.map(card)}</div>`
      : html`<p class="passage passage--reading ps-read" lang="en">${S.map((s, si) => html`<span class="passage__sentence"><sup class="passage__num" data-sent-info="${si}" tabindex="0">${si + 1}</sup>${line(si)}${allKo && s.ko ? html` <span class="passage-ko">${s.ko}</span>` : ''} </span>`)}</p>`}`);
  draw();

  // 분석: 화면을 먼저 보여 주고 뒤에서 계산(문장이 많아도 멈추지 않게 조금씩)
  let alive = true;
  loadLib().then(async ({ nlp, analyze }) => {
    const out = [];
    for (let i = 0; i < S.length; i++) {
      try { out.push(analyze(nlp, parsed[i].plain)); } catch { out.push(null); }
      if (i % 8 === 7) await new Promise(r => setTimeout(r));
      if (!alive) return;
    }
    A = out; loading = false; draw();
  }).catch(() => { loading = false; if (alive) draw(); });

  // ── 설명 풍선(단어·문장) ──
  const tip = document.createElement('div');
  tip.className = 'gram-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
  document.body.append(tip);
  let hideT = 0, pinned = null;
  const place = el => {
    const r = el.getBoundingClientRect(); tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2), innerWidth - tw - 8);
    let y = r.top - th - 10; let below = false;
    if (y < 8) { y = r.bottom + 10; below = true; }
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
    tip.classList.toggle('is-below', below);
    tip.style.setProperty('--ax', `${Math.min(Math.max(14, r.left + r.width / 2 - x), tw - 14)}px`);
  };
  const clearHl = () => host.querySelectorAll('.gw--hl').forEach(x => x.classList.remove('is-hl', 'gw--hl'));
  const hl = (si, g) => { clearHl(); if (!g) return; host.querySelectorAll(`.gw[data-s="${si}"]`).forEach(x => { const w = Number(x.dataset.w); if (w >= g.from && w <= g.to) x.classList.add('gw--hl'); }); };
  const showWord = el => {
    const si = Number(el.dataset.s), wi = Number(el.dataset.w), an = A?.[si], w = an?.words[wi];
    if (!w) return;
    const gs = w.notes.map(k => an.groups[k]).sort((a, b) => (a.to - a.from) - (b.to - b.from));
    render(tip, html`<p class="gram-tip__word"><b lang="en">${w.text}</b>${w.root && w.root !== w.text.toLowerCase() && /동사|조동사/.test(w.pos) ? html`<span class="gram-tip__root">원형 ${w.root}</span>` : ''}</p>
      <p class="gram-tip__tags">${w.pos ? html`<span class="gt-chip">${w.pos}</span>` : ''}${w.role ? html`<span class="gt-chip gt-chip--${cat(w.role) || 'x'}">${w.role}</span>` : ''}</p>
      ${gs.length ? gs.slice(0, 3).map(g => html`<div class="gram-tip__g"><b>${g.label}</b><span lang="en">“${g.text}”</span><small>${g.desc}</small></div>`) : html`<p class="gram-tip__plain">${w.role ? `문장에서 ${w.role} 역할을 해요.` : '특별한 문법 포인트는 없어요.'}</p>`}
      <p class="gram-tip__foot">자동 분석 · 틀릴 수 있어요</p>`);
    hl(si, gs[0]); place(el);
  };
  const showSentence = el => {
    const si = Number(el.dataset.sentInfo), an = A?.[si]; if (!an) return;
    render(tip, html`<p class="gram-tip__word"><b>${si + 1}번 문장</b></p>
      <dl class="gram-tip__dl"><div><dt>형식</dt><dd>${an.sentence.pattern}</dd></div><div><dt>시제·태</dt><dd>${an.sentence.tenses.join(' / ') || '-'}</dd></div><div><dt>구조</dt><dd>${an.sentence.structure}</dd></div></dl>
      ${an.groups.length ? html`<p class="gram-tip__tags">${[...new Set(an.groups.map(g => g.label.split(' (')[0].split(' · ')[0]))].slice(0, 8).map(l => html`<span class="gt-chip">${l}</span>`)}</p>` : ''}
      <p class="gram-tip__foot">'문장 분석' 을 누르면 자세히 볼 수 있어요</p>`);
    clearHl(); place(el);
  };
  const hide = () => { clearTimeout(hideT); hideT = setTimeout(() => { if (!pinned) { tip.hidden = true; clearHl(); } }, 120); };
  const over = e => {
    if (e.pointerType === 'touch') return;
    const w = e.target.closest?.('.gw[data-w]'), s = e.target.closest?.('[data-sent-info]');
    if (w && host.contains(w)) { clearTimeout(hideT); pinned = null; showWord(w); }
    else if (s && host.contains(s)) { clearTimeout(hideT); pinned = null; showSentence(s); }
  };
  const out = e => { if (e.pointerType !== 'touch' && (e.target.closest?.('.gw[data-w]') || e.target.closest?.('[data-sent-info]'))) hide(); };
  const focusIn = e => { const s = e.target.closest?.('[data-sent-info]'); if (s && host.contains(s)) showSentence(s); };
  const click = e => {
    const w = e.target.closest('.gw[data-w]'), s = e.target.closest('[data-sent-info]');
    if (w || s) { pinned = w || s; clearTimeout(hideT); w ? showWord(w) : showSentence(s); return; } // 휴대폰: 누르면 고정
    const ko = e.target.closest('[data-ko]');
    if (ko) { const si = Number(ko.dataset.ko); koOpen.has(si) ? koOpen.delete(si) : koOpen.add(si); const c = ko.closest('.sent-card'); c.outerHTML = String(card(S[si], si)); return; }
    const ana = e.target.closest('[data-ana]');
    if (ana) { const si = Number(ana.dataset.ana); anaOpen.has(si) ? anaOpen.delete(si) : anaOpen.add(si); ana.closest('.sent-card').outerHTML = String(card(S[si], si)); return; }
    const pt = e.target.closest('.sa-point');
    if (pt) { const si = Number(pt.dataset.s), g = A?.[si]?.groups[Number(pt.dataset.g)]; host.querySelectorAll('.sa-point.is-on').forEach(x => x.classList.remove('is-on')); pt.classList.add('is-on'); hl(si, g); return; }
    if (e.target.closest('[data-ko-all]')) { allKo = !allKo; if (!allKo) koOpen.clear(); draw(); return; }
  };
  const change = e => { if (e.target.name === 'ps-mode') { mode = e.target.value; draw(); } };
  const docDown = e => { if (pinned && !tip.contains(e.target) && !e.target.closest?.('.gw[data-w], [data-sent-info]')) { pinned = null; tip.hidden = true; clearHl(); } };
  const scroll = () => { if (!tip.hidden) { pinned = null; tip.hidden = true; clearHl(); } };
  host.addEventListener('pointerover', over); host.addEventListener('pointerout', out); host.addEventListener('focusin', focusIn);
  host.addEventListener('click', click); host.addEventListener('change', change);
  document.addEventListener('pointerdown', docDown, true); addEventListener('scroll', scroll, { passive: true });
  return () => {
    alive = false; tip.remove();
    host.removeEventListener('pointerover', over); host.removeEventListener('pointerout', out); host.removeEventListener('focusin', focusIn);
    host.removeEventListener('click', click); host.removeEventListener('change', change);
    document.removeEventListener('pointerdown', docDown, true); removeEventListener('scroll', scroll);
  };
}
