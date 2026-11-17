// Forklift sound: a synthesized Hino J08E inline six (firing pulse by pulse) over real diesel recordings from
// Wikimedia Commons (see README): an idle and a raised-speed loop pitched to the engine speed, a Cummins diesel
// start, the engine shutdown, and a Komatsu 941's hydraulic pump whine for the mast hydraulics. Synthesized on top:
// torque converter whine, turbo, relief valve, air brake hiss and dryer purge, chain clatter, tyres, air horn,
// reverse beeper, stability alarm and impacts.
import { ENGINE_WORKLET } from './engineWorklet';
import { fk, toast } from './store';
import { fallbackActive, fallbackEvent, startFallback, updateFallback } from './soundFallback';

const BASE = import.meta.env.BASE_URL + 'audio/';
let ctx: AudioContext | null = null;
let master: GainNode;
let enabled = true;
let N: Awaited<ReturnType<typeof build>> | null = null;

/** What the sound system is doing, shown in the panel so problems are visible without developer tools. */
export const soundStatus = { text: 'belum aktif', ok: false };
const report = (text: string, ok = false) => {
  soundStatus.text = text;
  soundStatus.ok = ok;
};

let unlocked = false;
/** Resume and play a short silent buffer from inside a user gesture: the reliable way to unlock Web Audio. */
function unlock(c: AudioContext) {
  if (c.state === 'running' && unlocked) return;
  c.resume().catch(() => undefined);
  const b = c.createBuffer(1, 1, c.sampleRate);
  const s = c.createBufferSource();
  s.buffer = b;
  s.connect(c.destination);
  s.start(0);
  unlocked = c.state === 'running';
}

/** The ignition key click, played inside the start gesture (an audible tone in the gesture wakes up Edge). */
function keyClick(c: AudioContext) {
  const t0 = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(1800, t0);
  o.frequency.exponentialRampToValueAtTime(600, t0 + 0.05);
  g.gain.setValueAtTime(0.12, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + 0.15);
}

async function load(c: AudioContext, name: string) {
  const r = await fetch(BASE + name);
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  const data = await r.arrayBuffer();
  return new Promise<AudioBuffer>((res, rej) => c.decodeAudioData(data, res, (e) => rej(new Error(`${name}: tidak bisa didekode (${e?.message ?? e})`))));
}

