// Pedestrian warning lights projected on the ground: a blue spot 4 m behind the counterweight when reversing (and
// ahead of the forks when driving forward), and red "halo" lines along both sides while the engine runs, the zone
// people must keep out of. Drawn as additive glowing decals in the truck's frame, so they cost almost nothing.
// Also the P2H inspection extras: visible faults (cracked fork, hydraulic oil puddle) and the clickable markers.
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { carriageToBody, forkCentres } from '../sim/forklift';
import { P2H_ITEMS } from '../sim/p2h';
import { SPEC } from '../sim/spec';
import { fk, useUI } from '../store';
import { useCanvasTexture } from './parts';

const BACK = -(SPEC.wheelbase + SPEC.rearOverhang);

export function SafetyLights() {
  const glow = useCanvasTexture(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.75)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
  const bar = useCanvasTexture(128, 16, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 16);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 16);
  });
  const blue = useMemo(() => new THREE.MeshBasicMaterial({ map: glow, color: '#2f7bff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), [glow]);
  const red = useMemo(() => new THREE.MeshBasicMaterial({ map: bar, color: '#ff2a1a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), [bar]);
  const back = useRef<THREE.Mesh>(null);
  const front = useRef<THREE.Mesh>(null);
  const sides = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const on = fk.engine === 'running' && !fk.tipped;
    const flick = 0.85 + 0.15 * Math.sin(clock.elapsedTime * 30);
    back.current!.visible = on && fk.dir === 'R';
    front.current!.visible = on && fk.dir === 'F';
    sides.current!.visible = on;
    blue.opacity = 0.9 * flick;
    red.opacity = 0.75;
  });
  return (
    <group>
      <mesh ref={back} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, BACK - 4]} material={blue}>
        <planeGeometry args={[1.3, 1.3]} />
      </mesh>
      <mesh ref={front} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 6.5]} material={blue}>
        <planeGeometry args={[1.3, 1.3]} />
      </mesh>
      <group ref={sides}>
        {[-1, 1].map((s) => (
          <mesh key={s} rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[s * 2.3, 0.03, -SPEC.wheelbase / 2]} material={red}>
            <planeGeometry args={[SPEC.wheelbase + 2.2, 0.22]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** P2H: the visible faults and a numbered marker on every inspection point. */
export function P2hProps() {
  useUI((s) => s.jobVersion);
  const open = useUI((s) => s.p2hOpen);
  useUI((s) => s.tick);
  const crack = useRef<THREE.Mesh>(null);
  const crackMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#1a0d08', side: THREE.DoubleSide }), []);
  const oil = useMemo(() => new THREE.MeshStandardMaterial({ color: '#16130f', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -3 }), []);
  useFrame(() => {
    if (!crack.current) return;
    const lx = forkCentres(fk)[0] + SPEC.forkW / 2 + 0.002;
    const p = carriageToBody(fk, lx, 0.06, 0.16);
    crack.current.position.set(p.x, p.y, p.z);
  });
  if (fk.phase !== 'p2h') return null;
  const bad = (id: string) => fk.defects.includes(id);
  return (
    <group>
      {bad('fork') && (
        <mesh ref={crack} rotation={[0, Math.PI / 2, 0.6]} material={crackMat}>
          <planeGeometry args={[0.16, 0.012]} />
        </mesh>
      )}
      {bad('leak') && (
        <mesh rotation={[-Math.PI / 2, 0, 0.4]} position={[0.15, 0.012, 0.35]} material={oil} scale={[1.4, 0.8, 1]}>
          <circleGeometry args={[0.45, 24]} />
        </mesh>
      )}
      {P2H_ITEMS.map((it, i) => {
        const a = fk.answers[it.id];
        return (
          <Html key={it.id} position={it.where} center zIndexRange={[20, 0]}>
            <button className={`p2h-dot${a ? ' ' + a : ''}${open === it.id ? ' sel' : ''}`} onClick={() => useUI.getState().set({ p2hOpen: it.id })} title={it.label}>
              {i + 1}
            </button>
          </Html>
        );
      })}
    </group>
  );
}
