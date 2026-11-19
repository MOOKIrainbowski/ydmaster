// 영단마스터 API — Vercel 서버리스 함수(api/index.js)와 로컬 서버(server/local.js)가 같이 쓰는 Express 앱.
// listen·정적 파일·SPA 폴백은 여기 두지 않는다(R1/R2: Vercel 은 public/ 을 CDN 이 직접 제공).
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { mountLearn, avatarUrl, bannerUrl } from './learn.js';

const app = express();
app.disable('x-powered-by');
// Vercel 은 x-forwarded-for 를 실제 클라이언트 IP 로 덮어쓴다 → 레이트리밋 키로 신뢰 가능
app.set('trust proxy', true);

// 배포 진단: 환경변수 '유무'만 알려준다(값은 절대 응답하지 않음). DB 미들웨어보다 앞에 둔다.
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'GMAIL_USER', 'GMAIL_PASS', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET'];
app.get('/api/health', async (req, res) => {
  let db = 'ok';
  try { await connectDB(); } catch (e) { db = 'fail'; }
  res.json({ db, env: Object.fromEntries(REQUIRED_ENV.map(k => [k, !!process.env[k]])) });
});

// ==================== DB 연결 (서버리스: 인스턴스당 1회, 전역 캐시) ====================
let dbPromise = null;
export function connectDB() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!dbPromise) {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ydmaster';
    dbPromise = mongoose.connect(uri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 5 })
      .then(() => ensureAdmins())
      .catch(err => { dbPromise = null; throw err; });
  }
  return dbPromise;
}
app.use('/api', async (req, res, next) => {
  try { await connectDB(); next(); }
  catch (e) {
    console.error('MongoDB 연결 실패:', e.message);
    res.status(503).json({ message: '서버가 데이터베이스에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.' });
  }
});

