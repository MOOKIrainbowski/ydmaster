# 영단마스터 (ydmaster)

단어와 영어 내신 본문을 외우는 학습 웹앱. 배포: https://ydmaster.vercel.app (Vercel, `main` 푸시 시 자동 배포)

## 구조
```
public/        정적 프론트(Vercel CDN). index.html, css/, js/
api/index.js   Vercel 서버리스 함수 — server/app.js 의 Express 앱을 그대로 export
server/app.js  Express + Mongoose API (/api/*)
server/local.js 로컬 개발 서버(정적 + API)
test/          node:test + 메모리 MongoDB
docs/          계획·계약·리뷰·이슈 색인
```

## 로컬 실행
```bash
npm install
# .env 에 MONGODB_URI, JWT_SECRET 등 (아래 표)
npm run dev        # http://localhost:5000
npm test
```

## 환경변수 (Vercel → Settings → Environment Variables)
| 키 | 설명 |
|---|---|
| `MONGODB_URI` | MongoDB Atlas 연결 문자열 (Network Access 0.0.0.0/0 필요) |
| `JWT_SECRET` | JWT 서명 키 |
| `GMAIL_USER`, `GMAIL_PASS` | 인증 메일 발송용 Gmail 계정·앱 비밀번호 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | 구글 로그인 (리디렉션 URI: `<사이트>/api/auth/google/callback`) |
| `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | 네이버 로그인 (Callback: `<사이트>/api/auth/naver/callback`) |
| `FRONTEND_URL`, `BACKEND_URL` | 둘 다 사이트 주소. 기본값 `https://ydmaster.vercel.app` |
