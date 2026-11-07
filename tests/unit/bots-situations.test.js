// Боты: короткие стеки, повторяемость, характер уровней, типичные ситуации.
const H = require('../lib/harness');
const TS = H.suite('Боты: ситуации и уровни');
const { PK, play, LEVELS, STY } = require('../lib/bots');
TS.group('короткие стеки');
for (const vk of Object.keys(PK.VARIANTS)) {
  const st = play(vk, 'hard', 6, H.N(40, 10), 77, 120);
  TS.check(vk + ': стек 6 BB — решения допустимы', !st.illegal.length && !st.badSize.length && !st.chips && !st.hang, JSON.stringify([st.illegal[0], st.badSize[0]]));
  TS.check(vk + ': турниры с короткими стеками доигрываются', st.games > 1 || H.QUICK, st.games);
}

TS.group('повторяемость');
for (const level of LEVELS) {
  const a = play('holdem', level, 4, 10, 4242), b = play('holdem', level, 4, 10, 4242);
  TS.eq(level + ': одинаковое зерно — одинаковая игра', [a.decisions, a.raises, a.folds, a.showdowns], [b.decisions, b.raises, b.folds, b.showdowns]);
}

TS.group('характер уровней');
{
  const easy = play('holdem', 'easy', 6, H.N(120, 40), 99), hard = play('holdem', 'hard', 6, H.N(120, 40), 99);
  const foldRate = s => s.folds / s.decisions;
  TS.check('новички сбрасывают реже сильных', foldRate(easy) < foldRate(hard), foldRate(easy).toFixed(2) + ' vs ' + foldRate(hard).toFixed(2));
  TS.check('у новичков вскрытий больше', easy.showdowns / easy.hands > hard.showdowns / hard.hands, easy.showdowns + ' vs ' + hard.showdowns);
}

TS.group('ситуации');
{
  // Последний ход: бот с премиумом против олл-ина не сбрасывает тузы
  const g = new PK.Game({ seats: [{ name: 'A', style: 'tight', level: 'hard' }, { name: 'B', style: 'tight', level: 'hard' }], rng: PK.mulberry32(5) });
  g.button = 1; g.startHand({ holes: { 0: PK.parseCards('7c 2d'), 1: PK.parseCards('As Ah') } });
  g.act(g.toAct, { type: 'allin' });
  const d = PK.botDecide(g, g.toAct, PK.mulberry32(1), 60);
  TS.check('тузы уравнивают олл-ин', d.type === 'call' || d.type === 'raise' || d.type === 'allin', d.type);
}
for (const level of LEVELS) for (const style of STY) {
  let calls = 0;
  for (let k = 0; k < 10; k++) {
    const g = new PK.Game({ seats: [{ name: 'A', style: 'tight', level }, { name: 'B', style, level }], rng: PK.mulberry32(50 + k) });
    g.button = 1; g.startHand({ holes: { 0: PK.parseCards('7c 2d'), 1: PK.parseCards(k % 2 ? 'Ks Kh' : 'As Ah') } });
    g.act(g.toAct, { type: 'allin' });
    if (PK.botDecide(g, g.toAct, PK.mulberry32(k), 60).type !== 'fold') calls++;
  }
  TS.check(level + '/' + style + ': AA и KK против олл-ина один на один не сбрасываются', calls === 10, calls + '/10');
}
for (const level of LEVELS) {
  // Безнадёжная рука на ривере против крупной ставки — сбрасывает (любой уровень, кроме случайных коллов новичка)
  let folds = 0;
  for (let k = 0; k < 10; k++) {
    const g = new PK.Game({ seats: [{ name: 'A', style: 'tight', level }, { name: 'B', style: 'tight', level }], rng: PK.mulberry32(10 + k) });
    g.button = 1;
    g.startHand({ holes: { 0: PK.parseCards('Ah Kd'), 1: PK.parseCards('3c 6d') }, board: PK.parseCards('Js Tc 8h 4c 2d') });
    while (g.street !== 'river' || g.awaitingDeal) { if (g.awaitingDeal) g.nextStreet(); else g.act(g.toAct, { type: 'call' }); }
    if (g.toAct !== 0) g.act(g.toAct, { type: 'check' });
    g.act(0, { type: 'raise', amount: 900 });
    if (PK.botDecide(g, 1, PK.mulberry32(k), 60).type === 'fold') folds++;
  }
  TS.check(level + ': с «воздухом» на ривере против банка сбрасывает обычно', folds >= (level === 'easy' ? 4 : 9), folds + '/10');
}
TS.done();
