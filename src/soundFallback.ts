// Fallback when the browser won't create a Web Audio context: plain <audio> elements playing the same recordings.
// The engine loops still follow rpm: playbackRate with pitch preservation off shifts the pitch like the main engine.
import { fk } from './store';

const BASE = import.meta.env.BASE_URL + 'audio/';
let els: Record<string, HTMLAudioElement> | null = null;

function make(name: string, loop: boolean) {
  const a = new Audio(BASE + name);
  a.loop = loop;
  a.preload = 'auto';
  a.volume = 0;
  (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = false;
  return a;
}

export const fallbackActive = () => !!els;

/** Must run inside a user gesture so play() is allowed. */
export function startFallback() {
  if (els) return;
  els = {
    idle: make('engine-idle-810rpm.wav', true),
    mid: make('engine-mid-1290rpm.wav', true),
    hyd: make('hydraulic-pump.wav', true),
  };
  for (const a of Object.values(els)) a.play().catch(() => undefined);
}

export function fallbackEvent(e: string) {
  if (!els) return;
  const one = (name: string, vol: number) => {
    const a = new Audio(BASE + name);
    a.volume = vol;
    a.play().catch(() => undefined);
  };
  if (e === 'start') one('engine-start.wav', 0.9);
  else if (e === 'stop' || e === 'stall') one('engine-stop.wav', 0.9);
}

export function updateFallback(distance: number, inCab: boolean) {
  if (!els) return;
  const on = fk.engine === 'running' ? 1 : 0;
  const rpm = Math.max(300, fk.rpm);
  const x = Math.max(0, Math.min(1, (rpm - 1000) / 700));
  const near = Math.min(1, 12 / Math.max(5, distance)) * (inCab ? 0.7 : 1);
  const set = (a: HTMLAudioElement, vol: number, rate: number) => {
    a.volume = Math.max(0, Math.min(1, vol));
    a.playbackRate = Math.max(0.5, Math.min(3, rate));
    if (a.paused && vol > 0) a.play().catch(() => undefined);
  };
  set(els.idle, on * (1 - x) * 0.9 * near, (rpm / 810) * 0.92);
  set(els.mid, on * x * (0.85 + 0.25 * fk.load) * near, (rpm / 1290) * 0.92);
  set(els.hyd, on * Math.min(1, fk.hydFlow) * 0.5 * near, Math.max(0.6, rpm / 1700));
}
