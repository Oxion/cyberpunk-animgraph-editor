import type { AnimgraphNode } from '../graph/animgraphTypes'
import type { RenderData } from '../graph/diagramTypes'
import { NodeDefinitionRegistry } from '../NodeDefinition'
import { isAnimType } from '../animTypes/registry'
import {
  checkRuntimeCondition,
  checkStaticCondition,
  normalizeCompareFunc,
  type CheckConditionCtx,
} from './checkCondition'
import { SimConditionDyn } from './conditionDyn'
import {
  blend2WeightFromInput,
  blendByMaskDynamicBlendActive,
  blendMultipleFirstInputActive,
  blendMultipleSecondInputActive,
  buildBlendMultipleSlots,
  selectBlendMultipleInputs,
} from './engineParity'
import { evalAnimMathExpression, listMathExprIdents } from './evalAnimMathExpression'
import {
  evalAnimMathExpressionVector,
  listMathExprVectorIdents,
  vec4Mag3,
  ZERO_VEC4,
  type SimVec4,
} from './evalAnimMathExpressionVector'
import {
  createFloatRandomState,
  createFloatSinusState,
  evalCurveFloatData,
  evalFloatTimeDependentSinus,
  readDampDefaults,
  readSpringDefaults,
  stepCriticalSpringDamp,
  stepDampFloat,
  stepFloatRandom,
  stepFloatTimeDependentSinus,
  stepSpringDamp,
  wrapAroundRange,
  type FloatDynState,
  type FloatRandomState,
  type FloatSinusState,
} from './floatDyn'
import {
  createSignalState,
  readSignalParams,
  signalGetValue,
  stepSignal,
  type SignalDynState,
} from './signalDyn'
import {
  advanceClipClock,
  beginClipClockStep,
  createClipClockState,
  deactivateClipClock,
  type ClipClockState,
} from './clipClock'
import {
  readAnimDatabaseDepotPath,
  resolveAnimDatabaseName,
  type AnimDatabaseLibrary,
} from './animDatabase'
import {
  handleType,
  isLogicOpOr,
  readBool,
  readCName,
  readCNameList,
  readNumber,
  readTagList,
  readVector4,
  resolveHandle,
} from './simDataUtils'
import type { ClipLibrary } from './clipLibrary'
import type { SimInputBoard } from './SimInputBoard'
import {
  findStateMachineHandles,
  SimStateMachineRuntime,
  updateStateMachine,
} from './SimStateMachine'
import type { SimNodeState, SimSnapshot, SimActiveClip, SimClipResolve } from './simTypes'
import { diffSimNodeStates, emptySimSnapshot } from './simTypes'

/** Classify SkAnim clip lookup for HUD (ok / empty / no-lib / missing / gated). */
function classifyClipResolve(
  animName: string,
  library: ClipLibrary | null,
  isWrapperActive: (name: string) => boolean
): SimClipResolve {
  if (!animName || animName === 'None') return 'empty'
  if (!library || library.entryCount === 0) return 'no-lib'
  if (library.resolveClip(animName, isWrapperActive)) return 'ok'
  if (library.hasClipAnywhere(animName)) return 'gated'
  return 'missing'
}

/**
 * Mark SkAnim clock for HUD; advance only when a ClipLibrary is loaded
 * (avoids AnimEnd spam with empty library).
 */
function runSkAnimClipClock(node: AnimgraphNode, ctx: WalkCtx) {
  const d = (node.Data ?? {}) as Record<string, unknown>
  const fields = readSkAnimClockFields(d)
  const clock = ensureClipClock(ctx.clipClocks, node.HandleId)
  if (ctx.clipLibrary && ctx.clipLibrary.entryCount > 0) {
    advanceClipClock(
      clock,
      fields,
      ctx.dt,
      ctx.clipLibrary,
      ctx.board,
      (n) => ctx.board.isWrapperActive(n)
    )
    return
  }
  // No library: still expose active clip name in status (no time / no AnimEnd)
  if (clock.stepped) return
  clock.stepped = true
  clock.animName = fields.animation || 'None'
  clock.wasActive = true
}

/** Resolve AnimDatabase CSV row → animation CName, then run clip clock. */
function runAnimDatabaseClipClock(node: AnimgraphNode, ctx: WalkCtx) {
  const d = (node.Data ?? {}) as Record<string, unknown>
  const depot = readAnimDatabaseDepotPath(d)
  const db = ctx.animDbLibrary?.findByDepotPath(depot)
  const clock = ensureClipClock(ctx.clipClocks, node.HandleId)

  if (!db) {
    if (clock.stepped) return
    clock.stepped = true
    clock.animName = depot || 'None'
    clock.wasActive = true
    clock.resolveHint = 'no-db'
    return
  }

  const inputLinks = Array.isArray(d.inputLinks) ? d.inputLinks : []
  const inputs: number[] = []
  for (const link of inputLinks) {
    const h = resolveHandle(ctx.handles, link)
    inputs.push(Math.round(h ? readFloatSource(h, ctx, 0) : 0))
  }
  const animName = resolveAnimDatabaseName(db, inputs)
  const fields = {
    ...readSkAnimClockFields(d),
    animation: animName,
  }
  // Reset playback when database picks a different clip (sim: re-query each frame)
  if (clock.wasActive && clock.animName && clock.animName !== animName) {
    clock.wasActive = false
  }
  if (ctx.clipLibrary && ctx.clipLibrary.entryCount > 0) {
    advanceClipClock(
      clock,
      fields,
      ctx.dt,
      ctx.clipLibrary,
      ctx.board,
      (n) => ctx.board.isWrapperActive(n)
    )
    if (animName === 'None') clock.resolveHint = 'missing'
    return
  }
  if (clock.stepped) return
  clock.stepped = true
  clock.animName = animName
  clock.wasActive = true
  if (animName === 'None') clock.resolveHint = 'missing'
}

function markActive(
  nodes: Record<string, SimNodeState>,
  id: string,
  patch: Partial<SimNodeState> = {}
): void {
  const prev = nodes[id] ?? { active: false }
  nodes[id] = { ...prev, active: true, ...patch }
}

function markInactive(
  nodes: Record<string, SimNodeState>,
  id: string,
  force = false
): void {
  if (!force && nodes[id]?.active) return
  nodes[id] = { ...(nodes[id] ?? {}), active: false }
}

/** Shared float-eval context (board + stateful damp/spring/latch/signal). */
type FloatEvalCtx = {
  board: SimInputBoard
  handles: Map<string, AnimgraphNode>
  dt: number
  floatDyn: Map<string, FloatDynState>
  floatUpdated: Set<string>
  randomDyn: Map<string, FloatRandomState>
  sinusDyn: Map<string, FloatSinusState>
  signalDyn: Map<string, SignalDynState>
  signalUpdated: Set<string>
  clipLibrary: ClipLibrary | null
}

type WalkCtx = FloatEvalCtx & {
  nodes: Record<string, SimNodeState>
  visited: Set<string>
  runtimes: Map<string, SimStateMachineRuntime>
  condCtx: CheckConditionCtx
  clipClocks: Map<string, ClipClockState>
  animDbLibrary: AnimDatabaseLibrary | null
  /** Cached StaticSwitch Init results (handleId → useTrue). */
  staticSwitchResults: Map<string, boolean>
  /** Frame meta for nested GraphSlot runners. */
  time: number
  playing: boolean
  speed: number
  /**
   * Project GraphSlot attach: resolve slot name → child diagram runner.
   * Nested updates share the board; child owns its own dyn/SM state.
   */
  slotHost?: SimGraphSlotHost
  /** GraphSlotInput → Update parent slot inputLink (engine m_parentGraphLink). */
  parentPoseUpdate?: () => void
}

/** Project GraphSlot attach: resolve slot name → nested diagram Update. */
export type SimGraphSlotHost = {
  /**
   * Run nested diagram Update (shared board, no endFrame).
   * Returns null when slot name missing, unknown, or cycle.
   */
  stepNested(
    slotName: string,
    parentPoseUpdate?: () => void
  ): { diagramId: string; snap: SimSnapshot } | null
}

export type SimStepOptions = {
  /** When false, caller owns board.endFrame (multi-runner / nested publish). Default true. */
  endBoardFrame?: boolean
  slotHost?: SimGraphSlotHost
  parentPoseUpdate?: () => void
}

function isGraphSlotType(t: string | null | undefined): boolean {
  return (
    t === 'animAnimNode_GraphSlot' ||
    t === 'animAnimNode_GraphSlot_Test' ||
    t === 'animAnimNode_GraphSlotConditions'
  )
}

