// Статистика: тренажёр, игра, выводы, цель дня, серия, недели — с переходом на летнее время.
process.env.TZ = 'Europe/Berlin'; // в Берлине часы переводят 29.03.2026 и 25.10.2026
const H = require('../lib/harness');
const TS = H.suite('Статистика и анализ');
const { PKStats: S } = H.load();
const DAY = 86400000;
const at = (y, m, d, hh, mm) => new Date(y, m - 1, d, hh || 12, mm || 0).getTime();

TS.group('мелочи');
TS.eq('медиана пустого', S.median([]), null);
TS.eq('медиана нечётного', S.median([3, 1, 2]), 2);
TS.eq('медиана чётного', S.median([4, 1, 2, 3]), 2.5);
TS.eq('ключ дня', S.dayKey(at(2026, 3, 5, 23, 59)), '2026-03-05');
TS.eq('понедельник недели', S.dayKey(S.weekStart(at(2026, 11, 8))), '2026-11-02');
TS.eq('понедельник — сам себе начало', S.dayKey(S.weekStart(at(2026, 11, 2, 0, 1))), '2026-11-02');
TS.eq('воскресенье относится к прошлой неделе', S.dayKey(S.weekStart(at(2026, 11, 1, 23))), '2026-10-26');
TS.eq('неделя перевода часов (весна)', S.dayKey(S.weekStart(at(2026, 3, 29, 23))), '2026-03-23');
TS.eq('после перевода часов', S.dayKey(S.weekStart(at(2026, 3, 30, 0, 30))), '2026-03-30');
TS.eq('норма: ниже/норма/выше', [S.rateStatus(0.1, [0.2, 0.3]), S.rateStatus(0.25, [0.2, 0.3]), S.rateStatus(0.4, [0.2, 0.3]), S.rateStatus(null, [0, 1])], ['low', 'ok', 'high', null]);
TS.check('нормы есть для всех вариантов', ['holdem', 'short', 'omaha', 'omaha5'].every(v => S.normsFor(v).vpip.length === 2) && S.normsFor('нет') === S.NORMS.holdem);

TS.group('цель дня и серия');
const ans = ts => ({ ts, ok: true, mode: 'name', variant: 'holdem' });
const day = (y, m, d, n, hh) => Array.from({ length: n }, (_, i) => ans(at(y, m, d, hh || 10) + i * 1000));
{
  const now = at(2026, 11, 7, 18);
  const A = [].concat(day(2026, 11, 5, 20), day(2026, 11, 6, 25), day(2026, 11, 7, 12));
  const a = S.activity(A, [], 20, now);
  TS.eq('сегодня 12 из 20', [a.today, a.done], [12, false]);
  TS.eq('серия идёт с вчера, пока сегодня не выполнено', a.streak, 2);
  const b = S.activity(A.concat(day(2026, 11, 7, 8, 15)), [], 20, now);
  TS.eq('цель выполнена — серия 3', [b.done, b.streak], [true, 3]);
  const c = S.activity([].concat(day(2026, 11, 3, 30), day(2026, 11, 4, 30), day(2026, 11, 7, 30)), [], 20, now);
  TS.eq('пропуск дня обрывает серию', c.streak, 1);
  TS.eq('лучшая серия', c.bestStreak, 2);
  TS.eq('дней с занятиями', c.activeDays, 3);
  const d = S.activity(day(2026, 11, 7, 3), Array.from({ length: 17 }, (_, i) => ({ ts: at(2026, 11, 7, 9) + i })), 20, now);
  TS.eq('раздачи за столом тоже считаются', [d.today, d.done], [20, true]);
  TS.eq('без цели — серия по дням с занятиями', S.activity(day(2026, 11, 7, 1), [], 0, now).streak, 1);
  TS.eq('пусто', S.activity([], [], 20, now), { today: 0, goal: 20, done: false, streak: 0, bestStreak: 0, activeDays: 0 });
}
{
  // Ночь перевода часов: 29.03 в сутках 23 часа
  const A = [].concat(day(2026, 3, 28, 20, 23), day(2026, 3, 29, 20, 23), day(2026, 3, 30, 20, 0));
  const now = at(2026, 3, 30, 0, 30);
  TS.eq('серия не рвётся в ночь перевода часов (весна)', S.activity(A, [], 20, now).streak, 3);
  const B = [].concat(day(2026, 10, 24, 20, 23), day(2026, 10, 25, 20, 23), day(2026, 10, 26, 20, 23, 30));
  TS.eq('серия не рвётся в ночь перевода часов (осень)', S.activity(B, [], 20, at(2026, 10, 26, 23, 50)).streak, 3);
}

