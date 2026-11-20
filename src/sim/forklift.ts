// Toyota 4FD240 simulation: Hino engine, torque converter and 2-speed powershift, air-over-hydraulic wet brakes,
// rear-wheel steering, mast hydraulics, the stability triangle (the truck tips about a real edge) and the job's load
// (picked up, carried, sliding on the forks, set down or dropped), wet ground, cones and the test checkpoints.
// Pure logic: the scene, sound and panels read it.
//
// Truck ("body") frame: origin at the front axle centre on the ground, +z toward the forks, +x to the driver's left,
// y up. World pose: (x, z) of that origin and `heading` (body +z → (sin h, cos h)).
import { clamp, overlaps, toLocal, toWorld, type Obb } from './geom';
import { JOB } from './jobs';
import { pickDefects } from './p2h';
import { CONVERTER, SPEC, capacityAt, maxTorque } from './spec';
import { CARGO_START, CONES, DYNAMIC, LOAD, OBSTACLES, PAD, START, supportAt } from './world';
import { EMBED } from '../embed';

const GENSET = LOAD; // the current job's load (kept short: it is used everywhere below)

const G = 9.81;
export type Dir = 'F' | 'N' | 'R';
export type EngineState = 'off' | 'starting' | 'running' | 'stopping';

export interface Assists {
  sas: boolean; // speed limit with the load high or the truck near its limits, warning before it tips
  autoAccel: boolean; // engine speeds up by itself for the hydraulics when standing
  guide: boolean; // fork height guide and hints
  airFull: boolean; // brake air already charged at start
  dirGuard: boolean; // refuses a direction change at speed
}

export type Phase = 'pickup' | 'carry' | 'place' | 'course' | 'done' | 'failed' | 'p2h';

export interface Cargo {
  state: 'rest' | 'forks' | 'falling' | 'fallen';
  // resting / fallen: world pose of the set's base-frame bottom centre
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number; // only when fallen
  roll: number;
  // on the forks: carriage frame (lateral, along the forks from the heel) and yaw relative to the truck
  lx: number;
  a: number;
  yawRel: number;
  va: number; // sliding speed along the forks
  vl: number; // sliding speed sideways
  sliding: boolean;
  near: number; // set's extent from its centre of mass toward the carriage, along the forks
  // falling animation
  fallT: number;
  fallDir: [number, number]; // world direction it tips over
  y0: number;
}

export interface Forklift {
  x: number;
  z: number;
  heading: number;
  v: number;
  accel: number; // m/s², smoothed, along the truck
  yawRate: number;
  steer: number; // rad, + turns left (the rear wheels point the other way)
  // driver
  steerInput: number;
  pedal: number;
  brake: number;
  inch: number;
  dir: Dir;
  park: boolean; // parking brake switch
  horn: boolean;
  lights: boolean;
  liftLever: number; // −1..1
  tiltLever: number; // + = back
  spreadLever: number;
  // driveline
  gear: 1 | 2;
  shiftT: number;
  engine: EngineState;
  starterT: number;
  rpm: number;
  load: number; // engine load 0..1
  slip: number; // converter speed ratio
  fuel: number;
  coolant: number;
  hours: number;
  // brakes
  air: number; // bar
  compressor: boolean;
  parkOn: boolean;
  brakeHeld: number;
  // mast
  lift: number; // fork underside at the heel, m
  tilt: number; // rad, + = back
  spread: number; // outer edge to outer edge, m
  pressure: number; // lift circuit, bar
  relief: boolean;
  hydFlow: number; // 0..1 how hard the pump is working (for sound)
  scrape: number; // 0..1 forks dragging on the ground or the deck
  squeal: number; // 0..1 tyres at their grip limit (hard braking or a fast tight turn)
  // stability
  cg: { x: number; y: number; z: number };
  proj: { x: number; z: number };
  risk: number; // 0 safe .. 1 at the tipping edge
  tipEdge: number; // −1 none, 0 front, 1 left, 2 right
  tip: number; // rad
  tipV: number;
  tipped: boolean;
  // cargo and job
  cargo: Cargo;
  assists: Assists;
  bumps: number;
  damage: number; // 0..100 (genset)
  maxRisk: number;
  time: number;
  phase: Phase;
  result: { dist: number; yaw: number; stars: number; score?: number; notes?: string[] } | null;
  wet: boolean; // rain on the concrete: less grip, the load slides sooner
  cones: number; // knocked over
  cp: number; // next checkpoint (test course)
  placed: boolean;
  defects: string[]; // P2H faults hidden in this unit
  answers: Record<string, 'ok' | 'bad'>;
  placeErr?: { dist: number; yaw: number };
  events: string[];
  msg: string;
}

export function createCargo(): Cargo {
  return {
    state: 'rest',
    x: CARGO_START.x,
    y: CARGO_START.y,
    z: CARGO_START.z,
    yaw: CARGO_START.yaw,
    pitch: 0,
    roll: 0,
    lx: 0,
    a: 0,
    yawRel: 0,
    va: 0,
    vl: 0,
    sliding: false,
    near: 1.1,
    fallT: 0,
    fallDir: [0, 1],
    y0: 0,
  };
}

export function create(assists?: Partial<Assists>): Forklift {
  const a: Assists = { sas: true, autoAccel: true, guide: true, airFull: false, dirGuard: true, ...assists };
  return {
    x: START.x,
    z: START.z,
    heading: START.heading,
    v: 0,
    accel: 0,
    yawRate: 0,
    steer: 0,
    steerInput: 0,
    pedal: 0,
    brake: 0,
    inch: 0,
    dir: 'N',
    park: true,
    horn: false,
    lights: false,
    liftLever: 0,
    tiltLever: 0,
    spreadLever: 0,
    gear: 1,
    shiftT: 0,
    engine: 'off',
    starterT: 0,
    rpm: 0,
    load: 0,
    slip: 0,
    fuel: 310,
    coolant: 34,
    hours: 2861.4,
    air: a.airFull ? 8.2 : 2.2,
    compressor: false,
    parkOn: true,
    brakeHeld: 0,
    lift: 0.25,
    tilt: 0,
    spread: 1.9,
    pressure: 0,
    relief: false,
    hydFlow: 0,
    scrape: 0,
    squeal: 0,
    cg: { x: 0, y: 0, z: 0 },
    proj: { x: 0, z: 0 },
    risk: 0,
    tipEdge: -1,
    tip: 0,
    tipV: 0,
    tipped: false,
    cargo: createCargo(),
    assists: a,
    bumps: 0,
    damage: 0,
    maxRisk: 0,
    time: 0,
    phase: JOB.cur.id === 'p2h' ? 'p2h' : 'pickup',
    result: null,
    wet: false,
    cones: 0,
    cp: 0,
    placed: false,
    defects: JOB.cur.id === 'p2h' ? pickDefects() : [],
    answers: {},
    events: [],
    msg: '',
  };
}

