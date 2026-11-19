// X-ray view: the body, cab and counterweight turn to glass and the circuits show as moving droplets in the truck's
// frame: oil from the tank through the gear pump and the control valve to the lift cylinders, the tilt cylinders,
// the steering cylinder and the fork positioner, and the brake air from the compressor to the tank and the wet
// brakes. Oil is coloured by pressure (blue low, red at the 210 bar relief) and labelled with the gauge reading.
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SPEC } from '../sim/spec';
import { fk, useUI } from '../store';
import { truck } from './Forklift';
import { M } from './parts';

const PER = 24;
type V = [number, number, number];

function lerpPath(pts: THREE.Vector3[], k: number, out: THREE.Vector3) {
  const seg = pts.length - 1;
  const f = Math.min(seg - 1e-6, Math.max(0, k * seg));
  const i = Math.floor(f);
  return out.lerpVectors(pts[i], pts[i + 1], f - i);
}

export function Xray() {
  const xray = useUI((s) => s.xray);
  useEffect(() => {
    for (const m of [M.body, M.bodyDark, M.cab, M.cabDark, M.glass]) {
      m.transparent = xray || m === M.glass;
      m.opacity = xray ? 0.14 : m === M.glass ? 0.58 : 1;
      m.depthWrite = !xray && m !== M.glass;
      m.needsUpdate = true;
    }
  }, [xray]);
  if (!xray) return null;
  return <Flow />;
}

function Flow() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const labels = useRef<(THREE.Group | null)[]>([]);
  const texts = useRef<({ text: string } | null)[]>([]);
  const phase = useRef(new Float32Array(7));
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const col = useMemo(() => new THREE.Color(), []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() }), []);
  useFrame((_, dt) => {
    const t = truck.obj;
    const m = ref.current;
    if (!t || !m) return;
    t.updateWorldMatrix(true, false);
    const W = (v: V) => new THREE.Vector3(...v).applyMatrix4(t.matrixWorld);
    const tilt = fk.tilt;
    // a point on the tilting mast (relative to the pivot) in the body frame
    const mast = (x: number, y: number, z: number): V => [x, SPEC.pivot.y + y * Math.cos(tilt) + z * Math.sin(tilt), SPEC.pivot.z - y * Math.sin(tilt) + z * Math.cos(tilt)];
    const tank: V = [-0.8, 0.9, -2.2];
    const pump: V = [0, 1.15, -2.9];
    const valve: V = [0.45, 1.55, -0.75];
    const carr = fk.lift - SPEC.pivot.y + 0.6;
    const raw: V[][] = [
      [tank, pump, valve, [0.32, 0.7, 0.2], mast(0.32, -0.35, -0.17), mast(0.32, 1.0, -0.17)],
      [tank, pump, valve, [-0.32, 0.7, 0.2], mast(-0.32, -0.35, -0.17), mast(-0.32, 1.0, -0.17)],
      [tank, pump, valve, [0.95, 1.2, -0.2], mast(0.85, 0.75, -0.25)],
      [tank, pump, valve, [0, 1.0, -2.0], [0, 0.85, -SPEC.wheelbase]],
      [tank, pump, valve, mast(0, 0.2, -0.25), mast(0, carr + 0.6, -0.25), mast(0, carr, 0.25), mast(0.9, carr, 0.3)],
      // brake air: compressor on the engine → tank → front wet brakes
      [[0.6, 1.4, -3.2], [0.95, 0.75, -1.6], [1.1, 0.62, -0.3], [1.15, 0.62, 0]],
      [[0.6, 1.4, -3.2], [0.95, 0.75, -1.6], [-1.1, 0.62, -0.3], [-1.15, 0.62, 0]],
    ];
    const paths = raw.map((p) => p.map(W));
    const on = fk.engine === 'running';
    const press = fk.pressure / SPEC.reliefBar;
    const rates = [Math.abs(fk.liftLever), Math.abs(fk.liftLever), Math.abs(fk.tiltLever), Math.abs(fk.steerInput) * 0.8, Math.abs(fk.spreadLever), fk.compressor ? 0.6 : fk.brake, fk.compressor ? 0.6 : fk.brake];
    const pressures = [press, press, Math.abs(fk.tiltLever) * 0.55, Math.abs(fk.steerInput) * 0.45, Math.abs(fk.spreadLever) * 0.35, fk.air / 8.3, fk.air / 8.3];
    for (let i = 0; i < paths.length; i++) {
      const r = rates[i];
      const active = on && r > 0.03;
      phase.current[i] = (phase.current[i] + dt * (0.12 + r * 0.9)) % 1;
      if (i >= 5) col.setHSL(0.52, 0.6, 0.55 + 0.25 * pressures[i]);
      else col.setHSL(0.62 - 0.62 * Math.min(1, pressures[i]), 1, 0.55);
      for (let j = 0; j < PER; j++) {
        lerpPath(paths[i], (j / PER + phase.current[i]) % 1, tmp.p);
        const s = active ? 0.06 : on ? 0.03 : 0.001;
        tmp.m.compose(tmp.p, tmp.q, tmp.s.set(s, s, s));
        m.setMatrixAt(i * PER + j, tmp.m);
        m.setColorAt(i * PER + j, col);
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    const lab = [
      [paths[0][paths[0].length - 1], `Silinder angkat ${fk.pressure.toFixed(0)} bar${fk.relief ? ' · RELIEF!' : ''}`],
      [paths[2][paths[2].length - 1], `Tilt ${((fk.tilt * 180) / Math.PI).toFixed(1)}°`],
      [paths[3][paths[3].length - 1], 'Silinder kemudi'],
      [paths[5][1], `Angin rem ${fk.air.toFixed(1)} bar`],
    ] as const;
    lab.forEach(([p, txt], i) => {
      labels.current[i]?.position.copy(p).add(new THREE.Vector3(0, 0.5, 0));
      if (texts.current[i]) texts.current[i]!.text = txt;
    });
  });
  return (
    <>
      <instancedMesh ref={ref} args={[undefined, mat, 7 * PER]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
      </instancedMesh>
      {[0, 1, 2, 3].map((i) => (
        <Billboard key={i} ref={(g) => (labels.current[i] = g as unknown as THREE.Group)}>
          <Text ref={(t) => (texts.current[i] = t as unknown as { text: string })} fontSize={0.2} color="#ffffff" outlineWidth={0.015} outlineColor="#000">
            -
          </Text>
        </Billboard>
      ))}
    </>
  );
}
