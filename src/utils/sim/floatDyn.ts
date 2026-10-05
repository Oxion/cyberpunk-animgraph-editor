/**
 * Stateful float nodes: DampFloat / SpringDamp / CriticalSpringDamp / FloatLatch.
 * Math mirrors common/animation animNode_Damp.cpp + engine springDampers.h.
 */

import { readBool, readNumber } from './simDataUtils'

export type FloatDynState = {
  value: number
  /** SpringDamp / CriticalSpringDamp */
  velocity: number
}

/** AnimNode_FloatRandom instance buffer */
export type FloatRandomState = {
  value: number
  timer: number
}

/** AnimNode_FloatTimeDependentSinus instance buffer */
export type FloatSinusState = {
  currentTime: number
}

export function createFloatRandomState(min: number, max: number): FloatRandomState {
  return { value: randomInRange(min, max), timer: 0 }
}

export function createFloatSinusState(): FloatSinusState {
  return { currentTime: 0 }
}

function randomInRange(min: number, max: number): number {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  if (!(hi > lo)) return lo
  return lo + Math.random() * (hi - lo)
}

/** AnimNode_FloatRandom::OnUpdate — re-roll when rand && timer >= cooldown. */
export function stepFloatRandom(
  state: FloatRandomState,
  rand: boolean,
  cooldown: number,
  min: number,
  max: number,
  dt: number
): void {
  if (!rand) return
  state.timer += Math.max(0, dt)
  const cd = Math.max(0, cooldown)
  if (state.timer >= cd) {
    state.value = randomInRange(min, max)
    state.timer = 0
  }
}

/**
 * AnimNode_FloatTimeDependentSinus — period = 2π / frequencyFactor.
 * GetValue uses engine MSin (radians), not MathExpression deg-trig.
 */
export function stepFloatTimeDependentSinus(
  state: FloatSinusState,
  frequencyFactor: number,
  dt: number
): void {
  const freq = frequencyFactor
  if (!(freq > 0) || !Number.isFinite(freq)) {
    state.currentTime = 0
    return
  }
  const period = (Math.PI * 2) / freq
  if (!(period > 0) || !Number.isFinite(period)) {
    state.currentTime = 0
    return
  }
  let t = state.currentTime + Math.max(0, dt)
  t = t % period
  if (t < 0) t += period
  state.currentTime = t
}

export function evalFloatTimeDependentSinus(
  state: FloatSinusState,
  min: number,
  max: number,
  frequencyFactor: number,
  phaseFactor: number
): number {
  const mid = (min + max) * 0.5
  const span = max - min
  const freq = frequencyFactor
  if (!(freq > 0) || !Number.isFinite(freq)) return mid
  const period = (Math.PI * 2) / freq
  return (
    Math.sin(state.currentTime * freq + phaseFactor * period) * (span * 0.5) + mid
  )
}

export function wrapAroundRange(
  value: number,
  wrap: boolean,
  rangeMin: number,
  rangeMax: number
): number {
  if (!wrap) return value
  const rangeLength = rangeMax - rangeMin
  if (rangeLength > Number.EPSILON) {
    return value - rangeLength * Math.floor((value - rangeMin) / rangeLength)
  }
  return rangeMin
}

export function shortestSignedDistance(
  start: number,
  end: number,
  wrap: boolean,
  rangeMin: number,
  rangeMax: number
): number {
  if (!wrap) return end - start
  const distance = end - start
  const absDistance = Math.abs(distance)
  if (absDistance < Number.EPSILON) return 0
  const rangeLength = rangeMax - rangeMin
  const alternativeEnd = distance > 0 ? end - rangeLength : end + rangeLength
  const alternativeDistance = alternativeEnd - start
  return absDistance < Math.abs(alternativeDistance) ? distance : alternativeDistance
}

/** AnimNode_DampFloat::OnUpdate */
export function stepDampFloat(
  state: FloatDynState,
  inputValue: number,
  increaseSpeed: number,
  decreaseSpeed: number,
  wrap: boolean,
  rangeMin: number,
  rangeMax: number,
  dt: number
): void {
  const target = wrapAroundRange(inputValue, wrap, rangeMin, rangeMax)
  const difference = shortestSignedDistance(
    state.value,
    target,
    wrap,
    rangeMin,
    rangeMax
  )
  if (difference === 0) return
  const signedSpeed = difference >= 0 ? increaseSpeed : -decreaseSpeed
  const valueDelta = signedSpeed * dt
  // signedSpeed == 0 → snap immediately (engine)
  if (signedSpeed === 0 || Math.abs(difference) <= Math.abs(valueDelta)) {
    state.value = target
  } else {
    state.value = wrapAroundRange(state.value + valueDelta, wrap, rangeMin, rangeMax)
  }
}

