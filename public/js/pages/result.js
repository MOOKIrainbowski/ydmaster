// 결과 화면 — 서버가 채점한 결과와 문항별 내 답/정답(계약 §2.3 GET /results/:id).
import { api } from '../api.js';
import { html, render, icon, on, $$, fmtDuration, fmtDate } from '../ui.js';
import { startTest } from '../start.js';
import { burst, reduced } from '../motion.js';

// 점수 링: 원둘레 2πr(r=78) 중 점수 비율만큼 그라데이션 획을 그린다(02 §3.5)
const RING_C = 2 * Math.PI * 78;
const scoreRing = pct => html`
  <div class="score-ring" role="img" aria-label="${pct}점">
    <svg viewBox="0 0 180 180" aria-hidden="true">
      <defs><linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E11D48"/><stop offset=".5" stop-color="#C026D3"/><stop offset="1" stop-color="#7C3AED"/></linearGradient></defs>
      <circle class="score-ring__track" cx="90" cy="90" r="78"/>
      <circle class="score-ring__bar" cx="90" cy="90" r="78" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}" data-target="${RING_C * (1 - pct / 100)}"/>
    </svg>
    <div class="score-ring__label"><span class="score-ring__num" data-count="${pct}">0</span><span>점</span></div>
  </div>`;

export default {
  title: '시험 결과',
  async render(root, { id }, query, ctx) {
    const r = await api.get(`/results/${id}`);
    if (!ctx.isCurrent()) return;
    const qs = r.questions || [];
    const wrongCount = qs.filter(x => !x.correct).length;
    const grade = r.percentage >= 90 ? '훌륭해요' : r.percentage >= 70 ? '잘했어요' : r.percentage >= 40 ? '조금만 더' : '다시 도전해요';

    render(root, html`
      <div class="page page--narrow">
        <section class="card result-summary result-hero reveal">
          <p class="result-summary__mode">${r.modeLabel} · ${r.title}</p>
          ${scoreRing(r.percentage)}
          <p class="result-summary__grade">${grade}</p>
          <dl class="stat-row">
            <div><dt>맞힘</dt><dd>${r.correct} / ${r.total}</dd></div>
            <div><dt>걸린 시간</dt><dd>${fmtDuration(r.timeTaken)}</dd></div>
            <div><dt>날짜</dt><dd>${fmtDate(r.createdAt)}</dd></div>
          </dl>
          <div class="btn-row">
            ${r.setIds?.length && r.mode !== 'legacy' ? html`<button class="btn btn--primary" data-again>${icon('refresh', 18)}다시 풀기</button>` : ''}
            ${wrongCount ? html`<button class="btn btn--ghost" data-review>${icon('target', 18)}오답 복습</button>` : ''}
            ${r.setIds?.length === 1 ? html`<a class="btn btn--ghost" href="#/sets/${r.setIds[0]}">세트로 가기</a>` : ''}
          </div>
        </section>

        ${qs.length ? html`
          <section class="section">
            <div class="section__head">
              <h2 class="section__title">문항별 결과</h2>
              <div class="tabs" role="tablist">
                <button class="tabs__tab is-active" role="tab" aria-selected="true" data-filter="all">전체 ${qs.length}</button>
                <button class="tabs__tab" role="tab" aria-selected="false" data-filter="wrong">틀린 것 ${wrongCount}</button>
              </div>
            </div>
            <ol class="review-list">${qs.map((x, k) => reviewItem(x, k))}</ol>
          </section>` : html`<p class="muted">이전 방식 시험이라 문항별 기록이 없어요.</p>`}
      </div>`);

    // 링 채우기 + 높은 점수 축하(실제 점수 기준, D6)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const bar = root.querySelector('.score-ring__bar');
      if (bar) bar.style.strokeDashoffset = bar.dataset.target;
    }));
    let party;
    if (r.percentage >= 80 && !reduced()) {
      party = setTimeout(() => {
        const ring = root.querySelector('.score-ring');
        if (!ring) return;
        const b = ring.getBoundingClientRect();
        [0, 180, 360].forEach((d, k) => setTimeout(() => burst(b.left + b.width * (0.2 + 0.3 * k), b.top + b.height * 0.4, 22), d));
      }, 700);
    }

    const offs = [
      on(root, 'click', '[data-again]', () => startTest({ setIds: r.setIds, kind: r.kind, defaultMode: r.mode })),
      on(root, 'click', '[data-review]', () => startTest({ source: 'wrong', kind: r.kind, defaultMode: r.mode })),
      on(root, 'click', '[data-filter]', (e, b) => {
        $$('[data-filter]', root).forEach(t => { t.classList.toggle('is-active', t === b); t.setAttribute('aria-selected', String(t === b)); });
        $$('.review-item', root).forEach(li => { li.hidden = b.dataset.filter === 'wrong' && li.classList.contains('is-ok'); });
      }),
    ];
    return () => { clearTimeout(party); offs.forEach(f => f()); };
  },
};

// 문항 하나 요약: 문제 · 내 답 · 정답
function reviewItem(x, k) {
  const { q, response: res, expected: exp } = x;
  let prompt, mine, answer;
  const none = html`<span class="muted">(답하지 않음)</span>`;
  if (q.type === 'choice') {
    prompt = q.prompt.text; mine = res >= 0 && res !== null ? q.choices[res] : none; answer = exp;
  } else if (q.type === 'text') {
    prompt = q.prompt.text; mine = res ? res : none; answer = exp;
  } else if (q.type === 'cloze') {
    let b = 0;
    prompt = html`${q.segments.map(s => typeof s === 'string' ? s : html`<mark class="${x.detail?.each?.[b] ? 'is-ok' : 'is-bad'}">${exp[b++]}</mark>`)}`;
    mine = Array.isArray(res) && res.some(Boolean) ? res.map(v => v || '—').join(' / ') : none; answer = exp.join(' / ');
  } else if (q.type === 'inline_choice') {
    prompt = x.detail?.sentence || '';
    mine = Array.isArray(res) ? res.map((v, i) => q.segments.find(s => s.choice === i)?.options[v] ?? '—').join(' / ') : none;
    answer = exp.join(' / ');
  } else if (q.type === 'order') {
    const sep = q.layout === 'stack' ? '\n' : ' ';
    prompt = q.prompt.text; mine = Array.isArray(res) ? res.map(i => q.pieces[i]).join(sep) : none; answer = exp.join(sep);
  }
  return html`
    <li class="review-item ${x.correct ? 'is-ok' : 'is-bad'} reveal" style="--i:${Math.min(k, 12)}">
      <div class="review-item__head">${icon(x.correct ? 'check' : 'x', 18)}<span class="sr-only">${x.correct ? '정답' : '오답'}</span><span class="review-item__num">${k + 1}</span>
        <p class="review-item__prompt" lang="${q.prompt?.lang === 'en' || q.type === 'cloze' || q.type === 'inline_choice' ? 'en' : 'ko'}">${prompt}</p></div>
      ${x.correct ? '' : html`<dl class="review-item__answers">
        <div><dt>내 답</dt><dd class="pre-line" lang="en">${mine}</dd></div>
        <div><dt>정답</dt><dd class="pre-line" lang="en">${answer}</dd></div>
        ${x.detail?.diff ? html`<div><dt>비교</dt><dd class="diff">${x.detail.diff.map(d => html`<span class="diff__${d.op}">${d.t}</span> `)}</dd></div>` : ''}
      </dl>`}
    </li>`;
}
