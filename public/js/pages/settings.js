// 설정(06, 2026-11-20 사용자 요청: 상단 설정 버튼 → 이용 편의·접근 설정 페이지).
// 바꾸는 즉시 적용·저장(이 기기), 위쪽 미리보기 카드로 바로 확인. 효과음은 시험 화면 버튼과 같은 값(game.js).
import { html, render, on, icon, speak, toast, confirmDialog } from '../ui.js';
import { getPrefs, setPref, resetPrefs, getTheme, setTheme } from '../prefs.js';
import { sfxOn, setSfx, sfx } from '../game.js';

const seg = (name, value, opts) => html`<div class="seg seg--sm" role="radiogroup">${opts.map(([v, label]) => html`
  <label class="seg__opt"><input type="radio" name="${name}" value="${v}" ${String(v) === String(value) ? 'checked' : ''}><span>${label}</span></label>`)}</div>`;
const toggle = (name, on_, label, desc) => html`<label class="set-toggle"><span><b>${label}</b><small>${desc}</small></span>
  <input type="checkbox" role="switch" name="${name}" ${on_ ? 'checked' : ''}><i aria-hidden="true"></i></label>`;
const row = (label, desc, control) => html`<div class="set-row"><div class="set-row__text"><b>${label}</b><small>${desc}</small></div>${control}</div>`;

export default {
  title: '설정', auth: false,
  render(root) {
    const draw = () => {
      const p = getPrefs();
      render(root, html`<div class="page page--narrow settings"><section class="section stack">
        <div class="section__head"><div><h1 class="section__title">설정</h1><p class="muted">이 기기(브라우저)에만 저장되고 바로 적용돼요.</p></div>
          <button class="btn btn--ghost btn--sm" data-reset>${icon('refresh', 16)}기본값으로</button></div>

        <div class="card set-preview" aria-hidden="true">
          <p class="set-preview__kicker">미리보기</p>
          <p class="set-preview__term" lang="en">serendipity</p>
          <p>뜻밖의 행운 — <a href="#/settings">링크 예시</a>와 본문 글자가 이렇게 보여요.</p>
          <div class="btn-row"><span class="btn btn--primary btn--sm">버튼</span><span class="badge">배지</span></div>
        </div>

        <article class="card set-group"><h2 class="set-group__title">${icon('eye', 20)}화면</h2>
          ${row('테마', '기기 설정을 따르거나 밝게·어둡게 고정해요.', seg('theme', getTheme(), [['system', '기기 설정'], ['light', '밝게'], ['dark', '어둡게']]))}
          ${row('글자·화면 크기', '모든 글자와 버튼을 함께 키우거나 줄여요.', seg('font', p.font, [['sm', '작게'], ['md', '보통'], ['lg', '크게'], ['xl', '아주 크게']]))}
          ${row('줄 간격', '문장이 촘촘하면 넓게로 바꿔 보세요.', seg('spacing', p.spacing, [['normal', '보통'], ['wide', '넓게']]))}
          ${toggle('contrast', p.contrast, '고대비', '테두리와 흐린 글자를 진하게 해서 구분이 쉬워져요.')}
          ${toggle('underline', p.underline, '링크에 항상 밑줄', '색만으로 링크를 구분하기 어려울 때.')}
        </article>

        <article class="card set-group"><h2 class="set-group__title">${icon('layers', 20)}움직임</h2>
          ${toggle('reduceMotion', p.motion === 'reduce', '애니메이션 줄이기', '화면 전환·튀어나오는 효과·색종이를 거의 없애요. 어지럼증이 있다면 켜세요.')}
          ${toggle('aurora', p.aurora, '배경 오로라', '천천히 움직이는 배경 빛. 끄면 단색 배경이 되고 배터리를 조금 아껴요.')}
        </article>

        <article class="card set-group"><h2 class="set-group__title">${icon('volume', 20)}소리·발음</h2>
          ${toggle('sfx', sfxOn(), '효과음', '정답·콤보·레벨 업 소리. 시험 화면 위 스피커 버튼과 같은 설정이에요.')}
          ${row('발음 속도', '단어·문장을 읽어 주는 빠르기.', seg('voiceRate', p.voiceRate, [['slow', '느리게'], ['normal', '보통'], ['fast', '빠르게']]))}
          ${row('발음 억양', '기기에 해당 음성이 없으면 기본 영어 음성으로 읽어요.', seg('voiceLang', p.voiceLang, [['en-US', '미국식'], ['en-GB', '영국식']]))}
          ${toggle('autoSpeak', p.autoSpeak, '시험에서 영어 문제 자동 읽기', '뜻 고르기처럼 영어가 나오는 문제를 넘어갈 때마다 읽어 줘요.')}
          <button class="btn btn--ghost btn--sm set-try" data-try>${icon('play', 16)}발음 들어보기</button>
        </article>

        <article class="card set-group"><h2 class="set-group__title">${icon('info', 20)}도움말</h2>
          <p class="muted">시험 단축키: 숫자 1~5 보기 고르기 · Enter 확인/다음 · Esc 그만두기. 학습 카드: ← → 넘기기 · Space 뒤집기 · ↑ 알아요 · ↓ 다시 볼래요.</p>
          <a class="btn btn--ghost btn--sm" href="#/guide">${icon('lightbulb', 16)}가이드 보기</a>
        </article>
      </section></div>`);
    };
    draw();
    return [
      on(root, 'change', 'input', (_e, el) => {
        const n = el.name;
        if (n === 'theme') setTheme(el.value);
        else if (n === 'reduceMotion') setPref('motion', el.checked ? 'reduce' : 'system');
        else if (n === 'sfx') { setSfx(el.checked); if (el.checked) sfx.correct(2); }
        else if (el.type === 'checkbox') setPref(n, el.checked);
        else setPref(n, el.value);
      }),
      on(root, 'click', '[data-try]', () => { if (!speak('Serendipity. Practice makes perfect.')) toast('이 브라우저는 발음 듣기를 지원하지 않아요.', 'info'); }),
      on(root, 'click', '[data-reset]', async () => {
        if (!await confirmDialog('화면·움직임·소리 설정을 모두 처음 값으로 되돌릴까요?', { title: '기본값으로', ok: '되돌리기' })) return;
        resetPrefs(); setSfx(true); draw(); toast('설정을 기본값으로 되돌렸어요.', 'ok');
      }),
    ].reduce((a, f) => () => { a(); f(); }, () => {});
  },
};