/** AnimNode_SpringDamp::PerformStep */
function springPerformStep(
  state: FloatDynState,
  destinationValue: number,
  dt: number,
  massFactor: number,
  springFactor: number,
  dampFactor: number,
  wrap: boolean,
  rangeMin: number,
  rangeMax: number
): void {
  const valueDelta = -shortestSignedDistance(
    state.value,
    destinationValue,
    wrap,
    rangeMin,
    rangeMax
  )
  const mass = Math.max(massFactor, 1e-4)
  const acceleration = -(dampFactor * state.velocity + springFactor * valueDelta) / mass
  state.velocity += acceleration * 0.5 * dt
  state.value += state.velocity * dt
  state.value = wrapAroundRange(state.value, wrap, rangeMin, rangeMax)
}

/** AnimNode_SpringDamp::OnUpdate */
export function stepSpringDamp(
  state: FloatDynState,
  inputValue: number,
  massFactor: number,
  springFactor: number,
  dampFactor: number,
  wrap: boolean,
  rangeMin: number,
  rangeMax: number,
  timeStep: number,
  dt: number
): void {
  const target = wrapAroundRange(inputValue, wrap, rangeMin, rangeMax)
  const step = Math.max(timeStep, 1e-4)
  const stepsCount = Math.floor(dt / step)
  for (let i = 0; i < stepsCount; i++) {
    springPerformStep(
      state,
      target,
      step,
      massFactor,
      springFactor,
      dampFactor,
      wrap,
      rangeMin,
      rangeMax
    )
  }
  const remaining = dt - stepsCount * step
  if (remaining > 0) {
    springPerformStep(
      state,
      target,
      remaining,
      massFactor,
      springFactor,
      dampFactor,
      wrap,
      rangeMin,
      rangeMax
    )
  }
}

/**
 * TDamper_CriticalDampPolicy::Update + TDamper::Update(curr, vel, dest, dt)
 * DiffPolicy: curr - dest.
 */
export function stepCriticalSpringDamp(
  state: FloatDynState,
  dest: number,
  smoothTime: number,
  dt: number
): void {
  if (!Number.isFinite(smoothTime) || smoothTime === Infinity) return
  if (smoothTime > 0) {
    const omega = 2 / smoothTime
    const x = omega * dt
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
    const diff = state.value - dest
    const temp = (state.velocity + diff * omega) * dt
    state.velocity = (state.velocity - temp * omega) * exp
    state.value = dest + (diff + temp) * exp
  } else if (dt > 0) {
    state.velocity = (dest - state.value) / dt
    state.value = dest
  } else {
    state.value = dest
    state.velocity = 0
  }
}

/** Scale t into [0,1] between two key times (curveInterpolator helper::scale_t). */
function curveScaleT(t: number, min: number, max: number): number {
  return max - min > 0 ? (t - min) / (max - min) : 1
}

function curveClampKey(key: number, max: number): number {
  return Math.min(max, Math.max(0, key))
}

/** Modified interpolation search — floor index (curveInterpolator helper). */
function curveInterpolationSearch(times: number[], key: number): number {
  const numKeys = times.length
  if (numKeys === 0) return -1
  let low = 0
  let high = numKeys - 1
  let mid = 0
  if (times[0]! > key || key > times[numKeys - 1]!) return -1
  while (times[high] !== times[low] && key >= times[low]! && key <= times[high]!) {
    mid = low + Math.trunc(curveScaleT(key, times[low]!, times[high]!) * (high - low))
    if (times[mid]! < key) low = mid + 1
    else if (key < times[mid]!) high = mid - 1
    else return mid
  }
  if (key >= times[high]!) return high
  if (key >= times[low]!) return low
  return mid
}

function curveLinear(p0: number, p1: number, t: number): number {
  return p0 * (1 - t) + p1 * t
}

function curveQuadraticBezier(p0: number, c0: number, p1: number, t: number): number {
  const u = 1 - t
  return p0 * (u * u) + c0 * (2 * t * u) + p1 * (t * t)
}

function curveCubicBezier(
  p0: number,
  c0: number,
  c1: number,
  p1: number,
  t: number
): number {
  const u = 1 - t
  return (
    p0 * (u * u * u) +
    c0 * (3 * t * u * u) +
    c1 * (3 * t * t * u) +
    p1 * (t * t * t)
  )
}

/** Engine math::Interpolation::CubicHermite (p0, tangent0, tangent1, p1). */
function curveCubicHermite(
  p0: number,
  t0: number,
  t1: number,
  p1: number,
  t: number
): number {
  const t2 = t * t
  const t3 = t2 * t
  return (
    p0 * (2 * t3 - 3 * t2 + 1) +
    t0 * (t3 - 2 * t2 + t) +
    p1 * (-2 * t3 + 3 * t2) +
    t1 * (t3 - t2)
  )
}

/**
 * CurveDataFloat sample — CurveDataEvaluator::EvalAt + float interpolators.
 * Supports Constant / Linear / BezierQuadratic / BezierCubic / Hermite.
 * LinkType not applied (engine GetValue path is interpolator-type only).
 */
