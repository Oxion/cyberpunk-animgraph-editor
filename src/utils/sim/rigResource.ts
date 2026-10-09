/**
 * Rig palette for offline Sample — many loaded, one active.
 */

import { readCName, readNumber } from './simDataUtils'

export type RigId = string

export type RigPartMask = {
  name: string
  /** Per-bone weight 0/1 (or 0..1), length = boneCount */
  mask: Uint8Array
}

export type RigEntry = {
  id: RigId
  sourceLabel: string
  boneNames: string[]
  boneParents: number[]
  /** Local-space reference / A-pose translation xyz per bone */
  refTranslation: Float32Array
  refRotation: Float32Array
  refScale: Float32Array
  trackNames: string[]
  parts: RigPartMask[]
  /** boneName lower → index */
  boneIndexByName: Map<string, number>
}

export type RigEntryView = {
  id: RigId
  sourceLabel: string
  boneCount: number
  partCount: number
  trackCount: number
  active: boolean
}

/** Compact project JSON (no raw WolvenKit wrapper). */
export type RigLibraryJson = {
  $type: 'animRigLibrary'
  activeRigId: string | null
  entries: Array<{
    id: string
    sourceLabel: string
    boneNames: string[]
    boneParents: number[]
    refTranslation: number[]
    refRotation: number[]
    refScale: number[]
    trackNames: string[]
    parts: Array<{ name: string; mask: number[] }>
  }>
}

function unwrap(obj: unknown): Record<string, unknown> | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  if (o.Data && typeof o.Data === 'object') {
    const data = o.Data as Record<string, unknown>
    if (data.RootChunk && typeof data.RootChunk === 'object') {
      return data.RootChunk as Record<string, unknown>
    }
    return data
  }
  return o
}

function readCNameArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const v of value) {
    const n = readCName(v)
    if (n && n !== 'None') out.push(n)
    else if (typeof v === 'string' && v) out.push(v)
  }
  return out
}

function readQsTranslation(qs: unknown, out: Float32Array, i: number): void {
  const o = unwrap(qs) ?? (qs as Record<string, unknown> | null)
  const t = (o?.Translation ?? o?.translation) as Record<string, unknown> | undefined
  out[i * 3] = readNumber(t?.X ?? t?.x, 0)
  out[i * 3 + 1] = readNumber(t?.Y ?? t?.y, 0)
  out[i * 3 + 2] = readNumber(t?.Z ?? t?.z, 0)
}

function readQsRotation(qs: unknown, out: Float32Array, i: number): void {
  const o = unwrap(qs) ?? (qs as Record<string, unknown> | null)
  const r = (o?.Rotation ?? o?.rotation) as Record<string, unknown> | undefined
  out[i * 4] = readNumber(r?.i ?? r?.X ?? r?.x, 0)
  out[i * 4 + 1] = readNumber(r?.j ?? r?.Y ?? r?.y, 0)
  out[i * 4 + 2] = readNumber(r?.k ?? r?.Z ?? r?.z, 0)
  out[i * 4 + 3] = readNumber(r?.r ?? r?.W ?? r?.w, 1)
}

function readQsScale(qs: unknown, out: Float32Array, i: number): void {
  const o = unwrap(qs) ?? (qs as Record<string, unknown> | null)
  const s = (o?.Scale ?? o?.scale) as Record<string, unknown> | undefined
  out[i * 3] = readNumber(s?.X ?? s?.x, 1)
  out[i * 3 + 1] = readNumber(s?.Y ?? s?.y, 1)
  out[i * 3 + 2] = readNumber(s?.Z ?? s?.z, 1)
}

function buildBoneIndexMap(names: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < names.length; i++) {
    m.set(names[i]!.toLowerCase(), i)
  }
  return m
}

/** WolvenKit CName: bare string or `{ $type:'CName', $value }`. */
type WkitCNameJson = string | { $value?: string | number | null }

/** anim::RigPartBone */
type AnimRigPartBoneJson = {
  bone?: WkitCNameJson
  name?: WkitCNameJson
  weight?: number | string
}

/** anim::RigPartBoneTree */
type AnimRigPartBoneTreeJson = {
  rootBone?: WkitCNameJson
  bone?: WkitCNameJson
  name?: WkitCNameJson
  weight?: number | string
  subtreesToChange?: AnimRigPartBoneTreeJson[]
}

