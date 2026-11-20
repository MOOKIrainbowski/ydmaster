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
};
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
