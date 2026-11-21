// 게임 요소 규칙(04·05, 2026-11-20 사용자 요청: 게임처럼 성취감 · 활동마다 퀘스트 · 하/중/상 업적).
// 서버 판정 원칙(R5): 경험치·레벨·업적은 저장하지 않고 서버 기록(Result·Test·ItemStat 등)에서 매번 계산한다.
// 퀘스트 보상만 QuestClaim 으로 한 번 기록(사용자·키 고유 → 같은 보상 두 번 불가). 규칙은 이 파일 한 곳.

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

// ── 업적: tier 1 하 · 2 중 · 3 상 · 4 최상 · 5 전설(08 추가) ──
// 연속 학습 업적은 '지금까지 가장 길게 이어간 날 수'(bestStreak) 기준 — 하루 쉬었다고 딴 업적이 사라지지 않게(08)
// m = { attempts, perfects, streakDays, bestStreak, learned, sets, publicSets, xp, modesUsed, passageTests, cleared, wrongReviews, friends, questsDone }
// id 는 한 번 정하면 바꾸지 않는다(브라우저가 '이미 본 업적' 을 id 로 기억).
const A = (id, tier, icon, title, desc, test) => ({ id, tier, icon, title, desc, test });
export const ACHIEVEMENTS = [
  // 시험 완주
  A('first', 1, 'play', '첫걸음', '시험을 처음 끝까지 풀었어요', m => m.attempts >= 1),
  A('attempts10', 1, 'target', '열 번의 도전', '시험 10번 완주', m => m.attempts >= 10),
  A('attempts50', 2, 'target', '쉰 번의 도전', '시험 50번 완주', m => m.attempts >= 50),
  A('attempts200', 3, 'target', '불굴의 수험생', '시험 200번 완주', m => m.attempts >= 200),
  // 만점
  A('perfect', 1, 'star', '퍼펙트', '5문항 이상 시험에서 만점', m => m.perfects >= 1),
  A('perfect5', 2, 'star', '만점 수집가', '만점 5번', m => m.perfects >= 5),
  A('perfect20', 3, 'star', '만점 제조기', '만점 20번', m => m.perfects >= 20),
  // 연속 학습
  A('streak3', 1, 'flame', '사흘 연속', '3일 연속 학습', m => (m.bestStreak ?? m.streakDays) >= 3),
  A('streak7', 2, 'flame', '일주일 불꽃', '7일 연속 학습', m => (m.bestStreak ?? m.streakDays) >= 7),
  A('streak30', 3, 'flame', '한 달의 불꽃', '30일 연속 학습', m => (m.bestStreak ?? m.streakDays) >= 30),
  // 외운 문항(서로 다른 문항을 맞힌 수)
  A('learned30', 1, 'book', '서른 단어', '서로 다른 문항 30개를 맞힘', m => m.learned >= 30),
  A('learned100', 2, 'book', '백 문항 정복', '서로 다른 문항 100개를 맞힘', m => m.learned >= 100),
  A('learned300', 2, 'book', '삼백 문항', '서로 다른 문항 300개를 맞힘', m => m.learned >= 300),
  A('learned1000', 3, 'book', '천 문항의 벽', '서로 다른 문항 1,000개를 맞힘', m => m.learned >= 1000),
  // 시험 방식 다양성(전체 11가지)
  A('modes3', 1, 'layers', '이것저것', '서로 다른 시험 방식 3가지', m => m.modesUsed >= 3),
  A('modes6', 2, 'layers', '만능 수험생', '서로 다른 시험 방식 6가지', m => m.modesUsed >= 6),
  A('modes11', 3, 'layers', '모든 방식 정복', '11가지 시험 방식 모두', m => m.modesUsed >= 11),
  // 본문
  A('passage1', 1, 'text', '본문 입문', '본문 시험 첫 완주', m => m.passageTests >= 1),
  A('passage10', 2, 'text', '본문 단골', '본문 시험 10번 완주', m => m.passageTests >= 10),
  A('passage30', 3, 'text', '내신 본문 장인', '본문 시험 30번 완주', m => m.passageTests >= 30),
  // 오답 졸업(틀렸던 문항을 2번 연속 맞혀 오답에서 뺌)
  A('cleared10', 1, 'check', '오답 정리', '오답 10개 졸업', m => m.cleared >= 10),
  A('cleared50', 2, 'check', '오답 사냥꾼', '오답 50개 졸업', m => m.cleared >= 50),
  A('cleared200', 3, 'check', '오답 박멸', '오답 200개 졸업', m => m.cleared >= 200),
  A('review5', 2, 'refresh', '복습의 힘', '오답 복습 시험 5번 완주', m => m.wrongReviews >= 5),
  // 세트 만들기·나누기
  A('maker1', 1, 'edit', '첫 세트', '내 세트 1개 만들기', m => m.sets >= 1),
  A('maker', 2, 'edit', '세트 장인', '내 세트 3개 만들기', m => m.sets >= 3),
  A('maker10', 3, 'edit', '세트 공방', '내 세트 10개 만들기', m => m.sets >= 10),
  A('public1', 1, 'link', '나눔의 시작', '공개 세트 1개', m => m.publicSets >= 1),
  // 친구
  A('friend1', 1, 'users', '함께 공부', '친구 1명', m => m.friends >= 1),
  A('friend5', 2, 'users', '스터디 모임', '친구 5명', m => m.friends >= 5),
  // 레벨·퀘스트
  A('level5', 2, 'trophy', '레벨 5', '레벨 5 달성', m => levelOf(m.xp).level >= 5),
  A('level10', 3, 'trophy', '레벨 10', '레벨 10 달성', m => levelOf(m.xp).level >= 10),
  A('level17', 3, 'trophy', '영단 마스터', '레벨 17 — 최고 칭호', m => levelOf(m.xp).level >= 17),
  A('quests5', 1, 'check', '퀘스트 입문', '퀘스트 보상 5번 받기', m => m.questsDone >= 5),
  A('quests20', 2, 'check', '퀘스트 수집가', '퀘스트 보상 20번 받기', m => m.questsDone >= 20),
  // ── 최상(4): 몇 달을 꾸준히 해야 닿는 목표 ──
  A('attempts500', 4, 'target', '오백 번의 시험', '시험 500번 완주', m => m.attempts >= 500),
  A('perfect50', 4, 'star', '만점의 달인', '만점 50번', m => m.perfects >= 50),
  A('streak60', 4, 'flame', '두 달의 불꽃', '60일 연속 학습', m => (m.bestStreak ?? m.streakDays) >= 60),
  A('learned2000', 4, 'book', '이천 문항', '서로 다른 문항 2,000개를 맞힘', m => m.learned >= 2000),
  A('passage100', 4, 'text', '본문 백 번 읽기', '본문 시험 100번 완주', m => m.passageTests >= 100),
  A('cleared500', 4, 'check', '오답 소멸', '오답 500개 졸업', m => m.cleared >= 500),
  A('review30', 4, 'refresh', '복습 장인', '오답 복습 시험 30번 완주', m => m.wrongReviews >= 30),
  A('maker30', 4, 'edit', '세트 공장장', '내 세트 30개 만들기', m => m.sets >= 30),
  A('public10', 4, 'link', '나눔 천사', '공개 세트 10개', m => m.publicSets >= 10),
  A('friend15', 4, 'users', '스터디 리더', '친구 15명', m => m.friends >= 15),
  A('level20', 4, 'trophy', '레벨 20', '레벨 20 달성', m => levelOf(m.xp).level >= 20),
  A('quests50', 4, 'check', '퀘스트 마니아', '퀘스트 보상 50번 받기', m => m.questsDone >= 50),
  // ── 전설(5): 한 해를 걸어야 하는 기록 ──
  A('attempts1000', 5, 'target', '천 번의 도전자', '시험 1,000번 완주', m => m.attempts >= 1000),
  A('perfect100', 5, 'star', '완벽주의자', '만점 100번', m => m.perfects >= 100),
  A('streak100', 5, 'flame', '백일의 기적', '100일 연속 학습', m => (m.bestStreak ?? m.streakDays) >= 100),
  A('streak365', 5, 'flame', '365일의 불꽃', '1년 내내 하루도 빠짐없이 학습', m => (m.bestStreak ?? m.streakDays) >= 365),
  A('learned5000', 5, 'book', '오천 문항의 현자', '서로 다른 문항 5,000개를 맞힘', m => m.learned >= 5000),
  A('cleared1000', 5, 'check', '오답 제로', '오답 1,000개 졸업', m => m.cleared >= 1000),
  A('level30', 5, 'trophy', '전설의 영단 마스터', '레벨 30 달성', m => levelOf(m.xp).level >= 30),
];
// 전설 메타 업적: 상(3) 단계까지의 업적을 전부 모으면
ACHIEVEMENTS.push(A('collector', 5, 'trophy', '업적 수집가', '하·중·상 업적을 모두 달성', m => ACHIEVEMENTS.filter(a => a.tier <= 3).every(a => a.test(m))));
export const achievementsOf = m => ACHIEVEMENTS.map(({ test, ...a }) => ({ ...a, got: !!test(m) }));