export function evalCurveFloatData(curveData: unknown, argument: number): number {
  if (!curveData || typeof curveData !== 'object') return argument
  const data = curveData as {
    InterpolationType?: string
    Elements?: Array<{
      point?: unknown
      Point?: unknown
      value?: unknown
      Value?: unknown
    }>
  }
  const elements = Array.isArray(data.Elements) ? data.Elements : []
  if (elements.length === 0) return argument

  const keys = elements
    .map((e) => ({
      point: readNumber(e.point ?? e.Point, 0),
      value: readNumber(e.value ?? e.Value, 0),
    }))
    .sort((a, b) => a.point - b.point)

  const times = keys.map((k) => k.point)
  const values = keys.map((k) => k.value)
  const numKeys = times.length
  if (numKeys === 0) return argument

  if (argument <= times[0]!) return values[0]!
  if (argument >= times[numKeys - 1]!) return values[numKeys - 1]!

  const interpRaw = String(data.InterpolationType ?? 'Linear')
  const interp = interpRaw
    .replace(/^curveE?/i, '')
    .replace(/^EIT_/i, '')
    .toLowerCase()

  const at = Math.min(times[numKeys - 1]!, Math.max(times[0]!, argument))

  if (interp.includes('constant')) {
    const idx = curveClampKey(curveInterpolationSearch(times, at), numKeys - 1)
    return values[idx]!
  }

  if (interp.includes('bezierquadratic') || interp.includes('quadraticbezier')) {
    if (numKeys < 3) return values[0]!
    let first = curveClampKey(curveInterpolationSearch(times, at), numKeys - 1)
    first = first - (first % 2)
    const second = curveClampKey(first + 1, numKeys - 1)
    const third = curveClampKey(second + 1, numKeys - 1)
    const t = curveScaleT(at, times[first]!, times[third]!)
    return curveQuadraticBezier(values[first]!, values[second]!, values[third]!, t)
  }

  if (
    interp.includes('beziercubic') ||
    interp.includes('cubicbezier') ||
    (interp.includes('bezier') && !interp.includes('quadratic'))
  ) {
    if (numKeys < 4) return values[0]!
    let first = curveClampKey(curveInterpolationSearch(times, at), numKeys - 1)
    first = first - (first % 3)
    const second = curveClampKey(first + 1, numKeys - 1)
    const third = curveClampKey(second + 1, numKeys - 1)
    const fourth = curveClampKey(third + 1, numKeys - 1)
    const t = curveScaleT(at, times[first]!, times[fourth]!)
    return curveCubicBezier(
      values[first]!,
      values[second]!,
      values[third]!,
      values[fourth]!,
      t
    )
  }

  if (interp.includes('hermite')) {
    if (numKeys < 4) return values[0]!
    let first = curveClampKey(curveInterpolationSearch(times, at), numKeys - 1)
    first = first - (first % 3)
    const second = curveClampKey(first + 1, numKeys - 1)
    const third = curveClampKey(second + 1, numKeys - 1)
    const fourth = curveClampKey(third + 1, numKeys - 1)
    const t = curveScaleT(at, times[first]!, times[fourth]!)
    return curveCubicHermite(
      values[first]!,
      values[second]!,
      values[third]!,
      values[fourth]!,
      t
    )
  }

  // Linear (default)
  let first = curveClampKey(curveInterpolationSearch(times, at), numKeys - 1)
  const second = curveClampKey(first + 1, numKeys - 1)
  const t = curveScaleT(at, times[first]!, times[second]!)
  return curveLinear(values[first]!, values[second]!, t)
}

export function readDampDefaults(d: Record<string, unknown>): {
  increaseSpeed: number
  decreaseSpeed: number
  startFromDefault: boolean
  defaultInitial: number
  wrap: boolean
  rangeMin: number
  rangeMax: number
} {
  return {
    increaseSpeed: Math.max(0, readNumber(d.defaultIncreaseSpeed, 1)),
    decreaseSpeed: Math.max(0, readNumber(d.defaultDecreaseSpeed, 1)),
    startFromDefault: readBool(d.startFromDefaultValue),
    defaultInitial: readNumber(d.defaultInitialValue, 0),
    wrap: readBool(d.wrapAroundRange),
    rangeMin: readNumber(d.rangeMin, -180),
    rangeMax: readNumber(d.rangeMax, 180),
  }
}

export function readSpringDefaults(d: Record<string, unknown>): {
  massFactor: number
  springFactor: number
  dampFactor: number
  startFromDefault: boolean
  defaultInitial: number
  wrap: boolean
  rangeMin: number
  rangeMax: number
  timeStep: number
} {
  return {
    massFactor: Math.max(1e-4, readNumber(d.massFactor, 1)),
    springFactor: Math.max(0, readNumber(d.springFactor, 1)),
    dampFactor: Math.max(0, readNumber(d.dampFactor, 1)),
    startFromDefault: readBool(d.startFromDefaultValue),
    defaultInitial: readNumber(d.defaultInitialValue, 0),
    wrap: readBool(d.wrapAroundRange),
    rangeMin: readNumber(d.rangeMin, -180),
    rangeMax: readNumber(d.rangeMax, 180),
    timeStep: Math.max(1e-4, readNumber(d.timeStep, 0.005)),
  }
}
