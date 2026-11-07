const H = require('../lib/harness');
const TS = H.suite('Тренировки и уровни ботов: базовое');
const check = TS.check;
const { PK, PKDrills, PKStats } = H.load();
// Тесты новых тренировок: шансы, префлоп, мои ошибки, пояса, цель дня, недели, уровни ботов.
const rng = PK.mulberry32(777);
const V = Object.keys(PK.VARIANTS);

// --- Шансы ---
for (const vk of V) for (const type of PKDrills.ODDS_TYPES) {
  let okAll = true, why = '';
  for (let i = 0; i < 25; i++) {
    const t = PKDrills.genOdds(vk, type, rng);
    if (!t) { okAll = false; why = 'null'; break; }
    const o = PK.outsInfo(t.hole, t.board, vk);
    if (o.outs.length !== t.outs.length) { okAll = false; why = 'outs mismatch'; break; }
    if (t.correct < 0 || t.correct >= t.options.length) { okAll = false; why = 'correct idx ' + JSON.stringify(t.options); break; }
    if (new Set(t.options.map(x => x.v)).size !== t.options.length) { okAll = false; why = 'dup options'; break; }
    if (type === 'outs' && t.options[t.correct].v !== o.outs.length) { okAll = false; why = 'outs answer'; break; }
    if (type === 'prob') { const p = Math.round((t.toRiver ? o.pByRiver : o.pNext) * 100); if (t.options[t.correct].v !== p) { okAll = false; why = 'prob'; break; } }
    if (type === 'pot') {
      if (t.board.length !== 4) { okAll = false; why = 'pot board'; break; }
      const need = t.toCall / (t.pot + t.toCall);
      if ((o.pNext >= need) !== (t.correct === 0)) { okAll = false; why = 'pot answer'; break; }
      if (Math.abs(need - o.pNext) < 0.02) { okAll = false; why = 'pot too close'; break; }
    }
    if (t.options.length < 2) { okAll = false; why = 'few options'; break; }
  }
  check('шансы ' + vk + ' ' + type, okAll, why);
}
// Конкретный пример: флеш-дро на флопе в холдеме = 9 аутов
{
  const hole = PK.parseCards('Ah 7h'), board = PK.parseCards('Kh 2h 9c');
  const o = PK.outsInfo(hole, board, 'holdem');
  check('флеш-дро: 9 аутов на флеш', (o.byCat[5] || []).length === 9, JSON.stringify(o.byCat));
  check('флеш-дро + пара туза/семёрки: 15 аутов', o.outs.length === 15, o.outs.length);
  check('15 аутов: шанс к риверу ≈54%', Math.abs(o.pByRiver - 0.541) < 0.01, o.pByRiver);
  const o2 = PK.outsInfo(PK.parseCards('8h 7h'), PK.parseCards('Kh 2h 9c'), 'holdem');
  check('чистое флеш-дро 87: 9 на флеш + 3 на стрит?', (o2.byCat[5] || []).length === 9, JSON.stringify(o2.byCat));
}

// --- Префлоп ---
const A = PK.preflopAdvice;
check('AA на UTG — рейз', A({ tier: 4, pos: 'UTG', facingRaise: false }).action === 'raise');
check('средняя на UTG — фолд', A({ tier: 2, pos: 'UTG', facingRaise: false }).action === 'fold');
check('средняя на баттоне — рейз', A({ tier: 2, pos: 'BTN', facingRaise: false }).action === 'raise');
check('спекулятивная на баттоне — рейз', A({ tier: 1, pos: 'BTN', facingRaise: false }).action === 'raise');
check('спекулятивная на CO — фолд', A({ tier: 1, pos: 'CO', facingRaise: false }).action === 'fold');
check('премиум против рейза — 3-бет', A({ tier: 4, pos: 'MP', facingRaise: true, toCallBB: 3 }).action === 'raise');
check('сильная против рейза 3ББ — колл', A({ tier: 3, pos: 'MP', facingRaise: true, toCallBB: 3 }).action === 'call');
check('сильная против рейза 7ББ — фолд', A({ tier: 3, pos: 'MP', facingRaise: true, toCallBB: 7 }).action === 'fold');
check('средняя на BB против мин-рейза — колл', A({ tier: 2, pos: 'BB', facingRaise: true, toCallBB: 2 }).action === 'call');
check('слабая на BB без рейза — чек', A({ tier: 0, pos: 'BB', facingRaise: false, canCheck: true }).action === 'check');
for (const vk of V) {
  const cnt = {}; let good = true;
  for (let i = 0; i < (vk.indexOf('omaha') === 0 ? 20 : 120); i++) {
    const t = PKDrills.genPreflop(vk, rng);
    if (t.correct < 0) { good = false; break; }
    if (t.pos === 'BB' && !t.facingRaise) { good = false; break; }
    cnt[t.advice.action] = (cnt[t.advice.action] || 0) + 1;
  }
  check('префлоп ' + vk + ': корректные задания', good);
  if (vk === 'holdem') check('префлоп холдем: есть и фолды, и рейзы, и коллы', cnt.fold > 10 && cnt.raise > 10 && cnt.call > 3, JSON.stringify(cnt));
}
const grid = PKDrills.handGrid('holdem');
check('таблица холдема 13×13', grid.rows.length === 13 && grid.rows[0].length === 13);
check('AA — играть с любой позиции', grid.rows[0][0].code === 'AA' && grid.rows[0][0].open === 'any');
check('AKs выше диагонали, AKo ниже', grid.rows[0][1].code === 'AKs' && grid.rows[1][0].code === 'AKo');
check('72o — фолд', grid.rows[12][7].code === '72o' && grid.rows[12][7].open === 'fold', grid.rows[12][7].code);
const sd = PKDrills.handGrid('short');
check('таблица шорт-дека 9×9', sd.rows.length === 9 && sd.rows[0][0].code === 'AA');
check('нет таблицы для омахи', PKDrills.handGrid('omaha') === null);
const playable = grid.rows.flat().filter(c => c.open !== 'fold').length / 169;
check('холдем: разыгрывается 20–50% рук хотя бы с баттона', playable > 0.2 && playable < 0.56, playable);