TS.group('по неделям');
{
  const now = at(2026, 11, 7, 18);
  const A = [ans(at(2026, 11, 2)), Object.assign(ans(at(2026, 11, 3)), { ok: false }), ans(at(2026, 10, 27)), Object.assign(ans(at(2026, 11, 4)), { variant: 'omaha' })];
  const Hh = [{ ts: at(2026, 11, 5), variant: 'holdem', net: 40, bb: 20, decisions: [{ c: 'bad' }, { c: 'ok' }] }, { ts: at(2026, 11, 6), variant: 'holdem', net: -20, bb: 20, decisions: [{ c: 'ok' }] }];
  const w = S.weekly(A, Hh, { variant: 'holdem' }, 8, now);
  TS.eq('8 недель', w.length, 8);
  TS.eq('последняя — текущая', [w[7].current, w[6].current], [true, false]);
  TS.eq('подпись текущей недели — понедельник', w[7].label, '02.11');
  TS.eq('ответов на этой неделе (без омахи)', w[7].answers, 2);
  TS.eq('точность 50%', w[7].acc, 0.5);
  TS.eq('прошлая неделя', [w[6].label, w[6].answers, w[6].acc], ['26.10', 1, 1]);
  TS.eq('раздачи и ББ/100', [w[7].hands, w[7].bb100], [2, 50]);
  TS.near('доля ошибок', w[7].badRate, 1 / 3, 1e-9);
  TS.eq('пустая неделя', [w[0].answers, w[0].acc, w[0].hands, w[0].bb100, w[0].badRate], [0, null, 0, null, null]);
  TS.check('все подписи — понедельники', w.every(x => new Date(x.from).getDay() === 1 && new Date(x.from).getHours() === 0), w.map(x => x.label));
  const all = S.weekly(A, Hh, { variant: 'all' }, 8, now);
  TS.eq('все варианты', all[7].answers, 3);
}
{
  // Недели, пересекающие перевод часов
  const now = at(2026, 4, 15);
  const w = S.weekly([ans(at(2026, 3, 29, 23, 30)), ans(at(2026, 3, 30, 0, 30))], [], {}, 6, now);
  TS.eq('подписи недель вокруг перевода часов', w.map(x => x.label), ['09.03', '16.03', '23.03', '30.03', '06.04', '13.04']);
  TS.eq('ответ в воскресенье 23:30 — в своей неделе', w[2].answers, 1);
  TS.eq('ответ в понедельник 00:30 — в новой неделе', w[3].answers, 1);
  const w2 = S.weekly([], [], {}, 8, at(2026, 11, 7));
  TS.check('подписи вокруг осеннего перевода — понедельники', w2.every(x => new Date(x.from).getDay() === 1 && new Date(x.from).getHours() === 0), w2.map(x => x.label));
}

