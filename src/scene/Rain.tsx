// Rain: streaks falling around the camera, an overcast sky with lower sun and closer fog, the concrete darker and
// glossy, and puddles that only show up when it is wet. Changes live (no reload) and eases in and out.
import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useUI } from '../store';
import { groundMat } from './Port';
import { useCanvasTexture } from './parts';

const N = 2200;

function Drops() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const camera = useThree((s) => s.camera);
  // in a ring around the camera: a streak right in front of the lens would look like a pole
  const drops = useMemo(
    () =>
      Array.from({ length: N }, () => {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.sqrt(Math.random()) * 20;
        return [Math.cos(a) * r, Math.random() * 22, Math.sin(a) * r];
      }),
    [],
  );
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#c3ccd6', transparent: true, opacity: 0.32, depthWrite: false }), []);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  useFrame((_, dt) => {
    const m = ref.current!;
    for (let i = 0; i < N; i++) {
      const d = drops[i];
      d[1] -= Math.min(dt, 0.05) * 15;
      if (d[1] < -2) d[1] += 22;
      // a slight slant from the sea breeze
      m4.makeTranslation(camera.position.x + d[0] + d[1] * 0.08, camera.position.y + d[1] - 8, camera.position.z + d[2]);
      m.setMatrixAt(i, m4);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, mat, N]} frustumCulled={false}>
      <boxGeometry args={[0.009, 0.6, 0.009]} />
    </instancedMesh>
  );
}

/** Puddles in the low spots of the apron: dark, mirror-smooth blobs. */
function Puddles({ k }: { k: { current: number } }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const alpha = useCanvasTexture(128, 128, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 6; i++) {
      const x = 40 + Math.random() * 48;
      const y = 40 + Math.random() * 48;
      const r = 18 + Math.random() * 26;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, '#fff');
      gr.addColorStop(0.7, '#fff');
      gr.addColorStop(1, '#000');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
  const mat = useMemo(() => {
    alpha.colorSpace = THREE.NoColorSpace;
    return new THREE.MeshStandardMaterial({ color: '#2c3034', roughness: 0.04, metalness: 0.1, alphaMap: alpha, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, envMapIntensity: 1.6 });
  }, [alpha]);
  const spots = useMemo(() => {
    const out: [number, number, number, number][] = [];
    let s = 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 48; i++) out.push([-70 + r() * 140, -26 + r() * 82, 1.5 + r() * 4, r() * 6]);
    return out;
  }, []);
  useLayoutEffect(() => {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach(([x, z, sz, a], i) => {
      q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, a));
      m4.compose(new THREE.Vector3(x, 0.008, z), q, new THREE.Vector3(sz, sz * 0.7, 1));
      ref.current!.setMatrixAt(i, m4);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [spots]);
  useFrame(() => {
    mat.opacity = 0.92 * k.current;
    ref.current!.visible = k.current > 0.02;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, mat, spots.length]} receiveShadow frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
    </instancedMesh>
  );
}

export function Weather() {
  const rain = useUI((s) => s.rain);
  const night = useUI((s) => s.night);
  const scene = useThree((s) => s.scene);
  const k = useRef(rain ? 1 : 0);
  const sun = useRef<THREE.DirectionalLight | null>(null);
  const base = useMemo(() => ({ bg: new THREE.Color(), fog: new THREE.Color() }), []);
  const wet = useMemo(() => ({ bg: new THREE.Color(), fog: new THREE.Color() }), []);
  const dry = useMemo(() => new THREE.Color('#ffffff'), []);
  const damp = useMemo(() => new THREE.Color('#9a9a9a'), []);
  useFrame((_, dt) => {
    base.bg.set(night ? '#05070c' : '#bcd6ea');
    base.fog.set(night ? '#05070c' : '#c7d6e0');
    wet.bg.set(night ? '#040508' : '#7e8890');
    wet.fog.set(night ? '#06080b' : '#8c969d');
    k.current += ((rain ? 1 : 0) - k.current) * Math.min(1, dt * 0.7);
    const w = k.current;
    if (scene.background instanceof THREE.Color) scene.background.copy(base.bg).lerp(wet.bg, w);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(base.fog).lerp(wet.fog, w);
      scene.fog.near = 90 - 60 * w;
      scene.fog.far = 420 - 250 * w;
    }
    if (!sun.current) scene.traverse((o) => (o as THREE.DirectionalLight).isDirectionalLight && (sun.current = o as THREE.DirectionalLight));
    if (sun.current) sun.current.intensity = (night ? 0.25 : 3.1) * (1 - 0.65 * w);
    groundMat.roughness = 0.92 - 0.5 * w;
    groundMat.color.copy(dry).lerp(damp, w);
  });
  return (
    <>
      {rain && <Drops />}
      <Puddles k={k} />
    </>
  );
}
