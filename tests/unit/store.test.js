// Хранилище: запись, удаление, лимиты, резервная копия, настройки — без браузера.
const H = require('../lib/harness');
const TS = H.suite('Хранилище: подробно');

(async () => {
  const env = () => ({ localStorage: H.fakeLocalStorage(), addEventListener() {} });

  TS.group('память (нет ни IndexedDB, ни localStorage)');
  {
    const St = H.loadStore({});
    const info = await St.init();
    TS.eq('выбрана память', info.backend, 'memory');
    const r = St.add('answers', { variant: 'holdem', mode: 'name', ok: true });
    TS.check('запись получила id и время', r.id === 1 && r.ts > 0);
    TS.eq('id растут', St.add('answers', { variant: 'holdem' }).id, 2);
    TS.eq('meta: значение по умолчанию', St.getMeta('нет', 42), 42);
    St.setMeta('belts', { holdem: 3 });
    TS.eq('meta: запись', St.getMeta('belts'), { holdem: 3 });
    TS.check('дата создания проставлена', St.getMeta('createdAt') > 0);
    St.update('answers', Object.assign({}, r, { ok: false }));
    TS.eq('update меняет запись', St.all('answers')[0].ok, false);
    TS.eq('update новой записи — добавление', St.update('hands', { variant: 'holdem', net: 5 }).id, 1);
    TS.eq('remove по условию', await St.remove('answers', x => x.id === 2), 1);
    TS.eq('осталась одна', St.all('answers').length, 1);
    TS.eq('remove без совпадений', await St.remove('answers', () => false), 0);
    St.setMeta('bestStreak', 9);
    await St.clearAll(true);
    TS.check('очистка с сохранением рекордов', St.all('answers').length === 0 && St.getMeta('bestStreak') === 9);
    await St.clearAll(false);
    TS.check('полная очистка: рекорды стёрты, дата создания осталась', St.getMeta('bestStreak') === undefined && St.getMeta('createdAt') > 0);
    TS.eq('info', Object.keys(St.info().counts), ['answers', 'hands', 'games']);
  }

  TS.group('localStorage: лимиты');
  {
    const e = env(), St = H.loadStore(e);
    await St.init({ backend: 'localStorage' });
    TS.eq('выбран localStorage', St.info().backend, 'localStorage');
    const L = St.LIMITS.localStorage.answers;
    for (let i = 0; i < L + 25; i++) St.add('answers', { variant: 'holdem', ts: 1000 + i, i });
    TS.eq('хранится не больше лимита', St.all('answers').length, L);
    TS.eq('удалены самые старые', St.all('answers')[0].i, 25);
    St.flush();
    const St2 = H.loadStore(e); await St2.init({ backend: 'localStorage' });
    TS.eq('после перезагрузки — те же записи', St2.all('answers').length, L);
    TS.eq('нумерация продолжается', St2.add('answers', { variant: 'holdem' }).id, L + 26);
  }
  {
    const e = { localStorage: H.fakeLocalStorage(4000), addEventListener() {} }, St = H.loadStore(e);
    await St.init({ backend: 'localStorage' });
    for (let i = 0; i < 200; i++) St.add('hands', { variant: 'holdem', pad: 'x'.repeat(50) });
    St.flush();
    TS.check('место кончилось — работа продолжается, есть предупреждение', St.all('hands').length > 0 && !!St.info().error, St.info().error);
  }

  TS.group('резервная копия');
  {
    const A = H.loadStore(env()); await A.init({ backend: 'memory' });
    const g = A.add('games', { variant: 'holdem', ts: 50 });
    A.add('hands', { variant: 'holdem', handNo: 1, ts: 60, gameId: g.id, net: 10 });
    A.add('hands', { variant: 'holdem', handNo: 2, ts: 70, gameId: g.id, net: -5 });
    for (let i = 0; i < 5; i++) A.add('answers', { variant: 'omaha', mode: 'odds', cat: -1, chosen: i, ts: 100 + i, ok: i % 2 === 0 });
    A.setMeta('bestStreak', 4); A.setMeta('speed', { 'holdem:5': 10 });
    const dump = JSON.parse(JSON.stringify(A.exportData()));
    TS.eq('формат копии', [dump.format, dump.version, dump.answers.length, dump.hands.length, dump.games.length], ['poker-trainer-backup', 2, 5, 2, 1]);
    const B = H.loadStore(env()); await B.init({ backend: 'memory' });
    B.add('games', { variant: 'holdem', ts: 1 });
    B.setMeta('speed', { 'holdem:5': 15, 'omaha:5': 3 });
    const res = await B.importData(dump, 'merge');
    TS.eq('добавлено при слиянии', res, { answers: 5, hands: 2, games: 1 });
    TS.eq('раздачи ссылаются на новую игру', B.all('hands').every(h => h.gameId === B.all('games')[1].id), true);
    TS.eq('рекорды: берётся лучший', [B.getMeta('bestStreak'), B.getMeta('speed')['holdem:5'], B.getMeta('speed')['omaha:5']], [4, 15, 3]);
    const again = await B.importData(dump, 'merge');
    TS.eq('повторный импорт ничего не дублирует', again, { answers: 0, hands: 0, games: 0 });
    const rep = await B.importData(dump, 'replace');
    TS.eq('замена: всё как в копии', [rep.answers, B.all('answers').length, B.all('games').length], [5, 5, 1]);
    TS.check('записи упорядочены по времени', B.all('answers').every((r, i, a) => i === 0 || a[i - 1].ts <= r.ts));
    for (const bad of [null, {}, { format: 'x' }, { format: 'poker-trainer-backup', answers: 'нет', hands: [] }]) {
      let err = null; try { await B.importData(bad, 'merge'); } catch (e) { err = e; }
      TS.check('чужой файл отклоняется: ' + JSON.stringify(bad), err && /резервной копии/.test(err.message));
    }
    TS.eq('после отказа данные целы', B.all('answers').length, 5);
  }

  TS.group('настройки');
  {
    const e = env(), St = H.loadStore(e);
    const def = { theme: null, hints: true, tab: 'trainer', table: null };
    TS.eq('без сохранённых — по умолчанию', St.loadSettings(def), def);
    St.saveSettings(Object.assign({}, def, { tab: 'game', hints: false }));
    TS.eq('сохранённые применяются поверх умолчаний', St.loadSettings(Object.assign({ newField: 7 }, def)), { newField: 7, theme: null, hints: false, tab: 'game', table: null });
    const St2 = H.loadStore({}); // нет localStorage — настройки живут в памяти
    St2.saveSettings({ tab: 'rules' });
    TS.eq('без localStorage настройки держатся в памяти', St2.loadSettings({ tab: 'trainer' }).tab, 'rules');
    const broken = { localStorage: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} } };
    const St3 = H.loadStore(broken);
    TS.noThrow('localStorage запрещён — без исключений', () => { St3.saveSettings({ a: 1 }); St3.loadSettings({}); });
    TS.eq('и выбирается память', (await St3.init()).backend, 'memory');
  }
  TS.done();
})();
