// The genset: the same detailed model as the Genset Simulator. Resting, it stands at its world pose; on the forks
// it follows the carriage (heel frame from Forklift.tsx) with the offset and yaw the simulation keeps.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SPEC } from '../sim/spec';
import { GENSET } from '../sim/world';
import { fk } from '../store';
import { carriage } from './Forklift';
import { Bake } from './Bake';
import { Genset } from './genset/Genset';

/** Centre-of-gravity symbol (quartered disc) painted on both base-frame rails, as on heavy lifted equipment. */
function CgMarks() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f2c21c';
    g.beginPath();
    g.arc(32, 32, 30, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    for (const a of [0, Math.PI]) {
      g.beginPath();
      g.moveTo(32, 32);
      g.arc(32, 32, 30, a, a + Math.PI / 2);
      g.fill();
    }
    g.lineWidth = 3;
    g.strokeStyle = '#111';
    g.beginPath();
    g.arc(32, 32, 30, 0, Math.PI * 2);
    g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[GENSET.cg.x, 0.17, s * 1.102]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
          <circleGeometry args={[0.13, 24]} />
          <meshStandardMaterial map={tex} roughness={0.6} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
    </group>
  );
}

export function Cargo() {
  const ref = useRef<THREE.Group>(null);
  const local = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  useFrame(() => {
    const g = ref.current!;
    const c = fk.cargo;
    if (c.state === 'forks' && carriage.obj) {
      carriage.obj.updateWorldMatrix(true, false);
      local.compose(p.set(c.lx, SPEC.forkT, c.a), q.setFromEuler(e.set(0, c.yawRel, 0)), one);
      g.matrix.multiplyMatrices(carriage.obj.matrixWorld, local);
    } else {
      // fallen: lift the low side out of the ground a little
      const lean = Math.max(Math.abs(c.pitch), Math.abs(c.roll));
      p.set(c.x, c.y + Math.sin(lean) * GENSET.hz, c.z);
      g.matrix.compose(p, q.setFromEuler(e.set(c.pitch, c.yaw, c.roll, 'YXZ')), one);
    }
    g.matrixWorldNeedsUpdate = true;
  });
  return (
    <group ref={ref} matrixAutoUpdate={false}>
      <Bake>
        <Genset />
        <CgMarks />
      </Bake>
    </group>
  );
}
