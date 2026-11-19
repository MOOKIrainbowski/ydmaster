# 01 계약 — 데이터 · API · 시험 모드 · 프론트 모듈 규칙 (Claude 소유, 초안 v1)

> 변경은 Claude 만. Codex 는 `01-OVERHAUL-REVIEW.md` 에 의견을 쓴다. 버전이 오르면 맨 아래 변경 이력에 적는다.

## 1. 데이터 모델 (MongoDB)

### 1.1 Set (컬렉션 `tests` 유지, 화면 용어 "세트")
```js
{
  _id, author: ObjectId(User),
  title: String(1..100), description: String(0..500),
  kind: 'vocab' | 'passage',               // 레거시 문서엔 없음 → 'vocab'
  visibility: 'public' | 'friends' | 'private', // 레거시: isFriendOnly→friends, isPublic=false→private, 그 외 public
  tags: [String(1..20)] (≤10),
  items: [{ _id, term: String(1..200), meaning: String(1..200), example: String(0..300), exampleKo: String(0..300) }], // vocab, ≤500
  passage: { source: String(0..100), sentences: [{ _id, en: String(1..600, 표기법 포함), ko: String(0..600) }] },     // passage, ≤80문장
  playCount, favoriteCount, createdAt, updatedAt
  // 레거시(읽기 전용): questions[], format, isPublic, isFriendOnly, testTimeLimit
}
```
- 레거시 변환(읽을 때): `questionType==='ko-to-en'` 이면 `term=answer, meaning=question`, 아니면 `term=question, meaning=answer`. essay 형식은 `term=question, meaning=answer || keywords.join(', ')`.
- 공개 범위 판정 함수 `canView(user, set)` 한 곳에서만: 작성자 / public / friends 이고 작성자의 친구.

### 1.2 본문 표기법 (sentence.en)
| 표기 | 의미 | 보이는 글 |
|---|---|---|
| `{text}` | 핵심 표현(빈칸 우선 후보) | text |
| `[정답|오답1|오답2]` | 어법·어휘 선택(첫 항목이 정답, 2~4개) | 정답 |
| `\{` `\}` `\[` `\]` `\|` | 문자 그대로 | 해당 문자 |
- 중첩 금지. 닫히지 않은 괄호는 문자 그대로 취급(저장 시 경고는 편집기 몫).
- 공용 모듈 `public/js/shared/passage.js` (ESM, Claude):
  - `parseSentence(en) → { plain, tokens: [{ text, kind: 'word'|'punct'|'space', key?: true, choice?: string[] }] }`
  - `splitSentences(text) → string[]` (Mr./Dr./U.S./e.g./숫자 소수점/따옴표 안 마침표/…/?! 처리)
  - `pairSentences(enText, koText) → [{en, ko}]` (개수 다르면 남는 쪽은 빈 문자열)
- 공용 모듈 `public/js/shared/grade.js`: `normalize(s)`, `meaningVariants(meaning)`(`,` `;` `/` 로 나눔, 괄호 부분 생략 허용), `gradeText(expected, response, {strict})`, `wordDiff(expected, response)`.

### 1.3 Session (새 컬렉션 `sessions`)
```js
{ _id, user, source: { type: 'sets', ids: [ObjectId] } | { type: 'wrong' },
  mode, options, title,
  questions: [{ q: <공개 문항(아래 §3)>, key: <정답 데이터, 클라이언트로 절대 안 보냄>, ref: { set, item } }],
  answers: [{ i, response, correct, score, at }],
  status: 'active' | 'done', startedAt, finishedAt, resultId,
  expiresAt }   // active 는 7일 TTL
```

### 1.4 ItemStat (새 컬렉션 `itemstats`) — 오답노트의 원본
`{ user, set, item, wrong: Number, right: Number, streak: Number, lastMode, lastWrongAt, lastAt }` 고유키 `(user,set,item)`.
- 오답 목록 = `wrong>0 && streak<2`. 정답이면 `right++, streak++`, 오답이면 `wrong++, streak=0, lastWrongAt=now`.

### 1.5 Result (기존 유지 + 필드 추가)
`mode, sessionId, kind` 추가. `score/correctAnswers/totalQuestions/percentage` 는 **서버 채점값만**.

