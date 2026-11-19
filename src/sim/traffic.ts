// Port traffic: workers in hi-vis walking their rounds (they stop and wait when the forklift comes near, step back
// to the horn, and turn back when it blocks their way), and a terminal tractor with a 40 ft container on a skeletal
// chassis circling the south lanes, yielding to the forklift. Their boxes go into DYNAMIC so the forklift can hit them.
import { footprint, type Forklift } from './forklift';
import { overlaps, type Obb } from './geom';
import { DYNAMIC } from './world';

export interface Walker {
  x: number;
  z: number;
  h: number; // heading
  path: [number, number][];
  i: number;
  step: 1 | -1;
  wait: number;
  stopped: boolean;
  blocked: number;
  walk: number; // gait phase
}

const W = (path: [number, number][]): Walker => ({ x: path[0][0], z: path[0][1], h: 0, path, i: 1, step: 1, wait: 0, stopped: false, blocked: 0, walk: Math.random() * 6 });

export const WORKERS: Walker[] = [
  W([[-34, 8.5], [14, 8.5]]), // along the lane between the trailer and the pads: crosses every job's route
  W([[-45, 17], [-34, 6], [-12, 6]]), // warehouse door to the trailer
  W([[13.5, 9], [13.5, 38]]), // beside the container stacks
  W([[-40, -23], [30, -23]]), // along the quay
  W([[-13, 3.2], [7, 3.2]]), // checker walking the trailer
];

// terminal tractor: a rounded rectangle, counter-clockwise seen from above
const ROUTE: [number, number][] = [];
{
  const x0 = -40;
  const x1 = 70;
  const zA = -5;
  const zB = -11.5;
  const r = (zA - zB) / 2;
  const n = 10;
  ROUTE.push([x0, zA], [x1, zA]);
  for (let k = 1; k < n; k++) {
    const a = Math.PI / 2 - (Math.PI * k) / n;
    ROUTE.push([x1 + Math.cos(a) * r, zB + r + Math.sin(a) * r]);
  }
  ROUTE.push([x1, zB], [x0, zB]);
  for (let k = 1; k < n; k++) {
    const a = -Math.PI / 2 - (Math.PI * k) / n;
    ROUTE.push([x0 + Math.cos(a) * r, zB + r + Math.sin(a) * r]);
  }
}
const SEG: number[] = [0];
for (let i = 1; i <= ROUTE.length; i++) {
  const [ax, az] = ROUTE[i - 1];
  const [bx, bz] = ROUTE[i % ROUTE.length];
  SEG.push(SEG[i - 1] + Math.hypot(bx - ax, bz - az));
}
const LEN = SEG[SEG.length - 1];

/** Point and heading on the route at distance s. */
export function routeAt(s: number): [number, number, number] {
  s = ((s % LEN) + LEN) % LEN;
  let i = 1;
  while (SEG[i] < s) i++;
  const [ax, az] = ROUTE[i - 1];
  const [bx, bz] = ROUTE[i % ROUTE.length];
  const k = (s - SEG[i - 1]) / (SEG[i] - SEG[i - 1]);
  return [ax + (bx - ax) * k, az + (bz - az) * k, Math.atan2(bx - ax, bz - az)];
}

export const YARD = { s: 20, v: 0, stopped: false };
const TRACTOR = { hx: 1.25, hz: 3.0, h: 3.2 };
const CHASSIS = { hx: 1.25, hz: 6.3, h: 4.0 };
export const YARD_GAP = 9.6; // distance from the tractor's centre back to the chassis centre along the route

function yardBoxes(s: number): Obb[] {
  const [x, z, h] = routeAt(s);
  const [cx, cz, ch] = routeAt(s - YARD_GAP);
  return [
    { id: 'yard-tractor', x, z, hx: TRACTOR.hx, hz: TRACTOR.hz, yaw: h, y0: 0, y1: TRACTOR.h },
    { id: 'yard-chassis', x: cx, z: cz, hx: CHASSIS.hx, hz: CHASSIS.hz, yaw: ch, y0: 0, y1: CHASSIS.h },
  ];
}

export function stepTraffic(f: Forklift, dt: number) {
  const fp = footprint(f);
  const moving = Math.abs(f.v) > 0.15;
  for (const w of WORKERS) {
    const near: Obb = { x: w.x, z: w.z, hx: 3.2, hz: 3.2, yaw: 0, y0: 0, y1: 2 };
    const close = fp.some((b) => overlaps(b, near));
    const hornNear = f.horn && Math.hypot(w.x - f.x, w.z - f.z) < 18;
    if (close || hornNear) {
      if (!w.stopped) w.stopped = true;
      // face the forklift; if it just sits in the way, turn back after a while
      w.h = Math.atan2(f.x - w.x, f.z - w.z);
      w.blocked += dt;
      if (w.blocked > 6 && !moving && close) {
        w.step = (w.step === 1 ? -1 : 1) as 1 | -1;
        w.i = Math.max(0, Math.min(w.path.length - 1, w.i + w.step));
        w.blocked = 0;
        w.stopped = false;
      }
      continue;
    }
    w.blocked = 0;
    w.stopped = false;
    if (w.wait > 0) {
      w.wait -= dt;
      continue;
    }
    const [tx, tz] = w.path[w.i];
    const dx = tx - w.x;
    const dz = tz - w.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) {
      w.wait = 1.5 + Math.random() * 3;
      if (w.i + w.step < 0 || w.i + w.step >= w.path.length) w.step = (w.step === 1 ? -1 : 1) as 1 | -1;
      w.i += w.step;
      continue;
    }
    const sp = 1.25 * dt;
    w.x += (dx / d) * Math.min(sp, d);
    w.z += (dz / d) * Math.min(sp, d);
    w.h = Math.atan2(dx, dz);
    w.walk += dt * 7;
  }
  // the terminal tractor yields when the forklift is in its way (up to 14 m ahead)
  const ahead = yardBoxes(YARD.s + 7)[0];
  ahead.hz += 7;
  const block = fp.some((b) => overlaps(b, ahead, -0.5));
  const want = block ? 0 : 5;
  YARD.v += Math.sign(want - YARD.v) * Math.min(Math.abs(want - YARD.v), dt * (block ? 4 : 1.2));
  YARD.stopped = block;
  YARD.s += YARD.v * dt;

  DYNAMIC.length = 0;
  for (let i = 0; i < WORKERS.length; i++) {
    const w = WORKERS[i];
    DYNAMIC.push({ id: `worker-${i}`, x: w.x, z: w.z, hx: 0.3, hz: 0.3, yaw: 0, y0: 0, y1: 1.8 });
  }
  DYNAMIC.push(...yardBoxes(YARD.s));
}
