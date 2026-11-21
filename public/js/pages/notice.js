import { api } from '../api.js';
import { state } from '../state.js';
import { html, render, on, skeleton, empty, errorBox, toast, confirmDialog, fmtDate, icon } from '../ui.js';

export default {
  title: '공지사항', auth: false,
  async render(root, _p, _q, ctx) {
    let notices = [], editId = '';
    const load = async () => { render(root, html`<div class="page">${skeleton(4)}</div>`); try { notices = await api.get('/notices'); if (ctx.isCurrent()) draw(); } catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message, 'data-retry-notice')}</div>`); } };
    const draw = () => render(root, html`<div class="page page--narrow"><section class="section"><div class="section__head"><h1 class="section__title">공지사항</h1>${state.user?.isAdmin ? html`<button class="btn btn--primary btn--sm" data-new>${icon('plus')}공지 작성</button>` : ''}</div>
      ${editId !== '' ? html`<form class="card stack" data-notice-form><label class="field"><span class="field__label">제목</span><input class="input" name="title" maxlength="200" value="${notices.find(n => String(n._id) === editId)?.title || ''}" required></label><label class="field"><span class="field__label">내용</span><textarea class="input" name="content" maxlength="5000" required>${notices.find(n => String(n._id) === editId)?.content || ''}</textarea></label><label class="check"><input type="checkbox" name="isPinned" ${notices.find(n => String(n._id) === editId)?.isPinned ? 'checked' : ''}>상단 고정</label><div class="btn-row"><button class="btn btn--primary">${editId === 'new' ? '등록' : '수정 저장'}</button><button class="btn btn--ghost" type="button" data-cancel>취소</button></div></form>` : ''}
      ${notices.length ? html`<div class="stack">${notices.map(n => html`<article class="card stack"><div class="section__head"><div>${n.isPinned ? html`<span class="badge">고정</span>` : ''}<h2 class="section__title">${n.title}</h2><p class="muted">${n.author?.username || '관리자'} · ${fmtDate(n.updatedAt || n.createdAt)}</p></div>${state.user?.isAdmin ? html`<div class="btn-row"><button class="btn btn--ghost btn--sm btn--icon" data-edit="${n._id}" aria-label="공지 수정" title="공지 수정">${icon('edit', 18)}</button><button class="btn btn--ghost btn--sm set-delete btn--icon" data-delete="${n._id}" aria-label="공지 삭제" title="공지 삭제">${icon('trash', 18)}</button></div>` : ''}</div><p class="pre-line">${n.content}</p></article>`)}</div>` : empty({ icon: 'bell', title: '등록된 공지가 없어요' })}
    </section></div>`);
    await load();
    const offs = [on(root, 'click', '[data-retry-notice]', load), on(root, 'click', '[data-new]', () => { editId = 'new'; draw(); }), on(root, 'click', '[data-edit]', (_e, el) => { editId = el.dataset.edit; draw(); }), on(root, 'click', '[data-cancel]', () => { editId = ''; draw(); }),
      on(root, 'submit', '[data-notice-form]', async (e, form) => { e.preventDefault(); const data = new FormData(form), body = { title: data.get('title').trim(), content: data.get('content').trim(), isPinned: data.get('isPinned') === 'on' }; try { if (editId === 'new') await api.post('/notices', body); else await api.put(`/notices/${editId}`, body); editId = ''; await load(); toast('공지를 저장했어요.', 'ok'); } catch (err) { toast(err.message, 'bad'); } }),
      on(root, 'click', '[data-delete]', async (_e, el) => { if (!await confirmDialog('이 공지를 삭제할까요?', { danger: true })) return; try { await api.del(`/notices/${el.dataset.delete}`); notices = notices.filter(n => String(n._id) !== el.dataset.delete); draw(); } catch (e) { toast(e.message, 'bad'); } })];
    return () => offs.forEach(fn => fn());
  },
};
