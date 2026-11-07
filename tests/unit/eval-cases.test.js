const H = require('../lib/harness');
const TS = H.suite('Оценщик рук: именованные руки');
const check = TS.check;
const { PK } = H.load();
const E = s => PK.evaluate(PK.parseCards(s));

// [7 (или 5) карт, категория, ожидаемые ранги для тай-брейка]
const cases = [
  ['As Ks Qs Js Ts 2d 3c', 9, [14], 'роял-флеш'],
  ['As Ks Qs Js Ts', 9, [14], 'роял-флеш из 5 карт'],
  ['9h 8h 7h 6h 5h Ad Ac', 8, [9], 'стрит-флеш до 9'],
  ['Ah 2h 3h 4h 5h Kd Qc', 8, [5], 'стрит-флеш колесо'],
  ['Ah 2h 3h 4h 5h 6h Qc', 8, [6], 'стрит-флеш до 6 сильнее колеса'],
  ['Kh Qh Jh Th 9h 8h Ac', 8, [13], 'стрит-флеш из 6 карт масти'],
  ['Kc Kd Kh Ks 2c 3d 4h', 7, [13, 4], 'каре королей, кикер 4'],
  ['Kc Kd Kh Ks Ac Ad Ah', 7, [13, 14], 'каре при тройке тузов'],
  ['2c 2d 2h 2s 3c 3d 3h', 7, [2, 3], 'каре двоек'],
  ['7c 7d 7h Kc Kd 2s 3s', 6, [7, 13], 'фулл-хаус 7 на K'],
  ['Ac Ad Ah Kc Kd Ks 2h', 6, [14, 13], 'две тройки -> фулл-хаус'],
  ['Jc Jd Jh 9s 9d 4c 4h', 6, [11, 9], 'тройка + две пары'],
  ['3c 3d 3h Qs Qd 2c 2h', 6, [3, 12], 'фулл 3 на Q'],
  ['Ah Jh 9h 6h 3h Kd Qc', 5, [14, 11, 9, 6, 3], 'флеш'],
  ['Ah Kh 9h 6h 3h 2h Qc', 5, [14, 13, 9, 6, 3], 'флеш из 6 карт — 5 старших'],
  ['9h 8h 7h 6d 5h 2h Kc', 5, [9, 8, 7, 5, 2], 'флеш бьёт стрит в тех же картах'],
  ['Th 9h 8h 7h 6c 2h Kh', 5, [13, 10, 9, 8, 7], 'флеш с 6 червами, стрит не флеш'],
  ['9c 8d 7h 6s 5c 2d 2h', 4, [9], 'стрит до 9'],
  ['Ac 2d 3h 4s 5c Kd Qh', 4, [5], 'колесо A-2-3-4-5'],
  ['Ac Kd Qh Js Tc 2d 3h', 4, [14], 'стрит до туза'],
  ['4c 5d 6h 7s 8c 9d Kh', 4, [9], '6 карт подряд — старший стрит'],
  ['Ac 2d 3h 4s 5c 6d Kh', 4, [6], 'A-6 подряд — стрит до 6, а не колесо'],
  ['Qc Kd Ac 2h 3s 7d 8c', 0, [14, 13, 12, 8, 7], 'стрит не «заворачивает» через туза'],
  ['5c 5d 5h Ac Kd 2s 9h', 3, [5, 14, 13], 'тройка, кикеры A K'],
  ['Ac Ad Kc Kd Qs Qh 2c', 2, [14, 13, 12], 'три пары -> две старшие + кикер Q'],
  ['Ac Ad Kc Kd 5s 5h 4c', 2, [14, 13, 5], 'три пары, кикер от младшей пары'],
  ['Ac Ad 8c 8d 3s 3h Kc', 2, [14, 8, 13], 'две пары, кикер K'],
  ['Jc Jd 9s 7h 4c 3d 2s', 1, [11, 9, 7, 4], 'пара валетов'],
  ['Ac Jd 9s 7h 4c 3d 2s', 0, [14, 11, 9, 7, 4], 'старшая карта'],
  ['2c 3d 4h 5s 7c', 0, [7, 5, 4, 3, 2], 'почти стрит — старшая карта'],
  ['Th Td Tc Ts 9h 9d 9c', 7, [10, 9], 'каре + тройка'],
];
for (const [cards, cat, ranks, name] of cases) {
  const ev = E(cards);
  check(name + ' [' + cards + ']', ev.cat === cat && JSON.stringify(ev.ranks.slice(0, ranks.length)) === JSON.stringify(ranks),
    'получили cat=' + ev.cat + ' ranks=' + JSON.stringify(ev.ranks));
}

