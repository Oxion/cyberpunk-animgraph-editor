/** Sim Step / HUD frame rate (game-tick style). Distinct from anim content 30fps. */
export const DEFAULT_SIM_FPS = 60

export class SimClock {
  time = 0
  playing = false
  speed = 1
  /** Fixed step when using step() — one sim frame */
  stepDt = 1 / DEFAULT_SIM_FPS
  /** Last undilated frame dt (engine rawTimeDelta). */
  lastRawDt = 0
  /** Last speed-scaled dt (engine timeDelta). */
  lastDt = 0

  play(): void {
    this.playing = true
  }

  pause(): void {
    this.playing = false
  }

  toggle(): void {
    this.playing = !this.playing
  }

  reset(): void {
    this.time = 0
    this.playing = false
    this.lastRawDt = 0
    this.lastDt = 0
  }

  /** Advance by wall-clock ms when playing. Returns scaled sim dt or 0. */
  tickWall(deltaMs: number): number {
    if (!this.playing) return 0
    const rawDt = deltaMs / 1000
    const dt = rawDt * this.speed
    this.lastRawDt = rawDt
    this.lastDt = dt
    this.time += dt
    return dt
  }

  step(): number {
    const rawDt = this.stepDt
    const dt = rawDt * this.speed
    this.lastRawDt = rawDt
    this.lastDt = dt
    this.time += dt
    return dt
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0, Math.min(100, speed))
  }
}
