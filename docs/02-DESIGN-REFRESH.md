# 02 디자인 리프레시 — 계획서 · 디자인 명세 (Claude 소유)

> 01 단계 디자인(라이트 슬레이트 + 인디고 단색, 장식 금지)을 사용자가 "1차원적·단조로움, GPT 가 만든 기본 사이트 같다"고 판정(2026-11-20). 이 문서가 01-DESIGN.md §3 을 **대체**한다.
> 짝 문서: 리뷰 로그는 계속 `01-OVERHAUL-REVIEW.md` 아래에 `## (02) ...` 로 덧붙인다.

## 0. 사용자 지시 원문 요약
- 디자인이 너무 단조롭다. UI·UX·인터페이스의 디자인 요소를 **각각 구체적으로** 만들고, **모션을 부드럽게**.
- 최근 유행하는 인터페이스·UI 형식을 조사(Figma 2026 웹 디자인 트렌드 등)해서 영단마스터에 어울리는 스타일을 고르고(중복 가능),
- **퍼스널 컬러: 붉은색 · 보라색 · 연한 붉은색 계열**로 디자인.
- 특히 랜딩 페이지가 "1차원적이고 단색" 이라 충격을 받음 → 랜딩이 최우선.

## 1. 조사 요약 (출처는 맨 아래)
| 트렌드 | 근거 | 영단마스터 판단 |
|---|---|---|
| 게임화(포인트·진행바·연속 기록·리더보드) | Figma 2026 #7(Duolingo 사례) | **채택** — 학습 앱의 핵심. 단, 실제 데이터(연속 학습일·주간 외운 문항·랭킹)만 쓴다(가짜 XP 금지). |
| 생생한 색채(그라데이션·고대비·장난스러운 색조) | Figma #3 | **채택** — 퍼스널 컬러 붉은색→자홍→보라 그라데이션. |
| 대담한 타이포그래피(대형 헤드라인·키네틱 텍스트·가변 폰트) | Figma #4, daisyUI "Type-First" | **채택** — Pretendard Variable 800~900 + 영어 장식 세리프 이탤릭. |
| 모션(스크롤 트리거·호버·미세 애니메이션) — "의미 있는 모션" | Figma #6, 2026 트렌드 다수 | **채택** — 모든 전환·피드백에 스프링 이징, 장식 모션은 랜딩에 한정. |
| Liquid Glass / Glassmorphism | WWDC 2025, setproduct | **부분 채택** — **떠 있는 층에만**(상단바·하단 탭바·모달·토스트·랜딩 데모 카드). 긴 글·시험 지문은 불투명 면(대비 보장). |
| Aurora(움직이는 메시 그라데이션) 배경 | 2025~26 트렌드 글 | **채택** — 배경에 천천히 흐르는 붉은/보라/연분홍 빛. 글자 뒤에는 불투명 면. |
| Bento 그리드 | 다수(크기에 의미가 있을 때만) | **채택** — 랜딩 기능 소개, 홈 대시보드. 큰 칸 = 중요한 것. |
| Claymorphism(통통한 입체감) | daisyUI(교육·친근한 제품에 적합) | **부분 채택** — 주요 버튼·아이콘 타일의 "눌리는" 입체감(아래 테두리 두께가 눌리면 줄어듦). |
| 네오브루탈리즘·Y2K·스큐어모피즘 | — | 미채택(학습 집중 방해, 브랜드와 안 맞음). |

**선택한 스타일 = "Aurora Glass + Bento + Playful Depth"**: 오로라 빛 배경 위에 유리 내비게이션, 의미 있는 크기의 벤토 카드, 통통하게 눌리는 버튼, 큰 글씨, 스프링 모션, 실제 학습 데이터로 만든 게임화.

