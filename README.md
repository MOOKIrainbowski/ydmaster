# WordMaster — 영어 단어 테스트 플랫폼

## 📁 프로젝트 구조
```
wordtest/
├── backend/
│   ├── server.js          # Express + MongoDB API 서버
│   ├── package.json
│   └── .env.example
├── frontend/
│   └── index.html         # 완전한 싱글페이지 앱
├── render.yaml            # Render 배포 설정
└── README.md
```

---

## 🚀 배포 방법 (30분 완성)

### 1단계 — MongoDB Atlas 설정

1. [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) 에서 무료 계정 생성
2. **Create Cluster** → M0 (무료) 선택
3. Database Access → Add Database User (username + password)
4. Network Access → **0.0.0.0/0** 추가 (Render에서 접근 허용)
5. **Connect** → Drivers → Connection String 복사
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/wordtest
   ```

### 2단계 — GitHub 업로드

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/wordtest.git
git push -u origin main
```

### 3단계 — Render 백엔드 배포

1. [render.com](https://render.com) 로그인 (GitHub 연동)
2. **New Web Service** → GitHub 저장소 선택
3. 설정:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. **Environment Variables** 추가:
   ```
   MONGODB_URI = mongodb+srv://...  (Atlas에서 복사)
   JWT_SECRET  = my_super_secret_key_2024  (임의의 긴 문자열)
   PORT        = 10000
   ```
5. **Deploy** 클릭 → 배포 완료 후 URL 복사 (예: `https://wordtest-backend.onrender.com`)

### 4단계 — Frontend URL 업데이트

`frontend/index.html` 파일 상단의 API 주소 변경:
```javascript
const API = 'https://wordtest-backend.onrender.com/api'; // ← Render URL
```

### 5단계 — Frontend 배포 (GitHub Pages)

1. `frontend` 폴더를 GitHub 저장소에 업로드
2. Repository Settings → **Pages** → Source: `main` branch, `/frontend` folder
3. 완료! `https://YOUR_USERNAME.github.io/wordtest/` 에서 접속 가능

**또는 Vercel/Netlify 사용:**
- Netlify: New site → GitHub → `frontend` 폴더 → Publish

---

## ⚙️ 기능 목록

### 🔐 유저 시스템
- 회원가입 / 로그인 (JWT 인증)
- 7일 토큰 유지
- 개인 대시보드

### 📝 테스트 만들기
- 영어→한글 / 한글→영어 문항 타입 선택
- 문항당 최대 6개 보기
- 정답 보기 지정 (클릭으로 간편 설정)
- 공개/비공개 설정
- 테스트 수정 / 삭제

### 🎯 테스트 응시
- 실시간 타이머
- 정답/오답 실시간 카운팅
- 즉각적인 정답 피드백
- 진행도 바

### 📊 결과 분석
- 정답률 / 정답 수 / 오답 수 / 소요 시간
- 문항별 리뷰 (틀린 문항 정답 확인)
- 성적 등급 표시

### 📈 기록 관리
- 최근 20개 응시 기록
- 평균 정답률 / 최고 정답률 통계

---

## 🛠 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | Vanilla JS, HTML5, CSS3 |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas + Mongoose |
| Auth | JWT + bcrypt |
| 배포 (BE) | Render |
| 배포 (FE) | GitHub Pages / Netlify |

---

## 📌 로컬 개발 환경

```bash
# 백엔드
cd backend
cp .env.example .env  # 환경변수 편집
npm install
npm run dev

# 프론트엔드
# frontend/index.html에서 API 주소를 http://localhost:5000/api 로 변경
# 브라우저에서 직접 열거나 Live Server 사용
```
