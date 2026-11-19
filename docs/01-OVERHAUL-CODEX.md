# Codex 첫 안내 — 영단마스터 대규모 개편

안녕하세요 Codex. 이 프로젝트는 Claude Code(주도) 와 당신(짝)이 함께 진행합니다. 당신은 이전 대화를 모르므로 여기에 필요한 것을 모두 적습니다. **이 문서 → `01-OVERHAUL-PLAN.md` → `01-CONTRACT.md` → `01-OVERHAUL-REVIEW.md` 의 "Codex 작업 1"** 순서로 읽어주세요.

## 1. 프로젝트 배경
- **영단마스터(ydmaster)**: 한국 학생용 영어 학습 웹앱. 사용자가 단어 시험을 만들어 풀고, 친구·랭킹·오답노트·공지·문의·관리자 기능이 있음.
- 사용자(운영자)의 이번 지시(원문 요약):
  1. 목적을 "단순 단어 암기" → "여러 종류의 단어 암기 + **영어 내신 대비 본문 암기**" 로 바꾼다.
  2. 호스팅을 Render → **Vercel** 로. 저장소 github.com/MOOKIrainbowski/ydmaster, git push 로 배포. (Render 첫 로드가 너무 느림)
  3. 목적에 맞는 시험 생성 방식·시험 종류를 새로 설계·개발.
  4. UI 가독성·디자인 품질이 낮다 → **두 에이전트가 토의해 원인을 찾고** 원인을 고쳐 전체 품질을 크게 올린다.
  5. 시스템·UI 의 오류와 모순을 **전부 색인**하고 전부 고친다.
  6. 서로 계획을 쓰고 시작을 알리며, 지시는 최대한 상세히.

## 2. 폴더 구조 (현재 = 기준 커밋 `e7900e5`)
```
backend/server.js          Express + Mongoose API 전체 (1,957줄)
backend/public/index.html  프론트 전체 단일 파일 (11,355줄: 27~6679 CSS, 6693~11352 JS)
backend/public/privacy.html, favicon-fox.svg
index (1).html, privacy.html   루트 사본(중복, 삭제 예정)
render.yaml                Render 설정 (환경변수 목록 참고)
docs/                      계획·계약·리뷰 문서
```
- 개편 후 목표 구조(P1~P3): `server/`(API), `api/index.js`(Vercel 함수), `public/`(정적: index.html, css/, js/), `test/`. 자세한 건 계획서 R1~R4.
- **주의**: Claude 가 P1 에서 파일을 옮깁니다. 이슈 색인의 줄 번호는 반드시 기준 커밋으로 적으세요: `git show e7900e5:backend/public/index.html`, `git show e7900e5:backend/server.js`. 표기는 `index.html:1234` / `server.js:567`.

## 3. 빌드·실행·시험
- Node 24 설치됨. 현재는 `cd backend && npm install && node server.js` (MONGODB_URI 없으면 localhost Mongo 시도). 로컬에 Mongo 서버·운영 비밀값은 **없습니다**. 운영 DB 에 절대 접속·쓰기하지 마세요.
- P2 부터 `npm test` (node:test + mongodb-memory-server) 를 Claude 가 만듭니다.

## 4. 당신의 몫 (전체 개편 기간)
1. **이슈 전수 색인** `docs/01-ISSUES.md` (당신 소유) — 지시 5의 근거 문서.
2. **디자인 원인 진단 + 디자인 시스템 제안** `docs/01-DESIGN.md` 의 "Codex 진단" 절 → 토의 후 **`public/css/app.css` 제작**(P3).
3. **계획·계약 비판 리뷰**, Vercel 서버리스 조사.
4. P2: 본문 파서·채점용 **golden 데이터** `test/fixtures/` (실제 고교 교과서 스타일 지문, 경계 사례).
5. P3: 시험·결과 화면을 뺀 **모든 페이지 모듈** `public/js/pages/*.js` (계약 §4 규칙).
6. 매 단계 Claude 결과물 교차 리뷰.

## 5. 하지 말 것
- Claude 소유 파일(계획서 §4) 수정 금지. 버그를 찾으면 리뷰 로그에 `파일:줄 · 무엇 · 실패 장면 · 고칠 방향` 으로.
- 커밋·푸시·배포 금지(Claude 만). 작업물은 작업 트리에 두고 리뷰 로그에 완료 보고.
- 비밀값 출력·외부 전송 금지. 운영 DB·운영 URL 에 쓰기 요청 금지.
- 칭찬·일반론 금지. 모든 지적은 구체적 위치와 실패 장면.

## 6. 소통
- 모든 배정·리뷰·답변·완료 보고는 `docs/01-OVERHAUL-REVIEW.md` 에 덧붙입니다(맨 아래에 추가, 남의 절 수정 금지).
- 작업을 끝내면 Claude 터미널로 알려주세요: `hc send t18 "Codex 작업 N 완료 — REVIEW.md 참고"` (t18 = Claude Code). 질문도 같은 방법.
- 문서는 한국어. 코드 주석도 한국어로 **왜** 를 남기기.
