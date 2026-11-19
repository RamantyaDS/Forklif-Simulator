import { create as createStore } from 'zustand';
import { create as createForklift, step, type Assists, type Forklift } from './sim/forklift';
import { setJob, type JobId } from './sim/jobs';
import { stepTraffic } from './sim/traffic';

// Simulation state, mutated in place every frame; `tick` bumps so React panels refresh at a modest rate.
export const fk: Forklift = createForklift(loadAssists());

// development and headless checks: the state is reachable from the console
if (import.meta.env.DEV) (globalThis as unknown as { fk: Forklift }).fk = fk;

export type CamMode = 'chase' | 'cab' | 'fork' | 'orbit' | 'top';

interface UI {
  tick: number;
  cam: CamMode;
  help: boolean;
  started: boolean;
  panel: boolean;
  overlay: boolean;
  night: boolean;
  rain: boolean;
  xray: boolean;
  job: JobId;
  jobs: boolean;
  p2hOpen: string;
  jobVersion: number;
  toast: string;
  toastUntil: number;
  bump: () => void;
  set: (p: Partial<Omit<UI, 'bump' | 'set'>>) => void;
}

const narrow = typeof innerWidth === 'number' && innerWidth < 760;

export const useUI = createStore<UI>((set) => ({
  tick: 0,
  cam: 'chase',
  help: false,
  started: false,
  panel: !narrow,
  overlay: true,
  night: false,
  rain: false,
  xray: false,
  job: 'genset',
  jobs: false,
  p2hOpen: '',
  jobVersion: 0,
  toast: '',
  toastUntil: 0,
  bump: () => set((s) => ({ tick: s.tick + 1 })),
  set: (p) => set(p),
}));

export function toast(msg: string, ms = 4500) {
  useUI.getState().set({ toast: msg, toastUntil: performance.now() + ms });
}

const listeners = new Set<(e: string) => void>();
export function onEvent(f: (e: string) => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}

/** Advances the simulation with fixed 5 ms steps. */
export function advance(dt: number) {
  const total = Math.min(dt, 0.1);
  stepTraffic(fk, total);
  const n = Math.max(1, Math.ceil(total / 0.005));
  for (let i = 0; i < n; i++) step(fk, total / n);
  if (fk.events.length) for (const e of fk.events.splice(0)) for (const f of listeners) f(e);
  if (fk.msg) {
    toast(fk.msg);
    fk.msg = '';
  }
}

const KEY = 'forklift-assists';
function loadAssists(): Partial<Assists> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}
export function saveAssists() {
  try {
    localStorage.setItem(KEY, JSON.stringify(fk.assists));
  } catch {
    /* private mode */
  }
}

/** Start the job again: same assists, everything else fresh. */
export function resetJob() {
  const a = fk.assists;
  const ui = useUI.getState();
  setJob(ui.job);
  Object.assign(fk, createForklift(a));
  fk.wet = ui.rain;
  ui.set({ p2hOpen: '', jobVersion: ui.jobVersion + 1 });
}

/** Switch to another job (fresh start). */
export function chooseJob(id: JobId) {
  useUI.getState().set({ job: id, jobs: false });
  resetJob();
}

export function setRain(on: boolean) {
  useUI.getState().set({ rain: on });
  fk.wet = on;
}
