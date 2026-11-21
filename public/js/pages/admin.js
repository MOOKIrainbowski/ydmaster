import { api } from '../api.js';
import { state } from '../state.js';
import { html, render, on, icon, skeleton, empty, errorBox, toast, confirmDialog, fmtDate } from '../ui.js';

let chartJsPromise;
function loadChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!chartJsPromise) chartJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    script.onload = () => { if (window.Chart) resolve(window.Chart); else { chartJsPromise = null; reject(new Error('차트 라이브러리를 사용할 수 없습니다.')); } };
    script.onerror = () => { script.remove(); chartJsPromise = null; reject(new Error('차트를 불러오지 못했습니다.')); };
    document.head.append(script);
  });
  return chartJsPromise;
}

export default {
  title: '관리자', async render(root, _p, _q, ctx) {
    let tab = 'stats', stats = null, chart = null, chartInstance = null, users = [], inquiries = [], logs = [], logTotal = 0, days = 30, searchUsers = '', logSearch = '', logLevel = 'all', busy = false;
    const drawChart = async () => {
      if (!chart || tab !== 'stats' || !ctx.isCurrent()) return;
      try {
        const Chart = await loadChartJs();
        if (!ctx.isCurrent() || tab !== 'stats') return;
        const canvas = root.querySelector('[data-chart]'); if (!canvas) return;
        chartInstance?.destroy();
        chartInstance = new Chart(canvas, { type: 'line', data: { labels: chart.labels, datasets: [
          { label: '가입', data: chart.newUsers, borderColor: '#4f46e5', backgroundColor: '#4f46e522', tension: 0.25 },
          { label: '시험', data: chart.testResults, borderColor: '#15803d', backgroundColor: '#15803d22', tension: 0.25 },
          { label: '세트', data: chart.newTests, borderColor: '#a16207', backgroundColor: '#a1620722', tension: 0.25 },
        ] }, options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
      } catch { toast('차트를 불러오지 못했어요. 잠시 후 다시 시도해주세요.', 'bad'); }
    };
    const loadTab = async () => {
      busy = true; chartInstance?.destroy(); chartInstance = null; render(root, html`<div class="page">${skeleton(5)}</div>`);
      try {
        if (tab === 'stats') [stats, chart] = await Promise.all([api.get('/admin/stats'), api.get(`/admin/stats/chart?days=${days}`)]);
        if (tab === 'users') users = await api.get('/admin/users');
        if (tab === 'inquiries') inquiries = await api.get('/admin/inquiries');
        if (tab === 'logs') { const q = new URLSearchParams({ limit: '500', level: logLevel, search: logSearch }); const r = await api.get('/admin/logs?' + q); logs = r.logs; logTotal = r.total; }
        if (ctx.isCurrent()) { draw(); if (tab === 'stats') await drawChart(); }
      } catch (e) { if (ctx.isCurrent()) render(root, html`<div class="page">${errorBox(e.message, 'data-retry-admin')}</div>`); }
      finally { busy = false; }
    };
    const draw = () => {
      const content = tab === 'stats' ? html`<div class="stack"><dl class="stat-row"><div><dt>사용자</dt><dd>${stats.totalUsers}</dd></div><div><dt>세트</dt><dd>${stats.totalTests}</dd></div><div><dt>시험 결과</dt><dd>${stats.totalResults}</dd></div><div><dt>대기 문의</dt><dd>${stats.pendingInquiries}</dd></div></dl>
        <div class="section"><div class="section__head"><h2 class="section__title">최근 ${days}일</h2><select class="select" name="days"><option value="7" ${days === 7 ? 'selected' : ''}>7일</option><option value="30" ${days === 30 ? 'selected' : ''}>30일</option><option value="90" ${days === 90 ? 'selected' : ''}>90일</option></select></div>
          <div class="card admin-chart"><canvas data-chart aria-label="기간별 가입·시험 통계" role="img"></canvas></div></div></div>`
        : tab === 'users' ? html`<form class="field-row" data-user-search><label class="field"><span class="field__label">사용자 검색</span><input class="input" name="q" value="${searchUsers}" placeholder="이름 또는 이메일"></label><button class="btn btn--primary btn--icon" aria-label="검색" title="검색">${icon('search', 20)}</button></form>${users.filter(u => `${u.username} ${u.email}`.toLowerCase().includes(searchUsers.toLowerCase())).length ? html`<ul class="stack">${users.filter(u => `${u.username} ${u.email}`.toLowerCase().includes(searchUsers.toLowerCase())).slice(0, 100).map(u => html`<li class="list-row card"><div class="list-row__main"><p class="list-row__title">${u.username}${u.isAdmin ? ' · 관리자' : ''}</p><p class="list-row__meta">${u.email} · 가입 ${fmtDate(u.createdAt)}</p></div>${String(u._id) !== String(state.user?.id || state.user?._id) ? html`<button class="btn btn--ghost btn--sm" data-toggle-admin="${u._id}">${u.isAdmin ? '권한 해제' : '관리자 지정'}</button><button class="btn btn--ghost btn--sm set-delete btn--icon" data-delete-user="${u._id}" aria-label="사용자 삭제" title="사용자 삭제">${icon('trash', 18)}</button>` : ''}</li>`)}</ul>` : empty({ icon: 'user', title: '사용자가 없어요' })}`
        : tab === 'inquiries' ? inquiries.length ? html`<div class="stack">${inquiries.map(i => html`<article class="card stack"><div><h2 class="section__title">${i.title}</h2><p class="muted">${i.user?.username || '사용자'} (${i.user?.email || ''}) · ${fmtDate(i.createdAt)}</p></div><p class="pre-line">${i.content}</p>${i.answer ? html`<div class="card"><strong>현재 답변</strong><p class="pre-line">${i.answer}</p></div>` : ''}<form class="stack" data-answer="${i._id}"><label class="field"><span class="field__label">답변</span><textarea class="input" name="answer" maxlength="2000" required>${i.answer || ''}</textarea></label><div class="btn-row"><button class="btn btn--primary">답변 저장</button><button class="btn btn--ghost set-delete btn--icon" type="button" data-delete-inquiry="${i._id}" aria-label="문의 삭제" title="문의 삭제">${icon('trash')}</button></div></form></article>`)}</div>` : empty({ icon: 'chat', title: '문의가 없어요' })
        : html`<form class="field-row" data-log-search><label class="field"><span class="field__label">검색</span><input class="input" name="q" value="${logSearch}" maxlength="100"></label><label class="field"><span class="field__label">등급</span><select class="select" name="level"><option value="all" ${logLevel === 'all' ? 'selected' : ''}>전체</option><option value="warn" ${logLevel === 'warn' ? 'selected' : ''}>경고</option><option value="error" ${logLevel === 'error' ? 'selected' : ''}>오류</option></select></label><button class="btn btn--primary btn--icon" aria-label="검색" title="검색">${icon('search', 20)}</button></form><p class="muted">${logs.length}개 표시 · 전체 로그 ${logTotal}개</p>${logs.length ? html`<div class="stack">${logs.map(l => html`<article class="card stack"><div class="section__head"><span class="badge badge--${l.level === 'error' ? 'bad' : 'warn'}">${l.level}</span><time class="muted">${fmtDate(l.ts)}</time></div><code class="pre-line">${l.message}</code></article>`)}</div>` : empty({ icon: 'info', title: '로그가 없어요' })}`;
      render(root, html`<div class="page"><section class="section stack"><h1 class="section__title">관리자</h1><div class="tabs" role="tablist">${[['stats','통계'],['users','사용자'],['inquiries','문의'],['logs','로그']].map(([id,label]) => html`<button class="tabs__tab${tab === id ? ' is-active' : ''}" role="tab" aria-selected="${tab === id}" data-tab="${id}">${label}</button>`)}</div><div class="stack">${content}</div></section></div>`);
    };
    await loadTab();
    const offs = [on(root, 'click', '[data-tab]', (_e, el) => { if (busy) return; tab = el.dataset.tab; loadTab(); }),
      on(root, 'click', '[data-retry-admin]', loadTab),
      on(root, 'change', 'select[name="days"]', (_e, el) => { days = Number(el.value); loadTab(); }),
      on(root, 'submit', '[data-user-search]', (e, form) => { e.preventDefault(); searchUsers = new FormData(form).get('q').trim(); draw(); }),
      on(root, 'submit', '[data-log-search]', (e, form) => { e.preventDefault(); const f = new FormData(form); logSearch = f.get('q').trim(); logLevel = f.get('level'); loadTab(); }),
      on(root, 'submit', '[data-answer]', async (e, form) => { e.preventDefault(); try { await api.put(`/admin/inquiries/${form.dataset.answer}/answer`, { answer: new FormData(form).get('answer').trim() }); toast('답변을 저장했어요.', 'ok'); await loadTab(); } catch (err) { toast(err.message, 'bad'); } }),
      on(root, 'click', '[data-toggle-admin]', async (_e, el) => { if (!await confirmDialog('관리자 권한을 변경할까요?')) return; try { await api.put(`/admin/users/${el.dataset.toggleAdmin}/toggle-admin`); await loadTab(); } catch (e) { toast(e.message, 'bad'); } }),
      on(root, 'click', '[data-delete-user]', async (_e, el) => { if (!await confirmDialog('사용자와 관련 데이터가 삭제됩니다. 계속할까요?', { danger: true })) return; try { await api.del(`/admin/users/${el.dataset.deleteUser}`); users = users.filter(u => String(u._id) !== el.dataset.deleteUser); draw(); } catch (e) { toast(e.message, 'bad'); } }),
      on(root, 'click', '[data-delete-inquiry]', async (_e, el) => { if (!await confirmDialog('이 문의를 삭제할까요?', { danger: true })) return; try { await api.del(`/admin/inquiries/${el.dataset.deleteInquiry}`); inquiries = inquiries.filter(i => String(i._id) !== el.dataset.deleteInquiry); draw(); } catch (e) { toast(e.message, 'bad'); } })];
    return () => { offs.forEach(fn => fn()); chartInstance?.destroy(); };
  },
};
