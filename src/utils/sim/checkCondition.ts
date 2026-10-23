import type { AnimgraphNode } from '../graph/animgraphTypes'
import type { ClipLibrary } from './clipLibrary'
import {
  handleType,
  readCName,
  readNumber,
  readTagList
} from './simDataUtils'
import type { SimInputBoard } from './SimInputBoard'

export type SwitchConditionCtx = {
  clipLibrary?: ClipLibrary | null
  isWrapperActive?: (name: string) => boolean
}

/**
 * IStaticCondition for AnimNode_StaticSwitch (evaluated once at Init).
 * Null condition → true (engine).
 */
export function checkStaticCondition(
  condition: AnimgraphNode | null,
  board: SimInputBoard,
  ctx: SwitchConditionCtx = {}
): boolean {
  if (!condition) return true
  const t = handleType(condition) ?? ''
  const data = condition.Data ?? {}

  if (
    t === 'animHasAnimationCondition' ||
    t.endsWith('HasAnimationCondition') ||
    (/HasAnimation/i.test(t) && !t.includes('Transition'))
  ) {
    const name = readCName(data.animationName)
    if (!name || name === 'None') return false
    const lib = ctx.clipLibrary
    if (!lib || lib.entryCount === 0) return false
    const isWrap = ctx.isWrapperActive ?? ((n) => board.isWrapperActive(n))
    return lib.hasAnimation(name, isWrap)
  }

  if (
    t === 'animComponentTagCondition' ||
    t === 'animVisualTagCondition' ||
    t === 'animRigTagCondition'
  ) {
    const tag =
      readCName(data.animTag) ||
      readCName(data.visualTag) ||
      readCName(data.tag)
    return board.hasEntityTag(tag)
  }

  // Unknown static condition → false (safe offline default)
  return false
}

/**
 * IRuntimeCondition for AnimNode_RuntimeSwitch (every Update).
 * Null condition → true (engine).
 */
export function checkRuntimeCondition(
  condition: AnimgraphNode | null,
  board: SimInputBoard,
  ctx: SwitchConditionCtx = {}
): boolean {
  if (!condition) return true
  const t = handleType(condition) ?? ''
  const data = condition.Data ?? {}

  if (
    t === 'animAnimsetVariableCondition' ||
    t.endsWith('AnimsetVariableCondition')
  ) {
    const name = readCName(data.variableToCompare)
    if (!name || name === 'None') return false
    const threshold = readNumber(data.valueToCompare, 0.5)
    const w = board.wrapperWeights.get(name)
    if (w === undefined) {
      const lower = name.toLowerCase()
      for (const [k, v] of board.wrapperWeights) {
        if (k.toLowerCase() === lower) return v >= threshold
      }
      return false
    }
    return w >= threshold
  }

  if (
    t === 'animAnimsetWithOverridesTagCondition' ||
    t.endsWith('AnimsetWithOverridesTagCondition')
  ) {
    const tags = readTagList(data.animsetTags)
    if (tags.length === 0) return false
    const lib = ctx.clipLibrary
    if (!lib || lib.entryCount === 0) return false
    const isWrap = ctx.isWrapperActive ?? ((n) => board.isWrapperActive(n))
    return lib.hasRuntimeTags(tags, isWrap)
  }

  return false
}
