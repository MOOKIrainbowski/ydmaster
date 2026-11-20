import { api } from '../api.js';
import { state } from '../state.js';
import { html, render, on, icon, skeleton, errorBox, toast, confirmDialog, speak, $ } from '../ui.js';
import { parseSentence } from '../shared/passage.js';
import { startTest } from '../start.js';

export default {
  title: ({ id }) => '학습 세트',
  async render(root, { id }, _query, ctx) {
    let set, flipped = false, flashMode = false, index = 0, showKo = false;
    const revealed = new Set();
    const load = async () => {
      render(root, html`<div class="page">${skeleton(4)}</div>`);
      try { set = await api.get(`/sets/${encodeURIComponent(id)}`); if (ctx.isCurrent()) draw(); }
      catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message)}</div>`); }
    };
    const isOwner = () => String(set?.author?._id) === String(state.user?.id || state.user?._id);
    const vocabCard = (item, i) => { const open = flashMode ? flipped : revealed.has(i); return html`<article class="card stack"><h3>${item.term}</h3><p class="muted">${open ? item.meaning : '뜻 확인을 눌러 답을 확인하세요.'}</p>
      ${item.example ? html`<p lang="en">${item.example}</p>` : ''}${open && item.exampleKo ? html`<p class="muted">${item.exampleKo}</p>` : ''}
      <div class="btn-row"><button class="btn btn--ghost" data-flip="${i}">${open ? '앞면 보기' : '뜻 확인'}</button><button class="btn btn--ghost" data-speak="${item.term}">${icon('volume')}발음</button></div></article>`; };
    // 뒤집기는 다시 그리지 않고 클래스만 바꿔야 회전이 보인다. 넘길 때는 진행 방향에서 미끄러져 들어온다.
    let slide = 0;
    const flashCard = (item, i) => html`<div class="flash">
      <button class="flash-card${flipped ? ' is-flipped' : ''}${slide ? (slide > 0 ? ' is-in-next' : ' is-in-prev') : ''}" type="button" data-flip="${i}" aria-pressed="${flipped}" aria-label="카드 뒤집기: ${item.term}">
        <span class="flash-card__inner">
          <span class="flash-card__face flash-card__front"><span class="flash-card__tag">영어</span><span class="flash-card__term" lang="en">${item.term}</span>${item.example ? html`<span class="flash-card__ex" lang="en">${item.example}</span>` : ''}<span class="flash-card__hint">눌러서 뜻 보기</span></span>
          <span class="flash-card__face flash-card__back"><span class="flash-card__tag">뜻</span><span class="flash-card__meaning">${item.meaning}</span>${item.exampleKo ? html`<span class="flash-card__ex">${item.exampleKo}</span>` : ''}<span class="flash-card__hint">눌러서 앞면 보기</span></span>
        </span>
      </button>
      <div class="flash__nav">
        <button class="btn btn--icon btn--ghost" data-prev aria-label="이전 단어">${icon('chevronLeft')}</button>
        <div class="flash__progress"><span>${i + 1} / ${set.items.length}</span><i style="--p:${(i + 1) / set.items.length}"></i></div>
        <button class="btn btn--icon btn--ghost" data-speak="${item.term}" aria-label="발음 듣기">${icon('volume')}</button>
        <button class="btn btn--icon btn--ghost" data-next aria-label="다음 단어">${icon('chevronRight')}</button>
      </div>
      <p class="field__hint flash__keys">← → 넘기기 · Space 뒤집기</p></div>`;
    const draw = () => {
      const passage = set.kind === 'passage';
      const items = passage ? set.passage.sentences : set.items;
      const inline = tokens => {
        const out = [];
        for (let i = 0; i < tokens.length;) {
          const t = tokens[i];
          if (t.kind === 'choice') { out.push(html`<span class="badge">${t.options.join(' / ')}</span>`); i++; continue; }
          if (t.key === undefined) { out.push(html`<span>${t.text}</span>`); i++; continue; }
          const key = t.key, words = [];
          while (i < tokens.length && (tokens[i].key === key || tokens[i].kind === 'space' && tokens[i + 1]?.key === key)) words.push(tokens[i++].text);
          out.push(html`<mark class="key">${words.join('')}</mark>`);
        }
        return out;
      };
      const passageText = passage ? html`<p class="passage passage--reading" lang="en">${set.passage.sentences.map((s, i) => html`<span class="passage__sentence"><sup class="passage__num">${i + 1}</sup>${inline(parseSentence(s.en).tokens)}${showKo && s.ko ? html` <span class="passage-ko">${s.ko}</span>` : ''} </span>`)}</p>` : '';
      render(root, html`<div class="page stack"><section class="section"><div class="section__head"><div><span class="badge">${passage ? '본문' : '단어'} · ${set.visibility === 'public' ? '공개' : set.visibility === 'friends' ? '친구' : '비공개'}</span><h1 class="section__title">${set.title}</h1></div>
        ${isOwner() ? html`<div class="btn-row"><a class="btn btn--ghost btn--sm" href="#/sets/${set._id}/edit">수정</a><button class="btn btn--ghost btn--sm set-delete" data-delete>삭제</button></div>` : ''}</div>
        ${set.description ? html`<p class="muted">${set.description}</p>` : ''}<div class="btn-row"><button class="btn btn--primary" data-test>${icon('play')}시험 보기</button>${!passage ? html`<button class="btn btn--ghost" data-flash>${flashMode ? '목록 보기' : '학습 카드'}</button>` : html`<button class="btn btn--ghost" data-translation>${showKo ? '해석 숨기기' : '해석 보기'}</button>`}<button class="btn btn--ghost" data-favorite>${icon('star')} ${set.favorited ? '즐겨찾기 해제' : '즐겨찾기'}</button><button class="btn btn--ghost" data-copy>${icon('copy')}내 세트로 복사</button><button class="btn btn--ghost" data-share>${icon('link')}공유</button></div>
      </section><section class="section"><div class="section__head"><h2 class="section__title">${passage ? `${items.length}개 문장` : `${items.length}개 단어`}</h2></div>
        ${passage ? passageText : flashMode ? flashCard(items[index], index) : html`<div class="stack">${items.map((item, i) => vocabCard(item, i))}</div>`}</section></div>`);
    };
    const turn = d => {
      index = (index + d + set.items.length) % set.items.length; flipped = false; slide = d; draw(); slide = 0;
      $('[data-flip]', root)?.focus({ preventScroll: true });
    };
    // 학습 카드 키보드: ← → 넘기기(Space·Enter 뒤집기는 버튼 기본 동작)
    const onKey = e => {
      if (!flashMode || document.querySelector('.modal-backdrop') || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); turn(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); turn(-1); }
    };
    document.addEventListener('keydown', onKey);
    await load();
    const offs = [on(root, 'click', '[data-favorite]', async () => { try { const r = await api[set.favorited ? 'del' : 'post'](`/sets/${id}/favorite`); set.favorited = r.favorited; draw(); } catch (e) { toast(e.message, 'bad'); } }),
      on(root, 'click', '[data-copy]', async () => { try { const r = await api.post(`/sets/${id}/copy`); toast('내 세트에 복사했어요.', 'ok'); location.hash = `#/sets/${r._id}`; } catch (e) { toast(e.message, 'bad'); } }),
      on(root, 'click', '[data-share]', async () => { try { await navigator.clipboard.writeText(new URL(`#/sets/${id}`, location.href).href); toast('세트 링크를 복사했어요.', 'ok'); } catch { toast('이 브라우저에서는 링크를 복사할 수 없어요.', 'bad'); } }),
      on(root, 'click', '[data-test]', () => startTest({ setIds: [id], kind: set.kind })),
      on(root, 'click', '[data-translation]', () => { showKo = !showKo; draw(); }),
      on(root, 'click', '[data-flip]', (_e, el) => {
        const i = Number(el.dataset.flip);
        if (flashMode) { flipped = !flipped; el.classList.remove('is-in-next', 'is-in-prev'); el.classList.toggle('is-flipped', flipped); el.setAttribute('aria-pressed', String(flipped)); return; }
        revealed.has(i) ? revealed.delete(i) : revealed.add(i); draw();
      }),
      on(root, 'click', '[data-flash]', () => { flashMode = !flashMode; flipped = false; slide = 0; draw(); }),
      on(root, 'click', '[data-next]', () => turn(1)),
      on(root, 'click', '[data-prev]', () => turn(-1)),
      on(root, 'click', '[data-speak]', (_e, el) => speak(el.dataset.speak)),
      on(root, 'click', '[data-delete]', async () => { if (!await confirmDialog('이 세트를 삭제하면 되돌릴 수 없습니다.', { danger: true, ok: '세트 삭제' })) return; try { await api.del(`/sets/${id}`); toast('세트를 삭제했어요.', 'ok'); location.hash = '#/explore?scope=mine'; } catch (e) { toast(e.message, 'bad'); } })];
    return () => { offs.forEach(fn => fn()); document.removeEventListener('keydown', onKey); };
  },
};
