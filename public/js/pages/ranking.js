// 랭킹 — 07(2026-11-21 사용자 요청): 1·2·3위 시상대(해당 순위가 없으면 그 단은 비워 둠), 4위부터는 아래 목록.
// 순위 기준은 서버(R9): 기간 안에 맞힌 서로 다른 문항 수.
import { api } from '../api.js';
import { state } from '../state.js';
import { html, render, on, skeleton, empty, errorBox, avatar, icon } from '../ui.js';

const PLACE = { 1: '금', 2: '은', 3: '동' };

export default {
  title: '랭킹', async render(root, _p, _q, ctx) {
    let scope = 'global', period = 'week', data = null, busy = false;
    const meId = () => String(state.user?.id || state.user?._id || '');
    const seg = (name, value, opts) => html`<div class="seg seg--sm" role="radiogroup" aria-label="${name === 'scope' ? '대상' : '기간'}">${opts.map(([v, label]) => html`
      <label class="seg__opt"><input type="radio" name="${name}" value="${v}" ${v === value ? 'checked' : ''}><span>${label}</span></label>`)}</div>`;

    // 시상대 한 단: 사람이 있으면 아바타·이름·점수, 없으면 빈 자리
    const step = (rank, u) => html`<li class="podium-step podium-step--${rank}${u ? '' : ' is-empty'}${u && String(u._id) === meId() ? ' is-me' : ''}">
      <div class="podium-step__who">
        ${rank === 1 ? html`<span class="podium-step__crown" aria-hidden="true">${icon('trophy', 26)}</span>` : ''}
        ${u ? html`<span class="podium-step__avatar">${avatar(u, rank === 1 ? 84 : 68)}</span>
          <a class="podium-step__name" href="#/u/${encodeURIComponent(u.username)}">${u.username}</a>
          <span class="podium-step__score"><b data-count="${u.learned}">${u.learned}</b>문항</span>`
        : html`<span class="podium-step__ghost" aria-hidden="true">?</span><span class="podium-step__name muted">비어 있음</span><span class="podium-step__score muted">도전해 보세요</span>`}
      </div>
      <div class="podium-step__block"><span class="podium-step__rank">${rank}</span><span class="podium-step__medal">${PLACE[rank]}</span></div>
      <span class="sr-only">${rank}위${u ? ` ${u.username} ${u.learned}문항` : ' 비어 있음'}</span>
    </li>`;

    const draw = () => {
      const list = data?.ranking || [];
      const at = r => list.find(u => u.rank === r);
      const rows = list.filter(u => u.rank > 3);
      const top = Math.max(1, ...list.map(u => u.learned));
      render(root, html`<div class="page"><section class="section">
        <div class="section__head"><div><h1 class="section__title">학습 랭킹</h1><p class="muted">맞힌 서로 다른 문항 수 기준 · 주간은 월요일 00:00 KST부터 집계</p></div></div>
        <div class="rank-filters">${seg('scope', scope, [['global', '전체 사용자'], ['friends', '친구']])}${seg('period', period, [['week', '이번 주'], ['all', '전체 기간']])}</div>
        ${data?.me ? html`<article class="rank-me result-hero"><span class="badge">내 순위</span><strong class="rank-me__num">${data.me.rank}위</strong><p>${period === 'week' ? '이번 주' : '전체 기간'} ${data.me.learned}문항 외움</p></article>` : ''}
        <ol class="podium-stage" aria-label="1~3위 시상대">${[2, 1, 3].map(r => step(r, at(r)))}</ol>
        ${rows.length ? html`<h2 class="rank-list__title">4위부터</h2>
          <ol class="rank-list">${rows.map(u => html`<li class="rank-row${String(u._id) === meId() ? ' is-me' : ''}">
            <span class="rank-row__num">${u.rank}</span>${avatar(u, 40)}
            <div class="rank-row__main"><a class="rank-row__name" href="#/u/${encodeURIComponent(u.username)}">${u.username}${String(u._id) === meId() ? html` <span class="badge">나</span>` : ''}</a>
              <span class="ranking-meter"><span style="width:${Math.max(2, Math.min(100, (u.learned / top) * 100))}%"></span></span></div>
            <span class="rank-row__score"><b>${u.learned}</b>문항<small>시험 ${u.attempts}회</small></span></li>`)}</ol>`
        : !list.length ? empty({ icon: 'trophy', title: '아직 순위가 없어요', desc: scope === 'friends' ? '친구와 함께 시험을 풀면 시상대에 올라가요.' : '이번 기간에 시험을 풀면 시상대에 올라갈 수 있어요.' }) : ''}
      </section></div>`);
    };
    const load = async () => { if (busy) return; busy = true; render(root, html`<div class="page">${skeleton(5)}</div>`); try { data = await api.get(`/ranking?scope=${scope}&period=${period}`); if (ctx.isCurrent()) draw(); } catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message, 'data-retry-rank')}</div>`); } finally { busy = false; } };
    await load();
    const change = on(root, 'change', 'input[name=scope], input[name=period]', (_e, el) => { if (busy) return; if (el.name === 'scope') scope = el.value; else period = el.value; load(); });
    const retry = on(root, 'click', '[data-retry-rank]', load);
    return () => { change(); retry(); };
  },
};