// ── 퀘스트: 활동마다 소소한 보상 ──
// kind: 'check' = 서버 기록으로 판정 · 'event' = 서버가 볼 수 없는 활동(가이드 읽기·학습 카드)이라 보고만으로 인정(보상은 작게, 한 번만)
// daily: true 면 하루(KST)에 한 번씩 다시 받을 수 있다.
const Q = (id, group, title, desc, xp, opt = {}) => ({ id, group, title, desc, xp, kind: opt.check ? 'check' : 'event', ...opt });
export const GUIDE_CHAPTERS = ['start', 'vocab', 'passage', 'test', 'wrong', 'cards', 'game', 'social'];
export const QUESTS = [
  // 오늘의 퀘스트
  Q('daily_test', 'daily', '오늘 시험 1번 완주', '어떤 시험이든 끝까지', 10, { daily: true, check: m => m.todayAttempts >= 1, goal: m => [m.todayAttempts, 1], go: '#/explore' }),
  Q('daily_correct20', 'daily', '오늘 20문항 맞히기', '여러 시험에 걸쳐도 돼요', 15, { daily: true, check: m => m.todayCorrect >= 20, goal: m => [m.todayCorrect, 20], go: '#/explore' }),
  Q('daily_cards', 'daily', '오늘 학습 카드 한 묶음 끝내기', '알아요로 카드 더미를 비우기', 10, { daily: true, go: '#/explore' }),
  // 첫걸음
  Q('first_set', 'start', '첫 세트 만들기', '단어나 본문 세트를 하나 만들어요', 20, { check: m => m.sets >= 1, goal: m => [m.sets, 1], go: '#/new/vocab' }),
  Q('first_test', 'start', '첫 시험 완주', '세트에서 시험 보기 → 끝까지', 20, { check: m => m.attempts >= 1, goal: m => [m.attempts, 1], go: '#/explore' }),
  Q('first_passage', 'start', '본문 시험 완주', '본문 세트로 시험 한 번', 20, { check: m => m.passageTests >= 1, goal: m => [m.passageTests, 1], go: '#/new/passage' }),
  Q('first_review', 'start', '오답 복습 시험', '오답 화면의 복습 시험 완주', 20, { check: m => m.wrongReviews >= 1, goal: m => [m.wrongReviews, 1], go: '#/wrong' }),
  Q('first_cards', 'start', '학습 카드 끝내기', '세트의 학습 카드에서 모두 알아요', 15, { go: '#/explore' }),
  Q('modes3', 'start', '시험 방식 3가지 써 보기', '뜻 고르기 말고도 여러 방식으로', 25, { check: m => m.modesUsed >= 3, goal: m => [m.modesUsed, 3], go: '#/explore' }),
  Q('first_public', 'start', '공개 세트 만들기', '세트 공개 범위를 공개로', 15, { check: m => m.publicSets >= 1, goal: m => [m.publicSets, 1], go: '#/explore?scope=mine' }),
  Q('first_friend', 'start', '친구 맺기', '친구 화면에서 사용자 찾기 → 요청', 15, { check: m => m.friends >= 1, goal: m => [m.friends, 1], go: '#/friends' }),
  Q('avatar', 'start', '프로필 사진 등록', '내 정보에서 사진 바꾸기', 10, { check: m => m.hasAvatar, goal: m => [m.hasAvatar ? 1 : 0, 1], go: '#/me' }),
  // 가이드(장마다 읽으면)
  ...GUIDE_CHAPTERS.map(c => Q(`guide_${c}`, 'guide', '가이드 읽기', c, 5, { go: `#/guide?ch=${c}` })),
];
export const QUEST_BY_ID = Object.fromEntries(QUESTS.map(q => [q.id, q]));
export const questKey = (q, day) => (q.daily ? `${q.id}:${day}` : q.id);
// 상태: claimed(받음) · ready(조건 충족, 받을 수 있음) · todo(아직). event 퀘스트는 보고 = 받기라 todo 로 둔다.
export function questsOf(m, claimedKeys, day) {
  const got = new Set(claimedKeys);
  return QUESTS.map(({ check, goal, ...q }) => {
    const claimed = got.has(questKey(q, day));
    const ready = !claimed && !!check && !!check(m);
    const g = goal ? goal(m) : null;
    return { ...q, status: claimed ? 'claimed' : ready ? 'ready' : 'todo', progress: g ? [Math.min(Number(g[0]) || 0, g[1]), g[1]] : null };
  });
}
// 받기 판정: check 퀘스트는 조건 충족이어야, event 퀘스트는 보고로 인정
export const canClaim = (q, m) => (q.kind === 'event' ? true : !!q.check(m));

