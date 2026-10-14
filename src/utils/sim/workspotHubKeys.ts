/** AnimFeatureUpdateWorkspot feature group name. */
export const UPDATE_WORKSPOT_FEATURE = 'UpdateWorkspot'

/** Default WorkspotTree::m_animGraphSlotName. */
export const WORKSPOT_SLOT_NAME = 'WORKSPOT'

/** AnimFeatureUpdateWorkspot property names. */
export const UpdateWorkspotProp = {
  animName: 'animName',
  recordID: 'recordID',
  updateCounter: 'updateCounter',
  boolsAsFlags: 'boolsAsFlags',
  animBlendTime: 'animBlendTime',
  forcedBlendIn: 'forcedBlendIn',
  forceAnimTime: 'forceAnimTime',
  timeScale: 'timeScale',
  animationStartTime: 'animationStartTime',
  isPaused: 'isPaused',
  isLooped: 'isLooped',
  isExitAnim: 'isExitAnim',
  enableMotion: 'enableMotion',
  isActive: 'isActive',
  isAnimValid: 'isAnimValid',
  slotNameHash: 'slotNameHash',
  facialKeyWeight: 'facialKeyWeight',
  facialIdleAnimation: 'facialIdleAnimation',
  facialIdleKeyAnimation: 'facialIdleKeyAnimation',
  globalBlendDuration: 'globalBlendDuration',
  globalBlendIn: 'globalBlendIn',
} as const

export type UpdateWorkspotPropName =
  (typeof UpdateWorkspotProp)[keyof typeof UpdateWorkspotProp]
