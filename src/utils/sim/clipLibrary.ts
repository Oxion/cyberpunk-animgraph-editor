/**
 * Compact clip index for offline sim (no bone buffers).
 * Mirrors animAnimSetup / AnimSetupEntry: priority + wrapper variableNames.
 */

import { SequentialIdAllocator } from '../SequentialIdAllocator'

export type ClipEvent = {
  name: string
  /** Seconds from clip start */
  time: number
  /** Seconds; 0 = instantaneous */
  duration: number
  /** Present for animAnimEvent_Valued */
  value?: number
  /** Raw $type, e.g. animAnimEvent_Sound */
  type?: string
  /** Present for animAnimEvent_FootPhase */
  footPhase?: string
}

export type ClipMeta = {
  name: string
  duration: number
  events: ClipEvent[]
  /** Per-animation tags */
  tags: string[]
  numFrames?: number
  /** Animset file / label this clip came from */
  source?: string
  /** animAnimationType from .anims.json (Normal / Additive*) */
  animationType?: string
  /** Optional extra float track names (CollectExtraData). */
  extraFloatTracks?: string[]
}

/** One animAnimSetupEntry: animSet + priority + wrapper gates. */
export type AnimSetupEntry = {
  id: string
  sourceLabel: string
  /** 0..255; lower = higher priority (engine default 128) */
  priority: number
  /**
   * Wrapper names that must all be active (weight >= 0.5) for this set.
   * Empty → always active (engine InitRuntimeAnimSetupFromStaticData).
   */
  variableNames: string[]
  /** Set-level tags from animAnimSet.tags (AnimSetTagValue / HasRuntimeTags). */
  tags: string[]
  /** Linked ClipPoseLibrary set id (glb curves), if attached. */
  poseSetId: string | null
  clips: Map<string, ClipMeta>
}

export type AnimSetupEntryView = {
  id: string
  sourceLabel: string
  priority: number
  variableNames: string[]
  tags: string[]
  poseSetId: string | null
  clipCount: number
  /** Computed against current wrapper board when provided */
  active: boolean
}

/** One loaded set that contains a given clip name. */
export type ClipSetMembership = {
  entryId: string
  poseSetId: string | null
  sourceLabel: string
  priority: number
  active: boolean
  /** This entry wins resolveClip for the name (active + lowest priority) */
  resolves: boolean
  duration: number
  eventCount: number
}

export type ClipLibraryStats = {
  clipCount: number
  eventCount: number
  entryCount: number
  sources: string[]
}

export type AddAnimSetProps = {
  clips: ClipMeta[]
  sourceLabel?: string
  priority?: number
  variableNames?: string[]
  /** Set-level tags (animAnimSet.tags) */
  tags?: string[]
  /** Restore persisted entry id */
  id?: string
  /** Restore persisted pose set link */
  poseSetId?: string | null
}

export type AddAnimSetResult = {
  id: string
  clipCount: number
}

/** Fallback when numFrames missing (CP2077 anims are typically 30). */
export const DEFAULT_ANIM_FPS = 30

/** Engine default for AnimSetupEntry.m_priority */
export const DEFAULT_ANIM_SETUP_PRIORITY = 128

function findClipInMap(clips: Map<string, ClipMeta>, name: string): ClipMeta | undefined {
  if (!name || name === 'None') return undefined
  const exact = clips.get(name)
  if (exact) return exact
  const lower = name.toLowerCase()
  for (const [k, v] of clips) {
    if (k.toLowerCase() === lower) return v
  }
  return undefined
}

export class ClipLibrary {
  private entries: AnimSetupEntry[] = []
  private readonly ids = new SequentialIdAllocator('ase', (id) =>
    this.entries.some((e) => e.id === id)
  )

  clear(): void {
    this.entries = []
    this.ids.reset()
  }

  get size(): number {
    return this.uniqueClipCount()
  }

  get entryCount(): number {
    return this.entries.length
  }

  getEntry(id: string): AnimSetupEntry | undefined {
    return this.entries.find((e) => e.id === id)
  }

