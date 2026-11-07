// Общая часть тестов ботов: прогон стола ботов с проверкой каждого решения.
const H = require('./harness');
const { PK } = H.load();
const STY = Object.keys(PK.STYLES);
const LEVELS = ['easy', 'normal', 'hard'];
const TYPES = new Set(['fold', 'check', 'call', 'raise', 'allin']);

function table(vk, level, n, seed, stack) {
  const rng = PK.mulberry32(seed);
  const seats = Array.from({ length: n }, (_, i) => ({ name: 'Бот' + i, style: STY[(i + seed) % 3], level: level === 'mixed' ? LEVELS[i % 3] : level }));
  return { g: new PK.Game({ seats, rng, variant: vk, startStack: stack || 1000, handsPerLevel: 4 }), rng };
}
function play(vk, level, n, hands, seed, stack) {
  let { g, rng } = table(vk, level, n, seed, stack);
  const st = { hands: 0, decisions: 0, illegal: [], badSize: [], foldFree: 0, chips: 0, hang: 0, noResult: 0, raises: 0, folds: 0, calls: 0, showdowns: 0, games: 1 };
  while (st.hands < hands) {
    if (!g.startHand()) { ({ g, rng } = table(vk, level, n, seed + st.games * 7919, stack)); st.games++; continue; }
    st.hands++;
    let steps = 0;
    while (!g.done) {
      if (++steps > 300) { st.hang++; break; }
      if (g.awaitingDeal) { g.nextStreet(); continue; }
      const i = g.toAct, L = g.legal(i);
      const a = PK.botDecide(g, i, rng, 24);
      st.decisions++;
      if (!a || !TYPES.has(a.type)) st.illegal.push(JSON.stringify(a));
      else if (a.type === 'raise') {
        st.raises++;
        if (!L.canRaise) st.illegal.push('рейз, когда нельзя повышать');
        else if (!(a.amount >= L.minTo && a.amount <= L.maxTo)) st.badSize.push(a.amount + ' вне [' + L.minTo + ', ' + L.maxTo + ']');
      } else if (a.type === 'fold') { st.folds++; if (L.canCheck) st.foldFree++; }
      else st.calls++;
      g.act(i, a);
      if (g.chipsInPlay() !== g.totalChips) st.chips++;
    }
    if (!g.result) st.noResult++;
    else if (g.result.type === 'showdown') st.showdowns++;
  }
  return st;
}

function legalitySuite(vk) {
  const TS = H.suite('Боты: допустимость решений · ' + PK.VARIANTS[vk].short);
  const HANDS = vk === "omaha5" ? H.N(10, 3) : vk === "omaha" ? H.N(14, 4) : H.N(20, 5);
  for (const level of LEVELS.concat('mixed')) for (let n = 2; n <= 6; n++) {
    TS.group(vk + ' · ' + level + ' · ' + n + ' за столом');
    const st = play(vk, level, n, HANDS, 1000 + n * 31 + vk.length * 7 + level.length);
    const tag = vk + '/' + level + '/' + n + ': ';
    TS.check(tag + 'все действия известного типа и разрешены', st.illegal.length === 0, st.illegal.slice(0, 3).join('; '));
    TS.check(tag + 'размер рейза в пределах [мин, макс]', st.badSize.length === 0, st.badSize.slice(0, 3).join('; '));
    TS.check(tag + 'не сбрасывает, когда можно бесплатно сделать чек', st.foldFree === 0, st.foldFree + ' раз');
    TS.check(tag + 'фишки сохраняются после каждого действия', st.chips === 0, st.chips);
    TS.check(tag + 'раздачи не зависают и заканчиваются результатом', st.hang === 0 && st.noResult === 0, st.hang + '/' + st.noResult);
    TS.check(tag + 'боты не только сбрасывают', st.calls + st.raises > 0);
  }
  
  TS.done();
}
module.exports = { PK, play, legalitySuite, LEVELS, STY };
