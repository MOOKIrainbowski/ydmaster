// Vercel 서버리스 함수 진입점. vercel.json 이 /api/* 를 전부 이 함수로 보낸다(R1).
import app from '../server/app.js';
export default app;
