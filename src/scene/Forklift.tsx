// Toyota 4FD240 (body frame: front axle centre on the ground, +z toward the forks, +x to the driver's left).
// Dimensions from the datasheet: 3045 wide, 6315 to the fork face, guard 3460, mast lowered 3650, dual 14.00-24
// tyres in front, single steered tyres at the back, 2440 mm forks. Shapes follow the Traknus photos: yellow-orange
// body with flat-topped front fenders, dark green under-cab pods, cab and roof, black mast with the TOYOTA beam,
// tall rounded counterweight, upswept exhaust with a heat guard. Panels are bevelled extrusions, not boxes.
import { RoundedBox, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { EDGE_INFO, carriageToBody, forkCentres } from '../sim/forklift';
import { SPEC } from '../sim/spec';
import { fk } from '../store';
import { Box, Cyl, M, Pipe, useCanvasTexture } from './parts';
import { FORK_TYRE, Wheel } from './tyre';

type V2 = [number, number];
const WB = SPEC.wheelbase;
const R = SPEC.wheelR;
const BACK = -(WB + SPEC.rearOverhang);

/** The carriage frame (origin: fork heel underside, centre), shared with the cargo and the cameras. */
export const carriage: { obj: THREE.Object3D | null } = { obj: null };
/** The whole truck after tipping, for cameras and effects. */
export const truck: { obj: THREE.Object3D | null } = { obj: null };

// ---------- shape helpers ----------

/** A side profile (points in body z, y) extruded across the truck, centred on x = 0, with rounded edges. */
function useSide(outline: (s: THREE.Shape) => void, width: number, bevel = 0.04) {
  return useMemo(() => {
    const s = new THREE.Shape();
    outline(s);
    const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 24 });
    g.translate(0, 0, -(width - bevel * 2) / 2);
    g.rotateY(-Math.PI / 2); // shape x → body z, extrusion → body x
    g.computeVertexNormals();
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, bevel]);
}
const poly = (s: THREE.Shape, pts: V2[]) => {
  s.moveTo(...pts[0]);
  for (const p of pts.slice(1)) s.lineTo(...p);
};

