// Procedural Toyota 4FD240 (body frame: front axle centre on the ground, +z toward the forks, +x to the driver's
// left). Dimensions from the datasheet: 3045 wide, 6315 to the fork face, guard 3460, mast lowered 3650, dual
// 14.00-24 tyres in front, single steered tyres at the back, 2440 mm forks on a hook-type positioner.
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { EDGE_INFO, carriageToBody, forkCentres } from '../sim/forklift';
import { SPEC } from '../sim/spec';
import { fk } from '../store';
import { Box, Cyl, M, Pipe, useCanvasTexture } from './parts';

type V3 = [number, number, number];
const WB = SPEC.wheelbase;
const R = SPEC.wheelR;
const BACK = -(WB + SPEC.rearOverhang);

/** The carriage frame (origin: fork heel underside, centre), shared with the cargo and the cameras. */
export const carriage: { obj: THREE.Object3D | null } = { obj: null };
/** The whole truck after tipping, for cameras and effects. */
export const truck: { obj: THREE.Object3D | null } = { obj: null };

function Tyre({ w = 0.36, tread }: { w?: number; tread: THREE.Texture }) {
  return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[R, R, w, 40, 1]} />
        <meshStandardMaterial map={tread} color="#2a2a2a" roughness={0.95} />
      </mesh>
      {/* sidewalls with the bulge of a loaded bias tyre */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * w) / 2, 0, 0]} rotation={[0, (s * Math.PI) / 2, 0]} material={M.rubber} castShadow>
          <torusGeometry args={[R - 0.11, 0.11, 10, 40]} />
        </mesh>
      ))}
      <Cyl r={R - 0.2} l={w + 0.02} axis="x" m={M.black} />
      <Cyl r={0.2} l={w + 0.06} axis="x" m={M.mast} />
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return <Cyl key={i} r={0.02} l={w + 0.08} axis="x" seg={6} m={M.steel} position={[0, Math.cos(a) * 0.15, Math.sin(a) * 0.15]} />;
      })}
    </group>
  );
}

function useTread() {
  return useCanvasTexture(
    64,
    256,
    (g) => {
      g.fillStyle = '#2b2b2b';
      g.fillRect(0, 0, 64, 256);
      g.fillStyle = '#111';
      for (let i = 0; i < 16; i++) {
        const y = i * 16;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(28, y + 6);
        g.lineTo(28, y + 12);
        g.lineTo(0, y + 6);
        g.fill();
        g.beginPath();
        g.moveTo(64, y + 8);
        g.lineTo(36, y + 14);
        g.lineTo(36, y + 20);
        g.lineTo(64, y + 14);
        g.fill();
      }
    },
    [1, 3],
  );
}

/** Counterweight with the rounded back, the TOYOTA lettering and the rear lamps. */
function Counterweight() {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    // plan outline (x across, y = −z back) of the counterweight, rounded at the corners
    const w = 1.5;
    s.moveTo(-w, 0);
    s.lineTo(-w, 1.25);
    s.quadraticCurveTo(-w, 1.75, -w + 0.5, 1.75);
    s.lineTo(w - 0.5, 1.75);
    s.quadraticCurveTo(w, 1.75, w, 1.25);
    s.lineTo(w, 0);
    s.lineTo(-w, 0);
    return s;
  }, []);
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1.45, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3 });
    g.rotateX(-Math.PI / 2);
    return g;
  }, [shape]);
  const z0 = BACK + 1.75 + 0.06;
  return (
    <group>
      <mesh geometry={geo} material={M.body} position={[0, 0.42, z0]} rotation={[0, Math.PI, 0]} castShadow receiveShadow />
      <Text position={[0, 1.42, BACK - 0.02]} rotation={[0, Math.PI, 0]} fontSize={0.3} color="#f4f4f4" letterSpacing={0.08} fontWeight={700}>
        TOYOTA
      </Text>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 1.2, 1.05, BACK + 0.02]}>
          <Box s={[0.22, 0.14, 0.05]} m={M.redLamp} />
          <Box s={[0.1, 0.14, 0.05]} m={M.amber} position={[-s * 0.17, 0, 0]} />
          <Box s={[0.14, 0.1, 0.05]} m={M.white} position={[0, -0.16, 0]} />
        </group>
      ))}
      {/* towing pin */}
      <Box s={[0.4, 0.14, 0.2]} m={M.mast} position={[0, 0.55, BACK - 0.02]} />
      <Cyl r={0.04} l={0.3} m={M.steel} position={[0, 0.62, BACK - 0.08]} />
      {/* lifting eyes */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.9, 1.92, BACK + 0.5]} rotation={[0, Math.PI / 2, 0]} material={M.mast}>
          <torusGeometry args={[0.07, 0.025, 8, 16]} />
        </mesh>
      ))}
    </group>
  );
}