  setEntryPoseSetId(entryId: string, poseSetId: string | null): boolean {
    const entry = this.entries.find((e) => e.id === entryId)
    if (!entry) return false
    entry.poseSetId = poseSetId
    return true
  }

  listEntries(isWrapperActive?: (name: string) => boolean): AnimSetupEntryView[] {
    return this.entries.map((e) => ({
      id: e.id,
      sourceLabel: e.sourceLabel,
      priority: e.priority,
      variableNames: [...e.variableNames],
      tags: [...e.tags],
      poseSetId: e.poseSetId,
      clipCount: e.clips.size,
      active: isWrapperActive ? this.isEntryActive(e, isWrapperActive) : this.isEntryActiveDefault(e),
    }))
  }

  /** Clip name → animationType for a setup entry (from .anims.json). */
  getAnimationTypesForEntry(setupEntryId: string): Map<string, string> {
    const out = new Map<string, string>()
    const e = this.entries.find((x) => x.id === setupEntryId)
    if (!e) return out
    for (const clip of e.clips.values()) {
      if (clip.animationType) out.set(clip.name, clip.animationType)
    }
    return out
  }

  /** Empty vars → always on; else AND of all wrapper names. */
  isEntryActive(entry: AnimSetupEntry, isWrapperActive: (name: string) => boolean): boolean {
    if (!entry.variableNames.length) return true
    for (const name of entry.variableNames) {
      if (!isWrapperActive(name)) return false
    }
    return true
  }

  private isEntryActiveDefault(entry: AnimSetupEntry): boolean {
    return entry.variableNames.length === 0
  }

  /**
   * Active gameplay sets sorted by priority ascending (then insertion order).
   * Matches BuildRuntimeAnimSetup sort + Acquire walk order.
   */
  orderedActiveEntries(isWrapperActive: (name: string) => boolean): AnimSetupEntry[] {
    const indexed = this.entries
      .map((e, index) => ({ e, index }))
      .filter(({ e }) => this.isEntryActive(e, isWrapperActive))
    indexed.sort((a, b) => {
      if (a.e.priority !== b.e.priority) return a.e.priority - b.e.priority
      return a.index - b.index
    })
    return indexed.map(({ e }) => e)
  }

  /**
   * AnimWrapperManager::HasRuntimeTags — MatchAny(query, union of active set tags).
   */
  hasRuntimeTags(
    queryTags: string[],
    isWrapperActive: (name: string) => boolean
  ): boolean {
    if (!queryTags.length) return false
    const runtime = new Set<string>()
    for (const e of this.orderedActiveEntries(isWrapperActive)) {
      for (const t of e.tags) runtime.add(t.toLowerCase())
    }
    if (!runtime.size) return false
    for (const t of queryTags) {
      if (runtime.has(t.toLowerCase())) return true
    }
    return false
  }

  /**
   * First hit among active sets by priority — engine clip acquire parity.
   */
  resolveClip(
    name: string,
    isWrapperActive: (name: string) => boolean
  ): ClipMeta | undefined {
    return this.resolveClipEntry(name, isWrapperActive)?.clip
  }

  /**
   * Clip for SkPhase CacheClipping: prefer resolve winner, but if it has no
   * usable phase event, borrow events from any other entry of the same name.
   */
  resolveClipForPhase(
    name: string,
    phase: string,
    isWrapperActive: (name: string) => boolean
  ): ClipMeta | undefined {
    const primary = this.resolveClip(name, isWrapperActive)
    if (!primary) return undefined
    if (!phase || phase === 'None') return primary
    const key = phase.toLowerCase()
    const hasPhase = (c: ClipMeta) =>
      c.events.some((e) => e.name.toLowerCase() === key)
    if (hasPhase(primary)) return primary
    for (const entry of this.entries) {
      const clip = findClipInMap(entry.clips, name)
      if (!clip || !hasPhase(clip)) continue
      return {
        ...primary,
        events: clip.events,
        duration: primary.duration > 0 ? primary.duration : clip.duration,
        numFrames: primary.numFrames ?? clip.numFrames,
      }
    }
    return primary
  }

