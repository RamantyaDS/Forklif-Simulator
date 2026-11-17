// Particle effects driven by the simulation: dust kicked up by the tyres (much more when they squeal), sparks where
// the forks drag on concrete or steel, the air dryer's and brake valves' white puffs, a dust ring when the genset
// is set down, and a big cloud when something heavy hits the ground. Two point clouds (dust, sparks), fixed size.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { forkCentres } from '../sim/forklift';
import { SPEC } from '../sim/spec';
import { GENSET } from '../sim/world';
import { fk, onEvent } from '../store';
import { carriageWorld, truck } from './Forklift';

const vert = /* glsl */ `
  attribute float size; attribute float alpha; attribute vec3 tint;
  uniform float scale;
  varying float vA; varying vec3 vC;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(220.0, size * scale / -mv.z);
    gl_Position = projectionMatrix * mv;
    vA = alpha; vC = tint;
  }`;
const frag = /* glsl */ `
  varying float vA; varying vec3 vC;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vA;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vC, a);
  }`;

interface P {
  p: THREE.Vector3;
  v: THREE.Vector3;
  age: number;
  life: number;
  s0: number;
  s1: number;
  a: number;
  c: THREE.Color;
  g: number; // gravity factor
  drag: number;
}

function cloud(n: number, additive: boolean) {
  const geo = new THREE.BufferGeometry();
  for (const [k, w] of [
    ['position', 3],
    ['size', 1],
    ['alpha', 1],
    ['tint', 3],
  ] as const)
    geo.setAttribute(k, new THREE.BufferAttribute(new Float32Array(n * w), w));
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { scale: { value: 800 } },
  });
  const parts: P[] = Array.from({ length: n }, () => ({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), age: 9, life: 1, s0: 0.2, s1: 1, a: 0, c: new THREE.Color(), g: 0, drag: 1 }));
  return { geo, mat, parts, next: 0 };
}
type Cloud = ReturnType<typeof cloud>;

function emit(c: Cloud, at: THREE.Vector3, v: THREE.Vector3, o: { life: number; s0: number; s1: number; a: number; color: string; g?: number; drag?: number }) {
  const p = c.parts[c.next];
  c.next = (c.next + 1) % c.parts.length;
  p.p.copy(at);
  p.v.copy(v);
  p.age = 0;
  p.life = o.life;
  p.s0 = o.s0;
  p.s1 = o.s1;
  p.a = o.a;
  p.c.set(o.color);
  p.g = o.g ?? 0;
  p.drag = o.drag ?? 1.5;
}

function update(c: Cloud, dt: number) {
  const pos = c.geo.attributes.position.array as Float32Array;
  const sz = c.geo.attributes.size.array as Float32Array;
  const al = c.geo.attributes.alpha.array as Float32Array;
  const ti = c.geo.attributes.tint.array as Float32Array;
  c.parts.forEach((p, i) => {
    if (p.age < p.life) {
      p.age += dt;
      p.v.multiplyScalar(Math.max(0, 1 - dt * p.drag));
      p.v.y -= 9.81 * p.g * dt;
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.02 && p.g > 0) {
        p.p.y = 0.02;
        p.v.y *= -0.3;
      }
    }
    const t = Math.min(1, p.age / p.life);
    pos[i * 3] = p.p.x;
    pos[i * 3 + 1] = p.p.y;
    pos[i * 3 + 2] = p.p.z;
    sz[i] = p.s0 + (p.s1 - p.s0) * t;
    al[i] = t >= 1 ? 0 : p.a * (1 - t) * Math.min(1, p.age * 12);
    ti[i * 3] = p.c.r;
    ti[i * 3 + 1] = p.c.g;
    ti[i * 3 + 2] = p.c.b;
  });
  for (const k of ['position', 'size', 'alpha', 'tint']) c.geo.attributes[k].needsUpdate = true;
}

const rnd = (a: number) => (Math.random() - 0.5) * a;

