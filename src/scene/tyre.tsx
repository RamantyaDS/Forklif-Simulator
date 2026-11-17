// Realistic wheels built once per size and shared: a lathed bias-ply carcass with bulging sidewalls, a raised lug or
// rib tread, sidewall lettering, and a pressed-steel disc wheel with its bolt circle, nuts, vent holes and hub.
// Wheel axis is x; the outer face (lettering, nuts) looks toward +x (mirror with scale-x −1 for the other side).
import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M } from './parts';

export interface TyreSpec {
  R: number; // outside radius
  W: number; // section width
  rimR: number; // rim flange radius
  tread: 'lug' | 'rib';
  lugs: number; // per side (lug) or grooves (rib)
  label: string;
}

const cache = new Map<string, ReturnType<typeof buildWheel>>();

function lathe(profile: [number, number][], seg: number) {
  // profile in (radius, axial); lathe spins around y, then the axis is turned to x
  const g = new THREE.LatheGeometry(
    profile.map(([r, a]) => new THREE.Vector2(r, a)),
    seg,
  );
  g.rotateZ(-Math.PI / 2);
  return g;
}

function buildWheel(s: TyreSpec) {
  const { R, W, rimR } = s;
  const w = W / 2;
  const tread = s.tread === 'lug' ? 0.035 : 0.012;
  const crown = R - tread;
  // carcass: bead → bulging sidewall → rounded shoulder → crown, and back
  const half: [number, number][] = [
    [rimR + 0.012, -w * 0.74],
    [rimR + 0.05, -w * 0.86],
    [rimR + (crown - rimR) * 0.35, -w * 0.99],
    [rimR + (crown - rimR) * 0.62, -w * 1.0],
    [crown - 0.05, -w * 0.94],
    [crown - 0.015, -w * 0.84],
    [crown, -w * 0.7],
  ];
  const prof = [...half, ...half.slice().reverse().map(([r, a]) => [r, -a] as [number, number])];
  const parts: THREE.BufferGeometry[] = [lathe(prof, 72)];

  // tread
  const n = s.lugs;
  if (s.tread === 'lug') {
    // industrial bias lug: angled bars from each shoulder toward the centre, the two sides staggered
    for (const side of [-1, 1])
      for (let i = 0; i < n; i++) {
        const a = ((i + (side > 0 ? 0.5 : 0)) / n) * Math.PI * 2;
        const len = w * 0.95;
        const bar = new THREE.BoxGeometry(len, tread * 2, 0.085);
        // angle the bar across the tread, then place it on the crown
        bar.rotateY(side * 0.42);
        bar.translate(side * (w * 0.88 - len / 2 + 0.02), crown, 0);
        bar.rotateX(a);
        parts.push(bar);
        // shoulder block running down the sidewall a little
        const sh = new THREE.BoxGeometry(0.05, 0.09, 0.09);
        sh.translate(side * w * 0.93, crown - 0.04, 0);
        sh.rotateX(a);
        parts.push(sh);
      }
  } else {
    // highway rib tread: continuous ribs separated by grooves
    for (const off of [-0.66, -0.22, 0.22, 0.66]) {
      const rib = new THREE.TorusGeometry(crown + tread / 2, tread, 4, 72);
      rib.rotateY(Math.PI / 2);
      rib.scale(1, 1, 1);
      const sx = new THREE.Matrix4().makeScale(1, 1, 1);
      rib.applyMatrix4(sx);
      rib.translate(off * w, 0, 0);
      parts.push(rib);
    }
  }
  const tyre = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map(stripUv))!;
  tyre.computeVertexNormals();

  // pressed-steel disc wheel: barrel, flanges, dished disc, hub
  const rim = mergeGeometries(
    [
      lathe(
        [
          [rimR + 0.03, -w * 0.78],
          [rimR, -w * 0.74],
          [rimR - 0.03, -w * 0.7],
          [rimR - 0.03, w * 0.7],
          [rimR, w * 0.74],
          [rimR + 0.03, w * 0.78],
        ],
        48,
      ),
      lathe(
        [
          [rimR - 0.03, w * 0.35],
          [rimR * 0.72, w * 0.42],
          [rimR * 0.48, w * 0.55],
          [rimR * 0.3, w * 0.6],
          [0.001, w * 0.6],
        ],
        40,
      ),
    ].map((g) => stripUv(g.toNonIndexed())),
  )!;
  rim.computeVertexNormals();
  // studs and nuts on the bolt circle, vent holes in the dish
  const nuts: THREE.BufferGeometry[] = [];
  const holes: THREE.BufferGeometry[] = [];
  const bolts = 10;
  for (let i = 0; i < bolts; i++) {
    const a = (i / bolts) * Math.PI * 2;
    const r = rimR * 0.38;
    const nut = new THREE.CylinderGeometry(0.026, 0.026, 0.05, 6);
    nut.rotateZ(Math.PI / 2);
    nut.translate(w * 0.62, Math.cos(a) * r, Math.sin(a) * r);
    nuts.push(stripUv(nut.toNonIndexed()));
    const hole = new THREE.CircleGeometry(0.045, 16);
    hole.rotateY(Math.PI / 2);
    const b = a + Math.PI / bolts;
    hole.translate(w * 0.47, Math.cos(b) * rimR * 0.62, Math.sin(b) * rimR * 0.62);
    holes.push(stripUv(hole.toNonIndexed()));
  }
  const hub = new THREE.CylinderGeometry(rimR * 0.22, rimR * 0.26, 0.09, 24);
  hub.rotateZ(Math.PI / 2);
  hub.translate(w * 0.66, 0, 0);
  nuts.push(stripUv(hub.toNonIndexed()));
  return { tyre, rim, nuts: mergeGeometries(nuts)!, holes: mergeGeometries(holes)! };
}

