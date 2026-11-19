# 영단마스터 기능 이전 추적표

기준은 `e7900e5:backend/public/index.html` 및 `server.js`다. 이전 기능은 사용자에게 보이는 작업 기준으로 묶었고, 현재 위치/API는 P1 이후 계약과 `public/js/main.js`, `public/js/pages/`, `server/app.js`, `server/learn.js`를 대조했다. 완료 표시는 코드 경로 확인 기준이며 실제 브라우저 검증을 뜻하지 않는다.

| 기능 | 구버전 위치 | 결정 | 새 화면·API (계약 기준) | 상태·확인 기준 |
|---|---|---|---|---|
| 이메일 가입·로그인·코드 인증·비밀번호 재설정·로그아웃 | `index.html:6800-6915, 7050-7140` | 유지, 인증은 서버 권위 | `login.js`; `/auth/register`, `/auth/login`, `/auth/verify-code`, `/auth/resend-code`, `/auth/forgot-password`, `/auth/reset-password` | 이관. 화면 모듈 및 API 호출 확인 |
| 네이버·Google 로그인 및 callback | `index.html:10900-11030` | 유지 | `login.js`, `/api/auth/{provider}` callback | 이관. 외부 OAuth 실로그인 미검증 |
| 홈 요약·최근 세트·세트 생성 진입 | `index.html:7135-7260` | 유지·재배치 | `home.js`; `/stats`, `/sets?scope=mine`; `/new/vocab`, `/new/passage` | 이관. 집계/브라우저 미검증 |
| 공개·내 세트 검색/필터/정렬/페이지 | `index.html:7261-7435` | 유지, 서버 페이지네이션 | `explore.js`; `/sets?scope=explore|mine&q=&kind=&sort=&page=` | 이관. 검색 조합 E2E 미검증 |
| 즐겨찾기 목록·토글 | `index.html:7436-7500` | 유지, 멱등성은 계약/서버 책임 | `explore.js`, `set.js`; `/sets?scope=fav`, `/sets/:id/favorite` | 이관. 동시 요청 미검증 |
| 세트 상세 및 공개/친구/비공개 열람 정책 | `index.html:7436-7500`, `buildPublicProfile` 경로 | 유지, `canView` 서버 정책 | `set.js`, `user.js`; `/sets/:id`, `/p/:username` | 이관. 권한 조합 미검증 |
| 세트 복사·삭제·수정 | `index.html:7436-7500`, `editTest` | 유지, kind별 전체 교체 | `set.js`, `editor.js`; `/sets/:id/copy`, `PUT/DELETE /sets/:id` | 이관. 편집 기록 보존 실데이터 미검증 |
| 단어 세트 편집·붙여넣기·CSV/XLSX 가져오기 | `index.html:7501-8310` (`buildCellEditor`, `ssPasteHandler`, `ssParseCSV`, `ssParseExcel`) | 유지, 새 편집기로 대체 | `editor.js`; `POST /sets`, `PUT /sets/:id`; XLSX는 파일 선택 시 고정 버전 동적 로드 | 이관. 실제 XLSX 파일/대형 입력 미검증 |
| 본문 세트·문장 분리·핵심 표현·선택지 | `index.html:7501-8310` (`buildEssayEditor`, `syncEssayQuestions`) | 유지·마크업 규칙은 계약 준수 | `editor.js`, `shared/passage.js`; `/sets`, `/sets/:id` | 이관. 긴 본문 편집 UX 미검증 |
| 공개 범위/태그/세트 검증 | `index.html:8311-8561` | 유지, 서버가 최종 검증 | `editor.js`; `POST/PUT /sets` | 이관. 경계 payload 미검증 |
| 시험 방식·문항 수·순서 설정 | `index.html:7480-7500, 8562-8603` | 유지, 문항 수와 정답은 서버 세션 권위 | `set.js` → `startTest`; `/sessions` 등 계약 엔드포인트 | 이관. 서버 세션 흐름 수동 확인 미실시 |
| 객관식·주관식·빈칸·어순·문장 순서 시험 | `index.html:8604-8900` | 기능 유지, 엔진/정답판정 서버 권위 | `play.js`, `start.js`, `server/learn.js`; 계약의 session answer/finish API | 이관. 자동 `npm test`는 별도 Claude 확인, 이번 작업에서 미실행 |
| 즉시 피드백/종료 후 피드백 | `index.html:8750-8900` | 계약 v2: 기본 즉시, 선택형 종료 후 피드백 | `play.js`; 계약의 `options.feedback` | 이관. 두 모드 브라우저 흐름 미검증 |
| 시험 종료·재시작·제한시간 | `index.html:8624-8900` | 종료/재시작 유지. 제한시간은 Claude 답변 4에서 폐기 결정 | `play.js`, `server/learn.js` | 종료/재시작 이관. 시간 제한은 의도적 제거 |
| 결과 요약·문항별 정답·개인 성적 차트 | `index.html:8901-9192` | 요약/문항별 결과 유지. 개인 차트는 Claude 답변 4에서 폐기 결정(기록은 history/result 요약으로 대체) | `result.js`; 결과 조회 API. 관리자 차트는 `admin.js` 에서 진입 시 lazy load | 결과 요약/문항별 기록 이관. 개인 차트는 의도적 제거 |
| 응시 기록·세부 결과 | `index.html:9193-9225` (`buildHistory`) | 유지, 페이지 단위 조회 | `history.js`; `/results?page=` | 이관. 다음 페이지/빈 목록 수동 확인 미실시 |
| 프로필·아바타·배너·비밀번호·테마 | `index.html:9226-9650` | 유지, 이미지 처리/저장 구조 변경 가능 | `me.js`; `/auth/me`, `PUT /auth/profile` | 이관. 실제 이미지/모바일 업로드 미검증 |
| 친구 검색·요청·수락/거절·삭제 | `index.html:10383-10580` | 유지, 친구 관계는 서버 대칭 저장 | `friends.js`; `/users/search`, `/friends*` | 이관. 두 사용자 동시 동작 미검증 |
| 공개 프로필·친구 요청 | `index.html:10581-10720` | 유지, 공개 필드 allowlist | `user.js`; `/p/:username`, `/friends/request` | 이관. 비로그인/접근권한 조합 미검증 |
| 공지 목록·상세·관리자 작성/삭제 | `index.html:9651-9800` | 유지 | `notice.js`; `/notices`, 관리자 공지 API | 이관. 권한별 CRUD 미검증 |
| 문의 작성·필터·좋아요·관리자 답변 | `index.html:9801-10382` | 유지, 권한·중복 좋아요는 서버 권위 | `inquiry.js`; `/inquiries*`, 관리자 API | 이관. 동시 좋아요/응답 미검증 |
| 관리자 통계·사용자·문의·로그·차트 | `index.html:9900-10382` | 유지, 역할 검증은 서버에서 수행 | `admin.js`; `/admin/*`; Chart.js는 통계 진입 시 lazy load | 이관. 관리자 계정 화면 미검증 |
| 오답노트 저장·삭제·복습 | `index.html:10721-10900` | 새 학습 기록 기능과 분리. 기존 오답은 읽기 전용으로 제공하고 필요한 단어는 새 세트로 저장 | `wrong.js`; `/wrong`, DELETE `/wrong/:set/:item`, `/legacy-wrongnote`, `POST /sets` | 계약 v2 대체안 구현. 이전 데이터 실환경 미검증 |
| 개인정보 처리방침 | `privacy.html:1-178`, `buildPrivacyPage` | 별도 정적 페이지 유지 | `/privacy.html` | 링크/정책 내용 운영 확인 필요 |
| PWA 설치·서비스워커 업데이트 안내 | `index.html:11031-11352`, `server.js:1861-1934` | 유지하되 정적 자산으로 제공 | `public/` manifest/service worker 및 앱 셸 | 이전됨. 설치·업데이트 브라우저 확인 미실시 |
| 시험/문항 제한시간 | `index.html:8311-8561, 8624-8900` (`timeLimit`, `testTimeLimit`) | 학습용 즉시 피드백 흐름과 맞지 않아 Claude 답변 4에서 폐기 결정 | 새 `play.js`에는 타이머 UI/제출 로직 없음 | 의도적 제거 |
| 문항 TTS | `index.html:10800-10860` (`wnSpeak`) | Claude 리뷰 7 결정: 시험·세트 상세·오답 목록 세 곳 모두 영어 발음 버튼 | `play.js`, `set.js`, `wrong.js`; 공용 `ui.js:speak` | 구현 확인. dev-server API만 확인했고 음성 합성/브라우저 지원은 미확인 |
| 로그인 랜딩 후기·정적 마케팅 화면 | `index.html:7024-7050` | 유지하되 새 셸 랜딩으로 단순화 | `landing.js` | 대체. 콘텐츠 동등성은 요구사항 확인 필요 |
| 계정 탈퇴 | `index.html:10500-10580` | 유지, 삭제 범위/재인증 정책은 서버 계약 우선 | `me.js`; `/auth/account/delete` | 이관. 실제 연관 데이터 정리 별도 검증 필요 |