function noise(c: AudioContext) {
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function loop(c: AudioContext, buf: AudioBuffer, out: AudioNode) {
  const s = c.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  const g = c.createGain();
  g.gain.value = 0;
  s.connect(g).connect(out);
  s.start();
  return { s, g };
}

async function build(c: AudioContext) {
  const [idleB, midB, startB, stopB, hydB] = await Promise.all(
    ['engine-idle-810rpm.wav', 'engine-mid-1290rpm.wav', 'engine-start.wav', 'engine-stop.wav', 'hydraulic-pump.wav'].map((n) => load(c, n)),
  );
  // Engine bus: load opens up the tone (lowpass) and adds a little grit.
  const engineBus = c.createGain();
  const tone = c.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2500;
  const body = c.createBiquadFilter();
  body.type = 'lowshelf';
  body.frequency.value = 120;
  body.gain.value = 5;
  const shaper = c.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = (i / 1023) * 2 - 1;
    curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);
  }
  shaper.curve = curve;
  engineBus.connect(body).connect(tone).connect(shaper).connect(master);
  const idle = loop(c, idleB, engineBus);
  const mid = loop(c, midB, engineBus);

  // Synthesized inline six: the main voice of the engine. Optional: some browsers block AudioWorklet.
  const synthG = c.createGain();
  synthG.gain.value = 0;
  let synth: AudioWorkletNode | null = null;
  try {
    if (!c.audioWorklet) throw new Error('AudioWorklet not available');
    const url = URL.createObjectURL(new Blob([ENGINE_WORKLET], { type: 'application/javascript' }));
    await c.audioWorklet.addModule(url);
    synth = new AudioWorkletNode(c, 'diesel-engine', { outputChannelCount: [1] });
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    synth.connect(lp).connect(synthG).connect(engineBus);
  } catch (e) {
    console.warn('Engine synth layer unavailable, using recordings only', e);
  }

  const nb = noise(c);
  const noiseLoop = (type: BiquadFilterType, f: number, q: number) => {
    const s = c.createBufferSource();
    s.buffer = nb;
    s.loop = true;
    s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = c.createGain();
    g.gain.value = 0;
    s.connect(fl).connect(g).connect(master);
    s.start();
    return { f: fl, g };
  };
  const osc = (type: OscillatorType, f: number, lowpass = 0) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.value = 0;
    if (lowpass) {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = lowpass;
      o.connect(lp).connect(g).connect(master);
    } else o.connect(g).connect(master);
    o.start();
    return { o, g };
  };

  const turbo = osc('sine', 3000);
  const conv = osc('triangle', 300, 1400); // torque converter whine
  const hyd = loop(c, hydB, master); // mast hydraulics
  const relief = noiseLoop('bandpass', 2900, 6); // relief valve at full pressure
  const tyre = noiseLoop('bandpass', 420, 0.7);
  // air horn: two detuned reeds
  const hornG = c.createGain();
  hornG.gain.value = 0;
  const hornLp = c.createBiquadFilter();
  hornLp.type = 'lowpass';
  hornLp.frequency.value = 2200;
  hornG.connect(hornLp).connect(master);
  for (const f of [311, 392]) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(hornG);
    o.start();
  }
  const beep = osc('square', 1150); // reverse beeper
  const alarm = osc('square', 2600); // stability / overload alarm
  // tyre squeal: a narrow, wobbling band of noise; forks scraping: gritty high band with a rattle
  const squeal = noiseLoop('bandpass', 2100, 9);
  const squealLfo = c.createOscillator();
  squealLfo.frequency.value = 7;
  const squealDepth = c.createGain();
  squealDepth.gain.value = 220;
  squealLfo.connect(squealDepth).connect(squeal.f.frequency);
  squealLfo.start();
  const scrape = noiseLoop('bandpass', 3400, 2.5);
  const scrapeAm = c.createOscillator();
  scrapeAm.type = 'square';
  scrapeAm.frequency.value = 23;
  const scrapeDepth = c.createGain();
  scrapeDepth.gain.value = 0;
  scrapeAm.connect(scrapeDepth).connect(scrape.g.gain);
  scrapeAm.start();
  // port ambience: wind over the yard and water lapping at the quay wall (slow swell)
  const wind = noiseLoop('lowpass', 420, 0.5);
  const water = noiseLoop('bandpass', 650, 0.8);
  const swell = c.createOscillator();
  swell.frequency.value = 0.18;
  const swellDepth = c.createGain();
  swellDepth.gain.value = 0;
  swell.connect(swellDepth).connect(water.g.gain);
  swell.start();
  return { startB, stopB, nb, engineBus, tone, idle, mid, synth, synthG, turbo, conv, hyd, relief, tyre, hornG, beep, alarm, squeal, scrape, scrapeDepth, wind, water, swellDepth };
}

// After the user has asked for sound, every interaction retries: creating the AudioContext failed on the first
// click in one Edge setup and only worked on a later one.
let wanted = false;
let attempts = 0;
let lastError = '';
let building = false;
let useFallbackNext = false;
const retry = () => {
  if (!wanted || fallbackActive()) return;
  if (useFallbackNext) {
    startFallback();
    if (master) master.gain.value = 0;
    return report('jalur cadangan <audio> (Web Audio terkunci)', true);
  }
  void ensureAudio();
};

