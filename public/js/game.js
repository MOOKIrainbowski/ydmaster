// 게임 연출(04, 2026-11-20 사용자 요청: 공부가 지치지 않게 게임처럼 성취감) — 효과음·떠오르는 글자·큰 배너·별.
// 점수·경험치·업적 판정은 서버(server/game.js)가 한다. 여기는 보여주기만.
import { html, icon, toast, modal, render, $ } from './ui.js';
import { api } from './api.js';
import { reduced, burst } from './motion.js';
import { getPref, zoomOf } from './prefs.js';

// ── 효과음: 파일 없이 Web Audio 로 합성(용량 0). 끄기 설정은 이 브라우저에 저장 ──
// 15(사용자 요청: 더 다양하고 음색이 풍성하게): 한 음 = 살짝 어긋난 오실레이터 + 배음 + 필터 엔벨로프,
// 모든 소리는 공용 버스(잔향 · 컴프레서)를 거쳐 공간감 있게. 효과마다 악기(벨 · 플럭 · 패드 · 마림바 · 신스 · 노이즈)를 달리해 겹치지 않게.
const SFX_KEY = 'ydm_sfx';
let ctx, bus, verb;
export const sfxOn = () => { try { return localStorage.getItem(SFX_KEY) !== 'off'; } catch { return true; } };
export function setSfx(on) { try { localStorage.setItem(SFX_KEY, on ? 'on' : 'off'); } catch { /* 무시 */ } }
const vol = () => Math.max(0, Math.min(100, Number(getPref('sfxVolume') ?? 70))) / 70; // 설정의 효과음 크기(07), 70 = 원래 크기

