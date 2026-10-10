/**
 * Clip pose library — sample bone TRS from WolvenKit .anims.glb companions.
 * Meta (events/duration) stays on ClipLibrary / .anims.json.
 *
 * On load:
 * 1) If extras.animationType is additive, strip glTF node local (bind) — same as
 *    WolvenKit AdditiveStripLocalTransform (engine stores deltas; GLB export bakes bind).
 * 2) Convert channels glTF Y-up → RED Z-up for Sample / .rig.json space.
 */

import type { Pose } from './pose'
import { clearStack, clearTrackStack } from './pose'
import type { RigEntry } from './rigResource'

/** animAnimationType — Normal or Additive* (engine / WolvenKit extras). */
export type AnimAnimationType =
  | 'Normal'
  | 'AdditiveFromRefPose'
  | 'AdditiveFromFirstFrame'
  | 'Additive'
  | 'AdditiveWithoutFirstFrame'
  | string

export type ClipPoseAnim = {
  name: string
  duration: number
  animationType: AnimAnimationType
  /** jointName → channel curves (RED Z-up; additive clips already stripped to deltas) */
  channels: Map<string, JointChannels>
}

type JointChannels = {
  t?: { times: Float32Array; values: Float32Array } // xyz
  r?: { times: Float32Array; values: Float32Array } // xyzw
  s?: { times: Float32Array; values: Float32Array } // xyz
}

export type ClipPoseSetView = {
  id: string
  sourceLabel: string
  setupEntryId: string | null
  animCount: number
  jointCount: number
}

/** Current sidecar / embed schema. */
export const CLIP_POSE_LIBRARY_VERSION = 1

/** Project-persisted pose curves (post GLB parse: additive strip + RED Z-up). */
export type ClipPoseLibraryJson = {
  $type: 'animClipPoseLibrary'
  version: number
  sets: ClipPoseSetJson[]
}

export function isClipPoseLibraryJson(data: unknown): data is ClipPoseLibraryJson {
  if (!data || typeof data !== 'object') return false
  const o = data as Record<string, unknown>
  if (!Array.isArray(o.sets)) return false
  if (!Number.isFinite(o.version) || (o.version as number) < 1) {
    return false
  }
  return true
}

export type ClipPoseSetJson = {
  id: string
  sourceLabel: string
  setupEntryId: string | null
  jointNames: string[]
  animations: ClipPoseAnimJson[]
}

export type ClipPoseAnimJson = {
  name: string
  duration: number
  animationType: AnimAnimationType
  channels: ClipPoseChannelJson[]
}

/** Compact: base64 of little-endian Float32. Legacy: number[]. */
export type ClipPoseTrackJson =
  | { encoding: 'f32b64'; times: string; values: string }
  | { times: number[]; values: number[] }

export type ClipPoseChannelJson = {
  joint: string
  t?: ClipPoseTrackJson
  r?: ClipPoseTrackJson
  s?: ClipPoseTrackJson
}

type PoseSet = {
  id: string
  sourceLabel: string
  /** setup entry id this glb was attached to (optional) */
  setupEntryId: string | null
  animations: Map<string, ClipPoseAnim>
  jointNames: string[]
}

let nextPoseSetId = 1

function f32ToB64(arr: Float32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)))
  }
  return btoa(binary)
}

function b64ToF32(b64: string): Float32Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Float32Array(bytes.buffer)
}

function trackToJson(
  track: { times: Float32Array; values: Float32Array } | undefined
): ClipPoseTrackJson | undefined {
  if (!track) return undefined
  return {
    encoding: 'f32b64',
    times: f32ToB64(track.times),
    values: f32ToB64(track.values),
  }
}

function trackFromJson(raw: ClipPoseTrackJson | undefined): {
  times: Float32Array
  values: Float32Array
} | undefined {
  if (!raw) return undefined
  if (
    'encoding' in raw &&
    raw.encoding === 'f32b64' &&
    typeof raw.times === 'string' &&
    typeof raw.values === 'string'
  ) {
    const times = b64ToF32(raw.times)
    const values = b64ToF32(raw.values)
    if (!times.length || !values.length) return undefined
    return { times, values }
  }
  if (!Array.isArray(raw.times) || !Array.isArray(raw.values)) return undefined
  if (raw.times.length === 0 || raw.values.length === 0) return undefined
  return {
    times: Float32Array.from(raw.times),
    values: Float32Array.from(raw.values),
  }
}