// ---------- geometry of the mast and forks ----------

/** A carriage-frame point (lx sideways, a along the forks from the heel, b up from the fork underside) in the body frame. */
export function carriageToBody(f: Forklift, lx: number, a: number, b: number) {
  const s = Math.sin(f.tilt);
  const c = Math.cos(f.tilt);
  const dy = f.lift - SPEC.pivot.y + b;
  const dz = SPEC.loadDistance - SPEC.pivot.z + a;
  return { x: lx, y: SPEC.pivot.y + dy * c + dz * s, z: SPEC.pivot.z - dy * s + dz * c };
}

/** Centre lines of the two forks, sideways from the truck's centre. */
export const forkCentres = (f: Forklift) => [f.spread / 2 - SPEC.forkW / 2, -(f.spread / 2 - SPEC.forkW / 2)];

function forkBox(f: Forklift, lx: number, x = f.x, z = f.z, heading = f.heading): Obb {
  const heel = carriageToBody(f, lx, 0, 0);
  const tip = carriageToBody(f, lx, SPEC.forkL, 0);
  const tipTop = carriageToBody(f, lx, SPEC.forkL, SPEC.forkT);
  const heelTop = carriageToBody(f, lx, 0, SPEC.forkT);
  const [wx, wz] = toWorld(x, z, heading, lx, (heel.z + tip.z) / 2);
  return {
    id: 'fork',
    x: wx,
    z: wz,
    hx: SPEC.forkW / 2,
    hz: (tip.z - heel.z) / 2,
    yaw: heading,
    y0: Math.min(heel.y, tip.y),
    y1: Math.max(heelTop.y, tipTop.y),
  };
}

/** Plan-view boxes of the truck: body, mast, carriage; then the forks. */
function truckBoxes(f: Forklift, x: number, z: number, heading: number): Obb[] {
  const back = -(SPEC.wheelbase + SPEC.rearOverhang);
  const front = 0.62;
  const box = (lx: number, lz0: number, lz1: number, hx: number, y0: number, y1: number, id: string): Obb => {
    const [wx, wz] = toWorld(x, z, heading, lx, (lz0 + lz1) / 2);
    return { id, x: wx, z: wz, hx, hz: (lz1 - lz0) / 2, yaw: heading, y0, y1 };
  };
  const heel = carriageToBody(f, 0, 0, 0);
  const mastTop = SPEC.mastH + Math.max(0, f.lift - 1.5);
  return [
    box(0, back, front, SPEC.width / 2, 0.05, SPEC.guardH, 'body'),
    box(0, front, heel.z - 0.02, 0.9, 0.05, mastTop, 'mast'),
    box(0, heel.z - 0.36, heel.z, 1.45, heel.y + 0.03, heel.y + 1.35, 'carriage'),
    ...forkCentres(f).map((lx) => forkBox(f, lx, x, z, heading)),
  ];
}

/** The genset as a solid box in the world (resting, or carried). */
export function cargoBox(f: Forklift, x = f.x, z = f.z, heading = f.heading): Obb | null {
  const c = f.cargo;
  if (c.state === 'rest') return { id: 'cargo', x: c.x, z: c.z, hx: GENSET.hx, hz: GENSET.hz, yaw: c.yaw, y0: c.y + GENSET.lift0, y1: c.y + GENSET.h };
  if (c.state !== 'forks') return null;
  const o = carriageToBody(f, c.lx, c.a, SPEC.forkT - GENSET.lift0);
  const [wx, wz] = toWorld(x, z, heading, o.x, o.z);
  return { id: 'cargo', x: wx, z: wz, hx: GENSET.hx, hz: GENSET.hz, yaw: heading + c.yawRel, y0: o.y, y1: o.y + GENSET.h };
}

/** Would the truck at this pose hit anything? Returns the obstacle's id. */
export function hitAt(f: Forklift, x: number, z: number, heading: number): string | null {
  const mine = truckBoxes(f, x, z, heading);
  const carried = f.cargo.state === 'forks' ? cargoBox(f, x, z, heading) : null;
  if (carried) mine.push(carried);
  const others = [...OBSTACLES, ...DYNAMIC, ...EMBED.solids];
  const resting = f.cargo.state === 'rest' || f.cargo.state === 'fallen' ? cargoBox(f) ?? fallenBox(f) : null;
  if (resting) others.push(resting);
  for (const a of mine) for (const b of others) if (overlaps(a, b)) return b.id ?? 'obstacle';
  // fork pockets: a fork beside the pockets runs into the load's bottom rail
  const c = f.cargo;
  if (c.state === 'rest' && GENSET.pockets) {
    const rail: Obb = { id: 'cargo', x: c.x, z: c.z, hx: GENSET.hx, hz: GENSET.hz, yaw: c.yaw, y0: c.y, y1: c.y + GENSET.lift0 };
    for (const lx of forkCentres(f)) {
      const fb = forkBox(f, lx, x, z, heading);
      if (!overlaps(fb, rail)) continue;
      const [gx] = toLocal(c.x, c.z, c.yaw, fb.x, fb.z);
      if (!inPocket(gx)) return 'cargo';
    }
  }
  return null;
}

function fallenBox(f: Forklift): Obb | null {
  const c = f.cargo;
  if (c.state !== 'fallen') return null;
  return { id: 'cargo', x: c.x, z: c.z, hx: GENSET.hx, hz: GENSET.hz + 0.6, yaw: c.yaw, y0: 0, y1: GENSET.h };
}

/** Is a fork at this position along the load's length inside one of its fork pockets? */
function inPocket(gx: number) {
  const p = GENSET.pockets;
  if (!p) return true;
  const half = (p.w - SPEC.forkW) / 2 + 0.02;
  return Math.abs(Math.abs(gx) - p.c) <= half;
}

/** The truck's plan boxes and the carried load, for traffic and effects. */
export function footprint(f: Forklift) {
  const b = truckBoxes(f, f.x, f.z, f.heading);
  const c = f.cargo.state === 'forks' ? cargoBox(f) : null;
  if (c) b.push(c);
  return b;
}

// ---------- driver actions ----------

const say = (f: Forklift, m: string) => (f.msg = m);

