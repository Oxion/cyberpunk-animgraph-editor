/**
 * Parity notes vs RED AnimGraph runtime in common/animation.
 *
 * Primary sources:
 * - animGraph — Update then Sample frame phases
 * - animNode_StateMachine — CheckTransitions / FireTransition / progress
 * - animStateTransition — CheckConditionContext, IAnimStateTransitionCondition
 * - animNode_Blend2 — CalculateWeightFromInputValue
 * - animNode_BlendOverride — BlendOverride / BlendByMaskDynamic OnUpdate / ACTIVATION_THRESHOLD
 * - PoseBlendMethod_Mask / BoneBranch — Sample blend
 *
 * Offline sim implements Update (+ numeric weights) and Sample (glb pose).
 * Ik2 / Ik2Constraint / AddIkRequest / ReadIkRequest are supported.
 * IKTargetsController class (shared GenerateIkAnimFeatureData + HumanIk): SM priority/
 *   transitions, WS→MS+offsets, enableFloatTrack, graph ikTargets ingest, board GraphInput
 *   publish, IKTargetParams_Add/Remove/Update; Update keepFullUpdate when HasAnyActiveIK;
 *   Blend2/BlendMultiple InterpolateIKTargets cross-merge. Skips ragdoll gate (no physics).
 *   HumanIk solves 4-limb Ik2 from board after publish.
 * AddSnapToTerrainIkRequest: flat-ground subset only (plant Z + hip Z + ikTargets + Ik2
 * stand-in); emits snap-to-terrain-partial Update/Sample warnings — not full PhysicsTracer /
 * foot-lock parity.
 * FloorIk: PARTIAL flat-ground plant + pelvis Z + Ik2 (emits floor-ik-partial); no PhysicsTracer /
 * foot-lock / slope / STwoBonesIKSolver state.
 * ValueBySpeed: OnUpdate integrates speed×dt with ClampType (None/Clamp/WrappedClamp).
 * BlendFromPose: SM frozen pose + additive fade (animNode_BlendFromPose).
 * Stage / StagePoseEntry / StageFloatEntry: container + parentInput passthrough.
 * TrackSetter: OnePoseInput + FloatLink → override named float track (legacy FloatTrackModifier Override).
 * DirectConnConstraint: source bone LS → target bone LS with axis masks + weight.
 * SharedMetaPose / SharedMetaPoseAdditive / TrajectoryFromMetaPose: Sample overwrites /
 *   slerps / additive-applies inject bag runner.sharedMetaPose (name→LS Qs / tracks).
 *   TODO(hard): AnimatedObject MetaPose + part↔meta mapping fill (no multi-part hierarchy).
 *   Additive: Local only; AGAT_Ref / FacialSharedMetaPose still TODO.
 * FPPCamera / FPPCameraSharedVar: camera.* board features → pitch/yaw + bone Sample; shared TypedStore pitch.
 * LookAtController: service-event Add/Remove/UpdatePositions; WS→MS via entityLocalToWorld;
 *   MS↔sphere; master LookAtQuaternion follow (+ override/curve); soft cone; hard-limit priority;
 *   back-behind hold; parent-space via parentObjectLocalToWorld; SM transitions (EaseInEaseOut);
 *   enableFloatTrack / Eyes override → blendWeight + target blend; coneLimitReached status bits;
 *   facial Eyes Min(eyesLookAtEnabled, 1−override) / body Max write; main-SM default gates secondaries;
 *   additionalParts (recursive dependents) blend → follower weight/suppress/mode (outer square × weight);
 *   Sample substeps × (timeDelta/rawTimeDelta); board graph-input publish; eyesLookAtDirection on dyn.
 * LookAtApplyVehicleRestrictions: LookAtVehicleRestrictionParams event + Sample clamp of board
 *   (group,name) vs referenceBone (engine OnSample).
 * LookAtPose360 / LookAtPose360Direction: eyesLookAtDirectionTemp → damp angle → clip sample +
 *   Trajectory Z; Direction float from same context.
 * LookAt followers: Sample V/H default pulls + inner-square chase (speedToTarget + bone offset);
 *   outer-square step still disabled (engine TODO).
 * ServiceEvent: bind compileSimGraph (flat handles) + addEventListener; DispatchEvent before Update.
 * LookAt (bone aim): OnePoseInput + target/weight → rotate bone forwardAxis toward target MS
 *   (+ optional cone limit). Motion extraction / sync TimeWarper remain out of scope.
 * Inertialization: SM / Switch / Static|RuntimeSwitch set context request + max(duration) and
 *   zero own blend when canRequestInertialization; nested GraphSlot merges upward.
 *   SkAnim applyInertializationOnAnimSetSwap: setup-entry swap while playing → 0.5s request.
 *   Node: ExtractTrajectory → 2-frame cache + quintic error decay → ApplyTrajectory;
 *   SnapToTerrain tracks excluded; optional rotationLimits. No LOD/ragdoll (sim TODO).
 *   GraphSlot: WorkspotInertialization.duration + hit.hitType==0 → request, clear duration.
 *   MixerSlot: service-event idle/params/addIdle/trajectory; Sample idle→normal→
 *   override→additive on inputLink; inertia 0.5s; facial ignored (FacialMixerSlot).
 *   Shared weight table; UpdateWithEventsWeight gate; FACE_ANIMS mute; BlendAddMul
 *   normals; traj accumulate+slerp; CollectExtraData from clip.extraFloatTracks.
 *   Driver clear: 1 miss frame → empty MixerSlotParams unless setCacheParams(true).
 */