/** SkAnim playback clock (exclude frame/duration-driven + AnimDatabase). */
function isClipClockSkAnimType(t: string | null | undefined): boolean {
  if (!t || !isAnimType(t, 'animAnimNode_SkAnim')) return false
  if (t.includes('SkFrameAnim')) return false
  if (t === 'animAnimNode_SkDurationAnim') return false
  if (t === 'animAnimNode_AnimDatabase') return false
  return true
}

function isAnimDatabaseType(t: string | null | undefined): boolean {
  return t === 'animAnimNode_AnimDatabase'
}

function readSkAnimClockFields(data: Record<string, unknown>) {
  return {
    animation: readCName(data.animation),
    isLooped: data.isLooped === undefined ? true : readBool(data.isLooped),
    resume: readBool(data.resume),
    collectEvents: data.collectEvents === undefined ? true : readBool(data.collectEvents),
    fireAnimLoopEvent: readBool(data.fireAnimLoopEvent),
    animLoopEventName: readCName(data.animLoopEventName),
    clipFront: readNumber(data.clipFront, 0),
    clipEnd: readNumber(data.clipEnd, 0),
  }
}

function ensureClipClock(
  clocks: Map<string, ClipClockState>,
  handleId: string
): ClipClockState {
  let s = clocks.get(handleId)
  if (!s) {
    s = createClipClockState()
    clocks.set(handleId, s)
  }
  return s
}

/**
 * Advance SkAnim clocks along a pose path without touching overlay visited.
 * Used before SM CheckTransitions so AnimEnd is visible same frame (engine order).
 */
function tickClipClocksAlongPose(
  node: AnimgraphNode | null,
  ctx: WalkCtx,
  clockVisited: Set<string>
): void {
  if (!node) return
  if (clockVisited.has(node.HandleId)) return
  clockVisited.add(node.HandleId)

  const t = handleType(node)
  const d = (node.Data ?? {}) as Record<string, unknown>
  const { handles } = ctx

  if (t === 'animAnimNode_Output') {
    tickClipClocksAlongPose(
      resolveHandle(handles, d.inputNode ?? d.input ?? d.node),
      ctx,
      clockVisited
    )
    return
  }

  if (t === 'animAnimNode_State' || t === 'animAnimNode_StateFrozen') {
    tickClipClocksAlongPose(findStateOutput(node, handles), ctx, clockVisited)
    return
  }

  if (isAnimDatabaseType(t)) {
    runAnimDatabaseClipClock(node, ctx)
    return
  }

  if (isClipClockSkAnimType(t)) {
    runSkAnimClipClock(node, ctx)
    return
  }

  // Follow same pose branching heuristics as updateFromNode for common mixers
  if (t === 'animAnimNode_Blend2') {
    const weightNode = resolveHandle(handles, d.weightNode)
    let weight = 0.5
    if (weightNode) {
      const raw = readFloatSource(weightNode, ctx, NaN)
      if (Number.isFinite(raw)) {
        weight = blend2WeightFromInput(
          raw,
          readNumber(d.minInputValue, 0),
          readNumber(d.maxInputValue, 1)
        )
      }
    }
    const first = resolveHandle(handles, d.firstInputNode)
    const second = resolveHandle(handles, d.secondInputNode)
    if (first && weight < 1) tickClipClocksAlongPose(first, ctx, clockVisited)
    if (second && weight > 0) tickClipClocksAlongPose(second, ctx, clockVisited)
    return
  }

  if (t === 'animAnimNode_Switch') {
    const weightNode = resolveHandle(handles, d.weightNode)
    let weight = 0
    if (weightNode) weight = readFloatSource(weightNode, ctx, 0)
    const inputs = Array.isArray(d.inputNodes) ? d.inputNodes : []
    const numInputs = readNumber(d.numInputs, inputs.length)
    const index = switchIndexFromWeight(weight, Math.max(numInputs, inputs.length))
    const h = resolveHandle(handles, inputs[index])
    tickClipClocksAlongPose(h, ctx, clockVisited)
    return
  }

  if (t === 'animAnimNode_BlendMultiple') {
    const { slots, select } = resolveBlendMultipleSelection(
      d as Record<string, unknown>,
      ctx
    )
    if (
      select.firstIndex >= 0 &&
      blendMultipleFirstInputActive(select.alpha)
    ) {
      tickClipClocksAlongPose(
        resolveHandle(handles, slots.refs[select.firstIndex]),
        ctx,
        clockVisited
      )
    }
    if (
      select.secondIndex >= 0 &&
      blendMultipleSecondInputActive(select.alpha)
    ) {
      tickClipClocksAlongPose(
        resolveHandle(handles, slots.refs[select.secondIndex]),
        ctx,
        clockVisited
      )
    }
    return
  }

  if (t === 'animAnimNode_StaticSwitch' || t === 'animAnimNode_RuntimeSwitch') {
    const cond = resolveHandle(handles, d.condition)
    let useTrue: boolean
    if (t === 'animAnimNode_StaticSwitch') {
      useTrue =
        ctx.staticSwitchResults?.get(node.HandleId) ??
        checkStaticCondition(cond, ctx.board, {
          clipLibrary: ctx.clipLibrary,
          isWrapperActive: (n) => ctx.board.isWrapperActive(n),
        })
    } else {
      useTrue = checkRuntimeCondition(cond, ctx.board, {
        clipLibrary: ctx.clipLibrary,
        isWrapperActive: (n) => ctx.board.isWrapperActive(n),
      })
    }
    const branch = useTrue
      ? resolveHandle(handles, d.True ?? d.true)
      : resolveHandle(handles, d.False ?? d.false)
    tickClipClocksAlongPose(branch, ctx, clockVisited)
    return
  }

  if (t === 'animAnimNode_BlendAdditive') {
    tickClipClocksAlongPose(resolveHandle(handles, d.inputNode), ctx, clockVisited)
    const wNode = resolveHandle(handles, d.weightNode)
    let w = 0
    if (wNode) w = readFloatSource(wNode, ctx, 0)
    if (isBlendAdditiveInputActive(w)) {
      tickClipClocksAlongPose(resolveHandle(handles, d.addedInputNode), ctx, clockVisited)
    }
    return
  }

  // Generic: follow pose input pins
  forEachLinkedInput(node, handles, (linked) =>
    tickClipClocksAlongPose(linked, ctx, clockVisited)
  )
}

/** Follow diagram pin inputs (schema + extraPins), not a hardcoded field list. */
function forEachLinkedInput(
  node: AnimgraphNode,
  handles: Map<string, AnimgraphNode>,
  visit: (linked: AnimgraphNode | null) => void
): void {
  const t = handleType(node)
  if (!t) return
  for (const pinName of NodeDefinitionRegistry.getInputFields(t)) {
    const handler = NodeDefinitionRegistry.getNodeInputHandler(t, pinName)
    const n = handler.count(node)
    for (let i = 0; i < n; i++) {
      visit(resolveHandle(handles, handler.get(node, i)))
    }
  }
}

/** Dim an unused pose branch (Switch/Blend unused inputs) without Update.
 * Skip nodes already Update()'d this frame — shared base poses (e.g. BlendAdditive
 * inputNode) must stay lit even if also reachable from an unused branch.
 */
function markInactiveBranch(
  node: AnimgraphNode | null,
  handles: Map<string, AnimgraphNode>,
  nodes: Record<string, SimNodeState>,
  seen: Set<string>,
  activeVisited: Set<string>
): void {
  if (!node) return
  if (seen.has(node.HandleId)) return
  if (activeVisited.has(node.HandleId)) return
  seen.add(node.HandleId)
  markInactive(nodes, node.HandleId, true)

  forEachLinkedInput(node, handles, (linked) =>
    markInactiveBranch(linked, handles, nodes, seen, activeVisited)
  )
  // State / SM pose graphs live in contain fields, not pins.
  const d = node.Data ?? {}
  for (const key of ['nodes', 'outputNode', 'states'] as const) {
    const val = d[key]
    if (Array.isArray(val)) {
      for (const ref of val) {
        markInactiveBranch(resolveHandle(handles, ref), handles, nodes, seen, activeVisited)
      }
    } else if (val != null) {
      markInactiveBranch(resolveHandle(handles, val), handles, nodes, seen, activeVisited)
    }
  }
}

/** Engine AnimNode_BlendAdditive::ACTIVATION_THRESHOLD */
const BLEND_ADDITIVE_ACTIVATION = 0.01

function isBlendAdditiveInputActive(weight: number): boolean {
  return Math.abs(weight) > BLEND_ADDITIVE_ACTIVATION
}

function boardFloat(
  board: SimInputBoard,
  varName: string,
  fallback: number
): number {
  if (!varName) return fallback
  const v = board.floatVars.get(varName)
  return v !== undefined ? v : fallback
}

