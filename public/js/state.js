// 로그인 상태만 전역으로 둔다. 페이지 데이터는 각 페이지가 직접 불러온다(옛 앱의 전역 S 가 화면 간에 남던 문제 I-037).
const TOKEN_KEY = 'ydmaster_token';
const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* 사생활 모드 */ } };

// '로그인 유지'(04): 켜면 localStorage(브라우저를 닫아도 유지), 끄면 sessionStorage(탭·브라우저를 닫으면 로그아웃)
const sread = k => { try { return sessionStorage.getItem(k); } catch { return null; } };
const swrite = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* 무시 */ } };
export const state = { token: read(TOKEN_KEY) || sread(TOKEN_KEY), user: null };
const subs = new Set();

export function setUser(user, token, persist = true) {
  state.user = user;
  if (token !== undefined) {
    state.token = token;
    write(TOKEN_KEY, token && persist ? token : null);
    swrite(TOKEN_KEY, token && !persist ? token : null);
  }
  subs.forEach(fn => fn(user));
}
export function onUser(fn) { subs.add(fn); return () => subs.delete(fn); }

// 테마: 'light' | 'dark' | 'system'(기본). html[data-theme] 로 반영(디자인 §3-2)
export function getTheme() { return read('ydmaster_theme_v2') || 'system'; }
export function setTheme(t) {
  write('ydmaster_theme_v2', t === 'system' ? null : t);
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
}
