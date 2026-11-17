// The port yard: concrete apron with markings, the quay with bollards and fenders, the water and a moored container
// ship, a ship-to-shore crane, container stacks, a warehouse, light towers, and the flatbed semi-trailer with the
// genset's timbers. Layout and solids come from sim/world.ts.
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CRANE, LIGHTS, PAD, QUAY_Z, STACKS, TIMBERS, TRUCK, onDeck } from '../sim/world';
import { fk, useUI } from '../store';
import { Box, Cyl, M, useCanvasTexture } from './parts';

function Ground() {
  const tex = useCanvasTexture(
    512,
    512,
    (g) => {
      g.fillStyle = '#9a9890';
      g.fillRect(0, 0, 512, 512);
      // speckle and stains
      for (let i = 0; i < 9000; i++) {
        const v = 130 + Math.random() * 40;
        g.fillStyle = `rgba(${v},${v - 3},${v - 10},0.35)`;
        g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
      }
      for (let i = 0; i < 18; i++) {
        const r = 10 + Math.random() * 50;
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(40,38,34,0.22)');
        gr.addColorStop(1, 'rgba(40,38,34,0)');
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // slab joints every 6 m (texture is 12 m)
      g.strokeStyle = 'rgba(55,52,48,0.7)';
      g.lineWidth = 2;
      for (const k of [0, 256]) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k, 512);
        g.moveTo(0, k);
        g.lineTo(512, k);
        g.stroke();
      }
    },
    [20, 14],
  );
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 11]} receiveShadow>
      <planeGeometry args={[240, 82 + 1]} />
      <meshStandardMaterial map={tex} roughness={0.92} />
    </mesh>
  );
}

/** Painted lines: lanes, the trailer bay and the genset pad. */
function Markings() {
  const yellow = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e8c21c', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }), []);
  const white = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e9e9e4', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }), []);
  const line = (x: number, z: number, sx: number, sz: number, m: THREE.Material, key: string) => (
    <mesh key={key} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.005, z]} material={m} receiveShadow>
      <planeGeometry args={[sx, sz]} />
    </mesh>
  );
  const pad = [];
  const w = 7.2;
  const d = 3.4;
  pad.push(line(PAD.x, PAD.z - d / 2, w, 0.15, yellow, 'p1'), line(PAD.x, PAD.z + d / 2, w, 0.15, yellow, 'p2'));
  pad.push(line(PAD.x - w / 2, PAD.z, 0.15, d, yellow, 'p3'), line(PAD.x + w / 2, PAD.z, 0.15, d, yellow, 'p4'));
  for (let i = 0; i < 9; i++) pad.push(line(PAD.x - w / 2 - 0.6 - i * 0.0, PAD.z - d / 2 + 0.2 + i * 0.37, 1.0, 0.12, yellow, `h${i}`));
  return (
    <group>
      {pad}
      <Text position={[PAD.x, 0.01, PAD.z + d / 2 + 0.7]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.55} color="#e8c21c" fontWeight={700}>
        AREA LETAK GENSET
      </Text>
      {/* trailer bay */}
      {line((TRUCK.x0 + TRUCK.headX1) / 2, 2.2, TRUCK.headX1 - TRUCK.x0 + 2, 0.15, white, 'b1')}
      {line((TRUCK.x0 + TRUCK.headX1) / 2, -2.2, TRUCK.headX1 - TRUCK.x0 + 2, 0.15, white, 'b2')}
      {/* yard lanes */}
      {Array.from({ length: 24 }, (_, i) => line(-66 + i * 6, 7.5, 3, 0.18, white, `l${i}`))}
      {Array.from({ length: 24 }, (_, i) => line(-66 + i * 6, -10, 3, 0.18, white, `m${i}`))}
      {line(0, QUAY_Z + 1.6, 160, 0.25, yellow, 'q')}
    </group>
  );
}

