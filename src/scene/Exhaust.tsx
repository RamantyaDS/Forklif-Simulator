// Exhaust from the upswept stack behind the cab: a black puff on start-up and when the Hino is loaded hard (common
// rail keeps it short), light haze at idle, soot when lugging against the converter or the lift.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { fk, onEvent } from '../store';
import { truck } from './Forklift';

const N = 300;
const vert = /* glsl */ `
  attribute float size; attribute float alpha; attribute float shade;
  uniform float scale;
  varying float vA; varying float vS;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / -mv.z;
    gl_Position = projectionMatrix * mv;
    vA = alpha; vS = shade;
  }`;
const frag = /* glsl */ `
  varying float vA; varying float vS;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vA;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vec3(vS), a);
  }`;

const LOCAL = new THREE.Vector3(-0.84, 3.97, -3.27);

export function Exhaust() {
  const { geo, mat, parts } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    for (const [k, n] of [['position', 3], ['size', 1], ['alpha', 1], ['shade', 1]] as const) geo.setAttribute(k, new THREE.BufferAttribute(new Float32Array(N * n), n));
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, uniforms: { scale: { value: 800 } } });
    const parts = Array.from({ length: N }, () => ({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), age: 9, life: 1, dark: 0, s: 0.1 }));
    return { geo, mat, parts };
  }, []);
  const soot = useRef(0);
  const lastRpm = useRef(0);
  const acc = useRef(0);
  const next = useRef(0);
  const at = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => onEvent((e) => e === 'running' && (soot.current = 1)), []);
  useFrame(({ camera, size }, raw) => {
    const dt = Math.min(raw, 0.05);
    mat.uniforms.scale.value = (size.height / 2) * (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5];
    at.copy(LOCAL);
    truck.obj?.localToWorld(at);
    soot.current = Math.max(0, soot.current - dt * 0.8);
    // a quick rise in engine speed (throttle stab) puffs black for a moment
    const rise = (fk.rpm - lastRpm.current) / Math.max(dt, 1e-3);
    lastRpm.current = fk.rpm;
    if (rise > 900) soot.current = Math.min(1, soot.current + dt * 4);
    if (fk.engine === 'running') {
      const lug = Math.max(0, fk.load - 0.75) * 3;
      acc.current += (22 + 40 * fk.load + 60 * soot.current) * dt;
      while (acc.current > 1) {
        acc.current -= 1;
        const p = parts[next.current];
        next.current = (next.current + 1) % N;
        p.p.copy(at);
        p.v.set((Math.random() - 0.5) * 0.6, 1.4 + 1.8 * (fk.rpm / 2300), (Math.random() - 0.5) * 0.6);
        p.age = 0;
        p.life = 2.5 + Math.random() * 1.5;
        p.dark = Math.min(1, soot.current + lug);
        p.s = 0.22 + Math.random() * 0.12;
      }
    }
    const pos = geo.attributes.position.array as Float32Array;
    const sz = geo.attributes.size.array as Float32Array;
    const al = geo.attributes.alpha.array as Float32Array;
    const sh = geo.attributes.shade.array as Float32Array;
    parts.forEach((p, i) => {
      if (p.age < p.life) {
        p.age += dt;
        p.v.multiplyScalar(1 - dt * 1.5);
        p.v.y += dt * 0.4;
        p.v.x += dt * 0.5;
        p.p.addScaledVector(p.v, dt);
      }
      const t = Math.min(1, p.age / p.life);
      pos.set([p.p.x, p.p.y, p.p.z], i * 3);
      sz[i] = p.s * (1 + t * 6);
      al[i] = t >= 1 ? 0 : (1 - t) * Math.min(1, p.age * 14) * (0.07 + 0.38 * p.dark);
      sh[i] = 0.55 - 0.45 * p.dark + t * 0.12;
    });
    for (const k of ['position', 'size', 'alpha', 'shade']) geo.attributes[k].needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}