/** A plan profile (points in x, z) extruded upward: mast channels. */
function useUp(outline: (s: THREE.Shape) => void, height: number) {
  return useMemo(() => {
    const s = new THREE.Shape();
    outline(s);
    const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);
}

type MeshP = Omit<JSX.IntrinsicElements['mesh'], 'geometry' | 'material'>;
function Mesh({ geo, m, ...p }: { geo: THREE.BufferGeometry; m: THREE.Material } & MeshP) {
  return <mesh geometry={geo} material={m} castShadow receiveShadow {...p} />;
}

function RB({ s, r = 0.04, m, ...p }: { s: [number, number, number]; r?: number; m: THREE.Material } & JSX.IntrinsicElements['group']) {
  return (
    <group {...p}>
      <RoundedBox args={s} radius={Math.min(r, ...s.map((v) => v / 2 - 0.001))} smoothness={3} material={m} castShadow receiveShadow />
    </group>
  );
}

// ---------- body ----------

function FrontFender() {
  // flat top at fender height, sloped nose, an arch over the dual tyres
  const geo = useSide(
    (s) => {
      s.moveTo(-0.82, 0.62);
      s.lineTo(-0.82, 1.47);
      s.lineTo(0.42, 1.47);
      s.lineTo(0.7, 1.22);
      s.lineTo(0.7, 0.86);
      const a1 = Math.atan2(0.86 - R, 0.7);
      s.absarc(0, R, 0.76, a1, Math.PI, false);
      s.lineTo(-0.82, 0.62);
    },
    0.82,
    0.035,
  );
  return (
    <>
      {[-1, 1].map((sd) => (
        <group key={sd} position={[sd * 1.14, 0, 0]}>
          <Mesh geo={geo} m={M.body} />
          <Box s={[0.74, 0.34, 0.02]} m={M.rubber} position={[0, 0.5, -0.83]} />
        </group>
      ))}
    </>
  );
}

function Counterweight() {
  const geo = useSide(
    (s) => {
      s.moveTo(-3.12, 2.04);
      s.lineTo(-3.12, R);
      s.lineTo(-3.2, R);
      s.absarc(-WB, R, 0.75, 0, Math.PI, false);
      s.lineTo(-4.72, 0.42);
      s.lineTo(BACK + 0.12, 0.42);
      s.quadraticCurveTo(BACK - 0.04, 0.46, BACK - 0.04, 0.68);
      s.lineTo(BACK - 0.04, 1.78);
      s.quadraticCurveTo(BACK - 0.02, 2.04, BACK + 0.24, 2.04);
      s.lineTo(-3.12, 2.04);
    },
    3.0,
    0.07,
  );
  const stripes = useCanvasTexture(256, 64, (g) => {
    g.fillStyle = '#f2c21c';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#151515';
    for (let i = -2; i < 12; i++) {
      g.beginPath();
      g.moveTo(i * 32, 64);
      g.lineTo(i * 32 + 16, 64);
      g.lineTo(i * 32 + 48, 0);
      g.lineTo(i * 32 + 32, 0);
      g.fill();
    }
  });
  const z = BACK - 0.115;
  return (
    <group>
      <Mesh geo={geo} m={M.body} />
      <Text position={[0, 1.5, z]} rotation={[0, Math.PI, 0]} fontSize={0.32} color="#f6f6f2" letterSpacing={0.1} fontWeight={700}>
        TOYOTA
      </Text>
      {[-1, 1].map((sd) => (
        <group key={sd}>
          <mesh position={[sd * 1.1, 0.62, z]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[0.6, 0.16]} />
            <meshStandardMaterial map={stripes} roughness={0.6} polygonOffset polygonOffsetFactor={-2} />
          </mesh>
          <group position={[sd * 1.1, 1.05, BACK - 0.13]}>
            <RB s={[0.44, 0.2, 0.08]} r={0.03} m={M.mast} />
            <Box s={[0.16, 0.13, 0.03]} m={M.redLamp} position={[sd * 0.11, 0, -0.04]} />
            <Box s={[0.1, 0.13, 0.03]} m={M.amber} position={[-sd * 0.03, 0, -0.04]} />
            <Box s={[0.08, 0.13, 0.03]} m={M.white} position={[-sd * 0.15, 0, -0.04]} />
          </group>
          <group position={[sd * 1.15, 2.13, BACK + 0.35]}>
            <RB s={[0.18, 0.14, 0.12]} r={0.03} m={M.mast} />
            <Cyl r={0.055} l={0.02} axis="z" m={M.lens} position={[0, 0, -0.065]} />
          </group>
          <mesh position={[sd * 0.75, 2.1, BACK + 0.6]} rotation={[0, Math.PI / 2, 0]} material={M.mast}>
            <torusGeometry args={[0.075, 0.028, 8, 18]} />
          </mesh>
        </group>
      ))}
      <RB s={[0.5, 0.22, 0.2]} r={0.03} m={M.mast} position={[0, 0.58, BACK - 0.12]} />
      <Cyl r={0.045} l={0.34} m={M.steel} position={[0, 0.66, BACK - 0.17]} />
      {[1, -1].map((sd) => (
        <Text key={sd} position={[sd * 1.505, 1.55, -4.35]} rotation={[0, (sd * Math.PI) / 2, 0]} fontSize={0.2} color="#1b1b1b" fontWeight={700}>
          4FD240
        </Text>
      ))}
    </group>
  );
}

function Hood() {
  const geo = useSide(
    (s) =>
      poly(s, [
        [-1.92, 1.45],
        [-1.92, 2.12],
        [-2.06, 2.3],
        [-3.0, 2.3],
        [-3.14, 2.16],
        [-3.14, 1.45],
      ]),
    2.28,
    0.04,
  );
  const louvre = useCanvasTexture(128, 64, (g) => {
    g.fillStyle = '#d68b16';
    g.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = '#2a1b08';
      g.fillRect(8, 5 + i * 6.4, 112, 2.6);
      g.fillStyle = 'rgba(255,220,150,0.5)';
      g.fillRect(8, 7.6 + i * 6.4, 112, 0.8);
    }
  });
  return (
    <group>
      <Mesh geo={geo} m={M.body} />
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[sd * 1.142, 1.86, -2.55]} rotation={[0, (sd * Math.PI) / 2, 0]}>
          <planeGeometry args={[0.9, 0.5]} />
          <meshStandardMaterial map={louvre} roughness={0.6} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
      {/* cyclone air cleaner (left) */}
      <group position={[0.72, 2.3, -2.45]}>
        <Cyl r={0.19} l={0.55} m={M.mast} position={[0, 0.3, 0]} />
        <Cyl r={0.2} l={0.05} m={M.steel} position={[0, 0.03, 0]} />
        <Cyl r={0.2} r2={0.1} l={0.12} m={M.mast} position={[0, 0.63, 0]} />
        <Cyl r={0.05} l={0.22} m={M.mast} position={[0, 0.78, 0]} />
        <Cyl r={0.13} r2={0.04} l={0.1} m={M.mast} position={[0, 0.94, 0]} />
      </group>
      <ExhaustStack />
    </group>
  );
}

