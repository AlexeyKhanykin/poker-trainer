const H = require('../lib/harness');
const TS = H.suite('Банки и сайд-поты: сценарии');
const check = TS.check;
const { PK } = H.load();
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- Чистая функция settle ---
function run(players, strength, order) {
  const r = PK.settle(players, id => strength[id], order || players.map(p => p.id));
  const out = {};
  players.forEach(p => out[p.id] = r.payouts[p.id] || 0);
  return { out, pots: r.pots };
}
// 1. Три игрока в олл-ине, короткий стек выигрывает основной банк
{
  const r = run([{ id: 0, total: 100 }, { id: 1, total: 300 }, { id: 2, total: 300 }], { 0: 3, 1: 2, 2: 1 });
  check('3 игрока: короткий стек берёт основной 300, второй — побочный 400', eq(r.out, { 0: 300, 1: 400, 2: 0 }), JSON.stringify(r.out));
  check('3 игрока: два банка', r.pots.length === 2 && r.pots[0].amount === 300 && r.pots[1].amount === 400);
}
// 2. Четыре разных стека + неуравненный остаток возвращается
{
  const r = run([{ id: 0, total: 50 }, { id: 1, total: 100 }, { id: 2, total: 200 }, { id: 3, total: 400 }], { 0: 3, 1: 4, 2: 1, 3: 2 });
  check('4 игрока: выплаты 0/350/0/400', eq(r.out, { 0: 0, 1: 350, 2: 0, 3: 400 }), JSON.stringify(r.out));
  check('4 игрока: последний банк — возврат', r.pots.length === 4 && r.pots[3].returned && r.pots[3].amount === 200);
}
// 3. Ничья с нечётной фишкой: лишняя фишка — первому слева от дилера
{
  const r = run([{ id: 0, total: 35 }, { id: 1, total: 35 }, { id: 2, total: 15, folded: true }], { 0: 5, 1: 5 }, [1, 2, 0]);
  check('ничья 85 фишек: 42 и 43, лишняя — игроку 1', eq(r.out, { 0: 42, 1: 43, 2: 0 }), JSON.stringify(r.out));
}
// 4. Ничья только в побочном банке
{
  const r = run([{ id: 0, total: 100 }, { id: 1, total: 300 }, { id: 2, total: 300 }], { 0: 9, 1: 5, 2: 5 });
  check('короткий берёт 300, побочный 400 делится 200/200', eq(r.out, { 0: 300, 1: 200, 2: 200 }), JSON.stringify(r.out));
}
// 5. Тройная ничья в основном банке, побочный — одному
{
  const r = run([{ id: 0, total: 100 }, { id: 1, total: 100 }, { id: 2, total: 250 }, { id: 3, total: 250 }], { 0: 7, 1: 7, 2: 7, 3: 1 });
  check('основной 400 делят трое (133/133/134), побочный 300 — игроку 2', eq(r.out, { 0: 133, 1: 133, 2: 134 + 300, 3: 0 }) || eq(r.out, { 0: 134, 1: 133, 2: 133 + 300, 3: 0 }), JSON.stringify(r.out));
  const sum = Object.values(r.out).reduce((a, b) => a + b, 0);
  check('сумма выплат = сумме ставок (700)', sum === 700);
}
// 6. Вклад сбросившего игрока остаётся в банке
{
  const r = run([{ id: 0, total: 200, folded: true }, { id: 1, total: 120 }, { id: 2, total: 400 }], { 1: 9, 2: 1 });
  check('фолд 200 + короткий олл-ин 120: короткий берёт 360+... ', eq(r.out, { 0: 0, 1: 120 * 2 + 120, 2: 400 - 120 + 80 }), JSON.stringify(r.out));
}

