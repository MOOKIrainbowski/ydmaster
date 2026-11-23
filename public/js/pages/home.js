import { api } from '../api.js';
import { state } from '../state.js';
import { startTest } from '../start.js';
import { html, render, icon, skeleton, empty, errorBox, on, fmtDate } from '../ui.js';
import { levelBar, achBoard, bindAchBoard, questBoard, claimQuest, bindQuestMore } from '../game.js';

export default {
  title: '홈', async render(root, _p, _q, ctx) {
    let latest, achList = [];
    const load = async () => {
      render(root, html`<div class="page">${skeleton(4)}</div>`);
      try {
        const [stats, sets, qs] = await Promise.all([api.get('/stats'), api.get('/sets?scope=mine&page=0'), api.get('/quests').catch(() => null)]);
        achList = stats.game?.achievements || [];
        if (!ctx.isCurrent()) return;
        latest = stats.recent || sets.items[0]; // 14: 가장 최근에 공부한 세트, 기록이 없으면 최근 만든 세트
        render(root, html`<div class="page stack">
          <section class="section">
            <div class="bento">
              <article class="bento__cell bento__cell--span-8 result-hero reveal" style="--i:0"><span class="badge">오늘의 학습</span><p class="hero-greeting">반가워요, ${state.user?.username || '학습자'}님</p><h1>${latest?.title || '첫 세트를 만들어 볼까요?'}</h1>${latest ? html`<p class="hero-meta">${latest.kind === 'passage' ? '본문' : '단어'} 세트 · ${latest.count}개 학습 항목</p><div class="btn-row"><a class="btn btn--primary" href="#/sets/${latest._id}">이어서 학습 ${icon('chevronRight', 18)}</a><button class="btn btn--ghost" data-continue>${icon('play', 18)}바로 시험</button><a class="btn btn--ghost" href="#/new/vocab">단어 세트 만들기</a><a class="btn btn--ghost" href="#/new/passage">본문 세트 만들기</a></div>` : html`<p class="hero-meta">오늘 배울 단어와 본문을 추가하고 학습을 시작하세요.</p><div class="btn-row"><a class="btn btn--primary" href="#/new/vocab">단어 세트 만들기</a><a class="btn btn--ghost" href="#/new/passage">본문 세트 만들기</a></div>`}${stats.game ? levelBar(stats.game) : ''}</article>
              <article class="bento__cell bento__cell--span-4 reveal" style="--i:1"><div class="metric__icon metric__icon--streak" aria-hidden="true">${icon('flame', 22)}</div><p class="metric" data-count="${stats.streakDays || 0}">${stats.streakDays || 0}</p><p class="metric__label">일 연속 학습</p><p class="metric__help">${stats.streakDays ? '꾸준히 이어가고 있어요.' : '오늘 시험을 보면 1일째!'}</p></article>
              <article class="bento__cell bento__cell--span-6 reveal" style="--i:2"><div class="metric__icon metric__icon--learned" aria-hidden="true">${icon('check', 22)}</div><p class="metric" data-count="${stats.weekLearned || 0}">${stats.weekLearned || 0}</p><p class="metric__label">이번 주 외운 문항</p><p class="metric__help">이번 주에 맞힌 서로 다른 문항이에요.</p></article>
              <a class="bento__cell bento__cell--span-6 reveal" style="--i:3" href="#/wrong"><div class="metric__icon metric__icon--wrong">${icon('target', 22)}</div><p class="metric" data-count="${stats.wrongCount || 0}">${stats.wrongCount || 0}</p><p class="metric__label">복습할 오답</p><p class="metric__help">${stats.wrongCount ? '바로 복습하기 →' : '복습할 오답이 없어요.'}</p></a>
            </div>
          </section>
          ${qs ? html`<section class="section"><div class="section__head"><h2 class="section__title">퀘스트</h2><a href="#/guide">가이드 보기</a></div><div data-quests>${questBoard(qs.quests, ['daily', 'weekly', 'start'])}</div></section>` : ''}
          <section class="section"><div class="section__head"><h2 class="section__title">내 세트</h2><a href="#/explore?scope=mine">모두 보기</a></div>
            ${sets.items.length ? html`<div class="set-grid">${sets.items.slice(0, 6).map((s, i) => html`<a class="set-card reveal spotlight" style="--i:${i}" href="#/sets/${s._id}"><span class="kind-tile kind-tile--${s.kind === 'passage' ? 'passage' : 'vocab'}">${icon(s.kind === 'passage' ? 'text' : 'book', 24)}</span><div class="set-card__head"><h3 class="set-card__title">${s.title}</h3><span class="badge badge--${s.kind === 'passage' ? 'passage' : 'vocab'}">${s.kind === 'passage' ? '본문' : '단어'}</span></div><div class="set-card__meta"><span>${s.count}개</span><span>${fmtDate(s.updatedAt)}</span></div></a>`)}</div>` : empty({ icon: 'book', title: '아직 만든 세트가 없어요', desc: '단어 또는 내신 본문을 추가해 학습을 시작하세요.', action: html`<div class="btn-row"><a class="btn btn--primary" href="#/new/vocab">단어 세트</a><a class="btn btn--ghost" href="#/new/passage">본문 세트</a></div>` })}
          </section>
          ${stats.game ? html`<section class="section"><div class="section__head"><h2 class="section__title">업적</h2><span class="muted">달성 ${stats.game.achievements.filter(a => a.got).length}개</span></div>
            ${achBoard(stats.game.achievements)}</section>` : ''}</div>`);
      } catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message, 'data-retry-home')}</div>`); }
    };
    await load();
    const offs = [bindAchBoard(root, () => achList), bindQuestMore(root),
      on(root, 'click', '[data-claim]', async (_e, b) => {
        b.disabled = true;
        const r = await claimQuest(b.dataset.claim, b);
        if (!r) { b.disabled = false; return; }
        // 목록·레벨 막대 다시(서버 기준)
        const [qs, st] = await Promise.all([api.get('/quests'), api.get('/stats')]);
        if (!ctx.isCurrent()) return;
        const box = root.querySelector('[data-quests]'); if (box) render(box, questBoard(qs.quests, ['daily', 'weekly', 'start']));
        const lv = root.querySelector('[data-lvbar]'); if (lv && st.game) lv.outerHTML = String(levelBar(st.game));
      }),
      on(root, 'click', '[data-retry-home]', load), on(root, 'click', '[data-continue]', () => latest && startTest({ setIds: [latest._id], kind: latest.kind, info: { title: latest.title, count: latest.count } }))];
    return () => offs.forEach(off => off());
  },
};
