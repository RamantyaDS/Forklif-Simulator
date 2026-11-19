// The job's load. Resting, it stands at its world pose; on the forks it follows the carriage (heel frame from
// Forklift.tsx) with the offset and yaw the simulation keeps. Models are built from simple parts and baked into one
// mesh per material: the genset (Genset Simulator model), a steel coil, a pipe bundle, sawn timber, cement pallets,
// a power transformer and an empty 20 ft container. Origin: bottom centre, x along the load's length.
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CARGOS } from '../sim/cargo';
import { SPEC } from '../sim/spec';
import { LOAD } from '../sim/world';
import { fk, useUI } from '../store';
import { carriage } from './Forklift';
import { Bake } from './Bake';
import { Genset } from './genset/Genset';
import { Box, Cyl, useCanvasTexture } from './parts';
import { weather } from './weather';

const L = {
  coilSteel: weather(new THREE.MeshStandardMaterial({ color: '#8d969c', metalness: 0.85, roughness: 0.32 }), { dirt: 0.12, mudBelow: -9, chips: 0, rust: 0.12, scale: 2.5 }),
  coilEdge: new THREE.MeshStandardMaterial({ color: '#4c5257', metalness: 0.8, roughness: 0.45 }),
  strap: new THREE.MeshStandardMaterial({ color: '#2b5f9e', metalness: 0.6, roughness: 0.4 }),
  pipe: weather(new THREE.MeshStandardMaterial({ color: '#2a2b2d', metalness: 0.6, roughness: 0.5 }), { dirt: 0.25, mudBelow: -9, chips: 0, rust: 0.45, scale: 1.4 }),
  pipeEnd: new THREE.MeshStandardMaterial({ color: '#b35a1f', metalness: 0.2, roughness: 0.6 }),
  pipeIn: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9, side: THREE.BackSide }),
  wood: weather(new THREE.MeshStandardMaterial({ color: '#a77c4f', roughness: 0.85 }), { dirt: 0.25, mudBelow: 0.4, mud: 0.5, chips: 0, scale: 3, dirtColor: '#5a4026' }),
  woodEnd: new THREE.MeshStandardMaterial({ color: '#c99a66', roughness: 0.9 }),
  pallet: weather(new THREE.MeshStandardMaterial({ color: '#9a7a52', roughness: 0.9 }), { dirt: 0.35, mudBelow: 0.3, mud: 0.6, chips: 0, scale: 4, dirtColor: '#4a3a28' }),
  wrap: new THREE.MeshStandardMaterial({ color: '#e8edf0', roughness: 0.15, metalness: 0, transparent: true, opacity: 0.35, depthWrite: false }),
  trafo: weather(new THREE.MeshStandardMaterial({ color: '#8e979c', metalness: 0.35, roughness: 0.45 }), { dirt: 0.12, mudBelow: 0.6, mud: 0.4, chips: 0.08, scale: 1.5 }),
  fin: new THREE.MeshStandardMaterial({ color: '#868f94', metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide }),
  porcelain: new THREE.MeshStandardMaterial({ color: '#6b3a24', metalness: 0.1, roughness: 0.25 }),
  copper: new THREE.MeshStandardMaterial({ color: '#c47a45', metalness: 0.9, roughness: 0.3 }),
  skid: new THREE.MeshStandardMaterial({ color: '#2b2d2f', metalness: 0.5, roughness: 0.55 }),
  container: weather(new THREE.MeshStandardMaterial({ color: '#2f6e4a', metalness: 0.35, roughness: 0.5 }), { dirt: 0.2, mudBelow: 0.7, mud: 0.4, chips: 0.25, rust: 0.4, scale: 1.2, dirtColor: '#5a4632' }),
  dark: new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.8 }),
};

/** Centre-of-gravity symbol (quartered disc), as painted on heavy lifted equipment. */
function useCgTexture() {
  return useCanvasTexture(64, 64, (g) => {
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
  });
}
function CgMarks({ x, y, hz }: { x: number; y: number; hz: number }) {
  const tex = useCgTexture();
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[x, y, s * (hz + 0.003)]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
          <circleGeometry args={[0.13, 24]} />
          <meshStandardMaterial map={tex} roughness={0.6} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
    </group>
  );
}