// --- Интеграция с движком: подстроенные карты и разные стеки ---
const C = PK.parseCards;
function mkGame(stacks, button) {
  const g = new PK.Game({ seats: stacks.map((_, i) => ({ name: 'P' + i, style: 'tight' })), rng: PK.mulberry32(7) });
  stacks.forEach((s, i) => g.players[i].stack = s);
  g.totalChips = stacks.reduce((a, b) => a + b, 0);
  g.button = button - 1; // startHand сдвинет на button
  return g;
}
function playAllIn(g) {
  let guard = 0;
  while (!g.done && guard++ < 100) {
    if (g.awaitingDeal) { g.nextStreet(); continue; }
    g.act(g.toAct, { type: 'allin' });
  }
}
// 7. 4 игрока, все олл-ин префлоп
{
  const g = mkGame([100, 250, 600, 1000], 0);
  g.startHand({
    holes: { 0: C('As Ah'), 1: C('Ks Kh'), 2: C('Qs Qh'), 3: C('2c 7d') },
    board: C('3c 8d 9s Jc 4h')
  });
  playAllIn(g);
  const st = g.players.map(p => p.stack);
  // P0: 4×100=400; P1: 3×150=450; P2: 2×350=700; P3: возврат 400
  check('движок, 4 олл-ина: стеки [400,450,700,400]', eq(st, [400, 450, 700, 400]), JSON.stringify(st));
  check('движок: фишки сохранились', st.reduce((a, b) => a + b, 0) === 1950);
}
// 8. 3 игрока, ничья на столе (роял на борде) — делят всё поровну по уровням
{
  const g = mkGame([300, 300, 300], 0);
  g.startHand({ holes: { 0: C('2c 3d'), 1: C('4c 5d'), 2: C('6c 7d') }, board: C('As Ks Qs Js Ts') });
  playAllIn(g);
  const st = g.players.map(p => p.stack);
  check('ничья втроём: у всех по 300', eq(st, [300, 300, 300]), JSON.stringify(st));
}
// 9. 2 игрока, разные стеки, короткий выигрывает
{
  const g = mkGame([150, 900], 0);
  g.startHand({ holes: { 0: C('Ac Kc'), 1: C('Qd Jd') }, board: C('As 7h 2c 9s 3d') });
  playAllIn(g);
  check('хедз-ап: короткий удваивается', eq(g.players.map(p => p.stack), [300, 750]), JSON.stringify(g.players.map(p => p.stack)));
}
// 10. Хедз-ап: дилер ставит малый блайнд и ходит первым префлоп, последним после флопа
{
  const g = mkGame([1000, 1000], 0);
  g.startHand();
  check('хедз-ап: дилер = малый блайнд', g.sbSeat === g.button && g.players[g.button].bet === 10);
  check('хедз-ап: дилер ходит первым префлоп', g.toAct === g.button);
  g.act(g.toAct, { type: 'call' });
  check('хедз-ап: у большого блайнда есть опция', g.toAct === g.bbSeat && g.legal(g.bbSeat).canRaise);
  g.act(g.toAct, { type: 'check' });
  g.nextStreet();
  check('хедз-ап: после флопа первым ходит большой блайнд', g.toAct === g.bbSeat);
}
// 11. Мин-рейз и неполный олл-ин-рейз
{
  const g = mkGame([1000, 1000, 1000, 150], 0); // кнопка 0, SB 1, BB 2, UTG 3
  g.startHand();
  check('UTG первый', g.toAct === 3);
  let L = g.legal(3);
  check('мин-рейз префлоп до 40 (2 BB)', L.minTo === 40);
  g.act(0 + 3, { type: 'call' }); // UTG колл 20
  g.act(0, { type: 'raise', amount: 120 }); // кнопка рейз до 120 (+100)
  L = g.legal(1);
  check('после рейза до 120 мин-ререйз до 220', L.minTo === 220, L.minTo);
  g.act(1, { type: 'fold' });
  g.act(2, { type: 'fold' });
  // UTG (стек 130) — олл-ин до 150: неполный рейз (+30 < 100)
  g.act(3, { type: 'allin' });
  check('неполный олл-ин-рейз не меняет мин-рейз', g.minRaise === 100);
  L = g.legal(0);
  check('кнопка после неполного рейза может только колл/фолд', !L.canRaise && L.toCall === 30, JSON.stringify(L));
  g.act(0, { type: 'call' });
  check('после колла раунд закрыт', g.awaitingDeal && g.toAct === -1);
  playAllIn(g);
  check('фишки сохранились (сценарий мин-рейза)', g.players.reduce((a, p) => a + p.stack, 0) === 3150);
}
// 12. Ставка постфлоп: мин-бет = BB, полный рейз переоткрывает торги
{
  const g = mkGame([1000, 1000, 1000], 0);
  g.startHand();
  while (!g.awaitingDeal) g.act(g.toAct, { type: 'call' });
  g.nextStreet();
  const first = g.toAct;
  check('мин-бет постфлоп = BB', g.legal(first).minTo === 20);
  g.act(first, { type: 'raise', amount: 50 });
  const second = g.toAct;
  g.act(second, { type: 'raise', amount: 150 });
  const third = g.toAct;
  g.act(third, { type: 'call' });
  check('после полного рейза первый игрок снова может рейзить', g.toAct === first && g.legal(first).canRaise && g.legal(first).minTo === 250);
}
// 13. Короткий блайнд: большой блайнд с 5 фишками
{
  const g = mkGame([1000, 1000, 5], 0); // SB 1, BB 2 (5 фишек)
  g.startHand({ holes: { 0: C('2c 3c'), 1: C('4d 5d'), 2: C('Ah Ad') }, board: C('Kc 9s 7h 6d Qs') });
  check('BB с 5 фишками в олл-ине', g.players[2].allIn && g.players[2].total === 5);
  g.act(g.toAct, { type: 'fold' }); // кнопка
  g.act(g.toAct, { type: 'call' }); // SB доплачивает до 20
  playAllIn(g);
  const st = g.players.map(p => p.stack);
  check('короткий BB выигрывает только 10 (5+5), остаток 15 возвращён SB', eq(st, [1000, 995, 10]), JSON.stringify(st));
  check('фишки сохранились', st.reduce((a, b) => a + b, 0) === 2005);
}

  TS.done();