// Сравнения на одном столе: [стол, рука1, рука2, ожидаемый победитель 1/2/0]
const cmp = [
  ['As 9d 6c 4h 2s', 'Ah Kc', 'Ad Qc', 1, 'кикер K бьёт кикер Q'],
  ['As Ks Qd Jc Th', '2c 3d', '4h 5h', 0, 'оба играют стол (стрит)'],
  ['Kc Kd Kh Ks 2c', 'Ah 3d', 'Qh Qs', 1, 'кикер к каре на столе'],
  ['Kc Kd Kh Ks Ac', 'Qh Qs', '2h 3h', 0, 'каре и туз на столе — ничья'],
  ['2h 3d 4c 9s Ks', 'Ah 5c', '5h 6d', 2, 'колесо проигрывает стриту до 6'],
  ['2h 3h 4h 9s Ks', 'Ah 5h', '5h 6h', -1, 'skip'],
  ['Jh 8h 4h 2c 3d', 'Ah 5h', 'Kh Qh', 1, 'флеш до туза бьёт флеш до короля'],
  ['Ah Kh 4h 2c 3d', '9h 2h', '8h 7h', 1, 'флеш: решает третья карта'],
  ['Ac Ad 8s 8d 4c', 'Kh 2c', 'Qh Qc', 2, 'две пары A и Q бьют A и 8 с кикером K'],
  ['9c 9d 5s 5h 2c', 'Ah 3d', 'Kh 4c', 1, 'две пары со стола, решает кикер'],
  ['7c 7d 7h 2s 3c', 'Ah Kd', 'Ad Qh', 1, 'тройка на столе, решает кикер'],
  ['Qc Qd 4h 4s 9c', '4c 2d', 'Qh 3c', 2, 'фулл Q на 4 бьёт фулл 4 на Q'],
  ['6c 7d 8h 9s Kc', 'Th 2c', '5h 2d', 1, 'стрит до 10 бьёт стрит до 9'],
  ['5c 6c 7c 8c 2d', '9c 2h', '4c 3h', 1, 'стрит-флеш до 9 бьёт до 8'],
  ['Ac 2c 3c 4c Kd', '5c 9h', '6d 5h', 1, 'стальное колесо (стрит-флеш) бьёт стрит до 6'],
  ['Th Jh Qh Kh 2c', 'Ah 2d', '9h 3c', 1, 'роял бьёт стрит-флеш'],
  ['Ac Kd 8s 6h 2c', 'Ah Kc', 'As Kh', 0, 'одинаковые руки разных мастей — ничья'],
  ['Ac Kd 8s 6h 2c', '3d 4d', '3h 4h', 0, 'одинаково слабые руки — играет стол — ничья'],
];
for (const [board, h1, h2, exp, name] of cmp) {
  if (exp === -1) continue;
  const b = PK.parseCards(board);
  const e1 = PK.evaluate(PK.parseCards(h1).concat(b)), e2 = PK.evaluate(PK.parseCards(h2).concat(b));
  const got = e1.score > e2.score ? 1 : e1.score < e2.score ? 2 : 0;
  const ex = PK.explainCompare(e1, e2, 'Игрок 1', 'Игрок 2');
  check(name, got === exp && ex.winner === exp, 'получили ' + got + ' (' + PK.describe(e1) + ' / ' + PK.describe(e2) + ')');
}

// bestFive должен находить пятёрку той же силы, что и evaluate(7)
const rng = PK.mulberry32(12345);
let consistent = 0;
const N = 30000;
const freq = new Array(10).fill(0);
for (let t = 0; t < N; t++) {
  const seven = PK.shuffle(PK.newDeck(), rng).slice(0, 7);
  const ev = PK.evaluate(seven), bf = PK.bestFive(seven);
  freq[ev.cat]++;
  if (ev.score === bf.ev.score && bf.cards.length === 5 && PK.isBestSelection(seven, bf.cards)) consistent++;
}
check('evaluate(7) совпадает с перебором 21 пятёрки на ' + N + ' случайных руках', consistent === N, consistent + '/' + N);
// Известные вероятности для 7 карт
const expected = [0.174, 0.438, 0.235, 0.0483, 0.0462, 0.0303, 0.026, 0.00168, 0.000279, 0.000032];
for (let c = 0; c <= 6; c++) {
  const got = freq[c] / N;
  check('частота «' + PK.CAT_NAMES[c] + '» ≈ ' + expected[c], Math.abs(got - expected[c]) < Math.max(0.01, expected[c] * 0.15), got.toFixed(4));
}
// Генератор заданий даёт нужную категорию
for (let cat = 0; cat <= 9; cat++) for (const n of [5, 7]) {
  let ok = 0;
  for (let k = 0; k < 40; k++) { const h = PK.genHand(cat, n, rng); if (h.length === n && new Set(h).size === n && PK.evaluate(h).cat === cat) ok++; }
  check('genHand(' + PK.CAT_NAMES[cat] + ', ' + n + ')', ok === 40, ok + '/40');
}
// Аутсы: флеш-дро на флопе = 9 аутов
const oi = PK.outsInfo(PK.parseCards('Ah 7h'), PK.parseCards('Kh 2h 9c'));
check('флеш-дро: 9 аутов на флеш', (oi.byCat[5] || []).length === 9, JSON.stringify(Object.keys(oi.byCat).map(k => k + ':' + oi.byCat[k].length)));
const oe = PK.outsInfo(PK.parseCards('8c 7d'), PK.parseCards('6h 5s Kc'));
check('двусторонний стрит-дро: 8 аутов на стрит', (oe.byCat[4] || []).length === 8);
// Эквити: AA против одной случайной руки ≈ 85%
const eqAA = PK.equity(PK.parseCards('As Ah'), [], 1, 20000, rng);
check('эквити AA против случайной ≈ 85%', Math.abs(eqAA - 0.852) < 0.015, eqAA.toFixed(3));
check('формула Чена: AA=20, AKs=12, 72o=0', PK.chen(PK.parseCards('As Ah')) === 20 && PK.chen(PK.parseCards('As Ks')) === 12 && PK.chen(PK.parseCards('7s 2h')) === 0);

  TS.done();
