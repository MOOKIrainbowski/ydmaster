// 프로필 수정(#/me/edit) — 09(2026-11-21 사용자 요청: 프로필 보기와 분리). 사진·배너·이름·이메일, 꾸미기, 비밀번호, 계정 탈퇴.
// 꾸미기는 업적으로 해금된 것만 고를 수 있고(서버가 다시 확인), 고르면 위 미리보기 카드에 바로 보인다.
import { api } from '../api.js';
import { state, setUser } from '../state.js';
import { html, render, on, $, errorBox, toast, modal, avatar, icon, busy as busyBtn } from '../ui.js';
import { titleTag, cardClass, frameClass, TIER_NAME } from '../cosmetics.js';

async function imageData(file, maxBytes = 2 * 1024 * 1024) {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일을 선택해주세요.');
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
  let quality = 0.86, blob;
  do { blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality)); quality -= 0.12; } while (blob && blob.size > maxBytes && quality > 0.3);
  if (!blob || blob.size > maxBytes) throw new Error('이미지가 너무 커서 줄일 수 없습니다.');
  return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.')); reader.readAsDataURL(blob); });
}

const KINDS = [['color', '프로필 색'], ['frame', '사진 테두리'], ['border', '카드 테두리'], ['title', '칭호']];

export default {
  title: '프로필 수정', async render(root, _p, _q, ctx) {
    let user = state.user, busy = false, deco = null, kind = 'color', draft = null;
    try {
      const [me, c] = await Promise.all([api.get('/auth/me'), api.get('/cosmetics')]);
      if (!ctx.isCurrent()) return;
      user = me.user; setUser(user); deco = c; draft = { ...c.equipped };
    } catch (e) { render(root, html`<div class="page">${errorBox(e.message)}</div>`); return; }

    const titleOf = id => deco.catalog.title.find(t => t.id === id);
    const lockText = it => (it.unlock ? html`<span class="deco__lock">${icon(it.got ? 'check' : 'shield', 12)}${it.got ? '' : `${TIER_NAME[it.unlock.tier]} · `}${it.unlock.title}</span>` : html`<span class="deco__lock">기본</span>`);
    const item = (k, it) => {
      const sample = k === 'color' ? html`<span class="pf-swatch pf-color--${it.id}"></span>`
        : k === 'frame' ? html`<span class="deco__avatar pf-color--${draft.color} pf-frame--${it.id}">${(user.username || '?')[0]}</span>`
        : k === 'border' ? html`<span class="deco__card profile-card pf-color--${draft.color} pf-border--${it.id}"></span>`
        : titleTag({ id: it.id, name: it.name, tier: it.tier }, { small: true });
      return html`<label class="deco${it.got ? '' : ' is-locked'}" title="${it.got ? it.name : `잠김: '${it.unlock?.title}' 업적 달성 시 해금`}">
        <input type="radio" name="deco-${k}" value="${it.id}" ${draft[k] === it.id ? 'checked' : ''} ${it.got ? '' : 'disabled'}>
        ${sample}${k === 'title' ? '' : html`<span class="deco__name">${it.name}</span>`}${lockText(it)}</label>`;
    };
    const decoPanel = () => {
      const list = kind === 'title' ? [{ id: '', name: '칭호 없음', tier: 0, got: true, unlock: null }, ...deco.catalog.title] : deco.catalog[kind];
      const got = list.filter(x => x.got).length;
      return html`<div class="seg seg--sm deco-tabs" role="radiogroup" aria-label="꾸미기 종류">${KINDS.map(([k, label]) => html`<label class="seg__opt"><input type="radio" name="deco-kind" value="${k}" ${k === kind ? 'checked' : ''}><span>${label}</span></label>`)}</div>
        <p class="muted">${got} / ${list.length}개 해금 · 잠긴 것은 적힌 업적을 달성하면 열려요.${kind === 'title' ? ' 칭호는 등급 상 이상 업적마다 하나씩, 저마다 색과 효과가 달라요.' : ''}</p>
        <div class="deco-grid">${list.map(it => it.id === '' ? html`<label class="deco"><input type="radio" name="deco-title" value="" ${!draft.title ? 'checked' : ''}><span class="deco__name">칭호 없음</span><span class="deco__lock">기본</span></label>` : item(kind, it))}</div>`;
    };
    const preview = () => html`<article class="card profile-card ${cardClass(draft)}">
      ${user.bannerUrl ? html`<img class="profile-banner" src="${user.bannerUrl}" alt="">` : html`<div class="profile-banner profile-banner--empty" aria-hidden="true"></div>`}
      <div class="profile-id"><span class="profile-id__avatar ${frameClass(draft)}">${avatar(user, 88)}</span>
        <div class="profile-id__text"><h2 class="profile-id__name">${user.username}</h2>${draft.title ? html`<p class="profile-id__ttl">${titleTag(titleOf(draft.title))}</p>` : ''}<p class="muted">미리보기 · 저장하면 프로필에 보여요</p></div></div></article>`;

    const draw = () => render(root, html`<div class="page page--narrow"><section class="section stack">
      <div class="section__head"><div><a class="link-btn" href="#/me">${icon('chevronLeft', 14)}내 프로필</a><h1 class="section__title">프로필 수정</h1></div></div>

      <article class="card stack"><h2 class="set-group__title">${icon('user', 20)}사진·기본 정보</h2>
        <div class="profile-edit-media">
          <div class="profile-banner-wrap">${user.bannerUrl ? html`<img class="profile-banner" src="${user.bannerUrl}" alt="내 배너">` : html`<div class="profile-banner profile-banner--empty pf-color--${draft.color}" aria-hidden="true"></div>`}<input class="sr-only" id="banner-upload" type="file" accept="image/*" data-image="bannerImage"><label class="btn btn--ghost btn--sm profile-banner__action" for="banner-upload">배너 사진 바꾸기</label></div>
          <div class="profile-heading"><label class="profile-avatar-control" for="avatar-upload">${avatar(user, 72)}<span class="profile-camera" aria-hidden="true">+</span><span class="sr-only">프로필 사진 변경</span></label><input class="sr-only" id="avatar-upload" type="file" accept="image/*" data-image="avatarImage"><div><p class="muted">사진을 누르면 바꿀 수 있어요. 배너 사진이 없으면 프로필 색이 배너가 돼요.</p></div></div>
        </div>
        <form class="stack" data-profile><div class="field-row"><label class="field"><span class="field__label">사용자명</span><input class="input" name="username" value="${user.username}" minlength="2" maxlength="20" required></label><label class="field"><span class="field__label">이메일</span><input class="input" type="email" name="email" value="${user.email || ''}"></label></div>
          <button class="btn btn--primary">기본 정보 저장</button></form></article>

      <article class="card stack"><h2 class="set-group__title">${icon('star', 20)}꾸미기</h2>
        <div class="deco-preview" data-deco-preview>${preview()}</div>
        <div data-deco-panel>${decoPanel()}</div>
        <div class="btn-row"><button class="btn btn--primary" data-deco-save>${icon('check', 18)}꾸미기 저장</button><button class="btn btn--ghost" data-deco-reset>되돌리기</button></div>
      </article>

      ${user.hasPassword || user.loginType === 'local' ? html`<article class="card stack"><h2 class="set-group__title">${icon('shield', 20)}비밀번호</h2><form class="stack" data-password><label class="field"><span class="field__label">현재 비밀번호</span><input class="input" name="currentPassword" type="password" autocomplete="current-password" required></label><label class="field"><span class="field__label">새 비밀번호</span><input class="input" name="newPassword" type="password" minlength="8" autocomplete="new-password" required></label><button class="btn btn--ghost">비밀번호 변경</button></form></article>` : ''}
      <article class="card danger-zone stack"><h2 class="section__title">위험 구역</h2><p class="muted">계정과 학습 기록을 영구적으로 삭제합니다.</p><button class="btn btn--danger" data-delete-account>계정 탈퇴</button></article>
    </section></div>`);
    draw();
    const redrawDeco = () => { render($('[data-deco-preview]', root), preview()); render($('[data-deco-panel]', root), decoPanel()); };

    const offs = [
      on(root, 'change', 'input[name^="deco-"]', (_e, el) => {
        if (el.name === 'deco-kind') { kind = el.value; render($('[data-deco-panel]', root), decoPanel()); return; }
        draft[el.name.slice(5)] = el.value; redrawDeco();
      }),
      on(root, 'click', '[data-deco-reset]', () => { draft = { ...deco.equipped }; redrawDeco(); }),
      on(root, 'click', '[data-deco-save]', (_e, b) => busyBtn(b, async () => {
        try { const r = await api.put('/cosmetics', draft); deco.equipped = r.equipped; draft = { ...r.equipped }; toast('꾸미기를 저장했어요. 프로필에서 확인해 보세요.', 'ok'); }
        catch (e) { toast(e.message, 'bad'); }
      })),
      on(root, 'change', '[data-image]', async (_e, input) => { const file = input.files[0]; if (!file || busy) return; busy = true; try { const data = await imageData(file); const r = await api.put('/auth/profile', { [input.dataset.image]: data }); user = { ...user, ...r.user }; setUser(user); toast('사진을 업데이트했어요.', 'ok'); draw(); } catch (e) { toast(e.message, 'bad'); } finally { busy = false; } }),
      on(root, 'submit', '[data-profile]', async (e, form) => { e.preventDefault(); if (busy) return; busy = true; const f = new FormData(form);
        try { const r = await api.put('/auth/profile', { username: f.get('username').trim(), email: f.get('email').trim() }); user = { ...user, ...r.user }; setUser(user); toast('프로필을 저장했어요.', 'ok'); draw(); } catch (err) { toast(err.message, 'bad'); } finally { busy = false; }
      }),
      on(root, 'submit', '[data-password]', async (e, form) => { e.preventDefault(); if (busy) return; busy = true; const f = new FormData(form);
        try { const r = await api.put('/auth/profile', { username: user.username, currentPassword: f.get('currentPassword'), newPassword: f.get('newPassword') }); user = { ...user, ...r.user }; setUser(user); toast('비밀번호를 변경했어요.', 'ok'); form.reset(); }
        catch (err) { toast(err.message, 'bad'); } finally { busy = false; }
      }),
      on(root, 'click', '[data-delete-account]', async () => {
        let password = '', input;
        const action = await modal({ title: '계정 탈퇴', body: el => { el.innerHTML = String(html`<p>계정과 학습 데이터가 삭제되며 복구할 수 없습니다.</p>${user.hasPassword || user.loginType === 'local' ? html`<label class="field"><span class="field__label">비밀번호 확인</span><input class="input" type="password" autocomplete="current-password" data-delete-password required></label>` : ''}`); input = $('[data-delete-password]', el); }, actions: [{ id: 'cancel', label: '취소' }, { id: 'delete', label: '계정 삭제', kind: 'danger' }] });
        if (action !== 'delete') return; password = input?.value || '';
        try { await api.post('/auth/account/delete', { password }); setUser(null, null); toast('계정을 삭제했어요.', 'ok'); location.hash = '#/'; } catch (e) { toast(e.message, 'bad'); }
      }),
    ];
    return () => offs.forEach(fn => fn());
  },
};