// 공용 출력: 마른 소리 + 잔향(노이즈로 만든 1.4초 임펄스) → 컴프레서(여러 소리가 겹쳐도 찢어지지 않게)
function setup() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
  comp.connect(ctx.destination);
  bus = ctx.createGain(); bus.gain.value = 0.9; bus.connect(comp);
  const len = Math.round(ctx.sampleRate * 1.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let n = 0; n < len; n++) d[n] = (Math.random() * 2 - 1) * (1 - n / len) ** 3.2; }
  const conv = ctx.createConvolver(); conv.buffer = ir;
  verb = ctx.createGain(); verb.gain.value = 0.28;
  verb.connect(conv).connect(comp);
}
// 엔벨로프: 빠르게 올라갔다가 dur 동안 지수로 줄어듦
function env(g, t, peak, dur, attack = 0.008) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function out(node, wet) { node.connect(bus); if (wet) { const s = ctx.createGain(); s.gain.value = wet; node.connect(s).connect(verb); } }
// 한 음. o: { type, gain, detune(센트, 좌우 두 개), harm(배음 비율), cutoff(저역 필터 시작→끝), q, glide(끝 주파수), wet(잔향), attack }
function voice(freq, at, dur, o = {}) {
  const gain = (o.gain ?? 0.1) * vol();
  if (gain <= 0) return;
  const t = ctx.currentTime + at;
  const g = ctx.createGain(); env(g, t, gain, dur, o.attack);
  let head = g;
  if (o.cutoff) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.cutoff[0], t); f.frequency.exponentialRampToValueAtTime(o.cutoff[1], t + dur);
    g.connect(f); head = f;
  }
  out(head, o.wet ?? 0.5);
  const parts = [[1, 1], ...(o.harm || []).map((r, k) => [r, 0.5 / (k + 2)])];
  for (const [ratio, amp] of parts) for (const det of o.detune ? [-o.detune, o.detune] : [0]) {
    const osc = ctx.createOscillator(), a = ctx.createGain();
    osc.type = o.type || 'sine'; osc.detune.value = det;
    osc.frequency.setValueAtTime(freq * ratio, t);
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide * ratio, t + dur * 0.9);
    a.gain.value = amp / (o.detune ? 2 : 1);
    osc.connect(a).connect(g); osc.start(t); osc.stop(t + dur + 0.05);
  }
}
// 노이즈 한 번(바람 · 종이 · 펑): band = [시작, 끝] 띠 필터 주파수가 미끄러짐
function noise(at, dur, band, gain = 0.08, wet = 0.3) {
  gain *= vol();
  if (gain <= 0) return;
  const t = ctx.currentTime + at, len = Math.round(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let n = 0; n < len; n++) d[n] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(band[0], t); f.frequency.exponentialRampToValueAtTime(band[1], t + dur);
  const g = ctx.createGain(); env(g, t, gain, dur, 0.01);
  src.connect(f).connect(g); out(g, wet); src.start(t);
}
// 악기 프리셋
const INST = {
  bell: { type: 'sine', harm: [2.76, 5.4], gain: 0.09, wet: 0.7 },          // 맑은 유리종
  pluck: { type: 'triangle', detune: 6, cutoff: [5200, 700], gain: 0.11, wet: 0.35 }, // 짧게 튕김
  pad: { type: 'sawtooth', detune: 12, cutoff: [1600, 900], gain: 0.035, attack: 0.08, wet: 0.8 }, // 부드럽게 퍼짐
  marimba: { type: 'sine', harm: [4, 10], gain: 0.12, wet: 0.3, attack: 0.003 }, // 나무
  synth: { type: 'square', detune: 8, cutoff: [3800, 1200], q: 4, gain: 0.04, wet: 0.45 }, // 밝은 게임 신스
  bass: { type: 'triangle', cutoff: [900, 200], gain: 0.13, wet: 0.15 },     // 낮게 둥
};
const N = s => 440 * 2 ** (s / 12); // A4 기준 반음 수 → 주파수. C5=3, E5=7, G5=10, C6=15
// 음 목록 재생: [악기, 반음, 시작(초), 길이(초), 덮어쓸 옵션], extra = 노이즈 등 추가 소리
function play(notes, extra) {
  if (!sfxOn()) return;
  try {
    if (!ctx) setup();
    if (ctx.state === 'suspended') ctx.resume();
    notes.forEach(([inst, semi, at, dur, o]) => voice(N(semi), at, dur, { ...INST[inst], ...o }));
    extra?.();
  } catch { /* 오디오를 못 쓰는 환경 */ }
}
export const sfx = {
  // 정답: 맑은 벨 두 음 + 위로 반짝. 연속 정답일수록 반음씩 올라감(최대 1옥타브)
  correct: (combo = 0) => { const u = Math.min(combo, 12); play([['bell', 7 + u, 0, 0.5], ['bell', 10 + u, 0.07, 0.6], ['pluck', 15 + u, 0.07, 0.25, { gain: 0.05 }]]); },
  // 오답: 낮게 둥 하고 내려가는 두 음(거슬리는 톱니 대신 둥근 소리)
  wrong: () => play([['bass', -9, 0, 0.32, { glide: N(-11) }], ['pluck', -2, 0.02, 0.22, { cutoff: [1400, 300], gain: 0.07 }], ['pluck', -6, 0.12, 0.3, { cutoff: [1200, 250], gain: 0.07 }]]),
  // 콤보: 신스 아르페지오가 휙 올라가며 마지막에 반짝
  combo: () => play([3, 7, 10, 15, 19].map((s, k) => ['synth', s, k * 0.055, 0.18]).concat([['bell', 22, 0.28, 0.8, { gain: 0.06 }]]), () => noise(0, 0.3, [800, 6000], 0.03)),
  // 카드 넘김: 종이 스치는 소리 + 작은 톡
  flip: () => play([['marimba', 15, 0.02, 0.12, { gain: 0.05 }]], () => noise(0, 0.12, [2500, 6000], 0.06, 0.1)),
  // 시험 끝: 플럭 셋이 올라가고 패드가 받쳐 줌
  finish: () => play([['pluck', 3, 0, 0.3], ['pluck', 7, 0.1, 0.3], ['pluck', 10, 0.2, 0.3], ['bell', 15, 0.3, 1.1], ['pad', 3, 0.28, 1.2], ['pad', 10, 0.28, 1.2]]),
  // 레벨 업: 팡파르(신스 + 벨) → 화음 패드 → 반짝이 꼬리
  levelUp: () => play([
    ['synth', 3, 0, 0.14], ['synth', 7, 0.11, 0.14], ['synth', 10, 0.22, 0.14], ['synth', 15, 0.33, 0.5, { gain: 0.05 }],
    ['bell', 15, 0.33, 1.4], ['bell', 19, 0.45, 1.2, { gain: 0.06 }], ['bell', 22, 0.57, 1.2, { gain: 0.05 }],
    ['pad', 3, 0.33, 1.6], ['pad', 7, 0.33, 1.6], ['pad', 10, 0.33, 1.6], ['bass', -9, 0.33, 0.8],
  ], () => noise(0.3, 0.9, [3000, 9000], 0.025, 0.8)),
  // 별: 하나씩 높아지는 유리종
  star: k => play([['bell', 15 + [0, 4, 7][k % 3], 0, 0.9, { gain: 0.08 }], ['marimba', 27 + [0, 4, 7][k % 3], 0.01, 0.2, { gain: 0.03 }]]),
  // ── 15 새로 만든 소리 ──
  tick: () => play([['marimba', 22, 0, 0.06, { gain: 0.05, wet: 0.1 }]]),                       // 끄는 카드가 자리를 바꿀 때
  drop: () => play([['marimba', 10, 0, 0.18], ['marimba', 3, 0.05, 0.22, { gain: 0.08 }]]),     // 카드 내려놓기
  place: () => play([['marimba', 7 + Math.floor(Math.random() * 3) * 2, 0, 0.14, { gain: 0.08 }]]), // 어순 조각 놓기(높이가 조금씩 다름)
  unplace: () => play([['marimba', 3, 0, 0.12, { gain: 0.06 }]]),
  skip: () => play([['pluck', 3, 0, 0.18, { gain: 0.06 }], ['pluck', -2, 0.08, 0.25, { gain: 0.05 }]]), // 모르겠어요: 어깨 으쓱
  pop: () => play([['bell', 19, 0.02, 0.3, { gain: 0.05 }]], () => noise(0, 0.08, [600, 2400], 0.12, 0.2)), // 마스코트 펑
  boing: () => play([['bass', 3, 0, 0.35, { glide: N(15), gain: 0.1 }]]),                       // 마스코트 튕겨 돌아옴
  chirp: () => play([['bell', 22, 0, 0.12, { glide: N(27), gain: 0.05 }], ['bell', 27, 0.1, 0.16, { glide: N(31), gain: 0.05 }]]), // 마스코트 대답
  sparkle: () => play([27, 31, 34, 39].map((s, k) => ['bell', s, k * 0.06, 0.6, { gain: 0.04 }])), // 무지개 · 비밀
  achieve: () => play([['bell', 10, 0, 1], ['bell', 15, 0.12, 1.2], ['bell', 19, 0.24, 1.4], ['pad', 3, 0.1, 1.4], ['pad', 10, 0.1, 1.4]], () => noise(0.2, 0.8, [4000, 10000], 0.02, 0.9)),
  coin: () => play([['bell', 14, 0, 0.12, { gain: 0.07 }], ['bell', 19, 0.08, 0.7, { gain: 0.08 }], ['marimba', 31, 0.08, 0.2, { gain: 0.03 }]]), // 퀘스트 보상(동전)
  whoosh: () => play([], () => noise(0, 0.35, [400, 3000], 0.05, 0.4)),                          // 화면 넘어감
};

