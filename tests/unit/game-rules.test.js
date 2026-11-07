// Правила игры за столом: блайнды, порядок ходов, размеры ставок, улицы, банки, выбывание.
const H = require('../lib/harness');
const TS = H.suite('Правила стола: сценарии');
const { PK } = H.load();
const C = PK.parseCards;
const NAMES = ['Вы', 'Анна', 'Борис', 'Вика', 'Глеб', 'Дина'];
// Стол из n мест; кнопка дилера окажется на месте 0 в первой раздаче.
function mk(n, o) {
  o = o || {};
  const g = new PK.Game({ seats: NAMES.slice(0, n).map((name, i) => ({ name, style: 'tight', human: i === 0 })), rng: PK.mulberry32(o.seed || 1), variant: o.variant, startStack: o.stack, handsPerLevel: o.hpl });
  g.button = n - 1;
  if (o.stacks) o.stacks.forEach((s, i) => { g.players[i].stack = s; });
  if (o.stacks) g.totalChips = o.stacks.reduce((a, b) => a + b, 0);
  return g;
}
const stacks = g => g.players.map(p => p.stack);
const sum = a => a.reduce((x, y) => x + y, 0);
function callDown(g) { let n = 0; while (!g.done && n++ < 100) { if (g.awaitingDeal) g.nextStreet(); else A(g, 'call'); } }
const A = (g, type, amount) => g.act(g.toAct, amount != null ? { type, amount } : { type });

TS.group('блайнды и первый ход');
{
  const g = mk(6); g.startHand();
  TS.eq('кнопка на месте 0', g.button, 0);
  TS.eq('малый блайнд — место 1', g.sbSeat, 1);
  TS.eq('большой блайнд — место 2', g.bbSeat, 2);
  TS.eq('стеки после блайндов', stacks(g), [1000, 990, 980, 1000, 1000, 1000]);
  TS.eq('банк 30', g.pot(), 30);
  TS.eq('текущая ставка = BB', g.currentBet, 20);
  TS.eq('первым ходит UTG (место 3)', g.toAct, 3);
  TS.eq('улица префлоп', g.street, 'preflop');
  TS.eq('стол пуст', g.board.length, 0);
  TS.eq('у всех по 2 карты', g.players.map(p => p.hole.length), [2, 2, 2, 2, 2, 2]);
  const all = [].concat(...g.players.map(p => p.hole), g.boardAll);
  TS.eq('17 разных карт (12 в руках + 5 на стол)', new Set(all).size, 17);
  TS.eq('фишки в игре сохраняются', g.chipsInPlay(), 6000);
  const L = g.legal(3);
  TS.eq('UTG: колл 20', L.toCall, 20);
  TS.eq('UTG: минимальный рейз до 40', L.minTo, 40);
  TS.eq('UTG: максимум — весь стек (безлимит)', L.maxTo, 1000);
  TS.check('UTG может повышать', L.canRaise);
  TS.check('UTG не может сделать чек', !L.canCheck);
  TS.eq('лог начинается с описания раздачи', g.log[0].kind, 'info');
  TS.check('в логе есть блайнды', g.log.filter(x => x.kind === 'blind').length === 2);
}

TS.group('размеры рейзов');
{
  const g = mk(6); g.startHand();
  A(g, 'raise', 60);
  TS.eq('рейз до 60: текущая ставка', g.currentBet, 60);
  TS.eq('минимальное повышение стало 40', g.minRaise, 40);
  TS.eq('следующий минимум — до 100', g.legal(g.toAct).minTo, 100);
  TS.eq('префлоп-агрессор запомнен', g.pfRaiser, 3);
  A(g, 'raise', 70);
  TS.eq('рейз меньше минимума поднимается до минимума', g.currentBet, 100);
  A(g, 'raise', 99999);
  TS.eq('рейз больше стека — олл-ин', g.players[5].stack, 0);
  TS.check('игрок помечен как олл-ин', g.players[5].allIn);
  TS.eq('ставка олл-ина 1000', g.currentBet, 1000);
  A(g, 'check');
  TS.eq('чек при ставке превращается в колл (или олл-ин)', g.players[0].bet, 1000);
  TS.eq('фишки сохраняются', g.chipsInPlay(), 6000);
}

