// 로그인 화면 오른쪽의 마스코트 '영이'와 장난감들(2026-11-20 사용자 요청: 로그인할 때 소소한 웃음을 주는 이스터에그·기믹).
// 화면에 붙이면 스스로 움직이고, 로그인 결과는 react('happy'|'sad') 로 알려준다. 해제 함수 반환.
//  - 눈동자가 포인터를, 입력 중에는 입력칸을 따라본다
//  - 비밀번호 칸에 들어가면 두 손으로 눈을 가린다(안 봤어요)
//  - 쓰다듬으면(클릭) 아무 말이나 한다 · 7번째에는 숨은 단어와 색종이
//  - 가만히 두면 졸다가, 움직이면 깬다
//  - 떠다니는 단어 카드는 올리면 뒤집혀 뜻이 보이고, 누르면 발음
import { html, render, speak } from './ui.js';
import { burstAt, reduced } from './motion.js';

const JOKES = [
  '오늘도 단어 하나 주우러 오셨군요!',
  '비밀번호는 안 봤어요. 진짜로요.',
  '저는 영단어를 먹고 자라요. 냠냠.',
  'apple 은 사과, I\'m sorry 도 사과.',
  '간지러워요! 공부하러 가요!',
  '틀린 단어는 오답 노트가 다 기억해요.',
  '하루 10단어면 1년에 3,650단어!',
  'Knowledge is power. 저는 그냥 귀여움 담당.',
];
const NIGHT = '이 시간까지 공부라니… 존경해요.';
const WORDS = [
  ['eureka', '알아냈다!'], ['grit', '끈기'], ['serendipity', '뜻밖의 행운'],
  ['curious', '호기심 많은'], ['brave', '용감한'], ['bloom', '꽃피다'],
];
const SECRET = { word: 'petrichor', ko: '비 온 뒤 흙냄새' };

