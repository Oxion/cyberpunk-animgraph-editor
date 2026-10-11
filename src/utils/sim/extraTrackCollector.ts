/**
 * Engine ExtraDataCollector::MarkExtraFloatTrack — active Update path only.
 * Finalize once after Update; Sample writes by linear name find.
 */

export class ExtraFloatTrackCollector {
  private names: string[] = []
  private seen = new Map<string, number>()

  clear(): void {
    this.names.length = 0
    this.seen.clear()
  }

  mark(name: string): void {
    if (!name || name === 'None') return
    const key = name.toLowerCase()
    if (this.seen.has(key)) return
    this.seen.set(key, this.names.length)
    this.names.push(name)
  }

  /** Ordered names marked this Update. */
  getNames(): readonly string[] {
    return this.names
  }
}
