# 03 마스코트·로고·파비콘 + 간격 정리 계획서

## 사용자 지시 (2026-11-20 원문 요약)
1. 영단마스터의 마스코트를 **Codex 와 함께 창작**하고 캐릭터를 디자인한다.
2. 그 마스코트를 영단마스터의 **로고와 파비콘**으로 삼는다.
3. **Claude Code 혼자** 인터페이스 배열 간격을 검토하고, 겹치거나 간격이 일정하지 않은 부분을 고친다.

## 출발점
- 02 단계에서 로그인 화면용으로 만든 임시 마스코트 '영이'(`public/js/mascot.js` 안의 인라인 SVG): 분홍→보라 물방울 몸, 큰 두 눈, 두 손. 이것을 **초안**으로 보고 Codex 와 다듬거나 대안을 낸다.
- 현재 로고: 그라데이션 사각형 안의 글자 '영'(`.logo-mark`, main.js·login.js·landing.js 3곳). 파비콘: `public/favicon-fox.svg`(옛 여우 — 서비스와 무관).
- 디자인 방향(메모리): 단색·평면 금지, Aurora Glass + Bento, 퍼스널 컬러 붉은색·보라·연분홍. 브랜드 그라데이션 `#E11D48 → #C026D3 → #7C3AED`.

## 단계 · 완료 기준
| # | 단계 | 담당 | 완료 기준 | 상태 |
|---|---|---|---|---|
| 1 | 캐릭터 창작: 시안 3종 + 추천 | Codex | `public/brand/concepts/` 에 SVG 3종 + 미리보기 HTML, 리뷰 로그에 콘셉트 설명·추천 | 완료(A 콩방울 영이·B 북키·C 하이라잇) |
| 1' | 시안 비판·선택 | Claude | 리뷰 로그 `## Claude 리뷰 1` 에 선택·수정 지시(결정 기록 M1) | 완료(A 채택, 수정 3) |
| 2 | 최종 에셋 | Codex | 계약(아래)대로 mascot.svg · logo.svg · favicon.svg · PNG 아이콘 | 완료 |
| 3 | 통합 | Claude | 로고 3곳·파비콘·manifest·apple-touch-icon·mascot.js 가 최종 에셋을 씀, 16px 판독 확인 | 완료(통합 버그 2건 수정) |
| 4 | 교차 리뷰 | 둘 다 | 통합 화면을 Codex 가, 에셋을 Claude 가 비판 → 수정 | 완료(Codex 2건: 1 반박·실측, 1 수정) |
| G | 간격 정리(Claude 단독) | Claude | 전 화면 겹침·간격 불일치 목록 → 수정 → 데스크톱·모바일·다크 스크린샷 | 완료(측정 스크립트로 25화면×2) |

## 파일 소유권
- **Codex**: `public/brand/**`(새 폴더), `public/favicon.svg`, `public/icons/**`(PNG). 리뷰 로그에는 `## Codex …` 절만 추가.
- **Claude**: 그 밖의 전부(`public/js/**`, `public/css/**`, `public/index.html`, `public/manifest.json`, `public/sw.js`, docs 계획서). Codex 는 읽기만.

## 에셋 계약 (Codex ↔ Claude)
- **mascot.svg** — 전신, `viewBox="0 0 200 200"`, 외부 참조·글꼴·`<text>` 금지(글자 모양이 필요하면 path). 그라데이션 id 는 `ydm-` 접두어(한 페이지에 여러 번 넣어도 충돌 없게, Claude 가 넣을 때 id 를 바꿀 수 있도록 `ydm-` 로 시작하는 id 만 사용).
  mascot.js 의 움직임이 그대로 붙도록 아래 클래스를 가진 요소를 포함:
  `mascot__shadow`(바닥 그림자) · `mascot__body`(몸 전체 그룹, 아래 모두를 감쌈) · `mascot__eyes`(두 눈 그룹, 깜빡임) · `mascot__eye` ×2 · `mascot__pupil` ×2(**circle, cx/cy 속성 필수** — 시선 추적이 이 좌표 기준) · `mascot__glint` ×2 · `mascot__lid`(감은 눈 선, 평소 숨김) · `mascot__mouth` · `mascot__hand mascot__hand--l` / `--r`(눈 가리기 때 위로 약 64px 이동해 눈을 덮을 위치·크기) · `mascot__zzz`(졸 때 표시, 평소 숨김).
- **logo.svg** — 로고 마크, `viewBox="0 0 64 64"`, 둥근 사각(또는 캐릭터 실루엣) 안에 마스코트 얼굴. 34px(상단바)·52px(로그인)·26px(랜딩 바닥)에서 읽혀야 함.
- **favicon.svg** — 16·32px 전용 단순화(얼굴+눈 2개 정도, 굵은 형태, 대비 4.5:1 이상). 다크 탭에서도 보이게(배경 면 포함).
- **PNG**(`public/icons/`): `favicon-32.png`, `apple-touch-icon.png`(180, 투명 금지·배경 채움), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`(가운데 80% 안전 영역).
- 색: 브랜드 그라데이션 + 연분홍(#FFE4E8 계열) 보조. 단색·평면 금지(02 방향).

## 결정 기록
- M0 (Claude): 출발점은 임시 '영이'. 이름·성격·형태는 Codex 제안과 비교해 정한다. 글자 '영' 을 쓴 로고는 마스코트 로고로 교체.
- M1 (Claude, Codex 추천과 일치): **A · 콩방울 영이** 채택 — 32px 이하에서 B 는 책 아이콘, C 는 가방·배터리로 오독. 수정: 새싹 잎, 감은 눈·zzz 기본 숨김, 가슴 하트 축소.
- M2 (Claude): 로고 = 상자 없는 머리 실루엣(logo.svg), 파비콘 = 연분홍 둥근 사각 위 머리(favicon.svg). 마스코트 원본은 brand/mascot.svg 한 곳, mascot.js 가 불러 씀. 옛 favicon-fox.svg 삭제.
- G1 (Claude): 간격 규칙 — 섹션 안 요소 사이 20px, stack 안 제목·문단 기본 여백 0(gap 만), 로그인 카드 20px, 시험 하단 버튼 줄은 유리 독(모바일 화면 밖 삐짐 제거). 홈 히어로·결과 요약·랭킹 단상의 다른 간격은 위계용으로 유지.