/** Upswept exhaust at the right rear corner: pipe, perforated heat guard, curved outlet. */
function ExhaustStack() {
  const guard = useCanvasTexture(
    64,
    64,
    (g) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#000000';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) g.fillRect(x * 8 + 2 + (y % 2) * 4, y * 8 + 2, 3.5, 3.5);
    },
    [6, 6],
  );
  const pipe = useMemo(() => new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.45, 0), new THREE.Vector3(0.02, 1.62, 0.05), new THREE.Vector3(0.1, 1.72, 0.2)]), []);
  return (
    <group position={[-0.9, 2.3, -3.0]}>
      <mesh material={M.pipe} castShadow>
        <tubeGeometry args={[pipe, 40, 0.075, 14, false]} />
      </mesh>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.11, 0.85, 20, 1, true]} />
        <meshStandardMaterial color="#2b2d30" metalness={0.7} roughness={0.45} alphaMap={guard} alphaTest={0.5} side={THREE.DoubleSide} />
      </mesh>
      <Cyl r={0.12} l={0.04} m={M.mast} position={[0, 0.18, 0]} />
      <Cyl r={0.12} l={0.04} m={M.mast} position={[0, 1.03, 0]} />
    </group>
  );
}

function Frame() {
  return (
    <group>
      {/* centre frame between the fenders and up to the counterweight */}
      <RB s={[1.5, 1.0, 3.65]} r={0.05} m={M.body} position={[0, 0.96, -1.38]} />
      <RB s={[1.5, 0.18, 0.5]} r={0.03} m={M.mast} position={[0, 0.72, 0.42]} />
      {/* dark green pods under the cab: fuel tank (left), hydraulic tank (right) */}
      {[-1, 1].map((sd) => (
        <group key={sd}>
          <RB s={[0.68, 0.82, 2.25]} r={0.05} m={M.cab} position={[sd * 1.12, 1.02, -1.98]} />
          <Cyl r={0.06} l={0.06} axis="x" m={M.mast} position={[sd * 1.47, 1.3, -2.6]} />
        </group>
      ))}
      {/* entry steps and grab rails on the left */}
      {[0.62, 1.0].map((y) => (
        <Box key={y} s={[0.2, 0.04, 0.5]} m={M.checker} position={[1.48, y, -1.2]} />
      ))}
      <Pipe pts={[[1.47, 1.55, -0.95], [1.5, 2.2, -0.95], [1.5, 2.95, -0.95]]} r={0.022} m={M.steel} />
      <Pipe pts={[[1.47, 1.55, -1.5], [1.5, 2.2, -1.55], [1.5, 2.6, -1.55]]} r={0.022} m={M.steel} />
      {/* head lamps and indicators on the fender tops */}
      {[-1, 1].map((sd) => (
        <group key={sd} position={[sd * 1.14, 1.58, 0.3]}>
          <RB s={[0.26, 0.2, 0.18]} r={0.04} m={M.mast} />
          <Cyl r={0.075} l={0.03} axis="z" m={M.chrome} position={[0, 0, 0.09]} />
          <Cyl r={0.06} l={0.02} axis="z" m={M.lens} position={[0, 0, 0.1]} />
          <Box s={[0.07, 0.06, 0.03]} m={M.amber} position={[sd * 0.17, 0.02, 0.06]} />
        </group>
      ))}
      <Counterweight />
      <Hood />
      <FrontFender />
    </group>
  );
}

