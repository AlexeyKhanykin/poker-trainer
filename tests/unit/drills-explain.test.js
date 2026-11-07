// Объяснения «почему рука сильная/слабая», пояса и «Мои ошибки».
const H = require('../lib/harness');
const TS = H.suite('Объяснения, пояса, мои ошибки');
const { PK, PKDrills } = H.load();
const rng = PK.mulberry32(5150);
const C = PK.parseCards;
const texts = list => list.map(x => x.t).join(' ');
const wellFormed = list => Array.isArray(list) && list.every(x => ['+', '-', '~'].includes(x.s) && typeof x.t === 'string' && x.t.length > 10 &&
  /[.!)»]$/.test(x.t) && !/undefined|NaN|null|\[object|  /.test(x.t) && x.t[0] === x.t[0].toUpperCase());
// Согласование числительных: «5 карт», «2 карты», «21 карта», «6 аутов»…
const badPlural = s => /(^|[^\d])(1|21|31) (карт|карты|аутов|аута)( |\.|,)/.test(s) || /(^|[^\d])([2-4]|2[2-4]) (карт|аутов)( |\.|,)/.test(s) || /(^|[^\d])([5-9]|1\d|20) (карты|карта|аута|аут)( |\.|,)/.test(s);

TS.group('стартовые руки: известные случаи');
const start = [
  ['holdem', 'As Ah', '+', 'лучшая из возможных'], ['holdem', 'Ks Kh', '+', 'Старше неё только пары тузов'],
  ['holdem', '7s 2h', '-', 'Обе карты младше десятки'], ['holdem', '7s 2h', '-', 'Разномастные'],
  ['holdem', 'Ks Qs', '+', 'Обе карты старшие'], ['holdem', 'Ks Qs', '+', 'Одномастные'], ['holdem', 'Ks Qs', '+', 'Связанные'],
  ['holdem', 'Ah 5c', '+', 'Туз'], ['holdem', 'Kh 4c', '-', 'Слабый кикер'], ['holdem', '9h 7h', '~', 'через одну'],
  ['holdem', '5h 5d', '~', 'Младшая пара'], ['holdem', '8h 8d', '~', 'Средняя пара'], ['holdem', 'Ah 2h', '+', 'Связанные'],
  ['holdem', 'Qh 3d', '-', 'стрит с обеими невозможен'], ['short', 'Ah 6h', '+', 'Связанные'], ['short', 'Ah 9h', '+', 'флеш особенно ценен'],
  ['omaha', 'Ah Ad Kh Kd', '+', 'Двухмастная'], ['omaha', 'Ah Ad Kh Kd', '+', 'Пара тузов'], ['omaha', '7h 7d 7c 2s', '-', 'Три карты одного ранга'],
  ['omaha', '2c 5d 9h Ks', '-', 'Разномастная'], ['omaha', 'Th Jh Qd Kd', '+', 'Карты связаны'], ['omaha', 'Ah 4h 8d Jc', '+', 'натсовым'],
  ['omaha5', 'Ah Kh Qd Jd 2c', '+', 'Много старших карт']
];
for (const [vk, h, sg, frag] of start) {
  const e = PKDrills.explainStart(C(h), vk);
  TS.check(vk + ' ' + h + ': есть пункт «' + frag + '» со знаком ' + sg, e.some(x => x.s === sg && x.t.includes(frag)), e.map(x => x.s + ' ' + x.t));
}
TS.group('готовые руки: известные случаи');
const made = [
  ['holdem', 'Ah Kd', 'As 7c 2d', '+', 'Старшая пара'], ['holdem', 'Ah Kd', 'As 7c 2d', '+', 'Кикер сильный'],
  ['holdem', 'Ah 4d', 'As 7c 2d', '-', 'Кикер слабый'], ['holdem', 'Qh Qd', '9s 7c 2d', '+', 'Оверпара'],
  ['holdem', '5h 5d', 'Ks 9c 2d', '~', 'младше'], ['holdem', '7h 7d', '7s Kc 2d', '+', 'Сет'],
  ['holdem', '2h 3d', 'Ks Kc 9d', '-', 'лежит на столе'], ['holdem', 'Ah Kh', '2h 7h Jc', '+', 'Флеш-дро: ещё 9 карт достроят'],
  ['holdem', '9s 8d', '7c 6h 2s', '+', 'Открытое стрит-дро: 8 карт'], ['holdem', '9s 8d', 'Jc 7h 2s', '~', 'только 4 карты достроят'],
  ['holdem', 'Ah Kd', '7c 6h 2s', '~', 'оверкарты'], ['holdem', 'Ah Kd', '7c 6h 2s', '-', 'Ничего не собрано'],
  ['holdem', '9h 8h', 'Th Jh 2h', '+', 'Сильная готовая рука'], ['holdem', '9h 8h', 'Th Jh 2h Jc', '-', 'Стол спарен'],
  ['holdem', 'Jh Td', '9s 8s Qs', '-', '3 карты одной масти'], ['short', 'Ah 6h', 'Kh 9h 9c Th', '+', 'флеш'],
  ['omaha', 'Ah Ad Kh Qd', 'As 7c 2d', '+', 'Сет'], ['omaha', 'Kh Kd 3h 4d', '9s 7c 2d', '~', 'В омахе у соперников по 4 карты'],
  ['omaha5', 'Kh Kd 3h 4d 5c', '9s 7c 2d', '~', 'по 5 карт']
];
for (const [vk, h, b, sg, frag] of made) {
  const e = PKDrills.explainMade(C(h), C(b), vk);
  TS.check(vk + ' ' + h + ' на ' + b + ': пункт «' + frag + '» (' + sg + ')', e.some(x => x.s === sg && x.t.includes(frag)), e.map(x => x.s + ' ' + x.t));
}
TS.eq('до флопа объяснений готовой руки нет', PKDrills.explainMade(C('Ah Kd'), [], 'holdem'), []);

