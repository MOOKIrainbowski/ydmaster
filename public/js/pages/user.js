import { api } from '../api.js';
import { state } from '../state.js';
import { html, render, on, skeleton, empty, errorBox, avatar, icon, fmtDate, toast } from '../ui.js';

export default {
  title: ({ username }) => `${username}님의 프로필`, auth: false,
  async render(root, { username }, _q, ctx) {
    render(root, html`<div class="page">${skeleton(5)}</div>`);
    try {
      const data = await api.get(`/p/${encodeURIComponent(username)}`);
      if (!ctx.isCurrent()) return;
      const { user, stats, recentTests } = data;
      let friendship = 'none';
      if (state.user && String(state.user.id || state.user._id) !== String(user._id)) {
        try { const friends = await api.get('/friends'); friendship = friends.some(f => String(f._id) === String(user._id)) ? 'friend' : 'none'; } catch { /* 비공개 액션은 숨김 */ }
      }
      if (!ctx.isCurrent()) return;
      render(root, html`<div class="page"><section class="section stack"><article class="card stack">
        ${user.bannerUrl ? html`<img class="profile-banner" src="${user.bannerUrl}" alt="${user.username}님의 배너">` : ''}
        <div class="btn-row">${avatar(user, 72)}<div><h1>${user.username}</h1><p class="muted">가입 ${fmtDate(user.createdAt)}</p></div>${friendship === 'none' && state.user ? html`<button class="btn btn--ghost" data-friend>친구 요청</button>` : friendship === 'friend' ? html`<span class="badge">친구</span>` : friendship === 'sent' ? html`<span class="muted">요청 보냄</span>` : ''}</div>
        <dl class="stat-row"><div><dt>시험 횟수</dt><dd>${stats.totalAttempts}</dd></div><div><dt>평균 점수</dt><dd>${stats.avgScore}%</dd></div><div><dt>공개 세트</dt><dd>${stats.totalTests}</dd></div><div><dt>친구</dt><dd>${stats.friendCount}</dd></div></dl>
      </article><section class="section"><div class="section__head"><h2 class="section__title">최근 공개 세트</h2></div>
        ${recentTests.length ? html`<div class="stack">${recentTests.map(s => html`<a class="set-card" href="#/sets/${s._id}"><div class="set-card__head"><h3 class="set-card__title">${s.title}</h3><span class="badge">${s.kind === 'passage' ? '본문' : '단어'}</span></div><div class="set-card__meta"><span>${s.count}개</span><span>${fmtDate(s.updatedAt)}</span></div></a>`)}</div>` : empty({ icon: 'book', title: '공개 세트가 없어요' })}
      </section></section></div>`);
      const off = on(root, 'click', '[data-friend]', async () => { try { await api.post('/friends/request', { toUserId: user._id }); friendship = 'sent'; toast('친구 요청을 보냈어요.', 'ok'); draw(); } catch (e) { toast(e.message, 'bad'); } });
      return off;
    } catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message)}</div>`); }
  },
};
