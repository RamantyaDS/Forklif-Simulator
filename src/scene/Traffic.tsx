// The people and the other vehicle in the yard. Workers (and the spotter at the target) are drawn with one instanced
// mesh per body part, so six people cost seven draw calls; their legs and arms swing as they walk. The spotter faces
// the forklift and gives the standard hand signals for the load (come on, left / right, lower, raise, stop) with
// the meaning written above him. The terminal tractor tows a 40 ft container on a skeletal chassis around the
// south lanes with its amber beacon turning.
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { toLocal } from '../sim/geom';
import { JOB } from '../sim/jobs';
import { routeAt, WORKERS, YARD, YARD_GAP } from '../sim/traffic';
import { LOAD, PAD } from '../sim/world';
import { fk, useUI } from '../store';
import { Bake } from './Bake';
import { Box, Cyl, M } from './parts';
import { KitMesh, TM, buildRear, kitWheel, type Kit } from './truckKit';
import { weather } from './weather';

type Pose = { x: number; z: number; h: number; walk: number; armL: [number, number]; armR: [number, number]; vest: 'y' | 'o' };

const PARTS = {
  leg: new THREE.BoxGeometry(0.15, 0.82, 0.17).translate(0, -0.41, 0),
  boot: new THREE.BoxGeometry(0.15, 0.1, 0.27).translate(0, -0.85, 0.04),
  torso: new THREE.BoxGeometry(0.44, 0.62, 0.25),
  arm: new THREE.BoxGeometry(0.11, 0.62, 0.11).translate(0, -0.29, 0),
  head: new THREE.SphereGeometry(0.11, 12, 8),
  hat: new THREE.SphereGeometry(0.14, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
};

const N = WORKERS.length + 1; // + spotter

type Signal = { arms: [[number, number], [number, number]]; text: string } | null;

/** The spotter's signal from where the load is relative to the target. */
function spotterSignal(t: number, sh: number): Signal {
  const c = fk.cargo;
  if (c.state !== 'forks' || fk.phase === 'done' || fk.phase === 'failed') return null;
  // load centre in the target's frame and its bottom relative to the target surface
  const box = { x: 0, z: 0 };
  const yaw = fk.heading + c.yawRel;
  const s = Math.sin(yaw);
  const k = Math.cos(yaw);
  // load origin in the world (carried): carriage frame → world, approximated from the truck pose
  const o = { x: fk.x + Math.sin(fk.heading) * (0.945 + c.a) + Math.cos(fk.heading) * c.lx, z: fk.z + Math.cos(fk.heading) * (0.945 + c.a) - Math.sin(fk.heading) * c.lx };
  box.x = o.x + LOAD.cg.x * k;
  box.z = o.z - LOAD.cg.x * s;
  const [dx, dz] = toLocal(PAD.x, PAD.z, PAD.yaw, box.x, box.z);
  const dist = Math.hypot(dx, dz);
  const bottom = fk.lift + 0.1 - LOAD.lift0;
  const dh = bottom - PAD.y;
  const wave = Math.sin(t * 6) * 0.35;
  if (dist > 5) return { arms: [[-2.6 + wave, 0], [-2.6 + wave, 0]], text: 'MAJU TERUS' };
  if (Math.abs(dx) > 0.3 || Math.abs(dz) > 0.3) {
    // point the way the load has to go; the spotter faces the driver, so his left is the driver's right
    const [lx] = toLocal(0, 0, sh, PAD.x - box.x, PAD.z - box.z);
    return lx > 0 ? { arms: [[0, 1.5 + wave * 0.3], [0.05, 0]], text: 'GESER KE KANAN' } : { arms: [[0.05, 0], [0, 1.5 + wave * 0.3]], text: 'GESER KE KIRI' };
  }
  if (dh < -0.05) return { arms: [[0.1, 0], [-2.9 + wave * 0.6, 0]], text: 'NAIKKAN' };
  if (dh > 0.25) return { arms: [[0.1, 0], [-1.2 - wave * 0.8, 0]], text: 'TURUNKAN PELAN' };
  if (dh > 0.02) return { arms: [[0.1, 0], [-1.3 - wave * 0.4, 0]], text: 'TURUN… SEDIKIT LAGI' };
  return { arms: [[-3.0, 0.15], [-3.0, -0.15]], text: 'STOP' };
}

function People() {
  const refs = {
    leg: useRef<THREE.InstancedMesh>(null),
    boot: useRef<THREE.InstancedMesh>(null),
    vestY: useRef<THREE.InstancedMesh>(null),
    vestO: useRef<THREE.InstancedMesh>(null),
    arm: useRef<THREE.InstancedMesh>(null),
    head: useRef<THREE.InstancedMesh>(null),
    hat: useRef<THREE.InstancedMesh>(null),
  };
  const sign = useRef<THREE.Group>(null);
  const signText = useRef<{ text: string } | null>(null);
  const tmp = useMemo(() => ({ root: new THREE.Matrix4(), m: new THREE.Matrix4(), part: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), one: new THREE.Vector3(1, 1, 1), hide: new THREE.Matrix4().makeScale(0, 0, 0) }), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const poses: (Pose | null)[] = WORKERS.map((w, i) => {
      const sw = w.stopped || w.wait > 0 ? 0 : Math.sin(w.walk) * 0.5;
      return { x: w.x, z: w.z, h: w.h, walk: sw, armL: [-sw * 0.8, 0], armR: [sw * 0.8, 0], vest: i % 2 ? 'o' : 'y' };
    });
    // the spotter stands 4.5 m beside the target, on the side away from the trailer
    const job = JOB.cur.id !== 'sio' && JOB.cur.id !== 'p2h';
    if (job) {
      const sx = PAD.x + (PAD.x < -10 ? 1 : -1) * (LOAD.hx + 3.2);
      const sz = PAD.z + 1.5;
      const h = Math.atan2(fk.x - sx, fk.z - sz);
      const sig = spotterSignal(t, h);
      poses.push({ x: sx, z: sz, h, walk: 0, armL: sig ? sig.arms[0] : [0.05, 0], armR: sig ? sig.arms[1] : [0.05, 0], vest: 'o' });
      if (sign.current) {
        sign.current.visible = !!sig && fk.assists.guide;
        sign.current.position.set(sx, 2.35, sz);
      }
      if (signText.current && sig) signText.current.text = sig.text;
    } else {
      poses.push(null);
      if (sign.current) sign.current.visible = false;
    }
    let iy = 0;
    let io = 0;
    poses.forEach((pz, i) => {
      if (!pz) {
        for (const r of [refs.leg, refs.boot, refs.arm]) for (const j of [0, 1]) r.current!.setMatrixAt(i * 2 + j, tmp.hide);
        refs.head.current!.setMatrixAt(i, tmp.hide);
        refs.hat.current!.setMatrixAt(i, tmp.hide);
        return;
      }
      tmp.root.compose(tmp.p.set(pz.x, 0, pz.z), tmp.q.setFromEuler(tmp.e.set(0, pz.h, 0)), tmp.one);
      const at = (x: number, y: number, z: number, rx: number, rz = 0) => tmp.m.multiplyMatrices(tmp.root, tmp.part.compose(tmp.p.set(x, y, z), tmp.q.setFromEuler(tmp.e.set(rx, 0, rz)), tmp.one));
      [-1, 1].forEach((s, j) => {
        const swing = s * pz.walk;
        refs.leg.current!.setMatrixAt(i * 2 + j, at(s * 0.1, 0.9, 0, swing));
        refs.boot.current!.setMatrixAt(i * 2 + j, at(s * 0.1, 0.9, 0, swing));
        const [ax, az] = s < 0 ? pz.armR : pz.armL;
        refs.arm.current!.setMatrixAt(i * 2 + j, at(s * 0.28, 1.47, 0, ax, s * (0.08 + az)));
      });
      const torso = at(0, 1.2, 0, 0);
      if (pz.vest === 'y') refs.vestY.current!.setMatrixAt(iy++, torso);
      else refs.vestO.current!.setMatrixAt(io++, torso);
      refs.head.current!.setMatrixAt(i, at(0, 1.66, 0, 0));
      refs.hat.current!.setMatrixAt(i, at(0, 1.71, 0, 0));
    });
    refs.vestY.current!.count = iy;
    refs.vestO.current!.count = io;
    for (const r of Object.values(refs)) r.current!.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh ref={refs.leg} args={[PARTS.leg, M.jeans, N * 2]} castShadow frustumCulled={false} />
      <instancedMesh ref={refs.boot} args={[PARTS.boot, M.boots, N * 2]} frustumCulled={false} />
      <instancedMesh ref={refs.vestY} args={[PARTS.torso, M.vest, N]} castShadow frustumCulled={false} />
      <instancedMesh ref={refs.vestO} args={[PARTS.torso, M.vestOrange, N]} castShadow frustumCulled={false} />
      <instancedMesh ref={refs.arm} args={[PARTS.arm, M.vestOrange, N * 2]} castShadow frustumCulled={false} />
      <instancedMesh ref={refs.head} args={[PARTS.head, M.skin, N]} frustumCulled={false} />
      <instancedMesh ref={refs.hat} args={[PARTS.hat, M.hat, N]} frustumCulled={false} />
      <group ref={sign}>
        <Billboard>
          <Text ref={(t) => (signText.current = t as unknown as { text: string })} fontSize={0.36} color="#ffd21a" outlineWidth={0.03} outlineColor="#000" fontWeight={700}>
            -
          </Text>
        </Billboard>
      </group>
    </group>
  );
}

