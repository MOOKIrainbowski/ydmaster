// 로컬 화면 확인용 서버: 메모리 MongoDB + 샘플 세트 + 테스트 계정. 운영 DB·메일·OAuth 와 무관.
//   node test/dev-server.js  → http://localhost:5000  (계정 demo@test.dev / pass1234, 친구 friend@test.dev)
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri('yddev');
process.env.JWT_SECRET ||= 'dev-secret';
delete process.env.GMAIL_USER; delete process.env.GMAIL_PASS;
const { default: app, connectDB } = await import('../server/app.js');
await connectDB();

const User = mongoose.model('User'), Test = mongoose.model('Test');
const pw = await bcrypt.hash('pass1234', 4);
const demo = await User.create({ username: 'demo', email: 'demo@test.dev', password: pw, isVerified: true, isAdmin: true });
const friend = await User.create({ username: '친구', email: 'friend@test.dev', password: pw, isVerified: true, friends: [demo._id] });
await User.updateOne({ _id: demo._id }, { $push: { friends: friend._id } });
const sets = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/sample-sets.json'), 'utf8'));
for (const [i, s] of sets.entries()) await Test.create({ ...s, author: i % 2 ? friend._id : demo._id, visibility: ['private', 'public', 'public', 'friends'][i] || 'public', updatedAt: new Date() });
// 레거시 문서 하나(옛 형식 표시 확인용)
await Test.collection.insertOne({ title: '옛 형식 단어 시험', author: friend._id, isPublic: true, format: 'section', createdAt: new Date(),
  questions: [{ question: 'apple', answer: '사과' }, { question: 'banana', answer: '바나나' }, { question: 'grape', answer: '포도' }] });

const local = express();
// 개발 서버 전용: 휴대폰 폭 미리보기(iframe)를 위해 X-Frame-Options 를 빼고 같은 출처 iframe 만 허용. 운영(app.js)은 DENY 유지.
local.use((req, res, next) => {
  const set = res.setHeader.bind(res);
  res.setHeader = (k, v) => (String(k).toLowerCase() === 'x-frame-options' ? set('X-Frame-Options', 'SAMEORIGIN') : set(k, v));
  next();
});
local.use(app);
local.use(express.static(path.join(here, '..', 'public'), { extensions: ['html'] }));
const port = process.env.PORT || 5000;
local.listen(port, () => console.log(`개발 서버 http://localhost:${port}  (demo@test.dev / pass1234)`));