export class ClipPoseLibrary {
  private sets: PoseSet[] = []

  clear(): void {
    this.sets = []
  }

  get size(): number {
    return this.sets.length
  }

  get animCount(): number {
    let n = 0
    for (const s of this.sets) n += s.animations.size
    return n
  }

  listSets(): ClipPoseSetView[] {
    return this.sets.map((s) => ({
      id: s.id,
      sourceLabel: s.sourceLabel,
      setupEntryId: s.setupEntryId,
      animCount: s.animations.size,
      jointCount: s.jointNames.length,
    }))
  }

  getBySetupEntry(setupEntryId: string): ClipPoseSetView | null {
    const s = this.sets.find((x) => x.setupEntryId === setupEntryId)
    if (!s) return null
    return {
      id: s.id,
      sourceLabel: s.sourceLabel,
      setupEntryId: s.setupEntryId,
      animCount: s.animations.size,
      jointCount: s.jointNames.length,
    }
  }

  /** Duration + presence for HUD (scoped to setup entry when provided). */
  getAnimInfo(
    name: string,
    setupEntryId?: string | null
  ): { name: string; duration: number } | null {
    const anim = this.findAnimation(name, setupEntryId)
    if (!anim) return null
    return { name: anim.name, duration: anim.duration }
  }

  /** Animation names in a linked glb set (for UI). */
  listAnimNames(setupEntryId: string): string[] {
    const s = this.sets.find((x) => x.setupEntryId === setupEntryId)
    if (!s) return []
    return [...s.animations.keys()].sort((a, b) => a.localeCompare(b))
  }

  /** Attach / replace pose data for a setup entry (or standalone). */
  loadGlb(
    buffer: ArrayBuffer,
    sourceLabel: string,
    setupEntryId: string | null = null,
    /** Optional name→animationType from .anims.json (overrides / fills GLB extras). */
    animationTypes?: ReadonlyMap<string, string> | null
  ): { id: string; animCount: number } {
    const parsed = parseGlbAnimations(buffer, animationTypes ?? null)
    const id = `pose_${nextPoseSetId++}`
    // Replace existing for same setup entry
    if (setupEntryId) {
      this.sets = this.sets.filter((s) => s.setupEntryId !== setupEntryId)
    }
    this.sets.push({
      id,
      sourceLabel,
      setupEntryId,
      animations: parsed.animations,
      jointNames: parsed.jointNames,
    })
    return { id, animCount: parsed.animations.size }
  }

  removeBySetupEntry(setupEntryId: string): boolean {
    const before = this.sets.length
    this.sets = this.sets.filter((s) => s.setupEntryId !== setupEntryId)
    return this.sets.length < before
  }

  remove(id: string): boolean {
    const before = this.sets.length
    this.sets = this.sets.filter((s) => s.id !== id)
    return this.sets.length < before
  }

  toJson(): ClipPoseLibraryJson {
    return {
      $type: 'animClipPoseLibrary',
      version: CLIP_POSE_LIBRARY_VERSION,
      sets: this.sets.map((s) => ({
        id: s.id,
        sourceLabel: s.sourceLabel,
        setupEntryId: s.setupEntryId,
        jointNames: [...s.jointNames],
        animations: [...s.animations.values()].map((a) => ({
          name: a.name,
          duration: a.duration,
          animationType: a.animationType,
          channels: [...a.channels.entries()].map(([joint, ch]) => ({
            joint,
            t: trackToJson(ch.t),
            r: trackToJson(ch.r),
            s: trackToJson(ch.s),
          })),
        })),
      })),
    }
  }

