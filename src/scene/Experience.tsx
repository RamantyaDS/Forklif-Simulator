import { OrbitControls, Sky, Stars } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { applyHeld, padLook } from '../input';
import { playEvent, updateSound } from '../sound';
import { advance, fk, onEvent, useUI } from '../store';
import { LOW_GPU, MAX_DPR } from './Adaptive';
import { Cargo } from './Cargo';
import { Exhaust } from './Exhaust';
import { ForkliftModel, carriageWorld, truck } from './Forklift';
import { Overlay } from './Overlay';
import { Port } from './Port';

/** Camera look offsets, changed by mouse drags, the wheel and the gamepad's right stick. */
const look = { yaw: 0, pitch: 0.32, dist: 14, cabYaw: 0, cabPitch: -0.12 };

function Driver() {
  useEffect(() => onEvent(playEvent), []);
  useEffect(() => {
    const id = setInterval(() => useUI.getState().bump(), 110);
    return () => clearInterval(id);
  }, []);
  const camera = useThree((s) => s.camera);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    applyHeld(Math.min(dt, 0.05));
    advance(dt);
    const d = camera.position.distanceTo(tmp.set(fk.x, 2, fk.z));
    updateSound(d, useUI.getState().cam === 'cab');
  });
  return null;
}

function SunFollow({ night }: { night: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    const l = light.current!;
    const cx = fk.x - Math.sin(fk.heading) * 2;
    const cz = fk.z - Math.cos(fk.heading) * 2;
    l.position.set(cx + 38, 42, cz + 30);
    l.target.position.set(cx, 0, cz);
    l.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light}
      intensity={night ? 0.25 : 3.1}
      color={night ? '#9fb3ff' : '#ffe2b8'}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-22}
      shadow-camera-right={22}
      shadow-camera-top={22}
      shadow-camera-bottom={-22}
      shadow-camera-far={140}
      shadow-bias={-0.0004}
      shadow-normalBias={0.03}
    />
  );
}