/** anim::TransformMask (baked, rarely present — notSerialized in engine). */
type AnimTransformMaskJson = {
  index?: number | string
  Index?: number | string
  weight?: number | string
  WeightValue?: number | string
}

/** anim::RigPart from .rig.json */
type AnimRigPartJson = {
  name?: WkitCNameJson
  mask?: Array<number | AnimTransformMaskJson>
  singleBones?: Array<AnimRigPartBoneJson | WkitCNameJson>
  treeBones?: AnimRigPartBoneTreeJson[]
}

type WkitDataWrapper<T> = { Data: T }

function isObject(value: object | string | number | boolean | null | undefined): value is object {
  return value !== null && typeof value === 'object'
}

function unwrapDataWrapper<T extends object>(raw: object): T {
  if ('Data' in raw && isObject((raw as WkitDataWrapper<object>).Data)) {
    return (raw as WkitDataWrapper<T>).Data
  }
  return raw as T
}

function asAnimRigPart(raw: object): AnimRigPartJson {
  return unwrapDataWrapper<AnimRigPartJson>(raw)
}

function asPartBone(raw: object): AnimRigPartBoneJson {
  return unwrapDataWrapper<AnimRigPartBoneJson>(raw)
}

function asPartBoneTree(raw: object): AnimRigPartBoneTreeJson {
  return unwrapDataWrapper<AnimRigPartBoneTreeJson>(raw)
}

function asTransformMask(raw: object): AnimTransformMaskJson {
  return unwrapDataWrapper<AnimTransformMaskJson>(raw)
}

function readPartBoneEntry(raw: AnimRigPartBoneJson | WkitCNameJson): AnimRigPartBoneJson | null {
  if (typeof raw === 'string') return { bone: raw, weight: 1 }
  if (!isObject(raw)) return null
  // CName object used as bare entry
  if ('$value' in raw && !('bone' in raw) && !('name' in raw)) {
    return { bone: raw as WkitCNameJson, weight: 1 }
  }
  return asPartBone(raw)
}

/** anim::RigPart FillTree — mark bone + all descendants. */
function fillBoneTree(
  rootIdx: number,
  boneParents: number[],
  mask: Uint8Array,
  boneCount: number
): void {
  if (rootIdx < 0 || rootIdx >= boneCount) return
  mask[rootIdx] = 1
  for (let i = rootIdx + 1; i < boneCount; i++) {
    if (boneParents[i] === rootIdx) fillBoneTree(i, boneParents, mask, boneCount)
  }
}

/**
 * Build per-bone 0/1 mask from animRig part.
 * Engine: m_mask is notSerialized — WolvenKit JSON usually has singleBones/treeBones only.
 * treeBones.rootBone expands to full subtree (RigPart::CacheData / FillTree).
 */
function parsePartMask(
  partRaw: object | string | number | boolean | null | undefined,
  boneCount: number,
  boneIndexByName: Map<string, number>,
  boneParents: number[]
): RigPartMask | null {
  if (!isObject(partRaw)) return null
  const p = asAnimRigPart(partRaw)
  const name = readCName(p.name) || 'None'
  const mask = new Uint8Array(boneCount)

  const maskArr = p.mask
  if (Array.isArray(maskArr) && maskArr.length > 0) {
    const first = maskArr[0]
    if (isObject(first)) {
      for (const entry of maskArr) {
        if (!isObject(entry)) continue
        const e = asTransformMask(entry)
        const idx = readNumber(e.index ?? e.Index, -1)
        const w = readNumber(e.weight ?? e.WeightValue, 1)
        if (idx >= 0 && idx < boneCount && w > 0) mask[idx] = 1
      }
    } else if (maskArr.length === boneCount || typeof first === 'number') {
      for (let i = 0; i < Math.min(boneCount, maskArr.length); i++) {
        const v = Number(maskArr[i])
        mask[i] = Number.isFinite(v) && v > 0 ? 1 : 0
      }
    }
  }

  // Always apply singleBones / treeBones (source of truth when mask not serialized)
  const singles = Array.isArray(p.singleBones) ? p.singleBones : []
  for (const raw of singles) {
    const e = readPartBoneEntry(raw)
    if (!e) continue
    const bn = readCName(e.bone ?? e.name)
    const w = readNumber(e.weight, 1)
    if (!bn || w <= 0) continue
    const idx = boneIndexByName.get(bn.toLowerCase())
    if (idx !== undefined) mask[idx] = 1
  }

  const trees = Array.isArray(p.treeBones) ? p.treeBones : []
  for (const raw of trees) {
    applyPartBoneTree(raw, boneIndexByName, boneParents, mask, boneCount)
  }

  return { name, mask }
}

