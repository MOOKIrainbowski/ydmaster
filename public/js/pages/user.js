// 다른 사람(친구) 프로필.
// 05(2026-11-20 사용자 제보: 친구 프로필 화면 깨짐) — 고친 것:
//  - 머리줄이 btn-row(줄바꿈 버튼 줄)라 이름·가입일·친구 표시가 들쭉날쭉 → 배너 + 겹친 아바타 + 이름 줄 전용 배치
//  - 배너 사진이 없으면 아무것도 안 보여 카드 위가 비었음 → 내 정보와 같은 그라데이션 배너
//  - 사진 아바타는 크기 변수가 빠져 40px 로 줄었음(ui.js avatar 수정)
//  - 친구의 레벨·칭호·달성 업적을 함께(게임 요소)
import { api } from '../api.js';
import { state } from '../state.js';
import { html, render, on, skeleton, empty, errorBox, avatar, icon, fmtDate, toast } from '../ui.js';
import { levelBar, badge } from '../game.js';

export default {
  title: ({ username }) => `${username}님의 프로필`, auth: false,
  async render(root, { username }, _q, ctx) {
    render(root, html`<div class="page">${skeleton(5)}</div>`);
    try {
      const data = await api.get(`/p/${encodeURIComponent(username)}`);
      if (!ctx.isCurrent()) return;
      const { user, stats, recentTests, game } = data;
      const self = state.user && String(state.user.id || state.user._id) === String(user._id);
      let friendship = self ? 'self' : 'none';
      if (state.user && !self) {
        try { const friends = await api.get('/friends'); friendship = friends.some(f => String(f._id) === String(user._id)) ? 'friend' : 'none'; } catch { /* 비공개 액션은 숨김 */ }
      }
      if (!ctx.isCurrent()) return;
      const action = friendship === 'self' ? html`<a class="btn btn--ghost btn--sm" href="#/me">${icon('edit', 16)}내 정보 수정</a>`
        : friendship === 'friend' ? html`<span class="badge badge--ok">${icon('users', 14)}친구</span>`
        : state.user ? html`<button class="btn btn--primary btn--sm" data-friend>${icon('plus', 16)}친구 요청</button>` : '';
      render(root, html`<div class="page page--narrow"><section class="section stack">
        <article class="card profile-card">
          ${user.bannerUrl ? html`<img class="profile-banner" src="${user.bannerUrl}" alt="">` : html`<div class="profile-banner profile-banner--empty" aria-hidden="true"></div>`}
          <div class="profile-id">
            <span class="profile-id__avatar">${avatar(user, 88)}</span>
            <div class="profile-id__text">
              <h1 class="profile-id__name">${user.username}</h1>
              <p class="muted">가입 ${fmtDate(user.createdAt)}${game ? html` · <b class="profile-id__title">${game.title}</b>` : ''}</p>
            </div>
            <div class="profile-id__act" data-friend-slot>${action}</div>
          </div>
          ${game ? html`<div class="profile-level">${levelBar(game)}</div>` : ''}
          <dl class="stat-row"><div><dt>시험 횟수</dt><dd>${stats.totalAttempts}</dd></div><div><dt>평균 점수</dt><dd>${stats.avgScore}%</dd></div><div><dt>공개 세트</dt><dd>${stats.totalTests}</dd></div><div><dt>친구</dt><dd>${stats.friendCount}</dd></div></dl>
        </article>
        ${game ? html`<section class="section"><div class="section__head"><h2 class="section__title">달성한 업적</h2><span class="muted">${game.achievements.length} / ${game.total}</span></div>
          ${game.achievements.length ? html`<div class="ach-grid">${game.achievements.sort((a, b) => b.tier - a.tier).map(badge)}</div>` : empty({ icon: 'trophy', title: '아직 달성한 업적이 없어요' })}</section>` : ''}
        <section class="section"><div class="section__head"><h2 class="section__title">최근 공개 세트</h2></div>
          ${recentTests.length ? html`<div class="set-grid">${recentTests.map((s, i) => html`<a class="set-card reveal spotlight" style="--i:${i}" href="#/sets/${s._id}"><span class="kind-tile kind-tile--${s.kind === 'passage' ? 'passage' : 'vocab'}">${icon(s.kind === 'passage' ? 'text' : 'book', 24)}</span><div class="set-card__head"><h3 class="set-card__title">${s.title}</h3><span class="badge badge--${s.kind === 'passage' ? 'passage' : 'vocab'}">${s.kind === 'passage' ? '본문' : '단어'}</span></div><div class="set-card__meta"><span>${s.count}개</span><span>${fmtDate(s.updatedAt)}</span></div></a>`)}</div>` : empty({ icon: 'book', title: '공개 세트가 없어요' })}
        </section></section></div>`);
      return on(root, 'click', '[data-friend]', async (_e, btn) => {
        btn.disabled = true;
        try { await api.post('/friends/request', { toUserId: user._id }); render(btn.parentElement, html`<span class="muted">요청 보냄</span>`); toast('친구 요청을 보냈어요.', 'ok'); }
        catch (e) { btn.disabled = false; toast(e.message, 'bad'); }
      });
    } catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message)}</div>`); }
  },
};