function Quay() {
  const water = useCanvasTexture(
    256,
    256,
    (g) => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2500; i++) {
        const v = 100 + Math.random() * 60;
        g.fillStyle = `rgb(${v},${v},255)`;
        g.beginPath();
        g.ellipse(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 10, 2 + Math.random() * 3, 0, 0, Math.PI * 2);
        g.fill();
      }
    },
    [30, 12],
  );
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((_, dt) => {
    water.offset.x += dt * 0.004;
    water.offset.y += dt * 0.006;
  });
  const curb = useCanvasTexture(
    128,
    16,
    (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#1a1a1a' : '#e8c21c';
        g.fillRect(i * 16, 0, 16, 16);
      }
    },
    [80, 1],
  );
  return (
    <group>
      {/* quay wall and curb */}
      <Box s={[240, 3, 2]} m={M.concrete} position={[0, -1.5, QUAY_Z - 1]} />
      <mesh position={[0, 0.2, QUAY_Z + 0.25]} castShadow receiveShadow>
        <boxGeometry args={[160, 0.4, 0.5]} />
        <meshStandardMaterial map={curb} roughness={0.7} />
      </mesh>
      {Array.from({ length: 14 }, (_, i) => (
        <group key={i} position={[-65 + i * 10, 0, QUAY_Z + 1.0]}>
          <Cyl r={0.22} l={0.6} m={M.mast} position={[0, 0.3, 0]} />
          <Cyl r={0.32} l={0.12} m={M.mast} position={[0, 0.62, 0]} />
          {/* rubber fender on the wall face */}
          <Box s={[1.2, 1.6, 0.5]} m={M.black} position={[0, -1.2, -2.3]} />
        </group>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.4, QUAY_Z - 90]}>
        <planeGeometry args={[600, 178]} />
        <meshStandardMaterial ref={mat} color="#1f4c5c" roughness={0.12} metalness={0.25} normalMap={water} normalScale={new THREE.Vector2(0.4, 0.4)} />
      </mesh>
    </group>
  );
}

const BOX_COLORS = ['#1e5aa8', '#b8322a', '#d9802b', '#6e7378', '#2f7a47', '#8a2f6b', '#c9b72e', '#2a8b9c'];

/** Container stacks on the yard and on the ship: one instanced mesh of 40 ft boxes with corrugated sides. */
function Containers() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const tex = useCanvasTexture(256, 64, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 64; i++) {
      g.fillStyle = i % 2 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.1)';
      g.fillRect(i * 4, 0, 2, 64);
    }
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 3;
    g.strokeRect(1, 1, 254, 62);
  });
  const boxes = useMemo(() => {
    const out: { p: [number, number, number]; c: string; yaw: number }[] = [];
    let k = 0;
    for (const [x, z, n] of STACKS) for (let t = 0; t < n; t++) out.push({ p: [x, 1.295 + t * 2.59, z], c: BOX_COLORS[k++ % BOX_COLORS.length], yaw: 0 });
    // the ship's deck cargo
    for (let bay = 0; bay < 9; bay++)
      for (let row = 0; row < 6; row++) {
        const tiers = 2 + ((bay * 7 + row * 3) % 3);
        for (let t = 0; t < tiers; t++) out.push({ p: [-58 + bay * 13.2, 5.4 + t * 2.59, -48 + row * 2.5], c: BOX_COLORS[(k++ * 5) % BOX_COLORS.length], yaw: 0 });
      }
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    boxes.forEach((b, i) => {
      m.makeTranslation(...b.p);
      ref.current!.setMatrixAt(i, m);
      ref.current!.setColorAt(i, col.set(b.c));
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
  }, [boxes]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, boxes.length]} castShadow receiveShadow>
      <boxGeometry args={[12.19, 2.59, 2.44]} />
      <meshStandardMaterial map={tex} roughness={0.6} metalness={0.3} />
    </instancedMesh>
  );
}

function Ship() {
  return (
    <group position={[0, 0, -48]}>
      {/* hull: dark blue topsides, red bottom at the waterline */}
      <Box s={[130, 9, 21]} m={M.hull} position={[0, -0.5, 1]} />
      <Box s={[130, 1.2, 21.2]} m={M.hullRed} position={[0, -4.5, 1]} />
      <mesh position={[66, -0.5, 1]} rotation={[0, 0, 0]} material={M.hull}>
        <cylinderGeometry args={[10.5, 10.5, 9, 3, 1, false, 0, Math.PI]} />
      </mesh>
      <Box s={[130.4, 0.3, 21.4]} m={M.white} position={[0, 3.9, 1]} />
      {/* bridge superstructure at the stern */}
      <group position={[-62, 4, 1]}>
        <Box s={[9, 14, 18]} m={M.white} position={[0, 7, 0]} />
        <Box s={[9.4, 1.6, 22]} m={M.glassDark} position={[0, 12.5, 0]} />
        <Box s={[2, 6, 2]} m={M.hullRed} position={[2, 16, 0]} />
      </group>
      <Text position={[30, 1.5, 11.65]} fontSize={2.2} color="#e9eef2" fontWeight={700}>
        NUSANTARA JAYA
      </Text>
    </group>
  );
}

