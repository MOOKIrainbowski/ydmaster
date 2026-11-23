import { api } from '../api.js';
import { html, render, on, icon, skeleton, empty, errorBox, toast, speak } from '../ui.js';
import { startTest } from '../start.js';

export default {
  title: '오답 복습',
  async render(root, _params, _query, ctx) {
    let tab = 'vocab', wrong = [], groups = [];
    const load = async () => {
      render(root, html`<div class="page">${skeleton(5)}</div>`);
      try {
        const [w, old] = await Promise.all([api.get('/wrong'), api.get('/legacy-wrongnote')]);
        if (!ctx.isCurrent()) return;
        wrong = w.items; groups = old.groups; draw();
      } catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message, 'data-retry-wrong')}</div>`); }
    };
    const draw = () => {
      const current = wrong.filter(x => x.set.kind === tab);
      const setGroups = [...new Map(current.map(x => [String(x.set._id), x.set])).values()];
      const content = tab === 'legacy' ? groups.length ? html`<div class="stack">${groups.map(g => html`<section class="card stack"><div class="section__head"><div><h2 class="section__title">${g.testTitle || '이전 시험'}</h2><p class="muted">${new Date(g.savedAt).toLocaleDateString('ko-KR')} · ${g.words.length}개</p></div><button class="btn btn--primary btn--sm" data-save-legacy="${g._id}">단어 세트로 저장</button></div><ul class="stack">${g.words.map(w => html`<li class="list-row"><div class="list-row__main"><p class="list-row__title">${w.question}</p><p class="list-row__meta">${w.answer}</p></div></li>`)}</ul></section>`)}</div>` : empty({ icon: 'book', title: '이전 오답노트가 비어 있어요' })
        : setGroups.length ? html`<div class="stack">${setGroups.map((s, i) => {
          const rows = current.filter(x => String(x.set._id) === String(s._id));
          return html`<section class="set-card reveal" style="--i:${i}"><div class="set-card__head"><div class="wrong-set-title"><span class="kind-tile kind-tile--${s.kind === 'passage' ? 'passage' : 'vocab'}">${icon(s.kind === 'passage' ? 'text' : 'book', 24)}</span><h2 class="set-card__title">${s.title}</h2></div><div class="btn-row"><button class="btn btn--primary btn--sm btn--icon" data-review-set="${s._id}" data-kind="${s.kind}" data-title="${s.title}" data-n="${rows.length}" aria-label="이 세트 오답 복습" title="이 세트 오답 복습">${icon('review', 20)}</button><a class="btn btn--ghost btn--sm" href="#/sets/${s._id}">세트 보기</a></div></div>
            <ul class="stack">${rows.map(x => html`<li class="list-row wrong-row"><div class="list-row__main"><p class="list-row__title wrong-word">${x.display.front}</p><p class="list-row__meta">${x.display.back || '해석 없음'}</p></div><span class="badge wrong-count">오답 ${x.wrong}회</span><button class="btn btn--icon btn--ghost" data-speak="${x.display.front}" aria-label="발음 듣기">${icon('volume')}</button><button class="btn btn--ghost btn--sm" data-remove="${s._id}" data-item="${x.item}">복습에서 빼기</button></li>`)}</ul>
          </section>`;
        })}</div>` : empty({ icon: 'check', title: '복습할 오답이 없어요', desc: '시험을 풀면 다시 확인할 문항이 여기에 모여요.' });
      render(root, html`<div class="page"><section class="section"><div class="section__head"><h1 class="section__title">오답 복습</h1><div class="btn-row"><button class="btn btn--primary btn--sm" data-review="vocab">단어 복습</button><button class="btn btn--ghost btn--sm" data-review="passage">본문 복습</button></div></div>
        <div class="tabs" role="tablist"><button class="tabs__tab${tab === 'vocab' ? ' is-active' : ''}" role="tab" aria-selected="${tab === 'vocab'}" data-tab="vocab">단어</button><button class="tabs__tab${tab === 'passage' ? ' is-active' : ''}" role="tab" aria-selected="${tab === 'passage'}" data-tab="passage">본문</button><button class="tabs__tab${tab === 'legacy' ? ' is-active' : ''}" role="tab" aria-selected="${tab === 'legacy'}" data-tab="legacy">이전 노트</button></div>
        <div>${content}</div></section></div>`);
    };
    await load();
    const offs = [on(root, 'click', '[data-tab]', (_e, el) => { tab = el.dataset.tab; draw(); }),
      on(root, 'click', '[data-retry-wrong]', load),
      on(root, 'click', '[data-review]', (_e, el) => startTest({ source: 'wrong', kind: el.dataset.review })),
      // 10: 세트별 오답 복습 시험(그 세트에서 틀린 것만)
      on(root, 'click', '[data-review-set]', (_e, el) => startTest({ source: 'wrong', kind: el.dataset.kind, setId: el.dataset.reviewSet, info: { title: `${el.dataset.title} · 오답`, count: Number(el.dataset.n) } })),
      on(root, 'click', '[data-remove]', async (_e, el) => { try { await api.del(`/wrong/${el.dataset.remove}/${el.dataset.item}`); wrong = wrong.filter(x => !(String(x.set._id) === el.dataset.remove && String(x.item) === el.dataset.item)); draw(); toast('오답 목록에서 뺐어요.', 'ok'); } catch (e) { toast(e.message, 'bad'); } }),
      on(root, 'click', '[data-speak]', (_e, el) => { if (!speak(el.dataset.speak, undefined, el)) toast('이 브라우저는 발음 듣기를 지원하지 않아요.', 'info'); }),
      on(root, 'click', '[data-save-legacy]', async (_e, el) => { const group = groups.find(g => String(g._id) === el.dataset.saveLegacy); if (!group?.words.length) return;
        try { const r = await api.post('/sets', { title: `${group.testTitle || '이전 시험'} 오답`.slice(0, 100), kind: 'vocab', visibility: 'private', items: group.words.map(w => ({ term: w.question, meaning: w.answer })) }); toast('오답을 내 단어 세트로 저장했어요.', 'ok'); location.hash = `#/sets/${r._id}`; }
        catch (e) { toast(e.message, 'bad'); }
      }),
      ];
    return () => offs.forEach(fn => fn());
  },
};
