import { api } from '../api.js';
import { html, render, on, $, toast, skeleton, errorBox, icon, fmtDate } from '../ui.js';
import { drafts } from '../drafts.js';
import { pairSentences, parseMarkup, tokenize } from '../shared/passage.js';

const IMPORT_LIMIT = 500;
let xlsxPromise;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromise) xlsxPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX 라이브러리를 사용할 수 없습니다.'));
    script.onerror = () => { script.remove(); xlsxPromise = null; reject(new Error('XLSX 라이브러리를 불러오지 못했어요. CSV로 저장해 올려주세요.')); };
    document.head.append(script);
  });
  return xlsxPromise;
}

function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted && c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); if (row.some(x => x.trim())) rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('CSV 따옴표 짝이 맞지 않습니다.');
  row.push(cell); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}
if (parseCSV('term,meaning\r\n"a,b","say ""yes"""')[1]?.[1] !== 'say "yes"') throw new Error('CSV 파서 자체 확인에 실패했습니다.');
const mergeKeyGroups = text => text.replace(/\{([^{}]+)\}(?:\s+\{([^{}]+)\})+/g, match => `{${[...match.matchAll(/\{([^{}]+)\}/g)].map(x => x[1]).join(' ')}}`);
if (mergeKeyGroups('{one} {two} {three}') !== '{one two three}') throw new Error('핵심 표현 병합 자체 확인에 실패했습니다.');

