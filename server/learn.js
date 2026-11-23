// P2 학습 API: 세트 · 시험 세션(서버 채점) · 결과 · 오답(학습 기록) · 랭킹 · 이미지 — 계약 §1~§3.
import mongoose from 'mongoose';
import { buildQuestions, grade, expectedOf, MODES, MODE_BY_ID, GenError } from './generators.js';
import { plainText } from '../public/js/shared/passage.js';
import { xpOf, levelOf, achievementsOf, XP, questsOf, QUEST_BY_ID, questKey, canClaim, cosmeticsCatalog, checkEquip, COSMETIC_KINDS, DEFAULT_COSMETICS } from './game.js';

const { ObjectId } = mongoose.Types;
const LIMITS = { items: 500, sentences: 80, term: 200, meaning: 200, example: 300, en: 600, ko: 600, tags: 10, tag: 20 };

// ── 모델 ──
const SessionSchema = new mongoose.Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  source: { type: { type: String }, ids: [ObjectId] },
  mode: String, kind: String, options: Object, title: String,
  questions: [{ _id: false, q: Object, key: Object, ref: { set: ObjectId, item: ObjectId } }],
  answers: [{ _id: false, i: Number, response: mongoose.Schema.Types.Mixed, correct: Boolean, score: Number, at: Date }],
  status: { type: String, default: 'active' },
  startedAt: { type: Date, default: Date.now }, finishedAt: Date,
  result: { type: ObjectId, ref: 'Result' },
  expiresAt: { type: Date, expires: 0 }, // active 동안만(계약 v2) — finish 때 $unset
});
SessionSchema.index({ status: 1, finishedAt: 1 });
const Session = mongoose.model('Session', SessionSchema);

const ItemStatSchema = new mongoose.Schema({
  user: { type: ObjectId, required: true }, set: { type: ObjectId, required: true }, item: { type: ObjectId, required: true },
  wrong: { type: Number, default: 0 }, right: { type: Number, default: 0 }, streak: { type: Number, default: 0 },
  lastMode: String, lastWrongAt: Date, lastAt: Date,
});
ItemStatSchema.index({ user: 1, set: 1, item: 1 }, { unique: true });
ItemStatSchema.index({ user: 1, wrong: 1, streak: 1 });
const ItemStat = mongoose.model('ItemStat', ItemStatSchema);

// 퀘스트 보상 기록(05): 사용자·키 고유 인덱스 → 같은 보상을 두 번 받을 수 없음(동시 요청도 하나만 성공).
// key = 퀘스트 id (매일 퀘스트는 'id:YYYY-MM-DD' KST)
const QuestClaimSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  key: { type: String, required: true }, quest: String, xp: Number,
}, { timestamps: { createdAt: true, updatedAt: false } });
QuestClaimSchema.index({ user: 1, key: 1 }, { unique: true });
const QuestClaim = mongoose.model('QuestClaim', QuestClaimSchema);
// 알림(10, 사용자 요청: 친구 요청·수락 등 시스템 알림). key 로 같은 알림 중복 방지, 90일 지나면 자동 삭제
const NotificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: String, title: String, body: String, link: String, key: String,
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 90 * 86400 },
});
NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, key: 1 }, { unique: true, partialFilterExpression: { key: { $type: 'string' } } });
const Notification = mongoose.model('Notification', NotificationSchema);
// 알림 만들기. key 가 같으면 한 번만(업적·레벨·공지 등)
async function notify(user, n) {
  const doc = { user, type: n.type, title: String(n.title || '').slice(0, 80), body: String(n.body || '').slice(0, 200), link: n.link || '' };
  try {
    if (n.key) await Notification.updateOne({ user, key: n.key }, { $setOnInsert: { ...doc, key: n.key, read: false, createdAt: new Date() } }, { upsert: true });
    else await Notification.create(doc);
  } catch (e) { if (e.code !== 11000) console.error('notify:', e.message); }
}
const kstDay = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const kstDayStart = () => new Date(Date.parse(kstDay() + 'T00:00:00+09:00'));

// ── 레거시 → 새 형식(R6: 읽을 때 변환, 계약 v2 타입 방어) ──
const str = v => (typeof v === 'string' ? v.trim() : '');
export function toSet(doc) {
  const d = doc.toObject ? doc.toObject() : doc;
  const kind = d.kind || 'vocab';
  const visibility = d.visibility || (d.isFriendOnly ? 'friends' : d.isPublic === false ? 'private' : 'public');
  let items = d.items && d.items.length ? d.items : [];
  if (!d.kind && !items.length && Array.isArray(d.questions)) {
    items = d.questions.map(q => {
      if (!q || typeof q !== 'object') return null;
      const qs = str(q.question), an = str(q.answer) || (Array.isArray(q.keywords) ? q.keywords.filter(k => typeof k === 'string').join(', ') : '');
      const [term, meaning] = q.questionType === 'ko-to-en' ? [an, qs] : [qs, an];
      return term && meaning ? { _id: q._id, term, meaning, example: '', exampleKo: '' } : null;
    }).filter(Boolean);
  }
  return {
    _id: d._id, title: d.title, description: d.description || '', kind, visibility, tags: d.tags || [],
    author: d.author?.username ? userCard(d.author) : d.author, // 16: 작성자 = { _id, username, avatarUrl }
    playCount: d.playCount || 0, favoriteCount: d.favoriteCount || 0,
    createdAt: d.createdAt, updatedAt: d.updatedAt || d.createdAt,
    items: kind === 'vocab' ? items : undefined,
    passage: kind === 'passage' ? { source: d.passage?.source || '', sentences: d.passage?.sentences || [] } : undefined,
    legacy: !d.kind,
  };
}
const countOf = s => (s.kind === 'passage' ? s.passage.sentences.length : s.items.length);

// 공개 범위 판정 — 계약 v2 canView(열람자의 friends 에 작성자가 있으면 친구 공개 열람 가능)
export function canView(user, set) {
  const author = String(set.author?._id || set.author);
  if (user && author === String(user._id)) return true;
  if (set.visibility === 'public') return true;
  if (set.visibility === 'friends') return !!user && (user.friends || []).some(f => String(f) === author);
  return false;
}
// 같은 판정의 Mongo 질의형(목록용). 레거시 플래그 문서도 포함.
export const PUBLIC_SET = { $or: [{ visibility: 'public' }, { visibility: { $exists: false }, isPublic: { $ne: false }, isFriendOnly: { $ne: true } }] };
function visibleQuery(user) {
  const pub = PUBLIC_SET;
  const fr = { author: { $in: user.friends || [] }, $or: [{ visibility: 'friends' }, { visibility: { $exists: false }, isFriendOnly: true }] };
  return { $or: [pub, fr] };
}

