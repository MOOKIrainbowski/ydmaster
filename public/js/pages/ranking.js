import { api } from '../api.js';
import { html, render, on, skeleton, empty, errorBox, avatar } from '../ui.js';

export default {
  title: '랭킹', async render(root, _p, _q, ctx) {
    let scope = 'global', period = 'week', data = null, busy = false;
    const draw = () => render(root, html`<div class="page"><section class="section"><h1 class="section__title">학습 랭킹</h1><p class="muted">맞힌 서로 다른 문항 수 기준 · 주간은 월요일 00:00 KST부터 집계</p>
      <div class="field-row"><label class="field"><span class="field__label">대상</span><select class="select" name="scope"><option value="global" ${scope === 'global' ? 'selected' : ''}>전체 사용자</option><option value="friends" ${scope === 'friends' ? 'selected' : ''}>친구</option></select></label><label class="field"><span class="field__label">기간</span><select class="select" name="period"><option value="week" ${period === 'week' ? 'selected' : ''}>이번 주</option><option value="all" ${period === 'all' ? 'selected' : ''}>전체 기간</option></select></label></div>
      ${data?.me ? html`<article class="card section"><strong>내 순위 · ${data.me.rank}위</strong><span>${data.me.learned}개 학습</span></article>` : ''}
      ${data?.ranking?.length ? html`<ol class="stack">${data.ranking.map(u => html`<li class="list-row"><span class="badge">${u.rank}</span>${avatar(u, 40)}<div class="list-row__main"><a class="list-row__title" href="#/u/${encodeURIComponent(u.username)}">${u.username}</a><p class="list-row__meta">${u.learned}개 학습 · 시험 ${u.attempts}회</p></div></li>`)}</ol>` : empty({ icon: 'trophy', title: '표시할 랭킹이 없어요', desc: scope === 'friends' ? '친구와 함께 시험을 풀면 순위가 표시돼요.' : '아직 집계된 학습 기록이 없어요.' })}
    </section></div>`);
    const load = async () => { if (busy) return; busy = true; render(root, html`<div class="page">${skeleton(5)}</div>`); try { data = await api.get(`/ranking?scope=${scope}&period=${period}`); if (ctx.isCurrent()) draw(); } catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message, 'data-retry-rank')}</div>`); } finally { busy = false; } };
    await load();
    const change = on(root, 'change', 'select[name]', (_e, el) => { if (busy) return; if (el.name === 'scope') scope = el.value; else period = el.value; load(); });
    const retry = on(root, 'click', '[data-retry-rank]', load);
    return () => { change(); retry(); };
  },
};
