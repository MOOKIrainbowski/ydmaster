// 사용자 접근·편의 설정(06, 2026-11-20 사용자 요청: 상단 설정 버튼 → 이용 편의 설정 페이지).
// 이 기기(브라우저)에만 저장한다 — 글자 크기·움직임 같은 설정은 기기마다 다르게 쓰는 경우가 많아서.
// 적용은 <html data-*> 속성 하나로: CSS 가 읽고(app.css '06 설정'), JS(motion·speak)는 getPref 로 읽는다.
import { getTheme, setTheme } from './state.js';

const KEY = 'ydm_prefs_v1';
export const DEFAULTS = {
  font: 'md',          // sm | md | lg | xl  글자·화면 크기
  spacing: 'normal',   // normal | wide       줄 간격
  contrast: false,     // 고대비(테두리·글자 진하게)
  underline: false,    // 링크 밑줄 항상
  motion: 'system',    // system | reduce     애니메이션 줄이기
  aurora: true,        // 배경 오로라
  voiceRate: 0.9,      // 0.6 ~ 1.3 발음 속도(배)
  sfxVolume: 70,       // 0 ~ 100 효과음 크기
  voiceLang: 'en-US',  // en-US | en-GB      발음 억양
  autoSpeak: false,    // 시험에서 영어 문제를 자동으로 읽어 줌
  shortcuts: true,     // 단축키 사용(11)
  choiceNumbers: true, // 숫자 1~5 로 보기 고르기
  keyHints: true,      // 화면에 단축키 안내 표시
  keys: {},            // 바꾼 키만 저장(나머지는 KEY_DEFAULTS)
  autoFit: true,       // 14: 화면 크기에 맞춰 자동 배율(큰 모니터는 키우고, 낮은 노트북 화면은 살짝 줄임)
};
// 단축키(11, 사용자 요청: 설정에 단축키 섹션). 같은 묶음(시험/학습 카드) 안에서는 키가 겹치지 않게 설정 화면이 막는다.
export const KEY_ACTIONS = [
  { id: 'quiz.submit', group: '시험', label: '확인 · 다음 문제', def: 'Enter' },
  { id: 'quiz.skip', group: '시험', label: '모르겠어요', def: 'm' },
  { id: 'quiz.speak', group: '시험', label: '발음 듣기', def: 'p' },
  { id: 'quiz.quit', group: '시험', label: '시험 그만두기', def: 'Escape' },
  { id: 'card.flip', group: '학습 카드', label: '카드 뒤집기', def: ' ' },
  { id: 'card.prev', group: '학습 카드', label: '이전 카드', def: 'ArrowLeft' },
  { id: 'card.next', group: '학습 카드', label: '다음 카드', def: 'ArrowRight' },
  { id: 'card.know', group: '학습 카드', label: '알아요', def: 'ArrowUp' },
  { id: 'card.again', group: '학습 카드', label: '다시 볼래요', def: 'ArrowDown' },
];
const norm = k => (k && k.length === 1 ? k.toLowerCase() : k);
export const keyOf = id => getPrefs().keys?.[id] ?? KEY_ACTIONS.find(a => a.id === id)?.def;
// 키 이벤트가 그 동작인지(단축키 사용이 꺼져 있으면 항상 아님)
export const isKey = (e, id) => getPrefs().shortcuts !== false && !e.ctrlKey && !e.metaKey && !e.altKey && norm(e.key) === norm(keyOf(id));
const KEY_NAME = { ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Enter: 'Enter', Backspace: '⌫' };
export const keyLabel = k => KEY_NAME[k] || (k?.length === 1 ? k.toUpperCase() : k);
let cache;
export function getPrefs() {
  if (!cache) { try { cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { cache = { ...DEFAULTS }; } }
  return cache;
}
export const getPref = k => getPrefs()[k];
export function setPref(k, v) {
  cache = { ...getPrefs(), [k]: v };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* 사생활 모드: 이 화면에서만 */ }
  applyPrefs();
}
export function resetPrefs() {
  cache = { ...DEFAULTS };
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
  setTheme('light');
  applyPrefs();
}
// ── 14 화면 맞춤(사용자 요청: 실행 중인 화면 크기를 분석해 어떤 모니터에서도 최적 배치) ──
// 기준은 1920×1050(풀HD 브라우저 창, 지금 디자인을 맞춘 크기). 그보다 넓고 높으면 같은 비율로 키우고(최대 1.5배),
// 낮은 노트북 화면(높이 800 미만)은 살짝 줄인다. 휴대폰·태블릿(<1024)은 이미 반응형 배치라 1배.
// 글자 크기 설정과 곱해 <html> zoom 하나로 적용. vh·vw 와 좌표 계산은 --z 로 나눠 보정한다(app.css · zoomOf).
const FONT_Z = { sm: 0.92, md: 1, lg: 1.1, xl: 1.22 };
export function screenInfo() {
  const w = innerWidth, h = innerHeight;
  const kind = w < 600 ? 'phone' : w < 1024 ? 'tablet' : w < 1600 ? 'laptop' : w < 2400 ? 'desktop' : 'wide';
  let fit = 1;
  if (w >= 1024) { const r = Math.min(w / 1920, h / 1050); fit = r > 1 ? Math.min(r, 1.5) : h < 800 ? 0.92 : 1; }
  return { w, h, kind, fit: Math.round(fit * 50) / 50, aspect: w / h >= 2 ? 'ultra' : w / h < 1 ? 'portrait' : 'normal' };
}
export const zoomOf = () => parseFloat(document.documentElement.style.getPropertyValue('--z')) || 1;
export function applyPrefs() {
  const p = getPrefs(), d = document.documentElement.dataset, s = screenInfo();
  d.screen = s.kind; d.aspect = s.aspect;
  document.documentElement.style.setProperty('--z', String(Math.round((p.autoFit === false ? 1 : s.fit) * (FONT_Z[p.font] || 1) * 1000) / 1000));
  d.font = p.font; d.spacing = p.spacing;
  p.contrast ? (d.contrast = 'on') : delete d.contrast;
  p.underline ? (d.underline = 'on') : delete d.underline;
  p.motion === 'reduce' ? (d.motion = 'reduce') : delete d.motion;
  p.aurora ? delete d.aurora : (d.aurora = 'off');
}
// 발음 속도: 예전(06) 단계 값('slow'…)도 읽음
const OLD_RATE = { slow: 0.7, normal: 0.9, fast: 1.1 };
export const voiceRate = () => { const v = getPrefs().voiceRate; return typeof v === 'number' ? v : OLD_RATE[v] || 0.9; };
export { getTheme, setTheme };
// 창 크기·모니터가 바뀌면 다시 계산(드래그 중엔 끝난 뒤 한 번)
let fitT = 0;
if (typeof window !== 'undefined') addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(applyPrefs, 150); });