## 2. API (모두 `/api` 접두, JSON, 인증은 `Authorization: Bearer <jwt>`)
오류 응답은 항상 `{ message: '한국어 문장' }` + 4xx/5xx.

### 2.1 세트
| 메서드 경로 | 요청 | 응답 |
|---|---|---|
| GET `/sets?scope=mine\|explore\|fav&q=&kind=&page=` | | `{ items: [SetSummary], hasMore }` (20개씩) |
| GET `/sets/:id` | | `SetFull` (canView 실패 403/404) |
| POST `/sets` | `SetInput` | `SetFull` 201 |
| PUT `/sets/:id` | `SetInput` (작성자만, 허용 필드만) | `SetFull` |
| DELETE `/sets/:id` | | `{ message }` |
| POST `/sets/:id/favorite` / DELETE 동일 | | `{ favorited, favoriteCount }` |
| POST `/sets/:id/copy` | | `SetFull`(내 비공개 사본) |
- `SetSummary = { _id, title, description, kind, visibility, tags, count(단어 수/문장 수), author:{_id,username}, playCount, favoriteCount, favorited, updatedAt }`
- `SetFull = SetSummary + { items | passage }`
- `SetInput = { title, description, kind, visibility, tags, items? , passage? }` (kind 는 생성 후 변경 불가)

### 2.2 시험 세션
| 메서드 경로 | 요청 | 응답 |
|---|---|---|
| GET `/modes` | | `[{ id, kind, label, desc, options:[...] }]` §3 표 그대로 |
| POST `/sessions` | `{ source:{type:'sets',ids:[..≤10]} \| {type:'wrong'}, mode, count(1..100), options }` | `{ _id, title, mode, questions:[공개 문항], total }` |
| GET `/sessions/:id` | | 위 + `answers` (이어하기) |
| POST `/sessions/:id/answers` | `{ i, response }` | `{ i, correct, score, expected, detail? }` 같은 i 재요청 = 저장된 결과 그대로(멱등) |
| POST `/sessions/:id/finish` | | `Result` (멱등: 이미 끝났으면 같은 Result) |

### 2.3 기록·오답·랭킹·사용자
| GET `/results?page=` | 내 결과 목록(20개씩) |
| GET `/results/:id` | 결과 + 문항별(문항·내 답·정답) — 세션에서 조인 |
| GET `/stats` | `{ sets, attempts, weekCorrect, streakDays, wrongCount }` |
| GET `/wrong?set=` | `{ items: [{ set:{_id,title,kind}, item, display:{front,back}, wrong, right, lastWrongAt }] }` |
| DELETE `/wrong/:set/:item` | 오답에서 제거(streak=2로) |
| GET `/legacy-wrongnote` | 이전 오답노트(읽기 전용) |
| GET `/ranking?scope=global\|friends&period=week\|all` | `{ ranking:[{ _id, username, avatarUrl, correct, attempts }], me }` |
| GET `/users/:id/avatar` | 이미지 바이트(캐시 헤더) |
- 사용자 객체엔 base64 대신 `avatarUrl`, `bannerUrl`(없으면 '').
- 인증·친구·공지·문의·관리자 API 는 경로 유지(보안 수정만). 목록은 P1 이후 이 문서에 추가.

