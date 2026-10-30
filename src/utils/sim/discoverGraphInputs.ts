import { AnimgraphNode } from "../graph/animgraphTypes";
import { handleType, readCName, readCNameList } from "./simDataUtils";
import { UPDATE_WORKSPOT_FEATURE, UpdateWorkspotProp } from "./workspotHubKeys";

export type DiscoveredGraphInputs = {
  /** Float AnimFeatures (FloatInput / FloatFeature) — one entry per group.name */
  floatFeatures: Array<{ feature: string; property: string }>
  floatFeatureKeysSet: Set<string>
  /** Vector4 AnimFeatures (VectorInput) — one entry per group.name */
  vectorFeatures: Array<{ feature: string; property: string }>
  vectorFeatureKeysSet: Set<string>
  /** Quaternion AnimFeatures (QuaternionInput) — one entry per group.name */
  quatFeatures: Array<{ feature: string; property: string }>
  quatFeatureKeysSet: Set<string>
  /** Bool AnimFeatures (BoolInput / BoolFeature) — one entry per group.name */
  boolFeatures: Array<{ feature: string; property: string }>
  boolFeatureKeysSet: Set<string>
  /** CName AnimFeatures (UpdateWorkspot.animName, …) */
  stringFeatures: Array<{ feature: string; property: string }>
  stringFeatureKeysSet: Set<string>
  floatVarNamesSet: Set<string>
  vectorVarNamesSet: Set<string>
  quatVarNamesSet: Set<string>
  transformVarNamesSet: Set<string>
  boolVarNamesSet: Set<string>
  intVarNamesSet: Set<string>
  wrapperNamesSet: Set<string>
  eventNamesSet: Set<string>
  tagNamesSet: Set<string>
  entityTagNamesSet: Set<string>
}

