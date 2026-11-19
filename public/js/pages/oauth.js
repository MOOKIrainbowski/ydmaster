// 소셜 로그인 콜백: 서버가 #/oauth?token=... 로 보낸다(토큰을 쿼리스트링 대신 해시로 → 서버 로그·Referer 에 남지 않음).
import { api } from '../api.js';
import { setUser } from '../state.js';
import { html, render, toast, errorBox } from '../ui.js';

export default {
  title: '로그인 중',
  auth: false,
  async render(root, params, query) {
    history.replaceState(null, '', location.pathname + '#/oauth'); // 주소창에서 토큰 제거
    if (query.error || !query.token) {
      // 오류는 로그인 화면에 남겨 보여준다(토스트만으로는 금방 사라져 원인을 알 수 없었음)
      location.replace('#/login?error=' + encodeURIComponent(query.error || '로그인 정보를 받지 못했어요.'));
      return;
    }
    render(root, html`<div class="page"><p class="muted">로그인하는 중…</p></div>`);
    setUser(null, query.token);
    try {
      const r = await api.get('/auth/me');
      location.replace('#/');
      setUser(r.user);
      toast(`${r.user.username}님, 반가워요!`, 'ok');
    } catch (e) {
      setUser(null, null);
      render(root, html`<div class="page">${errorBox(e.message, 'data-home')}</div>`);
    }
  },
};
