// 가이드(튜토리얼) — 05(2026-11-20 사용자 요청: 영단마스터의 시스템을 어떻게 쓰는지 세세히 + 활동마다 퀘스트).
// 장마다 순서대로 따라 하는 단계·요령·직접 해보기 링크, 끝에 '읽었어요' 를 누르면 가이드 퀘스트 보상(+5 XP, 장마다 한 번).
import { api } from '../api.js';
import { state } from '../state.js';
import { html, render, on, icon } from '../ui.js';
import { GUIDE_TITLES, reportQuest } from '../game.js';

const step = (title, body) => html`<li class="g-step"><p class="g-step__title">${title}</p><p class="g-step__body">${body}</p></li>`;
const tip = text => html`<p class="g-tip">${icon('lightbulb', 18)}<span>${text}</span></p>`;
const kbd = k => html`<kbd>${k}</kbd>`;

const CH = {
  start: { icon: 'home', lead: '영단마스터는 단어와 내신 영어 본문을 세트로 만들어 11가지 방식으로 시험 보며 외우는 앱이에요. 화면 구성부터 익혀 봐요.',
    body: () => html`
      <ol class="g-steps">
        ${step('홈', '오늘 이어서 할 세트, 연속 학습일·이번 주 외운 문항·복습할 오답, 내 레벨과 퀘스트·업적이 한눈에 보여요. "이어서 학습" 을 누르면 가장 최근 세트로 바로 시험을 시작해요.')}
        ${step('둘러보기', '친구·선생님이 공개한 세트를 찾고(검색·종류·정렬), 즐겨찾기한 세트와 내 세트를 탭으로 나눠 봐요. 마음에 드는 세트는 "내 세트로 복사" 해서 고쳐 쓸 수 있어요.')}
        ${step('오답', '시험에서 틀린 문항이 자동으로 모여요. 여기서 오답만 모아 복습 시험을 볼 수 있어요.')}
        ${step('랭킹', '이번 주(또는 전체) 동안 서로 다른 문항을 몇 개 맞혔는지로 순위를 매겨요. 전체 사용자 / 친구만 고를 수 있어요.')}
        ${step('내 정보', '프로필 사진·배너, 비밀번호, 시험 기록, 설정·가이드가 모여 있어요. 문의·공지사항·친구는 맨 위 아이콘 줄에 있어요.')}
      </ol>
      ${tip('휴대폰에서는 화면 아래 탭 막대, 컴퓨터에서는 위쪽 메뉴로 이동해요. 메뉴는 아이콘만 있어요. 이름이 궁금하면 아이콘에 마우스를 올려 보세요. 이 가이드는 내 정보 → 가이드에서 다시 볼 수 있어요.')}`, go: ['#/', '홈으로'] },
  vocab: { icon: 'book', lead: '단어 세트는 영어·뜻(필수)과 예문·예문 해석(선택)으로 이루어져요. 세 가지 방법으로 빠르게 채울 수 있어요.',
    body: () => html`
      <ol class="g-steps">
        ${step('새 세트 만들기', '홈의 "단어 세트 만들기" 또는 둘러보기 → 내 세트에서 시작해요. 제목·설명을 쓰고 종류는 "단어".')}
        ${step('한 개씩 입력', '단어 칸마다 영어와 뜻을 쓰고 "단어 추가" 로 칸을 늘려요. 필요 없는 칸은 "이 항목 삭제".')}
        ${step('여러 줄 붙여넣기', html`엑셀·구글 시트에서 복사해 "여러 줄 붙여넣기" 칸에 붙인 뒤 "붙여넣은 항목 추가". 한 줄 = 한 단어, 칸 구분은 ${kbd('Tab')}: <code>영어 ⇥ 뜻 ⇥ 예문 ⇥ 예문 해석</code>`)}
        ${step('CSV/XLSX 가져오기', '같은 열 순서(영어, 뜻, 예문, 예문 해석)의 파일을 그대로 불러와요.')}
        ${step('공개 범위·태그', '비공개(나만), 친구, 공개(모두) 중 고르고 "고1, 3과" 처럼 태그를 달면 찾기 쉬워요. 마지막에 "저장".')}
      </ol>
      ${tip('작성 중인 내용은 이 브라우저에 자동 임시저장돼요. 실수로 창을 닫거나 새 버전 알림으로 새로고침해도 "이어서 작성" 으로 되살릴 수 있어요.')}
      ${tip('뜻이 여러 개면 쉼표로 함께 적어 두세요(예: "보호하다, 지키다"). 뜻 쓰기 시험에서 둘 중 하나만 써도 정답이에요.')}`, go: ['#/new/vocab', '단어 세트 만들러 가기'] },
  passage: { icon: 'text', lead: '본문 세트는 교과서·모의고사 지문을 문장 단위로 저장하고, 시험에 낼 핵심 표현과 어법 선택지를 표시해 두는 세트예요.',
    body: () => html`
      <ol class="g-steps">
        ${step('문단 붙여넣기', '종류를 "본문" 으로 고르고 "영어 문단" 과 "한국어 해석" 칸에 지문 전체를 붙인 뒤 "문장을 자동으로 나누고 짝짓기". 영어·해석이 문장마다 짝지어져요.')}
        ${step('짝 확인', '문장 카드마다 영어와 해석이 맞게 짝지어졌는지 보고, 어긋났으면 직접 고쳐요. 문장 추가·삭제도 할 수 있어요.')}
        ${step('핵심 표현 표시', '미리보기에서 단어를 누르면 고른 상태가 되고 "핵심 표현으로" 를 누르면 표시돼요. 이어진 여러 단어(give up 등)는 차례로 눌러 함께 고르세요. 핵심 표현 빈칸 시험에 나와요.')}
        ${step('어법·어휘 선택지', '단어를 고른 뒤 "오답 보기" 칸에 헷갈리는 형태(walks ↔ walk)를 쓰고 "선택지로". 어법·어휘 고르기 시험에서 [정답 / 오답] 으로 나와요.')}
        ${step('직접 표기(고급)', html`문장 칸에 바로 써도 돼요: <code>{give up}</code> = 핵심 표현, <code>[walks|walk]</code> = 선택지(첫 번째가 정답), 중괄호·대괄호 자체를 쓰려면 앞에 <code>\\</code>.`)}
      </ol>
      ${tip('세트 화면에서 "해석 보기" 로 문장 아래 해석을 펼쳐 읽으며 외울 수 있어요. 핵심 표현은 분홍색으로 강조돼요.')}`, go: ['#/new/passage', '본문 세트 만들러 가기'] },
  test: { icon: 'play', lead: '세트 화면의 "시험 보기" 를 누르면 시험 설정 창이 열려요. 채점은 서버가 하니 점수는 정확하게 기록돼요.',
    body: () => html`
      <ol class="g-steps">
        ${step('방식 고르기', '카드마다 문제 형태(객관식·주관식·빈칸·배열·영작)와 난이도, 예시가 적혀 있어요. 단어 5가지, 본문 6가지.')}
        ${step('문항 수·순서·정답 확인', '10~50문항 또는 최대. 섞어서/원래 순서, 문항마다 바로 확인/다 풀고 나서 확인(실전처럼)을 골라요. 맨 아래에서 예상 시간과 얻을 수 있는 최대 경험치를 확인해요.')}
        ${step('푸는 법', html`객관식은 숫자 ${kbd('1')}~${kbd('5')} 키로도 골라요. 주관식은 쓰고 ${kbd('Enter')}, 빈칸이 여러 개면 ${kbd('Enter')} 로 다음 빈칸. 배열은 조각을 순서대로 누르고(잘못 놓은 조각은 다시 누르면 빠짐) "확인".`)}
        ${step('모르겠어요', '모르는 문제는 "모르겠어요" 로 넘기면 오답으로 기록돼 나중에 복습할 수 있어요.')}
        ${step('그만두기', html`왼쪽 위 ✕ 또는 ${kbd('Esc')}. 안 푼 문항은 틀린 것으로 채점돼요. 창을 닫아도 다시 들어오면 이어서 풀 수 있어요.`)}
      </ol>
      <table class="g-table"><thead><tr><th>단어 시험</th><th>본문 시험</th></tr></thead><tbody>
        <tr><td>뜻 고르기 · 단어 고르기</td><td>핵심 표현 빈칸 · 무작위 빈칸</td></tr>
        <tr><td>뜻 쓰기 · 철자 쓰기(첫 글자 힌트)</td><td>어법·어휘 고르기</td></tr>
        <tr><td>듣고 쓰기(발음 듣고 철자)</td><td>어순 배열 · 문장 순서 · 해석 보고 영작</td></tr></tbody></table>
      ${tip('영작은 단어 단위로 비교해 부분 점수를 줘요. 결과 화면의 "비교" 에서 빠진 단어·틀린 단어를 볼 수 있어요.')}`, go: ['#/explore', '세트 고르러 가기'] },
  wrong: { icon: 'target', lead: '틀린 문항은 자동으로 오답 목록에 모이고, 복습해서 졸업시킬 수 있어요.',
    body: () => html`
      <ol class="g-steps">
        ${step('자동 수집', '어떤 시험이든 틀리거나 "모르겠어요" 로 넘긴 문항이 오답 화면에 세트별로 모여요. 몇 번 틀렸는지도 보여요.')}
        ${step('오답 복습 시험', '오답 화면 위 "단어 복습" / "본문 복습" 을 누르면 오답만 모아 시험을 봐요.')}
        ${step('졸업 규칙', '오답 문항을 2번 연속 맞히면 오답 목록에서 자동으로 빠져요(졸업). 졸업 개수는 업적에도 쌓여요.')}
        ${step('직접 빼기', '이미 확실히 외운 문항은 "복습에서 빼기" 로 바로 뺄 수 있어요.')}
      </ol>
      ${tip('결과 화면의 "오답 복습" 버튼을 누르면 방금 틀린 문제를 같은 방식으로 바로 다시 풀 수 있어요.')}`, go: ['#/wrong', '오답 화면으로'] },
  cards: { icon: 'layers', lead: '학습 카드는 시험 전에 단어를 가볍게 훑는 카드 놀이예요.',
    body: () => html`
      <ol class="g-steps">
        ${step('열기', '단어 세트 화면에서 "학습 카드".')}
        ${step('뒤집기', html`카드를 누르거나 ${kbd('Space')} — 앞면은 영어·예문, 뒷면은 뜻·예문 해석. 발음 버튼으로 소리도 들어요.`)}
        ${step('알아요 / 다시 볼래요', html`"알아요" (${kbd('↑')}) 는 카드를 더미에서 빼고, "다시 볼래요" (${kbd('↓')}) 는 맨 뒤로 보내요. ${kbd('←')} ${kbd('→')} 로 넘겨 보기만 할 수도 있어요.`)}
        ${step('완료', '더미를 다 비우면 영이가 축하해 주고, 헷갈렸던 카드 수를 알려줘요. 바로 시험으로 확인해 보세요.')}
      </ol>
      ${tip('연속으로 "알아요" 를 누르면 콤보가 쌓여요. 카드 더미를 끝내면 학습 카드 퀘스트(오늘의 퀘스트 포함)가 완료돼요.')}`, go: ['#/explore?scope=mine', '내 세트로'] },
  game: { icon: 'trophy', lead: '공부한 만큼 경험치가 쌓여 레벨이 오르고, 업적과 퀘스트로 작은 목표를 이어가요. 모든 판정은 서버 기록으로 해서 꾸밀 수 없어요.',
    body: () => html`
      <table class="g-table"><thead><tr><th>얻는 법</th><th>경험치</th></tr></thead><tbody>
        <tr><td>시험에서 맞힌 문항 1개</td><td>+10</td></tr><tr><td>시험 끝까지 풀기</td><td>+20</td></tr>
        <tr><td>5문항 이상 시험 만점</td><td>+50</td></tr><tr><td>퀘스트 보상</td><td>+5 ~ +25</td></tr></tbody></table>
      <ol class="g-steps">
        ${step('레벨·칭호', '레벨이 오를수록 다음 레벨까지 조금씩 더 필요해요. 칭호: 새싹 → 단어 탐험가(3) → 문장 사냥꾼(5) → 어휘 기사(8) → 내신 마법사(12) → 영단 마스터(17).')}
        ${step('시험 중 연출', '정답마다 +10 XP 가 떠오르고, 3·5·10연속 정답이면 콤보 배너가 떠요. 효과음은 시험 화면 위 스피커 버튼으로 켜고 끌 수 있어요.')}
        ${step('결과', '점수에 따라 별 1~3개(50·80·100점), 얻은 경험치와 레벨 막대, 새로 딴 업적이 나와요.')}
        ${step('업적', '하·중·상·최상·전설 다섯 단계, 50개가 넘어요(전설은 한 해를 걸어야 닿는 기록): 시험 완주, 만점, 연속 학습, 외운 문항, 시험 방식 다양성, 본문, 오답 졸업, 세트 만들기, 친구, 레벨, 퀘스트. 연속 학습 업적은 지금까지 가장 길게 이어간 기록으로 판정해서 하루 쉬어도 사라지지 않아요. 홈의 업적판에서 단계별로 볼 수 있어요.')}
        ${step('퀘스트', '홈의 퀘스트판: 오늘의 퀘스트(매일 다시), 첫걸음 퀘스트(한 번), 가이드 퀘스트. 조건을 채우면 "보상 받기" 가 켜져요. 같은 보상은 한 번만 받을 수 있어요.')}
      </ol>`, go: ['#/', '홈에서 퀘스트 보기'] },
  social: { icon: 'users', lead: '친구와 함께하면 덜 지쳐요. 세트를 나누고 랭킹으로 서로 자극해요.',
    body: () => html`
      <ol class="g-steps">
        ${step('친구 맺기', '맨 위 친구 아이콘 → "사용자 찾기" 에서 이름으로 찾아 요청. 상대가 "받은 요청" 에서 수락하면 친구가 돼요.')}
        ${step('친구 공개 세트', '공개 범위를 "친구" 로 두면 친구에게만 보여요. 친구 프로필에서 레벨·업적·공개 세트를 볼 수 있어요.')}
        ${step('공유·복사', '세트 화면의 "공유" 는 링크를 복사해요. 받은 사람은 "내 세트로 복사" 해서 자기 세트로 고쳐 쓸 수 있어요.')}
        ${step('랭킹', '이번 주(월요일 0시 KST부터) 또는 전체 기간, 서로 다른 문항을 맞힌 수로 순위를 매겨요. 같은 문항을 여러 번 맞혀도 1개로 세요.')}
      </ol>
      ${tip('세트에 즐겨찾기(별)를 누르면 둘러보기 → 즐겨찾기 탭에 모여요.')}`, go: ['#/friends', '친구 화면으로'] },
};
const ORDER = Object.keys(CH);

