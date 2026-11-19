// What each job puts in the yard: timbers, the supports a load goes on (concrete plinth, pallet stack, base
// container), the painted target, a floating target marker, and for the SIO test the cones, the finish box and the
// next checkpoint ring. Rebuilt when the job changes.
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { JOB } from '../sim/jobs';
import { CARGO_START, CONES, LOAD, PAD, SUPPORTS, TIMBERS, onDeck } from '../sim/world';
import { fk, useUI } from '../store';
import { LoadModel } from './Cargo';
import { Box, M, useCanvasTexture } from './parts';
import { weather } from './weather';

const concrete = weather(new THREE.MeshStandardMaterial({ color: '#a19e96', roughness: 0.9 }), { dirt: 0.3, mudBelow: 0.3, mud: 0.5, chips: 0, scale: 1.5, dirtColor: '#5f5a50' });
const yellow = new THREE.MeshStandardMaterial({ color: '#e8c21c', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
const white = new THREE.MeshStandardMaterial({ color: '#e9e9e4', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });

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
  const mat = useMemo(() => weather(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), { dirt: 0.3, mudBelow: 0.25, mud: 0.6, chips: 0, scale: 4, dirtColor: '#4a3622' }), [tex]);
  const deck = useRef<THREE.Group>(null);
  useFrame(() => {
    // the truck's timbers ride on the deck, which rises a little when unloaded
    const c = fk.cargo;
    if (deck.current) deck.current.position.y = c.state === 'rest' && onDeck(c.x, c.z) ? 0 : 0.05;
  });
  const t = (o: (typeof TIMBERS)[number]) => (
    <mesh key={o.id} position={[o.x, (o.y0 + o.y1) / 2, o.z]} rotation={[0, o.yaw, 0]} material={mat} castShadow receiveShadow>
      <boxGeometry args={[o.hx * 2, o.y1 - o.y0, o.hz * 2]} />
    </mesh>
  );
  return (
    <group>
      <group ref={deck}>{TIMBERS.filter((o) => o.y0 > 1).map(t)}</group>
      {TIMBERS.filter((o) => o.y0 <= 1).map(t)}
    </group>
  );
}

function Supports() {
  return (
    <group>
      {SUPPORTS.map((s) => (
        <group key={s.id} position={[s.x, 0, s.z]} rotation={[0, s.yaw, 0]}>
          {s.kind === 'plinth' && (
            <>
              <Box s={[s.hx * 2, s.y1, s.hz * 2]} m={concrete} position={[0, s.y1 / 2, 0]} />
              {/* anchor bolts at the corners */}
              {[-1, 1].map((x) => [-1, 1].map((z) => <Box key={`${x}${z}`} s={[0.05, 0.12, 0.05]} m={M.steel} position={[x * (s.hx - 0.2), s.y1 + 0.06, z * (s.hz - 0.2)]} />))}
            </>
          )}
          {s.kind === 'pallets' && <LoadModel id="cement" />}
          {s.kind === 'container' && <LoadModel id="container" />}
        </group>
      ))}
    </group>
  );
}

/** The painted rectangle with hatching and its label (on the ground; raised targets get only the marker). */
function Target() {
  const lines = [];
  const { w, d } = PAD;
  const onGround = PAD.y < 0.3 && !onDeck(PAD.x, PAD.z);
  const line = (x: number, z: number, sx: number, sz: number, key: string) => (
    <mesh key={key} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.006, z]} material={yellow} receiveShadow>
      <planeGeometry args={[sx, sz]} />
    </mesh>
  );
  if (onGround) {
    lines.push(line(0, -d / 2, w, 0.15, 'p1'), line(0, d / 2, w, 0.15, 'p2'), line(-w / 2, 0, 0.15, d, 'p3'), line(w / 2, 0, 0.15, d, 'p4'));
    for (let i = 0; i < 9; i++) lines.push(line(-w / 2 - 0.6, -d / 2 + 0.2 + i * (d - 0.4) / 8, 1.0, 0.12, `h${i}`));
  }
  return (
    <group position={[PAD.x, 0, PAD.z]} rotation={[0, PAD.yaw, 0]}>
      {lines}
      {onGround && PAD.label && (
        <Text position={[0, 0.012, d / 2 + 0.7]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.55} color="#e8c21c" fontWeight={700}>
          {PAD.label}
        </Text>
      )}
    </group>
  );
}