TS.group('лимп, опция большого блайнда, улицы');
{
  const g = mk(3); g.startHand();
  TS.eq('3 игрока: первым ходит кнопка', g.toAct, 0);
  A(g, 'call'); A(g, 'call');
  TS.eq('большой блайнд получает опцию', g.toAct, 2);
  TS.check('BB может сделать чек', g.legal(2).canCheck);
  A(g, 'call');
  TS.check('колл без ставки превращается в чек', g.awaitingDeal && g.players[2].lastAction === 'чек');
  TS.eq('банк 60', g.pot(), 60);
  g.nextStreet();
  TS.eq('флоп: 3 карты', g.board.length, 3);
  TS.eq('флоп: первым ходит малый блайнд', g.toAct, 1);
  TS.eq('новая улица: ставка 0', g.currentBet, 0);
  TS.check('можно сделать чек', g.legal(1).canCheck && g.legal(1).isBet);
  TS.eq('минимальная ставка = BB', g.legal(1).minTo, 20);
  A(g, 'check'); A(g, 'check'); A(g, 'check');
  g.nextStreet();
  TS.eq('тёрн: 4 карты', g.board.length, 4);
  TS.eq('тёрн — первые 4 карты заготовленного стола', g.board, g.boardAll.slice(0, 4));
  A(g, 'raise', 50); A(g, 'call'); A(g, 'fold');
  TS.check('после фолда игрок выбыл из раздачи', g.players[0].folded);
  g.nextStreet();
  TS.eq('ривер: 5 карт', g.board.length, 5);
  A(g, 'check'); A(g, 'check');
  TS.check('после ривера — вскрытие', g.done && g.result && g.result.type === 'showdown');
  TS.eq('улица «вскрытие»', g.street, 'showdown');
  TS.eq('после раздачи фишки сохраняются', sum(stacks(g)), 3000);
  TS.eq('выплачен весь банк', sum(Object.values(g.result.payouts)), 160);
}

TS.group('ошибки ходов');
{
  const g = mk(3); g.startHand();
  TS.throws('ход не в свою очередь — исключение', () => g.act(1, { type: 'call' }));
  TS.throws('нельзя открыть флоп посреди торговли', () => g.nextStreet());
  TS.throws('неизвестное действие', () => g.act(g.toAct, { type: 'dance' }));
}

TS.group('все сбросили');
{
  const g = mk(4); g.startHand();
  A(g, 'fold'); A(g, 'fold'); A(g, 'fold');
  TS.check('раздача окончена без вскрытия', g.done && g.result.type === 'fold');
  TS.eq('банк забирает большой блайнд', g.result.winners, [g.bbSeat]);
  TS.eq('выплата 30', g.result.payouts[g.bbSeat], 30);
  TS.eq('стеки', stacks(g), [1000, 990, 1010, 1000]);
}

TS.group('один на один');
{
  const g = mk(2); g.startHand();
  TS.eq('дилер ставит малый блайнд', g.sbSeat, g.button);
  TS.eq('на префлопе первым ходит дилер', g.toAct, g.button);
  TS.eq('позиция дилера', g.positionInfo(0).short, 'BTN');
  TS.eq('позиция соперника', g.positionInfo(1).short, 'BB');
  A(g, 'call'); A(g, 'check');
  g.nextStreet();
  TS.eq('после флопа первым ходит большой блайнд', g.toAct, 1);
}