export default {
  title: '가이드', auth: false,
  async render(root, _p, query, ctx) {
    let cur = ORDER.includes(query.ch) ? query.ch : 'start';
    let done = new Set();
    if (state.user) {
      try { const r = await api.get('/quests'); done = new Set(r.quests.filter(q => q.group === 'guide' && q.status === 'claimed').map(q => q.desc)); } catch { /* 보상 표시 없이 */ }
      if (!ctx.isCurrent()) return;
    }
    const draw = () => {
      const c = CH[cur], k = ORDER.indexOf(cur);
      render(root, html`<div class="page guide"><section class="section">
        <div class="section__head"><div><h1 class="section__title">가이드</h1><p class="muted">영단마스터 사용법 · 장마다 다 읽고 "읽었어요" 를 누르면 +5 XP</p></div><span class="badge">${done.size} / ${ORDER.length}장 완료</span></div>
        <div class="guide__wrap">
          <nav class="guide__toc" aria-label="가이드 목차">${ORDER.map((id, i) => html`<a class="guide__link${id === cur ? ' is-active' : ''}" href="#/guide?ch=${id}" ${id === cur ? 'aria-current="page"' : ''}><span class="guide__num">${done.has(id) ? icon('check', 14) : i + 1}</span>${GUIDE_TITLES[id]}</a>`)}</nav>
          <article class="card guide__body reveal" data-chapter>
            <p class="guide__kicker">${icon(c.icon, 18)} ${k + 1}장</p>
            <h2 class="guide__title">${GUIDE_TITLES[cur]}</h2>
            <p class="guide__lead">${c.lead}</p>
            ${c.body()}
            <div class="guide__foot">
              <a class="btn btn--ghost" href="${c.go[0]}">${c.go[1]} ${icon('chevronRight', 16)}</a>
              ${state.user ? (done.has(cur) ? html`<span class="badge badge--ok">${icon('check', 14)}읽음 · 보상 받음</span>` : html`<button class="btn btn--primary" data-read>${icon('check', 18)}읽었어요 +5 XP</button>`) : html`<a class="btn btn--primary" href="#/login?next=/guide">로그인하고 보상 받기</a>`}
            </div>
            <div class="guide__pager">
              ${k > 0 ? html`<a class="link-btn" href="#/guide?ch=${ORDER[k - 1]}">${icon('chevronLeft', 14)}${GUIDE_TITLES[ORDER[k - 1]]}</a>` : html`<span></span>`}
              ${k < ORDER.length - 1 ? html`<a class="link-btn link-btn--strong" href="#/guide?ch=${ORDER[k + 1]}">${GUIDE_TITLES[ORDER[k + 1]]}${icon('chevronRight', 14)}</a>` : ''}
            </div>
          </article>
        </div></section></div>`);
      // 좁은 화면의 가로 목차: 지금 장이 보이도록 목차만 옆으로 스크롤(페이지는 그대로)
      const toc = root.querySelector('.guide__toc'), on_ = root.querySelector('.guide__link.is-active');
      if (toc && on_ && toc.scrollWidth > toc.clientWidth) toc.scrollLeft = on_.offsetLeft - (toc.clientWidth - on_.offsetWidth) / 2;
    };
    draw();
    return on(root, 'click', '[data-read]', async (_e, b) => {
      b.disabled = true;
      const r = await reportQuest(`guide_${cur}`, b);
      if (r && ctx.isCurrent()) { done.add(cur); draw(); } else b.disabled = false;
    });
  },
};
