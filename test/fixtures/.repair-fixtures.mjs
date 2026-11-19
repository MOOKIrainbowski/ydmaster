import fs from 'node:fs';

const read = name => JSON.parse(fs.readFileSync(`test/fixtures/${name}`, 'utf8'));
const write = (name, value) => fs.writeFileSync(`test/fixtures/${name}`, JSON.stringify(value, null, 2) + '\n', 'utf8');

const markup = read('markup.json');
markup.find(x => x.name === 'curly apostrophe').en = '{students’ ideas} matter.';
markup.find(x => x.name === 'curly apostrophe').plain = 'students’ ideas matter.';
markup.find(x => x.name === 'curly apostrophe').keys = ['students’ ideas'];
markup.find(x => x.name === 'choice punctuation').en = 'Use [“a”|“the”] answer.';
markup.find(x => x.name === 'choice punctuation').plain = 'Use “a” answer.';
markup.find(x => x.name === 'choice punctuation').choices = [['“a”', '“the”']];
markup.find(x => x.name === 'unicode key').en = '{함께 배우기} is fun.';
markup.find(x => x.name === 'unicode key').plain = '함께 배우기 is fun.';
markup.find(x => x.name === 'unicode key').keys = ['함께 배우기'];
write('markup.json', markup);

const grading = read('grading.json');
const meanings = [
  ['사과','사과',true], ['사과',' 사과 ',true], ['포기하다','포 기 하 다',true], ['~을 포기하다','을포기하다',true], ['능력','능 력',true],
  ['빠르게 달리다','빠르게달리다',true], ['기회, 기회들','기회',true], ['사과, 능금','능금',true], ['능금 (과일)','능금',true], ['돌보다 / 보살피다','보살피다',true],
  ['포기하다','포기 하다',true], ['사과','배',false], ['사과','',false], ['사과','사과!',true], ['가능성','가능 성',true],
  ['~에 의존하다','에 의존하다',true], ['의미 있는','의미있는',true], ['마침내','결국',false], ['대부분','거의 모두',false], ['관심을 갖다','관심 갖다',false],
  ['잘 보존하다','잘 보존 하다',true], ['책임','책 임',true], ['작은 변화','작은 변화들',false], ['기대하다 (바라다)','기대하다',true], ['밝은','어두운',false]
].map(([expected,response,correct])=>({fn:'gradeMeaning',expected,response,correct}));
grading.splice(0, 25, ...meanings);
write('grading.json', grading);

