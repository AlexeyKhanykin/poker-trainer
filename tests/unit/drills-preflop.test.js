// «Играть или сбросить»: правила подсказки, генератор заданий, таблица 169 рук.
const H = require('../lib/harness');
const TS = H.suite('Префлоп: правила, задания, таблица рук');
const { PK, PKDrills } = H.load();
const rng = PK.mulberry32(4040);
const POS = PKDrills.POS6;

// Спецификация правил (как описано в «Правилах» и в подсказках) — независимая запись.
function spec(t, pos, facing, bbs, canCheck) {
  const late = pos === 'CO' || pos === 'BTN';
  if (!facing) {
    if (canCheck && t < 3) return 'check';
    if (t >= 3) return 'raise';
    if (t === 2) return late || pos === 'SB' ? 'raise' : 'fold';
    if (t === 1) return pos === 'BTN' ? 'raise' : 'fold';
    return 'fold';
  }
  if (t === 4) return 'raise';
  if (t === 3) return bbs <= 6 ? 'call' : 'fold';
  if (t === 2) return (late || pos === 'BB') && bbs <= 3 ? 'call' : 'fold';
  return 'fold';
}
TS.group('матрица правил');
for (let t = 0; t <= 4; t++) for (const pos of POS) {
  for (const canCheck of [false, true]) {
    const a = PK.preflopAdvice({ tier: t, pos, facingRaise: false, toCallBB: 1, canCheck });
    TS.eq('без повышения: сила ' + t + ', ' + pos + (canCheck ? ', чек бесплатный' : ''), a.action, spec(t, pos, false, 1, canCheck));
    TS.check('у совета есть объяснение (' + a.rule + ')', !!PK.PREFLOP_WHY[a.rule]);
  }
  for (const bbs of [1.5, 2, 2.5, 3, 3.5, 4, 6, 6.5, 10, 30]) {
    const a = PK.preflopAdvice({ tier: t, pos, facingRaise: true, toCallBB: bbs, canCheck: false });
    TS.eq('против повышения ' + bbs + ' BB: сила ' + t + ', ' + pos, a.action, spec(t, pos, true, bbs, false));
  }
}
TS.check('все объяснения правил непустые и заканчиваются точкой', Object.values(PK.PREFLOP_WHY).every(s => s.length > 20 && /[.!]$/.test(s)));

TS.group('генератор заданий');
for (const vk of Object.keys(PK.VARIANTS)) {
  const V = PK.VARIANTS[vk];
  const tiers = new Set(), subs = new Set(), poss = new Set();
  const reps = H.N(40, 10);
  for (let k = 0; k < reps; k++) {
    const opts = k % 3 === 0 ? { facingRaise: true } : k % 3 === 1 ? { facingRaise: false } : {};
    const t = PKDrills.genPreflop(vk, rng, opts);
    const tag = vk + ' ' + t.hole.map(PK.cardText).join('') + ' ' + t.pos + (t.facingRaise ? ' vs ' + t.raiseTo : '');
    tiers.add(t.info.tier); subs.add(t.sub); poss.add(t.pos);
    TS.check('карты: ' + V.hole + ' разных из колоды варианта — ' + tag, t.hole.length === V.hole && new Set(t.hole).size === V.hole && t.hole.every(c => PK.deckFor(vk).includes(c)));
    TS.eq('сила руки из startingHandInfo — ' + tag, t.info.tier, PK.startingHandInfo(t.hole, vk).tier);
    TS.eq('правильный вариант = совет — ' + tag, t.options[t.correct] && t.options[t.correct].v, t.advice.action);
    const posted = t.pos === 'SB' ? 0.5 : t.pos === 'BB' ? 1 : 0;
    TS.check('колл в BB посчитан с учётом блайнда — ' + tag, Math.abs(t.toCallBB - (t.facingRaise ? t.raiseTo - posted : 1 - posted)) < 1e-9);
    TS.check('большой блайнд всегда отвечает на повышение — ' + tag, t.pos !== 'BB' || t.facingRaise);
    TS.check('вид задания совпадает — ' + tag, t.sub === (t.facingRaise ? 'raise' : 'open') && (opts.facingRaise == null || t.pos === 'BB' || t.facingRaise === opts.facingRaise));
  }
  TS.check(vk + ': встречаются разные силы рук', tiers.size >= (H.QUICK ? 2 : 4), [...tiers]);
  TS.check(vk + ': встречаются оба вида заданий', subs.size === 2);
  TS.check(vk + ': встречаются разные позиции', poss.size >= (H.QUICK ? 3 : 5));
}

