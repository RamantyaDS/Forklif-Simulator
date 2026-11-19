import { afterAll, describe, expect, it } from 'vitest';
import { create, finishP2h, hitAt, setDir, startEngine, step, type Forklift } from './forklift';
import { JOB, setJob, type JobId } from './jobs';
import { P2H_ITEMS } from './p2h';
import { SPEC } from './spec';
import { stepTraffic, WORKERS } from './traffic';
import { CARGO_START, CONES, LOAD, PAD, START, TRUCK } from './world';

const run = (f: Forklift, s: number, each?: (f: Forklift) => void) => {
  for (let t = 0; t < s; t += 0.005) {
    each?.(f);
    step(f, 0.005);
    f.msg = '';
  }
};

function ready(at?: [number, number, number]) {
  const f = create({ airFull: true, sas: false });
  if (at) [f.x, f.z, f.heading] = at;
  startEngine(f);
  run(f, 2);
  f.park = false;
  run(f, 0.2);
  return f;
}

const SPREAD: Partial<Record<JobId, number>> = { coil: 0.95, container: 2.36 };

/** Forklift squared up to a load at (x, z, y) with the fork face at its near edge (or the deck edge). */
function squareUp(f: Forklift, x: number, z: number, y: number, onTimber: boolean) {
  const s = Math.sign(Math.cos(START.heading)); // heading π: forks toward −z, the forklift on the +z side
  const near = Math.max(LOAD.hz, Math.abs(z) < 1.3 && y > 1 ? TRUCK.hz - Math.abs(z) + 0 : 0) + 0.02;
  f.heading = START.heading;
  f.x = x + LOAD.cg.x;
  f.z = z - s * (near + SPEC.loadDistance);
  f.tilt = 0;
  f.lift = onTimber ? y - 0.2 + 0.01 : y + 0.01;
  f.spread = SPREAD[JOB.cur.id] ?? 1.9;
}

const CARGO_JOBS: JobId[] = ['genset', 'coil', 'pipes', 'timber', 'cement', 'trafo', 'container'];

describe('jobs', () => {
  afterAll(() => setJob('genset'));

  for (const id of CARGO_JOBS)
    it(`${id}: clear start, picks the load up and sets it down on the target`, () => {
      setJob(id);
      const f0 = create();
      expect(hitAt(f0, f0.x, f0.z, f0.heading)).toBeNull();
      const f = ready();
      const timber = LOAD.lift0 === 0;
      squareUp(f, CARGO_START.x, CARGO_START.z, CARGO_START.y, timber);
      expect(hitAt(f, f.x, f.z, f.heading)).toBeNull();
      run(f, 3, (f) => {
        f.pedal = 0.6;
        f.liftLever = f.cargo.state === 'forks' ? 0 : 1;
      });
      expect(f.cargo.state).toBe('forks');
      // over the target, a little higher than its surface, then lower
      squareUp(f, PAD.x, PAD.z, PAD.y, false);
      f.lift = PAD.y + 0.15;
      f.liftLever = 0;
      expect(hitAt(f, f.x, f.z, f.heading)).toBeNull();
      run(f, 4, (f) => (f.liftLever = -1));
      expect(f.cargo.state).toBe('rest');
      expect(f.cargo.y).toBeCloseTo(PAD.y, 2);
    });

  it('container: the forks must be in the fork pockets', () => {
    setJob('container');
    const f = ready();
    squareUp(f, CARGO_START.x, CARGO_START.z, CARGO_START.y, false);
    f.spread = 1.9; // forks beside the pockets: they run into the bottom rail
    expect(hitAt(f, f.x, f.z, f.heading)).toBe('cargo');
    f.spread = 2.36;
    expect(hitAt(f, f.x, f.z, f.heading)).toBeNull();
  });

  it('wet concrete: longer braking from 15 km/h', () => {
    setJob('genset');
    const stop = (wet: boolean) => {
      const f = ready([200, 200, 0]);
      f.wet = wet;
      setDir(f, 'F');
      run(f, 12, (f) => (f.pedal = f.v * 3.6 < 15 ? 1 : 0));
      const z0 = f.z;
      run(f, 8, (f) => {
        f.pedal = 0;
        f.brake = 1;
      });
      return f.z - z0;
    };
    expect(stop(true)).toBeGreaterThan(stop(false) * 1.15);
  });

  it('SIO: knocked cones count, checkpoints in order', () => {
    setJob('sio');
    const f = ready();
    const c = CONES[0];
    // drive straight over the first slalom cone
    [f.x, f.z, f.heading] = [c.x, c.z + 8, Math.PI];
    setDir(f, 'F');
    run(f, 6, (f) => (f.pedal = 0.3));
    expect(f.cones).toBeGreaterThan(0);
    expect(c.down).toBe(true);
    expect(f.cp).toBe(0); // not loaded: the slalom does not count
  });

  it('P2H: missing a fault costs the stars', () => {
    setJob('p2h');
    const f = create();
    expect(f.phase).toBe('p2h');
    expect(f.defects.length).toBeGreaterThanOrEqual(2);
    const ids = P2H_ITEMS.map((i) => i.id);
    for (const id of ids) f.answers[id] = f.defects.includes(id) ? 'bad' : 'ok';
    finishP2h(f, ids);
    expect(f.result?.stars).toBe(3);
    const g = create();
    for (const id of ids) g.answers[id] = 'ok';
    finishP2h(g, ids);
    expect(g.result?.stars).toBeLessThanOrEqual(1);
  });

  it('workers stop for the forklift; running one down fails the job', () => {
    setJob('genset');
    const f = ready([WORKERS[0].x + 1, WORKERS[0].z + 5, Math.PI]);
    stepTraffic(f, 0.05);
    expect(WORKERS[0].stopped).toBe(true);
    setDir(f, 'F');
    for (let i = 0; i < 400 && f.phase !== 'failed'; i++) {
      stepTraffic(f, 0.01);
      run(f, 0.01, (f) => (f.pedal = 0.5));
    }
    expect(f.phase).toBe('failed');
  });
});
