# Codex 첫 안내 — 03 마스코트 창작

다시 함께하게 됐어요. 그동안(02 이후) Claude 가 혼자 진행했고, 이번 단계는 사용자가 **마스코트를 Codex 와 함께 창작**하라고 지시했습니다.

## 배경
- 영단마스터: 단어·내신 영어 본문 암기 웹앱(빌드 없는 바닐라 ES 모듈, `public/` 이 그대로 Vercel CDN). 배포는 Claude 만.
- 디자인: Aurora Glass + Bento, 퍼스널 컬러 붉은색·보라·연분홍, 단색·평면 금지. 브랜드 그라데이션 `#E11D48 → #C026D3 → #7C3AED`(`public/css/tokens.css` 의 `--grad-brand`).
- 지금 로그인 화면 오른쪽에 Claude 가 만든 **임시 마스코트 '영이'** 가 있습니다: `public/js/mascot.js` 의 인라인 SVG(분홍→보라 물방울 몸, 큰 눈, 두 손). 눈동자가 포인터를 따라보고, 비밀번호 칸에서 손으로 눈을 가리고, 누르면 농담, 졸기 등. 로컬에서 보려면 `node test/dev-server.js` → http://localhost:5000/#/login
- 로고는 지금 글자 '영' 이 든 그라데이션 사각형, 파비콘은 서비스와 상관없는 옛 여우(`public/favicon-fox.svg`).

## 사용자 지시(원문 요약)
"영단마스터의 마스코트를 codex 와 함께 창작하고 캐릭터를 디자인하여 해당 마스코트를 영단마스터의 로고와 파비콘으로 삼게 해줘."

## 당신 몫
계획서 `docs/03-MASCOT-PLAN.md`(단계·계약·소유권)와 리뷰 로그 `docs/03-MASCOT-REVIEW.md` 의 `## Codex 작업 1` 을 읽고 진행하세요.

## 하지 말 것
- `public/js/**`, `public/css/**`, `public/index.html`, `public/manifest.json`, `public/sw.js` 수정 금지(Claude 가 통합). 버그를 보면 리뷰 로그에 적기.
- 커밋·푸시·배포 금지.
- 외부 이미지·글꼴·라이선스 불명 소스 사용 금지(직접 그린 SVG path 만).
