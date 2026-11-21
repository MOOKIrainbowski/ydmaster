// 프로필 보기 — 다른 사람(#/u/이름)과 내 프로필(#/me)이 같은 화면을 쓴다.
// 05: 배너 + 걸친 아바타 + 이름 줄, 레벨·업적.
// 09(2026-11-21 사용자 요청): 내 프로필과 프로필 수정 화면을 분리 — 내 프로필 카드 맨 아래 '프로필 수정' 버튼(→ #/me/edit),
//     꾸미기(프로필 색·사진 테두리·카드 테두리·칭호) 표시, 업적은 한 줄 4개만 보이고 아래 '더보기'.
import { api } from '../api.js';
import { state, setUser } from '../state.js';
import { html, render, on, skeleton, empty, errorBox, avatar, icon, fmtDate, toast } from '../ui.js';
import { levelBar, badge } from '../game.js';
import { titleTag, cardClass, frameClass } from '../cosmetics.js';

const ACH_ROW = 4;

export async function renderProfile(root, username, ctx, { self = false } = {}) {
  render(root, html`<div class="page">${skeleton(5)}</div>`);
  try {
    const data = await api.get(`/p/${encodeURIComponent(username)}`);
    if (!ctx.isCurrent()) return;
    const { user, stats, recentTests, game } = data;
    const mine = self || (state.user && String(state.user.id || state.user._id) === String(user._id));
    let friendship = mine ? 'self' : 'none';
    if (state.user && !mine) {
      try { const friends = await api.get('/friends'); friendship = friends.some(f => String(f._id) === String(user._id)) ? 'friend' : 'none'; } catch { /* 비공개 액션은 숨김 */ }
    }
    if (!ctx.isCurrent()) return;
    const cos = user.cosmetics || {};
    const action = mine ? ''
      : friendship === 'friend' ? html`<span class="badge badge--ok">${icon('users', 14)}친구</span>`
      : state.user ? html`<button class="btn btn--primary btn--sm" data-friend>${icon('plus', 16)}친구 요청</button>` : '';
    const ach = (game?.achievements || []).sort((a, b) => b.tier - a.tier);
    render(root, html`<div class="page page--narrow"><section class="section stack">
      <article class="card profile-card ${cardClass(cos)}">
        ${user.bannerUrl ? html`<img class="profile-banner" src="${user.bannerUrl}" alt="">` : html`<div class="profile-banner profile-banner--empty" aria-hidden="true"></div>`}
        <div class="profile-id">
          <span class="profile-id__avatar ${frameClass(cos)}">${avatar(user, 88)}</span>
          <div class="profile-id__text">
            <div class="profile-id__nameline"><h1 class="profile-id__name">${user.username}</h1>${cos.title ? titleTag(cos.title, { small: true }) : ''}</div>
            <p class="muted">가입 ${fmtDate(user.createdAt)}${game ? html` · Lv.${game.level} <b class="profile-id__title">${game.title}</b>` : ''}</p>
          </div>
          <div class="profile-id__act" data-friend-slot>${action}</div>
        </div>
        ${game ? html`<div class="profile-level">${levelBar(game)}</div>` : ''}
        <dl class="stat-row"><div><dt>시험 횟수</dt><dd>${stats.totalAttempts}</dd></div><div><dt>평균 점수</dt><dd>${stats.avgScore}%</dd></div><div><dt>공개 세트</dt><dd>${stats.totalTests}</dd></div><div><dt>친구</dt><dd>${stats.friendCount}</dd></div></dl>
        ${mine ? html`<div class="profile-foot"><span class="muted">사진·이름·꾸미기·비밀번호는 프로필 수정에서 바꿔요.</span><a class="btn btn--primary btn--icon" href="#/me/edit" aria-label="프로필 수정" title="프로필 수정">${icon('edit', 20)}</a></div>` : ''}
      </article>
      ${game ? html`<section class="section profile-ach"><div class="section__head"><h2 class="section__title">달성한 업적</h2><span class="muted">${ach.length} / ${game.total}</span></div>
        ${ach.length ? html`<div class="ach-grid">${ach.map((a, i) => i < ACH_ROW ? badge(a) : html`<div hidden data-ach-more>${badge(a)}</div>`)}</div>
          ${ach.length > ACH_ROW ? html`<button class="quest-more" type="button" data-ach-more-btn>${icon('chevronDown', 16)}<span>더보기 (${ach.length - ACH_ROW}개 더)</span></button>` : ''}`
        : empty({ icon: 'trophy', title: '아직 달성한 업적이 없어요' })}</section>` : ''}
      ${mine ? html`<section class="section"><div class="section__head"><h2 class="section__title">내 메뉴</h2></div>
        <nav class="profile-menu" aria-label="내 메뉴">
          <a class="list-row" href="#/history">${icon('clock')}학습 기록</a><a class="list-row" href="#/friends">${icon('users')}친구</a>
          <a class="list-row" href="#/notice">${icon('bell')}공지사항</a><a class="list-row" href="#/inquiry">${icon('chat')}문의하기</a>
          <a class="list-row" href="#/settings">${icon('settings')}설정</a><a class="list-row" href="#/guide">${icon('lightbulb')}가이드</a>
          ${state.user?.isAdmin ? html`<a class="list-row" href="#/admin">${icon('shield')}관리자</a>` : ''}
          <a class="list-row" href="/privacy.html">${icon('info')}개인정보처리방침</a>
          <button class="list-row list-row--danger" type="button" data-logout>${icon('logout')}로그아웃</button>
        </nav></section>` : ''}
      <section class="section"><div class="section__head"><h2 class="section__title">${mine ? '내 공개 세트' : '최근 공개 세트'}</h2></div>
        ${recentTests.length ? html`<div class="set-grid">${recentTests.map((s, i) => html`<a class="set-card reveal spotlight" style="--i:${i}" href="#/sets/${s._id}"><span class="kind-tile kind-tile--${s.kind === 'passage' ? 'passage' : 'vocab'}">${icon(s.kind === 'passage' ? 'text' : 'book', 24)}</span><div class="set-card__head"><h3 class="set-card__title">${s.title}</h3><span class="badge badge--${s.kind === 'passage' ? 'passage' : 'vocab'}">${s.kind === 'passage' ? '본문' : '단어'}</span></div><div class="set-card__meta"><span>${s.count}개</span><span>${fmtDate(s.updatedAt)}</span></div></a>`)}</div>` : empty({ icon: 'book', title: '공개 세트가 없어요' })}
      </section></section></div>`);
    const offs = [
      on(root, 'click', '[data-friend]', async (_e, btn) => {
        btn.disabled = true;
        try { await api.post('/friends/request', { toUserId: user._id }); render(btn.parentElement, html`<span class="muted">요청 보냄</span>`); toast('친구 요청을 보냈어요.', 'ok'); }
        catch (e) { btn.disabled = false; toast(e.message, 'bad'); }
      }),
      // 업적 더보기: 누를 때마다 한 줄(4개)씩 두 줄, 다 펼치면 접기
      on(root, 'click', '[data-ach-more-btn]', (_e, b) => {
        const hidden = [...root.querySelectorAll('[data-ach-more][hidden]')];
        if (hidden.length) hidden.slice(0, ACH_ROW * 2).forEach(x => { x.hidden = false; x.firstElementChild?.classList.add('is-pop'); });
        else { root.querySelectorAll('[data-ach-more]').forEach(x => { x.hidden = true; }); b.closest('.profile-ach').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        const left = root.querySelectorAll('[data-ach-more][hidden]').length;
        render(b, left ? html`${icon('chevronDown', 16)}<span>더보기 (${left}개 더)</span>` : html`${icon('chevronUp', 16)}<span>접기</span>`);
      }),
      on(root, 'click', '[data-logout]', () => { setUser(null, null); location.hash = '#/login'; }),
    ];
    return () => offs.forEach(f => f());
  } catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message)}</div>`); }
}

export default {
  title: ({ username }) => `${username}님의 프로필`, auth: false,
  render(root, { username }, _q, ctx) { return renderProfile(root, username, ctx); },
};