## 범위 판정

- 동작을 새 API/페이지에서 확인한 기능은 `이관`; 기존 구현을 계약의 서버 권위 구조로 바꾼 것은 `유지`로 표시했다.
- Claude 리뷰 7에서 TTS 범위가 확정되어 세 화면의 구현을 대조했다. Claude 답변 4에서 개인 결과 차트와 시험/문항 제한시간을 새 체계에서 폐기하기로 결정했다.
- 이번 표는 기준 커밋과 구현 파일/API 이름의 정적 대조다. 전체 사용자 흐름, 실제 외부 서비스, 모바일 화면은 실행 검증하지 않았다.
- dev-server API 스모크 확인(기존 `localhost:5000`, demo 관리자 로그인, 데이터 변경 없이 GET): `/auth/me`, `/stats`, `/modes`, 세트 mine/explore/fav, `/wrong`, `/legacy-wrongnote`, `/results?page=0`, `/ranking`, 친구/요청, 공지, 내 문의, 관리자 통계/차트/사용자/문의/로그가 모두 HTTP 성공 응답을 반환했다. 각 화면에서 데이터가 맞게 보이는지, 쓰기 경로, 시험 생성·응시, TTS, 업로드, 모바일 UI는 확인하지 않았다.
- 응시 기록의 개인 차트와 시험 제한시간은 새 체계에서 폐기하기로 결정됐다.
