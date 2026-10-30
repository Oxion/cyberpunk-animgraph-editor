export type SimClockOnPlayingChangeCallback = (playing: boolean) => void
export type SimClockOnSpeedChangeCallback = (speed: number) => void

export type SimClockProps = {
  onPlayingChange?: SimClockOnPlayingChangeCallback
  onSpeedChange?: SimClockOnSpeedChangeCallback
}

const MIN_SPEED = 0
const MAX_SPEED = 100

/** Sim Step / HUD frame rate (game-tick style). Distinct from anim content 30fps. */
export const DEFAULT_SIM_FPS = 60

export class SimClock {
  private _time = 0
  private _playing = false
  private _speed = 1
  /** Fixed step when using step() — one sim frame */
  private _stepDt = 1 / DEFAULT_SIM_FPS
  /** Last speed-scaled dt (engine timeDelta). */
  private _lastDt = 0
  /** Last undilated frame dt (engine rawTimeDelta). */
  private _lastRawDt = 0

  private _onPlayingChangeCb?: SimClockOnPlayingChangeCallback

  private _onSpeedChangeCb?: SimClockOnSpeedChangeCallback

  constructor(props: SimClockProps = {}) {
    this._onPlayingChangeCb = props.onPlayingChange
    this._onSpeedChangeCb = props.onSpeedChange
  }

  private _setSpeed(speed: number): void {
    const nextSpeed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed))
    const prevSpeed = this.speed
    this._speed = nextSpeed
    if (prevSpeed !== nextSpeed) {
      this._onSpeedChangeCb?.(nextSpeed)
    }
  }

  private _setPlaying(playing: boolean): void {
    const prevPlaying = this._playing
    this._playing = playing
    if (prevPlaying !== playing) {
      this._onPlayingChangeCb?.(playing)
    }
  }

  get time(): number {
    return this._time
  }

  get speed(): number {
    return this._speed
  }

  get playing(): boolean {
    return this._playing
  }

  get stepDt(): number {
    return this._stepDt
  }

  get lastDt(): number {
    return this._lastDt
  }

  get lastRawDt(): number {
    return this._lastRawDt
  }

  play(): void {
    this._setPlaying(true)
  }

  pause(): void {
    this._setPlaying(false)
  }

  toggle(): void {
    this._setPlaying(!this._playing)
  }

  reset(): void {
    this._time = 0
    this._lastRawDt = 0
    this._lastDt = 0
    this._setPlaying(false)
  }

  step(): number {
    const rawDt = this.stepDt
    const dt = rawDt * this.speed
    this._lastRawDt = rawDt
    this._lastDt = dt
    this._time += dt
    return dt
  }

  setSpeed(speed: number): void {
    this._setSpeed(Math.max(0, Math.min(100, speed)))
  }

  /** Advance by wall-clock ms when playing. Returns scaled sim dt or 0. */
  tickWall(deltaMs: number): number {
    if (!this.playing) return 0
    const rawDt = deltaMs / 1000
    const dt = rawDt * this.speed
    this._lastRawDt = rawDt
    this._lastDt = dt
    this._time += dt
    return dt
  }

  /** Live bridge: one game frame as-is (no editor speed — game dt is authoritative). */
  tickExternal(gameDt: number, gameRawDt = gameDt): number {
    const rawDt = gameRawDt > 0 ? gameRawDt : gameDt
    const dt = gameDt > 0 ? gameDt : rawDt
    this._lastRawDt = rawDt
    this._lastDt = dt
    this._time += dt
    return dt
  }
}
