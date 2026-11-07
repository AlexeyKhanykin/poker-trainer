// Сверка оценщика приложения с эталонным (tests/lib/ref-eval.js):
// полный перебор всех 5-карточных рук + тысячи случайных раздач во всех вариантах.
const H = require('../lib/harness');
const R = require('../lib/ref-eval');
const TS = H.suite('Оценщик рук: сверка с эталоном');
const { PK } = H.load();
const rng = PK.mulberry32(20261107);
const sign = x => x > 0 ? 1 : x < 0 ? -1 : 0;

// 1. Все 2 598 960 рук из 5 карт колоды 52 — точные частоты каждой комбинации.
TS.group('частоты 5 карт, колода 52');
{
  const want = [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 36, 4];
  const got = new Array(10).fill(0);
  const n = H.QUICK ? 0 : 52;
  if (n) {
    const c = [0, 0, 0, 0, 0];
    for (c[0] = 0; c[0] < 48; c[0]++) for (c[1] = c[0] + 1; c[1] < 49; c[1]++) for (c[2] = c[1] + 1; c[2] < 50; c[2]++)
      for (c[3] = c[2] + 1; c[3] < 51; c[3]++) for (c[4] = c[3] + 1; c[4] < 52; c[4]++) got[PK.evaluate(c).cat]++;
    want.forEach((w, cat) => TS.eq(PK.CAT_NAMES[cat] + ': ' + w + ' рук', got[cat], w));
  }
}
// 2. Шорт-дек: все 376 992 руки из 36 карт (A-6-7-8-9 — стрит).
TS.group('частоты 5 карт, шорт-дек');
{
  const want = [122400, 193536, 36288, 16128, 6120, 480, 1728, 288, 20, 4];
  const got = new Array(10).fill(0);
  const d = PK.deckFor('short');
  const c = [0, 0, 0, 0, 0];
  for (let a = 0; a < 32; a++) for (let b = a + 1; b < 33; b++) for (let e = b + 1; e < 34; e++) for (let f = e + 1; f < 35; f++) for (let g = f + 1; g < 36; g++) {
    c[0] = d[a]; c[1] = d[b]; c[2] = d[e]; c[3] = d[f]; c[4] = d[g];
    got[PK.evaluate(c, true).cat]++;
  }
  want.forEach((w, cat) => TS.eq(PK.CAT_NAMES[cat] + ': ' + w + ' рук', got[cat], w));
  TS.eq('всего рук C(36,5)', got.reduce((x, y) => x + y, 0), 376992);
}

// 3. Случайные раздачи каждого варианта: категория, лучшая пятёрка, правило омахи.
for (const vk of Object.keys(PK.VARIANTS)) {
  const V = PK.VARIANTS[vk];
  const deck = PK.deckFor(vk);
  TS.group(vk + ': случайные раздачи');
  const deals = H.N(150, 30);
  for (let i = 0; i < deals; i++) {
    const d = PK.shuffle(deck.slice(), rng);
    const hole = d.slice(0, V.hole), board = d.slice(V.hole, V.hole + 5);
    const mine = PK.bestHand(vk, hole, board), ref = R.bestFor(V, hole, board);
    const txt = hole.map(PK.cardText).join(' ') + ' | ' + board.map(PK.cardText).join(' ');
    TS.eq('категория: ' + txt, mine.ev.cat, ref.cat);
    const five = mine.cards;
    const fromHole = five.filter(c => hole.indexOf(c) >= 0).length;
    const valid = five.length === 5 && new Set(five).size === 5 && five.every(c => hole.indexOf(c) >= 0 || board.indexOf(c) >= 0) && (!V.omaha || fromHole === 2);
    TS.check('показанная пятёрка допустима и равна по силе эталону: ' + txt, valid && R.compare(R.five(five, V.sd), ref, V.sd) === 0, five.map(PK.cardText).join(' '));
    TS.check('handScore = score лучшей руки: ' + txt, PK.handScore(vk, hole, board) === mine.ev.score);
  }
  // Сравнение двух рук на одном столе — как на вскрытии.
  TS.group(vk + ': кто выиграл');
  const pairs = H.N(150, 30);
  for (let i = 0; i < pairs; i++) {
    const d = PK.shuffle(deck.slice(), rng);
    const h1 = d.slice(0, V.hole), h2 = d.slice(V.hole, 2 * V.hole), board = d.slice(2 * V.hole, 2 * V.hole + 5);
    const a = PK.handScore(vk, h1, board), b = PK.handScore(vk, h2, board);
    const ra = R.bestFor(V, h1, board), rb = R.bestFor(V, h2, board);
    TS.eq('победитель: ' + h1.map(PK.cardText).join('') + ' vs ' + h2.map(PK.cardText).join('') + ' на ' + board.map(PK.cardText).join(''), sign(a - b), sign(R.compare(ra, rb, V.sd)));
  }
}

// 4. Сгенерированные тренажёром раздачи имеют заказанную категорию (по эталону).
for (const vk of Object.keys(PK.VARIANTS)) {
  const V = PK.VARIANTS[vk];
  TS.group(vk + ': генератор заданий');
  for (let cat = 0; cat <= 9; cat++) {
    const reps = H.N(6, 2);
    let ok = 0, bad = '';
    for (let k = 0; k < reps; k++) {
      const deal = PK.genDeal(vk, cat, rng);
      const ref = R.bestFor(V, deal.hole, deal.board);
      const all = deal.hole.concat(deal.board);
      if (ref.cat === cat && new Set(all).size === all.length && all.every(c => deck(vk).indexOf(c) >= 0) && deal.hole.length === V.hole && deal.board.length === 5) ok++;
      else bad = all.map(PK.cardText).join(' ');
    }
    TS.check('genDeal ' + PK.CAT_NAMES[cat] + ' (' + reps + ' раз)', ok === reps, bad);
    const f = PK.genFive(vk, cat, rng);
    TS.check('genFive ' + PK.CAT_NAMES[cat], R.five(f, V.sd).cat === cat && new Set(f).size === 5, f.map(PK.cardText).join(' '));
  }
}
function deck(vk) { return PK.deckFor(vk); }
TS.done();