let clicked = false;
/** Create the context if needed, resume it and play the key click, all inside the user's gesture. */
export async function ensureAudio() {
  wanted = true;
  if (!ctx) await initSound();
  if (!ctx) return;
  await ctx.resume().catch(() => undefined);
  if (!clicked) {
    clicked = true;
    keyClick(ctx);
  }
}
for (const ev of ['pointerdown', 'pointerup', 'click', 'keydown', 'touchend']) addEventListener(ev, retry, { capture: true });

/** Must be called from a user gesture. */
export async function initSound() {
  wanted = true;
  if (ctx) return ctx.resume();
  if (building) return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return report('browser tidak mendukung Web Audio');
  attempts++;
  let c: AudioContext;
  try {
    if (new URLSearchParams(location.search).get('audio') === 'html') throw new Error('forced by ?audio=html');
    c = new AC();
  } catch (e) {
    lastError = `${(e as Error)?.name ?? ''} ${(e as Error)?.message ?? e}`.trim();
    console.error('AudioContext failed', e);
    if (attempts >= 2 || lastError.includes('forced')) {
      startFallback();
      return report(`jalur cadangan <audio> (Web Audio gagal: ${lastError})`, true);
    }
    return report(`Web Audio gagal, mencoba lagi di klik berikutnya (${lastError})`);
  }
  building = true;
  ctx = c;
  unlock(ctx);
  report('memuat rekaman…');
  master = ctx.createGain();
  master.gain.value = enabled ? 0.9 : 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  master.connect(comp).connect(ctx.destination);
  try {
    N = await build(ctx);
    report(ctx.state === 'running' ? `aktif${N.synth ? '' : ' (tanpa lapisan sintetis)'}` : 'dijeda browser, klik di mana saja', ctx.state === 'running');
    if (ctx.state !== 'running') toast('Klik di mana saja untuk menyalakan suara.', 6000);
    setTimeout(() => {
      if (ctx && ctx.state !== 'running' && !fallbackActive()) {
        useFallbackNext = true;
        report('Web Audio terkunci, klik sekali lagi untuk jalur cadangan');
      }
    }, 1500);
    ctx.onstatechange = () => report(ctx!.state === 'running' ? 'aktif' : `status: ${ctx!.state}`, ctx!.state === 'running');
  } catch (e) {
    console.error('Sound failed to load', e);
    lastError = `${(e as Error)?.message ?? e}`;
    report(`gagal: ${lastError}`);
  }
  building = false;
}

export function setSound(on: boolean) {
  enabled = on;
  if (ctx) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.05);
}
export const soundOn = () => enabled;

function oneShot(buf: AudioBuffer, gain = 1, rate = 1) {
  if (!ctx) return;
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = gain;
  s.connect(g).connect(master);
  s.start();
}

/** A metallic knock: band-passed noise plus a falling thud. */
function clunk(freq = 1600, gain = 0.4, len = 0.1) {
  if (!ctx || !N) return;
  const t = ctx.currentTime;
  const s = ctx.createBufferSource();
  s.buffer = N.nb;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + len + 0.05);
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(freq / 12, t);
  o.frequency.exponentialRampToValueAtTime(40, t + len * 1.5);
  const og = ctx.createGain();
  og.gain.setValueAtTime(gain, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + len * 1.5);
  o.connect(og).connect(master);
  o.start(t);
  o.stop(t + len * 2);
}

/** A burst of filtered noise: air hiss, dryer purge, chain clank, scraping. */
function burst(freq: number, q: number, gain: number, len: number, type: BiquadFilterType = 'bandpass', attack = 0.005) {
  if (!ctx || !N) return;
  const t = ctx.currentTime;
  const s = ctx.createBufferSource();
  s.buffer = N.nb;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + len + 0.05);
}

