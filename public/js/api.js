// API 호출 — 계약 §4. 실패는 ApiError{status,message}. 401 이면 로그아웃 후 로그인 화면.
import { state, setUser } from './state.js';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let res, data = null;
  try {
    res = await fetch('/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
    // 본문 읽기도 같은 20초 안에(I-061: 헤더만 오고 본문이 멈추면 로딩이 끝나지 않던 문제)
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { /* JSON 아님 */ }
  } catch (e) {
    throw new ApiError(0, e.name === 'AbortError' ? '응답이 너무 늦어요. 잠시 후 다시 시도해주세요.' : '인터넷 연결을 확인해주세요.');
  } finally { clearTimeout(timer); }
  if (!res.ok) {
    if (res.status === 401 && state.token) {
      setUser(null, null);
      location.hash = '#/login?next=' + encodeURIComponent(location.hash.slice(1) || '/');
    }
    throw new ApiError(res.status, data?.message || `요청을 처리하지 못했어요. (${res.status})`);
  }
  return data;
}

export const api = {
  get: p => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b = {}) => request('PUT', p, b),
  del: p => request('DELETE', p),
};
