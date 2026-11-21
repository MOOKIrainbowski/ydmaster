// 화면 공용 도구 — 계약 §4. 모든 페이지는 이것으로 마크업을 만들고 이벤트를 단다.
// 핵심 규칙: 사용자 문자열은 html`` 이 자동 이스케이프한다(옛 앱의 innerHTML XSS 경로 I-045 차단).

import { getPref, voiceRate } from './prefs.js';

class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);

// 이미 안전한 마크업임을 표시(신뢰하는 고정 문자열·icon() 결과에만)
export const raw = s => new Safe(String(s ?? ''));

function part(v) {
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  // 불리언은 글자로("true"/"false"): aria-selected="${a === b}" 같은 속성 값이 비지 않게.
  // 조건부 렌더는 `${cond ? html`…` : ''}` 삼항으로 쓴다(`&&` 금지 — false 가 글자로 찍힘).
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return String(v);
  return esc(v);
}
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1];
  return new Safe(out);
}
// 요소 내용 교체
export function render(el, content) { el.innerHTML = part(content); return el; }

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// 이벤트 위임: on(root, 'click', '[data-act="del"]', (e, el) => ...). 해제 함수 반환.
export function on(root, type, selector, handler, opts) {
  const fn = e => {
    const el = e.target.closest?.(selector);
    if (el && root.contains(el)) handler(e, el);
  };
  root.addEventListener(type, fn, opts);
  return () => root.removeEventListener(type, fn, opts);
}

// ── 토스트: 길이에 비례해 오래 보이고(옛 3.2초 고정 문제), 스크린리더에 읽힘 ──
let toastRegion;
export function toast(msg, type = 'info') {
  if (!toastRegion) {
    toastRegion = document.createElement('div');
    toastRegion.className = 'toast-region';
    toastRegion.setAttribute('role', 'status');
    toastRegion.setAttribute('aria-live', 'polite');
    document.body.append(toastRegion);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = part(html`${icon(type === 'ok' ? 'check' : type === 'bad' ? 'alert' : 'info', 18)}<span>${msg}</span>`);
  toastRegion.append(el);
  while (toastRegion.children.length > 3) toastRegion.firstChild.remove();
  setTimeout(() => el.remove(), Math.min(8000, 2500 + String(msg).length * 60));
}

// ── 모달: 스택 지원, Esc·바깥 클릭으로 닫힘, 포커스 가두기·복귀 ──
// actions: [{ id, label, kind: 'primary'|'danger'|'ghost' }] → 누른 id 로 resolve, 닫으면 null.
// body 가 함수면 (bodyEl, close) 로 호출해 폼 등을 직접 그리게 한다.
export function modal({ title, body, actions = [{ id: 'ok', label: '확인', kind: 'primary' }], wide = false }) {
  return new Promise(resolve => {
    const prev = document.activeElement;
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = part(html`
      <div class="modal${wide ? ' modal--wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="m-title">
        <div class="modal__head">
          <h2 class="modal__title" id="m-title">${title}</h2>
          <button class="btn btn--icon btn--ghost" data-close aria-label="닫기">${icon('x', 20)}</button>
        </div>
        <div class="modal__body">${typeof body === 'function' ? '' : body}</div>
        ${actions.length ? html`<div class="modal__actions">${actions.map(a => html`<button class="btn btn--${a.kind || 'ghost'}" data-action="${a.id}">${a.label}</button>`)}</div>` : ''}
      </div>`);
    const close = val => {
      back.remove(); document.removeEventListener('keydown', key, true);
      prev?.focus?.(); resolve(val ?? null);
    };
    const key = e => {
      if (back !== document.querySelector('.modal-backdrop:last-of-type')) return; // 가장 위 모달만
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
      if (e.key === 'Tab') { // 포커스 가두기
        const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', back).filter(x => !x.disabled);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    back.addEventListener('mousedown', e => { if (e.target === back) close(null); });
    on(back, 'click', '[data-close]', () => close(null));
    on(back, 'click', '[data-action]', (e, el) => close(el.dataset.action));
    document.addEventListener('keydown', key, true);
    document.body.append(back);
    if (typeof body === 'function') body($('.modal__body', back), close);
    ($('input, textarea, select', back) || $('[data-action]', back) || $('[data-close]', back))?.focus();
  });
}
export const closeAllModals = () => $$('.modal-backdrop').forEach(m => m.querySelector('[data-close]')?.click());

export async function confirmDialog(message, { title = '확인', ok = '확인', danger = false } = {}) {
  const r = await modal({ title, body: html`<p>${message}</p>`, actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: ok, kind: danger ? 'danger' : 'primary' }] });
  return r === 'ok';
}

// 버튼 중복 클릭 방지: 작업 동안 disabled + 진행 표시(옛 앱 이중 제출 I-039)
export async function busy(btn, fn) {
  if (!btn || btn.disabled) return;
  btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  try { return await fn(); } finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
}

// ── 아이콘(인라인 SVG, stroke 24 격자). 이모지 아이콘 금지(디자인 §3-9) ──
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm3.5-12.5-2 5-5 2 2-5z',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm0 0v16M8 7h7',
  text: 'M4 6h16M4 10h16M4 14h10M4 18h12',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-6 10a6 6 0 0 1 12 0M16 3.5a4 4 0 0 1 0 7M21 21a6 6 0 0 0-4-5.6',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17l9-10',
  alert: 'M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-5v-4m0-4h.01',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 3-4.3-4.3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  play: 'M7 4v16l13-8z',
  volume: 'M11 5 6 9H3v6h3l5 4zm4.5 3.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  volumeOff: 'M11 5 6 9H3v6h3l5 4zm5 4.5 5 5m0-5-5 5',
  chevronLeft: 'm15 18-6-6 6-6',
  chevronRight: 'm9 18 6-6-6-6',
  chevronUp: 'm18 15-6-6-6 6',
  chevronDown: 'm6 9 6 6 6-6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-14v5l3 2',
  flame: 'M12 21c-4 0-7-2.7-7-6.5C5 10 9 8 9 3c3 2 5 4.5 5 7 1-1 1.5-2 1.5-3.5C18 8.5 19 11.5 19 14.5 19 18.3 16 21 12 21z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  bell: 'M6 9a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8zM10 21h4',
  chat: 'M4 5h16v11H8l-4 4z',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 20h16',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  refresh: 'M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  lightbulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  layers: 'm12 3 9 5-9 5-9-5zm-9 9 9 5 9-5M3 16l9 5 9-5',
  grip: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
  arrowUpDown: 'M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3',
};
export function icon(name, size = 20) {
  return raw(`<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name] || ''}"/></svg>`);
}