function summary(s, user) {
  const a = s.author && s.author.username ? userCard(s.author) /* 16: 작성자 사진도 */ : { _id: s.author, username: '(알 수 없음)' };
  return {
    _id: s._id, title: s.title, description: s.description, kind: s.kind, visibility: s.visibility, tags: s.tags,
    count: countOf(s), author: a, playCount: s.playCount, favoriteCount: s.favoriteCount,
    favorited: !!user && (user.favorites || []).some(f => String(f) === String(s._id)), updatedAt: s.updatedAt,
  };
}
const full = (s, user) => ({ ...summary(s, user), items: s.items, passage: s.passage, legacy: s.legacy || undefined });

// SetInput 검증 → 저장할 필드. 잘못되면 문자열(오류 메시지) 반환.
function parseSetInput(body, existingKind) {
  const b = body || {};
  const title = str(b.title).slice(0, 100);
  if (!title) return '제목을 입력해주세요.';
  const kind = existingKind || b.kind;
  if (!['vocab', 'passage'].includes(kind)) return '세트 종류가 올바르지 않습니다.';
  const visibility = ['public', 'friends', 'private'].includes(b.visibility) ? b.visibility : 'private';
  const tags = (Array.isArray(b.tags) ? b.tags : []).map(t => str(t).slice(0, LIMITS.tag)).filter(Boolean).slice(0, LIMITS.tags);
  const out = { title, description: str(b.description).slice(0, 500), kind, visibility, tags };
  const keepId = id => (typeof id === 'string' && mongoose.isValidObjectId(id) && id.length === 24 ? new ObjectId(id) : new ObjectId());
  if (kind === 'vocab') {
    if (!Array.isArray(b.items) || !b.items.length) return '단어를 1개 이상 입력해주세요.';
    if (b.items.length > LIMITS.items) return `단어는 최대 ${LIMITS.items}개까지입니다.`;
    const items = [];
    for (const [i, it] of b.items.entries()) {
      const term = str(it?.term), meaning = str(it?.meaning);
      if (!term || !meaning) return `${i + 1}번째 단어의 단어와 뜻을 모두 입력해주세요.`;
      if (term.length > LIMITS.term || meaning.length > LIMITS.meaning) return `${i + 1}번째 단어가 너무 깁니다.`;
      items.push({ _id: keepId(it._id), term, meaning, example: str(it.example).slice(0, LIMITS.example), exampleKo: str(it.exampleKo).slice(0, LIMITS.example) });
    }
    out.items = items;
  } else {
    const sents = b.passage?.sentences;
    if (!Array.isArray(sents) || !sents.length) return '본문 문장을 1개 이상 입력해주세요.';
    if (sents.length > LIMITS.sentences) return `본문은 최대 ${LIMITS.sentences}문장까지입니다.`;
    const sentences = [];
    for (const [i, s] of sents.entries()) {
      const en = str(s?.en);
      if (!en || !plainText(en).trim()) return `${i + 1}번째 문장이 비어 있습니다.`;
      if (en.length > LIMITS.en || str(s.ko).length > LIMITS.ko) return `${i + 1}번째 문장이 너무 깁니다.`;
      sentences.push({ _id: keepId(s._id), en, ko: str(s.ko) });
    }
    out.passage = { source: str(b.passage.source).slice(0, 100), sentences };
  }
  return out;
}
const LEGACY_UNSET = { questions: 1, format: 1, isPublic: 1, isFriendOnly: 1, testTimeLimit: 1 };

// KST 주 시작(월 00:00)
export function weekStartKST(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600e3);
  const day = (k.getUTCDay() + 6) % 7; // 월=0
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - day) - 9 * 3600e3);
}

const imgUrl = (u, field) => (u[field] ? (/^https?:/.test(u[field]) ? u[field] : `/api/users/${u._id}/${field === 'avatarImage' ? 'avatar' : 'banner'}?v=${u.imageVersion || 0}`) : '');
export const avatarUrl = u => imgUrl(u, 'avatarImage');
export const bannerUrl = u => imgUrl(u, 'bannerImage');
// 16: 목록(친구·친구 요청·검색·관리자)에서 프로필 사진이 안 보이던 문제 — 그 API 들이 avatarUrl 을 내려주지 않았음.
// 사진 원본(base64, 최대 2MB)을 사람마다 읽지 않도록 DB 에서 "외부 주소면 그대로, 올린 사진이면 표시용 'x', 없으면 ''"로 줄여 받는다.
// imgUrl 은 값이 있는지(그리고 http 주소인지)만 보므로 이것으로 충분. 다른 필드와 함께 inclusion 투영으로만 쓸 것.
export const AVATAR_PICK = { $cond: [{ $regexMatch: { input: { $ifNull: ['$avatarImage', ''] }, regex: '^https?:' } }, '$avatarImage', { $cond: [{ $gt: [{ $ifNull: ['$avatarImage', ''] }, ''] }, 'x', ''] }] };
export const PUBLIC_USER = { username: 1, imageVersion: 1, avatarImage: AVATAR_PICK };
export const userCard = u => (u ? { _id: u._id, username: u.username, avatarUrl: u.avatarUrl ?? avatarUrl(u) } : u); // 이미 정리된 것을 다시 넣어도 그대로