// ==================== 로그 (R3: warn/error 만 Mongo TTL 14일, 메모리 버퍼 폐기) ====================
const LogSchema = new mongoose.Schema({
  ts: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 14 },
  level: String,
  message: String,
});
const Log = mongoose.model('Log', LogSchema);
function pushLog(level, message) {
  const text = typeof message === 'string' ? message : JSON.stringify(message);
  if (mongoose.connection.readyState !== 1) return;
  Log.create({ level, message: text.slice(0, 500) }).catch(() => {});
}
const _origError = console.error.bind(console);
const _origWarn = console.warn.bind(console);
console.error = (...a) => { const m = a.map(String).join(' '); pushLog('error', m); _origError(m); };
console.warn = (...a) => { const m = a.map(String).join(' '); pushLog('warn', m); _origWarn(m); };

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (res.statusCode >= 500) pushLog('error', `${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// 같은 출처(Vercel 한 도메인)에서만 쓰므로 CORS 는 로컬 개발 출처만 허용
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
// Vercel 요청 본문 한도 4.5MB. 이미지 base64 2.8MB 를 담을 수 있게 4mb.
app.use(express.json({ limit: '4mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ==================== Rate Limiting (R3: 인스턴스 간 공유되도록 Mongo 고정 창) ====================
const RateSchema = new mongoose.Schema({
  _id: String,
  n: { type: Number, default: 0 },
  exp: { type: Date, expires: 0 },
});
const Rate = mongoose.model('Rate', RateSchema);

function createRateLimit(maxRequests, windowMs, message) {
  return async (req, res, next) => {
    try {
      const win = Math.floor(Date.now() / windowMs);
      const key = `${req.ip}:${req.path}:${windowMs}:${win}`;
      const doc = await Rate.findOneAndUpdate(
        { _id: key },
        { $inc: { n: 1 }, $setOnInsert: { exp: new Date((win + 1) * windowMs) } },
        { upsert: true, new: true }
      );
      if (doc.n > maxRequests)
        return res.status(429).json({ message: message || '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
    } catch (e) {
      // 레이트리밋 저장소 장애로 서비스 전체를 막지 않는다
      _origWarn('rate limit 실패:', e.message);
    }
    next();
  };
}

function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const isObjectId = id => mongoose.isValidObjectId(id) && String(id).length === 24;

// ==================== 입력값 검증 헬퍼 ====================
function sanitizeString(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidUsername(username) {
  return /^[a-zA-Z0-9가-힣_]{2,20}$/.test(username);
}

function isStrongPassword(password) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

function isValidPhone(phone) {
  return /^01[016789]\d{7,8}$/.test(phone.replace(/[-\s]/g, ''));
}

function normalizePhone(phone) {
  return phone.replace(/[-\s]/g, '');
}

function isValidBase64Image(str) {
  if (!str) return true;
  return /^data:image\/(jpeg|jpg|png|webp|gif);base64,/.test(str);
}

// ==================== MAILER ====================
// 서버리스에서는 pool/verify 가 인스턴스 동결로 끊긴다 → 요청마다 단발 연결.
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// ==================== SCHEMAS ====================
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: { type: String, default: '' },
  password: { type: String, default: '' },
  isVerified: { type: Boolean, default: false },
  naverId: { type: String, default: '' },
  loginType: { type: String, enum: ['local', 'naver', 'google'], default: 'local' },
  googleId: { type: String, default: '' },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  avatarImage: { type: String, default: '' },
  bannerImage: { type: String, default: '' },
  bannerGradient: { type: String, default: 'linear-gradient(135deg,#6c63ff,#ff6584)' },
  isAdmin: { type: Boolean, default: false },
  favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Test' }],
  imageVersion: { type: Number, default: 0 }, // 아바타·배너 URL 캐시 무효화용(R10)
  createdAt: { type: Date, default: Date.now }
});

const EmailVerificationSchema = new mongoose.Schema({
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  username: { type: String, required: true },
  password: { type: String, required: true },
  token: { type: String, required: true },
  code: { type: String, default: '' },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now, expires: 3600 }
});

const FriendRequestSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const QuestionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
  options: [{ type: String }],
  correctAnswer: { type: Number, default: 0 },
  questionType: { type: String, enum: ['en-to-ko', 'ko-to-en'], default: 'en-to-ko' },
  timeLimit: { type: Number, default: 0 },
  keywords: [{ type: String }],
  answerContext: { type: String, default: '' }
});

const TestSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  questions: [QuestionSchema],
  format: { type: String, enum: ['section', 'cell', 'essay'] }, // 레거시
  // ── P2 세트 형식(계약 §1.1). 레거시 문서엔 없고 learn.js 의 toSet() 이 읽을 때 변환 ──
  kind: { type: String, enum: ['vocab', 'passage'] },
  visibility: { type: String, enum: ['public', 'friends', 'private'] },
  items: [{ term: String, meaning: String, example: String, exampleKo: String }],
  passage: { source: String, sentences: [{ en: String, ko: String }] },
  testTimeLimit: { type: Number, default: 0 },
  isPublic: { type: Boolean },
  isFriendOnly: { type: Boolean },
  tags: [String],
  playCount: { type: Number, default: 0 },
  favoriteCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const ResultSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  test: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  testTitle: { type: String },
  score: { type: Number, required: true },
  totalQuestions: { type: Number, required: true },
  correctAnswers: { type: Number, required: true },
  wrongAnswers: { type: Number, required: true },
  percentage: { type: Number, required: true },
  answers: [{ questionIndex: Number, selectedAnswer: Number, isCorrect: Boolean }],
  timeTaken: { type: Number, default: 0 },
  mode: String, kind: String,
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
  createdAt: { type: Date, default: Date.now }
});

const NoticeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isPinned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const InquirySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  status: { type: String, enum: ['pending', 'answered'], default: 'pending' },
  answer: { type: String, default: '' },
  answeredAt: { type: Date },
  answeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

const WrongNoteSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test' },
  testTitle: { type: String, default: '' },
  words: [{ question: String, answer: String }],
  savedAt: { type: Date, default: Date.now }
});

const PasswordResetSchema = new mongoose.Schema({
  email: { type: String, required: true },
  token: { type: String, required: true, unique: true },
  code: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});
PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const User = mongoose.model('User', UserSchema);
const EmailVerification = mongoose.model('EmailVerification', EmailVerificationSchema);
const PasswordReset = mongoose.model('PasswordReset', PasswordResetSchema);
const FriendRequest = mongoose.model('FriendRequest', FriendRequestSchema);
const Test = mongoose.model('Test', TestSchema);
const Result = mongoose.model('Result', ResultSchema);
const Notice = mongoose.model('Notice', NoticeSchema);
const Inquiry = mongoose.model('Inquiry', InquirySchema);
const WrongNote = mongoose.model('WrongNote', WrongNoteSchema);

// ==================== MIDDLEWARE ====================
const auth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: '인증이 필요합니다.' });
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) return res.status(500).json({ message: '서버 설정 오류' });
  try {
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    if (!decoded.id) return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ message: '사용자를 찾을 수 없습니다.' });
    next();
  } catch (e) {
    if (e.name === 'TokenExpiredError')
      return res.status(401).json({ message: '로그인이 만료되었습니다. 다시 로그인해주세요.' });
    res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
  }
};

const adminAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: '인증이 필요합니다.' });
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) return res.status(500).json({ message: '서버 설정 오류' });
  try {
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    if (!decoded.id) return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ message: '사용자를 찾을 수 없습니다.' });
    if (!req.user.isAdmin) return res.status(403).json({ message: '관리자 권한이 필요합니다.' });
    next();
  } catch (e) {
    if (e.name === 'TokenExpiredError')
      return res.status(401).json({ message: '로그인이 만료되었습니다. 다시 로그인해주세요.' });
    res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
  }
};

const ADMIN_EMAILS = ['sjxonv@gmail.com', 'code.rainbow.ski@gmail.com', 'youngdanmaster@gmail.com'];
async function ensureAdmins() {
  try {
    await User.updateMany({ email: { $in: ADMIN_EMAILS } }, { $set: { isAdmin: true } });
  } catch (e) { console.error('관리자 설정 오류:', e.message); }
}

// ==================== 이메일 발송 헬퍼 ====================
const SITE_URL = 'https://ydmaster.vercel.app';
const FRONTEND_URL = process.env.FRONTEND_URL || SITE_URL;
const BACKEND_URL = process.env.BACKEND_URL || SITE_URL;

async function sendVerificationEmail(email, username, code) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const html = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
  body{margin:0;padding:0;background:#f4f4f8;font-family:'Noto Sans KR',Apple SD Gothic Neo,sans-serif}
  .wrap{max-width:520px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .header{background:linear-gradient(135deg,#6c63ff,#ff6584);padding:36px 32px;text-align:center}
  .header h1{margin:0;color:white;font-size:26px;font-weight:800;letter-spacing:-1px}
  .header p{margin:8px 0 0;color:rgba(255,255,255,.85);font-size:13px}
  .body{padding:36px 32px}
  .greeting{font-size:16px;font-weight:700;color:#1a1a2e;margin-bottom:12px}
  .desc{font-size:14px;color:#555;line-height:1.7;margin-bottom:24px}
  .code-box{background:linear-gradient(135deg,#f0eeff,#fff0f4);border:2px solid #6c63ff;border-radius:14px;padding:28px;text-align:center;margin:0 0 24px}
  .code{font-size:42px;font-weight:900;letter-spacing:10px;color:#6c63ff;font-family:monospace}
  .code-label{font-size:12px;color:#888;margin-top:8px}
  .expire-box{background:#fff8e8;border:1px solid #ffd166;border-radius:10px;padding:12px 16px;font-size:13px;color:#8a6400;margin-bottom:20px;text-align:center}
  .warn{font-size:13px;color:#999;line-height:1.6}
  .footer{background:#f8f8ff;padding:18px 32px;text-align:center;font-size:12px;color:#aaa;border-top:1px solid #eee}
  .footer strong{color:#6c63ff}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>영단마스터</h1>
    <p>이메일 인증 코드</p>
  </div>
  <div class="body">
    <div class="greeting">안녕하세요, ${username}님! 👋</div>
    <p class="desc">아래 6자리 인증 코드를 영단마스터 회원가입 화면에 입력해주세요.</p>
    <div class="code-box">
      <div class="code">${code}</div>
      <div class="code-label">위 코드를 입력해주세요</div>
    </div>
    <div class="expire-box">⏰ 이 코드는 <strong>10분</strong> 후 만료됩니다.</div>
    <p class="warn">본인이 요청하지 않은 경우 이 메일을 무시하세요.<br>코드를 타인에게 절대 공유하지 마세요.</p>
  </div>
  <div class="footer">
    <strong>영단마스터</strong> — 나만의 영어 단어 테스트 플랫폼<br>
    발신일: ${dateStr}
  </div>
</div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"영단마스터 인증" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `[영단마스터] 인증 코드: ${code}`,
      html,
      headers: {
        'X-Mailer': 'YDMaster-Mailer',
        'Precedence': 'bulk',
      }
    });
    console.log(`인증 코드 발송 성공: ${email}`);
  } catch (mailErr) {
    console.error('메일 발송 실패:', mailErr.message);
    throw new Error('메일 발송에 실패했습니다. 이메일 주소를 확인하거나 잠시 후 다시 시도해주세요.');
  }
}

// 6자리 코드 대입 방지: 레코드당 5회 틀리면 폐기(IP 레이트리밋만으로는 IP 를 바꾸면 우회됨)
async function codeMatches(record, code) {
  if (record.code === String(code || '').trim()) return true;
  record.attempts = (record.attempts || 0) + 1;
  if (record.attempts >= 5) await record.deleteOne();
  else await record.save();
  return false;
}

// ==================== AUTH ====================

app.post('/api/auth/register',
  createRateLimit(5, 60 * 60 * 1000, '회원가입 시도가 너무 많습니다. 1시간 후 다시 시도해주세요.'),
  async (req, res) => {
    try {
      const username = sanitizeString(req.body.username, 20);
      const email = sanitizeString(req.body.email || '', 254).toLowerCase();
      const phone = normalizePhone(sanitizeString(req.body.phone || '', 20));
      const password = req.body.password || '';
      const { agreedToTerms } = req.body;
      const usePhone = !!phone && !email;
      // R11: SMS 발송이 구현되지 않아 코드가 응답으로 새던 구조 → 전화번호 신규 가입 중단(기존 계정 로그인은 유지)
      if (usePhone)
        return res.status(400).json({ message: '전화번호 가입은 현재 지원하지 않습니다. 이메일로 가입해주세요.' });

      if (!username || (!email && !phone) || !password)
        return res.status(400).json({ message: '모든 필드를 입력해주세요.' });
      if (!isValidUsername(username))
        return res.status(400).json({ message: '사용자명은 2~20자의 영문, 한글, 숫자, 언더스코어만 사용 가능합니다.' });
      if (!usePhone && !isValidEmail(email))
        return res.status(400).json({ message: '유효한 이메일 주소를 입력해주세요.' });
      if (usePhone && !isValidPhone(phone))
        return res.status(400).json({ message: '유효한 전화번호를 입력해주세요. (예: 010-1234-5678)' });
      if (password.length < 8)
        return res.status(400).json({ message: '비밀번호는 8자 이상이어야 합니다.' });
      if (!isStrongPassword(password))
        return res.status(400).json({ message: '비밀번호는 영문과 숫자를 포함해야 합니다.' });
      if (!agreedToTerms)
        return res.status(400).json({ message: '개인정보 수집·이용에 동의해주세요.' });

      if (!usePhone && (!process.env.GMAIL_USER || !process.env.GMAIL_PASS))
        return res.status(500).json({ message: '메일 서버 설정이 완료되지 않았습니다. 관리자에게 문의하세요.' });

      const query = usePhone
        ? { $or: [{ phone }, { username }] }
        : { $or: [{ email }, { username }] };
      const existsUser = await User.findOne(query);
      if (existsUser) return res.status(400).json({
        message: existsUser.username === username ? '이미 사용 중인 사용자명입니다.'
          : usePhone ? '이미 사용 중인 전화번호입니다.' : '이미 사용 중인 이메일입니다.'
      });

      if (usePhone) await EmailVerification.deleteMany({ phone });
      else await EmailVerification.deleteMany({ email });

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const token = crypto.randomBytes(32).toString('hex');
      const hashed = await bcrypt.hash(password, 12);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const verifyData = { username, password: hashed, token, code, expiresAt };
      if (usePhone) verifyData.phone = phone;
      else verifyData.email = email;
      await new EmailVerification(verifyData).save();

      await sendVerificationEmail(email, username, code);
      res.status(200).json({ message: '인증 코드를 발송했습니다. 이메일을 확인해주세요.', token, verifyType: 'email' });
    } catch (e) {
      console.error('register error:', e.message);
      res.status(500).json({ message: e.message || '인증 코드 발송 중 오류가 발생했습니다.' });
    }
  });

app.post('/api/auth/verify-code',
  createRateLimit(10, 10 * 60 * 1000, '인증 시도가 너무 많습니다. 10분 후 다시 시도해주세요.'),
  async (req, res) => {
    try {
      const { token, code } = req.body;
      if (!token || !code)
        return res.status(400).json({ message: '토큰과 인증 코드를 입력해주세요.' });

      const record = await EmailVerification.findOne({ token });
      if (!record)
        return res.status(400).json({ message: '인증 정보를 찾을 수 없습니다. 다시 회원가입을 시도해주세요.' });
      if (record.expiresAt < new Date()) {
        await EmailVerification.deleteOne({ token });
        return res.status(400).json({ message: '인증 코드가 만료되었습니다. 다시 회원가입을 시도해주세요.' });
      }
      if (!(await codeMatches(record, code)))
        return res.status(400).json({ message: '인증 코드가 올바르지 않습니다.' });

      const usePhone = !!record.phone && !record.email;
      const existQuery = usePhone
        ? { $or: [{ phone: record.phone }, { username: record.username }] }
        : { $or: [{ email: record.email }, { username: record.username }] };
      const exists = await User.findOne(existQuery);
      if (exists) {
        await EmailVerification.deleteOne({ token });
        return res.status(400).json({ message: '이미 가입된 계정 또는 사용자명입니다.' });
      }

      const newUserData = {
        username: record.username,
        password: record.password,
        isVerified: true
      };
      if (usePhone) {
        newUserData.phone = record.phone;
        newUserData.email = `phone_${record.phone}@ydmaster.local`;
      } else {
        newUserData.email = record.email;
      }
      // 저장한 문서를 그대로 쓴다(전화 가입 레코드는 email 이 비어 findOne({email:''}) 이 엉뚱한/빈 결과를 냈음)
      const user = await new User(newUserData).save();

      await EmailVerification.deleteOne({ token });

      const jwtToken = jwt.sign({ id: user._id, v: 1 }, process.env.JWT_SECRET, { expiresIn: '7d' });
      res.json({ message: '인증이 완료되었습니다!', token: jwtToken, user: { id: user._id, username: user.username, email: user.email, isAdmin: user.isAdmin || false } });
    } catch (e) {
      console.error('verify-code error:', e);
      res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  });

app.post('/api/auth/resend-code',
  createRateLimit(3, 10 * 60 * 1000, '재발송은 10분에 3회까지 가능합니다.'),
  async (req, res) => {
    try {
      const { token } = req.body;
      const record = await EmailVerification.findOne({ token });
      if (!record || !record.email)
        return res.status(400).json({ message: '인증 정보를 찾을 수 없습니다. 다시 회원가입을 시도해주세요.' });

      const newCode = String(Math.floor(100000 + Math.random() * 900000));
      const newExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

      record.code = newCode;
      record.expiresAt = newExpiresAt;
      await record.save();

      await sendVerificationEmail(record.email, record.username, newCode);
      res.json({ message: '새 인증 코드를 발송했습니다.' });
    } catch (e) {
      console.error('resend-code error:', e);
      res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  });

// ==================== 비밀번호 찾기 ====================
app.post('/api/auth/forgot-password',
  createRateLimit(5, 60 * 60 * 1000, '비밀번호 찾기 요청이 너무 많습니다. 1시간 후 다시 시도해주세요.'),
  async (req, res) => {
    try {
      const email = sanitizeString(req.body.email || '', 254).toLowerCase();
      if (!email || !isValidEmail(email))
        return res.status(400).json({ message: '유효한 이메일 주소를 입력해주세요.' });

      const user = await User.findOne({ email });
      // 보안상 존재 여부와 무관하게 성공 응답
      if (!user || user.loginType !== 'local') {
        return res.json({ message: '인증 코드를 발송했습니다. 이메일을 확인해주세요.', token: '' });
      }

      await PasswordReset.deleteMany({ email });
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await new PasswordReset({ email, token, code, expiresAt }).save();

      const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<style>
  body{margin:0;padding:0;background:#f4f4f8;font-family:'Noto Sans KR',sans-serif}
  .wrap{max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .header{background:linear-gradient(135deg,#6c63ff,#ff6584);padding:36px 32px;text-align:center}
  .header h1{margin:0;color:white;font-size:26px;font-weight:800}
  .body{padding:36px 32px}
  .code-box{background:linear-gradient(135deg,#f0eeff,#fff0f4);border:2px solid #6c63ff;border-radius:14px;padding:28px;text-align:center;margin:0 0 24px}
  .code{font-size:42px;font-weight:900;letter-spacing:10px;color:#6c63ff;font-family:monospace}
  .expire-box{background:#fff8e8;border:1px solid #ffd166;border-radius:10px;padding:12px 16px;font-size:13px;color:#8a6400;margin-bottom:20px;text-align:center}
  .footer{background:#f8f8ff;padding:18px 32px;text-align:center;font-size:12px;color:#aaa;border-top:1px solid #eee}
</style></head><body>
<div class="wrap">
  <div class="header"><h1>영단마스터</h1><p style="margin:8px 0 0;color:rgba(255,255,255,.85);font-size:13px">비밀번호 재설정</p></div>
  <div class="body">
    <p style="font-size:16px;font-weight:700;color:#1a1a2e;margin-bottom:12px">안녕하세요! 👋</p>
    <p style="font-size:14px;color:#555;line-height:1.7;margin-bottom:24px">아래 6자리 코드를 입력하여 비밀번호를 재설정해주세요.</p>
    <div class="code-box"><div class="code">${code}</div></div>
    <div class="expire-box">⏰ 이 코드는 <strong>10분</strong> 후 만료됩니다.</div>
    <p style="font-size:13px;color:#999">본인이 요청하지 않은 경우 이 메일을 무시하세요.</p>
  </div>
  <div class="footer"><strong style="color:#6c63ff">영단마스터</strong> — 나만의 영어 단어 테스트 플랫폼</div>
</div></body></html>`;

      await transporter.sendMail({
        from: `"영단마스터" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: `[영단마스터] 비밀번호 재설정 코드: ${code}`,
        html,
      });
      res.json({ message: '인증 코드를 발송했습니다. 이메일을 확인해주세요.', token });
    } catch (e) {
      console.error('forgot-password error:', e.message);
      res.status(500).json({ message: '오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
    }
  });

app.post('/api/auth/reset-password',
  createRateLimit(10, 10 * 60 * 1000, '요청이 너무 많습니다. 10분 후 다시 시도해주세요.'),
  async (req, res) => {
    try {
      const { token, code, newPassword } = req.body;
      if (!token || !code || !newPassword)
        return res.status(400).json({ message: '모든 필드를 입력해주세요.' });
      if (newPassword.length < 8 || !isStrongPassword(newPassword))
        return res.status(400).json({ message: '비밀번호는 영문과 숫자를 포함한 8자 이상이어야 합니다.' });

      const record = await PasswordReset.findOne({ token });
      if (!record) return res.status(400).json({ message: '인증 정보를 찾을 수 없습니다. 다시 시도해주세요.' });
      if (record.expiresAt < new Date()) {
        await PasswordReset.deleteOne({ token });
        return res.status(400).json({ message: '코드가 만료되었습니다. 다시 시도해주세요.' });
      }
      if (!(await codeMatches(record, code)))
        return res.status(400).json({ message: '인증 코드가 올바르지 않습니다.' });

      const hashed = await bcrypt.hash(newPassword, 12);
      await User.updateOne({ email: record.email }, { $set: { password: hashed } });
      await PasswordReset.deleteOne({ token });
      res.json({ message: '비밀번호가 성공적으로 변경되었습니다. 로그인해주세요.' });
    } catch (e) {
      console.error('reset-password error:', e.message);
      res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  });

app.get('/api/auth/verify-email', async (req, res) => {
  return res.send(verifyPage('expired'));
});

function verifyPage(status, username = '') {
  const configs = {
    success: {
      emoji: '🎉',
      title: '인증 완료!',
      msg: `<strong>${username}</strong>님, 이메일 인증이 완료되었습니다.<br>이제 영단마스터에 로그인하실 수 있어요!`,
      btnText: '로그인하러 가기',
      color: '#43e97b'
    },
    expired: {
      emoji: '⏰',
      title: '링크가 만료됐어요',
      msg: '인증 링크가 만료되었습니다.<br>다시 회원가입을 시도해주세요.',
      btnText: '회원가입으로 돌아가기',
      color: '#ffd166'
    },
    duplicate: {
      emoji: '⚠️',
      title: '이미 가입된 계정',
      msg: '이미 가입된 이메일 또는 사용자명입니다.<br>로그인을 시도해주세요.',
      btnText: '로그인하러 가기',
      color: '#ff6584'
    },
    error: {
      emoji: '❌',
      title: '오류가 발생했어요',
      msg: '인증 처리 중 오류가 발생했습니다.<br>다시 시도해주세요.',
      btnText: '홈으로 돌아가기',
      color: '#ff6584'
    }
  };
  const c = configs[status] || configs.error;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>영단마스터 — 이메일 인증</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;800&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{min-height:100vh;background:#0a0a0f;display:flex;align-items:center;justify-content:center;font-family:'Noto Sans KR',sans-serif;padding:20px}
    .card{background:#1c1c25;border:1.5px solid #2a2a38;border-radius:24px;padding:48px 36px;max-width:420px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.4)}
    .emoji{font-size:4rem;margin-bottom:16px;display:block}
    .logo{font-size:1rem;font-weight:800;background:linear-gradient(135deg,#6c63ff,#ff6584);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:24px}
    h1{font-size:1.6rem;font-weight:800;color:#e8e8f0;margin-bottom:14px;letter-spacing:-.5px}
    p{color:#9191a8;font-size:.95rem;line-height:1.7;margin-bottom:32px}
    p strong{color:${c.color}}
    .btn{display:inline-block;background:linear-gradient(135deg,#6c63ff,#ff6584);color:white;text-decoration:none;padding:14px 36px;border-radius:12px;font-size:1rem;font-weight:700;transition:opacity .2s}
    .btn:hover{opacity:.85}
    .meta{margin-top:20px;font-size:.78rem;color:#55556a}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">영단마스터</div>
    <span class="emoji">${c.emoji}</span>
    <h1>${c.title}</h1>
    <p>${c.msg}</p>
    <a href="${FRONTEND_URL}" class="btn">${c.btnText}</a>
    <div class="meta">영단마스터 — 나만의 영어 단어 테스트 플랫폼</div>
  </div>
</body>
</html>`;
}

app.post('/api/auth/login',
  createRateLimit(10, 15 * 60 * 1000, '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.'),
  async (req, res) => {
    try {
      const identifier = sanitizeString(req.body.email, 254).toLowerCase();
      const password = req.body.password || '';

      if (!identifier || !password)
        return res.status(400).json({ message: '이메일/전화번호와 비밀번호를 입력해주세요.' });

      const isPhone = isValidPhone(identifier);
      if (!isPhone && !isValidEmail(identifier))
        return res.status(400).json({ message: '유효한 이메일 또는 전화번호를 입력해주세요.' });

      const user = isPhone
        ? await User.findOne({ phone: normalizePhone(identifier) })
        : await User.findOne({ email: identifier });
      const dummyHash = '$2a$12$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      const passwordMatch = user
        ? await bcrypt.compare(password, user.password || dummyHash)
        : await bcrypt.compare(password, dummyHash).then(() => false);

      if (!user || !passwordMatch)
        return res.status(400).json({ message: '계정 정보 또는 비밀번호가 올바르지 않습니다.' });
      if (!user.isVerified && user.loginType === 'local')
        return res.status(403).json({ message: '이메일 인증이 필요합니다. 메일함을 확인해주세요.' });

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        console.error('JWT_SECRET 환경변수 미설정');
        return res.status(500).json({ message: '서버 설정 오류가 발생했습니다.' });
      }
      const token = jwt.sign({ id: user._id, v: 1 }, jwtSecret, { expiresIn: '7d' });
      res.json({ token, user: { id: user._id, username: user.username, email: user.email, isAdmin: user.isAdmin || false } });
    } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
  });

app.get('/api/auth/me', auth, (req, res) => {
  res.json({
    user: {
      id: req.user._id, username: req.user.username, email: req.user.email,
      createdAt: req.user.createdAt,
      isAdmin: req.user.isAdmin || false,
      avatarImage: req.user.avatarImage || '',
      bannerImage: req.user.bannerImage || '',
      bannerGradient: req.user.bannerGradient || 'linear-gradient(135deg,#6c63ff,#ff6584)',
      favorites: (req.user.favorites || []).map(id => id.toString()),
      avatarUrl: avatarUrl(req.user), bannerUrl: bannerUrl(req.user), loginType: req.user.loginType
    }
  });
});

app.put('/api/auth/profile', auth, async (req, res) => {
  try {
    const { avatarImage, bannerImage, bannerGradient, username, email } = req.body;
    const update = {};

    if (username !== undefined) {
      const trimmed = String(username).trim();
      // 가입 규칙과 같은 규칙(이전엔 수정 시 공백·특수문자 허용 → 공개 프로필 URL 이 깨짐)
      if (!isValidUsername(trimmed))
        return res.status(400).json({ message: '닉네임은 2~20자의 영문, 한글, 숫자, 언더스코어만 사용 가능합니다.' });
      const exists = await User.findOne({ username: trimmed, _id: { $ne: req.user._id } });
      if (exists) return res.status(400).json({ message: '이미 사용 중인 닉네임입니다.' });
      update.username = trimmed;
    }

    if (email !== undefined) {
      const trimmed = String(email).trim().toLowerCase();
      if (trimmed && trimmed !== req.user.email) {
        if (!isValidEmail(trimmed)) return res.status(400).json({ message: '유효한 이메일 주소를 입력해주세요.' });
        const exists = await User.findOne({ email: trimmed, _id: { $ne: req.user._id } });
        if (exists) return res.status(400).json({ message: '이미 사용 중인 이메일입니다.' });
        update.email = trimmed;
      }
    }

    if (req.body.newPassword) {
      const newPassword = req.body.newPassword;
      const currentPassword = req.body.currentPassword || '';

      if (req.user.loginType !== 'local')
        return res.status(400).json({ message: '소셜 로그인 계정은 비밀번호를 변경할 수 없습니다.' });

      const currentUser = await User.findById(req.user._id);
      const match = await bcrypt.compare(currentPassword, currentUser.password || '');
      if (!match)
        return res.status(400).json({ message: '현재 비밀번호가 올바르지 않습니다.' });

      if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword))
        return res.status(400).json({ message: '새 비밀번호는 8자 이상, 영문+숫자를 포함해야 합니다.' });

      update.password = await bcrypt.hash(newPassword, 12);
    }

    if (avatarImage !== undefined) {
      if (avatarImage && avatarImage.length > 2800000)
        return res.status(400).json({ message: '프로필 사진이 너무 큽니다. 2MB 이하로 올려주세요.' });
      if (avatarImage && !isValidBase64Image(avatarImage))
        return res.status(400).json({ message: '유효한 이미지 파일만 업로드 가능합니다.' });
      update.avatarImage = avatarImage;
    }
    if (bannerImage !== undefined) {
      if (bannerImage && bannerImage.length > 2800000)
        return res.status(400).json({ message: '배너 이미지가 너무 큽니다. 2MB 이하로 올려주세요.' });
      if (bannerImage && !isValidBase64Image(bannerImage))
        return res.status(400).json({ message: '유효한 이미지 파일만 업로드 가능합니다.' });
      update.bannerImage = bannerImage;
    }
    if (bannerGradient !== undefined) {
      // style 속성에 그대로 들어가므로 linear-gradient(각도, #hex, #hex...) 형태만 허용(CSS/HTML 주입 차단)
      if (!/^linear-gradient\(\d{1,3}deg(,\s*#[0-9a-fA-F]{3,8}(\s+\d{1,3}%)?){2,4}\)$/.test(String(bannerGradient)))
        return res.status(400).json({ message: '배너 색상 형식이 올바르지 않습니다.' });
      update.bannerGradient = bannerGradient;
    }

    if (update.avatarImage !== undefined || update.bannerImage !== undefined) update.imageVersion = Date.now();
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select('-password');
    res.json({
      user: {
        id: user._id, username: user.username, email: user.email,
        isAdmin: user.isAdmin || false,
        avatarImage: user.avatarImage || '',
        bannerImage: user.bannerImage || '',
        bannerGradient: user.bannerGradient || 'linear-gradient(135deg,#6c63ff,#ff6584)',
        avatarUrl: avatarUrl(user), bannerUrl: bannerUrl(user)
      }
    });
  } catch (e) {
    console.error('profile update error:', e.message);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// ==================== FRIENDS ====================
app.get('/api/users/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) return res.json([]);
    const users = await User.find({
      username: { $regex: escapeRegex(String(q).trim().slice(0, 20)), $options: 'i' },
      _id: { $ne: req.user._id }
    }).select('username _id').limit(10);
    const friendIds = req.user.friends.map(f => f.toString());
    const pendingReqs = await FriendRequest.find({
      from: req.user._id, status: 'pending',
      to: { $in: users.map(u => u._id) }
    });
    const pendingIds = pendingReqs.map(r => r.to.toString());
    res.json(users.map(u => ({
      _id: u._id, username: u.username,
      isFriend: friendIds.includes(u._id.toString()),
      requestSent: pendingIds.includes(u._id.toString())
    })));
  } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
});

app.get('/api/friends', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('friends', 'username _id');
    res.json(user.friends || []);
  } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
});

app.get('/api/friends/requests', auth, async (req, res) => {
  try {
    const reqs = await FriendRequest.find({ to: req.user._id, status: 'pending' }).populate('from', 'username _id');
    res.json(reqs);
  } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
});

app.post('/api/friends/request', auth, async (req, res) => {
  try {
    const toUserId = String(req.body.toUserId || '');
    if (!isObjectId(toUserId) || !(await User.exists({ _id: toUserId })))
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    if (toUserId === req.user._id.toString())
      return res.status(400).json({ message: '자기 자신에게 친구 요청을 보낼 수 없습니다.' });
    const existing = await FriendRequest.findOne({
      $or: [{ from: req.user._id, to: toUserId }, { from: toUserId, to: req.user._id }],
      status: 'pending'
    });
    if (existing) return res.status(400).json({ message: '이미 친구 요청이 존재합니다.' });
    const isFriend = req.user.friends.map(f => f.toString()).includes(toUserId);
    if (isFriend) return res.status(400).json({ message: '이미 친구입니다.' });
    const req2 = await new FriendRequest({ from: req.user._id, to: toUserId }).save();
    res.status(201).json(req2);
  } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
});

app.put('/api/friends/request/:reqId', auth, async (req, res) => {
  try {
    const { action } = req.body;
    const fr = await FriendRequest.findById(req.params.reqId);
    if (!fr) return res.status(404).json({ message: '요청을 찾을 수 없습니다.' });
    if (fr.to.toString() !== req.user._id.toString())
      return res.status(403).json({ message: '권한이 없습니다.' });
    if (action === 'accept') {
      await User.findByIdAndUpdate(fr.from, { $addToSet: { friends: fr.to } });
      await User.findByIdAndUpdate(fr.to, { $addToSet: { friends: fr.from } });
      fr.status = 'accepted';
    } else { fr.status = 'rejected'; }
    await fr.save();
    res.json({ message: action === 'accept' ? '친구 요청을 수락했습니다.' : '친구 요청을 거절했습니다.' });
  } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
});

app.delete('/api/friends/:friendId', auth, async (req, res) => {
  try {
    if (!isObjectId(req.params.friendId)) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    await User.findByIdAndUpdate(req.user._id, { $pull: { friends: req.params.friendId } });
    await User.findByIdAndUpdate(req.params.friendId, { $pull: { friends: req.user._id } });
    res.json({ message: '친구가 삭제되었습니다.' });
  } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
});

// ==================== OPTION GENERATOR ====================
function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function isKorean(str) { return /[가-힣]/.test(str || ''); }
function buildDistractors(allAnswers, currentAnswer, needed) {
  const answerIsKorean = isKorean(currentAnswer);
  const pool = [...new Set(allAnswers.filter(a => a && a !== currentAnswer && isKorean(a) === answerIsKorean))];
  return shuffleArr(pool).slice(0, needed);
}

app.post('/api/generate-options', auth, (req, res) => {
  try {
    const { questions } = req.body;
    if (!questions || questions.length === 0) return res.json([]);
    const allAnswers = questions.map(q => (q.answer || '').trim()).filter(Boolean);
    const results = questions.map((q, idx) => {
      const correctAnswer = (q.answer || '').trim();
      const otherAnswers = allAnswers.filter((_, i) => i !== idx);
      const distractors = buildDistractors(otherAnswers, correctAnswer, 4);
      while (distractors.length < 4) distractors.push(correctAnswer + (distractors.length + 1));
      const options = shuffleArr([correctAnswer, ...distractors.slice(0, 4)]);
      const correctIndex = options.indexOf(correctAnswer);
      return { options, correctAnswer: correctIndex >= 0 ? correctIndex : 0 };
    });
    res.json(results);
  } catch (e) {
    console.error('generate-options error:', e);
    res.status(500).json({ message: '보기 생성 실패' });
  }
});

// ==================== TESTS ====================
// 열람 권한 판정은 이 함수 한 곳에서만(이전엔 비공개 테스트도 ID 만 알면 정답까지 조회 가능했음)
function canViewTest(user, test) {
  const authorId = String(test.author?._id || test.author);
  if (authorId === String(user._id)) return true;
  if (test.isFriendOnly) return (user.friends || []).some(f => String(f) === authorId);
  return test.isPublic !== false;
}
// 작성자가 바꿀 수 있는 필드만(이전엔 req.body 통째 저장 → author·playCount 위조 가능)
const TEST_EDITABLE = ['title', 'description', 'questions', 'isPublic', 'isFriendOnly', 'tags', 'format', 'testTimeLimit'];

app.get('/api/tests', auth, async (req, res) => {
  try {
    const { search, mine } = req.query;
    const friendIds = req.user.friends.map(f => f.toString());
    let query;
    if (mine === 'true') { query = { author: req.user._id }; }
    else { query = { $or: [{ isPublic: true, isFriendOnly: false }, { author: req.user._id }, { isFriendOnly: true, author: { $in: friendIds } }] }; }
    if (search) query.title = { $regex: escapeRegex(String(search).slice(0, 50)), $options: 'i' };
    const tests = await Test.find(query).populate('author', 'username').sort({ createdAt: -1 }).select('-questions');
    res.json(tests);
  } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
});

app.get('/api/tests/:id', auth, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: '테스트를 찾을 수 없습니다.' });
    const test = await Test.findById(req.params.id).populate('author', 'username');
    if (!test || !test.author || !canViewTest(req.user, test)) return res.status(404).json({ message: '테스트를 찾을 수 없습니다.' });
    res.json(test);
  } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
});

