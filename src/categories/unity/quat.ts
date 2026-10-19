/**
 * Shared quaternion / Euler helpers for the Unity tools.
 *
 * Conventions used here (stated explicitly because this is where conversions
 * usually go wrong):
 * - Unity: left-handed, Y-up, Euler order ZXY (intrinsic).
 * - three.js / glTF: right-handed, Y-up, Euler order XYZ (intrinsic).
 * - Unity → three rotation conversion: negate the X and Y components of the
 *   quaternion (equivalent to conjugating the rotation by the Z-axis mirror).
 *   Positions convert by mirroring Z.
 */

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const DEG = Math.PI / 180;
export const toRad = (d: number): number => d * DEG;
export const toDeg = (r: number): number => r / DEG;
const clampUnit = (v: number): number => Math.min(1, Math.max(-1, v));

export function v3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function axisAngle(axis: 'x' | 'y' | 'z', angle: number): Quat {
  const s = Math.sin(angle / 2);
  return { x: axis === 'x' ? s : 0, y: axis === 'y' ? s : 0, z: axis === 'z' ? s : 0, w: Math.cos(angle / 2) };
}

/** Hamilton product — identical component algebra for both handednesses. */
export function mul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function normalize(q: Quat): Quat {
  const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}

/** Unity Euler (degrees, ZXY, left-handed) → Unity quaternion. */
export function unityEulerToQuat(x: number, y: number, z: number): Quat {
  // A left-handed rotation by θ is a right-handed rotation by −θ.
  const qx = axisAngle('x', -toRad(x));
  const qy = axisAngle('y', -toRad(y));
  const qz = axisAngle('z', -toRad(z));
  return normalize(mul(mul(qz, qx), qy));
}

/** three.js / glTF Euler (degrees, XYZ, right-handed) → quaternion. */
export function threeEulerToQuat(x: number, y: number, z: number): Quat {
  const qx = axisAngle('x', toRad(x));
  const qy = axisAngle('y', toRad(y));
  const qz = axisAngle('z', toRad(z));
  return normalize(mul(mul(qx, qy), qz));
}

/** Row-major 3×3 rotation matrix from a quaternion (right-handed formula). */
export function quatToMatrix3(q: Quat): number[] {
  const { x, y, z, w } = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

/** Extract ZXY Euler (degrees) from M = Rz·Rx·Ry. */
export function matrixToZxyEuler(m: number[]): Vec3 {
  const sb = clampUnit(m[7]);
  const b = Math.asin(sb);
  let a: number;
  let c: number;
  if (Math.abs(sb) < 0.999999) {
    a = Math.atan2(-m[1], m[4]);
    c = Math.atan2(-m[6], m[8]);
  } else {
    // Gimbal lock: fold the remaining freedom into the first angle.
    c = 0;
    a = Math.atan2(m[2], m[8] || 1e-9);
  }
  return v3(toDeg(a), toDeg(b), toDeg(c));
}

/** Extract XYZ Euler (degrees) from M = Rx·Ry·Rz. */
export function matrixToXyzEuler(m: number[]): Vec3 {
  const sy = clampUnit(m[2]);
  const b = Math.asin(sy);
  let a: number;
  let c: number;
  if (Math.abs(sy) < 0.999999) {
    a = Math.atan2(-m[5], m[8]);
    c = Math.atan2(-m[1], m[0]);
  } else {
    c = 0;
    a = Math.atan2(m[7], m[4] || 1e-9);
  }
  return v3(toDeg(a), toDeg(b), toDeg(c));
}

export function unityEulerToUnityQuat(x: number, y: number, z: number): Quat {
  return unityEulerToQuat(x, y, z);
}

export function unityQuatToThreeQuat(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: q.z, w: q.w };
}

export function threeQuatToUnityQuat(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: q.z, w: q.w };
}

export function unityQuatToEuler(q: Quat): Vec3 {
  return matrixToZxyEuler(quatToMatrix3(q));
}

export function threeQuatToEuler(q: Quat): Vec3 {
  return matrixToXyzEuler(quatToMatrix3(q));
}

/** Rotate a vector by a quaternion (same component formula both handednesses). */
export function rotateVector(q: Quat, v: Vec3): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return v3(
    v.x + q.w * tx + (q.y * tz - q.z * ty),
    v.y + q.w * ty + (q.z * tx - q.x * tz),
    v.z + q.w * tz + (q.x * ty - q.y * tx),
  );
}

export function slerp(a: Quat, b: Quat, t: number): Quat {
  let cosHalf = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let end = b;
  if (cosHalf < 0) {
    end = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
    cosHalf = -cosHalf;
  }
  if (cosHalf >= 0.9995) {
    return normalize({
      x: a.x + t * (end.x - a.x),
      y: a.y + t * (end.y - a.y),
      z: a.z + t * (end.z - a.z),
      w: a.w + t * (end.w - a.w),
    });
  }
  const halfTheta = Math.acos(cosHalf);
  const sinHalf = Math.sin(halfTheta);
  const wa = Math.sin((1 - t) * halfTheta) / sinHalf;
  const wb = Math.sin(t * halfTheta) / sinHalf;
  return {
    x: a.x * wa + end.x * wb,
    y: a.y * wa + end.y * wb,
    z: a.z * wa + end.z * wb,
    w: a.w * wa + end.w * wb,
  };
}

export function formatQuat(q: Quat, digits = 6): string {
  const f = (n: number) => (Object.is(n, -0) ? 0 : n).toFixed(digits);
  return `(${f(q.x)}, ${f(q.y)}, ${f(q.z)}, ${f(q.w)})`;
}

export function formatVec3(v: Vec3, digits = 4): string {
  const f = (n: number) => (Object.is(n, -0) ? 0 : n).toFixed(digits);
  return `(${f(v.x)}, ${f(v.y)}, ${f(v.z)})`;
}