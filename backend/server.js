const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const app = express();

// ==================== 로그 시스템 ====================
const LOG_MAX = 2000;
const logBuffer = [];

function pushLog(level, message) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message: typeof message === 'string' ? message.slice(0, 500) : JSON.stringify(message).slice(0, 500)
  };
  logBuffer.push(entry);
  if (logBuffer.length > LOG_MAX) logBuffer.shift();
}

// Console 프록시
const _origLog = console.log.bind(console);
const _origError = console.error.bind(console);
const _origWarn = console.warn.bind(console);
console.log = (...a) => { const m = a.map(String).join(' '); pushLog('info', m); _origLog(m); };
console.error = (...a) => { const m = a.map(String).join(' '); pushLog('error', m); _origError(m); };
console.warn = (...a) => { const m = a.map(String).join(' '); pushLog('warn', m); _origWarn(m); };

// HTTP 요청 로그 미들웨어
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'http';
    pushLog(level, `${req.method} ${req.path} ${res.statusCode} ${ms}ms — ${req.ip}`);
  });
  next();
}

// ==================== CORS ====================
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed =
    !origin ||
    origin.endsWith('.onrender.com') ||
    origin === 'https://ydmaster.com' ||
    origin === 'https://www.ydmaster.com' ||
    origin.startsWith('http://localhost');
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// ==================== 정적 파일 서빙 ====================
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR, { maxAge: '1h', index: false }));

// ==================== 보안 헤더 ====================
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.removeHeader('X-Powered-By');
  next();
});

// ==================== Rate Limiting ====================
const rateLimitMap = new Map();

function rateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  const record = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }
  record.count++;
  rateLimitMap.set(key, record);
  return record.count <= maxRequests;
}

function createRateLimit(maxRequests, windowMs, message) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    if (!rateLimit(key, maxRequests, windowMs)) {
      return res.status(429).json({ message: message || '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
    }
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap.entries()) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}, 3600000);

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

// ==================== DB ====================
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ydmaster')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// ==================== MAILER ====================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
  pool: true,
  maxConnections: 3,
  rateLimit: 10,
});

transporter.verify((err, success) => {
  if (err) console.error('SMTP 연결 실패:', err.message);
  else console.log('SMTP 연결 성공 ✓');
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
  createdAt: { type: Date, default: Date.now }
});

const EmailVerificationSchema = new mongoose.Schema({
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  username: { type: String, required: true },
  password: { type: String, required: true },
  token: { type: String, required: true },
  code: { type: String, default: '' },
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
  format: { type: String, enum: ['section', 'cell', 'essay'], default: 'section' },
  testTimeLimit: { type: Number, default: 0 },
  isPublic: { type: Boolean, default: true },
  isFriendOnly: { type: Boolean, default: false },
  tags: [String],
  playCount: { type: Number, default: 0 },
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
mongoose.connection.once('open', async () => {
  try {
    await User.updateMany({ email: { $in: ADMIN_EMAILS } }, { $set: { isAdmin: true } });
    console.log('관리자 권한 설정 완료');
  } catch (e) { console.error('관리자 설정 오류:', e.message); }
});

// ==================== 이메일 발송 헬퍼 ====================
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://ydmaster.onrender.com';
const BACKEND_URL = process.env.BACKEND_URL || 'https://ydmaster.onrender.com';

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

      if (usePhone) {
        // SMS 인증 코드 발송
        console.log(`[SMS 인증] ${phone} → 코드: ${code}`);
        res.status(200).json({ message: '인증 코드를 발송했습니다.', token, verifyType: 'phone', devCode: code });
      } else {
        await sendVerificationEmail(email, username, code);
        res.status(200).json({ message: '인증 코드를 발송했습니다. 이메일을 확인해주세요.', token, verifyType: 'email' });
      }
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
      if (record.code !== String(code).trim())
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
      await new User(newUserData).save();

      await EmailVerification.deleteOne({ token });

      const user = await User.findOne({ email: record.email });
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
      if (!record)
        return res.status(400).json({ message: '인증 정보를 찾을 수 없습니다.' });

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
      if (record.code !== String(code).trim())
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
      favorites: (req.user.favorites || []).map(id => id.toString())
    }
  });
});

