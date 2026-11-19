// 앱 셸 + 해시 라우터 — 계약 §4. 페이지 모듈은 필요할 때만 불러온다(첫 로드 최소화, R4).
import { state, setUser, onUser, getTheme, setTheme } from './state.js';
import { api, ApiError } from './api.js';
import { html, render, icon, on, toast, closeAllModals, errorBox, avatar } from './ui.js';
import { initMotion, viewTransition } from './motion.js';

const ROUTES = [
  ['/', 'home'], ['/explore', 'explore'], ['/sets/:id', 'set'], ['/sets/:id/edit', 'editor'], ['/new/:kind', 'editor'],
  ['/play/:id', 'play'], ['/result/:id', 'result'], ['/wrong', 'wrong'], ['/history', 'history'], ['/ranking', 'ranking'],
  ['/friends', 'friends'], ['/me', 'me'], ['/u/:username', 'user'], ['/notice', 'notice'], ['/inquiry', 'inquiry'],
  ['/admin', 'admin'], ['/login', 'login'], ['/oauth', 'oauth'],
].map(([pattern, page]) => ({ page, keys: [...pattern.matchAll(/:(\w+)/g)].map(m => m[1]), re: new RegExp('^' + pattern.replace(/:\w+/g, '([^/]+)') + '/?$') }));

// 하단 탭바(모바일)·상단 링크(데스크톱)에 같은 목록을 쓴다 → 선택 표시가 한 원본(I-042)
const TABS = [
  { href: '#/', label: '홈', icon: 'home', match: ['home'] },
  { href: '#/explore', label: '둘러보기', icon: 'compass', match: ['explore'] },
  { href: '#/wrong', label: '오답', icon: 'target', match: ['wrong'] },
  { href: '#/ranking', label: '랭킹', icon: 'trophy', match: ['ranking'] },
  { href: '#/me', label: '내 정보', icon: 'user', match: ['me', 'history', 'friends'] },
];

const app = document.getElementById('app');
let cleanup = null;
let navSeq = 0;

function parse() {
  const h = decodeURI(location.hash.slice(1) || '/');
  const [path, qs = ''] = h.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  for (const r of ROUTES) {
    const m = r.re.exec(path);
    if (m) return { page: r.page, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])), query, path };
  }
  return { page: 'notfound', params: {}, query, path };
}

// 선택된 탭 뒤의 그라데이션 알약. view-transition-name(tab-pill/top-pill) 이 같아서 화면 전환 때 새 위치로 미끄러진다(02 §3.5)
const pill = name => html`<span class="${name}" aria-hidden="true"></span>`;
// 랜딩·로그인처럼 브랜드 첫인상이 중요한 화면은 오로라를 진하게, 학습 화면은 은은하게(02 §3.5)
const VIVID = new Set(['landing', 'login', 'oauth', 'user']);

function shell(active, mod = {}) {
  const u = state.user;
  render(app, html`
    <a class="skip-link" href="#main">본문으로 건너뛰기</a>
    <header class="topbar glass">
      <a class="topbar__brand" href="#/" aria-label="영단마스터 홈"><span class="logo-mark" aria-hidden="true">영</span><span class="topbar__name">영단마스터</span></a>
      ${u ? html`<nav class="topbar__nav" aria-label="주요 메뉴">${TABS.map(t => { const on = t.match.includes(active); return html`<a class="topbar__link${on ? ' is-active' : ''}" href="${t.href}"${on ? html` aria-current="page"` : ''}>${on ? pill('topbar__pill') : ''}<span>${t.label}</span></a>`; })}</nav>
        <a class="topbar__me" href="#/me" aria-label="내 정보">${avatar(u, 34)}</a>`
      : active === 'login' ? '' : html`<div class="topbar__guest"><a class="btn btn--ghost btn--sm" href="#/login">로그인</a><a class="btn btn--primary btn--sm" href="#/login?tab=register">무료로 시작</a></div>`}
    </header>
    <main class="main" id="main" tabindex="-1"></main>
    ${u ? html`<nav class="tabbar glass" aria-label="주요 메뉴">${TABS.map(t => { const on = t.match.includes(active); return html`<a class="tabbar__item${on ? ' is-active' : ''}" href="${t.href}"${on ? html` aria-current="page"` : ''}>${on ? pill('tabbar__pill') : ''}${icon(t.icon, 22)}<span>${t.label}</span></a>`; })}</nav>` : ''}`);
  app.classList.toggle('app--focus', !!mod.focus);
  app.classList.toggle('app--guest', !u);
  app.classList.toggle('app--landing', active === 'landing');
  aurora.classList.toggle('aurora--calm', !VIVID.has(active));
  onScroll();
  return document.getElementById('main');
}