/** RigPartBoneTree: fill subtrees first, then rootBone + descendants. */
function applyPartBoneTree(
  raw: AnimRigPartBoneTreeJson | object,
  boneIndexByName: Map<string, number>,
  boneParents: number[],
  mask: Uint8Array,
  boneCount: number
): void {
  if (!isObject(raw)) return
  const e = asPartBoneTree(raw)
  const subs = Array.isArray(e.subtreesToChange) ? e.subtreesToChange : []
  for (const sub of subs) {
    applyPartBoneTree(sub, boneIndexByName, boneParents, mask, boneCount)
  }
  const rootName = readCName(e.rootBone ?? e.bone ?? e.name)
  const w = readNumber(e.weight, 1)
  if (!rootName || w <= 0) return
  const idx = boneIndexByName.get(rootName.toLowerCase())
  if (idx === undefined) return
  fillBoneTree(idx, boneParents, mask, boneCount)
}

/** Parse WolvenKit .rig.json (animRig) into RigEntry fields (id assigned by library). */
export function parseRigJson(
  json: unknown,
  sourceLabel: string,
  id: RigId
): RigEntry {
  const root = unwrap(json)
  if (!root) throw new Error('Invalid rig JSON')
  const type = typeof root.$type === 'string' ? root.$type : ''
  if (type && type !== 'animRig') {
    // Some exports omit $type on RootChunk; still try if boneNames present
    if (!Array.isArray(root.boneNames)) {
      throw new Error(`Expected animRig, got ${type || typeof json}`)
    }
  }
  const boneNames = readCNameArray(root.boneNames)
  if (!boneNames.length) throw new Error('Rig has no boneNames')
  const parentsRaw = Array.isArray(root.boneParentIndexes) ? root.boneParentIndexes : []
  const boneParents = boneNames.map((_, i) => {
    const v = Number(parentsRaw[i])
    return Number.isFinite(v) ? v : -1
  })
  const n = boneNames.length
  const refTranslation = new Float32Array(n * 3)
  const refRotation = new Float32Array(n * 4)
  const refScale = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    refRotation[i * 4 + 3] = 1
    refScale[i * 3] = 1
    refScale[i * 3 + 1] = 1
    refScale[i * 3 + 2] = 1
  }
  const transforms = Array.isArray(root.boneTransforms)
    ? root.boneTransforms
    : Array.isArray(root.aPoseLS)
      ? root.aPoseLS
      : []
  for (let i = 0; i < Math.min(n, transforms.length); i++) {
    readQsTranslation(transforms[i], refTranslation, i)
    readQsRotation(transforms[i], refRotation, i)
    readQsScale(transforms[i], refScale, i)
  }
  const trackNames = readCNameArray(root.trackNames)
  const boneIndexByName = buildBoneIndexMap(boneNames)
  const parts: RigPartMask[] = []
  if (Array.isArray(root.parts)) {
    for (const pr of root.parts) {
      const part = parsePartMask(pr, n, boneIndexByName, boneParents)
      if (part) parts.push(part)
    }
  }
  return {
    id,
    sourceLabel,
    boneNames,
    boneParents,
    refTranslation,
    refRotation,
    refScale,
    trackNames,
    parts,
    boneIndexByName,
  }
}

export function getRigPartMask(rig: RigEntry, partName: string): Uint8Array | null {
  if (!partName || partName === 'None') return null
  const lower = partName.toLowerCase()
  for (const p of rig.parts) {
    if (p.name.toLowerCase() === lower) return p.mask
  }
  return null
}

/** Resolve named float track index on rig (−1 if missing). */
export function trackIndexByName(rig: RigEntry, name: string): number {
  if (!name || name === 'None') return -1
  const key = name.toLowerCase()
  for (let i = 0; i < rig.trackNames.length; i++) {
    if (rig.trackNames[i]!.toLowerCase() === key) return i
  }
  return -1
}

let nextRigSeq = 1

export class RigLibrary {
  private entries = new Map<RigId, RigEntry>()
  private order: RigId[] = []
  activeRigId: RigId | null = null