  loadFromJson(data: ClipPoseLibraryJson): void {
    this.clear()
    const version = data.version ?? 1
    if (version > CLIP_POSE_LIBRARY_VERSION) {
      console.warn(
        `clipPoseLibrary version ${version} newer than supported ${CLIP_POSE_LIBRARY_VERSION}; skipping`
      )
      return
    }
    let maxNum = 0
    for (const raw of data.sets) {
      if (!raw || !Array.isArray(raw.animations)) continue
      const id =
        typeof raw.id === 'string' && raw.id.trim()
          ? raw.id.trim()
          : `pose_${nextPoseSetId++}`
      const m = /^pose_(\d+)$/.exec(id)
      if (m) maxNum = Math.max(maxNum, Number(m[1]))
      const animations = new Map<string, ClipPoseAnim>()
      for (const a of raw.animations) {
        if (!a?.name || typeof a.name !== 'string') continue
        const channels = new Map<string, JointChannels>()
        for (const ch of a.channels ?? []) {
          if (!ch?.joint || typeof ch.joint !== 'string') continue
          const jc: JointChannels = {}
          const t = trackFromJson(ch.t)
          const r = trackFromJson(ch.r)
          const s = trackFromJson(ch.s)
          if (t) jc.t = t
          if (r) jc.r = r
          if (s) jc.s = s
          if (jc.t || jc.r || jc.s) channels.set(ch.joint, jc)
        }
        animations.set(a.name, {
          name: a.name,
          duration: Number.isFinite(a.duration) ? a.duration : 0,
          animationType: (a.animationType || 'Normal') as AnimAnimationType,
          channels,
        })
      }
      this.sets.push({
        id,
        sourceLabel: raw.sourceLabel || id,
        setupEntryId:
          typeof raw.setupEntryId === 'string' && raw.setupEntryId.trim()
            ? raw.setupEntryId.trim()
            : null,
        animations,
        jointNames: Array.isArray(raw.jointNames) ? [...raw.jointNames] : [],
      })
    }
    if (maxNum >= nextPoseSetId) nextPoseSetId = maxNum + 1
  }

  hasAnimation(name: string, setupEntryId?: string | null): boolean {
    return this.findAnimation(name, setupEntryId) != null
  }

  /**
   * Find animation by name.
   * When `setupEntryId` is set — only that set (wrapper/priority resolve path).
   * When null/omitted — legacy scan of all sets (avoid for Sample).
   */
  findAnimation(name: string, setupEntryId?: string | null): ClipPoseAnim | null {
    if (!name || name === 'None') return null
    const lower = name.toLowerCase()
    const pick = (map: Map<string, ClipPoseAnim>): ClipPoseAnim | null => {
      const exact = map.get(name)
      if (exact) return exact
      for (const [k, v] of map) {
        if (k.toLowerCase() === lower) return v
      }
      return null
    }
    if (setupEntryId) {
      const s = this.sets.find((x) => x.setupEntryId === setupEntryId)
      return s ? pick(s.animations) : null
    }
    for (const s of this.sets) {
      const hit = pick(s.animations)
      if (hit) return hit
    }
    return null
  }

  /**
   * Sample animation into `out` sized for `rig` (map joints by name).
   * Pass `setupEntryId` from ClipLibrary.resolveClip winner so inactive sets are ignored.
   */
  sample(
    name: string,
    time: number,
    rig: RigEntry,
    out: Pose,
    setupEntryId?: string | null
  ): boolean {
    const anim = this.findAnimation(name, setupEntryId)
    if (!anim) return false
    // Start from reference pose (leaf — no procedural stack)
    out.translation.set(rig.refTranslation.subarray(0, out.boneCount * 3))
    out.rotation.set(rig.refRotation.subarray(0, out.boneCount * 4))
    out.scale.set(rig.refScale.subarray(0, out.boneCount * 3))
    clearStack(out)
    clearTrackStack(out)
    out.tracks.fill(0)
    const dur = anim.duration > 0 ? anim.duration : 0
    let t = time
    if (dur > 0) {
      t = ((t % dur) + dur) % dur
    }
    for (const [joint, ch] of anim.channels) {
      const idx = rig.boneIndexByName.get(joint.toLowerCase())
      if (idx === undefined || idx >= out.boneCount) continue
      const ti = idx * 3
      const ri = idx * 4
      if (ch.t) {
        sampleVec3(ch.t.times, ch.t.values, t, out.translation, ti)
      }
      if (ch.r) {
        sampleQuat(ch.r.times, ch.r.values, t, out.rotation, ri)
      }
      if (ch.s) {
        sampleVec3(ch.s.times, ch.s.values, t, out.scale, ti)
      }
    }
    return true
  }
}

function sampleVec3(
  times: Float32Array,
  values: Float32Array,
  t: number,
  out: Float32Array,
  oi: number
): void {
  const { i0, i1, a } = keyframeSpan(times, t)
  const a0 = i0 * 3
  const a1 = i1 * 3
  const u = 1 - a
  out[oi] = values[a0]! * u + values[a1]! * a
  out[oi + 1] = values[a0 + 1]! * u + values[a1 + 1]! * a
  out[oi + 2] = values[a0 + 2]! * u + values[a1 + 2]! * a
}