// ---------- cab ----------

function Cab() {
  const z0 = -1.88;
  const z1 = 0.08;
  const y0 = 1.47;
  const y1 = SPEC.guardH - 0.1;
  const w = 0.86;
  const zc = (z0 + z1) / 2;
  const post = (x: number, z: number) => <RB key={`${x}${z}`} s={[0.085, y1 - y0, 0.085]} r={0.025} m={M.cab} position={[x, (y0 + y1) / 2, z]} />;
  return (
    <group>
      <RB s={[w * 2 + 0.1, 0.12, z1 - z0 + 0.1]} r={0.03} m={M.cab} position={[0, y0, zc]} />
      {post(w, z1 - 0.05)}
      {post(-w, z1 - 0.05)}
      {post(w, z0)}
      {post(-w, z0)}
      {post(w, zc - 0.25)}
      {/* roof with guard bars */}
      <RB s={[w * 2 + 0.2, 0.1, z1 - z0 + 0.24]} r={0.04} m={M.cab} position={[0, y1 + 0.04, zc]} />
      {[-0.5, 0, 0.5].map((x) => (
        <RB key={x} s={[0.05, 0.05, z1 - z0]} r={0.015} m={M.cab} position={[x, y1 + 0.12, zc]} />
      ))}
      {/* glass: front with a wiper, sides (the left one is the door), rear */}
      <Box s={[w * 2 - 0.06, y1 - y0 - 0.32, 0.015]} m={M.glass} position={[0, (y0 + y1) / 2 + 0.12, z1 - 0.04]} />
      <Box s={[0.015, 0.62, 0.02]} m={M.black} position={[0.25, 2.25, z1 - 0.02]} rotation={[0, 0, 0.6]} />
      <Box s={[w * 2 - 0.06, y1 - y0 - 0.26, 0.015]} m={M.glass} position={[0, (y0 + y1) / 2 + 0.08, z0]} />
      {[-1, 1].map((sd) => (
        <group key={sd}>
          <Box s={[0.015, y1 - y0 - 0.22, z1 - z0 - 0.1]} m={M.glass} position={[sd * w, (y0 + y1) / 2 + 0.06, zc]} />
          <Box s={[0.02, 0.45, z1 - z0 - 0.1]} m={M.cab} position={[sd * (w + 0.005), y0 + 0.28, zc]} />
        </group>
      ))}
      <Box s={[0.03, 0.04, 0.16]} m={M.chrome} position={[w + 0.02, 2.15, -1.45]} />
      {[1.9, 2.9].map((y) => (
        <Box key={y} s={[0.04, 0.09, 0.05]} m={M.mast} position={[w + 0.02, y, -0.35]} />
      ))}
      {/* mirrors on arms */}
      {[-1, 1].map((sd) => (
        <group key={sd} position={[sd * (w + 0.36), 2.55, z1 + 0.05]}>
          <Cyl r={0.015} l={0.4} axis="x" m={M.mast} position={[-sd * 0.2, 0, 0]} />
          <RB s={[0.22, 0.3, 0.05]} r={0.02} m={M.mast} />
          <Box s={[0.19, 0.27, 0.005]} m={M.chrome} position={[0, 0, -0.028]} />
        </group>
      ))}
      {/* beacon, work lights, antenna */}
      <group position={[0, y1 + 0.17, z0 + 0.35]}>
        <Cyl r={0.09} l={0.04} m={M.mast} />
        <Cyl r={0.07} r2={0.08} l={0.14} m={M.amberLight} position={[0, 0.09, 0]} />
      </group>
      {[-1, 1].map((sd) => (
        <group key={sd} position={[sd * 0.62, y1 + 0.17, z1 - 0.06]}>
          <RB s={[0.17, 0.13, 0.11]} r={0.03} m={M.mast} />
          <Cyl r={0.05} l={0.02} axis="z" m={M.lens} position={[0, 0, 0.06]} />
        </group>
      ))}
      <Cyl r={0.006} l={0.5} m={M.black} position={[-0.75, y1 + 0.35, z0 + 0.1]} />
      {/* inside: seat, dash, steering, levers, pedals */}
      <group position={[0, y0 + 0.06, -1.0]}>
        <RB s={[0.56, 0.14, 0.52]} r={0.05} m={M.seat} position={[0, 0.47, 0]} />
        <RB s={[0.56, 0.66, 0.13]} r={0.05} m={M.seat} position={[0, 0.84, -0.25]} rotation={[-0.14, 0, 0]} />
        <RB s={[0.3, 0.2, 0.08]} r={0.03} m={M.seat} position={[0, 1.25, -0.3]} />
        <Box s={[0.34, 0.38, 0.34]} m={M.mast} position={[0, 0.2, 0]} />
        {[-1, 1].map((sd) => (
          <RB key={sd} s={[0.08, 0.07, 0.42]} r={0.02} m={M.seat} position={[sd * 0.33, 0.66, 0.03]} />
        ))}
      </group>
      <group position={[0, y0 + 0.06, -0.15]}>
        <RB s={[1.3, 0.55, 0.24]} r={0.04} m={M.cab} position={[0, 0.27, 0.07]} />
        <Cyl r={0.05} l={0.5} m={M.mast} position={[0, 0.6, -0.18]} rotation={[-0.45, 0, 0]} />
        <SteeringWheel />
        <Box s={[0.42, 0.15, 0.05]} m={M.dash} position={[0, 0.66, -0.1]} rotation={[-0.4, 0, 0]} />
        {[0, 1, 2, 3].map((i) => (
          <group key={i} position={[-0.42 - i * 0.07, 0.6, -0.27]}>
            <Cyl r={0.012} l={0.22} m={M.steel} position={[0, 0.11, 0]} />
            <mesh position={[0, 0.24, 0]} material={i < 2 ? M.black : M.yellow}>
              <sphereGeometry args={[0.028, 10, 8]} />
            </mesh>
          </group>
        ))}
        {[-0.2, 0.05, 0.25].map((x) => (
          <Box key={x} s={[0.1, 0.03, 0.16]} m={M.checker} position={[x, 0.12, 0.05]} rotation={[-0.6, 0, 0]} />
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
          <torusGeometry args={[0.2, 0.02, 10, 36]} />
        </mesh>
        {[0, 2.1, 4.2].map((a) => (
          <Box key={a} s={[0.022, 0.2, 0.016]} m={M.black} position={[Math.sin(a) * 0.1, Math.cos(a) * 0.1, 0]} rotation={[0, 0, -a]} />
        ))}
        <Cyl r={0.05} l={0.05} axis="z" m={M.black} />
        <Cyl r={0.025} l={0.06} axis="z" m={M.black} position={[0.14, -0.1, 0.02]} />
      </group>
    </group>
  );
}

// ---------- mast ----------

/** I-section mast channel (flanges front and back), extruded up. */
function useChannel(w: number, d: number, h: number) {
  return useUp((s) => {
    const tf = 0.035;
    const tw = 0.03;
    poly(s, [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, -d / 2 + tf],
      [tw / 2, -d / 2 + tf],
      [tw / 2, d / 2 - tf],
      [w / 2, d / 2 - tf],
      [w / 2, d / 2],
      [-w / 2, d / 2],
      [-w / 2, d / 2 - tf],
      [-tw / 2, d / 2 - tf],
      [-tw / 2, -d / 2 + tf],
      [-w / 2, -d / 2 + tf],
    ]);
  }, h);
}

/** Fork: an L-shaped forging with a rounded heel and a tapered blade, extruded to the fork width. */
function useFork() {
  return useSide(
    (s) => {
      const T = SPEC.forkT;
      const L = SPEC.forkL;
      s.moveTo(0, 1.15);
      s.lineTo(T, 1.15);
      s.lineTo(T, T + 0.08);
      s.quadraticCurveTo(T, T, T + 0.08, T);
      s.lineTo(L - 0.45, T);
      s.lineTo(L - 0.02, 0.03);
      s.lineTo(L, 0.012);
      s.lineTo(L, 0);
      s.lineTo(0.08, 0);
      s.quadraticCurveTo(0, 0, 0, 0.08);
      s.lineTo(0, 1.15);
    },
    SPEC.forkW,
    0.012,
  );
}

function Chain({ x, z }: { x: number; z: number }) {
  const n = 46;
  const ref = useRef<THREE.InstancedMesh>(null);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const sc = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame(() => {
    // from the carriage up over the inner mast's sheave and back down to the outer mast anchor
    const top = SPEC.mastH - 0.25 - 0.28 + fk.lift / 2; // over the inner mast's sheave
    const carriageTop = fk.lift - SPEC.pivot.y + 1.05;
    const front = top - carriageTop;
    const total = front + (top - 1.1);
    for (let i = 0; i < n; i++) {
      const d = (i / (n - 1)) * total;
      const onFront = d < front;
      p.set(x, onFront ? carriageTop + d : top - (d - front), onFront ? z + 0.05 : z - 0.07);
      q.setFromAxisAngle(up, i % 2 ? Math.PI / 2 : 0);
      m.compose(p, q, sc);
      ref.current!.setMatrixAt(i, m);
    }
    ref.current!.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} material={M.chain} castShadow frustumCulled={false}>
      <torusGeometry args={[0.04, 0.013, 6, 12]} />
    </instancedMesh>
  );
}

function Mast() {
  const tiltRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const carRef = useRef<THREE.Group>(null);
  const heelRef = useRef<THREE.Group>(null);
  const rodRef = useRef<THREE.Group>(null);
  const forkRefs = useRef<THREE.Group[]>([]);
  const zf = SPEC.loadDistance - SPEC.pivot.z; // fork face relative to the pivot
  const outerH = SPEC.mastH - 0.25;
  const outerGeo = useChannel(0.15, 0.3, outerH);
  const innerGeo = useChannel(0.13, 0.24, outerH - 0.1);
  const forkGeo = useFork();
  useFrame(() => {
    tiltRef.current!.rotation.x = -fk.tilt;
    innerRef.current!.position.y = fk.lift / 2;
    carRef.current!.position.y = fk.lift - SPEC.pivot.y;
    rodRef.current!.position.y = fk.lift / 2;
    forkCentres(fk).forEach((x, i) => forkRefs.current[i] && (forkRefs.current[i].position.x = x));
    carriage.obj = heelRef.current;
  });
  return (
    <group position={[0, SPEC.pivot.y, SPEC.pivot.z]}>
      <group ref={tiltRef}>
        {/* outer mast */}
        {[-1, 1].map((s) => (
          <Mesh key={s} geo={outerGeo} m={M.mast} position={[s * 0.66, -0.5, zf - 0.33]} />
        ))}
        <RB s={[1.6, 0.32, 0.34]} r={0.03} m={M.mast} position={[0, outerH - 0.55, zf - 0.33]} />
        <Text position={[0, outerH - 0.55, zf - 0.155]} fontSize={0.18} color="#ececec" letterSpacing={0.08} fontWeight={700}>
          TOYOTA
        </Text>
        <RB s={[1.5, 0.24, 0.32]} r={0.03} m={M.mast} position={[0, 0.3, zf - 0.33]} />
        <RB s={[1.45, 0.12, 0.12]} r={0.02} m={M.mast} position={[0, 1.55, zf - 0.45]} />
        {[-1, 1].map((s) => (
          <RB key={s} s={[0.12, 0.3, 0.3]} r={0.03} m={M.mast} position={[s * 0.82, 0.95, zf - 0.5]} />
        ))}
        {/* lift cylinders behind the channels; rods rise with the inner mast */}
        {[-1, 1].map((s) => (
          <group key={s}>
            <Cyl r={0.11} l={2.6} m={M.mast} position={[s * 0.32, 0.9, zf - 0.58]} />
            <Cyl r={0.12} l={0.08} m={M.steel} position={[s * 0.32, 2.2, zf - 0.58]} />
          </group>
        ))}
        <group ref={rodRef}>
          {[-1, 1].map((s) => (
            <group key={s}>
              <Cyl r={0.065} l={2.4} m={M.chrome} position={[s * 0.32, outerH - 0.47 - 1.2, zf - 0.58]} />
              <RB s={[0.22, 0.12, 0.22]} r={0.03} m={M.mast} position={[s * 0.32, outerH - 0.47, zf - 0.58]} />
            </group>
          ))}
        </group>
        {/* inner mast with its chain and hose sheaves */}
        <group ref={innerRef}>
          {[-1, 1].map((s) => (
            <Mesh key={s} geo={innerGeo} m={M.mast} position={[s * 0.5, -0.45, zf - 0.31]} />
          ))}
          <RB s={[1.15, 0.22, 0.26]} r={0.03} m={M.mast} position={[0, outerH - 0.45, zf - 0.31]} />
          {[-1, 1].map((s) => (
            <Cyl key={s} r={0.12} l={0.08} axis="x" m={M.steel} position={[s * 0.36, outerH - 0.28, zf - 0.21]} />
          ))}
          <Cyl r={0.1} l={0.32} axis="x" m={M.black} position={[0, outerH - 0.3, zf - 0.42]} />
          {[-0.12, 0.12].map((x) => (
            <Box key={x} s={[0.035, outerH - 0.4, 0.035]} m={M.black} position={[x, outerH / 2 - 0.25, zf - 0.44]} />
          ))}
        </group>
        <Chain x={0.36} z={zf - 0.2} />
        <Chain x={-0.36} z={zf - 0.2} />
        {/* carriage: hook bars, side plates, load backrest grille; forks on the hook-type positioner */}
        <group ref={carRef}>
          <group ref={heelRef} position={[0, 0, zf]}>
            <RB s={[2.95, 0.2, 0.17]} r={0.03} m={M.mast} position={[0, 1.02, -0.11]} />
            <RB s={[2.95, 0.18, 0.17]} r={0.03} m={M.mast} position={[0, 0.25, -0.11]} />
            <Cyl r={0.05} l={2.98} axis="x" m={M.chrome} position={[0, 1.02, 0]} />
            <Cyl r={0.05} l={2.98} axis="x" m={M.chrome} position={[0, 0.3, 0]} />
            <RB s={[1.3, 0.95, 0.12]} r={0.03} m={M.mast} position={[0, 0.62, -0.21]} />
            {[-1, 1].map((s) => (
              <RB key={s} s={[0.14, 0.98, 0.22]} r={0.03} m={M.mast} position={[s * 1.4, 0.62, -0.12]} />
            ))}
            {[-1.3, -0.87, -0.43, 0, 0.43, 0.87, 1.3].map((x) => (
              <Box key={x} s={[0.05, 0.9, 0.05]} m={M.mast} position={[x, 1.55, -0.12]} />
            ))}
            <RB s={[2.75, 0.08, 0.08]} r={0.02} m={M.mast} position={[0, 2.0, -0.12]} />
            <RB s={[2.75, 0.06, 0.06]} r={0.02} m={M.mast} position={[0, 1.55, -0.12]} />
            {[0, 1].map((i) => (
              <group key={i} ref={(el) => el && (forkRefs.current[i] = el)}>
                <Mesh geo={forkGeo} m={M.fork} />
                <RB s={[SPEC.forkW + 0.04, 0.13, 0.13]} r={0.03} m={M.fork} position={[0, 1.02, -0.02]} />
                <Box s={[0.05, 0.08, 0.06]} m={M.mast} position={[0, 1.12, -0.06]} />
              </group>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}

// ---------- wheels and lights ----------

function Wheels() {
  const roll = useRef(0);
  const spin = useRef<THREE.Group[]>([]);
  const knuckle = useRef<THREE.Group[]>([]);
  useFrame((_, dt) => {
    roll.current += (fk.v / R) * Math.min(dt, 0.05);
    spin.current.forEach((g) => (g.rotation.x = roll.current));
    knuckle.current.forEach((g) => (g.rotation.y = -fk.steer * 0.95));
  });
  const keep = (list: THREE.Group[]) => (el: THREE.Group | null) => {
    if (el && !list.includes(el)) list.push(el);
  };
  return (
    <group>
      {/* front duals: the outer wheel shows its face, the inner one is mounted the other way round */}
      {[-1, 1].map((s) =>
        (
          [
            [0.95, -1],
            [1.34, 1],
          ] as const
        ).map(([x, face]) => (
          <group key={`${s}${x}`} position={[s * x, R, 0]} ref={keep(spin.current)}>
            <Wheel spec={FORK_TYRE} side={(s * face) as 1 | -1} />
          </group>
        )),
      )}
      <Cyl r={0.17} l={1.5} axis="x" m={M.mast} position={[0, R, 0]} />
      {/* rear steer axle with its centre pivot */}
      <RB s={[2.1, 0.24, 0.28]} r={0.05} m={M.mast} position={[0, R, -WB]} />
      <Cyl r={0.13} l={0.5} axis="z" m={M.steel} position={[0, R + 0.1, -WB]} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 1.25, R, -WB]} ref={keep(knuckle.current)}>
          <group ref={keep(spin.current)}>
            <Wheel spec={FORK_TYRE} side={s as 1 | -1} />
          </group>
        </group>
      ))}
    </group>
  );
}

function Lights() {
  const head = useRef<THREE.SpotLight>(null);
  const work = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const target2 = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    head.current!.intensity = fk.lights ? 30 : 0;
    work.current!.intensity = fk.lights ? 22 : 0;
    M.lens.emissiveIntensity = fk.lights ? 5 : 0.15;
    M.amberLight.emissiveIntensity = fk.engine === 'running' && Math.sin(clock.elapsedTime * 9) > 0.2 ? 6 : 0.2;
    M.redLamp.emissiveIntensity = fk.brake > 0.1 ? 3 : fk.lights ? 1 : 0.1;
  });
  return (
    <group>
      <primitive object={target} position={[0.6, 0, 10]} />
      <primitive object={target2} position={[0, 0, -16]} />
      <spotLight ref={head} position={[1.15, 1.6, 0.45]} angle={0.6} penumbra={0.6} distance={35} decay={1.6} color="#fff4e0" target={target} />
      <spotLight ref={work} position={[0, 3.5, -1.95]} angle={0.42} penumbra={0.6} distance={25} decay={1.6} color="#fff4e0" target={target2} />
    </group>
  );
}

export function ForkliftModel({ children }: { children?: ReactNode }) {
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
            <Frame />
            <Cab />
            <Wheels />
            <Mast />
            <Lights />
            {children}
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
