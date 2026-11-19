// 재배포 감지 → "새로고침" 알림(02 D11).
// 접속 시 /api/version 을 기억하고, 60초마다·탭으로 돌아올 때 다시 확인해 다르면 알림을 띄운다.
// 강제로 새로고침하지 않는다: 풀던 문제(서버 저장)·쓰던 세트(자동 임시저장)를 사용자가 확인하고 누르게.
import { html, icon } from './ui.js';

let base = null;          // 이 화면을 연 시점의 배포 버전
let open = false;
let snoozeUntil = 0;      // "나중에" 를 누르면 10분 동안 다시 띄우지 않음
const SNOOZE = 10 * 60e3;

async function fetchVersion() {
  const r = await fetch('/api/version', { cache: 'no-store' });
  if (!r.ok) throw new Error('version');
  return (await r.json()).version;
}

async function check() {
  if (document.hidden || open || Date.now() < snoozeUntil) return;
  try {
    const v = await fetchVersion();
    if (base === null) base = v;
    else if (v !== base) show();
  } catch { /* 오프라인·일시 오류는 다음 확인 때 */ }
}

function show() {
  open = true;
  const el = document.createElement('div');
  el.className = 'update-toast glass';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-labelledby', 'update-title');
  el.setAttribute('aria-describedby', 'update-desc');
  el.innerHTML = String(html`
    <span class="update-toast__icon" aria-hidden="true">${icon('refresh', 22)}</span>
    <div class="update-toast__text">
      <strong id="update-title">새 버전이 배포됐어요</strong>
      <span id="update-desc">새로고침하면 바로 적용돼요. 작성 중인 세트와 푼 문제는 저장돼 있어요.</span>
    </div>
    <div class="update-toast__actions">
      <button class="btn btn--ghost btn--sm" data-later>나중에</button>
      <button class="btn btn--primary btn--sm" data-reload>${icon('refresh', 16)}새로고침</button>
    </div>`);
  document.body.append(el);
  const close = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 320);
    open = false;
  };
  el.querySelector('[data-reload]').addEventListener('click', async () => {
    // 편집 중인 페이지가 마지막 임시저장을 하도록 알리고, 서비스워커도 새 파일을 받게 한 뒤 새로고침
    window.dispatchEvent(new Event('ydm:before-reload'));
    try { await (await navigator.serviceWorker?.getRegistration())?.update(); } catch { /* 없으면 그냥 */ }
    location.reload();
  });
  el.querySelector('[data-later]').addEventListener('click', () => { snoozeUntil = Date.now() + SNOOZE; close(); });
  el.querySelector('[data-reload]').focus({ preventScroll: true });
}

export function initUpdateCheck() {
  check();
  setInterval(check, 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('online', check);
  // 확인용(개발): 콘솔에서 window.__ydmShowUpdate() 로 알림 모양을 볼 수 있다
  window.__ydmShowUpdate = () => { if (!open) show(); };
}
