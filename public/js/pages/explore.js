import { api } from '../api.js';
import { html, render, skeleton, empty, errorBox, on, icon, avatar } from '../ui.js';

export default {
  title: '세트 둘러보기', async render(root, _p, query, ctx) {
    let scope = ['fav', 'mine'].includes(query.scope) ? query.scope : 'explore';
    let kind = '', sort = 'popular', term = '', page = 0, items = [], more = false, busy = false;
    const load = async (append = false) => {
      if (busy) return; busy = true;
      if (!append) { page = 0; render(root, html`<div class="page">${skeleton(5)}</div>`); }
      try {
        const qs = new URLSearchParams({ scope, page: String(page), kind, q: term, sort: sort === 'new' ? 'new' : 'popular' });
        const r = await api.get('/sets?' + qs);
        if (!ctx.isCurrent()) return;
        items = append ? [...items, ...r.items] : r.items; more = r.hasMore;
        draw();
      } catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message, 'data-retry-list')}</div>`); }
      finally { busy = false; }
    };
    const draw = () => {
      const cards = items.map(s => html`<a class="card" href="#/sets/${s._id}">
        <div class="section__head"><strong>${s.title}</strong><span class="muted">${s.kind === 'passage' ? '본문' : '단어'} · ${s.count}개</span></div>
        <p class="muted">${s.description || ''}</p><div class="btn-row">${avatar(s.author, 28)}<span>${s.author?.username || '사용자'}</span><span class="muted">${icon('play', 16)} ${s.playCount || 0}</span></div>
      </a>`);
      render(root, html`<div class="page stack"><section class="section"><h1 class="section__title">학습 세트</h1>
      <div class="tabs">${[['explore','둘러보기'],['fav','즐겨찾기'],['mine','내 세트']].map(([s,l]) => html`<button class="tabs__tab${scope === s ? ' is-active' : ''}" data-scope="${s}">${l}</button>`)}</div>
      <form class="field-row" data-search><label class="field"><span class="field__label">세트 검색</span><input class="input" name="q" value="${term}" placeholder="세트 제목"></label>
        <label class="field"><span class="field__label">종류</span><select class="select" name="kind"><option value="">전체</option><option value="vocab" ${kind === 'vocab' ? 'selected' : ''}>단어</option><option value="passage" ${kind === 'passage' ? 'selected' : ''}>본문</option></select></label>
        <label class="field"><span class="field__label">정렬</span><select class="select" name="sort"><option value="popular" ${sort === 'popular' ? 'selected' : ''}>인기순</option><option value="new" ${sort === 'new' ? 'selected' : ''}>최신순</option></select></label><button class="btn btn--primary">검색</button></form>
      ${items.length ? html`<div class="stack">${cards}</div>${more ? html`<button class="btn btn--ghost btn--block" data-more>더 보기</button>` : ''}` : empty({ icon: scope === 'fav' ? 'star' : 'compass', title: '세트가 없어요', desc: '검색 조건을 바꾸거나 새 세트를 만들어보세요.' })}
      </section></div>`);
    };
    await load();
    const off = on(root, 'click', '[data-scope]', (_e, el) => { scope = el.dataset.scope; load(); });
    const off2 = on(root, 'click', '[data-more]', () => { page++; load(true); });
    const off3 = on(root, 'click', '[data-retry-list]', () => load());
    const off4 = on(root, 'submit', '[data-search]', (e, form) => { e.preventDefault(); const f = new FormData(form); term = f.get('q').trim(); kind = f.get('kind'); sort = f.get('sort'); load(); });
    return () => [off, off2, off3, off4].forEach(fn => fn());
  },
};