app.put('/api/auth/profile', auth, async (req, res) => {
  try {
    const { avatarImage, bannerImage, bannerGradient, username, email } = req.body;
    const update = {};

    if (username !== undefined) {
      const trimmed = username.trim();
      if (!trimmed) return res.status(400).json({ message: '닉네임을 입력해주세요.' });
      if (trimmed.length > 20) return res.status(400).json({ message: '닉네임은 20자 이하로 입력해주세요.' });
      const exists = await User.findOne({ username: trimmed, _id: { $ne: req.user._id } });
      if (exists) return res.status(400).json({ message: '이미 사용 중인 닉네임입니다.' });
      update.username = trimmed;
    }

    if (email !== undefined) {
      const trimmed = email.trim().toLowerCase();
      if (trimmed) {
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
    if (bannerGradient !== undefined) update.bannerGradient = bannerGradient;

    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select('-password');
    res.json({
      user: {
        id: user._id, username: user.username, email: user.email,
        isAdmin: user.isAdmin || false,
        avatarImage: user.avatarImage || '',
        bannerImage: user.bannerImage || '',
        bannerGradient: user.bannerGradient || 'linear-gradient(135deg,#6c63ff,#ff6584)'
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
      username: { $regex: q.trim(), $options: 'i' },
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
    const { toUserId } = req.body;
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
app.get('/api/tests', auth, async (req, res) => {
  try {
    const { search, mine } = req.query;
    const friendIds = req.user.friends.map(f => f.toString());
    let query;
    if (mine === 'true') { query = { author: req.user._id }; }
    else { query = { $or: [{ isPublic: true, isFriendOnly: false }, { author: req.user._id }, { isFriendOnly: true, author: { $in: friendIds } }] }; }
    if (search) query.title = { $regex: search, $options: 'i' };
    const tests = await Test.find(query).populate('author', 'username').sort({ createdAt: -1 }).select('-questions');
    res.json(tests);
  } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
});

app.get('/api/tests/:id', auth, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id).populate('author', 'username');
    if (!test) return res.status(404).json({ message: '테스트를 찾을 수 없습니다.' });
    if (test.isFriendOnly && test.author._id.toString() !== req.user._id.toString()) {
      const isFriend = req.user.friends.map(f => f.toString()).includes(test.author._id.toString());
      if (!isFriend) return res.status(403).json({ message: '친구만 접근할 수 있는 테스트입니다.' });
    }
    res.json(test);
  } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
});

app.post('/api/tests', auth, createRateLimit(30, 60 * 60 * 1000, '테스트 생성 한도를 초과했습니다.'), async (req, res) => {
  try {
    const title = sanitizeString(req.body.title, 100);
    const description = sanitizeString(req.body.description, 500);
    const { questions, isPublic, isFriendOnly, tags, format } = req.body;
    if (!title) return res.status(400).json({ message: '테스트 제목을 입력해주세요.' });
    if (!questions || questions.length === 0) return res.status(400).json({ message: '문항을 1개 이상 추가해주세요.' });
    if (questions.length > 200) return res.status(400).json({ message: '문항은 최대 200개까지 추가할 수 있습니다.' });
    const test = await new Test({ title, description, questions, isPublic: isPublic ?? true, isFriendOnly: isFriendOnly ?? false, tags: tags || [], format: format || 'section', author: req.user._id }).save();
    res.status(201).json(test);
  } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
});

app.put('/api/tests/:id', auth, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ message: '테스트를 찾을 수 없습니다.' });
    if (test.author.toString() !== req.user._id.toString()) return res.status(403).json({ message: '수정 권한이 없습니다.' });
    const updated = await Test.findByIdAndUpdate(req.params.id, { ...req.body, updatedAt: new Date() }, { new: true });
    res.json(updated);
  } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
});

app.delete('/api/tests/:id', auth, async (req, res) => {
  try {
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
    const test = await Test.findById(testId);
    if (!test) return res.status(404).json({ message: '테스트를 찾을 수 없습니다.' });
    const totalQuestions = clientTotal ?? answers.length;
    const correctAnswers = clientCorrect ?? 0;
    const wrongAnswers = totalQuestions - correctAnswers;
    const percentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
    const processedAnswers = answers.map((ans, idx) => ({ questionIndex: idx, selectedAnswer: ans.selectedAnswer, isCorrect: ans.isCorrect === true }));
    const result = await new Result({ user: req.user._id, test: testId, testTitle: test.title, score: correctAnswers, totalQuestions, correctAnswers, wrongAnswers, percentage, answers: processedAnswers, timeTaken: timeTaken || 0 }).save();
    await Test.findByIdAndUpdate(testId, { $inc: { playCount: 1 } });
    res.status(201).json(result);
  } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
});

app.get('/api/results', auth, async (req, res) => {
  try {
    const results = await Result.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20);
    res.json(results);
  } catch { res.status(500).json({ message: '서버 오류가 발생했습니다.' }); }
});

