// 앱 셸 + 해시 라우터 — 계약 §4. 페이지 모듈은 필요할 때만 불러온다(첫 로드 최소화, R4).
import { state, setUser, onUser, getTheme, setTheme } from './state.js';
import { api, ApiError } from './api.js';
import { html, render, icon, on, toast, closeAllModals, errorBox, empty, avatar, logoMark, modal, stopSpeak } from './ui.js';
import { initMotion, viewTransition } from './motion.js';
import { initUpdateCheck } from './update.js';
import { applyPrefs } from './prefs.js';
import { showLoader, hideLoader } from './loader.js';
import { initNotifications, notifBadge } from './notify.js';

const ROUTES = [
  ['/', 'home'], ['/explore', 'explore'], ['/sets/:id', 'set'], ['/sets/:id/edit', 'editor'], ['/new/:kind', 'editor'],
  ['/play/:id', 'play'], ['/result/:id', 'result'], ['/wrong', 'wrong'], ['/history', 'history'], ['/ranking', 'ranking'],
  ['/friends', 'friends'], ['/me', 'me'], ['/me/edit', 'profile-edit'], ['/u/:username', 'user'], ['/notice', 'notice'], ['/inquiry', 'inquiry'],
  ['/admin', 'admin'], ['/login', 'login'], ['/oauth', 'oauth'], ['/guide', 'guide'], ['/settings', 'settings'],
].map(([pattern, page]) => ({ page, keys: [...pattern.matchAll(/:(\w+)/g)].map(m => m[1]), re: new RegExp('^' + pattern.replace(/:\w+/g, '([^/]+)') + '/?$') }));