export function mountMascot(host) {
  render(host, html`
    <div class="fun" data-fun>
      <div class="fun__words" aria-hidden="true">${WORDS.map(([en, ko], k) => html`
        <button class="fun-word" type="button" tabindex="-1" style="--k:${k}" data-word="${en}">
          <span class="fun-word__inner"><span class="fun-word__face" lang="en">${en}</span><span class="fun-word__face fun-word__face--back">${ko}</span></span>
        </button>`)}</div>
      <div class="fun__stage">
        <p class="fun__bubble" data-bubble role="status" aria-live="polite"></p>
        <button class="mascot" type="button" data-mascot aria-label="마스코트 영이 쓰다듬기">
          <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="mascot-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FB7185"/><stop offset=".55" stop-color="#D946EF"/><stop offset="1" stop-color="#8B5CF6"/></linearGradient>
            </defs>
            <ellipse class="mascot__shadow" cx="100" cy="186" rx="52" ry="8"/>
            <g class="mascot__body">
              <path d="M100 22c46 0 74 34 74 82 0 46-30 74-74 74s-74-28-74-74c0-48 28-82 74-82z" fill="url(#mascot-body)"/>
              <path class="mascot__shine" d="M62 52c10-12 24-17 36-17" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".45"/>
              <g class="mascot__eyes">
                <g class="mascot__eye"><ellipse cx="74" cy="98" rx="17" ry="19" fill="#fff"/><circle class="mascot__pupil" cx="74" cy="100" r="8" fill="#2A1033"/><circle class="mascot__glint" cx="77" cy="96" r="2.6" fill="#fff"/></g>
                <g class="mascot__eye"><ellipse cx="126" cy="98" rx="17" ry="19" fill="#fff"/><circle class="mascot__pupil" cx="126" cy="100" r="8" fill="#2A1033"/><circle class="mascot__glint" cx="129" cy="96" r="2.6" fill="#fff"/></g>
              </g>
              <path class="mascot__lid" d="M57 99q17 10 34 0M109 99q17 10 34 0" fill="none" stroke="#2A1033" stroke-width="4" stroke-linecap="round"/>
              <ellipse cx="58" cy="124" rx="10" ry="6" fill="#FFE4E8" opacity=".55"/><ellipse cx="142" cy="124" rx="10" ry="6" fill="#FFE4E8" opacity=".55"/>
              <path class="mascot__mouth" d="M88 128q12 12 24 0" fill="none" stroke="#2A1033" stroke-width="4" stroke-linecap="round"/>
              <g class="mascot__hands"><ellipse class="mascot__hand mascot__hand--l" cx="74" cy="166" rx="20" ry="15" fill="#F472B6"/><ellipse class="mascot__hand mascot__hand--r" cx="126" cy="166" rx="20" ry="15" fill="#A78BFA"/></g>
            </g>
            <g class="mascot__zzz" fill="#8B5CF6" font-weight="800"><text x="150" y="44" font-size="18">z</text><text x="164" y="28" font-size="24">Z</text></g>
          </svg>
        </button>
        <p class="fun__caption">영이 · 영단마스터 마스코트</p>
      </div>
    </div>`);

  const fun = host.querySelector('[data-fun]');
  const mascot = host.querySelector('[data-mascot]');
  const bubble = host.querySelector('[data-bubble]');
  const pupils = [...host.querySelectorAll('.mascot__pupil')];
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  let pets = 0, sleepT = 0, sayT = 0, joke = Math.floor(Math.random() * JOKES.length);

  const say = (text, ms = 2600) => {
    bubble.textContent = text;
    bubble.classList.add('is-on');
    clearTimeout(sayT); timers.delete(sayT);
    sayT = later(() => bubble.classList.remove('is-on'), ms);
  };
  const play = cls => { // 클래스 애니메이션 1회
    if (reduced()) return;
    mascot.classList.remove(cls); void mascot.offsetWidth; mascot.classList.add(cls);
    later(() => mascot.classList.remove(cls), 900);
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

  // 졸기: 15초 동안 아무 일 없으면
  const wake = () => {
    if (fun.classList.contains('is-sleepy')) { fun.classList.remove('is-sleepy'); say('앗, 안 잤어요! 진짜예요.'); }
    clearTimeout(sleepT); timers.delete(sleepT);
    sleepT = later(() => { fun.classList.add('is-sleepy'); bubble.classList.remove('is-on'); }, 15000);
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

  const onPet = () => {
    wake();
    pets++;
    if (pets % 7 === 0) {
      play('is-spin');
      say(`숨은 단어 발견! ${SECRET.word} = ${SECRET.ko}`, 4200);
      burstAt(mascot, 30);
      return;
    }
    play('is-pop');
    joke = (joke + 1) % JOKES.length;
    say(pets >= 4 ? `${JOKES[joke]} (${7 - (pets % 7)}번 더…?)` : JOKES[joke]);
  };
  const onWord = e => {
    const b = e.target.closest('[data-word]');
    if (!b) return;
    b.classList.toggle('is-flipped');
    speak(b.dataset.word);
  };

  mascot.addEventListener('click', onPet);
  fun.addEventListener('click', onWord);
  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  document.addEventListener('input', onInput);

  // 첫인사: 시간대에 따라
  const h = new Date().getHours();
  later(() => say(h < 5 ? NIGHT : h < 12 ? '좋은 아침이에요! 오늘 단어 하나만 같이 외워요.' : '안녕하세요! 저를 눌러보세요.'), 700);
  wake();

  return {
    react(kind) { // 'happy' | 'sad'
      wake();
      if (kind === 'happy') { play('is-jump'); say('어서 와요! 오늘도 화이팅!'); }
      else { play('is-no'); say('으앗, 다시 한번 해볼까요?'); }
    },
    destroy() {
      timers.forEach(clearTimeout); timers.clear();
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('input', onInput);
    },
  };
}