export function startEngine(f: Forklift) {
  if (f.engine !== 'off' || f.tipped || f.fuel <= 0) return;
  if (f.dir !== 'N') return say(f, 'Tuas arah harus di N (netral): mesin hanya bisa distarter di netral.');
  f.engine = 'starting';
  f.starterT = 0;
  f.events.push('start');
}

export function stopEngine(f: Forklift) {
  if (f.engine === 'off' || f.engine === 'stopping') return;
  f.engine = 'stopping';
  f.events.push('stop');
}

export function setDir(f: Forklift, d: Dir) {
  if (f.dir === d || f.tipped) return;
  const moving = Math.abs(f.v) > 0.8;
  const against = (d === 'F' && f.v < -0.3) || (d === 'R' && f.v > 0.3);
  if (f.assists.dirGuard && moving && against) return say(f, 'Berhenti dulu sebelum ganti arah (proteksi transmisi).');
  f.dir = d;
  f.shiftT = d === 'N' ? 0 : 0.35;
  f.events.push('dir');
}

export function togglePark(f: Forklift) {
  f.park = !f.park;
  if (!f.park && f.air < 5.5) say(f, `Rem parkir belum bisa lepas: tekanan angin ${f.air.toFixed(1)} bar, perlu 5,5 bar. Biarkan mesin hidup sampai jarum naik.`);
}

// ---------- step ----------

/** Advance the whole simulation by dt seconds (call with small steps, ≤ 10 ms). */
export function step(f: Forklift, dt: number) {
  if (f.phase !== 'done' && f.phase !== 'failed') f.time += dt;
  engineStartStop(f, dt);
  hydraulics(f, dt);
  drive(f, dt);
  stability(f, dt);
  cargoOnForks(f, dt);
  cargoFalling(f, dt);
  airSystem(f, dt);
  job(f);
}

function engineStartStop(f: Forklift, dt: number) {
  if (f.engine === 'starting') {
    f.starterT += dt;
    f.rpm = Math.min(f.rpm + 500 * dt, 190);
    if (f.starterT > 1.2) {
      f.engine = 'running';
      f.rpm = 620;
      f.events.push('running');
    }
  }
  if (f.engine === 'stopping' || f.engine === 'off') {
    f.rpm = Math.max(0, f.rpm - dt * (f.rpm > 300 ? 800 : 400));
    if (f.rpm <= 0 && f.engine === 'stopping') f.engine = 'off';
  }
  if (f.engine === 'running') {
    f.fuel = Math.max(0, f.fuel - ((f.load * 159 * 0.22) / 0.84 / 3600 + 2 / 3600) * dt);
    f.hours += dt / 3600;
    if (f.fuel <= 0) stopEngine(f);
  }
  f.coolant += ((f.engine === 'running' ? 84 + 6 * f.load : 32) - f.coolant) * Math.min(1, dt / (f.engine === 'running' ? 150 : 900));
}

export const cargoMass = (f: Forklift) => (f.cargo.state === 'forks' ? GENSET.mass : 0);

/** Lowest point the forks may go to here, and what stops them. */
function forkFloor(f: Forklift, lift: number) {
  // heel and tip of each fork must stay on or above whatever is under them
  const save = f.lift;
  f.lift = lift;
  let worst = Infinity;
  for (const lx of forkCentres(f))
    for (const a of [0, SPEC.forkL / 2, SPEC.forkL]) {
      const p = carriageToBody(f, lx, a, 0);
      const [wx, wz] = toWorld(f.x, f.z, f.heading, lx, p.z);
      let floor = supportAt(wx, wz);
      // resting on top of the genset
      const c = f.cargo;
      if (c.state === 'rest') {
        const [gx, gz] = toLocal(c.x, c.z, c.yaw, wx, wz);
        if (Math.abs(gx) < GENSET.hx && Math.abs(gz) < GENSET.hz && p.y > c.y + GENSET.h - 0.4) floor = Math.max(floor, c.y + GENSET.h);
      }
      worst = Math.min(worst, p.y - floor);
    }
  f.lift = save;
  return worst; // ≥ 0 when clear
}

/** The forks are out from under the resting load. */
export function forksClear(f: Forklift) {
  const u = underCargo(f);
  return !u.both && !u.one;
}

/** How the forks sit under a resting genset: how much of each fork is under it, and the fork top under its CG. */
function underCargo(f: Forklift) {
  const c = f.cargo;
  const res = { both: false, one: false, topAtCg: -Infinity, minTop: Infinity };
  if (c.state !== 'rest') return res;
  let n = 0;
  for (const lx of forkCentres(f)) {
    let len = 0;
    for (let i = 0; i <= 12; i++) {
      const a = (SPEC.forkL * i) / 12;
      const p = carriageToBody(f, lx, a, SPEC.forkT);
      const [wx, wz] = toWorld(f.x, f.z, f.heading, lx, p.z);
      const [gx, gz] = toLocal(c.x, c.z, c.yaw, wx, wz);
      if (Math.abs(gx) < GENSET.hx && Math.abs(gz) < GENSET.hz && inPocket(gx)) {
        len += SPEC.forkL / 12;
        res.minTop = Math.min(res.minTop, p.y);
        res.topAtCg = Math.max(res.topAtCg, p.y);
      }
    }
    if (len >= 0.6) n++;
  }
  res.both = n === 2;
  res.one = n === 1;
  return res;
}

