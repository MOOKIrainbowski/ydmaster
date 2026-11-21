// 15 로딩 화면(사용자 요청: 기다리는 동안 지겹지 않게, 마스코트 영이가 움직이는 느낌).
// 화면 전환이 늦을 때(350ms 넘게) 영이가 통통 뛰며 글자를 모으는 덮개를 띄우고, 1.8초마다 단어·공부 팁이 바뀐다.
// 첫 접속 때는 index.html 에 같은 모양이 정적으로 들어 있다(JS 를 받기 전에도 보이게) — 모양을 바꾸면 그쪽도 함께.
import { html } from './ui.js';

const LINES = [
  '영이가 단어를 줍는 중…', '알파벳을 한 줄로 세우는 중…', '오늘의 문제를 섞는 중…', '연필을 깎는 중…',
  'serendipity = 뜻밖의 행운', 'grit = 끈기', 'bloom = 꽃피다', 'vivid = 생생한', 'cherish = 소중히 여기다',
  '팁: 틀린 문제는 오답 노트에 자동으로 모여요', '팁: 숫자 1~5 로 보기를 고를 수 있어요', '팁: 본문 문장을 누르면 발음을 들을 수 있어요',
  '팁: 연속으로 맞히면 콤보가 쌓여요', '팁: 하루 10단어면 1년에 3,650단어!',
];
const LETTERS = ['A', 'b', 'C', 'd', 'E', 'f'];

export const loaderView = (text = LINES[0]) => html`
  <div class="loader" role="status" aria-live="polite">
    <div class="loader__stage" aria-hidden="true">
      ${LETTERS.map((l, k) => html`<span class="loader__letter" style="--k:${k}">${l}</span>`)}
      <img class="loader__mascot" src="/brand/mascot.svg" alt="" width="120" height="120">
      <span class="loader__shadow"></span>
    </div>
    <p class="loader__text" data-loader-text>${text}</p>
    <span class="loader__dots" aria-hidden="true"><i></i><i></i><i></i></span>
  </div>`;

let el = null, showT = 0, lineT = 0;
// 늦을 때만 보이기: 빠른 화면 전환에서 깜빡이지 않게
export function showLoader(delay = 350) {
  clearTimeout(showT);
  showT = setTimeout(() => {
    if (el) return;
    el = document.createElement('div');
    el.className = 'loader-overlay';
    el.innerHTML = String(loaderView(LINES[Math.floor(Math.random() * LINES.length)]));
    document.body.append(el);
    let n = Math.floor(Math.random() * LINES.length);
    lineT = setInterval(() => { const t = el?.querySelector('[data-loader-text]'); if (t) t.textContent = LINES[++n % LINES.length]; }, 1800);
  }, delay);
}
export function hideLoader() {
  clearTimeout(showT); clearInterval(lineT);
  if (!el) return;
  const old = el; el = null;
  old.classList.add('is-out');
  setTimeout(() => old.remove(), 260);
}
