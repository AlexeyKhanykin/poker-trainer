/* ===== POKER STATS: анализ статистики (чистые функции) ===== */
var PKStats = (function () {
  'use strict';
  const I18 = typeof PKI18n !== 'undefined' ? PKI18n : null;
  const T = I18 ? I18.t : (s, v) => (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)) : s);
  const CAT = ['Старшая карта', 'Пара', 'Две пары', 'Тройка', 'Стрит', 'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш', 'Роял-флеш'].map(x => T(x));
  const STREETS = ['preflop', 'flop', 'turn', 'river'];
  const DAY = 86400000;
  const pct = x => Math.round(x * 100) + '%';
  const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  function dayKey(ts) { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function ru(n, one, few, many) { if (I18) return n + ' ' + I18.plural(n, one, few, many); const a = Math.abs(n) % 100, b = a % 10; return n + ' ' + (a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many); }
  // Полдень дня, отстоящего на n календарных дней назад: шаг по календарю, а не по 24 часа,
  // чтобы в ночь перевода часов дни не пропускались и не повторялись.
  function daysBack(ts, n) { const d = new Date(ts); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return d.getTime(); }
  function inFilter(r, f) { return (!f || !f.variant || f.variant === 'all' || r.variant === f.variant) && (!f || !f.since || r.ts >= f.since); }

  // Нормы для 6-max (ориентиры для новичка) — по вариантам
  const NORMS = {
    holdem: { vpip: [0.18, 0.28], pfr: [0.13, 0.22], af: [1.5, 3.5], wtsd: [0.24, 0.33], wsd: [0.48, 0.6] },
    short: { vpip: [0.22, 0.34], pfr: [0.15, 0.26], af: [1.5, 3.5], wtsd: [0.26, 0.36], wsd: [0.48, 0.6] },
    omaha: { vpip: [0.22, 0.35], pfr: [0.12, 0.22], af: [1.3, 3], wtsd: [0.26, 0.36], wsd: [0.48, 0.6] },
    omaha5: { vpip: [0.24, 0.38], pfr: [0.12, 0.22], af: [1.3, 3], wtsd: [0.27, 0.38], wsd: [0.48, 0.6] }
  };
  const normsFor = vk => NORMS[vk] || NORMS.holdem;
  // Режимы, где задание — узнать комбинацию (для таблицы по комбинациям)
  const COMBO_MODES = { name: 1, speed: 1, best: 1, winner: 1 };

  // ---------- Активность: цель дня и серия дней ----------
  // Засчитываются ответы в тренажёре и сыгранные раздачи.
  function activity(answers, hands, goal, now) {
    now = now || Date.now(); goal = goal || 0;
    const per = {};
    answers.forEach(r => { const k = dayKey(r.ts); per[k] = (per[k] || 0) + 1; });
    hands.forEach(r => { const k = dayKey(r.ts); per[k] = (per[k] || 0) + 1; });
    const today = per[dayKey(now)] || 0;
    const need = Math.max(1, goal);
    let streak = 0, i = per[dayKey(now)] >= need ? 0 : 1;
    for (; i < 400; i++) { if ((per[dayKey(daysBack(now, i))] || 0) >= need) streak++; else break; }
    let bestStreak = 0, cur = 0;
    const keys = Object.keys(per).sort();
    if (keys.length) {
      const d = new Date(keys[0] + 'T12:00:00'), end = dayKey(now);
      for (let k = 0; k < 4000; k++, d.setDate(d.getDate() + 1)) {
        const key = dayKey(d.getTime());
        if ((per[key] || 0) >= need) { cur++; bestStreak = Math.max(bestStreak, cur); } else cur = 0;
        if (key >= end) break;
      }
    }
    return { today, goal, done: goal > 0 && today >= goal, streak, bestStreak, activeDays: keys.length };
  }

  // ---------- По неделям (понедельник — начало недели) ----------
  function weekStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); }
  function weekly(answers, hands, f, weeks, now) {
    now = now || Date.now(); weeks = weeks || 8;
    const out = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const from = weekStart(daysBack(now, w * 7)), to = w ? weekStart(daysBack(now, (w - 1) * 7)) : Infinity;
      const A = answers.filter(r => inFilter(r, { variant: f && f.variant }) && r.ts >= from && r.ts < to);
      const H = hands.filter(r => inFilter(r, { variant: f && f.variant }) && r.ts >= from && r.ts < to);
      const bb = H.reduce((a, h) => a + (h.bb ? h.net / h.bb : 0), 0);
      const dec = [].concat.apply([], H.map(h => h.decisions || []));
      const d = new Date(from);
      out.push({ from, label: String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0'), current: w === 0,
        answers: A.length, acc: A.length ? A.filter(r => r.ok).length / A.length : null,
        hands: H.length, bb100: H.length ? bb / H.length * 100 : null, badRate: dec.length ? dec.filter(x => x.c === 'bad').length / dec.length : null });
    }
    return out;
  }

  // ---------- Тренажёр ----------
  function trainer(answers, f, now) {
    now = now || Date.now();
    const A = answers.filter(r => inFilter(r, f)).sort((a, b) => a.ts - b.ts);
    const byCat = Array.from({ length: 10 }, () => ({ seen: 0, ok: 0, ms: [], recent: [] }));
    const byMode = {};
    const conf = Array.from({ length: 10 }, () => new Array(10).fill(0));
    const days = {};
    let ok = 0, streak = 0, best = 0, ruleN = 0, ruleBad = 0;
    for (const r of A) {
      if (r.ok) ok++;
      const m = byMode[r.mode] = byMode[r.mode] || { seen: 0, ok: 0, ms: [], subs: {} };
      m.seen++; if (r.ok) m.ok++; if (r.ms > 0 && r.ms < 60000) m.ms.push(r.ms);
      if (r.sub) { const sb = m.subs[r.sub] = m.subs[r.sub] || { seen: 0, ok: 0 }; sb.seen++; if (r.ok) sb.ok++; }
      const k0 = dayKey(r.ts), d0 = days[k0] = days[k0] || { n: 0, ok: 0 };
      d0.n++; if (r.ok) d0.ok++;
      streak = r.ok ? streak + 1 : 0; if (streak > best) best = streak;
      const c = COMBO_MODES[r.mode] ? byCat[r.cat] : null;
      if (!c) continue;
      c.seen++; if (r.ok) c.ok++;
      if (r.ms > 0 && r.ms < 60000 && (r.mode === 'name' || r.mode === 'speed')) c.ms.push(r.ms);
      c.recent.push(r.ok ? 1 : 0); if (c.recent.length > 20) c.recent.shift();
      if ((r.mode === 'name' || r.mode === 'speed') && !r.ok && r.chosen >= 0 && r.chosen <= 9 && r.chosen !== r.cat) conf[r.cat][r.chosen]++;
      if (r.mode === 'best' && r.omaha) { ruleN++; if (r.rule === false) ruleBad++; }
    }
    const cats = byCat.map((c, i) => ({
      cat: i, name: CAT[i], seen: c.seen, ok: c.ok, acc: c.seen ? c.ok / c.seen : null,
      ms: median(c.ms), recentAcc: c.recent.length ? c.recent.reduce((a, b) => a + b, 0) / c.recent.length : null
    }));
    const modes = {};
    for (const k in byMode) {
      const subs = {};
      for (const sk in byMode[k].subs) { const x = byMode[k].subs[sk]; subs[sk] = { seen: x.seen, ok: x.ok, acc: x.ok / x.seen }; }
      modes[k] = { seen: byMode[k].seen, ok: byMode[k].ok, acc: byMode[k].ok / byMode[k].seen, ms: median(byMode[k].ms), subs: subs };
    }
    const confList = [];
    for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) if (conf[a][b]) confList.push({ actual: a, chosen: b, n: conf[a][b] });
    confList.sort((x, y) => y.n - x.n);
    // Последние 30 дней по дням
    const dayList = [];
    for (let i = 29; i >= 0; i--) {
      const ts = daysBack(now, i), k = dayKey(ts), d = days[k] || { n: 0, ok: 0 };
      dayList.push({ key: k, label: k.slice(8) + '.' + k.slice(5, 7), n: d.n, ok: d.ok, acc: d.n ? d.ok / d.n : null });
    }
    // Прогресс: последние W ответов против предыдущих W
    let progress = null;
    if (A.length >= 30) {
      const W = Math.min(50, Math.floor(A.length / 2));
      const last = A.slice(-W), prev = A.slice(-2 * W, -W);
      const acc = arr => arr.filter(r => r.ok).length / arr.length;
      progress = { window: W, before: acc(prev), after: acc(last) };
    }
    const allMs = cats.filter(c => c.ms != null).map(c => c.ms);
    return { n: A.length, ok: ok, acc: A.length ? ok / A.length : null, cats: cats, modes: modes, conf: conf, confList: confList, days: dayList, bestStreak: best, progress: progress, rule: { n: ruleN, bad: ruleBad }, medianMs: median(allMs) };
  }

  // ---------- Игра ----------
  function game(hands, games, f) {
    const H = hands.filter(r => inFilter(r, f)).sort((a, b) => a.ts - b.ts);
    const out = {
      n: H.length, won: 0, net: 0, netBB: 0, vpip: 0, pfr: 0, aggrPost: 0, callsPost: 0, sawFlop: 0, showdown: 0, wonSD: 0,
      byPos: {}, byTier: Array.from({ length: 5 }, () => ({ n: 0, vpip: 0, netBB: 0 })),
      streets: {}, kinds: {}, curve: [], decisions: 0
    };
    STREETS.forEach(s => out.streets[s] = { bad: 0, soft: 0, ok: 0 });
    let cum = 0;
    for (const h of H) {
      const bbNet = h.bb ? h.net / h.bb : 0;
      if (h.won) out.won++;
      out.net += h.net; out.netBB += bbNet; cum += bbNet;
      out.curve.push(Math.round(cum * 10) / 10);
      if (h.vpip) out.vpip++;
      if (h.pfr) out.pfr++;
      out.aggrPost += h.aggrPost || 0; out.callsPost += h.callsPost || 0;
      if (h.sawFlop) out.sawFlop++;
      if (h.showdown) { out.showdown++; if (h.wonSD) out.wonSD++; }
      const p = out.byPos[h.pos || '?'] = out.byPos[h.pos || '?'] || { n: 0, vpip: 0, netBB: 0 };
      p.n++; if (h.vpip) p.vpip++; p.netBB += bbNet;
      if (h.tier >= 0 && h.tier <= 4) { const t = out.byTier[h.tier]; t.n++; if (h.vpip) t.vpip++; t.netBB += bbNet; }
      for (const d of (h.decisions || [])) {
        out.decisions++;
        if (out.streets[d.s]) out.streets[d.s][d.c] = (out.streets[d.s][d.c] || 0) + 1;
        if (d.k) out.kinds[d.k] = (out.kinds[d.k] || 0) + 1;
      }
    }
    const n = H.length || 1;
    out.rates = {
      vpip: H.length ? out.vpip / n : null,
      pfr: H.length ? out.pfr / n : null,
      af: out.callsPost ? out.aggrPost / out.callsPost : (out.aggrPost ? Infinity : null),
      wtsd: out.sawFlop ? out.showdown / out.sawFlop : null,
      wsd: out.showdown ? out.wonSD / out.showdown : null,
      bb100: H.length ? out.netBB / n * 100 : null,
      winRate: H.length ? out.won / n : null
    };
    const G = (games || []).filter(g => inFilter(g, f));
    out.games = { n: G.length, wins: G.filter(g => g.result === 'win').length, busts: G.filter(g => g.result === 'bust').length };
    out.recent = H.slice(-40).reverse();
    return out;
  }

  // ---------- Выводы: что улучшить ----------
  const CONF_TIPS = {
    '4-5': T('Стрит — пять карт подряд по рангу, флеш — пять карт одной масти. Сначала посчитайте масти, потом проверьте, идут ли ранги подряд.'),
    '2-6': T('В двух парах 2+2 карты, в фулл-хаусе 3+2. Ищите тройку: если она есть вместе с парой — это фулл-хаус.'),
    '3-6': T('Тройка — три одинаковые карты. Если к ней есть ещё и пара — это уже фулл-хаус.'),
    '1-2': T('Посчитайте, сколько разных рангов повторяются: один — пара, два — две пары.'),
    '0-4': T('Проверьте, идут ли пять карт подряд. Не забывайте про туза: A-2-3-4-5 — тоже стрит.'),
    '0-5': T('Пять карт одной масти — это флеш, даже если ранги вразнобой.'),
    '0-1': T('Любые две карты одного ранга — уже пара.'),
    '3-7': T('Тройка — три одинаковые карты, каре — четыре.'),
    '6-7': T('Фулл-хаус — 3+2, каре — 4 одинаковые карты.'),
    '4-8': T('Стрит-флеш — это стрит, где все пять карт одной масти. Проверьте масти у стрита.'),
    '5-8': T('Если пять карт одной масти ещё и идут подряд — это стрит-флеш, а не просто флеш.'),
    '8-9': T('Роял-флеш — только 10-J-Q-K-A одной масти. Любой другой стрит-флеш — просто стрит-флеш.'),
    '2-3': T('Две пары — 2+2 карты, тройка — три одинаковые.'),
    '3-4': T('Тройка — три одинаковые карты, стрит — пять подряд.'),
    '5-6': T('Фулл-хаус — 3+2 одинаковых ранга, флеш — пять карт одной масти.')
  };
  function confTip(a, b) {
    const k = Math.min(a, b) + '-' + Math.max(a, b);
    return CONF_TIPS[k] || T('«{a}» и «{b}» — сравните определения в шпаргалке справа от тренажёра.', { a: CAT[a], b: CAT[b] });
  }
  const KIND_TEXT = {
    badCall: [T('Невыгодные коллы'), T('Вы уравнивали ставки, когда шанс выиграть был меньше нужного по шансам банка. Перед коллом сравнивайте свой шанс с ценой колла — подсказки показывают оба числа.')],
    badFold: [T('Лишние фолды'), T('Вы сбрасывали руки, с которыми колл был бы выгодным. Если ставка маленькая относительно банка, хватает небольшого шанса.')],
    freeFold: [T('Фолд вместо бесплатного чека'), T('Если можно сделать чек, сбрасывать карты не нужно никогда.')],
    missedValue: [T('Упущенная прибыль'), T('С очень сильной рукой вы чекали или коллировали. Ставьте сами — соперники заплатят больше.')],
    weakCall: [T('Колл повышения слабой рукой до флопа'), T('Против повышения играйте только сильные стартовые руки.')],
    foldStrong: [T('Сброс сильных стартовых рук'), T('Сильные стартовые руки стоит разыгрывать, даже против небольшого повышения.')],
    bluff: [T('Блефы'), T('Блеф против нескольких соперников редко срабатывает. Новичку лучше ставить, когда рука действительно сильная.')],
    limpWeak: [T('Вход в банк со слабыми руками'), T('Слабые стартовые руки на дистанции проигрывают — даже дешёвый вход стоит фишек.')]
  };
  function insights(t, g, vk) {
    const out = [];
    const N = normsFor(vk);
    const A_TR = T('Тренажёр'), A_GAME = T('Игра');
    const times = n => ru(n, 'раз', 'раза', 'раз');
    // Тренажёр
    if (t && t.n) {
      const weak = t.cats.filter(c => c.seen >= 6 && c.acc < 0.75).sort((a, b) => a.acc - b.acc);
      if (weak.length) out.push({ lvl: weak[0].acc < 0.55 ? 'bad' : 'warn', area: A_TR, title: T('Слабое место: {list}', { list: weak.map(c => c.name.toLowerCase()).slice(0, 3).join(', ') }),
        text: T('{list}. Эти комбинации будут попадаться в заданиях чаще.', { list: weak.slice(0, 3).map(c => T('{name} — верно {p} из {n}', { name: c.name, p: pct(c.acc), n: c.seen })).join('; ') }) });
      t.confList.filter(x => x.n >= 3).slice(0, 2).forEach(top => {
        const v = { a: CAT[top.actual], b: CAT[top.chosen], n: times(top.n) };
        out.push({ lvl: 'warn', area: A_TR, title: T('Путаете «{a}» и «{b}» ({n})', v), text: T('Вы ответили «{b}», а было «{a}».', v) + ' ' + confTip(top.actual, top.chosen) });
      });
      const slow = t.cats.filter(c => c.ms != null && t.medianMs && c.ms > t.medianMs * 1.6 && c.seen >= 5).sort((a, b) => b.ms - a.ms)[0];
      if (slow) out.push({ lvl: 'info', area: A_TR, title: T('Долго узнаёте: {name}', { name: slow.name.toLowerCase() }), text: T('В среднем {a} с против {b} с у остальных комбинаций. Потренируйте её в скоростном режиме.', { a: (slow.ms / 1000).toFixed(1), b: (t.medianMs / 1000).toFixed(1) }) });
      if (t.rule.n >= 3 && t.rule.bad / t.rule.n >= 0.2) out.push({ lvl: 'bad', area: A_TR, title: T('Нарушаете правило омахи «2 + 3»'), text: T('В {bad} из {n} заданий «Лучшая рука» вы взяли не ровно 2 карты из руки. В омахе всегда ровно 2 карты руки и 3 карты стола.', { bad: t.rule.bad, n: t.rule.n }) });
      if (t.progress) {
        const d = t.progress.after - t.progress.before;
        const v = { w: t.progress.window, a: pct(t.progress.after), b: pct(t.progress.before) };
        if (d >= 0.08) out.push({ lvl: 'good', area: A_TR, title: T('Прогресс: точность выросла'), text: T('За последние {w} ответов — {a}, а до этого было {b}.', v) });
        else if (d <= -0.1) out.push({ lvl: 'warn', area: A_TR, title: T('Точность снизилась'), text: T('Последние {w} ответов — {a} против {b} раньше. Возможно, стоит сбавить темп или вернуться на уровень «5 карт».', v) });
      }
      const M = t.modes || {};
      if (M.odds && M.odds.seen >= 10 && M.odds.acc < 0.7) {
        const sb = M.odds.subs || {}, worst = Object.keys(sb).filter(k => sb[k].seen >= 4).sort((a, b) => sb[a].acc - sb[b].acc)[0];
        const tip = { outs: T('Считайте только карты, которые улучшат именно вашу руку, и не учитывайте карты, которые усилят стол для всех.'), prob: T('Правило 2 и 4: ауты × 2 — шанс на одной карте, ауты × 4 — на флопе до ривера.'), pot: T('Колл выгоден, если ваш шанс больше, чем «колл ÷ (банк + колл)».') };
        const SUB = { outs: T('сколько аутов'), prob: T('шанс улучшиться'), pot: T('выгоден ли колл') };
        out.push({ lvl: 'warn', area: T('Шансы'), title: T('Шансы и ауты: верно {p}', { p: pct(M.odds.acc) }), text: (worst && tip[worst] ? T('Сложнее всего — «{what}».', { what: SUB[worst] }) + ' ' + tip[worst] : tip.prob) });
      }
      if (M.spot && M.spot.seen >= 15 && M.spot.acc < 0.75) {
        const sb = M.spot.subs || {}, worst = Object.keys(sb).filter(k => sb[k].seen >= 5).sort((a, b) => sb[a].acc - sb[b].acc)[0];
        const ST = { flop: T('на флопе'), turn: T('на тёрне'), river: T('на ривере') };
        out.push({ lvl: 'warn', area: T('Решения'), title: T('Ситуации после флопа: верно {p}', { p: pct(M.spot.acc) }),
          text: (worst && ST[worst] ? T('Больше всего ошибок {where}.', { where: ST[worst] }) + ' ' : '') + T('Сравнивайте шанс руки с ценой колла: ставка ÷ (банк + ставка). Колл выгоден, только если шанс больше.') });
      }
      if (M.preflop && M.preflop.seen >= 15 && M.preflop.acc < 0.75) {
        const sb = M.preflop.subs || {};
        const raise = sb.raise && sb.open && sb.raise.acc < sb.open.acc;
        out.push({ lvl: 'warn', area: T('Префлоп'), title: T('Выбор стартовых рук: верно {p}', { p: pct(M.preflop.acc) }), text: raise ? T('Труднее всего решения против повышения. Помните: против рейза играют только сильные руки, премиум — повышают ещё раз.') : T('Сверяйтесь с таблицей стартовых рук: из ранних позиций играют только сильные руки, с баттона — гораздо больше.') });
      }
      if (t.n >= 40 && t.acc >= 0.9) out.push({ lvl: 'good', area: A_TR, title: T('Комбинации узнаёте уверенно'), text: T('Точность {p}. Попробуйте уровень «Вся раздача», режим «Кто выиграл?» или другой вариант покера.', { p: pct(t.acc) }) });
    }
    // Игра
    if (g && g.n) {
      const R = g.rates;
      if (g.n < 25) out.push({ lvl: 'info', area: A_GAME, title: T('Мало раздач для выводов о стиле'), text: T('Сыграно {n}. Показатели VPIP, PFR и другие станут надёжными примерно после 50–100 раздач.', { n: g.n }) });
      else {
        const norm = { a: pct(N.vpip[0]), b: pct(N.vpip[1]), p: pct(R.vpip) };
        if (R.vpip > N.vpip[1] + 0.05) out.push({ lvl: 'bad', area: A_GAME, title: T('Играете слишком много рук (VPIP {p})', norm), text: T('Ориентир для этого варианта — {a}–{b}. Сбрасывайте слабые стартовые руки, особенно в ранней позиции.', norm) });
        else if (R.vpip < N.vpip[0] - 0.05) out.push({ lvl: 'warn', area: A_GAME, title: T('Играете слишком мало рук (VPIP {p})', norm), text: T('Ориентир — {a}–{b}. Блайнды растут, а ожидание только премиум-рук обходится дорого. Шире играйте с баттона и катоффа.', norm) });
        if (R.vpip > 0.05 && R.pfr / R.vpip < 0.4) out.push({ lvl: 'warn', area: A_GAME, title: T('Слишком пассивно до флопа'), text: T('Вы повышаете лишь в {p} рук, в которые входите. Чаще входите в банк рейзом, а не коллом: так вы забираете инициативу.', { p: pct(R.pfr / R.vpip) }) });
        if (R.af != null && g.callsPost + g.aggrPost >= 15) {
          const af = { af: isFinite(R.af) ? R.af.toFixed(1) : '∞', a: N.af[0], b: N.af[1] };
          if (R.af < N.af[0]) out.push({ lvl: 'warn', area: A_GAME, title: T('Мало ставок после флопа (AF {af})', af), text: T('Вы гораздо чаще коллируете, чем ставите. С сильными руками ставьте сами — ориентир AF {a}–{b}.', af) });
          else if (R.af > N.af[1] * 1.5) out.push({ lvl: 'warn', area: A_GAME, title: T('Очень агрессивно (AF {af})', af), text: T('Почти всегда ставите и повышаете. Против коллирующих соперников это часто приводит к потерям.') });
        }
        if (R.wtsd != null && g.sawFlop >= 20) {
          if (R.wtsd > N.wtsd[1] + 0.05) out.push({ lvl: 'warn', area: A_GAME, title: T('Часто доходите до вскрытия (WTSD {p})', { p: pct(R.wtsd) }), text: T('Вы редко сбрасываете после флопа. Если рука не улучшилась, а соперник ставит много, фолд — нормальное решение.') });
        }
        if (R.wsd != null && g.showdown >= 15 && R.wsd < N.wsd[0] - 0.03) out.push({ lvl: 'warn', area: A_GAME, title: T('Проигрываете на вскрытиях (W$SD {p})', { p: pct(R.wsd) }), text: T('Вы приходите на вскрытие со слишком слабыми руками. Чаще сбрасывайте на ривере против больших ставок.') });
      }
      // Ошибки по решениям
      const kinds = Object.keys(g.kinds).filter(k => KIND_TEXT[k]).sort((a, b) => g.kinds[b] - g.kinds[a]);
      if (kinds.length && g.kinds[kinds[0]] >= 2) {
        const k = kinds[0];
        out.push({ lvl: 'bad', area: A_GAME, title: KIND_TEXT[k][0] + ': ' + times(g.kinds[k]), text: KIND_TEXT[k][1] });
      }
      let worst = null;
      STREETS.forEach(s => { const x = g.streets[s], tot = x.bad + x.soft + x.ok; if (tot >= 5) { const r = x.bad / tot; if (!worst || r > worst.r) worst = { s: s, r: r, n: x.bad, tot: tot }; } });
      const SR = { preflop: T('Больше всего ошибок на префлопе'), flop: T('Больше всего ошибок на флопе'), turn: T('Больше всего ошибок на тёрне'), river: T('Больше всего ошибок на ривере') };
      if (worst && worst.r >= 0.2) out.push({ lvl: 'warn', area: A_GAME, title: SR[worst.s], text: T('{n} из {tot} ({p}). Включите подсказки и посмотрите, что они советуют на этой улице.', { n: ru(worst.n, 'неудачное решение', 'неудачных решения', 'неудачных решений'), tot: worst.tot, p: pct(worst.r) }) });
      const early = ['UTG', 'MP'].reduce((a, p) => { const x = g.byPos[p]; if (x) { a.n += x.n; a.v += x.vpip; } return a; }, { n: 0, v: 0 });
      if (early.n >= 15 && early.v / early.n > N.vpip[1]) out.push({ lvl: 'warn', area: A_GAME, title: T('Широко играете из ранних позиций'), text: T('Из UTG и MP вы входите в {p} раздач. Там нужно играть уже, чем на баттоне.', { p: pct(early.v / early.n) }) });
      const lowTier = g.byTier[0].n + g.byTier[1].n, lowVpip = g.byTier[0].vpip + g.byTier[1].vpip;
      if (lowTier >= 15 && lowVpip / lowTier > 0.35) out.push({ lvl: 'warn', area: A_GAME, title: T('Входите в банк со слабыми руками'), text: T('Со слабыми и спекулятивными стартовыми руками вы играете в {p} случаев. Их лучше сбрасывать.', { p: pct(lowVpip / lowTier) }) });
      if (g.n >= 50 && R.bb100 > 5) out.push({ lvl: 'good', area: A_GAME, title: T('Вы в плюсе: {x} ББ на 100 раздач', { x: R.bb100.toFixed(1) }), text: T('Хороший результат против ботов. Попробуйте играть без подсказок.') });
    }
    if (!out.length) out.push({ lvl: 'info', area: '', title: T('Пока мало данных'), text: T('Порешайте задания в тренажёре и сыграйте несколько раздач — здесь появятся выводы о ваших сильных и слабых сторонах.') });
    const order = { bad: 0, warn: 1, info: 2, good: 3 };
    return out.sort((a, b) => order[a.lvl] - order[b.lvl]);
  }
  // Оценка показателя относительно нормы: 'low' | 'ok' | 'high' | null
  function rateStatus(val, range) {
    if (val == null || !range) return null;
    if (val < range[0]) return 'low';
    if (val > range[1]) return 'high';
    return 'ok';
  }

  return { trainer, game, insights, activity, weekly, weekStart, NORMS, normsFor, rateStatus, confTip, dayKey, median, COMBO_MODES };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PKStats;
/* ===== END POKER STATS ===== */