app.post('/api/tests', auth, createRateLimit(30, 60 * 60 * 1000, '테스트 생성 한도를 초과했습니다.'), async (req, res) => {
  try {
    const title = sanitizeString(req.body.title, 100);
    const description = sanitizeString(req.body.description, 500);
    const { questions, isPublic, isFriendOnly, tags, format } = req.body;
    if (!title) return res.status(400).json({ message: '테스트 제목을 입력해주세요.' });
    if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ message: '문항을 1개 이상 추가해주세요.' });
    if (questions.length > 200) return res.status(400).json({ message: '문항은 최대 200개까지 추가할 수 있습니다.' });
    const test = await new Test({ title, description, questions, isPublic: isPublic ?? true, isFriendOnly: isFriendOnly ?? false, tags: tags || [], format: format || 'section', author: req.user._id }).save();
    res.status(201).json(test);
  } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
});

app.put('/api/tests/:id', auth, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: '테스트를 찾을 수 없습니다.' });
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ message: '테스트를 찾을 수 없습니다.' });
    if (test.author.toString() !== req.user._id.toString()) return res.status(403).json({ message: '수정 권한이 없습니다.' });
    const update = { updatedAt: new Date() };
    for (const k of TEST_EDITABLE) if (req.body[k] !== undefined) update[k] = req.body[k];
    if (update.title !== undefined) { update.title = sanitizeString(update.title, 100); if (!update.title) return res.status(400).json({ message: '테스트 제목을 입력해주세요.' }); }
    if (update.description !== undefined) update.description = sanitizeString(update.description, 500);
    if (update.questions !== undefined && (!Array.isArray(update.questions) || !update.questions.length || update.questions.length > 200))
      return res.status(400).json({ message: '문항은 1~200개여야 합니다.' });
    const updated = await Test.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    res.json(updated);
  } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
});

