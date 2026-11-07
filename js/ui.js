/* ===== ИНТЕРФЕЙС ===== */
(function () {
  'use strict';
  // Все тексты — через tr(«русский текст {переменная}», {…}); перевод — в js/i18n-en.js
  const tr = PKI18n.t, LANG = PKI18n.lang;
  const plural = PKI18n.plural; // склонение по-русски, в английском — пара форм из словаря по русской форме «один»
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const fmt = n => PKI18n.num(n);
  const dec = x => (LANG === 'ru' ? String(x).replace('.', ',') : String(x));
  const pct = x => x == null ? '—' : Math.round(x * 100) + '%';
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const C = PK.CAT_NAMES;
  const now = () => (window.performance && performance.now) ? performance.now() : Date.now();

  // ---------- Настройки и вариант ----------
  const SETTINGS_DEF = { theme: null, hints: true, level: 5, tab: 'trainer', mode: 'name', variant: 'holdem', statsVariant: 'all', statsPeriod: 'all', statsView: 'overview', dailyGoal: 20, sound: true, table: null };
  const TABLE_DEF = { opp: 5, stack: 1000, speed: 'normal', level: 'normal', showCards: true };
  let settings = PKStore.loadSettings(SETTINGS_DEF);
  if (settings.level === 7) settings.level = 'full';
  const saveSettings = () => PKStore.saveSettings(settings);
  let VK = PK.VARIANTS[settings.variant] ? settings.variant : 'holdem';
  const V = () => PK.VARIANTS[VK];
  const power = c => V().sd ? PK.POWER_SD[c] : c;
  let dataVer = 0; // растёт при каждой новой записи — для кэшей

  // ---------- Карты ----------
  const suitSvg = s => '<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#suit-' + s + '"/></svg>';
  function cardHTML(c, o) {
    o = o || {};
    const cls = ['card'];
    if (o.size) cls.push(o.size);
    if (o.cls) cls.push.apply(cls, [].concat(o.cls).filter(Boolean));
    const style = o.style ? ' style="' + o.style + '"' : '';
    if (o.slot) return '<div class="card ' + (o.size || '') + ' slot"></div>';
    if (o.back || c == null) { cls.push('back'); return '<div class="' + cls.join(' ') + '"' + style + '></div>'; }
    const r = PK.rankOf(c), s = PK.suitOf(c), R = PK.RANK_SYM[r];
    cls.push(s === 1 || s === 2 ? 'red' : 'black');
    return '<div class="' + cls.join(' ') + '" data-c="' + c + '"' + (o.attrs || '') + style + ' title="' + PK.R_NOM[r] + ', ' + PK.SUIT_NAMES[s] + (o.tip ? ' — ' + o.tip : '') + '">' +
      '<span class="cr"><b>' + R + '</b>' + suitSvg(s) + '</span><span class="cm">' + suitSvg(s) + '</span><span class="cr br"><b>' + R + '</b>' + suitSvg(s) + '</span>' +
      (o.key ? '<span class="keyhint">' + o.key + '</span>' : '') + '</div>';
  }
  const ctext = c => { const s = PK.suitOf(c); return '<span class="ct' + (s === 1 || s === 2 ? ' red' : '') + '">' + PK.RANK_SYM[PK.rankOf(c)] + PK.SUIT_SYM[s] + '︎</span>'; };
  const ctexts = cs => cs.map(ctext).join(' ');
  const colorize = t => esc(t).replace(/(10|[2-9JQKA])([♠♥♦♣])/g, (m, r, s) => '<span class="ct' + (s === '♥' || s === '♦' ? ' red' : '') + '">' + r + s + '︎</span>');
  const reasonsHTML = (list, max) => !list || !list.length ? '' : '<ul class="why">' + list.slice(0, max || 6).map(x => '<li class="' + (x.s === '+' ? 'wp' : x.s === '-' ? 'wm' : 'wn') + '">' + esc(x.t) + '</li>').join('') + '</ul>';
  const miniCards = cs => '<span class="cards-inline">' + cs.map(c => cardHTML(c, { size: 'xs' })).join('') + '</span>';
  function fillInlineCards(root) {
    $$('[data-cards]', root).forEach(el => { el.innerHTML = PK.parseCards(el.dataset.cards).map(c => cardHTML(c, { size: 'xs' })).join(''); });
  }

  // ---------- Тема ----------
  const ICON_SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const ICON_MOON = '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    $('#theme-btn').innerHTML = t === 'dark' ? ICON_SUN : ICON_MOON;
  }
  function initTheme() {
    let t = settings.theme;
    if (t !== 'dark' && t !== 'light') {
      try { t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { t = 'light'; }
    }
    applyTheme(t);
    $('#theme-btn').onclick = () => {
      const n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      settings.theme = n; saveSettings(); applyTheme(n);
    };
  }

  // ---------- Вкладки ----------
  let activeTab = 'trainer';
  function showTab(t) {
    if (activeTab === 'trainer' && t !== 'trainer') speedAbort();
    activeTab = t;
    $$('.tab-btn').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + t));
    settings.tab = t; saveSettings();
    document.body.dataset.screen = t; // CSS: список «Вариант» в шапке — только в тренажёре и за столом
    if (t === 'stats') renderStats();
    if (t === 'trainer') {
      renderCheat(); renderTrainerChrome();
      // «Мои ошибки»: после игры за столом могли появиться новые задания
      if (T.mode === 'review' && T.task && T.task.empty && mistakesList().length) newTask();
      else if (T.mode === 'speed') renderTask();
    }
    if (t === 'game' && !G.game) newGame();
    window.scrollTo(0, 0);
  }

  // ---------- Выбор варианта ----------
  function renderVariantSelect() {
    $('#variant-select').innerHTML = Object.keys(PK.VARIANTS).map(k => '<option value="' + k + '"' + (k === VK ? ' selected' : '') + '>' + PK.VARIANTS[k].short + '</option>').join('');
    $('#variant-select').title = V().name + ': ' + V().blurb;
  }
  function setVariant(vk) {
    if (vk === VK || !PK.VARIANTS[vk]) return;
    const g = G.game;
    if (g && !G.over && g.handNo > 1 && !confirm(tr('Сменить вариант на «') + PK.VARIANTS[vk].name + tr('»? Текущая партия за столом будет завершена.'))) { renderVariantSelect(); return; }
    speedAbort();
    endGameRecord('abandoned');
    VK = vk; settings.variant = vk; saveSettings();
    renderVariantSelect();
    G.game = null; clearTimeout(G.timer);
    T.sp.state = 'idle';
    $('#feedback').innerHTML = '';
    renderTrainerChrome(); renderCheat();
    if (T.mode === 'speed') { T.task = null; renderTask(); } else newTask();
    renderRulesVariant(); renderHandChart();
    if (activeTab === 'game') newGame();
    if (activeTab === 'stats') renderStats();
  }

  // ======================================================================
  // ТРЕНАЖЁР
  // ======================================================================
  const MODES = {
    name: { title: tr('Назови комбинацию'), sub: tr('узнать комбинацию') },
    best: { title: tr('Лучшая рука'), sub: tr('собрать пятёрку') },
    winner: { title: tr('Кто выиграл?'), sub: tr('сравнить две руки') },
    speed: { title: tr('Скоростной'), sub: tr('60 секунд на время') },
    odds: { title: tr('Шансы и ауты'), sub: tr('посчитать шансы') },
    preflop: { title: tr('Играть или сбросить'), sub: tr('стартовые руки') },
    spot: { title: tr('Ситуации'), sub: tr('решения после флопа') },
    review: { title: tr('Мои ошибки'), sub: tr('из ваших раздач') }
  };
  const DRILL = { odds: 1, preflop: 1, spot: 1, review: 1 };
  const SPEED_MS = 60000;
  const keyForIdx = i => i < 9 ? String(i + 1) : '0';
  const idxForKey = k => k === '0' ? 9 : (k >= '1' && k <= '9' ? +k - 1 : -1);
  const catForKey = k => { const i = idxForKey(k); return i >= 0 ? V().order[i] : -1; };
  const T = {
    mode: 'name', level: 5, task: null, answered: false, chosen: null, sel: [], fresh: true, shownAt: 0,
    session: { n: 0, ok: 0, streak: 0 },
    sp: { state: 'idle', score: 0, streak: 0, best: 0, n: 0, end: 0, timer: null, wait: null, locked: false, next: null }
  };
  const fullLabel = () => tr('Вся раздача (') + V().hole + '+5)';
  const isFull = () => T.level !== 5;

  function modeDesc() {
    const om = V().omaha;
    switch (T.mode) {
      case 'name': return !isFull() ? tr('Посмотрите на 5 карт и выберите название комбинации.<span class="keys"> Клавиши <kbd>1</kbd>–<kbd>9</kbd> и <kbd>0</kbd>.</span>')
        : om ? tr('Найдите лучшую комбинацию: <b>ровно 2</b> карты из руки + <b>3</b> со стола.<span class="keys"> Клавиши <kbd>1</kbd>–<kbd>9</kbd>, <kbd>0</kbd>.</span>')
          : tr('Найдите лучшую комбинацию из 7 карт: 2 ваших и 5 на столе.<span class="keys"> Клавиши <kbd>1</kbd>–<kbd>9</kbd> и <kbd>0</kbd>.</span>');
      case 'best': return om ? tr('Выберите 5 карт: <b>ровно 2</b> из руки и <b>3</b> со стола, дающие самую сильную комбинацию.<span class="keys"> Клик или клавиши, затем <kbd>Enter</kbd>.</span>')
        : tr('Выберите 5 из 7 карт, дающих самую сильную комбинацию.<span class="keys"> Клик по карте или клавиши <kbd>1</kbd>–<kbd>7</kbd>, затем <kbd>Enter</kbd>.</span>');
      case 'winner': return tr('Две руки и общий стол. Кто сильнее — или ничья?<span class="keys"> Клавиши <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd>.</span>');
      case 'odds': return tr('Посчитайте ауты, шанс собрать руку и выгоден ли колл.<span class="keys"> Ответ — клавишами <kbd>1</kbd>–<kbd>4</kbd>.</span>');
      case 'preflop': return tr('Вам раздали карты. Играть или сбросить — с учётом позиции и того, повышал ли кто-то перед вами.<span class="keys"> Клавиши <kbd>1</kbd>–<kbd>3</kbd>.</span>');
      case 'spot': return tr('Флоп, тёрн или ривер: соперник ставит. Сбросить, уравнять или повысить — по силе руки и цене колла.<span class="keys"> Клавиши <kbd>1</kbd>–<kbd>3</kbd>.</span>');
      case 'review': return tr('Ситуации из ваших раздач, где вы ошиблись. Решите заново: верный ответ убирает ошибку из списка.<span class="keys"> Клавиши <kbd>1</kbd>–<kbd>3</kbd>.</span>');
      default: return tr('Назовите как можно больше комбинаций за 60 секунд. Ошибка обнуляет серию.<span class="keys"> Клавиши <kbd>1</kbd>–<kbd>9</kbd>, <kbd>0</kbd>.</span>');
    }
  }
  function renderTrainerChrome() {
    $('#mode-tabs').innerHTML = Object.keys(MODES).map(k =>
      '<button class="mode-tab' + (k === T.mode ? ' on' : '') + '" data-mode="' + k + '">' + MODES[k].title + '<small>' + MODES[k].sub + '</small></button>').join('') +
      '<span class="variant-chip" title="' + esc(V().blurb) + '">' + V().name + '</span>';
    $('#mode-desc').innerHTML = modeDesc();
    const lv = T.mode === 'name' || T.mode === 'speed';
    $('#level-ctl').innerHTML = lv ? tr('<div class="seg" title="Уровень сложности"><button data-level="5" class="') + (!isFull() ? 'on' : '') + tr('">5 карт</button><button data-level="full" class="') + (isFull() ? 'on' : '') + '">' + fullLabel() + '</button></div>' : '';
    renderSession();
    renderFocusNote();
    renderProgress();
  }
  function renderSession() {
    const s = T.session;
    $('#session').innerHTML = tr('Решено <b>') + s.n + tr('</b> · верно <b>') + (s.n ? pct(s.ok / s.n) : '—') + tr('</b> · серия <b>') + s.streak + tr('</b> · рекорд <b>') + PKStore.getMeta('bestStreak', 0) + '</b>';
  }
  // Сводка по категориям для текущего варианта (с учётом счётчиков из первой версии)
  let aggCache = { key: '', val: null };
  function catAgg(vk) {
    const key = vk + '|' + dataVer;
    if (aggCache.key === key) return aggCache.val;
    const res = Array.from({ length: 10 }, () => ({ seen: 0, correct: 0 }));
    for (const r of PKStore.all('answers')) if (r.variant === vk && res[r.cat]) { res[r.cat].seen++; if (r.ok) res[r.cat].correct++; }
    const L = vk === 'holdem' && PKStore.getMeta('legacy');
    if (L && L.cats) L.cats.forEach((c, i) => { if (res[i]) { res[i].seen += c.seen; res[i].correct += c.correct; } });
    aggCache = { key, val: res };
    return res;
  }
  function recentWrong(vk) {
    const A = PKStore.all('answers'), out = [];
    for (let i = A.length - 1; i >= 0 && out.length < 12; i--) if (A[i].variant === vk && !A[i].ok && A[i].cat >= 0) out.push(A[i].cat);
    return out;
  }
  function catWeights() {
    const agg = catAgg(VK), recent = recentWrong(VK);
    return agg.map((s, c) => {
      const err = (s.seen - s.correct + 1) / (s.seen + 3);
      let w = 0.35 + err * 2.5 + recent.filter(x => x === c).length * 0.6 + (s.seen < 3 ? 0.4 : 0);
      if (c === 9) w *= 0.5;
      return w;
    });
  }
  function pickCat() {
    const w = catWeights(), sum = w.reduce((a, b) => a + b, 0);
    let x = Math.random() * sum;
    for (let c = 0; c < 10; c++) { x -= w[c]; if (x <= 0) return c; }
    return 1;
  }
  function renderFocusNote() {
    const weak = catAgg(VK).map((s, c) => ({ c, s, acc: s.seen ? s.correct / s.seen : 1 }))
      .filter(x => x.s.seen >= 3 && x.acc < 0.75).sort((a, b) => a.acc - b.acc).slice(0, 3);
    $('#focus-note').innerHTML = weak.length
      ? tr('Чаще показываю то, где вы ошибаетесь (') + V().short + '): ' + weak.map(x => '<b>' + C[x.c] + tr('</b> (верно ') + pct(x.acc) + ')').join(', ') + tr('. Подробный разбор — во вкладке «Статистика».')
      : tr('Задания подстраиваются под вас: чем чаще ошибка в какой-то комбинации, тем чаще она будет попадаться. Все ответы сохраняются для анализа во вкладке «Статистика».');
  }
  function recordAnswer(rec) {
    rec.variant = VK;
    rec.level = rec.mode === 'name' || rec.mode === 'speed' ? (isFull() ? 'full' : 5) : 'full';
    rec.ms = Math.round(now() - T.shownAt);
    if (V().omaha) rec.omaha = true;
    if (rec.cat == null) rec.cat = -1;
    PKStore.add('answers', rec);
    dataVer++;
    T.session.n++; if (rec.ok) T.session.ok++;
    T.session.streak = rec.ok ? T.session.streak + 1 : 0;
    if (T.session.streak > PKStore.getMeta('bestStreak', 0)) PKStore.setMeta('bestStreak', T.session.streak);
    renderSession(); renderFocusNote(); renderCheat(rec.ok ? null : rec.cat);
    if (rec.mode !== 'speed') PKSound.play(rec.ok ? 'ok' : 'bad');
    renderProgress(true);
  }

  function genWinner() {
    const target = pickCat(), wantSame = Math.random() < 0.55, H = V().hole;
    const deck = PK.deckFor(VK);
    let fallback = null;
    for (let t = 0; t < 250; t++) {
      const d = PK.genDeal(VK, target);
      const used = d.hole.concat(d.board);
      const evA = PK.bestHand(VK, d.hole, d.board).ev;
      const rest = PK.shuffle(deck.filter(c => used.indexOf(c) < 0));
      let hB = null, evB = null;
      for (let k = 0; k + H <= rest.length && k < 40 * H; k += H) {
        const h = rest.slice(k, k + H), ev = PK.bestHand(VK, h, d.board).ev;
        if (power(ev.cat) > power(target)) continue;
        if (!hB) { hB = h; evB = ev; }
        if (!wantSame || ev.cat === evA.cat) { hB = h; evB = ev; break; }
      }
      if (!hB) continue;
      const task = { board: d.board, hands: [d.hole, hB], evs: [evA, evB], cat: target };
      if (!fallback) fallback = task;
      if (wantSame && evA.cat !== evB.cat && t < 200) continue;
      if (Math.random() < 0.5) { task.hands.reverse(); task.evs.reverse(); }
      return task;
    }
    return fallback;
  }
  function newTask() {
    T.answered = false; T.chosen = null; T.sel = []; T.fresh = true;
    if (T.mode === 'winner') T.task = genWinner();
    else if (DRILL[T.mode]) T.task = genDrill(T.mode);
    else {
      const cat = pickCat();
      if ((T.mode === 'name' || T.mode === 'speed') && !isFull()) {
        const cards = PK.genFive(VK, cat);
        T.task = { cat, cards, hole: null, board: null, best: PK.bestFive(cards, V().sd) };
      } else {
        const d = PK.genDeal(VK, cat);
        T.task = { cat, hole: d.hole, board: d.board, cards: d.hole.concat(d.board), best: PK.bestHand(VK, d.hole, d.board) };
      }
    }
    if (T.mode !== 'speed') $('#feedback').innerHTML = '';
    renderTask();
    T.shownAt = now();
  }

  const dealStyle = i => T.fresh ? 'animation-delay:' + (i * 50) + 'ms' : '';
  const dealCls = () => T.fresh ? 'deal' : '';
  function holeUsage(hole, best) {
    const used = hole.filter(c => best.indexOf(c) >= 0);
    if (V().omaha) return tr('Из руки взяты ') + ctexts(used) + tr(' — в омахе всегда ровно две карты руки.');
    return used.length === 2 ? tr('Обе ваши карты входят в комбинацию.') : used.length === 1 ? tr('Из ваших карт в комбинацию входит одна.')
      : tr('Ни одна из ваших карт не нужна: лучшая пятёрка целиком лежит на столе («вы играете стол»).');
  }
  function dealLayout(hole, board, cardOpts) {
    const hs = hole.length > 2 ? 'md' : '';
    const one = (c, i, size) => { const o = cardOpts(c, i); if (size && !o.size) o.size = size; return cardHTML(c, o); };
    return tr('<div><div class="grp-label">Ваши карты') + (V().omaha ? tr(' · нужно ровно 2') : '') + '</div><div class="cards-row">' + hole.map((c, i) => one(c, i, hs)).join('') + '</div></div>' +
      tr('<div class="felt-strip"><div class="grp-label">Стол') + (V().omaha ? tr(' · нужно ровно 3') : '') + '</div><div class="cards-row">' + board.map((c, i) => one(c, i + hole.length)).join('') + '</div></div>';
  }
  function answersHTML() {
    const t = T.task;
    let h = '<div class="answers">';
    V().order.forEach((c, i) => {
      let cls = 'ans';
      if (T.answered) { if (c === t.cat) cls += ' correct'; else if (c === T.chosen) cls += ' chosen-wrong'; else cls += ' faded'; }
      h += '<button class="' + cls + '" data-cat="' + c + '"' + (T.answered ? ' disabled' : '') + '><kbd>' + keyForIdx(i) + '</kbd>' + C[c] + '</button>';
    });
    return h + '</div>';
  }
  function nameCardsHTML() {
    const t = T.task, best = t.best.cards;
    if (!t.hole) return '<div class="task-cards"><div class="cards-row">' + t.cards.map((c, i) => cardHTML(c, { size: 'lg', cls: dealCls(), style: dealStyle(i) })).join('') + '</div></div>';
    return '<div class="task-cards">' + dealLayout(t.hole, t.board, (c, i) => ({
      cls: [dealCls(), T.answered ? (best.indexOf(c) >= 0 ? 'good' : 'dim') : ''], style: dealStyle(i)
    })) + '</div>';
  }
  const nextRow = () => tr('<div class="next-row"><button class="btn primary" id="next-btn">Следующее задание <kbd>Enter</kbd></button><span class="muted keys">или пробел</span></div>');

  function renderTask() {
    const el = $('#task'), t = T.task;
    if (T.mode === 'speed') { renderSpeed(); T.fresh = false; return; }
    if (!t) return;
    if (DRILL[T.mode]) { el.innerHTML = drillHTML(); T.fresh = false; return; }
    if (T.mode === 'name') {
      el.innerHTML = tr('<div class="prompt">Какая это комбинация?') + (t.hole ? '<small>' + (V().omaha ? tr('Ровно 2 карты из руки и 3 со стола.') : tr('Ищите лучшие 5 карт из 7.')) + '</small>' : '') + '</div>' + nameCardsHTML() + answersHTML();
    } else if (T.mode === 'best') {
      const best = t.best.cards, userBad = T.answered && !T.ok;
      el.innerHTML = tr('<div class="prompt">Выберите 5 карт, которые дают лучшую комбинацию<small>') +
        (V().omaha ? tr('Омаха: ровно 2 карты из руки и ровно 3 со стола.') : tr('Можно брать любые карты: обе свои, одну или ни одной.')) + '</small></div>' +
        '<div class="task-cards" style="padding-bottom:22px">' + dealLayout(t.hole, t.board, (c, i) => {
          const sel = T.sel.indexOf(c) >= 0, cls = [dealCls()];
          if (!T.answered) { cls.push('pick'); if (sel) cls.push('sel'); }
          else if (best.indexOf(c) >= 0 && userBad) cls.push('good');
          else if (T.ok && sel) cls.push('good');
          else if (userBad && sel) cls.push('wrong');
          else cls.push('dim');
          return { cls, style: dealStyle(i), key: T.answered ? '' : keyForIdx(i), attrs: ' data-i="' + i + '"' };
        }) + '</div>' +
        (T.answered ? '' : '<div class="next-row"><button class="btn primary" id="check-btn"' + (T.sel.length === 5 ? '' : ' disabled') + tr('>Проверить <kbd>Enter</kbd></button>') +
          tr('<span class="muted">Выбрано <b>') + T.sel.length + tr('</b> из 5') + (V().omaha ? tr(' (из руки: <b>') + T.sel.filter(c => t.hole.indexOf(c) >= 0).length + tr('</b> из 2)') : '') + '</span>' +
          (T.sel.length ? tr('<button class="btn small" id="clear-sel">Сбросить выбор</button>') : '') + '</div>');
    } else if (T.mode === 'winner') {
      const hs = V().hole >= 4 ? 'sm' : 'md';
      const pl = k => {
        const won = T.answered && (T.correctW === k + 1 || T.correctW === 0);
        return '<div class="wplayer' + (won ? ' won' : '') + tr('"><h4>Игрок ') + (k + 1) + '</h4><div class="cards-row">' +
          t.hands[k].map((c, i) => cardHTML(c, { size: hs, cls: dealCls(), style: dealStyle(k * 7 + i) })).join('') + '</div>' +
          (T.answered ? '<div class="wdesc">' + PK.describe(t.evs[k]) + '</div><div class="best5">' + PK.bestHand(VK, t.hands[k], t.board).cards.map(c => cardHTML(c, { size: 'xs' })).join('') + '</div>' : '<div class="wdesc muted">?</div>') + '</div>';
      };
      const btn = (w, key, label) => {
        let cls = 'ans';
        if (T.answered) { if (w === T.correctW) cls += ' correct'; else if (w === T.chosen) cls += ' chosen-wrong'; else cls += ' faded'; }
        return '<button class="' + cls + '" data-w="' + w + '"' + (T.answered ? ' disabled' : '') + '><kbd>' + key + '</kbd>' + label + '</button>';
      };
      el.innerHTML = tr('<div class="prompt">Кто выиграл банк?<small>') + (V().omaha ? tr('У каждого {n}, стол общий. Каждый использует ровно 2 свои и 3 со стола.', { n: V().hole + ' ' + plural(V().hole, 'карта', 'карты', 'карт') }) : tr('У каждого игрока 2 карты, стол общий. Лучшие 5 из 7 у каждого.')) + '</small></div>' +
        '<div class="winner-layout">' + pl(0) + tr('<div class="felt-strip"><div class="grp-label">Стол</div><div class="cards-row">') +
        t.board.map((c, i) => cardHTML(c, { size: 'md', cls: dealCls(), style: dealStyle(2 + i) })).join('') + '</div></div>' + pl(1) + '</div>' +
        '<div class="winner-btns">' + btn(1, '1', tr('Игрок 1')) + btn(2, '2', tr('Игрок 2')) + btn(0, '3', tr('Ничья')) + '</div>';
    }
    T.fresh = false;
  }

  function feedback(ok, title, html) {
    $('#feedback').innerHTML = '<div class="fb ' + (ok ? 'ok' : 'bad') + '"><div class="fb-title">' + (ok ? '✓ ' : '✗ ') + title + '</div>' + html + '</div>' + nextRow();
  }
  function answerName(cat) {
    if (T.answered || !T.task) return;
    const t = T.task, ok = cat === t.cat;
    T.answered = true; T.chosen = cat; T.ok = ok;
    recordAnswer({ mode: 'name', cat: t.cat, chosen: cat, ok });
    renderTask();
    let html = tr('<p>Это <b>') + C[t.cat] + '</b>: ' + PK.lc(PK.describe(t.best.ev)) + '. ' + PK.catDef(t.cat, VK) + '</p>';
    if (!ok) html += tr('<p>Вы выбрали «') + C[cat] + '». ' + C[cat] + ' — ' + PK.lc(PK.catDef(cat, VK)) + '</p>';
    if (t.hole) html += tr('<p>Лучшие 5 карт подсвечены: ') + ctexts(t.best.cards) + '. ' + PK.howToPick(t.cat, VK) + ' ' + holeUsage(t.hole, t.best.cards) + '</p>';
    feedback(ok, ok ? tr('Верно!') : tr('Не совсем'), html);
  }
  function toggleBest(i) {
    if (T.answered || !T.task || T.task.cards[i] == null) return;
    const c = T.task.cards[i], k = T.sel.indexOf(c);
    if (k >= 0) T.sel.splice(k, 1);
    else if (T.sel.length < 5) T.sel.push(c);
    renderTask();
  }
  function checkBest() {
    if (T.answered || !T.task || T.sel.length !== 5) return;
    const t = T.task, r = PK.checkSelection(VK, t.hole, t.board, T.sel);
    T.answered = true; T.ok = r.ok;
    const u = r.rule ? PK.evaluate(T.sel, V().sd) : null;
    recordAnswer({ mode: 'best', cat: t.cat, chosen: u ? u.cat : -1, ok: r.ok, rule: r.rule });
    renderTask();
    const b = t.best.ev;
    let html = tr('<p>Лучшая комбинация: <b>') + PK.describe(b) + '</b> — ' + ctexts(t.best.cards) + '.</p><p>' + PK.howToPick(b.cat, VK) + ' ' + holeUsage(t.hole, t.best.cards) + '</p>';
    if (!r.rule) {
      html = tr('<p><b>Нарушено главное правило омахи:</b> вы взяли из руки {n}.', { n: r.fromHole + ' ' + plural(r.fromHole, 'карта', 'карты', 'карт') }) + tr(' В омахе в комбинацию всегда входят ровно 2 карты руки и ровно 3 карты стола — даже если на столе лежит готовый флеш или стрит.</p>') + html;
    } else if (r.ok) {
      if (!t.best.cards.every(c => T.sel.indexOf(c) >= 0)) html += tr('<p class="muted">Вы выбрали другие карты, но той же силы — это тоже правильный ответ.</p>');
    } else {
      html += tr('<p>Ваша пятёрка: ') + PK.lc(PK.describe(u)) + '. ';
      if (u.cat !== b.cat) html += C[b.cat] + tr(' сильнее, чем ') + PK.lc(C[u.cat]) + (V().sd ? tr(' (в шорт-деке)') : '') + '.';
      else { const i = PK.diffIndex(b, u); html += tr('Комбинация та же, но в лучшей пятёрке старше ') + (i === 0 ? tr('сама комбинация') : tr('кикер')) + ': ' + PK.RANK_SYM[b.ranks[i]] + tr(' вместо ') + PK.RANK_SYM[u.ranks[i]] + '.'; }
      html += tr(' Зелёным подсвечены правильные карты, красным — лишние из вашего выбора.</p>');
    }
    feedback(r.ok, r.ok ? tr('Верно!') : !r.rule ? tr('Правило «2 + 3»') : tr('Можно лучше'), html);
  }
  function answerWinner(w) {
    if (T.answered || !T.task) return;
    const t = T.task, ex = PK.explainCompare(t.evs[0], t.evs[1], tr('Игрок 1'), tr('Игрок 2'));
    const ok = w === ex.winner;
    T.answered = true; T.chosen = w; T.correctW = ex.winner; T.ok = ok;
    recordAnswer({ mode: 'winner', cat: t.cat, chosen: w, ok });
    renderTask();
    const ans = ex.winner === 0 ? tr('Ничья') : tr('Выиграл Игрок ') + ex.winner;
    feedback(ok, ok ? tr('Верно! ') + ans + '.' : tr('Нет. ') + ans + '.', '<p>' + ex.text + (V().sd && t.evs[0].cat !== t.evs[1].cat ? tr(' Напомним порядок в шорт-деке: флеш старше фулл-хауса, тройка старше стрита.') : '') + '</p>');
  }

  // --- Скоростной режим ---
  const speedKey = () => VK + ':' + (isFull() ? 'full' : 5);
  const speedRecord = () => (PKStore.getMeta('speed', {})[speedKey()] || 0);
  const speedGoal = () => !isFull() ? 20 : V().omaha ? 10 : 15;
  function renderSpeed() {
    const el = $('#task'), sp = T.sp;
    if (sp.state === 'idle' || sp.state === 'done') {
      let res = '';
      if (sp.state === 'done') {
        res = '<div class="fb ' + (sp.newRecord ? 'ok' : 'info') + '" style="max-width:560px;margin:0 auto 22px;text-align:left"><div class="fb-title">' +
          (sp.newRecord ? tr('🏆 Новый рекорд: ') + sp.score + '!' : tr('Результат: ') + sp.score + tr(' верных')) + tr('</div><p>Ответов: ') + sp.n + tr(', точность ') + (sp.n ? pct(sp.score / sp.n) : '—') +
          tr(', лучшая серия в забеге: ') + sp.best + '. ' + (sp.score >= speedGoal() ? tr('Цель выполнена — усложните уровень или побейте рекорд.') : tr('Цель: ') + speedGoal() + tr(' верных.')) + '</p></div>';
      }
      el.innerHTML = '<div class="speed-start">' + res + '<h3>' + (sp.state === 'done' ? tr('Ещё раз?') : tr('Скоростной режим · ') + V().short) + tr('</h3><p>За 60 секунд назовите как можно больше комбинаций (') +
        (isFull() ? fullLabel().toLowerCase() : tr('5 карт')) + tr('). Цель — <b>') + speedGoal() + tr('</b> верных, ваш рекорд — <b>') + speedRecord() + '</b>.</p>' +
        tr('<button class="btn primary big" id="speed-start">Старт <kbd>Пробел</kbd></button></div>');
      return;
    }
    const left = Math.max(0, sp.end - Date.now());
    let fb = '';
    if (T.answered && !T.ok) fb = tr('<div class="fb bad" style="margin-top:14px;padding:10px 16px"><b>Это ') + C[T.task.cat] + '.</b> ' + PK.describe(T.task.best.ev) + tr('. <span class="muted keys">Пробел — дальше.</span></div>');
    el.innerHTML = '<div class="speed-hud"><div><div class="timebar"><i id="sp-bar" style="width:' + (left / SPEED_MS * 100) + '%"></i></div></div>' +
      '<div class="hud-num"><b id="sp-time">' + Math.ceil(left / 1000) + tr('</b><span>секунд</span></div>') +
      '<div class="hud-num"><b>' + sp.score + tr('</b><span>верно</span></div><div class="hud-num"><b>') + sp.streak + tr('</b><span>серия</span></div></div>') +
      '<div id="sp-area">' + nameCardsHTML() + answersHTML() + fb + '</div>';
    if (T.answered) $('#sp-area').classList.add(T.ok ? 'flash-ok' : 'flash-bad');
  }
  function speedStart() {
    const sp = T.sp;
    clearInterval(sp.timer); clearTimeout(sp.wait);
    Object.assign(sp, { state: 'run', score: 0, streak: 0, best: 0, n: 0, end: Date.now() + SPEED_MS, locked: false, next: null, newRecord: false });
    sp.timer = setInterval(speedTick, 100);
    newTask();
  }
  function speedTick() {
    const sp = T.sp, left = sp.end - Date.now();
    if (left <= 0) return speedEnd();
    const bar = $('#sp-bar'), tm = $('#sp-time');
    if (bar) bar.style.width = (left / SPEED_MS * 100) + '%';
    if (tm) tm.textContent = Math.ceil(left / 1000);
  }
  function speedEnd() {
    const sp = T.sp;
    clearInterval(sp.timer); clearTimeout(sp.wait);
    sp.state = 'done';
    PKSound.play('end');
    PKStore.setMeta('speedRuns', PKStore.getMeta('speedRuns', 0) + 1);
    if (sp.score > speedRecord()) { const all = Object.assign({}, PKStore.getMeta('speed', {})); all[speedKey()] = sp.score; PKStore.setMeta('speed', all); sp.newRecord = true; }
    renderTask();
  }
  function speedAbort() {
    const sp = T.sp;
    if (sp.state !== 'run') return;
    clearInterval(sp.timer); clearTimeout(sp.wait);
    sp.state = 'idle';
  }
  function speedAnswer(cat) {
    const sp = T.sp;
    if (sp.state !== 'run' || sp.locked || T.answered) return;
    const ok = cat === T.task.cat;
    T.answered = true; T.chosen = cat; T.ok = ok;
    recordAnswer({ mode: 'speed', cat: T.task.cat, chosen: cat, ok });
    sp.n++;
    if (ok) { sp.score++; sp.streak++; sp.best = Math.max(sp.best, sp.streak); } else sp.streak = 0;
    sp.locked = true;
    renderTask();
    sp.next = () => { sp.locked = false; sp.next = null; if (sp.state === 'run') newTask(); };
    sp.wait = setTimeout(sp.next, ok ? 280 : 1600);
  }
  function speedSkipWait() { const sp = T.sp; if (sp.locked && sp.next) { clearTimeout(sp.wait); sp.next(); } }
  function setMode(m) {
    if (m === T.mode) return;
    speedAbort();
    T.mode = m; settings.mode = m; saveSettings();
    T.sp.state = 'idle';
    $('#feedback').innerHTML = '';
    renderTrainerChrome();
    if (m === 'speed') { T.task = null; renderTask(); } else newTask();
  }
  function setLevel(l) {
    l = l === 'full' ? 'full' : 5;
    if (l === T.level) return;
    speedAbort();
    T.level = l; settings.level = l; saveSettings();
    renderTrainerChrome();
    if (T.mode === 'speed') { T.sp.state = 'idle'; renderTask(); } else newTask();
  }


  // ======================================================================
  // НОВЫЕ ТРЕНИРОВКИ: шансы, префлоп, мои ошибки
  // ======================================================================
  function pickSub(mode, subs) {
    const A = PKStore.all('answers'), st = {};
    subs.forEach(x => st[x] = { n: 0, bad: 0 });
    for (let i = A.length - 1, seen = 0; i >= 0 && seen < 60; i--) { const r = A[i]; if (r.variant === VK && r.mode === mode && st[r.sub]) { st[r.sub].n++; if (!r.ok) st[r.sub].bad++; seen++; } }
    const w = subs.map(x => 0.5 + (st[x].bad + 1) / (st[x].n + 3) * 2);
    let x = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < subs.length; i++) { x -= w[i]; if (x <= 0) return subs[i]; }
    return subs[0];
  }
  function mistakesList() { return PKDrills.collectMistakes(PKStore.all('hands'), VK, PKStore.getMeta('fixed', {})); }
  function genDrill(mode) {
    if (mode === 'odds') return PKDrills.genOdds(VK, pickSub('odds', PKDrills.ODDS_TYPES));
    if (mode === 'spot') return PKDrills.genSpot(VK, Math.random, { street: pickSub('spot', PKDrills.SPOT_STREETS) });
    if (mode === 'preflop') {
      const t = PKDrills.genPreflop(VK, Math.random, { facingRaise: pickSub('preflop', ['open', 'raise']) === 'raise' });
      return t;
    }
    const list = mistakesList();
    if (!list.length) return { kind: 'review', empty: true };
    T.reviewIdx = ((T.reviewIdx || 0) + 1) % list.length;
    const it = list[T.reviewIdx], d = it.d, h = it.hand;
    const callLbl = d.tc > 0 ? tr('Колл ') + fmt(d.tc) : tr('Чек');
    const options = [{ v: 'fold', label: tr('Фолд') }, { v: 'call', label: callLbl }, { v: 'raise', label: d.ib ? tr('Ставка') : tr('Рейз') }];
    return { kind: 'review', item: it, left: list.length, options, correct: options.findIndex(o => o.v === PKDrills.actionOf(d.adv)) };
  }
  function optsHTML(t) {
    return '<div class="answers opts">' + t.options.map((o, i) => {
      let cls = 'ans';
      if (T.answered) cls += i === t.correct ? ' correct' : i === T.chosen ? ' chosen-wrong' : ' faded';
      return '<button class="' + cls + '" data-opt="' + i + '"' + (T.answered ? ' disabled' : '') + '><kbd>' + (i + 1) + '</kbd>' + o.label + '</button>';
    }).join('') + '</div>';
  }
  function posPills(pos) {
    return '<div class="pos-pills">' + PKDrills.POS6.map(p => '<span class="' + (p === pos ? 'on' : '') + '">' + p + '</span>').join('') + '</div>';
  }
  function drillHTML() {
    const t = T.task;
    if (t.kind === 'odds') {
      const best = PK.bestHand(VK, t.hole, t.board);
      return '<div class="prompt">' + t.question + '<small>' + PKDrills.ODDS_NAMES[t.type] + tr(' · сейчас у вас ') + PK.lc(C[best.ev.cat]) + (V().omaha ? tr(' · омаха: ровно 2 карты руки + 3 со стола') : '') + '</small></div>' +
        '<div class="task-cards">' + dealLayout(t.hole, t.board, (c, i) => ({ cls: [dealCls(), T.answered && t.outs.indexOf(c) >= 0 ? 'good' : ''], style: dealStyle(i) })) + '</div>' +
        (t.type === 'pot' ? tr('<div class="pot-box"><span>Банк <b>') + fmt(t.pot) + tr('</b></span><span>Нужно доставить <b>') + fmt(t.toCall) + tr('</b></span><span>Осталась одна карта — ривер</span></div>') : '') + optsHTML(t);
    }
    if (t.kind === 'spot') {
      const v = { bet: fmt(t.bet), size: t.size, street: PK.STREET_RU[t.street], n: t.nOpp, hand: PK.lc(C[t.cur.cat]) };
      return '<div class="prompt">' + tr('Соперник ставит {bet} ({size}). Что делаете?', v) + '<small>' + tr('{street} · соперников: {n} · сейчас у вас {hand}', v) + '</small></div>' +
        '<div class="task-cards">' + dealLayout(t.hole, t.board, (c, i) => ({ cls: dealCls(), style: dealStyle(i) })) + '</div>' +
        '<div class="pot-box"><span>' + tr('Банк со ставкой <b>{n}</b>', { n: fmt(t.pot) }) + '</span><span>' + tr('Нужно доставить <b>{n}</b>', { n: fmt(t.toCall) }) + '</span><span>' + tr('Соперников <b>{n}</b>', { n: t.nOpp }) + '</span></div>' + optsHTML(t);
    }
    if (t.kind === 'preflop') {
      const sit = t.facingRaise ? tr('Игрок перед вами повысил до <b>') + dec(t.raiseTo) + tr(' ББ</b>. Вам нужно доставить <b>') + dec(t.toCallBB) + tr(' ББ</b>.')
        : tr('До вас все сбросили карты — вы можете войти в банк первым.');
      return tr('<div class="prompt">Играть или сбросить?<small>Позиция: ') + PKDrills.POS_RU[t.pos] + '. ' + sit + '</small></div>' + posPills(t.pos) +
        '<div class="task-cards"><div class="cards-row">' + t.hole.map((c, i) => cardHTML(c, { size: V().hole > 2 ? 'md' : 'lg', cls: dealCls(), style: dealStyle(i) })).join('') + '</div></div>' + optsHTML(t);
    }
    // review
    if (t.empty) {
      const old = PKStore.all('hands').some(h => h.variant === VK && (h.decisions || []).some(d => d.c === 'bad' && !d.adv));
      return tr('<div class="empty-state"><h3>Ошибок для разбора нет</h3><p>Сыграйте несколько раздач за столом. Решения, которые разбор отметит красным или жёлтым, появятся здесь как задания') + (V().short ? ' (' + V().short + ')' : '') + '.</p>' +
        (old ? tr('<p class="muted sm">Раздачи, сыгранные до этого обновления, сюда не попадают: в них не сохранена ситуация на момент решения.</p>') : '') +
        tr('<button class="btn primary" data-goto="game">Перейти к столу</button></div>');
    }
    const it = t.item, d = it.d, h = it.hand, board = d.b || [];
    const date = new Date(h.ts).toLocaleString(PKI18n.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return tr('<div class="prompt">Что делаете?<small>Раздача #') + h.handNo + ' (' + date + ') · ' + PK.STREET_RU[d.s] + tr(' · осталось разобрать: ') + t.left + '</small></div>' +
      '<div class="task-cards">' + (board.length ? dealLayout(h.hole, board, (c, i) => ({ cls: dealCls(), style: dealStyle(i) }))
        : tr('<div><div class="grp-label">Ваши карты</div><div class="cards-row">') + h.hole.map((c, i) => cardHTML(c, { size: V().hole > 2 ? 'md' : 'lg', cls: dealCls(), style: dealStyle(i) })).join('') + '</div></div>') + '</div>' +
      tr('<div class="pot-box"><span>Позиция <b>') + esc(d.pos || h.pos || '?') + tr('</b></span><span>Банк <b>') + fmt(d.pot) + '</b></span><span>' + (d.tc > 0 ? tr('Нужно доставить <b>') + fmt(d.tc) + '</b>' : tr('Можно сделать чек')) + tr('</span><span>Соперников <b>') + (d.opp != null ? d.opp : '?') + '</b></span></div>' + optsHTML(t);
  }
  const ACT_RU = { fold: tr('фолд'), call: tr('колл'), check: tr('чек'), raise: tr('рейз') };
  function answerDrill(i) {
    const t = T.task;
    if (T.answered || !t || !t.options) return;
    const ok = i === t.correct;
    T.answered = true; T.chosen = i; T.ok = ok;
    const rec = { mode: T.mode, cat: -1, chosen: i, ok };
    if (t.kind === 'odds') rec.sub = t.type;
    if (t.kind === 'spot') { rec.sub = t.street; rec.act = t.action; }
    if (t.kind === 'preflop') { rec.sub = t.sub; rec.tier = t.info.tier; rec.pos = t.pos; }
    if (t.kind === 'review') { rec.sub = t.item.d.s; if (ok) { const f = Object.assign({}, PKStore.getMeta('fixed', {})); f[t.item.key] = Date.now(); PKStore.setMeta('fixed', f); } }
    recordAnswer(rec);
    renderTask();
    let html = '';
    const right = t.options[t.correct].label;
    if (t.kind === 'odds') {
      const n = t.outs.length, groups = Object.keys(t.byCat).sort((a, b) => power(+b) - power(+a));
      html += tr('<p><b>Аутов: ') + n + tr('</b> из ') + t.unseen + tr(' неизвестных карт. ') + groups.map(k => C[k] + ' — ' + t.byCat[k].length + ': ' + ctexts(t.byCat[k])).join('; ') + '.</p>';
      html += tr('<p>Шанс улучшиться на следующей карте: <b>') + pct(t.pNext) + '</b> (' + n + tr(' из ') + t.unseen + ').' + (t.board.length === 3 ? tr(' К риверу (две карты): <b>') + pct(t.pByRiver) + '</b>.' : '') + '</p>';
      html += tr('<p class="muted">Правило 2 и 4: ') + n + ' × 2 ≈ ' + Math.min(99, n * 2) + tr('% на одну карту') + (t.board.length === 3 ? ', ' + n + ' × 4 ≈ ' + Math.min(99, n * 4) + tr('% к риверу') : '') + '. ' + (n > 12 ? tr('При большом числе аутов правило завышает шанс — точное значение выше.') : tr('Для быстрого счёта за столом этого достаточно.')) + '</p>';
      if (t.type === 'pot') html = tr('<p>Колл ') + fmt(t.toCall) + tr(' окупается, если вы выигрываете хотя бы в <b>') + pct(t.need) + tr('</b> случаев: ') + fmt(t.toCall) + ' ÷ (' + fmt(t.pot) + ' + ' + fmt(t.toCall) + tr('). Ваш шанс собрать руку на ривере — <b>') + pct(t.pNext) + '</b>. ' + (t.correct === 0 ? tr('Шанс больше нужного — колл выгоден.') : tr('Шанс меньше нужного — лучше сбросить.')) + '</p>' + html + tr('<p class="muted sm">Упрощение: считаем, что собранная рука выигрывает, а несобранная проигрывает.</p>');
      if (V().omaha) html += tr('<p class="muted sm">Омаха: аут засчитывается, только если улучшенная рука собирается из ровно 2 карт руки и 3 карт стола.</p>');
      feedback(ok, ok ? tr('Верно!') : tr('Правильный ответ: ') + right, html);
    } else if (t.kind === 'spot') {
      feedback(ok, ok ? tr('Верно: ') + right.toLowerCase() : tr('Лучше: ') + right.toLowerCase(), spotExplain(t));
    } else if (t.kind === 'preflop') {
      html += '<p><b>' + esc(t.info.code) + '</b> — ' + t.info.kind + ', ' + t.info.tierText + '.</p><p>' + PK.PREFLOP_WHY[t.advice.rule] + '</p>' +
        tr('<div class="why-title">Почему рука ') + (t.info.tier >= 3 ? tr('сильная') : t.info.tier === 2 ? tr('средняя') : tr('слабая')) + ':</div>' + reasonsHTML(PKDrills.explainStart(t.hole, VK));
      if (V().hole === 2) html += tr('<p><button class="btn small" data-show-chart="1">Показать таблицу стартовых рук</button></p>');
      feedback(ok, ok ? tr('Верно: ') + right.toLowerCase() : tr('Лучше: ') + right.toLowerCase(), html);
    } else {
      const d = t.item.d;
      html += tr('<p>Тогда вы сделали: <b>') + ACT_RU[d.t] + tr('</b>. Подсказка советовала: <b>') + ACT_RU[d.adv] + '</b>.</p>' + (d.tx ? '<p>' + d.tx + '</p>' : '');
      if (d.s !== 'preflop' && d.eq != null) html += tr('<p class="muted">Шанс выиграть был ≈') + pct(d.eq) + (d.tc > 0 ? tr(', для колла нужно ≈') + pct(d.po) : '') + '.</p>';
      html += ok ? tr('<p class="muted sm">Ошибка исправлена и убрана из списка.</p>') : tr('<p class="muted sm">Эта ситуация попадётся ещё раз.</p>');
      feedback(ok, ok ? tr('Верно!') : tr('Правильно: ') + right.toLowerCase(), html);
    }
  }
  // Разбор задания «Ситуации»: цена колла, шанс руки, вывод и честная оговорка про «случайные» карты соперника
  function spotExplain(t) {
    const v = { call: fmt(t.toCall), pot: fmt(t.pot), need: pct(t.need), eq: pct(t.eq), size: t.size, hand: PK.lc(PK.describe(t.cur)), n: t.nOpp };
    let h = '<p>' + tr('Ставка — {size}. В банке {pot} вместе с ней, вам доставить {call}. Колл окупается, если выигрывать хотя бы в <b>{need}</b> случаев: {call} ÷ ({pot} + {call}).', v) + '</p>';
    h += '<p>' + (t.nOpp === 1 ? tr('У вас {hand}. Шанс выиграть против случайной руки соперника — <b>≈{eq}</b>.', v) : tr('У вас {hand}. Шанс выиграть против {n} случайных рук — <b>≈{eq}</b>.', v)) + '</p>';
    if (t.outs && t.outs.outs.length) {
      const o = { n: t.outs.outs.length, p1: pct(t.outs.pNext), p2: pct(t.outs.pByRiver) };
      h += '<p class="muted">' + (t.board.length === 3 ? tr('Аутов {n}: шанс улучшиться на тёрне {p1}, к риверу {p2}.', o) : tr('Аутов {n}: шанс улучшиться на ривере {p1}.', o)) + '</p>';
    }
    const why = t.action === 'raise' ? tr('Шанс ≈{eq} — скорее всего, рука лучшая. Повышайте: пусть соперник платит больше, а не смотрит карты дёшево.', v)
      : t.action === 'call' ? tr('Шанс ≈{eq} больше нужных {need} — на дистанции колл приносит фишки.', v)
        : tr('Шанс ≈{eq} меньше нужных {need} — на дистанции такой колл теряет фишки. Лучше сбросить.', v);
    h += '<p><b>' + why + '</b></p>' + reasonsHTML(PKDrills.explainMade(t.hole, t.board, VK), 4);
    h += '<p class="muted sm">' + tr('Шанс посчитан против случайных карт. Тот, кто ставит, обычно сильнее случайной руки, поэтому в пограничных случаях осторожность не помешает.') + '</p>';
    if (V().omaha) h += '<p class="muted sm">' + tr('Омаха: рука собирается из ровно 2 карт руки и 3 карт стола.') + '</p>';
    return h;
  }
  // Таблица стартовых рук
  const OPEN_TEXT = { any: tr('с любой позиции'), late: tr('с поздних позиций (CO, баттон) и малого блайнда'), btn: tr('только с баттона'), fold: tr('сбрасывать') };
  function handGridHTML(vk, hl) {
    const grid = PKDrills.handGrid(vk);
    if (!grid) return tr('<p>В омахе руки из 4–5 карт, поэтому таблицы 13×13 нет. Хорошие стартовые руки в омахе — <b>связанные</b> (карты близки по рангу, например J-T-9-8), <b>двухмастные</b> (две пары карт одной масти) и с высокими парами (A-A-x-x, K-K-x-x). Слабые — с тремя картами одного ранга или с «дыркой» (A-8-4-2 разномастные). Подсказки за столом и режим «Играть или сбросить» оценивают руку за вас.</p>');
    const S = r => PK.RANK_SYM[r].replace('10', 'T');
    let h = '<div class="grid-wrap"><table class="hand-grid"><tr><th></th>' + grid.ranks.map(r => '<th>' + S(r) + '</th>').join('') + '</tr>';
    grid.rows.forEach((row, i) => {
      h += '<tr><th>' + S(grid.ranks[i]) + '</th>' + row.map(c => {
        const on = hl && c.hi === hl.hi && c.lo === hl.lo && (c.pair || c.suited === hl.suited);
        return '<td class="g-' + c.open + (on ? ' hl' : '') + '" title="' + c.code + ': ' + OPEN_TEXT[c.open] + '">' + c.code + '</td>';
      }).join('') + '</tr>';
    });
    h += tr('</table></div><div class="grid-legend"><span class="g-any">играть с любой позиции</span><span class="g-late">с поздних позиций</span><span class="g-btn">только с баттона</span><span class="g-fold">сбросить</span></div>') +
      tr('<p class="muted sm">Над диагональю — одномастные руки (s), под ней — разномастные (o), на диагонали — пары. ') + (PK.VARIANTS[vk].sd ? tr('Шорт-дек: карт ниже шестёрки нет.') : '') + '</p>';
    return h;
  }
  function renderHandChart() { const el = $('#hand-chart'); if (el) el.innerHTML = tr('<p class="muted sm">Вариант: <b>') + V().name + tr('</b> (меняется в шапке).</p>') + handGridHTML(VK); }
  function showChartModal(t) { showModal(tr('Таблица стартовых рук · ') + V().short, handGridHTML(VK, t && t.hole && t.hole.length === 2 ? PKDrills.gridCode(t.hole) : null)); }

  // ======================================================================
  // ПОЯС И ЦЕЛЬ ДНЯ
  // ======================================================================
  let lastActDone = null;
  function beltNow() {
    const stored = PKStore.getMeta('belts', {});
    return PKDrills.belt(PKStore.all('answers'), PKStore.all('hands'), VK, stored[VK] || 0);
  }
  function renderProgress(afterAnswer) {
    const el = $('#progress-strip');
    if (!el) return;
    const b = beltNow(), stored = Object.assign({}, PKStore.getMeta('belts', {}));
    if (b.level > (stored[VK] || 0)) {
      stored[VK] = b.level; PKStore.setMeta('belts', stored);
      if (afterAnswer) { toast(tr('Новый пояс: ') + b.belt.name + ' (' + V().short + ')!', 'goal'); PKSound.play('goal'); }
    }
    const act = PKStats.activity(PKStore.all('answers'), PKStore.all('hands'), settings.dailyGoal);
    if (afterAnswer && act.done && lastActDone === false) { toast(tr('Цель дня выполнена! Серия: ') + act.streak + ' ' + plural(act.streak, 'день', 'дня', 'дней') + tr(' подряд.'), 'goal'); PKSound.play('goal'); }
    lastActDone = act.done;
    const goal = settings.dailyGoal;
    const nx = b.next;
    el.innerHTML = '<div class="belt"><span class="belt-dot" style="background:' + b.belt.color + '"></span><div><div class="belt-name">' + b.belt.name + tr(' пояс · ') + V().short + '</div>' +
      (nx ? tr('<div class="belt-next">До пояса «{b}»: ', { b: b.nextBelt.name }) + esc(nx.title) + ' — <b>' + esc(nx.text) + '</b> <button class="btn tiny" data-goto="' + nx.mode + '"' + (nx.hint ? ' data-hint="' + nx.hint + '"' : '') + tr('>Тренировать</button></div>') : tr('<div class="belt-next">Высший пояс! Попробуйте другой вариант покера.</div>')) + '</div></div>' +
      '<div class="goal">' + (goal ? tr('<div class="goal-top"><span>Цель дня: <b>') + Math.min(act.today, goal) + ' / ' + goal + '</b>' + (act.done ? ' ✓' : '') + '</span>' +
        (act.streak ? tr('<span class="streak" title="Дней подряд с выполненной целью">🔥 ') + act.streak + ' ' + plural(act.streak, 'день', 'дня', 'дней') + '</span>' : '') + '</div><div class="goal-bar"><i style="width:' + Math.min(100, act.today / goal * 100) + '%"></i></div>' : tr('<div class="goal-top"><span>Цель дня выключена</span></div>')) +
      tr('<label class="goal-set">Задания и раздачи в день: <select id="goal-select">') + [0, 10, 20, 40, 60].map(v => '<option value="' + v + '"' + (v === goal ? ' selected' : '') + '>' + (v || tr('без цели')) + '</option>').join('') + '</select></label></div>';
  }
  function gotoStep(mode, hint) {
    if (mode === 'game') { showTab('game'); return; }
    if (activeTab !== 'trainer') showTab('trainer');
    if (hint === 'full' && T.level !== 'full') { T.level = 'full'; settings.level = 'full'; saveSettings(); }
    if (mode !== T.mode) setMode(mode); else { renderTrainerChrome(); newTask(); }
  }
  function toast(text, kind) {
    const d = document.createElement('div');
    d.className = 'toast ' + (kind || '');
    d.textContent = text;
    document.body.appendChild(d);
    setTimeout(() => d.classList.add('out'), 3200);
    setTimeout(() => d.remove(), 3800);
  }

  // --- Шпаргалка ---
  const EX_STD = ['Ah Qd 9c 6s 3h', 'Ac Ad 9s 6h 3c', 'Jh Js 4c 4d Ah', '7c 7h 7d Ks 2c', '9c 8d 7s 6h 5c', 'Ad Jd 8d 6d 2d', 'Qs Qh Qd 7c 7s', 'Kc Kd Kh Ks 3d', '9h 8h 7h 6h 5h', 'As Ks Qs Js Ts'];
  const EX_SD = ['Ah Qd 9c 7s 6h', 'Ac Ad 9s 7h 6c', 'Jh Js 7c 7d Ah', '8c 8h 8d Ks Qc', 'Ac 6d 7s 8h 9c', 'Ad Jd 9d 7d 6d', 'Qs Qh Qd 7c 7s', 'Kc Kd Kh Ks 9d', 'Th 9h 8h 7h 6h', 'As Ks Qs Js Ts'];
  const SHORT_DEFS = [tr('ничего не собрано'), tr('2 одинаковые'), tr('2 разные пары'), tr('3 одинаковые'), tr('5 подряд'), tr('5 одной масти'), tr('тройка + пара'), tr('4 одинаковые'), tr('5 подряд одной масти'), tr('10–A одной масти')];
  const examples = () => V().sd ? EX_SD : EX_STD;
  function renderCheat(hl) {
    const agg = catAgg(VK), order = V().order.slice().reverse();
    let h = tr('<h3>Шпаргалка · ') + V().short + tr('</h3><div class="sub">Комбинации от сильной к слабой. Справа — ваша точность.</div>');
    if (V().sd) h += tr('<div class="cheat-note">Шорт-дек: флеш старше фулл-хауса, тройка старше стрита, A-6-7-8-9 — стрит.</div>');
    if (V().omaha) h += tr('<div class="cheat-note">Омаха: ровно 2 карты из руки + 3 со стола.</div>');
    h += '<ol>';
    order.forEach((c, i) => {
      const s = agg[c], acc = s.seen ? s.correct / s.seen : null;
      const accCls = acc == null ? '' : acc < 0.7 ? ' low' : acc >= 0.9 ? ' high' : '';
      h += '<li' + (hl === c ? ' class="hl"' : '') + '><span class="n">' + (i + 1) + '</span><span class="nm">' + C[c] + '</span><span class="acc' + accCls + '" title="' + (acc == null ? tr('ещё не было') : s.correct + tr(' из ') + s.seen) + '">' + (acc == null ? '—' : pct(acc)) + '</span>' +
        '<span class="ex">' + PK.parseCards(examples()[c]).map(x => cardHTML(x, { size: 'xs' })).join('') + '<span class="muted" style="font-size:12.5px;margin-left:6px;align-self:center">' + SHORT_DEFS[c] + '</span></span></li>';
    });
    h += tr('</ol><div class="foot">Если комбинации равны, побеждает старшая карта или кикер. Масти не сравниваются.</div>');
    $('#cheat').innerHTML = h;
  }

  // ======================================================================
  // ИГРА ЗА СТОЛОМ
  // ======================================================================
  const HUMAN = 0;
  const BOTS = [{ name: tr('Анна'), style: 'tight' }, { name: tr('Борис'), style: 'aggro' }, { name: tr('Вика'), style: 'loose' }, { name: tr('Глеб'), style: 'tight' }, { name: tr('Дина'), style: 'aggro' }];
  const FEMALE = new Set([BOTS[0].name, BOTS[2].name, BOTS[4].name]);
  const LAYOUTS = { 1: [0, 3], 2: [0, 2, 4], 3: [0, 1, 3, 5], 4: [0, 1, 2, 4, 5], 5: [0, 1, 2, 3, 4, 5] };
  const LEVEL_ONE = { easy: tr('новичок'), normal: '', hard: tr('сильный') };
  const SPEED_K = { slow: 1.7, normal: 1, fast: 0.4 };
  const tableCfg = () => Object.assign({}, TABLE_DEF, settings.table || {});
  function makeSeats(cfg) {
    const seats = [{ name: tr('Вы'), human: true, style: 'tight' }];
    for (let k = 0; k < cfg.opp; k++) seats.push({ name: BOTS[k].name, style: BOTS[k].style, level: cfg.level === 'mixed' ? ['easy', 'normal', 'hard'][k % 3] : cfg.level });
    return seats;
  }
  const SEAT_POS = [
    { x: '50%', y: '85%', d: [-110, -30], b: ['calc(50% + 108px)', '69%'] },
    { x: '92px', y: '66%', d: [98, 60], b: ['calc(92px + 135px)', '64%'] },
    { x: '21%', y: '15%', d: [100, 44], b: ['26%', '40%'] },
    // Фишки — сразу под своей подписью (на невысоком столе процент от высоты загоняет их на подпись)
    // и не дальше 124 px левее Глеба (79 %): на узком столе планшета иначе налезают на его подпись
    { x: '50%', y: '14%', d: [-100, 30], b: ['min(calc(50% + 110px), calc(79% - 124px))', 'calc(14% + 104px)'] },
    { x: '79%', y: '15%', d: [-100, 44], b: ['74%', '40%'] },
    { x: 'calc(100% - 92px)', y: '66%', d: [-98, 60], b: ['calc(100% - 227px)', '64%'] }
  ];
  // Телефон: стол — вертикальный овал, места компактные.
  // Телефон: стол — вертикальный овал. Три соперника сверху, вы и ещё двое снизу, общие карты — посередине.
  const SEAT_POS_PHONE = [
    { x: '50%', y: '84%', d: [78, -30], b: ['50%', '66%'] },
    { x: '15%', y: '75%', d: [56, -44], b: ['33%', '59.5%'] },
    { x: '15%', y: '17%', d: [56, 26], b: ['29%', '33%'] },
    { x: '50%', y: '13.5%', d: [-62, 26], b: ['50%', '32%'] },
    { x: '85%', y: '17%', d: [-56, 26], b: ['71%', '33%'] },
    { x: '85%', y: '75%', d: [-56, -44], b: ['67%', '59.5%'] }
  ];
  const phoneMQ = (() => { try { return matchMedia('(max-width: 720px)'); } catch (e) { return null; } })();
  const isPhone = () => !!(phoneMQ && phoneMQ.matches);
  const G = { cfg: null, layout: LAYOUTS[5], aggr: {}, prevBets: [], betPos: {}, prevStreet: null, fxDone: -1, game: null, timer: null, decisions: [], history: [], seen: new Set(), hint: null, hintKey: '', raiseTo: 0, over: false, overText: '', review: null, doneFor: -1, gameRec: null, handInfo: null };
  const eqIters = (pre) => VK === 'holdem' ? (pre ? 1500 : 2500) : VK === 'short' ? (pre ? 1200 : 2000) : VK === 'omaha' ? 400 : 260;
  const botIters = () => VK === 'holdem' || VK === 'short' ? 350 : VK === 'omaha' ? 120 : 80;

  function endGameRecord(result) {
    const r = G.gameRec;
    if (!r || r.result !== 'play') return;
    r.result = result; r.endTs = Date.now();
    PKStore.update('games', r);
  }
  function newGame() {
    clearTimeout(G.timer);
    endGameRecord('abandoned');
    const cfg = G.cfg = tableCfg();
    G.layout = LAYOUTS[cfg.opp] || LAYOUTS[5];
    G.game = new PK.Game({ variant: VK, seats: makeSeats(cfg), startStack: cfg.stack, handsPerLevel: 8, botLevel: cfg.level === 'mixed' ? 'normal' : cfg.level });
    G.history = []; G.over = false; G.review = null; G.doneFor = -1;
    G.gameRec = PKStore.add('games', { variant: VK, ts: Date.now(), hands: 0, result: 'play', finalStack: cfg.stack, opp: cfg.opp, level: cfg.level });
    dataVer++;
    startHand();
  }
  function startHand() {
    clearTimeout(G.timer);
    const g = G.game;
    G.decisions = []; G.seen = new Set(); G.hint = null; G.hintKey = ''; G.aggr = {}; G.prevBets = []; G.betPos = {}; G.prevStreet = 'preflop'; G.whyKey = '';
    if (!g.startHand()) { G.over = true; renderGame(); return; }
    const pos = g.positionInfo(HUMAN), me = g.players[HUMAN];
    G.handInfo = me.out ? null : { pos: pos ? pos.short : '?', info: PK.startingHandInfo(me.hole, VK) };
    renderGame();
    PKSound.play('deal');
    schedule();
  }
  const humanActive = () => { const p = G.game.players[HUMAN]; return !p.folded && !p.out; };
  function schedule() {
    clearTimeout(G.timer);
    const g = G.game;
    if (!g) return;
    if (g.done) { onHandDone(); return; }
    const k = SPEED_K[(G.cfg || TABLE_DEF).speed] || 1;
    if (g.awaitingDeal) { G.timer = setTimeout(() => { g.nextStreet(); PKSound.play('deal'); renderGame(); schedule(); }, (humanActive() ? 900 : 450) * k); return; }
    const i = g.toAct;
    if (i === HUMAN) { renderGame(); PKSound.play('turn'); buzz(); return; }
    const delay = (humanActive() ? 650 + Math.random() * 500 : 260) * k;
    G.timer = setTimeout(() => {
      if (G.game !== g) return;
      const street = g.street, t = g.act(i, PK.botDecide(g, i, Math.random, botIters()));
      if (t === 'raise' && street !== 'preflop') G.aggr[i] = street;
      if (humanActive()) PKSound.play(t === 'fold' ? 'fold' : t === 'check' ? 'check' : 'chip');
      renderGame(); schedule();
    }, delay);
  }

  // --- Подсказки и советы ---
  const VERDICT = { raise: tr('ИГРАТЬ'), call: tr('КОЛЛ'), check: tr('ЧЕК'), fold: tr('ФОЛД') };
  function advisePre(g, L, info, pos) {
    const facingRaise = g.currentBet > g.bb;
    const a = PK.preflopAdvice({ tier: info.tier, pos: pos ? pos.short : 'MP', facingRaise, toCallBB: L.toCall / g.bb, canCheck: L.toCall === 0 });
    let action = a.action;
    if (action === 'raise' && !L.canRaise) action = L.toCall > 0 ? 'call' : 'check';
    if (action === 'fold' && L.toCall === 0) action = 'check';
    const om = V().omaha && info.tier >= 3 ? tr(' В омахе руки ближе по силе, поэтому даже сильная рука редко бывает большим фаворитом.') : '';
    return { action, why: cap(info.kind) + ' — ' + info.tierText + '. ' + PK.PREFLOP_WHY[a.rule] + om };
  }
  function advisePost(g, L, eq, potOdds, opp) {
    const strong = PKDrills.isStrong(eq, opp);
    if (strong) return { action: L.canRaise ? 'raise' : (L.toCall > 0 ? 'call' : 'check'), why: tr('Скорее всего, у вас лучшая рука (≈') + pct(eq) + '). ' + (L.toCall > 0 ? tr('Повышайте') : tr('Ставьте')) + tr(' — пусть соперники платят.') };
    if (L.toCall === 0) return eq >= 0.5 ? { action: 'check', why: tr('Рука неплохая, но не сильнейшая. Чек или небольшая ставка.') }
      : { action: 'check', why: tr('Ставить пока не с чем — сделайте чек и бесплатно посмотрите следующую карту.') };
    if (eq >= potOdds) return { action: 'call', why: tr('Вы платите ') + fmt(L.toCall) + tr(', чтобы выиграть ') + fmt(L.pot) + tr('. Колл окупается, если выигрывать хотя бы в ') + pct(potOdds) + tr(' случаев, а ваш шанс ≈') + pct(eq) + tr('. Колл выгоден.') };
    return { action: 'fold', why: tr('Колл ') + fmt(L.toCall) + tr(' окупается, только если выигрывать в ') + pct(potOdds) + tr(' случаев, а ваш шанс ≈') + pct(eq) + tr('. Лучше сбросить.') };
  }
  function getHint() {
    const g = G.game, p = g.players[HUMAN];
    const key = g.handNo + '|' + g.street + '|' + g.currentBet + '|' + p.bet + '|' + g.livePlayers().length;
    if (G.hint && G.hintKey === key) return G.hint;
    const L = g.legal(HUMAN), pre = g.street === 'preflop';
    const opp = g.players.filter(q => !q.folded && !q.out && q !== p).length;
    const potOdds = L.toCall > 0 ? L.toCall / (L.pot + L.toCall) : 0;
    const pos = g.positionInfo(HUMAN);
    const h = { pre, potOdds, opp, pos, L };
    if (pre) {
      h.info = PK.startingHandInfo(p.hole, VK);
      h.eq1 = h.info.eq1 != null ? h.info.eq1 : PK.equity(p.hole, [], 1, eqIters(true), Math.random, VK);
      h.eq = PK.equity(p.hole, [], opp, eqIters(true), Math.random, VK);
      h.advice = advisePre(g, L, h.info, pos);
    } else {
      h.eq = PK.equity(p.hole, g.board, opp, eqIters(false), Math.random, VK);
      if (g.board.length < 5) h.outs = PK.outsInfo(p.hole, g.board, VK);
      h.advice = advisePost(g, L, h.eq, potOdds, opp);
    }
    G.hint = h; G.hintKey = key;
    return h;
  }
  function whyBlock(p, kind) {
    const g = G.game, key = g.handNo + '|' + g.board.length + '|' + kind;
    if (G.whyKey !== key) { G.whyKey = key; G.whyList = kind === 'start' ? PKDrills.explainStart(p.hole, VK) : PKDrills.explainMade(p.hole, g.board, VK); }
    return tr('<details class="why-box" open><summary>Почему рука ') + (kind === 'start' ? tr('такая по силе') : tr('сильная или слабая')) + '</summary>' + reasonsHTML(G.whyList) + '</details>';
  }
  function renderHint() {
    const el = $('#hint-panel'), g = G.game, p = g.players[HUMAN];
    if (!settings.hints) { el.innerHTML = tr('<h3>Подсказки</h3><p class="muted" style="margin:0">Выключены. Включите «Подсказки»<span class="keys"> (клавиша <kbd>H</kbd>)</span>, чтобы видеть вашу комбинацию, аутсы, шансы и совет на каждом ходу.</p>'); return; }
    if (p.out) { el.innerHTML = tr('<h3>Подсказки</h3><p class="muted">Вы выбыли из игры.</p>'); return; }
    if (g.done) { el.innerHTML = tr('<h3>Подсказки</h3><p class="muted" style="margin:0">Раздача окончена — разбор ниже.<span class="keys"> Нажмите <kbd>Enter</kbd> для следующей.</span></p>'); return; }
    if (p.folded) { el.innerHTML = tr('<h3>Подсказки</h3><p class="muted" style="margin:0">Вы сбросили карты. Посмотрите, чем закончится раздача.</p>'); return; }
    const pre = g.street === 'preflop';
    let h = tr('<h3>Подсказка</h3>');
    if (pre) {
      const info = G.handInfo ? G.handInfo.info : PK.startingHandInfo(p.hole, VK);
      h += '<div class="hint-hand">' + ctexts(p.hole) + '</div><div class="muted" style="font-size:15px">' + cap(info.kind) + tr('. Стартовая рука: ') + info.tierText + '.</div>';
      if (V().omaha) h += tr('<div class="omaha-note">Омаха: в итоговую комбинацию войдут ровно 2 из этих ') + V().hole + tr(' карт.</div>');
      h += whyBlock(p, 'start');
    } else {
      const bf = PK.bestHand(VK, p.hole, g.board);
      h += '<div class="hint-hand">' + C[bf.ev.cat] + '</div><div class="muted" style="font-size:15px">' + PK.describe(bf.ev) + '</div><div style="margin-top:6px">' + miniCards(bf.cards) + '</div>';
      h += whyBlock(p, 'made');
    }
    if (g.toAct !== HUMAN) { el.innerHTML = h + tr('<p class="muted" style="margin:10px 0 0;font-size:15px">Совет появится, когда будет ваш ход.</p>'); return; }
    const hi = getHint(), L = hi.L;
    h += '<div class="kv">';
    if (hi.pos) h += tr('<span>Позиция</span><b title="') + hi.pos.tip + '">' + hi.pos.name + '</b>';
    h += tr('<span>Соперников в раздаче</span><b>') + hi.opp + '</b>';
    if (hi.outs) {
      const o = hi.outs;
      h += tr('<span>Аутов (карт, улучшающих руку)</span><b>') + o.outs.length + '</b>';
      h += tr('<span>Улучшение на следующей карте</span><b>') + pct(o.pNext) + '</b>';
      if (g.board.length === 3) h += tr('<span>Улучшение до ривера</span><b>') + pct(o.pByRiver) + '</b>';
    }
    if (hi.pre) h += tr('<span>Шанс против 1 случайной руки</span><b>') + pct(hi.eq1) + '</b>';
    h += '</div>';
    if (hi.outs && hi.outs.outs.length) {
      const groups = Object.keys(hi.outs.byCat).sort((a, b) => power(+b) - power(+a)).map(k => C[k] + ': ' + hi.outs.byCat[k].length);
      h += tr('<div class="outs-list">До чего: ') + groups.join(' · ') + '</div>';
    }
    const showOdds = L.toCall > 0 && !hi.pre;
    h += tr('<div class="kv" style="margin-bottom:0"><span>Шанс выиграть против ') + hi.opp + ' ' + (hi.opp === 1 ? tr('соперника') : tr('соперников')) + '*</span><b>' + pct(hi.eq) + '</b></div>';
    h += '<div class="meter"><i style="width:' + (hi.eq * 100) + '%"></i>' + (showOdds ? '<u style="left:' + (hi.potOdds * 100) + tr('%" title="Нужно для колла"></u>') : '') + '</div>';
    if (showOdds) h += tr('<div class="kv" style="margin-top:0"><span>Нужно для выгодного колла</span><b>') + pct(hi.potOdds) + '</b></div>';
    if (hi.pre) h += tr('<p class="muted" style="font-size:14px;margin:4px 0 0">До флопа решают сила стартовой руки и позиция: многие соперники ещё сбросят карты, поэтому шанс против всех занижен.</p>');
    const a = hi.advice;
    h += '<div class="advice ' + a.action + '"><div class="verdict">' + VERDICT[a.action] + (a.action === 'raise' ? ' — ' + (L.isBet ? tr('ставка') : tr('рейз')) : '') + '</div><p>' + a.why + '</p></div>';
    if (L.potLimit) h += tr('<p class="muted" style="font-size:13px;margin:8px 0 0">Пот-лимит: повысить можно максимум до ') + fmt(L.maxTo) + tr(' (размер банка).</p>');
    h += tr('<p class="muted" style="font-size:12.5px;margin:8px 0 0">* Примерно, как если бы у соперников были случайные карты. Если соперник ставит много, его рука обычно сильнее.</p>');
    el.innerHTML = h;
  }

  // --- Разбор раздачи ---
  function actRu(d) {
    if (d.type === 'fold') return tr('фолд');
    if (d.type === 'check') return tr('чек');
    if (d.type === 'call') return tr('колл ') + fmt(d.toCall);
    return (d.isBet ? tr('ставка ') : tr('рейз до ')) + fmt(d.amount);
  }
  // Возвращает {cls: bad|soft|ok, k: тип ошибки для статистики, text}
  function reviewDecision(d) {
    const st = PK.STREET_RU[d.street], act = actRu(d);
    if (d.type === 'fold' && d.toCall === 0) return { cls: 'bad', k: 'freeFold', text: st + tr(': фолд, хотя можно было бесплатно сделать чек. Если чек доступен — не сбрасывайте.') };
    if (d.street === 'preflop') {
      const code = d.info.code, tt = d.info.tierText;
      if (d.type === 'fold' && d.advice !== 'fold' && d.info.tier >= 3) return { cls: 'bad', k: 'foldStrong', text: st + tr(': вы сбросили ') + code + tr(' — это ') + tt + tr('. Такие руки стоит играть.') };
      if (d.type === 'call' && d.advice === 'fold' && d.toCall > d.bb) return { cls: 'bad', k: 'weakCall', text: st + tr(': колл повышения с ') + code + ' (' + tt + tr('). Обычно это убыточно — лучше фолд.') };
      if (d.type === 'call' && d.advice === 'fold') return { cls: 'soft', k: 'limpWeak', text: st + tr(': колл ') + fmt(d.toCall) + tr(' с ') + code + ' (' + tt + tr('). Такую руку обычно сбрасывают — вход в банк стоит фишек.') };
      if ((d.type === 'call' || d.type === 'check') && d.advice === 'raise') return { cls: 'soft', k: 'passivePre', text: st + tr(': с ') + code + tr(' можно было повысить, а не просто ') + (d.type === 'check' ? tr('сделать чек') : tr('уравнять')) + '.' };
      if (d.type === 'raise' && d.info.tier === 0) return { cls: 'soft', k: 'bluff', text: st + ': ' + act + tr(' со слабой рукой ') + code + tr('. Это блеф; иногда работает, но новичку лучше блефовать редко.') };
      return { cls: 'ok', k: null, text: st + ': ' + act + tr(' с ') + code + tr(' — разумно.') };
    }
    const eqP = pct(d.eq), need = pct(d.potOdds);
    if (d.type === 'fold' && d.eq > d.potOdds + 0.07) return { cls: 'bad', k: 'badFold', text: st + tr(': фолд. Шанс был ≈') + eqP + tr(', а для колла хватало ') + need + tr(' — колл был бы выгоднее.') };
    if (d.type === 'call' && d.eq < d.potOdds - 0.07) return { cls: 'bad', k: 'badCall', text: st + tr(': колл ') + fmt(d.toCall) + tr('. Нужно было ≈') + need + tr(' шансов, а было ≈') + eqP + tr(' — на дистанции такой колл убыточен.') };
    if ((d.type === 'call' || d.type === 'check') && d.advice === 'raise' && d.eq >= 0.7) return { cls: 'soft', k: 'missedValue', text: st + ': ' + act + tr(' с очень сильной рукой (≈') + eqP + tr('). Ставка или рейз принесли бы больше фишек.') };
    if (d.type === 'raise' && d.eq < 0.25) return { cls: 'soft', k: 'bluff', text: st + ': ' + act + tr(' со слабой рукой (≈') + eqP + tr(') — это блеф. Он рискован, особенно против нескольких соперников.') };
    return { cls: 'ok', k: null, text: st + ': ' + act + tr(' — разумно (шанс ≈') + eqP + (d.toCall > 0 ? tr(', нужно ') + need : '') + ').' };
  }
  // Бот агрессивно ставил после флопа, а на вскрытии (или при открытых картах) у него ничего — это блеф.
  function bluffNotes() {
    const g = G.game, r = g.result, out = [], show = (G.cfg || TABLE_DEF).showCards;
    Object.keys(G.aggr).forEach(id => {
      id = +id; const p = g.players[id];
      if (id === HUMAN || !p || p.out) return;
      const shown = r.type === 'showdown' ? !p.folded : show;
      if (!shown || g.board.length < 3) return;
      const ev = PK.bestHand(VK, p.hole, g.board).ev;
      const br = g.board.map(PK.rankOf), boardPair = br.some((x, i) => br.indexOf(x) !== i);
      const nothing = ev.cat === 0 || (ev.cat === 1 && boardPair && br.indexOf(ev.ranks[0]) >= 0 && p.hole.map(PK.rankOf).indexOf(ev.ranks[0]) < 0);
      if (!nothing) return;
      const o = g.board.length < 5 ? PK.outsInfo(p.hole, g.board.slice(0, 4), VK) : null;
      const semi = o && o.outs.length >= 8;
      const fem = FEMALE.has(p.name);
      const v = { name: p.name, street: ({ flop: tr('на флопе'), turn: tr('на тёрне'), river: tr('на ривере') })[G.aggr[id]], cards: ctexts(p.hole) };
      out.push((fem ? tr('<b>{name}</b> ставила {street} с картами {cards} — ', v) : tr('<b>{name}</b> ставил {street} с картами {cards} — ', v)) +
        (semi ? tr('готовой комбинации не было, только дро. Это полублеф: ставка с надеждой либо выбить соперников, либо достроить руку.')
          : fem ? tr('у неё не было ничего. Это блеф: ставка, чтобы соперники сбросили карты получше.') : tr('у него не было ничего. Это блеф: ставка, чтобы соперники сбросили карты получше.')) +
        (p.folded ? '' : r.winners.indexOf(id) >= 0 ? tr(' Сработало.') : ''));
    });
    return out;
  }
  // Пояснение к подсветке на столе: какие 5 карт светятся и какие из них кикеры.
  function winCardsNote(r) {
    const main = r.pots.find(p => !p.returned);
    if (!main) return '';
    const w = r.hands[main.winners[0]], best = w.best, cat = w.ev.cat, K = PK.CAT;
    let h = tr('На столе подсвечены 5 карт, из которых собрана рука победителя: {cards}.', { cards: ctexts(best) });
    if (cat === K.PAIR || cat === K.TWO_PAIR || cat === K.TRIPS || cat === K.QUADS) {
      const cnt = {};
      best.forEach(c => { const rk = PK.rankOf(c); cnt[rk] = (cnt[rk] || 0) + 1; });
      const kick = best.filter(c => cnt[PK.rankOf(c)] === 1);
      const v = { cards: ctexts(kick) };
      h += ' ' + (kick.length === 1 ? tr('{cards} — кикер: в комбинации всегда 5 карт, и кикер решает, если у соперника та же комбинация.', v) : tr('{cards} — кикеры: в комбинации всегда 5 карт, и кикеры решают, если у соперника та же комбинация.', v));
    }
    return '<p class="muted win-note">' + h + '</p>';
  }
  function buildReview(net, items) {
    const g = G.game, r = g.result, me = g.players[HUMAN], P = g.players;
    let h = tr('<h3>Разбор раздачи #') + g.handNo + ' <span class="net ' + (net > 0 ? 'plus' : net < 0 ? 'minus' : '') + '">' + (net > 0 ? '+' : '') + fmt(net) + '</span></h3>';
    if (r.type === 'fold') h += '<p><b>' + P[r.winners[0]].name + '</b> ' + (r.winners[0] === HUMAN ? tr('забираете') : tr('забирает')) + tr(' банк ') + fmt(r.pots[0].amount) + tr(': все остальные сбросили карты, вскрытия не было.</p>');
    else r.pots.filter(p => !p.returned).forEach((pot, k) => {
      const names = pot.winners.map(id => P[id].name).join(tr(' и '));
      h += '<p>' + (k === 0 ? tr('Основной банк') : tr('Побочный банк ') + k) + ' (' + fmt(pot.amount) + '): <b>' + names + '</b> — ' + PK.lc(PK.describe(r.hands[pot.winners[0]].ev)) + (pot.winners.length > 1 ? tr(', делёж') : '') + '.</p>';
    });
    if (r.type === 'showdown') h += winCardsNote(r);
    const bl = bluffNotes();
    if (bl.length) h += tr('<h4>Блеф соперников</h4>') + bl.map(x => '<p class="bluff-note">' + x + '</p>').join('');
    if (!me.out) {
      const full = g.boardAll.slice(0, 5);
      if (g.board.length >= 3) {
        const mine = PK.bestHand(VK, me.hole, g.board);
        h += tr('<h4>Ваша рука</h4><p>') + ctexts(me.hole) + ' → ' + PK.lc(PK.describe(mine.ev)) + '.' + '</p>' + reasonsHTML(PKDrills.explainMade(me.hole, g.board, VK), 4) + '<p>';
        if (me.folded && r.type === 'showdown') {
          const my = PK.bestHand(VK, me.hole, full).ev, best = Math.max.apply(null, Object.keys(r.hands).map(id => r.hands[id].ev.score));
          h += tr(' Если бы вы дошли до конца: ') + PK.lc(PK.describe(my)) + ' — ' + (my.score > best ? tr('этого хватило бы для победы.') : my.score === best ? tr('был бы делёж.') : tr('этого не хватило бы.'));
        }
        h += '</p>';
      } else h += tr('<h4>Ваша рука</h4><p>') + ctexts(me.hole) + ' — ' + (G.handInfo ? G.handInfo.info.tierText : '') + tr('. До флопа дело не дошло.</p>') + reasonsHTML(PKDrills.explainStart(me.hole, VK), 4);
    }
    h += tr('<h4>Ваши решения</h4>');
    if (!items.length) h += tr('<p class="muted">В этой раздаче вам не пришлось принимать решений.</p>');
    else {
      const bad = items.filter(x => x.cls === 'bad').length;
      h += '<ul>' + items.map(x => '<li class="' + x.cls + '">' + x.text + '</li>').join('') + '</ul>';
      h += '<p class="muted" style="font-size:14px;margin-top:8px">' + (bad ? tr('Красным — решения, которые стоило принять иначе. Учтите: результат одной раздачи — это ещё и удача.') : tr('Серьёзных ошибок нет. Даже верные решения иногда проигрывают — важен результат на дистанции.')) + '</p>';
    }
    return h;
  }
  const logLine = e => {
    const cls = e.k === 'street' ? 'street' : e.k === 'info' ? 'info' : e.k === 'win' ? 'win' : (e.s === HUMAN ? 'me' : '');
    return '<div class="' + cls + '">' + colorize(e.t) + '</div>';
  };
  const logHTML = log => log.map(e => logLine({ t: e.text, k: e.kind, s: e.seat })).join('');
  function onHandDone() {
    const g = G.game;
    if (G.doneFor === g.handNo) { renderGame(); return; }
    G.doneFor = g.handNo;
    const r = g.result, me = g.players[HUMAN];
    if (!me.out) {
      const won = r.pots.some(p => !p.returned && p.winners.indexOf(HUMAN) >= 0);
      const net = (r.payouts[HUMAN] || 0) - me.total;
      if (won && net > 0) PKSound.play('win');
      const items = G.decisions.map(reviewDecision);
      G.review = buildReview(net, items);
      const D = G.decisions;
      const foldedPre = D.some(d => d.street === 'preflop' && d.type === 'fold');
      const showdown = r.type === 'showdown' && !me.folded;
      const winNames = r.winners.map(id => g.players[id].name).join(', ');
      const title = tr('Банк: ') + winNames + (r.type === 'showdown' ? ' (' + C[r.hands[r.winners[0]].ev.cat].toLowerCase() + ')' : '');
      const rec = PKStore.add('hands', {
        variant: VK, gameId: G.gameRec ? G.gameRec.id : null, handNo: g.handNo, bb: g.bb, sb: g.sb,
        pos: G.handInfo ? G.handInfo.pos : '?', tier: G.handInfo ? G.handInfo.info.tier : -1, code: G.handInfo ? G.handInfo.info.code : '',
        hole: me.hole.slice(), board: g.board.slice(), net, won,
        vpip: D.some(d => d.street === 'preflop' && (d.type === 'call' || d.type === 'raise')),
        pfr: D.some(d => d.street === 'preflop' && d.type === 'raise'),
        aggrPost: D.filter(d => d.street !== 'preflop' && d.type === 'raise').length,
        callsPost: D.filter(d => d.street !== 'preflop' && d.type === 'call').length,
        sawFlop: g.board.length >= 3 && !foldedPre, showdown, wonSD: showdown && won,
        decisions: D.map((d, i) => ({ s: d.street, t: d.type, c: items[i].cls, k: items[i].k, adv: d.advice, b: d.board, tc: d.toCall, pot: d.pot, ib: d.isBet,
          eq: d.eq != null ? Math.round(d.eq * 1000) / 1000 : null, po: Math.round(d.potOdds * 1000) / 1000, opp: d.opp, pos: d.pos, tx: items[i].text })),
        opp: G.cfg ? G.cfg.opp : 5, level: G.cfg ? G.cfg.level : 'normal',
        log: g.log.map(e => ({ t: e.text, k: e.kind, s: e.seat })), review: G.review, title
      });
      dataVer++;
      G.history.unshift({ rec });
      if (G.history.length > 150) G.history.pop();
      if (G.gameRec) { G.gameRec.hands = g.handNo; G.gameRec.finalStack = me.stack; }
    }
    const alive = g.players.filter(p => p.stack > 0);
    if (me.stack <= 0) { G.over = true; G.overText = tr('Фишки закончились на раздаче #') + g.handNo + tr('. Это нормально — даже профи проигрывают. Посмотрите разбор и начните заново.'); endGameRecord('bust'); }
    else if (alive.length === 1) { G.over = true; G.overText = tr('Победа! Вы забрали все фишки стола за ') + g.handNo + tr(' раздач.'); endGameRecord('win'); }
    else if (G.gameRec) PKStore.update('games', G.gameRec);
    renderGame();
  }

  // --- Отрисовка стола ---
  function renderGame() {
    if (!G.game) return;
    renderInfo(); renderTable(); renderActions(); renderHint(); renderReview(); renderLog(); renderHistory();
  }
  function renderInfo() {
    const g = G.game, k = g.handsToNextLevel(), n = g.players.filter(p => !p.out).length;
    const cf = G.cfg || TABLE_DEF;
    $('#game-info').innerHTML = '<span><b>' + V().short + '</b> · ' + (V().betting === 'pl' ? tr('пот-лимит') : tr('безлимит')) + tr('</span><span>Боты: <b>') + (cf.level === 'mixed' ? tr('смешанные') : PK.BOT_LEVELS[cf.level].label.toLowerCase()) + tr('</b></span><span>Раздача <b>#') + g.handNo + tr('</b></span><span>Блайнды <b>') + g.sb + '/' + g.bb + '</b></span>' +
      (k ? tr('<span>Рост через <b>') + k + '</b> ' + plural(k, 'раздачу', 'раздачи', 'раздач') + '</span>' : tr('<span>Блайнды максимальные</span>')) + tr('<span>За столом <b>') + n + '</b></span>';
  }
  function renderTable() {
    const g = G.game, r = g.result;
    let newIdx = 0;
    const anim = key => {
      if (G.seen.has(key)) return { cls: '', style: '' };
      G.seen.add(key);
      return { cls: 'deal', style: 'animation-delay:' + (newIdx++ * 60) + 'ms' };
    };
    const winCards = new Set();
    if (g.done && r && r.type === 'showdown') { const main = r.pots.find(p => !p.returned); if (main) r.hands[main.winners[0]].best.forEach(c => winCards.add(c)); }
    const winTip = tr('входит в лучшую пятёрку победителя');
    const runout = g.isRunout();
    let h = '<div class="rail"><div class="felt"></div></div>';
    let potText;
    if (g.done && r) potText = tr('Банк ') + fmt(Object.values(r.payouts).reduce((a, b) => a + b, 0)) + ' → ' + r.winners.map(id => g.players[id].name).join(', ');
    else potText = tr('Банк: ') + fmt(g.collected()) + (g.pot() !== g.collected() ? tr(' <span style="opacity:.7;font-weight:500" title="Ещё ') + fmt(g.pot() - g.collected()) + tr(' в ставках этого круга — попадут в банк после торгов">(+') + fmt(g.pot() - g.collected()) + ')</span>' : '');
    h += '<div class="board-zone"><div class="pot"><span class="chip"></span>' + potText + '</div><div class="board">';
    for (let k = 0; k < 5; k++) {
      if (k < g.board.length) { const c = g.board[k], a = anim('b' + k + '-' + c); h += cardHTML(c, { size: 'md', cls: [a.cls, winCards.has(c) ? 'win' : ''], tip: winCards.has(c) ? winTip : '', style: a.style }); }
      else h += cardHTML(null, { size: 'md', slot: true });
    }
    h += '</div><div class="street-tag">' + (g.done ? tr('Раздача окончена') : runout ? tr('Все в олл-ине — открываем карты') : PK.STREET_RU[g.street]) + '</div></div>';
    const many = V().hole > 2, showAll = g.done && (G.cfg || TABLE_DEF).showCards;
    g.players.forEach((p, i) => {
      const POSS = isPhone() ? SEAT_POS_PHONE : SEAT_POS;
      const pos = POSS[G.layout[i]] || POSS[i], me = i === HUMAN;
      const isWin = g.done && r && r.winners.indexOf(i) >= 0;
      const cls = ['seat', me ? 'me' : '', !g.done && g.toAct === i ? 'acting' : '', p.folded && !p.out ? 'folded' : '', p.out ? 'out' : '', isWin ? 'winner' : ''];
      let cards = '';
      if (!p.out && p.hole.length) {
        const reveal = me || showAll || (!p.folded && ((g.done && r && r.type === 'showdown') || runout));
        cards = p.hole.map((c, k) => {
          const a = anim('h' + i + '-' + k + '-' + (reveal ? c : 'x'));
          return reveal ? cardHTML(c, { size: me ? 'md' : 'sm', cls: [a.cls, winCards.has(c) ? 'win' : ''], tip: winCards.has(c) ? winTip : '', style: a.style }) : cardHTML(null, { size: 'sm', back: true, cls: a.cls, style: a.style });
        }).join('');
      }
      const badges = (i === g.sbSeat && !g.done ? tr('<span class="badge" title="Малый блайнд">МБ</span>') : '') + (i === g.bbSeat && !g.done ? tr('<span class="badge" title="Большой блайнд">ББ</span>') : '');
      const st = p.style && !me ? PK.STYLES[p.style] : null, lvl = !me && p.level ? LEVEL_ONE[p.level] : '';
      let act = '', actCls = '';
      if (p.out) act = tr('выбыл');
      else if (isWin) { act = '+' + fmt(r.payouts[i] || 0); actCls = 'win'; }
      else if (p.folded) { act = tr('фолд'); actCls = 'fold'; }
      else if (g.done) act = '';
      else if (g.toAct === i && !me) act = tr('думает…');
      else if (p.allIn) { act = tr('олл-ин'); actCls = 'raise'; }
      // «Малый/большой блайнд 200» не пишем: это самая широкая подпись, а блайнд и так виден по значку МБ/ББ и фишкам ставки
      else if (p.lastAction && p.lastKind !== 'blind') { act = p.lastAction; actCls = p.lastKind === 'raise' || p.lastKind === 'bet' ? 'raise' : ''; }
      const handLbl = g.done && r && r.type === 'showdown' && r.hands[i] ? '<div class="shand">' + C[r.hands[i].ev.cat] + '</div>' : '';
      h += '<div class="' + cls.filter(Boolean).join(' ') + '" data-seat="' + i + '" style="left:' + pos.x + ';top:' + pos.y + '">' +
        '<div class="scards' + (many ? ' many h' + V().hole : '') + '">' + cards + '</div><div class="sbox"><div class="sname">' + p.name + badges + '</div>' +
        (st ? '<div class="sstyle" title="' + st.full + ': ' + st.desc + (lvl ? tr(' Уровень: ') + lvl + '.' : '') + '">' + st.label + (lvl ? ' · ' + lvl : '') + '</div>' : tr('<div class="sstyle">это вы</div>')) +
        '<div class="sstack">' + fmt(p.stack) + '</div>' + handLbl + (act ? '<div class="sact ' + actCls + '">' + act + '</div>' : '') + '</div></div>';
      if (!g.done && p.bet > 0) h += '<div class="bet" data-bet="' + i + '" style="left:' + pos.b[0] + ';top:' + pos.b[1] + '"><span class="chip"></span>' + fmt(p.bet) + '</div>';
      if (i === g.button && !p.out) h += tr('<div class="dealer" title="Кнопка дилера" style="left:calc(') + pos.x + ' + ' + pos.d[0] + 'px);top:calc(' + pos.y + ' + ' + pos.d[1] + 'px)">D</div>';
    });
    if (G.over) h += '<div class="table-msg"><h3>' + (g.players[HUMAN].stack > 0 ? tr('🏆 Победа!') : tr('Игра окончена')) + '</h3><p>' + G.overText + tr('</p><button class="btn primary big" data-act="restart">Новая игра</button></div>');
    $('#table').innerHTML = h;
    chipFx();
  }
  // --- Анимация фишек: ставка → перед игроком, конец улицы → в банк, выигрыш → к победителю ---
  const reduceMotion = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  function centerOf(el, base) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top }; }
  function flyChip(from, to, delay) {
    const fx = $('#fx'); if (!fx || !from || !to) return;
    const c = document.createElement('div'); c.className = 'fly-chip';
    fx.appendChild(c);
    const a = c.animate([{ transform: 'translate(' + from.x + 'px,' + from.y + 'px) scale(.9)', opacity: 1 }, { transform: 'translate(' + to.x + 'px,' + to.y + 'px) scale(1)', opacity: 1 }], { duration: 420, delay: delay || 0, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' });
    a.onfinish = () => c.remove();
    setTimeout(() => c.remove(), 1500 + (delay || 0));
  }
  function chipFx() {
    const g = G.game, fx = $('#fx'), table = $('#table');
    if (!g || !fx || reduceMotion || !fx.animate) { if (g) G.prevBets = g.players.map(p => p.bet); return; }
    const base = table.getBoundingClientRect(), potEl = $('#table .pot');
    const pot = potEl ? centerOf(potEl, base) : null;
    const seatC = i => { const el = $('#table [data-seat="' + i + '"] .sbox'); return el ? centerOf(el, base) : null; };
    const prev = G.prevBets || [];
    g.players.forEach((p, i) => {
      const betEl = $('#table [data-bet="' + i + '"]');
      if (betEl) { const c = centerOf(betEl, base); if (p.bet > (prev[i] || 0)) flyChip(seatC(i), c); G.betPos[i] = c; }
      else if ((prev[i] || 0) > 0 && pot) { flyChip(G.betPos[i], pot); delete G.betPos[i]; }
    });
    if (g.done && g.result && G.fxDone !== g.handNo && pot) {
      G.fxDone = g.handNo;
      g.result.winners.forEach((w, k) => { for (let n = 0; n < 3; n++) flyChip(pot, seatC(w), 250 + k * 120 + n * 70); });
    }
    G.prevBets = g.players.map(p => p.bet);
  }
  function clampRaise(x, L) { const g = G.game; x = Math.round(x / g.sb) * g.sb; return Math.max(L.minTo, Math.min(L.maxTo, x)); }
  function quickRaise(kind, L) {
    const g = G.game;
    if (kind === 'min') return L.minTo;
    if (kind === 'allin') return L.maxTo;
    const base = L.pot + L.toCall;
    if (kind === 'half') return clampRaise(g.currentBet + base * 0.5, L);
    if (kind === 'pot') return clampRaise(g.currentBet + base, L);
    return L.minTo;
  }
  function raiseLabel(x, L) { return x >= L.allInTo ? tr('Олл-ин ') + fmt(x) : (L.potLimit && x >= L.maxTo ? tr('Банк: ') : '') + (L.isBet ? tr('Ставка ') : tr('Рейз до ')) + fmt(x); }
  function renderActions() {
    const g = G.game, el = $('#action-bar'), p = g.players[HUMAN];
    if (G.over) { el.innerHTML = '<div class="act-status">' + G.overText + tr('</div><div class="act-buttons"><button class="btn primary" data-act="restart">Новая игра</button></div>'); return; }
    if (g.done) {
      const net = (g.result.payouts[HUMAN] || 0) - p.total;
      el.innerHTML = tr('<div class="act-status">Раздача #') + g.handNo + tr(' окончена. Ваш результат: <span class="net ') + (net > 0 ? 'plus' : net < 0 ? 'minus' : '') + '">' + (net > 0 ? '+' : '') + fmt(net) + '</span></div>' +
        tr('<div class="act-buttons"><button class="btn primary" data-act="next">Следующая раздача <kbd>Enter</kbd></button></div>');
      return;
    }
    const my = g.toAct === HUMAN, L = g.legal(HUMAN);
    let status;
    if (my) status = tr('<b>Ваш ход.</b> ') + (L.toCall > 0 ? tr('Чтобы остаться в игре, нужно доставить <b>') + fmt(L.callAmt) + '</b>.' : tr('Можно сделать чек бесплатно.')) + tr(' Всего в банке ') + fmt(L.pot) + '.';
    else if (p.folded) status = tr('Вы сбросили карты — доигрываем раздачу…');
    else if (g.awaitingDeal) status = g.isRunout() ? tr('Ставок больше не будет — открываем оставшиеся карты…') : tr('Раздаём следующую карту…');
    else status = tr('Ходит <b>') + g.players[g.toAct].name + '</b>…';
    const rkey = g.handNo + '|' + g.street + '|' + g.currentBet;
    if (my && G.raiseFor !== rkey) {
      G.raiseFor = rkey;
      G.raiseTo = g.street === 'preflop' ? clampRaise(g.currentBet > g.bb ? g.currentBet * 3 : g.bb * 3, L) : quickRaise('half', L);
    }
    const dis = my ? '' : ' disabled';
    const callLbl = L.toCall === 0 ? tr('Чек') : (L.callAmt >= p.stack ? tr('Олл-ин ') + fmt(L.callAmt) : tr('Колл ') + fmt(L.callAmt));
    let html = '<div class="act-status">' + status + '</div><div class="act-buttons">' +
      '<button class="btn danger" data-act="fold"' + dis + tr('>Фолд <kbd>F</kbd></button>') +
      '<button class="btn" data-act="call"' + dis + '>' + callLbl + ' <kbd>C</kbd></button>' +
      '<button class="btn primary" data-act="raise" id="raise-btn"' + (my && L.canRaise ? '' : ' disabled') + '>' + (L.canRaise ? raiseLabel(G.raiseTo || L.minTo, L) : tr('Рейз')) + ' <kbd>R</kbd></button></div>';
    if (my && L.canRaise) {
      const maxLbl = L.maxTo >= L.allInTo ? tr('Олл-ин') : tr('Макс. (банк)');
      html += tr('<div class="raise-box"><span class="lbl">Размер:</span><input type="range" id="raise-slider" min="') + L.minTo + '" max="' + L.maxTo + '" step="' + g.sb + '" value="' + G.raiseTo + '">' +
        '<input type="number" id="raise-input" min="' + L.minTo + '" max="' + L.maxTo + '" step="' + g.sb + '" value="' + G.raiseTo + '">' +
        tr('<button class="btn small" data-q="min">Мин</button><button class="btn small" data-q="half">½ банка</button>') + (L.potLimit ? '' : tr('<button class="btn small" data-q="pot">Банк</button>')) +
        '<button class="btn small" data-q="allin">' + maxLbl + ' <kbd>A</kbd></button></div>';
    } else if (my && !L.canRaise && L.toCall > 0 && L.callAmt < p.stack) {
      html += tr('<div class="raise-box"><span class="lbl">Повышать нельзя: предыдущий олл-ин был меньше полного рейза, поэтому торги для вас не открылись заново. Можно только колл или фолд.</span></div>');
    }
    el.innerHTML = html;
  }
  function setRaise(x) {
    const L = G.game.legal(HUMAN);
    G.raiseTo = clampRaise(x, L);
    const s = $('#raise-slider'), n = $('#raise-input'), b = $('#raise-btn');
    if (s) s.value = G.raiseTo;
    if (n && document.activeElement !== n) n.value = G.raiseTo;
    if (b) b.innerHTML = raiseLabel(G.raiseTo, L) + ' <kbd>R</kbd>';
  }
  function humanAct(type) {
    const g = G.game;
    if (!g || g.done || g.toAct !== HUMAN || G.over) return;
    const L = g.legal(HUMAN);
    if (type === 'raise' && !L.canRaise) return;
    if (type === 'fold' && L.toCall === 0 && !confirm(tr('Сейчас можно бесплатно сделать чек. Всё равно сбросить карты?'))) return;
    const hint = getHint();
    const a = { type: type === 'call' && L.toCall === 0 ? 'check' : type };
    if (type === 'raise') { const n = $('#raise-input'); a.amount = clampRaise(n ? +n.value || G.raiseTo : G.raiseTo, L); }
    const d = { street: g.street, toCall: L.toCall, pot: L.pot, eq: hint.eq, potOdds: hint.potOdds, advice: hint.advice.action, info: hint.info || (G.handInfo && G.handInfo.info), bb: g.bb, isBet: L.isBet, amount: a.amount,
      board: g.board.slice(), opp: hint.opp, pos: hint.pos ? hint.pos.short : (G.handInfo ? G.handInfo.pos : '?') };
    d.type = g.act(HUMAN, a);
    PKSound.play(d.type === 'fold' ? 'fold' : d.type === 'check' ? 'check' : 'chip');
    G.decisions.push(d);
    renderGame(); schedule();
  }
  function renderReview() {
    $('#review-panel').innerHTML = G.review || tr('<h3>Разбор раздачи</h3><p class="muted" style="margin:0">После каждой раздачи здесь появится разбор: что было у вас, что у победителя и какие решения стоило принять иначе. Все раздачи сохраняются для статистики.</p>');
  }
  function renderLog() { const el = $('#log'); el.innerHTML = logHTML(G.game.log); el.scrollTop = el.scrollHeight; }
  function histItem(r, attr) {
    return '<button class="hist-item" ' + attr + '><span class="no">#' + r.handNo + '</span><span>' + ctexts(r.hole) + ' · ' + esc(r.title || '') + '</span><span class="net ' + (r.net > 0 ? 'plus' : r.net < 0 ? 'minus' : '') + '">' + (r.net > 0 ? '+' : '') + fmt(r.net) + '</span></button>';
  }
  function renderHistory() {
    const el = $('#history');
    if (!G.history.length) { el.innerHTML = tr('<p class="muted" style="margin:0;font-size:15px">Пока пусто.</p>'); return; }
    el.innerHTML = G.history.map(x => histItem(x.rec, 'data-hand="' + x.rec.id + '"')).join('');
  }
  function showHand(id) {
    const x = PKStore.all('hands').find(r => r.id === id);
    if (!x) return;
    const date = new Date(x.ts).toLocaleString(PKI18n.locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    const vn = PK.VARIANTS[x.variant] ? PK.VARIANTS[x.variant].short : x.variant;
    showModal(vn + tr(' · раздача #') + x.handNo + ' · ' + date,
      tr('<p>Ваши карты: ') + miniCards(x.hole) + (x.board.length ? tr(' &nbsp; Стол: ') + miniCards(x.board) : '') + tr(' &nbsp; Позиция: <b>') + esc(x.pos) + tr('</b>, блайнды ') + x.sb + '/' + x.bb + '</p>' +
      '<div class="review">' + (x.review || '') + tr('</div><h4 style="margin:16px 0 6px">Все действия</h4><div class="log" style="max-height:none">') + (x.log || []).map(logLine).join('') + '</div>');
  }
  function showModal(title, html) {
    $('#modal-root').innerHTML = '<div class="modal-back" data-close="1"><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>' + title + tr('</h3><button class="btn small" data-close="1">Закрыть <kbd>Esc</kbd></button></div>') + html + '</div></div>';
  }
  const closeModal = () => { $('#modal-root').innerHTML = ''; };

  // ======================================================================
  // ПРАВИЛА
  // ======================================================================
  const PROB7 = ['17,4%', '43,8%', '23,5%', '4,8%', '4,6%', '3,0%', '2,6%', '0,17%', '0,03%', '0,003%'];
  function renderRulesTable() {
    let h = tr('<tr><th>#</th><th>Комбинация</th><th>Пример</th><th>Что это</th><th>Вероятность</th></tr>');
    for (let c = 9; c >= 0; c--) {
      h += '<tr><td class="rk">' + (10 - c) + '</td><td class="nm">' + C[c] + '</td><td><span class="cards-inline">' + PK.parseCards(EX_STD[c]).map(x => cardHTML(x, { size: 'xs' })).join('') + '</span></td><td>' + PK.CAT_DEFS[c] + '</td><td class="pr">' + PROB7[c] + '</td></tr>';
    }
    $('#combo-table').innerHTML = h;
  }
  function renderRulesVariant() {
    $$('.variant-card').forEach(el => el.classList.toggle('current', el.dataset.v === VK));
  }

  // ======================================================================
  // СТАТИСТИКА И АНАЛИЗ
  // ======================================================================
  const VIEWS = { overview: tr('Обзор'), trainer: tr('Тренажёр'), game: tr('Игра'), data: tr('Данные') };
  const PERIODS = { 7: tr('7 дней'), 30: tr('30 дней'), all: tr('Всё время') };
  const MODE_NAMES = { name: tr('Назови комбинацию'), best: tr('Лучшая рука'), winner: tr('Кто выиграл?'), speed: tr('Скоростной'), odds: tr('Шансы и ауты'), preflop: tr('Играть или сбросить'), spot: tr('Ситуации'), review: tr('Мои ошибки') };
  const SUB_NAMES = { outs: tr('сколько аутов'), prob: tr('шанс улучшиться'), pot: tr('выгоден ли колл'), open: tr('первым в банк'), raise: tr('против повышения'), preflop: tr('префлоп'), flop: tr('флоп'), turn: tr('тёрн'), river: tr('ривер') };
  function statsFilter() {
    const p = settings.statsPeriod;
    return { variant: settings.statsVariant || 'all', since: p === 'all' ? 0 : Date.now() - (+p) * 86400000 };
  }
  const statusText = { low: tr('ниже нормы'), high: tr('выше нормы'), ok: tr('в норме') };
  function kpi(v, label, sub, status) {
    return '<div class="panel stat-card' + (status ? ' st-' + status : '') + '"><div class="v">' + v + '</div><div class="l">' + label + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>';
  }
  // SVG-график: столбики по дням (высота — число ответов, цвет — точность)
  function dayBars(days) {
    const W = 600, H = 150, pad = 22, max = Math.max(1, ...days.map(d => d.n)), bw = (W - pad) / days.length;
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + (H + 22) + tr('" role="img" aria-label="Ответы и точность по дням">');
    s += '<line x1="' + pad + '" y1="' + H + '" x2="' + W + '" y2="' + H + '" class="axis"/>';
    s += '<text x="0" y="12" class="tick">' + max + '</text><text x="0" y="' + H + '" class="tick">0</text>';
    days.forEach((d, i) => {
      const h = d.n / max * (H - 10), x = pad + i * bw + 2;
      const col = d.acc == null ? 'none' : d.acc < 0.6 ? 'var(--bad)' : d.acc < 0.85 ? 'var(--warn)' : 'var(--good)';
      if (d.n) s += '<rect x="' + x + '" y="' + (H - h) + '" width="' + Math.max(2, bw - 4) + '" height="' + h + '" rx="3" fill="' + col + '"><title>' + d.label + ': ' + d.n + tr(' ответов, верно ') + pct(d.acc) + '</title></rect>';
      if (i % 5 === 4 || i === days.length - 1) s += '<text x="' + (x + bw / 2 - 2) + '" y="' + (H + 16) + '" class="tick" text-anchor="middle">' + d.label + '</text>';
    });
    return s + '</svg>';
  }
  // SVG-график: накопленный результат в больших блайндах
  function lineChart(vals) {
    if (vals.length < 2) return tr('<p class="muted">Нужно хотя бы две раздачи.</p>');
    const W = 600, H = 170, pad = 34;
    const mn = Math.min(0, ...vals), mx = Math.max(0, ...vals), span = mx - mn || 1;
    const X = i => pad + i / (vals.length - 1) * (W - pad - 6), Y = v => 8 + (mx - v) / span * (H - 16);
    const pts = vals.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ');
    const last = vals[vals.length - 1], col = last >= 0 ? 'var(--good)' : 'var(--bad)';
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + (H + 18) + tr('" role="img" aria-label="Накопленный результат">') +
      '<line x1="' + pad + '" y1="' + Y(0) + '" x2="' + W + '" y2="' + Y(0) + '" class="axis"/>' +
      '<text x="0" y="' + (Y(mx) + 4) + '" class="tick">' + Math.round(mx) + '</text><text x="0" y="' + (Y(mn) + 4) + '" class="tick">' + Math.round(mn) + '</text>' +
      '<polyline points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<text x="' + (W - 4) + '" y="' + (H + 14) + tr('" class="tick" text-anchor="end">раздач: ') + vals.length + tr(' · итог ') + (last > 0 ? '+' : '') + last.toFixed(1) + tr(' ББ</text></svg>');
  }
  function insightsHTML(list) {
    const icon = { bad: '!', warn: '•', good: '✓', info: 'i' };
    return '<div class="insights">' + list.map(x => '<div class="ins ' + x.lvl + '"><span class="ic">' + icon[x.lvl] + '</span><div><div class="it">' + (x.area ? '<span class="area">' + x.area + '</span>' : '') + esc(x.title) + '</div><div class="ix">' + esc(x.text) + '</div></div></div>').join('') + '</div>';
  }
  function catTable(t, vk) {
    const order = (PK.VARIANTS[vk] || PK.VARIANTS.holdem).order.slice().reverse();
    const color = a => a == null ? 'var(--border-strong)' : a < 0.6 ? 'var(--bad)' : a < 0.85 ? 'var(--warn)' : 'var(--good)';
    let h = tr('<div class="tbl-wrap"><table class="stat-table"><tr><th>Комбинация</th><th class="num">Попыток</th><th class="num">Точность</th><th class="num">Послед. 20</th><th class="num">Время</th><th></th></tr>');
    for (const c of order) {
      const x = t.cats[c];
      const trend = x.recentAcc != null && x.acc != null && x.seen >= 10 ? (x.recentAcc - x.acc > 0.05 ? ' <span class="up">▲</span>' : x.acc - x.recentAcc > 0.05 ? ' <span class="down">▼</span>' : '') : '';
      h += '<tr><td><b>' + C[c] + '</b></td><td class="num">' + x.seen + '</td><td class="num">' + pct(x.acc) + '</td><td class="num">' + pct(x.recentAcc) + trend + '</td><td class="num">' + (x.ms != null ? (x.ms / 1000).toFixed(1) + tr(' с') : '—') + '</td>' +
        '<td><div class="bar"><i style="width:' + (x.acc == null ? 0 : x.acc * 100) + '%;background:' + color(x.acc) + '"></i></div></td></tr>';
    }
    return h + '</table></div>';
  }
  function confMatrix(t) {
    if (!t.confList.length) return tr('<p class="muted">Ошибок в узнавании комбинаций пока нет — или ещё мало ответов в режимах «Назови комбинацию» и «Скоростной».</p>');
    const rows = [], cols = new Set();
    t.confList.forEach(x => { cols.add(x.chosen); if (rows.indexOf(x.actual) < 0) rows.push(x.actual); });
    const cl = Array.from(cols).sort((a, b) => b - a), rl = rows.sort((a, b) => b - a);
    const max = Math.max(...t.confList.map(x => x.n));
    let h = tr('<div class="conf-wrap"><table class="conf"><tr><th class="corner">Было ↓ / Ответ →</th>') + cl.map(c => '<th>' + C[c] + '</th>').join('') + '</tr>';
    rl.forEach(a => {
      h += '<tr><th>' + C[a] + '</th>' + cl.map(b => { const n = t.conf[a][b]; return '<td' + (n ? ' style="--k:' + (0.15 + 0.85 * n / max).toFixed(2) + '" class="hot" title="' + C[a] + tr(' → ответ «') + C[b] + '»: ' + n + tr(' раз"') : '') + '>' + (n || '') + '</td>'; }).join('') + '</tr>';
    });
    h += '</table></div>';
    const top = t.confList.slice(0, 3).map(x => '<li><b>' + C[x.actual] + ' → «' + C[x.chosen] + '»</b> (' + x.n + '): ' + esc(PKStats.confTip(x.actual, x.chosen)) + '</li>').join('');
    return h + '<ul class="tips">' + top + '</ul>';
  }
  function gameKpis(g, vk) {
    const N = PKStats.normsFor(vk), R = g.rates, rs = PKStats.rateStatus;
    const rng = r => pct(r[0]) + '–' + pct(r[1]);
    const af = R.af == null ? '—' : isFinite(R.af) ? R.af.toFixed(1) : '∞';
    const st = (ok, val, range) => ok && val != null ? rs(val, range) : null;
    const note = s => s ? ' · ' + statusText[s] : '';
    const sV = st(g.n >= 25, R.vpip, N.vpip), sP = st(g.n >= 25, R.pfr, N.pfr);
    const sA = st(g.callsPost + g.aggrPost >= 15, R.af == null ? null : isFinite(R.af) ? R.af : 99, N.af);
    const sW = st(g.sawFlop >= 20, R.wtsd, N.wtsd), sS = st(g.showdown >= 15, R.wsd, N.wsd);
    return '<div class="stats-top g7">' +
      kpi(g.n, tr('раздач сыграно'), tr('выиграно ') + g.won + (g.n ? ' (' + pct(R.winRate) + ')' : '')) +
      kpi(R.bb100 == null ? '—' : (R.bb100 > 0 ? '+' : '') + R.bb100.toFixed(1), tr('ББ на 100 раздач'), tr('итог ') + (g.netBB > 0 ? '+' : '') + g.netBB.toFixed(1) + tr(' ББ'), R.bb100 == null ? null : R.bb100 >= 0 ? 'ok' : 'low') +
      kpi(pct(R.vpip), tr('VPIP — входите в банк'), tr('норма ') + rng(N.vpip) + note(sV), sV) +
      kpi(pct(R.pfr), tr('PFR — повышаете до флопа'), tr('норма ') + rng(N.pfr) + note(sP), sP) +
      kpi(af, tr('AF — агрессия после флопа'), tr('ставки ÷ коллы, норма ') + N.af[0] + '–' + N.af[1] + note(sA), sA) +
      kpi(pct(R.wtsd), tr('WTSD — доходите до вскрытия'), tr('от увиденных флопов, норма ') + rng(N.wtsd) + note(sW), sW) +
      kpi(pct(R.wsd), tr('W$SD — выигрываете вскрытия'), tr('норма ') + rng(N.wsd) + note(sS), sS) + '</div>';
  }
  function renderStats() {
    const f = statsFilter(), vk = f.variant === 'all' ? 'holdem' : f.variant;
    const t = PKStats.trainer(PKStore.all('answers'), f);
    const g = PKStats.game(PKStore.all('hands'), PKStore.all('games'), f);
    const view = VIEWS[settings.statsView] ? settings.statsView : 'overview';
    const bar = '<div class="panel stats-bar"><div class="seg" id="st-view">' + Object.keys(VIEWS).map(k => '<button data-view="' + k + '" class="' + (k === view ? 'on' : '') + '">' + VIEWS[k] + '</button>').join('') + '</div>' +
      tr('<div class="flts"><label class="flt">Вариант <select id="st-variant"><option value="all">Все варианты</option>') + Object.keys(PK.VARIANTS).map(k => '<option value="' + k + '"' + (f.variant === k ? ' selected' : '') + '>' + PK.VARIANTS[k].short + '</option>').join('') + '</select></label>' +
      tr('<label class="flt">Период <select id="st-period">') + Object.keys(PERIODS).map(k => '<option value="' + k + '"' + (String(settings.statsPeriod) === k ? ' selected' : '') + '>' + PERIODS[k] + '</option>').join('') + '</select></label></div></div>';
    let body = '';
    const legacy = PKStore.getMeta('legacy');
    if (view === 'overview') {
      body += '<div class="stats-top">' + kpi(t.n, tr('ответов в тренажёре'), t.n ? tr('верно ') + t.ok : '') + kpi(pct(t.acc), tr('точность'), t.progress ? tr('последние ') + t.progress.window + ': ' + pct(t.progress.after) : '') +
        kpi(PKStore.getMeta('bestStreak', 0), tr('лучшая серия подряд'), tr('за всё время')) + kpi(g.n, tr('раздач за столом'), tr('выиграно ') + g.won) +
        kpi(g.rates.bb100 == null ? '—' : (g.rates.bb100 > 0 ? '+' : '') + g.rates.bb100.toFixed(1), tr('ББ на 100 раздач'), tr('результат против ботов'), g.rates.bb100 == null ? null : g.rates.bb100 >= 0 ? 'ok' : 'low') + '</div>';
      body += tr('<div class="stats-grid"><div class="panel"><h3>Что улучшить</h3><p class="muted sm">Выводы по вашим ответам и раздачам') + (f.variant === 'all' ? tr(' (нормы — как для холдема)') : ' (' + PK.VARIANTS[f.variant].short + ')') + '.</p>' + insightsHTML(PKStats.insights(t, g, vk)) + '</div>' +
        tr('<div class="col"><div class="panel"><h3>Тренажёр по дням</h3><p class="muted sm">Высота — сколько ответов, цвет — точность (зелёный ≥ 85%, жёлтый ≥ 60%).</p>') + dayBars(t.days) + '</div>' +
        tr('<div class="panel"><h3>Результат за столом</h3><p class="muted sm">Накопленный выигрыш в больших блайндах (ББ) — так результат не зависит от роста блайндов.</p>') + lineChart(g.curve.slice(-400)) + '</div></div></div>';
      body += '<div class="stats-grid" style="margin-top:18px"><div class="panel">' + beltPanel(f.variant === 'all' ? VK : f.variant) + '</div><div class="panel">' + weeklyPanel(f) + '</div></div>';
      if (legacy && (legacy.cats || legacy.hands) && (f.variant === 'all' || f.variant === 'holdem')) body += tr('<p class="muted sm" style="margin-top:12px">Из первой версии тренера перенесены итоговые счётчики (без подробностей): ') + (legacy.cats ? legacy.cats.reduce((a, c) => a + c.seen, 0) : 0) + tr(' ответов и ') + (legacy.hands || 0) + tr(' раздач. Они учитываются в подборе заданий и шпаргалке, но не в этих графиках.</p>');
    } else if (view === 'trainer') {
      body += tr('<div class="stats-grid"><div class="panel"><h3>Точность по комбинациям</h3><p class="muted sm">«Время» — медиана, за сколько вы отвечаете. ▲▼ — последние 20 ответов лучше или хуже среднего.') + (f.variant === 'all' ? tr(' Порядок — как в холдеме.') : '') + '</p>' + catTable(t, vk) + '</div>' +
        tr('<div class="col"><div class="panel"><h3>По режимам</h3><table class="stat-table"><tr><th>Режим</th><th class="num">Ответов</th><th class="num">Точность</th><th class="num">Время</th></tr>') +
        Object.keys(MODE_NAMES).map(k => {
          const m = t.modes[k];
          let row = '<tr><td>' + MODE_NAMES[k] + '</td><td class="num">' + (m ? m.seen : 0) + '</td><td class="num">' + (m ? pct(m.acc) : '—') + '</td><td class="num">' + (m && m.ms ? (m.ms / 1000).toFixed(1) + tr(' с') : '—') + '</td></tr>';
          if (m && m.subs) Object.keys(m.subs).forEach(sk => { const x = m.subs[sk]; row += '<tr class="sub-row"><td>— ' + (SUB_NAMES[sk] || sk) + '</td><td class="num">' + x.seen + '</td><td class="num">' + pct(x.acc) + '</td><td></td></tr>'; });
          return row;
        }).join('') + '</table>' +
        (t.rule && t.rule.n ? tr('<p class="muted sm" style="margin-top:10px">Омаха, «Лучшая рука»: правило «2 + 3» нарушено в ') + t.rule.bad + tr(' из ') + t.rule.n + tr(' ответов.</p>') : '') + '</div>' +
        tr('<div class="panel"><h3>Рекорды скоростного режима</h3><table class="stat-table"><tr><th>Вариант</th><th class="num">5 карт</th><th class="num">Вся раздача</th></tr>') +
        Object.keys(PK.VARIANTS).map(k => { const sp = PKStore.getMeta('speed', {}); return '<tr><td>' + PK.VARIANTS[k].short + '</td><td class="num">' + (sp[k + ':5'] || '—') + '</td><td class="num">' + (sp[k + ':full'] || '—') + '</td></tr>'; }).join('') + '</table></div></div></div>' +
        tr('<div class="panel" style="margin-top:18px"><h3>Что с чем вы путаете</h3><p class="muted sm">Строки — какая комбинация была на самом деле, столбцы — что вы ответили. Чем ярче клетка, тем чаще ошибка.</p>') + confMatrix(t) + '</div>' +
        tr('<div class="panel" style="margin-top:18px"><h3>Активность по дням</h3>') + dayBars(t.days) + '</div>';
    } else if (view === 'game') {
      body += gameKpis(g, vk);
      const posOrder = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
      const posName = { UTG: tr('Ранняя (UTG)'), MP: tr('Средняя (MP)'), CO: tr('Поздняя (CO)'), BTN: tr('Баттон'), SB: tr('Малый блайнд'), BB: tr('Большой блайнд') };
      const tierName = [tr('Слабые'), tr('Спекулятивные'), tr('Средние'), tr('Сильные'), tr('Премиум')];
      const netCell = v => '<span class="net ' + (v > 0 ? 'plus' : v < 0 ? 'minus' : '') + '">' + (v > 0 ? '+' : '') + v.toFixed(1) + '</span>';
      const posRows = posOrder.concat(Object.keys(g.byPos).filter(p => posOrder.indexOf(p) < 0)).filter(p => g.byPos[p]);
      body += tr('<div class="stats-grid"><div class="col"><div class="panel"><h3>Накопленный результат, ББ</h3>') + lineChart(g.curve.slice(-400)) + '</div>' +
        tr('<div class="panel"><h3>По позициям</h3><p class="muted sm">Обычно поздние позиции (CO, баттон) самые прибыльные, а блайнды — убыточные.</p>') +
        (posRows.length ? tr('<table class="stat-table"><tr><th>Позиция</th><th class="num">Раздач</th><th class="num">VPIP</th><th class="num">Итог, ББ</th></tr>') +
          posRows.map(p => { const x = g.byPos[p]; return '<tr><td>' + (posName[p] || p) + '</td><td class="num">' + x.n + '</td><td class="num">' + pct(x.vpip / x.n) + '</td><td class="num">' + netCell(x.netBB) + '</td></tr>'; }).join('') + '</table>' : tr('<p class="muted">Пока нет раздач.</p>')) + '</div>' +
        tr('<div class="panel"><h3>По силе стартовой руки</h3><p class="muted sm">Хорошо, когда со слабыми руками VPIP низкий, а с сильными — высокий.</p>') +
        (g.n ? tr('<table class="stat-table"><tr><th>Рука</th><th class="num">Раздач</th><th class="num">Играли</th><th class="num">Итог, ББ</th></tr>') +
          g.byTier.map((x, i) => x.n ? '<tr><td>' + tierName[i] + '</td><td class="num">' + x.n + '</td><td class="num">' + pct(x.vpip / x.n) + '</td><td class="num">' + netCell(x.netBB) + '</td></tr>' : '').reverse().join('') + '</table>' : tr('<p class="muted">Пока нет раздач.</p>')) + '</div></div>' +
        tr('<div class="col"><div class="panel"><h3>Качество решений по улицам</h3><p class="muted sm">По тем же правилам, что и разбор после раздачи.</p>') + streetBars(g) + '</div>' +
        tr('<div class="panel"><h3>Типичные ошибки</h3>') + kindsList(g) + '</div>' +
        tr('<div class="panel"><h3>Последние раздачи</h3><p class="muted sm">Нажмите, чтобы открыть разбор.</p><div class="history">') + (g.recent.length ? g.recent.map(r => histItem(r, 'data-hand="' + r.id + '"')).join('') : tr('<p class="muted">Пока нет.</p>')) + '</div></div></div></div>';
    } else body += dataView();
    $('#stats').innerHTML = bar + body;
    if (view === 'data') refreshEstimate();
  }
  function beltPanel(vk) {
    const stored = PKStore.getMeta('belts', {});
    const b = PKDrills.belt(PKStore.all('answers'), PKStore.all('hands'), vk, stored[vk] || 0);
    const act = PKStats.activity(PKStore.all('answers'), PKStore.all('hands'), settings.dailyGoal);
    let h = tr('<h3>Пояс и цели · ') + PK.VARIANTS[vk].short + tr('</h3><p class="muted sm">Пояса — лестница навыков: каждый следующий открывается, когда выполнено условие. Считаются отдельно для каждого варианта покера.</p><ol class="belt-ladder">');
    b.steps.forEach((st, i) => {
      const done = i < b.level, cur = i === b.level, bb = PKDrills.BELTS[i + 1];
      h += '<li class="' + (done ? 'done' : cur ? 'cur' : '') + '"><span class="belt-dot" style="background:' + bb.color + '"></span><div><b>' + bb.name + '</b> — ' + esc(st.title) + (done ? ' <span class="okmark">✓</span>' : cur ? tr('<div class="muted sm">Сейчас: ') + esc(st.text) + '</div>' : '') + '</div></li>';
    });
    h += tr('</ol><div class="kv-row"><span>Сегодня: <b>') + act.today + '</b>' + (settings.dailyGoal ? tr(' из ') + settings.dailyGoal : '') + tr('</span><span>Серия дней с целью: <b>') + act.streak + tr('</b></span><span>Лучшая серия: <b>') + act.bestStreak + tr('</b></span><span>Дней с занятиями: <b>') + act.activeDays + '</b></span></div>';
    return h;
  }
  function weeklyPanel(f) {
    const W = PKStats.weekly(PKStore.all('answers'), PKStore.all('hands'), f, 8);
    if (!W.some(w => w.answers || w.hands)) return tr('<h3>По неделям</h3><p class="muted">Пока нет данных.</p>');
    const maxA = Math.max(1, ...W.map(w => w.answers));
    const cmp = (a, b, better) => a == null || b == null ? '' : Math.abs(a - b) < 0.005 ? '' : (better(a, b) ? ' <span class="up">▲</span>' : ' <span class="down">▼</span>');
    let h = tr('<h3>По неделям</h3><p class="muted sm">Как меняются ваши результаты. ▲▼ — сравнение с предыдущей неделей.</p><div class="tbl-wrap"><table class="stat-table"><tr><th>Неделя с</th><th class="num">Ответов</th><th class="num">Точность</th><th class="num">Раздач</th><th class="num">ББ/100</th><th class="num">Ошибок</th></tr>');
    W.forEach((w, i) => {
      const p = W[i - 1] || {};
      h += '<tr' + (w.current ? ' class="cur-week"' : '') + '><td>' + w.label + (w.current ? tr(' (эта)') : '') + '</td>' +
        '<td class="num"><span class="mini-bar"><i style="width:' + (w.answers / maxA * 100) + '%"></i></span>' + w.answers + '</td>' +
        '<td class="num">' + pct(w.acc) + cmp(w.acc, p.acc, (a, b) => a > b) + '</td><td class="num">' + w.hands + '</td>' +
        '<td class="num">' + (w.bb100 == null ? '—' : (w.bb100 > 0 ? '+' : '') + w.bb100.toFixed(0)) + '</td><td class="num">' + pct(w.badRate) + cmp(w.badRate, p.badRate, (a, b) => a < b) + '</td></tr>';
    });
    return h + '</table></div>';
  }
  function streetBars(g) {
    const SR = { preflop: tr('Префлоп'), flop: tr('Флоп'), turn: tr('Тёрн'), river: tr('Ривер') };
    let h = '<div class="sbars">', any = false;
    Object.keys(SR).forEach(s => {
      const x = g.streets[s]; if (!x) return;
      const tot = x.bad + x.soft + x.ok;
      if (!tot) return; any = true;
      const w = v => (v / tot * 100).toFixed(1) + '%';
      h += '<div class="sbar-row"><span>' + SR[s] + '</span><div class="sbar"><i class="ok" style="width:' + w(x.ok) + '"></i><i class="soft" style="width:' + w(x.soft) + '"></i><i class="bad" style="width:' + w(x.bad) + '"></i></div><span class="muted">' + tot + '</span></div>';
    });
    return any ? h + tr('</div><div class="legend"><span class="ok">разумно</span><span class="soft">можно лучше</span><span class="bad">ошибка</span></div>') : tr('<p class="muted">Решений пока нет.</p>');
  }
  const KIND_NAMES = { badCall: tr('Невыгодный колл'), badFold: tr('Лишний фолд'), freeFold: tr('Фолд вместо бесплатного чека'), missedValue: tr('Чек/колл с очень сильной рукой'), weakCall: tr('Колл повышения слабой рукой'), foldStrong: tr('Сброс сильной стартовой руки'), bluff: tr('Блеф'), limpWeak: tr('Вход со слабой рукой'), passivePre: tr('Колл вместо рейза до флопа') };
  function kindsList(g) {
    const ks = Object.keys(g.kinds).sort((a, b) => g.kinds[b] - g.kinds[a]);
    if (!ks.length) return '<p class="muted">' + (g.decisions ? tr('Ошибок не найдено — отлично!') : tr('Решений пока нет.')) + '</p>';
    const max = g.kinds[ks[0]];
    return '<table class="stat-table">' + ks.map(k => '<tr><td>' + (KIND_NAMES[k] || k) + '</td><td class="num">' + g.kinds[k] + '</td><td style="width:40%"><div class="bar"><i style="width:' + (g.kinds[k] / max * 100) + '%;background:var(--warn)"></i></div></td></tr>').join('') + '</table>';
  }
  const BACKEND = {
    indexeddb: ['IndexedDB', tr('Основное хранилище браузера для больших данных: сотни мегабайт, работает асинхронно и не тормозит страницу.')],
    localStorage: [tr('localStorage (запасной вариант)'), tr('IndexedDB в этом браузере недоступна (так бывает, например, когда файл открыт с диска в некоторых браузерах). Записи хранятся в localStorage — там всего около 5 МБ, поэтому сохраняются только последние записи.')],
    memory: [tr('Только память'), tr('Браузер не даёт ничего сохранять (приватный режим или запрет сайтам хранить данные). Статистика пропадёт после закрытия вкладки — используйте экспорт.')]
  };
  function dataView() {
    const inf = PKStore.info(), b = BACKEND[inf.backend] || BACKEND.memory, f = statsFilter();
    const vName = f.variant === 'all' ? tr('всех вариантов') : tr('«{v}»', { v: PK.VARIANTS[f.variant].short });
    const cnt = store => PKStore.all(store).filter(r => f.variant === 'all' || r.variant === f.variant).length;
    return tr('<div class="stats-grid"><div class="col"><div class="panel"><h3>Где хранятся данные</h3>') +
      '<div class="store-badge ' + inf.backend + '">' + b[0] + '</div><p>' + b[1] + '</p>' +
      (inf.error ? '<div class="callout bad-c">' + esc(inf.error) + '</div>' : '') +
      tr('<table class="stat-table"><tr><th>Что</th><th class="num">Записей</th><th class="num">Лимит</th></tr>') +
      tr('<tr><td>Ответы в тренажёре</td><td class="num">') + fmt(inf.counts.answers) + '</td><td class="num">' + fmt(inf.limits.answers) + '</td></tr>' +
      tr('<tr><td>Раздачи за столом</td><td class="num">') + fmt(inf.counts.hands) + '</td><td class="num">' + fmt(inf.limits.hands) + '</td></tr>' +
      tr('<tr><td>Партии</td><td class="num">') + fmt(inf.counts.games) + '</td><td class="num">' + fmt(inf.limits.games) + '</td></tr></table>' +
      '<p class="muted sm" id="st-estimate" style="margin-top:10px"></p>' +
      tr('<details class="how"><summary>Как устроено хранение</summary><ul>') +
      tr('<li><b>Настройки</b> (тема, вариант, вкладка) — в localStorage: они маленькие и нужны сразу при открытии.</li>') +
      tr('<li><b>Каждый ответ и каждая раздача</b> — в IndexedDB, база «poker-trainer»: ответы, раздачи, партии и рекорды. Если IndexedDB недоступна — в localStorage с меньшими лимитами, а если закрыт и он — только в памяти.</li>') +
      tr('<li>При превышении лимита удаляются самые старые записи. Рекорды и лучшие серии хранятся отдельно и не теряются.</li>') +
      tr('<li>Данные привязаны к браузеру и к адресу файла. Если перенести файл в другую папку или открыть в другом браузере, статистика будет пустой — переносите её через резервную копию.</li>') +
      tr('<li>Ничего не отправляется в интернет.</li></ul></details></div>') +
      tr('<div class="panel"><h3>Резервная копия</h3><p class="muted sm">Сохраните всю статистику в JSON-файл или загрузите её обратно (например, на другом компьютере). При добавлении дубли пропускаются.</p>') +
      tr('<div class="btn-row"><button class="btn" id="st-export">Скачать резервную копию</button><button class="btn" id="st-import">Загрузить из файла…</button><input type="file" id="st-file" accept=".json,application/json" hidden></div><p class="muted sm" id="st-import-msg"></p></div>') + installHTML() + '</div>' +
      tr('<div class="col"><div class="panel danger-zone"><h3>Очистка статистики</h3><p class="muted sm">Удаление нельзя отменить — перед очисткой можно скачать резервную копию. Фильтр «Вариант» сверху определяет, что очищать: сейчас — ') + vName + '.</p>' +
      tr('<div class="clear-row"><div><b>Тренажёр</b><span class="muted"> — ответы и рекорды скорости ') + vName + ' (' + fmt(cnt('answers')) + tr(')</span></div><button class="btn danger small" data-clear="trainer">Очистить</button></div>') +
      tr('<div class="clear-row"><div><b>Игра за столом</b><span class="muted"> — раздачи и партии ') + vName + ' (' + fmt(cnt('hands')) + tr(')</span></div><button class="btn danger small" data-clear="game">Очистить</button></div>') +
      tr('<div class="clear-row"><div><b>Рекорды</b><span class="muted"> — лучшая серия, рекорды скоростного режима, пояса и исправленные ошибки</span></div><button class="btn danger small" data-clear="records">Сбросить</button></div>') +
      tr('<div class="clear-row all"><div><b>Всё сразу</b><span class="muted"> — вся статистика всех вариантов, рекорды и счётчики первой версии. Настройки останутся.</span></div><button class="btn danger small" data-clear="all">Удалить всё</button></div>') +
      '<p class="sm" id="st-clear-msg" role="status"></p></div></div></div>';
  }
  // ---------- Установка как приложение ----------
  // Служебный скрипт sw.js работает, только когда тренажёр открыт с сайта (http/https): для файла браузеры его не запускают.
  const PWA = { prompt: null, http: /^https?:$/.test(location.protocol) };
  const isStandalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function initPWA() {
    if (!PWA.http || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').catch(() => { /* без сайта или в приватном режиме — просто без работы офлайн */ });
    // системное предложение установки не прячем, а событие сохраняем для своей кнопки
    window.addEventListener('beforeinstallprompt', e => { PWA.prompt = e; refreshInstall(); });
    window.addEventListener('appinstalled', () => { PWA.prompt = null; toast(tr('Готово: тренажёр установлен как приложение.')); refreshInstall(); });
    document.addEventListener('click', e => {
      if (!e.target.closest || !e.target.closest('#pwa-install') || !PWA.prompt) return;
      const p = PWA.prompt; PWA.prompt = null;
      p.prompt();
      Promise.resolve(p.userChoice).catch(() => {}).then(refreshInstall);
    });
  }
  function installHTML() {
    let body;
    if (isStandalone()) body = '<p>' + tr('Тренажёр установлен как приложение и работает без интернета.') + '</p>';
    else if (!PWA.http) body = '<p class="muted sm">' + tr('Сейчас тренажёр открыт из файла. Установить его как приложение можно, когда он открыт с сайта: тогда он появится на главном экране и будет работать без интернета.') + '</p>';
    else if (PWA.prompt) body = '<p class="muted sm">' + tr('Значок на главном экране, отдельное окно и работа без интернета.') + '</p><div class="btn-row"><button class="btn primary" id="pwa-install">' + tr('Установить приложение') + '</button></div>';
    else if (isIOS()) body = '<p class="muted sm">' + tr('В Safari нажмите «Поделиться» и выберите «На экран „Домой“». Тренажёр появится на главном экране и будет работать без интернета.') + '</p>';
    else body = '<p class="muted sm">' + tr('В меню браузера выберите «Установить приложение» или «Добавить на главный экран». Тренажёр появится среди приложений и будет работать без интернета.') + '</p>';
    return '<div class="panel" id="pwa-panel"><h3>' + tr('Приложение') + '</h3>' + body +
      '<p class="muted sm">' + tr('Статистика привязана к адресу: у тренажёра из файла и с сайта она разная, а на iPhone у приложения на экране «Домой» — своя, отдельно от Safari. Переносите её через резервную копию.') + '</p></div>';
  }
  function refreshInstall() { const el = $('#pwa-panel'); if (el) el.outerHTML = installHTML(); }
  async function refreshEstimate() {
    const el = $('#st-estimate');
    if (!el) return;
    let est = null;
    try { est = await PKStore.estimate(); } catch (e) { est = null; }
    const inf = PKStore.info();
    const mb = x => (x / 1048576).toFixed(x > 10485760 ? 0 : 1) + tr(' МБ');
    let t = '';
    if (est && est.usage != null) t += tr('Браузер выделил этой странице ') + (est.quota ? mb(est.quota) : tr('неизвестно сколько')) + tr(', занято ') + mb(est.usage) + '. ';
    if (inf.backend === 'indexeddb') t += inf.persisted ? tr('Хранилище помечено как постоянное — браузер не удалит его при нехватке места.') : tr('Браузер может очистить данные при нехватке места на диске — время от времени делайте резервную копию.');
    el.textContent = t;
  }
  async function clearStats(kind) {
    const f = statsFilter(), vk = f.variant, all = vk === 'all';
    const vName = all ? tr('всех вариантов') : tr('«{v}»', { v: PK.VARIANTS[vk].short });
    const match = r => all || r.variant === vk;
    let msg, run;
    if (kind === 'trainer') {
      const n = PKStore.all('answers').filter(match).length;
      msg = tr('Удалить ') + n + tr(' ответов тренажёра и рекорды скоростного режима для ') + vName + '?';
      run = async () => {
        await PKStore.remove('answers', match);
        const sp = Object.assign({}, PKStore.getMeta('speed', {}));
        Object.keys(sp).forEach(k => { if (all || k.indexOf(vk + ':') === 0) delete sp[k]; });
        PKStore.setMeta('speed', sp);
        if (all || vk === 'holdem') { const L = PKStore.getMeta('legacy'); if (L) PKStore.setMeta('legacy', Object.assign({}, L, { cats: null })); }
        if (all) PKStore.setMeta('bestStreak', 0);
        const bl = Object.assign({}, PKStore.getMeta('belts', {})); Object.keys(bl).forEach(k => { if (all || k === vk) delete bl[k]; }); PKStore.setMeta('belts', bl);
        return tr('Удалено ответов: ') + n;
      };
    } else if (kind === 'game') {
      const n = PKStore.all('hands').filter(match).length;
      msg = tr('Удалить ') + n + tr(' раздач и все партии для ') + vName + '?';
      run = async () => {
        await PKStore.remove('hands', match);
        await PKStore.remove('games', r => match(r) && (!G.gameRec || r.id !== G.gameRec.id));
        if (all || vk === 'holdem') { const L = PKStore.getMeta('legacy'); if (L) PKStore.setMeta('legacy', Object.assign({}, L, { hands: 0, handsWon: 0 })); }
        G.history = G.history.filter(x => !match(x.rec)); if (G.game) renderHistory();
        const bl = Object.assign({}, PKStore.getMeta('belts', {})); Object.keys(bl).forEach(k => { if ((all || k === vk) && bl[k] > 5) bl[k] = 5; }); PKStore.setMeta('belts', bl);
        return tr('Удалено раздач: ') + n;
      };
    } else if (kind === 'records') {
      msg = tr('Сбросить лучшую серию, рекорды скоростного режима, пояса и отметки об исправленных ошибках?');
      run = async () => { PKStore.setMeta('bestStreak', 0); PKStore.setMeta('speed', {}); PKStore.setMeta('belts', {}); PKStore.setMeta('fixed', {}); return tr('Рекорды сброшены'); };
    } else {
      msg = tr('Удалить ВСЮ статистику всех вариантов, рекорды и счётчики первой версии? Настройки останутся.');
      run = async () => {
        await PKStore.clearAll(false);
        PKStore.setMeta('migratedV1', true); // чтобы данные первой версии не вернулись при следующем запуске
        G.history = []; G.gameRec = null;
        if (G.game && !G.over) G.gameRec = PKStore.add('games', { variant: VK, ts: Date.now(), hands: G.game.handNo, result: 'play', finalStack: G.game.players[HUMAN].stack });
        if (G.game) renderHistory();
        return tr('Вся статистика удалена');
      };
    }
    if (!confirm(msg + tr('\n\nОтменить это действие нельзя. Если хотите сохранить данные, сначала нажмите «Скачать резервную копию».'))) return;
    let res;
    try { res = await run(); } catch (e) { res = tr('Не удалось очистить: ') + (e && e.message || e); }
    dataVer++;
    T.session = { n: 0, ok: 0, streak: 0 };
    renderStats(); renderCheat(); renderSession(); renderFocusNote(); renderProgress();
    const m = $('#st-clear-msg'); if (m) m.textContent = res + '.';
  }
  function exportBackup() {
    const data = JSON.stringify(PKStore.exportData());
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'poker-trainer-backup-' + PKStats.dayKey(Date.now()) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function importBackup(file) {
    try {
      const obj = JSON.parse(await file.text());
      const replace = confirm(tr('Заменить текущую статистику данными из файла?\n\nОК — заменить полностью.\nОтмена — добавить к текущей (дубли будут пропущены).'));
      const r = await PKStore.importData(obj, replace ? 'replace' : 'merge');
      dataVer++;
      renderStats(); renderCheat(); renderFocusNote(); renderSession();
      const m = $('#st-import-msg'); if (m) m.textContent = tr('Загружено: ответов ') + r.answers + tr(', раздач ') + r.hands + tr(', партий ') + r.games + '.';
    } catch (e) { const m = $('#st-import-msg'); if (m) m.textContent = tr('Не удалось загрузить: ') + (e && e.message || e); }
  }

  // ======================================================================
  // СОБЫТИЯ
  // ======================================================================
  function bindEvents() {
    $('#tabs').addEventListener('click', e => { const b = e.target.closest('.tab-btn'); if (b) showTab(b.dataset.tab); });
    $('#variant-select').addEventListener('change', e => setVariant(e.target.value));
    $('#mode-tabs').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
    $('#level-ctl').addEventListener('click', e => { const b = e.target.closest('[data-level]'); if (b) setLevel(b.dataset.level); });
    $('#tab-trainer').addEventListener('change', e => { if (e.target.id === 'goal-select') { settings.dailyGoal = +e.target.value; saveSettings(); renderProgress(); } });
    $('#tab-trainer').addEventListener('click', e => {
      const t = e.target;
      const ans = t.closest('.ans[data-cat]');
      if (ans && !ans.disabled) return T.mode === 'speed' ? speedAnswer(+ans.dataset.cat) : answerName(+ans.dataset.cat);
      const op = t.closest('.ans[data-opt]');
      if (op && !op.disabled) return answerDrill(+op.dataset.opt);
      if (t.closest('[data-show-chart]')) return showChartModal(T.task);
      if (t.closest('[data-goto]')) return gotoStep(t.closest('[data-goto]').dataset.goto, t.closest('[data-goto]').dataset.hint);
      const w = t.closest('.ans[data-w]');
      if (w && !w.disabled) return answerWinner(+w.dataset.w);
      const card = t.closest('.card.pick');
      if (card) return toggleBest(+card.dataset.i);
      if (t.closest('#check-btn')) return checkBest();
      if (t.closest('#clear-sel')) { T.sel = []; return renderTask(); }
      if (t.closest('#next-btn')) return newTask();
      if (t.closest('#speed-start')) return speedStart();
    });
    $('#tab-game').addEventListener('click', e => {
      const t = e.target;
      const a = t.closest('[data-act]');
      if (a && !a.disabled) {
        const act = a.dataset.act;
        if (act === 'restart') return restartGame(false);
        if (act === 'next') return startHand();
        return humanAct(act);
      }
      const q = t.closest('[data-q]');
      if (q) return setRaise(quickRaise(q.dataset.q, G.game.legal(HUMAN)));
      const hi = t.closest('[data-hand]');
      if (hi) return showHand(+hi.dataset.hand);
    });
    $('#tab-game').addEventListener('input', e => {
      if (e.target.id === 'raise-slider') setRaise(+e.target.value);
      if (e.target.id === 'raise-input' && e.target.value !== '') {
        const L = G.game.legal(HUMAN);
        G.raiseTo = Math.max(L.minTo, Math.min(L.maxTo, +e.target.value));
        const s = $('#raise-slider'), b = $('#raise-btn');
        if (s) s.value = G.raiseTo;
        if (b) b.innerHTML = raiseLabel(G.raiseTo, L) + ' <kbd>R</kbd>';
      }
    });
    $('#tab-game').addEventListener('change', e => { if (e.target.id === 'raise-input') setRaise(+e.target.value || 0); });
    $('#hints-toggle').addEventListener('change', e => { settings.hints = e.target.checked; saveSettings(); if (G.game) renderHint(); });
    $('#restart-btn').addEventListener('click', () => restartGame(true));
    $('#modal-root').addEventListener('click', e => {
      if (e.target.dataset.close) return closeModal();
      if (e.target.closest('#ts-apply')) return applyTableSettings(true);
      if (e.target.closest('#ts-save')) return applyTableSettings(false);
      const g = e.target.closest('[data-goto]'); if (g) { closeModal(); gotoStep(g.dataset.goto); }
    });
    $('#table-settings-btn').addEventListener('click', openTableSettings);
    $('#help-btn').addEventListener('click', showHelp);
    $('#sound-btn').addEventListener('click', () => { settings.sound = !settings.sound; saveSettings(); applySound(); if (settings.sound) PKSound.play('ok'); });
    $('#tab-rules').addEventListener('click', e => { const b = e.target.closest('[data-pick-variant]'); if (b) { setVariant(b.dataset.pickVariant); renderVariantSelect(); } });
    const st = $('#stats');
    st.addEventListener('click', e => {
      const t = e.target;
      const v = t.closest('[data-view]');
      if (v) { settings.statsView = v.dataset.view; saveSettings(); return renderStats(); }
      const c = t.closest('[data-clear]');
      if (c) return clearStats(c.dataset.clear);
      const h = t.closest('[data-hand]');
      if (h) return showHand(+h.dataset.hand);
      if (t.closest('#st-export')) return exportBackup();
      if (t.closest('#st-import')) return $('#st-file').click();
    });
    st.addEventListener('change', e => {
      if (e.target.id === 'st-variant') { settings.statsVariant = e.target.value; saveSettings(); renderStats(); }
      if (e.target.id === 'st-period') { settings.statsPeriod = e.target.value; saveSettings(); renderStats(); }
      if (e.target.id === 'st-file' && e.target.files[0]) importBackup(e.target.files[0]);
    });
    document.addEventListener('keydown', onKey);
  }
  function openTableSettings() {
    const c = tableCfg();
    const opt = (name, vals, cur) => '<select name="' + name + '">' + vals.map(v => '<option value="' + v[0] + '"' + (String(v[0]) === String(cur) ? ' selected' : '') + '>' + v[1] + '</option>').join('') + '</select>';
    showModal(tr('Настройки стола'),
      '<form class="ts-form" id="ts-form" onsubmit="return false">' +
      tr('<label><span>Соперников</span>') + opt('opp', [[1, tr('1 — игра один на один')], [2, '2'], [3, '3'], [4, '4'], [5, tr('5 — полный стол')]], c.opp) + '</label>' +
      tr('<label><span>Уровень ботов</span>') + opt('level', [['easy', tr('Новички — много ошибок')], ['normal', tr('Средние')], ['hard', tr('Сильные')], ['mixed', tr('Смешанный стол')]], c.level) + '</label>' +
      tr('<label><span>Стартовый стек</span>') + opt('stack', [[500, tr('500 (25 больших блайндов)')], [1000, tr('1000 (50 ББ)')], [2000, tr('2000 (100 ББ)')], [5000, tr('5000 (250 ББ)')]], c.stack) + '</label>' +
      tr('<label><span>Скорость ботов</span>') + opt('speed', [['slow', tr('Медленно')], ['normal', tr('Обычно')], ['fast', tr('Быстро')]], c.speed) + '</label>' +
      '<label class="chk"><input type="checkbox" name="showCards"' + (c.showCards ? ' checked' : '') + tr('> Показывать карты соперников после раздачи — чтобы видеть, с чем они ставили и блефовали</label>') +
      (canVibrate() ? '<label class="chk"><input type="checkbox" name="vibrate"' + (settings.vibrate !== false ? ' checked' : '') + '> ' + tr('Вибрация, когда ваш ход') + '</label>' : '') +
      '<p class="muted sm">' + Object.keys(PK.BOT_LEVELS).map(k => '<b>' + PK.BOT_LEVELS[k].label + '</b>: ' + PK.BOT_LEVELS[k].desc).join('<br>') + '</p>' +
      tr('<div class="btn-row"><button class="btn primary" id="ts-apply" type="button">Сохранить и начать новую игру</button><button class="btn" id="ts-save" type="button">Только сохранить</button></div>') +
      tr('<p class="muted sm">«Только сохранить» применит настройки со следующей игры; показ карт и скорость меняются сразу.</p></form>'));
  }
  function applyTableSettings(restart) {
    const f = $('#ts-form'); if (!f) return;
    const v = n => f.elements[n].value;
    settings.table = { opp: +v('opp'), level: v('level'), stack: +v('stack'), speed: v('speed'), showCards: f.elements.showCards.checked };
    if (f.elements.vibrate) settings.vibrate = f.elements.vibrate.checked;
    saveSettings();
    closeModal();
    if (G.cfg) { G.cfg.speed = settings.table.speed; G.cfg.showCards = settings.table.showCards; }
    if (restart) { if (G.game && !G.over && G.game.handNo > 1 && !confirm(tr('Начать новую игру с новыми настройками? Текущая партия будет завершена.'))) return; newGame(); }
    else if (G.game) renderGame();
  }
  const ICON_SND_ON = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>';
  const ICON_SND_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
  // Вибрация на телефоне, когда ход переходит к вам (iPhone её не поддерживает — там переключателя нет)
  const canVibrate = () => typeof navigator.vibrate === 'function' && !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  function buzz() {
    if (settings.vibrate === false || !canVibrate() || document.visibilityState === 'hidden') return;
    try { navigator.vibrate(40); } catch (e) { /* браузер может запретить до первого касания */ }
  }
  function applySound() {
    PKSound.setEnabled(settings.sound !== false);
    const b = $('#sound-btn'); b.innerHTML = settings.sound !== false ? ICON_SND_ON : ICON_SND_OFF;
    b.title = settings.sound !== false ? tr('Звук включён — выключить') : tr('Звук выключен — включить');
  }
  function showHelp() {
    const row = (k, t) => '<tr><td>' + k + '</td><td>' + t + '</td></tr>';
    showModal(tr('Горячие клавиши'),
      tr('<div class="help-grid"><div><h4>Тренажёр</h4><table class="keys">') +
      row('<kbd>1</kbd>…<kbd>9</kbd>, <kbd>0</kbd>', tr('выбрать ответ (по порядку кнопок)')) +
      row(tr('<kbd>Enter</kbd> или <kbd>Пробел</kbd>'), tr('следующее задание; в «Лучшей руке» — проверить')) +
      row('<kbd>1</kbd>…<kbd>7</kbd>', tr('«Лучшая рука»: выбрать или снять карту')) +
      row('<kbd>Backspace</kbd>', tr('«Лучшая рука»: сбросить выбор')) +
      row(tr('<kbd>Пробел</kbd>'), tr('скоростной режим: старт')) + '</table></div>' +
      tr('<div><h4>Игра за столом</h4><table class="keys">') +
      row('<kbd>F</kbd>', tr('фолд')) + row('<kbd>C</kbd>', tr('чек или колл')) + row('<kbd>R</kbd>', tr('рейз выбранного размера')) + row('<kbd>A</kbd>', tr('поставить максимум (олл-ин или банк)')) +
      row('<kbd>H</kbd>', tr('подсказки вкл/выкл')) + row('<kbd>Enter</kbd>', tr('следующая раздача')) + '</table></div>' +
      tr('<div><h4>Везде</h4><table class="keys">') + row('<kbd>?</kbd>', tr('эта справка')) + row('<kbd>Esc</kbd>', tr('закрыть окно')) + '</table>' +
      tr('<p class="muted sm">Клавиши работают и в русской раскладке (А, С, К, Ф, Р).</p></div></div>'));
  }
  function restartGame(ask) {
    if (ask && G.game && !G.over && G.game.handNo > 1 && !confirm(tr('Начать новую игру? Текущая партия будет сброшена.'))) return;
    newGame();
  }
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === 'Escape' && $('#modal-root').innerHTML) { closeModal(); return; }
    if ($('#modal-root').innerHTML) return;
    if (e.target.matches && e.target.matches('select')) return;
    if ((k === '?' || (k === ',' && e.shiftKey)) && !(e.target.matches && e.target.matches('input, textarea'))) { e.preventDefault(); showHelp(); return; }
    const inInput = e.target.matches && e.target.matches('input[type=number], input[type=text], textarea');
    if (inInput && k !== 'Enter') return;
    const handled = activeTab === 'trainer' ? trainerKey(k) : activeTab === 'game' ? gameKey(k, inInput) : false;
    if (handled) {
      e.preventDefault();
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
    }
  }
  function trainerKey(k) {
    const next = k === 'Enter' || k === ' ';
    if (T.mode === 'speed') {
      const sp = T.sp;
      if (sp.state !== 'run') { if (next) { speedStart(); return true; } return false; }
      if (sp.locked) { if (next) { speedSkipWait(); return true; } return false; }
      const c = catForKey(k);
      if (c >= 0) { speedAnswer(c); return true; }
      return false;
    }
    if (T.answered) { if (next) { newTask(); return true; } return false; }
    if (DRILL[T.mode]) {
      const i = idxForKey(k);
      if (T.task && T.task.options && i >= 0 && i < T.task.options.length) { answerDrill(i); return true; }
      if (next && T.task && T.task.empty) { newTask(); return true; }
      return false;
    }
    if (T.mode === 'name') { const c = catForKey(k); if (c >= 0) { answerName(c); return true; } return false; }
    if (T.mode === 'best') {
      const i = idxForKey(k);
      if (i >= 0 && T.task && i < T.task.cards.length) { toggleBest(i); return true; }
      if (k === 'Enter') { checkBest(); return true; }
      if (k === 'Backspace' || k === 'Escape') { T.sel = []; renderTask(); return true; }
      return false;
    }
    if (T.mode === 'winner') { const map = { '1': 1, '2': 2, '3': 0 }; if (k in map) { answerWinner(map[k]); return true; } }
    return false;
  }
  function gameKey(k, inInput) {
    const g = G.game;
    if (!g) return false;
    const key = k.length === 1 ? k.toLowerCase() : k;
    if (key === 'h' || key === 'р') { const t = $('#hints-toggle'); t.checked = !t.checked; t.dispatchEvent(new Event('change')); return true; }
    if (G.over) { if (k === 'Enter') { newGame(); return true; } return false; }
    if (g.done) { if (k === 'Enter' || key === 'n' || key === 'т') { startHand(); return true; } return false; }
    if (g.toAct !== HUMAN) return false;
    if (inInput && k === 'Enter') { humanAct('raise'); return true; }
    // Русская раскладка: F→А, C→С, R→К, A→Ф
    if (key === 'f' || key === 'а') { humanAct('fold'); return true; }
    if (key === 'c' || key === 'с') { humanAct('call'); return true; }
    if (key === 'r' || key === 'к') { humanAct('raise'); return true; }
    if (key === 'a' || key === 'ф') { const L = g.legal(HUMAN); if (L.canRaise) setRaise(L.maxTo); return true; }
    return false;
  }

  // ---------- Старт ----------
  function saveOnLeave() {
    if (G.gameRec && G.gameRec.result === 'play') { G.gameRec.endTs = Date.now(); PKStore.update('games', G.gameRec); }
    PKStore.flush();
  }
  // Язык: переключатель в шапке показывает язык, на который переключит; выбор сохраняется, страница перезагружается
  function initLang() {
    PKI18n.translateDOM(document.body);
    document.title = tr('Покерный тренер');
    document.documentElement.lang = LANG;
    const b = $('#lang-btn'); if (!b) return;
    const next = LANG === 'ru' ? 'en' : 'ru';
    b.textContent = next.toUpperCase();
    b.title = PKI18n.LANGS[next];
    b.setAttribute('aria-label', next === 'en' ? 'Switch to English' : 'Переключить на русский');
    b.lang = next;
    b.onclick = () => { if (PKI18n.save(next)) location.reload(); };
  }
  async function init() {
    initLang();
    initPWA();
    initTheme();
    T.mode = MODES[settings.mode] ? settings.mode : 'name';
    T.level = settings.level === 'full' ? 'full' : 5;
    $('#hints-toggle').checked = settings.hints !== false;
    renderVariantSelect();
    fillInlineCards(document);
    renderRulesTable(); renderRulesVariant();
    applySound();
    $('#stats').innerHTML = tr('<p class="muted">Загружаю статистику…</p>');
    try { await PKStore.init(); } catch (e) { /* PKStore сам переходит на запасное хранилище */ }
    PKStore.migrateV1();
    dataVer++;
    renderHandChart();
    lastActDone = PKStats.activity(PKStore.all('answers'), PKStore.all('hands'), settings.dailyGoal).done;
    bindEvents();
    renderCheat();
    renderTrainerChrome();
    if (T.mode === 'speed') renderTask(); else newTask();
    showTab(['trainer', 'game', 'rules', 'stats'].indexOf(settings.tab) >= 0 ? settings.tab : 'trainer');
    window.addEventListener('pagehide', saveOnLeave);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveOnLeave(); });
    // Поворот телефона или изменение окна: стол перестраивается под новую раскладку мест.
    if (phoneMQ) {
      const relayout = () => { if (G.game) { G.betPos = {}; G.prevBets = G.game.players.map(p => p.bet); renderTable(); } };
      if (phoneMQ.addEventListener) phoneMQ.addEventListener('change', relayout); else if (phoneMQ.addListener) phoneMQ.addListener(relayout);
    }
    // Доступ для автотестов вёрстки (рисуют «самый тесный» стол); в игре не используется.
    window.__pkui = { G, renderTable, renderActions };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
