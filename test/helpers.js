// 테스트 공용: 메모리 MongoDB 위에 실제 Express 앱을 띄우고 fetch 로 호출한다.
// 외부로 새는 통로(메일)는 GMAIL_* 를 비워 막는다.
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export async function startServer() {
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri('ydtest');
  process.env.JWT_SECRET = 'test-secret';
  delete process.env.GMAIL_USER; delete process.env.GMAIL_PASS;
  const { default: app, connectDB } = await import('../server/app.js');
  await connectDB();
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function call(method, path, body, token) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }

  // 인증 메일 없이 바로 로그인 가능한 사용자 생성
  async function makeUser(username, extra = {}) {
    const email = `${username.toLowerCase()}@test.dev`;
    await mongoose.model('User').create({
      username, email, password: await bcrypt.hash('pass1234', 4), isVerified: true, ...extra,
    });
    const r = await call('POST', '/auth/login', { email, password: 'pass1234' });
    return { token: r.data.token, id: r.data.user.id, email };
  }

  async function stop() {
    await new Promise(r => server.close(r));
    await mongoose.disconnect();
    await mongo.stop();
  }
  return { call, makeUser, stop, mongoose };
}
