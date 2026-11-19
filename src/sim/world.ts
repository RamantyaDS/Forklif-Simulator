// The port yard: the flatbed semi-trailer, the quay, container stacks, the ship-to-shore crane, a warehouse and the
// fence are fixed. Each job (jobs.ts) then lays out its own load, timbers, supports (plinth, pallet stack, a base
// container), target and cones through `applyLayout`. Everything solid is an oriented box (see geom.ts).
// World axes: x along the quay, z inland (the quay edge is at z = −30), y up. Units: metres.
import { CARGOS, type CargoDef } from './cargo';
import { inside, toWorld, type Obb } from './geom';

/** The 2250 kVA open set (Genset Simulator model). */
export const GENSET = CARGOS.genset;

/** The load of the current job (a copy of one of CARGOS). */
export const LOAD: CargoDef = { ...CARGOS.genset };

// Flatbed semi-trailer, deck 13 m × 2.5 m, deck top 1.55 m; the tractor unit at +x.
export const TRUCK = { x0: -9, x1: 4, hz: 1.25, deckTop: 1.55, deckT: 0.2, headX0: 4.6, headX1: 10.6, headH: 3.6 };
export const TIMBER = { t: 0.2, w: 0.2, l: 2.4 }; // hardwood blocks laid across under a load

/** Where the load starts (bottom centre) and where it must go. */
export const CARGO_START = { x: -3, z: 0, yaw: 0, y: TRUCK.deckTop + TIMBER.t };
export const PAD = { x: -24, z: 16, yaw: 0, y: 0.2, tolerance: 0.6, yawTol: (10 * Math.PI) / 180, w: 7.2, d: 3.4, label: 'AREA LETAK GENSET' };
/** Where the forklift starts. */
export const START = { x: -3, z: 12, heading: Math.PI };

export const QUAY_Z = -30;

export function box(id: string, x: number, z: number, sx: number, sz: number, y0: number, y1: number, yaw = 0): Obb {
  return { id, x, z, hx: sx / 2, hz: sz / 2, yaw, y0, y1 };
}

/** Timbers of the current job: supports and obstacles both. */
export const TIMBERS: Obb[] = [];
/** Solid props of the current job a load can stand on: a concrete plinth, a pallet stack, a base container. */
export const SUPPORTS: (Obb & { kind: 'plinth' | 'pallets' | 'container' })[] = [];
/** Traffic cones of the current job (knocked over, not solid). */
export interface Cone {
  x: number;
  z: number;
  down: boolean;
  dir: [number, number];
  t: number;
}
export const CONES: Cone[] = [];
/** Moving things (workers, the yard tractor), refreshed by traffic.ts every step. */
export const DYNAMIC: Obb[] = [];

const DECK: Obb = box('deck', (TRUCK.x0 + TRUCK.x1) / 2, 0, TRUCK.x1 - TRUCK.x0, TRUCK.hz * 2, TRUCK.deckTop - TRUCK.deckT, TRUCK.deckTop);

/** Container stacks: [x, z, tiers]. 40 ft boxes are 12.19 × 2.44 × 2.59 m. */
export const STACKS: [number, number, number][] = [];
for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) STACKS.push([22 + c * 14, 14 + r * 6, 1 + ((r * 3 + c * 5) % 3)]);
for (let c = 0; c < 4; c++) STACKS.push([-48 + c * 13.5, -18, 1 + (c % 2)]);

export const CRANE = { x0: 38, x1: 56, zSea: -27, zLand: -8 };
export const LIGHTS: [number, number][] = [
  [-12, -14],
  [12, 54],
  [-36, 54],
  [12, -16],
];

const FIXED: Obb[] = [
  DECK,
  // the trailer's running gear and landing legs, below the deck
  box('axles', -6.8, 0, 3.4, 2.5, 0, 1.35),
  box('legs', 1.4, 0, 0.5, 2.3, 0, 1.35),
  box('kingpin', 3.2, 0, 1.6, 1.0, 0.9, 1.35),
  box('head', (TRUCK.headX0 + TRUCK.headX1) / 2, 0, TRUCK.headX1 - TRUCK.headX0, 2.5, 0, TRUCK.headH),
  ...STACKS.map(([x, z, n], i) => box(`stack-${i}`, x, z, 12.19, 2.44, 0, 2.59 * n)),
  ...[CRANE.x0, CRANE.x1].flatMap((x) => [CRANE.zSea, CRANE.zLand].map((z) => box(`crane-${x}-${z}`, x, z, 1.6, 2.2, 0, 40))),
  box('warehouse', -62, 22, 30, 36, 0, 12),
  ...LIGHTS.map(([x, z], i) => box(`light-${i}`, x, z, 0.8, 0.8, 0, 30)),
  // quay curb (the water is beyond it) and the yard fence
  box('curb', 0, QUAY_Z + 0.25, 160, 0.5, 0, 0.4),
  box('fence-n', 0, 58, 160, 0.3, 0, 2.4),
  box('fence-e', 78, 14, 0.3, 88, 0, 2.4),
  box('fence-w', -78, 14, 0.3, 88, 0, 2.4),
];

/** Everything fixed and solid for the current job. */
export const OBSTACLES: Obb[] = [];

export interface Layout {
  load: CargoDef;
  start: { x: number; z: number; yaw: number; y: number };
  pad: Partial<typeof PAD> & { x: number; z: number; yaw: number; y: number };
  forklift: { x: number; z: number; heading: number };
  timbers: Obb[];
  supports: (typeof SUPPORTS)[number][];
  cones: [number, number][];
}

/** Install a job's layout. */
export function applyLayout(l: Layout) {
  Object.assign(LOAD, l.load);
  Object.assign(CARGO_START, l.start);
  Object.assign(PAD, { tolerance: 0.6, yawTol: (10 * Math.PI) / 180, w: 7.2, d: 3.4, label: '' }, l.pad);
  Object.assign(START, l.forklift);
  TIMBERS.length = 0;
  TIMBERS.push(...l.timbers);
  SUPPORTS.length = 0;
  SUPPORTS.push(...l.supports);
  CONES.length = 0;
  for (const [x, z] of l.cones) CONES.push({ x, z, down: false, dir: [0, 1], t: 0 });
  OBSTACLES.length = 0;
  OBSTACLES.push(...FIXED, ...TIMBERS, ...SUPPORTS);
}

/** Timbers under a load at (x, z, yaw), at these offsets along its length, on a surface at height y. */
export function timbersUnder(tag: string, x: number, z: number, yaw: number, xs: number[], y: number, len: number = TIMBER.l): Obb[] {
  return xs.map((bx, i) => {
    const [wx, wz] = toWorld(x, z, yaw, bx, 0);
    return box(`timber-${tag}-${i}`, wx, wz, TIMBER.w, len, y, y + TIMBER.t, yaw);
  });
}

/** Height of the top surface a load set down at (x, z) would rest on. */
export function supportAt(x: number, z: number) {
  let h = 0;
  if (inside(DECK, x, z)) h = TRUCK.deckTop;
  for (const t of TIMBERS) if (inside(t, x, z)) h = Math.max(h, t.y1);
  for (const s of SUPPORTS) if (inside(s, x, z)) h = Math.max(h, s.y1);
  return h;
}

/** Is (x, z) on the trailer deck (for the trailer's springs and for "back on the truck"). */
export const onDeck = (x: number, z: number) => inside(DECK, x, z);
