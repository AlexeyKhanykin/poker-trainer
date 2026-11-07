// Эталонный оценщик рук, написанный независимо от js/core.js и максимально просто:
// классифицирует ровно 5 карт, а лучшую руку ищет полным перебором пятёрок.
// Медленный, зато очевидно правильный — с ним сверяется быстрый оценщик приложения.
'use strict';
const rank = c => (c >> 2) + 2, suit = c => c & 3;
// Сила категорий: в шорт-деке тройка > стрит и флеш > фулл-хаус.
const POWER = { std: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], sd: [0, 1, 2, 4, 3, 6, 5, 7, 8, 9] };

function five(cards, sd) {
  if (cards.length !== 5) throw new Error('нужно ровно 5 карт');
  const rs = cards.map(rank).sort((a, b) => b - a);
  const flush = cards.every(c => suit(c) === suit(cards[0]));
  const distinct = new Set(rs).size === 5;
  let straight = 0;
  if (distinct) {
    if (rs[0] - rs[4] === 4) straight = rs[0];
    else if (!sd && rs.join() === '14,5,4,3,2') straight = 5;
    else if (sd && rs.join() === '14,9,8,7,6') straight = 9;
  }
  const cnt = {};
  rs.forEach(r => { cnt[r] = (cnt[r] || 0) + 1; });
  const groups = Object.keys(cnt).map(Number).sort((a, b) => cnt[b] - cnt[a] || b - a);
  const shape = groups.map(r => cnt[r]).join('');
  if (straight && flush) return { cat: straight === 14 ? 9 : 8, tb: [straight] };
  if (shape === '41') return { cat: 7, tb: groups };
  if (shape === '32') return { cat: 6, tb: groups };
  if (flush) return { cat: 5, tb: rs };
  if (straight) return { cat: 4, tb: [straight] };
  if (shape === '311') return { cat: 3, tb: groups };
  if (shape === '221') return { cat: 2, tb: groups };
  if (shape === '2111') return { cat: 1, tb: groups };
  return { cat: 0, tb: rs };
}
function compare(a, b, sd) {
  const P = sd ? POWER.sd : POWER.std;
  if (P[a.cat] !== P[b.cat]) return P[a.cat] - P[b.cat];
  for (let i = 0; i < Math.max(a.tb.length, b.tb.length); i++) {
    const d = (a.tb[i] || 0) - (b.tb[i] || 0);
    if (d) return d;
  }
  return 0;
}
function combos(arr, k) {
  const out = [];
  (function rec(s, cur) {
    if (cur.length === k) return out.push(cur.slice());
    for (let i = s; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
  })(0, []);
  return out;
}
function bestOf(cards, sd) {
  let best = null, bestC = null;
  for (const c5 of combos(cards, 5)) {
    const e = five(c5, sd);
    if (!best || compare(e, best, sd) > 0) { best = e; bestC = c5; }
  }
  return Object.assign({ cards: bestC }, best);
}
// Лучшая рука по правилам варианта: в омахе ровно 2 из руки + 3 со стола.
function bestFor(V, hole, board) {
  if (!V.omaha) return bestOf(hole.concat(board), V.sd);
  let best = null;
  for (const h of combos(hole, 2)) for (const b of combos(board, 3)) {
    const e = five(h.concat(b), V.sd);
    if (!best || compare(e, best, V.sd) > 0) best = Object.assign({ cards: h.concat(b) }, e);
  }
  return best;
}
module.exports = { five, compare, combos, bestOf, bestFor, rank, suit, POWER };
// Категория для 1–4 карт (только одинаковые ранги: стрит и флеш из 4 карт не бывают).
function partial(cards) {
  const cnt = {};
  cards.forEach(c => { cnt[rank(c)] = (cnt[rank(c)] || 0) + 1; });
  const v = Object.values(cnt).sort((a, b) => b - a);
  if (v[0] === 4) return 7;
  if (v[0] === 3) return 3;
  if (v[0] === 2 && v[1] === 2) return 2;
  if (v[0] === 2) return 1;
  return 0;
}
module.exports.partial = partial;
module.exports.catOf = (cards, sd) => cards.length >= 5 ? bestOf(cards, sd).cat : partial(cards);
