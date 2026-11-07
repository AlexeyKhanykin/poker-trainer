// «Шансы и ауты»: каждое задание пересчитывается независимо, перебором оставшихся карт.
const H = require('../lib/harness');
const R = require('../lib/ref-eval');
const TS = H.suite('Шансы и ауты: пересчёт заданий');
const { PK, PKDrills } = H.load();
const rng = PK.mulberry32(8080);

function refOuts(vk, hole, board) {
  const V = PK.VARIANTS[vk], P = R.POWER[V.sd ? 'sd' : 'std'];
  const cur = R.bestFor(V, hole, board).cat;
  const dead = new Set(hole.concat(board));
  const outs = [];
  let unseen = 0;
  for (const c of PK.deckFor(vk)) {
    if (dead.has(c)) continue;
    unseen++;
    const nb = board.concat([c]);
    const now = R.bestFor(V, hole, nb).cat;
    // В холдеме улучшение должно идти от ваших карт, а не только от стола.
    if (P[now] > P[cur] && (V.omaha || P[now] > P[R.catOf(nb, V.sd)])) outs.push(c);
  }
  return { outs, unseen };
}

for (const vk of Object.keys(PK.VARIANTS)) for (const type of PKDrills.ODDS_TYPES) {
  TS.group(vk + ' · ' + PKDrills.ODDS_NAMES[type]);
  const reps = H.N(20, 4);
  for (let k = 0; k < reps; k++) {
    const t = PKDrills.genOdds(vk, type, rng);
    if (!TS.check('задание создано', !!t)) continue;
    const tag = t.hole.map(PK.cardText).join('') + ' | ' + t.board.map(PK.cardText).join('');
    const ref = refOuts(vk, t.hole, t.board);
    TS.eq('ауты совпадают с перебором: ' + tag, t.outs.slice().sort((a, b) => a - b), ref.outs.sort((a, b) => a - b));
    TS.eq('неизвестных карт: ' + tag, t.unseen, ref.unseen);
    const n = ref.outs.length, u = ref.unseen;
    const pNext = n / u, pRiver = t.board.length === 3 ? 1 - ((u - n) * (u - n - 1)) / (u * (u - 1)) : pNext;
    TS.check('вероятности по формуле: ' + tag, Math.abs(t.pNext - pNext) < 1e-12 && Math.abs(t.pByRiver - pRiver) < 1e-12);
    const vals = t.options.map(o => o.v);
    TS.check('варианты ответа различны, правильный среди них: ' + tag, new Set(vals).size === vals.length && t.correct >= 0 && t.correct < vals.length && vals.length >= 2, vals);
    if (type === 'outs') TS.eq('правильный ответ = число аутов: ' + tag, vals[t.correct], n);
    if (type === 'prob') {
      TS.eq('правильный ответ = шанс в %: ' + tag, vals[t.correct], Math.round((t.toRiver ? pRiver : pNext) * 100));
      TS.check('все варианты от 1 до 99%: ' + tag, vals.every(v => v > 0 && v < 100), vals);
    }
    if (type === 'pot') {
      TS.eq('вопрос о колле задаётся на тёрне: ' + tag, t.board.length, 4);
      TS.near('нужный шанс = колл / (банк + колл): ' + tag, t.need, t.toCall / (t.pot + t.toCall), 1e-12);
      TS.eq('правильный ответ: колл, если шанс ≥ нужного: ' + tag, vals[t.correct], pNext >= t.need ? 'call' : 'fold');
      TS.check('в вопросе указаны банк и ставка: ' + tag, t.question.includes(String(t.pot)) && t.question.includes(String(t.toCall)));
    }
    TS.check('у задания есть дро (4+ аута) и рука слабее стрита: ' + tag, n >= 4);
  }
}

TS.group('известные ситуации');
const C = PK.parseCards;
const known = [
  ['holdem', 'Ah Kh', '2h 7h Jc', 'флеш-дро с оверкартами', 15],
  ['holdem', '9s 8d', '7c 6h 2s', 'открытое стрит-дро (8) + пара к своей карте (6)', 14],
  ['holdem', '9s 8d', 'Jc 7h 2s', 'стрит «в дырку» (4) + пара к своей карте (6)', 10],
  ['holdem', '5h 5d', 'Kc 9s 2d', 'карманная пара: сет (2) + вторая пара со столом (9)', 11],
  ['holdem', 'Ah Kh', 'Qh Jh 2c', 'флеш-дро (9) + десятки без червы (3) + пары к A/K (6)', 18],
  ['holdem', '7h 6h', '5h 4h 2c', 'стрит-флеш-дро: стрит/флеш (15) + пары к своим картам (6)', 21],
  ['holdem', '2c 3d', 'Ac Ad As', 'тройка на столе: тузы у всех, улучшают только свои карты', 6],
  ['short', '9h 8h', '7h 6h Kc', 'шорт-дек: флеш (5) + стрит с T и A (8) − 2 общих + пары (6)', 17],
  ['omaha', 'Ah Kh 2c 3d', 'Qh Jh 5s', 'омаха: флеш-дро + стрит-дро + пары', 30]
];
for (const [vk, h, b, name, want] of known) {
  const o = PK.outsInfo(C(h), C(b), vk), ref = refOuts(vk, C(h), C(b));
  TS.eq(name + ': совпадает с перебором', o.outs.length, ref.outs.length);
  TS.check(name + ': ' + want + ' аутов', o.outs.length === want, o.outs.length);
}
TS.done();