TS.group('тренажёр');
{
  const now = at(2026, 11, 7, 18);
  let ts = now - 2 * DAY;
  const R = (mode, cat, chosen, ok, ms, extra) => Object.assign({ mode, cat, chosen, ok, ms, variant: 'holdem', ts: ts += 60000 }, extra || {});
  const A = [
    R('name', 4, 5, false, 3000), R('name', 4, 5, false, 5000), R('name', 4, 5, false, 4000), R('name', 4, 4, true, 2000),
    R('speed', 1, 1, true, 900), R('best', 6, -1, true, 8000), R('winner', 2, -1, false, 70000),
    R('odds', -1, 1, true, 4000, { sub: 'outs' }), R('odds', -1, 0, false, 4000, { sub: 'pot' }), R('preflop', -1, 0, true, 2000, { sub: 'open' }),
    R('name', 0, 0, true, 1000, { variant: 'omaha' })
  ];
  const t = S.trainer(A, { variant: 'holdem' }, now);
  TS.eq('ответов (без омахи)', t.n, 10);
  TS.eq('верных', t.ok, 5);
  TS.eq('стрит: 4 попытки, 1 верно', [t.cats[4].seen, t.cats[4].ok], [4, 1]);
  TS.eq('режимы «шансы» и «префлоп» не попадают в таблицу комбинаций', t.cats.reduce((a, c) => a + c.seen, 0), 7);
  TS.eq('путаница стрит → флеш (3 раза)', t.confList[0], { actual: 4, chosen: 5, n: 3 });
  TS.eq('медиана времени стрита', t.cats[4].ms, 3500);
  TS.eq('время больше минуты не учитывается', t.modes.winner.ms, null);
  TS.eq('подрежимы шансов', t.modes.odds.subs, { outs: { seen: 1, ok: 1, acc: 1 }, pot: { seen: 1, ok: 0, acc: 0 } });
  TS.eq('лучшая серия', t.bestStreak, 3);
  TS.eq('30 дней в графике, последний — сегодня', [t.days.length, t.days[29].key], [30, '2026-11-07']);
  const utc = k => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8));
  TS.check('дни в графике идут подряд без пропусков', t.days.every((d, i) => i === 0 || utc(d.key) - utc(t.days[i - 1].key) === DAY), t.days.map(d => d.key));
  TS.eq('прогресс только от 30 ответов', t.progress, null);
  const since = S.trainer(A, { variant: 'holdem', since: ts - 3 * 60000 }, now);
  TS.eq('фильтр по периоду', since.n, 3);
  const t2 = S.trainer(S.trainer([], {}, now).n === 0 ? A : [], {}, at(2026, 3, 30, 0, 30));
  TS.check('30 дней подряд и в ночь перевода часов', t2.days.every((d, i) => i === 0 || d.key !== t2.days[i - 1].key) && t2.days[29].key === '2026-03-30' && t2.days[28].key === '2026-03-29', t2.days.slice(-3).map(d => d.key));
  const many = Array.from({ length: 60 }, (_, i) => R('name', 1, 1, i >= 30 || i % 2 === 0, 1000));
  const tp = S.trainer(many, {}, now);
  TS.eq('прогресс: окно 30, было 50% → стало 100%', [tp.progress.window, tp.progress.before, tp.progress.after], [30, 0.5, 1]);
}

TS.group('игра');
{
  const h = (o) => Object.assign({ variant: 'holdem', ts: 1, net: 0, bb: 20, decisions: [] }, o);
  const Hh = [
    h({ ts: 1, net: 100, won: true, vpip: true, pfr: true, sawFlop: true, showdown: true, wonSD: true, pos: 'BTN', tier: 4, aggrPost: 2, callsPost: 1, decisions: [{ s: 'flop', c: 'ok' }] }),
    h({ ts: 2, net: -40, vpip: true, sawFlop: true, showdown: true, pos: 'UTG', tier: 0, callsPost: 2, decisions: [{ s: 'preflop', c: 'bad', k: 'limpWeak' }, { s: 'river', c: 'soft' }] }),
    h({ ts: 3, net: -10, pos: 'SB', tier: 1 }),
    h({ ts: 4, net: 0, pos: 'BB', tier: 2, variant: 'omaha' })
  ];
  const g = S.game(Hh, [{ variant: 'holdem', result: 'win' }, { variant: 'holdem', result: 'bust' }], { variant: 'holdem' });
  TS.eq('раздач', g.n, 3);
  TS.eq('выиграно', g.won, 1);
  TS.eq('итог в ББ', g.netBB, 2.5);
  TS.eq('кривая результата накопительная', g.curve, [5, 3, 2.5]);
  TS.near('VPIP', g.rates.vpip, 2 / 3, 1e-9);
  TS.near('PFR', g.rates.pfr, 1 / 3, 1e-9);
  TS.near('AF = ставки / коллы', g.rates.af, 2 / 3, 1e-9);
  TS.eq('WTSD и W$SD', [g.rates.wtsd, g.rates.wsd], [1, 0.5]);
  TS.near('ББ/100', g.rates.bb100, 250 / 3, 1e-9);
  TS.eq('по позициям', g.byPos.UTG, { n: 1, vpip: 1, netBB: -2 });
  TS.eq('по силе руки', g.byTier[4], { n: 1, vpip: 1, netBB: 5 });
  TS.eq('ошибки по улицам', [g.streets.preflop.bad, g.streets.river.soft, g.streets.flop.ok], [1, 1, 1]);
  TS.eq('виды ошибок', g.kinds, { limpWeak: 1 });
  TS.eq('турниры', g.games, { n: 2, wins: 1, busts: 1 });
  TS.eq('последние раздачи — сначала новые', g.recent.map(x => x.ts), [3, 2, 1]);
  const e = S.game([], [], {});
  TS.eq('пустая статистика', [e.n, e.rates.vpip, e.rates.af, e.rates.bb100], [0, null, null, null]);
  TS.eq('AF без коллов — бесконечность', S.game([h({ aggrPost: 3 })], [], {}).rates.af, Infinity);
}

