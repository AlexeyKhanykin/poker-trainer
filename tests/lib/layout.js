// Общие замеры вёрстки для тестов в Chrome: прямоугольники, поиск наложений за столом, «самый тесный» стол.
// Строки GEO и STRESS выполняются на странице (через page.eval) вместе с PAGE_HELPERS.
'use strict';
// Геометрия на странице: прямоугольники и поиск наложений за столом.
const GEO = `
  window.__g = window.__g || {
    R(el) { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; },
    hit(a, b, pad) { pad = pad == null ? 2 : pad; return a.l < b.r - pad && b.l < a.r - pad && a.t < b.b - pad && b.t < a.b - pad; },
    shown(el) { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; },
    // Все наложения за столом: места между собой, общие карты, банк, фишки ставок, кнопка дилера.
    tableProblems() {
      const R = __g.R, hit = __g.hit, out = [];
      const area = R(document.querySelector('.table-panel'));
      const seats = __t.$$('#table .seat').map(s => ({ name: s.querySelector('.sname') ? s.querySelector('.sname').firstChild.textContent.trim() : '?', box: R(s.querySelector('.sbox')), cards: Array.from(s.querySelectorAll('.scards .card')).map(R), act: s.querySelector('.sact') ? R(s.querySelector('.sact')) : null }));
      const pot = document.querySelector('#table .pot') ? R(document.querySelector('#table .pot')) : null;
      const board = __t.$$('#table .board .card').map(R);
      const bets = __t.$$('#table .bet').map(b => { const s = document.querySelector('#table [data-seat="' + b.dataset.bet + '"] .sname'); return { txt: b.innerText.trim() + ' (' + (s ? s.firstChild.textContent.trim() : '?') + ')', r: R(b) }; });
      const dealer = document.querySelector('#table .dealer') ? R(document.querySelector('#table .dealer')) : null;
      const inside = (r, what) => { if (r.l < area.l - 3 || r.r > area.r + 3 || r.t < area.t - 3 || r.b > area.b + 3) out.push(what + ' выходит за стол'); };
      seats.forEach((s, i) => {
        inside(s.box, s.name); s.cards.forEach(c => inside(c, s.name + ': карта')); if (s.act) inside(s.act, s.name + ': подпись действия');
        if (s.box.r > innerWidth + 1 || s.box.l < -1) out.push(s.name + ' за краем экрана');
        seats.forEach((o, j) => {
          if (j <= i) return;
          if (hit(s.box, o.box)) out.push(s.name + ' и ' + o.name + ': места наложились');
          if (s.cards.some(c => hit(c, o.box)) || o.cards.some(c => hit(c, s.box))) out.push(s.name + ' и ' + o.name + ': карты на чужом месте');
        });
        if (pot && (hit(pot, s.box) || s.cards.some(c => hit(c, pot)))) out.push('банк налез на место ' + s.name);
        if (board.some(b => hit(b, s.box) || s.cards.some(c => hit(c, b)))) out.push('общие карты налезли на место ' + s.name);
        if (s.act && pot && hit(s.act, pot)) out.push('подпись ' + s.name + ' на банке');
      });
      bets.forEach((b, i) => {
        inside(b.r, 'ставка ' + b.txt);
        seats.forEach(s => { if (hit(b.r, s.box) || s.cards.some(c => hit(b.r, c)) || (s.act && hit(b.r, s.act))) out.push('ставка ' + b.txt + ' на месте ' + s.name + ' [' + [b.r, s.box].concat(s.cards, s.act ? [s.act] : []).map(x => [x.l, x.t, x.r, x.b].map(Math.round).join(',')).join(' / ') + ']'); });
        if (pot && hit(b.r, pot)) out.push('ставка ' + b.txt + ' на банке');
        if (board.some(c => hit(b.r, c))) out.push('ставка ' + b.txt + ' на общих картах');
        bets.forEach((o, j) => { if (j > i && hit(b.r, o.r)) out.push('ставки ' + b.txt + ' и ' + o.txt + ' наложились'); });
        if (dealer && hit(b.r, dealer)) out.push('ставка ' + b.txt + ' на кнопке дилера');
      });
      if (dealer && (pot && hit(dealer, pot) || board.some(c => hit(dealer, c)))) out.push('кнопка дилера на банке или общих картах');
      return out;
    }
  };`;

// «Самый тесный» стол: у всех ставка 10 000 и самая широкая подпись действия («рейз до 10 000»), на столе нужное число общих карт.
const STRESS = `
  window.__stress = window.__stress || (async (opp, boardN, showdown) => {
    if (__t.$$('#table [data-seat]').length !== opp + 1) {
      __t.click('#table-settings-btn'); await __t.until(() => __t.$('#ts-form'));
      __t.$('#ts-form').elements.opp.value = String(opp); __t.click('#ts-apply'); await __t.sleep(200);
    }
    const G = __pkui.G, g = G.game;
    clearTimeout(G.timer);
    // на вскрытии ставок перед игроками уже нет — всё в банке
    g.players.forEach(p => { const bet = showdown ? 0 : 10000; p.total += bet - p.bet; p.out = false; p.folded = false; p.allIn = false; p.bet = bet; p.lastAction = 'рейз до 10 000'; p.lastKind = 'raise'; });
    g.done = false; g.toAct = -1; g.street = boardN ? 'river' : 'preflop';
    g.board = g.boardAll.length >= 5 ? g.boardAll.slice(0, boardN) : [];
    G.betPos = {}; G.prevBets = g.players.map(p => p.bet);
    // кнопка дилера по очереди у каждого места: она стоит рядом с местом и может задеть чужие фишки
    const out = new Set(), button = g.button;
    for (let b = 0; b < g.players.length; b++) {
      g.button = b;
      __pkui.renderTable();
      // На вскрытии под стеком добавляется строка с названием комбинации — место становится выше
      if (showdown) __t.$$('#table .sbox').forEach(b => { const d = document.createElement('div'); d.className = 'shand'; d.textContent = 'Две пары'; b.insertBefore(d, b.querySelector('.sact')); });
      // ждём только первую отрисовку: дальше карты те же и анимаций раздачи нет
      if (b === 0) { await __t.sleep(30); await __t.until(() => !document.getAnimations().some(a => a.playState === 'running'), 900); }
      scrollTo(0, 0);
      __g.tableProblems().forEach(p => out.add(p));
    }
    g.button = button;
    return Array.from(out);
  });`;

module.exports = { GEO, STRESS };