function hydraulics(f: Forklift, dt: number) {
  const on = f.engine === 'running';
  const flow = on ? clamp(f.rpm / SPEC.ratedRpm, 0, 1.05) : 0;
  const mass = SPEC.carriageMass + cargoMass(f);
  const staticBar = (mass * G * 2) / SPEC.liftArea / 1e5; // 2:1 chains: the cylinders push twice the weight
  let up = 0;
  f.relief = false;

  // Lift. Up: pump flow limited; the relief valve opens when the load needs more than 210 bar. Down: by gravity.
  const lever = on ? f.liftLever : 0;
  if (lever > 0.02) {
    if (staticBar > SPEC.reliefBar) {
      f.relief = true;
      f.pressure = SPEC.reliefBar;
    } else {
      const loadFrac = cargoMass(f) / SPEC.capacity;
      up = lever * flow * (0.32 - 0.04 * loadFrac);
      let next = Math.min(SPEC.maxLift, f.lift + up * dt);
      const u = underCargo(f);
      if (u.one && !u.both && f.lift + SPEC.forkT + up * dt >= f.cargo.y + GENSET.lift0 - 0.002) {
        // one fork pushing up under the set: it cannot lift it alone
        next = f.lift;
        f.relief = true;
        if (!f.msg) say(f, GENSET.pockets ? 'Hanya satu garpu di fork pocket. Atur lebar garpu supaya keduanya masuk lubang.' : `Hanya satu garpu di bawah ${GENSET.name.toLowerCase()}. Atur posisi supaya kedua garpu masuk.`);
      } else if (u.both && f.cargo.state === 'rest' && u.topAtCg + up * dt >= f.cargo.y + GENSET.lift0) pickUp(f);
      if (mastBlocked(f, next)) next = f.lift;
      f.lift = next;
      f.pressure = f.relief ? SPEC.reliefBar : staticBar;
    }
  } else if (lever < -0.02) {
    const down = -lever * (0.47 + 0.03 * (1 - cargoMass(f) / SPEC.capacity));
    let next = Math.max(0, f.lift - down * dt);
    // set the genset down when it reaches a support
    if (f.cargo.state === 'forks') {
      const rest = restOn(f, next);
      if (rest) {
        setDown(f, rest);
      }
    }
    if (forkFloor(f, next) < 0) {
      // forks on the deck, a timber or the ground
      if (forkFloor(f, f.lift) > 0.003) f.events.push('forkTouch');
      next = f.lift;
    }
    f.lift = next;
    f.pressure = staticBar * 0.9;
  } else f.pressure = on || f.lift > 0.01 ? staticBar : 0;

  // Tilt: about 3°/s at full engine speed. Back tilt with forks under a resting set lifts it like the lift does.
  const tl = on ? f.tiltLever : 0;
  if (Math.abs(tl) > 0.02) {
    const rate = (3 * Math.PI) / 180;
    const next = clamp(f.tilt + tl * rate * Math.max(0.35, flow) * dt, -SPEC.tiltFwd, SPEC.tiltBack);
    const save = f.tilt;
    f.tilt = next;
    const u = underCargo(f);
    if (forkFloor(f, f.lift) < 0) f.tilt = save;
    else if (u.both && u.topAtCg >= f.cargo.y + GENSET.lift0) pickUp(f);
    else if (u.one && u.topAtCg >= f.cargo.y + GENSET.lift0) f.tilt = save;
  }

  // Fork positioner: only with empty forks.
  const sl = on ? f.spreadLever : 0;
  if (Math.abs(sl) > 0.02) {
    if (f.cargo.state === 'forks') {
      if (!f.msg) say(f, 'Lebar garpu hanya bisa diatur saat garpu kosong.');
    } else {
      const save = f.spread;
      f.spread = clamp(f.spread + sl * 0.25 * Math.max(0.35, flow) * dt, SPEC.spreadMin, SPEC.spreadMax);
      if (hitAt(f, f.x, f.z, f.heading)) f.spread = save;
    }
  }
  f.hydFlow = Math.max(lever > 0.02 ? lever : 0, Math.abs(tl) * 0.5, Math.abs(sl) * 0.4, f.relief ? 1 : 0) * (on ? 1 : 0);
}

/** Raising the mast: the carriage or forks must not run into anything (the deck from below, the genset from the side). */
function mastBlocked(f: Forklift, lift: number) {
  const save = f.lift;
  f.lift = lift;
  const hit = hitAt(f, f.x, f.z, f.heading);
  f.lift = save;
  return !!hit;
}

function pickUp(f: Forklift) {
  const c = f.cargo;
  // the set's origin in the carriage frame
  const [lx, lz] = toLocal(f.x, f.z, f.heading, c.x, c.z);
  const heel = carriageToBody(f, 0, 0, 0);
  c.state = 'forks';
  c.lx = lx;
  c.a = (lz - heel.z) / Math.cos(f.tilt);
  c.yawRel = c.yaw - f.heading;
  c.va = 0;
  c.vl = 0;
  c.sliding = false;
  // extent from the CG toward the carriage, along the forks
  const { a: aCg } = cgOnForks(f);
  let near = 0;
  for (const [gx, gz] of [
    [GENSET.hx, GENSET.hz],
    [GENSET.hx, -GENSET.hz],
    [-GENSET.hx, GENSET.hz],
    [-GENSET.hx, -GENSET.hz],
  ]) {
    const along = c.a + gz * Math.cos(c.yawRel) - gx * Math.sin(c.yawRel);
    near = Math.max(near, aCg - along);
  }
  c.near = near;
  f.events.push('pickup');
  if (f.phase === 'pickup') f.phase = 'carry';
}

/** The set's centre of mass in the carriage frame. */
export function cgOnForks(f: Forklift) {
  const c = f.cargo;
  const s = Math.sin(c.yawRel);
  const k = Math.cos(c.yawRel);
  // set frame (x along its length, z across) → carriage (lateral, along): the same rotation as toWorld
  return { lx: c.lx + GENSET.cg.x * k + GENSET.cg.z * s, a: c.a + GENSET.cg.z * k - GENSET.cg.x * s };
}

/** Where the carried set would come to rest if the forks were lowered to `lift`: support height and stability. */
function restOn(f: Forklift, lift: number) {
  const c = f.cargo;
  const save = f.lift;
  f.lift = lift;
  const o = carriageToBody(f, c.lx, c.a, SPEC.forkT - GENSET.lift0);
  const [wx, wz] = toWorld(f.x, f.z, f.heading, o.x, o.z);
  const yaw = f.heading + c.yawRel;
  f.lift = save;
  let h = 0;
  const pts: [number, number, number][] = [];
  const ex = GENSET.hx - 0.05;
  const ez = GENSET.hz - 0.05;
  for (let i = 0; i <= 59; i++)
    for (const gz of [-ez, -ez / 2, 0, ez / 2, ez]) {
      const gx = -ex + (2 * ex * i) / 59;
      const [px, pz] = toWorld(wx, wz, yaw, gx, gz);
      const s = supportAt(px, pz);
      pts.push([gx, gz, s]);
      h = Math.max(h, s);
    }
  if (o.y > h + 0.004) return null;
  const sup = pts.filter((p) => p[2] > h - 0.02);
  const xs = sup.map((p) => p[0]);
  const zs = sup.map((p) => p[1]);
  const stable =
    GENSET.cg.x > Math.min(...xs) + 0.05 && GENSET.cg.x < Math.max(...xs) - 0.05 && GENSET.cg.z > Math.min(...zs) + 0.05 && GENSET.cg.z < Math.max(...zs) - 0.05;
  return { x: wx, z: wz, yaw, h, stable, under: sup.length };
}

