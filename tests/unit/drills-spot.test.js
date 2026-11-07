// «Ситуации» (решения после флопа): задание собрано верно, а правильный ответ подтверждается
// независимым пересчётом шанса — своим методом Монте-Карло на эталонном оценщике рук.
const H = require('../lib/harness');
const R = require('../lib/ref-eval');
const TS = H.suite('Ситуации: решения после флопа');
const { PK, PKDrills } = H.load();
const rng = PK.mulberry32(5150);
const NB = { flop: 3, turn: 4, river: 5 };

// Шанс выиграть против nOpp случайных рук: делёж банка считается долей
function refEquity(vk, hole, board, nOpp, iters, r) {
  const V = PK.VARIANTS[vk], dead = new Set(hole.concat(board));
  const deck = PK.deckFor(vk).filter(c => !dead.has(c));
  let won = 0;
  for (let it = 0; it < iters; it++) {
    const d = deck.slice();
    const take = () => d.splice(Math.floor(r() * d.length), 1)[0];
    const opps = [];
    for (let o = 0; o < nOpp; o++) { const h = []; for (let k = 0; k < V.hole; k++) h.push(take()); opps.push(h); }
    const b = board.slice(); while (b.length < 5) b.push(take());
    const me = R.bestFor(V, hole, b);
    let best = 0, ties = 0;
    for (const h of opps) { const c = R.compare(R.bestFor(V, h, b), me, V.sd); if (c > 0) { best = 1; break; } if (c === 0) ties++; }
    if (!best) won += 1 / (ties + 1);
  }
  return won / iters;
}

TS.group('правило решения');
TS.eq('шанс 70 % — рейз', PKDrills.postAction(0.7, 0.3, 1), 'raise');
TS.eq('шанс 40 %, нужно 25 % — колл', PKDrills.postAction(0.4, 0.25, 1), 'call');
TS.eq('шанс 20 %, нужно 25 % — фолд', PKDrills.postAction(0.2, 0.25, 1), 'fold');
TS.eq('против пятерых шанс 40 % — уже рейз (40 % × 6 ≥ 2,2)', PKDrills.postAction(0.4, 0.3, 5), 'raise');
TS.eq('против двоих 55 % — колл (55 % × 3 < 2,2)', PKDrills.postAction(0.55, 0.3, 2), 'call');
TS.eq('против одного 55 % — ещё колл', PKDrills.postAction(0.55, 0.3, 1), 'call');
TS.eq('шанс ровно равен нужному — колл', PKDrills.postAction(0.25, 0.25, 1), 'call');
TS.eq('улицы', PKDrills.SPOT_STREETS, ['flop', 'turn', 'river']);

const all = [];
for (const vk of Object.keys(PK.VARIANTS)) for (const street of PKDrills.SPOT_STREETS) {
  TS.group(vk + ' · ' + street);
  const V = PK.VARIANTS[vk], reps = H.N(vk === 'holdem' ? 12 : 5, 2);
  for (let k = 0; k < reps; k++) {
    const t0 = Date.now();
    const t = PKDrills.genSpot(vk, rng, { street });
    const ms = Date.now() - t0;
    if (!TS.check('задание создано', !!t)) continue;
    TS.check('создаётся быстро (< 1,5 с)', ms < 1500, ms);
    TS.eq('вид и улица', [t.kind, t.street, t.sub, t.variant], ['spot', street, street, vk]);
    TS.eq('карт в руке', t.hole.length, V.hole);
    TS.eq('карт на столе', t.board.length, NB[street]);
    const cards = t.hole.concat(t.board);
    TS.check('карты не повторяются и есть в колоде варианта', new Set(cards).size === cards.length && cards.every(c => PK.deckFor(vk).includes(c)), cards);
    TS.check('соперников 1 или 2', t.nOpp === 1 || t.nOpp === 2, t.nOpp);
    TS.check('банк и ставка — круглые положительные числа', t.pot0 > 0 && t.bet > 0 && t.pot0 % 10 === 0 && t.bet % 10 === 0, [t.pot0, t.bet]);
    TS.eq('банк со ставкой и сколько доставить', [t.pot, t.toCall], [t.pot0 + t.bet, t.bet]);
    TS.check('нужная доля = ставка ÷ (банк + ставка + колл)', Math.abs(t.need - t.bet / (t.pot0 + 2 * t.bet)) < 1e-9, t.need);
    TS.check('ставка от трети до полутора банков', t.bet >= t.pot0 / 3 - 10 && t.bet <= t.pot0 * 1.5 + 10, [t.pot0, t.bet]);
    TS.eq('варианты ответа', t.options.map(o => o.v), ['fold', 'call', 'raise']);
    TS.check('в кнопке колла — сумма', t.options[1].label.replace(/\s/g, '').includes(String(t.bet)), t.options[1].label);
    TS.eq('правильный вариант совпадает с ответом', t.options[t.correct].v, t.action);
    TS.eq('ответ по правилу из шанса задания', t.action, PKDrills.postAction(t.eq, t.need, t.nOpp));
    TS.check('ауты считаются до ривера', street === 'river' ? t.outs === null : !!(t.outs && Array.isArray(t.outs.outs)), street);
    TS.eq('текущая комбинация', t.cur.cat, PK.bestHand(vk, t.hole, t.board).ev.cat);
    // Независимый пересчёт: ответ должен быть тем же, кроме случаев у самой границы (там решает погрешность метода)
    const ref = refEquity(vk, t.hole, t.board, t.nOpp, vk === 'holdem' || vk === 'short' ? 4000 : 1500, PK.mulberry32(k * 7919 + 13));
    const tol = vk === 'holdem' || vk === 'short' ? 0.03 : 0.05;
    TS.check('шанс совпадает с независимым пересчётом', Math.abs(ref - t.eq) < tol + 0.01, { task: t.eq.toFixed(3), ref: ref.toFixed(3) });
    const edge = [t.need, 0.65, 2.2 / (t.nOpp + 1)].some(x => Math.abs(ref - x) < tol);
    if (!edge) TS.eq('ответ подтверждается пересчётом', PKDrills.postAction(ref, t.need, t.nOpp), t.action);
    all.push({ vk, action: t.action, edge });
  }
}

TS.group('задания разнообразны');
const hold = [];
const r2 = PK.mulberry32(77);
for (let k = 0; k < H.N(150, 45); k++) hold.push(PKDrills.genSpot('holdem', r2).action);
for (const a of ['fold', 'call', 'raise']) {
  const share = hold.filter(x => x === a).length / hold.length;
  TS.check('ответ «' + a + '» встречается часто (> 15 %)', share > 0.15, share.toFixed(2));
}
TS.check('спорных заданий у самой границы немного (< 15 %)', all.filter(x => x.edge).length / all.length < 0.15, all.filter(x => x.edge).length + ' из ' + all.length);
const streets = new Set(), opps = new Set();
for (let k = 0; k < 60; k++) { const t = PKDrills.genSpot('holdem', r2); streets.add(t.street); opps.add(t.nOpp); }
TS.eq('без выбора улицы попадаются все улицы', [...streets].sort(), ['flop', 'river', 'turn']);
TS.eq('бывает 1 и 2 соперника', [...opps].sort(), [1, 2]);
TS.done();
