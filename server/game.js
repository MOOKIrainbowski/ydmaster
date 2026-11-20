// 게임 요소 규칙(04, 2026-11-20 사용자 요청: 공부가 지치지 않게 게임처럼 성취감을).
// 서버 판정 원칙(R5): 경험치·레벨·업적은 저장하지 않고 서버의 시험 결과(Result)에서 매번 계산한다.
// → 클라이언트가 점수를 꾸밀 수 없고, 규칙을 바꿔도 옛 기록에 그대로 다시 적용된다. 규칙은 이 파일 한 곳.

export const XP = { perCorrect: 10, perFinish: 20, perfectBonus: 50, perfectMin: 5 };

// 결과 한 건의 경험치: 맞힌 문항 × 10 + 완주 20 + (5문항 이상 만점이면) 50
export function xpOf(r) {
  const correct = r.correctAnswers ?? r.correct ?? 0;
  const total = r.totalQuestions ?? r.total ?? 0;
  const perfect = total >= XP.perfectMin && correct === total;
  return correct * XP.perCorrect + XP.perFinish + (perfect ? XP.perfectBonus : 0);
}

// 레벨 n 에 닿는 누적 경험치 = 50·n·(n−1) → 1:0, 2:100, 3:300, 4:600, 5:1000 … (갈수록 조금씩 멀어짐)
export const xpForLevel = n => 50 * n * (n - 1);
export function levelOf(xp) {
  let n = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * Math.max(0, xp)) / 50)) / 2));
  while (xpForLevel(n + 1) <= xp) n++; // 부동소수 경계 보정
  while (n > 1 && xpForLevel(n) > xp) n--;
  const base = xpForLevel(n), next = xpForLevel(n + 1);
  return { level: n, xp, into: xp - base, need: next - base, title: titleOf(n) };
}
const TITLES = [[1, '새싹'], [3, '단어 탐험가'], [5, '문장 사냥꾼'], [8, '어휘 기사'], [12, '내신 마법사'], [17, '영단 마스터']];
export const titleOf = n => TITLES.filter(([k]) => n >= k).pop()[1];

// 업적: m = { attempts, perfects, streakDays, learned, sets, xp, bestCombo? }
export const ACHIEVEMENTS = [
  { id: 'first', icon: 'play', title: '첫걸음', desc: '시험을 처음 끝까지 풀었어요', test: m => m.attempts >= 1 },
  { id: 'perfect', icon: 'star', title: '퍼펙트', desc: '5문항 이상 시험에서 만점', test: m => m.perfects >= 1 },
  { id: 'perfect5', icon: 'trophy', title: '만점 수집가', desc: '만점 5번', test: m => m.perfects >= 5 },
  { id: 'streak3', icon: 'flame', title: '사흘 연속', desc: '3일 연속 학습', test: m => m.streakDays >= 3 },
  { id: 'streak7', icon: 'flame', title: '일주일 불꽃', desc: '7일 연속 학습', test: m => m.streakDays >= 7 },
  { id: 'learned100', icon: 'book', title: '백 문항 정복', desc: '서로 다른 문항 100개를 맞힘', test: m => m.learned >= 100 },
  { id: 'attempts10', icon: 'target', title: '열 번의 도전', desc: '시험 10번 완주', test: m => m.attempts >= 10 },
  { id: 'maker', icon: 'edit', title: '세트 장인', desc: '내 세트 3개 만들기', test: m => m.sets >= 3 },
  { id: 'level5', icon: 'trophy', title: '레벨 5', desc: '레벨 5 달성', test: m => levelOf(m.xp).level >= 5 },
];
export const achievementsOf = m => ACHIEVEMENTS.map(({ test, ...a }) => ({ ...a, got: !!test(m) }));
