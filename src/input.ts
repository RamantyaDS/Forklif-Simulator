// Keyboard, gamepad and touch mapped onto the forklift's controls. Held keys and analog inputs are combined every
// frame in applyHeld(); one-shot actions fire on key down / button press.
import { setDir, startEngine, stopEngine, togglePark } from './sim/forklift';
import { ensureAudio } from './sound';
import { fk, useUI, type CamMode } from './store';

const held = new Set<string>();
/** Touch controls write here (phone layout). */
export const touch = { steer: 0, gas: 0, brake: 0, inch: 0, lift: 0, tilt: 0, spread: 0 };
if (import.meta.env.DEV) (globalThis as unknown as { touch: typeof touch }).touch = touch;
/** Camera look from the gamepad's right stick (the mouse drags are handled in the camera rig). */
export const padLook = { x: 0, y: 0 };
export const pad = { connected: false, name: '' };

export const KEYS: [string, string][] = [
  ['W / ↑', 'Gas'],
  ['S / ↓', 'Rem'],
  ['A / D  ← / →', 'Setir kiri / kanan'],
  ['Shift kiri', 'Pedal inching (kopling selip: jalan merayap, mesin tetap bisa digas)'],
  ['Q / E', 'Arah: maju / mundur'],
  ['N', 'Netral'],
  ['R / F', 'Garpu naik / turun'],
  ['T / G', 'Tilt mundur / maju'],
  ['Y / H', 'Lebar garpu tambah / kurang (garpu kosong)'],
  ['P', 'Rem parkir'],
  ['I', 'Kunci kontak: hidup / mati mesin'],
  ['B', 'Klakson'],
  ['L', 'Lampu kerja'],
  ['V', 'Ganti kamera'],
  ['X', 'Overlay stabilitas'],
  ['Mouse', 'Seret untuk melihat sekeliling, roda mouse untuk zoom'],
];

export const PAD_KEYS: [string, string][] = [
  ['Stik kiri', 'Setir'],
  ['RT / LT', 'Gas / rem'],
  ['X', 'Inching (tahan)'],
  ['RB / LB', 'Maju / mundur'],
  ['Y', 'Netral'],
  ['D-pad ↑↓', 'Garpu naik / turun'],
  ['D-pad ←→', 'Tilt maju / mundur'],
  ['Stik kanan', 'Lihat sekeliling'],
  ['A', 'Klakson'],
  ['B', 'Ganti kamera'],
  ['Start', 'Hidup / mati mesin'],
  ['Back', 'Rem parkir'],
];

export function toggleEngine() {
  void ensureAudio();
  if (fk.engine === 'off') startEngine(fk);
  else stopEngine(fk);
}

export const CAMS: CamMode[] = ['chase', 'cab', 'fork', 'orbit', 'top'];
export function nextCam() {
  const ui = useUI.getState();
  ui.set({ cam: CAMS[(CAMS.indexOf(ui.cam) + 1) % CAMS.length] });
}

function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const k = e.key.toLowerCase();
  if (e.type === 'keyup') {
    held.delete(k);
    if (k === 'b') fk.horn = false;
    return;
  }
  if (['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  if (held.has(k)) return;
  held.add(k);
  if (k === 'q') setDir(fk, 'F');
  else if (k === 'e') setDir(fk, 'R');
  else if (k === 'n') setDir(fk, 'N');
  else if (k === 'p') togglePark(fk);
  else if (k === 'i') toggleEngine();
  else if (k === 'b') fk.horn = true;
  else if (k === 'l') fk.lights = !fk.lights;
  else if (k === 'v') nextCam();
  else if (k === 'x') useUI.getState().set({ overlay: !useUI.getState().overlay });
}

export function bindKeys() {
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKey);
  addEventListener('blur', () => held.clear());
  addEventListener('gamepadconnected', (e) => {
    pad.connected = true;
    pad.name = (e as GamepadEvent).gamepad.id;
  });
  addEventListener('gamepaddisconnected', () => (pad.connected = false));
}

const prevButtons: boolean[] = [];
const dz = (v: number, d = 0.12) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

/** Continuous controls, called every frame. */
export function applyHeld(dt: number) {
  let gp: Gamepad | null = null;
  for (const g of navigator.getGamepads?.() ?? []) if (g && g.connected) gp = gp ?? g;
  const btn = (i: number) => !!gp?.buttons[i]?.pressed;
  const val = (i: number) => gp?.buttons[i]?.value ?? 0;
  if (gp) {
    // one-shot buttons (standard mapping)
    const press = (i: number) => btn(i) && !prevButtons[i];
    if (press(5)) setDir(fk, 'F');
    if (press(4)) setDir(fk, 'R');
    if (press(3)) setDir(fk, 'N');
    if (press(1)) nextCam();
    if (press(9)) toggleEngine();
    if (press(8)) togglePark(fk);
    if (press(10)) useUI.getState().set({ overlay: !useUI.getState().overlay });
    fk.horn = btn(0) || held.has('b');
    gp.buttons.forEach((b, i) => (prevButtons[i] = b.pressed));
    padLook.x = dz(gp.axes[2] ?? 0);
    padLook.y = dz(gp.axes[3] ?? 0);
  } else {
    padLook.x = 0;
    padLook.y = 0;
  }

  const left = held.has('a') || held.has('arrowleft');
  const right = held.has('d') || held.has('arrowright');
  const stick = gp ? -dz(gp.axes[0] ?? 0) : 0;
  const keySteer = left ? 1 : right ? -1 : 0;
  if (stick !== 0 || touch.steer !== 0) fk.steerInput = stick !== 0 ? stick : touch.steer;
  else fk.steerInput += Math.sign(keySteer - fk.steerInput) * Math.min(Math.abs(keySteer - fk.steerInput), dt * (keySteer === 0 ? 2.2 : 1.4));

  const gas = Math.max(held.has('w') || held.has('arrowup') ? 1 : 0, val(7), touch.gas);
  fk.pedal += (gas - fk.pedal) * Math.min(1, dt * 5);
  fk.brake = Math.max(held.has('s') || held.has('arrowdown') ? 1 : 0, val(6), touch.brake);
  const inch = Math.max(held.has('shift') ? 1 : 0, btn(2) ? 1 : 0, touch.inch);
  fk.inch += (inch - fk.inch) * Math.min(1, dt * 6);

  fk.liftLever = (held.has('r') || btn(12) ? 1 : 0) - (held.has('f') || btn(13) ? 1 : 0) || touch.lift;
  fk.tiltLever = (held.has('t') || btn(15) ? 1 : 0) - (held.has('g') || btn(14) ? 1 : 0) || touch.tilt;
  fk.spreadLever = (held.has('y') ? 1 : 0) - (held.has('h') ? 1 : 0) || touch.spread;
}