function stripUv(g: THREE.BufferGeometry) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  return g;
}

export function useWheelGeo(s: TyreSpec) {
  const key = JSON.stringify(s);
  return useMemo(() => {
    if (!cache.has(key)) cache.set(key, buildWheel(s));
    return cache.get(key)!;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Sidewall lettering: a transparent disc texture with the size and ply rating written around the circle. */
function useLabel(text: string) {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d')!;
    g.translate(256, 256);
    g.fillStyle = 'rgba(70,70,70,0.9)';
    g.font = 'bold 34px sans-serif';
    g.textAlign = 'center';
    for (const [start, t] of [
      [-Math.PI / 2, text],
      [Math.PI / 2, 'INDUSTRIAL · TUBE TYPE'],
    ] as [number, string][]) {
      const step = 0.075;
      for (let i = 0; i < t.length; i++) {
        g.save();
        g.rotate(start + (i - t.length / 2) * step + Math.PI / 2);
        g.fillText(t[i], 0, -205);
        g.restore();
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [text]);
}

const RUBBER = new THREE.MeshStandardMaterial({ color: '#1c1c1d', roughness: 0.93, metalness: 0 });
const HOLE = new THREE.MeshBasicMaterial({ color: '#050505' });

/** One wheel. `side` +1 shows the outer face toward +x, −1 toward −x. */
export function Wheel({ spec, rim = M.rimPaint, side = 1 }: { spec: TyreSpec; rim?: THREE.Material; side?: 1 | -1 }) {
  const g = useWheelGeo(spec);
  const label = useLabel(spec.label);
  return (
    <group scale={[side, 1, 1]}>
      <mesh geometry={g.tyre} material={RUBBER} castShadow receiveShadow />
      <mesh geometry={g.rim} material={rim} castShadow />
      <mesh geometry={g.nuts} material={M.steel} />
      <mesh geometry={g.holes} material={HOLE} />
      <mesh position={[spec.W / 2 + 0.003, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[spec.R * 2, spec.R * 2]} />
        <meshStandardMaterial map={label} transparent depthWrite={false} roughness={0.9} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    </group>
  );
}

export const FORK_TYRE: TyreSpec = { R: 0.645, W: 0.375, rimR: 0.33, tread: 'lug', lugs: 22, label: '14.00-24  20PR' };
export const TRUCK_TYRE: TyreSpec = { R: 0.53, W: 0.29, rimR: 0.29, tread: 'rib', lugs: 4, label: '11R22.5  16PR' };
