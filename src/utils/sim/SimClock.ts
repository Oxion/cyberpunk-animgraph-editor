/** Sim Step / HUD frame rate (game-tick style). Distinct from anim content 30fps. */
export const DEFAULT_SIM_FPS = 60

export class SimClock {
  time = 0
  playing = false
  speed = 1
  /** Fixed step when using step() — one sim frame */
  stepDt = 1 / DEFAULT_SIM_FPS

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
  }

  /** Advance by wall-clock ms when playing. Returns sim dt or 0. */
  tickWall(deltaMs: number): number {
    if (!this.playing) return 0
    const dt = (deltaMs / 1000) * this.speed
    this.time += dt
    return dt
  }

  step(): number {
    const dt = this.stepDt * this.speed
    this.time += dt
    return dt
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.05, Math.min(8, speed))
  }
}