app.delete('/api/tests/:id', auth, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: '테스트를 찾을 수 없습니다.' });
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ message: '테스트를 찾을 수 없습니다.' });
    if (test.author.toString() !== req.user._id.toString()) return res.status(403).json({ message: '삭제 권한이 없습니다.' });
    await Test.findByIdAndDelete(req.params.id);
    res.json({ message: '테스트가 삭제되었습니다.' });
  } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
});

// ==================== RESULTS ====================
app.post('/api/results', auth, async (req, res) => {
  try {
    const { testId, answers, timeTaken, correctAnswers: clientCorrect, totalQuestions: clientTotal } = req.body;
    if (!isObjectId(testId) || !Array.isArray(answers)) return res.status(400).json({ message: '잘못된 요청입니다.' });
    const test = await Test.findById(testId);
    if (!test || !canViewTest(req.user, test)) return res.status(404).json({ message: '테스트를 찾을 수 없습니다.' });
    // 임시 방어(P1): 신고값을 문항 수 범위로 제한. 완전한 서버 채점은 P2(R5).
    const qCount = test.questions?.length || 0;
    const totalQuestions = Math.max(0, Math.min(Number(clientTotal ?? answers.length) || 0, qCount));
    const correctAnswers = Math.max(0, Math.min(Number(clientCorrect) || 0, totalQuestions));
    const wrongAnswers = totalQuestions - correctAnswers;
    const percentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
    const processedAnswers = answers.slice(0, 200).map((ans, idx) => ({ questionIndex: idx, selectedAnswer: ans.selectedAnswer, isCorrect: ans.isCorrect === true }));
    const result = await new Result({ user: req.user._id, test: testId, testTitle: test.title, score: correctAnswers, totalQuestions, correctAnswers, wrongAnswers, percentage, answers: processedAnswers, timeTaken: timeTaken || 0 }).save();
    await Test.findByIdAndUpdate(testId, { $inc: { playCount: 1 } });
    res.status(201).json(result);
  } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
});

