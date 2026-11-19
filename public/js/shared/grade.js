// 채점 정규화 — 서버 채점의 유일한 원본. 프론트는 표시용(diff 미리보기)으로만 쓴다(계약 §1.2, R5).

// 영어: 유니코드 정규화, 둥근 따옴표 통일, 소문자, 공백 하나, 앞뒤 문장부호 제거
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"').replace(/[‐-―]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s"'(]+|[\s.,!?;:"')]+$/g, '');
}

// 한글 뜻: 띄어쓰기·물결표·문장부호 차이는 무시("~을 포기하다" == "을포기하다")
export function normalizeKo(s) {
  return String(s ?? '').normalize('NFKC').toLowerCase().replace(/[\s~∼〜.,!?;:'"·…-]/g, '');
}

// "사과, 능금 (과일)" → ['사과', '능금 (과일)', '능금'] 처럼 허용 답 목록
export function variants(answer) {
  const out = new Set();
  for (const part of String(answer ?? '').split(/[,;/]|\s+or\s+/)) {
    const p = part.trim();
    if (!p) continue;
    out.add(p);
    const noParen = p.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (noParen) out.add(noParen);
    out.add(p.replace(/[()[\]]/g, ''));
  }
  return [...out];
}

export function gradeMeaning(meaning, response) {
  const r = normalizeKo(response);
  return !!r && variants(meaning).some(v => normalizeKo(v) === r);
}

// 철자: 대소문자 무시 완전 일치. "color/colour" 처럼 / 로 적은 변형 허용.
export function gradeTerm(term, response) {
  const r = normalize(response);
  return !!r && variants(term).some(v => normalize(v) === r);
}

export const words = s => normalize(s).replace(/[^\p{L}\p{N}'\- ]/gu, ' ').split(/\s+/).filter(Boolean);

// 문장(영작): 문장부호·대소문자·공백 차이 무시하고 단어열이 같으면 정답. score = 맞은 단어 비율.
export function gradeSentence(expected, response) {
  const e = words(expected), r = words(response);
  const diff = wordDiff(e, r);
  const ok = diff.filter(d => d.op === 'ok').length;
  const correct = e.length > 0 && e.length === r.length && ok === e.length;
  return { correct, score: e.length ? ok / Math.max(e.length, r.length) : 0, diff };
}

// LCS 기반 단어 비교: ok(일치) / miss(빠뜨림, 정답 단어) / extra(잘못 씀, 내 단어)
export function wordDiff(e, r) {
  const n = e.length, m = r.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = e[i] === r[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (e[i] === r[j]) { out.push({ t: e[i], op: 'ok' }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: e[i++], op: 'miss' });
    else out.push({ t: r[j++], op: 'extra' });
  }
  while (i < n) out.push({ t: e[i++], op: 'miss' });
  while (j < m) out.push({ t: r[j++], op: 'extra' });
  return out;
}