function Coil() {
  const d = CARGOS.coil;
  const R = d.h / 2;
  const len = d.hx * 2;
  const ends = useMemo(() => new THREE.RingGeometry(0.32, R, 48), [R]);
  return (
    <group>
      <Bake>
        <Cyl r={R} l={len - 0.02} axis="x" seg={48} m={L.coilSteel} position={[0, R, 0]} open />
        <Cyl r={0.32} l={len} axis="x" seg={32} m={L.pipeIn} position={[0, R, 0]} open />
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={ends} material={L.coilEdge} position={[(s * len) / 2 - s * 0.01, R, 0]} rotation={[0, (s * Math.PI) / 2, 0]} castShadow receiveShadow />
        ))}
        {/* circumferential bands and the eye bands */}
        {[-0.45, 0.45].map((x) => (
          <Cyl key={x} r={R + 0.008} l={0.035} axis="x" seg={48} m={L.strap} position={[x, R, 0]} open />
        ))}
      </Bake>
      <Text position={[len / 2 + 0.01, R + 0.62, 0]} rotation={[0, Math.PI / 2, 0]} fontSize={0.09} color="#f2f2f2">
        HRC 12.0×1850 · 16.020 kg
      </Text>
    </group>
  );
}

function Pipes() {
  const d = CARGOS.pipes;
  const r = 0.135;
  const rows = [5, 4, 3];
  const pts: [number, number][] = [];
  rows.forEach((n, row) => {
    for (let i = 0; i < n; i++) pts.push([(i - (n - 1) / 2) * r * 2, r + row * r * 1.74]);
  });
  return (
    <Bake>
      {pts.map(([z, y], i) => (
        <group key={i} position={[((i * 37) % 7) * 0.012, y, z]}>
          <Cyl r={r} l={d.hx * 2} axis="x" seg={16} m={L.pipe} open />
          <Cyl r={r - 0.012} l={d.hx * 2} axis="x" seg={16} m={L.pipeIn} open />
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * d.hx, 0, 0]} rotation={[0, (s * Math.PI) / 2, 0]} material={L.pipeEnd}>
              <ringGeometry args={[r - 0.012, r, 16]} />
            </mesh>
          ))}
        </group>
      ))}
      {[-2.2, -0.75, 0.75, 2.2].map((x) => (
        <group key={x}>
          <Box s={[0.035, 0.012, 1.42]} m={L.strap} position={[x, d.h + 0.01, 0]} />
          {[-1, 1].map((s) => (
            <Box key={s} s={[0.035, d.h, 0.012]} m={L.strap} position={[x, d.h / 2, s * 0.71]} />
          ))}
        </group>
      ))}
    </Bake>
  );
}

function Timber() {
  const d = CARGOS.timber;
  const layers = 6;
  const per = 8;
  const t = (d.h - 0.05) / layers;
  const w = (d.hz * 2) / per;
  return (
    <Bake>
      {Array.from({ length: layers }, (_, j) =>
        Array.from({ length: per }, (_, i) => (
          <group key={`${j}-${i}`} position={[((i * 13 + j * 7) % 5) * 0.012 - 0.024, t / 2 + j * t, -d.hz + w / 2 + i * w]}>
            <Box s={[d.hx * 2, t - 0.008, w - 0.01]} m={L.wood} />
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * (d.hx + 0.001), 0, 0]} rotation={[0, (s * Math.PI) / 2, 0]} material={L.woodEnd}>
                <planeGeometry args={[w - 0.01, t - 0.008]} />
              </mesh>
            ))}
          </group>
        )),
      )}
      {[-1.6, 0, 1.6].map((x) => (
        <group key={x}>
          <Box s={[0.035, 0.01, d.hz * 2 + 0.02]} m={L.strap} position={[x, d.h - 0.04, 0]} />
          {[-1, 1].map((s) => (
            <Box key={s} s={[0.035, d.h - 0.05, 0.01]} m={L.strap} position={[x, d.h / 2 - 0.02, s * (d.hz + 0.006)]} />
          ))}
        </group>
      ))}
    </Bake>
  );
}