// --- Мои ошибки ---
const hands = [
  { id: 1, variant: 'holdem', decisions: [{ s: 'flop', t: 'call', c: 'bad', adv: 'fold' }, { s: 'turn', t: 'check', c: 'ok', adv: 'check' }] },
  { id: 2, variant: 'omaha', decisions: [{ s: 'preflop', t: 'call', c: 'soft', adv: 'fold' }] },
  { id: 3, variant: 'holdem', decisions: [{ s: 'river', t: 'fold', c: 'bad' }] } // старая запись без снимка
];
const m = PKDrills.collectMistakes(hands, 'holdem', {});
check('ошибки: берутся только решения со снимком и с ошибкой', m.length === 1 && m[0].key === '1:0', JSON.stringify(m.map(x => x.key)));
check('ошибки: исправленные не показываются', PKDrills.collectMistakes(hands, 'all', { '1:0': true }).length === 1);
check('ошибки: чек = кнопка колл/чек', PKDrills.actionOf('check') === 'call');

// --- Пояса ---
const now = Date.now();
const ans = [];
for (let i = 0; i < 30; i++) ans.push({ ts: now - 1000 * (60 - i), variant: 'holdem', mode: 'name', level: 5, ok: i % 10 !== 0 });
let b = PKDrills.belt(ans, [], 'holdem');
check('пояс: 90% за 30 ответов — жёлтый', b.level === 1 && b.belt.name === 'Жёлтый', b.level);
check('пояс: следующий шаг — вся раздача', b.next && /вся раздача/.test(b.next.title));
check('пояс: сохранённый уровень не понижается', PKDrills.belt([], [], 'holdem', 3).level === 3);
check('пояс: другой вариант считается отдельно', PKDrills.belt(ans, [], 'omaha').level === 0);

// --- Активность и недели ---
const DAY = 86400000;
const act = [];
for (let d = 0; d < 3; d++) for (let k = 0; k < 20; k++) act.push({ ts: now - d * DAY - k * 1000, variant: 'holdem', ok: true });
const a1 = PKStats.activity(act, [], 20, now);
check('цель дня выполнена', a1.done && a1.today === 20, JSON.stringify(a1));
check('серия 3 дня', a1.streak === 3 && a1.bestStreak >= 3, JSON.stringify(a1));
const a2 = PKStats.activity(act.filter(r => r.ts < now - DAY / 2 || false).filter(r => Math.floor((now - r.ts) / DAY) >= 1), [], 20, now);
check('сегодня ещё не выполнено — серия считается со вчера', !a2.done && a2.streak === 2, JSON.stringify(a2));
const wk = PKStats.weekly(act, [{ ts: now, variant: 'holdem', net: 40, bb: 20, decisions: [{ c: 'bad' }, { c: 'ok' }] }], { variant: 'all' }, 8, now);
check('недели: 8 штук, текущая последняя', wk.length === 8 && wk[7].current);
check('недели: текущая неделя содержит раздачу', wk[7].hands === 1 && wk[7].bb100 === 200 && wk[7].badRate === 0.5, JSON.stringify(wk[7]));
const tr = PKStats.trainer([{ ts: now, variant: 'holdem', mode: 'odds', sub: 'outs', cat: -1, ok: true }, { ts: now, variant: 'holdem', mode: 'odds', sub: 'pot', cat: -1, ok: false }, { ts: now, variant: 'holdem', mode: 'name', cat: 3, ok: true }], {});
check('статистика учитывает новые режимы', tr.n === 3 && tr.modes.odds.seen === 2 && tr.modes.odds.subs.pot.acc === 0 && tr.cats[3].seen === 1, JSON.stringify(tr.modes));

