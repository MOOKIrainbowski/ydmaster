import { api } from '../api.js';
import { setUser } from '../state.js';
import { html, render, on, toast } from '../ui.js';

let pendingRegister = '';
let pendingReset = '';
const field = (label, name, type = 'text', attrs = '') => html`<label class="field"><span class="field__label">${label}</span><input class="input" name="${name}" type="${type}" ${attrs} required></label>`;

export default {
  title: '로그인', auth: false,
  render(root, _params, query) {
    const startTab = ['register', 'forgot', 'verify', 'reset'].includes(query.tab) ? query.tab : 'login';
    let tab = startTab;
    const draw = () => {
      const body = tab === 'login' ? html`<form class="stack" data-form="login">
        ${field('이메일', 'email', 'email', 'autocomplete="username"')}${field('비밀번호', 'password', 'password', 'autocomplete="current-password"')}
        <button class="btn btn--primary btn--block">로그인</button><button class="btn btn--ghost" type="button" data-tab="forgot">비밀번호를 잊으셨나요?</button>
      </form>` : tab === 'register' ? html`<form class="stack" data-form="register">
        ${field('사용자명', 'username', 'text', 'minlength="2" maxlength="20" autocomplete="username"')}${field('이메일', 'email', 'email', 'autocomplete="email"')}${field('비밀번호 (영문·숫자 포함 8자 이상)', 'password', 'password', 'minlength="8" autocomplete="new-password"')}
        <label class="check"><input type="checkbox" name="agreedToTerms" required> 개인정보 수집·이용에 동의합니다. <a href="/privacy.html" target="_blank" rel="noopener">내용 보기</a></label><button class="btn btn--primary btn--block">인증 코드 받기</button>
      </form>` : tab === 'verify' ? html`<form class="stack" data-form="verify"><p class="muted">이메일로 받은 6자리 인증 코드를 입력하세요.</p>${field('인증 코드', 'code', 'text', 'inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"')}
        <button class="btn btn--primary btn--block">가입 완료</button><button class="btn btn--ghost" type="button" data-resend>코드 다시 보내기</button></form>` : tab === 'forgot' ? html`<form class="stack" data-form="forgot"><p class="muted">가입한 이메일로 재설정 코드를 보냅니다.</p>${field('이메일', 'email', 'email', 'autocomplete="email"')}<button class="btn btn--primary btn--block">코드 받기</button></form>` : html`<form class="stack" data-form="reset">${field('인증 코드', 'code', 'text', 'inputmode="numeric" pattern="[0-9]{6}" maxlength="6"')}${field('새 비밀번호', 'newPassword', 'password', 'minlength="8" autocomplete="new-password"')}<button class="btn btn--primary btn--block">비밀번호 변경</button></form>`;
      render(root, html`<section class="page page--narrow"><section class="card login-card stack"><h1 class="section__title">${tab === 'login' ? '다시 만나요' : tab === 'register' ? '계정 만들기' : tab === 'verify' ? '이메일 인증' : tab === 'forgot' ? '비밀번호 찾기' : '비밀번호 재설정'}</h1>
        ${tab === 'login' || tab === 'register' ? html`<div class="tabs"><button class="tabs__tab${tab === 'login' ? ' is-active' : ''}" data-tab="login">로그인</button><button class="tabs__tab${tab === 'register' ? ' is-active' : ''}" data-tab="register">가입</button></div>` : ''}${body}
        ${tab === 'login' || tab === 'register' ? html`<div class="stack"><p class="muted">또는 소셜 계정으로</p><div class="social-actions stack"><button class="btn btn--ghost btn--block" data-oauth="google">Google 계정으로 계속</button><button class="btn btn--ghost btn--block" data-oauth="naver">네이버로 계속</button></div></div>` : ''}
        ${tab !== 'login' && tab !== 'register' ? html`<button class="btn btn--ghost" data-tab="login">로그인으로 돌아가기</button>` : ''}</section></section>`);
    };
    draw();
    const offs = [on(root, 'click', '[data-tab]', (_e, el) => { tab = el.dataset.tab; draw(); }),
      on(root, 'click', '[data-resend]', async () => { try { await api.post('/auth/resend-code', { token: pendingRegister }); toast('인증 코드를 다시 보냈어요.', 'ok'); } catch (e) { toast(e.message, 'bad'); } }),
      on(root, 'click', '[data-oauth]', async (_e, el) => {
        if (!window.confirm('선택한 소셜 계정으로 이동합니다. 로그인 후 계정 정보가 영단마스터에 전달됩니다. 계속할까요?')) return;
        location.href = `/api/auth/${el.dataset.oauth}`;
      }),
      on(root, 'submit', 'form', async (e, form) => {
        e.preventDefault(); const data = Object.fromEntries(new FormData(form)); const submit = form.querySelector('[type="submit"], button:not([type])');
        if (submit) submit.disabled = true;
        try {
          if (form.dataset.form === 'login') {
            const r = await api.post('/auth/login', data); setUser(r.user, r.token); location.hash = query.next ? `#${query.next}` : '#/';
          } else if (form.dataset.form === 'register') {
            const r = await api.post('/auth/register', { ...data, agreedToTerms: data.agreedToTerms === 'on' }); pendingRegister = r.token; tab = 'verify'; draw(); toast('이메일로 인증 코드를 보냈어요.', 'ok');
          } else if (form.dataset.form === 'verify') {
            const r = await api.post('/auth/verify-code', { token: pendingRegister, code: data.code }); pendingRegister = ''; setUser(r.user, r.token); location.hash = '#/';
          } else if (form.dataset.form === 'forgot') {
            const r = await api.post('/auth/forgot-password', data); pendingReset = r.token || ''; if (!pendingReset) { toast('해당 계정이 있으면 이메일로 코드가 발송됩니다.', 'info'); tab = 'login'; } else tab = 'reset'; draw();
          } else {
            await api.post('/auth/reset-password', { token: pendingReset, code: data.code, newPassword: data.newPassword }); pendingReset = ''; tab = 'login'; draw(); toast('비밀번호를 변경했어요. 로그인해주세요.', 'ok');
          }
        } catch (err) { toast(err.message, 'bad'); if (submit?.isConnected) submit.disabled = false; }
      })];
    return () => offs.forEach(fn => fn());
  },
};
