/* ===== POKER CORE: чистая логика без DOM (тестируется в Node) ===== */
var PK = (function () {
  'use strict';
  // Язык интерфейса (js/i18n.js); без него — русский
  const I18 = typeof PKI18n !== 'undefined' ? PKI18n : null;
  const T = I18 ? I18.t : (s, v) => (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)) : s);
  const isEN = !!I18 && I18.lang === 'en';

  // ---------- Карты ----------
  // Карта — целое 0..51: ранг = (c >> 2) + 2 (2..14), масть = c & 3 (0♠ 1♥ 2♦ 3♣)
  const RANK_SYM = [null, null, '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const SUIT_SYM = ['♠', '♥', '♦', '♣'];
  const SUIT_LETTERS = 'shdc';
  // Названия мастей и рангов в нужных падежах; в английском падежей нет — одно слово и множественное число
  const EN_R = [, , 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king', 'ace'];
  const EN_RPL = [, , 'twos', 'threes', 'fours', 'fives', 'sixes', 'sevens', 'eights', 'nines', 'tens', 'jacks', 'queens', 'kings', 'aces'];
  const SUIT_NAMES = isEN ? ['spades', 'hearts', 'diamonds', 'clubs'] : ['пики', 'червы', 'бубны', 'трефы'];
  const SUIT_GEN_PL = isEN ? ['spades', 'hearts', 'diamonds', 'clubs'] : ['пик', 'червей', 'бубен', 'треф'];
  const R_NOM = isEN ? EN_R : [, , 'двойка', 'тройка', 'четвёрка', 'пятёрка', 'шестёрка', 'семёрка', 'восьмёрка', 'девятка', 'десятка', 'валет', 'дама', 'король', 'туз'];
  const R_GEN = isEN ? EN_R : [, , 'двойки', 'тройки', 'четвёрки', 'пятёрки', 'шестёрки', 'семёрки', 'восьмёрки', 'девятки', 'десятки', 'валета', 'дамы', 'короля', 'туза'];
  const R_NOM_PL = isEN ? EN_RPL : [, , 'двойки', 'тройки', 'четвёрки', 'пятёрки', 'шестёрки', 'семёрки', 'восьмёрки', 'девятки', 'десятки', 'валеты', 'дамы', 'короли', 'тузы'];
  const R_GEN_PL = isEN ? EN_RPL : [, , 'двоек', 'троек', 'четвёрок', 'пятёрок', 'шестёрок', 'семёрок', 'восьмёрок', 'девяток', 'десяток', 'валетов', 'дам', 'королей', 'тузов'];

  const rankOf = c => (c >> 2) + 2;
  const suitOf = c => c & 3;
  const makeCard = (r, s) => ((r - 2) << 2) | s;

  function parseCard(t) {
    t = String(t).trim();
    const s = SUIT_LETTERS.indexOf(t.slice(-1).toLowerCase());
    const rs = t.slice(0, -1).toUpperCase();
    const map = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
    const r = map[rs] || parseInt(rs, 10);
    if (s < 0 || !(r >= 2 && r <= 14)) throw new Error('Неверная карта: ' + t);
    return makeCard(r, s);
  }
  const parseCards = str => String(str).trim().split(/\s+/).filter(Boolean).map(parseCard);
  const cardText = c => RANK_SYM[rankOf(c)] + SUIT_SYM[suitOf(c)];

  function newDeck() { const d = []; for (let c = 0; c < 52; c++) d.push(c); return d; }
  function shuffle(a, rng) {
    rng = rng || Math.random;
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function combinations(arr, k) {
    const out = [], cur = [];
    (function rec(start) {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (let i = start; i <= arr.length - (k - cur.length); i++) { cur.push(arr[i]); rec(i + 1); cur.pop(); }
    })(0);
    return out;
  }

  // ---------- Варианты покера ----------
  const ALL_RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const VARIANTS = {
    holdem: { key: 'holdem', name: T('Техасский холдем'), short: T('Холдем'), hole: 2, omaha: false, sd: false, betting: 'nl', ranks: ALL_RANKS,
      blurb: T('2 карты в руке, 5 на столе, любые 5 из 7. Безлимит.') },
    omaha: { key: 'omaha', name: T('Омаха'), short: T('Омаха'), hole: 4, omaha: true, sd: false, betting: 'pl', ranks: ALL_RANKS,
      blurb: T('4 карты в руке, ровно 2 из руки + 3 со стола. Пот-лимит.') },
    omaha5: { key: 'omaha5', name: T('Омаха-5'), short: T('Омаха-5'), hole: 5, omaha: true, sd: false, betting: 'pl', ranks: ALL_RANKS,
      blurb: T('5 карт в руке, ровно 2 из руки + 3 со стола. Пот-лимит.') },
    short: { key: 'short', name: T('Шорт-дек холдем (6+)'), short: T('Шорт-дек'), hole: 2, omaha: false, sd: true, betting: 'nl', ranks: [6, 7, 8, 9, 10, 11, 12, 13, 14],
      blurb: T('36 карт (от шестёрок), флеш старше фулл-хауса, тройка старше стрита, A-6-7-8-9 — стрит.') }
  };
  // Сила категории: в шорт-деке тройка > стрит и флеш > фулл-хаус.
  const POWER_SD = [0, 1, 2, 4, 3, 6, 5, 7, 8, 9];
  VARIANTS.holdem.order = VARIANTS.omaha.order = VARIANTS.omaha5.order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  VARIANTS.short.order = [0, 1, 2, 4, 3, 6, 5, 7, 8, 9];
  const V_ = vk => VARIANTS[vk] || VARIANTS.holdem;
  function deckFor(vk) { const V = V_(vk), d = []; for (let c = 0; c < 52; c++) if (V.ranks.indexOf((c >> 2) + 2) >= 0) d.push(c); return d; }

  // ---------- Оценка рук ----------
  const CAT = { HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4, FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8, ROYAL: 9 };
  const CAT_NAMES = ['Старшая карта', 'Пара', 'Две пары', 'Тройка', 'Стрит', 'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш', 'Роял-флеш'].map(x => T(x));

  function straightHigh(mask, sd) {
    // туз может быть младшей картой: A-2-3-4-5, а в шорт-деке A-6-7-8-9
    if (mask & (1 << 14)) mask |= sd ? (1 << 5) : 2;
    for (let h = 14; h >= 5; h--) {
      const m = 31 << (h - 4);
      if ((mask & m) === m) return h;
    }
    return 0;
  }
  function make(cat, ranks, sd) {
    let score = sd ? POWER_SD[cat] : cat;
    for (let i = 0; i < 5; i++) score = score * 16 + (ranks[i] || 0);
    const ev = { cat: cat, ranks: ranks, score: score };
    if (sd) ev.sd = true;
    return ev;
  }

  // Оценка лучшей руки из любого числа карт (1..7). Чем больше score, тем сильнее.
  function evaluate(cards, sd) {
    const cnt = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const sc = [0, 0, 0, 0], sm = [0, 0, 0, 0];
    let mask = 0;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i], r = (c >> 2) + 2, s = c & 3;
      cnt[r]++; sc[s]++; sm[s] |= 1 << r; mask |= 1 << r;
    }
    let fs = -1;
    for (let s = 0; s < 4; s++) if (sc[s] >= 5) fs = s;
    if (fs >= 0) {
      const h = straightHigh(sm[fs], sd);
      if (h) return make(h === 14 ? 9 : 8, [h], sd);
    }
    const quads = [], trips = [], pairs = [];
    for (let r = 14; r >= 2; r--) {
      if (cnt[r] === 4) quads.push(r);
      else if (cnt[r] === 3) trips.push(r);
      else if (cnt[r] === 2) pairs.push(r);
    }
    const kick = (ex, n) => {
      const out = [];
      for (let r = 14; r >= 2 && out.length < n; r--) if (cnt[r] && ex.indexOf(r) < 0) out.push(r);
      return out;
    };
    if (quads.length) return make(7, [quads[0]].concat(kick([quads[0]], 1)), sd);
    const flush = () => {
      const rs = [];
      for (let r = 14; r >= 2 && rs.length < 5; r--) if (sm[fs] & (1 << r)) rs.push(r);
      return make(5, rs, sd);
    };
    if (sd && fs >= 0) return flush();
    if (trips.length && (trips.length > 1 || pairs.length)) {
      return make(6, [trips[0], Math.max(trips[1] || 0, pairs[0] || 0)], sd);
    }
    if (fs >= 0) return flush();
    const tripsEv = () => make(3, [trips[0]].concat(kick([trips[0]], 2)), sd);
    if (sd && trips.length) return tripsEv();
    const h = straightHigh(mask, sd);
    if (h) return make(4, [h], sd);
    if (trips.length) return tripsEv();
    if (pairs.length >= 2) return make(2, [pairs[0], pairs[1]].concat(kick([pairs[0], pairs[1]], 1)), sd);
    if (pairs.length === 1) return make(1, [pairs[0]].concat(kick([pairs[0]], 3)), sd);
    return make(0, kick([], 5), sd);
  }

  function sortForDisplay(cards, ev) {
    const cnt = {};
    cards.forEach(c => { const r = rankOf(c); cnt[r] = (cnt[r] || 0) + 1; });
    const isStr = ev && (ev.cat === 4 || ev.cat === 8 || ev.cat === 9);
    const wheel = isStr && ev.ranks[0] === (ev.sd ? 9 : 5);
    const val = c => { const r = rankOf(c); return wheel && r === 14 ? 1 : r; };
    return cards.slice().sort((a, b) => isStr ? val(b) - val(a)
      : (cnt[rankOf(b)] - cnt[rankOf(a)]) || (rankOf(b) - rankOf(a)) || (suitOf(a) - suitOf(b)));
  }

  // Перебором выбирает лучшие 5 карт (для подсветки и объяснений).
  function bestFive(cards, sd) {
    let best = null, bestC = null;
    if (cards.length <= 5) { best = evaluate(cards, sd); bestC = cards.slice(); }
    else {
      const combos = combinations(cards, 5);
      for (let i = 0; i < combos.length; i++) {
        const ev = evaluate(combos[i], sd);
        if (!best || ev.score > best.score) { best = ev; bestC = combos[i]; }
      }
    }
    return { ev: best, cards: sortForDisplay(bestC, best) };
  }
  function isBestSelection(all, sel) {
    return sel.length === 5 && sel.every(c => all.indexOf(c) >= 0) && evaluate(sel).score === evaluate(all).score;
  }
  // Индексы комбинаций для быстрой оценки омахи
  const IDX = {};
  for (let n = 2; n <= 5; n++) for (let k = 2; k <= 3; k++) IDX[n + '_' + k] = combinations(Array.from({ length: n }, (_, i) => i), k);
  // Оценка с учётом правил варианта: в омахе ровно 2 карты из руки и 3 со стола.
  function handScore(vk, hole, board) {
    const V = V_(vk);
    if (!V.omaha || board.length < 3) return evaluate(hole.concat(board), V.sd).score;
    const H = IDX[hole.length + '_2'], B = IDX[board.length + '_3'], t = [0, 0, 0, 0, 0];
    let best = -1;
    for (let i = 0; i < H.length; i++) {
      t[0] = hole[H[i][0]]; t[1] = hole[H[i][1]];
      for (let j = 0; j < B.length; j++) {
        t[2] = board[B[j][0]]; t[3] = board[B[j][1]]; t[4] = board[B[j][2]];
        const s = evaluate(t, V.sd).score;
        if (s > best) best = s;
      }
    }
    return best;
  }
  function bestHand(vk, hole, board) {
    const V = V_(vk);
    if (!V.omaha) return bestFive(hole.concat(board), V.sd);
    if (board.length < 3) { const ev = evaluate(hole, V.sd); return { ev: ev, cards: sortForDisplay(hole, ev), partial: true }; }
    let best = null, bestC = null;
    for (const h of IDX[hole.length + '_2']) for (const b of IDX[board.length + '_3']) {
      const c5 = [hole[h[0]], hole[h[1]], board[b[0]], board[b[1]], board[b[2]]];
      const ev = evaluate(c5, V.sd);
      if (!best || ev.score > best.score) { best = ev; bestC = c5; }
    }
    return { ev: best, cards: sortForDisplay(bestC, best) };
  }
  // Проверка выбора 5 карт: {ok, rule} — rule=false, если нарушено правило омахи «2 из руки + 3 со стола».
  function checkSelection(vk, hole, board, sel) {
    const V = V_(vk);
    if (sel.length !== 5) return { ok: false, rule: true };
    const fromHole = sel.filter(c => hole.indexOf(c) >= 0).length;
    if (V.omaha && fromHole !== 2) return { ok: false, rule: false, fromHole: fromHole };
    return { ok: evaluate(sel, V.sd).score === handScore(vk, hole, board), rule: true, fromHole: fromHole };
  }

  // ---------- Тексты ----------
  const S = r => RANK_SYM[r];
  const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
  function describe(ev) {
    const r = ev.ranks;
    const ks = arr => arr.filter(Boolean).map(S).join(', ');
    const k1 = c => (c ? T(', кикер {c}', { c: S(c) }) : ''), kn = arr => (arr.filter(Boolean).length ? T(', кикеры {c}', { c: ks(arr) }) : '');
    switch (ev.cat) {
      case 9: return T('Роял-флеш (10-J-Q-K-A одной масти)');
      case 8: return ev.sd && r[0] === 9 ? T('Стрит-флеш от туза до девятки (A-6-7-8-9)') : r[0] === 5 ? T('Стрит-флеш от туза до пятёрки') : T('Стрит-флеш до {r} ({a}–{b})', { r: R_GEN[r[0]], a: S(r[0] - 4), b: S(r[0]) });
      case 7: return T('Каре {r}', { r: R_GEN_PL[r[0]] }) + k1(r[1]);
      case 6: return T('Фулл-хаус: тройка {a} и пара {b}', { a: R_GEN_PL[r[0]], b: R_GEN_PL[r[1]] });
      case 5: return T('Флеш до {r} ({cards})', { r: R_GEN[r[0]], cards: r.map(S).join('-') });
      case 4: return ev.sd && r[0] === 9 ? T('Стрит от туза до девятки (A-6-7-8-9 — «колесо» шорт-дека)') : r[0] === 5 ? T('Стрит от туза до пятёрки («колесо» A-2-3-4-5)') : T('Стрит до {r} ({a}–{b})', { r: R_GEN[r[0]], a: S(r[0] - 4), b: S(r[0]) });
      case 3: return T('Тройка {r}', { r: R_GEN_PL[r[0]] }) + kn(r.slice(1));
      case 2: return T('Две пары: {a} и {b}', { a: R_NOM_PL[r[0]], b: R_NOM_PL[r[1]] }) + k1(r[2]);
      case 1: return T('Пара {r}', { r: R_GEN_PL[r[0]] }) + kn(r.slice(1));
      default: return T('Старшая карта — {r}', { r: R_NOM[r[0]] }) + (r[1] ? T(' (дальше {c})', { c: ks(r.slice(1)) }) : '');
    }
  }
  const CAT_DEFS = [
    'Нет ни одной комбинации — рука оценивается по самой старшей карте, затем по следующим.',
    'Две карты одного ранга.',
    'Две разные пары.',
    'Три карты одного ранга (сет или трипс).',
    'Пять карт подряд по рангу, масти любые. Туз бывает и старшей (10-J-Q-K-A), и младшей картой (A-2-3-4-5).',
    'Пять карт одной масти, не обязательно подряд.',
    'Тройка и пара одновременно.',
    'Четыре карты одного ранга.',
    'Пять карт подряд, и все одной масти.',
    'Старший стрит-флеш: 10-J-Q-K-A одной масти. Сильнейшая рука в покере.'
  ].map(x => T(x));
  // Определения с поправками на вариант
  function catDef(cat, vk) {
    const V = V_(vk);
    if (V.sd) {
      if (cat === 4) return T('Пять карт подряд по рангу, масти любые. В шорт-деке туз бывает младшей картой: A-6-7-8-9. Здесь стрит слабее тройки.');
      if (cat === 3) return T('Три карты одного ранга. В шорт-деке тройка старше стрита.');
      if (cat === 5) return T('Пять карт одной масти. В шорт-деке флеш старше фулл-хауса — мастей меньше, флеш собрать труднее.');
    }
    return CAT_DEFS[cat];
  }
  function howToPick(cat, vk) {
    return (V_(vk).omaha ? T('В омахе берём ровно 2 карты из руки и 3 со стола — не больше и не меньше.') + ' ' : '') + HOW_TO_PICK[cat];
  }
  const HOW_TO_PICK = [
    'Комбинаций нет, поэтому берём пять самых старших карт.',
    'Берём пару и добавляем три самые старшие из оставшихся карт — это кикеры.',
    'Берём две самые старшие пары и самую старшую из оставшихся карт как кикер. Если пар три, младшая не нужна.',
    'Берём тройку и две самые старшие из оставшихся карт.',
    'Берём пять карт подряд; если вариантов несколько — самый высокий стрит. Масти не важны.',
    'Берём пять карт одной масти; если их больше пяти — пять самых старших.',
    'Берём самую старшую тройку и самую старшую пару (вторая тройка тоже может дать пару).',
    'Берём четыре одинаковые карты и самую старшую из оставшихся как кикер.',
    'Берём пять карт подряд одной масти.',
    'Берём 10-J-Q-K-A одной масти.'
  ].map(x => T(x));
  const POS_LABELS = [
    ['старшая карта', 'вторая карта (кикер)', 'третья карта (кикер)', 'четвёртая карта (кикер)', 'пятая карта (кикер)'],
    ['ранг пары', 'первый кикер', 'второй кикер', 'третий кикер'],
    ['старшая пара', 'младшая пара', 'кикер'],
    ['ранг тройки', 'первый кикер', 'второй кикер'],
    ['старшая карта стрита'],
    ['старшая карта флеша', 'вторая карта флеша', 'третья карта флеша', 'четвёртая карта флеша', 'пятая карта флеша'],
    ['ранг тройки', 'ранг пары'],
    ['ранг каре', 'кикер'],
    ['старшая карта стрит-флеша'],
    []
  ];
  function diffIndex(a, b) {
    for (let i = 0; i < 5; i++) if ((a.ranks[i] || 0) !== (b.ranks[i] || 0)) return i;
    return -1;
  }
  // Объясняет, почему рука a лучше/хуже/равна руке b. winner: 1 | 2 | 0 (ничья)
  function explainCompare(a, b, nameA, nameB) {
    if (a.score === b.score) {
      return { winner: 0, text: T('У обоих одинаковая лучшая пятёрка по рангам: {h}. Масти в холдеме не сравниваются, поэтому ничья — банк делится поровну.', { h: lc(describe(a)) }) };
    }
    const w = a.score > b.score ? 1 : 2;
    const W = w === 1 ? a : b, L = w === 1 ? b : a;
    const wn = w === 1 ? nameA : nameB, ln = w === 1 ? nameB : nameA;
    if (W.cat !== L.cat) {
      return { winner: w, text: wn + ': ' + lc(describe(W)) + '. ' + ln + ': ' + lc(describe(L)) + '. ' + T('{a} старше, чем {b}, — побеждает {w}.', { a: CAT_NAMES[W.cat], b: lc(CAT_NAMES[L.cat]), w: wn }) };
    }
    const i = diffIndex(W, L);
    const raw = POS_LABELS[W.cat][i] || 'решающая карта', label = T(raw);
    let t = T('Обе руки — {c}.', { c: lc(CAT_NAMES[W.cat]) }) + ' ' + wn + ': ' + lc(describe(W)) + '; ' + ln + ': ' + lc(describe(L)) + '. ';
    t += T('Сравниваем по порядку, и решает {label}: {a} против {b}. Побеждает {w}.', { label: label, a: S(W.ranks[i]), b: S(L.ranks[i]), w: wn });
    if (raw.indexOf('кикер') >= 0) t += ' ' + T('Кикер — карта, которая не входит в саму комбинацию, но решает спор при равных комбинациях.');
    return { winner: w, text: t };
  }

  // ---------- Генерация заданий ----------
  const rint = (rng, n) => Math.floor(rng() * n);
  const straightRanks = (h, sd) => (sd && h === 9) ? [14, 6, 7, 8, 9] : (!sd && h === 5) ? [14, 2, 3, 4, 5] : [h - 4, h - 3, h - 2, h - 1, h];
  function construct5(cat, rng, V) {
    V = V || VARIANTS.holdem;
    const sd = V.sd, lowH = sd ? 9 : 5;
    const Sx = () => rint(rng, 4);
    const ranksN = n => shuffle(V.ranks.slice(), rng).slice(0, n);
    const suitsN = n => shuffle([0, 1, 2, 3], rng).slice(0, n);
    switch (cat) {
      case 9: { const s = Sx(); return [10, 11, 12, 13, 14].map(r => makeCard(r, s)); }
      case 8: { const s = Sx(), h = lowH + rint(rng, 14 - lowH); return straightRanks(h, sd).map(r => makeCard(r, s)); }
      case 7: { const [q, k] = ranksN(2); return [0, 1, 2, 3].map(s => makeCard(q, s)).concat([makeCard(k, Sx())]); }
      case 6: { const [t, p] = ranksN(2); return suitsN(3).map(s => makeCard(t, s)).concat(suitsN(2).map(s => makeCard(p, s))); }
      case 5: { const s = Sx(); return ranksN(5).map(r => makeCard(r, s)); }
      case 4: { const h = lowH + rint(rng, 15 - lowH); return straightRanks(h, sd).map(r => makeCard(r, Sx())); }
      case 3: { const [t, a, b] = ranksN(3); return suitsN(3).map(s => makeCard(t, s)).concat([makeCard(a, Sx()), makeCard(b, Sx())]); }
      case 2: { const [p, q, k] = ranksN(3); return suitsN(2).map(s => makeCard(p, s)).concat(suitsN(2).map(s => makeCard(q, s)), [makeCard(k, Sx())]); }
      case 1: { const [p, a, b, c] = ranksN(4); return suitsN(2).map(s => makeCard(p, s)).concat([a, b, c].map(r => makeCard(r, Sx()))); }
      default: return ranksN(5).map(r => makeCard(r, Sx()));
    }
  }
  // n карт (5 или 7), лучшая комбинация которых — cat. Порядок перемешан.
  function genHand(cat, n, rng) {
    rng = rng || Math.random;
    for (let tries = 0; tries < 600; tries++) {
      const base = construct5(cat, rng);
      if (new Set(base).size !== 5 || evaluate(base).cat !== cat) continue;
      let cards = base;
      if (n > 5) {
        const rest = shuffle(newDeck().filter(c => base.indexOf(c) < 0), rng);
        cards = base.concat(rest.slice(0, n - 5));
        if (evaluate(cards).cat !== cat) continue;
      }
      return shuffle(cards.slice(), rng);
    }
    return shuffle(newDeck(), rng).slice(0, n);
  }
  // 5 карт категории cat по правилам варианта (для уровня «5 карт»)
  function genFive(vk, cat, rng) {
    rng = rng || Math.random;
    const V = V_(vk);
    for (let t = 0; t < 800; t++) {
      const b = construct5(cat, rng, V);
      if (new Set(b).size === 5 && evaluate(b, V.sd).cat === cat) return shuffle(b, rng);
    }
    return shuffle(deckFor(vk), rng).slice(0, 5);
  }
  // Раздача для тренажёра: {hole, board}, где лучшая рука по правилам варианта — cat.
  function genDeal(vk, cat, rng) {
    rng = rng || Math.random;
    const V = V_(vk), deck = deckFor(vk);
    for (let tries = 0; tries < 1500; tries++) {
      const base = construct5(cat, rng, V);
      if (new Set(base).size !== 5 || evaluate(base, V.sd).cat !== cat) continue;
      const rest = shuffle(deck.filter(c => base.indexOf(c) < 0), rng);
      let hole, board;
      if (V.omaha) {
        const b = shuffle(base.slice(), rng);
        hole = shuffle(b.slice(0, 2).concat(rest.slice(0, V.hole - 2)), rng);
        board = shuffle(b.slice(2).concat(rest.slice(V.hole - 2, V.hole)), rng);
      } else {
        const all = shuffle(base.concat(rest.slice(0, 2)), rng);
        hole = all.slice(0, 2); board = all.slice(2);
      }
      if (bestHand(vk, hole, board).ev.cat !== cat) continue;
      return { hole: hole, board: board };
    }
    const d = shuffle(deck.slice(), rng);
    return { hole: d.slice(0, V.hole), board: d.slice(V.hole, V.hole + 5) };
  }

  // ---------- Шансы ----------
  // Доля банка, которую рука в среднем выигрывает против nOpp случайных рук (Монте-Карло).
  function equity(hole, board, nOpp, iters, rng, vk) {
    rng = rng || Math.random;
    if (nOpp <= 0) return 1;
    if (vk && vk !== 'holdem') return equityV(hole, board, nOpp, iters, rng, vk);
    const dead = hole.concat(board), rest = [];
    for (let c = 0; c < 52; c++) if (dead.indexOf(c) < 0) rest.push(c);
    const need = 5 - board.length, draws = need + 2 * nOpp;
    let total = 0;
    const fb = board.slice(), mine = hole.concat(board), opp = [0, 0].concat(board);
    for (let it = 0; it < iters; it++) {
      for (let k = 0; k < draws; k++) {
        const j = k + Math.floor(rng() * (rest.length - k));
        const t = rest[k]; rest[k] = rest[j]; rest[j] = t;
      }
      mine.length = 2 + board.length; opp.length = 2 + board.length;
      for (let k = 0; k < need; k++) { mine.push(rest[k]); opp.push(rest[k]); }
      const my = evaluate(mine).score;
      let ties = 0, lost = false;
      for (let o = 0; o < nOpp; o++) {
        opp[0] = rest[need + 2 * o]; opp[1] = rest[need + 2 * o + 1];
        const s = evaluate(opp).score;
        if (s > my) { lost = true; break; }
        if (s === my) ties++;
      }
      if (!lost) total += 1 / (ties + 1);
    }
    return total / iters;
  }
  function equityV(hole, board, nOpp, iters, rng, vk) {
    const V = V_(vk), H = V.hole;
    const dead = hole.concat(board), rest = deckFor(vk).filter(c => dead.indexOf(c) < 0);
    const need = 5 - board.length, draws = need + H * nOpp;
    if (draws > rest.length) nOpp = Math.floor((rest.length - need) / H);
    let total = 0;
    const oh = new Array(H);
    for (let it = 0; it < iters; it++) {
      for (let k = 0; k < need + H * nOpp; k++) {
        const j = k + Math.floor(rng() * (rest.length - k));
        const t = rest[k]; rest[k] = rest[j]; rest[j] = t;
      }
      const fb = board.concat(rest.slice(0, need));
      const my = handScore(vk, hole, fb);
      let ties = 0, lost = false;
      for (let o = 0; o < nOpp; o++) {
        for (let q = 0; q < H; q++) oh[q] = rest[need + H * o + q];
        const s = handScore(vk, oh, fb);
        if (s > my) { lost = true; break; }
        if (s === my) ties++;
      }
      if (!lost) total += 1 / (ties + 1);
    }
    return total / iters;
  }
  // Аутсы: карты, которые на следующей улице поднимают вашу комбинацию выше нынешней
  // (и делают её сильнее, чем то, что лежит на столе само по себе).
  function outsInfo(hole, board, vk) {
    const V = V_(vk), P = c => V.sd ? POWER_SD[c] : c;
    const cur = bestHand(vk, hole, board).ev;
    const dead = hole.concat(board);
    const outs = [], byCat = {};
    let unseen = 0;
    for (const c of deckFor(vk)) {
      if (dead.indexOf(c) >= 0) continue;
      unseen++;
      const nb = board.concat([c]);
      const ev = bestHand(vk, hole, nb).ev;
      if (P(ev.cat) > P(cur.cat) && (V.omaha || P(ev.cat) > P(evaluate(nb, V.sd).cat))) {
        outs.push(c);
        (byCat[ev.cat] = byCat[ev.cat] || []).push(c);
      }
    }
    const o = outs.length;
    const pNext = o / unseen;
    const pByRiver = board.length === 3 ? 1 - ((unseen - o) * (unseen - o - 1)) / (unseen * (unseen - 1)) : pNext;
    return { cur: cur, outs: outs, byCat: byCat, unseen: unseen, pNext: pNext, pByRiver: pByRiver };
  }
  // Формула Чена — простая оценка стартовой руки (больше = лучше; AA = 20).
  function chen(hole) {
    const r1 = rankOf(hole[0]), r2 = rankOf(hole[1]);
    const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
    const pts = r => r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2;
    let s = pts(hi);
    if (hi === lo) return Math.max(5, s * 2);
    if (suitOf(hole[0]) === suitOf(hole[1])) s += 2;
    const gap = hi - lo - 1;
    s -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
    if (gap <= 1 && hi < 12) s += 1;
    return Math.max(0, Math.ceil(s));
  }
  // Пороги эквити против одной случайной руки для уровней 1..4 (откалиброваны по процентилям: 45/30/15/6% лучших рук)
  const TIER_EQ = { short: [0.51, 0.547, 0.587, 0.633], omaha: [0.51, 0.54, 0.583, 0.63], omaha5: [0.503, 0.537, 0.577, 0.613] };
  const TIER_TEXT = ['слабая рука — обычно сбрасывают', 'спекулятивная — играть, только если дёшево', 'средняя рука — хороша в поздней позиции', 'сильная рука', 'премиум — одна из лучших стартовых рук'].map(x => T(x));
  const shCache = {};
  // Каноническая запись руки: масти переименованы так, чтобы получилась наименьшая запись.
  const SUIT_PERMS = (function () { const out = []; (function rec(cur) { if (cur.length === 4) return out.push(cur.slice()); for (let s = 0; s < 4; s++) if (cur.indexOf(s) < 0) { cur.push(s); rec(cur); cur.pop(); } })([]); return out; })();
  function canonHole(hole) {
    let best = null;
    for (const pm of SUIT_PERMS) {
      const h = hole.map(c => (c & ~3) | pm[c & 3]).sort((a, b) => a - b);
      if (!best || h.join(',') < best.join(',')) best = h;
    }
    return best;
  }
  function startingHandInfo(hole, vk) {
    const V = V_(vk);
    if (V.key === 'holdem' || !V.key) return startingHoldem(hole);
    // Руки, отличающиеся только мастями (K♥J♥ и K♠J♠), — одна и та же рука: считаем её один раз.
    const canon = canonHole(hole);
    const key = V.key + ':' + canon.join(',');
    if (shCache[key]) return shCache[key];
    const eq1 = equity(canon, [], 1, V.omaha ? 500 : 4000, mulberry32(canon.reduce((a, c) => a * 53 + c, 7) >>> 0), V.key);
    const th = TIER_EQ[V.key];
    let tier = 0; while (tier < 4 && eq1 >= th[tier]) tier++;
    const rs = hole.map(rankOf).sort((a, b) => b - a);
    const sc = [0, 0, 0, 0]; hole.forEach(c => sc[suitOf(c)]++);
    const suitedGroups = sc.filter(x => x >= 2).length;
    let kind, code = rs.map(r => S(r).replace('10', 'T')).join('');
    if (V.omaha) {
      const pairs = rs.filter((r, i) => rs.indexOf(r) !== i);
      const suits = T(suitedGroups >= 2 ? 'двухмастная (две пары карт одной масти)' : suitedGroups === 1 ? 'одномастная (есть 2 карты одной масти)' : 'разномастная');
      kind = suits + (pairs.length ? T(', пара {r}', { r: R_GEN_PL[pairs[0]] }) : '');
      code += suitedGroups >= 2 ? ' ds' : suitedGroups === 1 ? ' ss' : '';
    } else {
      const suited = suitOf(hole[0]) === suitOf(hole[1]);
      kind = holeKind(rs[0], rs[1], suited);
      code += rs[0] === rs[1] ? '' : suited ? 's' : 'o';
    }
    const info = { code: code, kind: kind, tier: tier, tierText: TIER_TEXT[tier], eq1: eq1 };
    shCache[key] = info;
    return info;
  }
  // «карманная пара тузов» / «одномастные K и J»
  function holeKind(hi, lo, suited) {
    if (hi === lo) return T('карманная пара {r}', { r: R_GEN_PL[hi] });
    return T(suited ? 'одномастные {a} и {b}' : 'разномастные {a} и {b}', { a: S(hi), b: S(lo) });
  }
  function startingHoldem(hole) {
    const r1 = rankOf(hole[0]), r2 = rankOf(hole[1]);
    const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
    const suited = suitOf(hole[0]) === suitOf(hole[1]);
    const c = chen(hole);
    const code = S(hi).replace('10', 'T') + S(lo).replace('10', 'T') + (hi === lo ? '' : suited ? 's' : 'o');
    const kind = holeKind(hi, lo, suited);
    const tier = c >= 10 ? 4 : c >= 8 ? 3 : c >= 6 ? 2 : c >= 5 ? 1 : 0, tierText = TIER_TEXT[tier];
    return { chen: c, code: code, kind: kind, tier: tier, tierText: tierText, suited: suited, pair: hi === lo };
  }

  // ---------- Банки и сайд-поты ----------
  // players: [{id, total, folded}] -> [{amount, eligible:[id]}]
  function buildPots(players) {
    const live = players.filter(p => !p.folded);
    const levels = Array.from(new Set(live.map(p => p.total))).filter(x => x > 0).sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const L of levels) {
      let amount = 0;
      for (const p of players) amount += Math.min(p.total, L) - Math.min(p.total, prev);
      const eligible = live.filter(p => p.total >= L).map(p => p.id);
      if (amount > 0) pots.push({ amount: amount, eligible: eligible });
      prev = L;
    }
    let extra = 0;
    for (const p of players) extra += Math.max(0, p.total - prev);
    if (extra > 0) {
      if (pots.length) pots[pots.length - 1].amount += extra;
      else pots.push({ amount: extra, eligible: live.map(p => p.id) });
    }
    return pots;
  }
  // scoreOf(id) -> сила руки; order — места по часовой стрелке от дилера (лишняя фишка идёт первому).
  function settle(players, scoreOf, order) {
    const pots = buildPots(players);
    const payouts = {};
    for (const pot of pots) {
      let winners = [];
      if (pot.eligible.length === 1) winners = pot.eligible.slice();
      else {
        let best = -1;
        for (const id of pot.eligible) {
          const s = scoreOf(id);
          if (s > best) { best = s; winners = [id]; } else if (s === best) winners.push(id);
        }
      }
      winners.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      const share = Math.floor(pot.amount / winners.length);
      let rem = pot.amount - share * winners.length;
      for (const w of winners) payouts[w] = (payouts[w] || 0) + share;
      for (let k = 0; rem > 0; k++, rem--) payouts[winners[k]]++;
      pot.winners = winners;
      pot.share = share;
      pot.returned = pot.eligible.length === 1;
    }
    return { pots: pots, payouts: payouts };
  }

  // ---------- Позиции ----------
  const POS = {
    BTN: { short: 'BTN', name: T('Баттон (дилер)'), late: true, tip: T('Лучшая позиция: после флопа вы ходите последним и видите действия всех.') },
    BTNSB: { short: 'BTN', name: T('Баттон и малый блайнд'), late: true, tip: T('Один на один дилер ставит малый блайнд и после флопа ходит последним.') },
    SB: { short: 'SB', name: T('Малый блайнд'), late: false, tip: T('Половина блайнда уже в банке, но после флопа вы ходите первым — неудобно.') },
    BB: { short: 'BB', name: T('Большой блайнд'), late: false, tip: T('Полный блайнд уже в банке; если никто не повысил, можно бесплатно сделать чек.') },
    UTG: { short: 'UTG', name: T('Ранняя позиция'), late: false, tip: T('Вы ходите первым до флопа — играйте только сильные руки.') },
    MP: { short: 'MP', name: T('Средняя позиция'), late: false, tip: T('После вас ещё несколько игроков — играйте осторожно.') },
    CO: { short: 'CO', name: T('Поздняя позиция (катофф)'), late: true, tip: T('Вторая по выгодности позиция: можно играть больше рук.') }
  };
  const POS_BY_N = {
    2: ['BTNSB', 'BB'], 3: ['BTN', 'SB', 'BB'], 4: ['BTN', 'SB', 'BB', 'CO'],
    5: ['BTN', 'SB', 'BB', 'UTG', 'CO'], 6: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO']
  };

  // ---------- Игра ----------
  const BLINDS = [[10, 20], [15, 30], [20, 40], [30, 60], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [400, 800], [500, 1000], [750, 1500], [1000, 2000]];
  const STREET_RU = { preflop: T('Префлоп'), flop: T('Флоп'), turn: T('Тёрн'), river: T('Ривер'), showdown: T('Вскрытие') };

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.rng = opts.rng || Math.random;
      this.startStack = opts.startStack || 1000;
      this.handsPerLevel = opts.handsPerLevel || 8;
      this.variant = V_(opts.variant).key;
      this.botLevel = opts.botLevel || 'normal';
      this.V = V_(opts.variant);
      this.players = opts.seats.map((s, i) => ({
        id: i, name: s.name, style: s.style || null, level: s.level || null, isHuman: !!s.human, stack: this.startStack,
        hole: [], folded: false, allIn: false, bet: 0, total: 0, acted: false, actedRaise: 0, out: false, lastAction: ''
      }));
      this.button = Math.floor(this.rng() * this.players.length);
      this.handNo = 0; this.level = 0;
      this.done = true; this.street = null; this.board = []; this.boardAll = []; this.log = [];
      this.toAct = -1; this.awaitingDeal = false; this.result = null; this.gameOver = false;
      this.totalChips = this.startStack * this.players.length;
    }
    get sb() { return BLINDS[this.level][0]; }
    get bb() { return BLINDS[this.level][1]; }
    handsToNextLevel() {
      if (this.level >= BLINDS.length - 1) return null;
      return this.handsPerLevel - ((this.handNo - 1) % this.handsPerLevel);
    }
    seatAfter(i, pred) {
      const n = this.players.length;
      for (let k = 1; k <= n; k++) { const j = (((i + k) % n) + n) % n; if (pred(this.players[j])) return j; }
      return -1;
    }
    pot() { return this.players.reduce((a, p) => a + p.total, 0); }
    collected() { return this.players.reduce((a, p) => a + p.total - p.bet, 0); }
    livePlayers() { return this.players.filter(p => !p.folded); }
    addLog(text, seat, kind) { this.log.push({ street: this.street, text: text, seat: seat == null ? -1 : seat, kind: kind || 'act' }); }
    put(p, a) {
      a = Math.min(a, p.stack);
      p.stack -= a; p.bet += a; p.total += a;
      if (p.stack === 0) p.allIn = true;
      return a;
    }

    startHand(rig) {
      for (const p of this.players) if (p.stack <= 0) { p.stack = 0; p.out = true; }
      const alive = this.players.filter(p => !p.out);
      if (alive.length < 2) { this.gameOver = true; return false; }
      this.handNo++;
      this.level = Math.min(Math.floor((this.handNo - 1) / this.handsPerLevel), BLINDS.length - 1);
      this.button = this.seatAfter(this.button, p => !p.out);
      for (const p of this.players) {
        p.hole = []; p.folded = p.out; p.allIn = false; p.bet = 0; p.total = 0;
        p.acted = false; p.actedRaise = 0; p.lastAction = ''; p.startStack = p.stack;
      }
      const deck = shuffle(deckFor(this.variant), this.rng);
      let k = 0;
      const order = [];
      for (let s = this.seatAfter(this.button, p => !p.out), n = 0; n < alive.length; n++, s = this.seatAfter(s, p => !p.out)) order.push(s);
      for (let round = 0; round < this.V.hole; round++) for (const s of order) this.players[s].hole.push(deck[k++]);
      this.boardAll = deck.slice(k, k + 5);
      if (rig) {
        if (rig.holes) for (const s in rig.holes) this.players[s].hole = rig.holes[s].slice();
        if (rig.board) this.boardAll = rig.board.slice();
      }
      this.board = []; this.street = 'preflop'; this.done = false; this.awaitingDeal = false; this.result = null;
      this.log = []; this.actions = 0;
      this.currentBet = 0; this.minRaise = this.bb; this.fullRaiseCount = 0; this.raisesThisStreet = 0; this.pfRaiser = -1;
      const heads = alive.length === 2;
      this.sbSeat = heads ? this.button : this.seatAfter(this.button, p => !p.out);
      this.bbSeat = this.seatAfter(this.sbSeat, p => !p.out);
      this.addLog(T('Раздача #{n} · блайнды {sb}/{bb} · дилер: {d}', { n: this.handNo, sb: this.sb, bb: this.bb, d: this.players[this.button].name }), -1, 'info');
      this.post(this.sbSeat, this.sb, T('малый блайнд'));
      this.post(this.bbSeat, this.bb, T('большой блайнд'));
      this.currentBet = this.bb;
      this.toAct = this.findNext(this.bbSeat);
      if (this.toAct < 0) this.endBettingRound();
      return true;
    }
    post(i, amt, label) {
      const p = this.players[i];
      const a = this.put(p, amt);
      p.lastAction = label + ' ' + a; p.lastKind = 'blind';
      this.addLog(p.name + ': ' + label + ' ' + a + (p.allIn ? ' ' + T('(олл-ин)') : ''), i, 'blind');
    }
    othersCanAct(p) { return this.players.some(q => q !== p && !q.folded && !q.allIn); }
    needsToAct(p) {
      if (p.folded || p.allIn) return false;
      if (p.bet < this.currentBet) return true;
      return !p.acted && this.othersCanAct(p);
    }
    findNext(from) { return this.seatAfter(from, p => this.needsToAct(p)); }

    legal(i) {
      const p = this.players[i];
      const toCall = Math.max(0, this.currentBet - p.bet);
      const callAmt = Math.min(toCall, p.stack);
      const canRaise = !this.done && p.stack > toCall && this.othersCanAct(p) && (!p.acted || this.fullRaiseCount > p.actedRaise);
      const allInTo = p.bet + p.stack;
      // Пот-лимит: максимум — уравнять и поднять на размер банка после колла.
      const potLimit = this.V.betting === 'pl';
      const maxTo = potLimit ? Math.min(allInTo, this.currentBet + this.pot() + toCall) : allInTo;
      let minTo = this.currentBet + this.minRaise;
      if (minTo > maxTo) minTo = maxTo;
      return { toCall: toCall, callAmt: callAmt, canCheck: toCall === 0, canRaise: canRaise, minTo: minTo, maxTo: maxTo, allInTo: allInTo, potLimit: potLimit, pot: this.pot(), isBet: this.currentBet === 0 };
    }

    act(i, a) {
      if (this.done || this.awaitingDeal || i !== this.toAct) throw new Error('Сейчас не ход игрока ' + i);
      const p = this.players[i], L = this.legal(i);
      let type = a.type;
      if (type === 'allin') { if (L.canRaise) { type = 'raise'; a = { type: 'raise', amount: L.maxTo }; } else type = 'call'; }
      if (type === 'check' && L.toCall > 0) type = 'call';
      if (type === 'call' && L.toCall === 0) type = 'check';
      if (type === 'raise' && !L.canRaise) type = L.toCall > 0 ? 'call' : 'check';
      let text;
      let kind = type;
      if (type === 'fold') { p.folded = true; text = T('фолд'); }
      else if (type === 'check') { text = T('чек'); }
      else if (type === 'call') { const amt = this.put(p, L.callAmt); text = p.allIn ? T('олл-ин {a} (колл)', { a: amt }) : T('колл {a}', { a: amt }); }
      else if (type === 'raise') {
        let to = Math.floor(a.amount);
        if (!(to >= L.minTo)) to = L.minTo;
        if (to > L.maxTo) to = L.maxTo;
        const wasBet = this.currentBet === 0;
        const inc = to - this.currentBet;
        if (inc >= this.minRaise) { this.minRaise = inc; this.fullRaiseCount++; }
        this.currentBet = to;
        this.put(p, to - p.bet);
        this.raisesThisStreet++;
        if (this.street === 'preflop') this.pfRaiser = i;
        kind = wasBet ? 'bet' : 'raise';
        text = p.allIn ? T('олл-ин {a}', { a: to }) : (wasBet ? T('ставка {a}', { a: to }) : T('рейз до {a}', { a: to }));
      } else throw new Error('Неизвестное действие ' + type);
      p.acted = true; p.actedRaise = this.fullRaiseCount; p.lastAction = text; p.lastKind = kind;
      this.actions++;
      this.addLog(p.name + ': ' + text, i, type);
      this.afterAction(i);
      return type;
    }
    afterAction(i) {
      const live = this.livePlayers();
      if (live.length === 1) return this.finishFold(live[0]);
      const nx = this.findNext(i);
      if (nx >= 0) { this.toAct = nx; return; }
      this.endBettingRound();
    }
    endBettingRound() {
      this.toAct = -1;
      if (this.street === 'river') return this.showdown();
      this.awaitingDeal = true;
    }
    // Ставки больше невозможны (все, кроме максимум одного, в олл-ине) — карты открываются.
    isRunout() {
      const live = this.livePlayers();
      return !this.done && live.length >= 2 && live.filter(p => !p.allIn).length <= 1 && this.toAct < 0;
    }
    nextStreet() {
      if (!this.awaitingDeal) throw new Error('Сейчас нельзя открывать карты');
      this.awaitingDeal = false;
      for (const p of this.players) { p.bet = 0; p.acted = false; p.actedRaise = 0; if (!p.folded && !p.allIn) p.lastAction = ''; }
      this.currentBet = 0; this.minRaise = this.bb; this.fullRaiseCount = 0; this.raisesThisStreet = 0;
      const next = { preflop: 'flop', flop: 'turn', turn: 'river' }[this.street];
      this.street = next;
      this.board = this.boardAll.slice(0, next === 'flop' ? 3 : next === 'turn' ? 4 : 5);
      this.addLog(STREET_RU[next] + ': ' + this.board.map(cardText).join(' '), -1, 'street');
      this.toAct = this.findNext(this.button);
      if (this.toAct < 0) this.endBettingRound();
    }
    seatOrderFromButton() {
      const n = this.players.length, order = [];
      for (let k = 1; k <= n; k++) order.push((this.button + k) % n);
      return order;
    }
    finishFold(w) {
      const amount = this.pot();
      w.stack += amount;
      this.result = { type: 'fold', winners: [w.id], payouts: { [w.id]: amount }, pots: [{ amount: amount, eligible: [w.id], winners: [w.id] }], hands: {} };
      this.addLog(T('{p} забирает банк {a} — остальные сбросили карты', { p: w.name, a: amount }), w.id, 'win');
      this.finish();
    }
    showdown() {
      this.board = this.boardAll.slice(0, 5);
      this.street = 'showdown';
      const live = this.livePlayers();
      const hands = {};
      for (const p of live) {
        const bf = bestHand(this.variant, p.hole, this.board);
        hands[p.id] = { ev: bf.ev, best: bf.cards };
        this.addLog(T('{p} показывает {cards} — {h}', { p: p.name, cards: p.hole.map(cardText).join(' '), h: lc(describe(bf.ev)) }), p.id, 'show');
      }
      const r = settle(this.players, id => hands[id].ev.score, this.seatOrderFromButton());
      for (const id in r.payouts) this.players[id].stack += r.payouts[id];
      r.pots.forEach((pot, k) => {
        const name = k === 0 ? T('основной банк') : T('побочный банк {k}', { k: k });
        if (pot.returned) this.addLog(T('{p}: возврат неуравненной ставки {a}', { p: this.players[pot.winners[0]].name, a: pot.amount }), pot.winners[0], 'win');
        else this.addLog(T(pot.winners.length > 1 ? '{p} делят {pot} {a}' : '{p} выигрывает {pot} {a}', { p: pot.winners.map(id => this.players[id].name).join(T(' и ')), pot: name, a: pot.amount }), pot.winners[0], 'win');
      });
      const winners = Array.from(new Set([].concat.apply([], r.pots.filter(p => !p.returned).map(p => p.winners))));
      this.result = { type: 'showdown', winners: winners, payouts: r.payouts, pots: r.pots, hands: hands };
      this.finish();
    }
    finish() {
      this.done = true; this.toAct = -1; this.awaitingDeal = false;
      for (const p of this.players) p.bet = 0;
    }
    positionInfo(i) {
      const alive = [];
      if (this.players[this.button].out && this.done) return null;
      let s = this.button;
      for (let k = 0; k < this.players.length; k++) {
        if (!this.players[s].out) alive.push(s);
        s = (s + 1) % this.players.length;
      }
      const n = alive.length, k = alive.indexOf(i);
      if (k < 0 || !POS_BY_N[n]) return null;
      return POS[POS_BY_N[n][k]];
    }
    isLatePosition(i) { const p = this.positionInfo(i); return !!(p && p.late); }
    chipsInPlay() { return this.players.reduce((a, p) => a + p.stack, 0) + (this.done ? 0 : this.pot()); }
  }

  // ---------- Боты ----------
  const STYLES = {
    tight: { key: 'tight', label: T('Тайт'), full: T('Тайтовый стиль'), desc: T('Играет мало рук, но в банк входит с сильными картами и ставит уверенно.'), play: 1.3, raise: 1.65, reraise: 2.2, aggr: 0.55, bluff: 0.05, loose: 1.0 },
    aggro: { key: 'aggro', label: T('Агрессия'), full: T('Агрессивный стиль'), desc: T('Часто ставит и повышает, любит давить и блефовать.'), play: 1.0, raise: 1.2, reraise: 1.75, aggr: 0.8, bluff: 0.2, loose: 1.05 },
    loose: { key: 'loose', label: T('Луз-пассив'), full: T('Лузово-пассивный стиль'), desc: T('Заходит во многие раздачи и часто уравнивает, но редко повышает.'), play: 0.75, raise: 2.1, reraise: 2.8, aggr: 0.18, bluff: 0.03, loose: 1.6 }
  };
  const REL_K = { holdem: 1, short: 1.29, omaha: 1.43, omaha5: 1.4 };
  // Уровни ботов: новичок ошибается и часто коллирует, сильный учитывает позицию, дро и размер ставки.
  const BOT_LEVELS = {
    easy: { key: 'easy', label: T('Новички'), desc: T('Много ошибок: играют почти любые руки, часто уравнивают ставки и редко сбрасывают.') },
    normal: { key: 'normal', label: T('Средние'), desc: T('Играют по своему стилю, но без хитростей.') },
    hard: { key: 'hard', label: T('Сильные'), desc: T('Учитывают позицию, размер ставок и шансы дро, иногда полублефуют.') }
  };
  function botDecide(g, i, rng, iters) {
    rng = rng || Math.random; iters = iters || 200;
    const p = g.players[i], lvl = p.level || g.botLevel || 'normal';
    if (lvl === 'easy') return botEasy(g, i, rng, Math.max(40, iters >> 1));
    if (lvl === 'hard') return botHard(g, i, rng, Math.round(iters * 1.5));
    return botCore(g, i, rng, iters);
  }
  // Новичок: та же логика с большим «шумом» и привычкой уравнивать.
  function botEasy(g, i, rng, iters) {
    const L = g.legal(i), d = botCore(g, i, rng, iters, 2.2);
    const cheap = L.toCall <= Math.max(g.bb * 3, L.pot * 0.6);
    if (d.type === 'fold' && cheap && rng() < 0.45) return L.toCall > 0 ? { type: 'call' } : { type: 'check' };
    if (d.type === 'raise' && rng() < 0.35) return L.toCall > 0 ? { type: 'call' } : { type: 'check' };
    return d;
  }
  // Сильный: позиция до флопа, полублеф с дро, осторожность против крупных ставок.
  function botHard(g, i, rng, iters) {
    const p = g.players[i], L = g.legal(i), pos = g.positionInfo(i), bb = g.bb;
    if (g.street === 'preflop') {
      const info = startingHandInfo(p.hole, g.variant);
      const facingRaise = g.currentBet > bb;
      const posS = pos ? pos.short : 'MP';
      const a = preflopAdvice({ tier: info.tier, pos: posS, facingRaise: facingRaise, toCallBB: L.toCall / bb, canCheck: L.toCall === 0 });
      const stackBB = (p.stack + p.bet) / bb;
      // Короткий стек: «олл-ин или фолд»
      if (stackBB <= 12 && L.canRaise) {
        const need = facingRaise ? 3 : (pos && pos.late) || posS === 'SB' ? 1 : 2;
        if (info.tier >= need) return { type: 'raise', amount: L.maxTo };
        return L.toCall > 0 ? { type: 'fold' } : { type: 'check' };
      }
      const core = botCore(g, i, rng, iters, 0.6);
      if (a.action === 'raise' && L.canRaise && core.type !== 'raise') return clampBotRaise(g, L, facingRaise ? g.currentBet * 3 : bb * (2.5 + rng() * 0.5));
      // Без повышения перед собой с поздней позиции — давим на блайнды
      if (!facingRaise && L.canRaise && pos && pos.late && info.tier >= 1 && core.type !== 'raise') return clampBotRaise(g, L, bb * 2.5);
      // Слабые руки из ранних позиций не разыгрывает
      if (info.tier === 0 && core.type !== 'fold' && L.toCall > 0 && !(pos && pos.late)) return { type: 'fold' };
      if (facingRaise && a.action === 'fold' && core.type === 'call' && info.tier <= 1) return { type: 'fold' };
      return core;
    }
    const d = botCore(g, i, rng, iters, 0.6);
    const opp = g.players.filter(q => !q.folded && q !== p).length;
    const potOdds = L.toCall > 0 ? L.toCall / (L.pot + L.toCall) : 0;
    let draw = null;
    const minOuts = { omaha: 13, omaha5: 15 }[g.variant] || 8;
    if (g.board.length < 5) { const o = outsInfo(p.hole, g.board, g.variant); if (o.outs.length >= minOuts) draw = o; }
    // Продолжение ставки (контбет): повышал до флопа — ставит на флопе и без попадания
    if (g.street === 'flop' && g.pfRaiser === i && d.type === 'check' && L.canRaise && opp <= 2 && rng() < 0.65) return clampBotRaise(g, L, L.pot * (0.5 + rng() * 0.15));
    if (draw) {
      // Полублеф: ставка с сильным дро, пока есть карты впереди
      if (L.toCall === 0 && L.canRaise && opp <= 2 && rng() < 0.45) return clampBotRaise(g, L, L.pot * 0.6);
      // Колл с дро, если с учётом будущих выплат он окупается
      if (d.type === 'fold' && draw.pNext * 1.35 >= potOdds) return { type: 'call' };
    }
    return d;
  }
  function clampBotRaise(g, L, to) {
    to = Math.round(to / g.sb) * g.sb;
    to = Math.max(L.minTo, Math.min(L.maxTo, to));
    if (L.allInTo - to < g.bb * 2 || to > L.allInTo * 0.7) to = L.maxTo;
    return { type: 'raise', amount: to };
  }
  // Правила «играть или сбросить» до флопа — общие для подсказок, разбора, тренажёра и сильных ботов.
  // tier: 0 слабая … 4 премиум; pos: UTG|MP|CO|BTN|SB|BB.
  const LATE_POS = { CO: 1, BTN: 1 };
  function preflopAdvice(o) {
    const t = o.tier, pos = o.pos, late = !!LATE_POS[pos];
    if (!o.facingRaise) {
      if (o.canCheck && t < 3) return { action: 'check', rule: 'bbcheck' };
      if (t >= 3) return { action: 'raise', rule: 'strongOpen' };
      if (t === 2) return late || pos === 'SB' ? { action: 'raise', rule: 'midLate' } : { action: 'fold', rule: 'midEarly' };
      if (t === 1) return pos === 'BTN' ? { action: 'raise', rule: 'specBtn' } : { action: 'fold', rule: 'specFold' };
      return { action: 'fold', rule: 'weak' };
    }
    const bbs = o.toCallBB || 0;
    if (t >= 4) return { action: 'raise', rule: 'premium3bet' };
    if (t === 3) return bbs <= 6 ? { action: 'call', rule: 'strongCall' } : { action: 'fold', rule: 'strongBig' };
    if (t === 2 && (late || pos === 'BB') && bbs <= 3) return { action: 'call', rule: 'midLateCall' };
    return { action: 'fold', rule: t === 2 ? 'midVsRaise' : 'weakVsRaise' };
  }
  const PREFLOP_WHY = {
    bbcheck: T('Никто не повышал, а вы на большом блайнде — чек бесплатный, сбрасывать не нужно.'),
    strongOpen: T('Сильная рука: входите в банк рейзом с любой позиции.'),
    midLate: T('Средняя рука в поздней позиции: после вас мало игроков, можно повысить и побороться за блайнды.'),
    midEarly: T('Средняя рука в ранней позиции: после вас ещё много игроков, у кого-то найдётся рука сильнее. Сбросьте.'),
    specBtn: T('Спекулятивная рука на баттоне: хорошее место, чтобы повышением забрать блайнды.'),
    specFold: T('Спекулятивная рука играет только на баттоне. Отсюда — фолд.'),
    weak: T('Слабая рука: на дистанции такие руки проигрывают. Сбросьте.'),
    premium3bet: T('Премиум-рука против повышения — повышайте ещё раз (3-бет): вы, скорее всего, впереди.'),
    strongCall: T('Сильная рука против небольшого повышения: уравнять разумно, а повышать без премиум-руки не стоит.'),
    strongBig: T('Повышение очень большое (больше 6 больших блайндов) — с такой рукой лучше не рисковать.'),
    midLateCall: T('Средняя рука, поздняя позиция и небольшое повышение — можно уравнять.'),
    midVsRaise: T('Средняя рука против повышения обычно проигрывает. Сбросьте.'),
    weakVsRaise: T('Против повышения играйте только сильные руки. Сбросьте.')
  };
  function botCore(g, i, rng, iters, noiseK) {
    const p = g.players[i], L = g.legal(i), St = STYLES[p.style] || STYLES.tight;
    const opp = g.players.filter(q => !q.folded && q !== p).length;
    const eq = equity(p.hole, g.board, opp, iters, rng, g.variant);
    // В омахе эквити рук ближе друг к другу — растягиваем шкалу, чтобы пороги стилей работали одинаково.
    const relK = REL_K[g.variant] || 1;
    const rel = g.street === 'preflop' ? 1 + (eq * (opp + 1) - 1) * relK : eq * (opp + 1);
    const late = g.isLatePosition(i);
    const noise = 1 + (rng() - 0.5) * 0.3 * (noiseK || 1);
    const r = rel * noise + (late ? 0.12 : 0);
    const pot = L.pot, bb = g.bb;
    const potOdds = L.toCall > 0 ? L.toCall / (pot + L.toCall) : 0;
    const commit = p.stack > 0 ? L.toCall / p.stack : 1;
    const canR = L.canRaise && (g.raisesThisStreet < 3 || eq > 0.8);
    const raiseTo = to => {
      to = Math.round(to / g.sb) * g.sb;
      to = Math.max(L.minTo, Math.min(L.maxTo, to));
      if (L.allInTo - to < bb * 2 || to > L.allInTo * 0.7) to = L.maxTo;
      return { type: 'raise', amount: to };
    };
    const check = { type: 'check' }, call = { type: 'call' }, fold = { type: 'fold' };
    const foldOrCheck = L.toCall > 0 ? fold : check;

    if (g.street === 'preflop') {
      const facingRaise = g.currentBet > bb;
      if (!facingRaise) {
        if (canR && r >= St.raise && rng() < 0.6 + St.aggr * 0.4) return raiseTo(bb * (2.5 + rng()));
        if (r >= St.play) return L.toCall > 0 ? call : check;
        if (canR && late && rng() < St.bluff) return raiseTo(bb * 2.5);
        return foldOrCheck;
      }
      if (canR && r >= St.reraise && rng() < 0.4 + St.aggr * 0.6) return raiseTo(g.currentBet * 3);
      // Против повышения: рука должна быть достаточно сильной для стиля И окупать колл
      // против тех, кто реально поставил (а не против всех за столом).
      const need = St.play + Math.min(0.4, (L.toCall / bb) * 0.03);
      const effOpp = Math.max(1, g.players.filter(q => q !== p && !q.folded && q.bet > bb).length);
      const eqEff = effOpp === opp ? eq : equity(p.hole, g.board, effOpp, iters, rng, g.variant);
      const factor = St.key === 'tight' ? 1.25 : St.key === 'aggro' ? 1.1 : 0.95;
      // Явно сильная рука (≥62%) уравнивает даже большую ставку: один на один порог «need» бывает недостижим даже для тузов.
      if (eqEff * noise >= potOdds * factor && (r >= need || eqEff >= 0.62)) return call;
      return fold;
    }
    const strong = eq >= 0.7 || rel >= 2.4;
    const medium = eq >= 0.5 || rel >= 1.5;
    if (L.toCall === 0) {
      if (canR && strong && rng() < 0.55 + St.aggr * 0.4) return raiseTo(pot * (0.5 + rng() * 0.4));
      if (canR && medium && rng() < St.aggr * 0.6) return raiseTo(pot * 0.5);
      if (canR && rng() < St.bluff * (opp <= 2 ? 1 : 0.4) * (late ? 1.3 : 1)) return raiseTo(pot * (0.4 + rng() * 0.3));
      return check;
    }
    if (canR && strong && rng() < 0.3 + St.aggr * 0.5) return raiseTo(g.currentBet * 2.5 + pot * 0.2);
    const looseF = commit > 0.4 ? 1 : St.loose;
    if (eq * looseF * noise >= potOdds) return call;
    if (canR && opp === 1 && g.raisesThisStreet < 2 && rng() < St.bluff * 0.25) return raiseTo(g.currentBet * 2.5);
    return fold;
  }

  return {
    VARIANTS, POWER_SD, REL_K, TIER_EQ, deckFor, handScore, bestHand, checkSelection, genDeal, genFive, catDef, howToPick, startingHoldem,
    RANK_SYM, SUIT_SYM, SUIT_NAMES, SUIT_GEN_PL, R_NOM, R_GEN, R_GEN_PL, R_NOM_PL, CAT, CAT_NAMES, CAT_DEFS, HOW_TO_PICK,
    BLINDS, STREET_RU, STYLES, POS,
    rankOf, suitOf, makeCard, parseCard, parseCards, cardText, newDeck, shuffle, mulberry32, combinations,
    evaluate, bestFive, isBestSelection, sortForDisplay, describe, explainCompare, diffIndex, lc,
    genHand, equity, outsInfo, chen, startingHandInfo, buildPots, settle, Game, botDecide,
    BOT_LEVELS, preflopAdvice, PREFLOP_WHY, LATE_POS
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PK;
/* ===== END POKER CORE ===== */
