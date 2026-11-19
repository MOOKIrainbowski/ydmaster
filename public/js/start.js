// 시험 시작 대화상자 — 세트 상세·홈·오답 화면이 함께 쓴다(시험 설정 UI 는 한 곳에만).
// startTest({ setIds:[...], kind:'vocab'|'passage' }) 또는 startTest({ source:'wrong', kind })
import { api } from './api.js';
import { html, modal, toast, $ } from './ui.js';

let modesCache;
const getModes = async () => (modesCache ||= await api.get('/modes'));

export async function startTest({ setIds = [], kind = 'vocab', source = 'sets', defaultMode } = {}) {
  let modes;
  try { modes = (await getModes()).filter(m => m.kind === kind); } catch (e) { toast(e.message, 'bad'); return; }
  let form;
  const choice = await modal({
    title: source === 'wrong' ? '오답 복습 시험' : '시험 설정',
    wide: true,
    actions: [{ id: 'cancel', label: '취소' }, { id: 'start', label: '시작하기', kind: 'primary' }],
    body: el => {
      el.innerHTML = String(html`
        <form class="stack" data-start-form>
          <fieldset class="field">
            <legend class="field__label">시험 종류</legend>
            <div class="mode-grid">${modes.map((m, i) => html`
              <label class="mode-option">
                <input type="radio" name="mode" value="${m.id}" ${(defaultMode ? m.id === defaultMode : i === 0) ? 'checked' : ''}>
                <span class="mode-option__label">${m.label}</span>
                <span class="mode-option__desc">${m.desc}</span>
              </label>`)}</div>
          </fieldset>
          <div class="field-row">
            <label class="field">
              <span class="field__label">문항 수</span>
              <select class="select" name="count">${[10, 20, 30, 50, 100].map(n => html`<option value="${n}" ${n === 20 ? 'selected' : ''}>${n === 100 ? '최대' : n + '문항'}</option>`)}</select>
            </label>
            <label class="field">
              <span class="field__label">순서</span>
              <select class="select" name="order"><option value="random">섞어서</option><option value="sequential">원래 순서</option></select>
            </label>
            <label class="field">
              <span class="field__label">정답 확인</span>
              <select class="select" name="feedback"><option value="instant">문항마다 바로</option><option value="end">다 풀고 나서</option></select>
            </label>
          </div>
          <div class="field-row" data-extra></div>
        </form>`);
      form = $('[data-start-form]', el);
      const extra = $('[data-extra]', el);
      const sync = () => {
        const m = modes.find(x => x.id === form.mode.value);
        const o = m?.options || [];
        extra.innerHTML = String(html`
          ${o.includes('hint') ? html`<label class="check"><input type="checkbox" name="hint"> 첫 글자 힌트</label>` : ''}
          ${o.includes('ratio') ? html`<label class="field"><span class="field__label">빈칸 비율</span><select class="select" name="ratio"><option value="0.15">적게</option><option value="0.25" selected>보통</option><option value="0.4">많이</option></select></label>` : ''}
          ${o.includes('size') ? html`<label class="field"><span class="field__label">한 문제 문장 수</span><select class="select" name="size">${[3, 4, 5, 6, 8].map(n => html`<option value="${n}" ${n === 5 ? 'selected' : ''}>${n}문장</option>`)}</select></label>` : ''}`);
      };
      form.addEventListener('change', e => { if (e.target.name === 'mode') sync(); });
      form.addEventListener('submit', e => { e.preventDefault(); el.closest('.modal').querySelector('[data-action="start"]').click(); });
      sync();
    },
  });
  if (choice !== 'start' || !form) return;
  const f = new FormData(form);
  const body = {
    source: source === 'wrong' ? { type: 'wrong' } : { type: 'sets', ids: setIds },
    mode: f.get('mode'), count: Number(f.get('count')),
    options: { order: f.get('order'), feedback: f.get('feedback'), hint: f.get('hint') === 'on', ratio: f.get('ratio') || undefined, size: f.get('size') || undefined },
  };
  try {
    const s = await api.post('/sessions', body);
    location.hash = `#/play/${s._id}`;
  } catch (e) { toast(e.message, 'bad'); }
}
