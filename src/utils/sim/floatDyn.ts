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

/** Linear / Constant curve sample from CurveDataFloat. Bezier etc. → linear. */
export function evalCurveFloatData(curveData: unknown, argument: number): number {
  if (!curveData || typeof curveData !== 'object') return argument
  const data = curveData as {
    InterpolationType?: string
    Elements?: Array<{ point?: unknown; value?: unknown }>
  }
  const elements = Array.isArray(data.Elements) ? data.Elements : []
  if (elements.length === 0) return argument

  const keys = elements
    .map((e) => ({
      point: readNumber(e.point, 0),
      value: readNumber(e.value, 0),
    }))
    .sort((a, b) => a.point - b.point)

  if (argument <= keys[0]!.point) return keys[0]!.value
  const last = keys[keys.length - 1]!
  if (argument >= last.point) return last.value

  const interp = String(data.InterpolationType ?? 'Linear').replace(/^curveE?/i, '')
  const isConstant = /constant/i.test(interp)

  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!
    const b = keys[i + 1]!
    if (argument > b.point) continue
    if (isConstant) return a.value
    const span = b.point - a.point
    if (Math.abs(span) < Number.EPSILON) return a.value
    const t = (argument - a.point) / span
    return a.value + (b.value - a.value) * t
  }
  return last.value
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