TS.group('таблица стартовых рук');
for (const vk of ['holdem', 'short']) {
  const g = PKDrills.handGrid(vk), n = vk === 'short' ? 9 : 13;
  TS.eq(vk + ': размер ' + n + '×' + n, [g.rows.length, g.rows.every(r => r.length === n)], [n, true]);
  const cells = [].concat(...g.rows);
  TS.eq(vk + ': пар на диагонали', cells.filter(c => c.pair).length, n);
  TS.eq(vk + ': одномастных над диагональю', cells.filter(c => c.suited).length, n * (n - 1) / 2);
  TS.eq(vk + ': все коды разные', new Set(cells.map(c => c.code)).size, n * n);
  g.rows.forEach((row, i) => row.forEach((c, j) => {
    const cards = [PK.makeCard(c.hi, 0), PK.makeCard(c.lo, c.suited ? 0 : 1)];
    const info = PK.startingHandInfo(cards, vk);
    const ok = c.code === info.code && c.tier === info.tier && c.hi === Math.max(g.ranks[i], g.ranks[j]) &&
      c.open === (c.tier >= 3 ? 'any' : c.tier === 2 ? 'late' : c.tier === 1 ? 'btn' : 'fold') && c.suited === (i < j);
    TS.check(vk + ' ' + c.code + ': клетка согласована с оценкой руки', ok, c);
  }));
  const tierOf = code => cells.find(c => c.code === code).tier;
  TS.eq(vk + ': AA — премиум', tierOf('AA'), 4);
  TS.check(vk + ': AKs не слабее AKo', tierOf('AKs') >= tierOf('AKo'));
  TS.check(vk + ': пары не ослабевают с ростом ранга', g.ranks.every((r, k) => k === 0 || g.rows[k][k].tier <= g.rows[k - 1][k - 1].tier));
  TS.check(vk + ': одномастная не слабее разномастной', cells.filter(c => c.suited).every(c => c.tier >= cells.find(x => !x.suited && !x.pair && x.hi === c.hi && x.lo === c.lo).tier));
}
TS.eq('холдем: 72o — слабая', PKDrills.handGrid('holdem').rows[12][7].tier, 0);
TS.check('омаха: таблицы нет', PKDrills.handGrid('omaha') === null && PKDrills.handGrid('omaha5') === null);
TS.check('таблица кешируется', PKDrills.handGrid('holdem') === PKDrills.handGrid('holdem'));
for (let k = 0; k < H.N(50, 10); k++) {
  const d = PK.shuffle(PK.deckFor('holdem').slice(), rng).slice(0, 2);
  const gc = PKDrills.gridCode(d), code = PK.startingHandInfo(d, 'holdem').code;
  const cell = [].concat(...PKDrills.handGrid('holdem').rows).find(c => c.hi === gc.hi && c.lo === gc.lo && c.suited === gc.suited && (c.pair === (gc.hi === gc.lo)));
  TS.check('gridCode ' + d.map(PK.cardText).join('') + ' находит клетку ' + code, cell && cell.code === code, cell);
}
TS.group('руки, отличающиеся только мастями');
for (const vk of ['short', 'omaha', 'omaha5']) {
  for (let k = 0; k < H.N(30, 6); k++) {
    const h = PK.shuffle(PK.deckFor(vk).slice(), rng).slice(0, PK.VARIANTS[vk].hole);
    const perm = PK.shuffle([0, 1, 2, 3], rng);
    const h2 = h.map(c => (c & ~3) | perm[c & 3]);
    const a = PK.startingHandInfo(h, vk), b = PK.startingHandInfo(h2, vk);
    TS.check(vk + ': ' + h.map(PK.cardText).join('') + ' и ' + h2.map(PK.cardText).join('') + ' — одна сила и код', a.tier === b.tier && a.eq1 === b.eq1 && a.code === b.code, [a.tier, b.tier]);
  }
}
TS.done();
