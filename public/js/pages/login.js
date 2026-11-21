// 로그인 · 가입(이메일 인증) · 비밀번호 찾기/재설정 · 소셜 로그인 진입.
// 2026-11-20 로그인 시스템 점검으로 고친 것:
//  - 로그인 칸이 type=email 이라 전화번호 계정은 브라우저가 입력을 막았음 → 이메일 또는 전화번호
//  - 가입 인증·비밀번호 재설정 토큰을 메모리에만 두어 새로고침(재배포 알림 등)하면 진행이 끊김 → sessionStorage
//  - 로그인 직후 사용자 정보가 일부만 채워짐 → /auth/me 로 다시 채움, 이미 로그인 상태면 바로 이동
//  - 소셜 로그인 오류를 토스트로만 잠깐 보여줌 → 화면에 원인·해결 안내를 남김
// 2026-11-20 사용자 요청: 입력 카드는 왼쪽, 오른쪽엔 마스코트 장난감(mascot.js),
// 로그인↔가입 등 단계 전환은 카드 높이·내용이 부드럽게 미끄러지도록.
// 04(2026-11-20 사용자 요청): 스크롤 없이 한 화면에, 입력칸마다 지우기(x), 아이디 저장·로그인 유지 체크,
// '비밀번호를 잊으셨나요? · 회원가입' 은 작은 글자 링크(탭 대신).
import { api } from '../api.js';
import { state, setUser } from '../state.js';
import { html, raw, render, on, toast, confirmDialog, busy, icon, $, logoMark } from '../ui.js';
import { reduced } from '../motion.js';
import { mountMascot } from '../mascot.js';

const PENDING = 'ydm_auth_pending'; // { kind: 'register'|'reset', token, email, at }
const pending = {
  get() { try { const p = JSON.parse(sessionStorage.getItem(PENDING) || 'null'); return p && Date.now() - p.at < 10 * 60e3 ? p : null; } catch { return null; } },
  set(kind, token, email) { try { sessionStorage.setItem(PENDING, JSON.stringify({ kind, token, email, at: Date.now() })); } catch { /* 사생활 모드: 이 화면 안에서만 유지 */ } mem = { kind, token, email, at: Date.now() }; },
  clear() { try { sessionStorage.removeItem(PENDING); } catch { /* 무시 */ } mem = null; },
};
let mem = null; // sessionStorage 를 못 쓰는 환경 대비
const current = () => pending.get() || mem;

// 입력칸 + 한 번에 지우기 버튼(값이 있을 때만 보임)
// attrs 는 이 파일의 고정 문자열(사용자 입력 아님)이라 raw 로 넣는다 — html`` 에 그대로 넣으면 " 가 &quot; 로 바뀌어
// pattern="…" 값에 따옴표가 섞여 어떤 아이디도 형식 검사를 통과하지 못했음(08, 사용자 제보: 가입 시 '요청한 형식과 일치시키세요' 반복)
export const field = (label, name, type = 'text', attrs = '', value = '') =>
  html`<label class="field"><span class="field__label">${label}</span><span class="input-wrap"><input class="input" name="${name}" type="${type}" value="${value}" ${raw(attrs)} required><button class="input-clear" type="button" tabindex="-1" data-clear aria-label="${label} 지우기"${value ? '' : ' hidden'}>${icon('x', 14)}</button></span></label>`;

// 아이디 저장·로그인 유지(이 브라우저에만 저장)
const PREF = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* 사생활 모드 */ } },
};
const SAVED_ID = 'ydm_saved_login', KEEP = 'ydm_keep_login';

const TITLES = { login: '로그인', register: '계정 만들기', verify: '이메일 인증', forgot: '비밀번호 찾기', reset: '비밀번호 재설정' };
const GREET = { login: '다시 만나서 반가워요', register: '함께 공부를 시작해요' };
const ORDER = ['login', 'register', 'verify', 'forgot', 'reset'];
const EASE = 'cubic-bezier(.22, 1, .36, 1)';