app.get('/api/stats', auth, async (req, res) => {
  try {
    const totalTests = await Test.countDocuments({ author: req.user._id });
    const results = await Result.find({ user: req.user._id });
    const totalAttempts = results.length;
    const avgScore = totalAttempts > 0 ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / totalAttempts) : 0;
    const bestScore = totalAttempts > 0 ? Math.max(...results.map(r => r.percentage)) : 0;
    res.json({ totalTests, totalAttempts, avgScore, bestScore });
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
      .select('username avatarImage bannerImage bannerGradient loginType createdAt');
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
      .select('username avatarImage bannerImage bannerGradient loginType createdAt friends');
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

    res.json({
      user: {
        _id: user._id,
        username: user.username,
        avatarImage: user.avatarImage || '',
        bannerImage: user.bannerImage || '',
        bannerGradient: user.bannerGradient || 'linear-gradient(135deg,#6c63ff,#ff6584)',
        loginType: user.loginType,
        createdAt: user.createdAt,
      },
      stats: { totalAttempts, avgScore, bestScore, totalTests, friendCount },
      recentTests
    });
  } catch (e) {
    console.error('public profile error:', e.message);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// ==================== 랭킹 ====================

// 전체 랭킹 (평균 정답률 기준, 상위 50명)
app.get('/api/ranking', auth, async (req, res) => {
  try {
    const ranking = await Result.aggregate([
      {
        $group: {
          _id: '$user',
          totalAttempts: { $sum: 1 },
          avgScore: { $avg: '$percentage' },
          bestScore: { $max: '$percentage' },
        }
      },
      { $sort: { avgScore: -1, totalAttempts: -1 } },
      { $limit: 50 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: '$userInfo' },
      {
        $project: {
          _id: '$userInfo._id',
          username: '$userInfo.username',
          avatarImage: '$userInfo.avatarImage',
          totalAttempts: 1,
          avgScore: { $round: ['$avgScore', 1] },
          bestScore: { $round: ['$bestScore', 1] },
        }
      }
    ]);

    // 내 순위 계산
    const myId = req.user._id.toString();
    const myIdx = ranking.findIndex(u => u._id.toString() === myId);
    let myRank = null;

    if (myIdx !== -1) {
      myRank = { ...ranking[myIdx], rank: myIdx + 1 };
    } else {
      // 상위 50위 밖인 경우 — 내 데이터 따로 집계
      const myAgg = await Result.aggregate([
        { $match: { user: req.user._id } },
        {
          $group: {
            _id: '$user',
            totalAttempts: { $sum: 1 },
            avgScore: { $avg: '$percentage' },
            bestScore: { $max: '$percentage' },
          }
        }
      ]);
      if (myAgg.length) {
        const myAvg = Math.round(myAgg[0].avgScore * 10) / 10;
        // 나보다 평균 높은 유저 수
        const higherCount = await Result.aggregate([
          {
            $group: {
              _id: '$user',
              avgScore: { $avg: '$percentage' },
              totalAttempts: { $sum: 1 },
            }
          },
          { $match: { avgScore: { $gt: myAvg } } },
          { $count: 'count' }
        ]);
        myRank = {
          rank: (higherCount[0]?.count || 0) + 1,
          avgScore: myAvg,
          bestScore: Math.round(myAgg[0].bestScore * 10) / 10,
          totalAttempts: myAgg[0].totalAttempts,
        };
      }
    }

    res.json({ ranking, myRank });
  } catch (err) {
    console.error('ranking error:', err);
    res.status(500).json({ message: '랭킹 조회 실패' });
  }
});

// 친구 랭킹
app.get('/api/ranking/friends', auth, async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select('friends');
    const friendOids = (me?.friends || []);           // ObjectId 배열
    const allOids = [...friendOids, req.user._id]; // 나 포함

    const ranking = await Result.aggregate([
      { $match: { user: { $in: allOids } } },
      {
        $group: {
          _id: '$user',
          totalAttempts: { $sum: 1 },
          avgScore: { $avg: '$percentage' },
          bestScore: { $max: '$percentage' },
        }
      },
      { $sort: { avgScore: -1, totalAttempts: -1 } },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: '$userInfo' },
      {
        $project: {
          _id: '$userInfo._id',
          username: '$userInfo.username',
          avatarImage: '$userInfo.avatarImage',
          totalAttempts: 1,
          avgScore: { $round: ['$avgScore', 1] },
          bestScore: { $round: ['$bestScore', 1] },
        }
      }
    ]);

    const myId = req.user._id.toString();
    const myIdx = ranking.findIndex(u => u._id.toString() === myId);
    const myRank = myIdx !== -1 ? { ...ranking[myIdx], rank: myIdx + 1 } : null;

    res.json({ ranking, myRank });
  } catch (err) {
    console.error('friends ranking error:', err);
    res.status(500).json({ message: '친구 랭킹 조회 실패' });
  }
});

