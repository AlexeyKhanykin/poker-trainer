#!/usr/bin/env node
// Запуск всех тестов одной командой:
//   node tests/run.js            — все наборы (логика + интерфейс в Chrome)
//   node tests/run.js --quick    — меньше случайных повторов (быстрая проверка)
//   node tests/run.js --unit     — только логика (без браузера)
//   node tests/run.js --ui       — только интерфейс
//   node tests/run.js odds bots  — только наборы, в имени файла которых есть эти слова
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const words = args.filter(a => !a.startsWith('--'));
const DIR = __dirname;

function list(sub) {
  const d = path.join(DIR, sub);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => f.endsWith('.test.js')).sort().map(f => path.join(d, f));
}
let files = [];
if (!flags.has('--ui')) files = files.concat(list('unit'));
if (!flags.has('--unit')) files = files.concat(list('ui'));
if (words.length) files = files.filter(f => words.some(w => path.basename(f).includes(w)));
if (!files.length) { console.log('Нет подходящих наборов тестов.'); process.exit(1); }

const env = Object.assign({}, process.env);
if (flags.has('--quick')) env.TEST_QUICK = '1';

function runOne(file) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const ch = spawn(process.execPath, [file], { env, cwd: path.dirname(DIR) });
    let out = '';
    ch.stdout.on('data', d => { out += d; });
    ch.stderr.on('data', d => { out += d; });
    ch.on('close', code => {
      const m = out.match(/##RESULT (.*)/);
      let r = null;
      try { r = m && JSON.parse(m[1]); } catch (e) { r = null; }
      const log = out.replace(/##RESULT .*\n?/, '').trim();
      resolve({ file: path.relative(DIR, file), code, ms: Date.now() - t0, r, log });
    });
  });
}

(async () => {
  const t0 = Date.now();
  // Интерфейсные наборы (каждый со своим Chrome) идут строго по одному: два Chrome одновременно
  // на macOS тормозят друг друга в разы. Наборы логики параллельно с ними, в остальных потоках.
  const ui = files.filter(f => f.includes(path.sep + 'ui' + path.sep));
  const unit = files.filter(f => !ui.includes(f));
  const lim = Math.max(2, Math.min(8, os.cpus().length - 1));
  const results = [];
  const uiLane = (async () => { for (const f of ui) results.push(await runOne(f)); })();
  let i = 0;
  const unitLanes = Array.from({ length: Math.min(ui.length ? lim - 1 : lim, unit.length) }, async () => {
    while (i < unit.length) { const f = unit[i++]; results.push(await runOne(f)); }
  });
  await Promise.all([uiLane].concat(unitLanes));
  results.sort((a, b) => a.file.localeCompare(b.file));

  let pass = 0, fail = 0, broken = 0;
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
  console.log('');
  for (const x of results) {
    if (!x.r) { broken++; console.log('✗ ' + pad(x.file, 34) + ' НЕ ЗАВЕРШИЛСЯ (код ' + x.code + ')'); continue; }
    pass += x.r.pass; fail += x.r.fail;
    const mark = x.r.fail || x.code ? '✗' : '✓';
    console.log(mark + ' ' + pad(x.file, 34) + pad(String(x.r.pass), 6) + (x.r.fail ? 'провалено ' + x.r.fail + '  ' : '') +
      pad((x.ms / 1000).toFixed(1) + ' с', 8) + x.r.title + (x.r.note ? ' · ' + x.r.note : ''));
  }
  const bad = results.filter(x => !x.r || x.r.fail || x.code);
  for (const x of bad) {
    console.log('\n──── ' + x.file + ' ────');
    console.log(x.log.split('\n').slice(0, 60).join('\n') || '(нет вывода)');
  }
  console.log('\nИтого: проверок ' + (pass + fail) + ', пройдено ' + pass + ', провалено ' + fail +
    (broken ? ', упавших наборов ' + broken : '') + ' · наборов ' + results.length + ' · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' с' +
    (flags.has('--quick') ? ' (быстрый режим)' : ''));
  process.exit(fail || broken || bad.length ? 1 : 0);
})();