const sets = read('sample-sets.json');
const vocabMeanings = [
  ['보호하다','나누다','환경','줄이다','재사용하다','자원','공동체','습관','목적','발견하다','지지하다','향상시키다','주의','주의 깊게','건강한','자원봉사자','지역의','수리하다','대신에','가치 있는','도전','해결책','오염','보호하는','격려하다','살아남다','특히','책임이 있는','미래','보존하다'],
  ['호기심이 많은','참을성 있는','준비하다','자신감 있는','결정','경험','협력하다','기회','창의적인','의사소통하다','전통','여정','성취하다','노력','존중하다','평범한','상상하다','결합하다','양식','교환하다','의미 있는','의존하다','참을성 있게','영향을 주다','용기','성공적인','표현하다','알아차리다','비교하다','꾸준한']
];
const exampleByTerm = {
  protect:['We protect the river.','우리는 강을 보호한다.'], share:['They share their ideas.','그들은 생각을 나눈다.'], environment:['We care for the environment.','우리는 환경을 돌본다.'], reduce:['We reduce plastic waste.','우리는 플라스틱 쓰레기를 줄인다.'], reuse:['Please reuse this bag.','이 가방을 재사용해 주세요.'], resource:['Water is a valuable resource.','물은 귀중한 자원이다.'], community:['Our community works together.','우리 공동체는 함께 일한다.'], habit:['Reading is a good habit.','독서는 좋은 습관이다.'], purpose:['We have a clear purpose.','우리에게는 분명한 목적이 있다.'], discover:['Students discover new plants.','학생들은 새로운 식물을 발견한다.'], support:['Friends support one another.','친구들은 서로를 돕는다.'], improve:['Practice improves your skills.','연습은 실력을 향상시킨다.'], attention:['Pay attention to the signs.','표지판에 주의를 기울여라.'], curious:['The curious child asks questions.','호기심 많은 아이는 질문한다.'], patient:['Be patient with yourself.','스스로에게 참을성을 가져라.'], prepare:['We prepare for the presentation.','우리는 발표를 준비한다.'], confident:['She feels confident today.','그녀는 오늘 자신감이 있다.'], decision:['It was a difficult decision.','그것은 어려운 결정이었다.'], cooperate:['We cooperate on the project.','우리는 그 프로젝트에서 협력한다.'], opportunity:['This is an opportunity to learn.','이것은 배울 기회다.'], creative:['He has a creative idea.','그에게는 창의적인 생각이 있다.'], achieve:['You can achieve your goal.','너는 목표를 이룰 수 있다.'], effort:['Your effort matters.','너의 노력은 중요하다.'], respect:['We respect different opinions.','우리는 서로 다른 의견을 존중한다.']
};
sets[0].title='학교와 환경 어휘'; sets[1].title='배움과 협력 어휘';
for (let si=0;si<2;si++) {
  sets[si].description='직접 만든 고1 수준 어휘 예시 세트입니다.';
  sets[si].tags=['고1','golden'];
  sets[si].items.forEach((item,i)=>{
    item.meaning=vocabMeanings[si][i];
    const ex=exampleByTerm[item.term];
    item.example=ex?.[0] || '';
    item.exampleKo=ex?.[1] || '';
  });
}
sets[2].title='작은 행동이 만드는 변화'; sets[2].description='교과서 문체를 참고해 직접 창작한 지문입니다.'; sets[2].passage.source='창작 지문 · 환경 프로젝트';
sets[3].title='관찰에서 시작된 발견'; sets[3].description='교과서 문체를 참고해 직접 창작한 지문입니다.'; sets[3].passage.source='창작 지문 · 새 관찰';
const koPassages=[
  ['매일 아침 미나는 학교 가는 길에 작은 공원을 걷는다.','그녀는 벤치 근처의 플라스틱 컵을 알아차린다.','미나는 작은 행동이 변화를 만들 수 있다고 믿는다.','그녀는 반 친구들에게 재사용 가능한 병을 가져오라고 부탁한다.','처음에는 몇몇 학생만 프로젝트에 참여한다.','모둠은 쓰레기통 옆에 알기 쉬운 표지판을 둔다.','표지판은 사람들이 왜 가방을 재사용해야 하는지 설명한다.','곧 더 많은 학생이 프로젝트에 참여한다.','그들은 이웃에게 공원을 함께 청소하자고 권한다.','한 달 뒤 공원은 더 깨끗하고 쾌적해 보인다.'],
  ['준은 동네의 새들이 궁금하다.','그는 공책에 자신이 본 것을 기록한다.','선생님은 주의 깊은 관찰이 발견의 시작이라고 말한다.','준은 어떤 새들은 겨울에 이동한다는 것을 배운다.','그는 새들의 울음소리를 비교하고 간단한 지도를 그린다.','어느 오후 그는 날개를 다친 새를 발견한다.','준은 어른에게 알리고 안전한 거리를 유지한다.','그들은 함께 지역 야생동물 보호 센터에 연락한다.','직원은 사람들이 안전하게 도울 방법을 설명한다.','준은 책임감 있게 행동해서 자랑스럽다.']
];
for(let pi=0;pi<2;pi++) sets[pi+2].passage.sentences.forEach((s,i)=>s.ko=koPassages[pi][i]);
write('sample-sets.json',sets);
console.log(JSON.stringify({sets:sets.length,items:sets.slice(0,2).map(s=>s.items.length),passages:sets.slice(2).map(s=>({sentences:s.passage.sentences.length,keys:s.passage.sentences.join(' ').match(/\{[^}]+\}/g)?.length||0,choices:s.passage.sentences.join(' ').match(/\[[^\]]+\|[^\]]+\]/g)?.length||0}))}));
