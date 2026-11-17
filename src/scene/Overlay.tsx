// Teaching overlay drawn on the ground under the truck: the stability triangle (front tyres and the rear axle
// pivot), the combined centre of mass projected along the effective gravity, coloured by how close it is to an
// edge; plus a fork-height guide band when the forks are near the genset.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TRIANGLE } from '../sim/forklift';
import { fk, useUI } from '../store';
import { truck } from './Forklift';

const SAFE = new THREE.Color('#2fd27a');
const WARN = new THREE.Color('#ffc21a');
const BAD = new THREE.Color('#ff3b2f');

export function Overlay() {
  const on = useUI((s) => s.overlay);
  const group = useRef<THREE.Group>(null);
  const dot = useRef<THREE.Mesh>(null);
  const stem = useRef<THREE.Mesh>(null);
  const { lineGeo, lineMat, fillMat, fillGeo, dotMat } = useMemo(() => {
    const pts = [...TRIANGLE, TRIANGLE[0]].map(([x, z]) => new THREE.Vector3(x, 0.03, z));
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({ color: SAFE, transparent: true, opacity: 0.95 });
    const fillGeo = new THREE.BufferGeometry().setFromPoints(TRIANGLE.map(([x, z]) => new THREE.Vector3(x, 0.025, z)));
    fillGeo.setIndex([0, 2, 1]);
    fillGeo.computeVertexNormals();
    const fillMat = new THREE.MeshBasicMaterial({ color: SAFE, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    const dotMat = new THREE.MeshBasicMaterial({ color: SAFE, transparent: true, opacity: 0.85 });
    return { lineGeo, lineMat, fillMat, fillGeo, dotMat };
  }, []);
  const col = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const g = group.current!;
    g.visible = on && !!truck.obj && !fk.tipped;
    if (!g.visible) return;
    const r = Math.min(1, fk.risk);
    if (r < 0.6) col.copy(SAFE).lerp(WARN, r / 0.6);
    else col.copy(WARN).lerp(BAD, (r - 0.6) / 0.4);
    lineMat.color.copy(col);
    fillMat.color.copy(col);
    dotMat.color.copy(col);
    dot.current!.position.set(fk.proj.x, 0.05, fk.proj.z);
    // a thin stem from the real centre of mass down to its projection
    const s = stem.current!;
    const top = new THREE.Vector3(fk.cg.x, fk.cg.y, fk.cg.z);
    const bottom = new THREE.Vector3(fk.proj.x, 0.05, fk.proj.z);
    s.position.copy(top).add(bottom).multiplyScalar(0.5);
    s.scale.set(1, top.distanceTo(bottom), 1);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.sub(bottom).normalize());
  });
  return (
    <group>
      <OverlayAttach>
        <group ref={group}>
          <lineLoop geometry={lineGeo} material={lineMat} renderOrder={10} />
          <mesh geometry={fillGeo} material={fillMat} renderOrder={9} />
          <mesh ref={dot} material={dotMat} renderOrder={11}>
            <sphereGeometry args={[0.13, 16, 12]} />
          </mesh>
          <mesh ref={stem} material={dotMat} renderOrder={11}>
            <cylinderGeometry args={[0.02, 0.02, 1, 6]} />
          </mesh>
        </group>
      </OverlayAttach>
    </group>
  );
}

/** Follows the truck's pose (without the tipping, so the triangle stays on the ground). */
function OverlayAttach({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    ref.current!.position.set(fk.x, 0, fk.z);
    ref.current!.rotation.y = fk.heading;
  });
  return <group ref={ref}>{children}</group>;
}
