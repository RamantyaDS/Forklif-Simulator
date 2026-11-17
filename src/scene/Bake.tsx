// Draw-call reduction without changing the look: after its children mount, <Bake> merges every static mesh under
// it into one mesh per material (geometry baked in place) and hides the originals. Moving parts are kept out by
// putting them outside, or under a group with userData.noBake. Text (troika) and instanced meshes are left alone.
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function Bake({ children, shadows = true }: { children: ReactNode; shadows?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const root = ref.current!;
    // wait a frame so drei helpers (RoundedBox, extrusions) have their final geometry
    const id = requestAnimationFrame(() => {
      root.updateWorldMatrix(true, true);
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      const groups = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
      const done: THREE.Mesh[] = [];
      const visit = (o: THREE.Object3D) => {
        if (o.userData.noBake) return;
        const m = o as THREE.Mesh;
        const text = (o as unknown as { isTroikaText?: boolean }).isTroikaText;
        if (m.isMesh && !text && !(o as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(m.material) && o.visible) {
          let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
          for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
          if (!g.attributes.normal) g.computeVertexNormals();
          if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
          g = g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
          // a mirrored transform flips the winding: flip it back so faces stay outward
          if (new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld).determinant() < 0) {
            const p = g.attributes.position.array as Float32Array;
            const n = g.attributes.normal.array as Float32Array;
            const u = g.attributes.uv.array as Float32Array;
            for (let i = 0; i < p.length; i += 9) {
              for (const arr of [p, n]) for (let k = 0; k < 3; k++) [arr[i + 3 + k], arr[i + 6 + k]] = [arr[i + 6 + k], arr[i + 3 + k]];
              const j = (i / 9) * 6;
              for (let k = 0; k < 2; k++) [u[j + 2 + k], u[j + 4 + k]] = [u[j + 4 + k], u[j + 2 + k]];
            }
          }
          const e = groups.get(m.material) ?? { geos: [], cast: false };
          e.geos.push(g);
          e.cast ||= m.castShadow;
          groups.set(m.material, e);
          done.push(m);
        }
        for (const c of o.children) visit(c);
      };
      for (const c of root.children) visit(c);
      for (const [mat, { geos, cast }] of groups) {
        const merged = mergeGeometries(geos);
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = shadows && cast;
        mesh.receiveShadow = true;
        mesh.userData.baked = true;
        root.add(mesh);
      }
      for (const m of done) m.visible = false;
    });
    return () => {
      cancelAnimationFrame(id);
      for (const c of [...root.children]) if (c.userData.baked) root.remove(c);
    };
  }, [shadows]);
  return <group ref={ref}>{children}</group>;
}
