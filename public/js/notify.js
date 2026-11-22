// 알림(10, 2026-11-21 사용자 요청: 가이드·설정 버튼 옆 알림 버튼 — 친구 요청·수락, 업적·레벨, 문의 답변, 공지 등).
// 알림은 서버가 만든다(learn.js notify). 여기는 상단바 종 버튼의 안 읽음 수와 펼침 목록만.
// 안 읽음 수는 화면 이동마다·1분마다·탭으로 돌아올 때 가볍게 확인(/notifications/unread).
import { api } from './api.js';
import { state } from './state.js';
import { html, render, icon, fmtDate } from './ui.js';

const ICON = { friend_req: 'users', friend_ok: 'users', achievement: 'trophy', level: 'star', inquiry: 'chat', notice: 'megaphone', welcome: 'lightbulb' };
let unread = 0, panel = null, items = [];

const paintBadge = () => document.querySelectorAll('[data-notif-count]').forEach(b => { b.textContent = unread > 99 ? '99+' : String(unread); b.hidden = !unread; });
export async function refreshUnread() {
  if (!state.user) return;
  try { unread = (await api.get('/notifications/unread')).unread; paintBadge(); } catch { /* 다음에 다시 */ }
}

const row = n => html`<li><a class="notif${n.read ? '' : ' is-unread'}" href="${n.link || '#/'}" data-notif-id="${n._id}">
  <span class="notif__icon notif__icon--${n.type}" aria-hidden="true">${icon(ICON[n.type] || 'bell', 18)}</span>
  <span class="notif__main"><b>${n.title}</b><span>${n.body}</span><time>${fmtDate(n.createdAt)}</time></span>
  ${n.read ? '' : html`<i class="notif__dot" aria-label="안 읽음"></i>`}</a></li>`;
function draw() {
  render(panel, html`<div class="notif-panel__head"><b>알림</b>${unread ? html`<button class="link-btn link-btn--strong" type="button" data-notif-all>모두 읽음</button>` : ''}</div>
    ${items.length ? html`<ul class="notif-list">${items.map(row)}</ul>` : html`<p class="notif-empty">${icon('bell', 28)}<span>새 알림이 없어요</span></p>`}`);
}
function close() { panel?.remove(); panel = null; document.removeEventListener('click', outside, true); document.removeEventListener('keydown', esc); document.querySelector('[data-notif]')?.setAttribute('aria-expanded', 'false'); }
const outside = e => { if (panel && !panel.contains(e.target) && !e.target.closest('[data-notif]')) close(); };
const esc = e => { if (e.key === 'Escape') { close(); document.querySelector('[data-notif]')?.focus(); } };

async function open(btn) {
  panel = document.createElement('div');
  panel.className = 'notif-panel glass';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '알림');
  panel.innerHTML = String(html`<p class="notif-empty">불러오는 중…</p>`);
  document.body.append(panel);
  btn.setAttribute('aria-expanded', 'true');
  document.addEventListener('click', outside, true);
  document.addEventListener('keydown', esc);
  try { const r = await api.get('/notifications'); items = r.items; unread = r.unread; paintBadge(); if (panel) draw(); }
  catch (e) { if (panel) render(panel, html`<p class="notif-empty">${e.message}</p>`); }
  panel?.addEventListener('click', async e => {
    if (e.target.closest('[data-notif-all]')) { const r = await api.post('/notifications/read', { all: true }).catch(() => null); if (r) { unread = r.unread; items = items.map(x => ({ ...x, read: true })); paintBadge(); draw(); } return; }
    const a = e.target.closest('[data-notif-id]');
    if (a) { const n = items.find(x => String(x._id) === a.dataset.notifId); close(); if (n && !n.read) { api.post('/notifications/read', { ids: [n._id] }).then(r => { unread = r.unread; paintBadge(); }).catch(() => {}); } }
  });
}

// main.js 가 한 번 부름: 종 버튼 클릭(위임) + 주기 확인
export function initNotifications(app) {
  app.addEventListener('click', e => {
    const b = e.target.closest('[data-notif]');
    if (!b) return;
    e.preventDefault();
    panel ? close() : open(b);
  });
  window.addEventListener('hashchange', () => { close(); refreshUnread(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshUnread(); });
  setInterval(() => { if (!document.hidden) refreshUnread(); }, 60e3);
  refreshUnread();
}
export const notifBadge = () => html`<span class="notif-badge" data-notif-count ${unread ? '' : 'hidden'}>${unread > 99 ? '99+' : unread}</span>`;
