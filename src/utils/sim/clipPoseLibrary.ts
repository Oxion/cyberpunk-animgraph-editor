/**
 * Clip pose library — sample bone TRS from WolvenKit .anims.glb companions.
 * Meta (events/duration) stays on ClipLibrary / .anims.json.
 */

import type { Pose } from './pose'
import type { RigEntry } from './rigResource'

export type ClipPoseAnim = {
  name: string
  duration: number
  /** jointName → channel curves */
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

type PoseSet = {
  id: string
  sourceLabel: string
  /** setup entry id this glb was attached to (optional) */
  setupEntryId: string | null
  animations: Map<string, ClipPoseAnim>
  jointNames: string[]
}

let nextPoseSetId = 1

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
    setupEntryId: string | null = null
  ): { id: string; animCount: number } {
    const parsed = parseGlbAnimations(buffer)
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
    // Start from reference pose
    out.translation.set(rig.refTranslation.subarray(0, out.boneCount * 3))
    out.rotation.set(rig.refRotation.subarray(0, out.boneCount * 4))
    out.scale.set(rig.refScale.subarray(0, out.boneCount * 3))
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
  nodes?: Array<{ name?: string; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }>
  skins?: Array<{ joints?: number[]; inverseBindMatrices?: number }>
  animations?: Array<{
    name?: string
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

function parseGlbAnimations(buffer: ArrayBuffer): {
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
    // Convert other types to float
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
      if (path === 'translation') jc.t = { times: Float32Array.from(times), values }
      else if (path === 'rotation') jc.r = { times: Float32Array.from(times), values }
      else if (path === 'scale') jc.s = { times: Float32Array.from(times), values }
    }
    animations.set(name, { name, duration, channels })
  }

  return { animations, jointNames }
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
