import {
  DraftChannel,
  type DraftAppliedChannelId,
  type DraftFeatureRef,
  type DraftNameRef,
  type IDraftChannel,
} from './DraftChannel'

export type DraftChannelOnAppliedById = Partial<Record<DraftAppliedChannelId, () => void>>

export const clearDraftChannels = (channels: readonly IDraftChannel[]): void => {
  for (const channel of channels) channel.clearBuffers()
}

/** Per-sim-instance channels (own mutable applied-key buffers). */
export const createDraftChannels = (): IDraftChannel[] => [
  new DraftChannel<DraftFeatureRef>({
    id: 'numericFeatures',
    isDirty: (e) =>
      e.appliedRevisionInfo.numericFeaturesRevision !== e.draftBoard.numericFeaturesRevisionRef.value,
    applyEntry: (board, draftBoard, nextKeys) => {
      const values = draftBoard.numericFeatureByKeyRef.value
      for (const [key, featureInfo] of draftBoard.populatedNumericFeatureKeyToFeatureMap) {
        const value = values[key]
        if (value === undefined) continue
        board.setFeature(featureInfo.feature, featureInfo.property, value)
        nextKeys.set(key, featureInfo)
      }
    },
    syncRevision: (e) => {
      e.appliedRevisionInfo.numericFeaturesRevision = e.draftBoard.numericFeaturesRevisionRef.value
    },
    clearOrphan: (board, _key, ref) => board.clearFeature(ref.feature, ref.property),
  }),
  new DraftChannel<DraftFeatureRef>({
    id: 'stringFeatures',
    isDirty: (e) =>
      e.appliedRevisionInfo.stringFeaturesRevision !== e.draftBoard.stringFeaturesRevisionRef.value,
    applyEntry: (board, draftBoard, nextKeys) => {
      const values = draftBoard.stringFeatureByKeyRef.value
      for (const [key, featureInfo] of draftBoard.populatedStringFeatureKeyToFeatureMap) {
        const value = values[key]
        if (value === undefined) continue
        board.setStringFeature(featureInfo.feature, featureInfo.property, value)
        nextKeys.set(key, featureInfo)
      }
    },
    syncRevision: (e) => {
      e.appliedRevisionInfo.stringFeaturesRevision = e.draftBoard.stringFeaturesRevisionRef.value
    },
    clearOrphan: (board, _key, ref) => board.clearStringFeature(ref.feature, ref.property),
  }),
  new DraftChannel<DraftFeatureRef>({
    id: 'booleanFeatures',
    isDirty: (e) =>
      e.appliedRevisionInfo.booleanFeaturesRevision !== e.draftBoard.booleanFeaturesRevisionRef.value,
    applyEntry: (board, draftBoard, nextKeys) => {
      const values = draftBoard.booleanFeatureByKeyRef.value
      for (const [key, featureInfo] of draftBoard.populatedBooleanFeatureKeyToFeatureMap) {
        const value = values[key]
        if (value === undefined) continue
        board.setBoolFeature(featureInfo.feature, featureInfo.property, value)
        nextKeys.set(key, featureInfo)
      }
    },
    syncRevision: (e) => {
      e.appliedRevisionInfo.booleanFeaturesRevision = e.draftBoard.booleanFeaturesRevisionRef.value
    },
    clearOrphan: (board, _key, ref) => board.clearBoolFeature(ref.feature, ref.property),
  }),
  new DraftChannel<DraftFeatureRef>({
    id: 'vectorFeatures',
    isDirty: (e) =>
      e.appliedRevisionInfo.vectorFeaturesRevision !== e.draftBoard.vectorFeaturesRevisionRef.value,
    applyEntry: (board, draftBoard, nextKeys) => {
      const values = draftBoard.vectorFeatureByKeyRef.value
      for (const [key, featureInfo] of draftBoard.populatedVectorFeatureKeyToFeatureMap) {
        const value = values[key]
        if (value === undefined) continue
        board.setVectorFeature(featureInfo.feature, featureInfo.property, value)
        nextKeys.set(key, featureInfo)
      }
    },
    syncRevision: (e) => {
      e.appliedRevisionInfo.vectorFeaturesRevision = e.draftBoard.vectorFeaturesRevisionRef.value
    },
    clearOrphan: (board, _key, ref) => board.clearVectorFeature(ref.feature, ref.property),
  }),
  new DraftChannel<DraftFeatureRef>({
    id: 'quatFeatures',
    isDirty: (e) =>
      e.appliedRevisionInfo.quatFeaturesRevision !== e.draftBoard.quatFeaturesRevisionRef.value,
    applyEntry: (board, draftBoard, nextKeys) => {
      const values = draftBoard.quatFeatureByKeyRef.value
      for (const [key, featureInfo] of draftBoard.populatedQuatFeatureKeyToFeatureMap) {
        const value = values[key]
        if (value === undefined) continue
        board.setQuatFeature(featureInfo.feature, featureInfo.property, value)
        nextKeys.set(key, featureInfo)
      }
    },
    syncRevision: (e) => {
      e.appliedRevisionInfo.quatFeaturesRevision = e.draftBoard.quatFeaturesRevisionRef.value
    },
    clearOrphan: (board, _key, ref) => board.clearQuatFeature(ref.feature, ref.property),
  }),
  new DraftChannel<DraftNameRef>({
    id: 'floatVars',
    isDirty: (e) => e.appliedRevisionInfo.floatVarsRevision !== e.draftBoard.floatVarsRevisionRef.value,
    applyEntry: (board, draftBoard, nextKeys) => {
      const values = draftBoard.floatVarByKeyRef.value
      for (const varName of draftBoard.populatedFloatVarNamesSet) {
        const value = values[varName]
        if (value === undefined) continue
        board.floatVars.set(varName, value)
        nextKeys.set(varName, true)
      }
    },
    syncRevision: (e) => {
      e.appliedRevisionInfo.floatVarsRevision = e.draftBoard.floatVarsRevisionRef.value
    },
    clearOrphan: (board, key) => { board.floatVars.delete(key) },
  }),
  new DraftChannel<DraftNameRef>({
    id: 'intVars',
    isDirty: (e) => e.appliedRevisionInfo.intVarsRevision !== e.draftBoard.intVarsRevisionRef.value,
    applyEntry: (board, draftBoard, nextKeys) => {
      const values = draftBoard.intVarByKeyRef.value
      for (const varName of draftBoard.populatedIntVarNamesSet) {
        const value = values[varName]
        if (value === undefined) continue
        board.intVars.set(varName, value)
        nextKeys.set(varName, true)
      }
    },
    syncRevision: (e) => {
      e.appliedRevisionInfo.intVarsRevision = e.draftBoard.intVarsRevisionRef.value
    },
    clearOrphan: (board, key) => { board.intVars.delete(key) },
  }),
  new DraftChannel<DraftNameRef>({
    id: 'boolVars',
    isDirty: (e) => e.appliedRevisionInfo.boolVarsRevision !== e.draftBoard.boolVarsRevisionRef.value,
    applyEntry: (board, draftBoard, nextKeys) => {
      const values = draftBoard.boolVarByKeyRef.value
      for (const varName of draftBoard.populatedBoolVarNamesSet) {
        const value = values[varName]
        if (value === undefined) continue
        board.boolVars.set(varName, value)
        nextKeys.set(varName, true)
      }
    },
    syncRevision: (e) => {
      e.appliedRevisionInfo.boolVarsRevision = e.draftBoard.boolVarsRevisionRef.value
    },
    clearOrphan: (board, key) => { board.boolVars.delete(key) },
  }),
  new DraftChannel<DraftNameRef>({
    id: 'vectorVars',
    isDirty: (e) => e.appliedRevisionInfo.vectorVarsRevision !== e.draftBoard.vectorVarsRevisionRef.value,
    applyEntry: (board, draftBoard, nextKeys) => {
      const values = draftBoard.vectorVarByKeyRef.value
      for (const varName of draftBoard.populatedVectorVarNamesSet) {
        const value = values[varName]
        if (value === undefined) continue
        board.vectorVars.set(varName, value)
        nextKeys.set(varName, true)
      }
    },
    syncRevision: (e) => {
      e.appliedRevisionInfo.vectorVarsRevision = e.draftBoard.vectorVarsRevisionRef.value
    },
    clearOrphan: (board, key) => { board.vectorVars.delete(key) },
  }),
  new DraftChannel<DraftNameRef>({
    id: 'quatVars',
    isDirty: (e) => e.appliedRevisionInfo.quatVarsRevision !== e.draftBoard.quatVarsRevisionRef.value,
    applyEntry: (board, draftBoard, nextKeys) => {
      const values = draftBoard.quatVarByKeyRef.value
      for (const varName of draftBoard.populatedQuatVarNamesSet) {
        const value = values[varName]
        if (value === undefined) continue
        board.quatVars.set(varName, value)
        nextKeys.set(varName, true)
      }
    },
    syncRevision: (e) => {
      e.appliedRevisionInfo.quatVarsRevision = e.draftBoard.quatVarsRevisionRef.value
    },
    clearOrphan: (board, key) => { board.quatVars.delete(key) },
  }),
  new DraftChannel<DraftNameRef>({
    id: 'wrapperWeights',
    isDirty: (e) =>
      e.appliedRevisionInfo.wrapperWeightsRevision !== e.draftBoard.wrapperWeightsRevisionRef.value,
    applyEntry: (board, draftBoard, nextKeys) => {
      const values = draftBoard.wrapperWeightByKeyRef.value
      for (const varName of draftBoard.populatedWrapperWeightNamesSet) {
        const value = values[varName]
        if (value === undefined) continue
        board.setWrapperWeight(varName, value)
        nextKeys.set(varName, true)
      }
    },
    syncRevision: (e) => {
      e.appliedRevisionInfo.wrapperWeightsRevision = e.draftBoard.wrapperWeightsRevisionRef.value
    },
    clearOrphan: (board, key) => board.clearWrapperWeight(key),
  }),
  new DraftChannel<DraftNameRef>({
    id: 'tagValues',
    isDirty: (e) => e.appliedRevisionInfo.tagValuesRevision !== e.draftBoard.tagValuesRevisionRef.value,
    applyEntry: (board, draftBoard, nextKeys) => {
      const values = draftBoard.tagValueByKeyRef.value
      for (const varName of draftBoard.populatedTagValueNamesSet) {
        const value = values[varName]
        if (value === undefined) continue
        board.setTagValue(varName, value)
        nextKeys.set(varName, true)
      }
    },
    syncRevision: (e) => {
      e.appliedRevisionInfo.tagValuesRevision = e.draftBoard.tagValuesRevisionRef.value
    },
    clearOrphan: (board, key) => board.clearTagValue(key),
  }),
  new DraftChannel<DraftNameRef>({
    id: 'entityTags',
    isDirty: (e) =>
      e.appliedRevisionInfo.entityTagsRevision !== e.draftBoard.entityTagsRevisionRef.value,
    applyEntry: (board, draftBoard, nextKeys) => {
      const values = draftBoard.entityTagByKeyRef.value
      for (const varName of draftBoard.populatedEntityTagNamesSet) {
        const value = values[varName]
        if (value === undefined) continue
        board.setEntityTag(varName, value)
        nextKeys.set(varName, true)
      }
    },
    syncRevision: (e) => {
      e.appliedRevisionInfo.entityTagsRevision = e.draftBoard.entityTagsRevisionRef.value
    },
    clearOrphan: (board, key) => board.setEntityTag(key, false),
  }),
]