function Cement() {
  const d = CARGOS.cement;
  const bag = useCanvasTexture(128, 64, (g) => {
    g.fillStyle = '#e9e4d8';
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#c0322b';
    g.fillRect(0, 24, 128, 16);
    g.fillStyle = '#fff';
    g.font = 'bold 13px Arial';
    g.fillText('SEMEN 50 kg', 22, 37);
    g.strokeStyle = 'rgba(0,0,0,0.15)';
    g.strokeRect(1, 1, 126, 62);
  });
  const bagMat = useMemo(() => new THREE.MeshStandardMaterial({ map: bag, roughness: 0.9 }), [bag]);
  return (
    <Bake>
      {[-0.5, 0.5].map((px) =>
        [-0.5, 0.5].map((pz) => (
          <group key={`${px}${pz}`} position={[px, 0, pz]}>
            {/* pallet: top boards, three stringer blocks, bottom boards (pockets open between) */}
            {[-0.42, -0.21, 0, 0.21, 0.42].map((x) => (
              <Box key={x} s={[0.14, 0.022, 0.98]} m={L.pallet} position={[x, 0.139, 0]} />
            ))}
            {[-0.42, 0, 0.42].map((z) => (
              <Box key={z} s={[0.98, 0.1, 0.14]} m={L.pallet} position={[0, 0.078, z]} />
            ))}
            {[-0.42, 0.42].map((x) => (
              <Box key={x} s={[0.14, 0.022, 0.98]} m={L.pallet} position={[x, 0.011, 0]} />
            ))}
            {/* bags: 10 layers of 3 */}
            {Array.from({ length: 10 }, (_, j) =>
              [0, 1, 2].map((i) => (
                <Box key={`${j}${i}`} s={j % 2 ? [0.3, 0.155, 0.94] : [0.94, 0.155, 0.3]} r={0.04} m={bagMat} position={j % 2 ? [-0.32 + i * 0.32, 0.23 + j * 0.16, 0] : [0, 0.23 + j * 0.16, -0.32 + i * 0.32]} />
              )),
            )}
            <Box s={[0.985, 1.58, 0.985]} m={L.wrap} position={[0, 0.94, 0]} />
          </group>
        )),
      )}
      <group userData={{ noBake: true }}>
        <CgMarks x={d.cg.x} y={0.6} hz={d.hz} />
      </group>
    </Bake>
  );
}

function Trafo() {
  const d = CARGOS.trafo;
  const W = d.hx * 2;
  return (
    <group>
      <Bake>
        {/* skid base and the tank */}
        {[-0.85, 0.85].map((z) => (
          <Box key={z} s={[W, 0.22, 0.28]} m={L.skid} position={[0, 0.11, z]} />
        ))}
        <Box s={[W - 0.1, 0.12, d.hz * 2 - 0.1]} m={L.skid} position={[0, 0.28, 0]} />
        <Box s={[W - 0.5, 1.9, 1.5]} r={0.04} m={L.trafo} position={[0, 1.29, 0]} />
        <Box s={[W - 0.4, 0.1, 1.6]} m={L.trafo} position={[0, 2.29, 0]} />
        {/* radiator banks on both long sides */}
        {[-1, 1].map((s) =>
          Array.from({ length: 12 }, (_, i) => (
            <Box key={`${s}${i}`} s={[0.03, 1.6, 0.36]} m={L.fin} position={[-1.45 + i * 0.25, 1.25, s * 0.95]} />
          )),
        )}
        {[-1, 1].map((s) => (
          <group key={s}>
            <Cyl r={0.05} l={2.9} axis="x" m={L.trafo} position={[0, 2.08, s * 0.95]} />
            <Cyl r={0.05} l={2.9} axis="x" m={L.trafo} position={[0, 0.45, s * 0.95]} />
          </group>
        ))}
        {/* conservator tank, HV and LV bushings, tap changer box */}
        <Cyl r={0.24} l={1.5} axis="x" m={L.trafo} position={[-0.4, 2.62, -0.45]} />
        {[-0.9, -0.4, 0.1].map((x) => (
          <group key={x} position={[x, 2.34, 0.35]}>
            {Array.from({ length: 6 }, (_, k) => (
              <Cyl key={k} r={0.1} r2={0.1} l={0.05} m={L.porcelain} position={[0, 0.06 + k * 0.08, 0]} seg={14} />
            ))}
            <Cyl r={0.06} l={0.5} m={L.porcelain} position={[0, 0.25, 0]} seg={12} />
            <Cyl r={0.03} l={0.12} m={L.copper} position={[0, 0.55, 0]} seg={8} />
          </group>
        ))}
        {[-0.9, -0.5, -0.1, 0.3].map((x) => (
          <Cyl key={x} r={0.05} l={0.28} m={L.porcelain} position={[x + 0.2, 2.48, -0.05]} seg={10} />
        ))}
        <Box s={[0.55, 0.9, 0.4]} r={0.03} m={L.trafo} position={[1.45, 1.4, 0]} />
        <Box s={[0.3, 0.3, 0.06]} m={L.dark} position={[0, 1.6, -0.78]} />
      </Bake>
      <Text position={[0, 1.6, -0.815]} rotation={[0, Math.PI, 0]} fontSize={0.05} color="#f0f0f0" maxWidth={0.28}>
        TRAFO 20 MVA 150/20 kV · 21.500 kg
      </Text>
      <CgMarks x={d.cg.x} y={0.5} hz={0.77} />
    </group>
  );
}

