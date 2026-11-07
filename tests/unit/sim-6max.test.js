// 1000 раздач ботов друг против друга: ничего не зависает, фишки сохраняются.
const H = require('../lib/harness');
const TS = H.suite('Симуляция 6-max холдема');
const { PK } = H.load();
const HANDS = H.N(1000, 200);
const rng = PK.mulberry32(2026);
const seats = [
  { name: 'Вы', style: 'tight' }, { name: 'Анна', style: 'tight' }, { name: 'Борис', style: 'aggro' },
  { name: 'Вика', style: 'loose' }, { name: 'Глеб', style: 'tight' }, { name: 'Дина', style: 'aggro' }
];
let g = new PK.Game({ seats, rng }), games = 1;
const stats = { hands: 0, showdowns: 0, folds: 0, sidePots: 0, splits: 0, allIns: 0, maxActions: 0, actions: 0, byStyle: {}, errors: 0 };
const errs = [];
function fail(msg) { stats.errors++; if (errs.length < 10) errs.push('Раздача ' + stats.hands + ': ' + msg); }
const t0 = Date.now();
while (stats.hands < HANDS) {
  if (!g.startHand()) {
    const w = g.players.find(p => p.stack > 0);
    stats.byStyle[w.style] = (stats.byStyle[w.style] || 0) + 1;
    g = new PK.Game({ seats, rng }); games++;
    continue;
  }
  stats.hands++;
  const cards = [].concat(...g.players.filter(p => !p.out).map(p => p.hole), g.boardAll);
  if (new Set(cards).size !== cards.length) fail('повтор карт');
  let steps = 0;
  while (!g.done) {
    if (++steps > 400) { fail('зависание: > 400 шагов'); break; }
    if (g.awaitingDeal) g.nextStreet();
    else {
      const i = g.toAct;
      if (i < 0) { fail('нет хода и нет раздачи'); break; }
      const a = PK.botDecide(g, i, rng, 60);
      g.act(i, a);
    }
    const sum = g.chipsInPlay();
    if (sum !== g.totalChips) { fail('фишки не сходятся: ' + sum); break; }
    if (g.players.some(p => p.stack < 0 || p.bet < 0)) { fail('отрицательный стек'); break; }
  }
  stats.actions += g.actions; stats.maxActions = Math.max(stats.maxActions, g.actions);
  const total = g.players.reduce((a, p) => a + p.stack, 0);
  if (total !== g.totalChips) fail('после раздачи фишек ' + total);
  if (!g.result) fail('нет результата');
  else if (g.result.type === 'showdown') {
    stats.showdowns++;
    if (g.result.pots.filter(p => !p.returned).length > 1) stats.sidePots++;
    if (g.result.pots.some(p => p.winners.length > 1)) stats.splits++;
    const paid = Object.values(g.result.payouts).reduce((a, b) => a + b, 0);
    const put = g.players.reduce((a, p) => a + p.total, 0);
    if (paid !== put) fail('выплачено ' + paid + ' из ' + put);
  } else stats.folds++;
  if (g.players.some(p => p.allIn)) stats.allIns++;
}
TS.check('ни одна раздача не зависла и фишки сохранялись', stats.errors === 0, errs.join(' | '));
TS.check('были вскрытия', stats.showdowns > HANDS * 0.1, stats.showdowns);
TS.check('были раздачи без вскрытия', stats.folds > HANDS * 0.1, stats.folds);
TS.check('были олл-ины', stats.allIns > 0);
TS.check('были сайд-поты', stats.sidePots > 0 || H.QUICK);
TS.check('были делёжки банка', stats.splits > 0 || H.QUICK);
TS.check('турниры заканчиваются', games > 1 || H.QUICK, games);
TS.done(stats.hands + ' раздач, ' + games + ' турниров');
