// 앱 셸 + 해시 라우터 — 계약 §4. 페이지 모듈은 필요할 때만 불러온다(첫 로드 최소화, R4).
import { state, setUser, onUser, getTheme, setTheme } from './state.js';
import { api, ApiError } from './api.js';
import { html, render, icon, on, toast, closeAllModals, errorBox, avatar } from './ui.js';

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

function shell(active, focus) {
  const u = state.user;
  render(app, html`
    <a class="skip-link" href="#main">본문으로 건너뛰기</a>
    <header class="topbar">
      <a class="topbar__brand" href="#/">영단마스터</a>
      ${u ? html`<nav class="topbar__nav" aria-label="주요 메뉴">${TABS.map(t => html`<a class="topbar__link${t.match.includes(active) ? ' is-active' : ''}" href="${t.href}"${t.match.includes(active) ? html` aria-current="page"` : ''}>${t.label}</a>`)}</nav>
        <a class="topbar__me" href="#/me" aria-label="내 정보">${avatar(u, 32)}</a>`
      : html`<a class="btn btn--primary btn--sm" href="#/login">로그인</a>`}
    </header>
    <main class="main" id="main" tabindex="-1"></main>
    ${u ? html`<nav class="tabbar" aria-label="주요 메뉴">${TABS.map(t => html`<a class="tabbar__item${t.match.includes(active) ? ' is-active' : ''}" href="${t.href}"${t.match.includes(active) ? html` aria-current="page"` : ''}>${icon(t.icon, 22)}<span>${t.label}</span></a>`)}</nav>` : ''}`);
  app.classList.toggle('app--focus', !!focus);
  app.classList.toggle('app--guest', !u);
  return document.getElementById('main');
}

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
  const main = shell(page, mod.focus);
  document.title = mod.title ? `${typeof mod.title === 'function' ? mod.title(params) : mod.title} · 영단마스터` : '영단마스터';
  window.scrollTo(0, 0);
  try {
    // 페이지는 isCurrent() 로 자기 화면이 아직 떠 있는지 확인해 늦은 응답이 새 화면을 덮지 않게 한다(I-037)
    const ctx = { isCurrent: () => seq === navSeq };
    cleanup = await mod.render(main, params, query, ctx);
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
  if (me && state.user) render(me, avatar(state.user, 32));
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
  window.addEventListener('hashchange', navigate);
  navigate();
  if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('/sw.js').catch(() => {});
}
boot();
