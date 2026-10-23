import { AnimgraphNode } from "../graph/animgraphTypes"
import { InstanceStore } from "../InstanceStore"
import { TypedStore } from "../TypedStore"
import { AnimDatabaseLibrary } from "./animDatabase"
import { BoneOpFrameCache, BoneOpQuatState, BoneOpRotateState, BoneOpTranslateState, MathExprPoseFrameCache } from "./boneOpDyn"
import { ClipClockState } from "./clipClock"
import { ClipLibrary } from "./clipLibrary"
import { ClipPoseLibrary } from "./clipPoseLibrary"
import { SimConditionDyn } from "./conditionDyn"
import { InertializationRequestSink } from "./engineParity"
import { MathExprCompileCache } from "./evalAnimMathExpression"
import { SimVec4 } from "./evalAnimMathExpressionVector"
import { ExtraFloatTrackCollector } from "./extraTrackCollector"
import { FloatDynState, FloatRandomState, FloatSinusState } from "./floatDyn"
import { FppCameraDyn } from "./fppCameraDyn"
import { LookAtSpaceCtx } from "./lookAtControllerSim"
import { LookAtSphereXf } from "./lookAtMath"
import { SimStateMachineRuntime } from "./nodes/SimStateMachine/runtime"
import { Pose } from "./pose"
import { Qs } from "./poseFk"
import { PoseScratchPool } from "./poseScratchPool"
import { RigEntry } from "./rigResource"
import { BlendFromPoseDynState, IkTargetSnap, SmFrozenPoseSlot } from "./sample.types"
import { SharedMetaPoseCtx } from "./sharedMetaPose"
import { SignalDynState } from "./signalDyn"
import { SimInputBoard } from "./SimInputBoard"
import { SimSampleLog } from "./simSampleLog"
import { SimNodeState, SimSampleWarning, SimSnapshot, SimUpdateWarning } from "./simTypes"

export type SimGraphUpdateSlotHost = {
  updateNested(slotName: string, updateInput?: () => void): {
    diagramId: string
    snap: SimSnapshot
    inertialization: InertializationRequestSink
    keepFullUpdate: boolean
  } | undefined
  updateInput?: () => void
}

export type SimGraphSampleSlotHost = {
  sampleNested(slotName: string, sampleInput?: (out: Pose) => boolean): Pose | undefined
  sampleInput?: (out: Pose) => boolean
}

/** Shared float-eval context (board + stateful damp/spring/latch/signal). */
export type FloatEvalCtx = {
  board: SimInputBoard
  handles: Map<string, AnimgraphNode>
  dt: number
  /** Undilated dt (rawTimeDelta); defaults to dt when omitted. */
  rawDt: number
  floatDyn: Map<string, FloatDynState>
  floatUpdated: Set<string>
  /** VectorLatch / DampVector latched or damped Vector4. */
  vectorDyn: Map<string, SimVec4>
  /** TransformLatch latched Qs. */
  transformDyn: Map<string, Qs>
  randomDyn: Map<string, FloatRandomState>
  sinusDyn: Map<string, FloatSinusState>
  signalDyn: Map<string, SignalDynState>
  signalUpdated: Set<string>
  clipLibrary: ClipLibrary | null
  /** GLB pose curves — MixerSlot / SkAnim Sample; optional on Update for duration. */
  clipPoseLibrary: ClipPoseLibrary | null
  /** Per-runner math expression compile cache (idents + scalar/mixed). */
  mathExprCache: MathExprCompileCache
  /** Instance shared vars (fppCamera.sharedVar, …). */
  sharedVars: TypedStore
  /** Engine AnimNodeUpdateContext eyes look-at temps (LookAtController → Pose360). */
  eyesLookAtDirection: number
  eyesLookAtDirectionEnabled: boolean
  /** Engine context.m_isFacial — Eyes enableFloatTrack coupling. */
  isFacial: boolean
  /** Engine context.m_eyesLookAtEnabled (body Eyes writes; facial Eyes reads). */
  eyesLookAtEnabled: number
  /** Entity / parent world xforms for LookAt WS↔MS / parent-space. */
  entityLocalToWorld: LookAtSphereXf
  parentObjectLocalToWorld: LookAtSphereXf
}

