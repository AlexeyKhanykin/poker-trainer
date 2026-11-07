// Банки и делёжка на случайных конфигурациях: свойства, которые должны выполняться всегда.
const H = require('../lib/harness');
const TS = H.suite('Банки и сайд-поты: свойства');
const { PK } = H.load();
const rng = PK.mulberry32(31337);
const ri = n => Math.floor(rng() * n);
const sum = a => a.reduce((x, y) => x + y, 0);

const CASES = H.N(250, 50);
for (let k = 0; k < CASES; k++) {
  const n = 2 + ri(5);
  // Часто одинаковые вклады — как при коллах; иногда ноль (сбросил блайнд), иногда огромные.
  const levels = [0, 10, 20, 60, 100, 100, 250, 400, 1000, 1000, 1337];
  const players = Array.from({ length: n }, (_, id) => ({ id, total: levels[ri(levels.length)], folded: rng() < 0.3 }));
  if (players.every(p => p.folded)) players[ri(n)].folded = false;
  if (players.every(p => p.total === 0)) players[0].total = 20;
  const live = players.filter(p => !p.folded);
  const pots = PK.buildPots(players);
  const tag = '#' + k + ' ' + players.map(p => p.total + (p.folded ? 'f' : '')).join(',');
  TS.eq('сумма банков = сумме вкладов ' + tag, sum(pots.map(p => p.amount)), sum(players.map(p => p.total)));
  const nested = pots.every((p, i) => p.eligible.length > 0 && p.eligible.every(id => !players[id].folded) &&
    (i === 0 || p.eligible.every(id => pots[i - 1].eligible.includes(id))));
  TS.check('претенденты: только несбросившие, каждый следующий банк — подмножество предыдущего ' + tag, nested, pots);
  TS.check('претендент вложил не меньше уровня банка ' + tag, pots.every(p => p.eligible.every(id => players[id].total >= Math.min(...p.eligible.map(j => players[j].total)))));
  // Делёжка со случайной силой рук (с частыми ничьими)
  const score = {}; players.forEach(p => { score[p.id] = ri(4); });
  const order = PK.shuffle(players.map(p => p.id), rng);
  const r = PK.settle(players, id => score[id], order);
  TS.eq('выплачено ровно столько, сколько вложено ' + tag, sum(Object.values(r.payouts)), sum(players.map(p => p.total)));
  const fair = r.pots.every(p => {
    const best = Math.max(...p.eligible.map(id => score[id]));
    const w = p.eligible.filter(id => score[id] === best);
    return JSON.stringify(w.slice().sort()) === JSON.stringify(p.winners.slice().sort()) &&
      p.winners.every((id, i) => i === 0 || order.indexOf(p.winners[i - 1]) < order.indexOf(id));
  });
  TS.check('каждый банк выигрывают сильнейшие претенденты, порядок — от кнопки ' + tag, fair);
  TS.check('сбросившие ничего не получают ' + tag, players.every(p => !p.folded || !r.payouts[p.id]));
}

TS.group('крайние случаи');
TS.eq('один игрок', PK.buildPots([{ id: 0, total: 50, folded: false }]), [{ amount: 50, eligible: [0] }]);
TS.eq('все поровну — один банк', PK.buildPots([0, 1, 2].map(id => ({ id, total: 100, folded: false }))).length, 1);
TS.eq('вклад сбросившего попадает в банк', PK.buildPots([{ id: 0, total: 100, folded: true }, { id: 1, total: 40, folded: false }, { id: 2, total: 40, folded: false }]), [{ amount: 180, eligible: [1, 2] }]);
TS.eq('пустой стол', PK.buildPots([]), []);
{
  const r = PK.settle([{ id: 0, total: 1, folded: false }, { id: 1, total: 1, folded: false }, { id: 2, total: 1, folded: false }], () => 5, [2, 0, 1]);
  TS.eq('3 фишки на троих', [r.payouts[0], r.payouts[1], r.payouts[2]], [1, 1, 1]);
}
{
  const r = PK.settle([{ id: 0, total: 5, folded: false }, { id: 1, total: 5, folded: false }, { id: 2, total: 1, folded: true }], () => 5, [2, 1, 0]);
  TS.eq('11 на двоих: лишняя фишка — первому по порядку', [r.payouts[1], r.payouts[0]], [6, 5]);
}
TS.done();