/** A floating chevron over where to go next: the load while it waits, the target while carrying. */
function Marker() {
  const ref = useRef<THREE.Group>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffb31a', transparent: true, opacity: 0.85, toneMapped: false }), []);
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.45, 0.35);
    s.lineTo(0, -0.1);
    s.lineTo(0.45, 0.35);
    s.lineTo(0.45, 0.05);
    s.lineTo(0, -0.4);
    s.lineTo(-0.45, 0.05);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, []);
  useFrame(({ clock }) => {
    const g = ref.current!;
    const show = fk.assists.guide && fk.phase !== 'done' && fk.phase !== 'failed' && fk.phase !== 'p2h' && fk.phase !== 'course';
    g.visible = show;
    if (!show) return;
    const c = fk.cargo;
    const toLoad = c.state === 'rest' && fk.phase === 'pickup';
    const x = toLoad ? c.x : PAD.x;
    const z = toLoad ? c.z : PAD.z;
    const y = (toLoad ? c.y + 2.9 : Math.max(PAD.y, 0) + 3.3) + Math.sin(clock.elapsedTime * 3) * 0.15;
    g.position.set(x, y, z);
  });
  return (
    <group ref={ref}>
      <Billboard>
        <mesh geometry={geo} material={mat} />
      </Billboard>
    </group>
  );
}

/** Traffic cones: two instanced meshes (orange body, reflective band); knocked ones lie on their side. */
function Cones() {
  const body = useRef<THREE.InstancedMesh>(null);
  const band = useRef<THREE.InstancedMesh>(null);
  const n = CONES.length;
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), ax: new THREE.Vector3() }), []);
  const set = (dt: number) => {
    if (!body.current || !band.current) return;
    CONES.forEach((c, i) => {
      if (c.down) c.t = Math.min(1, c.t + dt * 3);
      const ang = c.t * (Math.PI / 2 - 0.2);
      tmp.ax.set(c.dir[1], 0, -c.dir[0]).normalize();
      tmp.q.setFromAxisAngle(tmp.ax, ang);
      tmp.p.set(c.x + c.dir[0] * c.t * 0.35, 0, c.z + c.dir[1] * c.t * 0.35);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      body.current!.setMatrixAt(i, tmp.m);
      band.current!.setMatrixAt(i, tmp.m);
    });
    body.current.instanceMatrix.needsUpdate = true;
    band.current.instanceMatrix.needsUpdate = true;
  };
  useLayoutEffect(() => set(0));
  useFrame((_, dt) => set(Math.min(dt, 0.05)));
  const bodyGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.03, 0.17, 0.72, 16, 1, true).translate(0, 0.39, 0);
    const base = new THREE.BoxGeometry(0.4, 0.04, 0.4).translate(0, 0.02, 0);
    return mergeTwo(g, base);
  }, []);
  const bandGeo = useMemo(() => new THREE.CylinderGeometry(0.083, 0.115, 0.13, 16, 1, true).translate(0, 0.46, 0), []);
  if (!n) return null;
  return (
    <group>
      <instancedMesh ref={body} args={[bodyGeo, M.orangeCone, n]} castShadow frustumCulled={false} />
      <instancedMesh ref={band} args={[bandGeo, M.reflect, n]} frustumCulled={false} />
    </group>
  );
}
function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g0 of [a, b]) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...(g.attributes.position.array as Float32Array));
    nor.push(...(g.attributes.normal.array as Float32Array));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** SIO test: start/finish box lines, slalom number boards and a glowing ring at the next checkpoint. */
