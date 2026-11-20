import { api } from '../api.js';
import { state, setUser, getTheme, setTheme } from '../state.js';
import { html, render, on, $, errorBox, toast, modal, avatar, icon } from '../ui.js';

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

export default {
  title: '내 정보', async render(root, _p, _q, ctx) {
    let user = state.user, busy = false;
    try { const r = await api.get('/auth/me'); if (!ctx.isCurrent()) return; user = r.user; setUser(user); }
    catch (e) { render(root, html`<div class="page">${errorBox(e.message)}</div>`); return; }
    const draw = () => render(root, html`<div class="page page--narrow"><section class="section stack"><h1 class="section__title">내 정보</h1>
      <article class="card stack profile-card"><div class="profile-banner-wrap">${user.bannerUrl ? html`<img class="profile-banner" src="${user.bannerUrl}" alt="내 배너">` : html`<div class="profile-banner profile-banner--empty" aria-hidden="true"></div>`}<input class="sr-only" id="banner-upload" type="file" accept="image/*" data-image="bannerImage"><label class="btn btn--ghost btn--sm profile-banner__action" for="banner-upload">배너 사진 바꾸기</label></div>
        <div class="profile-heading"><label class="profile-avatar-control" for="avatar-upload">${avatar(user, 72)}<span class="profile-camera" aria-hidden="true">+</span><span class="sr-only">프로필 사진 변경</span></label><input class="sr-only" id="avatar-upload" type="file" accept="image/*" data-image="avatarImage"><div><h2>${user.username}</h2><p class="muted">${user.email}</p></div></div>
        <form class="stack" data-profile><div class="field-row"><label class="field"><span class="field__label">사용자명</span><input class="input" name="username" value="${user.username}" minlength="2" maxlength="20" required></label><label class="field"><span class="field__label">이메일</span><input class="input" type="email" name="email" value="${user.email || ''}"></label></div>
          <button class="btn btn--primary">프로필 저장</button></form></article>
      ${user.loginType === 'local' ? html`<article class="card stack"><h2 class="section__title">비밀번호</h2><form class="stack" data-password><label class="field"><span class="field__label">현재 비밀번호</span><input class="input" name="currentPassword" type="password" autocomplete="current-password" required></label><label class="field"><span class="field__label">새 비밀번호</span><input class="input" name="newPassword" type="password" minlength="8" autocomplete="new-password" required></label><button class="btn btn--ghost">비밀번호 변경</button></form></article>` : ''}
      <article class="card stack"><h2 class="section__title">설정</h2><label class="field"><span class="field__label">테마</span><select class="select" name="theme"><option value="system" ${getTheme() === 'system' ? 'selected' : ''}>기기 설정</option><option value="light" ${getTheme() === 'light' ? 'selected' : ''}>라이트</option><option value="dark" ${getTheme() === 'dark' ? 'selected' : ''}>다크</option></select></label>
        <nav class="stack" aria-label="내 메뉴"><a class="list-row" href="#/history">${icon('clock')}학습 기록</a><a class="list-row" href="#/friends">${icon('users')}친구</a><a class="list-row" href="#/notice">${icon('bell')}공지사항</a><a class="list-row" href="#/inquiry">${icon('chat')}문의하기</a>${user.isAdmin ? html`<a class="list-row" href="#/admin">${icon('shield')}관리자</a>` : ''}<a class="list-row" href="/privacy.html">개인정보처리방침</a></nav></article>
      <div class="btn-row"><button class="btn btn--ghost" data-logout>로그아웃</button></div><article class="card danger-zone stack"><h2 class="section__title">위험 구역</h2><p class="muted">계정과 학습 기록을 영구적으로 삭제합니다.</p><button class="btn btn--danger" data-delete-account>계정 탈퇴</button></article>
    </section></div>`);
    draw();
    const offs = [on(root, 'change', '[data-image]', async (_e, input) => { const file = input.files[0]; if (!file) return; if (busy) return; busy = true; try { const data = await imageData(file); const r = await api.put('/auth/profile', { [input.dataset.image]: data }); user = r.user; setUser(user); toast('사진을 업데이트했어요.', 'ok'); draw(); } catch (e) { toast(e.message, 'bad'); } finally { busy = false; } }),
      on(root, 'change', 'select[name="theme"]', (_e, el) => setTheme(el.value)),
      on(root, 'submit', '[data-profile]', async (e, form) => { e.preventDefault(); if (busy) return; busy = true; const f = new FormData(form); const body = { username: f.get('username').trim(), email: f.get('email').trim() }; if (f.get('newPassword')) { body.currentPassword = f.get('currentPassword'); body.newPassword = f.get('newPassword'); }
        try { const r = await api.put('/auth/profile', body); user = r.user; setUser(user); toast('프로필을 저장했어요.', 'ok'); draw(); } catch (err) { toast(err.message, 'bad'); } finally { busy = false; }
      }),
      on(root, 'submit', '[data-password]', async (e, form) => { e.preventDefault(); if (busy) return; busy = true; const f = new FormData(form);
        try { const r = await api.put('/auth/profile', { username: user.username, currentPassword: f.get('currentPassword'), newPassword: f.get('newPassword') }); user = r.user; setUser(user); toast('비밀번호를 변경했어요.', 'ok'); form.reset(); }
        catch (err) { toast(err.message, 'bad'); } finally { busy = false; }
      }),
      on(root, 'click', '[data-logout]', () => { setUser(null, null); location.hash = '#/login'; }),
      on(root, 'click', '[data-delete-account]', async () => {
        let password = '', input;
        const action = await modal({ title: '계정 탈퇴', body: el => { el.innerHTML = String(html`<p>계정과 학습 데이터가 삭제되며 복구할 수 없습니다.</p>${user.loginType === 'local' ? html`<label class="field"><span class="field__label">비밀번호 확인</span><input class="input" type="password" autocomplete="current-password" data-delete-password required></label>` : ''}`); input = $('[data-delete-password]', el); }, actions: [{ id: 'cancel', label: '취소' }, { id: 'delete', label: '계정 삭제', kind: 'danger' }] });
        if (action !== 'delete') return; password = input?.value || '';
        try { await api.post('/auth/account/delete', { password }); setUser(null, null); toast('계정을 삭제했어요.', 'ok'); location.hash = '#/'; } catch (e) { toast(e.message, 'bad'); }
      })];
    return () => offs.forEach(fn => fn());
  },
};
