/**
 * Resolve pin UI colors from schema endpoint types (type → hex).
 */

import { getAnimTypeParent, isAnimType } from '../../animTypes'
import { isVirtualOverviewPinId } from '../crossViewPinIds'
import {
  PIN_COLOR_FALLBACK,
  PIN_ENDPOINT_COLOR,
} from './pinEndpointColors'
import {
  expectedTypeFromExtraPin,
  listExtraPins,
  listPinFields,
  pinSlotExpectedType,
} from './pinFields'
import type { PinEndpointType } from './pinEndpoints.generated'

function parsePinInputName(pinName: string): string | null {
  const match = pinName.match(/^([^[\]]+)(?:\[(?:\d+|\+)\])?$/)
  return match?.[1] ?? null
}

function colorForEndpointKey(typeName: string): string | null {
  if (Object.prototype.hasOwnProperty.call(PIN_ENDPOINT_COLOR, typeName)) {
    return PIN_ENDPOINT_COLOR[typeName as PinEndpointType]
  }
  return null
}

/**
 * Walk type → parents; first PIN_ENDPOINT_COLOR hit wins.
 * Use for outputs (CurveFloat → FloatValue color) and for input expected types
 * that may be interfaces with concrete implementations.
 */
export function resolvePinColorFromType(typeName: string): string | null {
  let current: string | null = typeName
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    const color = colorForEndpointKey(current)
    if (color) return color
    seen.add(current)
    current = getAnimTypeParent(current)
  }
  return null
}

/** Expected endpoint type for an input pin on `ownerType` (e.g. floatSockets[0]). */
export function getInputPinExpectedType(
  ownerType: string,
  pinName: string
): string | null {
  const inputName = parsePinInputName(pinName)
  if (!inputName) return null

  for (const field of listPinFields(ownerType, 'pin')) {
    if (field.key === inputName) return pinSlotExpectedType(field.type)
  }
  for (const extra of listExtraPins(ownerType)) {
    if (extra.name === inputName) return expectedTypeFromExtraPin(extra)
  }
  return null
}

/**
 * Input socket color = color of the pin's **expected** endpoint type.
 * Exact gather keys (WeightedQuat, TransitionCondition, …) keep personal colors —
 * no collapse into FloatValue / Base channels.
 */
export function getInputPinColor(ownerType: string, pinName: string): string | null {
  const expected = getInputPinExpectedType(ownerType, pinName)
  if (!expected) return null
  return colorForEndpointKey(expected) ?? resolvePinColorFromType(expected)
}

export function resolvePinColor(options: {
  nodeType: string
  pinId: string
  side: 'in' | 'out'
  /** Prefer explicit color from NodePinDesc when already resolved. */
  pinColor?: string
}): string {
  if (options.pinColor) return options.pinColor
  if (isVirtualOverviewPinId(options.pinId)) {
    return PIN_ENDPOINT_COLOR.animAnimNode_Base
  }
  if (options.side === 'out' || options.pinId === 'output') {
    return resolvePinColorFromType(options.nodeType) ?? PIN_COLOR_FALLBACK
  }
  return getInputPinColor(options.nodeType, options.pinId) ?? PIN_COLOR_FALLBACK
}

export function pinColorToNumber(hex: string): number {
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  return parseInt(h, 16)
}

/**
 * Engine-style connect check: from.$type must be under the pin's expected base.
 * Overview portal pins are not connect targets (wires only detach; portals GC on disconnect).
 * Unknown/unmapped pins are not blocked.
 */
export function canConnectByPinType(
  fromType: string,
  ownerType: string,
  pinName: string
): boolean {
  if (isVirtualOverviewPinId(pinName)) return false
  const expected = getInputPinExpectedType(ownerType, pinName)
  if (!expected) return true
  return isAnimType(fromType, expected)
}