export function Fx() {
  const dust = useMemo(() => cloud(420, false), []);
  const sparks = useMemo(() => cloud(160, true), []);
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), v: new THREE.Vector3() }), []);
  const acc = useMemo(() => ({ dust: 0, spark: 0 }), []);

  useEffect(
    () =>
      onEvent((e) => {
        const { a, v } = tmp;
        const c = fk.cargo;
        if (e === 'purge' || e === 'airRelease') {
          // air dryer / brake valve under the cab, right side
          a.set(-1.2, 0.9, -1.6);
          truck.obj?.localToWorld(a);
          for (let i = 0; i < (e === 'purge' ? 18 : 8); i++) emit(dust, a, v.set(rnd(1.2), 0.3 + Math.random() * 0.6, rnd(1.2)), { life: 0.9, s0: 0.15, s1: 0.9, a: 0.35, color: '#f2f4f6', drag: 3 });
        } else if (e === 'setdown' || e === 'pickup') {
          // dust squeezed out from under the base frame
          for (let i = 0; i < 40; i++) {
            const k = Math.random();
            const side = Math.random() < 0.5 ? -1 : 1;
            const lx = (k - 0.5) * GENSET.hx * 2;
            const lz = side * GENSET.hz;
            a.set(c.x + Math.cos(c.yaw) * lx + Math.sin(c.yaw) * lz, c.y + 0.05, c.z - Math.sin(c.yaw) * lx + Math.cos(c.yaw) * lz);
            emit(dust, a, v.set(Math.sin(c.yaw) * side * 1.2 + rnd(0.5), 0.15, Math.cos(c.yaw) * side * 1.2 + rnd(0.5)), { life: 1.6, s0: 0.3, s1: 1.4, a: e === 'setdown' ? 0.28 : 0.15, color: '#b7ab97', drag: 2 });
          }
        } else if (e === 'crash' || e === 'bump' || e === 'thump') {
          const big = e === 'crash';
          const src = c.state === 'fallen' && big ? a.set(c.x, 0.3, c.z) : a.set(fk.x, 0.3, fk.z);
          for (let i = 0; i < (big ? 90 : 18); i++)
            emit(dust, src.clone().add(v.set(rnd(big ? 5 : 2), 0, rnd(big ? 5 : 2))), v.set(rnd(4), 0.6 + Math.random() * (big ? 2.5 : 1), rnd(4)), { life: big ? 3.5 : 1.4, s0: 0.6, s1: big ? 4.5 : 1.8, a: big ? 0.45 : 0.25, color: '#a99c87', drag: 1.2 });
        } else if (e === 'forkTouch') {
          for (const lx of forkCentres(fk)) {
            carriageWorld(lx, SPEC.forkL - 0.2, 0, a);
            for (let i = 0; i < 6; i++) emit(dust, a, v.set(rnd(0.8), 0.3, rnd(0.8)), { life: 0.8, s0: 0.12, s1: 0.6, a: 0.2, color: '#b3a995' });
          }
        }
      }),
    [dust, tmp],
  );

  useFrame(({ camera, size }, raw) => {
    const dt = Math.min(raw, 0.05);
    const scale = (size.height / 2) * (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5];
    dust.mat.uniforms.scale.value = scale;
    sparks.mat.uniforms.scale.value = scale;
    const { a, v } = tmp;
    const sp = Math.abs(fk.v);
    // tyre dust behind the four contact patches
    acc.dust += (sp > 0.6 ? sp * 1.5 : 0) * dt + fk.squeal * 60 * dt;
    while (acc.dust > 1 && truck.obj) {
      acc.dust -= 1;
      const rear = Math.random() < 0.5;
      const lx = (Math.random() < 0.5 ? -1 : 1) * (rear ? 1.25 : 1.15);
      a.set(lx, 0.08, rear ? -SPEC.wheelbase : 0);
      truck.obj.localToWorld(a);
      const back = -Math.sign(fk.v || 1);
      v.set(Math.sin(fk.heading) * back * (0.4 + sp * 0.15) + rnd(0.6), 0.25 + Math.random() * 0.4, Math.cos(fk.heading) * back * (0.4 + sp * 0.15) + rnd(0.6));
      emit(dust, a, v, { life: 1.6 + fk.squeal, s0: 0.3, s1: 1.6 + fk.squeal * 1.5, a: 0.08 + 0.22 * fk.squeal, color: fk.squeal > 0.3 ? '#9d9a95' : '#b9ae9a', drag: 1.4 });
    }
    // sparks where the fork tips drag
    acc.spark += fk.scrape * 140 * dt;
    while (acc.spark > 1) {
      acc.spark -= 1;
      const lx = forkCentres(fk)[Math.random() < 0.5 ? 0 : 1];
      carriageWorld(lx, SPEC.forkL - 0.05 - Math.random() * 0.4, 0, a);
      const back = -Math.sign(fk.v || 1);
      v.set(Math.sin(fk.heading) * back * (1.5 + Math.random() * 2) + rnd(1.5), 0.5 + Math.random() * 1.6, Math.cos(fk.heading) * back * (1.5 + Math.random() * 2) + rnd(1.5));
      emit(sparks, a, v, { life: 0.4 + Math.random() * 0.35, s0: 0.09, s1: 0.03, a: 1, color: Math.random() < 0.5 ? '#ffd27a' : '#ff8a2a', g: 1, drag: 0.6 });
    }
    update(dust, dt);
    update(sparks, dt);
  });

  return (
    <>
      <points geometry={dust.geo} material={dust.mat} frustumCulled={false} />
      <points geometry={sparks.geo} material={sparks.mat} frustumCulled={false} />
    </>
  );
}
