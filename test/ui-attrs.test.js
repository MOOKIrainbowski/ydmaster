// 08 회귀: 로그인·가입 입력칸의 속성 문자열이 이스케이프되지 않아야 함(pattern 값에 따옴표가 섞이면 모든 아이디가 형식 오류)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { field } from '../public/js/pages/login.js';

test('field(): pattern·minlength 속성이 그대로 들어감', () => {
  const out = String(field('사용자명', 'username', 'text', 'minlength="2" pattern="[A-Za-z0-9가-힣_]{2,20}"'));
  assert.ok(out.includes('pattern="[A-Za-z0-9가-힣_]{2,20}"'), out);
  assert.ok(out.includes('minlength="2"'));
  assert.ok(!out.includes('&quot;'));
  // 브라우저와 같은 규칙(v 플래그, 전체 일치)으로 실제 아이디가 통과하는지
  const re = new RegExp('^(?:[A-Za-z0-9가-힣_]{2,20})$', 'v');
  for (const ok of ['hong', '홍길동', 'abc_12', 'user1']) assert.ok(re.test(ok), ok);
  for (const bad of ['a', 'has space', 'x'.repeat(21), 'dash-name']) assert.ok(!re.test(bad), bad);
});

test('field(): 값(사용자 입력)은 여전히 이스케이프', () => {
  const out = String(field('이메일', 'email', 'text', '', '"><script>'));
  assert.ok(!out.includes('"><script>'));
});

// 09: 칭호마다 화면 효과가 있고, 효과 조합이 모두 다름
test('칭호 효과: 서버 칭호 전부에 서로 다른 효과·색 조합', async () => {
  const { TITLE_FX, titleTag } = await import('../public/js/cosmetics.js');
  const { TITLE_ITEMS } = await import('../server/game.js');
  for (const t of TITLE_ITEMS) assert.ok(TITLE_FX[t.id], t.id);
  assert.equal(new Set(TITLE_ITEMS.map(t => TITLE_FX[t.id].join('|'))).size, TITLE_ITEMS.length);
  const out = String(titleTag({ id: 'modes11', name: '만능 해결사', tier: 3 }));
  assert.ok(out.includes('fx-wave') && out.includes('ttl__ch'));
});