// ==================== 오답노트 ====================

// 내 오답노트 전체 조회
app.get('/api/wrongnote', auth, async (req, res) => {
  try {
    const groups = await WrongNote.find({ user: req.user._id })
      .sort({ savedAt: -1 })
      .limit(100);
    res.json({ groups });
  } catch (e) {
    res.status(500).json({ message: '오답노트 조회 실패' });
  }
});

// 오답 저장 (테스트 결과 → 오답노트)
app.post('/api/wrongnote', auth, async (req, res) => {
  try {
    const { testId, testTitle, words } = req.body;
    if (!words || !Array.isArray(words) || words.length === 0)
      return res.status(400).json({ message: '저장할 단어가 없습니다.' });

    // 같은 testId로 오늘 이미 저장한 항목이 있으면 words 합치기 (중복 방지)
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const existing = testId
      ? await WrongNote.findOne({ user: req.user._id, testId, savedAt: { $gte: todayStart } })
      : null;

    if (existing) {
      // 기존 단어와 합쳐서 중복 제거
      const existingQs = new Set(existing.words.map(w => w.question));
      const newWords = words.filter(w => !existingQs.has(w.question));
      existing.words.push(...newWords);
      existing.savedAt = new Date();
      await existing.save();
      return res.status(200).json({ group: existing, added: newWords.length });
    }

    const sanitizedWords = words.slice(0, 200).map(w => ({
      question: String(w.question || '').slice(0, 200),
      answer: String(w.answer || '').slice(0, 200),
    }));

    const group = await new WrongNote({
      user: req.user._id,
      testId: testId || null,
      testTitle: String(testTitle || '').slice(0, 100),
      words: sanitizedWords,
    }).save();

    res.status(201).json({ group, added: sanitizedWords.length });
  } catch (e) {
    console.error('wrongnote save error:', e.message);
    res.status(500).json({ message: '저장 실패' });
  }
});

