import { api } from '../api.js';
import { html, render, on, skeleton, empty, errorBox, toast, confirmDialog, avatar } from '../ui.js';

export default {
  title: '친구', async render(root, _p, _q, ctx) {
    let tab = 'friends', friends = [], requests = [], results = [], search = '', busy = false;
    const load = async () => {
      render(root, html`<div class="page">${skeleton(5)}</div>`);
      try { [friends, requests] = await Promise.all([api.get('/friends'), api.get('/friends/requests')]); if (ctx.isCurrent()) draw(); }
      catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message, 'data-retry-friends')}</div>`); }
    };
    const drawUsers = rows => rows.length ? html`<ul class="stack">${rows.map(u => html`<li class="list-row">${avatar(u, 40)}<div class="list-row__main"><a class="list-row__title" href="#/u/${encodeURIComponent(u.username)}">${u.username}</a></div>${u.isFriend ? html`<span class="badge">친구</span>` : u.requestSent ? html`<span class="muted">요청 보냄</span>` : html`<button class="btn btn--ghost btn--sm" data-request="${u._id}">친구 요청</button>`}</li>`)}</ul>` : empty({ icon: 'users', title: '친구가 없어요' });
    const draw = () => render(root, html`<div class="page"><section class="section"><h1 class="section__title">친구</h1><div class="tabs" role="tablist"><button class="tabs__tab${tab === 'friends' ? ' is-active' : ''}" data-tab="friends">친구 ${friends.length}</button><button class="tabs__tab${tab === 'requests' ? ' is-active' : ''}" data-tab="requests">받은 요청 ${requests.length}</button><button class="tabs__tab${tab === 'search' ? ' is-active' : ''}" data-tab="search">사용자 찾기</button></div>
      ${tab === 'friends' ? friends.length ? html`<ul class="stack">${friends.map(u => html`<li class="list-row">${avatar(u, 40)}<div class="list-row__main"><a class="list-row__title" href="#/u/${encodeURIComponent(u.username)}">${u.username}</a></div><button class="btn btn--ghost btn--sm" data-remove="${u._id}">친구 삭제</button></li>`)}</ul>` : empty({ icon: 'users', title: '친구가 없어요', desc: '사용자 찾기에서 친구를 추가하세요.' }) : tab === 'requests' ? requests.length ? html`<ul class="stack">${requests.map(r => html`<li class="list-row">${avatar(r.from, 40)}<div class="list-row__main"><a class="list-row__title" href="#/u/${encodeURIComponent(r.from.username)}">${r.from.username}</a><p class="list-row__meta">친구 요청</p></div><button class="btn btn--primary btn--sm" data-answer="accept" data-id="${r._id}">수락</button><button class="btn btn--ghost btn--sm" data-answer="reject" data-id="${r._id}">거절</button></li>`)}</ul>` : empty({ icon: 'users', title: '새 친구 요청이 없어요' }) : html`<form class="field-row" data-search><label class="field"><span class="field__label">사용자명 검색</span><input class="input" name="q" value="${search}" maxlength="20" autocomplete="off"></label><button class="btn btn--primary">검색</button></form>${drawUsers(results)}`}
      </section></div>`);
    await load();
    const offs = [on(root, 'click', '[data-tab]', (_e, el) => { tab = el.dataset.tab; draw(); }),
      on(root, 'click', '[data-retry-friends]', load),
      on(root, 'submit', '[data-search]', async (e, form) => { e.preventDefault(); if (busy) return; search = new FormData(form).get('q').trim(); if (!search) { results = []; draw(); return; } busy = true; try { results = await api.get(`/users/search?q=${encodeURIComponent(search)}`); if (ctx.isCurrent()) draw(); } catch (err) { toast(err.message, 'bad'); } finally { busy = false; } }),
      on(root, 'click', '[data-request]', async (_e, el) => { try { await api.post('/friends/request', { toUserId: el.dataset.request }); toast('친구 요청을 보냈어요.', 'ok'); results = results.map(u => u._id === el.dataset.request ? { ...u, requestSent: true } : u); draw(); } catch (e) { toast(e.message, 'bad'); } }),
      on(root, 'click', '[data-answer]', async (_e, el) => { try { await api.put(`/friends/request/${el.dataset.id}`, { action: el.dataset.answer }); toast(el.dataset.answer === 'accept' ? '친구가 되었어요.' : '요청을 거절했어요.', 'ok'); await load(); } catch (e) { toast(e.message, 'bad'); } }),
      on(root, 'click', '[data-remove]', async (_e, el) => { const friend = friends.find(x => String(x._id) === el.dataset.remove); if (!await confirmDialog(`${friend?.username || '친구'}님을 친구 목록에서 삭제할까요?`, { danger: true })) return; try { await api.del(`/friends/${el.dataset.remove}`); friends = friends.filter(x => String(x._id) !== el.dataset.remove); draw(); } catch (e) { toast(e.message, 'bad'); } })];
    return () => offs.forEach(fn => fn());
  },
};