function Container() {
  const d = CARGOS.container;
  const side = useCanvasTexture(512, 128, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 64; i++) {
      g.fillStyle = i % 2 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.12)';
      g.fillRect(i * 8, 0, 4, 128);
    }
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, 0, 512, 5);
    g.fillRect(0, 123, 512, 5);
  });
  const sideMat = useMemo(() => weather(new THREE.MeshStandardMaterial({ map: side, color: '#2f6e4a', metalness: 0.35, roughness: 0.5 }), { dirt: 0.2, mudBelow: 0.7, mud: 0.4, chips: 0.25, rust: 0.4, scale: 1.2, dirtColor: '#5a4632' }), [side]);
  const len = d.hx * 2;
  const wid = d.hz * 2;
  return (
    <group>
      <Bake>
        {/* corrugated sides, roof, the end walls, corner posts and rails */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0, d.h / 2, s * (wid / 2)]} rotation={[0, s > 0 ? 0 : Math.PI, 0]} material={sideMat}>
            <planeGeometry args={[len - 0.2, d.h - 0.25]} />
          </mesh>
        ))}
        <Box s={[len - 0.1, 0.06, wid - 0.1]} m={L.container} position={[0, d.h - 0.04, 0]} />
        {[-1, 1].map((s) => (
          <Box key={s} s={[0.06, d.h - 0.2, wid - 0.1]} m={L.container} position={[s * (len / 2 - 0.05), d.h / 2, 0]} />
        ))}
        {[-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <group key={`${sx}${sz}`}>
              <Box s={[0.16, d.h, 0.16]} m={L.container} position={[sx * (len / 2 - 0.08), d.h / 2, sz * (wid / 2 - 0.08)]} />
              {/* corner castings */}
              {[0.06, d.h - 0.06].map((y) => (
                <Box key={y} s={[0.18, 0.12, 0.18]} m={L.skid} position={[sx * (len / 2 - 0.08), y, sz * (wid / 2 - 0.08)]} />
              ))}
            </group>
          )),
        )}
        {[-1, 1].map((s) => (
          <group key={s}>
            <Box s={[len, 0.16, 0.1]} m={L.container} position={[0, 0.2, s * (wid / 2 - 0.05)]} />
            <Box s={[len, 0.1, 0.1]} m={L.container} position={[0, d.h - 0.1, s * (wid / 2 - 0.05)]} />
            {/* fork pockets: dark openings in the bottom side rails */}
            {[-1, 1].map((k) => (
              <Box key={k} s={[d.pockets!.w, 0.11, 0.02]} m={L.dark} position={[k * d.pockets!.c, 0.07, s * (wid / 2 + 0.002)]} />
            ))}
          </group>
        ))}
        {/* door end: locking bars */}
        {[-0.85, -0.35, 0.35, 0.85].map((z) => (
          <Cyl key={z} r={0.022} l={d.h - 0.3} m={L.skid} position={[len / 2 + 0.01, d.h / 2, z]} seg={8} />
        ))}
      </Bake>
      {[-1, 1].map((s) => (
        <Text key={s} position={[len / 2 - 1.0, d.h - 0.45, s * (wid / 2 + 0.01)]} rotation={[0, s > 0 ? 0 : Math.PI, 0]} fontSize={0.2} color="#f2f2f2" anchorX="right">
          TNLU 204518 3 · 22G1
        </Text>
      ))}
    </group>
  );
}

export function LoadModel({ id }: { id: string }) {
  if (id === 'coil') return <Coil />;
  if (id === 'pipes') return <Pipes />;
  if (id === 'timber') return <Timber />;
  if (id === 'cement') return <Cement />;
  if (id === 'trafo') return <Trafo />;
  if (id === 'container') return <Container />;
  return (
    <Bake>
      <Genset />
      <group userData={{ noBake: true }}>
        <CgMarks x={CARGOS.genset.cg.x} y={0.17} hz={1.099} />
      </group>
    </Bake>
  );
}

export function Cargo() {
  useUI((s) => s.jobVersion);
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
      local.compose(p.set(c.lx, SPEC.forkT - LOAD.lift0, c.a), q.setFromEuler(e.set(0, c.yawRel, 0)), one);
      g.matrix.multiplyMatrices(carriage.obj.matrixWorld, local);
    } else {
      // fallen: lift the low side out of the ground a little
      const lean = Math.max(Math.abs(c.pitch), Math.abs(c.roll));
      p.set(c.x, c.y + Math.sin(lean) * LOAD.hz, c.z);
      g.matrix.compose(p, q.setFromEuler(e.set(c.pitch, c.yaw, c.roll, 'YXZ')), one);
    }
    g.matrixWorldNeedsUpdate = true;
  });
  return (
    <group ref={ref} matrixAutoUpdate={false}>
      <LoadModel key={LOAD.id} id={LOAD.id} />
    </group>
  );
}