function Body() {
  const louvre = useCanvasTexture(128, 64, (g) => {
    g.fillStyle = '#c47a12';
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#2a1d0a';
    for (let i = 0; i < 8; i++) g.fillRect(6, 6 + i * 7, 116, 3);
  });
  return (
    <group>
      {/* main frame and side boxes between the axles */}
      <Box s={[2.5, 0.95, WB + 0.4]} m={M.body} position={[0, 1.02, -WB / 2 + 0.05]} />
      {[-1, 1].map((s) => (
        <group key={s}>
          {/* dark green lower skirts and the step boxes (fuel tank one side, hydraulic tank the other) */}
          <Box s={[0.3, 0.55, 2.2]} m={M.cab} position={[s * 1.35, 0.72, -1.95]} />
          <Box s={[0.32, 0.08, 0.5]} m={M.steel} position={[s * 1.38, 0.47, -1.2]} />
          <Box s={[0.32, 0.08, 0.5]} m={M.steel} position={[s * 1.38, 1.0, -1.2]} />
          {/* front fenders over the duals */}
          <mesh position={[s * 1.12, R, 0]} rotation={[0, 0, Math.PI / 2]} material={M.body} castShadow>
            <cylinderGeometry args={[R + 0.12, R + 0.12, 0.82, 28, 1, true, Math.PI * 0.95, Math.PI * 1.1]} />
          </mesh>
          {/* rear fenders */}
          <mesh position={[s * 1.25, R, -WB]} rotation={[0, 0, Math.PI / 2]} material={M.body} castShadow>
            <cylinderGeometry args={[R + 0.1, R + 0.1, 0.5, 28, 1, true, Math.PI * 0.75, Math.PI * 1.5]} />
          </mesh>
          {/* tilt cylinders: frame to mast */}
          <Cyl r={0.085} l={0.7} axis="z" m={M.mast} position={[s * 0.98, 1.45, 0.18]} rotation={[0.25, 0, 0]} />
          <Cyl r={0.045} l={0.4} axis="z" m={M.chrome} position={[s * 0.98, 1.53, 0.52]} rotation={[0.25, 0, 0]} />
          {/* head and work lamps on the fender tops */}
          <group position={[s * 1.15, 1.42, 0.12]}>
            <Cyl r={0.09} l={0.12} axis="z" m={M.mast} />
            <Cyl r={0.075} l={0.02} axis="z" m={M.lamp} position={[0, 0, 0.07]} />
            <Box s={[0.08, 0.06, 0.06]} m={M.amber} position={[s * 0.14, 0, 0.03]} />
          </group>
          {/* grab handles */}
          <Pipe pts={[[s * 1.3, 1.6, -0.25], [s * 1.36, 2.2, -0.3], [s * 1.36, 2.9, -0.3]]} r={0.022} m={M.steel} />
        </group>
      ))}
      {/* engine hood behind the cab, with side louvres */}
      <Box s={[2.3, 0.7, 2.0]} r={0.05} m={M.body} position={[0, 1.82, -3.25]} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1.152, 1.82, -3.25]} rotation={[0, (s * Math.PI) / 2, 0]}>
          <planeGeometry args={[1.4, 0.5]} />
          <meshStandardMaterial map={louvre} roughness={0.6} />
        </mesh>
      ))}
      <Counterweight />
      {/* exhaust stack (right side) with its guard, cyclone air cleaner (left) */}
      <group position={[-0.88, 2.17, -3.45]}>
        <Cyl r={0.075} l={1.6} m={M.mast} position={[0, 0.8, 0]} />
        <Cyl r={0.1} l={0.9} m={M.steelDark} position={[0, 0.55, 0]} open />
        <Pipe pts={[[0, 1.55, 0], [0, 1.72, 0.03], [0.04, 1.8, 0.18]]} r={0.075} m={M.mast} />
      </group>
      <group position={[0.75, 2.17, -2.75]}>
        <Cyl r={0.2} l={0.5} m={M.mast} position={[0, 0.25, 0]} />
        <Cyl r={0.21} r2={0.12} l={0.14} m={M.mast} position={[0, 0.57, 0]} />
        <Cyl r={0.05} l={0.25} m={M.mast} position={[0, 0.75, 0]} />
        <Cyl r={0.09} l={0.06} m={M.mast} position={[0, 0.9, 0]} />
      </group>
    </group>
  );
}

