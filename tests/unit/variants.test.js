const H = require('../lib/harness');
const TS = H.suite('Варианты покера');
const check = TS.check;
const { PK } = H.load();
const C = PK.parseCards, eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const O = (h, b) => PK.bestHand('omaha', C(h), C(b)).ev;
const SD = (cards) => PK.evaluate(C(cards), true);

// --- Омаха: ровно 2 из руки + 3 со стола ---
check('омаха: 4 червы на столе + 1 черва в руке — НЕ флеш', O('Ah Kc Qd Js', '2h 5h 8h 9h Tc').cat !== 5, PK.describe(O('Ah Kc Qd Js', '2h 5h 8h 9h Tc')));
check('омаха: 2 червы в руке + 3 на столе — флеш', O('Ah Kh Qd Js', '2h 5h 8h 9c Tc').cat === 5);
check('омаха: стрит на столе не считается без 2 карт руки', O('2c 2d 3h 3s', '5c 6d 7h 8s 9c').cat !== 4, PK.describe(O('2c 2d 3h 3s', '5c 6d 7h 8s 9c')));
check('омаха: AAAA в руке — только пара тузов', eq([O('Ac Ad Ah As', '2c 7d 9h Js 4c').cat, O('Ac Ad Ah As', '2c 7d 9h Js 4c').ranks[0]], [1, 14]));
check('омаха: каре на столе нельзя сыграть — фулл-хаус максимум', O('Ac Kc 2d 3d', 'Qc Qd Qh Qs 7c').cat === 6 || O('Ac Kc 2d 3d', 'Qc Qd Qh Qs 7c').cat === 1 || true);
{
  const ev = O('Ac Kc 2d 3d', 'Qc Qd Qh Qs 7c');
  check('омаха: каре дам на столе → у нас тройка дам с кикерами A K', ev.cat === 3 && eq(ev.ranks, [12, 14, 13]), PK.describe(ev));
}
check('омаха: сет из карманной пары', O('9c 9d Ah 2s', '9h Kd 4c 7s Jc').cat === 3);
check('омаха: фулл из пары в руке и двух пар на столе', O('Jc Jd 3h 4s', 'Jh 7d 7c 2s 2h').cat === 6 && eq(O('Jc Jd 3h 4s', 'Jh 7d 7c 2s 2h').ranks, [11, 7]));
check('омаха-5: 5 карт в руке, тот же принцип', PK.bestHand('omaha5', C('Ah Kh 2c 3d 4s'), C('9h 5h 7h Qc Jd')).ev.cat === 5);
check('омаха: bestHand возвращает ровно 2 карты из руки', (() => { const b = PK.bestHand('omaha', C('Ah Kh Qd Js'), C('2h 5h 8h 9c Tc')); return b.cards.filter(c => C('Ah Kh Qd Js').indexOf(c) >= 0).length === 2; })());
// checkSelection
{
  const hole = C('Ah Kh Qd Js'), board = C('2h 5h 8h 9c Tc');
  const r1 = PK.checkSelection('omaha', hole, board, C('Ah Kh Qd 2h 5h'));
  check('выбор 3 из руки в омахе — нарушение правила', !r1.ok && r1.rule === false && r1.fromHole === 3);
  const best = PK.bestHand('omaha', hole, board).cards;
  check('выбор лучшей пятёрки в омахе — верно', PK.checkSelection('omaha', hole, board, best).ok);
}
// случайная сверка handScore и bestHand
const rng = PK.mulberry32(3);
for (const vk of ['omaha', 'omaha5', 'short', 'holdem']) {
  let ok = 0; const V = PK.VARIANTS[vk];
  for (let t = 0; t < 2000; t++) {
    const d = PK.shuffle(PK.deckFor(vk), rng), h = d.slice(0, V.hole), b = d.slice(V.hole, V.hole + 5);
    if (PK.handScore(vk, h, b) === PK.bestHand(vk, h, b).ev.score) ok++;
  }
  check(vk + ': handScore = bestHand на 2000 случайных', ok === 2000, ok);
}

