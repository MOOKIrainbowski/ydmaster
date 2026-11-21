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
export function applyPrefs() {
  const p = getPrefs(), d = document.documentElement.dataset;
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