function Course() {
  const ring = useRef<THREE.Mesh>(null);
  const label = useRef<{ text: string } | null>(null);
  const lab = useRef<THREE.Group>(null);
  const cps = JOB.cur.checkpoints;
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#3fe08a', transparent: true, opacity: 0.6, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }), []);
  useFrame(({ clock }) => {
    if (!cps || !ring.current) return;
    const cp = cps[Math.min(fk.cp, cps.length - 1)];
    const show = fk.cp < cps.length && fk.phase !== 'done' && fk.phase !== 'failed' && (fk.cp < (JOB.cur.placeAfter ?? 0) ? fk.cargo.state === 'forks' : fk.placed);
    ring.current.visible = show;
    if (lab.current) lab.current.visible = show;
    ring.current.position.set(cp.x, 0.03, cp.z);
    ring.current.scale.setScalar(cp.r * (1 + 0.04 * Math.sin(clock.elapsedTime * 4)));
    mat.color.set(cp.dir === 'R' ? '#4aa8ff' : cp.stop ? '#ff5a4a' : '#3fe08a');
    if (lab.current) lab.current.position.set(cp.x, 2.6, cp.z);
    if (label.current) label.current.text = `${fk.cp + 1}. ${cp.label}`;
  });
  if (!cps) return null;
  const fin = cps[cps.length - 1];
  const line = (x: number, z: number, sx: number, sz: number, key: string) => (
    <mesh key={key} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.006, z]} material={white} receiveShadow>
      <planeGeometry args={[sx, sz]} />
    </mesh>
  );
  return (
    <group>
      {/* finish box */}
      {[line(fin.x, fin.z - 1.8, 4, 0.12, 'f1'), line(fin.x, fin.z + 1.8, 4, 0.12, 'f2'), line(fin.x - 2, fin.z, 0.12, 3.6, 'f3'), line(fin.x + 2, fin.z, 0.12, 3.6, 'f4')]}
      <Text position={[fin.x, 0.012, fin.z + 2.5]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.6} color="#e9e9e4" fontWeight={700}>
        FINISH
      </Text>
      {/* slalom boards */}
      {cps.slice(0, JOB.cur.placeAfter ?? 0).map((c, i) => (
        <Text key={i} position={[c.x, 0.012, 34 + (c.z > 34 ? -1.1 : 1.1)]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.7} color="#e9e9e4" fontWeight={700}>
          {String(i + 1)}
        </Text>
      ))}
      <Text position={[0, 0.012, 50]} rotation={[-Math.PI / 2, 0, Math.PI]} fontSize={1.1} color="#e8c21c" fontWeight={700}>
        AREA UJIAN SIO
      </Text>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} material={mat}>
        <ringGeometry args={[0.92, 1, 48]} />
      </mesh>
      <group ref={lab}>
        <Billboard>
          <Text ref={(t) => (label.current = t as unknown as { text: string })} fontSize={0.42} color="#ffffff" outlineWidth={0.03} outlineColor="#000">
            -
          </Text>
        </Billboard>
      </group>
    </group>
  );
}

export function JobProps() {
  const v = useUI((s) => s.jobVersion);
  // pickup spot for the load when it starts on the ground: a painted box around it
  const startOnGround = CARGO_START.y < 0.3;
  return (
    <group key={v}>
      <Timbers />
      <Supports />
      <Target />
      <Marker />
      <Cones />
      <Course />
      {startOnGround && (
        <group position={[CARGO_START.x, 0, CARGO_START.z]} rotation={[0, CARGO_START.yaw, 0]}>
          {[
            [0, -LOAD.hz - 0.3, LOAD.hx * 2 + 0.72, 0.12],
            [0, LOAD.hz + 0.3, LOAD.hx * 2 + 0.72, 0.12],
            [-LOAD.hx - 0.3, 0, 0.12, LOAD.hz * 2 + 0.6],
            [LOAD.hx + 0.3, 0, 0.12, LOAD.hz * 2 + 0.6],
          ].map(([x, z, sx, sz], i) => (
            <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.005, z]} material={white}>
              <planeGeometry args={[sx, sz]} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}
