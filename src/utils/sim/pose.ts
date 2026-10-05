/**
 * Offline pose buffers for Sample phase.
 * Reused across frames — do not put full Pose into reactive SimSnapshot.
 */

export type Pose = {
  boneCount: number
  trackCount: number
  /** Local translation xyz, length boneCount*3 */
  translation: Float32Array
  /** Local rotation xyzw, length boneCount*4 */
  rotation: Float32Array
  /** Local scale xyz, length boneCount*3 */
  scale: Float32Array
  /** Float tracks, length trackCount */
  tracks: Float32Array
}

export function createPose(boneCount: number, trackCount = 0): Pose {
  const n = Math.max(0, boneCount | 0)
  const t = Math.max(0, trackCount | 0)
  const pose: Pose = {
    boneCount: n,
    trackCount: t,
    translation: new Float32Array(n * 3),
    rotation: new Float32Array(n * 4),
    scale: new Float32Array(n * 3),
    tracks: new Float32Array(t),
  }
  identityPose(pose)
  return pose
}

export function identityPose(pose: Pose): void {
  const n = pose.boneCount
  for (let i = 0; i < n; i++) {
    const t = i * 3
    const r = i * 4
    pose.translation[t] = 0
    pose.translation[t + 1] = 0
    pose.translation[t + 2] = 0
    pose.rotation[r] = 0
    pose.rotation[r + 1] = 0
    pose.rotation[r + 2] = 0
    pose.rotation[r + 3] = 1
    pose.scale[t] = 1
    pose.scale[t + 1] = 1
    pose.scale[t + 2] = 1
  }
  pose.tracks.fill(0)
}

export function copyPose(dst: Pose, src: Pose): void {
  const n = Math.min(dst.boneCount, src.boneCount)
  dst.translation.set(src.translation.subarray(0, n * 3))
  dst.rotation.set(src.rotation.subarray(0, n * 4))
  dst.scale.set(src.scale.subarray(0, n * 3))
  const tn = Math.min(dst.trackCount, src.trackCount)
  if (tn > 0) dst.tracks.set(src.tracks.subarray(0, tn))
}

/** Linear blend A→B by alpha into dst (engine Interpolate subset). */
export function interpolatePose(dst: Pose, a: Pose, b: Pose, alpha: number): void {
  const t = Math.min(1, Math.max(0, alpha))
  const u = 1 - t
  const n = Math.min(dst.boneCount, a.boneCount, b.boneCount)
  for (let i = 0; i < n; i++) {
    const ti = i * 3
    const ri = i * 4
    dst.translation[ti] = a.translation[ti]! * u + b.translation[ti]! * t
    dst.translation[ti + 1] = a.translation[ti + 1]! * u + b.translation[ti + 1]! * t
    dst.translation[ti + 2] = a.translation[ti + 2]! * u + b.translation[ti + 2]! * t
    dst.scale[ti] = a.scale[ti]! * u + b.scale[ti]! * t
    dst.scale[ti + 1] = a.scale[ti + 1]! * u + b.scale[ti + 1]! * t
    dst.scale[ti + 2] = a.scale[ti + 2]! * u + b.scale[ti + 2]! * t
    nlerpQuat(
      dst.rotation,
      ri,
      a.rotation,
      ri,
      b.rotation,
      ri,
      t
    )
  }
  const tn = Math.min(dst.trackCount, a.trackCount, b.trackCount)
  for (let i = 0; i < tn; i++) {
    dst.tracks[i] = a.tracks[i]! * u + b.tracks[i]! * t
  }
}

/** Additive local: dst = base + weight * add (translation/scale add, rotation mul). */
export function blendAdditiveLocal(
  dst: Pose,
  base: Pose,
  add: Pose,
  weight: number,
  mask?: Uint8Array | null
): void {
  const w = weight
  const n = Math.min(dst.boneCount, base.boneCount, add.boneCount)
  copyPose(dst, base)
  if (!(w > 0)) return
  for (let i = 0; i < n; i++) {
    if (mask && !mask[i]) continue
    const ti = i * 3
    const ri = i * 4
    dst.translation[ti]! += add.translation[ti]! * w
    dst.translation[ti + 1]! += add.translation[ti + 1]! * w
    dst.translation[ti + 2]! += add.translation[ti + 2]! * w
    dst.scale[ti]! += (add.scale[ti]! - 1) * w
    dst.scale[ti + 1]! += (add.scale[ti + 1]! - 1) * w
    dst.scale[ti + 2]! += (add.scale[ti + 2]! - 1) * w
    // Simplified weighted quat: nlerp identity→add then mul onto base
    const tmp = scratchQuat
    nlerpQuat(tmp, 0, IDENTITY_QUAT, 0, add.rotation, ri, w)
    mulQuat(dst.rotation, ri, base.rotation, ri, tmp, 0)
  }
}

