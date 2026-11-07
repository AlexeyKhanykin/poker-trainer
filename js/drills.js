/* ===== POKER DRILLS: генераторы заданий «Шансы», «Префлоп», «Мои ошибки» и пояса (чистые функции) ===== */
var PKDrills = (function (PK) {
  'use strict';
  const I18 = typeof PKI18n !== 'undefined' ? PKI18n : null;
  const T = I18 ? I18.t : (s, v) => (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)) : s);
  const V_ = vk => PK.VARIANTS[vk] || PK.VARIANTS.holdem;
  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
  const plural = (n, one, few, many) => { if (I18) return I18.plural(n, one, few, many); const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many; };
  const ru = (n, one, few, many) => n + ' ' + plural(n, one, few, many);
  const round10 = x => Math.max(10, Math.round(x / 10) * 10);

  function deal(vk, nBoard, rng) {
    const d = PK.deckFor(vk).slice();
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = d[i]; d[i] = d[j]; d[j] = t; }
    const H = V_(vk).hole;
    return { hole: d.slice(0, H), board: d.slice(H, H + nBoard) };
  }

  // ---------- Шансы и ауты ----------
  // type: 'outs' — сколько аутов; 'prob' — шанс улучшиться; 'pot' — выгоден ли колл.
  const ODDS_TYPES = ['outs', 'prob', 'pot'];
  const ODDS_NAMES = { outs: T('Сколько аутов'), prob: T('Шанс улучшиться'), pot: T('Выгоден ли колл') };
  function findDraw(vk, nBoard, rng) {
    const V = V_(vk), P = c => V.sd ? PK.POWER_SD[c] : c;
    const maxOuts = V.omaha ? 22 : 17;
    let fallback = null;
    for (let t = 0; t < 400; t++) {
      const d = deal(vk, nBoard, rng);
      const o = PK.outsInfo(d.hole, d.board, vk);
      const n = o.outs.length;
      if (n < 4 || n > maxOuts) continue;
      if (P(o.cur.cat) >= P(4)) continue; // уже стрит или сильнее — неинтересно
      const cats = Object.keys(o.byCat).map(Number);
      const realDraw = cats.some(c => c === 4 || c === 5 || c === 6 || c === 8);
      if (!fallback) fallback = { d, o };
      if (realDraw || t > 250) return { d, o };
    }
    return fallback;
  }
  function numOptions(correct, cands, rng, minGap) {
    const out = [correct];
    const pool = cands.filter(x => x > 0 && x !== correct);
    while (out.length < 4 && pool.length) {
      const x = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      if (out.every(y => Math.abs(y - x) >= minGap)) out.push(x);
    }
    let k = 1;
    while (out.length < 4) { const x = correct + k * minGap * (k % 2 ? 1 : -1) * Math.ceil(k / 2); k++; if (x > 0 && out.indexOf(x) < 0 && out.every(y => Math.abs(y - x) >= minGap)) out.push(x); if (k > 30) break; }
    return out.sort((a, b) => a - b);
  }
  function genOdds(vk, type, rng) {
    rng = rng || Math.random;
    type = ODDS_TYPES.indexOf(type) >= 0 ? type : pick(ODDS_TYPES, rng);
    const street = type === 'pot' ? 4 : (rng() < 0.6 ? 3 : 4);
    const f = findDraw(vk, street, rng);
    if (!f) return null;
    const { d, o } = f, n = o.outs.length;
    const task = { kind: 'odds', type, variant: vk, hole: d.hole, board: d.board, outs: o.outs, byCat: o.byCat, cur: o.cur, unseen: o.unseen, pNext: o.pNext, pByRiver: o.pByRiver };
    if (type === 'outs') {
      task.question = T('Сколько у вас аутов — карт, которые улучшат вашу комбинацию?');
      task.options = numOptions(n, [n - 4, n - 3, n - 2, n + 2, n + 3, n + 4, n * 2, n - 6, n + 6], rng, 2).map(v => ({ v, label: String(v) }));
      task.correct = task.options.findIndex(x => x.v === n);
    } else if (type === 'prob') {
      const toRiver = d.board.length === 3 && rng() < 0.6;
      const p = Math.round((toRiver ? o.pByRiver : o.pNext) * 100);
      task.toRiver = toRiver;
      task.question = T(toRiver ? 'Какой шанс улучшить руку к риверу (за две карты: тёрн и ривер)?' : 'Какой шанс улучшить руку на следующей карте?');
      const wrongRule = toRiver ? n * 2 : n * 4;
      task.options = numOptions(p, [wrongRule, p - 8, p + 8, p - 12, p + 12, p - 15, p + 15, Math.round(p / 2), p * 2].filter(x => x < 100), rng, 5).map(v => ({ v, label: v + '%' }));
      task.correct = task.options.findIndex(x => x.v === p);
    } else {
      // Ривер ещё впереди (стол из 4 карт), соперник ставит. Считаем: собрали руку — выиграли, нет — проиграли.
      const eq = o.pNext;
      for (let t = 0; t < 60; t++) {
        const target = Math.min(0.45, Math.max(0.05, eq + (rng() < 0.5 ? -1 : 1) * (0.06 + rng() * 0.12)));
        const call = round10(20 + rng() * 180);
        const pot = round10(call * (1 - target) / target);
        const need = call / (pot + call);
        if (Math.abs(need - eq) >= 0.04 && pot >= call) { task.pot = pot; task.toCall = call; task.need = need; break; }
      }
      if (task.pot == null) { task.toCall = 50; task.pot = round10(50 * (1 - eq + 0.1) / Math.max(0.05, eq - 0.1)); task.need = 50 / (task.pot + 50); }
      task.question = T('В банке {pot} (вместе со ставкой соперника), чтобы продолжить, нужно доставить {call}. Колл выгоден?', { pot: task.pot, call: task.toCall });
      task.options = [{ v: 'call', label: T('Колл выгоден') }, { v: 'fold', label: T('Лучше сбросить') }];
      task.correct = eq >= task.need ? 0 : 1;
    }
    return task;
  }

  // ---------- Решения после флопа: фолд, колл или рейз ----------
  // Правило то же, что у подсказки за столом: очень сильная рука — повышать; шанс не меньше нужного — колл; иначе — фолд.
  const isStrong = (eq, nOpp) => eq >= 0.65 || eq * (nOpp + 1) >= 2.2;
  function postAction(eq, need, nOpp) { return isStrong(eq, nOpp) ? 'raise' : eq >= need ? 'call' : 'fold'; }
  const SPOT_STREETS = ['flop', 'turn', 'river'];
  const SPOT_NB = { flop: 3, turn: 4, river: 5 };
  // Размер ставки в долях банка; доля, которую нужно выигрывать для колла: ставка ÷ (банк + ставка + колл)
  const BET_SIZES = [
    { f: 1 / 3, label: T('треть банка') }, { f: 1 / 2, label: T('полбанка') }, { f: 2 / 3, label: T('две трети банка') },
    { f: 1, label: T('размер банка') }, { f: 1.5, label: T('полтора банка') }
  ];
  const SPOT_MARGIN = 0.06; // задания только с ясным ответом: шанс отличается от порога хотя бы на 6 п.п.
  const spotIters = vk => vk === 'holdem' ? 3000 : vk === 'short' ? 2500 : vk === 'omaha' ? 700 : 450;
  function genSpot(vk, rng, opts) {
    rng = rng || Math.random; opts = opts || {};
    const street = SPOT_STREETS.indexOf(opts.street) >= 0 ? opts.street : pick(SPOT_STREETS, rng);
    const nOpp = opts.nOpp || (rng() < 0.7 ? 1 : 2);
    // Сначала выбираем ответ (поровну фолд, колл и рейз), потом подбираем раздачу и ставку под него
    const want = opts.want || pick(['fold', 'call', 'raise'], rng);
    let best = null;
    for (let t = 0; t < 40; t++) {
      const d = deal(vk, SPOT_NB[street], rng);
      const fits = eq => {
        const strong = isStrong(eq, nOpp);
        if (!strong && eq > 0.65 - SPOT_MARGIN - 0.04) return null; // почти сильная — спорный случай
        const sizes = BET_SIZES.filter(s => {
          const need = s.f / (1 + 2 * s.f);
          if (strong) return true;
          return want === 'call' ? eq >= need + SPOT_MARGIN : eq <= need - SPOT_MARGIN;
        });
        return sizes.length ? { strong, sizes } : null;
      };
      // Быстрая прикидка отсеивает лишние раздачи. Подошедшую пересчитываем заново, точнее и на новых случайных картах:
      // иначе отбор «по удачной прикидке» завышает или занижает шанс в объяснении на несколько пунктов (особенно в омахе).
      const eq0 = PK.equity(d.hole, d.board, nOpp, spotIters(vk), rng, vk), f0 = fits(eq0);
      if (!f0) continue;
      const act0 = f0.strong ? 'raise' : want === 'raise' ? (eq0 >= 0.3 ? 'call' : 'fold') : want;
      if (act0 !== want && best) continue; // запасной вариант уже есть — на точный пересчёт не тратимся
      const eq = PK.equity(d.hole, d.board, nOpp, spotIters(vk) * 3, rng, vk);
      const ok = fits(eq);
      if (!ok) continue;
      const { strong, sizes } = ok;
      const action = strong ? 'raise' : want === 'raise' ? (eq >= 0.3 ? 'call' : 'fold') : want;
      const cand = { d, eq, sizes, action };
      if (action === want) { best = cand; break; }
      if (!best) best = cand;
    }
    if (!best) return null;
    const size = pick(best.sizes, rng);
    const pot0 = round10(60 + rng() * 340);
    const bet = round10(pot0 * size.f);
    const need = bet / (pot0 + 2 * bet);
    let action = postAction(best.eq, need, nOpp);
    // После округления ставки ответ мог стать спорным — тогда берём ставку точно по доле
    if (!isStrong(best.eq, nOpp) && Math.abs(best.eq - need) < SPOT_MARGIN / 2) action = best.action;
    const N = I18 ? I18.num : String;
    const options = [{ v: 'fold', label: T('Фолд') }, { v: 'call', label: T('Колл {n}', { n: N(bet) }) }, { v: 'raise', label: T('Рейз') }];
    const cur = PK.bestHand(vk, best.d.hole, best.d.board).ev;
    const outs = street !== 'river' ? PK.outsInfo(best.d.hole, best.d.board, vk) : null;
    return {
      kind: 'spot', variant: vk, street, sub: street, hole: best.d.hole, board: best.d.board, nOpp, eq: best.eq,
      pot0, bet, pot: pot0 + bet, toCall: bet, need, size: size.label, action, cur, outs,
      options, correct: options.findIndex(o => o.v === action)
    };
  }

  // ---------- Префлоп: играть или сбросить ----------
  const POS6 = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
  const POS_RU = { UTG: T('ранняя позиция (UTG)'), MP: T('средняя позиция (MP)'), CO: T('поздняя позиция (катофф)'), BTN: T('баттон'), SB: T('малый блайнд'), BB: T('большой блайнд') };
  const TIER_W = [1, 1.2, 1.4, 1.2, 0.8];
  function genPreflop(vk, rng, opts) {
    rng = rng || Math.random; opts = opts || {};
    const want = (() => { let x = rng() * TIER_W.reduce((a, b) => a + b, 0); for (let t = 0; t < 5; t++) { x -= TIER_W[t]; if (x <= 0) return t; } return 2; })();
    let hole = null, info = null;
    for (let k = 0; k < (V_(vk).omaha ? 25 : 120); k++) {
      const h = deal(vk, 0, rng).hole, i = PK.startingHandInfo(h, vk);
      if (!hole || Math.abs(i.tier - want) < Math.abs(info.tier - want)) { hole = h; info = i; }
      if (i.tier === want) break;
    }
    const pos = opts.pos || pick(POS6, rng);
    const facingRaise = pos === 'BB' ? true : (opts.facingRaise != null ? opts.facingRaise : rng() < 0.45);
    const raiseTo = facingRaise ? pick([2.5, 3, 3, 4, 7], rng) : 0;
    const posted = pos === 'SB' ? 0.5 : pos === 'BB' ? 1 : 0;
    const toCallBB = facingRaise ? raiseTo - posted : 1 - posted;
    const advice = PK.preflopAdvice({ tier: info.tier, pos, facingRaise, toCallBB, canCheck: false });
    const options = facingRaise ? [{ v: 'fold', label: T('Фолд') }, { v: 'call', label: T('Колл') }, { v: 'raise', label: T('Рейз') }]
      : [{ v: 'fold', label: T('Фолд') }, { v: 'raise', label: T('Рейз (войти в банк)') }];
    return { kind: 'preflop', variant: vk, hole, info, pos, facingRaise, raiseTo, toCallBB, advice, options, correct: options.findIndex(o => o.v === advice.action), sub: facingRaise ? 'raise' : 'open' };
  }
  // Таблица стартовых рук 13×13 (для 2-карточных вариантов). open: 'any' | 'late' | 'btn' | 'fold'
  const gridCache = {};
  function handGrid(vk) {
    const V = V_(vk);
    if (V.hole !== 2) return null;
    if (gridCache[vk]) return gridCache[vk];
    const ranks = [];
    for (let r = 14; r >= (V.sd ? 6 : 2); r--) ranks.push(r);
    const rows = ranks.map(r1 => ranks.map(r2 => {
      const pair = r1 === r2, suited = !pair && r1 > r2;
      const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
      const c1 = PK.makeCard(hi, 0), c2 = PK.makeCard(lo, suited ? 0 : 1);
      const info = PK.startingHandInfo([c1, c2], vk);
      const t = info.tier;
      return { code: info.code, hi, lo, pair, suited, tier: t, open: t >= 3 ? 'any' : t === 2 ? 'late' : t === 1 ? 'btn' : 'fold' };
    }));
    return (gridCache[vk] = { ranks, rows });
  }
  function gridCode(hole) {
    const r = hole.map(PK.rankOf).sort((a, b) => b - a);
    return { hi: r[0], lo: r[1], suited: PK.suitOf(hole[0]) === PK.suitOf(hole[1]) && r[0] !== r[1] };
  }


  // ---------- Почему рука сильная или слабая ----------
  // Возвращает список пунктов { s: '+' | '-' | '~', t: текст }.
  const RN = r => PK.R_NOM[r], RG = r => PK.R_GEN_PL[r];
  function explainStart(hole, vk) {
    const V = V_(vk), out = [], add = (sg, t) => out.push({ s: sg, t });
    const rs = hole.map(PK.rankOf).sort((a, b) => b - a), su = hole.map(PK.suitOf);
    if (hole.length === 2) {
      const hi = rs[0], lo = rs[1], suited = su[0] === su[1], pair = hi === lo;
      if (pair) {
        if (hi >= 10) add('+', hi === 14 ? T('Пара {r} — готовая сильная комбинация ещё до флопа, лучшая из возможных.', { r: RG(hi) }) : T('Пара {r} — готовая сильная комбинация ещё до флопа. Старше неё только пары {list}.', { r: RG(hi), list: PK.R_GEN_PL.slice(hi + 1, 15).join(', ') }));
        else if (hi >= 7) add('~', T('Средняя пара: до флопа часто впереди, но на флопе обычно выходят карты старше {r} — тогда её легко перебить.', { r: PK.R_GEN[hi] }));
        else add('~', T('Младшая пара: сама по себе слабая. Её ценность — шанс собрать тройку (сет): примерно 1 раз из 8 на флопе. Поэтому играть её стоит дёшево.'));
        return out;
      }
      const lowLim = V.sd ? 6 : 2;
      if (lo >= 10) add('+', T('Обе карты старшие (десятка и выше): если к любой из них придёт пара, она будет старшей, с хорошим кикером.'));
      else if (hi === 14) add('+', T('Туз — самая старшая карта: пара тузов почти всегда старшая пара на столе.'));
      else if (hi >= 11) add('~', T('Есть одна старшая карта ({r}), вторая — мелкая.', { r: RN(hi) }));
      else add('-', T('Обе карты младше десятки: даже собрав пару, вы часто будете проигрывать паре старше.'));
      if (hi >= 11 && lo < 10) add('-', T('Слабый кикер ({lo}): если у соперника {hi} с картой старше, при одинаковой паре вы проиграете. Такую руку называют «доминированной».', { lo: RN(lo), hi: RN(hi) }));
      if (suited) add('+', T('Одномастные: есть шанс собрать флеш (≈6% к риверу). Одномастная рука примерно на 2–4% сильнее такой же разномастной.') + (V.sd ? ' ' + T('В шорт-деке флеш особенно ценен: он старше фулл-хауса.') : ''));
      else add('-', T('Разномастные: флеш собрать почти невозможно — одномастная версия этой руки заметно сильнее.'));
      let gap = hi - lo - 1;
      if (hi === 14 && (V.sd ? lo === 6 : lo <= 5)) gap = Math.min(gap, lo - (V.sd ? 6 : 2));
      if (gap === 0) add('+', T('Связанные карты (идут подряд): много вариантов собрать стрит.'));
      else if (gap === 1) add('~', T('Карты через одну: стрит собрать можно, но вариантов меньше.'));
      else if (gap <= 3) add('-', T('Большой разрыв между картами: стрит собрать трудно.'));
      else add('-', T('Карты далеко друг от друга по рангу — стрит с обеими невозможен.'));
      if (lo < lowLim + 3 && hi < 10) add('-', T('Мелкие карты: собранный с ними стрит или флеш нередко проигрывает такому же, но старше.'));
      return out;
    }
    // Омаха: 4–5 карт
    const cnt = {}; rs.forEach(r => cnt[r] = (cnt[r] || 0) + 1);
    const trips = Object.keys(cnt).filter(r => cnt[r] >= 3).map(Number);
    const pairs = Object.keys(cnt).filter(r => cnt[r] === 2).map(Number).sort((a, b) => b - a);
    const sc = [0, 0, 0, 0]; su.forEach(x => sc[x]++);
    const suitedGroups = sc.filter(x => x >= 2).length;
    if (trips.length) add('-', T('Три карты одного ранга ({r}): в комбинацию можно взять только две, третья «мёртвая» — и к тому же забирает ваш аут на тройку.', { r: RG(trips[0]) }));
    pairs.forEach(r => add(r >= 12 ? '+' : '~', T(r >= 12 ? 'Пара {r}: шанс собрать старшую тройку (сет).' : 'Пара {r}: может стать тройкой, но младшая тройка в омахе часто проигрывает.', { r: RG(r) })));
    if (suitedGroups >= 2) add('+', T('Двухмастная рука: два независимых шанса собрать флеш.'));
    else if (suitedGroups === 1) {
      const s0 = sc.findIndex(x => x >= 2), top = Math.max.apply(null, hole.filter(c => PK.suitOf(c) === s0).map(PK.rankOf));
      add(top === 14 ? '+' : '~', T(top === 14 ? 'Есть туз с картой той же масти: флеш будет самым старшим («натсовым»).' : 'Две карты одной масти — шанс на флеш, но не самый старший: в омахе флеши у соперников встречаются часто.'));
      if (sc[s0] >= 3) add('-', T('Три и более карт одной масти: лишние карты этой масти уменьшают число аутов на флеш.'));
    } else add('-', T('Разномастная рука: флеш собрать нельзя — в омахе это серьёзный минус.'));
    const uniq = Object.keys(cnt).map(Number).sort((a, b) => b - a);
    let bestWin = 0;
    for (let top = 14; top >= 5; top--) { const n = uniq.filter(r => r <= top && r > top - 5).length + (top <= 5 && cnt[14] ? 1 : 0); bestWin = Math.max(bestWin, n); }
    const need = hole.length;
    if (bestWin >= Math.min(4, need)) add('+', T('Карты связаны (близки по рангу): много вариантов собрать стрит.'));
    else if (bestWin === 3) add('~', T('Три карты связаны по рангу, остальные — отдельно.'));
    else add('-', T('Карты разбросаны по рангу: стритов почти нет.'));
    if (bestWin === hole.length - 1 && !pairs.length && suitedGroups < 2) {
      const inWin = top => uniq.filter(r => r <= top && r > top - 5);
      let dangler = null;
      for (let top = 14; top >= 5; top--) { const w = inWin(top); if (w.length === bestWin) { dangler = uniq.find(r => w.indexOf(r) < 0); break; } }
      if (dangler) add('-', T('Лишняя карта ({r}): не связана с остальными и почти ничем не помогает.', { r: RN(dangler) }));
    }
    const high = rs.filter(r => r >= 10).length;
    if (high >= 3) add('+', T('Много старших карт — собранные комбинации будут старше, чем у соперников.'));
    else if (rs[0] < 10) add('-', T('Все карты мелкие: стрит или флеш с ними часто проигрывает такому же, но старше.'));
    return out;
  }
  function explainMade(hole, board, vk) {
    if (board.length < 3) return [];
    const V = V_(vk), out = [], add = (sg, t) => out.push({ s: sg, t });
    const bh = PK.bestHand(vk, hole, board), ev = bh.ev, cat = ev.cat;
    const br = board.map(PK.rankOf).sort((a, b) => b - a), bcnt = {}; br.forEach(r => bcnt[r] = (bcnt[r] || 0) + 1);
    const hr = hole.map(PK.rankOf), used = bh.cards.filter(c => hole.indexOf(c) >= 0).map(PK.rankOf);
    const bsc = [0, 0, 0, 0]; board.forEach(c => bsc[PK.suitOf(c)]++);
    const P = c => V.sd ? PK.POWER_SD[c] : c;
    if (cat === 0) add('-', T('Ничего не собрано — только старшая карта. На вскрытии такая рука почти всегда проигрывает.'));
    if (cat === 0 && !V.omaha) {
      const over = hr.filter(r => r > br[0]);
      if (over.length) add('~', over.length === 2 ? T('Обе ваши карты старше всех карт стола («оверкарты»): если к любой из них придёт пара, она будет старшей — это ещё 6 аутов.') : T('Ваша карта {r} старше всех карт стола («оверкарта»): если к ней придёт пара, она будет старшей — это ещё 3 аута.', { r: RN(over[0]) }));
    }
    if (cat === 1) {
      const pr = ev.ranks[0];
      if (bcnt[pr] === 2) add('-', T('Пара {r} лежит на столе — она есть у всех игроков, у вас фактически ничего.', { r: RG(pr) }));
      else if (hr.filter(r => r === pr).length >= 2 && used.filter(r => r === pr).length === 2) add(pr > br[0] ? '+' : '~', pr > br[0] ? T('Оверпара: ваша пара старше всех карт на столе.') : T('Ваша пара {r} младше {top} на столе: у любого с этой картой пара уже старше.', { r: RG(pr), top: PK.R_GEN[br[0]] }));
      else if (pr === br[0]) {
        add('+', T('Старшая пара — с самой старшей картой стола.'));
        if (!V.omaha) { const kick = hr.filter(r => r !== pr)[0]; if (kick) add(kick >= 12 ? '+' : '-', T(kick >= 12 ? 'Кикер сильный ({r}).' : 'Кикер слабый ({r}): соперник с такой же парой и кикером старше вас обыграет.', { r: RN(kick) })); }
      } else if (pr < br[br.length - 1] || pr <= br[Math.min(2, br.length - 1)]) add('-', T('Младшая пара: на столе есть карты старше — с любой из них у соперника пара старше.'));
      else add('~', T('Средняя пара: на столе есть карта старше ({r}), с ней у соперника пара будет старше.', { r: RN(br[0]) }));
    }
    if (cat === 2) {
      const boardPair = ev.ranks.slice(0, 2).some(r => bcnt[r] === 2);
      add(boardPair ? '~' : '+', T(boardPair ? 'Одна из пар лежит на столе (она общая) — фактически у вас одна пара.' : 'Две пары, обе с вашими картами — хорошая рука.'));
    }
    if (cat === 3) {
      const r3 = ev.ranks[0];
      if (bcnt[r3] === 3) add('-', T('Тройка лежит на столе — она есть у всех.'));
      else if (hr.filter(r => r === r3).length >= 2 && used.filter(r => r === r3).length === 2) add('+', T('Сет: пара в руке + карта на столе. Очень сильная и незаметная для соперников рука.'));
      else add('~', T('Тройка с парой на столе: у соперника с такой же картой может быть кикер старше.'));
    }
    if (P(cat) >= P(4)) {
      add('+', T('Сильная готовая рука: {c}.', { c: PK.lc(PK.CAT_NAMES[cat]) }));
      if (cat === 5 && !V.sd) { const fs = PK.suitOf(bh.cards[0]); const top = Math.max.apply(null, bh.cards.filter(c => hole.indexOf(c) >= 0 && PK.suitOf(c) === fs).map(PK.rankOf).concat([0])); if (top && top < 14) add('~', T('Флеш не самый старший: у соперника может быть флеш с картой старше.')); }
    }
    if (P(cat) < P(5) && Math.max.apply(null, bsc) >= 3) add('-', T('На столе {n} карты одной масти — у соперника может быть флеш.', { n: Math.max.apply(null, bsc) }));
    if (Object.keys(bcnt).some(r => bcnt[r] >= 2) && (cat === 4 || cat === 5)) add('-', T(V.sd && cat === 5 ? 'Стол спарен: у соперника может быть фулл-хаус (хотя в шорт-деке ваш флеш старше фулл-хауса).' : 'Стол спарен: у соперника может быть фулл-хаус.'));
    if (V.omaha && P(cat) <= P(2)) add('~', T('В омахе у соперников по {n}, сильные руки собираются чаще: одна или две пары здесь часто проигрывают.', { n: ru(V.hole, 'карта', 'карты', 'карт') }));
    if (board.length < 5) {
      const o = PK.outsInfo(hole, board, vk);
      const fl = (o.byCat[5] || []).length, st = (o.byCat[4] || []).length;
      if (fl >= 7) add('+', T('Флеш-дро: ещё {n} флеш.', { n: ru(fl, 'карта достроит', 'карты достроят', 'карт достроят') }));
      if (st >= 7) add('+', T('Открытое стрит-дро: {n} стрит.', { n: ru(st, 'карта достроит', 'карты достроят', 'карт достроят') }));
      else if (st >= 3) add('~', T('Стрит-дро «в дырку»: только {n} стрит.', { n: ru(st, 'карта достроит', 'карты достроят', 'карт достроят') }));
    }
    return out;
  }

  // ---------- Мои ошибки: задания из сыгранных раздач ----------
  // Нужны решения, сохранённые со «снимком» ситуации (поле adv).
  function collectMistakes(hands, vk, fixed) {
    fixed = fixed || {};
    const out = [];
    for (let i = hands.length - 1; i >= 0; i--) {
      const h = hands[i];
      if (vk && vk !== 'all' && h.variant !== vk) continue;
      (h.decisions || []).forEach((d, k) => {
        if (!d.adv || (d.c !== 'bad' && d.c !== 'soft')) return;
        const key = h.id + ':' + k;
        if (fixed[key]) return;
        out.push({ key, hand: h, d, idx: k });
      });
    }
    return out;
  }
  const actionOf = a => a === 'check' ? 'call' : a;

  // ---------- Пояса (лестница навыков) ----------
  const BELTS = [
    { name: T('Белый'), color: '#e9e6df' }, { name: T('Жёлтый'), color: '#f2c94c' }, { name: T('Оранжевый'), color: '#f2994a' }, { name: T('Зелёный'), color: '#27ae60' },
    { name: T('Синий'), color: '#2f80ed' }, { name: T('Фиолетовый'), color: '#9b51e0' }, { name: T('Коричневый'), color: '#8d5a3b' }, { name: T('Чёрный'), color: '#1c1c1c' }
  ];
  function lastAcc(A, pred, n) {
    const xs = A.filter(pred).slice(-n);
    return { n: xs.length, acc: xs.length ? xs.filter(r => r.ok).length / xs.length : 0 };
  }
  function beltSteps(answers, hands, vk) {
    const A = answers.filter(r => r.variant === vk).sort((a, b) => a.ts - b.ts);
    const H = hands.filter(r => r.variant === vk).sort((a, b) => a.ts - b.ts);
    const accStep = (title, mode, x, need, n, hint) => ({ title, mode, need, n, have: x.n, acc: x.acc, ok: x.n >= n && x.acc >= need, text: x.n < n ? T('ответов {a} из {b}', { a: x.n, b: n }) : T('точность {a}% (нужно {b}%)', { a: Math.round(x.acc * 100), b: Math.round(need * 100) }), hint });
    const s = [];
    s.push(accStep(T('«Назови комбинацию», 5 карт: 90% за последние 30 ответов'), 'name', lastAcc(A, r => (r.mode === 'name' || r.mode === 'speed') && r.level == 5, 30), 0.9, 30));
    s.push(accStep(T('«Назови комбинацию», вся раздача: 85% за последние 30'), 'name', lastAcc(A, r => (r.mode === 'name' || r.mode === 'speed') && r.level === 'full', 30), 0.85, 30, 'full'));
    const b = lastAcc(A, r => r.mode === 'best', 20), w = lastAcc(A, r => r.mode === 'winner', 20);
    const bw = { n: Math.min(b.n, w.n), acc: Math.min(b.acc, w.acc) };
    s.push(accStep(T('«Лучшая рука» и «Кто выиграл?»: по 80% за последние 20'), b.n < 20 || b.acc < 0.8 ? 'best' : 'winner', bw, 0.8, 20));
    s.push(accStep(T('«Шансы и ауты»: 75% за последние 30'), 'odds', lastAcc(A, r => r.mode === 'odds', 30), 0.75, 30));
    s.push(accStep(T('«Играть или сбросить»: 85% за последние 40'), 'preflop', lastAcc(A, r => r.mode === 'preflop', 40), 0.85, 40));
    const lastH = H.slice(-100), decs = [].concat.apply([], lastH.map(h => h.decisions || []));
    const badRate = decs.length ? decs.filter(d => d.c === 'bad').length / decs.length : 1;
    s.push({ title: T('За столом: 150 раздач и меньше 12% ошибочных решений в последних 100'), mode: 'game', ok: H.length >= 150 && badRate < 0.12,
      text: H.length < 150 ? T('раздач {a} из {b}', { a: H.length, b: 150 }) : T('ошибок {a}% (нужно меньше 12%)', { a: Math.round(badRate * 100) }) });
    const last300 = H.slice(-300), bb = last300.reduce((a, h) => a + (h.bb ? h.net / h.bb : 0), 0);
    const bb100 = last300.length ? bb / last300.length * 100 : 0;
    s.push({ title: T('За столом: 300 раздач в плюсе (результат ≥ 0 ББ на 100 раздач)'), mode: 'game', ok: H.length >= 300 && bb100 >= 0,
      text: H.length < 300 ? T('раздач {a} из {b}', { a: H.length, b: 300 }) : T('результат {a} ББ/100', { a: bb100.toFixed(1) }) });
    return s;
  }
  function belt(answers, hands, vk, stored) {
    const steps = beltSteps(answers, hands, vk);
    let level = 0;
    while (level < steps.length && steps[level].ok) level++;
    level = Math.max(level, stored || 0);
    return { level, belt: BELTS[level], next: level < steps.length ? steps[level] : null, nextBelt: BELTS[level + 1] || null, steps, BELTS };
  }

  return { plural, explainStart, explainMade, ODDS_TYPES, ODDS_NAMES, genOdds, isStrong, postAction, SPOT_STREETS, genSpot, POS6, POS_RU, genPreflop, handGrid, gridCode, collectMistakes, actionOf, BELTS, belt, beltSteps, ru };
})(PK);
if (typeof module !== 'undefined' && module.exports) module.exports = PKDrills;
/* ===== END POKER DRILLS ===== */