/** Frame-scoped inertialization request (engine AnimNodeUpdateContext fields). */
export type InertializationRequestSink = {
  isInertializationRequested: boolean
  inertializationDuration: number
}

export function createInertializationRequestSink(): InertializationRequestSink {
  return { isInertializationRequested: false, inertializationDuration: 0 }
}

export function clearInertializationRequest(sink: InertializationRequestSink): void {
  sink.isInertializationRequested = false
  sink.inertializationDuration = 0
}

/** Engine: requested |= true; duration = Max(duration, request). */
export function requestInertialization(
  sink: InertializationRequestSink,
  duration: number
): void {
  const d = Number.isFinite(duration) ? Math.max(0, duration) : 0
  sink.isInertializationRequested = true
  sink.inertializationDuration = Math.max(sink.inertializationDuration, d)
}

/** Merge nested-graph request into parent (graphWrapper up-copy). */
export function mergeInertializationRequest(
  parent: InertializationRequestSink,
  child: InertializationRequestSink
): void {
  if (!child.isInertializationRequested) return
  requestInertialization(parent, child.inertializationDuration)
}

/** animNode_StateMachine — instant transition chain cap */
export const MAX_INSTANT_TRANSITION_SEQUENCE_LENGTH = 16

/**
 * Winner among enabled candidates (CheckTransitions):
 * - empty best → take candidate
 * - if best is forced, keep best (forced beats ordinary)
 * - else if candidate is forced OR candidate.priority > best.priority → take candidate
 *
 * Mirrors:
 *   !best.forced && (cand.forced || best.priority < cand.priority)
 */
export function transitionHasHigherPriority(
  best: { priority: number; isForcedToTrue: boolean } | null,
  candidate: { priority: number; isForcedToTrue: boolean }
): boolean {
  if (!best) return true
  if (best.isForcedToTrue) return false
  return candidate.isForcedToTrue || best.priority < candidate.priority
}

/**
 * Blend2::CalculateWeightFromInputValue — normalize input into [0,1] via min/max.
 */
export function blend2WeightFromInput(
  inputValue: number,
  minInputValue: number,
  maxInputValue: number
): number {
  if (!(maxInputValue > minInputValue)) return 0
  const clamped = Math.min(maxInputValue, Math.max(minInputValue, inputValue))
  const range = Math.abs(maxInputValue - minInputValue)
  return range > 0 ? (clamped - minInputValue) / range : 0
}

/** Typical Blend2 active thresholds (weight near 0/1 skips one input). */
export function blend2FirstInputActive(weight: number): boolean {
  return weight < 1
}
export function blend2SecondInputActive(weight: number): boolean {
  return weight > 0
}

/** AnimNode_BlendByMaskDynamic::ACTIVATION_THRESHOLD */
export const BLEND_BY_MASK_DYNAMIC_ACTIVATION = 0.01

/** AnimNode_BlendOverride::ACTIVATION_THRESHOLD */
export const BLEND_OVERRIDE_ACTIVATION = 0.01

/**
 * OnUpdate: blend pose is updated only when weight is above threshold
 * and mask index is in range of `masks`.
 * Unconnected weight defaults to 0; unconnected mask defaults to -1.
 */
export function blendByMaskDynamicBlendActive(
  weight: number,
  maskIndex: number,
  masksCount: number
): boolean {
  return (
    weight > BLEND_BY_MASK_DYNAMIC_ACTIVATION &&
    maskIndex >= 0 &&
    maskIndex < masksCount
  )
}