function linkOrConst(
  link: unknown,
  constVal: unknown,
  fctx: FloatEvalCtx,
  fallback: number,
  depth: number
): number {
  const h = resolveHandle(fctx.handles, link)
  if (h) return readFloatSource(h, fctx, fallback, depth + 1)
  return readNumber(constVal, fallback)
}

function compareFloatOp(a: number, b: number, operation: unknown): boolean {
  const eps = Number.EPSILON * 8
  switch (normalizeCompareFunc(operation)) {
    case 'equal':
      return Math.abs(a - b) <= eps
    case 'notequal':
      return Math.abs(a - b) > eps
    case 'less':
      return a < b
    case 'lessequal':
      return a <= b
    case 'greater':
      return a > b
    case 'greaterequal':
      return a >= b
    default:
      return Math.abs(a - b) <= eps
  }
}

function evalFloatMathOp(a: number, b: number, operationType: unknown): number {
  const op = String(operationType ?? 'Abs')
    .replace(/^AGMO_/i, '')
    .toLowerCase()
  switch (op) {
    case 'add':
      return a + b
    case 'subtract':
      return a - b
    case 'multiply':
      return a * b
    case 'divide': {
      const d = Math.abs(b) < Number.EPSILON ? Math.sign(b || 1) * Number.EPSILON : b
      return a / d
    }
    case 'safedivide':
      return Math.abs(b) < Number.EPSILON ? 0 : a / b
    case 'atan':
      return Math.atan2(a, b) / Math.PI
    case 'anglediff': {
      let ret = a - b
      while (ret < -1) ret += 2
      while (ret > 1) ret -= 2
      return ret
    }
    case 'length':
      return Math.sqrt(a * a + b * b)
    case 'abs':
    default:
      return Math.abs(a)
  }
}

/** Collect float socket vars from MathExpressionFloat expressionData. */
function collectMathFloatSocketVars(
  node: AnimgraphNode,
  fctx: FloatEvalCtx,
  depth: number
): Record<string, number> {
  const vars: Record<string, number> = {}
  const sockets = node.Data?.expressionData?.floatSockets
  if (!Array.isArray(sockets)) return vars
  const expr = String(
    node.Data?.expressionString ??
      node.Data?.expressionData?.expressionString ??
      node.Data?.expression ??
      ''
  )
  const idents = listMathExprIdents(expr)
  sockets.forEach((socket: any, index: number) => {
    const varId = readNumber(socket?.expressionVarId, index)
    const letter = String.fromCharCode(65 + Math.max(0, varId))
    const named = readCName(socket?.variableName)
    const ident = idents[varId] ?? idents[index]
    const src = resolveHandle(fctx.handles, socket?.link ?? socket)
    const v = readFloatSource(src, fctx, 0, depth + 1)
    if (named) vars[named] = v
    if (ident) vars[ident] = v
    vars[letter] = v
    if (index === 0 || varId === 0) {
      if (vars.In === undefined) vars.In = v
      if (vars.in === undefined) vars.in = v
    }
  })
  return vars
}

function evalMathExpressionFloat(
  node: AnimgraphNode,
  fctx: FloatEvalCtx,
  depth = 0
): number {
  const vars = collectMathFloatSocketVars(node, fctx, depth)
  const expr = String(
    node.Data?.expressionString ??
      node.Data?.expressionData?.expressionString ??
      node.Data?.expression ??
      ''
  )
  if (expr) {
    const result = evalAnimMathExpression(expr, vars)
    if (result != null) return result
  }
  const first = Object.values(vars)[0]
  return first ?? 0
}

function mathExpressionString(node: AnimgraphNode): string {
  return String(
    node.Data?.expressionString ??
      node.Data?.expressionData?.expressionString ??
      node.Data?.expression ??
      ''
  )
}

/** Collect vector socket vars from MathExpressionVector expressionData. */
function collectMathVectorSocketVars(
  node: AnimgraphNode,
  fctx: FloatEvalCtx,
  depth: number
): Record<string, SimVec4> {
  const vars: Record<string, SimVec4> = {}
  const sockets = node.Data?.expressionData?.vectorSockets
  if (!Array.isArray(sockets)) return vars
  const idents = listMathExprVectorIdents(mathExpressionString(node))
  sockets.forEach((socket: any, index: number) => {
    const varId = readNumber(socket?.expressionVarId, index)
    const letter = String.fromCharCode(65 + Math.max(0, varId))
    const named = readCName(socket?.variableName)
    const ident = idents[varId] ?? idents[index]
    const src = resolveHandle(fctx.handles, socket?.link ?? socket)
    const v = readVectorSource(src, fctx, ZERO_VEC4, depth + 1)
    if (named) vars[named] = v
    if (ident) vars[ident] = v
    vars[letter] = v
    if (index === 0 || varId === 0) {
      if (vars.In === undefined) vars.In = v
      if (vars.in === undefined) vars.in = v
      if (vars.Input === undefined) vars.Input = v
    }
  })
  return vars
}

function evalMathExpressionVector(
  node: AnimgraphNode,
  fctx: FloatEvalCtx,
  depth = 0
): SimVec4 {
  const floatVars = collectMathFloatSocketVars(node, fctx, depth)
  const vectorVars = collectMathVectorSocketVars(node, fctx, depth)
  const expr = mathExpressionString(node)
  if (expr) {
    const result = evalAnimMathExpressionVector(expr, floatVars, vectorVars)
    if (result) return result
  }
  const first = Object.values(vectorVars)[0]
  return first ?? ZERO_VEC4
}

function evalFloatInterpolation(
  node: AnimgraphNode,
  fctx: FloatEvalCtx,
  depth: number
): number {
  const d = node.Data ?? {}
  const x = linkOrConst(d.inputNode, 0, fctx, 0, depth)
  const x1 = readNumber(d.x1, 0)
  const x2 = readNumber(d.x2, 1)
  const y1 = readNumber(d.y1, 0)
  const y2 = readNumber(d.y2, 1)
  if (Math.abs(x2 - x1) < Number.EPSILON) return y1
  const t = Math.min(1, Math.max(0, (x - x1) / (x2 - x1)))
  // Matches engine AnimNode_FloatInterpolation::OnGetValue — m_interpolationType
  // (AGMI_SIN / AGMI_BEZIER) is stored but unused; always linear remap + clamp.
  return y1 + (y2 - y1) * t
}

function evalSignalFloat(node: AnimgraphNode, fctx: FloatEvalCtx): number {
  const id = node.HandleId
  const params = readSignalParams((node.Data ?? {}) as Record<string, unknown>)
  if (fctx.signalUpdated.has(id)) {
    const existing = fctx.signalDyn.get(id)
    return existing ? signalGetValue(existing, params) : 0
  }
  let state = fctx.signalDyn.get(id)
  if (!state) {
    state = createSignalState(params)
    fctx.signalDyn.set(id, state)
  }
  fctx.signalUpdated.add(id)
  stepSignal(state, params, fctx.board, fctx.dt)
  return signalGetValue(state, params)
}

/**
 * AnimNode_EventValue — latch last-frame valued timeline event value.
 * Holds until next matching valued event (animNode_Numeric.cpp).
 */
function evalEventValueFloat(node: AnimgraphNode, fctx: FloatEvalCtx): number {
  const id = node.HandleId
  const d = node.Data ?? {}
  const eventName = readCName(d.eventName)
  const def = readNumber(d.defaultValue, 0)
  if (fctx.floatUpdated.has(id)) {
    return fctx.floatDyn.get(id)?.value ?? def
  }
  let state = fctx.floatDyn.get(id)
  if (!state) {
    state = { value: def, velocity: 0 }
    fctx.floatDyn.set(id, state)
  }
  fctx.floatUpdated.add(id)
  const hit = fctx.board.getLastFrameAnimEventValue(eventName)
  if (hit !== undefined) state.value = hit
  return state.value
}

/** AnimNode_Event — eventValue while last-frame event present, else default. */
function evalEventFloat(node: AnimgraphNode, board: SimInputBoard): number {
  const d = node.Data ?? {}
  const eventName = readCName(d.eventName)
  const def = readNumber(d.defaultValue, 0)
  if (eventName && board.hasAnimEvent(eventName)) {
    return readNumber(d.eventValue, 1)
  }
  return def
}

/** AnimNode_TagValue — data-flow tag float, optional oneMinus. */
function evalTagValueFloat(node: AnimgraphNode, board: SimInputBoard): number {
  const d = node.Data ?? {}
  const tag = readCName(d.tag)
  const def = readNumber(d.defaultValue, 0)
  const hit = board.getTagValue(tag)
  if (hit === undefined) return def
  return readBool(d.oneMinus) ? 1 - hit : hit
}

