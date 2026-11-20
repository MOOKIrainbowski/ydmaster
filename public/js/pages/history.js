import { api } from '../api.js';
import { html, render, on, skeleton, empty, errorBox, fmtDate } from '../ui.js';

export default {
  title: '학습 기록', async render(root, _p, _q, ctx) {
    let page = 0, items = [], more = false, busy = false;
    const draw = () => render(root, html`<div class="page"><section class="section"><h1 class="section__title">시험 기록</h1>
      ${items.length ? html`<div class="stack">${items.map(r => html`<a class="list-row card" href="#/result/${r._id}"><div class="list-row__main"><p class="list-row__title">${r.title || '학습 시험'}</p><p class="list-row__meta">${r.modeLabel} · ${fmtDate(r.createdAt)} · ${r.correct}/${r.total} 정답</p></div><span class="badge">${r.percentage}%</span></a>`)}</div>${more ? html`<button class="btn btn--ghost btn--block" data-more>더 보기</button>` : ''}` : empty({ icon: 'clock', title: '아직 시험 기록이 없어요', desc: '세트를 학습하면 결과가 여기에 저장됩니다.' })}
    </section></div>`);
    const load = async (append = false) => {
      if (busy) return; busy = true;
      try { const r = await api.get(`/results?page=${page}`); if (!ctx.isCurrent()) return; items = append ? [...items, ...r.items] : r.items; more = r.hasMore; draw(); }
      catch (e) { if (ctx.isCurrent() && append) { page--; } else if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message, 'data-retry-history')}</div>`); }
      finally { busy = false; }
    };
    render(root, html`<div class="page">${skeleton(4)}</div>`); await load();
    const off = on(root, 'click', '[data-more]', () => { if (busy) return; page++; load(true); });
    const retry = on(root, 'click', '[data-retry-history]', () => load());
    return () => { off(); retry(); };
  },
};
