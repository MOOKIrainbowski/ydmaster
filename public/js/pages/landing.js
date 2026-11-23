// 랜딩 — 02 디자인 리프레시의 첫인상(02 §3.5, D8: Claude 소유).
// 장식(데모 카드·흐르는 단어·벤토 미니 화면)은 aria-hidden, 읽을 내용은 실제 텍스트로 둔다.
import { html, render, icon, on, logoMark } from '../ui.js';
import { reduced } from '../motion.js';

const WORDS = [
  ['resilient', '회복력 있는'], ['ubiquitous', '어디에나 있는'], ['give up', '포기하다'], ['abundant', '풍부한'],
  ['perspective', '관점'], ['take part in', '참여하다'], ['inevitable', '피할 수 없는'], ['contribute', '기여하다'],
  ['sustainable', '지속 가능한'], ['curiosity', '호기심'], ['overcome', '극복하다'], ['distinguish', '구별하다'],
  ['emerge', '나타나다'], ['consequence', '결과'], ['deliberately', '일부러'], ['a variety of', '다양한'],
];
const MODES = [
  ['book', '뜻 고르기'], ['layers', '단어 고르기'], ['edit', '뜻 쓰기'], ['text', '철자 쓰기'], ['volume', '듣고 쓰기'],
  ['target', '핵심 표현 빈칸'], ['lightbulb', '무작위 빈칸'], ['check', '어법·어휘 고르기'], ['arrowUpDown', '어순 배열'],
  ['layers', '문장 순서'], ['edit', '해석 보고 영작'],
];

// 키네틱 헤드라인: 글자마다 span(--c = 등장 순번). 화면 낭독은 h1 전체 글을 읽으므로 span 은 시각용
const chars = (text, start = 0) => [...text].map((c, k) => c === ' ' ? ' ' : html`<span class="lp-ch" style="--c:${start + k}">${c}</span>`);
// 스크롤로 한 단어씩 밝아지는 문장: 단어마다 --w(순번)·--n(총수)
const MANIFESTO = '단어 하나에서 시작해 문장을 이해하고, 교과서 본문 전체를 내 것으로. 영단마스터는 외우는 과정을 시험으로, 시험을 다시 복습으로 바꿔요.';
const manifesto = () => { const ws = MANIFESTO.split(' '); return ws.map((w, k) => html`<span class="lp-manifesto__w" style="--w:${k};--n:${ws.length}">${w}</span> `); };
const KINETIC_EN = ['VOCAB', 'PASSAGE', 'GRAMMAR', 'ORDER', 'LISTEN', 'WRITE', 'MASTER'];
const KINETIC_KO = ['단어', '본문', '어법', '어순', '듣기', '영작', '내신'];
const kineticRow = (words, cls) => html`<div class="lp-kinetic__row ${cls}">${[...words, ...words].map((w, k) => html`<span class="${k % 2 ? 'lp-kinetic__outline' : 'text-grad'}">${w}</span><i aria-hidden="true">✦</i>`)}</div>`;

const wordPill = ([en, ko]) => html`<span class="lp-word"><b class="lp-en">${en}</b><span>${ko}</span></span>`;
const marqueeRow = (list, rev) => html`<div class="lp-marquee__track${rev ? ' lp-marquee__track--rev' : ''}">${[...list, ...list].map(wordPill)}</div>`;

