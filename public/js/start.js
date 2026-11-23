// 시험 시작 대화상자 — 세트 상세·홈·오답·결과 화면이 함께 쓴다(시험 설정 UI 는 한 곳에만).
// startTest({ setIds:[...], kind:'vocab'|'passage', info:{ title, count } }) 또는 startTest({ source:'wrong', kind })
// 04(2026-11-20 사용자 요청: 설정 창을 더 구체적으로): 방식마다 아이콘·문제 형태·난이도·예시,
// 문항 수·진행 방식은 눌러 고르는 칩, 맨 아래에 고른 내용 요약 + 예상 시간 + 얻을 수 있는 최대 경험치.
import { api } from './api.js';
import { html, modal, toast, icon, $, $$ } from './ui.js';

let modesCache;
const getModes = async () => (modesCache ||= await api.get('/modes'));

// 화면용 설명(서버 MODES 의 id 기준). sec = 문항당 예상 초
const META = {
  mc_meaning: { icon: 'book', type: '객관식', level: 1, sec: 6, ex: 'protect → ① 보호하다 ② 나누다 …' },
  mc_term: { icon: 'book', type: '객관식', level: 1, sec: 6, ex: '보호하다 → ① protect ② share …' },
  write_meaning: { icon: 'edit', type: '주관식', level: 2, sec: 10, ex: 'protect → [ 보호하다 ]' },
  write_term: { icon: 'edit', type: '주관식', level: 3, sec: 12, ex: '보호하다 → [ p_______ ]' },
  listen_term: { icon: 'volume', type: '받아쓰기', level: 3, sec: 12, ex: '발음 듣기 → [ protect ]' },
  cloze_key: { icon: 'text', type: '빈칸', level: 2, sec: 15, ex: 'Many teens [ give up ] their dreams.' },
  cloze_random: { icon: 'text', type: '빈칸', level: 3, sec: 18, ex: 'Mina [ walks ] through a small [ park ].' },
  choice: { icon: 'target', type: '객관식', level: 2, sec: 10, ex: 'She [ walks / walk ] to school.' },
  word_order: { icon: 'layers', type: '배열', level: 2, sec: 20, ex: '[ to ] [ She ] [ walks ] [ school ]' },
  sentence_order: { icon: 'arrowUpDown', type: '배열', level: 3, sec: 30, ex: '섞인 문장 ①②③ → 본문 순서로' },
  translate: { icon: 'edit', type: '영작', level: 3, sec: 35, ex: '그녀는 걸어서 등교한다 → She …' },
};
const COUNTS = [10, 20, 30, 50, 100];

// 10: 문항 수·진행 방식은 토글 버튼(한 줄 트랙 안에서 고른 칸이 떠오름)
const chips = (name, opts, value) => html`<div class="seg seg--toggle" role="radiogroup">${opts.map(([v, label, sub]) => html`
  <label class="seg__opt"><input type="radio" name="${name}" value="${v}" ${String(v) === String(value) ? 'checked' : ''}><span>${label}${sub ? html`<small>${sub}</small>` : ''}</span></label>`)}</div>`;