## 3. 시험 모드 (서버 생성기 = 원본)
| id | kind | 이름 | 공개 문항 형태(`q.type`) | 채점 |
|---|---|---|---|---|
| `mc_meaning` | vocab | 영→한 뜻 고르기 | `choice` | 보기 index |
| `mc_term` | vocab | 한→영 단어 고르기 | `choice` | 보기 index |
| `write_meaning` | vocab | 뜻 쓰기 | `text` | meaningVariants 중 하나와 정규화 일치 |
| `write_term` | vocab | 철자 쓰기 | `text` (+ `hint.first` 옵션) | 대소문자 무시 완전 일치 |
| `listen_term` | vocab | 듣고 쓰기 | `text` + `speak` | 철자 완전 일치 |
| `cloze_key` | passage | 핵심 표현 빈칸 | `cloze` | 빈칸별 일치, 전부 맞아야 정답(score=맞은 비율) |
| `cloze_random` | passage | 무작위 빈칸 (`options.ratio` 0.1~0.5, 기본 0.25, 내용어만) | `cloze` | 동일 |
| `choice` | passage | 어법·어휘 고르기 | `inline_choice` | 전부 맞아야 정답 |
| `word_order` | passage | 어순 배열(해석 제시) | `order` | 순서 일치(같은 단어 중복 허용 비교) |
| `sentence_order` | passage | 문장 순서 배열(문단 단위, 3~8문장 묶음) | `order` | 순서 일치 |
| `translate` | passage | 해석 보고 영작 | `text` (+ 단어 수 힌트) | 정규화 일치 = 정답, `detail.diff` 제공 |
- 객관식 오답 보기: 같은 세트 → 같은 작성자의 다른 세트 순으로 채움, 정답과 같은 글/표기 중복 제외. 4개(5지선다) 못 채우면 있는 만큼(최소 2지선다). 가짜 보기 생성 금지.
- 문항 수가 소스보다 많으면 소스 수로 자름.
- 공개 문항 공통: `{ i, type, prompt: { text, sub? }, ... }`
  - `choice`: `{ choices: string[] }` → response `number`
  - `text`: `{ speak?: string, hint?: { first?: string, words?: number } }` → response `string`
  - `cloze`: `{ segments: (string | { blank: k, hint?: string })[], ko?: string, context?: { before, after } }` → response `string[]`
  - `inline_choice`: `{ segments: (string | { choice: k, options: string[] })[], ko? }` → response `number[]`
  - `order`: `{ pieces: string[] }`(섞인 상태) → response `number[]`(pieces 의 index 를 정답 순서로)
- 채점 응답 `expected`: 화면에 그대로 보여줄 정답(문자열 또는 문자열 배열). `detail.diff`: `[{ t, op: 'ok'|'miss'|'extra' }]`.
- 학습 카드(`flash`)는 채점 없는 클라이언트 전용 화면(세트 데이터만 사용).

## 4. 프론트 모듈 규칙 (P3)
- 빌드 없음. `public/index.html` → `/css/app.css`, `/css/play.css`, `<script type="module" src="/js/main.js">`.
- 라우팅: 해시. `#/`(홈) `#/explore` `#/sets/:id` `#/sets/:id/edit` `#/new/:kind` `#/play/:sessionId` `#/result/:resultId` `#/wrong` `#/history` `#/ranking` `#/friends` `#/me` `#/u/:username` `#/notice` `#/inquiry` `#/admin` `#/login` `#/privacy`.
- 페이지 모듈: `export default { title: '문자열', auth: true, render(root, params, query) { ...; return cleanup? } }`. 라우터가 `root` 를 비우고 `render` 호출, 이동 시 `cleanup()` 호출.
- `js/ui.js` (Claude): `html\`\``(자동 이스케이프 태그 템플릿), `raw(str)`, `$(sel, root)`, `on(root, event, selector, handler)`(위임), `toast(msg, type)`, `modal({ title, body, actions }) → Promise<actionId|null>`, `confirmDialog(msg, { danger })`, `icon(name, size)`, `fmtDate`, `fmtDuration`, `skeleton(n)`, `empty({ icon, title, desc, action })`.
- `js/api.js` (Claude): `api.get/post/put/del(path, body)` → JSON, 실패 시 `ApiError{status,message}` throw, 401 이면 로그아웃·`#/login`.
- `js/state.js` (Claude): `state.user`, `state.token`, `setUser()`, `onUser(fn)`.
- **금지**: 인라인 `onclick=` / 전역 함수, JS 안 인라인 `style=` (동적 수치(진행률 width 등)만 예외), 이모지를 아이콘 대용으로 쓰기, `innerHTML` 에 이스케이프 안 된 사용자 문자열.
- CSS: 토큰은 `:root`(라이트 기본) + `[data-theme=dark]`. 클래스는 `.btn .btn--primary` 같은 블록/수식어 형식. 페이지 전용은 `.p-<page>__*`.

## 변경 이력
- v1 (2026-11-19) 초안.