// 단어 하나 삭제
app.delete('/api/wrongnote/:groupId/word/:wordIdx', auth, async (req, res) => {
  try {
    const group = await WrongNote.findOne({ _id: req.params.groupId, user: req.user._id });
    if (!group) return res.status(404).json({ message: '항목을 찾을 수 없습니다.' });
    const idx = parseInt(req.params.wordIdx);
    if (isNaN(idx) || idx < 0 || idx >= group.words.length)
      return res.status(400).json({ message: '잘못된 인덱스입니다.' });
    group.words.splice(idx, 1);
    // 단어가 모두 삭제되면 그룹 자체 삭제
    if (group.words.length === 0) {
      await WrongNote.findByIdAndDelete(group._id);
    } else {
      await group.save();
    }
    res.json({ message: '삭제되었습니다.' });
  } catch (e) {
    res.status(500).json({ message: '삭제 실패' });
  }
});

// 오답노트 전체 삭제 — 반드시 /:groupId 라우트 앞에 위치해야 함
app.delete('/api/wrongnote', auth, async (req, res) => {
  try {
    await WrongNote.deleteMany({ user: req.user._id });
    res.json({ message: '오답노트가 초기화되었습니다.' });
  } catch (e) {
    res.status(500).json({ message: '삭제 실패' });
  }
});

// 그룹(테스트별) 전체 삭제
app.delete('/api/wrongnote/:groupId', auth, async (req, res) => {
  try {
    const result = await WrongNote.findOneAndDelete({ _id: req.params.groupId, user: req.user._id });
    if (!result) return res.status(404).json({ message: '항목을 찾을 수 없습니다.' });
    res.json({ message: '삭제되었습니다.' });
  } catch (e) {
    res.status(500).json({ message: '삭제 실패' });
  }
});

// ==================== 유저 공개 프로필 ====================
app.get('/api/users/:id/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('username avatarImage bannerImage bannerGradient imageVersion loginType createdAt');
    if (!user) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });

    // 응시 통계
    const results = await Result.find({ user: req.params.id });
    const totalAttempts = results.length;
    const avgScore = totalAttempts > 0
      ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / totalAttempts)
      : 0;
    const bestScore = totalAttempts > 0
      ? Math.max(...results.map(r => r.percentage))
      : 0;

    // 만든 테스트 수 (공개만)
    const totalTests = await Test.countDocuments({ author: req.params.id, isPublic: true });

    res.json({
      user: {
        _id: user._id,
        username: user.username,
        avatarImage: user.avatarImage || '',
        bannerImage: user.bannerImage || '',
        bannerGradient: user.bannerGradient || 'linear-gradient(135deg,#6c63ff,#ff6584)',
        avatarUrl: avatarUrl(user), bannerUrl: bannerUrl(user),
        loginType: user.loginType,
        createdAt: user.createdAt,
      },
      stats: { totalAttempts, avgScore, bestScore, totalTests }
    });
  } catch (e) {
    console.error('user profile error:', e.message);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// ==================== 공개 프로필 (by username) ====================
app.get('/api/p/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('username avatarImage bannerImage bannerGradient imageVersion loginType createdAt friends');
    if (!user) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });

    const results = await Result.find({ user: user._id });
    const totalAttempts = results.length;
    const avgScore = totalAttempts > 0
      ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / totalAttempts)
      : 0;
    const bestScore = totalAttempts > 0
      ? Math.max(...results.map(r => r.percentage))
      : 0;
    const totalTests = await Test.countDocuments({ author: user._id, isPublic: true });
    const friendCount = user.friends?.length || 0;

    // 최근 공개 테스트 (최대 5개)
    const recentTests = await Test.find({ author: user._id, isPublic: true, isFriendOnly: false })
      .sort({ createdAt: -1 }).limit(5).select('title questionCount createdAt');

    // 랭킹 계산
    let rank = null;
    if (totalAttempts > 0) {
      const higherCount = await Result.aggregate([
        { $group: { _id: '$user', avgScore: { $avg: '$percentage' } } },
        { $match: { avgScore: { $gt: avgScore } } },
        { $count: 'count' }
      ]);
      rank = (higherCount[0]?.count || 0) + 1;
    }

    res.json({
      user: {
        _id: user._id,
        username: user.username,
        avatarImage: user.avatarImage || '',
        bannerImage: user.bannerImage || '',
        bannerGradient: user.bannerGradient || 'linear-gradient(135deg,#6c63ff,#ff6584)',
        avatarUrl: avatarUrl(user), bannerUrl: bannerUrl(user),
        loginType: user.loginType,
        createdAt: user.createdAt,
      },
      stats: { totalAttempts, avgScore, bestScore, totalTests, friendCount, rank },
      recentTests
    });
  } catch (e) {
    console.error('public profile error:', e.message);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// ==================== 네이버 소셜 로그인 ====================

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const NAVER_CALLBACK_URL = `${BACKEND_URL}/api/auth/naver/callback`;
const FRONTEND_ORIGIN = FRONTEND_URL;
// OAuth state 는 브라우저 쿠키와 대조(이전엔 생성만 하고 검증 안 함 → 로그인 CSRF)
function readCookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}
const OAUTH_COOKIE = 'Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600';

