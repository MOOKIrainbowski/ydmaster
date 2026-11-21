// 로그인 화면 오른쪽의 마스코트 '영이'(2026-11-20 사용자 요청: 로그인할 때 소소한 웃음을 주는 이스터에그·기믹).
// 캐릭터 그림은 public/brand/mascot.svg 한 곳(03 Codex 와 공동 창작, 결정 M1)을 불러와 넣는다 — 로고·파비콘과 같은 원본.
// 화면에 붙이면 스스로 움직이고, 로그인 결과는 react('happy'|'sad') 로 알려준다. 해제 함수 반환.
//  - 눈동자가 포인터를, 입력 중에는 입력칸을 따라본다
//  - 비밀번호 칸에 들어가면 눈을 꼭 감는다(안 봤어요) — 04 에서 손을 없애며 바꿈
//  - 쓰다듬으면(클릭) 아무 말이나 한다 · 7번째마다 숨은 단어와 색종이
//  - 가만히 두면 졸다가, 움직이면 깬다
// 14(사용자 요청: 옆의 단어 카드 삭제, 마스코트 크게, 기믹·이스터에그 더): 단어 카드를 빼고 아래를 더함
//  - 끌어당기면 늘어났다 튕겨 돌아옴 · 꾹 누르면 부풀었다 펑 · 빠르게 5번 누르면 어지러워함
//  - 마우스로 좌우로 문지르면 간지러워함 · 두 번 누르면 '오늘의 단어'를 읽어 줌
//  - 숨은 코드 ↑↑↓↓←→←→BA → 무지개 영이 · 입력칸 밖에서 hello / hi / love / yeongi 를 치면 대답
//  - 비밀번호에 Caps Lock 이 켜져 있으면 알려 줌 · 로그인 3번 실패하면 비밀번호 찾기 안내
//  - 오래 두면 잠꼬대, 주말·밤 인사
import { html, render, speak } from './ui.js';
import { burstAt, reduced } from './motion.js';
import { zoomOf } from './prefs.js';

const JOKES = [
  '오늘도 단어 하나 주우러 오셨군요!',
  '비밀번호는 안 봤어요. 진짜로요.',
  '저는 영단어를 먹고 자라요. 냠냠.',
  'apple 은 사과, I\'m sorry 도 사과.',
  '간지러워요! 공부하러 가요!',
  '틀린 단어는 오답 노트가 다 기억해요.',
  '하루 10단어면 1년에 3,650단어!',
  'Knowledge is power. 저는 그냥 귀여움 담당.',
  '끌어당겨도 돼요. 저 말랑해요.',
  '두 번 누르면 오늘의 단어를 알려 줘요.',
];
const NIGHT = '이 시간까지 공부라니… 존경해요.';
// 두 번 누르면 읽어 주는 '오늘의 단어'(날짜마다 다름)
const WORDS = [
  ['eureka', '알아냈다!'], ['grit', '끈기'], ['serendipity', '뜻밖의 행운'], ['curious', '호기심 많은'], ['brave', '용감한'],
  ['bloom', '꽃피다'], ['resilient', '회복력 있는'], ['wander', '거닐다'], ['vivid', '생생한'], ['cherish', '소중히 여기다'],
];
// 7번 쓰다듬을 때마다 돌아가며 나오는 숨은 단어
const SECRETS = [['petrichor', '비 온 뒤 흙냄새'], ['sonder', '모두에게 각자의 삶이 있음을 깨닫는 순간'], ['hygge', '아늑한 행복'], ['limerence', '푹 빠진 설렘']];
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const TYPED = { hello: 'Hello! 반가워요. 오늘도 한 단어씩!', hi: 'Hi! 저도 영어 할 줄 알아요. 조금요.', love: 'love = 사랑. 저도 영단마스터를 사랑해요!', yeongi: '부르셨어요? 영이 여기 있어요!' };