function setDown(f: Forklift, r: { x: number; z: number; yaw: number; h: number; stable: boolean }) {
  const c = f.cargo;
  if (!r.stable) return dropCargo(f, `${GENSET.name} tidak tertumpu rata dan terguling. Taruh di atas balok/tumpuan yang tersedia.`);
  // straight on the ground (no timber, no pockets): the forks would be trapped under it
  if (r.h < 0.05 && !GENSET.groundOk) {
    if (!f.msg) say(f, `Tidak ada balok kayu di bawah ${GENSET.name.toLowerCase()}: garpu akan terjepit. Taruh di atas balok kayu (bantalan).`);
    return;
  }
  c.state = 'rest';
  c.x = r.x;
  c.z = r.z;
  c.yaw = r.yaw;
  c.y = r.h;
  f.events.push('setdown');
  if (f.phase === 'carry') f.phase = 'place';
}

function dropCargo(f: Forklift, why: string) {
  const c = f.cargo;
  const box = cargoBox(f)!;
  const cg = cgOnForks(f);
  // falls toward the side it went off: past the tips, or off a fork's outer edge
  const off = cg.a > SPEC.forkL - 0.05 ? [0, 1] : [Math.sign(cg.lx) || 1, 0];
  const [dx, dz] = toWorld(0, 0, f.heading, off[0], off[1]);
  c.state = 'falling';
  c.x = box.x;
  c.z = box.z;
  c.y = box.y0;
  c.y0 = box.y0;
  c.yaw = box.yaw;
  c.fallT = 0;
  c.fallDir = [dx, dz];
  f.damage = 100;
  f.events.push(GENSET.id === 'coil' || GENSET.id === 'pipes' ? 'fallSteel' : 'fall');
  say(f, why);
  f.phase = 'failed';
}

function drive(f: Forklift, dt: number) {
  const running = f.engine === 'running';
  const mass = SPEC.mass + cargoMass(f);
  const r = SPEC.wheelR;

  // steering: hydraulic, its speed follows the pump
  const lock = SPEC.maxSteer;
  const want = f.steerInput * lock;
  const rate = running ? 0.8 * clamp(0.3 + f.rpm / 1600, 0, 1.2) : 0.04;
  f.steer += Math.sign(want - f.steer) * Math.min(Math.abs(want - f.steer), rate * dt);
  const rearOff = f.tipEdge === 0 && f.tip > 0.02; // rear wheels in the air: no steering, no rear braking

  // throttle: auto-accel for the hydraulics when standing (neutral, parked or inching)
  let throttle = f.pedal;
  const hydWant = Math.max(Math.abs(f.liftLever), Math.abs(f.tiltLever));
  if (f.assists.autoAccel && hydWant > 0.05 && (f.dir === 'N' || f.parkOn || f.inch > 0.7)) throttle = Math.max(throttle, 0.55 * hydWant);
  // SAS: speed limit with the forks high or the truck close to its limits
  let vmax = Infinity;
  if (f.assists.sas) {
    if (f.lift > 0.6) vmax = 5 / 3.6;
    if (f.risk > 0.5) vmax = Math.min(vmax, Math.max(1, 10 * (1 - f.risk)) / 3.6);
    if (Math.abs(f.v) > vmax) throttle = 0;
  }
  if (f.tipped) throttle = 0;

  // engine governor on the full-load curve
  const w = (f.rpm * Math.PI) / 30;
  const target = running ? SPEC.idleRpm + throttle * (SPEC.highIdle - SPEC.idleRpm) : 0;
  const tMax = running ? maxTorque(f.rpm) : 0;
  const tEng = tMax * (running ? clamp((target - f.rpm) / 70 + 0.5, 0, 1) : 0);
  const tFric = running || f.rpm > 0 ? 20 + 0.025 * f.rpm : 0;
  const tHyd = (f.pressure * 1e5 * SPEC.pumpCc * 1e-6 * f.hydFlow) / (2 * Math.PI) / 0.9;

  // torque converter and powershift
  if (f.shiftT > 0) f.shiftT -= dt;
  const dirSign = f.dir === 'F' ? 1 : f.dir === 'R' ? -1 : 0;
  if (f.dir === 'F' && f.shiftT <= 0) {
    const kmh = f.v * 3.6;
    if (f.gear === 1 && kmh > 10 && f.pedal > 0.25) {
      f.gear = 2;
      f.shiftT = 0.3;
      f.events.push('shift');
    } else if (f.gear === 2 && kmh < 7) {
      f.gear = 1;
      f.shiftT = 0.3;
      f.events.push('shift');
    }
  }
  if (f.dir !== 'F') f.gear = 1;
  const ratio = f.dir === 'R' ? SPEC.reverse : SPEC.gears[f.gear - 1];
  const wt = dirSign ? ((f.v / r) * ratio * dirSign) : 0;
  const sr = w > 1 ? wt / w : 0;
  const fC = (x: number) => (x < 0.6 ? 1 : clamp((1 - x) / 0.4, -1.5, 1));
  const tp = CONVERTER.C * w * w * fC(sr);
  const tr = sr < CONVERTER.couple ? clamp(CONVERTER.stallTr - ((CONVERTER.stallTr - 1) * Math.max(0, sr)) / CONVERTER.couple, 1, 3.4) : 1;
  const tt = tp > 0 ? tr * tp : tp;
  const k = dirSign === 0 || f.shiftT > 0 ? 0 : 1 - f.inch;
  const tPump = tp * k + CONVERTER.C * w * w * fC(0.95) * (1 - k);
  f.slip = sr;

  // engine speed
  if (running) {
    const wNew = Math.max(0, w + ((tEng - tFric - tHyd - tPump) / 2.0) * dt);
    f.rpm = Math.min(SPEC.highIdle + 40, (wNew * 30) / Math.PI);
    if (f.rpm < 380) {
      f.engine = 'off';
      f.events.push('stall');
    }
    f.load += (clamp((tFric + tHyd + Math.max(0, tPump)) / Math.max(150, tMax), 0, 1.1) - f.load) * Math.min(1, dt * 4);
  } else f.load = 0;

  // wheel forces
  let fDrive = (tt * k * ratio * SPEC.eta * dirSign) / r;
  const frontShare = clamp(1 + f.cg.z / SPEC.wheelbase, 0, 1); // f.cg.z is negative: behind the front axle
  const mu = f.wet ? 0.5 : 0.8;
  const grip = mu * mass * G * frontShare;
  fDrive = clamp(fDrive, -grip, grip);
  const airK = clamp((f.air - 1) / 4, 0, 1);
  // spring parking brake: on when switched on, and by itself when the air runs low
  const wantPark = f.park || f.air < 4.2;
  if (!wantPark && f.air >= 5.5) f.parkOn = false;
  if (wantPark && !f.parkOn) {
    f.parkOn = true;
    if (!f.park) say(f, 'Tekanan angin rendah: rem parkir pegas mengunci otomatis.');
    f.events.push('parkOn');
  }
  let fBrake = f.brake * 0.45 * mass * G * airK * (rearOff ? 0.7 : 1) + (f.parkOn ? 0.35 * mass * G : 0);
  // on wet concrete hard braking locks the front tyres: less stopping force and the steering goes light
  const locked = f.wet && f.brake > 0.65 && Math.abs(f.v) > 1.5;
  if (locked) {
    fBrake = Math.min(fBrake, 0.3 * mass * G);
    if (!f.msg) say(f, 'Roda terkunci di lantai basah! Rem dipompa pelan, jangan diinjak penuh.');
  }
  const fRoll = 0.015 * mass * G;
  let v = f.v;
  if (Math.abs(v) > 0.05) {
    const a = (fDrive - Math.sign(v) * (fRoll + fBrake)) / (mass * 1.05);
    v += a * dt;
    if (Math.sign(v) !== Math.sign(f.v)) v = 0;
  } else {
    // standing: moves off only if the drive beats rolling resistance and brakes
    const hold = fRoll + fBrake;
    if (Math.abs(fDrive) > hold) v += ((fDrive - Math.sign(fDrive) * hold) / (mass * 1.05)) * dt;
    else v = 0;
  }
  if (f.tipped) v *= 1 - Math.min(1, dt * 3);
  const accel = (v - f.v) / dt;
  f.accel += (accel - f.accel) * Math.min(1, dt * 12);

  // move: the front axle is not steered, so it travels along the heading; the rear swings around
  const yawRate = rearOff ? 0 : ((v * Math.tan(f.steer)) / SPEC.wheelbase) * (locked ? 0.35 : 1);
  const nh = f.heading + yawRate * dt;
  const nx = f.x + Math.sin(f.heading) * v * dt;
  const nz = f.z + Math.cos(f.heading) * v * dt;
  const hit = v !== 0 || yawRate !== 0 ? hitAt(f, nx, nz, nh) : null;
  // forks dragging along whatever they rest on; tyres at the grip limit
  f.scrape = Math.abs(v) > 0.15 && forkFloor(f, f.lift) < 0.01 ? Math.min(1, Math.abs(v) / 2.5) : 0;
  const lateral = Math.abs(v * yawRate);
  const decel = Math.max(0, -f.accel * Math.sign(f.v || 1));
  f.squeal = locked ? 1 : clamp(Math.max((lateral - (f.wet ? 1.6 : 2.2)) / 2, (decel - (f.wet ? 2.4 : 3.2)) / 2), 0, 1);
  if (hit) {
    if (Math.abs(f.v) > 0.6) {
      f.bumps++;
      f.events.push('bump');
      if (hit === 'cargo') {
        f.damage = Math.min(100, f.damage + Math.abs(f.v) * 12);
        say(f, `Menabrak ${GENSET.name.toLowerCase()}! Hati-hati, garpu dan tiang bisa merusak muatan.`);
      } else if (hit.startsWith('worker')) {
        f.phase = 'failed';
        f.events.push('scream');
        say(f, 'Menabrak pekerja! Selalu berhenti dan bunyikan klakson saat ada orang di jalur.');
      } else say(f, 'Menabrak! Pelan-pelan saat dekat truk dan tumpukan kontainer.');
    }
    f.v = 0;
    f.yawRate = 0;
  } else {
    f.x = nx;
    f.z = nz;
    f.heading = nh;
    f.v = v;
    f.yawRate = yawRate;
    if (v !== 0 && CONES.length) knockCones(f, v);
  }
}

