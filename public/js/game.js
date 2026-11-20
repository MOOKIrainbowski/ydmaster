// 게임 연출(04, 2026-11-20 사용자 요청: 공부가 지치지 않게 게임처럼 성취감) — 효과음·떠오르는 글자·큰 배너·별.
// 점수·경험치·업적 판정은 서버(server/game.js)가 한다. 여기는 보여주기만.
import { html, icon, toast } from './ui.js';
import { api } from './api.js';
import { reduced, burst } from './motion.js';

// ── 효과음: 파일 없이 Web Audio 로 합성(용량 0). 끄기 설정은 이 브라우저에 저장 ──
const SFX_KEY = 'ydm_sfx';
let ctx;
export const sfxOn = () => { try { return localStorage.getItem(SFX_KEY) !== 'off'; } catch { return true; } };
export function setSfx(on) { try { localStorage.setItem(SFX_KEY, on ? 'on' : 'off'); } catch { /* 무시 */ } }
function tone(freq, start, dur, type = 'sine', gain = 0.12) {
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function play(notes) {
  if (!sfxOn()) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    notes.forEach(n => tone(...n));
  } catch { /* 오디오를 못 쓰는 환경 */ }
}
const C = 523.25, E = 659.25, G = 783.99, C6 = 1046.5;
export const sfx = {
  // 연속 정답일수록 음이 한 칸씩 올라감(최대 1옥타브)
  correct: (combo = 0) => { const up = 2 ** (Math.min(combo, 12) / 12); play([[E * up, 0, 0.12, 'triangle'], [G * up, 0.07, 0.2, 'triangle']]); },
  wrong: () => play([[220, 0, 0.18, 'sawtooth', 0.05], [174.6, 0.09, 0.22, 'sawtooth', 0.05]]),
  combo: () => play([[C, 0, 0.1, 'square', 0.05], [E, 0.07, 0.1, 'square', 0.05], [G, 0.14, 0.1, 'square', 0.05], [C6, 0.21, 0.25, 'square', 0.06]]),
  flip: () => play([[880, 0, 0.06, 'sine', 0.05], [1320, 0.03, 0.06, 'sine', 0.04]]),
  finish: () => play([[G, 0, 0.12, 'triangle'], [C6, 0.1, 0.3, 'triangle']]),
  levelUp: () => play([[C, 0, 0.14, 'triangle'], [E, 0.12, 0.14, 'triangle'], [G, 0.24, 0.14, 'triangle'], [C6, 0.36, 0.5, 'triangle', 0.16]]),
  star: k => play([[E * 2 ** (k / 4), 0, 0.18, 'sine', 0.1]]),
};

// ── 떠오르는 글자(+10 XP 등): 요소 위에서 위로 떠오르며 사라짐 ──
export function floatText(el, text, kind = 'xp') {
  if (!el || reduced()) return;
  const r = el.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = `float-text float-text--${kind}`;
  f.textContent = text;
  f.style.left = `${r.left + r.width / 2}px`; f.style.top = `${r.top}px`;
  document.body.append(f);
  setTimeout(() => f.remove(), 1100);
}

// ── 큰 배너(콤보·레벨 업): 화면 가운데에 잠깐 ──
export function banner(title, sub = '', kind = 'combo') {
  const b = document.createElement('div');
  b.className = `game-banner game-banner--${kind}`;
  b.setAttribute('role', 'status');
  b.innerHTML = String(html`<strong>${title}</strong>${sub ? html`<span>${sub}</span>` : ''}`);
  document.body.append(b);
  if (!reduced()) burst(innerWidth / 2, innerHeight * 0.38, kind === 'level' ? 36 : 20);
  setTimeout(() => b.classList.add('is-out'), kind === 'level' ? 2200 : 1100);
  setTimeout(() => b.remove(), kind === 'level' ? 2700 : 1500);
}

// 콤보 단계별 문구
export const COMBO_LINES = { 3: ['3연속!', '손이 풀렸어요'], 5: ['5연속!', '불붙었다'], 10: ['10연속!!', '멈출 수 없어요'], 15: ['15연속!!!', '전설의 시작'], 20: ['20연속', '영단 마스터 등장'] };

// 별 1~3개(점수 기준 50·80·100)
export const starsOf = pct => (pct >= 100 ? 3 : pct >= 80 ? 2 : pct >= 50 ? 1 : 0);
export const starRow = n => html`<div class="stars" role="img" aria-label="별 ${n}개">${[0, 1, 2].map(k => html`<span class="star${k < n ? ' is-on' : ''}" style="--k:${k}">${icon('star', 34)}</span>`)}</div>`;

// 레벨 막대(Lv · 칭호 · 진행)
export const levelBar = g => html`<div class="lvbar" data-lvbar>
  <span class="lvbar__badge">Lv.<b data-lv>${g.level}</b></span>
  <div class="lvbar__main"><p class="lvbar__title"><b data-lvtitle>${g.title}</b><span data-lvnum>${g.into} / ${g.need} XP</span></p>
    <div class="lvbar__track"><i data-lvfill style="--p:${g.need ? g.into / g.need : 0}"></i></div></div></div>`;

// 업적 배지: 단계 1 하(동) · 2 중(은) · 3 상(금)
export const TIER = ['', '하', '중', '상'];
export const badge = a => html`<div class="ach ach--t${a.tier || 1}${a.got ? ' is-got' : ''}" title="${a.desc}"><span class="ach__tier">${TIER[a.tier || 1]}</span><span class="ach__icon">${icon(a.icon, 22)}</span><span class="ach__title">${a.title}</span><span class="ach__desc">${a.desc}</span></div>`;

