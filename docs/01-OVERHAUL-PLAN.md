# 01 영단마스터 대규모 개편 — 계획서 (Claude 소유)

> 다음 대화/에이전트가 이 문서만 읽고 이어갈 수 있게 늘 최신으로 유지한다.
> 짝 문서: `01-CONTRACT.md`(계약) · `01-OVERHAUL-CODEX.md`(Codex 첫 안내) · `01-OVERHAUL-REVIEW.md`(리뷰 로그) · `01-ISSUES.md`(이슈 색인, Codex 소유) · `01-DESIGN.md`(디자인 진단·시스템)

## 0. 사용자 지시 원문 요약 (2026-11-19)
1. **목적 변경**: 단순 단어 암기 → 여러 종류의 단어 암기 + **영어 내신 대비 본문 암기**.
2. **호스팅 이전**: Render → **Vercel**(https://ydmaster.vercel.app), 저장소는 **github.com/MOOKIrainbowski/ydmaster**, git push 로 배포. Render 환경변수 전부 고려. 이유: 첫 로드가 매우 느림.
3. **시험 생성 방식·시험 종류 전면 개편**: 목적에 맞는 시험 체계를 설계·개발.
4. **UI/UX 전면 개선**: 가독성·디자인 품질이 낮음 → 두 에이전트가 토의해 원인을 찾고 원인을 개선.
5. **오류·모순 전수 색인 후 전부 수정**(시스템·UI).
6. 서로에게: 계획을 쓰고 시작을 알릴 것, 지시는 최대한 상세히.

## 1. 현재 상태 (분석 결과, 기준 커밋 `e7900e5`)
- 구조: `backend/server.js`(Express+Mongoose, 1,957줄) + `backend/public/index.html`(단일 파일 11,355줄: CSS 6,650줄 + JS 4,660줄). 루트의 `index (1).html`·`privacy.html` 은 사본(중복).
- 프론트가 `const API = 'https://ydmaster.onrender.com/api'` 하드코딩. 무료 Render 는 유휴 후 잠들어 첫 요청 수십 초.
- `<head>` 에서 chart.js·xlsx(~1MB) 를 **동기 로드** → 첫 화면 렌더도 막음.
- 시험: 클라이언트가 정답이 든 문항 전체를 받아 **클라이언트가 채점**하고 점수를 서버에 신고 → 점수·랭킹 위조 가능.
- 시험 종류: 영↔한 객관식(보기 부족 시 "정답1" 같은 가짜 보기 생성), 주관식 일부, essay(키워드 포함 여부 채점). 본문 학습 기능 없음.
- 보안: 테스트 수정 API 가 `req.body` 를 통째로 저장(작성자 바꿔치기 가능), 비공개 테스트도 ID 로 조회 가능, 전화 가입 시 인증코드를 응답에 그대로 반환(`devCode`), 네이버 OAuth state 미검증, 정규식 검색 주입 등 → 전체 목록은 `01-ISSUES.md`.

## 2. 결정 기록
| # | 결정 | 근거 |
|---|---|---|
| R1 | Vercel 구조: 정적 파일은 `public/`(CDN), API 는 `api/index.js` 하나의 서버리스 함수로 Express 앱을 감싼다. 같은 출처이므로 프론트는 `API='/api'`. | 첫 로드 지연의 원인(Render 슬립 + 동기 스크립트)을 둘 다 제거. Express 코드를 버리지 않고 이전. |
| R2 | 서버는 `server/` 로 옮기고 ESM 으로. `app.listen` 은 로컬 전용 `server/local.js` 에만. Mongo 연결은 전역 캐시. | 서버리스는 요청마다 모듈이 재사용/재생성됨. |
| R3 | 메모리 의존 기능 교체: 레이트리밋 → Mongo TTL 컬렉션, 로그 버퍼 → warn/error 만 Mongo TTL(14일) 저장, `setInterval`/SMTP pool·verify 제거. | 서버리스 인스턴스는 여러 개·수명 짧음. |
| R4 | 프론트는 **빌드 없는 바닐라 ES 모듈**로 재작성(`public/js/**`, `public/css/**`). 프레임워크·번들러 도입 안 함. chart.js 는 필요한 화면에서만 동적 로드, xlsx 는 가져오기 버튼 누를 때만. | 배포 단순·첫 로드 최소. 기존 코드가 바닐라라 이식도 쉬움. |
| R5 | **서버 권위 채점**: 시험은 서버가 "세션"으로 생성, 정답은 서버에만 보관, 문항마다 서버가 채점. 결과·랭킹·오답은 서버 채점값으로만. | 위조 방지(지시 5). |
| R6 | 콘텐츠 단위 = **세트**(DB 컬렉션은 기존 `tests` 유지). 종류 `vocab`(단어) / `passage`(본문). 레거시 문서(`questions[]`)는 **읽을 때 변환**(lazy), 저장 시 새 형식으로. 운영 DB 일괄 마이그레이션 스크립트는 돌리지 않는다. | 운영 데이터 손상 위험 0, 되돌리기 쉬움. |
| R7 | 본문 표기법: 문장 안 `{핵심 표현}` = 빈칸 후보, `[정답|오답|오답]` = 어법·어휘 선택. 파서는 서버·프론트 공용 모듈 하나(`public/js/shared/`). | 한 곳만 원본(품질 기준). 편집기에서 클릭으로 토글 가능. |
| R8 | 오답노트 → **문항별 학습 기록**(ItemStat). 틀리면 오답, 이후 2연속 정답이면 "외움". 기존 WrongNote 는 읽기 전용 "이전 오답노트"로 보존. | 시험 결과와 자동 연동, 복습 시험 생성 가능. |
| R9 | 랭킹: 평균 정답률(쉬운 시험 1회로 1등 가능) → **주간/전체 정답 수**(서버 채점) 기준. | 모순 제거·학습량 동기. |
| R10 | 아바타·배너 base64 를 목록 응답에 싣지 않는다. `/api/users/:id/avatar` 로 별도 제공(캐시). | 랭킹 50명 × 최대 2.8MB 응답 문제. |
| R11 | 전화번호 **신규 가입 중단**(SMS 미구현인데 코드가 응답에 노출되어 인증이 무의미). 기존 전화번호 계정 로그인은 유지. | 보안. 사용자 보고 항목. |
| R12 | 커밋·푸시·배포는 Claude 만. 배포 = `origin`(MOOKIrainbowski) `main` 푸시 → Vercel 자동 배포. 로컬 작업 브랜치 `master` → `git push origin master:main`. 옛 저장소는 `old-origin`(SJXON). | 사용자 지시 2, 공통 지침. |

## 3. 단계 · 진행표
| 단계 | 내용 | 담당 | 상태 | 확인한 것 |
|---|---|---|---|---|
| P0 | 분석·계획·계약 초안, 이슈 전수 색인, 디자인 원인 진단, Vercel 조사, 계획 비판 리뷰 | Claude: 계획/계약 · Codex: 색인/진단/조사/리뷰 | 진행 중 | 서버 전체 정독, 프론트 구조 파악, 푸시 권한 확인 |
| P1 | Vercel 이전: 폴더 재구성(R1~R3), 기존 프론트 그대로 `/api` 로 연결, 급한 보안 수정, 배포 | Claude | 대기 | |
| P2 | 학습 엔진: 세트 API, 본문 파서, 문제 생성기, 세션·채점, 학습기록, 랭킹·아바타 API + 자동 테스트 | Claude (Codex: golden 데이터·경계 사례) | 대기 | |
| P3 | 프론트 재작성: 디자인 시스템(app.css), 앱 셸·라우터, 전 페이지 | Claude: 셸·시험·결과 화면 / Codex: app.css·나머지 페이지 | 대기 | |
| P4 | 통합·교차 리뷰·이슈 색인 잔여 0·E2E·배포·인수인계 | Claude (Codex 교차 리뷰) | 대기 | |

## 4. 파일 소유권
| 경로 | 소유 | 비고 |
|---|---|---|
| `server/**`, `api/**`, `vercel.json`, `package.json`, `test/*.test.js` | Claude | |
| `public/js/shared/**` (본문 파서·채점 정규화) | Claude | 서버·프론트 공용 |
| `public/index.html`, `public/js/{main,router,api,state,ui}.js` | Claude | 앱 셸 |
| `public/js/pages/play.js`, `public/js/pages/result.js`, `public/css/play.css` | Claude | 시험·결과 |
| `public/css/app.css` | Codex | 디자인 시스템 + 페이지 스타일 |
| `public/js/pages/*.js` (play·result 제외) | Codex | |
| `test/fixtures/**` | Codex | golden 데이터 |
| `docs/01-ISSUES.md`, `docs/01-DESIGN.md` 의 "Codex" 절 | Codex | |
| `docs/01-OVERHAUL-PLAN.md`, `docs/01-CONTRACT.md` | Claude | Codex 는 REVIEW 에 의견 |

## 5. 사용자가 직접 해야 할 것 (진행하며 갱신)
- [ ] Vercel 프로젝트 → Settings → Environment Variables 에 Render 의 값을 그대로 옮기기: `MONGODB_URI`, `JWT_SECRET`, `GMAIL_USER`, `GMAIL_PASS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, 그리고 `FRONTEND_URL=https://ydmaster.vercel.app`, `BACKEND_URL=https://ydmaster.vercel.app` (`PORT`·`NODE_ENV` 는 불필요).
- [ ] Google Cloud Console OAuth 승인된 리디렉션 URI 에 `https://ydmaster.vercel.app/api/auth/google/callback` 추가.
- [ ] 네이버 개발자센터 Callback URL 에 `https://ydmaster.vercel.app/api/auth/naver/callback` 추가, 서비스 URL 변경.
- [ ] MongoDB Atlas → Network Access 가 `0.0.0.0/0` 인지 확인(Vercel 은 고정 IP 없음). Atlas 클러스터 지역 알려주기(함수 지역을 가깝게 맞춤).
- [ ] 새 사이트 확인 후 Render 서비스 중지.