function StsCrane() {
  const cx = (CRANE.x0 + CRANE.x1) / 2;
  return (
    <group>
      {[CRANE.x0, CRANE.x1].map((x) =>
        [CRANE.zSea, CRANE.zLand].map((z) => (
          <group key={`${x}${z}`} position={[x, 0, z]}>
            <Box s={[1.4, 34, 1.4]} m={M.crane} position={[0, 17, 0]} />
            <Box s={[2.2, 1.2, 3.2]} m={M.mast} position={[0, 0.6, 0]} />
          </group>
        )),
      )}
      {/* portal beams, the boom over the water and the backreach */}
      {[CRANE.zSea, CRANE.zLand].map((z) => (
        <Box key={z} s={[CRANE.x1 - CRANE.x0 + 1.4, 1.6, 1.6]} m={M.crane} position={[cx, 18, z]} />
      ))}
      {[CRANE.x0, CRANE.x1].map((x) => (
        <Box key={x} s={[1.6, 1.6, CRANE.zLand - CRANE.zSea]} m={M.crane} position={[x, 18, (CRANE.zSea + CRANE.zLand) / 2]} />
      ))}
      {[-1, 1].map((s) => (
        <Box key={s} s={[1.2, 2.2, 75]} m={M.crane} position={[cx + s * 5, 36, -40]} />
      ))}
      <Box s={[12, 2.6, 4]} m={M.crane} position={[cx, 36, -8]} />
      <Box s={[12, 12, 2]} m={M.crane} position={[cx, 43, -14]} />
      {/* the boom ties */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[cx + s * 5, 44, -40]} rotation={[0.24, 0, 0]} material={M.steel}>
          <cylinderGeometry args={[0.12, 0.12, 60, 6]} />
        </mesh>
      ))}
      {/* trolley and spreader hanging over the ship */}
      <Box s={[11, 2, 4]} m={M.white} position={[cx, 34.6, -52]} />
      <Box s={[12.4, 0.6, 2.6]} m={M.amber} position={[cx, 17, -52]} />
      {[-4, 4].map((x) => (
        <mesh key={x} position={[cx + x, 26, -52]} material={M.steel}>
          <cylinderGeometry args={[0.04, 0.04, 17, 4]} />
        </mesh>
      ))}
    </group>
  );
}

function Warehouse() {
  const wall = useCanvasTexture(
    256,
    128,
    (g) => {
      g.fillStyle = '#c4c9cc';
      g.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 64; i++) {
        g.fillStyle = i % 2 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';
        g.fillRect(i * 4, 0, 2, 128);
      }
    },
    [8, 1],
  );
  return (
    <group position={[-62, 0, 22]}>
      <mesh position={[0, 6, 0]} castShadow receiveShadow>
        <boxGeometry args={[30, 12, 36]} />
        <meshStandardMaterial map={wall} roughness={0.55} metalness={0.4} />
      </mesh>
      <mesh position={[0, 12.9, 0]} rotation={[0, 0, Math.PI / 2]} material={M.roof} castShadow>
        <cylinderGeometry args={[2.0, 2.0, 30.6, 3, 1, false, -Math.PI / 6, Math.PI / 1.5]} />
      </mesh>
      {[-10, 0, 10].map((z) => (
        <group key={z} position={[15.02, 0, z]}>
          <Box s={[0.1, 5.5, 6]} m={M.door} position={[0, 2.75, 0]} />
          <Box s={[0.4, 0.4, 6.6]} m={M.mast} position={[0.1, 5.7, 0]} />
        </group>
      ))}
      <Text position={[15.1, 9, 0]} rotation={[0, Math.PI / 2, 0]} fontSize={1.6} color="#1f3550" fontWeight={700}>
        GUDANG 3
      </Text>
    </group>
  );
}

