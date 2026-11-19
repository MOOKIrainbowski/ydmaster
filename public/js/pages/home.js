import { api } from '../api.js';
import { state } from '../state.js';
import { startTest } from '../start.js';
import { html, render, icon, skeleton, empty, errorBox, on, fmtDate } from '../ui.js';

export default {
  title: '홈', async render(root, _p, _q, ctx) {
    let latest;
    const load = async () => {
      render(root, html`<div class="page">${skeleton(4)}</div>`);
      try {
        const [stats, sets] = await Promise.all([api.get('/stats'), api.get('/sets?scope=mine&page=0')]);
        if (!ctx.isCurrent()) return;
        latest = sets.items[0];
        render(root, html`<div class="page stack">
          <section class="section">
            <div class="section__head"><div><p class="muted">반가워요, ${state.user?.username || '학습자'}님</p><h1 class="section__title">오늘도 한 걸음</h1></div><div class="btn-row"><a class="btn btn--primary btn--sm" href="#/new/vocab">${icon('plus', 16)}단어 세트</a><a class="btn btn--ghost btn--sm" href="#/new/passage">본문 세트</a></div></div>
            <div class="bento">
              <article class="bento__cell bento__cell--span-8 result-hero reveal" style="--i:0"><span class="badge">오늘의 학습</span><h2>배운 만큼, 실력이 자라요</h2><p class="text-grad">작은 반복이 큰 자신감이 됩니다</p>${latest ? html`<button class="btn btn--primary" data-continue>이어서 학습 ${icon('chevronRight', 18)}</button>` : html`<a class="btn btn--primary" href="#/explore">세트 둘러보기 ${icon('chevronRight', 18)}</a>`}</article>
              <article class="bento__cell bento__cell--span-4 reveal" style="--i:1"><div class="metric__icon metric__icon--streak" aria-hidden="true">${icon('flame', 22)}</div><p class="metric" data-count="${stats.streakDays || 0}">${stats.streakDays || 0}</p><p class="metric__label">일 연속 학습</p></article>
              <article class="bento__cell bento__cell--span-6 reveal" style="--i:2"><div class="metric__icon" aria-hidden="true">${icon('book', 22)}</div><p class="metric" data-count="${stats.weekLearned || 0}">${stats.weekLearned || 0}</p><p class="metric__label">이번 주 외운 문항</p></article>
              <a class="bento__cell bento__cell--span-6 reveal" style="--i:3" href="#/wrong"><div class="metric__icon">${icon('target', 22)}</div><p class="metric" data-count="${stats.wrongCount || 0}">${stats.wrongCount || 0}</p><p class="metric__label">복습할 오답 · 바로 복습하기</p></a>
            </div>
          </section><section class="section"><div class="section__head"><h2 class="section__title">내 세트</h2><a href="#/explore?scope=mine">모두 보기</a></div>
            ${sets.items.length ? html`<div class="set-grid">${sets.items.slice(0, 6).map((s, i) => html`<a class="set-card reveal spotlight" style="--i:${i}" href="#/sets/${s._id}"><span class="kind-tile kind-tile--${s.kind === 'passage' ? 'passage' : 'vocab'}">${icon(s.kind === 'passage' ? 'text' : 'book', 24)}</span><div class="set-card__head"><h3 class="set-card__title">${s.title}</h3><span class="badge badge--${s.kind === 'passage' ? 'passage' : 'vocab'}">${s.kind === 'passage' ? '본문' : '단어'}</span></div><div class="set-card__meta"><span>${s.count}개</span><span>${fmtDate(s.updatedAt)}</span></div></a>`)}</div>` : empty({ icon: 'book', title: '아직 만든 세트가 없어요', desc: '단어 또는 내신 본문을 추가해 학습을 시작하세요.', action: html`<div class="btn-row"><a class="btn btn--primary" href="#/new/vocab">단어 세트</a><a class="btn btn--ghost" href="#/new/passage">본문 세트</a></div>` })}
          </section></div>`);
      } catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message, 'data-retry-home')}</div>`); }
    };
    await load();
    const offs = [on(root, 'click', '[data-retry-home]', load), on(root, 'click', '[data-continue]', () => latest && startTest({ setIds: [latest._id], kind: latest.kind }))];
    return () => offs.forEach(off => off());
  },
};
