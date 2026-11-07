const H = require('../lib/harness');
const TS = H.suite('Хранилище и анализ: базовое');
const check = TS.check;
const loadMod = (f, name, env) => name === 'STORE' ? H.loadStore(env) : H.load().PKStats;
const file = n => n;

function fakeLS(quota) {
  const m = new Map();
  return {
    getItem: k => m.has(k) ? m.get(k) : null,
    setItem: (k, v) => { v = String(v); let size = 0; m.forEach((val, key) => { if (key !== k) size += val.length; }); if (quota && size + v.length > quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } m.set(k, v); },
    removeItem: k => m.delete(k), _m: m
  };
}
(async () => {
  // 1. localStorage-бэкенд: запись, перечитывание, лимиты
  {
    const ls = fakeLS();
    const env = { localStorage: ls, addEventListener() {} };
    const St = loadMod(file('store'), 'STORE', env);
    const info = await St.init();
    check('без IndexedDB выбирается localStorage', info.backend === 'localStorage', info.backend);
    for (let i = 0; i < 10; i++) St.add('answers', { variant: 'holdem', mode: 'name', cat: i % 10, chosen: i % 10, ok: true, ms: 1000, ts: 1000 + i });
    St.add('hands', { variant: 'omaha', handNo: 1, net: 50, bb: 20, ts: 5000 });
    St.setMeta('bestStreak', 7);
    St.flush();
    const St2 = loadMod(file('store'), 'STORE', env);
    await St2.init();
    check('данные перечитываются после «перезагрузки»', St2.all('answers').length === 10 && St2.all('hands').length === 1 && St2.getMeta('bestStreak') === 7);
    const g = St2.add('games', { variant: 'holdem', ts: 9000, hands: 0 });
    g.hands = 5; St2.update('games', g); St2.flush();
    check('update меняет запись, а не добавляет', St2.all('games').length === 1 && St2.all('games')[0].hands === 5);
    // экспорт / импорт
    const backup = JSON.parse(JSON.stringify(St2.exportData()));
    check('экспорт содержит все хранилища', backup.format === 'poker-trainer-backup' && backup.answers.length === 10 && backup.hands.length === 1 && backup.games.length === 1);
    const r1 = await St2.importData(backup, 'merge');
    check('повторный импорт не создаёт дублей', r1.answers === 0 && r1.hands === 0 && St2.all('answers').length === 10, JSON.stringify(r1));
    // выборочная очистка
    const removed = await St2.remove('answers', r => r.cat < 5);
    check('выборочная очистка удаляет только нужное', removed === 5 && St2.all('answers').length === 5);
    await St2.clearAll();
    check('полная очистка', St2.all('answers').length === 0 && St2.all('hands').length === 0 && St2.getMeta('bestStreak', 0) === 0);
    const r2 = await St2.importData(backup, 'replace');
    check('импорт с заменой восстанавливает данные', r2.answers === 10 && St2.all('hands').length === 1 && St2.getMeta('bestStreak') === 7, JSON.stringify(r2));
    let bad = false; try { await St2.importData({ foo: 1 }, 'merge'); } catch (e) { bad = true; }
    check('чужой файл при импорте отклоняется', bad);
  }
  // 2. Переполнение localStorage: старые записи удаляются, приложение не падает
  {
    const ls = fakeLS(60000);
    const St = loadMod(file('store'), 'STORE', { localStorage: ls, addEventListener() {} });
    await St.init();
    for (let i = 0; i < 1500; i++) St.add('answers', { variant: 'holdem', mode: 'name', cat: 1, chosen: 2, ok: false, ms: 1234, ts: i + 1, pad: 'x'.repeat(20) });
    St.flush();
    const saved = JSON.parse(ls.getItem('pokerTrainer.v2.answers'));
    check('при переполнении сохраняются самые новые записи', saved.length > 0 && saved.length < 1500 && saved[saved.length - 1].ts === 1500, saved.length);
    check('есть понятное сообщение об ошибке', /мало места/.test(St.info().error || ''));
  }
  // 3. Без localStorage — работа в памяти
  {
    const St = loadMod(file('store'), 'STORE', { addEventListener() {} });
    const info = await St.init();
    check('без хранилищ — режим памяти', info.backend === 'memory');
    St.add('answers', { variant: 'holdem', cat: 1, ok: true, ts: 1 });
    check('в памяти записи доступны', St.all('answers').length === 1);
    St.saveSettings({ theme: 'dark' });
    check('настройки живут в памяти', St.loadSettings({ theme: 'light', hints: true }).theme === 'dark');
  }
  // 4. Перенос из первой версии
  {
    const ls = fakeLS();
    ls.setItem('pokerTrainer.v1', JSON.stringify({ cats: Array.from({ length: 10 }, (_, i) => ({ seen: i, correct: i ? i - 1 : 0 })), bestStreak: 12, speedRecord: { 5: 18, 7: 9 }, hands: 30, handsWon: 11, settings: { theme: 'dark', hints: false, level: 7, tab: 'game', mode: 'best' } }));
    const St = loadMod(file('store'), 'STORE', { localStorage: ls, addEventListener() {} });
    await St.init();
    const st = St.loadSettings({ variant: 'holdem' });
    check('настройки v1 переносятся', st.theme === 'dark' && st.level === 'full' && st.mode === 'best' && st.variant === 'holdem');
    St.migrateV1();
    check('рекорды и счётчики v1 переносятся', St.getMeta('bestStreak') === 12 && St.getMeta('speed')['holdem:5'] === 18 && St.getMeta('legacy').hands === 30);
    check('перенос выполняется один раз', St.migrateV1() === null);
  }

  // 5. Анализ
  const Stats = loadMod(file('stats'), 'STATS');
  const now = Date.UTC(2026, 10, 7, 12);
  const answers = [];
  let ts = now - 5 * 86400000;
  // Первые 60 ответов — 50% верно, следующие 60 — 90%; стрит путается с флешем
  for (let i = 0; i < 120; i++) {
    const good = i < 60 ? i % 2 === 0 : i % 10 !== 0;
    const cat = i % 3 === 0 ? 4 : i % 3 === 1 ? 1 : 6;
    answers.push({ ts: ts += 60000, variant: i % 4 === 0 ? 'omaha' : 'holdem', mode: 'name', cat, chosen: good ? cat : (cat === 4 ? 5 : cat === 1 ? 2 : 3), ok: good, ms: cat === 6 ? 7000 : 2000 });
  }
  for (let k = 0; k < 3; k++) answers.push({ ts: ts += 1000, variant: 'omaha', mode: 'best', omaha: true, cat: 5, chosen: -1, ok: false, rule: false });
  const t = Stats.trainer(answers, { variant: 'all' }, now);
  check('тренажёр: всего и точность', t.n === 123 && Math.abs(t.acc - (30 + 54) / 123) < 1e-9, t.n + ' ' + t.acc);
  check('тренажёр: матрица ошибок (стрит→флеш)', t.conf[4][5] > 0 && t.confList.length > 0);
  check('тренажёр: прогресс считается по окнам', t.progress && t.progress.after > t.progress.before, JSON.stringify(t.progress));
  check('тренажёр: медиана времени по категории', t.cats[6].ms === 7000 && t.cats[4].ms === 2000);
  check('тренажёр: дни — 30 штук, сегодняшние ответы учтены', t.days.length === 30 && t.days.reduce((a, d) => a + d.n, 0) === 123);
  check('тренажёр: фильтр по варианту', Stats.trainer(answers, { variant: 'omaha' }, now).n === 33);
  check('тренажёр: фильтр по периоду', Stats.trainer(answers, { variant: 'all', since: ts - 10 * 60000 }, now).n < 123);
  check('тренажёр: правило омахи', t.rule.n === 3 && t.rule.bad === 3);
  // Игра: «слишком лузовый» игрок
  const hands = [];
  for (let i = 0; i < 60; i++) {
    const vpip = i % 10 < 6, pfr = i % 10 === 0;
    hands.push({ ts: now - 1000 * (60 - i), variant: 'holdem', bb: 20, net: vpip ? (i % 3 === 0 ? 120 : -60) : -10, won: vpip && i % 3 === 0, vpip, pfr, aggrPost: vpip ? 0 : 0, callsPost: vpip ? 2 : 0,
      sawFlop: vpip, showdown: vpip && i % 2 === 0, wonSD: vpip && i % 6 === 0, pos: i % 2 ? 'UTG' : 'BTN', tier: i % 5,
      decisions: [{ s: 'flop', t: 'call', c: i % 4 === 0 ? 'bad' : 'ok', k: i % 4 === 0 ? 'badCall' : null }] });
  }
  const g = Stats.game(hands, [{ variant: 'holdem', ts: now, result: 'bust' }], { variant: 'holdem' });
  check('игра: VPIP/PFR', Math.abs(g.rates.vpip - 0.6) < 1e-9 && Math.abs(g.rates.pfr - 0.1) < 1e-9);
  check('игра: AF = 0 при одних коллах', g.rates.af === 0);
  check('игра: WTSD и W$SD', g.rates.wtsd === g.showdown / g.sawFlop && g.rates.wsd === g.wonSD / g.showdown);
  check('игра: кривая выигрыша в ББ', g.curve.length === 60 && Math.abs(g.curve[59] - g.netBB) < 0.1);
  check('игра: по позициям', g.byPos.UTG.n === 30 && g.byPos.BTN.n === 30);
  const ins = Stats.insights(t, g, 'holdem');
  const titles = ins.map(x => x.title).join(' | ');
  check('выводы: слишком много рук', /слишком много рук/.test(titles), titles);
  check('выводы: пассивность до флопа', /пассивно/.test(titles), titles);
  check('выводы: невыгодные коллы', /Невыгодные коллы/.test(titles), titles);
  check('выводы: путаница стрит/флеш', /Путаете «Стрит» и «Флеш»/.test(titles), titles);
  check('выводы: прогресс в тренажёре', /Прогресс/.test(titles), titles);
  check('выводы: правило омахи', /2 \+ 3/.test(titles), titles);
  check('выводы: плохое — первым', ins[0].lvl === 'bad');
  check('выводы при пустых данных', Stats.insights(Stats.trainer([], {}), Stats.game([], [], {}), 'holdem')[0].title === 'Пока мало данных');
  check('норма статуса', Stats.rateStatus(0.5, [0.2, 0.3]) === 'high' && Stats.rateStatus(0.25, [0.2, 0.3]) === 'ok');

  TS.done();
})();
