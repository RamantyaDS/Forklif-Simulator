// Draw-call reduction without changing the look: after its children mount, <Bake> merges every static mesh under
// it into one mesh per material (geometry baked in place) and hides the originals. Moving parts are kept out by
// putting them outside, or under a group with userData.noBake. Text (troika) and instanced meshes are left alone.
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Materials that look the same share one draw: many parts create their own material with identical settings. */
const shared = new Map<string, THREE.Material>();
function canonical(m: THREE.Material): THREE.Material {
  const s = m as THREE.MeshStandardMaterial;
  // only plain standard/basic materials without shader patches can be swapped safely
  if (!(s.isMeshStandardMaterial || (m as THREE.MeshBasicMaterial).isMeshBasicMaterial) || m.onBeforeCompile.toString() !== THREE.Material.prototype.onBeforeCompile.toString()) return m;
  const key = [
    m.type,
    s.color?.getHex(),
    s.emissive?.getHex(),
    s.emissiveIntensity,
    s.roughness,
    s.metalness,
    s.map?.uuid,
    s.alphaMap?.uuid,
    s.normalMap?.uuid,
    s.envMapIntensity,
    m.transparent,
    m.opacity,
    m.side,
    m.alphaTest,
    m.depthWrite,
    m.polygonOffset,
    m.polygonOffsetFactor,
    s.flatShading,
    s.toneMapped,
  ].join('|');
  let c = shared.get(key);
  if (!c) {
    c = m;
    shared.set(key, m);
  }
  return c;
}

/** Bakes run one per frame: a scene with many of them would otherwise merge them all in one long frame. */
const jobs = new Map<number, () => void>();
let nextJob = 1;
let pumping = false;
function pump() {
  const next = jobs.entries().next();
  if (next.done) {
    pumping = false;
    return;
  }
  const [id, run] = next.value;
  jobs.delete(id);
  run();
  requestAnimationFrame(pump);
}
function queueBake(run: () => void) {
  const id = nextJob++;
  jobs.set(id, run);
  if (!pumping) {
    pumping = true;
    requestAnimationFrame(pump);
  }
  return id;
}

export function Bake({ children, shadows = true }: { children: ReactNode; shadows?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const root = ref.current!;
    // a frame later (in turn with the other bakes), so drei helpers (RoundedBox, extrusions) have their final geometry
    const id = queueBake(() => {
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
          const mat = canonical(m.material);
          const e = groups.get(mat) ?? { geos: [], cast: false };
          e.geos.push(g);
          e.cast ||= m.castShadow;
          groups.set(mat, e);
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
      jobs.delete(id);
      for (const c of [...root.children]) if (c.userData.baked) root.remove(c);
    };
  }, [shadows]);
  return <group ref={ref}>{children}</group>;
}
