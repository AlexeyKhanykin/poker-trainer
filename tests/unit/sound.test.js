// Звук: все звуки синтезируются без ошибок; выключатель и громкость работают; без WebAudio — тишина без исключений.
const H = require('../lib/harness');
const TS = H.suite('Звук');
function fakeAudio() {
  const log = { osc: 0, noise: 0, created: 0, resumed: 0, maxGain: 0 };
  const param = isGain => ({ setValueAtTime(v) { if (isGain) log.maxGain = Math.max(log.maxGain, v); }, exponentialRampToValueAtTime(v) { if (v <= 0) throw new Error('exponential ramp к нулю невозможен'); if (isGain) log.maxGain = Math.max(log.maxGain, v); }, set value(v) { if (isGain) log.maxGain = Math.max(log.maxGain, v); } });
  const node = () => ({ connect() {}, start() {}, stop() {} });
  class Ctx {
    constructor() { log.created++; this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 44100; this.destination = {}; }
    resume() { log.resumed++; this.state = 'running'; }
    createOscillator() { log.osc++; return Object.assign(node(), { type: '', frequency: param() }); }
    createGain() { return Object.assign(node(), { gain: param(true) }); }
    createBiquadFilter() { return Object.assign(node(), { type: '', frequency: param() }); }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
    createBufferSource() { log.noise++; return Object.assign(node(), { buffer: null }); }
  }
  return { win: { AudioContext: Ctx }, log };
}
const NAMES = ['deal', 'chip', 'fold', 'check', 'win', 'ok', 'bad', 'goal', 'turn', 'end'];
{
  const { win, log } = fakeAudio();
  const S = H.loadSound(win);
  for (const n of NAMES) {
    const before = log.osc + log.noise;
    TS.noThrow('звук «' + n + '» без ошибок', () => S.play(n));
    TS.check('звук «' + n + '» что-то воспроизводит', log.osc + log.noise > before);
  }
  TS.eq('один AudioContext на все звуки', log.created, 1);
  TS.check('контекст «разбужен»', log.resumed >= 1);
  TS.noThrow('неизвестный звук — тишина', () => S.play('нет такого'));
  TS.check('громкость по умолчанию умеренная', log.maxGain > 0 && log.maxGain <= 0.35, log.maxGain);
  S.setVolume(5); log.maxGain = 0; NAMES.forEach(n => S.play(n));
  TS.check('громкость ограничена сверху', log.maxGain <= 1 && log.maxGain > 0.35, log.maxGain);
  S.setVolume(0.1); log.maxGain = 0; S.play('win');
  TS.check('тише при малой громкости', log.maxGain <= 0.1, log.maxGain);
  S.setEnabled(false);
  const before = log.osc + log.noise;
  S.play('win');
  TS.check('выключенный звук молчит', log.osc + log.noise === before && S.enabled === false);
  S.setEnabled(true);
  S.play('win');
  TS.check('включили — снова звучит', log.osc + log.noise > before && S.enabled === true);
}
{
  const S = H.loadSound({});
  TS.noThrow('без WebAudio — без исключений', () => NAMES.forEach(n => S.play(n)));
  const S2 = H.loadSound({ AudioContext: function () { throw new Error('запрещено'); } });
  TS.noThrow('AudioContext запрещён — без исключений', () => S2.play('chip'));
}
TS.done();