export function mountMascot(host) {
  render(host, html`
    <div class="fun" data-fun>
      <div class="fun__stage">
        <p class="fun__bubble" data-bubble role="status" aria-live="polite"></p>
        <button class="mascot" type="button" data-mascot aria-label="마스코트 영이 쓰다듬기">
          <img class="mascot__fallback" src="/brand/logo.svg" alt="" width="200" height="200">
        </button>
        <p class="fun__caption">영이 · 눌러 보고, 끌어 보고, 꾹 눌러 보세요</p>
      </div>
    </div>`);

  const fun = host.querySelector('[data-fun]');
  const mascot = host.querySelector('[data-mascot]');
  const bubble = host.querySelector('[data-bubble]');
  let pupils = [];
  // 캐릭터 SVG 를 인라인으로 넣어야 눈 애니메이션이 붙는다(<img> 로는 내부 요소를 못 움직임)
  fetch('/brand/mascot.svg').then(r => (r.ok ? r.text() : Promise.reject(r.status))).then(svg => {
    if (!mascot.isConnected) return;
    mascot.innerHTML = svg.replace(/<\?xml[^>]*\?>/, ''); // XML 선언만 제거(svg 태그 속성은 건드리지 않게)
    const el = mascot.querySelector('svg');
    el.removeAttribute('role'); el.setAttribute('aria-hidden', 'true'); el.setAttribute('focusable', 'false');
    pupils = [...mascot.querySelectorAll('.mascot__pupil')];
  }).catch(() => { /* 못 불러오면 로고 그림으로 대신 */ });
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const stop = t => { clearTimeout(t); timers.delete(t); };
  let pets = 0, sleepT = 0, sayT = 0, dreamT = 0, joke = Math.floor(Math.random() * JOKES.length);
  let fails = 0, kon = 0, typed = '', capsTold = false, taps = [], tickle = { n: 0, dir: 0, t: 0 };

  const say = (text, ms = 2600) => {
    bubble.textContent = text;
    bubble.classList.add('is-on');
    stop(sayT);
    sayT = later(() => bubble.classList.remove('is-on'), ms);
  };
  const play = (cls, ms = 900) => { // 클래스 애니메이션 1회
    if (reduced()) return;
    mascot.classList.remove(cls); void mascot.offsetWidth; mascot.classList.add(cls);
    later(() => mascot.classList.remove(cls), ms);
  };

  // 눈동자: 목표 지점(화면 좌표)을 향해 최대 5px
  const look = (x, y) => {
    for (const p of pupils) {
      const r = p.ownerSVGElement.getBoundingClientRect();
      const s = r.width / 200; // viewBox → 화면 배율
      const cx = r.left + Number(p.getAttribute('cx')) * s, cy = r.top + Number(p.getAttribute('cy')) * s;
      const a = Math.atan2(y - cy, x - cx), d = Math.min(5, Math.hypot(x - cx, y - cy) / 40);
      p.style.transform = `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px)`;
    }
  };
  let raf = 0, last = null;
  const onMove = e => {
    wake();
    if (document.activeElement?.matches?.('.auth-card input')) return; // 입력 중엔 입력칸을 본다
    last = e; if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; look(last.clientX, last.clientY); });
  };
  // 입력칸 캐럿 근처를 본다(글자 수에 비례해 오른쪽으로)
  const lookAtInput = el => {
    const r = el.getBoundingClientRect();
    look(r.left + Math.min(r.width - 12, 16 + (el.value?.length || 0) * 8), r.top + r.height / 2);
  };

  // 졸기: 15초 동안 아무 일 없으면, 25초 더 지나면 잠꼬대
  const wake = () => {
    if (fun.classList.contains('is-sleepy')) { fun.classList.remove('is-sleepy'); say('앗, 안 잤어요! 진짜예요.'); }
    stop(sleepT); stop(dreamT);
    sleepT = later(() => {
      fun.classList.add('is-sleepy'); bubble.classList.remove('is-on');
      dreamT = later(() => { const [en] = WORDS[Math.floor(Math.random() * WORDS.length)]; say(`음냐… ${en}… 외웠다…`, 3200); }, 25000);
    }, 15000);
  };

  const onFocusIn = e => {
    const el = e.target;
    if (!el.matches?.('.auth-card input')) return;
    wake();
    const shy = el.type === 'password';
    fun.classList.toggle('is-shy', shy);
    if (shy) say('안 봐요, 안 봐요!', 1800); else lookAtInput(el);
  };
  const onFocusOut = e => { if (e.target.type === 'password') fun.classList.remove('is-shy'); };
  const onInput = e => {
    const el = e.target;
    if (!el.matches?.('.auth-card input')) return;
    wake();
    if (el.type !== 'password' && el.type !== 'checkbox') lookAtInput(el);
    mascot.classList.toggle('is-nod', !mascot.classList.contains('is-nod')); // 타자에 맞춰 끄덕끄덕
    if (el.name === 'username' && el.value.length === 2 && !el.dataset.cheered) { el.dataset.cheered = '1'; say(`${el.value}… 멋진 이름이에요!`); }
  };

  // 끌기 · 꾹 누르기(포인터). 화면 좌표 차이를 배율(zoomOf, 14 화면 맞춤)로 나눠 CSS 이동량으로
  let drag = null, dragged = false, puffed = false, holdT = 0;
  const onDown = e => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, moved: false, dx: 0, dy: 0 };
    stop(holdT);
    holdT = later(() => { if (drag && !drag.moved && !reduced()) { puffed = true; mascot.classList.add('is-puff'); say('뿌우우우—', 1400); } }, 650);
  };
  const onDragMove = e => {
    if (!drag) return;
    const z = zoomOf(), dx = (e.clientX - drag.x) / z, dy = (e.clientY - drag.y) / z;
    if (!drag.moved && Math.hypot(dx, dy) < 8) return;
    if (!drag.moved) { drag.moved = true; dragged = true; stop(holdT); }
    if (reduced()) return;
    const k = Math.min(1, 90 / (Math.hypot(dx, dy) || 1)); // 최대 90px 까지만 늘어남
    drag.dx = dx * k; drag.dy = dy * k;
    mascot.classList.add('is-drag');
    mascot.style.translate = `${drag.dx}px ${drag.dy}px`;
    mascot.style.scale = `${1 + Math.abs(drag.dx) / 500} ${1 + Math.abs(drag.dy) / 500}`;
  };
  const onUp = () => {
    stop(holdT);
    if (!drag) return;
    if (drag.moved) {
      const far = Math.hypot(drag.dx, drag.dy) > 60;
      mascot.classList.remove('is-drag'); mascot.style.translate = ''; mascot.style.scale = '';
      say(far ? '으아아— 날아갈 뻔했어요!' : '어딜 데려가요~', 2000);
    }
    if (mascot.classList.contains('is-puff')) { mascot.classList.remove('is-puff'); play('is-pop', 520); burstAt(mascot, 16); say('펑! 바람 빠졌어요.', 1800); }
    drag = null;
  };

  const onPet = () => {
    if (dragged) { dragged = false; return; } // 끌었다 놓은 것·꾹 누른 것은 쓰다듬기가 아님
    if (puffed) { puffed = false; return; }
    wake();
    pets++;
    // 빠르게 5번(1.6초 안) → 어지러움
    const now = Date.now(); taps = taps.filter(t => now - t < 1600); taps.push(now);
    if (taps.length >= 5) { taps = []; play('is-dizzy', 1600); say('@_@ 어지러워요… 천천히요…', 2200); return; }
    if (pets % 7 === 0) {
      const [w, ko] = SECRETS[(pets / 7 - 1) % SECRETS.length];
      play('is-spin');
      say(`숨은 단어 발견! ${w} = ${ko}`, 4200);
      burstAt(mascot, 30);
      return;
    }
    play('is-pop');
    joke = (joke + 1) % JOKES.length;
    say(pets >= 4 ? `${JOKES[joke]} (${7 - (pets % 7)}번 더…?)` : JOKES[joke]);
  };
  // 두 번 누르기: 오늘의 단어(같은 날엔 같은 단어)를 읽어 줌
  const onDbl = () => {
    const d = new Date(), [en, ko] = WORDS[(d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate()) % WORDS.length];
    play('is-jump', 800); say(`오늘의 단어: ${en} = ${ko}`, 3600); speak(en);
  };
  // 간지럼: 마스코트 위에서 좌우로 빠르게 문지르기(1.2초 안에 방향이 10번 바뀌면)
  const onRub = e => {
    if (drag || !e.movementX) return;
    const dir = Math.sign(e.movementX), now = Date.now();
    if (now - tickle.t > 1200) tickle = { n: 0, dir, t: now };
    if (dir !== tickle.dir) { tickle.n++; tickle.dir = dir; }
    if (tickle.n >= 10) { tickle = { n: 0, dir: 0, t: 0 }; play('is-giggle', 1000); say('히히히 간지러워요! 그만~', 1800); }
  };
  // 키보드: Caps Lock 안내, 숨은 코드, 입력칸 밖에서 친 단어
  const onKey = e => {
    const inField = e.target.matches?.('input, textarea, select');
    if (inField && e.target.type === 'password' && e.getModifierState?.('CapsLock') && !capsTold) { capsTold = true; say('Caps Lock 이 켜져 있어요! 대문자로 입력되고 있어요.', 3000); }
    if (inField || !e.key) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    kon = k === KONAMI[kon] ? kon + 1 : k === KONAMI[0] ? 1 : 0;
    if (kon === KONAMI.length) {
      kon = 0; fun.classList.add('is-rainbow'); later(() => fun.classList.remove('is-rainbow'), 8000);
      play('is-spin'); burstAt(mascot, 40); say('비밀 코드 발견! 무지개 영이 모드 8초!', 3200);
      return;
    }
    if (k.length !== 1) return;
    typed = (typed + k).slice(-8);
    const hit = Object.keys(TYPED).find(w => typed.endsWith(w));
    if (hit) { typed = ''; wake(); play('is-jump', 800); say(TYPED[hit], 2600); }
  };

  mascot.addEventListener('click', onPet);
  mascot.addEventListener('dblclick', onDbl);
  mascot.addEventListener('pointerdown', onDown);
  mascot.addEventListener('pointermove', onRub);
  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointermove', onDragMove, { passive: true });
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
  document.addEventListener('keydown', onKey);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  document.addEventListener('input', onInput);

  // 첫인사: 시간대·요일에 따라
  const h = new Date().getHours(), weekend = [0, 6].includes(new Date().getDay());
  later(() => say(h < 5 ? NIGHT : weekend ? '주말에도 공부라니, 정말 대단해요!' : h < 12 ? '좋은 아침이에요! 오늘 단어 하나만 같이 외워요.' : '안녕하세요! 저를 눌러보세요.'), 700);
  wake();

  return {
    react(kind) { // 'happy' | 'sad'
      wake();
      if (kind === 'happy') { play('is-jump'); say('어서 와요! 오늘도 화이팅!'); }
      else {
        fails++; play('is-no');
        say(fails >= 3 ? "혹시 비밀번호가 기억 안 나세요? '비밀번호를 잊으셨나요?'를 눌러 보세요." : '으앗, 다시 한번 해볼까요?', fails >= 3 ? 4200 : 2600);
      }
    },
    destroy() {
      timers.forEach(clearTimeout); timers.clear();
      if (raf) cancelAnimationFrame(raf);
      for (const [ev, fn] of [['pointermove', onMove], ['pointermove', onDragMove], ['pointerup', onUp], ['pointercancel', onUp], ['keydown', onKey], ['focusin', onFocusIn], ['focusout', onFocusOut], ['input', onInput]]) document.removeEventListener(ev, fn);
    },
  };
}
