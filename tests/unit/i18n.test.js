// Локализация: в словаре есть каждый текст из кода, а логика на английском не выдаёт ни одной русской буквы.
const fs = require('fs');
const path = require('path');
const H = require('../lib/harness');
const TS = H.suite('Локализация: словарь и английская версия');
const CYR = /[А-Яа-яЁё]/;
const src = f => fs.readFileSync(path.join(H.ROOT, 'js', f + '.js'), 'utf8');
// Убираем комментарии (строки в кавычках не трогаем), чтобы не считать примеры из них ключами.
function stripComments(s) {
  let out = '', i = 0;
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (c === '/' && n === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i = s.indexOf('*/', i + 2) + 2; continue; }
    if (c === "'" || c === '"') { let j = i + 1; while (j < s.length && s[j] !== c) { if (s[j] === '\\') j++; j++; } out += s.slice(i, j + 1); i = j + 1; continue; }
    out += c; i++;
  }
  return out;
}
const lit = s => Function('return \'' + s + '\'')();
const vars = s => (String(s).match(/\{(\w+)\}/g) || []).sort();

// Собираем объявления словаря с запоминанием повторов
const { PKI18n: EN } = H.load('en');
const D = EN.EN;

TS.group('словарь покрывает код');
const FILES = { core: 'T', drills: 'T', stats: 'T', store: 'T', ui: 'tr' };
let keyCount = 0;
for (const f of Object.keys(FILES)) {
  const code = stripComments(src(f));
  const re = new RegExp('\\b' + FILES[f] + "\\('((?:[^'\\\\]|\\\\.)*)'", 'g');
  const miss = [], arr = [], bad = [];
  let m;
  while ((m = re.exec(code))) {
    const k = lit(m[1]); keyCount++;
    if (!CYR.test(k)) continue;
    const e = D[k];
    if (e == null) miss.push(k);
    else if (Array.isArray(e)) arr.push(k);
    else if (typeof e === 'string') {
      const extra = vars(e).filter(v => vars(k).indexOf(v) < 0);
      if (extra.length || CYR.test(e)) bad.push(k + ' → ' + e);
    }
  }
  TS.check(f + '.js: у каждого текста есть перевод', miss.length === 0, miss.slice(0, 5));
  TS.check(f + '.js: тексты не путаются с формами числа', arr.length === 0, arr.slice(0, 5));
  TS.check(f + '.js: в переводах нет лишних {переменных} и кириллицы', bad.length === 0, bad.slice(0, 5));
  // Формы числа: plural(n, 'один', 'два', 'пять') / ru(n, …) — в словаре должна быть пара [один, много]
  const pre = /\b(?:plural|ru)\([^,()]*(?:\([^()]*\))?[^,()]*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g;
  const pl = [];
  while ((m = pre.exec(code))) { const e = D[m[1]]; if (!Array.isArray(e) || e.length !== 2 || e.some(x => CYR.test(x))) pl.push(m[1]); }
  TS.check(f + '.js: формы числа есть в словаре', pl.length === 0, pl);
}
TS.check('ключей найдено много (проверка самого теста)', keyCount > 900, keyCount);
TS.check('в словаре нет русских слов в переводах', Object.keys(D).every(k => typeof D[k] === 'function' || ![].concat(D[k]).some(x => CYR.test(x))),
  Object.keys(D).filter(k => typeof D[k] !== 'function' && [].concat(D[k]).some(x => CYR.test(x))).slice(0, 5));

TS.group('механика перевода');
{
  const I = H.loadI18n('en');
  TS.eq('подстановка переменных', I.t('Сыграно {n}. Показатели VPIP, PFR и другие станут надёжными примерно после 50–100 раздач.', { n: 7 }), '7 played. VPIP, PFR and other stats become reliable after about 50–100 hands.');
  TS.eq('формы числа: 1 и 5', [I.plural(1, 'карта', 'карты', 'карт'), I.plural(5, 'карта', 'карты', 'карт'), I.plural(21, 'карта', 'карты', 'карт')], ['card', 'cards', 'cards']);
  TS.eq('числа по-английски', I.num(1234567), '1,234,567');
  TS.eq('неизвестный текст остаётся как есть и запоминается', [I.t('Совсем новый текст'), I.missing.has('Совсем новый текст')], ['Совсем новый текст', true]);
  I.missing.clear();
  const R = H.loadI18n('ru');
  TS.eq('русский: подстановка', R.t('Сыграно {n}.', { n: 3 }), 'Сыграно 3.');
  TS.eq('русский: формы числа', [1, 2, 5, 11, 21, 22, 25, 111].map(n => R.plural(n, 'день', 'дня', 'дней')), ['день', 'дня', 'дней', 'дней', 'день', 'дня', 'дней', 'дней']);
  TS.eq('русский: числа с пробелом', R.num(12345).replace(/\s/g, ' '), '12 345');
  TS.check('русский ничего не ищет в словаре', R.missing.size === 0);
  TS.eq('язык по умолчанию — русский', H.loadI18n().lang, 'ru');
  TS.eq('неизвестный язык не включается', [R.use('de'), R.lang], ['ru', 'ru']);
}

// Глубокий сбор всех строк из результата
function strings(x, out, depth) {
  out = out || []; depth = depth || 0;
  if (depth > 5 || x == null) return out;
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) x.forEach(v => strings(v, out, depth + 1));
  else if (typeof x === 'object') Object.keys(x).forEach(k => strings(x[k], out, depth + 1));
  return out;
}
const badText = s => CYR.test(s) || /undefined|NaN|\{\w+\}|\[object/.test(s);

TS.group('логика на английском');
{
  const { PK, PKDrills, PKStats, PKI18n } = H.load('en');
  PKI18n.missing.clear();
  const rng = PK.mulberry32(4242);
  const VKS = ['holdem', 'omaha', 'omaha5', 'short'];
  const found = new Set();
  const scan = (what, obj) => strings(obj).forEach(s => { if (badText(s)) found.add(what + ': ' + s.slice(0, 100)); });
  TS.eq('названия комбинаций', PK.CAT_NAMES, ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush', 'Royal flush']);
  scan('варианты', PK.VARIANTS); scan('позиции', PK.POS); scan('стили', PK.STYLES); scan('уровни ботов', PK.BOT_LEVELS); scan('улицы', PK.STREET_RU);
  scan('PREFLOP_WHY', PK.PREFLOP_WHY); scan('определения', PK.CAT_DEFS); scan('как найти', PK.HOW_TO_PICK);
  scan('пояса', PKDrills.BELTS); scan('типы шансов', PKDrills.ODDS_NAMES); scan('позиции 6-max', PKDrills.POS_RU);
  const N = H.N(400, 80);
  for (const vk of VKS) {
    const V = PK.VARIANTS[vk];
    for (let i = 0; i < N; i++) {
      const cat = Math.floor(rng() * 10);
      const d = PK.genDeal(vk, cat, rng);
      if (!d) continue;
      scan(vk + ' раздача', d);
      const best = PK.bestHand(vk, d.hole, d.board);
      scan(vk + ' описание', [PK.describe(best.ev), PK.catDef(best.ev.cat, vk), PK.howToPick(best.ev.cat, vk)]);
      const deck = PK.shuffle(PK.deckFor(vk).filter(c => d.hole.indexOf(c) < 0 && d.board.indexOf(c) < 0), rng);
      const other = deck.slice(0, V.hole);
      const ev2 = PK.bestHand(vk, other, d.board).ev;
      scan(vk + ' сравнение', PK.explainCompare(best.ev, ev2, 'You', 'Boris'));
      scan(vk + ' сравнение 2', PK.explainCompare(ev2, best.ev, 'Anna', 'Gleb'));
      scan(vk + ' стартовая рука', PK.startingHandInfo(d.hole, vk));
      scan(vk + ' почему сильная', PKDrills.explainStart(d.hole, vk));
      scan(vk + ' что собрано', PKDrills.explainMade(d.hole, d.board.slice(0, 3 + (i % 3)), vk));
      if (i % 4 === 0) scan(vk + ' ауты', PK.outsInfo(d.hole, d.board.slice(0, 3), vk));
    }
    for (const type of PKDrills.ODDS_TYPES) for (let i = 0; i < 25; i++) scan(vk + ' шансы', PKDrills.genOdds(vk, type, rng));
    for (let i = 0; i < 60; i++) scan(vk + ' префлоп', PKDrills.genPreflop(vk, rng, { facingRaise: i % 2 === 0 }));
    scan(vk + ' шаги пояса', PKDrills.beltSteps([], [], vk));
    scan(vk + ' пояс', PKDrills.belt([], [], vk));
  }
  // Игра ботов: журнал раздачи
  const seats = [{ name: 'You', style: 'tight' }, { name: 'Anna', style: 'tight' }, { name: 'Boris', style: 'aggro' }, { name: 'Vika', style: 'loose' }, { name: 'Gleb', style: 'tight' }, { name: 'Dina', style: 'aggro' }];
  for (const vk of VKS) {
    let g = new PK.Game({ seats, rng, variant: vk });
    for (let h = 0; h < H.N(60, 15); h++) {
      if (!g.startHand()) { g = new PK.Game({ seats, rng, variant: vk }); g.startHand(); }
      let steps = 0;
      while (!g.done && steps++ < 400) {
        if (g.awaitingDeal) g.nextStreet();
        else g.act(g.toAct, PK.botDecide(g, g.toAct, rng, 60));
        g.players.forEach(p => { if (p.lastAction) scan(vk + ' действие', p.lastAction); });
      }
      scan(vk + ' журнал', g.log.map(x => x.text));
    }
  }
  // Выводы статистики
  const now = Date.now();
  const R = (cat, chosen) => ({ mode: 'name', cat, chosen, ok: cat === chosen, ms: 2000, variant: 'holdem', ts: now - 1000 });
  const A = [].concat(Array.from({ length: 8 }, () => R(4, 5)), Array.from({ length: 2 }, () => R(4, 4)), Array.from({ length: 3 }, () => R(6, 3)));
  const ins = PKStats.insights(PKStats.trainer(A, {}), null, 'holdem');
  TS.check('путаница: «8 times» по-английски', ins.some(x => x.title === 'You confuse “Straight” and “Flush” (8 times)'), ins.map(x => x.title));
  const loose = Array.from({ length: 40 }, (_, i) => ({ variant: 'holdem', ts: i, net: -20, bb: 20, vpip: true, pfr: false, pos: 'UTG', tier: 0, decisions: [{ s: 'preflop', c: 'bad', k: 'limpWeak' }] }));
  const gi = PKStats.insights(null, PKStats.game(loose, [], {}), 'holdem');
  TS.check('худшая улица по-английски', gi.some(x => x.title === 'Most mistakes are preflop' && x.text.startsWith('40 bad decisions of 40')), gi.map(x => x.title + ' / ' + x.text.slice(0, 40)));
  scan('выводы', [ins, gi, PKStats.insights(PKStats.trainer([], {}), PKStats.game([], [], {}), 'holdem'), PKStats.insights(null, PKStats.game(loose.slice(0, 5), [], {}), 'holdem')]);
  for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) if (a !== b) scan('подсказка путаницы', PKStats.confTip(a, b));
  TS.check('нигде нет русских букв, «undefined» и {переменных}', found.size === 0, Array.from(found).slice(0, 8));
  TS.check('всё нашлось в словаре', PKI18n.missing.size === 0, Array.from(PKI18n.missing).slice(0, 8));
  const cmp = (x, y) => PK.explainCompare(PK.evaluate(PK.parseCards(x)), PK.evaluate(PK.parseCards(y)), 'You', 'Boris').text;
  TS.check('«You win», но «Boris wins»', cmp('As Ad Kc 7h 2d', 'Ks Kd Qc 7c 3d').endsWith('You win.') && cmp('Ks Kd Qc 7c 3d', 'As Ad Kc 7h 2d').endsWith('Boris wins.'), [cmp('As Ad Kc 7h 2d', 'Ks Kd Qc 7c 3d'), cmp('Ks Kd Qc 7c 3d', 'As Ad Kc 7h 2d')]);
}

TS.group('русская версия не изменилась');
{
  const { PK, PKI18n } = H.load('ru');
  TS.eq('названия комбинаций по-русски', PK.CAT_NAMES[0], 'Старшая карта');
  TS.check('описание по-русски', CYR.test(PK.describe(PK.evaluate(PK.parseCards('As Ad Kc 7h 2d')))));
  TS.check('словарь не трогается', PKI18n.missing.size === 0);
}
TS.done();
