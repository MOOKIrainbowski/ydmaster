// 가이드 — 18(2026-11-23 사용자 요청: aimonsite 처럼 튜토리얼이 화면을 직접 하나하나 짚으며 설명).
// 예전(05)에는 장마다 긴 글을 읽고 '읽었어요' 를 눌렀다. 이제 장마다 '투어 시작' → 실제 화면으로 데려가 스포트라이트로 짚으며 설명(tour.js),
// 끝까지 보면 가이드 퀘스트 보상(+5 XP, 장마다 한 번 — 서버 guide_<장> 퀘스트 그대로).
// 주소 #/guide?ch=<장> 으로 들어오면 그 장 투어를 바로 시작(퀘스트 '하러 가기' 링크).
import { api } from '../api.js';
import { state } from '../state.js';
import { html, render, on, icon, toast } from '../ui.js';
import { GUIDE_TITLES, reportQuest } from '../game.js';
import { startTour } from '../tour.js';
import { TOURS } from '../tours.js';

const META = {
  start: ['home', '메인 버튼 · 세트 만들기 · 둘러보기 · 내 정보까지 화면 구성을 한 바퀴'],
  vocab: ['book', '단어 세트를 만드는 세 가지 방법(한 개씩 · 붙여넣기 · 파일)'],
  passage: ['text', '본문 붙여넣기 · 핵심 표현 · 어법 고르기 보기 만들기'],
  test: ['play', '시험 설정 창의 방식 · 문항 수 · 진행 방식'],
  wrong: ['review', '틀린 문항만 모아 다시 풀기'],
  cards: ['cards', '학습 카드 · 목록 보기 · 본문 세트의 문장 카드와 한 문장씩'],
  game: ['trophy', '경험치 · 레벨 · 퀘스트 · 업적과 꾸미기'],
  social: ['users', '랭킹 · 친구 · 세트 공유'],
};
const ORDER = Object.keys(TOURS);

// 장 하나 투어 → 끝까지 보면 보상(로그인 + 아직 안 받았을 때)
export async function runChapter(id, done = new Set()) {
  const finished = await startTour(TOURS[id], { title: GUIDE_TITLES[id] });
  if (!finished) return false;
  try { localStorage.setItem('ydm_tour_start', '1'); } catch { /* 사생활 모드 */ }
  if (state.user && !done.has(id)) { const r = await reportQuest(`guide_${id}`, document.getElementById('main')); if (r && !r.already) toast(`가이드 퀘스트 완료 +${r.xp} XP`, 'ok'); }
  return true;
}

export default {
  title: '가이드', auth: false,
  async render(root, _p, query, ctx) {
    let done = new Set();
    if (state.user) {
      try { const r = await api.get('/quests'); done = new Set(r.quests.filter(q => q.group === 'guide' && q.status === 'claimed').map(q => q.desc)); } catch { /* 보상 표시 없이 */ }
      if (!ctx.isCurrent()) return;
    }
    render(root, html`<div class="page guide"><section class="section">
      <div class="section__head"><div><h1 class="section__title">가이드</h1><p class="muted">투어를 시작하면 실제 화면으로 데려가 하나씩 짚으며 설명해요. 끝까지 보면 장마다 +5 XP.</p></div>
        <span class="badge">${done.size} / ${ORDER.length} 완료</span></div>
      <div class="guide-grid">${ORDER.map((id, i) => html`<article class="card guide-ch reveal" style="--i:${i}">
        <span class="guide-ch__icon">${icon(META[id][0], 22)}</span>
        <div class="guide-ch__main"><p class="guide-ch__kicker">${i + 1}장 · ${TOURS[id].length}단계${done.has(id) ? html` · <span class="guide-ch__done">${icon('check', 13)}완료</span>` : ''}</p>
          <h2 class="guide-ch__title">${GUIDE_TITLES[id]}</h2><p class="guide-ch__desc">${META[id][1]}</p></div>
        <button class="btn ${done.has(id) ? 'btn--ghost' : 'btn--primary'} btn--sm" type="button" data-tour-ch="${id}">${icon('play', 16)}${done.has(id) ? '다시 보기' : '투어 시작'}</button>
      </article>`)}</div>
      <p class="g-tip">${icon('lightbulb', 18)}<span>투어 중에는 → / Enter 로 다음, ← 로 이전, Esc 로 끝내요.</span></p>
    </section></div>`);
    if (ORDER.includes(query.ch)) setTimeout(() => runChapter(query.ch, done), 300);
    return on(root, 'click', '[data-tour-ch]', (_e, b) => runChapter(b.dataset.tourCh, done));
  },
};
