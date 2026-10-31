import type { IDraftBoard } from './types'

export type DraftBoardAppliedRevisionInfo = {
  numericFeaturesRevision: number
  stringFeaturesRevision: number
  booleanFeaturesRevision: number
  vectorFeaturesRevision: number
  quatFeaturesRevision: number

  floatVarsRevision: number
  intVarsRevision: number
  boolVarsRevision: number
  vectorVarsRevision: number
  quatVarsRevision: number

  wrapperWeightsRevision: number

  tagValuesRevision: number

  entityTagsRevision: number
}

export type DraftBoardEntry = {
  draftBoard: IDraftBoard
  /** Lower priority = higher priority. */
  priority: number
  appliedRevisionInfo: DraftBoardAppliedRevisionInfo
}

export const createDraftAppliedRevisionInfo = (): DraftBoardAppliedRevisionInfo => ({
  numericFeaturesRevision: -1,
  stringFeaturesRevision: -1,
  booleanFeaturesRevision: -1,
  vectorFeaturesRevision: -1,
  quatFeaturesRevision: -1,
  floatVarsRevision: -1,
  intVarsRevision: -1,
  boolVarsRevision: -1,
  vectorVarsRevision: -1,
  quatVarsRevision: -1,
  wrapperWeightsRevision: -1,
  tagValuesRevision: -1,
  entityTagsRevision: -1,
})
