// The port yard: a flatbed semi-trailer with the genset on timber, the landing pad with its own timber, the quay,
// container stacks, the ship-to-shore crane and a warehouse. Everything solid is an oriented box (see geom.ts).
// World axes: x along the quay, z inland (the quay edge is at z = −30), y up. Units: metres.
import { inside, type Obb } from './geom';

/** The 2250 kVA open set (Genset Simulator model): 5.9 × 2.2 × 2.55 m, 14.8 t, base frame bottom at its y = 0. */
export const GENSET = {
  hx: 2.95,
  hz: 1.1,
  h: 2.55,
  mass: 14800,
  // centre of mass in the set's frame: engine toward the radiator end (−x), the heavy alternator at +x
  cg: { x: 0.13, y: 1.05, z: 0 },
};

// Flatbed semi-trailer, deck 13 m × 2.5 m, deck top 1.55 m; the tractor unit at +x.
export const TRUCK = { x0: -9, x1: 4, hz: 1.25, deckTop: 1.55, deckT: 0.2, headX0: 4.6, headX1: 10.6, headH: 3.6 };
export const TIMBER = { t: 0.2, w: 0.2, l: 2.4 }; // hardwood blocks laid across under the set
const BEAMS = [-2.6, 0, 2.6]; // along the set's length, clear of the forks' working range

export const CARGO_START = { x: -3, z: 0, yaw: 0, y: TRUCK.deckTop + TIMBER.t };

/** Where the genset must go: a marked pad with three timbers. */
export const PAD = { x: -24, z: 16, yaw: 0, tolerance: 0.6, yawTol: (10 * Math.PI) / 180 };

/** Where the forklift starts: beside the trailer, facing it. */
export const START = { x: -3, z: 12, heading: Math.PI };

export const QUAY_Z = -30;

function box(id: string, x: number, z: number, sx: number, sz: number, y0: number, y1: number, yaw = 0): Obb {
  return { id, x, z, hx: sx / 2, hz: sz / 2, yaw, y0, y1 };
}

/** Timber blocks: supports and obstacles both. */
export const TIMBERS: Obb[] = [
  ...BEAMS.map((bx, i) => box(`timber-truck-${i}`, CARGO_START.x + bx, CARGO_START.z, TIMBER.w, TIMBER.l, TRUCK.deckTop, TRUCK.deckTop + TIMBER.t)),
  ...BEAMS.map((bx, i) => box(`timber-pad-${i}`, PAD.x + bx, PAD.z, TIMBER.w, TIMBER.l, 0, TIMBER.t)),
];

const DECK: Obb = box('deck', (TRUCK.x0 + TRUCK.x1) / 2, 0, TRUCK.x1 - TRUCK.x0, TRUCK.hz * 2, TRUCK.deckTop - TRUCK.deckT, TRUCK.deckTop);

/** Container stacks: [x, z, tiers, along-x?]. 40 ft boxes are 12.19 × 2.44 × 2.59 m. */
export const STACKS: [number, number, number][] = [];
for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) STACKS.push([22 + c * 14, 14 + r * 6, 1 + ((r * 3 + c * 5) % 3)]);
for (let c = 0; c < 4; c++) STACKS.push([-48 + c * 13.5, -18, 1 + (c % 2)]);

export const CRANE = { x0: 38, x1: 56, zSea: -27, zLand: -8 };
export const LIGHTS: [number, number][] = [
  [-12, -14],
  [12, 30],
  [-36, 30],
  [12, -16],
];

export const OBSTACLES: Obb[] = [
  DECK,
  // the trailer's running gear and landing legs, below the deck
  box('axles', -6.8, 0, 3.4, 2.5, 0, 1.35),
  box('legs', 1.4, 0, 0.5, 2.3, 0, 1.35),
  box('kingpin', 3.2, 0, 1.6, 1.0, 0.9, 1.35),
  box('head', (TRUCK.headX0 + TRUCK.headX1) / 2, 0, TRUCK.headX1 - TRUCK.headX0, 2.5, 0, TRUCK.headH),
  ...TIMBERS,
  ...STACKS.map(([x, z, n], i) => box(`stack-${i}`, x, z, 12.19, 2.44, 0, 2.59 * n)),
  ...[CRANE.x0, CRANE.x1].flatMap((x) => [CRANE.zSea, CRANE.zLand].map((z) => box(`crane-${x}-${z}`, x, z, 1.6, 2.2, 0, 40))),
  box('warehouse', -62, 22, 30, 36, 0, 12),
  ...LIGHTS.map(([x, z], i) => box(`light-${i}`, x, z, 0.8, 0.8, 0, 30)),
  // quay curb (the water is beyond it) and the yard fence
  box('curb', 0, QUAY_Z + 0.25, 160, 0.5, 0, 0.4),
  box('fence-n', 0, 52, 160, 0.3, 0, 2.4),
  box('fence-e', 78, 11, 0.3, 82, 0, 2.4),
  box('fence-w', -78, 11, 0.3, 82, 0, 2.4),
];

/** Height of the top surface a load set down at (x, z) would rest on. */
export function supportAt(x: number, z: number) {
  let h = 0;
  if (inside(DECK, x, z)) h = TRUCK.deckTop;
  for (const t of TIMBERS) if (inside(t, x, z)) h = Math.max(h, t.y1);
  return h;
}

/** Is (x, z) on the trailer deck (for the trailer's springs and for "back on the truck"). */
export const onDeck = (x: number, z: number) => inside(DECK, x, z);
