// 시험 화면 — 서버 세션을 한 문항씩 풀고, 채점은 서버가 한다(R5). 문항 형태는 계약 §3 (choice/text/cloze/inline_choice/order).
// 한 화면 한 과제(디자인 §3-1): 문항 → 확인 → 피드백 패널 → 다음.
import { api } from '../api.js';
import { html, render, icon, on, $, $$, toast, confirmDialog, busy, errorBox, speak } from '../ui.js';
import { burstAt, shake, pop } from '../motion.js';
import { sfx, sfxOn, setSfx, floatText, banner, COMBO_LINES } from '../game.js';
import { getPref, isKey, zoomOf } from '../prefs.js';
import { loaderView } from '../loader.js';

export default {
  title: '시험',
  focus: true, // 상단바·탭바 숨김
  async render(root, { id }, query, ctx) {
    render(root, html`<div class="play"><p class="muted">시험을 불러오는 중…</p></div>`);
    const s = await api.get(`/sessions/${id}`);
    if (!ctx.isCurrent()) return;
    if (s.status !== 'active' && s.result) { location.replace(`#/result/${s.result}`); return; }

    const answers = new Map(s.answers.map(a => [a.i, a]));
    let i = s.questions.findIndex(q => !answers.has(q.i));
    if (i < 0) i = s.questions.length; // 다 풀었으면 바로 종료 처리
    let phase = 'answer'; // answer | feedback | finishing
    let draft = null;     // 현재 문항의 입력 상태(order 조각 순서, inline 선택 등)
    const instant = s.options?.feedback !== 'end';
    // 연속 정답(콤보, 02 D6): 이어 풀기여도 이미 푼 답에서 다시 계산 — 실제 채점 결과만 쓴다
    let combo = 0;
    for (const q of s.questions) { const a = answers.get(q.i); if (!a) break; combo = a.correct ? combo + 1 : 0; }
    let shownProgress = Math.max(0, i - 1) / s.total;
    // 04 게임 연출: 이번 시험에서 쌓는 경험치(표시용 — 실제 경험치는 서버가 결과에서 계산), 절반 응원은 한 번만
    let runXp = s.answers.filter(a => a.correct).length * 10;
    let halfCheered = i >= Math.ceil(s.total / 2);
    const sfxBtn = () => html`<button class="btn btn--icon btn--ghost play__sfx" data-sfx aria-pressed="${sfxOn()}" aria-label="효과음 ${sfxOn() ? '끄기' : '켜기'}">${icon(sfxOn() ? 'volume' : 'volumeOff', 20)}</button>`;
    const comboBadge = () => combo >= 2 ? html`<span class="combo" data-combo>${icon('flame', 16)}<b>${combo}</b>연속</span>` : '';

    const view = () => {
      if (i >= s.questions.length) return finish();
      const q = s.questions[i];
      phase = 'answer';
      draft = q.type === 'order' ? (q.layout === 'stack' ? q.pieces.map((_, k) => k) : []) : q.type === 'inline_choice' ? [] : null;
      render(root, html`
        <div class="play">
          <header class="play__bar">
            <button class="btn btn--icon btn--ghost" data-quit aria-label="시험 그만두기">${icon('x', 22)}</button>
            <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${s.total}" aria-valuenow="${i}" aria-label="진행률">
              <div class="progress__bar" style="width:${shownProgress * 100}%"></div>
            </div>
            <span class="play__combo" data-combo-slot>${comboBadge()}</span>
            <span class="play__xp" data-xp aria-label="이번 시험 경험치">${icon('star', 14)}<b>${runXp}</b> XP</span>
            ${sfxBtn()}
            <span class="play__count">${i + 1} / ${s.total}</span>
          </header>
          <section class="play__body" aria-live="polite"><div class="play__card reveal" data-qcard>${question(q)}</div></section>
          <footer class="play__foot" data-foot>${actions(q)}</footer>
        </div>`);
      if (q.speak) speak(q.speak);
      else if (getPref('autoSpeak') && q.prompt?.lang === 'en') speak(q.prompt.text); // 설정: 영어 문제 자동 읽기(06)
      if (!halfCheered && s.total >= 6 && i === Math.ceil(s.total / 2)) { halfCheered = true; banner('절반 왔어요!', `남은 문항 ${s.total - i}개 — 조금만 더`, 'half'); }
      ($('.blank, .play__input', root) || $('.choice', root))?.focus();
      // 진행바는 이전 위치에서 새 위치로 스프링처럼 차오른다(02 §3.4)
      shownProgress = i / s.total;
      requestAnimationFrame(() => { const b = $('.progress__bar', root); if (b) b.style.width = `${shownProgress * 100}%`; });
    };

    // ── 문항 렌더 ──
    const promptBlock = q => html`
      <div class="prompt">
        <p class="prompt__text${q.prompt.lang === 'en' ? ' prompt__text--en' : ''}" lang="${q.prompt.lang || 'ko'}">${q.prompt.text}
          ${q.prompt.lang === 'en' || q.speak ? html`<button class="btn btn--icon btn--ghost" data-speak="${q.speak || q.prompt.text}" aria-label="발음 듣기">${icon('volume', 20)}</button>` : ''}</p>
        ${q.prompt.sub ? html`<p class="prompt__sub">${q.prompt.sub}</p>` : ''}
      </div>`;

    function question(q) {
      if (q.type === 'choice') return html`${promptBlock(q)}
        <div class="choices" role="group" aria-label="보기">${q.choices.map((c, k) => html`
          <button class="choice" data-choice="${k}"><span class="choice__num">${k + 1}</span><span class="choice__text">${c}</span></button>`)}</div>`;
      if (q.type === 'text') {
        const h = q.hint || {};
        const hintText = h.first ? `${h.first}로 시작, ${h.length}글자` : h.words ? `${h.words}단어` : h.length ? `${h.length}글자` : '';
        return html`${promptBlock(q)}
          <label class="field">
            <span class="sr-only">답 입력</span>
            ${q.multiline
              ? html`<textarea class="input play__input" rows="3" lang="en" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="영어 문장을 쓰세요"></textarea>`
              : html`<input class="input play__input" lang="${q.answerLang || 'en'}" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="${q.answerLang === 'ko' ? '뜻을 쓰세요' : '영어로 쓰세요'}">`}
            ${hintText ? html`<span class="field__hint">${icon('lightbulb', 16)} ${hintText}</span>` : ''}
          </label>`;
      }
      if (q.type === 'cloze') return html`
        <p class="prompt__task">빈칸에 들어갈 표현을 쓰세요</p>
        <p class="passage" lang="en">${q.segments.map(seg => typeof seg === 'string' ? seg
          : html`<input class="blank" data-blank="${seg.blank}" style="--w:${Math.max(4, Math.min(20, seg.length + 1))}ch" aria-label="빈칸 ${seg.blank + 1}" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="${seg.hint ? seg.hint + '…' : ''}">`)}</p>
        ${q.ko ? html`<p class="passage-ko">${q.ko}</p>` : ''}`;
      if (q.type === 'inline_choice') return html`
        <p class="prompt__task">괄호 안에서 어법·어휘상 알맞은 것을 고르세요</p>
        <p class="passage" lang="en">${q.segments.map(seg => typeof seg === 'string' ? seg
          : html`<span class="inline-choice" role="radiogroup" aria-label="선택 ${seg.choice + 1}">${seg.options.map((o, k) => html`<button class="inline-choice__opt" role="radio" aria-checked="false" data-ic="${seg.choice}" data-opt="${k}">${o}</button>`)}</span>`)}</p>
        ${q.ko ? html`<p class="passage-ko">${q.ko}</p>` : ''}`;
      if (q.type === 'order') return html`${promptBlock(q)}<div data-order>${orderView(q)}</div>`;
      return html`<p>지원하지 않는 문항이에요.</p>`;
    }

    function orderView(q) {
      if (q.layout === 'stack') return html`<ol class="order-list">${draft.map((k, pos) => html`
        <li class="order-card" data-k="${k}"><span class="order-card__grip" title="끌어서 옮기기">${icon('grip', 20)}</span><span class="order-card__num">${pos + 1}</span><span class="order-card__text" lang="en">${q.pieces[k]}</span>
          <span class="order-card__move">
            <button class="btn btn--icon btn--ghost" data-move="${pos}" data-dir="-1" ${pos === 0 ? 'disabled' : ''} aria-label="위로">${icon('chevronUp', 20)}</button>
            <button class="btn btn--icon btn--ghost" data-move="${pos}" data-dir="1" ${pos === draft.length - 1 ? 'disabled' : ''} aria-label="아래로">${icon('chevronDown', 20)}</button>
          </span></li>`)}</ol>`;
      const used = new Set(draft);
      return html`
        <div class="chip-line" aria-label="내 답">${draft.length ? draft.map((k, pos) => html`<button class="chip chip--placed" data-unplace="${pos}" lang="en">${q.pieces[k]}</button>`) : html`<span class="muted">아래 조각을 순서대로 누르세요</span>`}</div>
        <div class="chip-pool" aria-label="조각">${q.pieces.map((p, k) => html`<button class="chip" data-place="${k}" lang="en" ${used.has(k) ? 'disabled' : ''}>${p}</button>`)}</div>`;
    }

    const actions = q => q.type === 'choice' ? html`<button class="btn btn--ghost" data-skip>모르겠어요</button>`
      : html`<button class="btn btn--ghost" data-skip>모르겠어요</button><button class="btn btn--primary" data-submit>확인</button>`;

    // ── 응답 수집 ──
    function collect(q) {
      if (q.type === 'text') return $('.play__input', root).value;
      if (q.type === 'cloze') return $$('.blank', root).sort((a, b) => a.dataset.blank - b.dataset.blank).map(x => x.value);
      if (q.type === 'inline_choice') {
        const n = q.segments.filter(x => typeof x !== 'string').length;
        if (draft.filter(x => x !== undefined).length < n) { toast('모든 괄호에서 하나씩 골라주세요.', 'info'); return undefined; }
        return draft;
      }
      if (q.type === 'order') {
        if (draft.length < q.pieces.length) { toast('조각을 모두 배열해주세요.', 'info'); return undefined; }
        return draft;
      }
    }
    // "모르겠어요" = 형식에 맞는 빈 답(서버가 오답 처리)
    function skipResponse(q) {
      if (q.type === 'choice') return -1;
      if (q.type === 'text') return '';
      if (q.type === 'cloze') return q.segments.filter(x => typeof x !== 'string').map(() => '');
      if (q.type === 'inline_choice') return q.segments.filter(x => typeof x !== 'string').map(() => -1);
      if (q.type === 'order') return q.pieces.map((_, k) => k);
    }

    async function submit(response, btn) {
      if (phase !== 'answer' || response === undefined) return;
      const q = s.questions[i];
      phase = 'sending';
      const run = async () => {
        try {
          const r = await api.post(`/sessions/${s._id}/answers`, { i: q.i, response });
          if (!ctx.isCurrent()) return;
          answers.set(q.i, r);
          if (!instant || r.saved) { i++; view(); return; }
          showFeedback(q, response, r);
        } catch (e) {
          phase = 'answer';
          toast(e.message, 'bad');
        }
      };
      btn ? await busy(btn, run) : await run();
    }

    function showFeedback(q, response, r) {
      phase = 'feedback';
      combo = r.correct ? combo + 1 : 0;
      const slot = $('[data-combo-slot]', root);
      if (slot) { render(slot, comboBadge()); if (combo >= 2) pop($('[data-combo]', slot)); }
      // 문항 안에 정오 표시(색 + 아이콘 + 문구, 디자인 §3-8)
      if (q.type === 'choice') {
        $$('.choice', root).forEach((b, k) => {
          b.disabled = true;
          b.classList.add(k === q.choices.indexOf(r.expected) ? 'is-ok' : k === response ? 'is-bad' : 'is-dim');
        });
      }
      if (q.type === 'cloze') $$('.blank', root).forEach(b => { b.readOnly = true; b.classList.add(r.detail?.each?.[b.dataset.blank] ? 'is-ok' : 'is-bad'); });
      if (q.type === 'inline_choice') $$('.inline-choice__opt', root).forEach(b => {
        b.disabled = true;
        const k = Number(b.dataset.ic), opt = q.segments.find(x => x.choice === k).options[b.dataset.opt];
        if (opt === r.expected[k]) b.classList.add('is-ok'); else if (Number(b.dataset.opt) === draft[k]) b.classList.add('is-bad');
      });
      if (q.type === 'text') $('.play__input', root).readOnly = true;
      $$('[data-place], [data-unplace], [data-move]', root).forEach(b => { b.disabled = true; });

      const exp = Array.isArray(r.expected) ? (q.type === 'order' ? r.expected.join(q.layout === 'stack' ? '\n' : ' ') : r.expected.join(' / ')) : r.expected;
      const last = i + 1 >= s.total;
      render($('[data-foot]', root), html`
        <div class="feedback ${r.correct ? 'feedback--ok' : 'feedback--bad'}" role="alert">
          <div class="feedback__head">${icon(r.correct ? 'check' : 'x', 24)}<strong>${r.correct ? '정답이에요' : r.score > 0 ? `부분 정답 (${Math.round(r.score * 100)}%)` : '틀렸어요'}</strong></div>
          ${!r.correct ? html`<p class="feedback__answer"><span class="feedback__label">정답</span> <span lang="en" class="pre-line">${exp}</span></p>` : ''}
          ${r.detail?.diff && !r.correct ? html`<p class="diff" lang="en">${r.detail.diff.map(d => html`<span class="diff__${d.op}">${d.t}</span> `)}</p>` : ''}
          <button class="btn btn--primary btn--block" data-next>${last ? '결과 보기' : '다음 문제'} ${icon('chevronRight', 18)}</button>
        </div>`);
      $('[data-next]', root).focus();
      // 정답 위치(객관식은 정답 보기, 그 외엔 피드백 아이콘)에서 파티클, 오답은 문항 카드 흔들림
      if (r.correct) {
        runXp += 10;
        const xpEl = $('[data-xp] b', root);
        if (xpEl) { xpEl.textContent = runXp; pop(xpEl.parentElement); }
        floatText($('.choice.is-ok', root) || $('[data-qcard]', root), '+10 XP');
        sfx.correct(combo);
        if (COMBO_LINES[combo]) { banner(...COMBO_LINES[combo]); setTimeout(sfx.combo, 120); }
        const target = $('.choice.is-ok', root) || $('.feedback__head .icon', root);
        pop($('.choice.is-ok', root) || $('.feedback', root));
        if (target) burstAt(target, combo >= 3 ? 26 : 16);
      } else { shake($('[data-qcard]', root)); sfx.wrong(); }
    }

    async function finish() {
      if (phase === 'finishing') return;
      phase = 'finishing';
      render(root, html`<div class="play">${loaderView('영이가 채점하는 중…')}</div>`);
      try {
        const r = await api.post(`/sessions/${s._id}/finish`);
        sfx.finish();
        if (ctx.isCurrent()) location.replace(`#/result/${r._id}?fresh=1`); // fresh: 결과 화면이 레벨 업·업적 축하를 한 번만
      } catch (e) {
        phase = 'answer';
        render(root, html`<div class="play">${errorBox(e.message, 'data-finish')}</div>`);
      }
    }

    // ── 이벤트(위임) ──
    const offs = [
      on(root, 'click', '[data-choice]', (e, b) => submit(Number(b.dataset.choice))),
      on(root, 'click', '[data-submit]', (e, b) => submit(collect(s.questions[i]), b)),
      on(root, 'click', '[data-skip]', (e, b) => { sfx.skip(); submit(skipResponse(s.questions[i]), b); }),
      on(root, 'click', '[data-next]', () => { i++; view(); }),
      on(root, 'click', '[data-finish]', () => finish()),
      on(root, 'click', '[data-sfx]', (e, b) => { setSfx(!sfxOn()); b.outerHTML = String(sfxBtn()); if (sfxOn()) sfx.flip(); }),
      on(root, 'click', '[data-speak]', (e, b) => { if (!speak(b.dataset.speak, undefined, b)) toast('이 브라우저는 발음 듣기를 지원하지 않아요.', 'info'); }),
      on(root, 'click', '[data-quit]', async () => {
        if (await confirmDialog('지금 끝내면 안 푼 문항은 틀린 것으로 채점돼요.', { title: '시험을 끝낼까요?', ok: '끝내고 결과 보기' })) finish();
      }),
      on(root, 'click', '[data-ic]', (e, b) => {
        if (phase !== 'answer') return;
        const k = Number(b.dataset.ic);
        draft[k] = Number(b.dataset.opt);
        $$(`[data-ic="${k}"]`, root).forEach(x => x.setAttribute('aria-checked', String(x === b)));
      }),
      on(root, 'click', '[data-place]', (e, b) => { draft.push(Number(b.dataset.place)); sfx.place(); refreshOrder(); }),
      on(root, 'click', '[data-unplace]', (e, b) => { draft.splice(Number(b.dataset.unplace), 1); sfx.unplace(); refreshOrder(); }),
      on(root, 'click', '[data-move]', (e, b) => {
        const p = Number(b.dataset.move), t = p + Number(b.dataset.dir);
        [draft[p], draft[t]] = [draft[t], draft[p]]; sfx.tick();
        refreshOrder();
        $$('[data-move]', root).find(x => Number(x.dataset.move) === t && x.dataset.dir === b.dataset.dir && !x.disabled)?.focus();
      }),
    ];
    function refreshOrder() { render($('[data-order]', root), orderView(s.questions[i])); }

    // 15: 문장 순서 카드를 끌어서 옮기기(사용자 요청). 마우스는 카드 어디든, 터치는 손잡이(⋮⋮)만 —
    // 카드 전체를 터치 드래그로 잡으면 긴 본문에서 화면을 스크롤할 수 없어서. 위/아래 버튼은 키보드·보조기기용으로 남김.
    let drag = null;
    const onDown = e => {
      const card = e.target.closest('.order-card');
      if (!card || phase !== 'answer' || e.button > 0 || e.target.closest('button')) return;
      if (e.pointerType !== 'mouse' && !e.target.closest('.order-card__grip')) return;
      e.preventDefault();
      drag = { card, list: card.parentElement, y0: e.clientY, moved: false };
      card.setPointerCapture(e.pointerId);
      card.classList.add('is-drag');
    };
    const onMove = e => {
      if (!drag) return;
      const { card, list } = drag;
      drag.moved = true;
      // 포인터가 이웃 카드의 가운데를 넘으면 자리를 바꾸고, DOM 이 움직인 만큼 기준점을 옮겨 카드가 포인터 밑에 붙어 있게
      const top = card.getBoundingClientRect().top;
      const half = el => { const b = el.getBoundingClientRect(); return b.top + b.height / 2; };
      const prev = card.previousElementSibling, next = card.nextElementSibling;
      let moved = false;
      if (prev && e.clientY < half(prev)) { list.insertBefore(card, prev); moved = true; }
      else if (next && e.clientY > half(next)) { list.insertBefore(next, card); moved = true; }
      if (moved) { drag.y0 += card.getBoundingClientRect().top - top; sfx.tick(); }
      card.style.translate = `0 ${(e.clientY - drag.y0) / zoomOf()}px`; // 14: 화면 px → CSS px
    };
    const onUp = () => {
      if (!drag) return;
      const { list, moved } = drag;
      drag = null;
      if (moved) { draft = [...list.children].map(li => Number(li.dataset.k)); sfx.drop(); }
      refreshOrder();
    };
    const ptr = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['pointercancel', onUp]];
    ptr.forEach(([t, f]) => root.addEventListener(t, f));

    // 키보드(11: 설정의 단축키를 따름) — 숫자 1~5 보기, 확인/다음, 모르겠어요, 발음, 그만두기
    // 글자 키 단축키는 답을 쓰는 중에는 쓰지 않는다(타자와 겹치지 않게). 쓰는 칸의 Enter 는 항상 확인.
    const onKey = e => {
      if (document.querySelector('.modal-backdrop') || e.isComposing) return;
      const q = s.questions[i];
      if (!q) return;
      const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      const letter = e.key.length === 1;
      const submitKey = (typing && e.key === 'Enter' && !e.shiftKey) || (isKey(e, 'quiz.submit') && !(typing && letter));
      if (phase === 'answer' && q.type === 'choice' && /^[1-5]$/.test(e.key) && !typing && getPref('shortcuts') !== false && getPref('choiceNumbers') !== false) {
        const b = $(`[data-choice="${Number(e.key) - 1}"]`, root);
        if (b) { e.preventDefault(); b.click(); }
      } else if (submitKey) {
        if (phase === 'feedback') { e.preventDefault(); $('[data-next]', root)?.click(); }
        else if (phase === 'answer' && q.type !== 'choice' && (typing || q.type !== 'text')) {
          // 빈칸이 여러 개면 다음 빈칸으로, 마지막에서 제출
          const blanks = $$('.blank', root), at = blanks.indexOf(e.target);
          e.preventDefault();
          if (at >= 0 && at < blanks.length - 1) blanks[at + 1].focus();
          else $('[data-submit]', root)?.click();
        }
      } else if (typing && letter) {
        return;
      } else if (isKey(e, 'quiz.quit')) { e.preventDefault(); $('[data-quit]', root)?.click(); }
      else if (phase === 'answer' && isKey(e, 'quiz.skip')) { e.preventDefault(); $('[data-skip]', root)?.click(); }
      else if (isKey(e, 'quiz.speak')) { const b = $('[data-speak]', root); if (b) { e.preventDefault(); b.click(); } }
    };
    document.addEventListener('keydown', onKey);

    view();
    return () => { offs.forEach(f => f()); ptr.forEach(([t, f]) => root.removeEventListener(t, f)); document.removeEventListener('keydown', onKey); if ('speechSynthesis' in window) speechSynthesis.cancel(); };
  },
};