  /** Winning setup entry + pose link + clip (same order as resolveClip). */
  resolveClipEntry(
    name: string,
    isWrapperActive: (name: string) => boolean
  ): { entryId: string; poseSetId: string | null; clip: ClipMeta } | undefined {
    if (!name || name === 'None') return undefined
    for (const entry of this.orderedActiveEntries(isWrapperActive)) {
      const clip = findClipInMap(entry.clips, name)
      if (clip) return { entryId: entry.id, poseSetId: entry.poseSetId, clip }
    }
    return undefined
  }

  /** HasAnimation / AcquireAnimWrapperId validity for gameplay sets. */
  hasAnimation(name: string, isWrapperActive: (name: string) => boolean): boolean {
    return this.resolveClip(name, isWrapperActive) !== undefined
  }

  /**
   * All loaded sets that contain `name` (case-insensitive).
   * Sorted by priority ↑ then insertion order; `resolves` marks the acquire winner.
   */
  entriesContainingClip(
    name: string,
    isWrapperActive?: (name: string) => boolean
  ): ClipSetMembership[] {
    if (!name || name === 'None') return []
    const indexed: Array<{ e: AnimSetupEntry; index: number; clip: ClipMeta }> = []
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i]!
      const clip = findClipInMap(e.clips, name)
      if (!clip) continue
      indexed.push({ e, index: i, clip })
    }
    indexed.sort((a, b) => {
      if (a.e.priority !== b.e.priority) return a.e.priority - b.e.priority
      return a.index - b.index
    })
    let winnerId: string | null = null
    if (isWrapperActive) {
      for (const { e } of indexed) {
        if (this.isEntryActive(e, isWrapperActive)) {
          winnerId = e.id
          break
        }
      }
    }
    return indexed.map(({ e, clip }) => {
      const active = isWrapperActive
        ? this.isEntryActive(e, isWrapperActive)
        : this.isEntryActiveDefault(e)
      return {
        entryId: e.id,
        poseSetId: e.poseSetId,
        sourceLabel: e.sourceLabel,
        priority: e.priority,
        active,
        resolves: winnerId === e.id,
        duration: clip.duration,
        eventCount: clip.events.length,
      }
    })
  }

  /** Any entry contains the name (ignore active bits) — UI / debug. */
  hasClipAnywhere(name: string): boolean {
    if (!name || name === 'None') return false
    for (const entry of this.entries) {
      if (findClipInMap(entry.clips, name)) return true
    }
    return false
  }

  /** Prefer resolveClip; falls back to first match in any entry (no gating). */
  lookup(name: string, isWrapperActive?: (name: string) => boolean): ClipMeta | undefined {
    if (isWrapperActive) {
      const hit = this.resolveClip(name, isWrapperActive)
      if (hit) return hit
    }
    for (const entry of this.entries) {
      const clip = findClipInMap(entry.clips, name)
      if (clip) return clip
    }
    return undefined
  }

  /** Clip meta for a specific AnimSetupEntry (per-set events / duration). */
  getClipInEntry(name: string, entryId: string): ClipMeta | undefined {
    if (!name || name === 'None' || !entryId) return undefined
    const entry = this.entries.find((e) => e.id === entryId)
    if (!entry) return undefined
    return findClipInMap(entry.clips, name)
  }

  get(name: string): ClipMeta | undefined {
    return this.lookup(name)
  }

  has(name: string): boolean {
    return this.hasClipAnywhere(name)
  }

  names(): string[] {
    const set = new Set<string>()
    for (const entry of this.entries) {
      for (const name of entry.clips.keys()) set.add(name)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }

  eventNames(): string[] {
    const set = new Set<string>()
    for (const entry of this.entries) {
      for (const clip of entry.clips.values()) {
        for (const e of clip.events) {
          if (e.name && e.name !== 'None') set.add(e.name)
        }
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }

  /** Unique wrapper names from all setup entries (for SimPanel discovery). */
  wrapperNames(): string[] {
    const set = new Set<string>()
    for (const entry of this.entries) {
      for (const n of entry.variableNames) {
        if (n && n !== 'None') set.add(n)
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }

  stats(): ClipLibraryStats {
    return {
      clipCount: this.uniqueClipCount(),
      eventCount: this.eventNames().length,
      entryCount: this.entries.length,
      sources: this.entries.map((e) => e.sourceLabel),
    }
  }

  private uniqueClipCount(): number {
    return this.names().length
  }

  /**
   * Add one animset as an AnimSetupEntry (does not flatten / last-wins).
   */
  addAnimSet(props: AddAnimSetProps): AddAnimSetResult | undefined {
    const priority =
      typeof props.priority === 'number' && Number.isFinite(props.priority)
        ? Math.max(0, Math.min(255, Math.round(props.priority)))
        : DEFAULT_ANIM_SETUP_PRIORITY
    const variableNames = (props.variableNames ?? [])
      .map((n) => n.trim())
      .filter((n) => n && n !== 'None')
    const tags = (props.tags ?? [])
      .map((n) => n.trim())
      .filter((n) => n && n !== 'None')
    const poseSetId =
      typeof props.poseSetId === 'string' && props.poseSetId.trim()
        ? props.poseSetId.trim()
        : null

    const map = new Map<string, ClipMeta>()
    for (const clip of props.clips) {
      if (!clip.name || clip.name === 'None') continue
      map.set(clip.name, { ...clip })
    }
    if (!map.size) return undefined

    const id = this.ids.alloc(props.id)
    const sourceLabel = props.sourceLabel?.trim() || `animset_${id}`
    for (const clip of map.values()) {
      if (!clip.source) clip.source = sourceLabel
    }

    this.entries.push({
      id,
      sourceLabel,
      priority,
      variableNames,
      tags,
      poseSetId,
      clips: map,
    })
    return { id, clipCount: map.size }
  }

  updateEntry(
    id: string,
    patch: { priority?: number; variableNames?: string[]; tags?: string[] }
  ): boolean {
    const entry = this.entries.find((e) => e.id === id)
    if (!entry) return false
    if (typeof patch.priority === 'number' && Number.isFinite(patch.priority)) {
      entry.priority = Math.max(0, Math.min(255, Math.round(patch.priority)))
    }
    if (patch.variableNames) {
      entry.variableNames = patch.variableNames
        .map((n) => n.trim())
        .filter((n) => n && n !== 'None')
    }
    if (patch.tags) {
      entry.tags = patch.tags.map((n) => n.trim()).filter((n) => n && n !== 'None')
    }
    return true
  }

  removeEntry(id: string): boolean {
    const i = this.entries.findIndex((e) => e.id === id)
    if (i < 0) return false
    this.entries.splice(i, 1)
    return true
  }

  /** Flat clip list for compact export (loses multi-entry priority if merged). */
  allClipsFlat(): ClipMeta[] {
    const out: ClipMeta[] = []
    for (const entry of this.entries) {
      for (const clip of entry.clips.values()) out.push(clip)
    }
    return out
  }

  /** Export entries preserving priority / variableNames / ids. */
  toSetupJson(): AnimClipSetupJson {
    return {
      $type: 'animClipSetup',
      entries: this.entries.map((e) => ({
        id: e.id,
        sourceLabel: e.sourceLabel,
        priority: e.priority,
        variableNames: [...e.variableNames],
        tags: [...e.tags],
        poseSetId: e.poseSetId,
        clips: [...e.clips.values()],
      })),
    }
  }
}

/** Compact clip setup JSON (project / file IO). */
export type AnimClipSetupJson = {
  $type: 'animClipSetup'
  entries: Array<{
    id?: string
    sourceLabel: string
    priority: number
    variableNames: string[]
    tags: string[]
    poseSetId?: string | null
    clips: ClipMeta[]
  }>
}