export type WalkCtx = FloatEvalCtx & {
  poseGen: number
  nodes: Record<string, SimNodeState>
  /** Previous frame overlay — resetOnActivation for bone ops. */
  prevNodes?: Record<string, SimNodeState>
  visited: Set<string>
  runtimes: Map<string, SimStateMachineRuntime>
  clipClocks: Map<string, ClipClockState>
  animDbLibrary: AnimDatabaseLibrary | null
  /** Cached StaticSwitch Init results (handleId → useTrue). */
  staticSwitchResults: Map<string, boolean>
  /** BlendFromPose instance buffers (timer / request / cached additive). */
  blendFromPoseDyn: Map<string, BlendFromPoseDynState>
  /** BlendFromPose handleId → owning SM handleId (TEMP_Bind). */
  blendFromPoseSmBind: Map<string, string>
  /**
   * Engine UpdateContext inertialization request (SM / Switch / nested merge).
   * Cleared each frame; Inertialization node Sample (TBD) consumes it.
   */
  inertialization: InertializationRequestSink
  /** Frame meta for nested GraphSlot runners. */
  time: number
  playing: boolean
  speed: number
  /**
   * Project GraphSlot attach: resolve slot name → child diagram runner.
   * Nested updates share the board; child owns its own dyn/SM state.
   */
  slotHost: SimGraphUpdateSlotHost
  /** AdditionalFloatTrack local time (engine i_time), shared with Sample. */
  additionalFloatTrackTimes: Map<string, number>
  /**
   * Update-traversal successors this frame: parentHandleId → childHandleIds
   * in visit order (role order for blends: base/first then blend/second).
   * Value/weight links are not recorded — only followUpdate targets.
   */
  updateSucc: Map<string, string[]>
  boneOpCache: BoneOpFrameCache
  boneRotateDyn: Map<string, BoneOpRotateState>
  boneQuatDyn: Map<string, BoneOpQuatState>
  boneTranslateDyn: Map<string, BoneOpTranslateState>
  readonly mathExprPoseCache: MathExprPoseFrameCache
  /** FPPCamera per-node dyn. */
  readonly fppCameraDyn: Map<string, FppCameraDyn>
  /** Engine AnimInstanceBuffer — per-graph instance dyn for Timed / ModifiedFloat. */
  readonly conditionDyn: SimConditionDyn
  /** Per-node instance store (LookAtController, …). */
  readonly instanceStore: InstanceStore
  /** Typed per-node per-activation instance bags (LookAtPose360, …). */
  readonly transientStore: InstanceStore
  /** Engine ExtraDataCollector — MarkExtraFloatTrack during Update. */
  extraTracks: ExtraFloatTrackCollector
  /** When true, Update appends diagnostics into updateWarnings. */
  updateWarningsEnabled: boolean
  updateWarnings: SimUpdateWarning[]
  /**
   * Engine AnimNodeUpdateContext.m_keepFullUpdate — OR true only (workspot sleep gate).
   * Set by GenerateIk / HumanIk when controller HasAnyActiveIK.
   */
  keepFullUpdate: boolean
  /** Check if a graph has a wrapper active. */
  isWrapperActive: (name: string) => boolean
  /** Check if a graph has an animation. */
  hasAnimation: (animationName: string) => boolean
  /** Update a graph node and its successors during Update. Without edges recorded for Sample. */
  updateFromNode(
    ctx: WalkCtx,
    node: AnimgraphNode,
  ): void
  /** Follow a graph successor during Update and record the edge for Sample. */
  followUpdate(
    ctx: WalkCtx,
    parent: AnimgraphNode,
    child: AnimgraphNode | null | undefined,
  ): void
}