export function mountLearn(app, { auth, User, Test, Result, WrongNote, rateLimit }) {
  const wrap = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
      if (e instanceof GenError) return res.status(400).json({ message: e.message });
      console.error(`${req.method} ${req.path} 오류:`, e.message);
      res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  };
  const idOk = id => mongoose.isValidObjectId(id) && String(id).length === 24;
  const notFound = res => res.status(404).json({ message: '세트를 찾을 수 없습니다.' });

  // 14(사용자 요청: 오늘의 학습은 가장 최근에 학습한 것): 세트를 열거나 시험을 시작하면 기록. 실패해도 본 요청은 계속.
  const touchRecent = (req, id) => User.updateOne({ _id: req.user._id }, { $set: { recentSet: id } }).catch(() => {});
  async function loadViewable(req, id) {
    if (!idOk(id)) return null;
    const doc = await Test.findById(id).populate({ path: 'author', select: PUBLIC_USER }).lean();
    if (!doc || !doc.author) return null;
    const s = toSet(doc);
    return canView(req.user, s) ? s : null;
  }

  // ── 세트 ──
  app.get('/api/modes', (req, res) => res.json(MODES));

  app.get('/api/sets', auth, wrap(async (req, res) => {
    const scope = req.query.scope || 'mine';
    const page = Math.max(0, parseInt(req.query.page) || 0);
    let q;
    if (scope === 'mine') q = { author: req.user._id };
    else if (scope === 'fav') q = { _id: { $in: req.user.favorites || [] } };
    else q = { ...visibleQuery(req.user), author: { $ne: req.user._id } };
    const and = [q];
    if (req.query.q) and.push({ title: { $regex: String(req.query.q).slice(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } });
    if (req.query.kind === 'passage') and.push({ kind: 'passage' });
    if (req.query.kind === 'vocab') and.push({ $or: [{ kind: 'vocab' }, { kind: { $exists: false } }] });
    const sort = scope === 'explore' && req.query.sort !== 'new' ? { playCount: -1, createdAt: -1 } : { updatedAt: -1, createdAt: -1 };
    const docs = await Test.find({ $and: and }).sort(sort).skip(page * 20).limit(21).populate({ path: 'author', select: PUBLIC_USER }).lean();
    const sets = docs.slice(0, 20).map(toSet).filter(s => scope !== 'fav' || canView(req.user, s));
    res.json({ items: sets.map(s => summary(s, req.user)), hasMore: docs.length > 20 });
  }));

  app.get('/api/sets/:id', auth, wrap(async (req, res) => {
    const s = await loadViewable(req, req.params.id);
    if (!s) return notFound(res);
    await touchRecent(req, s._id);
    res.json(full(s, req.user));
  }));

  app.post('/api/sets', auth, rateLimit(60, 3600e3, '세트 생성 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'), wrap(async (req, res) => {
    const input = parseSetInput(req.body);
    if (typeof input === 'string') return res.status(400).json({ message: input });
    const doc = await Test.create({ ...input, author: req.user._id, updatedAt: new Date() });
    await doc.populate({ path: 'author', select: PUBLIC_USER });
    res.status(201).json(full(toSet(doc), req.user));
  }));

  app.put('/api/sets/:id', auth, wrap(async (req, res) => {
    if (!idOk(req.params.id)) return notFound(res);
    const doc = await Test.findById(req.params.id).lean();
    if (!doc) return notFound(res);
    if (String(doc.author) !== String(req.user._id)) return res.status(403).json({ message: '수정 권한이 없습니다.' });
    const input = parseSetInput(req.body, toSet(doc).kind);
    if (typeof input === 'string') return res.status(400).json({ message: input });
    const updated = await Test.findByIdAndUpdate(doc._id, { $set: { ...input, updatedAt: new Date() }, $unset: LEGACY_UNSET }, { new: true }).populate({ path: 'author', select: PUBLIC_USER });
    res.json(full(toSet(updated), req.user));
  }));

  app.delete('/api/sets/:id', auth, wrap(async (req, res) => {
    if (!idOk(req.params.id)) return notFound(res);
    const r = await Test.deleteOne({ _id: req.params.id, author: req.user._id });
    if (!r.deletedCount) return notFound(res);
    // 즐겨찾기 참조·학습 기록 정리(I-011 류 고아 데이터 방지)
    await Promise.all([
      User.updateMany({ favorites: req.params.id }, { $pull: { favorites: req.params.id } }),
      ItemStat.deleteMany({ set: req.params.id }),
    ]);
    res.json({ message: '세트를 삭제했습니다.' });
  }));

  // 즐겨찾기 수는 사용자 관계에서 다시 센 값으로 저장(I-016/I-057: 증감 방식은 중간 실패 시 영구히 어긋남)
  const syncFavCount = async id => {
    const n = await User.countDocuments({ favorites: id });
    await Test.updateOne({ _id: id }, { $set: { favoriteCount: n } });
    return n;
  };
  app.post('/api/sets/:id/favorite', auth, wrap(async (req, res) => {
    const s = await loadViewable(req, req.params.id);
    if (!s) return notFound(res);
    await User.updateOne({ _id: req.user._id, favorites: { $ne: s._id } }, { $push: { favorites: s._id } });
    res.json({ favorited: true, favoriteCount: await syncFavCount(s._id) });
  }));
  app.delete('/api/sets/:id/favorite', auth, wrap(async (req, res) => {
    if (!idOk(req.params.id)) return notFound(res);
    await User.updateOne({ _id: req.user._id, favorites: req.params.id }, { $pull: { favorites: req.params.id } });
    res.json({ favorited: false, favoriteCount: await syncFavCount(req.params.id) });
  }));

  app.post('/api/sets/:id/copy', auth, wrap(async (req, res) => {
    const s = await loadViewable(req, req.params.id);
    if (!s) return notFound(res);
    const input = parseSetInput({ ...s, title: `${s.title} (사본)`.slice(0, 100), visibility: 'private',
      items: s.items?.map(({ _id, ...x }) => x), passage: s.passage && { ...s.passage, sentences: s.passage.sentences.map(({ _id, ...x }) => x) } });
    if (typeof input === 'string') return res.status(400).json({ message: '이 세트는 복사할 수 없습니다: ' + input });
    const doc = await Test.create({ ...input, author: req.user._id, updatedAt: new Date() });
    await doc.populate({ path: 'author', select: PUBLIC_USER });
    res.status(201).json(full(toSet(doc), req.user));
  }));

  // ── 시험 세션 ──
  const publicSession = s => ({
    _id: s._id, title: s.title, mode: s.mode, kind: s.kind, options: s.options, status: s.status,
    total: s.questions.length, questions: s.questions.map(x => x.q), startedAt: s.startedAt, result: s.result,
    answers: s.answers.map(a => answerView(s, a)),
  });
  const answerView = (s, a) => {
    if (s.options?.feedback === 'end' && s.status !== 'done') return { i: a.i, saved: true, response: a.response };
    const question = s.questions[a.i];
    const g = grade(question, a.response);
    return { i: a.i, response: a.response, correct: a.correct, score: a.score, expected: g.expected, detail: g.detail };
  };

  async function gatherVocab(setDocs, author) {
    const items = [], pool = [];
    for (const s of setDocs) for (const it of s.items) { items.push({ set: s._id, setTitle: s.title, item: it }); pool.push({ set: s._id, term: it.term, meaning: it.meaning }); }
    // 보기 부족 대비: 같은 작성자의 다른 단어 세트에서 보충(계약 §3)
    if (pool.length < 30 && author) {
      const more = await Test.find({ author, _id: { $nin: setDocs.map(s => s._id) }, $or: [{ kind: 'vocab' }, { kind: { $exists: false } }] }).limit(10).lean();
      for (const d of more) for (const it of toSet(d).items) pool.push({ set: d._id, term: it.term, meaning: it.meaning });
    }
    return { items, pool };
  }

  app.post('/api/sessions', auth, rateLimit(120, 3600e3, '시험을 너무 자주 만들었습니다. 잠시 후 다시 시도해주세요.'), wrap(async (req, res) => {
    const { source, mode } = req.body || {};
    const m = MODE_BY_ID[mode];
    if (!m) return res.status(400).json({ message: '시험 종류를 선택해주세요.' });
    const o = req.body.options || {};
    const options = {
      order: o.order === 'sequential' ? 'sequential' : 'random',
      feedback: o.feedback === 'end' ? 'end' : 'instant',
      hint: !!o.hint,
      ...(o.ratio ? { ratio: Math.max(0.1, Math.min(0.5, Number(o.ratio) || 0.25)) } : {}),
      ...(o.size ? { size: Math.max(3, Math.min(8, parseInt(o.size) || 5)) } : {}),
    };
    let sets = [], title, refFilter = null;
    // source.set 이 있으면 그 세트에서 생긴 오답만(10, 사용자 요청: 세트별 오답 복습 시험)
    const wrongSet = source?.type === 'wrong' && idOk(String(source.set || '')) ? String(source.set) : null;
    if (source?.type === 'wrong') {
      const stats = await ItemStat.find({ user: req.user._id, wrong: { $gt: 0 }, streak: { $lt: 2 }, ...(wrongSet ? { set: wrongSet } : {}) }).lean();
      refFilter = new Set(stats.map(x => `${x.set}:${x.item}`));
      const docs = await Test.find({ _id: { $in: [...new Set(stats.map(x => String(x.set)))] } }).lean();
      sets = docs.map(toSet).filter(s => canView(req.user, s));
      title = wrongSet && sets[0] ? `${sets[0].title} · 오답 복습` : '오답 복습';
    } else {
      const ids = [...new Set((Array.isArray(source?.ids) ? source.ids : []).map(String))].filter(idOk).slice(0, 10);
      if (!ids.length) return res.status(400).json({ message: '시험 볼 세트를 선택해주세요.' });
      const docs = await Test.find({ _id: { $in: ids } }).lean();
      sets = docs.map(toSet).filter(s => canView(req.user, s));
      if (sets[0]) await touchRecent(req, sets[0]._id);
      if (sets.length !== ids.length) return res.status(404).json({ message: '볼 수 없는 세트가 포함되어 있습니다.' });
      sets.sort((a, b) => ids.indexOf(String(a._id)) - ids.indexOf(String(b._id)));
      title = sets.length === 1 ? sets[0].title : `${sets[0].title} 외 ${sets.length - 1}개`;
    }
    sets = sets.filter(s => s.kind === m.kind);
    if (!sets.length) return res.status(400).json({ message: m.kind === 'vocab' ? '이 시험은 단어 세트로만 볼 수 있습니다.' : '이 시험은 본문 세트로만 볼 수 있습니다.' });
    const keep = (set, item) => !refFilter || refFilter.has(`${set}:${item}`);
    let src;
    if (m.kind === 'vocab') {
      src = await gatherVocab(sets, req.user._id);
      src.items = src.items.filter(x => keep(x.set, x.item._id));
    } else {
      // 오답 복습에서도 문맥(앞뒤 문장)은 필요하므로 문장 배열은 그대로 두고 생성 후 걸러낸다
      src = { sets: sets.map(s => ({ set: s._id, setTitle: s.title, sentences: s.passage.sentences })) };
    }
    let questions = buildQuestions(mode, src, refFilter ? 100 : req.body.count, options);
    if (refFilter && m.kind === 'passage') questions = questions.filter(x => keep(x.ref.set, x.ref.item));
    questions = questions.slice(0, Math.max(1, Math.min(100, Number(req.body.count) || 20)));
    if (!questions.length) return res.status(400).json({ message: '복습할 오답이 없습니다.' });
    questions.forEach((x, i) => { x.q.i = i; });
    const s = await Session.create({
      user: req.user._id, source: source?.type === 'wrong' ? { type: 'wrong', ids: wrongSet ? [wrongSet] : [] } : { type: 'sets', ids: sets.map(x => x._id) },
      mode, kind: m.kind, options, title, questions, expiresAt: new Date(Date.now() + 7 * 864e5),
    });
    res.status(201).json(publicSession(s));
  }));

  const loadMine = async (req, res) => {
    if (!idOk(req.params.id)) { res.status(404).json({ message: '시험을 찾을 수 없습니다.' }); return null; }
    const s = await Session.findOne({ _id: req.params.id, user: req.user._id });
    if (!s) res.status(404).json({ message: '시험을 찾을 수 없습니다.' });
    return s;
  };

  app.get('/api/sessions/:id', auth, wrap(async (req, res) => {
    const s = await loadMine(req, res);
    if (s) res.json(publicSession(s));
  }));

  app.post('/api/sessions/:id/answers', auth, wrap(async (req, res) => {
    const s = await loadMine(req, res);
    if (!s) return;
    const i = Number(req.body?.i);
    if (!Number.isInteger(i) || i < 0 || i >= s.questions.length) return res.status(400).json({ message: '문항 번호가 올바르지 않습니다.' });
    const prev = s.answers.find(a => a.i === i);
    if (prev) return res.json({ ...answerView(s, prev), duplicate: true });
    if (s.status !== 'active') return res.status(409).json({ message: '이미 끝난 시험입니다.' });
    const question = s.questions[i];
    const g = grade(question, req.body.response); // 형식 오류면 GenError → 400
    const entry = { i, response: req.body.response, correct: g.correct, score: g.score, at: new Date() };
    // 원자적 최초 1회 저장(계약 v2): 동시 요청 중 하나만 push 에 성공
    const r = await Session.updateOne({ _id: s._id, status: 'active', 'answers.i': { $ne: i } }, { $push: { answers: entry } });
    if (!r.modifiedCount) {
      const fresh = await Session.findById(s._id);
      const stored = fresh.answers.find(a => a.i === i);
      if (stored) return res.json({ ...answerView(fresh, stored), duplicate: true });
      return res.status(409).json({ message: '이미 끝난 시험입니다.' });
    }
    await recordStat(req.user._id, question.ref, g.correct, s.mode, s.source?.type === 'wrong');
    if (s.options?.feedback === 'end') return res.json({ i, saved: true });
    res.json({ i, correct: g.correct, score: g.score, expected: g.expected, detail: g.detail });
  }));

  // 19(사용자 요청: 오답 복습 시험을 다 맞혀도 오답 복습 버튼이 남음): 일반 시험은 2번 연속 맞혀야 졸업,
  //   오답 복습 시험(review)에서 맞히면 바로 졸업(streak 2 이상으로). 틀리면 어디서든 0.
  async function recordStat(user, ref, correct, mode, review = false) {
    if (!ref?.set || !ref?.item) return;
    const now = new Date();
    // 파이프라인 업데이트로 streak 증가/초기화를 원자적으로(계약 v2 #11)
    const run = () => ItemStat.updateOne({ user, set: ref.set, item: ref.item }, [
      { $set: {
        wrong: { $add: [{ $ifNull: ['$wrong', 0] }, correct ? 0 : 1] },
        right: { $add: [{ $ifNull: ['$right', 0] }, correct ? 1 : 0] },
        streak: correct ? (review ? { $max: [2, { $add: [{ $ifNull: ['$streak', 0] }, 1] }] } : { $add: [{ $ifNull: ['$streak', 0] }, 1] }) : 0,
        lastMode: mode, lastAt: now,
        lastWrongAt: correct ? '$lastWrongAt' : now,
      } },
    ], { upsert: true });
    try { await run(); } catch (e) { if (e.code === 11000) await run(); else throw e; } // I-060
  }

  app.post('/api/sessions/:id/finish', auth, wrap(async (req, res) => {
    const s = await loadMine(req, res);
    if (!s) return;
    const timeTaken = Math.max(0, Math.min(86400, Math.round((Date.now() - s.startedAt) / 1000)));
    // active→done 원자 전이: 이긴 요청만 Result 생성(계약 v2 #2)
    // finishing 에서 30초 넘게 멈춘 세션(종료 처리 중 함수 중단)은 다시 가져와 마무리한다(I-055)
    const stale = new Date(Date.now() - 30e3);
    const won = await Session.findOneAndUpdate(
      { _id: s._id, $or: [{ status: 'active' }, { status: 'finishing', finishedAt: { $lt: stale }, result: { $exists: false } }] },
      { $set: { status: 'finishing', finishedAt: new Date() }, $unset: { expiresAt: 1 } }, { new: true });
    if (!won) {
      for (let k = 0; k < 20; k++) { // 동시에 끝내는 다른 요청이 Result 를 만드는 중이면 잠깐 기다림
        const cur = await Session.findById(s._id).lean();
        if (cur.result) return res.json(await resultView(await Result.findById(cur.result).lean(), cur));
        await new Promise(r => setTimeout(r, 150));
      }
      return res.status(409).json({ message: '시험 종료 처리 중입니다. 잠시 후 다시 확인해주세요.' });
    }
    const total = won.questions.length;
    const correct = won.answers.filter(a => a.correct).length;
    // 세션당 Result 1개(재처리돼도 중복 생성 안 됨)
    const result = await Result.findOneAndUpdate({ session: won._id }, { $setOnInsert: {
      user: req.user._id, test: won.source.ids[0] || won.questions[0]?.ref?.set, testTitle: won.title,
      score: correct, totalQuestions: total, correctAnswers: correct, wrongAnswers: total - correct,
      percentage: total ? Math.round((correct / total) * 100) : 0,
      answers: [], timeTaken, mode: won.mode, kind: won.kind, session: won._id,
    } }, { upsert: true, new: true });
    await Session.updateOne({ _id: won._id }, { $set: { status: 'done', result: result._id } });
    if (won.source.ids.length) await Test.updateMany({ _id: { $in: won.source.ids } }, { $inc: { playCount: 1 } });
    won.status = 'done';
    res.json(await resultView(result.toObject(), won.toObject()));
  }));

  // ── 결과 ──
  async function resultView(r, session) {
    // session === false: 목록용(문항 상세 불필요 → 세션 조회 생략)
    const s = session === false ? null : session || (r.session ? await Session.findById(r.session).lean() : null);
    const base = {
      _id: r._id, title: r.testTitle, mode: r.mode || 'legacy', modeLabel: MODE_BY_ID[r.mode]?.label || '이전 방식 시험',
      kind: r.kind || 'vocab', total: r.totalQuestions, correct: r.correctAnswers, percentage: r.percentage,
      timeTaken: r.timeTaken, createdAt: r.createdAt, session: r.session, setIds: s?.source?.ids || (r.test ? [r.test] : []),
      xp: xpOf(r),
    };
    if (!s) return base;
    const byI = new Map(s.answers.map(a => [a.i, a]));
    base.questions = s.questions.map((x, i) => {
      const a = byI.get(i);
      const detail = a ? grade(x, a.response).detail : undefined;
      return { q: x.q, response: a ? a.response : null, correct: !!a?.correct, score: a?.score || 0, expected: expectedOf(x), detail };
    });
    return base;
  }

  app.get('/api/results', auth, wrap(async (req, res) => {
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const rs = await Result.find({ user: req.user._id }).sort({ createdAt: -1 }).skip(page * 20).limit(21).lean();
    res.json({ items: await Promise.all(rs.slice(0, 20).map(r => resultView(r, false))), hasMore: rs.length > 20 });
  }));

  app.get('/api/results/:id', auth, wrap(async (req, res) => {
    if (!idOk(req.params.id)) return res.status(404).json({ message: '결과를 찾을 수 없습니다.' });
    const r = await Result.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!r) return res.status(404).json({ message: '결과를 찾을 수 없습니다.' });
    res.json(await resultView(r));
  }));

  // 게임 지표 한 번에 계산(05): 경험치 = 결과 경험치 + 퀘스트 보상. 홈·결과·퀘스트·프로필이 모두 이것을 씀.
  async function gameOf(userId) {
    const uid = new ObjectId(String(userId));
    const today = kstDayStart(), week = weekStartKST();
    const [user, sets, publicSets, attempts, wrongCount, days, resAgg, modes, learned, cleared, wrongReviews, claims, todayModes, weekModes, todayReviews, weekReviews] = await Promise.all([
      User.findById(uid).select('friends avatarImage achSeen levelSeen').lean(),
      Test.countDocuments({ author: uid }),
      Test.countDocuments({ author: uid, ...PUBLIC_SET }),
      Result.countDocuments({ user: uid }),
      ItemStat.countDocuments({ user: uid, wrong: { $gt: 0 }, streak: { $lt: 2 } }),
      Result.aggregate([
        { $match: { user: uid, createdAt: { $gte: new Date(Date.now() - 420 * 864e5) } } }, // 365일 연속 업적까지 보려고 여유 있게
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+09:00' } } } },
      ]),
      // 경험치는 결과에서 매번 계산(game.js xpOf 와 같은 식 — golden·API 테스트로 일치 확인)
      Result.aggregate([
        { $match: { user: uid } },
        { $group: { _id: null, correct: { $sum: { $ifNull: ['$correctAnswers', 0] } }, n: { $sum: 1 },
          perfects: { $sum: { $cond: [{ $and: [{ $gte: ['$totalQuestions', XP.perfectMin] }, { $eq: ['$correctAnswers', '$totalQuestions'] }] }, 1, 0] } },
          passage: { $sum: { $cond: [{ $eq: ['$kind', 'passage'] }, 1, 0] } },
          today: { $sum: { $cond: [{ $gte: ['$createdAt', today] }, 1, 0] } },
          todayCorrect: { $sum: { $cond: [{ $gte: ['$createdAt', today] }, { $ifNull: ['$correctAnswers', 0] }, 0] } },
          // 19 오늘·이번 주 퀘스트 지표(만점·본문·시험 수·맞힌 수)
          todayPerfects: { $sum: { $cond: [{ $and: [{ $gte: ['$createdAt', today] }, { $gte: ['$totalQuestions', XP.perfectMin] }, { $eq: ['$correctAnswers', '$totalQuestions'] }] }, 1, 0] } },
          todayPassage: { $sum: { $cond: [{ $and: [{ $gte: ['$createdAt', today] }, { $eq: ['$kind', 'passage'] }] }, 1, 0] } },
          week: { $sum: { $cond: [{ $gte: ['$createdAt', week] }, 1, 0] } },
          weekCorrect: { $sum: { $cond: [{ $gte: ['$createdAt', week] }, { $ifNull: ['$correctAnswers', 0] }, 0] } },
          weekPerfects: { $sum: { $cond: [{ $and: [{ $gte: ['$createdAt', week] }, { $gte: ['$totalQuestions', XP.perfectMin] }, { $eq: ['$correctAnswers', '$totalQuestions'] }] }, 1, 0] } },
          weekPassage: { $sum: { $cond: [{ $and: [{ $gte: ['$createdAt', week] }, { $eq: ['$kind', 'passage'] }] }, 1, 0] } } } },
      ]),
      Result.distinct('mode', { user: uid, mode: { $in: Object.keys(MODE_BY_ID) } }),
      learnedCount(uid, null),
      ItemStat.countDocuments({ user: uid, wrong: { $gt: 0 }, streak: { $gte: 2 } }),
      Session.countDocuments({ user: uid, 'source.type': 'wrong', status: 'done' }),
      QuestClaim.find({ user: uid }).select('key xp createdAt').lean(),
      Result.distinct('mode', { user: uid, createdAt: { $gte: today } }),
      Result.distinct('mode', { user: uid, createdAt: { $gte: week } }),
      Session.countDocuments({ user: uid, 'source.type': 'wrong', status: 'done', finishedAt: { $gte: today } }),
      Session.countDocuments({ user: uid, 'source.type': 'wrong', status: 'done', finishedAt: { $gte: week } }),
    ]);
    // 연속 학습일: 오늘(또는 어제)부터 거꾸로 이어진 날 수
    const set = new Set(days.map(d => d._id));
    let streakDays = 0, t = Date.now();
    if (!set.has(kstDay(t))) t -= 864e5;
    while (set.has(kstDay(t))) { streakDays++; t -= 864e5; }
    // 지금까지 가장 길게 이어간 날 수(최근 400일 안) — 연속 학습 업적 기준(08)
    let bestStreak = 0;
    for (const d of set) { if (set.has(kstDay(Date.parse(d + 'T12:00:00+09:00') - 864e5))) continue; let n = 0, x = Date.parse(d + 'T12:00:00+09:00'); while (set.has(kstDay(x))) { n++; x += 864e5; } bestStreak = Math.max(bestStreak, n); }
    const g = resAgg[0] || { correct: 0, n: 0, perfects: 0, passage: 0, today: 0, todayCorrect: 0 };
    const questXp = claims.reduce((a, c) => a + (c.xp || 0), 0);
    const xp = g.correct * XP.perCorrect + g.n * XP.perFinish + g.perfects * XP.perfectBonus + questXp;
    const m = {
      attempts, perfects: g.perfects, streakDays, bestStreak: Math.max(bestStreak, streakDays), learned, sets, publicSets, xp, modesUsed: modes.length,
      passageTests: g.passage, cleared, wrongReviews, friends: user?.friends?.length || 0, hasAvatar: !!user?.avatarImage,
      questsDone: claims.length, todayAttempts: g.today, todayCorrect: g.todayCorrect,
      todayPerfects: g.todayPerfects || 0, todayPassage: g.todayPassage || 0, todayModes: todayModes.length, todayReviews,
      weekAttempts: g.week || 0, weekCorrect: g.weekCorrect || 0, weekPerfects: g.weekPerfects || 0, weekPassage: g.weekPassage || 0,
      weekModes: weekModes.length, weekReviews, weekDays: [...set].filter(d => d >= kstDay(week.getTime())).length,
    };
    const achievements = achievementsOf(m), level = levelOf(xp);
    await noteProgress(uid, user, achievements, level);
    return { m, wrongCount, claims, level, achievements };
  }

  // 업적 달성·레벨 업 알림(10): 서버가 계산한 결과와 '이미 알린 것' 을 비교. achSeen 이 없던 사용자는 첫 계산 때 기록만(옛 업적으로 알림 폭탄 방지)
  async function noteProgress(uid, user, achievements, level) {
    if (!user) return;
    const got = achievements.filter(a => a.got);
    if (!Array.isArray(user.achSeen)) { await User.updateOne({ _id: uid }, { $set: { achSeen: got.map(a => a.id), levelSeen: level.level } }); return; }
    const fresh = got.filter(a => !user.achSeen.includes(a.id));
    const TIER = ['', '하', '중', '상', '최상', '전설'];
    for (const a of fresh) await notify(uid, { type: 'achievement', key: `ach:${a.id}`, title: `업적 달성 · ${TIER[a.tier]}`, body: `'${a.title}' — ${a.desc}${a.tier >= 3 ? ' · 새 칭호가 열렸어요' : ''}`, link: a.tier >= 3 ? '#/me/edit' : '#/me' });
    if (level.level > (user.levelSeen || 1)) await notify(uid, { type: 'level', key: `lvl:${level.level}`, title: `레벨 업! Lv.${level.level}`, body: `칭호 '${level.title}' · 다음 레벨까지 ${level.need - level.into} XP`, link: '#/me' });
    if (fresh.length || level.level > (user.levelSeen || 1)) await User.updateOne({ _id: uid }, { $addToSet: { achSeen: { $each: fresh.map(a => a.id) } }, $max: { levelSeen: level.level } });
  }

  // ── 알림 API(10) ──
  app.get('/api/notifications', auth, wrap(async (req, res) => {
    await notify(req.user._id, { type: 'welcome', key: 'welcome', title: '영단마스터에 오신 걸 환영해요', body: '가이드에서 사용법을 보고, 퀘스트로 첫 경험치를 받아 보세요.', link: '#/guide' });
    const [items, unread] = await Promise.all([
      Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(40).lean(),
      Notification.countDocuments({ user: req.user._id, read: false }),
    ]);
    res.json({ items: items.map(({ _id, type, title, body, link, read, createdAt }) => ({ _id, type, title, body, link, read, createdAt })), unread });
  }));
  app.get('/api/notifications/unread', auth, wrap(async (req, res) => {
    res.json({ unread: await Notification.countDocuments({ user: req.user._id, read: false }) });
  }));
  app.post('/api/notifications/read', auth, wrap(async (req, res) => {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(String).filter(idOk).slice(0, 100);
    const q = req.body?.all ? { user: req.user._id, read: false } : { user: req.user._id, _id: { $in: ids } };
    await Notification.updateMany(q, { $set: { read: true } });
    res.json({ unread: await Notification.countDocuments({ user: req.user._id, read: false }) });
  }));

  app.get('/api/stats', auth, wrap(async (req, res) => {
    const [G, weekLearned] = await Promise.all([gameOf(req.user._id), learnedCount(req.user._id, weekStartKST())]);
    const { m } = G;
    const quests = questViews(G); // 19: 주간 퀘스트 키 포함
    const recentDoc = req.user.recentSet ? await loadViewable(req, String(req.user.recentSet)) : null;
    res.json({ recent: recentDoc ? summary(recentDoc, req.user) : null, sets: m.sets, attempts: m.attempts, wrongCount: G.wrongCount, weekLearned, streakDays: m.streakDays, learned: m.learned, perfects: m.perfects,
      game: { ...G.level, achievements: G.achievements, questsReady: quests.filter(q => q.status === 'ready').length } });
  }));

  // ── 프로필 꾸미기(09): 해금 목록 · 장착(서버가 업적 달성 확인) ──
  app.get('/api/cosmetics', auth, wrap(async (req, res) => {
    const [G, u] = await Promise.all([gameOf(req.user._id), User.findById(req.user._id).select('cosmetics').lean()]);
    res.json({ equipped: { ...DEFAULT_COSMETICS, ...(u?.cosmetics || {}) }, catalog: cosmeticsCatalog(G.achievements.filter(a => a.got).map(a => a.id)) });
  }));
  app.put('/api/cosmetics', auth, wrap(async (req, res) => {
    const G = await gameOf(req.user._id);
    const got = G.achievements.filter(a => a.got).map(a => a.id);
    const $set = {};
    for (const k of COSMETIC_KINDS) {
      if (req.body?.[k] === undefined) continue;
      const r = checkEquip(k, req.body[k] === null ? '' : String(req.body[k]), got);
      if (r.error) return res.status(400).json({ message: r.error });
      $set[`cosmetics.${k}`] = r.value;
    }
    if (!Object.keys($set).length) return res.status(400).json({ message: '바꿀 꾸미기를 골라주세요.' });
    const u = await User.findByIdAndUpdate(req.user._id, { $set }, { new: true }).select('cosmetics').lean();
    res.json({ equipped: { ...DEFAULT_COSMETICS, ...u.cosmetics } });
  }));

  // ── 퀘스트(05) ──
  // 19: 주간 퀘스트 키(그 주 월요일)와 받은 시각(정렬용)을 함께
  const weekKey = () => kstDay(weekStartKST().getTime());
  const questViews = G => questsOf(G.m, G.claims.map(c => c.key), kstDay(), weekKey(), Object.fromEntries(G.claims.map(c => [c.key, c.createdAt])));
  app.get('/api/quests', auth, wrap(async (req, res) => {
    const G = await gameOf(req.user._id);
    res.json({ day: kstDay(), quests: questViews(G), level: G.level });
  }));
  // 20: 깃발 버튼의 빨간 숫자(조건을 채웠지만 아직 안 받은 보상 수)
  app.get('/api/quests/ready', auth, wrap(async (req, res) => {
    res.json({ ready: questViews(await gameOf(req.user._id)).filter(q => q.status === 'ready').length });
  }));
  app.post('/api/quests/:id/claim', auth, wrap(async (req, res) => {
    const q = QUEST_BY_ID[req.params.id];
    if (!q) return res.status(404).json({ message: '없는 퀘스트예요.' });
    const G = await gameOf(req.user._id);
    if (!canClaim(q, G.m)) return res.status(400).json({ message: '아직 퀘스트 조건을 채우지 못했어요.' });
    const key = questKey(q, kstDay(), weekKey());
    try {
      await QuestClaim.create({ user: req.user._id, key, quest: q.id, xp: q.xp });
    } catch (e) {
      if (e.code !== 11000) throw e;
      return res.json({ already: true, xp: 0, level: G.level }); // 이미 받음(멱등)
    }
    const after = levelOf(G.level.xp + q.xp);
    res.json({ already: false, xp: q.xp, level: after, levelUp: after.level > G.level.level });
  }));

  // ── 오답(학습 기록) ──
  app.get('/api/wrong', auth, wrap(async (req, res) => {
    const q = { user: req.user._id, wrong: { $gt: 0 }, streak: { $lt: 2 } };
    if (req.query.set && idOk(req.query.set)) q.set = req.query.set;
    const stats = await ItemStat.find(q).sort({ lastWrongAt: -1 }).limit(500).lean();
    const docs = await Test.find({ _id: { $in: [...new Set(stats.map(x => String(x.set)))] } }).lean();
    const sets = new Map(docs.map(toSet).filter(s => canView(req.user, s)).map(s => [String(s._id), s]));
    const items = [];
    for (const st of stats) {
      const s = sets.get(String(st.set));
      if (!s) continue;
      const list = s.kind === 'vocab' ? s.items : s.passage.sentences;
      const it = list.find(x => String(x._id) === String(st.item));
      if (!it) continue; // 세트에서 지워진 항목은 숨김(계약 v2 #11)
      items.push({
        set: { _id: s._id, title: s.title, kind: s.kind }, item: st.item,
        display: s.kind === 'vocab' ? { front: it.term, back: it.meaning } : { front: plainText(it.en), back: it.ko || '' },
        wrong: st.wrong, right: st.right, lastWrongAt: st.lastWrongAt,
      });
    }
    res.json({ items });
  }));

  app.delete('/api/wrong/:set/:item', auth, wrap(async (req, res) => {
    if (!idOk(req.params.set) || !idOk(req.params.item)) return res.status(404).json({ message: '항목을 찾을 수 없습니다.' });
    await ItemStat.updateOne({ user: req.user._id, set: req.params.set, item: req.params.item }, { $set: { streak: 2 } });
    res.json({ message: '오답 목록에서 뺐습니다.' });
  }));

  app.get('/api/legacy-wrongnote', auth, wrap(async (req, res) => {
    const groups = await WrongNote.find({ user: req.user._id }).sort({ savedAt: -1 }).limit(100).lean();
    res.json({ groups: groups.map(g => ({ _id: g._id, testTitle: g.testTitle, savedAt: g.savedAt, words: g.words.map(w => ({ question: w.question, answer: w.answer })) })) });
  }));

  // ── 랭킹: 기간 내 맞힌 서로 다른 (세트,문항) 수 — 계약 v2 ──
  async function learnedAgg(match, since) {
    return Session.aggregate([
      { $match: { ...match, 'answers.0': { $exists: true } } },
      { $unwind: '$answers' },
      { $match: { 'answers.correct': true, ...(since ? { 'answers.at': { $gte: since } } : {}) } },
      { $project: { user: 1, at: '$answers.at', ref: { $arrayElemAt: ['$questions.ref', '$answers.i'] } } },
      { $group: { _id: { u: '$user', s: '$ref.set', i: '$ref.item' }, at: { $min: '$at' } } },
      { $group: { _id: '$_id.u', learned: { $sum: 1 }, last: { $max: '$at' } } },
    ]);
  }
  async function learnedCount(user, since) {
    const r = await learnedAgg({ user }, since);
    return r[0]?.learned || 0;
  }

  // ponytail: 매 요청 세션 전체 집계. 사용자·세션이 많아지면 주간 집계 캐시 컬렉션으로.
  app.get('/api/ranking', auth, wrap(async (req, res) => {
    const since = req.query.period === 'all' ? null : weekStartKST();
    const friendsOnly = req.query.scope === 'friends';
    const match = friendsOnly ? { user: { $in: [...(req.user.friends || []), req.user._id] } } : {};
    const rows = await learnedAgg(match, since);
    const attempts = await Result.aggregate([
      { $match: { ...(friendsOnly ? { user: match.user } : {}), ...(since ? { createdAt: { $gte: since } } : {}) } },
      { $group: { _id: '$user', n: { $sum: 1 } } },
    ]);
    const att = new Map(attempts.map(a => [String(a._id), a.n]));
    const users = await User.find({ _id: { $in: rows.map(r => r._id) } }).select(PUBLIC_USER).lean(); // 16: 사진 원본은 읽지 않음
    const um = new Map(users.map(u => [String(u._id), u]));
    const list = rows.filter(r => um.has(String(r._id))).map(r => {
      const u = um.get(String(r._id));
      return { _id: u._id, username: u.username, avatarUrl: avatarUrl(u), learned: r.learned, attempts: att.get(String(u._id)) || 0, last: r.last };
    }).sort((a, b) => b.learned - a.learned || a.last - b.last || a.username.localeCompare(b.username));
    const meIdx = list.findIndex(x => String(x._id) === String(req.user._id));
    res.json({
      ranking: list.slice(0, 50).map((x, i) => ({ ...x, rank: i + 1, last: undefined })),
      me: meIdx >= 0 ? { ...list[meIdx], rank: meIdx + 1, last: undefined } : null,
    });
  }));

  // ── 이미지(R10): 목록 응답엔 URL 만, 바이트는 여기서 캐시와 함께 ──
  for (const [path, field] of [['avatar', 'avatarImage'], ['banner', 'bannerImage']]) {
    app.get(`/api/users/:id/${path}`, wrap(async (req, res) => {
      if (!idOk(req.params.id)) return res.status(404).end();
      const u = await User.findById(req.params.id).select(field).lean();
      const v = u?.[field];
      if (!v) return res.status(404).end();
      if (/^https?:\/\//.test(v)) return res.redirect(v);
      const m = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,(.+)$/s.exec(v);
      if (!m) return res.status(404).end();
      res.setHeader('Content-Type', m[1]);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // URL 에 ?v= 버전이 붙음
      res.send(Buffer.from(m[2], 'base64'));
    }));
  }

  return { Session, ItemStat, QuestClaim, Notification, gameOf, notify };
}