TS.group('случайные руки: тексты без ошибок');
for (const vk of Object.keys(PK.VARIANTS)) {
  const V = PK.VARIANTS[vk];
  for (let k = 0; k < H.N(60, 12); k++) {
    const d = PK.shuffle(PK.deckFor(vk).slice(), rng);
    const hole = d.slice(0, V.hole), board = d.slice(V.hole, V.hole + 3 + (k % 3));
    const tag = vk + ' ' + hole.map(PK.cardText).join('') + ' | ' + board.map(PK.cardText).join('');
    let s, m;
    try { s = PKDrills.explainStart(hole, vk); m = PKDrills.explainMade(hole, board, vk); } catch (e) { TS.check('без исключений: ' + tag, false, String(e)); continue; }
    TS.check('стартовая рука: ' + tag, s.length > 0 && wellFormed(s) && !badPlural(texts(s)), s);
    TS.check('готовая рука: ' + tag, m.length > 0 && wellFormed(m) && !badPlural(texts(m)), m);
  }
}
TS.group('склонение числительных');
const ru = PKDrills.ru;
const want = { 0: 'карт', 1: 'карта', 2: 'карты', 4: 'карты', 5: 'карт', 11: 'карт', 12: 'карт', 14: 'карт', 21: 'карта', 22: 'карты', 25: 'карт', 101: 'карта', 111: 'карт', 112: 'карт', 122: 'карты' };
for (const n in want) TS.eq(n + ' ' + want[n], ru(+n, 'карта', 'карты', 'карт'), n + ' ' + want[n]);