TS.group('позиции за столом');
{
  const want = { 2: ['BTN', 'BB'], 3: ['BTN', 'SB', 'BB'], 4: ['BTN', 'SB', 'BB', 'CO'], 5: ['BTN', 'SB', 'BB', 'UTG', 'CO'], 6: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'] };
  for (const n in want) {
    const g = mk(+n); g.startHand();
    TS.eq(n + ' игроков: позиции', g.players.map((p, i) => g.positionInfo(i).short), want[n]);
    TS.eq(n + ' игроков: поздние позиции', g.players.map((p, i) => g.isLatePosition(i)), want[n].map(x => x === 'BTN' || x === 'CO'));
  }
}

TS.group('короткий олл-ин не открывает торговлю заново');
{
  const g = mk(3, { stacks: [1000, 1000, 75] }); g.startHand();
  // кнопка 0, SB 1, BB 2 (стек 75 → после блайнда 55)
  A(g, 'raise', 60);           // кнопка: рейз до 60
  A(g, 'call');                // SB: колл 60
  A(g, 'raise', 75);           // BB: олл-ин до 75 — повышение 15 меньше минимума 40
  TS.eq('олл-ин BB на 75', g.players[2].allIn && g.currentBet, 75);
  TS.eq('минимальное повышение не изменилось', g.minRaise, 40);
  TS.eq('ход у кнопки', g.toAct, 0);
  const L = g.legal(0);
  TS.check('кнопка может только уравнять или сбросить', !L.canRaise && L.toCall === 15);
  A(g, 'raise', 500);
  TS.eq('попытка рейза превращается в колл', g.players[0].bet, 75);
  A(g, 'call');
  TS.check('торговля закончилась', g.awaitingDeal);
  TS.check('остальные ещё могут ставить — карты не открываются автоматически', !g.isRunout());
}

TS.group('пот-лимит (омаха)');
{
  const g = mk(6, { variant: 'omaha' }); g.startHand();
  TS.eq('по 4 карты', g.players[0].hole.length, 4);
  const L = g.legal(3);
  TS.eq('UTG: максимум — до 70 (банк 30 + колл 20 + 20)', L.maxTo, 70);
  TS.check('отмечено, что пот-лимит', L.potLimit);
  A(g, 'raise', 9999);
  TS.eq('ставка обрезана до банка', g.currentBet, 70);
  // MP: банк 100, колл 70 → максимум 70 + 100 + 70 = 240
  TS.eq('MP: максимум до 240', g.legal(4).maxTo, 240);
  A(g, 'allin');
  TS.eq('«олл-ин» в пот-лимите = ставка в банк', g.currentBet, 240);
  TS.check('не олл-ин на самом деле', !g.players[4].allIn);
}
{
  const g = mk(6, { variant: 'omaha5' }); g.startHand();
  TS.eq('омаха-5: по 5 карт', g.players[0].hole.length, 5);
  TS.eq('омаха-5: 6×5 + 5 разных карт', new Set([].concat(...g.players.map(p => p.hole), g.boardAll)).size, 35);
}
{
  const g = mk(6, { variant: 'short' }); g.startHand();
  const all = [].concat(...g.players.map(p => p.hole), g.boardAll);
  TS.check('шорт-дек: нет карт младше шестёрки', all.every(c => (c >> 2) + 2 >= 6));
}

TS.group('рост блайндов');
{
  const g = mk(3, { hpl: 2 });
  const lv = [];
  for (let h = 0; h < 6; h++) { g.startHand(); lv.push(g.bb); while (!g.done) { if (g.awaitingDeal) g.nextStreet(); else A(g, 'fold'); } }
  TS.eq('каждые 2 раздачи блайнды растут', lv, [20, 20, 30, 30, 40, 40]);
  g.startHand();
  TS.eq('раздач до следующего уровня', g.handsToNextLevel(), 2);
}
{
  const g = mk(2, { hpl: 1, stack: 1e9 });
  for (let h = 0; h < 30; h++) { g.startHand(); while (!g.done) { if (g.awaitingDeal) g.nextStreet(); else A(g, 'fold'); } }
  TS.eq('уровень блайндов не выходит за таблицу', g.bb, PK.BLINDS[PK.BLINDS.length - 1][1]);
  TS.eq('на последнем уровне счётчик не показывается', g.handsToNextLevel(), null);
}

TS.group('кнопка и выбывание');
{
  const g = mk(4); g.startHand();
  TS.eq('первая раздача: кнопка 0', g.button, 0);
  A(g, 'fold'); A(g, 'fold'); A(g, 'fold');
  g.players[1].stack = 0; g.totalChips -= 990;
  g.startHand();
  TS.check('игрок без фишек выбыл', g.players[1].out && g.players[1].folded);
  TS.eq('кнопка перешла через выбывшего', g.button, 2);
  TS.eq('карт у выбывшего нет', g.players[1].hole.length, 0);
}
{
  const g = mk(3);
  g.players[1].stack = 0; g.players[2].stack = 0;
  TS.check('остался один игрок — игра окончена', g.startHand() === false && g.gameOver);
}
{
  const g = mk(3, { stacks: [1000, 5, 1000] }); g.startHand();
  TS.check('малый блайнд больше стека — олл-ин на 5', g.players[1].allIn && g.players[1].bet === 5);
}

TS.group('вскрытие и делёжка');
{
  // Роял-флеш на столе — все делят банк
  const g = mk(3);
  g.startHand({ holes: { 0: C('2c 3d'), 1: C('4c 5d'), 2: C('7c 8d') }, board: C('As Ks Qs Js Ts') });
  callDown(g);
  TS.check('вскрытие', g.result && g.result.type === 'showdown');
  TS.eq('банк 60 поровну', [0, 1, 2].map(i => g.result.payouts[i]), [20, 20, 20]);
  TS.eq('три победителя', g.result.winners.length, 3);
  TS.eq('стеки не изменились', stacks(g), [1000, 1000, 1000]);
}
{
  // Нечётная фишка при делёжке — первому после кнопки
  const g = mk(3);
  g.startHand({ holes: { 0: C('2c 3d'), 1: C('4c 5d'), 2: C('7c 8d') }, board: C('As Ks Qs Js Ts') });
  A(g, 'call'); A(g, 'call'); A(g, 'check');            // банк 60
  g.nextStreet(); A(g, 'raise', 25); A(g, 'call'); A(g, 'call');  // банк 135
  g.nextStreet(); A(g, 'raise', 20); A(g, 'call'); A(g, 'fold');  // банк 175, кнопка сбросила
  g.nextStreet(); A(g, 'check'); A(g, 'check');
  const pay = g.result.payouts;
  TS.eq('банк 175 делится 88/87, лишняя фишка — малому блайнду', [pay[1], pay[2]], [88, 87]);
  TS.check('сбросивший ничего не получает', !pay[0]);
  TS.eq('фишки сохраняются', sum(stacks(g)), 3000);
}
{
  // Лучшая рука забирает всё
  const g = mk(3);
  g.startHand({ holes: { 0: C('Ah Ad'), 1: C('Kh Kd'), 2: C('7c 2d') }, board: C('As 9c 4d 3h Jc') });
  callDown(g);
  TS.eq('тройка тузов выигрывает', g.result.winners, [0]);
  TS.eq('описание руки на вскрытии', g.result.hands[0].ev.cat, 3);
  TS.eq('стеки', stacks(g), [1040, 980, 980]);
  TS.check('в логе есть показ карт', g.log.filter(x => x.kind === 'show').length === 3);
}
{
  // Кикер решает
  const g = mk(2);
  g.startHand({ holes: { 0: C('Ah Qd'), 1: C('Ac Jd') }, board: C('As 9c 4d 3h 2c') });
  callDown(g);
  TS.eq('пара тузов с кикером Q бьёт кикер J', g.result.winners, [0]);
}
{
  // Омаха: две карты из руки — флеш на столе не считается
  const g = mk(2, { variant: 'omaha' });
  g.startHand({ holes: { 0: C('Ah Kd 2c 3c'), 1: C('7s 7d 8c 9d') }, board: C('Qh Jh 5h 4h 7c') });
  callDown(g);
  TS.eq('сет семёрок бьёт «флеш» с одной червой в руке', g.result.winners, [1]);
}
{
  // Шорт-дек: флеш старше фулл-хауса
  const g = mk(2, { variant: 'short' });
  g.startHand({ holes: { 0: C('Ah 6h'), 1: C('Ks Kd') }, board: C('Kh 9h 9c Th 7s') });
  callDown(g);
  TS.eq('флеш бьёт фулл-хаус', g.result.winners, [0]);
}
{
  // Три олл-ина разного размера: основной и два побочных банка
  const g = mk(4, { stacks: [100, 300, 600, 1000] });
  g.startHand({ holes: { 0: C('Ah Ad'), 1: C('Kh Kd'), 2: C('Qh Qd'), 3: C('2c 7d') }, board: C('As Kc 4s 8h 9c') });
  // кнопка 0, SB 1, BB 2, первым ходит 3
  A(g, 'call'); A(g, 'allin'); A(g, 'allin'); A(g, 'allin'); A(g, 'call');
  while (!g.done) { if (g.awaitingDeal) g.nextStreet(); else A(g, 'check'); }
  const pay = g.result.payouts;
  TS.eq('тузы (стек 100) выигрывают основной банк 400', pay[0], 400);
  TS.eq('короли выигрывают побочный 600', pay[1], 600);
  TS.eq('дамы выигрывают третий банк 600', pay[2], 600);
  TS.check('семь-два ничего не выигрывает', !pay[3]);
  TS.eq('три банка: 400, 600, 600', g.result.pots.map(p => p.amount), [400, 600, 600]);
  TS.eq('кто может выиграть каждый банк', g.result.pots.map(p => p.eligible.length), [4, 3, 2]);
  TS.eq('стеки после раздачи', stacks(g), [400, 600, 600, 400]);
  TS.eq('фишки сохраняются', sum(stacks(g)), 2000);
}
{
  // Неуравненная часть ставки возвращается
  const g = mk(2, { stacks: [1000, 400] });
  g.startHand({ holes: { 0: C('2c 7d'), 1: C('Ah Ad') }, board: C('As Kc 4s 8h 9c') });
  A(g, 'allin'); A(g, 'call');
  callDown(g);
  TS.check('отмечен возврат неуравненной ставки', g.result.pots.some(p => p.returned && p.amount === 600));
  TS.eq('проигравший сохранил 600 из 1000', stacks(g), [600, 800]);
}
{
  // Олл-ин на префлопе и колл — карты открываются до конца без торговли
  const g = mk(2, { stacks: [500, 1500] }); g.startHand();
  A(g, 'allin'); A(g, 'call');
  TS.check('торговли больше нет: доска открывается', g.awaitingDeal && g.isRunout());
  let n = 0;
  while (!g.done && n++ < 5) { TS.check('на каждой улице ходить некому', g.toAct < 0); g.nextStreet(); }
  TS.check('дошли до вскрытия', g.result && g.result.type === 'showdown');
  TS.eq('фишки сохраняются', sum(stacks(g)), 2000);
}
TS.done();