/** Override input Update/Sample when control weight exceeds threshold. */
export function blendOverrideInputActive(weight: number): boolean {
  return weight > BLEND_OVERRIDE_ACTIVATION
}

/** AnimNode_BlendMultiple::NORMALIZED_WEIGHT_THRESHOLD */
export const BLEND_MULTIPLE_NORMALIZED_WEIGHT_THRESHOLD = 0.001

export type BlendMultipleSelectResult = {
  firstIndex: number
  secondIndex: number
  alpha: number
  /** Weight after clamp / radial wrap */
  weight: number
}

/**
 * AnimNode_BlendMultiple::SelectInputsAndCalculateAlpha.
 * `sortedValues` must be ascending (sortedInputValues / sorted zip).
 */
export function selectBlendMultipleInputs(
  inputWeight: number,
  sortedValues: number[],
  minWeight: number,
  maxWeight: number,
  radialBlending: boolean
): BlendMultipleSelectResult {
  if (sortedValues.length === 0) {
    return { firstIndex: -1, secondIndex: -1, alpha: 0, weight: inputWeight }
  }
  if (sortedValues.length === 1) {
    return { firstIndex: 0, secondIndex: -1, alpha: 0, weight: inputWeight }
  }

  let minW = minWeight
  let maxW = maxWeight
  if (minW > maxW) {
    const tmp = minW
    minW = maxW
    maxW = tmp
  }

  const clampMin = Math.max(sortedValues[0]!, minW)
  const clampMax = Math.min(sortedValues[sortedValues.length - 1]!, maxW)
  let weight = inputWeight

  if (radialBlending) {
    const range = clampMax - clampMin
    if (range === 0) {
      weight = clampMin
    } else {
      let reminder = (weight - clampMin) % range
      if (reminder < 0) reminder += range
      weight = reminder + clampMin
    }
  } else {
    weight = Math.min(clampMax, Math.max(clampMin, weight))
  }

  let secondIndex = 0
  while (
    secondIndex + 1 < sortedValues.length &&
    sortedValues[secondIndex]! <= weight
  ) {
    secondIndex++
  }
  const firstIndex = secondIndex - 1
  if (firstIndex < 0) {
    return { firstIndex: 0, secondIndex: 1, alpha: 0, weight }
  }

  const valuesRange = sortedValues[secondIndex]! - sortedValues[firstIndex]!
  let normalizedWeight =
    valuesRange > 0
      ? (weight - sortedValues[firstIndex]!) / valuesRange
      : 1

  const thr = BLEND_MULTIPLE_NORMALIZED_WEIGHT_THRESHOLD
  let alpha: number
  if (normalizedWeight < thr) alpha = 0
  else if (normalizedWeight > 1 - thr) alpha = 1
  else alpha = Math.min(1, Math.max(0, (normalizedWeight - thr) / (1 - 2 * thr)))

  return { firstIndex, secondIndex, alpha, weight }
}

export function blendMultipleFirstInputActive(alpha: number): boolean {
  return alpha < 1
}

export function blendMultipleSecondInputActive(alpha: number): boolean {
  return alpha > 0
}

/**
 * Build ascending value list + parallel pose refs for BlendMultiple.
 * Prefer cooked `sortedInputValues` when length matches `inputNodes`.
 */
export function buildBlendMultipleSlots(
  inputValues: unknown,
  sortedInputValues: unknown,
  inputNodes: unknown[]
): { values: number[]; refs: unknown[] } {
  const nodes = Array.isArray(inputNodes) ? inputNodes : []
  const sorted = Array.isArray(sortedInputValues)
    ? sortedInputValues
        .map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v)))
        .filter((v) => Number.isFinite(v))
    : []
  if (sorted.length === nodes.length && sorted.length > 0) {
    return { values: sorted as number[], refs: nodes }
  }

  const rawValues = Array.isArray(inputValues) ? inputValues : []
  const pairs: Array<{ value: number; ref: unknown }> = []
  const n = Math.max(rawValues.length, nodes.length)
  for (let i = 0; i < n; i++) {
    const raw = rawValues[i]
    const value =
      typeof raw === 'number' && Number.isFinite(raw)
        ? raw
        : Number.isFinite(Number(raw))
          ? Number(raw)
          : i
    pairs.push({ value, ref: nodes[i] })
  }
  pairs.sort((a, b) => a.value - b.value)
  return {
    values: pairs.map((p) => p.value),
    refs: pairs.map((p) => p.ref),
  }
}
