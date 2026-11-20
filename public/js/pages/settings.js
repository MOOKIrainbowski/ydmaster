// 설정(06, 2026-11-20 사용자 요청: 상단 설정 버튼 → 이용 편의·접근 설정 페이지).
// 07(2026-11-21 사용자 요청): 고르는 버튼 대신 토글(켜기/끄기)과 바(슬라이더)로. 테마 기본값은 라이트.
// 바꾸는 즉시 적용·저장(이 기기), 위쪽 미리보기 카드로 바로 확인. 효과음 켜기는 시험 화면 버튼과 같은 값(game.js).
import { html, render, on, icon, speak, toast, confirmDialog } from '../ui.js';
import { getPrefs, setPref, resetPrefs, getTheme, setTheme, voiceRate } from '../prefs.js';
import { sfxOn, setSfx, sfx } from '../game.js';

const FONT = ['sm', 'md', 'lg', 'xl'], FONT_LABEL = ['작게', '보통', '크게', '아주 크게'];
const toggle = (name, on_, label, desc, disabled = false) => html`<label class="set-toggle${disabled ? ' is-disabled' : ''}"><span><b>${label}</b><small>${desc}</small></span>
  <input type="checkbox" role="switch" name="${name}" ${on_ ? 'checked' : ''} ${disabled ? 'disabled' : ''}><i aria-hidden="true"></i></label>`;
// 바(슬라이더): 채워진 정도를 --v(0~100%)로 그림. ticks 가 있으면 눈금 이름을 아래에
const bar = ({ name, label, desc, min, max, step, value, out, ticks }) => html`<div class="set-bar">
  <div class="set-bar__head"><span><b>${label}</b><small>${desc}</small></span><output class="set-bar__out" data-out="${name}">${out}</output></div>
  <input class="range" type="range" name="${name}" min="${min}" max="${max}" step="${step}" value="${value}" style="--v:${((value - min) / (max - min)) * 100}%" aria-valuetext="${out}">
  ${ticks ? html`<div class="set-bar__ticks" aria-hidden="true">${ticks.map(t => html`<span>${t}</span>`)}</div>` : ''}</div>`;
const outOf = (name, v) => (name === 'font' ? FONT_LABEL[v] : name === 'voiceRate' ? `${Number(v).toFixed(1)}배` : `${v}%`);

export default {
  title: '설정', auth: false,
  render(root) {
    const draw = () => {
      const p = getPrefs(), theme = getTheme(), fi = Math.max(0, FONT.indexOf(p.font));
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
          ${toggle('themeSystem', theme === 'system', '기기 설정 따르기', '휴대폰·컴퓨터의 밝게/어둡게 설정을 그대로 따라가요.')}
          ${toggle('themeDark', theme === 'dark', '어두운 테마', '밤에 눈이 덜 부셔요. 끄면 밝은 테마(기본).', theme === 'system')}
          ${bar({ name: 'font', label: '글자·화면 크기', desc: '모든 글자와 버튼을 함께 키우거나 줄여요.', min: 0, max: 3, step: 1, value: fi, out: FONT_LABEL[fi], ticks: FONT_LABEL })}
          ${toggle('spacing', p.spacing === 'wide', '넓은 줄 간격', '문장이 촘촘해 읽기 어려우면 켜세요.')}
          ${toggle('contrast', p.contrast, '고대비', '테두리와 흐린 글자를 진하게 해서 구분이 쉬워져요.')}
          ${toggle('underline', p.underline, '링크에 항상 밑줄', '색만으로 링크를 구분하기 어려울 때.')}
        </article>

        <article class="card set-group"><h2 class="set-group__title">${icon('layers', 20)}움직임</h2>
          ${toggle('reduceMotion', p.motion === 'reduce', '애니메이션 줄이기', '화면 전환·튀어나오는 효과·색종이를 거의 없애요. 어지럼증이 있다면 켜세요.')}
          ${toggle('aurora', p.aurora, '배경 오로라', '천천히 움직이는 배경 빛. 끄면 단색 배경이 되고 배터리를 조금 아껴요.')}
        </article>

        <article class="card set-group"><h2 class="set-group__title">${icon('volume', 20)}소리·발음</h2>
          ${toggle('sfx', sfxOn(), '효과음', '정답·콤보·레벨 업 소리. 시험 화면 위 스피커 버튼과 같은 설정이에요.')}
          ${bar({ name: 'sfxVolume', label: '효과음 크기', desc: '놓는 순간 들어볼 수 있어요.', min: 0, max: 100, step: 5, value: p.sfxVolume ?? 70, out: `${p.sfxVolume ?? 70}%` })}
          ${bar({ name: 'voiceRate', label: '발음 속도', desc: '단어·문장을 읽어 주는 빠르기.', min: 0.6, max: 1.3, step: 0.1, value: voiceRate(), out: `${voiceRate().toFixed(1)}배`, ticks: ['느리게', '', '보통', '', '', '빠르게'] })}
          ${toggle('voiceGB', p.voiceLang === 'en-GB', '영국식 억양', '끄면 미국식. 기기에 영국식 음성이 없으면 기본 영어 음성으로 읽어요.')}
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
    // 바를 끄는 동안: 채움·숫자만 바꾸고(input), 놓으면 저장(change)
    const onSlide = on(root, 'input', 'input[type=range]', (_e, el) => {
      el.style.setProperty('--v', `${((el.value - el.min) / (el.max - el.min)) * 100}%`);
      const out = root.querySelector(`[data-out="${el.name}"]`), text = outOf(el.name, el.value);
      if (out) out.textContent = text;
      el.setAttribute('aria-valuetext', text);
      if (el.name === 'font') setPref('font', FONT[el.value]); // 크기는 끌면서 바로 보이게
    });
    const onChange = on(root, 'change', 'input', (_e, el) => {
      const n = el.name;
      if (n === 'themeSystem') { setTheme(el.checked ? 'system' : 'light'); draw(); }
      else if (n === 'themeDark') setTheme(el.checked ? 'dark' : 'light');
      else if (n === 'font') setPref('font', FONT[el.value]);
      else if (n === 'sfxVolume') { setPref('sfxVolume', Number(el.value)); if (sfxOn()) sfx.correct(2); }
      else if (n === 'voiceRate') { setPref('voiceRate', Number(el.value)); speak('Practice makes perfect.'); }
      else if (n === 'spacing') setPref('spacing', el.checked ? 'wide' : 'normal');
      else if (n === 'reduceMotion') setPref('motion', el.checked ? 'reduce' : 'system');
      else if (n === 'voiceGB') setPref('voiceLang', el.checked ? 'en-GB' : 'en-US');
      else if (n === 'sfx') { setSfx(el.checked); if (el.checked) sfx.correct(2); }
      else if (el.type === 'checkbox') setPref(n, el.checked);
    });
    const onTry = on(root, 'click', '[data-try]', () => { if (!speak('Serendipity. Practice makes perfect.')) toast('이 브라우저는 발음 듣기를 지원하지 않아요.', 'info'); });
    const onReset = on(root, 'click', '[data-reset]', async () => {
      if (!await confirmDialog('화면·움직임·소리 설정을 모두 처음 값으로 되돌릴까요? (테마는 밝게)', { title: '기본값으로', ok: '되돌리기' })) return;
      resetPrefs(); setSfx(true); draw(); toast('설정을 기본값으로 되돌렸어요.', 'ok');
    });
    return () => { onSlide(); onChange(); onTry(); onReset(); };
  },
};
