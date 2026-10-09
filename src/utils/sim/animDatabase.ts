/**
 * Offline anim motion database (C2dArray / CSV) for animAnimNode_AnimDatabase.
 * Matches AnimDatabaseCollectionEntry::Raw_GetAnimationName (CSV path).
 */

import { readCName } from './simDataUtils'

export const ANIM_DB_WILDCARD = '*'

export type AnimDbRow = {
  /** Input key cells (int or wildcard). Length = inputCount. */
  inputs: Array<number | typeof ANIM_DB_WILDCARD>
  animationName: string
  fallbackAnimationName: string
  streamingContext: string
}

export type AnimDatabase = {
  /** Normalized depot path key (lowercase, backslashes) */
  pathKey: string
  /** Display label (file name or path) */
  label: string
  headers: string[]
  inputCount: number
  rows: AnimDbRow[]
}

export type AnimDatabaseStats = {
  dbCount: number
  rowCount: number
  paths: string[]
}

export function normalizeAnimDbPath(path: string): string {
  return path
    .trim()
    .replace(/\//g, '\\')
    .replace(/^\\+/, '')
    .toLowerCase()
}

export function animDbBasename(path: string): string {
  const n = path.replace(/\//g, '\\')
  const i = n.lastIndexOf('\\')
  return (i >= 0 ? n.slice(i + 1) : n).toLowerCase()
}

function unwrapRoot(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== 'object') return null
  const root = json as Record<string, unknown>
  const data = root.Data
  if (data && typeof data === 'object') {
    const chunk = (data as Record<string, unknown>).RootChunk
    if (chunk && typeof chunk === 'object') return chunk as Record<string, unknown>
  }
  if ((root as { $type?: string }).$type === 'C2dArray') return root
  return null
}

function parseCellIntOrWild(cell: string): number | typeof ANIM_DB_WILDCARD | null {
  const s = cell.trim()
  if (s === ANIM_DB_WILDCARD) return ANIM_DB_WILDCARD
  if (s === '' || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'none') return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return Math.trunc(n)
}

/**
 * WolvenKit export of C2dArray (.csv.json):
 * compiledData rows; last 3 cols = AnimationName, streamingContext, FallbackAnimationName.
 */
export function parseAnimDatabaseCsvJson(
  json: unknown,
  sourceLabel?: string
): AnimDatabase {
  const chunk = unwrapRoot(json)
  if (!chunk) throw new Error('Not a C2dArray / .csv.json (missing Data.RootChunk)')

  const compiled = chunk.compiledData
  if (!Array.isArray(compiled) || compiled.length === 0) {
    throw new Error('C2dArray has no compiledData rows')
  }

  const headers = Array.isArray(chunk.headers)
    ? (chunk.headers as unknown[]).map((h) => String(h ?? ''))
    : []

  const firstRow = compiled[0]
  if (!Array.isArray(firstRow) || firstRow.length < 4) {
    throw new Error('C2dArray rows need ≥4 columns (inputs + anim/stream/fallback)')
  }

  const colCount = firstRow.length
  const inputCount = colCount - 3
  if (inputCount < 1) throw new Error('C2dArray needs at least one input column')

  const rows: AnimDbRow[] = []
  for (const raw of compiled) {
    if (!Array.isArray(raw) || raw.length < colCount) continue
    const cells = raw.map((c) => String(c ?? ''))
    const inputs: AnimDbRow['inputs'] = []
    let skip = false
    for (let i = 0; i < inputCount; i++) {
      const parsed = parseCellIntOrWild(cells[i]!)
      if (parsed === null) {
        // Non-int marker rows (e.g. section headers with text in input cols) — skip
        skip = true
        break
      }
      inputs.push(parsed)
    }
    if (skip) continue

    const animationName = cells[colCount - 3]!.trim()
    const streamingContext = cells[colCount - 2]!.trim()
    const fallbackAnimationName = cells[colCount - 1]!.trim()
    if (!animationName || animationName === 'undefined') continue
    // Skip section markers like __COMBO__
    if (animationName.startsWith('__') && animationName.endsWith('__')) continue

    rows.push({
      inputs,
      animationName,
      fallbackAnimationName:
        fallbackAnimationName === 'undefined' ? '' : fallbackAnimationName,
      streamingContext: streamingContext === 'undefined' ? '' : streamingContext,
    })
  }

  const label =
    sourceLabel?.trim() ||
    (typeof (json as { Header?: { ArchiveFileName?: string } })?.Header?.ArchiveFileName ===
    'string'
      ? animDbBasename((json as { Header: { ArchiveFileName: string } }).Header.ArchiveFileName)
      : 'anim_database')

  const pathFromHeader =
    typeof (json as { Header?: { ArchiveFileName?: string } })?.Header?.ArchiveFileName ===
    'string'
      ? extractDepotLikePath((json as { Header: { ArchiveFileName: string } }).Header.ArchiveFileName)
      : ''

  const pathKey = normalizeAnimDbPath(pathFromHeader || label)

  return { pathKey, label, headers, inputCount, rows }
}

/** Pull `base\animations\...csv` from a full disk ArchiveFileName if present. */
function extractDepotLikePath(archiveFileName: string): string {
  const n = archiveFileName.replace(/\//g, '\\')
  const marker = '\\base\\'
  const i = n.toLowerCase().indexOf(marker)
  if (i >= 0) return n.slice(i + 1) // drop leading slash → base\...
  return animDbBasename(n)
}

/** First matching CSV row, or null. */
export function resolveAnimDatabaseRow(
  db: AnimDatabase,
  inputValues: number[]
): AnimDbRow | null {
  if (inputValues.length !== db.inputCount) return null
  for (const row of db.rows) {
    let ok = true
    for (let i = 0; i < db.inputCount; i++) {
      const cell = row.inputs[i]!
      if (cell === ANIM_DB_WILDCARD) continue
      if (cell !== Math.trunc(inputValues[i]!)) {
        ok = false
        break
      }
    }
    if (ok) return row
  }
  return null
}

export function resolveAnimDatabaseName(
  db: AnimDatabase,
  inputValues: number[]
): string {
  return resolveAnimDatabaseRow(db, inputValues)?.animationName || 'None'
}

export class AnimDatabaseLibrary {
  private byPath = new Map<string, AnimDatabase>()
  private byBase = new Map<string, AnimDatabase>()

  get size(): number {
    return this.byPath.size
  }

  clear(): void {
    this.byPath.clear()
    this.byBase.clear()
  }

  add(db: AnimDatabase): void {
    this.byPath.set(db.pathKey, db)
    this.byBase.set(animDbBasename(db.pathKey), db)
    // Also index without .json if label was csv.json
    const base = animDbBasename(db.pathKey).replace(/\.json$/i, '')
    this.byBase.set(base, db)
  }

  remove(pathKey: string): boolean {
    const key = normalizeAnimDbPath(pathKey)
    const db = this.byPath.get(key)
    if (!db) return false
    this.byPath.delete(key)
    // Rebuild basename index (simple: clear bases that pointed here)
    for (const [b, d] of [...this.byBase.entries()]) {
      if (d.pathKey === db.pathKey) this.byBase.delete(b)
    }
    return true
  }

  /** Lookup by depot path from node ResourcePath ($value). */
  findByDepotPath(depotPath: string): AnimDatabase | undefined {
    if (!depotPath || depotPath === '0' || depotPath === 'None') return undefined
    const key = normalizeAnimDbPath(depotPath)
    const hit = this.byPath.get(key)
    if (hit) return hit
    // Strip .json if user path is .csv
    const withJson = normalizeAnimDbPath(key.endsWith('.json') ? key : `${key}.json`)
    if (this.byPath.get(withJson)) return this.byPath.get(withJson)
    return this.byBase.get(animDbBasename(key)) ?? this.byBase.get(animDbBasename(key) + '.json')
  }

  list(): AnimDatabase[] {
    return [...this.byPath.values()]
  }

  stats(): AnimDatabaseStats {
    const list = this.list()
    return {
      dbCount: list.length,
      rowCount: list.reduce((n, d) => n + d.rows.length, 0),
      paths: list.map((d) => d.label),
    }
  }
}

/** Read animDatabase DepotPath from AnimDatabase node Data.animDataBase. */
export function readAnimDatabaseDepotPath(data: Record<string, unknown>): string {
  const entry = data.animDataBase
  if (!entry || typeof entry !== 'object') return ''
  const e = entry as Record<string, unknown>
  // Prefer override if set to a real path
  const override = readResourcePath(e.overrideAnimDatabase)
  if (override && override !== '0') return override
  return readResourcePath(e.animDatabase)
}

function readResourcePath(ref: unknown): string {
  if (!ref || typeof ref !== 'object') return ''
  const depot = (ref as { DepotPath?: unknown }).DepotPath
  return readCName(depot)
}

export function loadAnimDatabaseCsvJson(
  library: AnimDatabaseLibrary,
  json: object,
  sourceLabel?: string
): AnimDatabase {
  const db = parseAnimDatabaseCsvJson(json, sourceLabel)
  library.add(db)
  return db
}

/** Compact JSON preserving all loaded motion databases (project / file IO). */
export type AnimDatabaseLibraryJson = {
  $type: 'animDatabaseLibrary'
  databases: AnimDatabase[]
}

/** On-disk / project payload before validation into AnimDatabase. */
type AnimDatabaseLibraryWire = {
  $type?: 'animDatabaseLibrary'
  databases: object[]
}

export function animDatabaseLibraryToCompactJson(
  library: AnimDatabaseLibrary
): AnimDatabaseLibraryJson {
  return {
    $type: 'animDatabaseLibrary',
    databases: library.list().map((db) => ({
      pathKey: db.pathKey,
      label: db.label,
      headers: [...db.headers],
      inputCount: db.inputCount,
      rows: db.rows.map((r) => ({
        inputs: [...r.inputs],
        animationName: r.animationName,
        fallbackAnimationName: r.fallbackAnimationName,
        streamingContext: r.streamingContext,
      })),
    })),
  }
}

function parseAnimDbInputCell(cell: number | string): number | typeof ANIM_DB_WILDCARD {
  if (cell === ANIM_DB_WILDCARD || cell === '*') return ANIM_DB_WILDCARD
  const n = typeof cell === 'number' ? cell : Number(cell)
  return Number.isFinite(n) ? Math.trunc(n) : ANIM_DB_WILDCARD
}

function parseAnimDbRow(value: object): AnimDbRow | null {
  if (!('inputs' in value) || !Array.isArray(value.inputs)) return null
  const inputs: Array<number | typeof ANIM_DB_WILDCARD> = []
  for (const cell of value.inputs) {
    if (typeof cell === 'number' || typeof cell === 'string') {
      inputs.push(parseAnimDbInputCell(cell))
      continue
    }
    return null
  }
  const animationName =
    'animationName' in value && typeof value.animationName === 'string'
      ? value.animationName
      : 'None'
  const fallbackAnimationName =
    'fallbackAnimationName' in value && typeof value.fallbackAnimationName === 'string'
      ? value.fallbackAnimationName
      : ''
  const streamingContext =
    'streamingContext' in value && typeof value.streamingContext === 'string'
      ? value.streamingContext
      : ''
  return { inputs, animationName, fallbackAnimationName, streamingContext }
}

function parseAnimDatabase(value: object): AnimDatabase | null {
  if (!('pathKey' in value) || typeof value.pathKey !== 'string' || !value.pathKey) return null
  if (!('rows' in value) || !Array.isArray(value.rows)) return null
  const rows: AnimDbRow[] = []
  for (const row of value.rows) {
    if (!row || typeof row !== 'object') continue
    const parsed = parseAnimDbRow(row)
    if (parsed) rows.push(parsed)
  }
  const inputCount =
    'inputCount' in value && typeof value.inputCount === 'number' && Number.isFinite(value.inputCount)
      ? Math.max(0, Math.trunc(value.inputCount))
      : 0
  const label =
    'label' in value && typeof value.label === 'string' ? value.label : value.pathKey
  const headers: string[] = []
  if ('headers' in value && Array.isArray(value.headers)) {
    for (const h of value.headers) {
      if (typeof h === 'string') headers.push(h)
    }
  }
  return {
    pathKey: normalizeAnimDbPath(value.pathKey),
    label,
    headers,
    inputCount,
    rows,
  }
}

function isAnimDatabaseLibraryWire(value: object): value is AnimDatabaseLibraryWire {
  return 'databases' in value && Array.isArray(value.databases)
}

/**
 * Load compact library JSON (or a single C2dArray / .csv.json).
 * Returns how many databases were added.
 */
export function loadCompactAnimDatabaseLibraryJson(
  library: AnimDatabaseLibrary,
  json: object,
  sourceLabel = 'compact'
): number {
  if (
    ('$type' in json && json.$type === 'C2dArray') ||
    ('Data' in json && json.Data != null)
  ) {
    loadAnimDatabaseCsvJson(library, json, sourceLabel)
    return 1
  }

  if (!isAnimDatabaseLibraryWire(json)) {
    throw new Error('Expected animDatabaseLibrary databases or C2dArray / .csv.json')
  }

  let n = 0
  for (const raw of json.databases) {
    if (!raw || typeof raw !== 'object') continue
    const db = parseAnimDatabase(raw)
    if (!db) continue
    library.add(db)
    n++
  }
  return n
}