export function discoverGraphInputs(handles: Map<string, AnimgraphNode>): DiscoveredGraphInputs {
  const floatFeatures: Array<{ feature: string; property: string }> = []
  const floatFeatureKeysSet = new Set<string>()
  const vectorFeatures: Array<{ feature: string; property: string }> = []
  const vectorFeatureKeysSet = new Set<string>()
  const quatFeatures: Array<{ feature: string; property: string }> = []
  const quatFeatureKeysSet = new Set<string>()
  const boolFeatures: Array<{ feature: string; property: string }> = []
  const boolFeatureKeysSet = new Set<string>()
  const stringFeatures: Array<{ feature: string; property: string }> = []
  const stringFeatureKeysSet = new Set<string>()
  const floatVarNamesSet = new Set<string>()
  const vectorVarNamesSet = new Set<string>()
  const quatVarNamesSet = new Set<string>()
  const transformVarNamesSet = new Set<string>()
  const boolVarNamesSet = new Set<string>()
  const intVarNamesSet = new Set<string>()
  const wrapperNamesSet = new Set<string>()
  const eventNamesSet = new Set<string>()
  const tagNamesSet = new Set<string>()
  const entityTagNamesSet = new Set<string>()

  const addFeature = (feature: string, property: string, preferDisplay = false) => {
    if (!feature || !property || feature === 'None' || property === 'None') return
    const key = `${feature}.${property}`.toLowerCase()
    if (floatFeatureKeysSet.has(key)) {
      if (preferDisplay) {
        const i = floatFeatures.findIndex(
          (f) => `${f.feature}.${f.property}`.toLowerCase() === key
        )
        if (i >= 0) floatFeatures[i] = { feature, property }
      }
      return
    }
    floatFeatureKeysSet.add(key)
    floatFeatures.push({ feature, property })
  }

  const addVectorFeature = (feature: string, property: string, preferDisplay = false) => {
    if (!feature || !property || feature === 'None' || property === 'None') return
    const key = `${feature}.${property}`.toLowerCase()
    if (vectorFeatureKeysSet.has(key)) {
      if (preferDisplay) {
        const i = vectorFeatures.findIndex(
          (f) => `${f.feature}.${f.property}`.toLowerCase() === key
        )
        if (i >= 0) vectorFeatures[i] = { feature, property }
      }
      return
    }
    vectorFeatureKeysSet.add(key)
    vectorFeatures.push({ feature, property })
  }

  const addQuatFeature = (feature: string, property: string, preferDisplay = false) => {
    if (!feature || !property || feature === 'None' || property === 'None') return
    const key = `${feature}.${property}`.toLowerCase()
    if (quatFeatureKeysSet.has(key)) {
      if (preferDisplay) {
        const i = quatFeatures.findIndex(
          (f) => `${f.feature}.${f.property}`.toLowerCase() === key
        )
        if (i >= 0) quatFeatures[i] = { feature, property }
      }
      return
    }
    quatFeatureKeysSet.add(key)
    quatFeatures.push({ feature, property })
  }

  const addBoolFeature = (feature: string, property: string, preferDisplay = false) => {
    if (!feature || !property || feature === 'None' || property === 'None') return
    const key = `${feature}.${property}`.toLowerCase()
    if (boolFeatureKeysSet.has(key)) {
      if (preferDisplay) {
        const i = boolFeatures.findIndex(
          (f) => `${f.feature}.${f.property}`.toLowerCase() === key
        )
        if (i >= 0) boolFeatures[i] = { feature, property }
      }
      return
    }
    boolFeatureKeysSet.add(key)
    boolFeatures.push({ feature, property })
  }

  const addStringFeature = (feature: string, property: string, preferDisplay = false) => {
    if (!feature || !property || feature === 'None' || property === 'None') return
    const key = `${feature}.${property}`.toLowerCase()
    if (stringFeatureKeysSet.has(key)) {
      if (preferDisplay) {
        const i = stringFeatures.findIndex(
          (f) => `${f.feature}.${f.property}`.toLowerCase() === key
        )
        if (i >= 0) stringFeatures[i] = { feature, property }
      }
      return
    }
    stringFeatureKeysSet.add(key)
    stringFeatures.push({ feature, property })
  }

  const addWrapper = (name: string) => {
    if (name && name !== 'None') wrapperNamesSet.add(name)
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
      if (name) floatVarNamesSet.add(name)
    }
    if (t === 'animAnimNode_VectorVariable') {
      const name = readCName(d.variableName)
      if (name && name !== 'None') vectorVarNamesSet.add(name)
    }
    if (t === 'animAnimNode_QuaternionVariable') {
      const name = readCName(d.variableName)
      if (name && name !== 'None') quatVarNamesSet.add(name)
    }
    if (t === 'animAnimNode_TransformVariable') {
      const name = readCName(d.variableName)
      if (name && name !== 'None') transformVarNamesSet.add(name)
    }
    if (
      t === 'animAnimStateTransitionCondition_BoolVariable' ||
      t === 'animAnimNode_BoolVariable'
    ) {
      const name = readCName(d.variableName)
      if (name) boolVarNamesSet.add(name)
    }
    if (
      t === 'animAnimStateTransitionCondition_IntVariable' ||
      t === 'animAnimNode_IntVariable'
    ) {
      const name = readCName(d.variableName)
      if (name) intVarNamesSet.add(name)
    }
    if (t === 'animAnimNode_WrapperValue') {
      for (const name of readCNameList(d.wrapperNames)) addWrapper(name)
    }
    if (t === 'animAnimStateTransitionCondition_WrapperValue') {
      addWrapper(readCName(d.wrapperName))
    }
    if (t === 'animAnimNode_TagValue') {
      const name = readCName(d.tag)
      if (name && name !== 'None') tagNamesSet.add(name)
    }
    if (
      t === 'animComponentTagCondition' ||
      t === 'animVisualTagCondition' ||
      t === 'animRigTagCondition'
    ) {
      const name =
        readCName(d.animTag) || readCName(d.visualTag) || readCName(d.tag)
      if (name && name !== 'None') entityTagNamesSet.add(name)
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
      if (name && name !== 'None') eventNamesSet.add(name)
    }
    if (t === 'animAnimNode_Signal') {
      for (const key of ['startEvent', 'endEvent'] as const) {
        const name = readCName(d[key])
        if (name && name !== 'None') eventNamesSet.add(name)
      }
    }
  }

  return {
    floatFeatures,
    floatFeatureKeysSet,
    vectorFeatures,
    vectorFeatureKeysSet,
    quatFeatures,
    quatFeatureKeysSet,
    boolFeatures,
    boolFeatureKeysSet,
    stringFeatures,
    stringFeatureKeysSet,
    floatVarNamesSet,
    vectorVarNamesSet,
    quatVarNamesSet,
    transformVarNamesSet,
    boolVarNamesSet,
    intVarNamesSet,
    wrapperNamesSet,
    eventNamesSet,
    tagNamesSet,
    entityTagNamesSet,
  }
}