// ── 떠오르는 글자(+10 XP 등): 요소 위에서 위로 떠오르며 사라짐 ──
export function floatText(el, text, kind = 'xp') {
  if (!el || reduced()) return;
  const r = el.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = `float-text float-text--${kind}`;
  f.textContent = text;
  const z = zoomOf(); f.style.left = `${(r.left + r.width / 2) / z}px`; f.style.top = `${r.top / z}px`; // 14: 화면 → CSS 좌표
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
export const TIER = ['', '하', '중', '상', '최상', '전설']; // 08: 최상·전설 추가
export const badge = a => html`<div class="ach ach--t${a.tier || 1}${a.got ? ' is-got' : ''}" title="${a.desc}"><span class="ach__tier">${TIER[a.tier || 1]}</span><span class="ach__icon">${icon(a.icon, 22)}</span><span class="ach__title">${a.title}</span><span class="ach__desc">${a.desc}</span></div>`;

// 업적 보드: 전체/하/중/상 거르기(홈·프로필 공용)
// 10(사용자 요청): 달성하지 못한 업적은 보이지 않게(클리어 조건을 미리 알 수 없게), 기본 3줄만 + 더보기
export function achBoard(all, { filter = 'all', expanded = false } = {}) {
  const list = all.filter(a => a.got);
  const n = t => list.filter(a => (t === 'all' || a.tier === t)).length, g = n;
  return html`<div class="ach-board" data-ach-board>
    <div class="seg seg--sm" role="radiogroup" aria-label="업적 단계">${['all', 1, 2, 3, 4, 5].map(t => html`<label class="seg__opt"><input type="radio" name="ach-tier" value="${t}" ${String(t) === String(filter) ? 'checked' : ''}><span>${t === 'all' ? '전체' : TIER[t]} <small>${g(t)} / ${n(t)}</small></span></label>`)}</div>
    ${list.length ? html`<div class="ach-grid ach-grid--rows${expanded ? '' : ' is-collapsed'}">${list.filter(a => filter === 'all' || a.tier === Number(filter)).sort((a, b) => b.tier - a.tier).map(badge)}</div>
      <button class="quest-more" type="button" data-ach-board-more hidden>${icon(expanded ? 'chevronUp' : 'chevronDown', 16)}<span>${expanded ? '접기' : '더보기'}</span></button>`
    : html`<p class="ach-none">${icon('trophy', 28)}<span>아직 달성한 업적이 없어요. 공부하다 보면 업적이 하나씩 나타나요!</span></p>`}</div>`;
}
// 보드의 단계 칩을 누르면 다시 그림
export function bindAchBoard(root, getList) { // getList: 지금 목록을 돌려주는 함수(화면이 다시 불러와도 최신)
  // 3줄 넘게 있을 때만 더보기(줄 수는 화면 폭에 따라 칸 수가 달라 실제로 숨은 칸이 있는지로 판단)
  const sync = () => root.querySelectorAll('[data-ach-board]').forEach(b => {
    const grid = b.querySelector('.ach-grid'), btn = b.querySelector('[data-ach-board-more]');
    if (!grid || !btn) return;
    btn.hidden = !grid.classList.contains('is-collapsed') ? false : ![...grid.children].some(x => getComputedStyle(x).display === 'none');
  });
  let filter = 'all';
  const fn = e => { if (e.target.name !== 'ach-tier') return; filter = e.target.value; const box = e.target.closest('[data-ach-board]'); box.outerHTML = String(achBoard(getList(), { filter })); sync(); };
  const more = e => {
    const b = e.target.closest?.('[data-ach-board-more]'); if (!b) return;
    const box = b.closest('[data-ach-board]'), open = box.querySelector('.ach-grid').classList.contains('is-collapsed');
    box.outerHTML = String(achBoard(getList(), { filter, expanded: open })); sync();
    if (!open) root.querySelector('[data-ach-board]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  root.addEventListener('change', fn); root.addEventListener('click', more);
  requestAnimationFrame(sync); addEventListener('resize', sync);
  return () => { root.removeEventListener('change', fn); root.removeEventListener('click', more); removeEventListener('resize', sync); };
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
const GROUP = { daily: '오늘의 퀘스트', weekly: '주간 퀘스트', start: '첫걸음 퀘스트', guide: '가이드 퀘스트' };
const questTitle = q => (q.group === 'guide' ? `가이드 읽기: ${GUIDE_TITLES[q.desc] || q.desc}` : q.title);
export const questRow = (q, more = false) => html`<li class="quest quest--${q.status}"${more ? html` hidden data-more-item` : ''}>
  <span class="quest__icon" aria-hidden="true">${icon(q.status === 'claimed' ? 'check' : q.group === 'daily' ? 'clock' : q.group === 'weekly' ? 'trophy' : q.group === 'guide' ? 'lightbulb' : 'flame', 18)}</span>
  <div class="quest__main"><p class="quest__title">${questTitle(q)}</p>
    ${q.group !== 'guide' ? html`<p class="quest__desc">${q.desc}</p>` : ''}
    ${q.progress && q.status === 'todo' ? html`<div class="quest__bar"><i style="--p:${q.progress[0] / q.progress[1]}"></i></div><span class="quest__num">${q.progress[0]} / ${q.progress[1]}</span>` : ''}</div>
  <span class="quest__xp">+${q.xp} XP</span>
  ${q.status === 'ready' ? html`<button class="btn btn--primary btn--sm" data-claim="${q.id}">보상 받기</button>`
    : q.status === 'claimed' ? html`<span class="quest__done">받음${q.claimedAt ? html`<small>${fmtClaim(q.claimedAt)}</small>` : ''}</span>` : html`<a class="btn btn--ghost btn--sm" href="${q.go}">하러 가기</a>`}
</li>`;
const QUEST_PAGE = 5;
const fmtClaim = d => new Date(d).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// ── 19 퀘스트 창(사용자 요청: 서브 버튼 '퀘스트' → 페이지 이동 없이 창으로) ──
// 묶음: 오늘의 · 주간 · 첫걸음(가이드 퀘스트 포함). 정렬: 기본(받을 수 있는 것 먼저) · 보상 많은/적은 순 · 최근/오래된 클리어 순
const TABS_Q = [['daily', '오늘의 퀘스트', ['daily']], ['weekly', '주간 퀘스트', ['weekly']], ['start', '첫걸음 퀘스트', ['start', 'guide']]];
const SORTS = [['default', '기본(받을 수 있는 것 먼저)'], ['xpDesc', '보상 많은 순'], ['xpAsc', '보상 적은 순'], ['doneDesc', '최근 클리어 순'], ['doneAsc', '오래된 클리어 순']];
const ORDER_ST = { ready: 0, todo: 1, claimed: 2 };
const sortQuests = (list, by) => {
  const t = q => (q.claimedAt ? Date.parse(q.claimedAt) : null);
  return [...list].sort((a, b) => {
    if (by === 'xpDesc') return b.xp - a.xp || ORDER_ST[a.status] - ORDER_ST[b.status];
    if (by === 'xpAsc') return a.xp - b.xp || ORDER_ST[a.status] - ORDER_ST[b.status];
    if (by === 'doneDesc' || by === 'doneAsc') { // 클리어 안 한 것은 뒤로
      const x = t(a), y = t(b);
      if (x === null || y === null) return (x === null) - (y === null) || ORDER_ST[a.status] - ORDER_ST[b.status];
      return by === 'doneDesc' ? y - x : x - y;
    }
    return ORDER_ST[a.status] - ORDER_ST[b.status];
  });
};
// 20(사용자 요청): 받을 보상이 있으면 깃발 버튼에 알림처럼 빨간 숫자. 화면 이동 때(30초에 한 번까지)·시험 결과·보상 받은 뒤 갱신
let readyN = 0, readyAt = 0;
const paintQuestBadge = () => document.querySelectorAll('[data-quest-count]').forEach(b => { b.textContent = readyN > 99 ? '99+' : String(readyN); b.hidden = !readyN; });
export const questBadge = () => html`<span class="notif-badge" data-quest-count ${readyN ? '' : 'hidden'}>${readyN > 99 ? '99+' : readyN}</span>`;
export async function refreshQuestBadge(force = false) {
  if (!force && Date.now() - readyAt < 30e3) { paintQuestBadge(); return; }
  readyAt = Date.now();
  try { readyN = (await api.get('/quests/ready')).ready; } catch { /* 다음에 다시 */ }
  paintQuestBadge();
}
export async function openQuests() {
  let quests, tab = 'daily', by = 'default', onChange = null;
  try { quests = (await api.get('/quests')).quests; } catch (e) { toast(e.message, 'bad'); return; }
  readyN = quests.filter(q => q.status === 'ready').length; readyAt = Date.now(); paintQuestBadge();
  await modal({
    title: '퀘스트', wide: true, actions: [],
    body: el => {
      const draw = () => {
        const [, , groups] = TABS_Q.find(x => x[0] === tab), list = sortQuests(quests.filter(q => groups.includes(q.group)), by);
        render(el, html`<div class="qm">
          <div class="qm__bar"><div class="tabs qm__tabs" role="tablist">${TABS_Q.map(([id, label, gs]) => { const all = quests.filter(q => gs.includes(q.group)), ready = all.filter(q => q.status === 'ready').length;
            return html`<button class="tabs__tab${tab === id ? ' is-active' : ''}" type="button" role="tab" aria-selected="${tab === id ? 'true' : 'false'}" data-qtab="${id}">${label}<small>${all.filter(q => q.status === 'claimed').length}/${all.length}</small>${ready ? html`<span class="qm__dot" aria-label="받을 보상 ${ready}개">${ready}</span>` : ''}</button>`; })}</div>
            <label class="qm__sort"><span class="sr-only">정렬</span>${icon('arrowUpDown', 16)}<select class="select" data-qsort>${SORTS.map(([v, l]) => html`<option value="${v}" ${v === by ? 'selected' : ''}>${l}</option>`)}</select></label></div>
          <p class="qm__note muted">${tab === 'daily' ? '매일 자정(한국 시간)에 다시 열려요.' : tab === 'weekly' ? '매주 월요일 0시(한국 시간)에 다시 열려요. 조건이 까다로운 만큼 보상이 커요.' : '처음 한 번만 받을 수 있어요. 가이드 투어를 끝까지 봐도 받아요.'}</p>
          <ul class="quest-list qm__list">${list.map(q => questRow(q))}</ul></div>`);
      };
      draw();
      onChange = async (e) => {
        const tb = e.target.closest?.('[data-qtab]');
        if (tb) { tab = tb.dataset.qtab; draw(); return; }
        const cl = e.target.closest?.('[data-claim]');
        if (cl) {
          cl.disabled = true;
          const r = await claimQuest(cl.dataset.claim, cl);
          if (r) { try { quests = (await api.get('/quests')).quests; } catch { /* 그대로 */ } readyN = quests.filter(q => q.status === 'ready').length; readyAt = Date.now(); paintQuestBadge(); draw(); } else cl.disabled = false;
        }
      };
      el.addEventListener('click', onChange);
      el.addEventListener('change', e => { if (e.target.matches('[data-qsort]')) { by = e.target.value; draw(); $('[data-qsort]', el)?.focus(); } });
    },
  });
}
// 그룹별 목록. groups 로 보여줄 묶음을 고름(가이드 퀘스트는 가이드 화면에서)
export function questBoard(quests, groups = ['daily', 'start']) {
  return html`<div class="quest-board">${groups.map(gr => { const list = quests.filter(q => q.group === gr); if (!list.length) return '';
    const left = list.filter(q => q.status !== 'claimed').length;
    const sorted = list.sort((a, b) => ({ ready: 0, todo: 1, claimed: 2 }[a.status] - { ready: 0, todo: 1, claimed: 2 }[b.status]));
    // 06: 한 묶음에 5개 넘게 있으면 5개만 보이고 맨 아래 '더보기'(누를 때마다 5개씩)
    return html`<section class="quest-group"><h3 class="quest-group__title">${GROUP[gr]} <small>${list.length - left} / ${list.length}</small></h3><ul class="quest-list">${sorted.map((q, k) => questRow(q, k >= QUEST_PAGE))}</ul>${sorted.length > QUEST_PAGE ? html`<button class="quest-more" type="button" data-quest-more>${icon('chevronDown', 16)}<span>더보기 (${sorted.length - QUEST_PAGE}개 더)</span></button>` : ''}</section>`; })}</div>`;
}
// 보상 받기(서버가 조건·중복 판정). 성공하면 +XP 연출, 레벨이 오르면 배너. 결과를 돌려줌
export async function claimQuest(id, from) {
  try {
    const r = await api.post(`/quests/${id}/claim`);
    if (!r.already) {
      floatText(from, `+${r.xp} XP`); sfx.coin();
      if (r.levelUp) { sfx.levelUp(); banner(`레벨 업! Lv.${r.level.level}`, r.level.title, 'level'); }
    }
    return r;
  } catch (e) { toast(e.message, 'bad'); return null; }
}
// 보고형 퀘스트(가이드 읽기·학습 카드)는 조용히 받기 — 이미 받았으면 아무 일 없음
export async function reportQuest(id, from) {
  try { const r = await api.post(`/quests/${id}/claim`); if (!r.already) { floatText(from, `퀘스트 완료 +${r.xp} XP`, 'good'); if (r.levelUp) banner(`레벨 업! Lv.${r.level.level}`, r.level.title, 'level'); } return r; } catch { return null; }
}


// 퀘스트 '더보기': 숨긴 항목을 5개씩 펼치고, 다 펼치면 '접기'
export function bindQuestMore(root) {
  const fn = e => {
    const b = e.target.closest?.('[data-quest-more]');
    if (!b) return;
    const group = b.closest('.quest-group');
    const hidden = [...group.querySelectorAll('[data-more-item][hidden]')];
    if (hidden.length) {
      hidden.slice(0, QUEST_PAGE).forEach(x => { x.hidden = false; x.classList.add('is-new'); });
    } else {
      group.querySelectorAll('[data-more-item]').forEach(x => { x.hidden = true; });
      group.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const left = group.querySelectorAll('[data-more-item][hidden]').length;
    b.innerHTML = String(left ? html`${icon('chevronDown', 16)}<span>더보기 (${left}개 더)</span>` : html`${icon('chevronUp', 16)}<span>접기</span>`);
  };
  root.addEventListener('click', fn);
  return () => root.removeEventListener('click', fn);
}
