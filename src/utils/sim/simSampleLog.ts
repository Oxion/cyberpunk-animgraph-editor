/**
 * Sample-path debug log. Enable in DevTools:
 *   globalThis.__SIM_SAMPLE_LOG = true
 * Then copy the `[sim-sample]` console lines.
 */

export type SimSampleLog = {
  tag: string
  lines: string[]
}

export function isSimSampleLogEnabled(): boolean {
  try {
    return (
      typeof globalThis !== 'undefined' &&
      (globalThis as { __SIM_SAMPLE_LOG?: unknown }).__SIM_SAMPLE_LOG === true
    )
  } catch {
    return false
  }
}

export function createSimSampleLog(tag: string): SimSampleLog | null {
  if (!isSimSampleLogEnabled()) return null
  return { tag, lines: [] }
}

export function simSampleLogLine(log: SimSampleLog | null | undefined, line: string): void {
  if (!log) return
  log.lines.push(line)
}

let lastFlushByTag = new Map<string, number>()

/** Throttle per tag (nested diagrams must not suppress root log). */
export function flushSimSampleLog(log: SimSampleLog | null | undefined): void {
  if (!log || !log.lines.length) return
  const now =
    typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
  const prev = lastFlushByTag.get(log.tag) ?? 0
  if (now - prev < 500) return
  lastFlushByTag.set(log.tag, now)
  console.log(`[sim-sample] ${log.tag}\n` + log.lines.join('\n'))
}
