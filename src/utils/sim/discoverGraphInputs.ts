import { AnimgraphNode } from "../graph/animgraphTypes";
import { handleType, readCName, readCNameList } from "./simDataUtils";
import { UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp } from "./workspotHubKeys";

export function discoverGraphInputs(handles: Map<string, AnimgraphNode>): {
  features: Array<{ feature: string; property: string }>
  /** Vector4 AnimFeatures (VectorInput) — one entry per group.name */
  vectorFeatures: Array<{ feature: string; property: string }>
  /** Quaternion AnimFeatures (QuaternionInput) — one entry per group.name */
  quatFeatures: Array<{ feature: string; property: string }>
  /** Bool AnimFeatures (BoolInput / BoolFeature) — one entry per group.name */
  boolFeatures: Array<{ feature: string; property: string }>
  /** CName AnimFeatures (UpdateWorkspot.animName, …) */
  stringFeatures: Array<{ feature: string; property: string }>
  floatVars: string[]
  vectorVars: string[]
  quatVars: string[]
  transformVars: string[]
  boolVars: string[]
  intVars: string[]
  wrappers: string[]
  events: string[]
  /** Data-flow tags (AnimNode_TagValue) */
  tags: string[]
  /** StaticSwitch Component/Visual/Rig tags (offline entityTags mock) */
  entityTags: string[]
} {
  const features: Array<{ feature: string; property: string }> = []
  const vectorFeatures: Array<{ feature: string; property: string }> = []
  const quatFeatures: Array<{ feature: string; property: string }> = []
  const boolFeatures: Array<{ feature: string; property: string }> = []
  const stringFeatures: Array<{ feature: string; property: string }> = []
  const featureKeys = new Set<string>()
  const vectorKeys = new Set<string>()
  const quatKeys = new Set<string>()
  const boolKeys = new Set<string>()
  const stringKeys = new Set<string>()
  const floatVars = new Set<string>()
  const vectorVars = new Set<string>()
  const quatVars = new Set<string>()
  const transformVars = new Set<string>()
  const boolVars = new Set<string>()
  const intVars = new Set<string>()
  const wrappers = new Set<string>()
  const events = new Set<string>()
  const tags = new Set<string>()
  const entityTags = new Set<string>()

  const addFeature = (feature: string, property: string, preferDisplay = false) => {
    if (!feature || !property || feature === 'None' || property === 'None') return
    const key = `${feature}.${property}`.toLowerCase()
    if (featureKeys.has(key)) {
      if (preferDisplay) {
        const i = features.findIndex(
          (f) => `${f.feature}.${f.property}`.toLowerCase() === key
        )
        if (i >= 0) features[i] = { feature, property }
      }
      return
    }
    featureKeys.add(key)
    features.push({ feature, property })
  }

  const addVectorFeature = (feature: string, property: string, preferDisplay = false) => {
    if (!feature || !property || feature === 'None' || property === 'None') return
    const key = `${feature}.${property}`.toLowerCase()
    if (vectorKeys.has(key)) {
      if (preferDisplay) {
        const i = vectorFeatures.findIndex(
          (f) => `${f.feature}.${f.property}`.toLowerCase() === key
        )
        if (i >= 0) vectorFeatures[i] = { feature, property }
      }
      return
    }
    vectorKeys.add(key)
    vectorFeatures.push({ feature, property })
  }

  const addQuatFeature = (feature: string, property: string, preferDisplay = false) => {
    if (!feature || !property || feature === 'None' || property === 'None') return
    const key = `${feature}.${property}`.toLowerCase()
    if (quatKeys.has(key)) {
      if (preferDisplay) {
        const i = quatFeatures.findIndex(
          (f) => `${f.feature}.${f.property}`.toLowerCase() === key
        )
        if (i >= 0) quatFeatures[i] = { feature, property }
      }
      return
    }
    quatKeys.add(key)
    quatFeatures.push({ feature, property })
  }

  const addBoolFeature = (feature: string, property: string, preferDisplay = false) => {
    if (!feature || !property || feature === 'None' || property === 'None') return
    const key = `${feature}.${property}`.toLowerCase()
    if (boolKeys.has(key)) {
      if (preferDisplay) {
        const i = boolFeatures.findIndex(
          (f) => `${f.feature}.${f.property}`.toLowerCase() === key
        )
        if (i >= 0) boolFeatures[i] = { feature, property }
      }
      return
    }
    boolKeys.add(key)
    boolFeatures.push({ feature, property })
  }

  const addStringFeature = (feature: string, property: string, preferDisplay = false) => {
    if (!feature || !property || feature === 'None' || property === 'None') return
    const key = `${feature}.${property}`.toLowerCase()
    if (stringKeys.has(key)) {
      if (preferDisplay) {
        const i = stringFeatures.findIndex(
          (f) => `${f.feature}.${f.property}`.toLowerCase() === key
        )
        if (i >= 0) stringFeatures[i] = { feature, property }
      }
      return
    }
    stringKeys.add(key)
    stringFeatures.push({ feature, property })
  }

  const addWrapper = (name: string) => {
    if (name && name !== 'None') wrappers.add(name)
  }

  for (const h of handles.values()) {
    const t = handleType(h)
    const d = h.Data ?? {}
    if (
      t === 'animAnimNode_GraphSlot' ||
      t === 'animAnimNode_GraphSlot_Test' ||
      t === 'animAnimNode_GraphSlotConditions'
    ) {
      // GraphSlot C++ TAnimInstanceInput binds (not serialized on the node).
      addFeature('WorkspotInertialization', 'duration', true)
      addFeature('hit', 'hitType', true)
    }
    if (t === 'animAnimNode_WorkspotHub') {
      // WorkspotHub TAnimInstanceInput binds (AnimFeatureUpdateWorkspot).
      addFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.recordID, true)
      addFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.updateCounter, true)
      addFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.animBlendTime, true)
      addFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.forcedBlendIn, true)
      addFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.forceAnimTime, true)
      addFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.timeScale, true)
      addFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.animationStartTime, true)
      addFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.facialKeyWeight, true)
      addFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.globalBlendDuration, true)
      addBoolFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.isPaused, true)
      addBoolFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.isLooped, true)
      addBoolFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.isExitAnim, true)
      addBoolFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.enableMotion, true)
      addBoolFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.isActive, true)
      addBoolFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.isAnimValid, true)
      addBoolFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.globalBlendIn, true)
      addFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.slotNameHash, true)
      addStringFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.animName, true)
      addStringFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.facialIdleAnimation, true)
      addStringFeature(UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp.facialIdleKeyAnimation, true)
    }
    if (
      t === 'animAnimStateTransitionCondition_FloatFeature' ||
      t === 'animAnimStateTransitionCondition_IntFeature' ||
      t === 'animAnimStateTransitionCondition_IntEdgeFeature' ||
      t === 'animAnimStateTransitionCondition_IntEdgeFromToFeature' ||
      t === 'animAnimStateTransitionCondition_IntEdgeToFeature' ||
      t === 'animAnimStateTransitionCondition_IntEdgeGreaterFromZeroFeature'
    ) {
      addFeature(readCName(d.featureName), readCName(d.featurePropertyName))
    }
    if (
      t === 'animAnimStateTransitionCondition_BoolFeature' ||
      t === 'animAnimStateTransitionCondition_BoolEdgeFeature'
    ) {
      addBoolFeature(readCName(d.featureName), readCName(d.featurePropertyName))
    }
    // External AnimFeature inputs — prefer their casing for UI labels
    if (t === 'animAnimNode_FloatInput' || t === 'animAnimNode_IntInput') {
      addFeature(readCName(d.group), readCName(d.name), true)
    }
    if (t === 'animAnimNode_BoolInput') {
      addBoolFeature(readCName(d.group), readCName(d.name), true)
    }
    // Vector4 AnimFeature (engine VectorInputValue) — one Vector4 per group.name
    if (t === 'animAnimNode_VectorInput') {
      addVectorFeature(readCName(d.group), readCName(d.name), true)
    }
    if (t === 'animAnimNode_QuaternionInput') {
      addQuatFeature(readCName(d.group), readCName(d.name), true)
    }
    if (
      t === 'animAnimStateTransitionCondition_FloatVariable' ||
      t === 'animAnimStateTransitionCondition_ModifiedFloatVariable' ||
      t === 'animAnimNode_FloatVariable'
    ) {
      const name = readCName(d.variableName)
      if (name) floatVars.add(name)
    }
    if (t === 'animAnimNode_VectorVariable') {
      const name = readCName(d.variableName)
      if (name && name !== 'None') vectorVars.add(name)
    }
    if (t === 'animAnimNode_QuaternionVariable') {
      const name = readCName(d.variableName)
      if (name && name !== 'None') quatVars.add(name)
    }
    if (t === 'animAnimNode_TransformVariable') {
      const name = readCName(d.variableName)
      if (name && name !== 'None') transformVars.add(name)
    }
    if (
      t === 'animAnimStateTransitionCondition_BoolVariable' ||
      t === 'animAnimNode_BoolVariable'
    ) {
      const name = readCName(d.variableName)
      if (name) boolVars.add(name)
    }
    if (
      t === 'animAnimStateTransitionCondition_IntVariable' ||
      t === 'animAnimNode_IntVariable'
    ) {
      const name = readCName(d.variableName)
      if (name) intVars.add(name)
    }
    if (t === 'animAnimNode_WrapperValue') {
      for (const name of readCNameList(d.wrapperNames)) addWrapper(name)
    }
    if (t === 'animAnimStateTransitionCondition_WrapperValue') {
      addWrapper(readCName(d.wrapperName))
    }
    if (t === 'animAnimNode_TagValue') {
      const name = readCName(d.tag)
      if (name && name !== 'None') tags.add(name)
    }
    if (
      t === 'animComponentTagCondition' ||
      t === 'animVisualTagCondition' ||
      t === 'animRigTagCondition'
    ) {
      const name =
        readCName(d.animTag) || readCName(d.visualTag) || readCName(d.tag)
      if (name && name !== 'None') entityTags.add(name)
    }
    if (t === 'animAnimNode_MultiBoolToFloatValue') {
      const inputs = Array.isArray(d.inputsData) ? d.inputsData : []
      for (const raw of inputs) {
        if (!raw || typeof raw !== 'object') continue
        const e = raw as Record<string, unknown>
        addBoolFeature(readCName(e.group), readCName(e.name))
      }
    }
    if (
      t === 'animAnimStateTransitionCondition_ExternalEvent' ||
      t === 'animAnimStateTransitionCondition_AnimEvent' ||
      t === 'animAnimStateTransitionCondition_AnimEnd' ||
      t === 'animAnimNode_EventValue' ||
      t === 'animAnimNode_Event'
    ) {
      const name = readCName(d.eventName)
      if (name && name !== 'None') events.add(name)
    }
    if (t === 'animAnimNode_Signal') {
      for (const key of ['startEvent', 'endEvent'] as const) {
        const name = readCName(d[key])
        if (name && name !== 'None') events.add(name)
      }
    }
  }

  features.sort((a, b) =>
    `${a.feature}.${a.property}`.localeCompare(`${b.feature}.${b.property}`)
  )
  vectorFeatures.sort((a, b) =>
    `${a.feature}.${a.property}`.localeCompare(`${b.feature}.${b.property}`)
  )
  quatFeatures.sort((a, b) =>
    `${a.feature}.${a.property}`.localeCompare(`${b.feature}.${b.property}`)
  )
  boolFeatures.sort((a, b) =>
    `${a.feature}.${a.property}`.localeCompare(`${b.feature}.${b.property}`)
  )
  stringFeatures.sort((a, b) =>
    `${a.feature}.${a.property}`.localeCompare(`${b.feature}.${b.property}`)
  )

  return {
    features,
    vectorFeatures,
    quatFeatures,
    boolFeatures,
    stringFeatures,
    floatVars: [...floatVars].sort((a, b) => a.localeCompare(b)),
    vectorVars: [...vectorVars].sort((a, b) => a.localeCompare(b)),
    quatVars: [...quatVars].sort((a, b) => a.localeCompare(b)),
    transformVars: [...transformVars].sort((a, b) => a.localeCompare(b)),
    boolVars: [...boolVars].sort((a, b) => a.localeCompare(b)),
    intVars: [...intVars].sort((a, b) => a.localeCompare(b)),
    wrappers: [...wrappers].sort((a, b) => a.localeCompare(b)),
    events: [...events].sort((a, b) => a.localeCompare(b)),
    tags: [...tags].sort((a, b) => a.localeCompare(b)),
    entityTags: [...entityTags].sort((a, b) => a.localeCompare(b)),
  }
}