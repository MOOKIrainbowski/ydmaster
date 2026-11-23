// 18 가이드 튜토리얼(2026-11-23 사용자 요청: aimonsite 처럼 튜토리얼이 화면을 하나하나 짚으며 설명).
// 화면을 어둡게 덮고, 설명할 부분만 밝게 뚫어(스포트라이트) 옆에 '3 / 9 · 제목 · 설명 · 건너뛰기 / 이전 / 다음' 카드를 띄운다.
// 단계 = { go?: '#/주소' 또는 async () => '#/주소', sel?: 'CSS 선택자(여러 개면 처음 보이는 것)', title, body, before?, after? }
//  - go: 그 화면으로 이동한 뒤 대상이 나타날 때까지 기다림(최대 3초, 없으면 가운데 카드로만 설명)
//  - before/after: 창 열기·닫기처럼 단계 전후에 할 일
// 위치 계산은 화면 맞춤 배율(zoomOf, 14)로 나눠 CSS 좌표로.
import { html, render, icon, closeAllModals } from './ui.js';
import { zoomOf } from './prefs.js';
import { reduced } from './motion.js';

const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
const find = sel => { if (!sel) return null; for (const s of sel.split('|')) { const el = [...document.querySelectorAll(s)].find(visible); if (el) return el; } return null; };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(sel, ms = 3000) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    const el = find(sel);
    if (el && !document.querySelector('.loader-overlay')) return el;
    await wait(80);
  }
  return find(sel);
}

let active = null; // 한 번에 하나만

// steps 를 차례로 보여 준다. 끝까지 보면 true, 건너뛰면 false 로 끝남
export function startTour(steps, { title = '' } = {}) {
  active?.stop(false);
  return new Promise(resolve => {
    const root = document.createElement('div');
    root.className = 'tour'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', title || '가이드 튜토리얼');
    root.innerHTML = '<div class="tour__shade"></div><div class="tour__spot" aria-hidden="true"></div><div class="tour__card" tabindex="-1"></div>';
    document.body.append(root);
    const shade = root.querySelector('.tour__shade'), spot = root.querySelector('.tour__spot'), card = root.querySelector('.tour__card');
    let i = 0, target = null, seq = 0, done = false;

    const place = () => {
      const z = zoomOf(), vw = innerWidth / z, vh = innerHeight / z, pad = 8;
      if (target && target.isConnected) {
        const b = target.getBoundingClientRect();
        const r = { x: b.left / z - pad, y: b.top / z - pad, w: b.width / z + pad * 2, h: b.height / z + pad * 2 };
        Object.assign(spot.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
        spot.hidden = false; shade.hidden = true;
        // 카드: 대상 아래 → 위 → 화면 가운데 아래 순으로 들어가는 곳
        const cw = card.offsetWidth, ch = card.offsetHeight, gap = 14;
        let y = r.y + r.h + gap;
        if (y + ch > vh - 12) y = r.y - ch - gap;
        if (y < 12) y = Math.max(12, vh - ch - 12);
        const x = Math.min(Math.max(12, r.x + r.w / 2 - cw / 2), vw - cw - 12);
        Object.assign(card.style, { left: `${x}px`, top: `${y}px` });
      } else {
        spot.hidden = true; shade.hidden = false;
        Object.assign(card.style, { left: `${(vw - card.offsetWidth) / 2}px`, top: `${Math.max(12, (vh - card.offsetHeight) / 2)}px` });
      }
    };
    const drawCard = () => {
      const s = steps[i], last = i === steps.length - 1;
      render(card, html`<p class="tour__count">${i + 1} / ${steps.length}${title ? html` · ${title}` : ''}</p>
        <h2 class="tour__title">${s.title}</h2>
        <p class="tour__body">${s.body}</p>
        <div class="tour__actions">
          <button class="tour__skip" type="button" data-tour="skip">${last ? '' : '건너뛰기'}</button>
          ${i > 0 ? html`<button class="btn btn--ghost btn--sm" type="button" data-tour="back">${icon('chevronLeft', 16)}이전</button>` : ''}
          <button class="btn btn--primary btn--sm" type="button" data-tour="next">${last ? html`${icon('check', 16)}마쳤어요` : html`다음${icon('chevronRight', 16)}`}</button>
        </div>`);
    };
    const show = async k => {
      const my = ++seq, from = steps[i];
      if (from?.after && k !== i) { try { await from.after(); } catch { /* 다음 단계는 계속 */ } }
      i = k; const s = steps[i];
      card.classList.add('is-moving');
      if (s.go) {
        const to = typeof s.go === 'function' ? await s.go() : s.go;
        if (my !== seq) return;
        if (to && location.hash !== to) { closeAllModals(); location.hash = to; await wait(150); }
      }
      if (s.before) { try { await s.before(); } catch { /* 대상 없이 설명 */ } }
      target = s.sel ? await waitFor(s.sel) : null;
      if (my !== seq || done) return;
      if (target) { target.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); await wait(reduced() ? 0 : 320); }
      if (my !== seq || done) return;
      drawCard(); place();
      card.classList.remove('is-moving');
      card.querySelector('[data-tour="next"]')?.focus({ preventScroll: true });
    };
    const stop = async finished => {
      if (done) return; done = true; seq++;
      try { await steps[i]?.after?.(); } catch { /* 무시 */ }
      root.remove(); removeEventListener('resize', place); removeEventListener('scroll', place, true); document.removeEventListener('keydown', key, true);
      active = null; resolve(finished);
    };
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stop(false); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); i < steps.length - 1 ? show(i + 1) : stop(true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); if (i > 0) show(i - 1); }
      else if (e.key === 'Tab') { e.preventDefault(); const b = [...card.querySelectorAll('button')].filter(x => x.textContent); const at = b.indexOf(document.activeElement); b[(at + (e.shiftKey ? -1 : 1) + b.length) % b.length]?.focus(); }
    };
    root.addEventListener('click', e => {
      const a = e.target.closest('[data-tour]')?.dataset.tour;
      if (a === 'skip') stop(false);
      else if (a === 'back' && i > 0) show(i - 1);
      else if (a === 'next') { i < steps.length - 1 ? show(i + 1) : stop(true); }
    });
    addEventListener('resize', place); addEventListener('scroll', place, true);
    document.addEventListener('keydown', key, true);
    active = { stop };
    show(0);
  });
}