/** Per-bone lerp using 0/1 mask (BlendByMask / override). */
export function blendByMask(
  dst: Pose,
  base: Pose,
  overlay: Pose,
  weight: number,
  mask: Uint8Array
): void {
  const t = Math.min(1, Math.max(0, weight))
  const n = Math.min(dst.boneCount, base.boneCount, overlay.boneCount, mask.length)
  copyPose(dst, base)
  if (!(t > 0)) return
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue
    const ti = i * 3
    const ri = i * 4
    const u = 1 - t
    dst.translation[ti] = base.translation[ti]! * u + overlay.translation[ti]! * t
    dst.translation[ti + 1] = base.translation[ti + 1]! * u + overlay.translation[ti + 1]! * t
    dst.translation[ti + 2] = base.translation[ti + 2]! * u + overlay.translation[ti + 2]! * t
    dst.scale[ti] = base.scale[ti]! * u + overlay.scale[ti]! * t
    dst.scale[ti + 1] = base.scale[ti + 1]! * u + overlay.scale[ti + 1]! * t
    dst.scale[ti + 2] = base.scale[ti + 2]! * u + overlay.scale[ti + 2]! * t
    nlerpQuat(dst.rotation, ri, base.rotation, ri, overlay.rotation, ri, t)
  }
}

export type BoneTrs = {
  tx: number
  ty: number
  tz: number
  qx: number
  qy: number
  qz: number
  qw: number
  sx: number
  sy: number
  sz: number
}

export function readBoneTrs(pose: Pose, boneIndex: number): BoneTrs | null {
  if (boneIndex < 0 || boneIndex >= pose.boneCount) return null
  const ti = boneIndex * 3
  const ri = boneIndex * 4
  return {
    tx: pose.translation[ti]!,
    ty: pose.translation[ti + 1]!,
    tz: pose.translation[ti + 2]!,
    qx: pose.rotation[ri]!,
    qy: pose.rotation[ri + 1]!,
    qz: pose.rotation[ri + 2]!,
    qw: pose.rotation[ri + 3]!,
    sx: pose.scale[ti]!,
    sy: pose.scale[ti + 1]!,
    sz: pose.scale[ti + 2]!,
  }
}

const IDENTITY_QUAT = new Float32Array([0, 0, 0, 1])
const scratchQuat = new Float32Array(4)

function nlerpQuat(
  dest: Float32Array,
  di: number,
  a: Float32Array,
  ai: number,
  b: Float32Array,
  bi: number,
  t: number
): void {
  let ax = a[ai]!,
    ay = a[ai + 1]!,
    az = a[ai + 2]!,
    aw = a[ai + 3]!
  let bx = b[bi]!,
    by = b[bi + 1]!,
    bz = b[bi + 2]!,
    bw = b[bi + 3]!
  if (ax * bx + ay * by + az * bz + aw * bw < 0) {
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }
  const u = 1 - t
  let x = ax * u + bx * t
  let y = ay * u + by * t
  let z = az * u + bz * t
  let w = aw * u + bw * t
  const len = Math.hypot(x, y, z, w) || 1
  dest[di] = x / len
  dest[di + 1] = y / len
  dest[di + 2] = z / len
  dest[di + 3] = w / len
}

function mulQuat(
  dest: Float32Array,
  di: number,
  a: Float32Array,
  ai: number,
  b: Float32Array,
  bi: number
): void {
  const ax = a[ai]!,
    ay = a[ai + 1]!,
    az = a[ai + 2]!,
    aw = a[ai + 3]!
  const bx = b[bi]!,
    by = b[bi + 1]!,
    bz = b[bi + 2]!,
    bw = b[bi + 3]!
  dest[di] = aw * bx + ax * bw + ay * bz - az * by
  dest[di + 1] = aw * by - ax * bz + ay * bw + az * bx
  dest[di + 2] = aw * bz + ax * by - ay * bx + az * bw
  dest[di + 3] = aw * bw - ax * bx - ay * by - az * bz
}
