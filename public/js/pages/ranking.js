import { api } from '../api.js';
import { html, render, on, skeleton, empty, errorBox, avatar } from '../ui.js';

export default {
  title: '랭킹', async render(root, _p, _q, ctx) {
    let scope = 'global', period = 'week', data = null, busy = false;
    const draw = () => {
      const leaders = data?.ranking?.slice(0, 3) || [];
      const rows = data?.ranking?.slice(3) || [];
      const maxLearned = Math.max(1, ...(data?.ranking || []).map(u => u.learned));
      render(root, html`<div class="page"><section class="section"><h1 class="section__title">학습 랭킹</h1><p class="muted">맞힌 서로 다른 문항 수 기준 · 주간은 월요일 00:00 KST부터 집계</p>
      <div class="field-row"><label class="field"><span class="field__label">대상</span><select class="select" name="scope"><option value="global" ${scope === 'global' ? 'selected' : ''}>전체 사용자</option><option value="friends" ${scope === 'friends' ? 'selected' : ''}>친구</option></select></label><label class="field"><span class="field__label">기간</span><select class="select" name="period"><option value="week" ${period === 'week' ? 'selected' : ''}>이번 주</option><option value="all" ${period === 'all' ? 'selected' : ''}>전체 기간</option></select></label></div>
      ${data?.me ? html`<article class="rank-me result-hero"><span class="badge">내 순위</span><strong class="rank-me__num">${data.me.rank}위</strong><p>${period === 'week' ? '이번 주' : '전체 기간'} ${data.me.learned}문항 외움</p></article>` : ''}
      ${leaders.length ? html`<ol class="podium">${leaders.map(u => html`<li class="podium__place podium__place--${u.rank}" style="--rank:${u.rank}"><span class="podium__medal">${u.rank === 1 ? '1위' : u.rank === 2 ? '2위' : '3위'}</span>${avatar(u, 64)}<a class="podium__name" href="#/u/${encodeURIComponent(u.username)}">${u.username}</a><strong class="podium__score" data-count="${u.learned}">${u.learned}</strong><span class="muted">문항 학습</span></li>`)}</ol>` : ''}
      ${rows.length ? html`<ol class="ranking-list">${rows.map(u => html`<li class="list-row"><span class="badge">${u.rank}</span>${avatar(u, 40)}<div class="list-row__main"><a class="list-row__title" href="#/u/${encodeURIComponent(u.username)}">${u.username}</a><p class="list-row__meta">${u.learned}개 학습 · 시험 ${u.attempts}회</p><span class="ranking-meter"><span style="width:${Math.max(0, Math.min(100, u.learned / maxLearned * 100))}%"></span></span></div></li>`)}</ol>` : !leaders.length ? empty({ icon: 'trophy', title: '표시할 랭킹이 없어요', desc: scope === 'friends' ? '친구와 함께 시험을 풀면 순위가 표시돼요.' : '아직 집계된 학습 기록이 없어요.' }) : ''}
    </section></div>`);
    };
    const load = async () => { if (busy) return; busy = true; render(root, html`<div class="page">${skeleton(5)}</div>`); try { data = await api.get(`/ranking?scope=${scope}&period=${period}`); if (ctx.isCurrent()) draw(); } catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message, 'data-retry-rank')}</div>`); } finally { busy = false; } };
    await load();
    const change = on(root, 'change', 'select[name]', (_e, el) => { if (busy) return; if (el.name === 'scope') scope = el.value; else period = el.value; load(); });
    const retry = on(root, 'click', '[data-retry-rank]', load);
    return () => { change(); retry(); };
  },
};