function LightTowers() {
  const night = useUI((s) => s.night);
  const lamp = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff6e0', emissive: '#ffe9b8', emissiveIntensity: 0.3 }), []);
  lamp.emissiveIntensity = night ? 6 : 0.3;
  return (
    <group>
      {LIGHTS.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <Cyl r={0.35} r2={0.2} l={28} m={M.greyLight} position={[0, 14, 0]} />
          <Box s={[3.2, 1.4, 0.4]} m={M.mast} position={[0, 28.4, 0]} />
          {[-1.1, 0, 1.1].map((dx) => (
            <Box key={dx} s={[0.8, 0.5, 0.1]} m={lamp} position={[dx, 28.1, 0.25]} />
          ))}
          {night && <pointLight position={[0, 26, 1]} intensity={700} distance={75} decay={1.7} color="#ffeccc" />}
        </group>
      ))}
    </group>
  );
}

function Fence() {
  const posts = [];
  for (let x = -78; x <= 78; x += 4) posts.push([x, 52] as const);
  for (let z = -28; z <= 52; z += 4) posts.push([-78, z] as const, [78, z] as const);
  return (
    <group>
      {posts.map(([x, z], i) => (
        <Cyl key={i} r={0.04} l={2.4} m={M.steel} seg={6} position={[x, 1.2, z]} />
      ))}
      {[
        [0, 52, 156, 0],
        [-78, 12, 80, Math.PI / 2],
        [78, 12, 80, Math.PI / 2],
      ].map(([x, z, l, r], i) => (
        <mesh key={i} position={[x, 1.2, z]} rotation={[0, r, 0]}>
          <planeGeometry args={[l, 2.3]} />
          <meshStandardMaterial color="#8e9599" metalness={0.6} roughness={0.5} transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Wheel({ x, z, r = 0.52, w = 0.3 }: { x: number; z: number; r?: number; w?: number }) {
  return (
    <group position={[x, r, z]}>
      <Cyl r={r} l={w} axis="z" m={M.rubber} />
      <Cyl r={r * 0.55} l={w + 0.02} axis="z" m={M.rim} />
    </group>
  );
}

/** Tractor unit (cab-over, 6×4) and the 13 m flatbed semi-trailer. The trailer deck rises a little when unloaded. */
function Truck() {
  const deck = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const c = fk.cargo;
    const loaded = c.state === 'rest' && onDeck(c.x, c.z);
    const target = loaded ? 0 : 0.05;
    deck.current!.position.y += (target - deck.current!.position.y) * Math.min(1, dt * 2);
  });
  const { x0, x1, hz, deckTop } = TRUCK;
  const len = x1 - x0;
  const h0 = TRUCK.headX0;
  return (
    <group>
      <group ref={deck}>
        {/* deck plate, side rails with stake pockets, cross members below */}
        <Box s={[len, 0.06, hz * 2]} m={M.deckPlate} position={[(x0 + x1) / 2, deckTop - 0.03, 0]} />
        {[-1, 1].map((s) => (
          <group key={s}>
            <Box s={[len, 0.22, 0.1]} m={M.trailer} position={[(x0 + x1) / 2, deckTop - 0.14, s * (hz - 0.05)]} />
            {Array.from({ length: 12 }, (_, i) => (
              <Box key={i} s={[0.1, 0.12, 0.06]} m={M.mast} position={[x0 + 0.6 + i * 1.07, deckTop - 0.12, s * hz]} />
            ))}
            <Box s={[len - 0.2, 0.42, 0.14]} m={M.trailer} position={[(x0 + x1) / 2, deckTop - 0.45, s * 0.5]} />
          </group>
        ))}
        {/* gooseneck step to the kingpin */}
        <Box s={[1.6, 0.3, 1.2]} m={M.trailer} position={[x1 - 0.8, deckTop - 0.5, 0]} />
        {/* rear bumper and lamps */}
        <Box s={[0.12, 0.3, hz * 2]} m={M.mast} position={[x0 - 0.05, 0.9, 0]} />
        {[-1, 1].map((s) => (
          <Box key={s} s={[0.05, 0.12, 0.3]} m={M.redLamp} position={[x0 - 0.12, 0.95, s * 0.95]} />
        ))}
        <Text position={[x0 - 0.13, 1.25, 0]} rotation={[0, -Math.PI / 2, 0]} fontSize={0.16} color="#f2c21c">
          MUATAN BERAT
        </Text>
      </group>
      {/* tri-axle bogie, landing legs */}
      {[-7.9, -6.6, -5.3].map((x) =>
        [-1, 1].map((s) => [0.66, 1.0].map((zz) => <Wheel key={`${x}${s}${zz}`} x={x} z={s * zz} />)),
      )}
      {[-1, 1].map((s) => (
        <group key={s} position={[1.4, 0, s * 0.85]}>
          <Box s={[0.14, 1.3, 0.14]} m={M.mast} position={[0, 0.75, 0]} />
          <Box s={[0.4, 0.06, 0.4]} m={M.mast} position={[0, 0.03, 0]} />
        </group>
      ))}
      {/* tractor unit */}
      <group>
        <Box s={[6, 0.35, 0.9]} m={M.mast} position={[h0 + 3, 0.95, 0]} />
        <Box s={[1.6, 0.18, 2.0]} m={M.mast} position={[h0 + 0.6, 1.2, 0]} />
        <Box s={[2.3, 2.5, 2.45]} r={0.08} m={M.cabWhite} position={[h0 + 4.75, 2.45, 0]} />
        <Box s={[0.05, 1.0, 2.1]} m={M.glassDark} position={[h0 + 5.91, 2.9, 0]} />
        <Box s={[0.08, 0.6, 1.6]} m={M.mast} position={[h0 + 5.92, 1.65, 0]} />
        <Box s={[0.25, 0.32, 2.5]} m={M.mast} position={[h0 + 5.95, 0.95, 0]} />
        <Box s={[2.3, 0.4, 2.47]} m={M.cab} position={[h0 + 4.75, 1.4, 0]} />
        <Cyl r={0.3} l={1.2} axis="x" m={M.steel} position={[h0 + 2.6, 0.95, 1.1]} />
        <Cyl r={0.09} l={2.8} m={M.mast} position={[h0 + 3.55, 2.6, -1.0]} />
        {[h0 + 5, h0 + 1.6, h0 + 0.3].map((x, i) =>
          [-1, 1].map((s) => (i === 0 ? [1.05] : [0.66, 1.0]).map((zz) => <Wheel key={`${x}${s}${zz}`} x={x} z={s * zz} />)),
        )}
      </group>
    </group>
  );
}

function Timbers() {
  const tex = useCanvasTexture(
    128,
    32,
    (g) => {
      g.fillStyle = '#82603c';
      g.fillRect(0, 0, 128, 32);
      for (let i = 0; i < 26; i++) {
        g.strokeStyle = `rgba(50,32,16,${0.15 + Math.random() * 0.25})`;
        g.beginPath();
        const y = Math.random() * 32;
        g.moveTo(0, y);
        g.bezierCurveTo(40, y + 3, 80, y - 3, 128, y + 1);
        g.stroke();
      }
    },
    [1, 1],
  );
  const deck = useRef<THREE.Group>(null);
  useFrame(() => {
    // the truck's timbers ride on the deck
    const c = fk.cargo;
    deck.current!.position.y = c.state === 'rest' && onDeck(c.x, c.z) ? 0 : 0.05;
  });
  const t = (o: (typeof TIMBERS)[number]) => (
    <mesh key={o.id} position={[o.x, (o.y0 + o.y1) / 2, o.z]} rotation={[0, o.yaw, 0]} castShadow receiveShadow>
      <boxGeometry args={[o.hx * 2, o.y1 - o.y0, o.hz * 2]} />
      <meshStandardMaterial map={tex} roughness={0.9} />
    </mesh>
  );
  return (
    <group>
      <group ref={deck}>{TIMBERS.filter((o) => o.y0 > 0.5).map(t)}</group>
      {TIMBERS.filter((o) => o.y0 <= 0.5).map(t)}
    </group>
  );
}

export function Port() {
  return (
    <group>
      <Ground />
      <Markings />
      <Quay />
      <Containers />
      <Ship />
      <StsCrane />
      <Warehouse />
      <LightTowers />
      <Fence />
      <Truck />
      <Timbers />
    </group>
  );
}