app.get('/api/auth/naver', (req, res) => {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    return res.redirect(`${FRONTEND_ORIGIN}?naver_error=${encodeURIComponent('네이버 로그인이 설정되지 않았습니다.')}`);
  }
  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', `naver_state=${state}; ${OAUTH_COOKIE}`);
  const url = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(NAVER_CALLBACK_URL)}&state=${state}`;
  res.redirect(url);
});

app.get('/api/auth/naver/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${FRONTEND_ORIGIN}?naver_error=${encodeURIComponent('네이버 로그인이 취소되었습니다.')}`);
    }
    if (!code || !state || state !== readCookie(req, 'naver_state')) {
      return res.redirect(`${FRONTEND_ORIGIN}?naver_error=${encodeURIComponent('잘못된 요청입니다. 다시 시도해주세요.')}`);
    }
    res.setHeader('Set-Cookie', `naver_state=; ${OAUTH_COOKIE.replace('Max-Age=600', 'Max-Age=0')}`);

    const tokenRes = await fetch(
      `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${NAVER_CLIENT_ID}&client_secret=${NAVER_CLIENT_SECRET}&redirect_uri=${encodeURIComponent(NAVER_CALLBACK_URL)}&code=${code}&state=${state}`
    );
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('네이버 토큰 발급 실패:', JSON.stringify(tokenData));
      return res.redirect(`${FRONTEND_ORIGIN}?naver_error=${encodeURIComponent('토큰 발급에 실패했습니다. 잠시 후 다시 시도해주세요.')}`);
    }

    const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profileData = await profileRes.json();
    if (profileData.resultcode !== '00') {
      console.error('네이버 프로필 조회 실패:', JSON.stringify(profileData));
      return res.redirect(`${FRONTEND_ORIGIN}?naver_error=${encodeURIComponent('사용자 정보 조회에 실패했습니다.')}`);
    }

    const naverUser = profileData.response;
    const naverId = String(naverUser.id);
    const email = (naverUser.email || '').toLowerCase().trim();
    const nickname = (naverUser.nickname || naverUser.name || '').trim();

    let user = await User.findOne({ naverId });

    if (!user && email) {
      user = await User.findOne({ email });
      if (user) {
        user.naverId = naverId;
        user.loginType = 'naver';
        user.isVerified = true;
        await user.save();
      }
    }

    if (!user) {
      let base = nickname.replace(/[^a-zA-Z0-9가-힣_]/g, '').slice(0, 18) || `naver${naverId.slice(0, 6)}`;
      let username = base;
      let retry = 0;
      while (await User.findOne({ username }) && retry < 5) {
        username = base + '_' + Math.floor(Math.random() * 9000 + 1000);
        retry++;
      }
      user = await new User({
        username,
        email: email || `naver_${naverId}@naver.social`,
        password: '',
        isVerified: true,
        naverId,
        loginType: 'naver'
      }).save();
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return res.redirect(`${FRONTEND_ORIGIN}?naver_error=${encodeURIComponent('서버 설정 오류입니다.')}`);
    const jwtToken = jwt.sign({ id: user._id, v: 1 }, jwtSecret, { expiresIn: '7d' });
    res.redirect(`${FRONTEND_ORIGIN}?naver_token=${jwtToken}&naver_username=${encodeURIComponent(user.username)}`);

  } catch (e) {
    console.error('네이버 콜백 오류:', e.message);
    res.redirect(`${FRONTEND_ORIGIN}?naver_error=${encodeURIComponent('로그인 처리 중 오류가 발생했습니다.')}`);
  }
});

// ==================== 구글 소셜 로그인 ====================

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = `${BACKEND_URL}/api/auth/google/callback`;

app.get('/api/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.redirect(`${FRONTEND_ORIGIN}?google_error=${encodeURIComponent('구글 로그인이 설정되지 않았습니다.')}`);
  }
  const googleState = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
    state: googleState,
  });
  res.setHeader('Set-Cookie', `google_state=${googleState}; ${OAUTH_COOKIE}`);
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    if (error) {
      return res.redirect(`${FRONTEND_ORIGIN}?google_error=${encodeURIComponent('구글 로그인이 취소되었습니다.')}`);
    }
    if (!code) return res.redirect(`${FRONTEND_ORIGIN}?google_error=${encodeURIComponent('인증 코드가 없습니다.')}`);
    if (!req.query.state || req.query.state !== readCookie(req, 'google_state'))
      return res.redirect(`${FRONTEND_ORIGIN}?google_error=${encodeURIComponent('잘못된 요청입니다. 다시 시도해주세요.')}`);
    res.setHeader('Set-Cookie', `google_state=; ${OAUTH_COOKIE.replace('Max-Age=600', 'Max-Age=0')}`);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code'
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('구글 토큰 발급 실패:', tokenData);
      return res.redirect(`${FRONTEND_ORIGIN}?google_error=${encodeURIComponent('토큰 발급에 실패했습니다.')}`);
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile = await profileRes.json();
    if (!profile.id) {
      return res.redirect(`${FRONTEND_ORIGIN}?google_error=${encodeURIComponent('사용자 정보 조회에 실패했습니다.')}`);
    }

    const googleId = profile.id;
    const email = (profile.email || '').toLowerCase();
    const name = profile.name || profile.given_name || `user_${googleId.slice(0, 6)}`;
    const avatar = profile.picture || '';

    let user = await User.findOne({ googleId });

    if (!user && email) {
      user = await User.findOne({ email });
      if (user) {
        user.googleId = googleId;
        user.isVerified = true;
        await user.save();
      }
    }

    if (!user) {
      let username = name.replace(/[^a-zA-Z0-9가-힣_]/g, '').slice(0, 20) || `google_${googleId.slice(0, 6)}`;
      const exists = await User.findOne({ username });
      if (exists) username = username + '_' + Math.floor(Math.random() * 1000);

      user = await new User({
        username,
        email: email || `google_${googleId}@gmail.social`,
        password: '',
        isVerified: true,
        googleId,
        loginType: 'google',
        avatarImage: avatar
      }).save();
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return res.redirect(`${FRONTEND_ORIGIN}?google_error=${encodeURIComponent('서버 설정 오류입니다.')}`);
    const jwtToken = jwt.sign({ id: user._id, v: 1 }, jwtSecret, { expiresIn: '7d' });
    res.redirect(`${FRONTEND_ORIGIN}?google_token=${jwtToken}&google_username=${encodeURIComponent(user.username)}`);

  } catch (e) {
    console.error('구글 콜백 오류:', e.message);
    res.redirect(`${FRONTEND_ORIGIN}?google_error=${encodeURIComponent('로그인 처리 중 오류가 발생했습니다.')}`);
  }
});

// ==================== 공지사항 ====================