/** Cones are not solid: the truck, the forks (when low) or the load knocks them over. */
function knockCones(f: Forklift, v: number) {
  const boxes = footprint(f);
  for (const c of CONES) {
    if (c.down || Math.hypot(c.x - f.x, c.z - f.z) > 12) continue;
    const cone: Obb = { x: c.x, z: c.z, hx: 0.2, hz: 0.2, yaw: 0, y0: 0, y1: 0.75 };
    if (boxes.some((b) => overlaps(b, cone))) {
      c.down = true;
      const s = Math.sign(v);
      c.dir = [Math.sin(f.heading) * s, Math.cos(f.heading) * s];
      f.cones++;
      f.events.push('cone');
      say(f, `Cone tersenggol (${f.cones}). Tiap cone mengurangi nilai ujian.`);
    }
  }
}

/** Stability triangle: two front tyre contacts and the rear axle's centre pivot. */
const TRI: [number, number][] = [
  [SPEC.frontContact, 0],
  [-SPEC.frontContact, 0],
  [0, -SPEC.wheelbase],
];
const EDGES: [number, number][] = [
  [1, 0], // front: right tyre → left tyre
  [0, 2], // left: left tyre → rear pivot
  [2, 1], // right: rear pivot → right tyre
];
export const TRIANGLE = TRI;

/** Outward unit normal and a point of edge i (plan view, body frame). */
function edge(i: number) {
  const [a, b] = EDGES[i];
  const [x0, z0] = TRI[a];
  const [x1, z1] = TRI[b];
  const dx = x1 - x0;
  const dz = z1 - z0;
  const l = Math.hypot(dx, dz);
  // triangle is listed clockwise seen from above with +x left: outward normal is (dz, −dx)/l rotated to point out
  let nx = dz / l;
  let nz = -dx / l;
  // make sure it points away from the centroid
  const cx = (TRI[0][0] + TRI[1][0] + TRI[2][0]) / 3;
  const cz = (TRI[0][1] + TRI[1][1] + TRI[2][1]) / 3;
  if ((cx - x0) * nx + (cz - z0) * nz > 0) {
    nx = -nx;
    nz = -nz;
  }
  return { x0, z0, nx, nz, dx: dx / l, dz: dz / l };
}
export const EDGE_INFO = [0, 1, 2].map(edge);