export default {
  title: '단어부터 내신 본문까지',
  auth: false,
  render(root) {
    render(root, html`
      <div class="lp">
        <div class="lp-progress" aria-hidden="true"></div>
        <!-- ① 히어로 -->
        <section class="lp-hero" aria-labelledby="lp-title">
          <div class="lp-hero__copy">
            <p class="lp-eyebrow reveal"><span class="lp-eyebrow__dot" aria-hidden="true"></span>단어부터 내신 본문까지 · 11가지 시험</p>
            <h1 class="lp-title" id="lp-title">
              <span class="lp-title__line">${chars('영어')}
                <span class="lp-rotator" aria-hidden="true"><span class="text-grad">단어</span><span class="text-grad">본문</span><span class="text-grad">내신</span><span class="text-grad">어법</span></span><span class="sr-only">단어·본문·내신·어법</span>,</span>
              <span class="lp-title__line">${chars('이제 제대로', 3)}</span>
              <span class="lp-title__line"><span class="lp-en lp-title__serif lp-ch" style="--c:9">Master</span> ${chars('하세요.', 10)}</span>
            </h1>
            <p class="lp-lead reveal" style="--i:4">내 단어장과 교과서 본문을 넣으면 시험이 만들어지고, <br class="lp-br">틀린 문제는 저절로 다시 나와요. 내신 대비가 게임처럼.</p>
            <div class="lp-cta-row reveal" style="--i:5">
              <a class="lp-cta lp-cta--primary" href="#/login?tab=register">무료로 시작하기 ${icon('chevronRight', 20)}</a>
              <a class="lp-cta lp-cta--glass glass" href="#lp-how" data-scroll>어떻게 공부하나요?</a>
            </div>
            <ul class="lp-trust reveal" style="--i:6" aria-label="특징">
              <li>${icon('shield', 16)} 서버가 채점해 공정한 랭킹</li>
              <li>${icon('refresh', 16)} 오답 자동 복습</li>
              <li>${icon('users', 16)} 친구와 함께</li>
            </ul>
          </div>

          <div class="lp-visual" aria-hidden="true">
            <div class="lp-glow"></div>
            <!-- 메인 데모: 핵심 표현 빈칸 문제가 스스로 풀린다 -->
            <div class="lp-card lp-card--main glass" style="--depth:1">
              <div class="lp-card__bar"><span class="lp-dots"><i></i><i></i><i></i></span><span class="lp-card__count">3 / 10</span></div>
              <div class="lp-mini-progress"><i></i></div>
              <p class="lp-card__task">빈칸에 들어갈 표현을 쓰세요</p>
              <p class="lp-card__sentence">Many teens <span class="lp-blank"><span class="lp-blank__text">give up</span><i class="lp-caret"></i></span> their dreams too early.</p>
              <p class="lp-card__ko">많은 십대가 꿈을 너무 일찍 포기한다.</p>
              <div class="lp-card__result"><span class="lp-check">${icon('check', 18)}</span><span>정답이에요</span><span class="lp-plus">+1 외운 문항</span></div>
            </div>
            <!-- 떠 있는 카드들 -->
            <div class="lp-float lp-float--streak glass" style="--depth:2.2">
              <span class="lp-flame">${icon('flame', 22)}</span>
              <span><b>12</b>일 연속 학습</span>
            </div>
            <div class="lp-float lp-float--word glass" style="--depth:1.6">
              <span class="lp-float__en lp-en">ubiquitous</span>
              <span class="lp-float__ko">어디에나 있는</span>
              <span class="lp-float__speak">${icon('volume', 16)}</span>
            </div>
            <div class="lp-float lp-float--ring glass" style="--depth:2.6">
              <svg viewBox="0 0 44 44" class="lp-ring"><defs><linearGradient id="lp-ring-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E11D48"/><stop offset=".5" stop-color="#C026D3"/><stop offset="1" stop-color="#7C3AED"/></linearGradient></defs><circle cx="22" cy="22" r="18" class="lp-ring__track"/><circle cx="22" cy="22" r="18" class="lp-ring__bar"/></svg>
              <span><b>92</b>점</span>
            </div>
            <div class="lp-float lp-float--chips glass" style="--depth:1.3">
              <span class="lp-chip">They</span><span class="lp-chip lp-chip--hot">are</span><span class="lp-chip">afraid</span>
            </div>
          </div>
        </section>

        <!-- ② 흐르는 단어 띠 -->
        <section class="lp-marquee" aria-hidden="true">
          ${marqueeRow(WORDS.slice(0, 8))}
          ${marqueeRow(WORDS.slice(8), true)}
        </section>

        <!-- ②-b 스크롤하면 한 단어씩 밝아지는 문장 -->
        <section class="lp-manifesto" aria-label="영단마스터 소개">
          <p class="lp-manifesto__text">${manifesto()}</p>
        </section>

        <!-- ③ 벤토 기능 소개 -->
        <section class="lp-section" aria-labelledby="lp-feat">
          <header class="lp-head reveal">
            <p class="lp-kicker">한 곳에서 끝내는 영어 암기</p>
            <h2 class="lp-h2" id="lp-feat">외우는 방법은 <span class="text-grad">11가지</span>,<br>목표는 하나 — 내신 만점</h2>
          </header>
          <div class="lp-bento">
            <article class="lp-cell lp-cell--modes spotlight reveal" style="--i:0">
              <h3 class="lp-cell__title">시험 11가지, 고르기만 하세요</h3>
              <p class="lp-cell__desc">객관식부터 듣고 쓰기, 어순 배열, 해석 보고 영작까지. 같은 세트로 매번 다른 시험을 봐요.</p>
              <ul class="lp-modes" aria-label="시험 종류">${MODES.map(([ic, label], k) => html`<li class="lp-mode" style="--k:${k}">${icon(ic, 16)}<span>${label}</span></li>`)}</ul>
              <div class="lp-quiz" aria-hidden="true">
                <div class="lp-quiz__q"><span class="lp-quiz__tag">뜻 고르기 · 4 / 20</span><span class="lp-en lp-quiz__word">inevitable</span></div>
                <div class="lp-quiz__opts">
                  <span class="lp-quiz__opt"><i>1</i>지속 가능한</span>
                  <span class="lp-quiz__opt lp-quiz__opt--right"><i>2</i>피할 수 없는<b>${icon('check', 16)}</b></span>
                  <span class="lp-quiz__opt"><i>3</i>풍부한</span>
                  <span class="lp-quiz__opt"><i>4</i>구별하다</span>
                </div>
              </div>
            </article>

            <article class="lp-cell lp-cell--mark spotlight reveal" style="--i:1">
              <h3 class="lp-cell__title">본문에 표시만 하면 시험이 돼요</h3>
              <p class="lp-cell__desc">핵심 표현과 어법 선택지를 눌러서 표시하면 빈칸·어법 문제가 자동으로 만들어져요.</p>
              <p class="lp-demo-sentence" aria-hidden="true">Every morning, Mina <span class="lp-choice"><span class="is-right">walks</span><span>walk</span></span> through a <mark class="lp-key">small park</mark> on her way to school.</p>
            </article>

            <article class="lp-cell lp-cell--wrong spotlight reveal" style="--i:2">
              <div class="lp-cell__icon lp-cell__icon--hot">${icon('target', 24)}</div>
              <h3 class="lp-cell__title">틀린 건 저절로 다시</h3>
              <p class="lp-cell__desc">틀린 문항은 오답 목록에 모이고, 오답 복습에서 맞히면 졸업해요.</p>
              <div class="lp-grad-steps" aria-hidden="true"><span class="is-bad">${icon('x', 14)}</span><span class="is-ok">${icon('check', 14)}</span><span class="is-ok">${icon('check', 14)}</span><b>졸업!</b></div>
            </article>

            <article class="lp-cell lp-cell--rank spotlight reveal" style="--i:3">
              <h3 class="lp-cell__title">친구와 함께하는 주간 랭킹</h3>
              <p class="lp-cell__desc">이번 주에 새로 외운 문항 수로 겨뤄요. 같은 시험을 반복해 점수를 부풀릴 수 없어요.</p>
              <ol class="lp-rank" aria-hidden="true">
                <li><span class="lp-medal lp-medal--1">1</span><span>지우</span><span class="lp-bar" style="--w:92%"></span><b>184</b></li>
                <li><span class="lp-medal lp-medal--2">2</span><span>민서</span><span class="lp-bar" style="--w:74%"></span><b>148</b></li>
                <li><span class="lp-medal lp-medal--3">3</span><span>나</span><span class="lp-bar lp-bar--me" style="--w:61%"></span><b>122</b></li>
              </ol>
            </article>

            <article class="lp-cell lp-cell--flip spotlight reveal" style="--i:4" tabindex="0" aria-label="단어 카드 예시: resilient, 회복력 있는">
              <div class="lp-flip" aria-hidden="true">
                <div class="lp-flip__face"><span class="lp-en">resilient</span><small>눌러서 뒤집기</small></div>
                <div class="lp-flip__face lp-flip__face--back"><span>회복력 있는</span><small>${icon('volume', 14)} 발음 듣기</small></div>
              </div>
              <h3 class="lp-cell__title">학습 카드 · 발음</h3>
            </article>

            <article class="lp-cell lp-cell--order spotlight reveal" style="--i:5">
              <div class="lp-cell__icon">${icon('arrowUpDown', 24)}</div>
              <h3 class="lp-cell__title">어순·문장 순서 배열</h3>
              <div class="lp-order" aria-hidden="true"><span>small</span><span>Mina</span><span>actions</span><span>believes</span></div>
            </article>

            <article class="lp-cell lp-cell--pwa spotlight reveal" style="--i:6">
              <div class="lp-cell__icon">${icon('home', 24)}</div>
              <h3 class="lp-cell__title">설치 없이 어디서나</h3>
              <p class="lp-cell__desc">휴대폰 홈 화면에 추가하면 앱처럼 열려요.</p>
            </article>
          </div>
        </section>

        <!-- ③-b 키네틱 타이포 띠(스크롤 따라 좌우로) -->
        <section class="lp-kinetic" aria-hidden="true">
          ${kineticRow(KINETIC_EN, 'lp-kinetic__row--l')}
          ${kineticRow(KINETIC_KO, 'lp-kinetic__row--r')}
        </section>

        <!-- ④ 공부 흐름: 고정 스토리(왼쪽 단계가 스크롤되면 오른쪽 휴대폰 화면이 바뀜) -->
        <section class="lp-section lp-story" id="lp-how" aria-labelledby="lp-how-title">
          <header class="lp-head reveal">
            <p class="lp-kicker">공부는 이렇게</p>
            <h2 class="lp-h2" id="lp-how-title">만들고, 풀고, <span class="text-grad">다시 풀면</span> 끝</h2>
          </header>
          <div class="lp-story__grid">
            <ol class="lp-story__steps">
              <li class="lp-story__step is-active" data-step="0"><span class="lp-step__num">1</span><h3>세트 만들기</h3><p>단어는 붙여넣기·엑셀로, 본문은 문단째 붙여넣으면 문장별로 정리돼요. 핵심 표현은 단어를 눌러 표시하면 끝.</p></li>
              <li class="lp-story__step" data-step="1"><span class="lp-step__num">2</span><h3>시험 보기</h3><p>11가지 방식 중 하나를 고르면 서버가 바로 채점하고 정답을 보여줘요. 연속으로 맞히면 콤보가 쌓여요.</p></li>
              <li class="lp-story__step" data-step="2"><span class="lp-step__num">3</span><h3>오답 복습</h3><p>틀린 것만 모아 다시. 오답 복습에서 맞히면 오답 목록에서 졸업하고, 이번 주 외운 문항이 랭킹에 올라가요.</p></li>
            </ol>
            <div class="lp-story__stage" aria-hidden="true">
              <div class="lp-phone glass" data-screen="0">
                <div class="lp-phone__notch"></div>
                <div class="lp-screen lp-screen--make">
                  <p class="lp-screen__title">새 본문 세트</p>
                  <div class="lp-paste">Every morning, Mina walks through a small park. She notices plastic cups near the benches.</div>
                  <div class="lp-screen__arrow">${icon('chevronDown', 18)} 문장별로 정리</div>
                  <p class="lp-sent"><b>1</b><span><mark>Every morning</mark>, Mina walks through a small park.</span></p>
                  <p class="lp-sent"><b>2</b><span>She notices <mark>plastic cups</mark> near the benches.</span></p>
                </div>
                <div class="lp-screen lp-screen--test">
                  <div class="lp-mini-progress"><i></i></div>
                  <p class="lp-screen__title">핵심 표현 빈칸 · 3 / 10 <span class="lp-combo">${icon('flame', 14)}<b>3</b>연속</span></p>
                  <p class="lp-screen__sentence">She notices <span class="lp-blank-done">plastic cups</span> near the benches.</p>
                  <div class="lp-screen__ok">${icon('check', 16)} 정답이에요</div>
                </div>
                <div class="lp-screen lp-screen--review">
                  <svg viewBox="0 0 44 44" class="lp-ring lp-ring--big"><circle cx="22" cy="22" r="18" class="lp-ring__track"/><circle cx="22" cy="22" r="18" class="lp-ring__bar lp-ring__bar--still"/></svg>
                  <p class="lp-screen__score"><b>92</b>점 · 잘했어요</p>
                  <ul class="lp-review">
                    <li><span class="is-ok">${icon('check', 12)}</span>give up<em>졸업</em></li>
                    <li><span class="is-ok">${icon('check', 12)}</span>plastic cups<em>졸업</em></li>
                    <li><span class="is-bad">${icon('x', 12)}</span>reusable<em>복습 1/2</em></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ④-b 숫자로 보는 영단마스터(실제 한도·사양) -->
        <section class="lp-stats" aria-label="숫자로 보는 영단마스터">
          <div class="lp-stat glass-card reveal" style="--i:0"><b data-count="11">0</b><span>가지 시험 방식</span></div>
          <div class="lp-stat glass-card reveal" style="--i:1"><b data-count="500">0</b><span>단어까지 한 세트에</span></div>
          <div class="lp-stat glass-card reveal" style="--i:2"><b data-count="80">0</b><span>문장까지 한 본문에</span></div>
          <div class="lp-stat glass-card reveal" style="--i:3"><b>0<small>원</small></b><span>모든 기능 무료</span></div>
        </section>

        <!-- ⑤ 마무리 CTA -->
        <section class="lp-final reveal" aria-labelledby="lp-final-title">
          <h2 class="lp-final__title" id="lp-final-title">오늘 외운 한 문장이<br>내신 점수가 됩니다</h2>
          <p class="lp-final__lead">지금 가입하고 첫 세트를 만들어 보세요. 무료예요.</p>
          <a class="lp-cta lp-cta--white" href="#/login?tab=register">지금 시작하기 ${icon('chevronRight', 20)}</a>
        </section>

        <footer class="lp-footer">
          <span class="lp-footer__brand">${logoMark()} 영단마스터</span>
          <a href="/privacy.html">개인정보처리방침</a>
          <span class="lp-footer__copy">© ${new Date().getFullYear()} 영단마스터</span>
        </footer>
      </div>`);

    const offs = [];
    // 히어로 시차(parallax): 포인터 위치를 -1~1 로 바꿔 카드마다 깊이만큼 움직인다
    const hero = root.querySelector('.lp-hero');
    if (!reduced() && matchMedia('(hover: hover)').matches) {
      let raf = 0;
      const move = e => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = hero.getBoundingClientRect();
          hero.style.setProperty('--px', ((e.clientX - r.left) / r.width * 2 - 1).toFixed(3));
          hero.style.setProperty('--py', ((e.clientY - r.top) / r.height * 2 - 1).toFixed(3));
        });
      };
      const leave = () => { hero.style.setProperty('--px', 0); hero.style.setProperty('--py', 0); };
      hero.addEventListener('pointermove', move);
      hero.addEventListener('pointerleave', leave);
      offs.push(() => { hero.removeEventListener('pointermove', move); hero.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf); });
    }
    // 고정 스토리: 화면 가운데 들어온 단계로 휴대폰 화면 전환
    const phone = root.querySelector('.lp-phone');
    const steps = [...root.querySelectorAll('.lp-story__step')];
    const sio = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const n = e.target.dataset.step;
        phone.dataset.screen = n;
        steps.forEach(st => st.classList.toggle('is-active', st.dataset.step === n));
      }
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach(st => sio.observe(st));
    offs.push(() => sio.disconnect());

    // "어떻게 공부하나요?" → 부드럽게 스크롤(해시 라우터를 건드리지 않음)
    offs.push(on(root, 'click', '[data-scroll]', e => {
      e.preventDefault();
      root.querySelector('#lp-how')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    }));
    // 단어 카드: 눌러 뒤집기(키보드 Enter/Space 포함)
    const flip = root.querySelector('.lp-cell--flip');
    const toggle = () => flip.classList.toggle('is-flipped');
    offs.push(on(root, 'click', '.lp-cell--flip', toggle));
    offs.push(on(root, 'keydown', '.lp-cell--flip', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }));
    return () => offs.forEach(f => f());
  },
};