const TT = {
  body: weather(new THREE.MeshStandardMaterial({ color: '#d8a51c', metalness: 0.25, roughness: 0.45 }), { dirt: 0.3, mudBelow: 1.2, mud: 0.5, chips: 0.25, rust: 0.1 }),
  box: weather(new THREE.MeshStandardMaterial({ color: '#a8382c', metalness: 0.35, roughness: 0.5 }), { dirt: 0.25, mudBelow: 0.6, mud: 0.3, chips: 0.2, rust: 0.35, scale: 1.1 }),
  beacon: new THREE.MeshStandardMaterial({ color: '#ff9d1a', emissive: '#ff8800', emissiveIntensity: 2, transparent: true, opacity: 0.9 }),
};

/** Container owner code painted on the doors and the sides. */
function containerCode() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2f2ee';
  g.font = 'bold 54px sans-serif';
  g.fillText('TNSU 401227 4', 12, 58);
  g.font = 'bold 40px sans-serif';
  g.fillText('45G1', 12, 112);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
}

/** Terminal tractor: offset one-man cab with glass all round, short engine bonnet, lifting fifth-wheel ramp. */
function buildTerminalTractor(k: Kit) {
  // frame, front bumper with lamps
  for (const s of [1, -1]) k.box(TM.chassis, [0.1, 0.32, 5.2], [s * 0.45, 0.85, 0]);
  for (const z of [2.3, 0.9, -0.6, -2.3]) k.box(TM.chassis, [0.8, 0.18, 0.08], [0, 0.85, z]);
  k.box(TM.bumper, [2.5, 0.42, 0.3], [0, 0.78, 2.75], undefined, 0.04);
  for (const s of [1, -1]) {
    k.box(TM.seal, [0.34, 0.16, 0.02], [s * 0.85, 0.85, 2.905]);
    k.box(TM.head, [0.24, 0.11, 0.02], [s * 0.88, 0.85, 2.912], undefined, 0.005);
    k.box(TM.amber, [0.08, 0.11, 0.02], [s * 0.66, 0.85, 2.912]);
  }
  // engine bonnet (left of the cab) with side louvres, grille, exhaust stack and intake
  k.box(TT.body, [1.15, 0.85, 1.75], [-0.62, 1.48, 1.9], undefined, 0.07);
  k.box(TM.grille, [0.9, 0.5, 0.03], [-0.62, 1.48, 2.79]);
  for (let i = 0; i < 4; i++) k.box(TM.steel, [0.88, 0.03, 0.03], [-0.62, 1.3 + i * 0.12, 2.81]);
  for (let i = 0; i < 6; i++) k.box(TM.grille, [0.02, 0.05, 0.5], [-1.205, 1.3 + i * 0.07, 1.6]);
  k.cyl(TM.chassis, 0.11, 0.6, [-1.0, 2.15, 1.25]);
  k.cyl(TM.chrome, 0.06, 0.9, [-1.0, 2.85, 1.25]);
  k.cyl(TM.plastic, 0.1, 1.0, [-0.3, 2.3, 1.15]);
  k.box(TM.plastic, [0.26, 0.14, 0.26], [-0.3, 2.85, 1.15], undefined, 0.04);
  // one-man cab: pillars, glass all round, roof, door with handle, steps, seat and wheel, mirrors, beacon, work lamps
  const cx = 0.55;
  const cz = 1.7;
  k.box(TT.body, [1.3, 0.55, 1.75], [cx, 1.37, cz], undefined, 0.05);
  k.box(TT.body, [1.4, 0.12, 1.85], [cx, 3.06, cz], undefined, 0.04);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(TT.body, [0.08, 1.4, 0.08], [cx + sx * 0.61, 2.33, cz + sz * 0.83]);
  k.box(TM.glass, [1.16, 1.32, 0.02], [cx, 2.33, cz + 0.86]);
  k.box(TM.glass, [1.16, 1.32, 0.02], [cx, 2.33, cz - 0.86]);
  for (const sx of [-1, 1]) k.box(TM.glass, [0.02, 1.32, 1.58], [cx + sx * 0.63, 2.33, cz]);
  k.box(TM.seal, [0.012, 1.36, 0.02], [cx + 0.645, 2.12, cz + 0.05]);
  k.box(TM.seal, [0.03, 0.04, 0.16], [cx + 0.66, 2.0, cz - 0.4]);
  k.box(TM.plastic, [0.9, 0.04, 0.25], [cx, 2.62, cz + 0.6]);
  for (const y of [0.45, 0.8]) k.box(TM.checker, [0.28, 0.035, 0.3], [cx + 0.72, y, cz - 0.72]);
  k.box(TM.seal, [0.02, 0.7, 0.32], [cx + 0.58, 0.72, cz - 0.72]);
  k.cyl(TM.chrome, 0.018, 1.1, [cx + 0.7, 2.0, cz + 0.85]);
  for (const sx of [-1, 1]) {
    k.cyl(TM.plastic, 0.02, 0.3, [cx + sx * 0.8, 2.75, cz + 0.85], 'x', 6);
    k.box(TM.plastic, [0.07, 0.36, 0.2], [cx + sx * 0.97, 2.62, cz + 0.88], undefined, 0.03);
    k.box(TM.mirror, [0.06, 0.32, 0.01], [cx + sx * 0.97, 2.62, cz + 0.775]);
  }
  k.cyl(TM.chassis, 0.06, 0.08, [cx, 3.16, cz]);
  k.cyl(TT.beacon, 0.12, 0.16, [cx, 3.28, cz], 'y', 16);
  for (const sx of [-1, 1]) k.box(TM.head, [0.16, 0.1, 0.06], [cx + sx * 0.45, 3.06, cz - 0.95], undefined, 0.01);
  // fenders over the front wheels
  for (const s of [1, -1]) {
    const f = new THREE.CylinderGeometry(0.62, 0.62, 0.42, 18, 1, true, 2.4, 3.0);
    k.add(TM.plasticDS, f, [s * 1.0, 0.52, 1.8], [0, 0, -Math.PI / 2]);
  }
  // lifting fifth-wheel ramp: inclined plate, fifth wheel, lift cylinders, air lines
  k.box(TM.checker, [2.0, 0.06, 1.0], [0, 1.15, -0.55], [0.12, 0, 0]);
  k.box(TM.chassis, [1.7, 0.12, 1.5], [0, 1.18, -1.6]);
  k.cyl(TM.chassis, 0.62, 0.09, [0, 1.3, -1.55], 'y', 28);
  k.box(TM.seal, [0.16, 0.02, 0.56], [0, 1.35, -1.85]);
  for (const s of [1, -1]) {
    k.cyl(TM.steel, 0.07, 0.6, [s * 0.62, 1.0, -1.0], 'y', 10);
    k.cyl(TM.chrome, 0.04, 0.3, [s * 0.62, 1.38, -1.0], 'y', 8);
    k.box(TM.plastic, [0.62, 0.025, 1.4], [s * 0.95, 1.12, -1.6]);
  }
  k.tube(TM.red, [[0.3, 2.6, 0.82], [0.3, 1.9, 0.4], [0.2, 1.45, -0.7]], 0.02);
  k.tube(TM.yellow, [[0.42, 2.6, 0.82], [0.42, 1.9, 0.4], [0.32, 1.45, -0.7]], 0.02);
  buildRear(k, -2.6, -1.6, 0.95, TM.tail);
  // front singles, rear duals
  for (const s of [1, -1] as const) {
    kitWheel(k, [s * 1.0, 0.52, 1.8], false, s);
    kitWheel(k, [s * 0.93, 0.52, -1.6], true, s);
  }
}

