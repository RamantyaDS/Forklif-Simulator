// Wear on painted steel without UV maps: a shader patch that adds, in the part's own space (so it stays put as the
// machine moves), paint mottling, grime and dried mud (heavier low down), chipped paint showing dark steel on edges
// and rust. Used on the forklift, the trucks, containers and loads so they look worked, not fresh from the factory.
import * as THREE from 'three';

export interface Wear {
  /** grime everywhere 0…1 */
  dirt?: number;
  /** extra mud below this world height (m) */
  mudBelow?: number;
  mud?: number;
  /** chipped paint 0…1 */
  chips?: number;
  rust?: number;
  /** noise scale (1/m) */
  scale?: number;
  dirtColor?: string;
}

const NOISE = /* glsl */ `
float wHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wHash(i), wHash(i + vec3(1,0,0)), f.x), mix(wHash(i + vec3(0,1,0)), wHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wHash(i + vec3(0,0,1)), wHash(i + vec3(1,0,1)), f.x), mix(wHash(i + vec3(0,1,1)), wHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float wFbm(vec3 p) { return 0.5 * wNoise(p) + 0.25 * wNoise(p * 2.03) + 0.125 * wNoise(p * 4.01) + 0.0625 * wNoise(p * 8.07); }
`;

export function weather(m: THREE.MeshStandardMaterial, o: Wear) {
  const u = {
    wDirt: { value: o.dirt ?? 0.25 },
    wMudBelow: { value: o.mudBelow ?? 1.2 },
    wMud: { value: o.mud ?? 0.6 },
    wChips: { value: o.chips ?? 0.3 },
    wRust: { value: o.rust ?? 0 },
    wScale: { value: o.scale ?? 1.6 },
    wDirtColor: { value: new THREE.Color(o.dirtColor ?? '#5b4a36') },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWObj;\nvarying vec3 vWPos;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vWObj = transformed;
        vec4 wpw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wpw = instanceMatrix * wpw;
        #endif
        vWPos = (modelMatrix * wpw).xyz;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWObj; varying vec3 vWPos;
        uniform float wDirt, wMudBelow, wMud, wChips, wRust, wScale; uniform vec3 wDirtColor;
        ${NOISE}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec3 wp = vWObj * wScale;
        float mott = wNoise(wp * 2.3);
        diffuseColor.rgb *= 0.9 + 0.2 * mott;
        float n = wFbm(wp);
        float low = smoothstep(wMudBelow, wMudBelow - 1.0, vWPos.y) * wMud;
        float grime = clamp(wDirt * smoothstep(0.25, 0.95, n) + low * smoothstep(0.15, 0.7, wFbm(wp * 1.7 + 3.1)), 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, wDirtColor * (0.8 + 0.4 * n), grime * 0.7);
        // streaks running down
        float streak = smoothstep(0.62, 0.9, wNoise(vec3(wp.x * 9.0, wp.y * 0.6, wp.z * 9.0))) * wDirt;
        diffuseColor.rgb *= 1.0 - streak * 0.35;
        // chipped paint: dark steel, rust around it
        float chip = smoothstep(0.86, 0.9, wNoise(wp * 11.0 + 7.0)) * wChips;
        float rust = smoothstep(0.55, 0.85, wFbm(wp * 3.0 + 11.0)) * wRust;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.22, 0.1), rust * 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.12, 0.12), chip);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + grime * 0.45 + rust * 0.3 - chip * 0.1, 0.05, 1.0);`,
      );
  };
  m.customProgramCacheKey = () => 'wear';
  return m;
}