function sampleQuat(
  times: Float32Array,
  values: Float32Array,
  t: number,
  out: Float32Array,
  oi: number
): void {
  const { i0, i1, a } = keyframeSpan(times, t)
  const a0 = i0 * 4
  const a1 = i1 * 4
  let ax = values[a0]!,
    ay = values[a0 + 1]!,
    az = values[a0 + 2]!,
    aw = values[a0 + 3]!
  let bx = values[a1]!,
    by = values[a1 + 1]!,
    bz = values[a1 + 2]!,
    bw = values[a1 + 3]!
  if (ax * bx + ay * by + az * bz + aw * bw < 0) {
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }
  const u = 1 - a
  let x = ax * u + bx * a
  let y = ay * u + by * a
  let z = az * u + bz * a
  let w = aw * u + bw * a
  const len = Math.hypot(x, y, z, w) || 1
  out[oi] = x / len
  out[oi + 1] = y / len
  out[oi + 2] = z / len
  out[oi + 3] = w / len
}

function keyframeSpan(times: Float32Array, t: number): { i0: number; i1: number; a: number } {
  const n = times.length
  if (n <= 1) return { i0: 0, i1: 0, a: 0 }
  if (t <= times[0]!) return { i0: 0, i1: 0, a: 0 }
  if (t >= times[n - 1]!) return { i0: n - 1, i1: n - 1, a: 0 }
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (times[mid]! <= t) lo = mid
    else hi = mid
  }
  const t0 = times[lo]!
  const t1 = times[hi]!
  const a = t1 > t0 ? (t - t0) / (t1 - t0) : 0
  return { i0: lo, i1: hi, a }
}

type GltfJson = {
  nodes?: Array<{
    name?: string
    children?: number[]
    translation?: number[]
    rotation?: number[]
    scale?: number[]
  }>
  skins?: Array<{ joints?: number[]; inverseBindMatrices?: number }>
  animations?: Array<{
    name?: string
    extras?: unknown
    channels?: Array<{ sampler: number; target: { node: number; path: string } }>
    samplers?: Array<{ input: number; output: number; interpolation?: string }>
  }>
  accessors?: Array<{
    bufferView?: number
    byteOffset?: number
    componentType: number
    count: number
    type: string
    max?: number[]
    min?: number[]
  }>
  bufferViews?: Array<{ buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }>
  buffers?: Array<{ byteLength: number; uri?: string }>
}

function readGltfAnimExtras(extras: unknown): { animationType: AnimAnimationType } {
  let o = extras
  if (typeof o === 'string') {
    try {
      o = JSON.parse(o)
    } catch {
      return { animationType: 'Normal' }
    }
  }
  if (!o || typeof o !== 'object') return { animationType: 'Normal' }
  const rec = o as Record<string, unknown>
  const raw = rec.animationType ?? rec.AnimationType
  const animationType = typeof raw === 'string' && raw.trim() ? raw.trim() : 'Normal'
  return { animationType }
}

export function isAdditiveAnimationType(t: AnimAnimationType | undefined | null): boolean {
  if (!t || t === 'Normal') return false
  return t.startsWith('Additive')
}