/** Skeletal 40 ft chassis carrying a corrugated container: castings, door bars, landing legs, air-bag bogie. */
function buildContainerTrailer(k: Kit) {
  // main beams with flanges, bolsters with twistlocks, kingpin
  for (const s of [1, -1]) {
    k.box(TM.chassis, [0.012, 0.36, 12.2], [s * 0.5, 1.1, 0]);
    for (const y of [0.92, 1.28]) k.box(TM.chassis, [0.16, 0.014, 12.2], [s * 0.5, y, 0]);
  }
  for (const z of [-5.95, -3.0, 0, 3.0, 5.95]) k.box(TM.chassis, [2.44, 0.18, 0.2], [0, 1.25, z]);
  for (const sx of [-1, 1]) for (const z of [-6.0, 6.0]) k.box(TM.yellow, [0.12, 0.06, 0.16], [sx * 1.12, 1.36, z]);
  k.cyl(TM.steel, 0.05, 0.1, [0, 0.88, 5.0]);
  // landing legs with the crank
  for (const s of [1, -1]) {
    k.box(TM.chassis, [0.14, 0.9, 0.14], [s * 0.85, 0.55, 4.0]);
    k.box(TM.chassis, [0.36, 0.05, 0.36], [s * 0.85, 0.1, 4.0]);
    k.box(TM.chassis, [0.3, 0.06, 0.06], [s * 0.65, 0.95, 4.0]);
  }
  k.cyl(TM.steel, 0.02, 0.3, [1.05, 0.8, 4.0], 'x', 6);
  // air-suspended tandem: trailing arms, bags, hangers, axles
  for (const z of [-5.2, -4.0]) {
    k.cyl(TM.chassis, 0.09, 1.7, [0, 0.52, z], 'x', 12);
    for (const s of [1, -1]) {
      k.box(TM.chassis, [0.1, 0.1, 0.9], [s * 0.6, 0.62, z + 0.25]);
      k.cyl(TM.rubber, 0.13, 0.25, [s * 0.6, 0.78, z - 0.25], 'y', 14);
      k.box(TM.chassis, [0.1, 0.4, 0.12], [s * 0.6, 0.85, z + 0.65]);
    }
  }
  buildRear(k, -6.1, -5.2, 0.98, TM.tail);
  for (const s of [1, -1] as const) for (const z of [-5.2, -4.0]) kitWheel(k, [s * 0.93, 0.52, z], true, s);

  // 40 ft box: 12.19 × 2.59 × 2.44, floor at 1.35
  const L = 12.19;
  const W = 2.44;
  const H = 2.59;
  const y0 = 1.35;
  const yc = y0 + H / 2;
  k.box(TT.box, [W - 0.06, H - 0.1, L - 0.2], [0, yc, 0]);
  // corrugated side walls and front wall, roof dents
  for (let z = -L / 2 + 0.3; z < L / 2 - 0.2; z += 0.278) for (const s of [1, -1]) k.box(TT.box, [0.05, H - 0.32, 0.14], [s * (W / 2 - 0.03), yc, z]);
  for (let x = -W / 2 + 0.25; x < W / 2 - 0.2; x += 0.278) k.box(TT.box, [0.14, H - 0.32, 0.05], [x, yc, L / 2 - 0.08]);
  for (let z = -L / 2 + 0.4; z < L / 2 - 0.3; z += 0.6) k.box(TT.box, [W - 0.2, 0.025, 0.3], [0, y0 + H - 0.04, z]);
  // top and bottom rails, corner posts, castings
  for (const s of [1, -1]) for (const y of [y0 + 0.08, y0 + H - 0.08]) k.box(TT.box, [0.1, 0.16, L], [s * (W / 2 - 0.05), y, 0]);
  for (const sx of [1, -1])
    for (const sz of [1, -1]) {
      k.box(TT.box, [0.16, H, 0.16], [sx * (W / 2 - 0.08), yc, sz * (L / 2 - 0.08)]);
      for (const y of [y0 + 0.06, y0 + H - 0.06]) k.box(TM.chassis, [0.18, 0.12, 0.18], [sx * (W / 2 - 0.08), y, sz * (L / 2 - 0.08)]);
    }
  // rear doors: two leaves, four locking bars with handles and keepers, hinges, codes
  const dz = -L / 2 - 0.01;
  k.box(TT.box, [W - 0.3, H - 0.3, 0.04], [0, yc, dz]);
  k.box(TM.seal, [0.015, H - 0.3, 0.05], [0, yc, dz - 0.005]);
  for (const x of [-0.85, -0.35, 0.35, 0.85]) {
    k.cyl(TM.steel, 0.022, H - 0.15, [x, yc, dz - 0.06]);
    k.box(TM.steel, [0.04, 0.04, 0.32], [x + 0.1, y0 + 1.1, dz - 0.12], [0, 0.4, 0]);
    for (const y of [y0 + 0.12, y0 + H - 0.12]) k.box(TM.steel, [0.08, 0.1, 0.06], [x, y, dz - 0.05]);
  }
  for (const sx of [-1, 1]) for (const y of [0.4, 1.3, 2.2]) k.box(TM.steel, [0.06, 0.12, 0.06], [sx * (W / 2 - 0.16), y0 + y, dz - 0.04]);
  const code = containerCode();
  k.add(code, new THREE.PlaneGeometry(1.0, 0.25), [0.5, y0 + H - 0.35, dz - 0.03], [0, Math.PI, 0]);
  for (const s of [1, -1]) k.add(code, new THREE.PlaneGeometry(1.6, 0.4), [s * (W / 2 + 0.03), y0 + H - 0.4, -s * (L / 2 - 1.2)], [0, (s * Math.PI) / 2, 0]);
}

function YardTruck() {
  const tractor = useRef<THREE.Group>(null);
  const trailer = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const [x, z, h] = routeAt(YARD.s);
    const [cx, cz, ch] = routeAt(YARD.s - YARD_GAP);
    tractor.current!.position.set(x, 0, z);
    tractor.current!.rotation.y = h;
    trailer.current!.position.set(cx, 0, cz);
    trailer.current!.rotation.y = ch;
    TT.beacon.emissiveIntensity = Math.sin(clock.elapsedTime * 8) > 0 ? 6 : 0.4;
  });
  return (
    <group>
      <group ref={tractor}>
        <KitMesh build={buildTerminalTractor} />
      </group>
      <group ref={trailer}>
        <KitMesh build={buildContainerTrailer} />
      </group>
    </group>
  );
}

export function Traffic() {
  useUI((s) => s.jobVersion);
  return (
    <group>
      <People />
      <YardTruck />
    </group>
  );
}
