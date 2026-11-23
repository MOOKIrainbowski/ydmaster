// 18 가이드 장(章)마다의 튜토리얼 단계(tour.js 가 보여 줌). 장 id 는 서버 가이드 퀘스트(guide_<id>)와 같다.
// 선택자는 위 메뉴(컴퓨터)·아래 탭바(휴대폰)를 함께 적어 둔다 — '|' 로 나눈 것 중 화면에 보이는 첫 번째를 짚는다.
import { api } from './api.js';
import { $ } from './ui.js';

// 세트 화면이 필요한 장: 내 세트 → 공개 세트 순으로 그 종류 하나를 고름(없으면 둘러보기)
const setOf = kind => async () => {
  for (const scope of ['mine', 'public']) {
    try { const r = await api.get(`/sets?scope=${scope}`); const s = (r.items || r).find(x => x.kind === kind); if (s) return `#/sets/${s._id}`; } catch { /* 다음 */ }
  }
  return '#/explore';
};
const MAIN_NAV = '.topbar__nav|.tabbar';
const openTest = async () => { await new Promise(r => setTimeout(r, 200)); $('[data-test]')?.click(); };
const closeModal = () => document.querySelector('.modal-backdrop [data-close]')?.click();

export const TOURS = {
  start: [
    { title: '영단마스터에 오신 걸 환영해요', body: '단어와 내신 영어 본문을 세트로 만들어 카드·시험으로 외우는 곳이에요. 2분이면 화면 구성을 모두 볼 수 있어요. 오른쪽 아래 "다음"을 누르거나 → 키로 넘겨요.' },
    { go: '#/', sel: MAIN_NAV, title: '메인 버튼', body: '홈 · 둘러보기 · 세트 만들기 · 오답 · 랭킹, 공부에 가장 자주 쓰는 다섯 개가 모여 있어요. 메인 버튼끼리는 기다림 없이 바로 넘어가요. 아이콘에 마우스를 올리면 이름이 보여요.' },
    { sel: '[data-create-set]', title: '세트 만들기', body: '누르면 "단어 세트"와 "본문 세트" 중 무엇을 만들지 물어봐요. 고르면 바로 만드는 화면으로 가요.' },
    { go: '#/', sel: '.result-hero', title: '오늘의 학습', body: '가장 최근에 공부한 세트예요. "이어서 학습"은 그 세트로 바로 시험, 아래 버튼으로 새 세트도 만들 수 있어요.' },
    { sel: '[data-quests]', title: '퀘스트', body: '오늘의 퀘스트와 첫걸음 퀘스트를 깨면 경험치(XP)를 받아요. 다 되면 "보상 받기"를 눌러요.' },
    { go: '#/explore', sel: '.explore-controls', title: '둘러보기', body: '친구·선생님이 공개한 세트를 제목·종류·정렬로 찾아요. 위 탭에서 즐겨찾기와 내 세트도 볼 수 있어요.' },
    { sel: '.set-grid', title: '세트 카드', body: '카드를 누르면 세트 화면으로 가요. 거기서 학습 카드로 외우고, 재생 버튼으로 시험을 봐요.' },
    { sel: '.topbar__tools', title: '서브 버튼', body: '문의 · 공지사항 · 친구 · 퀘스트 · 설정 · 알림이에요. 퀘스트(깃발)를 누르면 오늘의 · 주간 · 첫걸음 퀘스트 창이 떠요. 궁금한 건 문의, 친구 추가·요청은 친구, 글자 크기·소리·문법 설명 풍선 같은 편의 설정은 설정, 새 소식은 알림(종)에서 봐요.' },
    { sel: '.topbar__me|.tabbar__item[href="#/me"]', title: '내 정보', body: '프로필 사진·배너·꾸미기, 학습 기록, 업적을 봐요. 이 가이드도 내 정보 → 가이드에서 언제든 다시 볼 수 있어요.' },
  ],
  vocab: [
    { go: '#/', sel: '[data-create-set]', title: '단어 세트 만들기', body: '위(휴대폰은 아래)의 세트 만들기 버튼 → "단어 세트"를 고르면 시작해요. 지금은 바로 만드는 화면으로 데려갈게요.' },
    { go: '#/new/vocab', sel: 'form[data-editor] input[name="title"]', title: '제목 · 설명', body: '예: "고1 3과 단어". 설명은 비워도 돼요.' },
    { sel: '[data-row]', title: '한 개씩 입력', body: '영어와 뜻은 꼭, 예문·예문 해석은 원하면 적어요. 뜻이 여러 개면 쉼표로("보호하다, 지키다") — 시험에서 하나만 써도 정답이에요.' },
    { sel: '[data-add]', title: '단어 추가', body: '칸이 모자라면 눌러서 늘려요. 필요 없는 칸은 휴지통으로 지워요.' },
    { sel: '[data-bulk]', title: '여러 줄 붙여넣기', body: '엑셀·구글 시트에서 복사해 붙이면 한 줄이 한 단어가 돼요(칸 구분은 Tab, 순서: 영어 · 뜻 · 예문 · 예문 해석).' },
    { sel: '[data-csv]', title: 'CSV · XLSX 가져오기', body: '같은 열 순서의 파일을 그대로 불러올 수 있어요.' },
    { sel: 'select[name="visibility"]', title: '공개 범위 · 태그', body: '비공개(나만) · 친구 · 공개(모두) 중 고르고, "고1, 3과"처럼 태그를 달면 찾기 쉬워요. 끝나면 맨 아래 저장!' },
  ],
  passage: [
    { go: '#/new/passage', sel: 'form[data-editor] input[name="title"]', title: '본문 세트 만들기', body: '교과서·모의고사 본문을 문장별로 공부하고 시험 보는 세트예요. 제목부터 적어요.' },
    { sel: '[data-sentence]|.sentence-editor', title: '본문 붙여넣기', body: '본문을 통째로 붙여 넣으면 문장마다 나눠져요. 해석도 함께 넣으면 문장 아래에서 펼쳐 볼 수 있어요.' },
    { sel: '[data-make-key]', title: '핵심 표현 표시', body: '외워야 할 표현을 골라 "핵심 표현"으로 표시하면 빈칸 시험에 그 부분이 나와요. 표시하지 않으면 자동으로 골라 줘요.' },
    { sel: '[data-make-choice]', title: '어법·어휘 고르기', body: '단어를 골라 헷갈리는 보기(예: walks / walk)를 만들면 고르기 문제가 돼요.' },
    { sel: '[data-preview]', title: '미리보기', body: '학생에게 보일 모습을 바로 확인하고 저장해요.' },
  ],
  test: [
    { go: setOf('vocab'), sel: '[data-test]', title: '시험 시작', body: '세트 화면의 재생 버튼을 누르면 시험 설정 창이 열려요. 지금 열어 볼게요.' },
    { before: openTest, sel: '.mode-grid', title: '① 푸는 방식', body: '뜻 고르기 · 단어 고르기 · 뜻 쓰기 · 철자 쓰기 · 듣고 쓰기(본문은 빈칸 · 고르기 · 배열 · 영작) 중 골라요.' },
    { sel: '.start__count', title: '② 문항 수', body: '바를 끌어 10 · 20 · 30 · 50 · 최대(세트 전체) 중 골라요.' },
    { sel: '.start__pair', title: '③ 진행 방식', body: '순서(섞어서/원래 순서)와 정답 확인(문항마다 바로/다 풀고 나서)을 골라요. 쓰기 문제는 첫 글자 힌트도 켤 수 있어요.' },
    { sel: '[data-summary]', title: '요약 · 시작', body: '고른 내용과 예상 시간, 받을 수 있는 최대 경험치가 보여요. "시작하기"로 출발! 시험 중 Enter 로 확인, M 으로 "모르겠어요".', after: closeModal },
  ],
  wrong: [
    { go: '#/wrong', sel: '.section__head', title: '오답 복습', body: '시험에서 틀린 문항이 세트별로 자동으로 모여요. 단어 복습 · 본문 복습으로 오답만 모아 시험 볼 수 있어요.' },
    { sel: '[data-review-set]', title: '세트별 오답 시험', body: '이 아이콘(되돌이 화살표 안의 ×)은 그 세트 오답만 다시 푸는 버튼이에요. 오답 복습에서 맞히면 바로 오답에서 빠져요(일반 시험에서는 두 번 연속 맞혀야 해요).' },
    { title: '세트 화면에서도', body: '세트 화면에도 같은 아이콘과 오답 개수가 보여요. 틀린 것부터 다시 보는 게 가장 빨리 외우는 방법이에요.' },
  ],
  cards: [
    { go: setOf('vocab'), sel: '.flash-card', title: '학습 카드', body: '카드를 누르면(또는 Space) 뒤집혀 뜻이 보여요.' },
    { sel: '.flash__judge', title: '알아요 / 다시 볼래요', body: '알면 ↑, 헷갈리면 ↓. 다시 볼 카드는 더미 뒤로 가고, 다 외우면 축하와 함께 시험으로 확인할 수 있어요.' },
    { sel: '.flash__nav', title: '넘기기 · 발음', body: '← → 로 넘기고, 스피커를 누르면 발음을 들어요. 읽는 동안 빨간 정지 버튼으로 바뀌어 누르면 바로 멈춰요.' },
    { sel: '[data-flash]', title: '목록 보기', body: '모든 단어를 한 번에 보고 싶으면 목록 아이콘을 눌러요. 다시 누르면 학습 카드로 돌아와요.' },
    { go: setOf('passage'), sel: '.ps-mode', title: '본문 세트 공부', body: '본문 세트는 문장 카드 · 한 문장씩 · 본문 읽기 세 가지로 봐요. "한 문장씩"은 문장 하나를 크게 띄워 발음 · 해석 · 문장 분석을 함께 보며 ← → 로 넘겨요.' },
    { sel: '.sent-card', title: '문장 카드', body: '문장 아래 "해석 보기"로 해석을 펼치고, "문장 분석"으로 주어 · 서술어 · 목적어를 색으로 봐요. 단어에 마우스를 올리면 문법 설명 풍선이 떠요(설정에서 끌 수 있어요).' },
  ],
  game: [
    { go: '#/', sel: '[data-lvbar]|.result-hero', title: '경험치 · 레벨', body: '문항을 맞힐 때마다 경험치(XP)가 쌓여 레벨이 올라요. 연속으로 맞히면 콤보!' },
    { sel: '[data-quests-open]|[data-quests]', title: '퀘스트', body: '위 깃발 버튼으로 언제든 퀘스트 창을 열어요. 매일 열리는 오늘의 퀘스트, 월요일마다 열리는 주간 퀘스트(조건이 까다로운 대신 보상이 커요), 처음 한 번 깨는 첫걸음 퀘스트가 있어요. 보상 · 클리어 시간 순으로 정렬할 수 있어요. 이 가이드 장을 끝까지 보는 것도 퀘스트예요(+5 XP).' },
    { go: '#/me', sel: '.profile-ach|.ach-grid', title: '업적 · 꾸미기', body: '업적을 달성하면 칭호 · 프로필 색 · 테두리 · 카드 효과 같은 꾸미기가 열려요. 프로필 수정에서 골라 달아요.' },
  ],
  social: [
    { go: '#/ranking', sel: '.rank-filters', title: '랭킹', body: '이번 주(또는 전체) 서로 다른 문항을 몇 개 맞혔는지로 순위를 매겨요. 전체 사용자 / 친구만 고를 수 있어요.' },
    { sel: '.topbar__tools a[href="#/friends"]|.topbar__tools', title: '친구', body: '친구 아이콘 → 사용자 찾기에서 이름으로 찾아 요청해요. 상대가 받은 요청에서 수락하면 친구가 돼요.' },
    { title: '공유', body: '세트 화면의 링크 버튼으로 주소를 복사해 보내요. 공개 범위가 "친구"면 친구만, "공개"면 누구나 볼 수 있어요. 마음에 드는 세트는 복사 버튼으로 내 세트에 담아요.' },
  ],
};
