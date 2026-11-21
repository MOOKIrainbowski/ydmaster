// 내 프로필(09, 2026-11-21 사용자 요청: 프로필 보기와 프로필 수정 분리).
// 보기는 다른 사람 프로필과 같은 화면(user.js) + 맨 아래 '프로필 수정' 버튼·내 메뉴. 수정은 #/me/edit(profile-edit.js).
import { api } from '../api.js';
import { state, setUser } from '../state.js';
import { html, render, errorBox } from '../ui.js';
import { renderProfile } from './user.js';

export default {
  title: '내 프로필', async render(root, _p, _q, ctx) {
    try { const r = await api.get('/auth/me'); if (!ctx.isCurrent()) return; setUser(r.user); }
    catch (e) { render(root, html`<div class="page">${errorBox(e.message)}</div>`); return; }
    return renderProfile(root, state.user.username, ctx, { self: true });
  },
};