export async function startTest({ setIds = [], kind = 'vocab', source = 'sets', defaultMode, info, setId } = {}) {
  let modes;
  try { modes = (await getModes()).filter(m => m.kind === kind); } catch (e) { toast(e.message, 'bad'); return; }
  let form;
  const choice = await modal({
    title: source === 'wrong' ? '오답 복습 시험' : '시험 설정',
    wide: true,
    actions: [{ id: 'cancel', label: '취소' }, { id: 'start', label: '시작하기', kind: 'primary' }],
    body: el => {
      el.innerHTML = String(html`
        <form class="start" data-start-form>
          <div class="start__src">
            <span class="kind-tile kind-tile--${kind === 'passage' ? 'passage' : 'vocab'}">${icon(source === 'wrong' ? 'target' : kind === 'passage' ? 'text' : 'book', 22)}</span>
            <div><p class="start__src-title">${source === 'wrong' ? (setId ? info?.title || '이 세트 오답' : `틀렸던 ${kind === 'passage' ? '본문' : '단어'}만 모아서`) : info?.title || `${setIds.length}개 세트`}</p>
              <p class="muted">${kind === 'passage' ? '본문' : '단어'} 시험${info?.count ? ` · 학습 항목 ${info.count}개` : ''}${source === 'wrong' ? ' · 두 번 연속 맞히면 오답에서 빠져요' : ''}</p></div>
          </div>

          <fieldset class="start__step">
            <legend><b>1</b>어떤 방식으로 풀까요?</legend>
            <div class="mode-grid">${modes.map((m, i) => { const x = META[m.id] || {}; return html`
              <label class="mode-option">
                <input type="radio" name="mode" value="${m.id}" ${(defaultMode ? m.id === defaultMode : i === 0) ? 'checked' : ''}>
                <span class="mode-option__radio" aria-hidden="true"></span><span class="mode-option__icon" aria-hidden="true">${icon(x.icon || 'play', 20)}</span>
                <span class="mode-option__body">
                  <span class="mode-option__label">${m.label}</span>
                  <span class="mode-option__desc">${m.desc}</span>
                </span>
              </label>`; })}</div>
          </fieldset>

          <fieldset class="start__step">
            <legend><b>2</b>몇 문항 풀까요?</legend>
            <!-- 18(사용자 요청): 설정의 '글자·화면 크기' 와 같은 바(슬라이더) 모양. 실제 값은 숨은 count 칸 -->
            <div class="set-bar start__count">
              <div class="set-bar__head"><span><b>문항 수</b><small>세트보다 많이 고르면 세트 전체를 풀어요.</small></span><output class="set-bar__out" data-count-out>20문항</output></div>
              <input class="range" type="range" name="countIdx" min="0" max="${COUNTS.length - 1}" step="1" value="1" style="--v:${100 / (COUNTS.length - 1)}%" aria-label="문항 수" aria-valuetext="20문항">
              <div class="set-bar__ticks" aria-hidden="true">${COUNTS.map(n => html`<span>${n === 100 ? '최대' : n}</span>`)}</div>
              <input type="hidden" name="count" value="20">
            </div>
          </fieldset>

          <fieldset class="start__step">
            <legend><b>3</b>어떻게 진행할까요?</legend>
            <div class="start__pair">
              <div><p class="start__sub">순서</p>${chips('order', [['random', '섞어서', '매번 다르게'], ['sequential', '원래 순서', '세트 순서대로']], 'random')}</div>
              <div><p class="start__sub">정답 확인</p>${chips('feedback', [['instant', '문항마다 바로', '틀리면 바로 정답'], ['end', '다 풀고 나서', '실전처럼']], 'instant')}</div>
            </div>
            <div class="start__extra" data-extra></div>
          </fieldset>

          <p class="start__summary" data-summary aria-live="polite"></p>
        </form>`);
      form = $('[data-start-form]', el);
      const extra = $('[data-extra]', el), summary = $('[data-summary]', el);
      const sync = () => {
        const m = modes.find(x => x.id === form.mode.value);
        const o = m?.options || [];
        extra.innerHTML = String(html`
          ${o.includes('hint') ? html`<label class="set-toggle"><span><b>첫 글자 힌트</b><small>답의 첫 글자와 글자 수를 보여줘요</small></span><input type="checkbox" role="switch" name="hint"><i aria-hidden="true"></i></label>` : ''}
          ${o.includes('ratio') ? html`<div><p class="start__sub">빈칸 비율</p>${chips('ratio', [['0.15', '적게', '15%'], ['0.25', '보통', '25%'], ['0.4', '많이', '40%']], '0.25')}</div>` : ''}
          ${o.includes('size') ? html`<div><p class="start__sub">한 문제에 섞을 문장 수</p>${chips('size', [3, 4, 5, 6, 8].map(n => [n, `${n}문장`]), 5)}</div>` : ''}`);
        extra.hidden = !o.length;
        update();
      };
      // 요약: 고른 것 + 예상 시간 + 얻을 수 있는 최대 경험치(game.js 와 같은 식: 맞힘×10 + 완주 20 + 만점 50)
      const update = () => {
        const m = modes.find(x => x.id === form.mode.value), x = META[m?.id] || { sec: 10 };
        const n = Math.min(Number(form.count.value), info?.count || Infinity);
        const min = Math.max(1, Math.round((n * x.sec) / 60));
        const xp = n * 10 + 20 + (n >= 5 ? 50 : 0);
        summary.innerHTML = String(html`${icon('clock', 16)}<span><b>${m?.label}</b> · ${Number(form.count.value) === 100 ? '최대' : `${form.count.value}`}문항 · ${form.order.value === 'random' ? '섞어서' : '원래 순서'} · ${form.feedback.value === 'instant' ? '바로 확인' : '끝나고 확인'}</span><span class="start__eta">약 ${min}분 · 최대 <b>+${xp} XP</b></span>`);
        $$('.mode-option', el).forEach(o => o.classList.toggle('is-picked', o.querySelector('input').checked));
      };
      form.addEventListener('change', e => { if (e.target.name === 'mode') sync(); else update(); });
      form.addEventListener('input', e => {
        if (e.target.name !== 'countIdx') return;
        const r = e.target, n = COUNTS[Number(r.value)], label = n === 100 ? '최대(전부)' : `${n}문항`;
        form.count.value = n; r.style.setProperty('--v', `${(r.value / (COUNTS.length - 1)) * 100}%`);
        r.setAttribute('aria-valuetext', label); $('[data-count-out]', el).textContent = label;
        update();
      });
      form.addEventListener('submit', e => { e.preventDefault(); el.closest('.modal').querySelector('[data-action="start"]').click(); });
      sync();
    },
  });
  if (choice !== 'start' || !form) return;
  const f = new FormData(form);
  const body = {
    source: source === 'wrong' ? { type: 'wrong', ...(setId ? { set: setId } : {}) } : { type: 'sets', ids: setIds }, // setId: 그 세트 오답만(10)
    mode: f.get('mode'), count: Number(f.get('count')),
    options: { order: f.get('order'), feedback: f.get('feedback'), hint: f.get('hint') === 'on', ratio: f.get('ratio') || undefined, size: f.get('size') || undefined },
  };
  try {
    const s = await api.post('/sessions', body);
    location.hash = `#/play/${s._id}`;
  } catch (e) { toast(e.message, 'bad'); }
}