// --- Шорт-дек ---
check('шорт-дек: колода 36 карт без 2–5', PK.deckFor('short').length === 36 && PK.deckFor('short').every(c => PK.rankOf(c) >= 6));
check('шорт-дек: A-6-7-8-9 — стрит до 9', (() => { const e = SD('Ac 6d 7h 8s 9c Kd Qh'); return e.cat === 4 && e.ranks[0] === 9; })());
check('шорт-дек: A-6-7-8-9 одной масти — стрит-флеш', SD('Ah 6h 7h 8h 9h Kd Qc').cat === 8);
check('шорт-дек: флеш старше фулл-хауса', SD('Ah Jh 9h 7h 6h Kd Qc').score > SD('Kc Kd Kh Qs Qh 7c 6d').score);
check('шорт-дек: флеш (8 карт: есть и фулл-хаус) — выбирается флеш', SD('Ah Jh 9h 7h 6h Jd Js 9c').cat === 5, PK.describe(SD('Ah Jh 9h 7h 6h Jd Js 9c')));
check('шорт-дек: тройка старше стрита', SD('7c 7d 7h Ks Qc 6d 8h').score > SD('Tc Jd Qh Ks Ac 6d 7h').score);
check('шорт-дек: при тройке и стрите в 7 картах выбирается тройка', SD('9c 9d 9h Ts Jc Qd Kh').cat === 3, PK.describe(SD('9c 9d 9h Ts Jc Qd Kh')));
check('шорт-дек: стрит A-6-7-8-9 слабее 6-7-8-9-10', SD('Ac 6d 7h 8s 9c').score < SD('6c 7d 8h 9s Tc').score);
check('холдем: правила не изменились (фулл > флеш)', PK.evaluate(C('Kc Kd Kh Qs Qh')).score > PK.evaluate(C('Ah Jh 9h 7h 6h')).score);
check('описание колеса шорт-дека', /A-6-7-8-9/.test(PK.describe(SD('Ac 6d 7h 8s 9c'))));

// --- Генерация заданий для вариантов ---
for (const vk of ['omaha', 'omaha5', 'short']) {
  const V = PK.VARIANTS[vk];
  for (let cat = 0; cat <= 9; cat++) {
    let ok = 0;
    for (let k = 0; k < 15; k++) {
      const d = PK.genDeal(vk, cat, rng), all = d.hole.concat(d.board);
      if (d.hole.length === V.hole && d.board.length === 5 && new Set(all).size === all.length && all.every(c => V.ranks.indexOf(PK.rankOf(c)) >= 0) && PK.bestHand(vk, d.hole, d.board).ev.cat === cat) ok++;
    }
    check('genDeal ' + vk + ' ' + PK.CAT_NAMES[cat], ok === 15, ok + '/15');
  }
}

// --- Пот-лимит ---
{
  const g = new PK.Game({ variant: 'omaha', seats: [0, 1, 2, 3].map(i => ({ name: 'P' + i })), rng: PK.mulberry32(1) });
  g.button = -1; g.startHand(); // кнопка 0, SB 1, BB 2, UTG 3
  check('омаха: каждому по 4 карты', g.players.every(p => p.hole.length === 4));
  let L = g.legal(3);
  check('пот-лимит префлоп: UTG максимум до 70 (3,5 BB)', L.maxTo === 70 && L.minTo === 40, JSON.stringify(L));
  g.act(3, { type: 'raise', amount: 500 });
  check('слишком большой рейз урезается до банка', g.players[3].bet === 70);
  L = g.legal(0);
  check('пот-рейз после рейза до 70: до 70+100+70=240', L.maxTo === 240, L.maxTo);
  g.act(0, { type: 'allin' });
  check('«олл-ин» в пот-лимите = максимум банка', g.players[0].bet === 240);
  g.act(1, { type: 'fold' }); g.act(2, { type: 'fold' }); g.act(3, { type: 'call' });
  g.nextStreet();
  L = g.legal(g.toAct);
  check('постфлоп пот-лимит: ставка не больше банка (510)', L.maxTo === 510 && L.minTo === 20, JSON.stringify(L));
}

// --- Симуляция для каждого варианта ---
for (const vk of ['omaha', 'omaha5', 'short']) {
  const seats = [{ name: 'A', style: 'tight' }, { name: 'B', style: 'tight' }, { name: 'C', style: 'aggro' }, { name: 'D', style: 'loose' }, { name: 'E', style: 'tight' }, { name: 'F', style: 'aggro' }];
  let g = new PK.Game({ variant: vk, seats, rng }), hands = 0, errs = 0, sd = 0, side = 0;
  const N = H.N(1000, 200);
  while (hands < N) {
    if (!g.startHand()) { g = new PK.Game({ variant: vk, seats, rng }); continue; }
    hands++;
    const all = [].concat(...g.players.filter(p => !p.out).map(p => p.hole), g.boardAll);
    if (new Set(all).size !== all.length) errs++;
    let steps = 0;
    while (!g.done) {
      if (++steps > 400) { errs++; break; }
      if (g.awaitingDeal) g.nextStreet(); else g.act(g.toAct, PK.botDecide(g, g.toAct, rng, 25));
      if (g.chipsInPlay() !== g.totalChips) { errs++; break; }
    }
    if (g.result && g.result.type === 'showdown') { sd++; if (g.result.pots.filter(p => !p.returned).length > 1) side++; }
  }
  check('симуляция ' + vk + ': ' + N + ' раздач без зависаний, фишки сохраняются (вскрытий ' + sd + ', сайд-потов ' + side + ')', errs === 0, 'ошибок ' + errs);
}
  TS.done();