export function playEvent(e: string) {
  fallbackEvent(e);
  if (!N) return;
  if (e === 'start') oneShot(N.startB, 1);
  else if (e === 'stop' || e === 'stall') oneShot(N.stopB, 1);
  else if (e === 'shift') clunk(900, 0.25, 0.1);
  else if (e === 'dir') clunk(700, 0.3, 0.12);
  else if (e === 'airRelease') burst(4200, 0.6, 0.3, 0.5, 'highpass', 0.01);
  else if (e === 'purge') burst(3000, 0.5, 0.5, 1.2, 'highpass', 0.02);
  else if (e === 'parkOn' || e === 'parkOff') {
    burst(2600, 0.7, 0.35, 0.35, 'highpass');
    clunk(500, 0.3, 0.12);
  } else if (e === 'pickup') {
    clunk(320, 0.55, 0.25);
    burst(900, 2, 0.12, 0.4);
  } else if (e === 'setdown') clunk(220, 0.7, 0.3);
  else if (e === 'bump') clunk(380, 0.8, 0.25);
  else if (e === 'slide') burst(1800, 3, 0.35, 1.2, 'bandpass', 0.05);
  else if (e === 'thump') clunk(160, 0.9, 0.35);
  else if (e === 'fall' || e === 'tipover') burst(500, 0.8, 0.3, 1.2, 'lowpass', 0.3);
  else if (e === 'crash') {
    clunk(120, 1.2, 0.8);
    burst(700, 0.5, 0.9, 1.8, 'lowpass', 0.01);
    burst(3500, 1, 0.35, 1.2);
  } else if (e === 'done') clunk(1500, 0.2, 0.1);
  else if (e === 'forkTouch') {
    clunk(1100, 0.35, 0.09);
    burst(2600, 3, 0.08, 0.15);
  }
}

/** A distant ship horn: two low reeds, slow attack and long fade. */
function shipHorn() {
  if (!ctx || !N) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.05, t + 0.4);
  g.gain.setValueAtTime(0.05, t + 2.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  g.connect(lp).connect(master);
  for (const f of [73, 110]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(g);
    o.start(t);
    o.stop(t + 4.3);
  }
}

/** Gulls: a few falling chirps. */
function gulls() {
  if (!ctx || !N) return;
  const t0 = ctx.currentTime;
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const t = t0 + i * (0.28 + Math.random() * 0.15);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(2300 + Math.random() * 300, t);
    o.frequency.exponentialRampToValueAtTime(1300, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.02, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.3);
  }
}
let nextHorn = 25;
let nextGull = 8;