// ── 형식 ──
export function fmtDate(d) {
  if (!d) return '';
  const t = new Date(d), diff = (Date.now() - t) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
  return t.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}
export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? `${m}분 ${s}초` : `${s}초`;
}

// ── 상태 표시 ──
export const skeleton = (n = 3) => html`<div class="skeleton-list" aria-busy="true" aria-label="불러오는 중">${Array.from({ length: n }, () => html`<div class="skeleton"></div>`)}</div>`;
export const empty = ({ icon: ic = 'info', title, desc = '', action = '' }) =>
  html`<div class="empty">${icon(ic, 40)}<p class="empty__title">${title}</p>${desc ? html`<p class="empty__desc">${desc}</p>` : ''}${action}</div>`;
export const errorBox = (message, retryAttr = 'data-retry') =>
  html`<div class="empty empty--error" role="alert">${icon('alert', 40)}<p class="empty__title">불러오지 못했어요</p><p class="empty__desc">${message}</p><button class="btn btn--ghost" ${raw(retryAttr)}>${icon('refresh', 18)}다시 시도</button></div>`;

// 사용자 아바타: 이미지 URL 이 있으면 img, 없으면 첫 글자
export const avatar = (u, size = 40) => u?.avatarUrl
  ? html`<img class="avatar" src="${u.avatarUrl}" alt="" width="${size}" height="${size}" style="--size:${size}px" loading="lazy">` // --size 가 없으면 사진 아바타만 40px 로 줄던 문제(05)
  : html`<span class="avatar avatar--letter" style="--size:${size}px" aria-hidden="true">${(u?.username || '?')[0].toUpperCase()}</span>`;

// 로고 마크 = 마스코트 '영이' 머리(03 결정 M1, 에셋은 public/brand/logo.svg 한 곳)
export const logoMark = () => raw('<img class="logo-mark" src="/brand/logo.svg" alt="" width="64" height="64" decoding="async">');

// 영어 발음(브라우저 TTS). 없는 환경은 조용히 무시.
// 속도·억양은 설정(prefs.js, 06)을 따른다
export function speak(text, lang) {
  if (!('speechSynthesis' in window)) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang || getPref('voiceLang'); u.rate = voiceRate();
  speechSynthesis.speak(u);
  return true;
}
