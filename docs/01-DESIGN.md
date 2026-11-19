# 01 디자인 진단 · 디자인 시스템

> 지시 4: "두 에이전트가 토의해 원인을 찾고 원인을 개선". 진단(각자) → 토의(REVIEW 로그) → 합의안(§3) → `public/css/app.css`.

## 1. Claude 진단 (가설, 코드 근거)
| # | 증상 | 원인(근거) |
|---|---|---|
| C1 | 화면마다 모양이 제각각 | CSS 6,650줄이 기능 추가 때마다 덧붙여짐. 같은 컴포넌트가 여러 번 재정의(예: `/* ── TOAST ── */` 381행·625행, `/* ── MODAL ── */` 406행·3136행), 라이트 테마는 "무색 → 검정" 같은 사후 패치(209행~). |
| C2 | 가독성 낮음 | 기본 다크 + 네온 그라데이션(#6c63ff→#ff6584)을 로고·버튼·배너·이메일까지 남용 → 강조가 강조가 아님. 장식용 영문 폰트 Syne 와 Noto Sans KR 혼용. |
| C3 | 위계 없음 | JS 템플릿 안 인라인 `style=` 대량(예: topNav) → 간격·크기 체계가 없음. |
| C4 | 접근성 | `user-scalable=no, maximum-scale=1` 로 확대 금지. 이모지를 아이콘 대용. |
| C5 | 첫 화면 느림 | head 의 동기 스크립트(chart.js, xlsx ~1MB) + Render 슬립. |
(화면 캡처 기반 진단은 P3 시작 전 Claude 가 추가)

## 2. Codex 진단

| # | 증상 | 원인(근거) |
|---|---|---|
| X1 | 모바일에서 긴 문항·작은 입력을 읽기 어려움 | viewport가 확대를 막음(index.html:4-5). 시험 문항·편집기·표가 좁은 화면에서도 정보량을 줄이지 않고 표시됨(index.html:7990-8455, 시험 8688-8878). |
| X2 | 강조와 피드백의 위계가 약함 | 짙은 바탕에 보라·분홍·초록·노랑을 동시에 넓게 사용하고 뒤쪽 CSS 패치가 누적됨(index.html:39-85, 스타일 27-6679). 색 하나가 브랜드·정답·장식 역할을 겸함. |
| X3 | 같은 동작이 화면별로 달라 보이고 동작함 | 토스트·모달 스타일과 템플릿이 중복되고 공용 컴포넌트 계층이 없음(index.html:381-430, 625, 6777-6795). |
| X4 | 화면 밀도가 일정하지 않음 | 페이지 템플릿이 JS 문자열과 인라인 스타일로 구성되어 공통 간격·타이포 토큰을 적용할 경계가 없음(예: index.html:6950-7023, 7419-7562, 8688-8900). |
| X5 | 편집 화면에서 조작 실수가 나기 쉬움 | 표·문항 편집·가져오기 기능이 작은 화면에서도 한 화면에 모두 있고 선택·붙여넣기·행 삭제 상태를 시각적으로 요약하지 않음(index.html:7990-8455). |
| X6 | 시험 피드백을 색만으로 구분할 위험 | 정답/오답 표시가 템플릿별로 구현되어 색·아이콘·문구 규칙이 일관되지 않음(index.html:8766-8837, 결과 8982-9010). |
| X7 | 레이아웃 이동과 첫 렌더 지연 | 외부 웹폰트, Chart.js·xlsx head 동기 로드(index.html:13-24), 페이지 렌더 후 차트 생성(index.html:8979)이 겹침. |
| X8 | 화면 전환 후 오래된 UI 동작이 남을 수 있음 | 전역 상태·이벤트 구조가 페이지 생명주기와 분리되어 observer·timeout·interval 해제가 한곳에서 보장되지 않음(index.html:7157-7181, 8624-8668, 11277-11306). |

### Claude 진단에 대한 의견

- C1(중복 CSS)·C3(인라인 스타일)·C4(확대 제한)·C5(동기 스크립트)는 기준 코드에서 확인된다.
- C2의 기본 다크는 사실이나, 해결을 다크 전용 개선으로 좁히면 안 된다. 기본 테마 선호 결정이 없으므로 라이트 기본과 다크 선택을 같은 토큰으로 제공해야 한다. 강조색·상태색 역할 분리와 실제 대비 검증이 핵심이다.
- 폰트 종류만 바꾸는 것으로 C2는 해결되지 않는다. CDN이 불가해도 한글 시스템 글꼴로 읽히고, 본문 암기 화면에서 영문 크기·줄간격이 독립적으로 충분해야 한다.

### 제안 디자인 시스템 (토의용 초안)

1. **원칙**: 학습 본문 우선(장식 최소화), 한 화면 한 주과제, 라이트/다크에서 같은 정보 위계, 모바일 우선·확대 허용, 색 외에 아이콘과 문구로 상태 전달.
2. **색 토큰**: 라이트 배경 #f8fafc, 표면 #fff, 본문 #172033, 보조 #475569, 테두리 #cbd5e1. 다크 배경 #0f172a, 표면 #1e293b, 본문 #f1f5f9, 보조 #cbd5e1, 테두리 #475569. 강조색 #4f46e5(흰 배경 대비 약 6.3:1), 정답 #15803d, 오답 #b91c1c, 경고 #a16207. 상태색만 칠하지 말고 아이콘과 레이블 병용. 본문 텍스트 대비 4.5:1, 큰 글자/굵은 글자 3:1, 포커스/컨트롤 경계 3:1 이상을 목표로 CSS 확정 시 모든 상태 계산 검증.
3. **글꼴**: Pretendard, Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif. CDN 사용 시 정적 파일 버전·경로 고정 및 font-display: swap; 시스템 fallback은 외부 요청 없이 즉시 렌더. 라이선스 확인.
4. **글자 크기·줄간격**: 12/14/16/18/20/24/32px, 본문 1.65, UI 1.45, 영어 지문 18px 이상·1.8. 200% 확대에서 핵심 흐름 유지.
5. **간격**: 4/8/12/16/24/32/48/64px. 기본 읽기 폭 65–75자, 작은 화면은 화면 폭에 맞춤.
6. **모서리·그림자**: 입력/칩 8px, 카드/모달 12px, pill 버튼 강제 금지. 경계선 우선, 팝오버·모달에만 낮은 그림자.
7. **공통 컴포넌트**: 버튼, 입력/선택, 카드, 탭, 칩, 목록 행, 모달, 토스트, 빈 상태, 스켈레톤, 진행바, 하단 탭바. 각 상태는 기본·hover(포인터만)·active·disabled·focus-visible. 터치 영역 44×44 CSS px 이상, 키보드 포커스 외곽선 2px 이상, disabled는 실제 비활성화.
8. **시험 화면**: 한 번에 한 문항, 영어 문장 크게, 진행률·남은 문항을 텍스트로 제공, 제출 중 중복 입력 방지. 피드백은 색+아이콘+“정답/다시 확인” 문구를 동시에 제공.

## 3. 합의안 — 디자인 원칙 · 토큰 (Claude 확정 v1, 2026-11-19)

토의 결과: 원인은 "색·폰트 선택" 보다 **공용 디자인 계층이 없는 구조**(C1·C3·X3·X4)이고, 그 위에서 장식(그라데이션·다색)이 정보 위계를 덮은 것(C2·X2). 해결 순서: ① 토큰·컴포넌트 계층을 먼저 만들고 ② 페이지는 그 클래스만 조합(인라인 style 금지, 계약 §4) ③ 장식 제거.

1. **원칙** (Codex 안 채택): 학습 내용 우선·장식 최소 / 한 화면 한 과제 / 라이트·다크 같은 위계 / 모바일 우선·확대 허용 / 상태는 색+아이콘+문구. **그라데이션 배경·네온 그림자 금지**(사용자가 고른 배너 색만 예외).
2. **테마**: 라이트 기본. `prefers-color-scheme: dark` 를 따르고, 설정에서 라이트/다크/시스템 선택(`html[data-theme="light|dark"]`, 미지정 = 시스템). 강조색은 1개 고정(옛 "강조색 고르기" 폐기 — 대비 보장 불가).
3. **색 토큰** (Codex 안 + 리뷰 4 반영해 다크 글자용 강조 분리):
   - 라이트: --bg #f8fafc, --surface #ffffff, --surface-2 #f1f5f9, --text #172033, --text-2 #475569, --border #cbd5e1, --accent #4f46e5, --accent-text #4338ca, --accent-soft #eef2ff, --ok #15803d, --ok-soft #dcfce7, --bad #b91c1c, --bad-soft #fee2e2, --warn #a16207, --warn-soft #fef9c3
   - 다크: --bg #0f172a, --surface #1e293b, --surface-2 #273449, --text #f1f5f9, --text-2 #cbd5e1, --border #475569, --accent #6366f1(채움용, 흰 글자), --accent-text #a5b4fc(글자용), --accent-soft #312e81, --ok #4ade80, --ok-soft #14532d, --bad #f87171, --bad-soft #7f1d1d, --warn #facc15, --warn-soft #713f12
   - 규칙: 글자색은 --accent-text, 버튼 채움은 --accent + 흰 글자. 각 조합 대비값을 app.css 상단 주석에 기록.
4. **글꼴**: Pretendard Variable — `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css` (OFL). 대체: system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif. 영어 본문도 같은 글꼴, 숫자는 tabular-nums.
5. **크기 단계**: 12/14/16/18/20/24/32. 본문 16/1.65, UI 14~16/1.45, **영어 지문 18/1.8**, 단어 카드 표제어 32.
6. **간격**: 4/8/12/16/24/32/48/64. 콘텐츠 최대 폭 720px(시험·편집), 목록 960px.
7. **모서리·그림자**: 입력·칩 8, 카드·모달 12, 그림자는 모달·팝오버만.
8. **시험 화면 전용 컴포넌트** (리뷰 5 반영. 스타일은 Codex 의 app.css, 마크업은 Claude 의 play.js):
   - `.blank` 문장 속 빈칸 입력: 폭 = 서버가 주는 글자수 힌트 기반(최소 4ch, 최대 20ch), 밑줄형, `.is-ok`/`.is-bad` 상태.
   - `.chip` 어순 조각: 최소 높이 44px. 고르면 답 줄로 이동, 답 줄의 칩을 누르면 되돌림.
   - `.order-card` 문장 순서: 전체 폭 카드, 번호 배지, 위/아래 이동 버튼(드래그 없이 조작).
   - `.choice` 객관식 보기: 전체 폭, 번호 배지(키보드 1~5), `.is-ok`/`.is-bad`/`.is-dim`.
   - `.inline-choice` 문장 속 [A / B] 토글 묶음.
   - `.feedback` 하단 고정 패널: 아이콘+정답/오답 문구+정답 표시+다음 버튼.
   - `.diff` 영작 비교: `.diff__ok`, `.diff__miss`(밑줄·빠뜨린 단어), `.diff__extra`(취소선).
9. **아이콘**: 인라인 SVG 한 세트(ui.js 의 `icon()`). 이모지 아이콘 금지.

## 4. 컴포넌트 클래스 목록 (app.css 가 제공, 페이지는 이것만 조합)

페이지는 `ui.js`의 `html` 템플릿을 사용하고 아래 클래스에 상태 수식어를 붙인다. 사용자 데이터는 텍스트로 전달하고 `raw()`는 `icon()` 등 신뢰 가능한 고정 마크업에만 쓴다.

### 페이지와 레이아웃

| 클래스 | 용도 |
|---|---|
| `.page` `.page--narrow` | 기본 960px 콘텐츠, 시험·편집·결과는 720px |
| `.section` `.section__head` `.section__title` | 페이지 안 콘텐츠 영역과 제목 |
| `.stack` `.field-row` `.btn-row` | 세로 폼, 반응형 필드 행, 버튼 묶음 |
| `.topbar` `.topbar__brand` `.topbar__nav` `.topbar__link` `.topbar__me` | 데스크톱 셸 |
| `.tabbar` `.tabbar__item` | 모바일 하단 내비게이션. 현재 항목에 `.is-active`와 `aria-current="page"` |
| `.app--focus` `.app--guest` | 시험 중 셸 숨김, 비로그인 하단 탭 숨김 |
| `.skip-link` `.sr-only` `.muted` `.pre-line` | 건너뛰기 링크, 보조기기 전용 텍스트, 보조 문구, 줄바꿈 |

```html
<div class="page page--narrow">
  <section class="section">
    <div class="section__head"><h2 class="section__title">내 세트</h2></div>
    <div class="stack"><!-- 내용 --></div>
  </section>
</div>
```

### 공용 컴포넌트

| 컴포넌트 | 클래스 / 상태 |
|---|---|
| 버튼 | `.btn`, `.btn--primary`, `.btn--ghost`, `.btn--danger`, `.btn--icon`, `.btn--sm`, `.btn--block`; 진행 중은 `aria-busy="true"`, 불가 상태는 실제 `disabled` |
| 입력 | `.field`, `.field__label`, `.field__hint`, `.input`, `.select`, `.check`; 가로로 놓을 때 `.field-row` |
| 카드·목록 | `.card`, `.list-row`, `.list-row__main`, `.list-row__title`, `.list-row__meta`, `.stat-row` |
| 탭·표식 | `.tabs`, `.tabs__tab`, `.badge`; 선택 탭은 `.is-active` 및 `aria-selected` |
| 알림 | `.toast-region`, `.toast`, `.toast--ok`, `.toast--bad`, `.toast--info`; `toast()`가 접근성 영역과 제거 타이머 처리 |
| 모달 | `.modal-backdrop`, `.modal`, `.modal--wide`, `.modal__head`, `.modal__title`, `.modal__body`, `.modal__actions`; `modal()` 사용 |
| 빈 상태·로딩 | `.empty`, `.empty--error`, `.empty__title`, `.empty__desc`, `.skeleton-list`, `.skeleton`, `.progress`, `.progress__bar` |
| 아바타·아이콘 | `.avatar` (`--size` 사용자 지정), `.avatar--letter`, `.icon`; 아이콘은 `ui.js`의 SVG `icon()` |
| 시험 설정 | `.mode-grid`, `.mode-option`, `.mode-option__label`, `.mode-option__desc`; 라디오 `:checked` 항목을 강조 |

```js
html`<button class="btn btn--primary" data-save>저장</button>
      <label class="field"><span class="field__label">제목</span>
        <input class="input" name="title"></label>`
```

### 시험·결과 전용

| 화면 | 클래스 / 상태 |
|---|---|
| 시험 셸 | `.play`, `.play__bar`, `.play__count`, `.play__body`, `.play__foot`, `.play__input` |
| 질문·본문 | `.prompt`, `.prompt__text`, `.prompt__text--en`, `.prompt__sub`, `.passage`, `.passage--dim`, `.passage-ko` |
| 빈칸·선택 | `.blank` + `--w` 글자 폭, `.inline-choice`, `.inline-choice__opt[aria-checked]`, `.is-ok`, `.is-bad` |
| 객관식 | `.choices`, `.choice`, `.choice__num`, `.choice__text`, `.is-ok`, `.is-bad`, `.is-dim` |
| 어순·문장 배열 | `.chip-line`, `.chip-pool`, `.chip`, `.chip--placed`, `.order-list`, `.order-card`, `.order-card__num`, `.order-card__text`, `.order-card__move` |
| 피드백·영작 diff | `.feedback`, `.feedback--ok`, `.feedback--bad`, `.feedback__head`, `.feedback__answer`, `.feedback__label`, `.diff`, `.diff__ok`, `.diff__miss`, `.diff__extra` |
| 결과 | `.result-summary`, `.result-summary__mode`, `.result-summary__score`, `.result-summary__grade`, `.review-list`, `.review-item`, `.review-item__head`, `.review-item__num`, `.review-item__prompt`, `.review-item__answers`; 결과 항목은 `.is-ok`/`.is-bad` |

```html
<p class="passage" lang="en">We protect the
  <input class="blank" style="--w:8ch" aria-label="빈칸 1"> together.
</p>
<div class="feedback feedback--ok" role="alert">
  <div class="feedback__head"><strong>정답이에요</strong></div>
</div>
```

동적 `--w` 같은 수치만 인라인 스타일을 허용한다. 모든 버튼·입력은 키보드 `:focus-visible` 표시를 유지하고, 애니메이션은 `prefers-reduced-motion` 설정을 따른다. 실제 라이트/다크 컴포넌트 모음은 `public/css/_preview.html`에서 확인한다.
