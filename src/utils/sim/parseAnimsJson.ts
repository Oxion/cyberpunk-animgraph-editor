/**
 * Parse WolvenKit / archive JSON export of animAnimSet (.anims.json)
 * into ClipMeta[] (name, duration, events) — strips bone buffers.
 */

import { readCName, readNumber } from './simDataUtils'
import { normalizeFootPhase } from './footPhase'
import {
  ClipLibrary,
  DEFAULT_ANIM_FPS,
  DEFAULT_ANIM_SETUP_PRIORITY,
  type AddAnimSetOptions,
  type AnimClipSetupJson,
  type ClipEvent,
  type ClipMeta,
} from './clipLibrary'

function unwrap(obj: unknown): Record<string, unknown> | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  if (o.Data && typeof o.Data === 'object') return o.Data as Record<string, unknown>
  return o
}

function readCNameList(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  const tags = (value as { tags?: unknown }).tags
  if (!Array.isArray(tags)) return []
  const out: string[] = []
  for (const t of tags) {
    const n = readCName(t)
    if (n && n !== 'None') out.push(n)
  }
  return out
}

function findAnimSetRoot(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== 'object') return null
  const root = json as Record<string, unknown>
  // WolvenKit: { Header, Data: { RootChunk: animAnimSet } }
  const data = root.Data
  if (data && typeof data === 'object') {
    const chunk = (data as Record<string, unknown>).RootChunk
    const u = unwrap(chunk) ?? (chunk as Record<string, unknown> | null)
    if (u && (u.$type === 'animAnimSet' || Array.isArray(u.animations))) return u
  }
  const direct = unwrap(root.RootChunk) ?? unwrap(root)
  if (direct && (direct.$type === 'animAnimSet' || Array.isArray(direct.animations))) {
    return direct
  }
  return null
}

function inferFps(duration: number, numFrames: number | undefined): number {
  if (
    typeof numFrames === 'number' &&
    numFrames > 0 &&
    Number.isFinite(duration) &&
    duration > 1e-6
  ) {
    return numFrames / duration
  }
  return DEFAULT_ANIM_FPS
}

function parseEvents(eventsContainer: unknown, fps: number): ClipEvent[] {
  const cont = unwrap(eventsContainer)
  const list = cont?.events
  if (!Array.isArray(list)) return []
  const out: ClipEvent[] = []
  for (const raw of list) {
    const e = unwrap(raw)
    if (!e) continue
    const name = readCName(e.eventName)
    if (!name || name === 'None') continue
    const startFrame = readNumber(e.startFrame, 0)
    const durationInFrames = readNumber(e.durationInFrames, 0)
    const time = startFrame / fps
    const duration = durationInFrames > 0 ? durationInFrames / fps : 0
    const type = typeof e.$type === 'string' ? e.$type : undefined
    const valueRaw = e.value
    const value =
      typeof valueRaw === 'number' && Number.isFinite(valueRaw) ? valueRaw : undefined
    const footPhase =
      normalizeFootPhase(e.phase) ??
      normalizeFootPhase(e.footPhase) ??
      undefined
    out.push({ name, time, duration, value, type, footPhase })
  }
  out.sort((a, b) => a.time - b.time || a.name.localeCompare(b.name))
  return out
}

function parseEntry(entryRaw: unknown, setTags: string[], source?: string): ClipMeta | null {
  const entry = unwrap(entryRaw)
  if (!entry) return null
  const anim = unwrap(entry.animation)
  if (!anim) return null
  const name = readCName(anim.name)
  if (!name || name === 'None') return null
  const duration = Math.max(0, readNumber(anim.duration, 0))
  const buf = unwrap(anim.animBuffer)
  const numFramesRaw = buf?.numFrames ?? buf?.NumFrames
  const numFrames =
    typeof numFramesRaw === 'number' && Number.isFinite(numFramesRaw)
      ? numFramesRaw
      : undefined
  const fps = inferFps(duration, numFrames)
  const animTags = readCNameList(anim.tags)
  const tags = [...new Set([...setTags, ...animTags])]
  const events = parseEvents(entry.events, fps)
  return { name, duration, events, tags, numFrames, source }
}