function parseGlbAnimations(
  buffer: ArrayBuffer,
  animationTypes?: ReadonlyMap<string, string> | null
): {
  animations: Map<string, ClipPoseAnim>
  jointNames: string[]
} {
  const view = new DataView(buffer)
  if (view.byteLength < 12 || view.getUint32(0, true) !== 0x46546c67) {
    throw new Error('Not a GLB file')
  }
  let offset = 12
  let json: GltfJson | null = null
  let bin: ArrayBuffer | null = null
  while (offset + 8 <= view.byteLength) {
    const chunkLen = view.getUint32(offset, true)
    const chunkType = view.getUint32(offset + 4, true)
    offset += 8
    const chunk = buffer.slice(offset, offset + chunkLen)
    offset += chunkLen
    if (chunkType === 0x4e4f534a) {
      const text = new TextDecoder().decode(chunk).replace(/\0+$/, '')
      json = JSON.parse(text) as GltfJson
    } else if (chunkType === 0x004e4942) {
      bin = chunk
    }
  }
  if (!json) throw new Error('GLB missing JSON chunk')
  const binBuf = bin ?? new ArrayBuffer(0)

  const nodes = json.nodes ?? []
  const jointNames: string[] = []
  const skin = json.skins?.[0]
  const jointIndices = skin?.joints ?? nodes.map((_, i) => i)
  for (const ji of jointIndices) {
    jointNames.push(nodes[ji]?.name || `joint_${ji}`)
  }

  const readAccessor = (index: number): Float32Array => {
    const acc = json!.accessors?.[index]
    if (!acc) return new Float32Array()
    const bv = json!.bufferViews?.[acc.bufferView ?? -1]
    if (!bv) return new Float32Array()
    const byteOffset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0)
    const comps = accessorComponents(acc.type)
    const count = acc.count * comps
    if (acc.componentType === 5126) {
      return new Float32Array(binBuf, byteOffset, count)
    }
    const out = new Float32Array(count)
    const dv = new DataView(binBuf, byteOffset)
    for (let i = 0; i < count; i++) {
      if (acc.componentType === 5123) out[i] = dv.getUint16(i * 2, true)
      else if (acc.componentType === 5121) out[i] = dv.getUint8(i)
      else if (acc.componentType === 5125) out[i] = dv.getUint32(i * 4, true)
      else out[i] = dv.getFloat32(i * 4, true)
    }
    return out
  }

  const animations = new Map<string, ClipPoseAnim>()
  const animList = json.animations ?? []
  for (let ai = 0; ai < animList.length; ai++) {
    const a = animList[ai]!
    const name = (a.name && a.name.trim()) || `anim_${ai}`
    const fromExtras = readGltfAnimExtras(a.extras).animationType
    const fromMeta =
      animationTypes?.get(name) ??
      (() => {
        if (!animationTypes) return undefined
        const lower = name.toLowerCase()
        for (const [k, v] of animationTypes) {
          if (k.toLowerCase() === lower) return v
        }
        return undefined
      })()
    // Prefer .anims.json type when present (ground truth); else GLB extras.
    const animationType = (fromMeta || fromExtras || 'Normal') as AnimAnimationType
    const stripAdditive = isAdditiveAnimationType(animationType)
    const channels = new Map<string, JointChannels>()
    let duration = 0
    for (const ch of a.channels ?? []) {
      const samp = a.samplers?.[ch.sampler]
      if (!samp) continue
      const node = nodes[ch.target.node]
      const joint = node?.name || `joint_${ch.target.node}`
      const times = readAccessor(samp.input)
      const values = Float32Array.from(readAccessor(samp.output))
      if (times.length) duration = Math.max(duration, times[times.length - 1]!)
      let jc = channels.get(joint)
      if (!jc) {
        jc = {}
        channels.set(joint, jc)
      }
      const path = ch.target.path
      if (path === 'translation') {
        if (stripAdditive) {
          const lt = node?.translation ?? [0, 0, 0]
          stripAdditiveTranslationTrack(values, lt[0] ?? 0, lt[1] ?? 0, lt[2] ?? 0)
        }
        gltfTranslationTrackToRed(values)
        jc.t = { times: Float32Array.from(times), values }
      } else if (path === 'rotation') {
        if (stripAdditive) {
          const lr = node?.rotation ?? [0, 0, 0, 1]
          stripAdditiveRotationTrack(values, lr[0] ?? 0, lr[1] ?? 0, lr[2] ?? 0, lr[3] ?? 1)
        }
        gltfRotationTrackToRed(values)
        jc.r = { times: Float32Array.from(times), values }
      } else if (path === 'scale') {
        if (stripAdditive) {
          const ls = node?.scale ?? [1, 1, 1]
          stripAdditiveScaleTrack(values, ls[0] ?? 1, ls[1] ?? 1, ls[2] ?? 1)
        }
        gltfScaleTrackToRed(values)
        jc.s = { times: Float32Array.from(times), values }
      }
    }
    animations.set(name, { name, duration, animationType, channels })
  }

  return { animations, jointNames }
}

/** WolvenKit export: absT = localT + delta → strip delta = abs - local (glTF space). */
function stripAdditiveTranslationTrack(
  values: Float32Array,
  lx: number,
  ly: number,
  lz: number
): void {
  for (let i = 0; i + 2 < values.length; i += 3) {
    values[i]! -= lx
    values[i + 1]! -= ly
    values[i + 2]! -= lz
  }
}