TS.group('выводы');
{
  const titles = list => list.map(x => x.title);
  TS.eq('без данных — подсказка начать', titles(S.insights(S.trainer([], {}), S.game([], [], {}), 'holdem')), ['Пока мало данных']);
  const now = Date.now();
  const R = (cat, chosen) => ({ mode: 'name', cat, chosen, ok: cat === chosen, ms: 2000, variant: 'holdem', ts: now - 1000 });
  const A = [].concat(Array.from({ length: 8 }, () => R(4, 5)), Array.from({ length: 2 }, () => R(4, 4)));
  const ins = S.insights(S.trainer(A, {}), null, 'holdem');
  TS.check('слабое место: стрит', ins.some(x => x.lvl === 'bad' && x.title.includes('стрит')), titles(ins));
  TS.check('путаница с числом раз в правильной форме', ins.some(x => x.title === 'Путаете «Стрит» и «Флеш» (8 раз)'), titles(ins));
  const A3 = Array.from({ length: 3 }, () => R(6, 3));
  TS.check('«3 раза» — с правильным окончанием', S.insights(S.trainer(A3, {}), null, 'holdem').some(x => x.title.endsWith('(3 раза)')), titles(S.insights(S.trainer(A3, {}), null, 'holdem')));
  TS.check('подсказка для пары путаницы', S.confTip(6, 3).includes('фулл-хаус') && S.confTip(3, 6) === S.confTip(6, 3));
  const good = Array.from({ length: 45 }, (_, i) => R(1, 1));
  TS.check('уверенное узнавание отмечается', S.insights(S.trainer(good, {}), null, 'holdem').some(x => x.lvl === 'good'));
  const loose = Array.from({ length: 40 }, (_, i) => ({ variant: 'holdem', ts: i, net: -20, bb: 20, vpip: true, pfr: false, pos: 'UTG', tier: 0, decisions: [{ s: 'preflop', c: 'bad', k: 'limpWeak' }] }));
  const gi = S.insights(null, S.game(loose, [], {}), 'holdem');
  TS.check('слишком много рук', gi.some(x => x.title.startsWith('Играете слишком много рук')), titles(gi));
  TS.check('пассивно до флопа', gi.some(x => x.title === 'Слишком пассивно до флопа'));
  TS.check('ошибка «слабые руки»: 40 раз', gi.some(x => x.title.endsWith(': 40 раз')), titles(gi));
  TS.check('худшая улица — префлоп', gi.some(x => x.title === 'Больше всего ошибок на префлопе' && x.text.startsWith('40 неудачных решений из 40')), gi.map(x => x.text));
  TS.check('ранние позиции', gi.some(x => x.title === 'Широко играете из ранних позиций'));
  TS.check('сначала важное: плохое выше предупреждений', gi.findIndex(x => x.lvl === 'bad') < gi.findIndex(x => x.lvl === 'warn'));
  const few = S.insights(null, S.game(loose.slice(0, 5), [], {}), 'holdem');
  TS.check('мало раздач — честно сказано', few.some(x => x.title === 'Мало раздач для выводов о стиле'));
  TS.check('во всех текстах нет «undefined» и «NaN»', gi.concat(ins, few).every(x => !/undefined|NaN/.test(x.title + x.text)));
}
TS.done();