function Cab() {
  const z0 = -1.85;
  const z1 = 0.05;
  const y0 = 1.5;
  const y1 = SPEC.guardH - 0.08;
  const w = 0.82;
  const posts: V3[] = [
    [w, 0, z1],
    [-w, 0, z1],
    [w, 0, z0],
    [-w, 0, z0],
  ];
  return (
    <group>
      {/* floor pod and posts */}
      <Box s={[w * 2 + 0.1, 0.12, z1 - z0 + 0.1]} m={M.cab} position={[0, y0, (z0 + z1) / 2]} />
      {posts.map(([x, , z], i) => (
        <Box key={i} s={[0.09, y1 - y0, 0.09]} m={M.cab} position={[x, (y0 + y1) / 2, z]} />
      ))}
      <Box s={[w * 2 + 0.14, 0.1, z1 - z0 + 0.16]} r={0.03} m={M.cab} position={[0, y1 + 0.03, (z0 + z1) / 2]} />
      {/* roof guard bars over the glass roof */}
      {[-0.4, 0, 0.4].map((x) => (
        <Box key={x} s={[0.05, 0.05, z1 - z0]} m={M.cab} position={[x, y1 + 0.1, (z0 + z1) / 2]} />
      ))}
      {/* glass */}
      <Box s={[w * 2, y1 - y0 - 0.3, 0.02]} m={M.glass} position={[0, (y0 + y1) / 2 + 0.1, z1]} />
      <Box s={[w * 2, y1 - y0 - 0.2, 0.02]} m={M.glass} position={[0, (y0 + y1) / 2 + 0.05, z0]} />
      {[-1, 1].map((s) => (
        <Box key={s} s={[0.02, y1 - y0 - 0.25, z1 - z0 - 0.1]} m={M.glass} position={[s * w, (y0 + y1) / 2 + 0.07, (z0 + z1) / 2]} />
      ))}
      {/* door frame on the left, the mirrors */}
      <Box s={[0.03, 0.05, z1 - z0 - 0.1]} m={M.cab} position={[w + 0.01, (y0 + y1) / 2 - 0.2, (z0 + z1) / 2]} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (w + 0.3), 2.45, 0.05]}>
          <Box s={[0.32, 0.03, 0.03]} m={M.mast} position={[-s * 0.16, 0, 0]} />
          <Box s={[0.2, 0.28, 0.04]} r={0.02} m={M.mast} position={[0, -0.05, 0]} />
        </group>
      ))}
      {/* beacon and roof work lights */}
      <Cyl r={0.08} l={0.14} m={M.amberLight} position={[0, y1 + 0.17, z0 + 0.3]} />
      {[-1, 1].map((s) => (
        <Box key={s} s={[0.16, 0.12, 0.1]} m={M.mast} position={[s * 0.6, y1 + 0.15, z1 - 0.05]} />
      ))}
      {/* inside: seat, steering column, dash and the hydraulic levers on the right */}
      <group position={[0, y0 + 0.06, -0.95]}>
        <Box s={[0.55, 0.12, 0.5]} r={0.04} m={M.seat} position={[0, 0.45, 0]} />
        <Box s={[0.55, 0.6, 0.12]} r={0.04} m={M.seat} position={[0, 0.8, -0.24]} rotation={[-0.15, 0, 0]} />
        <Box s={[0.3, 0.38, 0.3]} m={M.mast} position={[0, 0.2, 0]} />
        <Box s={[0.08, 0.06, 0.4]} m={M.seat} position={[0.32, 0.62, 0.02]} />
        <Box s={[0.08, 0.06, 0.4]} m={M.seat} position={[-0.32, 0.62, 0.02]} />
      </group>
      <group position={[0, y0 + 0.06, -0.15]}>
        <Box s={[1.2, 0.6, 0.2]} m={M.cab} position={[0, 0.3, 0.08]} />
        <Cyl r={0.05} l={0.5} m={M.mast} position={[0, 0.6, -0.18]} rotation={[-0.45, 0, 0]} />
        <SteeringWheel />
        <Box s={[0.4, 0.14, 0.05]} m={M.dash} position={[0, 0.68, -0.1]} rotation={[-0.4, 0, 0]} />
        {[0, 1, 2, 3].map((i) => (
          <group key={i} position={[-0.42 - i * 0.07, 0.62, -0.25]}>
            <Cyl r={0.012} l={0.22} m={M.steel} position={[0, 0.11, 0]} />
            <mesh position={[0, 0.24, 0]} material={i < 2 ? M.black : M.yellow}>
              <sphereGeometry args={[0.028, 10, 8]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function SteeringWheel() {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => (ref.current!.rotation.z = -fk.steer * 3.2));
  return (
    <group position={[0, 0.8, -0.42]} rotation={[-0.9, 0, 0]}>
      <group ref={ref}>
        <mesh material={M.black}>
          <torusGeometry args={[0.2, 0.018, 8, 32]} />
        </mesh>
        {[0, 2.1, 4.2].map((a) => (
          <Box key={a} s={[0.02, 0.2, 0.015]} m={M.black} position={[Math.sin(a) * 0.1, Math.cos(a) * 0.1, 0]} rotation={[0, 0, -a]} />
        ))}
        <Cyl r={0.025} l={0.06} axis="z" m={M.black} position={[0.14, -0.1, 0.02]} />
      </group>
    </group>
  );
}

/** Chain of instanced links between two points (mast top sheave to the carriage). */
function Chain({ x, z }: { x: number; z: number }) {
  const n = 46;
  const ref = useRef<THREE.InstancedMesh>(null);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const sc = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  useFrame(() => {
    // the chain runs from the carriage up over the inner mast's sheave and back down to the outer mast anchor
    const inner = fk.lift / 2;
    const top = SPEC.mastH - SPEC.pivot.y - 0.25 + inner;
    const carriageTop = fk.lift - SPEC.pivot.y + 1.05;
    const anchor = 1.1;
    const front = top - carriageTop;
    const back = top - anchor;
    const total = front + back;
    for (let i = 0; i < n; i++) {
      const d = (i / (n - 1)) * total;
      const onFront = d < front;
      p.set(x, onFront ? carriageTop + d : top - (d - front), onFront ? z + 0.05 : z - 0.07);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i % 2 ? Math.PI / 2 : 0);
      m.compose(p, q, sc);
      ref.current!.setMatrixAt(i, m);
    }
    ref.current!.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} material={M.chain} castShadow frustumCulled={false}>
      <torusGeometry args={[0.045, 0.014, 6, 10]} />
    </instancedMesh>
  );
}

/** Mast, carriage and forks, all inside the tilt pivot group. */
function Mast() {
  const tiltRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const carRef = useRef<THREE.Group>(null);
  const heelRef = useRef<THREE.Group>(null);
  const rodRef = useRef<THREE.Group>(null);
  const forkRefs = useRef<THREE.Group[]>([]);
  const zf = SPEC.loadDistance - SPEC.pivot.z; // fork face relative to the pivot
  useFrame(() => {
    tiltRef.current!.rotation.x = -fk.tilt;
    innerRef.current!.position.y = fk.lift / 2;
    carRef.current!.position.y = fk.lift - SPEC.pivot.y;
    rodRef.current!.position.y = fk.lift / 2;
    forkCentres(fk).forEach((x, i) => forkRefs.current[i] && (forkRefs.current[i].position.x = x));
    carriage.obj = heelRef.current;
  });
  const outerH = SPEC.mastH - 0.25;
  return (
    <group position={[0, SPEC.pivot.y, SPEC.pivot.z]}>
      <group ref={tiltRef}>
        {/* outer mast: two channels with the TOYOTA cross beam */}
        {[-1, 1].map((s) => (
          <group key={s}>
            <Box s={[0.12, outerH, 0.28]} m={M.mast} position={[s * 0.66, outerH / 2 - 0.5, zf - 0.32]} />
            <Box s={[0.26, outerH, 0.04]} m={M.mast} position={[s * 0.6, outerH / 2 - 0.5, zf - 0.44]} />
          </group>
        ))}
        <Box s={[1.5, 0.3, 0.3]} m={M.mast} position={[0, outerH - 0.5, zf - 0.32]} />
        <Text position={[0, outerH - 0.5, zf - 0.16]} fontSize={0.17} color="#e9e9e9" letterSpacing={0.06} fontWeight={700}>
          TOYOTA
        </Text>
        <Box s={[1.5, 0.22, 0.3]} m={M.mast} position={[0, 0.35, zf - 0.32]} />
        {/* lift cylinders behind the channels; rods rise with the inner mast */}
        {[-1, 1].map((s) => (
          <Cyl key={s} r={0.1} l={2.6} m={M.mast} position={[s * 0.3, 0.9, zf - 0.55]} />
        ))}
        <group ref={rodRef}>
          {[-1, 1].map((s) => (
            <group key={s}>
              <Cyl r={0.06} l={1.8} m={M.chrome} position={[s * 0.3, 2.65, zf - 0.55]} />
              <Box s={[0.18, 0.1, 0.18]} m={M.mast} position={[s * 0.3, 3.55, zf - 0.55]} />
            </group>
          ))}
        </group>
        {/* inner mast */}
        <group ref={innerRef}>
          {[-1, 1].map((s) => (
            <Box key={s} s={[0.11, outerH - 0.1, 0.22]} m={M.mast} position={[s * 0.5, outerH / 2 - 0.45, zf - 0.3]} />
          ))}
          <Box s={[1.1, 0.2, 0.24]} m={M.mast} position={[0, outerH - 0.45, zf - 0.3]} />
          {[-1, 1].map((s) => (
            <Cyl key={s} r={0.11} l={0.08} axis="x" m={M.steel} position={[s * 0.36, outerH - 0.3, zf - 0.22]} />
          ))}
        </group>
        <Chain x={0.36} z={zf - 0.2} />
        <Chain x={-0.36} z={zf - 0.2} />
        {/* hoses to the positioner, running over the inner mast */}
        <HoseRun zf={zf} />
        {/* carriage: plate, two hook bars of the fork positioner, load backrest */}
        <group ref={carRef}>
          <group ref={heelRef} position={[0, 0, zf]}>
            <Box s={[2.9, 0.16, 0.16]} m={M.mast} position={[0, 1.02, -0.1]} />
            <Box s={[2.9, 0.16, 0.16]} m={M.mast} position={[0, 0.25, -0.1]} />
            <Cyl r={0.05} l={2.95} axis="x" m={M.chrome} position={[0, 1.02, 0.0]} />
            <Cyl r={0.05} l={2.95} axis="x" m={M.chrome} position={[0, 0.3, 0.0]} />
            <Box s={[1.2, 0.95, 0.12]} m={M.mast} position={[0, 0.62, -0.2]} />
            {[-1, 1].map((s) => (
              <Box key={s} s={[0.12, 0.95, 0.2]} m={M.mast} position={[s * 1.4, 0.62, -0.12]} />
            ))}
            {/* backrest */}
            {[-1.3, -0.65, 0, 0.65, 1.3].map((x) => (
              <Box key={x} s={[0.06, 0.9, 0.06]} m={M.mast} position={[x, 1.5, -0.1]} />
            ))}
            <Box s={[2.7, 0.08, 0.08]} m={M.mast} position={[0, 1.95, -0.1]} />
            {/* forks: shank and blade, tapered tips */}
            {[0, 1].map((i) => (
              <group key={i} ref={(el) => el && (forkRefs.current[i] = el)}>
                <Box s={[SPEC.forkW, 1.15, SPEC.forkT]} m={M.fork} position={[0, 0.6, SPEC.forkT / 2]} />
                <Box s={[SPEC.forkW, SPEC.forkT, SPEC.forkL - 0.3]} m={M.fork} position={[0, SPEC.forkT / 2, (SPEC.forkL - 0.3) / 2]} />
                <mesh material={M.fork} position={[0, SPEC.forkT / 2, SPEC.forkL - 0.15]} castShadow>
                  <boxGeometry args={[SPEC.forkW, SPEC.forkT * 0.6, 0.3]} />
                </mesh>
                <Box s={[SPEC.forkW + 0.04, 0.12, 0.12]} m={M.fork} position={[0, 1.02, -0.02]} />
              </group>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}

function HoseRun({ zf }: { zf: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => (ref.current!.position.y = fk.lift / 2));
  return (
    <group ref={ref}>
      {[-0.15, 0.15].map((x) => (
        <Box key={x} s={[0.04, 3.1, 0.04]} m={M.black} position={[x, 1.6, zf - 0.38]} />
      ))}
    </group>
  );
}

function Wheels() {
  const tread = useTread();
  const front = useRef<THREE.Group[]>([]);
  const rear = useRef<THREE.Group[]>([]);
  const knuckle = useRef<THREE.Group[]>([]);
  const roll = useRef(0);
  useFrame((_, dt) => {
    roll.current += (fk.v / R) * Math.min(dt, 0.05);
    front.current.forEach((g) => g && (g.rotation.x = roll.current));
    rear.current.forEach((g) => g && (g.rotation.x = roll.current));
    knuckle.current.forEach((g) => g && (g.rotation.y = -fk.steer * 0.95));
  });
  return (
    <group>
      {[-1, 1].map((s) =>
        [0.95, 1.33].map((x) => (
          <group key={`${s}${x}`} position={[s * x, R, 0]} ref={(el) => el && front.current.push(el)}>
            <Tyre tread={tread} />
          </group>
        )),
      )}
      {/* rear steer axle with its centre pivot */}
      <Box s={[2.1, 0.22, 0.26]} m={M.mast} position={[0, R, -WB]} />
      <Cyl r={0.12} l={0.5} axis="z" m={M.steel} position={[0, R + 0.1, -WB]} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 1.25, R, -WB]} ref={(el) => el && knuckle.current.push(el)}>
          <group ref={(el) => el && rear.current.push(el)}>
            <Tyre tread={tread} w={0.38} />
          </group>
        </group>
      ))}
    </group>
  );
}

/** Lamps that light up with the lights switch and the reverse lamps. */
function Lights() {
  const head = useRef<THREE.SpotLight>(null);
  const work = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const target2 = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    head.current!.intensity = fk.lights ? 30 : 0;
    work.current!.intensity = fk.lights ? 22 : 0;
    M.lamp.emissiveIntensity = fk.lights ? 4 : 0.3;
    M.amberLight.emissiveIntensity = fk.engine === 'running' && Math.sin(clock.elapsedTime * 9) > 0.2 ? 6 : 0.2;
    M.redLamp.emissiveIntensity = fk.brake > 0.1 ? 3 : fk.lights ? 1 : 0.1;
  });
  return (
    <group>
      <primitive object={target} position={[0.6, 0, 10]} />
      <primitive object={target2} position={[0, 0, -16]} />
      <spotLight ref={head} position={[1.15, 1.45, 0.3]} angle={0.6} penumbra={0.6} distance={35} decay={1.6} color="#fff4e0" target={target} />
      <spotLight ref={work} position={[0, 3.5, -1.95]} angle={0.42} penumbra={0.6} distance={25} decay={1.6} color="#fff4e0" target={target2} />
    </group>
  );
}

