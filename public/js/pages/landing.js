import { html, render, icon } from '../ui.js';

export default {
  title: '영어 시험을 내 방식대로', auth: false,
  render(root) {
    render(root, html`<section class="page page--narrow stack p-landing">
      <p class="muted">영단마스터 · 나만의 학습 도구</p>
      <h1>단어부터 내신 본문까지,<br>내가 필요한 영어 공부를 한곳에서</h1>
      <p class="muted">직접 만든 세트로 외우고, 다양한 방식의 시험으로 확인하세요.</p>
      <div class="btn-row"><a class="btn btn--primary" href="#/login?tab=register">무료로 시작하기</a><a class="btn btn--ghost" href="#/login">로그인</a></div>
      <div class="stack">
        <article class="card"><h2>${icon('book')} 단어 암기</h2><p>뜻 고르기, 직접 쓰기, 발음 듣기로 단어를 익혀요.</p></article>
        <article class="card"><h2>${icon('text')} 내신 본문 학습</h2><p>본문의 핵심 표현과 어법 선택지를 표시하고 문장 순서까지 연습해요.</p></article>
        <article class="card"><h2>${icon('target')} 내 실력 확인</h2><p>바로 채점하거나 다 푼 뒤 정답을 확인하고 오답을 복습해요.</p></article>
      </div>
    </section>`);
  },
};