// 업적 보드: 전체/하/중/상 거르기(홈·프로필 공용)
export function achBoard(list, { filter = 'all' } = {}) {
  const n = t => list.filter(a => (t === 'all' || a.tier === t)).length, g = t => list.filter(a => (t === 'all' || a.tier === t) && a.got).length;
  return html`<div class="ach-board" data-ach-board>
    <div class="seg seg--sm" role="radiogroup" aria-label="업적 단계">${['all', 1, 2, 3].map(t => html`<label class="seg__opt"><input type="radio" name="ach-tier" value="${t}" ${String(t) === String(filter) ? 'checked' : ''}><span>${t === 'all' ? '전체' : TIER[t]} <small>${g(t)} / ${n(t)}</small></span></label>`)}</div>
    <div class="ach-grid">${list.filter(a => filter === 'all' || a.tier === Number(filter)).sort((a, b) => (b.got - a.got) || (a.tier - b.tier)).map(badge)}</div></div>`;
}
// 보드의 단계 칩을 누르면 다시 그림
export function bindAchBoard(root, getList) { // getList: 지금 목록을 돌려주는 함수(화면이 다시 불러와도 최신)
  const fn = e => { if (e.target.name !== 'ach-tier') return; const box = e.target.closest('[data-ach-board]'); box.outerHTML = String(achBoard(getList(), { filter: e.target.value })); };
  root.addEventListener('change', fn);
  return () => root.removeEventListener('change', fn);
}

// 업적: 이미 본 것은 브라우저에 기억해 "새로 달성" 만 축하
export function newAchievements(userId, list) {
  const key = `ydm_ach_seen:${userId}`;
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(key) || '[]'); } catch { /* 무시 */ }
  const got = list.filter(a => a.got).map(a => a.id);
  try { localStorage.setItem(key, JSON.stringify(got)); } catch { /* 무시 */ }
  return list.filter(a => a.got && !seen.includes(a.id));
}

// ── 퀘스트(05) ──
export const GUIDE_TITLES = { start: '영단마스터 둘러보기', vocab: '단어 세트 만들기', passage: '본문 세트 만들기', test: '시험 보기', wrong: '오답 복습', cards: '학습 카드', game: '경험치·레벨·업적·퀘스트', social: '랭킹·친구·공유' };
const GROUP = { daily: '오늘의 퀘스트', start: '첫걸음 퀘스트', guide: '가이드 퀘스트' };
const questTitle = q => (q.group === 'guide' ? `가이드 읽기: ${GUIDE_TITLES[q.desc] || q.desc}` : q.title);
export const questRow = q => html`<li class="quest quest--${q.status}">
  <span class="quest__icon" aria-hidden="true">${icon(q.status === 'claimed' ? 'check' : q.group === 'daily' ? 'clock' : q.group === 'guide' ? 'lightbulb' : 'flame', 18)}</span>
  <div class="quest__main"><p class="quest__title">${questTitle(q)}</p>
    ${q.group !== 'guide' ? html`<p class="quest__desc">${q.desc}</p>` : ''}
    ${q.progress && q.status === 'todo' ? html`<div class="quest__bar"><i style="--p:${q.progress[0] / q.progress[1]}"></i></div><span class="quest__num">${q.progress[0]} / ${q.progress[1]}</span>` : ''}</div>
  <span class="quest__xp">+${q.xp} XP</span>
  ${q.status === 'ready' ? html`<button class="btn btn--primary btn--sm" data-claim="${q.id}">보상 받기</button>`
    : q.status === 'claimed' ? html`<span class="quest__done">받음</span>` : html`<a class="btn btn--ghost btn--sm" href="${q.go}">하러 가기</a>`}
</li>`;
// 그룹별 목록. groups 로 보여줄 묶음을 고름(가이드 퀘스트는 가이드 화면에서)
export function questBoard(quests, groups = ['daily', 'start']) {
  return html`<div class="quest-board">${groups.map(gr => { const list = quests.filter(q => q.group === gr); if (!list.length) return '';
    const left = list.filter(q => q.status !== 'claimed').length;
    return html`<section class="quest-group"><h3 class="quest-group__title">${GROUP[gr]} <small>${list.length - left} / ${list.length}</small></h3><ul class="quest-list">${list.sort((a, b) => ({ ready: 0, todo: 1, claimed: 2 }[a.status] - { ready: 0, todo: 1, claimed: 2 }[b.status])).map(questRow)}</ul></section>`; })}</div>`;
}
// 보상 받기(서버가 조건·중복 판정). 성공하면 +XP 연출, 레벨이 오르면 배너. 결과를 돌려줌
export async function claimQuest(id, from) {
  try {
    const r = await api.post(`/quests/${id}/claim`);
    if (!r.already) {
      floatText(from, `+${r.xp} XP`); sfx.correct(4);
      if (r.levelUp) { sfx.levelUp(); banner(`레벨 업! Lv.${r.level.level}`, r.level.title, 'level'); }
    }
    return r;
  } catch (e) { toast(e.message, 'bad'); return null; }
}
// 보고형 퀘스트(가이드 읽기·학습 카드)는 조용히 받기 — 이미 받았으면 아무 일 없음
export async function reportQuest(id, from) {
  try { const r = await api.post(`/quests/${id}/claim`); if (!r.already) { floatText(from, `퀘스트 완료 +${r.xp} XP`, 'good'); if (r.levelUp) banner(`레벨 업! Lv.${r.level.level}`, r.level.title, 'level'); } return r; } catch { return null; }
}