/** Export: absR = localR * delta → delta = inv(localR) * absR. */
function stripAdditiveRotationTrack(
  values: Float32Array,
  lqx: number,
  lqy: number,
  lqz: number,
  lqw: number
): void {
  const ix = -lqx
  const iy = -lqy
  const iz = -lqz
  const iw = lqw
  for (let i = 0; i + 3 < values.length; i += 4) {
    const qx = values[i]!
    const qy = values[i + 1]!
    const qz = values[i + 2]!
    const qw = values[i + 3]!
    let rx = iw * qx + ix * qw + iy * qz - iz * qy
    let ry = iw * qy - ix * qz + iy * qw + iz * qx
    let rz = iw * qz + ix * qy - iy * qx + iz * qw
    let rw = iw * qw - ix * qx - iy * qy - iz * qz
    const len = Math.hypot(rx, ry, rz, rw) || 1
    values[i] = rx / len
    values[i + 1] = ry / len
    values[i + 2] = rz / len
    values[i + 3] = rw / len
  }
}

/** Export: absS = localS * delta → delta = abs / local. */
function stripAdditiveScaleTrack(
  values: Float32Array,
  lsx: number,
  lsy: number,
  lsz: number
): void {
  for (let i = 0; i + 2 < values.length; i += 3) {
    values[i] = lsx !== 0 ? values[i]! / lsx : values[i]!
    values[i + 1] = lsy !== 0 ? values[i + 1]! / lsy : values[i + 1]!
    values[i + 2] = lsz !== 0 ? values[i + 2]! / lsz : values[i + 2]!
  }
}

/**
 * glTF Y-up → RED Z-up.
 * Inverse of RED→glTF: (x,y,z)_RED → (x, z, -y)_glTF
 * so (x,y,z)_RED = (x_g, -z_g, y_g).
 */
function gltfTranslationTrackToRed(values: Float32Array): void {
  for (let i = 0; i + 2 < values.length; i += 3) {
    const x = values[i]!
    const y = values[i + 1]!
    const z = values[i + 2]!
    values[i] = x
    values[i + 1] = -z
    values[i + 2] = y
  }
}

/** Scale axes follow the same remapping (no signs). */
function gltfScaleTrackToRed(values: Float32Array): void {
  for (let i = 0; i + 2 < values.length; i += 3) {
    const sx = values[i]!
    const sy = values[i + 1]!
    const sz = values[i + 2]!
    values[i] = sx
    values[i + 1] = sz
    values[i + 2] = sy
  }
}

/** q_RED = q_Minv * q_glTF * q_M, M = Rx(-90°) maps RED vectors into glTF. */
const Q_M_X = -Math.SQRT1_2
const Q_M_W = Math.SQRT1_2
const Q_MINV_X = Math.SQRT1_2
const Q_MINV_W = Math.SQRT1_2

function gltfRotationTrackToRed(values: Float32Array): void {
  for (let i = 0; i + 3 < values.length; i += 4) {
    const qx = values[i]!
    const qy = values[i + 1]!
    const qz = values[i + 2]!
    const qw = values[i + 3]!
    // t = q_g * q_M
    const tx = qw * Q_M_X + qx * Q_M_W
    const ty = qy * Q_M_W + qz * Q_M_X
    const tz = -qy * Q_M_X + qz * Q_M_W
    const tw = qw * Q_M_W - qx * Q_M_X
    // q_r = q_Minv * t
    let rx = Q_MINV_W * tx + Q_MINV_X * tw
    let ry = Q_MINV_W * ty - Q_MINV_X * tz
    let rz = Q_MINV_W * tz + Q_MINV_X * ty
    let rw = Q_MINV_W * tw - Q_MINV_X * tx
    const len = Math.hypot(rx, ry, rz, rw) || 1
    values[i] = rx / len
    values[i + 1] = ry / len
    values[i + 2] = rz / len
    values[i + 3] = rw / len
  }
}

function accessorComponents(type: string): number {
  switch (type) {
    case 'SCALAR':
      return 1
    case 'VEC2':
      return 2
    case 'VEC3':
      return 3
    case 'VEC4':
      return 4
    case 'MAT4':
      return 16
    default:
      return 1
  }
}
