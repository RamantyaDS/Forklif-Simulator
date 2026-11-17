// Small geometry helpers for the simulation: oriented boxes on the ground plane with a height range, and the
// overlap test used for every collision (separating axes in plan view, then the height ranges).

/** A box standing on the ground plane: centre (x, z), half sizes along its own axes, yaw, and its height range. */
export interface Obb {
  x: number;
  z: number;
  hx: number; // half size along the box's local x
  hz: number; // half size along the box's local z
  yaw: number; // rotation about y, same convention as headings (local +z → (sin yaw, cos yaw))
  y0: number;
  y1: number;
  id?: string;
}

/** World direction of a box's local x and z axes. */
function axes(b: Obb) {
  const s = Math.sin(b.yaw);
  const c = Math.cos(b.yaw);
  return { ax: [c, -s] as const, az: [s, c] as const };
}

function project(b: Obb, nx: number, nz: number) {
  const { ax, az } = axes(b);
  const centre = b.x * nx + b.z * nz;
  const r = Math.abs(ax[0] * nx + ax[1] * nz) * b.hx + Math.abs(az[0] * nx + az[1] * nz) * b.hz;
  return [centre - r, centre + r] as const;
}

/** True when two boxes overlap (with an optional margin in metres). */
export function overlaps(a: Obb, b: Obb, margin = 0) {
  if (a.y1 <= b.y0 + margin || b.y1 <= a.y0 + margin) return false;
  for (const box of [a, b]) {
    const { ax, az } = axes(box);
    for (const [nx, nz] of [ax, az]) {
      const [a0, a1] = project(a, nx, nz);
      const [b0, b1] = project(b, nx, nz);
      if (a1 <= b0 + margin || b1 <= a0 + margin) return false;
    }
  }
  return true;
}

/** Point inside a box in plan view. */
export function inside(b: Obb, x: number, z: number, pad = 0) {
  const { ax, az } = axes(b);
  const dx = x - b.x;
  const dz = z - b.z;
  return Math.abs(dx * ax[0] + dz * ax[1]) <= b.hx + pad && Math.abs(dx * az[0] + dz * az[1]) <= b.hz + pad;
}

/** A local point (lx sideways, lz forward) of a frame at (x, z, yaw), in world coordinates. */
export function toWorld(x: number, z: number, yaw: number, lx: number, lz: number): [number, number] {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  return [x + lz * s + lx * c, z + lz * c - lx * s];
}

/** A world point in the local frame of (x, z, yaw): [lx, lz]. */
export function toLocal(x: number, z: number, yaw: number, wx: number, wz: number): [number, number] {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const dx = wx - x;
  const dz = wz - z;
  return [dx * c - dz * s, dx * s + dz * c];
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
