import { describe, expect, it } from 'vitest';
import { EMBED } from '../embed';
import { create, forksClear, setDir, startEngine, step, type Forklift } from './forklift';
import { SPEC } from './spec';
import { CARGO_START, TRUCK } from './world';

const run = (f: Forklift, s: number, each?: (f: Forklift) => void) => {
  for (let t = 0; t < s; t += 0.005) {
    each?.(f);
    step(f, 0.005);
    f.msg = '';
  }
};

/** The Traknus World truck parked along x at (200, 200), turned a little: solid deck, deck and timber surfaces. */
function truckAt(yaw: number) {
  const T = { x: 200, z: 200 };
  const box = (x: number, hx: number, hz: number, y0: number, y1: number) => ({ id: 'truk', x: T.x + x * Math.cos(yaw), z: T.z - x * Math.sin(yaw), hx, hz, yaw, y0, y1 });
  EMBED.solids.push(box(0, 3.3, 1.25, 0.15, 1.38));
  EMBED.supports.push(box(0, 3.15, 1.2, 1.18, 1.38), box(-2.6, 0.15, 1.2, 1.38, 1.58), box(2.6, 0.15, 1.2, 1.38, 1.58));
  return T;
}

/** Carrying the genset, tilted back, beside the truck's deck. */
function carrying(tilt: number) {
  const f = create({ airFull: true, sas: false });
  [f.x, f.z, f.heading] = [CARGO_START.x + 0.13, TRUCK.hz + 0.02 + SPEC.loadDistance, Math.PI];
  startEngine(f);
  run(f, 2);
  f.park = false;
  run(f, 0.2);
  f.lift = TRUCK.deckTop + 0.01;
  f.tilt = 0;
  f.spread = 1.9;
  run(f, 1.5, (f) => {
    f.pedal = 0.6;
    f.liftLever = 1;
  });
  run(f, 2, (f) => (f.tiltLever = 1));
  f.tiltLever = 0;
  f.liftLever = 0;
  f.pedal = 0;
  f.tilt = tilt;
  return f;
}

describe('loading the Traknus World truck never leaves the forklift stuck', () => {
  for (const tilt of [0.5, 1]) for (const yaw of [0, 0.04])
    it(`tilted back ${tilt * 12}°, truck turned ${yaw} rad: level, set down, back out`, () => {
      const f = carrying(tilt * SPEC.tiltBack);
      const T = truckAt(yaw);
      try {
        f.x = T.x + 0.13;
        f.z = T.z + TRUCK.hz + 0.12 + SPEC.loadDistance;
        // lowering tilted back stops on the deck edge, never inside it
        run(f, 4, (f) => (f.liftLever = -1));
        expect(f.cargo.state).toBe('forks');
        // level the forks, then down onto the timbers
        run(f, 6, (f) => {
          f.liftLever = 0;
          f.tiltLever = f.tilt > 0.002 ? -1 : 0;
        });
        run(f, 6, (f) => {
          f.tiltLever = 0;
          f.liftLever = -1;
        });
        expect(f.cargo.state).toBe('rest');
        setDir(f, 'R');
        const z0 = f.z;
        run(f, 3, (f) => {
          f.liftLever = 0;
          f.pedal = 0.4;
        });
        expect(f.z - z0).toBeGreaterThan(2);
        expect(forksClear(f)).toBe(true);
      } finally {
        EMBED.solids.length = 0;
        EMBED.supports.length = 0;
      }
    });

  it('backs out when the truck was parked into it', () => {
    const f = carrying(0);
    f.cargo.state = 'none' as never;
    const T = truckAt(0);
    try {
      // forks over the deck, the body 5 cm into its side
      f.lift = 1.1;
      f.x = T.x;
      f.z = T.z + 1.25 + 0.9;
      setDir(f, 'R');
      const z0 = f.z;
      run(f, 2, (f) => (f.pedal = 0.4));
      expect(f.z - z0).toBeGreaterThan(1);
      // but it cannot drive further in
      f.z = T.z + 1.25 + 0.9;
      f.v = 0;
      setDir(f, 'F');
      const z1 = f.z;
      run(f, 1, (f) => (f.pedal = 0.4));
      expect(f.z).toBeCloseTo(z1, 2);
    } finally {
      EMBED.solids.length = 0;
      EMBED.supports.length = 0;
    }
  });
});