// ==================== 네이버 소셜 로그인 ====================

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const NAVER_CALLBACK_URL = process.env.BACKEND_URL
  ? `${process.env.BACKEND_URL}/api/auth/naver/callback`
  : 'https://ydmaster.onrender.com/api/auth/naver/callback';
const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'https://ydmaster.onrender.com';

app.get('/api/auth/naver', (req, res) => {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    return res.redirect(`${FRONTEND_ORIGIN}?naver_error=${encodeURIComponent('네이버 로그인이 설정되지 않았습니다.')}`);
  }
  const state = crypto.randomBytes(16).toString('hex');
  const url = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(NAVER_CALLBACK_URL)}&state=${state}`;
  res.redirect(url);
});

app.get('/api/auth/naver/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${FRONTEND_ORIGIN}?naver_error=${encodeURIComponent('네이버 로그인이 취소되었습니다.')}`);
    }
    if (!code || !state) {
      return res.redirect(`${FRONTEND_ORIGIN}?naver_error=${encodeURIComponent('잘못된 요청입니다.')}`);
    }

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
const GOOGLE_CALLBACK_URL = process.env.BACKEND_URL
  ? `${process.env.BACKEND_URL}/api/auth/google/callback`
  : 'https://ydmaster.onrender.com/api/auth/google/callback';

app.get('/api/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.redirect(`${FRONTEND_ORIGIN}?google_error=${encodeURIComponent('구글 로그인이 설정되지 않았습니다.')}`);
  }
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account'
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    if (error) {
      return res.redirect(`${FRONTEND_ORIGIN}?google_error=${encodeURIComponent('구글 로그인이 취소되었습니다.')}`);
    }
    if (!code) return res.redirect(`${FRONTEND_ORIGIN}?google_error=${encodeURIComponent('인증 코드가 없습니다.')}`);

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
    const notice = await Notice.findByIdAndUpdate(req.params.id, { ...req.body, updatedAt: new Date() }, { new: true });
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
app.get('/api/admin/logs', adminAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 500, 2000);
  const level = req.query.level || 'all';
  const search = (req.query.search || '').toLowerCase();

  let entries = [...logBuffer].reverse(); // 최신순
  if (level !== 'all') entries = entries.filter(e => e.level === level);
  if (search) entries = entries.filter(e => e.message.toLowerCase().includes(search));
  entries = entries.slice(0, limit);

  res.json({ logs: entries, total: logBuffer.length });
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
    const test = await Test.findById(testId);
    if (!test) return res.status(404).json({ message: '테스트를 찾을 수 없습니다.' });
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { favorites: testId } });
    res.json({ message: '즐겨찾기에 추가되었습니다.', added: true });
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

app.delete('/api/favorites/:testId', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $pull: { favorites: req.params.testId } });
    res.json({ message: '즐겨찾기에서 제거되었습니다.', added: false });
  } catch { res.status(500).json({ message: '서버 오류' }); }
});

app.get('/ping', (req, res) => res.json({ status: 'ok', service: '영단마스터', time: new Date().toISOString() }));

// ==================== PWA 파일 ====================
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(`
const CACHE_NAME = 'ydmaster-v2';
const STATIC_CACHE = 'ydmaster-static-v2';
const PRECACHE_URLS = ['/'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== STATIC_CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200 && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('/')))
  );
});
  `.trim());
});

app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json({
    name: '영단마스터',
    short_name: '영단마스터',
    description: '나만의 영어 단어 테스트 플랫폼',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0f',
    theme_color: '#6c63ff',
    orientation: 'portrait-primary',
    lang: 'ko',
    scope: '/',
    icons: [
      {
        src: '/favicon-fox.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any'
      },
      {
        src: '/favicon-fox.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'any maskable'
      }
    ],
    categories: ['education'],
    screenshots: []
  });
});

// ==================== SPA 캐치올 (API가 아닌 모든 경로 → index.html) ====================
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  res.sendFile(indexPath, err => {
    if (err) res.status(404).json({ message: '페이지를 찾을 수 없습니다.' });
  });
});

// ==================== 에러 핸들러 ====================
app.use((req, res) => {
  res.status(404).json({ message: '요청한 리소스를 찾을 수 없습니다.' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ message: '서버 내부 오류가 발생했습니다.' });
});

// ==================== 서버 시작 ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`영단마스터 server running on port ${PORT}`));