// --- Уровни ботов: сильные обыгрывают новичков ---
for (const vk of ['holdem', 'short']) {
  const r = PK.mulberry32(99), chips = { easy: 0, hard: 0, normal: 0 }, styles = ['tight', 'aggro', 'loose'], L = ['easy', 'normal', 'hard'];
  let hangs = 0, broken = 0;
  for (let t = 0; t < 30; t++) {
    const seats = []; for (let k = 0; k < 6; k++) seats.push({ name: 'P' + k, style: styles[(k + Math.floor(k / 3) + Math.floor(t / 3)) % 3], level: L[(k + t) % 3] });
    const g = new PK.Game({ variant: vk, seats, rng: r, startStack: 1000 });
    for (let h = 0; h < 50 && g.players.filter(p => p.stack > 0).length > 1; h++) {
      if (!g.startHand()) break;
      let guard = 0;
      while (!g.done && guard++ < 500) { if (g.awaitingDeal) g.nextStreet(); else g.act(g.toAct, PK.botDecide(g, g.toAct, r, 120)); }
      if (guard >= 500) hangs++;
      if (g.players.reduce((a, p) => a + p.stack, 0) !== 6000) broken++;
    }
    g.players.forEach(p => chips[p.level] += p.stack - 1000);
  }
  check('боты ' + vk + ': без зависаний и потерь фишек', !hangs && !broken);
  check('боты ' + vk + ': сильные в плюсе против новичков', chips.hard > chips.easy, JSON.stringify(chips));
}
// --- Почему рука сильная или слабая ---
const has = (list, sign, re) => list.some(x => x.s === sign && re.test(x.t));
const E = (h, v) => PKDrills.explainStart(PK.parseCards(h), v || 'holdem');
const M = (h, b, v) => PKDrills.explainMade(PK.parseCards(h), PK.parseCards(b), v || 'holdem');
check('K7o: слабый кикер', has(E('Kh 7d'), '-', /кикер/));
check('K7o: разномастные', has(E('Kh 7d'), '-', /Разномастные/));
check('98s: связанные и одномастные', has(E('9s 8s'), '+', /Связанные/) && has(E('9s 8s'), '+', /Одномастные/));
check('QQ: сильная пара', has(E('Qc Qd'), '+', /Пара дам/));
check('44: младшая пара — ценность в сете', has(E('4c 4d'), '~', /сет/));
check('омаха: тройка в руке — минус', has(E('9h 9d 9c 4s', 'omaha'), '-', /Три карты одного ранга/));
check('омаха: двухмастная — плюс', has(E('As Ks Jd Td', 'omaha'), '+', /Двухмастная/));
check('омаха: разномастная — минус', has(E('Kc 8d 7h 2s', 'omaha'), '-', /Разномастная/));
check('шорт-дек: A6 — связанные', has(E('Ah 6h', 'short'), '+', /Связанные/));
check('старшая пара со слабым кикером', has(M('Kh 7d', 'Kc 9s 2h'), '+', /Старшая пара/) && has(M('Kh 7d', 'Kc 9s 2h'), '-', /Кикер слабый/));
check('пара на столе — у всех', has(M('As Kd', '7c 7d 2h'), '-', /лежит на столе/));
check('карманная пара младше стола', has(M('5h 5d', 'Kc 9s 2h'), '~', /младше/));
check('оверкарта', has(M('Ah 7d', 'Kc 9s 2h'), '~', /оверкарт/));
check('флеш-дро распознано', has(M('Ah 7h', 'Kh 2h 9c'), '+', /Флеш-дро: ещё 9/));
check('стрит-дро распознано', has(M('9h 8h', 'Jc Ts 2d'), '+', /стрит-дро/i));
check('сет', has(M('9h 9d', '9c Ks 2d'), '+', /Сет/));
check('опасный стол: 3 карты масти', has(M('Ah Ad', 'Kc 9c 2c'), '-', /одной масти/));
for (const vk of V) { let okE = true; for (let i = 0; i < 40; i++) { const d = PKDrills.genOdds(vk, 'outs', rng); try { const a = PKDrills.explainStart(d.hole, vk), b = PKDrills.explainMade(d.hole, d.board, vk); if (!a.length || !b.length) okE = false; } catch (e) { okE = false; } } check('объяснения без ошибок: ' + vk, okE); }

  TS.done();