TS.group('пояса');
const ans = (mode, ok, extra) => Object.assign({ mode, ok, variant: 'holdem', ts: 0, level: 5 }, extra || {});
const many = (n, mode, accPct, extra) => Array.from({ length: n }, (_, i) => ans(mode, i < Math.round(n * accPct / 100), extra));
let ts = 1; const stamp = a => a.map(r => Object.assign(r, { ts: ts++ }));
{
  let A = [];
  TS.eq('с нуля — белый пояс', PKDrills.belt(A, [], 'holdem').level, 0);
  TS.eq('следующий шаг — «Назови комбинацию»', PKDrills.belt(A, [], 'holdem').next.mode, 'name');
  A = stamp(many(29, 'name', 100));
  TS.eq('29 верных из 30 нужных — ещё белый', PKDrills.belt(A, [], 'holdem').level, 0);
  A = A.concat(stamp(many(1, 'name', 100)));
  TS.eq('30 верных — жёлтый', PKDrills.belt(A, [], 'holdem').level, 1);
  TS.eq('название пояса', PKDrills.belt(A, [], 'holdem').belt.name, 'Жёлтый');
  const B = stamp(many(30, 'name', 86.7));
  TS.eq('26 из 30 (87%) — не хватает до 90%', PKDrills.belt(B, [], 'holdem').level, 0);
  const S = stamp(many(30, 'speed', 100));
  TS.eq('скоростной режим тоже засчитывается', PKDrills.belt(S, [], 'holdem').level, 1);
  A = A.concat(stamp(many(30, 'name', 90, { level: 'full' })));
  TS.eq('вся раздача 90% — оранжевый', PKDrills.belt(A, [], 'holdem').level, 2);
  A = A.concat(stamp(many(20, 'best', 80)));
  TS.eq('только «Лучшая рука» — зелёный ещё нет', PKDrills.belt(A, [], 'holdem').level, 2);
  TS.eq('подсказка ведёт в «Кто выиграл?»', PKDrills.belt(A, [], 'holdem').next.mode, 'winner');
  A = A.concat(stamp(many(20, 'winner', 80)));
  TS.eq('обе по 80% — зелёный', PKDrills.belt(A, [], 'holdem').level, 3);
  A = A.concat(stamp(many(30, 'odds', 76.7)), stamp(many(40, 'preflop', 85)));
  TS.eq('шансы и префлоп — фиолетовый', PKDrills.belt(A, [], 'holdem').level, 5);
  TS.eq('пояса считаются по варианту', PKDrills.belt(A, [], 'omaha').level, 0);
  TS.eq('сохранённый пояс не падает', PKDrills.belt([], [], 'holdem', 4).level, 4);
  const hands = Array.from({ length: 150 }, (_, i) => ({ variant: 'holdem', ts: i, net: 10, bb: 20, decisions: [{ c: i % 10 === 0 ? 'bad' : 'ok' }] }));
  TS.eq('150 раздач и 10% ошибок — коричневый', PKDrills.belt(A, hands, 'holdem').level, 6);
  const badHands = hands.map((h, i) => Object.assign({}, h, { decisions: [{ c: i % 5 === 0 ? 'bad' : 'ok' }] }));
  TS.eq('20% ошибок — нет', PKDrills.belt(A, badHands, 'holdem').level, 5);
  const h300 = Array.from({ length: 300 }, (_, i) => ({ variant: 'holdem', ts: i, net: i % 2 ? 40 : -39, bb: 20, decisions: [{ c: 'ok' }] }));
  TS.eq('300 раздач в плюсе — чёрный', PKDrills.belt(A, h300, 'holdem').level, 7);
  TS.eq('чёрный — последний', PKDrills.belt(A, h300, 'holdem').nextBelt, null);
  const lose = h300.map(h => Object.assign({}, h, { net: -5 }));
  TS.eq('300 раздач в минусе — коричневый', PKDrills.belt(A, lose, 'holdem').level, 6);
  TS.eq('7 шагов и 8 поясов', [PKDrills.beltSteps([], [], 'holdem').length, PKDrills.BELTS.length], [7, 8]);
  TS.check('у каждого шага есть понятный текст прогресса', PKDrills.beltSteps(A, hands, 'holdem').every(s => s.title && s.text && !/NaN|undefined/.test(s.text)));
}

TS.group('мои ошибки');
{
  const d = (c, adv) => ({ c, adv, s: 'preflop' });
  const hands = [
    { id: 1, variant: 'holdem', ts: 1, decisions: [d('bad', 'fold'), d('ok', 'call'), d('soft', 'raise')] },
    { id: 2, variant: 'omaha', ts: 2, decisions: [d('bad', 'fold')] },
    { id: 3, variant: 'holdem', ts: 3, decisions: [d('bad', null), d('bad', 'call')] },
    { id: 4, variant: 'holdem', ts: 4 }
  ];
  const m = PKDrills.collectMistakes(hands, 'holdem', {});
  TS.eq('берутся только плохие и сомнительные решения со снимком ситуации', m.map(x => x.key), ['3:1', '1:0', '1:2']);
  TS.eq('сначала свежие', m[0].hand.id, 3);
  TS.eq('исправленные не показываются', PKDrills.collectMistakes(hands, 'holdem', { '3:1': 1 }).map(x => x.key), ['1:0', '1:2']);
  TS.eq('фильтр по варианту', PKDrills.collectMistakes(hands, 'omaha', {}).map(x => x.key), ['2:0']);
  TS.eq('все варианты', PKDrills.collectMistakes(hands, 'all', {}).length, 4);
  TS.eq('без раздач — пусто', PKDrills.collectMistakes([], 'holdem'), []);
  TS.eq('чек считается как «колл» (продолжить)', [PKDrills.actionOf('check'), PKDrills.actionOf('raise'), PKDrills.actionOf('fold')], ['call', 'raise', 'fold']);
}
TS.done();
