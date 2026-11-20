import { describe, expect, it } from 'vitest';
import { EMBED } from '../embed';
import { create, forksClear, setDir, startEngine, step, type Forklift } from './forklift';
import { SPEC, capacityAt } from './spec';
import { CARGO_START, PAD, TRUCK } from './world';

const run = (f: Forklift, s: number, each?: (f: Forklift) => void) => {
  for (let t = 0; t < s; t += 0.005) {
    each?.(f);
    step(f, 0.005);
    f.msg = '';
  }
};

/** Running, air charged, parking brake off, somewhere empty. */
function ready(at: [number, number, number] = [200, 200, 0]) {
  const f = create({ airFull: true, sas: false });
  [f.x, f.z, f.heading] = at;
  startEngine(f);
  run(f, 2);
  f.park = false;
  run(f, 0.2);
  return f;
}

/** Forks under the genset on the trailer, carriage face just off the deck edge. */
function underGenset(offsetX = 0) {
  const f = ready([CARGO_START.x + 0.13 + offsetX, TRUCK.hz + 0.02 + SPEC.loadDistance, Math.PI]);
  f.lift = TRUCK.deckTop + 0.01;
  f.tilt = 0;
  f.spread = 1.9;
  return f;
}

describe('Toyota 4FD240', () => {
  it('starts in neutral and idles', () => {
    const f = create();
    setDir(f, 'F');
    startEngine(f);
    expect(f.engine).toBe('off');
    setDir(f, 'N');
    startEngine(f);
    run(f, 3);
    expect(f.engine).toBe('running');
    expect(f.rpm).toBeGreaterThan(650);
    expect(f.rpm).toBeLessThan(760);
  });

  it('builds brake air from cold before the parking brake lets go', () => {
    const f = create();
    startEngine(f);
    run(f, 2);
    f.park = false;
    run(f, 1);
    expect(f.parkOn).toBe(true);
    run(f, 60, (f) => (f.pedal = 0.4));
    expect(f.air).toBeGreaterThan(5.5);
    expect(f.parkOn).toBe(false);
  });

  it('reaches the datasheet travel speeds unladen (17 km/h 1st, 33 km/h 2nd, 27 km/h reverse)', () => {
    const f = ready([200, 200, 0]);
    setDir(f, 'F');
    let top1 = 0;
    run(f, 8, (f) => {
      f.pedal = 1;
      if (f.gear === 1) top1 = Math.max(top1, f.v * 3.6);
    });
    run(f, 40, (f) => (f.pedal = 1));
    const top2 = f.v * 3.6;
    expect(top1).toBeGreaterThan(9);
    expect(top2).toBeGreaterThan(26);
    expect(top2).toBeLessThan(36);
    const r = ready([200, 200, 0]);
    setDir(r, 'R');
    run(r, 40, (f) => (f.pedal = 1));
    expect(-r.v * 3.6).toBeGreaterThan(20);
    expect(-r.v * 3.6).toBeLessThan(30);
  });

  it('stalls the converter around 1700–2000 rpm against the brakes', () => {
    const f = ready();
    setDir(f, 'F');
    run(f, 4, (f) => {
      f.pedal = 1;
      f.brake = 1;
    });
    expect(Math.abs(f.v)).toBeLessThan(0.05);
    expect(f.rpm).toBeGreaterThan(1600);
    expect(f.rpm).toBeLessThan(2100);
  });

  it('lifts empty forks at about 320 mm/s at full engine speed', () => {
    const f = ready();
    f.lift = 0.3;
    run(f, 1, (f) => (f.pedal = 1));
    run(f, 2, (f) => {
      f.pedal = 1;
      f.liftLever = 1;
    });
    const speed = (f.lift - 0.3) / 2;
    expect(speed).toBeGreaterThan(0.25);
    expect(speed).toBeLessThan(0.34);
  });

  it('load chart: 24 t at 1250 mm, less further out', () => {
    expect(capacityAt(1.25)).toBe(24000);
    expect(capacityAt(1.5)).toBeLessThan(22000);
    expect(capacityAt(0.9)).toBe(24000);
  });

  it('picks the genset up off its timbers and reads its weight', () => {
    const f = underGenset();
    run(f, 1.5, (f) => {
      f.pedal = 0.6;
      f.liftLever = 1;
    });
    expect(f.cargo.state).toBe('forks');
    const kg = (f.pressure * 1e5 * SPEC.liftArea) / 2 / 9.81 - SPEC.carriageMass;
    expect(kg).toBeGreaterThan(14000);
    expect(kg).toBeLessThan(15600);
    expect(f.risk).toBeLessThan(0.8);
    expect(f.tipEdge).toBe(-1);
  });

  it('cannot drive the forks in at deck level into a timber', () => {
    // fork straddling the centre timber: spread so a fork is at the timber
    const f = underGenset();
    f.spread = 0.8;
    f.z += 3; // back off
    setDir(f, 'F');
    const z0 = f.z;
    run(f, 6, (f) => (f.pedal = 0.2));
    expect(f.bumps + (Math.abs(f.z - z0) < 2.9 ? 1 : 0)).toBeGreaterThan(0);
  });

  it('drops the genset when its centre of mass is outside the forks', () => {
    const f = underGenset(1.6);
    f.spread = 0.8;
    run(f, 1.5, (f) => {
      f.pedal = 0.6;
      f.liftLever = 1;
    });
    expect(['falling', 'fallen']).toContain(f.cargo.state);
    expect(f.phase).toBe('failed');
  });

  it('tips over sideways in a fast full-lock turn, not in a slow one', () => {
    const slow = ready();
    setDir(slow, 'F');
    run(slow, 3, (f) => (f.pedal = 0.25));
    run(slow, 6, (f) => {
      f.pedal = 0.25;
      f.steerInput = 1;
    });
    expect(slow.tipped).toBe(false);
    const fast = ready();
    setDir(fast, 'F');
    run(fast, 25, (f) => (f.pedal = 1));
    run(fast, 4, (f) => {
      f.pedal = 1;
      f.steerInput = 1;
    });
    expect(fast.tipped).toBe(true);
  });

  it('carries the genset to the pad and sets it down on the timbers', () => {
    const f = underGenset();
    run(f, 1.5, (f) => {
      f.pedal = 0.6;
      f.liftLever = 1;
    });
    run(f, 2, (f) => (f.tiltLever = 1));
    expect(f.cargo.state).toBe('forks');
    // teleport over the pad, forks pointing along −z like on the truck, and lower
    f.x = PAD.x + 0.13;
    f.z = PAD.z + 1.1 + 0.15 + SPEC.loadDistance + 0.05;
    f.tiltLever = 0;
    f.liftLever = 0;
    f.tilt = 0; // level forks: tilted forward the tips would dig into the ground first
    run(f, 6, (f) => (f.liftLever = -1));
    expect(f.cargo.state).toBe('rest');
    expect(f.cargo.y).toBeCloseTo(0.2, 2);
  });

  it('sets the genset down on a Traknus World truck deck, draws the forks out, and lifts it off again', () => {
    const f = underGenset();
    run(f, 1.5, (f) => {
      f.pedal = 0.6;
      f.liftLever = 1;
    });
    run(f, 2, (f) => (f.tiltLever = 1));
    expect(f.cargo.state).toBe('forks');
    // the world's truck parked lengthwise along x at (200, 200): solid deck, deck and timber surfaces
    const T = { x: 200, z: 200 };
    const box = (x: number, hx: number, hz: number, y0: number, y1: number) => ({ id: 'truk', x, z: T.z, hx, hz, yaw: 0, y0, y1 });
    EMBED.solids.push(box(T.x, 3.3, 1.25, 0.15, 1.38));
    EMBED.supports.push(box(T.x, 3.15, 1.2, 1.18, 1.38), box(T.x - 2.6, 0.15, 1.2, 1.38, 1.58), box(T.x + 2.6, 0.15, 1.2, 1.38, 1.58));
    try {
      // up against the deck side, forks over the deck, level, and down onto the timbers
      f.x = T.x + 0.13;
      f.z = T.z + TRUCK.hz + 0.02 + SPEC.loadDistance;
      f.heading = Math.PI;
      f.tiltLever = 0;
      f.liftLever = 0;
      f.tilt = 0;
      run(f, 6, (f) => (f.liftLever = f.cargo.state === 'forks' || f.lift > 1.39 ? -1 : 0));
      expect(f.cargo.state).toBe('rest');
      expect(f.cargo.y).toBeCloseTo(1.58, 2);
      expect(f.lift).toBeGreaterThan(1.37); // the forks stop on the deck between the timbers
      // reverse out: the forks come free of the set
      setDir(f, 'R');
      run(f, 2.5, (f) => (f.pedal = 0.4));
      expect(forksClear(f)).toBe(true);
      expect(f.cargo.state).toBe('rest');
      // back in under it and lift it off the deck again
      f.pedal = 0;
      f.x = T.x + 0.13;
      f.z = T.z + TRUCK.hz + 0.02 + SPEC.loadDistance;
      f.v = 0;
      setDir(f, 'F');
      run(f, 1.5, (f) => {
        f.pedal = 0.6;
        f.liftLever = 1;
      });
      expect(f.cargo.state).toBe('forks');
    } finally {
      EMBED.solids.length = 0;
      EMBED.supports.length = 0;
    }
  });
});