app.get('/api/notices', async (req, res) => {
  try {
    const notices = await Notice.find().populate('author', 'username').sort({ isPinned: -1, createdAt: -1 }).limit(20);
    res.json(notices);
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

app.post('/api/notices', adminAuth, async (req, res) => {
  try {
    const title = sanitizeString(req.body.title, 200);
    const content = sanitizeString(req.body.content, 5000);
    const { isPinned } = req.body;
    if (!title || !content) return res.status(400).json({ message: '제목과 내용을 입력해주세요.' });
    const notice = await new Notice({ title, content, isPinned: !!isPinned, author: req.user._id }).save();
    res.status(201).json(notice);
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

app.put('/api/notices/:id', adminAuth, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: '공지사항을 찾을 수 없습니다.' });
    const update = { updatedAt: new Date() };
    if (req.body.title !== undefined) update.title = sanitizeString(req.body.title, 200);
    if (req.body.content !== undefined) update.content = sanitizeString(req.body.content, 5000);
    if (req.body.isPinned !== undefined) update.isPinned = !!req.body.isPinned;
    if (update.title === '' || update.content === '') return res.status(400).json({ message: '제목과 내용을 입력해주세요.' });
    const notice = await Notice.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!notice) return res.status(404).json({ message: '공지사항을 찾을 수 없습니다.' });
    res.json(notice);
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

app.delete('/api/notices/:id', adminAuth, async (req, res) => {
  try {
    await Notice.findByIdAndDelete(req.params.id);
    res.json({ message: '삭제되었습니다.' });
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

// ==================== 문의하기 ====================

app.post('/api/inquiries', auth, createRateLimit(10, 60 * 60 * 1000, '문의는 1시간에 10회까지 가능합니다.'), async (req, res) => {
  try {
    const title = sanitizeString(req.body.title, 100);
    const content = sanitizeString(req.body.content, 2000);
    if (!title || !content) return res.status(400).json({ message: '제목과 내용을 입력해주세요.' });
    const inquiry = await new Inquiry({ user: req.user._id, title, content }).save();
    res.status(201).json(inquiry);
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

app.get('/api/inquiries/mine', auth, async (req, res) => {
  try {
    const inquiries = await Inquiry.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(inquiries);
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

app.get('/api/inquiries', auth, async (req, res) => {
  try {
    const inquiries = await Inquiry.find().populate('user', 'username').sort({ createdAt: -1 });
    res.json(inquiries);
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

app.post('/api/inquiries/:id/like', auth, async (req, res) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) return res.status(404).json({ message: '문의를 찾을 수 없습니다.' });
    const uid = req.user._id.toString();
    const idx = inquiry.likes.findIndex(id => id.toString() === uid);
    if (idx > -1) inquiry.likes.splice(idx, 1); else inquiry.likes.push(req.user._id);
    await inquiry.save();
    res.json({ likes: inquiry.likes.length, liked: idx === -1 });
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

// ==================== 관리자 API ====================

app.get('/api/admin/inquiries', adminAuth, async (req, res) => {
  try {
    const inquiries = await Inquiry.find().populate('user', 'username email').sort({ createdAt: -1 });
    res.json(inquiries);
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

app.delete('/api/admin/inquiries/:id', adminAuth, async (req, res) => {
  try {
    const inquiry = await Inquiry.findByIdAndDelete(req.params.id);
    if (!inquiry) return res.status(404).json({ message: '문의를 찾을 수 없습니다.' });
    res.json({ message: '삭제되었습니다.' });
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

app.put('/api/admin/inquiries/:id/answer', adminAuth, async (req, res) => {
  try {
    const { answer } = req.body;
    if (!answer) return res.status(400).json({ message: '답변 내용을 입력해주세요.' });
    const inquiry = await Inquiry.findByIdAndUpdate(
      req.params.id,
      { answer, status: 'answered', answeredAt: new Date(), answeredBy: req.user._id },
      { new: true }
    ).populate('user', 'username email');
    if (!inquiry) return res.status(404).json({ message: '문의를 찾을 수 없습니다.' });
    res.json(inquiry);
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

app.put('/api/admin/users/:id/toggle-admin', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: '유저를 찾을 수 없습니다.' });
    if (ADMIN_EMAILS.includes(user.email)) return res.status(400).json({ message: '기본 관리자는 변경할 수 없습니다.' });
    user.isAdmin = !user.isAdmin;
    await user.save();
    res.json({ message: `${user.username}의 관리자 권한이 ${user.isAdmin ? '부여' : '해제'}되었습니다.`, isAdmin: user.isAdmin });
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: '유저를 찾을 수 없습니다.' });
    if (ADMIN_EMAILS.includes(user.email)) return res.status(400).json({ message: '기본 관리자는 삭제할 수 없습니다.' });
    await Test.deleteMany({ author: user._id });
    await Result.deleteMany({ user: user._id });
    await User.updateMany({ friends: user._id }, { $pull: { friends: user._id } });
    await FriendRequest.deleteMany({ $or: [{ from: user._id }, { to: user._id }] });
    await User.findByIdAndDelete(user._id);
    res.json({ message: `${user.username} 계정이 삭제되었습니다.` });
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const [totalUsers, totalTests, totalResults, pendingInquiries] = await Promise.all([
      User.countDocuments(),
      Test.countDocuments(),
      Result.countDocuments(),
      Inquiry.countDocuments({ status: 'pending' })
    ]);
    res.json({ totalUsers, totalTests, totalResults, pendingInquiries });
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

// ==================== 관리자 통계 그래프 API ====================
app.get('/api/admin/stats/chart', adminAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // 날짜별 신규 가입자
    const userAgg = await User.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+09:00' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // 날짜별 테스트 응시 횟수
    const resultAgg = await Result.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+09:00' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // 날짜별 테스트 생성 횟수
    const testAgg = await Test.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+09:00' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // 날짜 범위 생성
    const labels = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
      labels.push(d.toISOString().slice(0, 10));
    }

    const toMap = arr => Object.fromEntries(arr.map(x => [x._id, x.count]));
    const userMap = toMap(userAgg);
    const resultMap = toMap(resultAgg);
    const testMap = toMap(testAgg);

    res.json({
      labels,
      newUsers: labels.map(d => userMap[d] || 0),
      testResults: labels.map(d => resultMap[d] || 0),
      newTests: labels.map(d => testMap[d] || 0),
    });
  } catch (e) { console.error('chart stats error:', e.message); res.status(500).json({ message: '서버 오류' }); }
});

// ==================== 관리자 로그 API ====================
app.get('/api/admin/logs', adminAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 500, 2000);
    const level = String(req.query.level || 'all');
    const search = String(req.query.search || '').slice(0, 100);
    const q = {};
    if (level !== 'all') q.level = level;
    if (search) q.message = { $regex: escapeRegex(search), $options: 'i' };
    const [logs, total] = await Promise.all([
      Log.find(q).sort({ ts: -1 }).limit(limit).lean(),
      Log.estimatedDocumentCount(),
    ]);
    res.json({ logs: logs.map(l => ({ ts: l.ts, level: l.level, message: l.message })), total });
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

// ==================== 계정 삭제 ====================
app.post('/api/auth/account/delete', auth, async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });

    if (user.loginType === 'local' && user.password) {
      if (!password || password === 'social_delete_bypass')
        return res.status(400).json({ message: '비밀번호를 입력해주세요.' });
      const match = await bcrypt.compare(password, user.password);
      if (!match)
        return res.status(400).json({ message: '비밀번호가 올바르지 않습니다.' });
    }

    const userId = user._id;
    await Promise.all([
      Test.deleteMany({ author: userId }),
      Result.deleteMany({ user: userId }),
      FriendRequest.deleteMany({ $or: [{ from: userId }, { to: userId }] }),
      EmailVerification.deleteMany({ email: user.email }),
      Inquiry.deleteMany({ user: userId }),
      WrongNote.deleteMany({ user: userId }),
      User.updateMany({ friends: userId }, { $pull: { friends: userId } }),
    ]);
    await User.findByIdAndDelete(userId);

    console.log(`계정 삭제 완료: ${user.email}`);
    res.json({ message: '계정이 삭제되었습니다.' });
  } catch (e) {
    console.error('account delete error:', e.message);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// ==================== 즐겨찾기 ====================

app.get('/api/favorites', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'favorites',
      populate: { path: 'author', select: 'username' }
    });
    res.json(user.favorites || []);
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

app.post('/api/favorites/:testId', auth, async (req, res) => {
  try {
    const { testId } = req.params;
    if (!isObjectId(testId)) return res.status(404).json({ message: '테스트를 찾을 수 없습니다.' });
    const test = await Test.findById(testId);
    if (!test || !canViewTest(req.user, test)) return res.status(404).json({ message: '테스트를 찾을 수 없습니다.' });
    const user = await User.findById(req.user._id);
    const alreadyFav = user.favorites.map(f => f.toString()).includes(testId);
    if (!alreadyFav) {
      await User.findByIdAndUpdate(req.user._id, { $addToSet: { favorites: testId } });
      await Test.findByIdAndUpdate(testId, { $inc: { favoriteCount: 1 } });
    }
    res.json({ message: '즐겨찾기에 추가되었습니다.', added: true });
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

app.delete('/api/favorites/:testId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const wasFav = user.favorites.map(f => f.toString()).includes(req.params.testId);
    await User.findByIdAndUpdate(req.user._id, { $pull: { favorites: req.params.testId } });
    if (wasFav) await Test.findByIdAndUpdate(req.params.testId, { $inc: { favoriteCount: -1 } });
    res.json({ message: '즐겨찾기에서 제거되었습니다.', added: false });
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

mountLearn(app, { auth, User, Test, Result, WrongNote, rateLimit: createRateLimit });

app.get('/api/ping', (req, res) => res.json({ status: 'ok', service: '영단마스터', time: new Date().toISOString() }));

// ==================== 에러 핸들러 ====================
app.use('/api', (req, res) => {
  res.status(404).json({ message: '요청한 리소스를 찾을 수 없습니다.' });
});

app.use((err, req, res, next) => {
  // body-parser 오류(잘못된 JSON 400, 너무 큰 본문 413)는 그 상태 그대로 알려준다
  if (err.status === 413) return res.status(413).json({ message: '보낸 데이터가 너무 큽니다.' });
  if (err.status === 400 || err.type === 'entity.parse.failed') return res.status(400).json({ message: '잘못된 요청 형식입니다.' });
  console.error('Unhandled error:', err.message);
  res.status(500).json({ message: '서버 내부 오류가 발생했습니다.' });
});

export default app;