export default {
  title: '세트 편집',
  async render(root, params, _query, ctx) {
    let kind = params.id ? '' : params.kind, setId = params.id || '', title = '', description = '', visibility = 'private', tags = '', items = [], passageSource = '', enPaste = '', koPaste = '', dirty = false, selectedWord = null;
    // 임시저장(02 D10): 새 세트는 'new', 수정은 세트 id 로 구분. baseUpdatedAt = 불러온 서버 세트의 수정 시각(충돌 안내용)
    const draftId = setId || 'new';
    let baseUpdatedAt = null, pendingDraft = null, lastSaved = '';
    const snapshot = () => ({ kind, title, description, visibility, tags, items, passageSource, enPaste, koPaste, baseUpdatedAt });
    const hasContent = d => d && (String(d.title || '').trim() || (d.items || []).some(x => Object.values(x).some(v => typeof v === 'string' && v.trim())) || String(d.enPaste || '').trim());
    const flushDraft = () => {
      if (!dirty) return true;
      const snap = JSON.stringify(snapshot());
      if (snap === lastSaved) return true;
      if (!hasContent(snapshot())) return true;
      const ok = drafts.save(draftId, snapshot());
      if (ok) lastSaved = snap;
      return ok;
    };
    const tokenButtons = (en, i) => {
      const out = []; let searchAt = 0;
      for (const part of parseMarkup(en)) {
        const rawPart = part.type === 'key' ? `{${part.text}}` : part.type === 'choice' ? `[${part.options.join('|')}]` : part.text;
        let base = en.indexOf(rawPart, searchAt);
        if (base < 0) base = searchAt;
        if (part.type !== 'choice') {
          const text = part.type === 'key' ? part.text : part.text;
          let local = 0;
          for (const t of tokenize(text)) {
            const start = base + (part.type === 'key' ? 1 : 0) + local;
            out.push(t.kind === 'word' ? html`<button type="button" class="editor-word${part.type === 'key' ? ' is-key' : ''}" data-word="${i}" data-start="${start}" data-end="${start + t.text.length}" data-key="${part.type === 'key'}">${t.text}</button>` : t.text);
            local += t.text.length;
          }
        } else out.push(html`<span class="badge">${part.options.join(' / ')}</span>`);
        searchAt = base + rawPart.length;
      }
      return out;
    };
    const updatePreview = i => {
      const target = $(`[data-preview="${i}"]`, root), sentence = items[i];
      if (!target || !sentence) return;
      render(target, html`${tokenButtons(sentence.en, i)}`);
    };
    const vocabRows = () => items.map((it, i) => html`<article class="card stack" data-row="${i}"><h2 class="field__label">단어 ${i + 1}</h2>
      <div class="field-row"><label class="field"><span class="field__label">영어</span><input class="input" data-field="term" value="${it.term || ''}" maxlength="200"></label><label class="field"><span class="field__label">뜻</span><input class="input" data-field="meaning" value="${it.meaning || ''}" maxlength="200"></label></div>
      <div class="field-row"><label class="field"><span class="field__label">예문 (선택)</span><input class="input" data-field="example" value="${it.example || ''}" maxlength="300"></label><label class="field"><span class="field__label">예문 해석</span><input class="input" data-field="exampleKo" value="${it.exampleKo || ''}" maxlength="300"></label></div>
      <button class="btn btn--ghost btn--sm" type="button" data-remove="${i}">이 항목 삭제</button></article>`);
    const sentenceRows = () => items.map((s, i) => html`<article class="card stack" data-row="${i}"><h2 class="field__label">문장 ${i + 1}</h2>
      <div class="sentence-editor"><label class="field"><span class="field__label">영어 본문 · 단어를 눌러 핵심 표현 표시</span><textarea class="input" rows="2" data-field="en" maxlength="600" data-sentence="${i}" data-autogrow>${s.en || ''}</textarea></label>
      <p class="editor-preview passage" lang="en" data-preview="${i}"></p>
      ${selectedWord?.i === i ? html`<div class="field-row"><button class="btn btn--ghost" type="button" data-make-key>핵심 표현으로</button><label class="field"><span class="field__label">오답 보기 (선택지의 첫 항목은 정답)</span><input class="input" data-distractor placeholder="오답 선택지"></label><button class="btn btn--ghost" type="button" data-make-choice>선택지로</button><button class="btn btn--ghost" type="button" data-clear-word>취소</button></div>` : ''}
      <label class="field"><span class="field__label">한국어 해석</span><textarea class="input" rows="2" data-field="ko" maxlength="600" data-autogrow>${s.ko || ''}</textarea></label><button class="btn btn--ghost btn--sm" type="button" data-remove="${i}">문장 삭제</button></div></article>`);
    const draftBanner = () => {
      if (!pendingDraft) return '';
      const changed = setId && pendingDraft.baseUpdatedAt && baseUpdatedAt && new Date(baseUpdatedAt) > new Date(pendingDraft.baseUpdatedAt);
      return html`<div class="draft-banner glass-card" role="status">
        <span class="draft-banner__icon" aria-hidden="true">${icon('clock', 20)}</span>
        <div class="draft-banner__text"><strong>저장하지 않은 작성 내용이 있어요</strong>
          <span>${fmtDate(pendingDraft.savedAt)} 임시저장${changed ? ' · 그 사이 세트가 다른 곳에서 바뀌었어요. 이어서 작성하면 저장할 때 지금 내용으로 덮어써요.' : ''}</span></div>
        <div class="draft-banner__actions"><button class="btn btn--ghost btn--sm" type="button" data-draft-discard>버리기</button><button class="btn btn--primary btn--sm" type="button" data-draft-restore>이어서 작성</button></div>
      </div>`;
    };
    const draw = () => { render(root, html`<div class="page page--narrow"><section class="section">${draftBanner()}<h1 class="section__title">${setId ? '세트 수정' : '새 세트 만들기'}</h1>
      <form class="stack" data-editor><label class="field"><span class="field__label">세트 제목</span><input class="input" name="title" value="${title}" maxlength="100" required></label>
      <label class="field"><span class="field__label">설명</span><textarea class="input" name="description" maxlength="500">${description}</textarea></label>
      ${setId ? html`<p class="muted">종류: ${kind === 'passage' ? '본문' : '단어'} (수정 중 변경할 수 없음)</p>` : html`<label class="field"><span class="field__label">종류</span><select class="select" name="kind"><option value="vocab" ${kind === 'vocab' ? 'selected' : ''}>단어</option><option value="passage" ${kind === 'passage' ? 'selected' : ''}>본문</option></select></label>`}
      ${kind === 'passage' ? html`<label class="field"><span class="field__label">교재·출처 (선택)</span><input class="input" name="source" value="${passageSource}" maxlength="100"></label>
        <div class="card stack"><h2 class="section__title">문단 붙여넣기</h2><label class="field"><span class="field__label">영어 문단</span><textarea class="input" name="enPaste" maxlength="50000">${enPaste}</textarea></label><label class="field"><span class="field__label">한국어 해석</span><textarea class="input" name="koPaste" maxlength="50000">${koPaste}</textarea></label><button class="btn btn--ghost" type="button" data-pair>문장을 자동으로 나누고 짝짓기</button></div>
        <div class="stack">${sentenceRows()}</div><button class="btn btn--ghost" type="button" data-add>문장 추가</button>`
        : html`<div class="card stack"><label class="field"><span class="field__label">여러 줄 붙여넣기</span><textarea class="input" name="bulk" placeholder="영어<TAB>뜻<TAB>예문<TAB>예문 해석"></textarea></label><div class="btn-row"><button class="btn btn--ghost" type="button" data-bulk>붙여넣은 항목 추가</button><label class="btn btn--ghost">CSV/XLSX 가져오기<input class="sr-only" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-csv></label></div><p class="field__hint">열 순서: 영어, 뜻, 예문, 예문 해석</p></div>
        <div class="stack">${vocabRows()}</div><button class="btn btn--ghost" type="button" data-add>단어 추가</button>`}
      <div class="field-row"><label class="field"><span class="field__label">공개 범위</span><select class="select" name="visibility"><option value="private" ${visibility === 'private' ? 'selected' : ''}>비공개</option><option value="friends" ${visibility === 'friends' ? 'selected' : ''}>친구</option><option value="public" ${visibility === 'public' ? 'selected' : ''}>공개</option></select></label><label class="field"><span class="field__label">태그 (쉼표로 구분)</span><input class="input" name="tags" value="${tags}" maxlength="220" placeholder="예: 고1, 3과"></label></div>
      <div class="btn-row"><button class="btn btn--primary">저장</button><a class="btn btn--ghost" href="#/">취소</a></div></form></section></div>`);
      if (kind === 'passage') items.forEach((_, i) => updatePreview(i));
    };
    if (setId) {
      render(root, html`<div class="page">${skeleton(4)}</div>`);
      try {
        const s = await api.get(`/sets/${encodeURIComponent(setId)}`);
        if (!ctx.isCurrent()) return;
        baseUpdatedAt = s.updatedAt || null;
        kind = s.kind; title = s.title; description = s.description || ''; visibility = s.visibility; tags = (s.tags || []).join(', ');
        items = kind === 'vocab' ? s.items.map(x => ({ ...x })) : s.passage.sentences.map(x => ({ ...x })); passageSource = s.passage?.source || '';
      } catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message)}</div>`); return; }
    }
    if (!items.length) items = [kind === 'passage' ? { en: '', ko: '' } : { term: '', meaning: '', example: '', exampleKo: '' }];
    const found = drafts.load(draftId);
    if (hasContent(found)) pendingDraft = found;
    draw();
    const offs = [on(root, 'input', '[data-field]', (_e, el) => { const i = Number(el.closest('[data-row]').dataset.row); items[i][el.dataset.field] = el.value; dirty = true; if (el.dataset.field === 'en') selectedWord = null; if (kind === 'passage' && el.dataset.field === 'en') updatePreview(i); }),
      on(root, 'input', 'input[name],textarea[name],select[name]', (_e, el) => { if (el.name === 'title') title = el.value; if (el.name === 'description') description = el.value; if (el.name === 'visibility') visibility = el.value; if (el.name === 'tags') tags = el.value; if (el.name === 'source') passageSource = el.value; if (el.name === 'enPaste') enPaste = el.value; if (el.name === 'koPaste') koPaste = el.value; dirty = true; }),
      on(root, 'change', 'select[name="visibility"]', (_e, el) => { visibility = el.value; dirty = true; }),
      on(root, 'change', 'select[name="kind"]', (_e, el) => { kind = el.value; selectedWord = null; items = [kind === 'passage' ? { en: '', ko: '' } : { term: '', meaning: '', example: '', exampleKo: '' }]; dirty = true; draw(); }),
      on(root, 'click', '[data-add]', () => { selectedWord = null; items.push(kind === 'passage' ? { en: '', ko: '' } : { term: '', meaning: '', example: '', exampleKo: '' }); dirty = true; draw(); }),
      on(root, 'click', '[data-remove]', async (_e, el) => { if (items.length === 1) { toast('항목을 하나 이상 남겨주세요.', 'info'); return; } selectedWord = null; items.splice(Number(el.dataset.remove), 1); dirty = true; draw(); }),
      on(root, 'click', '[data-pair]', () => { const form = $('[data-editor]', root).elements; enPaste = form.namedItem('enPaste').value; koPaste = form.namedItem('koPaste').value; items = pairSentences(enPaste, koPaste); if (!items.length) { toast('영어 본문을 입력해주세요.', 'info'); return; } selectedWord = null; dirty = true; draw(); }),
      on(root, 'click', '[data-word]', (_e, button) => {
        const i = Number(button.dataset.word), start = Number(button.dataset.start), end = Number(button.dataset.end), source = items[i].en;
        if (button.dataset.key === 'true') {
          const open = source.lastIndexOf('{', start), close = source.indexOf('}', end);
          if (open >= 0 && close >= 0) { items[i].en = source.slice(0, open) + source.slice(open + 1, close) + source.slice(close + 1); items[i].en = mergeKeyGroups(items[i].en); dirty = true; selectedWord = null; draw(); }
        } else { selectedWord = { i, start, end }; draw(); }
      }),
      on(root, 'click', '[data-make-choice]', (_e, button) => {
        const distractor = $('[data-distractor]', button.parentElement)?.value.trim();
        if (!selectedWord || !distractor) { toast('오답 선택지를 입력해주세요.', 'info'); return; }
        const { i, start, end } = selectedWord, source = items[i].en, answer = source.slice(start, end);
        items[i].en = source.slice(0, start) + `[${answer}|${distractor}]` + source.slice(end); dirty = true; selectedWord = null; draw();
      }),
      on(root, 'click', '[data-clear-word]', () => { selectedWord = null; draw(); }),
      on(root, 'click', '[data-bulk]', () => { const text = $('[data-editor]', root).elements.namedItem('bulk').value.trim(); if (!text) return; if (new Blob([text]).size > 1_000_000) { toast('한 번에 가져올 수 있는 텍스트는 1MB까지예요.', 'bad'); return; } const rows = text.includes('\t') ? text.split(/\r?\n/).map(line => line.split('\t')) : parseCSV(text); if (items.length + rows.length > IMPORT_LIMIT) { toast(`단어는 한 세트에 최대 ${IMPORT_LIMIT}개까지예요.`, 'bad'); return; } items.push(...rows.map(r => ({ term: r[0]?.trim() || '', meaning: r[1]?.trim() || '', example: r[2]?.trim() || '', exampleKo: r[3]?.trim() || '' }))); dirty = true; draw(); }),
      on(root, 'click', '[data-make-key]', () => { if (!selectedWord) return; const { i, start, end } = selectedWord, source = items[i].en; items[i].en = mergeKeyGroups(source.slice(0, start) + `{${source.slice(start, end)}}` + source.slice(end)); dirty = true; selectedWord = null; draw(); }),
      on(root, 'change', '[data-csv]', async (_e, input) => { const file = input.files[0]; if (!file) return; input.value = ''; if (file.size > 4 * 1024 * 1024) { toast('가져오기 파일은 4MB 이하만 사용할 수 있어요.', 'bad'); return; } try {
        let rows;
        if (/\.xlsx$/i.test(file.name)) { const XLSX = await loadXlsx(); const book = XLSX.read(await file.arrayBuffer(), { type: 'array' }); rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: '' }); }
        else rows = parseCSV(await file.text());
        const data = rows.filter((r, i) => !(i === 0 && /^(term|영어|단어)$/i.test(String(r[0] || '').trim())));
        if (data.length > IMPORT_LIMIT || items.length + data.length > IMPORT_LIMIT) { toast(`단어는 한 세트에 최대 ${IMPORT_LIMIT}개까지예요.`, 'bad'); return; }
        items.push(...data.map(r => ({ term: String(r[0] || ''), meaning: String(r[1] || ''), example: String(r[2] || ''), exampleKo: String(r[3] || '') }))); dirty = true; draw(); toast(`${data.length}개 행을 불러왔어요.`, 'ok');
      } catch (e) { toast(e.message || '파일을 읽지 못했어요. CSV로 저장해 올려주세요.', 'bad'); } }),
      on(root, 'submit', '[data-editor]', async (e, form) => { e.preventDefault(); const fields = form.elements; title = fields.namedItem('title').value.trim(); description = fields.namedItem('description').value.trim(); visibility = fields.namedItem('visibility').value; tags = fields.namedItem('tags').value;
        if (kind === 'passage') { passageSource = fields.namedItem('source').value.trim(); items = items.filter(s => s.en.trim() || s.ko.trim()); if (items.some(s => !s.en.trim())) { toast('영어 문장이 비어 있는 행을 채우거나 삭제해주세요.', 'bad'); return; } }
        else { items = items.filter(x => x.term.trim() || x.meaning.trim() || x.example.trim() || x.exampleKo.trim()); if (items.some(x => !x.term.trim() || !x.meaning.trim())) { toast('단어와 뜻이 비어 있는 행을 채우거나 삭제해주세요.', 'bad'); return; } }
        if (!items.length) { toast(kind === 'passage' ? '본문 문장을 하나 이상 입력해주세요.' : '단어를 하나 이상 입력해주세요.', 'bad'); return; }
        const body = { title, description, kind, visibility, tags: tags.split(',').map(x => x.trim()).filter(Boolean), ...(kind === 'passage' ? { passage: { source: passageSource, sentences: items } } : { items }) };
        try { const saved = setId ? await api.put(`/sets/${encodeURIComponent(setId)}`, body) : await api.post('/sets', body); dirty = false; drafts.clear(draftId); toast('세트를 저장했어요.', 'ok'); location.hash = `#/sets/${saved._id}`; }
        catch (err) { toast(err.message, 'bad'); }
      }),
      on(root, 'click', '[data-draft-restore]', () => {
        const d = pendingDraft; pendingDraft = null;
        if (!setId && d.kind) kind = d.kind;
        ({ title = '', description = '', visibility = 'private', tags = '', passageSource = '', enPaste = '', koPaste = '' } = d);
        if (Array.isArray(d.items) && d.items.length) items = d.items;
        selectedWord = null; dirty = true; draw(); toast('임시저장한 내용을 불러왔어요.', 'ok');
      }),
      on(root, 'click', '[data-draft-discard]', () => { drafts.clear(draftId); pendingDraft = null; draw(); toast('임시저장을 지웠어요.', 'info'); })];
    // 1초마다 바뀐 내용만 브라우저에 임시저장. 새로고침(재배포 알림)·탭 닫힘·화면 이동 때도 마지막으로 저장.
    const timer = setInterval(flushDraft, 1000);
    const onLeave = () => { flushDraft(); };
    // 임시저장에 실패한 경우(사생활 모드 등)에만 브라우저의 "나가시겠어요?" 확인을 띄운다
    const beforeUnload = e => { if (dirty && !flushDraft()) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('ydm:before-reload', onLeave);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      if (dirty && flushDraft() && hasContent(snapshot())) toast('작성 중인 내용은 임시저장했어요. 다시 열면 이어서 쓸 수 있어요.', 'info');
      clearInterval(timer);
      offs.forEach(fn => fn());
      window.removeEventListener('ydm:before-reload', onLeave);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  },
};