function stability(f: Forklift, dt: number) {
  // combined centre of mass in the body frame
  const mb = SPEC.mass - SPEC.carriageMass;
  const car = carriageToBody(f, 0, 0.3, 0.5);
  let m = mb + SPEC.carriageMass;
  let x = 0;
  let y = mb * SPEC.bodyCg.y + SPEC.carriageMass * car.y;
  let z = mb * SPEC.bodyCg.z + SPEC.carriageMass * car.z;
  if (f.cargo.state === 'forks') {
    const cg = cgOnForks(f);
    const p = carriageToBody(f, cg.lx, cg.a, SPEC.forkT - GENSET.lift0 + GENSET.cg.y);
    x += GENSET.mass * p.x;
    y += GENSET.mass * p.y;
    z += GENSET.mass * p.z;
    m += GENSET.mass;
  }
  f.cg = { x: x / m, y: y / m, z: z / m };
  // inertial acceleration per mass in the body frame: braking pushes forward, turning pushes outward
  const fz = -f.accel;
  const fx = -f.v * f.yawRate;
  f.proj = { x: f.cg.x + (f.cg.y * fx) / G, z: f.cg.z + (f.cg.y * fz) / G };

  // risk: how close the projected centre of mass is to the nearest edge (0.6 m or more inside = 0)
  let worst = -Infinity;
  let worstEdge = 0;
  for (let i = 0; i < 3; i++) {
    const e = EDGE_INFO[i];
    const d = (f.proj.x - e.x0) * e.nx + (f.proj.z - e.z0) * e.nz; // > 0 outside
    if (d > worst) {
      worst = d;
      worstEdge = i;
    }
  }
  f.risk = clamp(1 + worst / 0.6, 0, 1.5);
  if (f.phase !== 'done') f.maxRisk = Math.max(f.maxRisk, Math.min(1, f.risk));

  // tipping about the active edge
  const torque = (i: number, th: number) => {
    const e = EDGE_INFO[i];
    const o = (f.cg.x - e.x0) * e.nx + (f.cg.z - e.z0) * e.nz;
    const fn = fx * e.nx + fz * e.nz;
    const h = f.cg.y;
    const out = o * Math.cos(th) + h * Math.sin(th);
    const up = h * Math.cos(th) - o * Math.sin(th);
    return { t: m * (G * out + (f.tipped ? 0 : fn) * up), I: m * (o * o + h * h + 0.9) };
  };
  if (f.tipEdge < 0) {
    if (worst > 0) {
      f.tipEdge = worstEdge;
      f.tip = 0;
      f.tipV = 0;
    }
  }
  if (f.tipEdge >= 0) {
    const { t, I } = torque(f.tipEdge, f.tip);
    f.tipV += (t / I) * dt - f.tipV * Math.min(1, dt * 0.8);
    f.tip += f.tipV * dt;
    // forward: the forks or the load touching the ground hold the truck up
    if (f.tipEdge === 0) {
      const lim = forwardLimit(f);
      if (f.tip > lim) {
        f.tip = lim;
        f.tipV = Math.min(0, f.tipV);
      }
    }
    if (f.tip <= 0) {
      if (f.tipV < -0.25) f.events.push('thump');
      f.tip = 0;
      f.tipV = 0;
      f.tipEdge = -1;
    } else if (!f.tipped && f.tip > (f.tipEdge === 0 ? 0.35 : 0.42)) {
      f.tipped = true;
      f.phase = 'failed';
      f.events.push('tipover');
      say(f, f.tipEdge === 0 ? 'Forklift terjungkal ke depan! Beban terlalu jauh/tinggi atau pengereman terlalu keras.' : 'Forklift terguling ke samping! Belokan terlalu cepat atau beban terlalu tinggi saat belok.');
      if (f.cargo.state === 'forks') dropCargo(f, f.msg);
    }
    if (f.tipped) {
      const rest = f.tipEdge === 0 ? 0.5 : 1.35;
      if (f.tip >= rest) {
        if (f.tipV > 0.3) f.events.push('crash');
        f.tip = rest;
        f.tipV = 0;
      }
    }
  }
  if (f.tipEdge >= 0 && f.tip > 0.03 && !f.tipped && f.assists.sas && !f.msg) say(f, 'AWAS! Forklift mulai terangkat. Pelankan, luruskan setir, turunkan garpu.');
}

/** Largest forward tip angle before the forks or the carried load hit the ground. */
function forwardLimit(f: Forklift) {
  let lim = 1;
  const pts: { y: number; z: number }[] = [];
  for (const lx of forkCentres(f)) pts.push(carriageToBody(f, lx, SPEC.forkL, 0));
  if (f.cargo.state === 'forks') {
    const o = carriageToBody(f, f.cargo.lx, f.cargo.a + f.cargo.near, SPEC.forkT - GENSET.lift0);
    pts.push(o);
  }
  for (const p of pts) if (p.z > 0) lim = Math.min(lim, Math.atan2(Math.max(0, p.y), p.z));
  return lim;
}

function cargoOnForks(f: Forklift, dt: number) {
  const c = f.cargo;
  if (c.state !== 'forks') return;
  const s = Math.sin(f.tilt);
  const k = Math.cos(f.tilt);
  const fz = -f.accel;
  const fx = -f.v * f.yawRate;
  let along = -G * s + fz * k; // + slides toward the tips
  // pushed back against the carriage face: the carriage takes that force, nothing slides
  if (along < 0 && cgOnForks(f).a - c.near <= 0.002) along = 0;
  const normal = G * k + fz * s;
  const side = fx;
  const mus = GENSET.mu * (f.wet ? 0.8 : 1);
  const muk = mus * 0.77;
  const tang = Math.hypot(along, side);
  if (!c.sliding && tang > mus * normal) {
    c.sliding = true;
    f.events.push('slide');
    say(f, `${GENSET.name} bergeser di atas garpu! Tilt mundur dan kurangi pengereman/belokan mendadak.`);
  }
  if (c.sliding) {
    const vel = Math.hypot(c.va, c.vl);
    const fa = vel > 1e-3 ? c.va / vel : along / (tang || 1);
    const fl = vel > 1e-3 ? c.vl / vel : side / (tang || 1);
    c.va += (along - muk * normal * fa) * dt;
    c.vl += (side - muk * normal * fl) * dt;
    if (Math.hypot(c.va, c.vl) < 0.01 && tang < mus * normal) {
      c.sliding = false;
      c.va = 0;
      c.vl = 0;
    }
    c.a += c.va * dt;
    c.lx += c.vl * dt;
    f.damage = Math.min(100, f.damage + Math.hypot(c.va, c.vl) * dt * 20);
  }
  // the carriage face stops it sliding back
  const cg = cgOnForks(f);
  if (cg.a - c.near < 0) {
    c.a -= cg.a - c.near;
    c.va = Math.max(0, c.va);
  }
  const cg2 = cgOnForks(f);
  const outer = f.spread / 2;
  if (cg2.a > SPEC.forkL - 0.05) dropCargo(f, `Pusat berat ${GENSET.name.toLowerCase()} melewati ujung garpu: muatan jatuh ke depan!`);
  else if (Math.abs(cg2.lx) > outer) dropCargo(f, `Pusat berat ${GENSET.name.toLowerCase()} di luar garpu: muatan miring dan jatuh ke samping! Pusatkan garpu di bawah titik berat.`);
}

