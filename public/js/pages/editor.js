import { api } from '../api.js';
import { html, render, on, $, toast, skeleton, errorBox } from '../ui.js';
import { pairSentences, parseSentence } from '../shared/passage.js';

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

export default {
  title: '세트 편집',
  async render(root, params, _query, ctx) {
    let kind = params.id ? '' : params.kind, setId = params.id || '', title = '', description = '', visibility = 'private', tags = '', items = [], passageSource = '', enPaste = '', koPaste = '', dirty = false;
    const updatePreview = i => {
      const target = $(`[data-preview="${i}"]`, root), sentence = items[i];
      if (!target || !sentence) return;
      render(target, html`${parseSentence(sentence.en).tokens.map(t => t.kind === 'choice' ? html`<span class="badge">${t.options.join(' / ')}</span>` : html`<span class="${t.key !== undefined ? 'is-key' : ''}">${t.text}</span>`)}`);
    };
    const vocabRows = () => items.map((it, i) => html`<article class="card stack" data-row="${i}"><h2 class="field__label">단어 ${i + 1}</h2>
      <div class="field-row"><label class="field"><span class="field__label">영어</span><input class="input" data-field="term" value="${it.term || ''}" maxlength="200"></label><label class="field"><span class="field__label">뜻</span><input class="input" data-field="meaning" value="${it.meaning || ''}" maxlength="200"></label></div>
      <div class="field-row"><label class="field"><span class="field__label">예문 (선택)</span><input class="input" data-field="example" value="${it.example || ''}" maxlength="300"></label><label class="field"><span class="field__label">예문 해석</span><input class="input" data-field="exampleKo" value="${it.exampleKo || ''}" maxlength="300"></label></div>
      <button class="btn btn--ghost btn--sm" type="button" data-remove="${i}">이 항목 삭제</button></article>`);
    const sentenceRows = () => items.map((s, i) => html`<article class="card stack" data-row="${i}"><h2 class="field__label">문장 ${i + 1}</h2>
      <label class="field"><span class="field__label">영어 본문 · {핵심 표현} · [정답|오답] 선택지</span><textarea class="input" data-field="en" maxlength="600" data-sentence="${i}">${s.en || ''}</textarea></label>
      <div class="btn-row"><button class="btn btn--ghost btn--sm" type="button" data-mark="key" data-index="${i}">선택한 단어를 핵심으로</button><button class="btn btn--ghost btn--sm" type="button" data-mark="choice" data-index="${i}">선택한 단어에 선택지</button><button class="btn btn--ghost btn--sm" type="button" data-remove="${i}">문장 삭제</button></div>
      <p class="muted">미리보기</p><p class="passage" lang="en" data-preview="${i}"></p><label class="field"><span class="field__label">한국어 해석</span><textarea class="input" data-field="ko" maxlength="600">${s.ko || ''}</textarea></label></article>`);
    const draw = () => { render(root, html`<div class="page page--narrow"><section class="section"><h1 class="section__title">${setId ? '세트 수정' : '새 세트 만들기'}</h1>
      <form class="stack" data-editor><label class="field"><span class="field__label">세트 제목</span><input class="input" name="title" value="${title}" maxlength="100" required></label>
      <label class="field"><span class="field__label">설명</span><textarea class="input" name="description" maxlength="500">${description}</textarea></label>
      ${setId ? html`<p class="muted">종류: ${kind === 'passage' ? '본문' : '단어'} (수정 중 변경할 수 없음)</p>` : html`<label class="field"><span class="field__label">종류</span><select class="select" name="kind"><option value="vocab" ${kind === 'vocab' ? 'selected' : ''}>단어</option><option value="passage" ${kind === 'passage' ? 'selected' : ''}>본문</option></select></label>`}
      ${kind === 'passage' ? html`<label class="field"><span class="field__label">교재·출처 (선택)</span><input class="input" name="source" value="${passageSource}" maxlength="100"></label>
        <div class="card stack"><h2 class="section__title">문단 붙여넣기</h2><label class="field"><span class="field__label">영어 문단</span><textarea class="input" name="enPaste" maxlength="50000">${enPaste}</textarea></label><label class="field"><span class="field__label">한국어 해석</span><textarea class="input" name="koPaste" maxlength="50000">${koPaste}</textarea></label><button class="btn btn--ghost" type="button" data-pair>문장을 자동으로 나누고 짝짓기</button></div>
        <div class="stack">${sentenceRows()}</div><button class="btn btn--ghost" type="button" data-add>문장 추가</button>`
        : html`<div class="card stack"><label class="field"><span class="field__label">여러 줄 붙여넣기</span><textarea class="input" name="bulk" placeholder="영어<TAB>뜻<TAB>예문<TAB>예문 해석"> </textarea></label><div class="btn-row"><button class="btn btn--ghost" type="button" data-bulk>붙여넣은 항목 추가</button><label class="btn btn--ghost">CSV 가져오기<input class="sr-only" type="file" accept=".csv,text/csv" data-csv></label></div><p class="field__hint">CSV 열: 영어, 뜻, 예문, 예문 해석. XLSX 가져오기는 외부 라이브러리 출처 확인 후 추가할 수 있어요.</p></div>
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
        kind = s.kind; title = s.title; description = s.description || ''; visibility = s.visibility; tags = (s.tags || []).join(', ');
        items = kind === 'vocab' ? s.items.map(x => ({ ...x })) : s.passage.sentences.map(x => ({ ...x })); passageSource = s.passage?.source || '';
      } catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message)}</div>`); return; }
    }
    if (!items.length) items = [kind === 'passage' ? { en: '', ko: '' } : { term: '', meaning: '', example: '', exampleKo: '' }];
    draw();
    const offs = [on(root, 'input', '[data-field]', (_e, el) => { const i = Number(el.closest('[data-row]').dataset.row); items[i][el.dataset.field] = el.value; dirty = true; if (kind === 'passage') updatePreview(i); }),
      on(root, 'input', 'input[name],textarea[name],select[name]', (_e, el) => { if (el.name === 'title') title = el.value; if (el.name === 'description') description = el.value; if (el.name === 'visibility') visibility = el.value; if (el.name === 'tags') tags = el.value; if (el.name === 'source') passageSource = el.value; if (el.name === 'enPaste') enPaste = el.value; if (el.name === 'koPaste') koPaste = el.value; dirty = true; }),
      on(root, 'change', 'select[name="visibility"]', (_e, el) => { visibility = el.value; dirty = true; }),
      on(root, 'change', 'select[name="kind"]', (_e, el) => { kind = el.value; items = [kind === 'passage' ? { en: '', ko: '' } : { term: '', meaning: '', example: '', exampleKo: '' }]; dirty = true; draw(); }),
      on(root, 'click', '[data-add]', () => { items.push(kind === 'passage' ? { en: '', ko: '' } : { term: '', meaning: '', example: '', exampleKo: '' }); dirty = true; draw(); }),
      on(root, 'click', '[data-remove]', async (_e, el) => { if (items.length === 1) { toast('항목을 하나 이상 남겨주세요.', 'info'); return; } items.splice(Number(el.dataset.remove), 1); dirty = true; draw(); }),
      on(root, 'click', '[data-pair]', () => { const form = $('[data-editor]', root).elements; enPaste = form.namedItem('enPaste').value; koPaste = form.namedItem('koPaste').value; items = pairSentences(enPaste, koPaste); if (!items.length) { toast('영어 본문을 입력해주세요.', 'info'); return; } dirty = true; draw(); }),
      on(root, 'click', '[data-mark]', (_e, button) => {
        const i = Number(button.dataset.index), area = $(`[data-sentence="${i}"]`, root), start = area.selectionStart, end = area.selectionEnd;
        if (start === end) { toast('먼저 표시할 단어를 선택해주세요.', 'info'); return; }
        const selected = area.value.slice(start, end); let marked;
        if (button.dataset.mark === 'key') marked = `{${selected}}`;
        else { const choices = window.prompt('정답을 첫 번째에 두고 | 로 구분해 2~4개를 입력하세요.', `${selected}|`); if (choices === null) return; const opts = choices.split('|').map(x => x.trim()).filter(Boolean); if (opts.length < 2 || opts.length > 4) { toast('선택지는 2~4개여야 합니다.', 'bad'); return; } marked = `[${opts.join('|')}]`; }
        const value = area.value.slice(0, start) + marked + area.value.slice(end); items[i].en = value; dirty = true; draw(); const next = $(`[data-sentence="${i}"]`, root); next.focus(); next.setSelectionRange(start + marked.length, start + marked.length);
      }),
      on(root, 'click', '[data-bulk]', () => { const text = $('[data-editor]', root).elements.namedItem('bulk').value.trim(); if (!text) return; const rows = text.includes('\t') ? text.split(/\r?\n/).map(line => line.split('\t')) : parseCSV(text); items.push(...rows.map(r => ({ term: r[0]?.trim() || '', meaning: r[1]?.trim() || '', example: r[2]?.trim() || '', exampleKo: r[3]?.trim() || '' }))); dirty = true; draw(); }),
      on(root, 'change', '[data-csv]', async (_e, input) => { const file = input.files[0]; if (!file) return; try { const rows = parseCSV(await file.text()); const data = rows.filter((r, i) => !(i === 0 && /^(term|영어|단어)$/i.test(r[0]?.trim()))); items.push(...data.map(r => ({ term: r[0] || '', meaning: r[1] || '', example: r[2] || '', exampleKo: r[3] || '' }))); dirty = true; draw(); toast(`${data.length}개 행을 불러왔어요.`, 'ok'); } catch (e) { toast(e.message, 'bad'); } }),
      on(root, 'submit', '[data-editor]', async (e, form) => { e.preventDefault(); const fields = form.elements; title = fields.namedItem('title').value.trim(); description = fields.namedItem('description').value.trim(); visibility = fields.namedItem('visibility').value; tags = fields.namedItem('tags').value;
        if (kind === 'passage') { passageSource = fields.namedItem('source').value.trim(); items = items.filter(s => s.en.trim() || s.ko.trim()); if (items.some(s => !s.en.trim())) { toast('영어 문장이 비어 있는 행을 채우거나 삭제해주세요.', 'bad'); return; } }
        else { items = items.filter(x => x.term.trim() || x.meaning.trim() || x.example.trim() || x.exampleKo.trim()); if (items.some(x => !x.term.trim() || !x.meaning.trim())) { toast('단어와 뜻이 비어 있는 행을 채우거나 삭제해주세요.', 'bad'); return; } }
        if (!items.length) { toast(kind === 'passage' ? '본문 문장을 하나 이상 입력해주세요.' : '단어를 하나 이상 입력해주세요.', 'bad'); return; }
        const body = { title, description, kind, visibility, tags: tags.split(',').map(x => x.trim()).filter(Boolean), ...(kind === 'passage' ? { passage: { source: passageSource, sentences: items } } : { items }) };
        try { const saved = setId ? await api.put(`/sets/${encodeURIComponent(setId)}`, body) : await api.post('/sets', body); dirty = false; toast('세트를 저장했어요.', 'ok'); location.hash = `#/sets/${saved._id}`; }
        catch (err) { toast(err.message, 'bad'); }
      }),
      on(root, 'click', 'a[href^="#/"]', (e) => { if (dirty && !window.confirm('저장하지 않은 내용이 있어요. 나갈까요?')) e.preventDefault(); })];
    const beforeUnload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { offs.forEach(fn => fn()); window.removeEventListener('beforeunload', beforeUnload); };
  },
};
