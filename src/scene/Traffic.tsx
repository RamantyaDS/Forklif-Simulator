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
  const wheel = (x: number, z: number, k: string) => <Cyl key={k} r={0.5} l={0.4} axis="x" m={M.rubber} position={[x, 0.5, z]} seg={16} />;
  return (
    <group>
      <group ref={tractor}>
        <Bake>
          {/* terminal tractor: offset one-man cab, short bonnet, fifth wheel on a lifting deck */}
          <Box s={[2.4, 0.5, 5.6]} m={M.mast} position={[0, 0.85, 0]} />
          <Box s={[1.25, 1.9, 1.7]} r={0.06} m={TT.body} position={[0.55, 2.1, 1.7]} />
          <Box s={[1.2, 0.9, 1.65]} m={M.glassDark} position={[0.55, 2.55, 1.72]} />
          <Box s={[1.1, 0.8, 1.3]} r={0.05} m={TT.body} position={[-0.6, 1.5, 2.1]} />
          <Box s={[2.0, 0.25, 1.6]} m={M.steel} position={[0, 1.25, -1.4]} />
          <Cyl r={0.08} l={1.4} m={M.mast} position={[-0.85, 2.3, 1.3]} />
          <Cyl r={0.12} l={0.14} m={TT.beacon} position={[0.55, 3.15, 1.7]} />
          {[1.8, -1.6].map((z) => [-1, 1].map((s) => wheel(s * 1.0, z, `${z}${s}`)))}
        </Bake>
      </group>
      <group ref={trailer}>
        <Bake>
          {/* skeletal chassis and a 40 ft container */}
          <Box s={[0.3, 0.35, 12.2]} m={M.mast} position={[0.5, 1.15, 0]} />
          <Box s={[0.3, 0.35, 12.2]} m={M.mast} position={[-0.5, 1.15, 0]} />
          {[-5.8, -2, 2, 5.8].map((z) => (
            <Box key={z} s={[2.4, 0.2, 0.25]} m={M.mast} position={[0, 1.25, z]} />
          ))}
          {[-5.2, -4.0].map((z) => [-1, 1].map((s) => wheel(s * 0.95, z, `${z}${s}`)))}
          <Box s={[2.44, 2.59, 12.19]} m={TT.box} position={[0, 1.35 + 1.295, 0]} />
          {[-1, 1].map((s) => (
            <Box key={s} s={[0.02, 2.3, 11.6]} m={M.stripe} position={[s * 1.23, 2.65, 0]} />
          ))}
        </Bake>
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