// 오로라 배경(한 번만 만들고 화면마다 세기만 바꿈)
const aurora = document.createElement('div');
aurora.className = 'aurora aurora--calm';
aurora.setAttribute('aria-hidden', 'true');
aurora.innerHTML = '<i></i><i></i><i></i><i></i>';
document.body.prepend(aurora);

// 스크롤하면 상단바에 그림자·진한 유리
function onScroll() { app.querySelector('.topbar')?.classList.toggle('is-scrolled', window.scrollY > 6); }
window.addEventListener('scroll', onScroll, { passive: true });

async function navigate() {
  const seq = ++navSeq;
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* 페이지 정리 실패가 이동을 막지 않게 */ } }
  cleanup = null;
  closeAllModals();
  let { page, params, query } = parse();
  if (page === 'home' && !state.user) page = 'landing';
  let mod;
  try {
    mod = (await import(`./pages/${page}.js`)).default;
  } catch (e) {
    console.error(e);
    if (seq !== navSeq) return;
    const main = shell(page);
    render(main, page === 'notfound'
      ? html`<div class="page">${errorBox('없는 페이지예요.', 'data-home')}</div>`
      : html`<div class="page">${errorBox('화면을 불러오지 못했어요. 새로고침해 주세요.')}</div>`);
    return;
  }
  if (seq !== navSeq) return; // 그 사이 다른 곳으로 이동함
  if (mod.auth !== false && !state.user) {
    location.replace('#/login?next=' + encodeURIComponent(location.hash.slice(1) || '/'));
    return;
  }
  document.title = mod.title ? `${typeof mod.title === 'function' ? mod.title(params) : mod.title} · 영단마스터` : '영단마스터';
  let main, rendering;
  // 페이지는 isCurrent() 로 자기 화면이 아직 떠 있는지 확인해 늦은 응답이 새 화면을 덮지 않게 한다(I-037)
  const ctx = { isCurrent: () => seq === navSeq };
  // 화면 전환(D5): 셸과 페이지의 "첫 그림"(보통 스켈레톤)까지만 전환에 포함한다.
  // 데이터 응답까지 기다리면 그동안 화면이 얼어 보이므로 최대 120ms 만 기다린다.
  await viewTransition(() => {
    main = shell(page, mod);
    window.scrollTo(0, 0);
    rendering = Promise.resolve().then(() => mod.render(main, params, query, ctx));
    return Promise.race([rendering.catch(() => {}), new Promise(r => setTimeout(r, 120))]);
  });
  try {
    cleanup = await rendering;
  } catch (e) {
    console.error(e);
    if (seq === navSeq) render(main, html`<div class="page">${errorBox(e instanceof ApiError ? e.message : '문제가 생겼어요.')}</div>`);
  }
}

// errorBox 의 '다시 시도'·'홈으로' 버튼
on(app, 'click', '[data-retry]', () => navigate());
on(app, 'click', '[data-home]', () => { location.hash = '#/'; });

// 상단바 아바타만 갱신(닉네임·사진 변경 직후)
function refreshShellUser() {
  const me = app.querySelector('.topbar__me');
  if (me && state.user) render(me, avatar(state.user, 34));
}

export const go = path => { if (location.hash === '#' + path) navigate(); else location.hash = '#' + path; };
export const reload = () => navigate();

async function boot() {
  setTheme(getTheme());
  // 옛 앱 해시 주소 호환: #/profile/이름 → #/u/이름, #/tests → #/explore
  const h = location.hash;
  if (/^#\/profile\/.+/.test(h)) location.replace('#/u/' + h.slice(10));
  else if (/^#\/(tests|favorites)$/.test(h)) location.replace('#/explore');
  // 옛 서버가 쿼리로 넘기던 소셜 로그인 오류
  const qs = new URLSearchParams(location.search);
  const oauthErr = qs.get('google_error') || qs.get('naver_error');
  if (oauthErr || qs.has('google_token') || qs.has('naver_token')) history.replaceState(null, '', '/' + location.hash);
  if (oauthErr) toast(oauthErr, 'bad');

  if (state.token) {
    try {
      const r = await api.get('/auth/me');
      setUser(r.user);
    } catch (e) {
      if (e.status !== 401) { // 서버·네트워크 문제는 로그아웃시키지 않고 다시 시도 안내
        render(app, html`<main class="main"><div class="page">${errorBox(e.message, 'data-reload')}</div></main>`);
        on(app, 'click', '[data-reload]', () => location.reload());
        return;
      }
    }
  }
  // 로그인/로그아웃이 바뀔 때만 화면을 다시 그림(프로필 수정 같은 갱신은 각 페이지가 처리)
  let wasIn = !!state.user;
  onUser(u => { if (!!u !== wasIn) { wasIn = !!u; navigate(); } else refreshShellUser(); });
  initMotion(app);
  window.addEventListener('hashchange', navigate);
  navigate();
  if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('/sw.js').catch(() => {});
}
boot();