function CameraRig() {
  const cam = useUI((s) => s.cam);
  const camera = useThree((s) => s.camera as THREE.PerspectiveCamera);
  const gl = useThree((s) => s.gl);
  const orbit = useRef<OrbitImpl>(null);
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), t: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler(), last: new THREE.Vector3() }), []);

  // mouse / touch drag to look around, wheel to zoom (orbit mode uses OrbitControls instead)
  useEffect(() => {
    if (cam === 'orbit') return;
    const el = gl.domElement;
    let down = false;
    const dn = (e: PointerEvent) => {
      down = true;
      el.setPointerCapture?.(e.pointerId);
    };
    const up = () => (down = false);
    const mv = (e: PointerEvent) => {
      if (!down) return;
      if (cam === 'cab' || cam === 'fork') {
        look.cabYaw = Math.max(-2.8, Math.min(2.8, look.cabYaw - e.movementX * 0.004));
        look.cabPitch = Math.max(-0.9, Math.min(0.6, look.cabPitch - e.movementY * 0.004));
      } else {
        look.yaw -= e.movementX * 0.006;
        look.pitch = Math.max(0.05, Math.min(1.35, look.pitch + e.movementY * 0.004));
      }
    };
    const wheel = (e: WheelEvent) => {
      look.dist = Math.max(6, Math.min(45, look.dist * (1 + Math.sign(e.deltaY) * 0.1)));
    };
    el.addEventListener('pointerdown', dn);
    addEventListener('pointerup', up);
    el.addEventListener('pointermove', mv);
    el.addEventListener('wheel', wheel, { passive: true });
    return () => {
      el.removeEventListener('pointerdown', dn);
      removeEventListener('pointerup', up);
      el.removeEventListener('pointermove', mv);
      el.removeEventListener('wheel', wheel);
    };
  }, [cam, gl]);

  useEffect(() => {
    camera.fov = cam === 'cab' ? 72 : cam === 'fork' ? 80 : 50;
    camera.updateProjectionMatrix();
    tmp.last.set(fk.x, 0, fk.z);
    look.cabYaw = 0;
    look.cabPitch = cam === 'fork' ? -0.25 : -0.12;
  }, [cam, camera, tmp]);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    if (cam === 'cab' || cam === 'fork') {
      look.cabYaw = Math.max(-2.8, Math.min(2.8, look.cabYaw - padLook.x * dt * 1.8));
      look.cabPitch = Math.max(-0.9, Math.min(0.6, look.cabPitch - padLook.y * dt * 1.2));
    } else {
      look.yaw -= padLook.x * dt * 1.8;
      look.pitch = Math.max(0.05, Math.min(1.35, look.pitch + padLook.y * dt * 1.2));
    }
    const fx = Math.sin(fk.heading);
    const fz = Math.cos(fk.heading);
    if (cam === 'cab' && truck.obj) {
      truck.obj.updateWorldMatrix(true, false);
      tmp.v.set(0.02, 2.92, -0.95);
      truck.obj.localToWorld(tmp.v);
      camera.position.copy(tmp.v);
      truck.obj.getWorldQuaternion(tmp.q);
      camera.quaternion.copy(tmp.q).multiply(new THREE.Quaternion().setFromEuler(tmp.e.set(look.cabPitch, look.cabYaw + Math.PI, 0, 'YXZ')));
      return;
    }
    if (cam === 'fork' && truck.obj) {
      truck.obj.updateWorldMatrix(true, false);
      carriageWorld(0, -0.06, 0.2, tmp.v);
      camera.position.copy(tmp.v);
      truck.obj.getWorldQuaternion(tmp.q);
      tmp.q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -fk.tilt));
      camera.quaternion.copy(tmp.q).multiply(new THREE.Quaternion().setFromEuler(tmp.e.set(look.cabPitch, look.cabYaw + Math.PI, 0, 'YXZ')));
      return;
    }
    tmp.t.set(fk.x - fx * 2.2, 1.6, fk.z - fz * 2.2);
    if (cam === 'orbit') {
      camera.position.add(tmp.v.copy(tmp.t).sub(tmp.last));
      orbit.current?.target.copy(tmp.t);
      tmp.last.copy(tmp.t);
      return;
    }
    let want: THREE.Vector3;
    if (cam === 'top') want = tmp.v.set(tmp.t.x - fx * 4, 34, tmp.t.z - fz * 4);
    else {
      // behind the counterweight by default; drag to swing around
      const a = fk.heading + Math.PI + look.yaw;
      const h = Math.cos(look.pitch) * look.dist;
      want = tmp.v.set(tmp.t.x + Math.sin(a) * h, tmp.t.y + Math.sin(look.pitch) * look.dist, tmp.t.z + Math.cos(a) * h);
    }
    camera.position.lerp(want, 1 - Math.exp(-dt * 4));
    if (camera.position.y < 0.6) camera.position.y = 0.6;
    camera.lookAt(tmp.t);
  });

  return cam === 'orbit' ? <OrbitControls ref={orbit} makeDefault enablePan={false} minDistance={5} maxDistance={60} maxPolarAngle={Math.PI * 0.49} target={[fk.x, 1.6, fk.z]} /> : null;
}

export function Experience() {
  const night = useUI((s) => s.night);
  const hq = !LOW_GPU && typeof innerWidth === 'number' && innerWidth > 900;
  return (
    <Canvas shadows dpr={[1, MAX_DPR]} camera={{ position: [10, 8, 28], fov: 50, near: 0.1, far: 900 }} gl={{ antialias: true }}>
      <color attach="background" args={[night ? '#05070c' : '#bcd6ea']} />
      <fog attach="fog" args={[night ? '#05070c' : '#c7d6e0', 90, 420]} />
      {night ? <Stars radius={300} depth={60} count={2500} factor={6} fade /> : <Sky sunPosition={[40, 16, 30]} turbidity={7} rayleigh={1.6} mieCoefficient={0.006} mieDirectionalG={0.85} />}
      <hemisphereLight args={[night ? '#1c2640' : '#dbe9ff', night ? '#0b0b0c' : '#5d5547', night ? 0.18 : 0.9]} />
      <SunFollow night={night} />
      <Port />
      <ForkliftModel />
      <Cargo />
      <Exhaust />
      <Overlay />
      <CameraRig />
      <Driver />
      <EffectComposer>
        {hq ? <N8AO aoRadius={1.2} intensity={2} distanceFalloff={0.6} halfRes quality="performance" aoSamples={10} denoiseSamples={4} /> : <></>}
        <Bloom mipmapBlur luminanceThreshold={1} intensity={night ? 1.1 : 0.6} />
      </EffectComposer>
    </Canvas>
  );
}