/**
 * AnimNode_AnimSetTagValue — 1 if any node tag matches active anim-set tags.
 */
function evalAnimSetTagValueFloat(
  node: AnimgraphNode,
  board: SimInputBoard,
  library: ClipLibrary | null
): number {
  const tags = readTagList((node.Data ?? {}).tags)
  if (!tags.length || !library || library.entryCount === 0) return 0
  return library.hasRuntimeTags(tags, (n) => board.isWrapperActive(n)) ? 1 : 0
}

/**
 * AnimNode_MultiBoolToFloatValue — AND/OR of AnimFeature bools → onTrue/onFalse.
 */
function evalMultiBoolToFloat(node: AnimgraphNode, board: SimInputBoard): number {
  const d = node.Data ?? {}
  const onTrue = readNumber(d.onTrue, 1)
  const onFalse = readNumber(d.onFalse, 0)
  const allMust = readBool(d.allMustBeTrue)
  const inputs = Array.isArray(d.inputsData) ? d.inputsData : []
  if (!inputs.length) return onFalse

  if (allMust) {
    for (const raw of inputs) {
      if (!raw || typeof raw !== 'object') return onFalse
      const e = raw as Record<string, unknown>
      const group = readCName(e.group)
      const name = readCName(e.name)
      const v = board.getBoolFeature(group, name)
      if (v !== true) return onFalse
    }
    return onTrue
  }

  for (const raw of inputs) {
    if (!raw || typeof raw !== 'object') continue
    const e = raw as Record<string, unknown>
    const group = readCName(e.group)
    const name = readCName(e.name)
    if (board.getBoolFeature(group, name) === true) return onTrue
  }
  return onFalse
}

/**
 * AnimNode_Timer — elapsed seconds since activate (reset when dyn state created).
 */
function evalTimerFloat(node: AnimgraphNode, fctx: FloatEvalCtx): number {
  const id = node.HandleId
  if (fctx.floatUpdated.has(id)) {
    return fctx.floatDyn.get(id)?.value ?? 0
  }
  let state = fctx.floatDyn.get(id)
  if (!state) {
    state = { value: 0, velocity: 0 }
    fctx.floatDyn.set(id, state)
  } else {
    state.value += Math.max(0, fctx.dt)
  }
  fctx.floatUpdated.add(id)
  return state.value
}

/**
 * AnimNode_WrapperValue::RecacheWrapperValue — OR/AND of active wrapper flags → 0/1,
 * then optional oneMinus. Active = weight >= 0.5 (SetAnimWrapperWeight).
 */
function evalWrapperValueFloat(node: AnimgraphNode, board: SimInputBoard): number {
  const d = node.Data ?? {}
  const names = readCNameList(d.wrapperNames)
  let ret = false
  if (names.length > 0) {
    if (isLogicOpOr(d.logicOp)) {
      for (const name of names) {
        if (board.isWrapperActive(name)) {
          ret = true
          break
        }
      }
    } else {
      ret = true
      for (const name of names) {
        if (!board.isWrapperActive(name)) {
          ret = false
          break
        }
      }
    }
  }
  if (readBool(d.oneMinus)) ret = !ret
  return ret ? 1 : 0
}

/** Types that participate in float value Update + badge. */
function isFloatValueNodeType(t: string): boolean {
  return (
    t === 'animAnimNode_FloatInput' ||
    t === 'animAnimNode_IntInput' ||
    t === 'animAnimNode_BoolInput' ||
    t === 'animAnimNode_FloatConstant' ||
    t === 'animAnimNode_IntConstant' ||
    t === 'animAnimNode_FloatVariable' ||
    t === 'animAnimNode_IntVariable' ||
    t === 'animAnimNode_BoolVariable' ||
    t === 'animAnimNode_DampFloat' ||
    t === 'animAnimNode_SpringDamp' ||
    t === 'animAnimNode_CriticalSpringDamp' ||
    t === 'animAnimNode_MathExpressionFloat' ||
    t === 'animAnimNode_FloatComparator' ||
    t === 'animAnimNode_FloatMathOp' ||
    t === 'animAnimNode_FloatClamp' ||
    t === 'animAnimNode_FloatJoin' ||
    t === 'animAnimNode_FloatLatch' ||
    t === 'animAnimNode_FloatInterpolation' ||
    t === 'animAnimNode_CurveFloatValue' ||
    t === 'animAnimNode_FloatRandom' ||
    t === 'animAnimNode_FloatTimeDependentSinus' ||
    t === 'animAnimNode_Signal' ||
    t === 'animAnimNode_EventValue' ||
    t === 'animAnimNode_Event' ||
    t === 'animAnimNode_TagValue' ||
    t === 'animAnimNode_WrapperValue' ||
    t === 'animAnimNode_AnimSetTagValue' ||
    t === 'animAnimNode_MultiBoolToFloatValue' ||
    t === 'animAnimNode_Timer' ||
    t === 'animAnimNode_IntToFloatConverter' ||
    t === 'animAnimNode_BoolToFloatConverter' ||
    t === 'animAnimNode_FloatToIntConverter' ||
    /Converter$/i.test(t)
  )
}

/** Types that participate in vector value Update + length badge. */
function isVectorValueNodeType(t: string): boolean {
  return (
    t === 'animAnimNode_VectorInput' ||
    t === 'animAnimNode_VectorConstant' ||
    t === 'animAnimNode_VectorJoin' ||
    t === 'animAnimNode_MathExpressionVector'
  )
}

function walkFloatValueInputs(node: AnimgraphNode, ctx: WalkCtx): void {
  forEachLinkedInput(node, ctx.handles, (linked) => updateFromNode(linked, ctx))
}

/** Read Vector4 from a vector source node (Input / Constant / Join / MathExpression). */
function readVectorSource(
  source: AnimgraphNode | null,
  fctx: FloatEvalCtx,
  fallback: SimVec4 = ZERO_VEC4,
  depth = 0
): SimVec4 {
  if (!source || depth > 32) return fallback
  const t = handleType(source)
  const d = source.Data ?? {}
  const { board, handles } = fctx

  if (t === 'animAnimNode_VectorInput') {
    const group = readCName(d.group)
    const name = readCName(d.name)
    if (!group || !name || name === 'None') return fallback
    return board.getVectorFeature(group, name) ?? fallback
  }

  if (t === 'animAnimNode_VectorConstant') {
    return readVector4(d.value, fallback)
  }

  if (t === 'animAnimNode_VectorJoin') {
    const input = resolveHandle(handles, d.input)
    if (input) return readVectorSource(input, fctx, fallback, depth + 1)
    return fallback
  }

  if (t === 'animAnimNode_MathExpressionVector') {
    return evalMathExpressionVector(source, fctx, depth)
  }

  return fallback
}