function cargoFalling(f: Forklift, dt: number) {
  const c = f.cargo;
  if (c.state !== 'falling') return;
  c.fallT = Math.min(1, c.fallT + dt / 1.1);
  const t = c.fallT;
  c.y = c.y0 * (1 - t * t);
  const ang = 0.55 * t * t;
  // tip toward fallDir: express as pitch/roll in the set's own frame
  const [lx, lz] = toLocal(0, 0, c.yaw, c.fallDir[0], c.fallDir[1]);
  c.roll = -lx * ang;
  c.pitch = lz * ang;
  c.x += c.fallDir[0] * dt * 0.7;
  c.z += c.fallDir[1] * dt * 0.7;
  if (t >= 1) {
    c.state = 'fallen';
    f.events.push('crash');
  }
}

function airSystem(f: Forklift, dt: number) {
  const running = f.engine === 'running';
  // governor: cuts out at 8.3 bar (dryer purges), back in at 7.0
  if (running && f.air < 7.0) f.compressor = true;
  if (f.air >= 8.3 && f.compressor) {
    f.compressor = false;
    f.events.push('purge');
  }
  if (!running) f.compressor = false;
  if (f.compressor) f.air = Math.min(8.3, f.air + 0.3 * (0.3 + (0.7 * f.rpm) / SPEC.ratedRpm) * dt);
  if (f.defects.includes('air')) f.air = Math.min(f.air, 5.0 + 0.1 * Math.sin(f.time));
  // each brake application uses air; released with a hiss
  if (f.brake > 0.08) f.brakeHeld = Math.max(f.brakeHeld, f.brake);
  else if (f.brakeHeld > 0) {
    f.air = Math.max(0, f.air - 0.22 * f.brakeHeld);
    f.brakeHeld = 0;
    f.events.push('airRelease');
  }
  // small leak when parked
  f.air = Math.max(0, f.air - 0.0005 * dt);
  if (f.parkOn && !f.park && f.air >= 5.5) {
    f.parkOn = false;
    f.events.push('parkOff');
  }
}

function job(f: Forklift) {
  const c = f.cargo;
  const cps = JOB.cur.checkpoints;
  if (cps && f.cp < cps.length && f.phase !== 'failed' && f.phase !== 'done') {
    const cp = cps[f.cp];
    const [px, pz] = toWorld(f.x, f.z, f.heading, 0, -SPEC.wheelbase / 2);
    const inR = Math.hypot(px - cp.x, pz - cp.z) < cp.r;
    const before = f.cp < (JOB.cur.placeAfter ?? 0);
    const ok =
      inR &&
      (!cp.loaded || c.state === 'forks') &&
      (!cp.dir || f.dir === cp.dir) &&
      (!cp.stop || (Math.abs(f.v) < 0.05 && f.lift < 0.4)) &&
      (before || f.placed);
    if (ok) {
      f.cp++;
      f.events.push('checkpoint');
      if (f.cp === cps.length) finish(f, Math.hypot(c.x - PAD.x, c.z - PAD.z), 0);
    } else if (inR && cp.dir && f.dir !== cp.dir && !f.msg) say(f, 'Bagian ini harus dilalui MUNDUR.');
    else if (inR && cp.loaded && c.state !== 'forks' && !f.msg) say(f, 'Slalom harus dilalui sambil membawa palet.');
  }
  if (f.phase === 'place' && c.state === 'rest') {
    const dist = Math.hypot(c.x - PAD.x, c.z - PAD.z);
    const dyaw = Math.abs(Math.atan2(Math.sin(2 * (c.yaw - PAD.yaw)), Math.cos(2 * (c.yaw - PAD.yaw)))) / 2; // either end
    const onPad = dist < 2.5 && Math.abs(c.y - PAD.y) < 0.12;
    // done when the forks are clear of the load
    if (onPad && !underCargo(f).both && !underCargo(f).one) {
      if (cps) {
        if (f.cp < (JOB.cur.placeAfter ?? 0)) {
          if (!f.msg) say(f, 'Slalom belum lengkap. Angkat palet lagi dan lewati semua cone slalom dulu.');
        } else if (!f.placed) {
          f.placed = true;
          f.placeErr = { dist, yaw: dyaw };
          f.phase = 'course';
          f.events.push('checkpoint');
        }
      } else finish(f, dist, dyaw);
    } else if (!onPad && c.y < 0.3 && !f.msg && !GENSET.groundOk) say(f, 'Muatan diletakkan di luar area tujuan. Angkat lagi dan bawa ke tempat bermarka kuning.');
  }
  if (f.phase === 'place' && c.state === 'forks') f.phase = 'carry';
  if (f.phase === 'course' && c.state === 'forks') {
    f.placed = false;
    f.phase = 'carry';
  }
}

function finish(f: Forklift, dist: number, dyaw: number) {
  const e = f.placeErr ?? { dist, yaw: dyaw };
  const okPos = e.dist < PAD.tolerance;
  const okYaw = e.yaw < PAD.yawTol;
  let stars = 1 + (okPos && okYaw ? 1 : 0) + (f.bumps === 0 && f.damage < 1 && f.maxRisk < 0.85 && f.cones === 0 ? 1 : 0);
  if (e.dist > 2.5) stars = 0;
  let score: number | undefined;
  if (JOB.cur.checkpoints) score = Math.max(0, Math.round(100 - f.cones * 5 - f.bumps * 10 - Math.max(0, e.dist - PAD.tolerance) * 20 - Math.max(0, f.time - 240) / 6));
  f.result = { dist: e.dist, yaw: e.yaw, stars, score };
  f.phase = 'done';
  f.events.push('done');
}

/** P2H: grade the answers against the hidden faults. */
export function finishP2h(f: Forklift, items: string[]) {
  let right = 0;
  const notes: string[] = [];
  for (const id of items) {
    const bad = f.defects.includes(id);
    const said = f.answers[id];
    if ((said === 'bad') === bad) right++;
    else notes.push(id);
  }
  const missed = f.defects.filter((d) => f.answers[d] !== 'bad').length;
  const stars = missed > 0 ? (missed > 1 ? 0 : 1) : right === items.length ? 3 : 2;
  f.result = { dist: 0, yaw: 0, stars, score: Math.round((right / items.length) * 100), notes };
  f.phase = 'done';
  f.events.push('done');
}

export { capacityAt };
