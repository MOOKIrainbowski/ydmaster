import { api } from '../api.js';
import { state } from '../state.js';
import { html, render, on, icon, skeleton, errorBox, toast, confirmDialog, speak, $ } from '../ui.js';
import { startTest } from '../start.js';
import { mountPassageStudy } from '../passage-study.js';
import { sfx, floatText, banner, COMBO_LINES, reportQuest } from '../game.js';
import { burstAt, reduced } from '../motion.js';
import { getPref, isKey, keyOf, keyLabel } from '../prefs.js';

export default {
  title: ({ id }) => '학습 세트',
  async render(root, { id }, _query, ctx) {
    // 10(사용자 요청): 단어 세트는 들어가자마자 학습 카드. '목록 보기' 로 전환
    let set, flipped = false, flashMode = true, index = 0, wrongN = 0;
    const revealed = new Set();
    const load = async () => {
      render(root, html`<div class="page">${skeleton(4)}</div>`);
      try {
        set = await api.get(`/sets/${encodeURIComponent(id)}`);
        if (set.kind === 'vocab') resetDeck(); else flashMode = false;
        // 이 세트에서 생긴 오답 수(로그인했을 때만) → '이 세트 오답 복습' 버튼
        if (state.user) wrongN = (await api.get(`/wrong?set=${encodeURIComponent(id)}`).catch(() => ({ items: [] }))).items.length;
        if (ctx.isCurrent()) draw();
      }
      catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message)}</div>`); }
    };
    const isOwner = () => String(set?.author?._id) === String(state.user?.id || state.user?._id);
    const vocabCard = (item, i) => { const open = flashMode ? flipped : revealed.has(i); return html`<article class="card stack"><h3>${item.term}</h3><p class="muted">${open ? item.meaning : '뜻 확인을 눌러 답을 확인하세요.'}</p>
      ${item.example ? html`<p lang="en">${item.example}</p>` : ''}${open && item.exampleKo ? html`<p class="muted">${item.exampleKo}</p>` : ''}
      <div class="btn-row"><button class="btn btn--ghost" data-flip="${i}">${open ? '앞면 보기' : '뜻 확인'}</button><button class="btn btn--ghost btn--icon" data-speak="${item.term}" aria-label="발음 듣기" title="발음 듣기">${icon('volume')}</button></div></article>`; };
    // 뒤집기는 다시 그리지 않고 클래스만 바꿔야 회전이 보인다. 넘길 때는 진행 방향에서 미끄러져 들어온다.
    let slide = 0, psHost = null, psCleanup = null;
    let deck = [], pos = 0, known = new Set(), again = 0, streak = 0, done = false;
    const resetDeck = () => { deck = set.items.map((_, k) => k); pos = 0; index = 0; known = new Set(); again = 0; streak = 0; done = false; flipped = false; };
    const flashDone = () => html`<div class="flash flash-done reveal">
      <img class="flash-done__mascot" src="/brand/mascot.svg" alt="" width="140" height="140">
      <h3 class="flash-done__title">카드 ${set.items.length}장 모두 외웠어요!</h3>
      <p class="muted">${again ? `다시 본 카드 ${again}번 — 헷갈린 건 시험으로 한 번 더 확인해 봐요.` : '한 번도 틀리지 않고 전부 기억했어요. 완벽해요!'}</p>
      <div class="btn-row"><button class="btn btn--primary" data-test>${icon('play')}시험으로 확인하기</button><button class="btn btn--ghost" data-flash-reset>${icon('refresh', 18)}처음부터 다시</button></div></div>`;
    const flashCard = (item, i) => html`<div class="flash">
      <button class="flash-card is-settled${flipped ? ' is-flipped' : ''}${slide ? (slide > 0 ? ' is-in-next' : ' is-in-prev') : ''}" type="button" data-flip="${i}" aria-pressed="${flipped}" aria-label="카드 뒤집기: ${item.term}">
        <span class="flash-card__inner">
          <span class="flash-card__face flash-card__front"><span class="flash-card__tag">영어</span><span class="flash-card__term" lang="en">${item.term}</span>${item.example ? html`<span class="flash-card__ex" lang="en">${item.example}</span>` : ''}<span class="flash-card__hint">눌러서 뜻 보기</span></span>
          <span class="flash-card__face flash-card__back"><span class="flash-card__tag">뜻</span><span class="flash-card__meaning">${item.meaning}</span>${item.exampleKo ? html`<span class="flash-card__ex">${item.exampleKo}</span>` : ''}<span class="flash-card__hint">눌러서 앞면 보기</span></span>
        </span>
      </button>
      <div class="flash__nav">
        <button class="btn btn--icon btn--ghost" data-prev aria-label="이전 단어">${icon('chevronLeft')}</button>
        <div class="flash__progress"><span>외운 카드 <b>${known.size}</b> / ${set.items.length} · 남은 ${deck.length}장</span><i style="--p:${known.size / set.items.length}"></i></div>
        <button class="btn btn--icon btn--ghost" data-speak="${item.term}" aria-label="발음 듣기">${icon('volume')}</button>
        <button class="btn btn--icon btn--ghost" data-next aria-label="다음 단어">${icon('chevronRight')}</button>
      </div>
      <div class="flash__judge"><button class="btn btn--ghost" data-again>${icon('refresh', 18)}다시 볼래요</button><button class="btn btn--primary" data-know>${icon('check', 18)}알아요</button></div>
      ${getPref('keyHints') !== false && getPref('shortcuts') !== false ? html`<p class="field__hint flash__keys">${[['card.prev', '이전'], ['card.next', '다음'], ['card.flip', '뒤집기'], ['card.know', '알아요'], ['card.again', '다시 볼래요']].map(([a, l]) => html`<kbd>${keyLabel(keyOf(a))}</kbd> ${l} `)}</p>` : ''}</div>`;
    // 18(사용자 요청): 목록 보기 ↔ 학습 카드 전환도 아이콘만(다음에 볼 모양의 아이콘)
    const flashBtn = () => { const l = flashMode ? '목록 보기' : '학습 카드'; return html`<button class="btn btn--ghost btn--icon" data-flash aria-label="${l}" title="${l}">${icon(flashMode ? 'list' : 'cards')}</button>`; };
    // 11: 학습 영역만 다시 그림(페이지 전체를 다시 그리면 화면이 깜빡여 전환이 어색했음)
    const studyContent = () => {
      const items = set.items;
      return flashMode ? (done ? flashDone() : flashCard(items[index], index)) : html`<div class="stack">${items.map((item, i) => html`<div class="reveal" style="--i:${Math.min(i, 12)}">${vocabCard(item, i)}</div>`)}</div>`;
    };
    const draw = () => {
      const passage = set.kind === 'passage';
      const items = passage ? set.passage.sentences : set.items;
      render(root, html`<div class="page stack"><section class="section"><div class="section__head"><div><span class="badge">${passage ? '본문' : '단어'} · ${set.visibility === 'public' ? '공개' : set.visibility === 'friends' ? '친구' : '비공개'}</span><h1 class="section__title">${set.title}</h1></div>
        ${isOwner() ? html`<div class="icon-acts"><a class="icon-act" href="#/sets/${set._id}/edit" aria-label="세트 수정" title="세트 수정">${icon('edit', 17)}</a><button class="icon-act icon-act--bad" type="button" data-delete aria-label="세트 삭제" title="세트 삭제">${icon('trash', 17)}</button></div>` : ''}</div>
        ${set.description ? html`<p class="muted">${set.description}</p>` : ''}<div class="btn-row"><button class="btn btn--primary btn--start btn--icon" data-test aria-label="시험 보기" title="시험 보기">${icon('play', 22)}</button>${wrongN ? html`<button class="btn btn--ghost btn--icon btn--wrong" data-wrong-test aria-label="이 세트 오답 복습 (${wrongN}개)" title="이 세트 오답 복습 (${wrongN}개)">${icon('review', 22)}<span class="btn__count" aria-hidden="true">${wrongN}</span></button>` : ''}${!passage ? flashBtn() : ''}<button class="btn btn--ghost btn--icon btn--fav${set.favorited ? ' is-on' : ''}" data-favorite aria-pressed="${set.favorited ? 'true' : 'false'}" aria-label="${set.favorited ? '즐겨찾기 해제' : '즐겨찾기'}" title="${set.favorited ? '즐겨찾기 해제' : '즐겨찾기'}">${icon('star')}</button><button class="btn btn--ghost btn--icon" data-copy aria-label="내 세트로 복사" title="내 세트로 복사">${icon('copy')}</button><button class="btn btn--ghost btn--icon" data-share aria-label="공유 링크 복사" title="공유 링크 복사">${icon('link')}</button></div>
      </section><section class="section"><div class="section__head"><h2 class="section__title">${passage ? `${items.length}개 문장` : `${items.length}개 단어`}</h2></div>
        ${passage ? html`<div data-passage-study></div>` : html`<div data-study>${studyContent()}</div>`}</section></div>`);
      // 12: 본문 공부 영역은 처음 한 번만 만들고, 페이지를 다시 그려도 같은 영역(펼친 해석·분석 상태)을 끼워 넣는다
      if (passage) {
        if (!psHost) { psHost = document.createElement('div'); psHost.className = 'ps'; psCleanup = mountPassageStudy(psHost, set); }
        $('[data-passage-study]', root)?.replaceWith(psHost);
      }
    };
    // 18(사용자 요청: 누르면 화질이 낮아짐): 3D 로 돈 채로 두면 브라우저가 카드를 그림(비트맵)으로 들고 있어 글자가 흐렸다.
    // 평소에는 3D 를 끈 '멈춘' 상태(is-settled)로 그리고, 뒤집는 동안만 3D 로 돌린 뒤 다시 멈춘다.
    const flip3d = (card, on_) => {
      const inner = card.querySelector('.flash-card__inner');
      if (reduced() || !inner) { card.classList.toggle('is-flipped', on_); return; }
      inner.style.transition = 'none'; card.classList.remove('is-settled'); void inner.offsetWidth; inner.style.transition = '';
      card.classList.toggle('is-flipped', on_);
      clearTimeout(card._settleT);
      const done_ = () => { clearTimeout(card._settleT); inner.removeEventListener('transitionend', done_); card.classList.add('is-settled'); };
      inner.addEventListener('transitionend', done_); card._settleT = setTimeout(done_, 900);
    };
    const EXIT = {
      next: [{ transform: 'none', opacity: 1 }, { transform: 'translateX(-70px) rotate(-5deg)', opacity: 0 }],
      prev: [{ transform: 'none', opacity: 1 }, { transform: 'translateX(70px) rotate(5deg)', opacity: 0 }],
      know: [{ transform: 'none', opacity: 1, filter: 'none' }, { transform: 'translateY(-46px) scale(.9)', opacity: 0, filter: 'drop-shadow(0 0 18px rgb(34 197 94 / 70%))' }],
      again: [{ transform: 'none', opacity: 1 }, { transform: 'translateY(36px) scale(.88)', opacity: 0 }],
    };
    let animating = false;
    const drawStudy = () => { const el = $('[data-study]', root); el ? render(el, studyContent()) : draw(); };
    const swap = async (kind, mutate) => {
      if (animating) return;
      animating = true;
      const card = $('.flash-card', root), from = known.size / set.items.length;
      if (card && !reduced()) await card.animate(EXIT[kind], { duration: 210, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' }).finished.catch(() => {});
      mutate();
      slide = kind === 'prev' ? -1 : 1; drawStudy(); slide = 0;
      animating = false;
      const bar = $('.flash__progress i', root);
      if (bar && !done) { bar.style.setProperty('--p', from); requestAnimationFrame(() => requestAnimationFrame(() => bar.style.setProperty('--p', known.size / set.items.length))); }
      $('[data-flip]', root)?.focus({ preventScroll: true });
    };
    const turn = d => {
      if (done || !deck.length) return;
      swap(d > 0 ? 'next' : 'prev', () => { pos = (pos + d + deck.length) % deck.length; index = deck[pos]; flipped = false; });
    };
    // 학습 카드 키보드: ← → 넘기기(Space·Enter 뒤집기는 버튼 기본 동작)
    // 알아요/다시 볼래요(04 게임 요소): 연속으로 알면 콤보, 더미를 다 비우면 완료 축하
    const judge = async know => {
      if (!flashMode || done || !deck.length || animating) return;
      const card = $('.flash-card', root);
      if (know) { floatText(card, '외웠어요 +1', 'good'); sfx.correct(streak + 1); } else sfx.flip();
      await swap(know ? 'know' : 'again', () => {
        if (know) { known.add(index); deck.splice(pos, 1); streak++; } else { again++; streak = 0; deck.push(deck.splice(pos, 1)[0]); }
        if (!deck.length) { done = true; return; }
        if (pos >= deck.length) pos = 0;
        index = deck[pos]; flipped = false;
      });
      if (know && COMBO_LINES[streak]) banner(...COMBO_LINES[streak]);
      if (done) {
        sfx.levelUp();
        const m = $('.flash-done__mascot', root); if (m) setTimeout(() => burstAt(m, 34), 200);
        // 학습 카드 퀘스트(05): 서버가 볼 수 없는 활동이라 보고로 완료 — 첫걸음 + 오늘의 퀘스트(이미 받았으면 조용히 무시)
        if (state.user) setTimeout(async () => { const t = $('.flash-done__title', root); await reportQuest('first_cards', t); await reportQuest('daily_cards', t); }, 900);
      }
    };
    const onKey = e => {
      if (!flashMode || done || document.querySelector('.modal-backdrop') || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (isKey(e, 'card.next')) { e.preventDefault(); turn(1); }
      else if (isKey(e, 'card.prev')) { e.preventDefault(); turn(-1); }
      else if (isKey(e, 'card.know')) { e.preventDefault(); judge(true); }
      else if (isKey(e, 'card.again')) { e.preventDefault(); judge(false); }
      else if (isKey(e, 'card.flip') && !(e.target.closest?.('.flash-card') && (e.key === ' ' || e.key === 'Enter'))) { e.preventDefault(); $('.flash-card', root)?.click(); }
    };
    document.addEventListener('keydown', onKey);
    await load();
    const offs = [on(root, 'click', '[data-favorite]', async () => { try { const r = await api[set.favorited ? 'del' : 'post'](`/sets/${id}/favorite`); set.favorited = r.favorited; draw(); } catch (e) { toast(e.message, 'bad'); } }),
      on(root, 'click', '[data-copy]', async () => { try { const r = await api.post(`/sets/${id}/copy`); toast('내 세트에 복사했어요.', 'ok'); location.hash = `#/sets/${r._id}`; } catch (e) { toast(e.message, 'bad'); } }),
      on(root, 'click', '[data-share]', async () => { try { await navigator.clipboard.writeText(new URL(`#/sets/${id}`, location.href).href); toast('세트 링크를 복사했어요.', 'ok'); } catch { toast('이 브라우저에서는 링크를 복사할 수 없어요.', 'bad'); } }),
      on(root, 'click', '[data-wrong-test]', () => startTest({ source: 'wrong', kind: set.kind, setId: id, info: { title: `${set.title} · 오답`, count: wrongN } })),
      on(root, 'click', '[data-test]', () => startTest({ setIds: [id], kind: set.kind, info: { title: set.title, count: (set.kind === 'passage' ? set.passage?.sentences : set.items)?.length } })),
      on(root, 'click', '[data-flip]', (_e, el) => {
        const i = Number(el.dataset.flip);
        if (flashMode) { flipped = !flipped; el.classList.remove('is-in-next', 'is-in-prev'); flip3d(el, flipped); el.setAttribute('aria-pressed', String(flipped)); return; }
        revealed.has(i) ? revealed.delete(i) : revealed.add(i); draw();
      }),
      on(root, 'click', '[data-flash]', async (_e, b) => {
        const el = $('[data-study]', root);
        // 18: 사라지는 애니메이션은 fill: forwards 라 끝나도 남아 있었다 → 새 목록이 나타난 뒤 다시 투명해지던 원인. 그리고 나서 꼭 취소
        const out = el && !reduced() ? el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(10px)' }], { duration: 160, easing: 'ease-in', fill: 'forwards' }) : null;
        await out?.finished.catch(() => {});
        flashMode = !flashMode; resetDeck(); slide = 0;
        b.outerHTML = String(flashBtn());
        drawStudy(); out?.cancel();
        $('[data-study]', root)?.animate([{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      }),
      on(root, 'click', '[data-flash-reset]', () => { resetDeck(); drawStudy(); }),
      on(root, 'click', '[data-know]', () => judge(true)),
      on(root, 'click', '[data-again]', () => judge(false)),
      on(root, 'click', '[data-next]', () => turn(1)),
      on(root, 'click', '[data-prev]', () => turn(-1)),
      on(root, 'click', '[data-speak]', (_e, el) => speak(el.dataset.speak, undefined, el)), // 18: 읽는 중엔 정지 버튼
      on(root, 'click', '[data-delete]', async () => { if (!await confirmDialog('이 세트를 삭제하면 되돌릴 수 없습니다.', { danger: true, ok: '세트 삭제' })) return; try { await api.del(`/sets/${id}`); toast('세트를 삭제했어요.', 'ok'); location.hash = '#/explore?scope=mine'; } catch (e) { toast(e.message, 'bad'); } })];
    return () => { offs.forEach(fn => fn()); document.removeEventListener('keydown', onKey); psCleanup?.(); };
  },
};