/** Read numeric value from a float/int source node (variable / constant / AnimFeature input). */
function readFloatSource(
  source: AnimgraphNode | null,
  fctx: FloatEvalCtx,
  fallback = 0,
  depth = 0
): number {
  if (!source || depth > 32) return fallback
  const t = handleType(source)
  const d = source.Data ?? {}
  const { board, handles } = fctx

  // External AnimFeature: group + name (FloatInput / IntInput)
  if (t === 'animAnimNode_FloatInput' || t === 'animAnimNode_IntInput') {
    const group = readCName(d.group)
    const name = readCName(d.name)
    const fromFeature = board.getFeature(group, name)
    if (fromFeature !== undefined) return fromFeature
    return fallback
  }

  if (t === 'animAnimNode_BoolInput') {
    const group = readCName(d.group)
    const name = readCName(d.name)
    const fromFeature = board.getBoolFeature(group, name)
    if (fromFeature !== undefined) return fromFeature ? 1 : 0
    return fallback
  }

  if (t === 'animAnimNode_FloatConstant' || t === 'animAnimNode_IntConstant') {
    return readNumber(d.value ?? d.floatValue, fallback)
  }

  if (t === 'animAnimNode_IntVariable') {
    const name = readCName(d.variableName)
    if (name && board.intVars.has(name)) return board.intVars.get(name)!
    return fallback
  }

  if (t === 'animAnimNode_BoolVariable') {
    const name = readCName(d.variableName)
    if (name && board.boolVars.has(name)) return board.boolVars.get(name) ? 1 : 0
    return fallback
  }

  if (t === 'animAnimNode_MathExpressionFloat') {
    return evalMathExpressionFloat(source, fctx, depth)
  }

  if (t === 'animAnimNode_FloatComparator') {
    const a = linkOrConst(d.firstInputLink, d.firstValue, fctx, 0, depth)
    const b = linkOrConst(d.secondInputLink, d.secondValue, fctx, 0, depth)
    const ok = compareFloatOp(a, b, d.operation)
    return ok
      ? linkOrConst(d.trueInputLink, d.trueValue, fctx, 0, depth)
      : linkOrConst(d.falseInputLink, d.falseValue, fctx, 0, depth)
  }

  if (t === 'animAnimNode_FloatMathOp') {
    const a = linkOrConst(d.firstInputNode, 0, fctx, 0, depth)
    const b = linkOrConst(d.secondInputNode, 0, fctx, 0, depth)
    return evalFloatMathOp(a, b, d.operationType ?? d.operation)
  }

  if (t === 'animAnimNode_FloatClamp') {
    const v = linkOrConst(d.inputNode, 0, fctx, 0, depth)
    const min = readNumber(d.min, 0)
    const max = readNumber(d.max, 1)
    return Math.min(max, Math.max(min, v))
  }

  if (t === 'animAnimNode_FloatInterpolation') {
    return evalFloatInterpolation(source, fctx, depth)
  }

  if (t === 'animAnimNode_Signal') {
    return evalSignalFloat(source, fctx)
  }

  if (t === 'animAnimNode_WrapperValue') {
    return evalWrapperValueFloat(source, board)
  }

  if (t === 'animAnimNode_FloatJoin') {
    const input = resolveHandle(handles, d.input)
    if (input) return readFloatSource(input, fctx, fallback, depth + 1)
    return fallback
  }

  if (t === 'animAnimNode_CurveFloatValue') {
    const argNode = resolveHandle(handles, d.argument)
    const arg = argNode ? readFloatSource(argNode, fctx, 0, depth + 1) : 0
    return evalCurveFloatData(d.curveData, arg)
  }

  if (
    t === 'animAnimNode_DampFloat' ||
    t === 'animAnimNode_SpringDamp' ||
    t === 'animAnimNode_CriticalSpringDamp' ||
    t === 'animAnimNode_FloatLatch'
  ) {
    return evalStatefulFloatNode(source, t, fctx, depth)
  }

  if (t === 'animAnimNode_FloatRandom') {
    return evalFloatRandomNode(source, fctx)
  }

  if (t === 'animAnimNode_FloatTimeDependentSinus') {
    return evalFloatSinusNode(source, fctx)
  }

  if (t === 'animAnimNode_EventValue') {
    return evalEventValueFloat(source, fctx)
  }

  if (t === 'animAnimNode_Event') {
    return evalEventFloat(source, fctx.board)
  }

  if (t === 'animAnimNode_TagValue') {
    return evalTagValueFloat(source, fctx.board)
  }

  if (t === 'animAnimNode_AnimSetTagValue') {
    return evalAnimSetTagValueFloat(source, fctx.board, fctx.clipLibrary)
  }

  if (t === 'animAnimNode_MultiBoolToFloatValue') {
    return evalMultiBoolToFloat(source, fctx.board)
  }

  if (t === 'animAnimNode_Timer') {
    return evalTimerFloat(source, fctx)
  }

  // Common value converters / joins — follow single input
  if (
    t === 'animAnimNode_IntToFloatConverter' ||
    t === 'animAnimNode_BoolToFloatConverter' ||
    t === 'animAnimNode_FloatToIntConverter' ||
    /Converter$/i.test(t)
  ) {
    const input = resolveHandle(handles, d.inputNode ?? d.input)
    if (input) return readFloatSource(input, fctx, fallback, depth + 1)
  }

  const varName = readCName(d.variableName)
  const fromVar = boardFloat(board, varName, NaN)
  if (Number.isFinite(fromVar)) return fromVar
  return readNumber(
    d.value ?? d.floatValue ?? d.defaultValue ?? d.defaultInitialValue,
    fallback
  )
}

/**
 * One Update per frame for damp/spring/latch (cached via floatUpdated).
 * Latch samples input on activate; damp/spring integrate with dt.
 */
function evalStatefulFloatNode(
  source: AnimgraphNode,
  t: string,
  fctx: FloatEvalCtx,
  depth: number
): number {
  const id = source.HandleId
  if (fctx.floatUpdated.has(id)) {
    return fctx.floatDyn.get(id)?.value ?? 0
  }

  const d = source.Data ?? {}
  const { handles, dt } = fctx
  let state = fctx.floatDyn.get(id)

  if (t === 'animAnimNode_FloatLatch') {
    if (!state) {
      const input = resolveHandle(handles, d.input)
      const v = input ? readFloatSource(input, fctx, 0, depth + 1) : 0
      state = { value: v, velocity: 0 }
      fctx.floatDyn.set(id, state)
    }
    fctx.floatUpdated.add(id)
    return state.value
  }

  if (t === 'animAnimNode_DampFloat') {
    const defs = readDampDefaults(d)
    const inputNode = resolveHandle(handles, d.inputNode)
    const inputValue = inputNode
      ? readFloatSource(inputNode, fctx, defs.defaultInitial, depth + 1)
      : defs.defaultInitial
    let increaseSpeed = defs.increaseSpeed
    const incNode = resolveHandle(handles, d.increaseSpeedNode)
    if (incNode) increaseSpeed = Math.max(0, readFloatSource(incNode, fctx, increaseSpeed, depth + 1))
    let decreaseSpeed = defs.decreaseSpeed
    const decNode = resolveHandle(handles, d.decreaseSpeedNode)
    if (decNode) decreaseSpeed = Math.max(0, readFloatSource(decNode, fctx, decreaseSpeed, depth + 1))

    if (!state) {
      const init = wrapAroundRange(
        defs.startFromDefault ? defs.defaultInitial : inputValue,
        defs.wrap,
        defs.rangeMin,
        defs.rangeMax
      )
      state = { value: init, velocity: 0 }
      fctx.floatDyn.set(id, state)
    }
    stepDampFloat(
      state,
      inputValue,
      increaseSpeed,
      decreaseSpeed,
      defs.wrap,
      defs.rangeMin,
      defs.rangeMax,
      dt
    )
    fctx.floatUpdated.add(id)
    return state.value
  }

  if (t === 'animAnimNode_SpringDamp') {
    const defs = readSpringDefaults(d)
    const inputNode = resolveHandle(handles, d.inputNode)
    const inputValue = inputNode
      ? readFloatSource(inputNode, fctx, defs.defaultInitial, depth + 1)
      : defs.defaultInitial

    if (!state) {
      const init = wrapAroundRange(
        defs.startFromDefault || !inputNode ? defs.defaultInitial : inputValue,
        defs.wrap,
        defs.rangeMin,
        defs.rangeMax
      )
      state = { value: init, velocity: 0 }
      fctx.floatDyn.set(id, state)
    }
    stepSpringDamp(
      state,
      inputValue,
      defs.massFactor,
      defs.springFactor,
      defs.dampFactor,
      defs.wrap,
      defs.rangeMin,
      defs.rangeMax,
      defs.timeStep,
      dt
    )
    fctx.floatUpdated.add(id)
    return state.value
  }

  // CriticalSpringDamp — activates at 0; then critically damps toward input
  {
    const inputNode = resolveHandle(handles, d.inputNode)
    let inputValue = inputNode ? readFloatSource(inputNode, fctx, 0, depth + 1) : 0
    if (readBool(d.useRange)) {
      const lo = readNumber(d.rangeMin, -180)
      const hi = readNumber(d.rangeMax, 180)
      inputValue = Math.min(hi, Math.max(lo, inputValue))
    }
    const smoothTime = readNumber(d.smoothTime, 1)

    if (!state) {
      state = { value: 0, velocity: 0 }
      fctx.floatDyn.set(id, state)
    }
    if (inputNode) {
      stepCriticalSpringDamp(state, inputValue, smoothTime, dt)
    }
    fctx.floatUpdated.add(id)
    return state.value
  }
}

/** MRound-style index for Switch (animNode_Switch.cpp SelectInputsAndCalculateAlpha). */
function switchIndexFromWeight(weight: number, numInputs: number): number {
  if (numInputs <= 0) return -1
  if (numInputs === 1) return 0
  const maxIndex = numInputs - 1
  if (weight >= 0 && weight <= maxIndex) return Math.round(weight)
  if (weight > maxIndex) return maxIndex
  return 0
}

function evalFloatRandomNode(source: AnimgraphNode, fctx: FloatEvalCtx): number {
  const id = source.HandleId
  if (fctx.floatUpdated.has(id)) {
    return fctx.randomDyn.get(id)?.value ?? 0
  }
  const d = source.Data ?? {}
  const min = readNumber(d.min, 0)
  const max = readNumber(d.max, 1)
  const rand = d.rand === undefined ? true : readBool(d.rand)
  const cooldown = readNumber(d.cooldown, 1)
  let state = fctx.randomDyn.get(id)
  if (!state) {
    state = createFloatRandomState(min, max)
    fctx.randomDyn.set(id, state)
  }
  stepFloatRandom(state, rand, cooldown, min, max, fctx.dt)
  fctx.floatUpdated.add(id)
  return state.value
}

