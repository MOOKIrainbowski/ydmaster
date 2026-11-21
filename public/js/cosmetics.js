// 프로필 꾸미기 화면 쪽(09, 2026-11-21 사용자 요청). 해금·장착 판정은 서버(server/game.js) — 여기는 그리기만.
// 칭호마다 글자색·애니메이션·효과가 모두 다르게: fx(효과 조합) + 색 3개. 효과 CSS 는 app.css '09 칭호'.
import { html } from './ui.js';

// [효과들, 색1, 색2, 색3] — 같은 조합이 없도록(테스트 대신 아래 UNIQUE 확인)
export const TITLE_FX = {
  // 상(3)
  attempts200: ['emboss', '#94A3B8', '#475569', '#1E293B'],
  perfect20: ['shine', '#F59E0B', '#FDE68A', '#B45309'],
  streak30: ['flame', '#F97316', '#DC2626', '#FACC15'],
  learned1000: ['pulse', '#2563EB', '#60A5FA', '#1E3A8A'],
  modes11: ['wave', '#7C3AED', '#C084FC', '#4C1D95'],
  passage30: ['flow', '#0EA5E9', '#14B8A6', '#0369A1'],
  cleared200: ['bounce', '#16A34A', '#86EFAC', '#14532D'],
  maker10: ['emboss', '#D97706', '#FBBF24', '#78350F'],
  level10: ['sparkle', '#DB2777', '#F9A8D4', '#831843'],
  level17: ['shine flow', '#E11D48', '#C026D3', '#7C3AED'],
  // 최상(4)
  attempts500: ['glitch', '#06B6D4', '#F43F5E', '#0F172A'],
  perfect50: ['shine sparkle', '#FCD34D', '#FFFBEB', '#D97706'],
  streak60: ['flame', '#3B82F6', '#A855F7', '#67E8F9'],
  learned2000: ['frost', '#67E8F9', '#E0F2FE', '#0891B2'],
  passage100: ['wave flow', '#14B8A6', '#5EEAD4', '#0F766E'],
  cleared500: ['neon', '#22C55E', '#BBF7D0', '#052E16'],
  review30: ['pulse flow', '#8B5CF6', '#F0ABFC', '#5B21B6'],
  maker30: ['bounce', '#F97316', '#FDBA74', '#7C2D12'],
  public10: ['float halo', '#F9A8D4', '#FFFFFF', '#EC4899'],
  friend15: ['flow pulse', '#F472B6', '#60A5FA', '#A78BFA'],
  level20: ['emboss shine', '#FDE68A', '#B45309', '#451A03'],
  quests50: ['neon', '#EC4899', '#FBCFE8', '#500724'],
  // 전설(5)
  attempts1000: ['rainbow emboss', '#F43F5E', '#F59E0B', '#8B5CF6'],
  perfect100: ['shine sparkle halo', '#E5E7EB', '#FFFFFF', '#9CA3AF'],
  streak100: ['flame rainbow', '#F43F5E', '#F59E0B', '#FDE047'],
  streak365: ['flame float halo', '#FBBF24', '#EF4444', '#FDE68A'],
  learned5000: ['frost wave', '#A7F3D0', '#ECFEFF', '#059669'],
  cleared1000: ['glitch neon', '#F8FAFC', '#94A3B8', '#020617'],
  level30: ['rainbow flow sparkle', '#F43F5E', '#22C55E', '#8B5CF6'],
  collector: ['holo shine float', '#C4B5FD', '#99F6E4', '#FBCFE8'],
};
export const TIER_NAME = ['', '하', '중', '상', '최상', '전설'];

// 칭호 배지: 물결·통통 효과는 글자마다 지연을 주려고 한 글자씩 감싼다
export function titleTag(t, { small = false } = {}) {
  if (!t) return '';
  const [fx, c1, c2, c3] = TITLE_FX[t.id] || ['shine', '#E11D48', '#C026D3', '#7C3AED'];
  const perChar = /\b(wave|bounce)\b/.test(fx);
  const text = perChar ? [...t.name].map((ch, i) => html`<span class="ttl__ch" style="--i:${i}">${ch === ' ' ? ' ' : ch}</span>`) : t.name;
  return html`<span class="ttl ttl--t${t.tier}${small ? ' ttl--sm' : ''} ${fx.split(' ').map(f => `fx-${f}`).join(' ')}" style="--c1:${c1};--c2:${c2};--c3:${c3}" data-text="${t.name}" title="${TIER_NAME[t.tier]} 등급 칭호"><span class="ttl__text">${text}</span></span>`;
}

// 프로필 카드에 붙일 클래스(색·카드 테두리) / 아바타 감싸개 클래스(사진 테두리)
export const cardClass = c => `pf-color--${c?.color || 'rose'} pf-border--${c?.border || 'none'}`;
export const frameClass = c => `pf-frame--${c?.frame || 'none'}`;

// 15 카드 효과: 카드 위를 떠다니는 입자 14개. 위치·속도·크기는 번호로 정해(같은 프로필은 늘 같은 모양) 렌더마다 흔들리지 않게.
const FX_N = 14;
export function fxLayer(c) {
  const id = c?.effect;
  if (!id || id === 'none') return '';
  return html`<span class="pf-fx pf-fx--${id}" aria-hidden="true">${Array.from({ length: FX_N }, (_, k) => html`<i style="--k:${k};--x:${(k * 37 + 11) % 100}%;--y:${(k * 53 + 29) % 90}%;--d:${5 + ((k * 7) % 6)}s;--s:${0.7 + ((k * 5) % 7) / 10}"></i>`)}</span>`;
}