// ── 09 프로필 꾸미기(2026-11-21 사용자 요청): 등급 '상' 이상 업적마다 칭호 1개, 색·사진 테두리·카드 테두리는 업적으로 해금 ──
// 서버가 장착 요청 때 해금 여부를 확인(클라이언트는 보여주기만). 이름·해금 조건은 이 한 곳.
const TITLE_OF = {
  // 상(3)
  attempts200: '시험장의 철인', perfect20: '정답 제조기', streak30: '한 달의 불꽃', learned1000: '천 단어 수호자', modes11: '만능 해결사',
  passage30: '본문 장인', cleared200: '오답 사냥꾼', maker10: '세트 공방장', level10: '숙련 학자', level17: '영단 마스터',
  // 최상(4)
  attempts500: '오백 번의 수험생', perfect50: '만점 달인', streak60: '꺼지지 않는 불꽃', learned2000: '이천 어휘 탐험가', passage100: '본문 백독가',
  cleared500: '오답 소멸자', review30: '복습의 화신', maker30: '세트 공장장', public10: '나눔 천사', friend15: '스터디 리더', level20: '고수', quests50: '퀘스트 헌터',
  // 전설(5)
  attempts1000: '천 번의 전설', perfect100: '완벽 그 자체', streak100: '백일의 기적', streak365: '일 년의 불사조', learned5000: '오천 어휘의 현자',
  cleared1000: '오답 제로', level30: '전설의 영단 마스터', collector: '모든 것을 모은 자',
};
export const TITLE_ITEMS = ACHIEVEMENTS.filter(a => a.tier >= 3).map(a => ({ id: a.id, name: TITLE_OF[a.id] || a.title, tier: a.tier, ach: a.id }));
// unlock: 업적 id(없으면 누구나)
const C = (id, name, unlock = null) => ({ id, name, unlock });
export const COSMETICS = {
  color: [C('rose', '로즈(기본)'), C('lavender', '라벤더'), C('mint', '민트', 'first'), C('ocean', '오션', 'streak7'), C('sunset', '선셋', 'perfect5'),
    C('forest', '포레스트', 'learned300'), C('midnight', '미드나잇', 'attempts50'), C('gold', '황금', 'level10'), C('galaxy', '은하수', 'learned2000'),
    C('aurora', '오로라', 'streak60'), C('legend', '전설의 빛', 'level30')],
  frame: [C('none', '없음'), C('simple', '하양 테두리'), C('rose', '로즈 링', 'first'), C('double', '이중 링', 'attempts10'), C('gold', '황금 링', 'perfect20'),
    C('spin', '회전 점선', 'modes11'), C('flame', '불꽃', 'streak30'), C('gem', '보석', 'perfect50'), C('orbit', '궤도', 'level20'), C('rainbow', '무지개', 'streak100')],
  border: [C('none', '없음'), C('soft', '은은한 선'), C('brand', '브랜드', 'maker1'), C('dotted', '점선', 'friend5'), C('gold', '황금', 'attempts200'),
    C('shine', '빛 흐름', 'cleared500'), C('neon', '네온', 'quests50'), C('legend', '전설', 'collector')],
};
export const COSMETIC_KINDS = ['color', 'frame', 'border', 'title'];
export const DEFAULT_COSMETICS = { color: 'rose', frame: 'none', border: 'none', title: '' };
// 해금 목록: gotIds = 달성한 업적 id 들
export function cosmeticsCatalog(gotIds) {
  const got = new Set(gotIds), A_ = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));
  const info = id => (id ? { id, title: A_[id]?.title, tier: A_[id]?.tier } : null);
  const out = {};
  for (const k of ['color', 'frame', 'border']) out[k] = COSMETICS[k].map(c => ({ id: c.id, name: c.name, unlock: info(c.unlock), got: !c.unlock || got.has(c.unlock) }));
  out.title = TITLE_ITEMS.map(t => ({ id: t.id, name: t.name, tier: t.tier, unlock: info(t.ach), got: got.has(t.ach) }));
  return out;
}
// 장착 검증: 알려진 항목이고 해금됐는지. 반환 = 저장할 값 또는 오류 문구
export function checkEquip(kind, id, gotIds) {
  if (!COSMETIC_KINDS.includes(kind)) return { error: '알 수 없는 꾸미기 종류예요.' };
  if (kind === 'title' && (id === '' || id == null)) return { value: '' };
  const item = kind === 'title' ? TITLE_ITEMS.find(t => t.id === id) : COSMETICS[kind].find(c => c.id === id);
  if (!item) return { error: '없는 꾸미기 아이템이에요.' };
  const need = kind === 'title' ? item.ach : item.unlock;
  if (need && !gotIds.includes(need)) return { error: `'${ACHIEVEMENTS.find(a => a.id === need)?.title}' 업적을 달성하면 쓸 수 있어요.` };
  return { value: id };
}