function evalFloatSinusNode(source: AnimgraphNode, fctx: FloatEvalCtx): number {
  const id = source.HandleId
  if (fctx.floatUpdated.has(id)) {
    const existing = fctx.sinusDyn.get(id)
    if (!existing) return 0
    const d = source.Data ?? {}
    return evalFloatTimeDependentSinus(
      existing,
      readNumber(d.min, 0),
      readNumber(d.max, 1),
      readNumber(d.frequencyFactor, 1),
      readNumber(d.phaseFactor, 0)
    )
  }
  const d = source.Data ?? {}
  let state = fctx.sinusDyn.get(id)
  if (!state) {
    state = createFloatSinusState()
    fctx.sinusDyn.set(id, state)
  }
  const freq = readNumber(d.frequencyFactor, 1)
  stepFloatTimeDependentSinus(state, freq, fctx.dt)
  fctx.floatUpdated.add(id)
  return evalFloatTimeDependentSinus(
    state,
    readNumber(d.min, 0),
    readNumber(d.max, 1),
    freq,
    readNumber(d.phaseFactor, 0)
  )
}

function resolveBlendMultipleSelection(
  d: Record<string, unknown>,
  ctx: FloatEvalCtx
): {
  slots: { values: number[]; refs: unknown[] }
  select: ReturnType<typeof selectBlendMultipleInputs>
  inputWeight: number
} {
  const slots = buildBlendMultipleSlots(
    d.inputValues,
    d.sortedInputValues,
    Array.isArray(d.inputNodes) ? d.inputNodes : []
  )
  const weightNode = resolveHandle(ctx.handles, d.weightNode ?? d.input)
  const minWeight = readNumber(d.minWeight, 0)
  const maxWeight = readNumber(d.maxWeight, 1)
  const inputWeight = weightNode
    ? readFloatSource(weightNode, ctx, minWeight)
    : minWeight
  const select = selectBlendMultipleInputs(
    inputWeight,
    slots.values,
    minWeight,
    maxWeight,
    readBool(d.radialBlending)
  )
  return { slots, select, inputWeight }
}

function findRootHandle(
  handles: Map<string, AnimgraphNode>,
  originalAnimgraph: RenderData['originalAnimgraph'] | null | undefined
): AnimgraphNode | null {
  const fromChunk = resolveHandle(handles, originalAnimgraph?.rootNode)
  if (fromChunk) return fromChunk
  for (const h of handles.values()) {
    if (handleType(h) === 'animAnimNode_Root') return h
  }
  return null
}

function findStateOutput(
  state: AnimgraphNode,
  handles: Map<string, AnimgraphNode>
): AnimgraphNode | null {
  const list = Array.isArray(state.Data?.nodes) ? state.Data.nodes : []
  let fallback: AnimgraphNode | null = null
  for (const ref of list) {
    const h = resolveHandle(handles, ref)
    if (!h) continue
    if (handleType(h) === 'animAnimNode_Output') return h
    if (!fallback) fallback = h
  }
  return fallback
}

/**
 * Game-like Update walk: AnimGraph::Update → m_rootNode->Update, following pose links.
 * Sample/pose bones remain stubbed.
 */
