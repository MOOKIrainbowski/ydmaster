import { zoomOf } from './prefs.js';
// 모션 엔진(02 D5) — 페이지는 표시만 붙이면 된다:
//   class="reveal" style="--i:3"   → 화면에 보일 때 순차 등장
//   data-count="128"               → 0 에서 128 까지 카운트업(보일 때 1회)
//   class="spotlight"              → 마우스를 따라오는 빛
// 직접 호출: burst(x, y), shake(el), pop(el), viewTransition(fn)
// 모두 prefers-reduced-motion 을 존중한다.

// 기기의 '동작 줄이기' 또는 설정 페이지의 '애니메이션 줄이기'(06, html[data-motion=reduce])
export const reduced = () => document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── 등장·카운트업: #app 아래 새로 생긴 요소를 자동 처리 ──
let io;
function observe(el) {
  if (!io) {
    io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        activate(e.target);
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
  }
  io.observe(el);
}
function activate(el) {
  if (el.classList.contains('reveal')) el.classList.add('is-in');
  if (el.dataset.count !== undefined && !el.dataset.counted) { el.dataset.counted = '1'; countUp(el, Number(el.dataset.count) || 0); }
}
const SEL = '.reveal:not(.is-in), [data-count]:not([data-counted])';
function scan(root) {
  if (!root.querySelectorAll) return;
  const els = [...(root.matches(SEL) ? [root] : []), ...root.querySelectorAll(SEL)];
  // 첫 그림이 끝난 다음 프레임에 붙여야 transition 이 실제로 재생된다
  requestAnimationFrame(() => els.forEach(observe));
}

export function countUp(el, to, ms = 900) {
  const fmt = n => Math.round(n).toLocaleString('ko-KR');
  if (reduced() || to === 0) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = t => {
    const p = Math.min(1, (t - t0) / ms);
    el.textContent = fmt(to * (1 - Math.pow(1 - p, 4))); // easeOutQuart
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── spotlight: 포인터 위치를 카드 안 좌표로 ──
let spotRaf = 0, spotEvt = null;
function onPointer(e) {
  spotEvt = e;
  if (spotRaf) return;
  spotRaf = requestAnimationFrame(() => {
    spotRaf = 0;
    const el = spotEvt.target.closest?.('.spotlight');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const z = zoomOf();
    el.style.setProperty('--mx', `${(spotEvt.clientX - r.left) / z}px`);
    el.style.setProperty('--my', `${(spotEvt.clientY - r.top) / z}px`);
  });
}

// ── 정답 파티클 ──
const COLORS = ['#E11D48', '#C026D3', '#7C3AED', '#FB7185', '#A78BFA', '#FDE68A'];
export function burst(x, y, n = 18) {
  if (reduced()) return;
  const b = document.createElement('div');
  b.className = 'burst';
  const z = zoomOf(); b.style.left = `${x / z}px`; b.style.top = `${y / z}px`; // 14: 화면 좌표 → CSS 좌표
  for (let k = 0; k < n; k++) {
    const i = document.createElement('i');
    const ang = (Math.PI * 2 * k) / n + Math.random() * 0.5;
    const dist = 50 + Math.random() * 70;
    i.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
    i.style.setProperty('--dy', `${Math.sin(ang) * dist - 20}px`);
    i.style.setProperty('--rot', `${Math.random() * 540 - 270}deg`);
    i.style.setProperty('--c', COLORS[k % COLORS.length]);
    if (k % 3 === 0) i.style.borderRadius = '50%';
    b.append(i);
  }
  document.body.append(b);
  setTimeout(() => b.remove(), 900);
}
export const burstAt = (el, n) => { const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, n); };

// 클래스 애니메이션 1회 재생(.is-shake / .is-pop 은 tokens.css 에 정의)
function replay(el, cls) {
  if (!el || reduced()) return;
  el.classList.remove(cls);
  void el.offsetWidth; // 같은 요소에서 다시 재생되도록 리플로
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}
export const shake = el => replay(el, 'is-shake');
export const pop = el => replay(el, 'is-pop');

// ── 화면 전환: View Transitions 지원 시 부드럽게, 아니면 그대로 ──
export function viewTransition(update) {
  if (!document.startViewTransition || reduced()) { const r = update(); return Promise.resolve(r); }
  const t = document.startViewTransition(update);
  t.ready.catch(() => {}); // 빠른 연속 이동으로 취소돼도 조용히
  return t.updateCallbackDone;
}

export function initMotion(app) {
  new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n); })
    .observe(app, { childList: true, subtree: true });
  scan(app);
  document.addEventListener('pointermove', onPointer, { passive: true });
}