// 하단 탭바(모바일)·상단 링크(데스크톱)에 같은 목록을 쓴다 → 선택 표시가 한 원본(I-042)
// 06: 메뉴 글자·아이콘에도 각자 view-transition-name 을 준다. 화면 전환 중 이름 붙은 알약(pill)만 따로 떠서
//     글자를 덮던 문제 — 글자도 따로 떠야 알약 위(그리는 순서상 뒤)에 그려진다.
// 14(사용자 요청): 위 메뉴의 '내 정보' 는 프로필 사진 버튼과 겹쳐서 뺌. 휴대폰 아래 탭은 프로필 버튼이 없어 그대로 둔다.
// 18(사용자 요청): 메인 버튼 = 홈·둘러보기·세트 만들기·오답·랭킹·공지사항. 위에서는 가운데 한 덩어리(배경 층), 휴대폰은 아래 탭바.
//   세트 만들기(create)는 페이지가 아니라 '단어/본문 중 무엇을 만들지' 묻는 창을 연다.
const TABS = [
  { href: '#/', label: '홈', icon: 'home', match: ['home'] },
  { href: '#/explore', label: '둘러보기', icon: 'compass', match: ['explore'] },
  { create: true, label: '세트 만들기', icon: 'plusSquare', match: ['editor'] },
  { href: '#/wrong', label: '오답', icon: 'target', match: ['wrong'] },
  { href: '#/ranking', label: '랭킹', icon: 'trophy', match: ['ranking'] },
];
// 19(사용자 요청: 메인 버튼은 세트 만들기 포함 5개, 가장 중요한 것으로): 홈 · 둘러보기 · 세트 만들기 · 오답 · 랭킹 = 공부의 흐름(고르기 → 만들기 → 복습 → 경쟁).
//   공지사항은 서브 버튼으로 돌려보냄. 퀘스트는 서브 버튼(누르면 창).
const ME = { href: '#/me', label: '내 정보', icon: 'user', match: ['me', 'history', 'profile-edit', 'settings'] };
// 메인 버튼 페이지끼리 오갈 때는 로딩 화면 없이 바로(18, 사용자 요청)
const MAIN_PAGES = new Set(['home', 'explore', 'wrong', 'ranking']);
let lastPage = '';
// 메인 버튼 하나(위·아래 공용). i 는 화면 전환 이름(view-transition-name)용 번호
const tabItem = (t, i, active, cls, size) => {
  const on_ = t.match.includes(active);
  const inner = html`${on_ ? pill(`${cls}__pill`) : ''}<span class="${cls === 'tabbar' ? 'tabbar__ic' : 'topbar__ic'}" style="view-transition-name:${cls === 'tabbar' ? 'tab-ic' : 'top-label'}-${i};view-transition-class:navlabel">${icon(t.icon, size)}</span>`;
  const c = `${cls === 'tabbar' ? 'tabbar__item' : 'topbar__link'}${on_ ? ' is-active' : ''}${t.create ? ' is-create' : ''}`;
  return t.create
    ? html`<button class="${c}" type="button" data-create-set aria-label="${t.label}" title="${t.label}" aria-haspopup="dialog">${inner}</button>`
    : html`<a class="${c}" href="${t.href}" aria-label="${t.label}" title="${t.label}"${on_ ? html` aria-current="page"` : ''}>${inner}</a>`;
};
// 세트 만들기: 단어/본문 고르기 창 → 고른 쪽 만들기 화면으로
async function askCreate() {
  const pick = await modal({
    title: '어떤 세트를 만들까요?', actions: [],
    body: html`<div class="create-pick">
      <button class="create-pick__opt" type="button" data-action="vocab"><span class="kind-tile kind-tile--vocab">${icon('book', 26)}</span><b>단어 세트</b><small>영어 단어와 뜻을 적어 카드·시험으로 외워요</small></button>
      <button class="create-pick__opt" type="button" data-action="passage"><span class="kind-tile kind-tile--passage">${icon('text', 26)}</span><b>본문 세트</b><small>교과서·모의고사 본문을 붙여 넣어 문장별로 공부해요</small></button>
    </div>`,
  });
  if (pick) location.hash = `#/new/${pick}`;
}
// 17(사용자 요청): 위 메뉴는 글자 없이 아이콘만 · 가이드 버튼 삭제 · 문의/공지사항/친구 를 위로 올리고 프로필 '내 메뉴'에서는 뺌.
//   휴대폰에서도 위 도구 줄은 보이므로 이 셋은 어디서든 한 번에 닿는다.
const TOOLS = [
  { href: '#/inquiry', label: '문의', icon: 'chat', page: 'inquiry' },
  { href: '#/notice', label: '공지사항', icon: 'megaphone', page: 'notice' },
  { href: '#/friends', label: '친구', icon: 'users', page: 'friends' },
  { href: '#/settings', label: '설정', icon: 'settings', page: 'settings' },
];
const toolLink = (t, active) => html`<a class="topbar__help${active === t.page ? ' is-active' : ''}" href="${t.href}" aria-label="${t.label}" title="${t.label}"${active === t.page ? html` aria-current="page"` : ''}>${icon(t.icon, 20)}</a>`;

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
      <a class="topbar__brand" href="#/" aria-label="영단마스터 홈">${logoMark()}<span class="topbar__name">영단마스터</span></a>
      ${u ? html`<nav class="topbar__nav" aria-label="주요 메뉴">${TABS.map((t, i) => tabItem(t, i, active, 'topbar', 22))}</nav>
        <div class="topbar__right"><div class="topbar__tools">
          ${TOOLS.map(t => toolLink(t, active))}
          <button class="topbar__help" type="button" data-quests-open aria-label="퀘스트" title="퀘스트" aria-haspopup="dialog">${icon('flag', 20)}</button>
          <button class="topbar__help topbar__bell" type="button" data-notif aria-label="알림" aria-haspopup="dialog" aria-expanded="false" title="알림">${icon('bell', 20)}${notifBadge()}</button>
        </div>
        <a class="topbar__me${ME.match.includes(active) ? ' is-active' : ''}" href="#/me" aria-label="내 정보" title="내 정보"${ME.match.includes(active) ? html` aria-current="page"` : ''}>${avatar(u, 34)}</a></div>`
      : active === 'login' ? '' : html`<div class="topbar__guest"><a class="topbar__help topbar__settings" href="#/settings" aria-label="설정" title="설정">${icon('settings', 20)}</a><a class="btn btn--ghost btn--sm" href="#/login">로그인</a><a class="btn btn--primary btn--sm" href="#/login?tab=register">무료로 시작</a></div>`}
    </header>
    <main class="main" id="main" tabindex="-1"></main>
    ${u ? html`<nav class="tabbar glass" aria-label="주요 메뉴">${[...TABS, ME].map((t, i) => tabItem(t, i, active, 'tabbar', 24))}</nav>` : ''}`);
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

// 15: 화면 준비가 늦으면(100ms+, 16) 마스코트 로딩 화면. 그 사이 다른 곳으로 이동했으면 새 이동이 닫는다.
async function navigate() {
  const mine = navSeq + 1;
  stopSpeak(); // 18: 다른 화면으로 가면 읽던 발음도 멈춤
  const next = parse().page;
  if (!(MAIN_PAGES.has(next) && MAIN_PAGES.has(lastPage))) showLoader(); // 18: 메인 버튼끼리는 로딩 화면 없이
  lastPage = next;
  try { await route(); } finally { if (mine === navSeq) hideLoader(); }
  // 18: 처음 로그인해 홈에 오면 '둘러보기' 튜토리얼을 한 번 자동으로(건너뛰어도 다시 뜨지 않음, 가이드에서 언제든 다시)
  if (mine === navSeq && next === 'home' && state.user) {
    let seen = true; try { seen = !!localStorage.getItem('ydm_tour_start'); if (!seen) localStorage.setItem('ydm_tour_start', '1'); } catch { /* 저장 못 하면 띄우지 않음 */ }
    if (!seen) setTimeout(() => import('./pages/guide.js').then(m => m.runChapter('start')), 900);
  }
}
async function route() {
  const seq = ++navSeq;
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* 페이지 정리 실패가 이동을 막지 않게 */ } }
  cleanup = null;
  closeAllModals();
  let { page, params, query } = parse();
  if (page === 'home' && !state.user) page = 'landing';
  // 없는 주소: 모듈을 불러보지 않고 바로 안내(예전엔 notfound.js 를 받으려다 404·콘솔 오류가 났음)
  if (page === 'notfound') {
    render(shell(page), html`<div class="page">${empty({ icon: 'compass', title: '없는 페이지예요', desc: '주소가 바뀌었거나 삭제된 화면이에요.', action: html`<button class="btn btn--primary" data-home>${icon('home', 18)}홈으로</button>` })}</div>`);
    document.title = '없는 페이지 · 영단마스터';
    return;
  }
  let mod;
  try {
    mod = (await import(`./pages/${page}.js`)).default;
  } catch (e) {
    console.error(e);
    if (seq !== navSeq) return;
    render(shell(page), html`<div class="page">${errorBox('화면을 불러오지 못했어요. 새로고침해 주세요.')}</div>`);
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
on(app, 'click', '[data-create-set]', () => askCreate());
on(app, 'click', '[data-quests-open]', () => import('./game.js').then(m => m.openQuests()));

// 상단바 아바타만 갱신(닉네임·사진 변경 직후)
function refreshShellUser() {
  const me = app.querySelector('.topbar__me');
  if (me && state.user) render(me, avatar(state.user, 34));
}

// textarea 는 쓰는 만큼 자란다(2026-11-20 사용자 요청). CSS field-sizing 을 모르는 브라우저(Firefox·Safari)만 높이를 직접 맞춤.
if (!CSS.supports?.('field-sizing', 'content')) {
  const fit = t => { t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight + 2, 420)}px`; };
  document.addEventListener('input', e => { if (e.target.matches?.('textarea.input')) fit(e.target); });
  // 저장된 내용으로 다시 그린 textarea 도 처음부터 내용 높이로
  new MutationObserver(() => app.querySelectorAll('textarea.input').forEach(t => { if (t.value && !t.style.height) fit(t); }))
    .observe(app, { childList: true, subtree: true });
}

export const go = path => { if (location.hash === '#' + path) navigate(); else location.hash = '#' + path; };
export const reload = () => navigate();

async function boot() {
  setTheme(getTheme());
  applyPrefs();
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
  initUpdateCheck();
  initNotifications(app);
  window.addEventListener('hashchange', navigate);
  navigate();
  if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('/sw.js').catch(() => {});
}
boot();
