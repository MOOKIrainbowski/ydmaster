import { api } from '../api.js';
import { html, render, icon, skeleton, empty, errorBox, on, fmtDate } from '../ui.js';
import { startTest } from '../start.js';

export default {
  title: '홈', async render(root, _p, _q, ctx) {
    const load = async () => {
      render(root, html`<div class="page">${skeleton(4)}</div>`);
      try {
        const [stats, sets] = await Promise.all([api.get('/stats'), api.get('/sets?scope=mine&page=0')]);
        if (!ctx.isCurrent()) return;
        render(root, html`<div class="page stack">
          <section class="section"><div class="section__head"><h1 class="section__title">오늘의 학습</h1><a class="btn btn--primary btn--sm" href="#/new/vocab">${icon('plus', 16)}세트 만들기</a></div>
            <div class="stat-row"><div><strong>${stats.weekLearned || 0}</strong><span>이번 주 외운 문항</span></div><div><strong>${stats.streakDays || 0}</strong><span>연속 학습일</span></div><div><strong>${stats.wrongCount || 0}</strong><span>복습할 오답</span></div></div>
            ${stats.wrongCount ? html`<a class="btn btn--ghost" href="#/wrong">${icon('target')}오답 복습하기</a>` : ''}
          </section><section class="section"><div class="section__head"><h2 class="section__title">내 세트</h2><a href="#/explore">모두 보기</a></div>
            ${sets.items.length ? html`<div class="stack">${sets.items.slice(0, 5).map(s => html`<a class="card" href="#/sets/${s._id}"><strong>${s.title}</strong><span class="muted">${s.kind === 'passage' ? '본문' : '단어'} · ${s.count}개 · ${fmtDate(s.updatedAt)}</span></a>`)}</div>` : empty({ icon: 'book', title: '아직 만든 세트가 없어요', desc: '단어 또는 내신 본문을 추가해 학습을 시작하세요.', action: html`<div class="btn-row"><a class="btn btn--primary" href="#/new/vocab">단어 세트</a><a class="btn btn--ghost" href="#/new/passage">본문 세트</a></div>` })}
          </section></div>`);
      } catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message, 'data-retry-home')}</div>`); }
    };
    await load();
    return on(root, 'click', '[data-retry-home]', load);
  },
};