/**
 * Parse full .anims.json export → ClipMeta[] + set-level tags.
 * Throws if root is not animAnimSet.
 */
export function parseAnimsJsonResult(
  json: unknown,
  sourceLabel?: string
): { clips: ClipMeta[]; setTags: string[] } {
  const root = findAnimSetRoot(json)
  if (!root) {
    throw new Error('Not an animAnimSet JSON (missing Data.RootChunk / animations)')
  }
  const setTags = readCNameList(root.tags)
  const animations = root.animations
  if (!Array.isArray(animations)) return { clips: [], setTags }
  const out: ClipMeta[] = []
  for (const entry of animations) {
    const clip = parseEntry(entry, setTags, sourceLabel)
    if (clip) out.push(clip)
  }
  return { clips: out, setTags }
}

/**
 * Parse full .anims.json export → ClipMeta[].
 * Throws if root is not animAnimSet.
 */
export function parseAnimsJson(json: unknown, sourceLabel?: string): ClipMeta[] {
  return parseAnimsJsonResult(json, sourceLabel).clips
}

/** Load .anims.json as one AnimSetupEntry; returns how many clips added. */
export function loadAnimsJsonIntoLibrary(
  library: ClipLibrary,
  json: unknown,
  sourceLabel?: string,
  options?: Omit<AddAnimSetOptions, 'sourceLabel'>
): number {
  const { clips, setTags } = parseAnimsJsonResult(json, sourceLabel)
  return library.addAnimSet(clips, {
    sourceLabel,
    priority: options?.priority ?? DEFAULT_ANIM_SETUP_PRIORITY,
    variableNames: options?.variableNames,
    tags: options?.tags ?? setTags,
  })
}

/** Compact JSON preserving setup entries (priority / variableNames). */
export function clipLibraryToCompactJson(library: ClipLibrary): AnimClipSetupJson {
  return library.toSetupJson()
}

export function loadCompactClipLibraryJson(
  library: ClipLibrary,
  json: unknown,
  sourceLabel = 'compact'
): number {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid compact clip library JSON')
  }
  const o = json as {
    $type?: string
    clips?: unknown
    entries?: unknown
    Data?: unknown
  }

  if (o.$type === 'animAnimSet' || o.Data) {
    return loadAnimsJsonIntoLibrary(library, json, sourceLabel)
  }

  // New format: animClipSetup with entries
  if (o.$type === 'animClipSetup' || Array.isArray(o.entries)) {
    if (!Array.isArray(o.entries)) {
      throw new Error('Expected { $type: "animClipSetup", entries: [...] }')
    }
    let total = 0
    for (const raw of o.entries) {
      if (!raw || typeof raw !== 'object') continue
      const e = raw as {
        sourceLabel?: string
        priority?: number
        variableNames?: string[]
        tags?: string[]
        clips?: ClipMeta[]
      }
      const clips = Array.isArray(e.clips) ? e.clips : []
      total += library.addAnimSet(clips, {
        sourceLabel: e.sourceLabel ?? sourceLabel,
        priority: e.priority,
        variableNames: e.variableNames,
        tags: e.tags,
      })
    }
    return total
  }

  // Legacy flat: { $type: "animClipLibrary", clips: [...] }
  if (!Array.isArray(o.clips)) {
    throw new Error('Expected animClipSetup entries or animClipLibrary clips')
  }
  const clips: ClipMeta[] = []
  for (const c of o.clips) {
    if (!c || typeof c !== 'object') continue
    const clip = c as ClipMeta
    if (!clip.name) continue
    clips.push({
      name: clip.name,
      duration: Number(clip.duration) || 0,
      events: Array.isArray(clip.events) ? clip.events : [],
      tags: Array.isArray(clip.tags) ? clip.tags : [],
      numFrames: clip.numFrames,
      source: clip.source ?? sourceLabel,
    })
  }
  return library.addAnimSet(clips, {
    sourceLabel,
    priority: DEFAULT_ANIM_SETUP_PRIORITY,
  })
}
