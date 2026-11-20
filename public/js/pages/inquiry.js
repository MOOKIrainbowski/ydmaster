import { api } from '../api.js';
import { state } from '../state.js';
import { html, render, on, skeleton, empty, errorBox, toast, fmtDate } from '../ui.js';

export default {
  title: '문의하기', async render(root, _p, _q, ctx) {
    let tab = 'mine', mine = [], publicItems = [];
    const load = async () => { render(root, html`<div class="page">${skeleton(5)}</div>`); try { [mine, publicItems] = await Promise.all([api.get('/inquiries/mine'), api.get('/inquiries')]); if (ctx.isCurrent()) draw(); } catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message, 'data-retry-inquiry')}</div>`); } };
    const liked = i => i.likes?.some(x => String(x?._id || x) === String(state.user?.id || state.user?._id));
    const list = rows => rows.length ? html`<div class="stack">${rows.map(i => html`<article class="card stack"><div class="section__head"><div><h2 class="section__title">${i.title}</h2><p class="muted">${i.user?.username || (String(i.user) === String(state.user?.id) ? state.user?.username : '나')} · ${fmtDate(i.createdAt)}</p></div><button class="btn btn--ghost btn--sm" data-like="${i._id}" aria-pressed="${liked(i)}">${liked(i) ? '좋아요 취소' : '좋아요'} ${i.likes?.length || 0}</button></div><p class="pre-line">${i.content}</p>${i.answer ? html`<div class="card"><strong>관리자 답변</strong><p class="pre-line">${i.answer}</p></div>` : html`<span class="badge">답변 대기</span>`}</article>`)}</div>` : empty({ icon: 'chat', title: '문의가 없어요' });
    const draw = () => render(root, html`<div class="page page--narrow"><section class="section stack"><h1 class="section__title">문의하기</h1><form class="card stack" data-create><label class="field"><span class="field__label">제목</span><input class="input" name="title" maxlength="100" required></label><label class="field"><span class="field__label">문의 내용</span><textarea class="input" name="content" maxlength="2000" required></textarea></label><button class="btn btn--primary">문의 등록</button></form>
      <div class="tabs" role="tablist"><button class="tabs__tab${tab === 'mine' ? ' is-active' : ''}" data-tab="mine">내 문의 ${mine.length}</button><button class="tabs__tab${tab === 'public' ? ' is-active' : ''}" data-tab="public">커뮤니티</button></div>${list(tab === 'mine' ? mine : publicItems)}</section></div>`);
    await load();
    const offs = [on(root, 'click', '[data-retry-inquiry]', load), on(root, 'click', '[data-tab]', (_e, el) => { tab = el.dataset.tab; draw(); }),
      on(root, 'submit', '[data-create]', async (e, form) => { e.preventDefault(); const f = new FormData(form); try { await api.post('/inquiries', { title: f.get('title').trim(), content: f.get('content').trim() }); form.reset(); await load(); toast('문의가 등록되었어요.', 'ok'); } catch (err) { toast(err.message, 'bad'); } }),
      on(root, 'click', '[data-like]', async (_e, el) => { try { const r = await api.post(`/inquiries/${el.dataset.like}/like`); publicItems = publicItems.map(i => String(i._id) === el.dataset.like ? { ...i, likes: r.liked ? [...(i.likes || []), state.user?.id] : (i.likes || []).filter(x => String(x?._id || x) !== String(state.user?.id)) } : i); mine = mine.map(i => String(i._id) === el.dataset.like ? { ...i, likes: r.liked ? [...(i.likes || []), state.user?.id] : (i.likes || []).filter(x => String(x?._id || x) !== String(state.user?.id)) } : i); draw(); } catch (err) { toast(err.message, 'bad'); } })];
    return () => offs.forEach(fn => fn());
  },
};
