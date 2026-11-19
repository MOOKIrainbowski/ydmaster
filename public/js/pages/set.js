import { api } from '../api.js';
import { state } from '../state.js';
import { html, render, on, icon, skeleton, errorBox, toast, confirmDialog, speak } from '../ui.js';
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
    const draw = () => {
      const passage = set.kind === 'passage';
      const items = passage ? set.passage.sentences : set.items;
      const passageRows = passage ? set.passage.sentences.map((s, i) => html`<article class="card stack"><div class="list-row__main"><span class="badge">${i + 1}</span><p class="passage" lang="en">${parseSentence(s.en).tokens.map(t => t.kind === 'choice' ? html`<span class="badge">${t.options.join(' / ')}</span>` : html`<span class="${t.key !== undefined ? 'is-key' : ''}">${t.text}</span>`)}</p>
        ${showKo && s.ko ? html`<p class="muted">${s.ko}</p>` : ''}</div></article>`) : [];
      render(root, html`<div class="page stack"><section class="section"><div class="section__head"><div><span class="badge">${passage ? '본문' : '단어'} · ${set.visibility === 'public' ? '공개' : set.visibility === 'friends' ? '친구' : '비공개'}</span><h1 class="section__title">${set.title}</h1></div>
        <div class="btn-row"><button class="btn btn--ghost" data-favorite>${icon('star')} ${set.favorited ? '즐겨찾기 해제' : '즐겨찾기'}</button><button class="btn btn--ghost" data-copy>${icon('copy')}내 세트로 복사</button><button class="btn btn--ghost" data-share>${icon('link')}공유</button></div></div>
        ${set.description ? html`<p class="muted">${set.description}</p>` : ''}<div class="btn-row"><button class="btn btn--primary" data-test>${icon('play')}시험 보기</button>${!passage ? html`<button class="btn btn--ghost" data-flash>${flashMode ? '목록 보기' : '학습 카드'}</button>` : html`<button class="btn btn--ghost" data-translation>${showKo ? '해석 숨기기' : '해석 보기'}</button>`}${isOwner() ? html`<a class="btn btn--ghost" href="#/sets/${set._id}/edit">수정</a><button class="btn btn--danger" data-delete>삭제</button>` : ''}</div>
      </section><section class="section"><div class="section__head"><h2 class="section__title">${passage ? `${items.length}개 문장` : `${items.length}개 단어`}</h2></div>
        ${passage ? html`<div class="stack">${passageRows}</div>` : flashMode ? html`<div class="stack">${vocabCard(items[index], index)}<div class="btn-row"><button class="btn btn--ghost" data-prev aria-label="이전 단어">${icon('chevronLeft')}</button><span>${index + 1} / ${items.length}</span><button class="btn btn--ghost" data-next aria-label="다음 단어">${icon('chevronRight')}</button></div></div>` : html`<div class="stack">${items.map((item, i) => vocabCard(item, i))}</div>`}</section></div>`);
    };
    await load();
    const offs = [on(root, 'click', '[data-favorite]', async () => { try { const r = await api[set.favorited ? 'del' : 'post'](`/sets/${id}/favorite`); set.favorited = r.favorited; draw(); } catch (e) { toast(e.message, 'bad'); } }),
      on(root, 'click', '[data-copy]', async () => { try { const r = await api.post(`/sets/${id}/copy`); toast('내 세트에 복사했어요.', 'ok'); location.hash = `#/sets/${r._id}`; } catch (e) { toast(e.message, 'bad'); } }),
      on(root, 'click', '[data-share]', async () => { try { await navigator.clipboard.writeText(new URL(`#/sets/${id}`, location.href).href); toast('세트 링크를 복사했어요.', 'ok'); } catch { toast('이 브라우저에서는 링크를 복사할 수 없어요.', 'bad'); } }),
      on(root, 'click', '[data-test]', () => startTest({ setIds: [id], kind: set.kind })),
      on(root, 'click', '[data-translation]', () => { showKo = !showKo; draw(); }),
      on(root, 'click', '[data-flip]', (_e, el) => { const i = Number(el.dataset.flip); if (flashMode) flipped = !flipped; else revealed.has(i) ? revealed.delete(i) : revealed.add(i); draw(); }),
      on(root, 'click', '[data-flash]', () => { flashMode = !flashMode; flipped = false; draw(); }),
      on(root, 'click', '[data-next]', () => { index = (index + 1) % set.items.length; flipped = false; draw(); }),
      on(root, 'click', '[data-prev]', () => { index = (index - 1 + set.items.length) % set.items.length; flipped = false; draw(); }),
      on(root, 'click', '[data-speak]', (_e, el) => speak(el.dataset.speak)),
      on(root, 'click', '[data-delete]', async () => { if (!await confirmDialog('이 세트를 삭제하면 되돌릴 수 없습니다.', { danger: true, ok: '세트 삭제' })) return; try { await api.del(`/sets/${id}`); toast('세트를 삭제했어요.', 'ok'); location.hash = '#/explore?scope=mine'; } catch (e) { toast(e.message, 'bad'); } })];
    return () => offs.forEach(fn => fn());
  },
};