// 로그인 성공 공통 처리: 목적지로 먼저 이동 예약 → 토큰 저장 → 전체 사용자 정보로 갱신
async function signIn(user, token, next, persist = true) {
  location.replace('#' + (next && next.startsWith('/') && !next.startsWith('/login') ? next : '/'));
  setUser(user, token, persist);
  try { const me = await api.get('/auth/me'); setUser(me.user); } catch { /* 기본 정보로도 동작 */ }
}

export default {
  title: '로그인', auth: false,
  render(root, _params, query) {
    if (state.user) { location.replace('#' + (query.next || '/')); return; }
    const p = current();
    let tab = ['register', 'forgot', 'verify', 'reset'].includes(query.tab) ? query.tab : 'login';
    // 인증·재설정 중 새로고침했다면 그 단계로 복귀
    if (p?.kind === 'register' && (tab === 'login' || tab === 'verify')) tab = 'verify';
    if (p?.kind === 'reset' && (tab === 'login' || tab === 'reset')) tab = 'reset';
    if ((tab === 'verify' && p?.kind !== 'register') || (tab === 'reset' && p?.kind !== 'reset')) tab = tab === 'verify' ? 'register' : 'forgot';
    let oauthError = query.error || '';

    const social = () => html`
      <div class="auth-divider"><span>또는 소셜 계정으로</span></div>
      <div class="social-actions">
        <button class="btn btn--block social-btn social-btn--google" type="button" data-oauth="google">
          <svg class="social-btn__logo" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M44 24a20 20 0 0 1-3.1 10.7"/><path d="M40.9 34.7A20 20 0 0 1 8.5 37"/><path d="M8.5 37A20 20 0 0 1 8.5 11"/><path d="M8.5 11A20 20 0 0 1 40 10"/><path class="social-btn__google-bar" d="M24 24h20"/></svg>
          <span>Google로 계속하기</span><i aria-hidden="true"></i></button>
        <button class="btn btn--block social-btn social-btn--naver" type="button" data-oauth="naver">
          <svg class="social-btn__logo" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3 3h4.2l5.6 7.7V3H17v14h-4.2l-5.6-7.7V17H3z"/></svg>
          <span>네이버로 계속하기</span><i aria-hidden="true"></i></button>
      </div>`;

    const body = () => {
      const c = current();
      if (tab === 'login') {
        const saved = PREF.get(SAVED_ID) || '';
        return html`<form class="stack" data-form="login" novalidate>
        ${field('이메일 또는 전화번호', 'email', 'text', 'inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false"', saved)}
        ${field('비밀번호', 'password', 'password', 'autocomplete="current-password"')}
        <button class="btn btn--primary btn--block">로그인</button>
        <div class="auth-checks">
          <label class="check check--sm"><input type="checkbox" name="remember" ${saved ? 'checked' : ''}> 아이디 저장</label>
          <label class="check check--sm"><input type="checkbox" name="keep" ${PREF.get(KEEP) === '0' ? '' : 'checked'}> 로그인 유지</label>
        </div>
        <p class="auth-links"><button class="link-btn" type="button" data-tab="forgot">비밀번호를 잊으셨나요?</button><span aria-hidden="true">·</span><button class="link-btn link-btn--strong" type="button" data-tab="register">회원가입</button></p></form>`;
      }
      if (tab === 'register') return html`<form class="stack" data-form="register">
        ${field('사용자명 (2~20자 영문·한글·숫자·_)', 'username', 'text', 'minlength="2" maxlength="20" pattern="[A-Za-z0-9가-힣_]{2,20}" autocomplete="nickname"')}
        ${field('이메일', 'email', 'email', 'autocomplete="email" autocapitalize="off"')}
        ${field('비밀번호 (영문·숫자 포함 8자 이상)', 'password', 'password', 'minlength="8" autocomplete="new-password"')}
        <label class="check"><input type="checkbox" name="agreedToTerms" required> 개인정보 수집·이용에 동의합니다. <a href="/privacy.html" target="_blank" rel="noopener">내용 보기</a></label>
        <button class="btn btn--primary btn--block">인증 코드 받기</button>
        <p class="auth-links"><span>이미 계정이 있나요?</span><button class="link-btn link-btn--strong" type="button" data-tab="login">로그인</button></p></form>`;
      if (tab === 'verify') return html`<form class="stack" data-form="verify">
        <p class="muted"><b>${c?.email || '입력한 이메일'}</b>로 보낸 6자리 인증 코드를 입력하세요. 메일이 안 보이면 스팸함도 확인해주세요. 코드는 10분 동안 유효해요.</p>
        ${field('인증 코드', 'code', 'text', 'inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"')}
        <button class="btn btn--primary btn--block">가입 완료</button>
        <div class="btn-row"><button class="btn btn--ghost btn--sm" type="button" data-resend>코드 다시 보내기</button><button class="btn btn--ghost btn--sm" type="button" data-restart="register">이메일 다시 입력</button></div></form>`;
      if (tab === 'forgot') return html`<form class="stack" data-form="forgot">
        <p class="muted">가입한 이메일을 입력하면 재설정 코드를 보내드려요.</p>
        ${field('이메일', 'email', 'email', 'autocomplete="email" autocapitalize="off"')}
        <button class="btn btn--primary btn--block">코드 받기</button></form>`;
      return html`<form class="stack" data-form="reset">
        <p class="muted"><b>${c?.email || ''}</b> 이 가입된 계정이면 재설정 코드가 발송돼요. 메일의 6자리 코드를 입력하세요.</p>
        ${field('인증 코드', 'code', 'text', 'inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"')}
        ${field('새 비밀번호 (영문·숫자 포함 8자 이상)', 'newPassword', 'password', 'minlength="8" autocomplete="new-password"')}
        <button class="btn btn--primary btn--block">비밀번호 변경</button>
        <button class="btn btn--ghost btn--sm" type="button" data-restart="forgot">이메일 다시 입력</button></form>`;
    };

    render(root, html`<section class="page auth-layout">
      <section class="card auth-card glass stack" data-auth-card></section>
      <aside class="auth-fun" data-auth-fun></aside></section>`);
    const card = $('[data-auth-card]', root);
    const fun = mountMascot($('[data-auth-fun]', root));

    // 머리줄: 로고 옆에 제목·인사를 한 줄로(세로 공간 절약)
    const draw = () => render(card, html`
        <div class="auth-brand">${logoMark()}<div><h1 class="section__title">${TITLES[tab]}</h1>${GREET[tab] ? html`<p class="muted">${GREET[tab]}</p>` : ''}</div></div>
        ${oauthError ? html`<div class="auth-alert" role="alert">${icon('alert', 20)}<div><strong>소셜 로그인에 실패했어요</strong><span>${oauthError}</span><span class="muted">잠시 후 다시 시도하거나 이메일로 로그인해주세요. 계속되면 문의하기로 알려주세요.</span></div></div>` : ''}
        ${body()}
        ${tab === 'login' || tab === 'register' ? social() : html`<p class="auth-links"><button class="link-btn" type="button" data-tab="login">${icon('chevronLeft', 14)}로그인으로 돌아가기</button></p>`}
      `);
    draw();

    // 단계 전환: 높이는 이전→새 높이로, 바뀐 부분은 진행 방향에서 미끄러져 들어옴
    const go = next => {
      if (next === tab) { draw(); return; }
      const dir = ORDER.indexOf(next) > ORDER.indexOf(tab) ? 1 : -1;
      const from = card.offsetHeight;
      const keepHead = (tab === 'login' || tab === 'register') && (next === 'login' || next === 'register');
      tab = next; draw();
      if (reduced()) return;
      const to = card.offsetHeight;
      card.style.overflow = 'hidden'; // 높이가 변하는 동안 내용이 넘치지 않게
      card.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 460, easing: EASE }).finished.catch(() => {}).then(() => { card.style.overflow = ''; });
      const moving = (keepHead ? [$('.auth-brand > div', card), $('form', card)] : [$('.auth-brand', card), $('form', card)]).filter(Boolean);
      moving.forEach((el, k) => el.animate(
        [{ opacity: 0, transform: `translateX(${dir * 28}px)`, filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
        { duration: 420, delay: k * 40, easing: EASE, fill: 'backwards' }));
      $('.social-actions', card)?.animate([{ opacity: .4 }, { opacity: 1 }], { duration: 300, easing: EASE });
    };

    const offs = [
      on(root, 'input', '.input-wrap .input', (_e, el) => { el.parentElement.querySelector('[data-clear]').hidden = !el.value; }),
      on(root, 'click', '[data-clear]', (e, b) => {
        e.preventDefault();
        const input = b.parentElement.querySelector('input');
        input.value = ''; b.hidden = true; input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }),
      on(root, 'click', '[data-tab]', (_e, el) => { oauthError = ''; go(el.dataset.tab); }),
      on(root, 'click', '[data-restart]', (_e, el) => { pending.clear(); go(el.dataset.restart); }),
      on(root, 'click', '[data-resend]', (_e, el) => busy(el, async () => {
        try { await api.post('/auth/resend-code', { token: current()?.token }); toast('인증 코드를 다시 보냈어요.', 'ok'); }
        catch (e) { toast(e.message, 'bad'); }
      })),
      on(root, 'click', '[data-oauth]', async (_e, el) => {
        const name = el.dataset.oauth === 'google' ? 'Google' : '네이버';
        const ok = await confirmDialog(`${name} 로그인 화면으로 이동합니다. 로그인하면 이름·이메일이 영단마스터에 전달돼요.`, { title: `${name}로 계속하기`, ok: '이동' });
        if (ok) location.href = `/api/auth/${el.dataset.oauth}`;
      }),
      on(root, 'submit', 'form', async (e, form) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        const kind = form.dataset.form;
        // 로그인 칸은 이메일·전화번호 둘 다 받으므로 브라우저 검증을 끄고 빈칸만 직접 확인
        if (kind === 'login' && (!String(data.email || '').trim() || !data.password)) { toast('이메일(또는 전화번호)과 비밀번호를 입력해주세요.', 'info'); return; }
        const submit = form.querySelector('button:not([type])');
        await busy(submit, async () => {
          try {
            if (kind === 'login') {
              const r = await api.post('/auth/login', { email: String(data.email).trim(), password: data.password });
              fun.react('happy');
              PREF.set(SAVED_ID, data.remember === 'on' ? String(data.email).trim() : null);
              PREF.set(KEEP, data.keep === 'on' ? null : '0');
              await signIn(r.user, r.token, query.next, data.keep === 'on');
              toast(`${r.user.username}님, 반가워요!`, 'ok');
            } else if (kind === 'register') {
              const r = await api.post('/auth/register', { ...data, agreedToTerms: data.agreedToTerms === 'on' });
              pending.set('register', r.token, data.email); go('verify'); toast('이메일로 인증 코드를 보냈어요.', 'ok');
            } else if (kind === 'verify') {
              const r = await api.post('/auth/verify-code', { token: current()?.token, code: String(data.code).trim() });
              pending.clear();
              await signIn(r.user, r.token, '/');
              toast('가입을 환영해요!', 'ok');
            } else if (kind === 'forgot') {
              const r = await api.post('/auth/forgot-password', data);
              pending.set('reset', r.token, data.email); go('reset');
            } else {
              await api.post('/auth/reset-password', { token: current()?.token, code: String(data.code).trim(), newPassword: data.newPassword });
              pending.clear(); go('login'); toast('비밀번호를 바꿨어요. 새 비밀번호로 로그인해주세요.', 'ok');
            }
          } catch (err) {
            toast(err.message, 'bad');
            fun.react('sad');
            // 인증 정보가 만료·폐기됐으면 처음 단계로 되돌림
            if (/찾을 수 없|만료/.test(err.message) && (kind === 'verify' || kind === 'reset')) { pending.clear(); go(kind === 'verify' ? 'register' : 'forgot'); }
          }
        });
      }),
    ];
    return () => { offs.forEach(fn => fn()); fun.destroy(); };
  },
};