export type SampleCtx = {
  handles: Map<string, AnimgraphNode>
  board: SimInputBoard
  readonly dt: number
  readonly rawDt: number
  readonly playing: boolean
  readonly time: number
  readonly speed: number
  /** Per-node instance bags (LookAtController, …). */
  readonly instanceStore: InstanceStore
  /** Per-node per-activation transient instance bags (LookAtPose360, …). */
  readonly transientStore: InstanceStore
  readonly nodes: Record<string, SimNodeState>
  readonly clipClocks: Map<string, ClipClockState>
  readonly clipPoseLibrary: ClipPoseLibrary
  readonly clipLibrary: ClipLibrary | null
  readonly rig: RigEntry
  readonly staticSwitchResults: Map<string, boolean>
  /** SM runtimes from Update this frame */
  readonly runtimes: Map<string, SimStateMachineRuntime>
  readonly slotHost: SimGraphSampleSlotHost
  /** Transform Shrinker handleId → remove count (bind-time tag pairing) */
  shrinkRemoveCountByHandleId?: Map<string, number>
  /** Track Shrinker handleId → remove count */
  trackShrinkRemoveCountByHandleId?: Map<string, number>
  /**
   * HandleIds whose full pose should be snapshotted after Sample of that node (HUD).
   * Survives later Shrinker / blends on the path to root.
   */
  stackCaptureHandleIds?: Set<string>
  /** Copy live pose for a capture handle (runner-owned buffers). */
  captureStack?: (handleId: string, pose: Pose) => void
  /**
   * LIFO pose scratch pool for blend temps (acquirePose / releasePose).
   * Shared across nested samplePoseFromNode — depth is saved/restored.
   */
  poseScratch: PoseScratchPool
  /** Anim names that resolved clip but had no glb (mutated during walk) */
  missingGlb?: string[]
  /** Optional Sample-path debug (see simSampleLog.ts). */
  sampleLog?: SimSampleLog | null
  /** All handles entered this Sample ctx (incl. side-sample / fresh visited sets). */
  sampleVisitedAll?: Set<string>
  /**
   * Update-traversal successors (parent → child ids in visit/role order).
   * When present, Sample follows this instead of rediscovering Data pins.
   */
  updateSucc?: Map<string, string[]>
  /**
   * When true, Sample appends diagnostics into `warnings` (null-pose blends, …).
   * Off → zero cost beyond lastWrittenNull bookkeeping used only if enabled.
   */
  warningsEnabled?: boolean
  /** Append-only Sample warnings for this frame (shared with nested samples). */
  warnings?: SimSampleWarning[]
  /**
   * Set by every Sample write into the current `out` buffer: true = null/zero local pose.
   * Not on Pose (shared buffers). Default false; read after each child sample when warningsEnabled.
   */
  lastWrittenNull: boolean
  /** Update→Sample values for procedural bone ops (Rotate/Translate/SetPosition/…). */
  boneOpCache?: BoneOpFrameCache
  /** FPPCamera dyn from Update (shared with Sample). */
  fppCameraDyn?: Map<string, FppCameraDyn>
  /**
   * AdditionalFloatTrack local time (engine i_time), advanced on Update.
   * Cleared when the node leaves the active Update path.
   */
  additionalFloatTrackTimes?: Map<string, number>
  /** Per-runner math expression compile cache (shared with Update). */
  mathExprCache?: MathExprCompileCache
  /** MathExpressionPose float-socket link snapshots from Update. */
  mathExprPoseCache?: MathExprPoseFrameCache
  /**
   * Parent-transform stack (name → MS Qs). ParentTransform Sample reads this;
   * falls back to pose unified MS when missing.
   */
  parentTransforms?: Map<string, Qs>
  /**
   * Engine AnimNodeSampleContext.m_sharedMetaPose — SharedMetaPose / Additive / TrajectoryFromMetaPose.
   * Filled by caller (inject). Empty → node is passthrough after inputLink.
   *
   * TODO(hard): no AnimatedObject / MetaPose / part↔meta mapping — engine fills this from
   * entity MetaPose + parentTransformsMapping before child-part Sample. Need multi-part hierarchy.
   */
  sharedMetaPose?: SharedMetaPoseCtx
  /**
   * Engine AnimNode_Join: sample once per frame, replay cached pose on diamond re-entry.
   * `sampled` cleared each Sample; `poses` may be reused across frames.
   */
  joinPoseCache?: { sampled: Set<string>; poses: Map<string, Pose> }
  /**
   * Engine SampleOutput.m_ikTargets — shared for one Sample pass (Add/ReadIkRequest).
   * Cleared at sampleGraphPose begin. Blend2/BlendMultiple merge via interpolateIkTargetsMaps.
   */
  ikTargets?: Map<string, IkTargetSnap>
  /** BlendFromPose dyn state from Update. */
  blendFromPoseDyn?: Map<string, BlendFromPoseDynState>
  /** BlendFromPose → owning SM handleId. */
  blendFromPoseSmBind?: Map<string, string>
  /** Per-SM frozen pose (filled after SM Sample when ShouldUseFrozenPose). */
  smFrozenPoses?: Map<string, SmFrozenPoseSlot>
  /**
   * UpdateContext inertialization request (latched for Sample).
   * Inertialization node Sample TBD — plumbing only.
   */
  inertialization?: {
    isInertializationRequested: boolean
    inertializationDuration: number
  }
  /** LookAt WS↔MS / facial Eyes coupling (engine AnimNodeSampleContext). */
  lookAtSpace?: LookAtSpaceCtx
}