function updateFromNode(node: AnimgraphNode | null, ctx: WalkCtx): void {
  if (!node) return
  if (ctx.visited.has(node.HandleId)) return
  ctx.visited.add(node.HandleId)
  markActive(ctx.nodes, node.HandleId)

  const t = handleType(node)
  const d = node.Data ?? {}
  const { handles, board, nodes } = ctx

  if (t === 'animAnimNode_Root') {
    const out = resolveHandle(handles, d.outputNode)
    if (out) {
      updateFromNode(out, ctx)
      return
    }
    const children = Array.isArray(d.nodes) ? d.nodes : []
    if (children.length > 0) {
      updateFromNode(resolveHandle(handles, children[0]), ctx)
    }
    return
  }

  if (t === 'animAnimNode_Output') {
    updateFromNode(resolveHandle(handles, d.inputNode ?? d.input ?? d.node), ctx)
    return
  }

  if (t === 'animAnimNode_GraphSlotInput') {
    // Engine: m_parentGraphLink->Update() — parent GraphSlot.inputLink pose path.
    markActive(nodes, node.HandleId)
    ctx.parentPoseUpdate?.()
    return
  }

  if (isGraphSlotType(t)) {
    const slotName = readCName(d.name)
    const inputLink = resolveHandle(handles, d.inputLink)
    const dontDeactivate = readBool(d.dontDeactivateInput)
    const nested =
      slotName && ctx.slotHost
        ? ctx.slotHost.stepNested(slotName, () => {
            if (inputLink) updateFromNode(inputLink, ctx)
          })
        : null

    if (nested) {
      markActive(nodes, node.HandleId, { alpha: 1 })
      // Engine: when dontDeactivateInput, also Update inputLink from the slot itself.
      if (dontDeactivate && inputLink) updateFromNode(inputLink, ctx)
      return
    }

    // No attached graph — passthrough inputLink (engine fallback).
    markActive(nodes, node.HandleId)
    if (inputLink) updateFromNode(inputLink, ctx)
    return
  }

  // Value sources / converters / math — badge shows current numeric value
  if (isFloatValueNodeType(t)) {
    walkFloatValueInputs(node, ctx)
    const v = readFloatSource(node, ctx, 0)
    markActive(nodes, node.HandleId, { weight: v, alpha: 1 })
    return
  }

  // Vector value sources — badge shows |xyz| length
  if (isVectorValueNodeType(t)) {
    walkFloatValueInputs(node, ctx)
    const v = readVectorSource(node, ctx, ZERO_VEC4)
    markActive(nodes, node.HandleId, { weight: vec4Mag3(v), alpha: 1 })
    return
  }

  if (t === 'animAnimNode_StateMachine') {
    let rt = ctx.runtimes.get(node.HandleId)
    if (!rt) {
      rt = new SimStateMachineRuntime(node.HandleId, readNumber(d.defaultStateIndex, 0))
      ctx.runtimes.set(node.HandleId, rt)
    }
    const states = Array.isArray(d.states) ? d.states : []

    // Engine OnUpdate: Update current state FIRST so AnimEnd/events feed CheckTransitions
    // same frame (animNode_StateMachine.cpp — "prevent one frame delay").
    if (!rt.isInTransition) {
      const pre = resolveHandle(handles, states[rt.activeStateIndex])
      if (pre) {
        tickClipClocksAlongPose(findStateOutput(pre, handles), ctx, new Set())
      }
    }

    updateStateMachine(node, rt, ctx.dt, board, handles, nodes, ctx.condCtx)

    const active = resolveHandle(handles, states[rt.activeStateIndex])
    if (active) {
      markActive(nodes, active.HandleId)
      const out = findStateOutput(active, handles)
      updateFromNode(out, ctx)
    }
    if (rt.isInTransition && rt.targetStateIndex != null) {
      const target = resolveHandle(handles, states[rt.targetStateIndex])
      if (target) {
        markActive(nodes, target.HandleId)
        const out = findStateOutput(target, handles)
        updateFromNode(out, ctx)
      }
    }
    // Explicit inactive: missing snapshot keys stay alpha 1 in overlay — SM
    // overview state nodes would never dim without this.
    states.forEach((ref, i) => {
      if (i === rt.activeStateIndex) return
      if (rt.isInTransition && i === rt.targetStateIndex) return
      const h = resolveHandle(handles, ref)
      if (!h) return
      markInactiveBranch(h, handles, nodes, new Set(), ctx.visited)
    })
    if (rt.firingTransitionHandleId) {
      markActive(nodes, rt.firingTransitionHandleId, {
        weight: rt.transitionProgress,
        alpha: rt.transitionProgress,
      })
    }
    for (const id of rt.eligibleTransitionIds) {
      markActive(nodes, id)
    }
    return
  }

  if (isAnimDatabaseType(t)) {
    // Update int input links first so values are current for lookup
    const links = Array.isArray(d.inputLinks) ? d.inputLinks : []
    for (const link of links) {
      const h = resolveHandle(handles, link)
      if (h) updateFromNode(h, ctx)
    }
    runAnimDatabaseClipClock(node, ctx)
    let weight = 0
    const clock = ctx.clipClocks.get(node.HandleId)
    if (clock && ctx.clipLibrary && ctx.clipLibrary.entryCount > 0) {
      const clip = ctx.clipLibrary.resolveClip(clock.animName, (n) =>
        board.isWrapperActive(n)
      )
      if (clip) {
        const front = readNumber(d.clipFront, 0)
        const endPad = readNumber(d.clipEnd, 0)
        const animEnd = Math.max(clip.duration - endPad, 0)
        const clipped = Math.max(animEnd - front, 0)
        weight = clipped > 1e-8 ? (clock.currTime - front) / clipped : 0
        weight = Math.max(0, Math.min(1, weight))
      }
    }
    markActive(nodes, node.HandleId, { weight, alpha: 1 })
    return
  }

  if (isClipClockSkAnimType(t)) {
    let weight = 0
    const fields = readSkAnimClockFields(d as Record<string, unknown>)
    const clock = ensureClipClock(ctx.clipClocks, node.HandleId)
    if (ctx.clipLibrary && ctx.clipLibrary.entryCount > 0) {
      if (!clock.stepped) {
        advanceClipClock(
          clock,
          fields,
          ctx.dt,
          ctx.clipLibrary,
          board,
          (n) => board.isWrapperActive(n)
        )
      }
      const clip = ctx.clipLibrary.resolveClip(clock.animName, (n) =>
        board.isWrapperActive(n)
      )
      if (clip) {
        const front = readNumber(d.clipFront, 0)
        const endPad = readNumber(d.clipEnd, 0)
        const animEnd = Math.max(clip.duration - endPad, 0)
        const clipped = Math.max(animEnd - front, 0)
        weight = clipped > 1e-8 ? (clock.currTime - front) / clipped : 0
        weight = Math.max(0, Math.min(1, weight))
      }
    } else if (!clock.stepped) {
      clock.stepped = true
      clock.animName = fields.animation || 'None'
      clock.wasActive = true
    }
    markActive(nodes, node.HandleId, { weight, alpha: 1 })
    return
  }

  if (t === 'animAnimNode_State' || t === 'animAnimNode_StateFrozen') {
    const out = findStateOutput(node, handles)
    updateFromNode(out, ctx)
    return
  }

  if (t === 'animAnimNode_Blend2') {
    const weightNode = resolveHandle(handles, d.weightNode)
    let weight = 0.5
    if (weightNode) {
      updateFromNode(weightNode, ctx)
      const raw = readFloatSource(weightNode, ctx, NaN)
      if (Number.isFinite(raw)) {
        weight = blend2WeightFromInput(
          raw,
          readNumber(d.minInputValue, 0),
          readNumber(d.maxInputValue, 1)
        )
      }
    }
    markActive(nodes, node.HandleId, { weight, alpha: weight })
    const first = resolveHandle(handles, d.firstInputNode)
    const second = resolveHandle(handles, d.secondInputNode)
    if (first) {
      if (weight < 1) updateFromNode(first, ctx)
      else markInactiveBranch(first, handles, nodes, new Set(), ctx.visited)
    }
    if (second) {
      if (weight > 0) updateFromNode(second, ctx)
      else markInactiveBranch(second, handles, nodes, new Set(), ctx.visited)
    }
    return
  }

  if (t === 'animAnimNode_BlendMultiple') {
    const weightNode = resolveHandle(handles, d.weightNode ?? d.input)
    if (weightNode) updateFromNode(weightNode, ctx)
    const { slots, select, inputWeight } = resolveBlendMultipleSelection(
      d as Record<string, unknown>,
      ctx
    )
    markActive(nodes, node.HandleId, { weight: inputWeight, alpha: select.alpha })
    slots.refs.forEach((ref, i) => {
      const h = resolveHandle(handles, ref)
      if (!h) return
      const activeFirst =
        i === select.firstIndex && blendMultipleFirstInputActive(select.alpha)
      const activeSecond =
        i === select.secondIndex && blendMultipleSecondInputActive(select.alpha)
      if (activeFirst || activeSecond) updateFromNode(h, ctx)
      else markInactiveBranch(h, handles, nodes, new Set(), ctx.visited)
    })
    return
  }

  if (t === 'animAnimNode_Switch') {
    const weightNode = resolveHandle(handles, d.weightNode)
    let weight = 0
    if (weightNode) {
      updateFromNode(weightNode, ctx)
      weight = readFloatSource(weightNode, ctx, 0)
    }
    const inputs = Array.isArray(d.inputNodes) ? d.inputNodes : []
    const numInputs = readNumber(d.numInputs, inputs.length)
    const index = switchIndexFromWeight(weight, Math.max(numInputs, inputs.length))
    // Badge = selected input index (0-based), matching engine SelectInputs
    markActive(nodes, node.HandleId, { weight: index, alpha: 1 })
    inputs.forEach((ref, i) => {
      const h = resolveHandle(handles, ref)
      if (!h) return
      if (i === index) updateFromNode(h, ctx)
      else markInactiveBranch(h, handles, nodes, new Set(), ctx.visited)
    })
    return
  }

  if (t === 'animAnimNode_StaticSwitch' || t === 'animAnimNode_RuntimeSwitch') {
    const cond = resolveHandle(handles, d.condition)
    if (cond) markActive(nodes, cond.HandleId)
    let useTrue: boolean
    if (t === 'animAnimNode_StaticSwitch') {
      useTrue =
        ctx.staticSwitchResults?.get(node.HandleId) ??
        checkStaticCondition(cond, board, {
          clipLibrary: ctx.clipLibrary,
          isWrapperActive: (n) => board.isWrapperActive(n),
        })
    } else {
      useTrue = checkRuntimeCondition(cond, board, {
        clipLibrary: ctx.clipLibrary,
        isWrapperActive: (n) => board.isWrapperActive(n),
      })
    }
    markActive(nodes, node.HandleId, { weight: useTrue ? 1 : 0, alpha: 1 })
    const trueIn = resolveHandle(handles, d.True ?? d.true)
    const falseIn = resolveHandle(handles, d.False ?? d.false)
    if (useTrue) {
      if (trueIn) updateFromNode(trueIn, ctx)
      if (falseIn) markInactiveBranch(falseIn, handles, nodes, new Set(), ctx.visited)
    } else {
      if (falseIn) updateFromNode(falseIn, ctx)
      if (trueIn) markInactiveBranch(trueIn, handles, nodes, new Set(), ctx.visited)
    }
    return
  }

  if (t === 'animAnimNode_BlendAdditive') {
    const weightNode = resolveHandle(handles, d.weightNode)
    let weight = 1
    if (weightNode) {
      updateFromNode(weightNode, ctx)
      weight = readFloatSource(weightNode, ctx, 1)
    }
    // bias/scale default 0/1 — same as engine CaclWeightFinalValue when unset
    const bias = readNumber(d.biasValue, 0)
    const scale = readNumber(d.scaleValue, 1)
    const alpha = (weight - bias) * scale
    markActive(nodes, node.HandleId, { weight: alpha, alpha: 1 })
    const base = resolveHandle(handles, d.inputNode)
    const additive = resolveHandle(handles, d.addedInputNode ?? d.additiveInputNode)
    // Base pose always updates (engine always LinkSafeUpdate inputNode)
    if (base) updateFromNode(base, ctx)
    if (additive) {
      if (isBlendAdditiveInputActive(alpha)) updateFromNode(additive, ctx)
      else markInactiveBranch(additive, handles, nodes, new Set(), ctx.visited)
    }
    return
  }

  if (t === 'animAnimNode_BlendByMaskDynamic') {
    // animNode_BlendOverride.cpp OnUpdate: always Update base + weight;
    // GetValue mask (default -1) / weight (default 0, clamped 0..1);
    // Update blend only if weight > 0.01 and mask index in masks[].
    const weightNode = resolveHandle(handles, d.weight)
    const maskNode = resolveHandle(handles, d.mask)
    if (weightNode) updateFromNode(weightNode, ctx)
    if (maskNode) updateFromNode(maskNode, ctx)

    const rawWeight = weightNode ? readFloatSource(weightNode, ctx, 0) : 0
    const weight = Math.min(1, Math.max(0, rawWeight))
    const rawMask = maskNode ? readFloatSource(maskNode, ctx, -1) : -1
    const maskIndex = Number.isFinite(rawMask) ? Math.trunc(rawMask) : -1
    const masksCount = Array.isArray(d.masks) ? d.masks.length : 0
    const blendActive = blendByMaskDynamicBlendActive(weight, maskIndex, masksCount)

    markActive(nodes, node.HandleId, { weight, alpha: 1 })
    const base = resolveHandle(handles, d.base)
    const blend = resolveHandle(handles, d.blend)
    if (base) updateFromNode(base, ctx)
    if (blend) {
      if (blendActive) updateFromNode(blend, ctx)
      else markInactiveBranch(blend, handles, nodes, new Set(), ctx.visited)
    }
    return
  }

  // Generic pose/value links — follow diagram pins
  forEachLinkedInput(node, handles, (linked) => updateFromNode(linked, ctx))
}