  clear(): void {
    this.entries.clear()
    this.order = []
    this.activeRigId = null
  }

  get size(): number {
    return this.entries.size
  }

  getActive(): RigEntry | null {
    if (!this.activeRigId) return null
    return this.entries.get(this.activeRigId) ?? null
  }

  list(): RigEntryView[] {
    return this.order.map((id) => {
      const e = this.entries.get(id)!
      return {
        id,
        sourceLabel: e.sourceLabel,
        boneCount: e.boneNames.length,
        partCount: e.parts.length,
        trackCount: e.trackNames.length,
        active: id === this.activeRigId,
      }
    })
  }

  addFromJson(json: unknown, sourceLabel: string): RigId {
    const id = `rig_${nextRigSeq++}`
    const entry = parseRigJson(json, sourceLabel || id, id)
    this.entries.set(id, entry)
    this.order.push(id)
    if (!this.activeRigId) this.activeRigId = id
    return id
  }

  /** Restore a previously exported entry (keeps id). */
  addEntry(entry: RigEntry, makeActive = false): void {
    if (this.entries.has(entry.id)) {
      this.entries.set(entry.id, entry)
    } else {
      this.entries.set(entry.id, entry)
      this.order.push(entry.id)
    }
    if (makeActive || !this.activeRigId) this.activeRigId = entry.id
  }

  remove(id: RigId): boolean {
    if (!this.entries.delete(id)) return false
    this.order = this.order.filter((x) => x !== id)
    if (this.activeRigId === id) {
      this.activeRigId = this.order[0] ?? null
    }
    return true
  }

  setActive(id: RigId | null): boolean {
    if (id == null) {
      this.activeRigId = null
      return true
    }
    if (!this.entries.has(id)) return false
    this.activeRigId = id
    return true
  }

  toJson(): RigLibraryJson {
    return {
      $type: 'animRigLibrary',
      activeRigId: this.activeRigId,
      entries: this.order.map((id) => {
        const e = this.entries.get(id)!
        return {
          id: e.id,
          sourceLabel: e.sourceLabel,
          boneNames: [...e.boneNames],
          boneParents: [...e.boneParents],
          refTranslation: [...e.refTranslation],
          refRotation: [...e.refRotation],
          refScale: [...e.refScale],
          trackNames: [...e.trackNames],
          parts: e.parts.map((p) => ({ name: p.name, mask: [...p.mask] })),
        }
      }),
    }
  }

  loadFromJson(data: RigLibraryJson): void {
    this.clear()
    if (!data || !Array.isArray(data.entries)) return
    for (const raw of data.entries) {
      if (!raw?.id || !Array.isArray(raw.boneNames)) continue
      const n = raw.boneNames.length
      const boneIndexByName = buildBoneIndexMap(raw.boneNames)
      const entry: RigEntry = {
        id: raw.id,
        sourceLabel: raw.sourceLabel || raw.id,
        boneNames: [...raw.boneNames],
        boneParents: Array.isArray(raw.boneParents)
          ? raw.boneParents.map((v) => (Number.isFinite(v) ? v : -1))
          : raw.boneNames.map(() => -1),
        refTranslation: Float32Array.from(
          raw.refTranslation?.length === n * 3 ? raw.refTranslation : new Array(n * 3).fill(0)
        ),
        refRotation: Float32Array.from(
          raw.refRotation?.length === n * 4
            ? raw.refRotation
            : (() => {
                const a = new Array(n * 4).fill(0)
                for (let i = 0; i < n; i++) a[i * 4 + 3] = 1
                return a
              })()
        ),
        refScale: Float32Array.from(
          raw.refScale?.length === n * 3
            ? raw.refScale
            : new Array(n * 3).fill(1)
        ),
        trackNames: Array.isArray(raw.trackNames) ? [...raw.trackNames] : [],
        parts: Array.isArray(raw.parts)
          ? raw.parts.map((p) => ({
              name: p.name,
              mask: Uint8Array.from(
                p.mask?.length === n ? p.mask : new Array(n).fill(0)
              ),
            }))
          : [],
        boneIndexByName,
      }
      this.addEntry(entry, false)
    }
    if (data.activeRigId && this.entries.has(data.activeRigId)) {
      this.activeRigId = data.activeRigId
    } else {
      this.activeRigId = this.order[0] ?? null
    }
  }
}