let rattleT = 0;
/** Per-frame update; `distance` from the camera to the truck, `inCab` for the muffled cab view. */
export function updateSound(distance: number, inCab: boolean) {
  updateFallback(distance, inCab);
  if (!ctx || !N) return;
  const t = ctx.currentTime;
  const k = (p: AudioParam, v: number, tc = 0.05) => p.setTargetAtTime(v, t, tc);
  const near = Math.min(1, 12 / Math.max(5, distance));
  const running = fk.engine === 'running' || fk.engine === 'starting';
  const on = fk.engine === 'running' ? 1 : 0;
  const rpm = Math.max(1, fk.rpm);
  const cab = inCab ? 0.55 : 1;

  // recorded diesel loops, pitched for the Hino's higher-revving six
  const x = Math.max(0, Math.min(1, (rpm - 1000) / 700));
  k(N.idle.s.playbackRate, Math.max(0.5, (rpm / 810) * 0.92), 0.03);
  k(N.mid.s.playbackRate, Math.max(0.5, (rpm / 1290) * 0.92), 0.03);
  k(N.idle.g.gain, on * (1 - x) * 0.55);
  k(N.mid.g.gain, on * x * (0.5 + 0.25 * fk.load));
  k(N.tone.frequency, inCab ? 800 + fk.load * 500 : 1600 + fk.load * 3200, 0.15);
  k(N.engineBus.gain, near * cab, 0.2);

  if (N.synth) {
    const p = N.synth.parameters;
    k(p.get('rpm')!, running ? rpm : 0, 0.02);
    k(p.get('load')!, fk.load, 0.15);
    p.get('firing')!.setValueAtTime(on, t);
    p.get('starter')!.setValueAtTime(fk.engine === 'starting' ? 1 : 0, t);
    k(p.get('cold')!, Math.max(0, Math.min(1, (60 - fk.coolant) / 30)), 1);
  }
  k(N.synthG.gain, (on * (0.35 + 0.6 * Math.min(1, fk.load)) + (fk.engine === 'starting' ? 0.5 : 0)) * 0.9, 0.12);

  k(N.turbo.o.frequency, 2600 + 5200 * Math.min(1, rpm / 2400) * (0.4 + 0.6 * Math.min(1, fk.load)), 0.35);
  k(N.turbo.g.gain, on * near * (0.002 + 0.012 * fk.load) * cab, 0.3);
  // converter: whine from the speed difference between pump and turbine
  const slipping = fk.dir !== 'N' ? Math.max(0, 1 - fk.slip) : 0;
  k(N.conv.o.frequency, 180 + (rpm / 60) * 7 * (0.6 + 0.4 * slipping), 0.08);
  k(N.conv.g.gain, on * near * 0.025 * slipping * Math.min(1, fk.load + 0.2) * cab, 0.1);

  // hydraulics: pump whine with the levers, the relief valve screaming at full pressure
  k(N.hyd.s.playbackRate, Math.max(0.6, rpm / 1700), 0.1);
  k(N.hyd.g.gain, on * near * Math.min(1, fk.hydFlow) * 0.6, 0.1);
  k(N.relief.g.gain, fk.relief ? near * 0.22 : 0, 0.05);
  // chain clatter while the carriage moves
  if (Math.abs(fk.liftLever) > 0.05 && running) {
    rattleT -= 1 / 60;
    if (rattleT <= 0) {
      rattleT = 0.05 + Math.random() * 0.08;
      burst(2400 + Math.random() * 1500, 4, 0.05 * near, 0.05);
    }
  }

  // tyres
  const sp = Math.abs(fk.v);
  k(N.tyre.f.frequency, 320 + sp * 50, 0.2);
  k(N.tyre.g.gain, Math.min(0.2, sp * 0.03) * near * cab, 0.1);

  // horn, reverse beeper (while reverse is selected and running), stability alarm
  k(N.hornG.gain, fk.horn ? 0.12 * Math.max(0.4, near) : 0, 0.02);
  const beepOn = fk.dir === 'R' && running && Math.sin(t * Math.PI * 2 * 1.1) > 0;
  k(N.beep.g.gain, beepOn ? 0.05 * near : 0, 0.005);
  const warn = fk.assists.sas && !fk.tipped && fk.risk > 0.8 && Math.sin(t * Math.PI * 2 * 4) > 0;
  k(N.alarm.g.gain, warn ? 0.03 : 0, 0.005);

  // tyres at the grip limit, forks dragging
  k(N.squeal.g.gain, fk.squeal * 0.09 * near * cab, 0.05);
  k(N.scrape.g.gain, fk.scrape * 0.09 * near, 0.04);
  k(N.scrapeDepth.gain, fk.scrape * 0.05 * near, 0.04);
  k(N.scrape.f.frequency, 2600 + fk.scrape * 1600, 0.1);

  // ambience: always there, the water louder near the quay; a ship horn and gulls now and then
  const quay = Math.max(0, Math.min(1, 1 - (fk.z + 30) / 40));
  k(N.wind.g.gain, 0.025 * cab, 0.5);
  k(N.swellDepth.gain, 0.02 + 0.05 * quay, 0.5);
  if (t > nextHorn) {
    nextHorn = t + 70 + Math.random() * 80;
    shipHorn();
  }
  if (t > nextGull) {
    nextGull = t + 12 + Math.random() * 25;
    gulls();
  }
}
