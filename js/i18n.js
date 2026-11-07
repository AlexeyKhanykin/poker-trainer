/* ===== ЯЗЫК ИНТЕРФЕЙСА: русский (исходный) и английский =====
   Все тексты в коде пишутся по-русски и проходят через T('…', {переменные}).
   Для английского T ищет перевод в словаре (js/i18n-en.js) по русскому тексту.
   Язык выбирается один раз при загрузке страницы; переключатель сохраняет выбор и перезагружает страницу. */
var PKI18n = (function () {
  'use strict';
  const LANGS = { ru: 'Русский', en: 'English' };
  const KEY = 'pk-lang';
  let lang = 'ru';
  try {
    const saved = typeof localStorage !== 'undefined' && localStorage.getItem(KEY);
    if (saved && LANGS[saved]) lang = saved;
  } catch (e) { /* хранилище недоступно — остаётся русский */ }

  const EN = Object.create(null);
  const missing = new Set();

  // «Раздача #{n}» + {n: 5} → «Раздача #5»
  function fill(s, v) { return v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)) : String(s); }

  function t(ru, v) {
    if (lang === 'ru') return fill(ru, v);
    const e = EN[ru];
    if (e == null) { missing.add(ru); return fill(ru, v); }
    return typeof e === 'function' ? e(v || {}) : fill(e, v);
  }

  // Склонение числительных: n('карта', 'карты', 'карт', 5) → «карт»; в английском — по словарю: 'карта' → ['card', 'cards'].
  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (lang === 'ru') return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
    const e = EN[one];
    if (!Array.isArray(e)) { missing.add(one); return Math.abs(n) === 1 ? one : many; }
    return Math.abs(n) === 1 ? e[0] : e[1];
  }

  // Числа: «1 000» по-русски, «1,000» по-английски
  const NUM = { ru: 'ru-RU', en: 'en-US' };
  function num(x) { try { return Number(x).toLocaleString(NUM[lang]); } catch (e) { return String(x); } }

  // ---------- Перевод статичной разметки страницы ----------
  // Элемент, внутри которого только строчные теги (<b>, <span>, <kbd>…), переводится целиком:
  // ключ — его innerHTML со схлопнутыми пробелами. Иначе — по отдельным текстовым узлам.
  const CYR = /[А-Яа-яЁё]/;
  const INLINE = new Set(['B', 'I', 'EM', 'STRONG', 'SPAN', 'KBD', 'SMALL', 'A', 'BR', 'CODE', 'U', 'SUP', 'SUB']);
  const ATTRS = ['title', 'aria-label', 'placeholder'];
  const norm = s => s.replace(/\s+/g, ' ').trim();
  const inlineOnly = el => Array.prototype.every.call(el.querySelectorAll('*'), c => INLINE.has(c.tagName));
  // fn(key, apply) вызывается для каждого текста; apply(перевод) подставляет перевод на место
  function walkDOM(root, fn) {
    (function walk(el) {
      ATTRS.forEach(a => { const v = el.getAttribute && el.getAttribute(a); if (v && CYR.test(v)) fn(norm(v), x => el.setAttribute(a, x)); });
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || !CYR.test(el.textContent)) { el.querySelectorAll && Array.prototype.forEach.call(el.querySelectorAll('[title],[aria-label],[placeholder]'), c => ATTRS.forEach(a => { const v = c.getAttribute(a); if (v && CYR.test(v)) fn(norm(v), x => c.setAttribute(a, x)); })); return; }
      if (el !== root && !INLINE.has(el.tagName) && inlineOnly(el)) {
        const key = norm(el.innerHTML);
        fn(key, x => { el.innerHTML = x; });
        return;
      }
      Array.prototype.slice.call(el.childNodes).forEach(n => {
        if (n.nodeType === 3) { if (CYR.test(n.nodeValue)) { const m = n.nodeValue.match(/^(\s*)([\s\S]*?)(\s*)$/); fn(norm(m[2]), x => { n.nodeValue = m[1] + x + m[3]; }); } }
        else if (n.nodeType === 1) walk(n);
      });
    })(root);
  }
  function translateDOM(root) {
    if (lang === 'ru' || !root) return;
    walkDOM(root, (key, apply) => apply(t(key)));
  }
  function domKeys(root) { const out = []; walkDOM(root, k => out.push(k)); return out; }

  return {
    LANGS, KEY, translateDOM, domKeys,
    get lang() { return lang; },
    get locale() { return NUM[lang]; },
    t, plural, num, fill, missing, EN,
    add(dict) { Object.assign(EN, dict); },
    // Для тестов: сменить язык без перезагрузки
    use(l) { if (LANGS[l]) lang = l; return lang; },
    // Переключатель в интерфейсе: сохранить и перезагрузить
    save(l) { if (!LANGS[l]) return false; try { localStorage.setItem(KEY, l); } catch (e) { return false; } return true; }
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PKI18n;