## 2. 결정 기록
| # | 결정 | 근거 |
|---|---|---|
| D1 | 01-DESIGN §3 의 "그라데이션 금지·강조색 1개" 를 폐기. 브랜드 = 붉은색(#E11D48)·자홍(#C026D3)·보라(#7C3AED)·연분홍(#FFE4E8) 그라데이션 체계. | 사용자 지시(퍼스널 컬러·단조로움 해소). |
| D2 | **토큰은 `public/css/tokens.css`(Claude)** 한 곳. `app.css`(Codex)는 컴포넌트만, 색·그림자·모서리·모션 값은 토큰만 참조(하드코딩 금지). | 한 곳만 원본. 두 에이전트가 동시에 스타일을 만들어도 같은 결과. |
| D3 | 오답 색(빨강)과 브랜드 빨강 충돌 방지: 주요 버튼은 **그라데이션(빨강→보라)**, 글자 강조는 보라. 오답은 `--bad`(#B91C1C) + ✕ 아이콘 + "틀렸어요" 문구 + 흔들림. 정답은 에메랄드. | 상태를 색 하나에만 의존하지 않음(01 원칙 유지). |
| D4 | 유리는 떠 있는 층만, 지문·표·폼 본문은 불투명 면. `prefers-reduced-transparency` 면 불투명. | 대비 보장(setproduct, daisyUI 경고). |
| D5 | 모션: 화면 전환 = View Transitions API(미지원 브라우저는 즉시 전환), 등장 = 순차(stagger) 페이드업, 스크롤 = CSS scroll-driven(미지원 시 IntersectionObserver), 이징 = `linear()` 스프링. `prefers-reduced-motion` 이면 이동·확대 없이 짧은 페이드만. | 2025~26 표준 기능, 라이브러리 0개(R4 유지). |
| D6 | 게임화는 실제 데이터만: 연속 학습일(불꽃), 이번 주 외운 문항(카운트업), 오답 수, 시험 중 연속 정답(콤보), 결과 링·축하. 가짜 레벨·XP 없음. | 정직함·서버 권위(R5). |
| D7 | 글꼴: 본문·UI = Pretendard Variable, **장식용 영어 = Instrument Serif 이탤릭**(헤드라인의 영어 단어 1~2개에만). | "Type-first" + 편집 디자인 느낌, 한글 가독성 유지. |
| D8 | 소유권: Claude = `tokens.css`, `landing.css`, `motion.js`, `main.js`, `pages/landing.js`(Codex→Claude 이관), `play.js`, `result.js`, `index.html`. Codex = `app.css` 전면 재작성, 나머지 페이지 마크업. | 랜딩이 최우선이라 Claude 가 직접. |

## 3. 디자인 명세 (Codex 가 app.css 를 만들 때 이 절만 보면 되도록)

### 3.1 색 (tokens.css 가 정의, 이름 그대로 사용)
| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--bg` | #FFF7F9 | #110A18 | 페이지 바탕(연분홍 흰색 / 자두빛 검정) |
| `--surface` | #FFFFFF | #1C1227 | 카드·입력 등 불투명 면 |
| `--surface-2` | #FCF1F5 | #251832 | 보조 면(통계 칸, 칩) |
| `--surface-3` | #F7E6EE | #2F1F3E | 눌림·선택 면 |
| `--text` | #1E1029 | #F8EEF6 | 본문 |
| `--text-2` | #5B4A69 | #CDB8D8 | 보조 글자(대비 ≥ 7:1 / 8:1) |
| `--text-3` | #8A7799 | #9C88AC | 장식·자리표시 글자만(본문 금지) |
| `--border` | #F0DCE5 | #33233F | 기본 테두리 |
| `--border-strong` | #E2C3D2 | #4C3560 | 입력·강조 테두리 |
| `--accent` | #7C3AED | #C4B5FD | 링크·포커스·선택 글자(보라) |
| `--accent-soft` | #F3EAFF | #2C1B47 | 선택 배경 |
| `--hot` | #E11D48 | #FB7185 | 뜨거운 강조(핵심 표현, 연속 기록, 배지) |
| `--hot-soft` | #FFE4E8 | #3A1424 | 뜨거운 강조 배경 |
| `--ok` / `--ok-soft` | #047857 / #D1FAE5 | #34D399 / #0B3B2D | 정답 |
| `--bad` / `--bad-soft` | #B91C1C / #FEE2E2 | #FCA5A5 / #4A1219 | 오답 |
| `--warn` / `--warn-soft` | #B45309 / #FEF3C7 | #FCD34D / #3F2A08 | 경고 |
| `--grad-brand` | `linear-gradient(115deg,#E11D48 0%,#C026D3 52%,#7C3AED 100%)` | 동일 | 주요 버튼·진행바·제목 글자·로고 |
| `--grad-soft` | `linear-gradient(135deg,#FFE4E8,#F7E1FF 50%,#EDE9FE)` | `linear-gradient(135deg,#3A1424,#2E1546 50%,#1F1640)` | 히어로 카드·강조 칸 배경 |
| `--grad-vocab` | 보라 계열 타일 | | 단어 세트 아이콘 타일 |
| `--grad-passage` | 빨강 계열 타일 | | 본문 세트 아이콘 타일 |
- 그라데이션 위 흰 글자 대비: #E11D48 4.7 / #C026D3 4.6 / #7C3AED 5.7 → **굵은 15px 이상**에서만.

### 3.2 깊이 · 유리 · 모양
- 모서리 `--r-xs 6 / --r-sm 10 / --r-md 16 / --r-lg 22 / --r-xl 28 / --r-pill 999`. 카드 22, 버튼 14(`--r-btn`), 입력 12(`--r-input`), 칩 pill.
- 그림자(보랏빛으로 물든 부드러운 그림자): `--shadow-1`(카드 기본) `--shadow-2`(호버·떠 있는 카드) `--shadow-3`(모달) `--shadow-glow`(주요 버튼 빛).
- 유리: `--glass-bg`, `--glass-border`, `--glass-blur`(= `blur(18px) saturate(170%)`), `--glass-shadow`. 반드시 `background` 불투명 대체값 먼저 쓰고 `@supports (backdrop-filter: blur(1px))` 안에서 유리로.
- 통통한 버튼(clay): 주요 버튼 = `background: var(--grad-brand)` + `box-shadow: inset 0 1px 0 rgb(255 255 255/.35), 0 4px 0 var(--edge-brand), var(--shadow-glow)`; 누르면 `translateY(3px)` + 아래 테두리 1px. 보조 버튼 = surface + `0 3px 0 var(--edge-neutral)`.
- 질감: `--noise`(SVG 잡음, 불투명도 .05) 를 오로라 위에만.

### 3.3 글자
- `--font-sans` Pretendard Variable, `--font-display` 같은 글꼴 800~900 + `letter-spacing:-.035em`, `--font-serif` "Instrument Serif"(이탤릭, 영어 장식만).
- 크기: `--fs-hero: clamp(40px, 7vw, 84px)`, `--fs-1: clamp(28px,4vw,40px)`, `--fs-2 24`, `--fs-3 20`, 본문 16, 작은 글 14·12. 영어 지문 19px/1.85.
- 숫자 `font-variant-numeric: tabular-nums`, 큰 지표 숫자는 800.
- 그라데이션 글자: `.text-grad`(background-clip:text) — 24px 이상 굵은 글자에만.

### 3.4 모션 (tokens.css)
- 시간 `--dur-1 120ms` `--dur-2 200ms` `--dur-3 320ms` `--dur-4 520ms` `--dur-5 800ms`.
- 이징 `--ease-out`(cubic-bezier(.22,1,.36,1)), `--ease-in-out`, `--ease-spring`(살짝 튀는 스프링, linear()), `--ease-bounce`(강한 튐 — 정답 팝 등 축하에만).
- 규칙: 버튼 누름 = `scale(.97)` 120ms; 카드 호버 = `translateY(-3px)` + `--shadow-2` 320ms spring; 목록 등장 = `.reveal` + `--i`(순번) 로 40ms 씩 지연, 520ms spring; 모달 = 배경 페이드 + 패널 `scale(.96)→1` spring; 토스트 = 아래에서 튀어오름; 탭 선택 표시 = 미끄러짐; 진행바 = width spring; 피드백 패널 = 아래에서 슬라이드업 spring; 오답 = 흔들림 360ms; 정답 = 초록 팝(bounce) + 작은 파티클.
- `@media (prefers-reduced-motion: reduce)`: 이동·확대·파티클·오로라 흐름 끔, 페이드는 120ms 이하.

### 3.5 화면 구성
- **상단바**: 유리, 스크롤 시 그림자 생김. 로고 = 그라데이션 타일 "영" + 글자 "영단마스터"(800).
- **하단 탭바(모바일)**: 화면 아래에서 떠 있는 유리 알약(pill), 선택 탭은 그라데이션 알약이 미끄러져 이동(View Transition 이름 `tab-pill`), 아이콘 위로 살짝 튐.
- **세트 카드**: 왼쪽 52px 아이콘 타일(단어=보라 그라데이션+책, 본문=빨강 그라데이션+문단), 제목 600 18px, 메타 칩, 호버 시 떠오름 + 마우스 따라가는 빛(spotlight, `--mx/--my` 를 motion.js 가 설정).
- **홈 벤토**(Codex): [큰 칸] 인사 + "이어서 학습"(최근 세트로 시험) / [중간] 연속 학습일(불꽃 아이콘 흔들림) / [중간] 이번 주 외운 문항(카운트업) / [작은] 복습할 오답 → 바로가기 / 아래 내 세트 그리드.
- **로그인**: 오로라 배경 위 유리 카드(폼 영역은 불투명 면), 탭은 미끄러지는 알약.
- **시험(Claude)**: 상단 그라데이션 진행바(빛나는 끝점), 문항 카드 불투명, 보기 = 통통한 카드 + 숫자 키캡, 정답 팝·오답 흔들림, 연속 정답 콤보 배지, 피드백 시트 슬라이드업.
- **결과(Claude)**: 점수 링(원형 진행, 그라데이션 획) 카운트업, 80점 이상 축하 파티클.
- **랜딩(Claude)**: 유리 내비 → 오로라 히어로(키네틱 헤드라인·회전 단어·살아 움직이는 데모 카드) → 영어 단어 흐름 띠(marquee) → 벤토 기능 소개(실제 시험 화면 축소판) → 3단계 흐름(스크롤 진행선) → 그라데이션 CTA → 푸터.

## 4. 진행표
| 단계 | 내용 | 담당 | 상태 |
|---|---|---|---|
| D-1 | 조사·방향·명세(이 문서), tokens.css, motion.js, 셸 전환 | Claude | 완료 — tokens.css·motion.js·셸(오로라·유리·탭 알약·View Transitions) |
| D-2 | app.css 전면 재작성(토큰 참조), 홈 벤토·로그인·세트 카드·전 페이지 마크업 정리 | Codex | 완료 — 리뷰 D-2 9항목 해결 확인(D-3) |
| D-3 | 랜딩 페이지(landing.js + landing.css) | Claude | 완료 — 데스크톱·모바일·라이트·다크 브라우저 확인 |
| D-4 | 시험·결과 모션·게임화 | Claude | 완료 — 콤보·진행바 스프링·정답 팝/파티클·오답 흔들림·점수 링 |
| D-5 | 교차 리뷰 → 브라우저 확인(라이트/다크/모바일/모션 끔) → 배포 | 둘 다 | 완료 2026-11-20 — 운영 배포, 운영 랜딩 화면 확인. 남음: 둘러보기 모바일 필터-목록 간격(Codex), 실기기·동작 줄이기 실제 확인(미확인) |

## 출처
- Figma, 2026 웹 디자인 트렌드: https://www.figma.com/ko-kr/resource-library/web-design-trends/
- setproduct, Glassmorphism·neumorphism·liquid glass: https://setproduct.com/blog/liquid-glass-vs-glassmorphism
- daisyUI, 18 UI design trends 2026: https://trends.daisyui.com/ui-design-trends-2026/
- Duolingo UX 분석: https://www.925studios.co/blog/duolingo-design-breakdown , https://uxplanet.org/ux-and-gamification-in-duolingo-40d55ee09359
- CSS linear() 스프링: https://ics.media/en/entry/260402/ , https://joshwcomeau.com/animation/linear-timing-function
- 스크롤 기반 애니메이션: https://developer.chrome.com/articles/scroll-driven-animations , https://joshwcomeau.com/animation/scroll-driven-animations

## 5. 추가 요청 (2026-11-20 #2)
### 5.0 사용자 지시 원문 요약
1. 로그인 "소셜 계정으로" 버튼에 구글·네이버 **각각의 로고**.
2. 랜딩에 **스크롤 기반 애니메이션·키네틱 타이포그래피** 등 여러 요소를 더해 한눈에 띄게.
3. 테스트 제작 중 **재배포해도 지금까지 한 작업이 사라지지 않게**, 재배포되면 **접속 중인 사람에게 "새로고침" 알림 + 새로고침 버튼**.
4. 인터페이스에 **글래스모피즘**을 더해 부드럽고 깊이감 있게.

### 5.1 결정
| # | 결정 | 근거 |
|---|---|---|
| D9 | D4(유리는 떠 있는 층만)를 완화: **카드·타일·패널도 유리**(`.glass-card`: 반투명 면 + 22px 흐림 + 빛 받는 그라데이션 테두리 + 안쪽 하이라이트 + 보랏빛 그림자). 글이 많은 면(시험 문항·본문 읽기·폼·결과 문항 목록)은 `.glass-card--strong`(80% 불투명)으로 대비 유지. 앱 화면 오로라 세기 .45→.7(유리 뒤로 색이 비쳐야 깊이가 보임). 투명도 줄이기 설정이면 불투명. | 사용자 지시 4. 대비는 strong 층으로 보장. |
| D10 | 저장된 데이터(세트·결과·오답)는 MongoDB 에 있어 배포와 무관하게 유지됨(설명). **아직 저장 안 한 편집 중 세트**는 브라우저에 1초 간격 자동 임시저장 → 새로고침·재배포·탭 닫힘 뒤 다시 열면 "이어서 작성" 복원. 시험은 문항마다 서버 저장이라 새로고침해도 이어 풀기. | 지시 3 "작업이 사라지지 않게". |
| D11 | 재배포 감지: `GET /api/version`(Vercel 의 `VERCEL_GIT_COMMIT_SHA`) 을 접속 시 기억 → 60초마다·탭 복귀 시 비교 → 다르면 **유리 알림 카드**(새 버전 안내 + "작성 중인 내용은 자동 저장돼요" + [새로고침] [나중에]). 강제 새로고침 안 함(풀던 문제·쓰던 글 보호). | 지시 3. |
| D12 | 소셜 버튼은 각 회사 **공식 로고 모양**(구글 4색 G, 네이버 초록 N)을 인라인 SVG 로. 버튼 바탕은 우리 디자인(유리/흰 면) 유지, 로고 색은 바꾸지 않음(브랜드 가이드). | 지시 1. |

### 5.2 담당
| 일 | 담당 | 파일 |
|---|---|---|
| 글래스 토큰·`.glass-card` 유틸 | Claude | tokens.css (완료) |
| 재배포 감지 API·알림 UI | Claude | server/app.js, main.js, motion 무관 |
| 편집 중 세트 자동 임시저장·복원 | Claude(이번 변경만 editor.js 를 Claude 가 수정 — Codex 는 그동안 editor.js 수정 금지) | editor.js, drafts.js |
| 랜딩 스크롤·키네틱 | Claude | landing.js, landing.css |
| 소셜 로고 | Codex | login.js, app.css |
| 전 화면 글래스모피즘 적용 | Codex | app.css(+ 필요한 페이지 클래스 추가) |
| 교차 리뷰 | 둘 다 | REVIEW 로그 |
