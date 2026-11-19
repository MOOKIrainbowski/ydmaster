// 아직 저장하지 않은 편집 내용의 임시저장(02 D10).
// 브라우저(localStorage)에 사용자별로 보관 → 새로고침·재배포·탭 닫힘 뒤에도 "이어서 작성" 가능.
// 같은 기기를 여러 사람이 쓰는 경우를 위해 키에 사용자 id 를 넣는다.
import { state } from './state.js';

const PREFIX = 'ydm_draft:';
const key = id => `${PREFIX}${state.user?.id || state.user?._id || 'guest'}:${id}`;
const MAX_AGE = 30 * 864e5; // 30일 지난 임시저장은 버림

export const drafts = {
  load(id) {
    try {
      const d = JSON.parse(localStorage.getItem(key(id)) || 'null');
      if (!d || Date.now() - d.savedAt > MAX_AGE) return null;
      return d;
    } catch { return null; }
  },
  // 저장 성공 여부를 돌려준다(용량 초과·사생활 모드면 false)
  save(id, data) {
    try { localStorage.setItem(key(id), JSON.stringify({ ...data, savedAt: Date.now() })); return true; } catch { return false; }
  },
  clear(id) { try { localStorage.removeItem(key(id)); } catch { /* 무시 */ } },
  // id 가 prefix 로 시작하는 임시저장 중 가장 최근 것 { id, data } (탭을 닫은 뒤 다른 탭에서 이어 쓰기용)
  latest(prefix) {
    try {
      const head = key('');
      let best = null;
      for (let k = 0; k < localStorage.length; k++) {
        const name = localStorage.key(k);
        if (!name.startsWith(head + prefix)) continue;
        const d = JSON.parse(localStorage.getItem(name) || 'null');
        if (d && Date.now() - d.savedAt <= MAX_AGE && (!best || d.savedAt > best.data.savedAt)) best = { id: name.slice(head.length), data: d };
      }
      return best;
    } catch { return null; }
  },
};

// 이 탭의 고유 번호(sessionStorage 는 탭마다 따로, 새로고침해도 유지) — 새 세트를 여러 탭에서 쓸 때 임시저장이 섞이지 않게
export function tabId() {
  try {
    let t = sessionStorage.getItem('ydm_tab');
    if (!t) { t = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('ydm_tab', t); }
    return t;
  } catch { return 'tab'; }
}