export function ForkliftModel() {
  const pose = useRef<THREE.Group>(null);
  const tipOuter = useRef<THREE.Group>(null);
  const tipRot = useRef<THREE.Group>(null);
  const tipInner = useRef<THREE.Group>(null);
  const axis = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    pose.current!.position.set(fk.x, 0, fk.z);
    pose.current!.rotation.y = fk.heading;
    // tipping: rotate about the active edge of the stability triangle
    if (fk.tipEdge >= 0 && fk.tip > 0) {
      const e = EDGE_INFO[fk.tipEdge];
      tipOuter.current!.position.set(e.x0, 0, e.z0);
      tipInner.current!.position.set(-e.x0, 0, -e.z0);
      axis.set(0, 1, 0).cross(new THREE.Vector3(e.nx, 0, e.nz)).normalize();
      tipRot.current!.quaternion.setFromAxisAngle(axis, fk.tip);
    } else tipRot.current!.quaternion.identity();
    truck.obj = tipInner.current;
  });
  return (
    <group ref={pose}>
      <group ref={tipOuter}>
        <group ref={tipRot}>
          <group ref={tipInner}>
            <Body />
            <Cab />
            <Wheels />
            <Mast />
            <Lights />
          </group>
        </group>
      </group>
    </group>
  );
}

/** World position of a carriage-frame point (for effects that follow the forks without the scene graph). */
export function carriageWorld(lx: number, a: number, b: number, out: THREE.Vector3) {
  const p = carriageToBody(fk, lx, a, b);
  out.set(p.x, p.y, p.z);
  if (truck.obj) truck.obj.localToWorld(out);
  return out;
}