export class SimGraphRunner {
  private runtimes = new Map<string, SimStateMachineRuntime>()
  private handles: Map<string, AnimgraphNode> = new Map()
  private originalAnimgraph: RenderData['originalAnimgraph'] | null = null
  /** Previous step node overlay — used to emit nodeDelta. */
  private prevNodes: Record<string, SimNodeState> | null = null
  /** Per-handle damp / spring / latch state (cleared on bind/reset / deactivate). */
  private floatDyn = new Map<string, FloatDynState>()
  private randomDyn = new Map<string, FloatRandomState>()
  private sinusDyn = new Map<string, FloatSinusState>()
  /** Per-handle Signal latch / blend (cleared like floatDyn). */
  private signalDyn = new Map<string, SignalDynState>()
  /** Anim setup / clip index for HasAnimation + SkAnim clock. */
  private clipLibrary: ClipLibrary | null = null
  /** Loaded motion databases for AnimDatabase nodes. */
  private animDbLibrary: AnimDatabaseLibrary | null = null
  /** Per-SkAnim playback clocks */
  private clipClocks = new Map<string, ClipClockState>()
  /**
   * Per-graph Timed / ModifiedFloat dyn (engine instance buffer).
   * Not on SimInputBoard — HandleIds collide across nested graphs.
   */
  private conditionDyn = new SimConditionDyn()
  /** StaticSwitch Init cache — recomputed when dirty (bind/reset/clipLibrary). */
  private staticSwitchResults = new Map<string, boolean>()
  private staticSwitchDirty = true

  setClipLibrary(library: ClipLibrary | null): void {
    this.clipLibrary = library
    this.staticSwitchDirty = true
  }

  /** Force StaticSwitch Init re-eval (entity tags / HasAnimation context changed). */
  invalidateStaticSwitches(): void {
    this.staticSwitchDirty = true
  }

  setAnimDatabaseLibrary(library: AnimDatabaseLibrary | null): void {
    this.animDbLibrary = library
  }

  bind(graphData: RenderData | null): void {
    this.handles = graphData?.handlesRegistry ?? new Map()
    this.originalAnimgraph = graphData?.originalAnimgraph ?? null
    this.runtimes.clear()
    this.floatDyn.clear()
    this.randomDyn.clear()
    this.sinusDyn.clear()
    this.signalDyn.clear()
    this.clipClocks.clear()
    this.conditionDyn.clear()
    this.staticSwitchResults.clear()
    this.staticSwitchDirty = true
    this.prevNodes = null
    for (const sm of findStateMachineHandles(this.handles)) {
      const def = readNumber(sm.Data?.defaultStateIndex, 0)
      this.runtimes.set(sm.HandleId, new SimStateMachineRuntime(sm.HandleId, def))
    }
  }

  reset(): void {
    this.prevNodes = null
    this.floatDyn.clear()
    this.randomDyn.clear()
    this.sinusDyn.clear()
    this.signalDyn.clear()
    this.clipClocks.clear()
    this.conditionDyn.clear()
    this.staticSwitchResults.clear()
    this.staticSwitchDirty = true
    for (const sm of findStateMachineHandles(this.handles)) {
      const rt = this.runtimes.get(sm.HandleId)
      const def = readNumber(sm.Data?.defaultStateIndex, 0)
      if (rt) rt.reset(def)
      else this.runtimes.set(sm.HandleId, new SimStateMachineRuntime(sm.HandleId, def))
    }
  }

  private recomputeStaticSwitches(board: SimInputBoard): void {
    this.staticSwitchResults.clear()
    for (const h of this.handles.values()) {
      if (handleType(h) !== 'animAnimNode_StaticSwitch') continue
      const cond = resolveHandle(this.handles, h.Data?.condition)
      this.staticSwitchResults.set(
        h.HandleId,
        checkStaticCondition(cond, board, {
          clipLibrary: this.clipLibrary,
          isWrapperActive: (n) => board.isWrapperActive(n),
        })
      )
    }
    this.staticSwitchDirty = false
  }

  private buildCondCtx(board: SimInputBoard): CheckConditionCtx {
    const ctx: CheckConditionCtx = { conditionDyn: this.conditionDyn }
    const lib = this.clipLibrary
    if (lib && lib.entryCount > 0) {
      ctx.hasAnimation = (animationName: string) =>
        lib.hasAnimation(animationName, (n) => board.isWrapperActive(n))
    }
    return ctx
  }

  step(
    dt: number,
    board: SimInputBoard,
    time: number,
    playing: boolean,
    speed: number,
    options?: SimStepOptions
  ): SimSnapshot {
    const endBoardFrame = options?.endBoardFrame !== false
    const nodes: Record<string, SimNodeState> = {}
    this.conditionDyn.beginStep()
    beginClipClockStep(this.clipClocks)
    if (this.staticSwitchDirty) this.recomputeStaticSwitches(board)
    const floatUpdated = new Set<string>()
    const signalUpdated = new Set<string>()
    const condCtx = { ...this.buildCondCtx(board), dt }

    const walkBase: Omit<WalkCtx, 'nodes' | 'visited'> = {
      handles: this.handles,
      board,
      dt,
      floatDyn: this.floatDyn,
      floatUpdated,
      randomDyn: this.randomDyn,
      sinusDyn: this.sinusDyn,
      signalDyn: this.signalDyn,
      signalUpdated,
      runtimes: this.runtimes,
      condCtx,
      clipLibrary: this.clipLibrary,
      clipClocks: this.clipClocks,
      animDbLibrary: this.animDbLibrary,
      staticSwitchResults: this.staticSwitchResults,
      time,
      playing,
      speed,
      slotHost: options?.slotHost,
      parentPoseUpdate: options?.parentPoseUpdate,
    }

    const root = findRootHandle(this.handles, this.originalAnimgraph)
    if (root) {
      updateFromNode(root, {
        ...walkBase,
        nodes,
        visited: new Set(),
      })
    } else {
      // Fallback: no root — update all SMs (legacy)
      for (const sm of findStateMachineHandles(this.handles)) {
        updateFromNode(sm, {
          ...walkBase,
          nodes,
          visited: new Set(),
        })
      }
    }

    // Drop dyn state for nodes not updated this frame (deactivated → re-init on reactivate)
    for (const id of [...this.floatDyn.keys()]) {
      if (!floatUpdated.has(id)) this.floatDyn.delete(id)
    }
    for (const id of [...this.randomDyn.keys()]) {
      if (!floatUpdated.has(id)) this.randomDyn.delete(id)
    }
    for (const id of [...this.sinusDyn.keys()]) {
      if (!floatUpdated.has(id)) this.sinusDyn.delete(id)
    }
    for (const id of [...this.signalDyn.keys()]) {
      if (!signalUpdated.has(id)) this.signalDyn.delete(id)
    }
    // Deactivate clip clocks that were not stepped (left the active pose path)
    for (const [, clock] of this.clipClocks) {
      if (!clock.stepped && clock.wasActive) deactivateClipClock(clock)
    }

    if (endBoardFrame) board.endFrame()

    const sms: SimSnapshot['sms'] = {}
    const clips: SimActiveClip[] = []
    const isWrap = (n: string) => board.isWrapperActive(n)
    for (const [id, c] of this.clipClocks) {
      if (!c.stepped) continue
      let progress = 0
      const nodeW = nodes[id]?.weight
      if (typeof nodeW === 'number' && Number.isFinite(nodeW)) progress = nodeW
      const animName = c.animName || 'None'
      const resolve =
        c.resolveHint ?? classifyClipResolve(animName, this.clipLibrary, isWrap)
      clips.push({
        handleId: id,
        animName,
        time: resolve === 'ok' ? c.currTime : 0,
        progress: resolve === 'ok' ? progress : 0,
        resolve,
      })
    }

    for (const [id, rt] of this.runtimes) {
      sms[id] = rt.toState()
    }

    const nodeDelta = this.prevNodes ? diffSimNodeStates(this.prevNodes, nodes) : null
    this.prevNodes = nodes

    return {
      time,
      playing,
      speed,
      sms,
      nodes,
      nodeDelta,
      status: {
        rootHandleId: root?.HandleId ?? null,
        clips,
      },
    }
  }

  getSnapshotEmpty(time: number, playing: boolean, speed: number): SimSnapshot {
    const snap = emptySimSnapshot()
    snap.time = time
    snap.playing = playing
    snap.speed = speed
    for (const [id, rt] of this.runtimes) {
      snap.sms[id] = rt.toState()
    }
    return snap
  }
}
