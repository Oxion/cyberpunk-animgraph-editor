import type { AnimgraphNode } from '../graph/animgraphTypes'

/**
 * Extracts referenced nodes from nodes that don't have any references
 * These functions return empty arrays as these nodes don't reference other nodes
 */

// These functions are now implemented in separate extractor files
// export function extractReferencedNodesFromSwitch(data: any): AnimgraphNode[] {
//   return []
// }

// export function extractReferencedNodesFromState(data: any): AnimgraphNode[] {
//   return []
// }

// export function extractReferencedNodesFromStateFrozen(data: any): AnimgraphNode[] {
//   return []
// }

// export function extractReferencedNodesFromTranslateBone(data: any): AnimgraphNode[] {
//   return []
// }

// export function extractReferencedNodesFromSetBoneTransform(data: any): AnimgraphNode[] {
//   return []
// }

export function extractReferencedNodesFromTimer(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromFloatInput(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromFloatConstant(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromFloatVariable(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromFloatRandom(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromFloatClamp(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromFloatInterpolation(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromBoolInput(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromIntInput(data: any): AnimgraphNode[] {
  return []
}

// This function is now implemented in a separate extractor file
// export function extractReferencedNodesFromBoolToFloatConverter(data: any): AnimgraphNode[] {
//   return []
// }

// This function is now implemented in a separate extractor file
// export function extractReferencedNodesFromIntToFloatConverter(data: any): AnimgraphNode[] {
//   return []
// }

// This function is now implemented in a separate extractor file
// export function extractReferencedNodesFromMathExpressionFloat(data: any): AnimgraphNode[] {
//   return []
// }

// This function is now implemented in a separate extractor file
// export function extractReferencedNodesFromMathExpressionVector(data: any): AnimgraphNode[] {
//   return []
// }

// This function is now implemented in a separate extractor file
// export function extractReferencedNodesFromMathExpressionNodeData(data: any): AnimgraphNode[] {
//   return []
// }

// This function is now implemented in a separate extractor file
// export function extractReferencedNodesFromAnimDatabase(data: any): AnimgraphNode[] {
//   return []
// }

// This function is now implemented in a separate extractor file
// export function extractReferencedNodesFromSkDurationAnim(data: any): AnimgraphNode[] {
//   return []
// }

// This function is now implemented in a separate extractor file
// export function extractReferencedNodesFromSkOneShotAnim(data: any): AnimgraphNode[] {
//   return []
// }

export function extractReferencedNodesFromSkPhaseAnim(data: any): AnimgraphNode[] {
  return []
}

// This function is now implemented in a separate extractor file
// export function extractReferencedNodesFromSkPhaseWithDurationAnim(data: any): AnimgraphNode[] {
//   return []
// }

// This function is now implemented in a separate extractor file
// export function extractReferencedNodesFromSkSpeedAnim(data: any): AnimgraphNode[] {
//   return []
// }

// export function extractReferencedNodesFromSkFrameAnim(data: any): AnimgraphNode[] {
//   return []
// }

export function extractReferencedNodesFromSkAnim(data: any): AnimgraphNode[] {
  return []
}

// export function extractReferencedNodesFromStage(data: any): AnimgraphNode[] {
//   return []
// }

// This function is now implemented in a separate extractor file
// export function extractReferencedNodesFromStagePoseEntry(data: any): AnimgraphNode[] {
//   return []
// }

// This function is now implemented in a separate extractor file
// export function extractReferencedNodesFromCriticalSpringDamp(data: any): AnimgraphNode[] {
//   return []
// }

// This function is now implemented in a separate extractor file
// export function extractReferencedNodesFromSkipConsoleBegin(data: any): AnimgraphNode[] {
//   return []
// }

// This function is now implemented in a separate extractor file
// export function extractReferencedNodesFromSkipConsoleEnd(data: any): AnimgraphNode[] {
//   return []
// }

export function extractReferencedNodesFromTagValue(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromEventValue(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromWrapperValue(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromEvent(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromSignal(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromIdentityPoseTerminator(data: any): AnimgraphNode[] {
  return []
}

// export function extractReferencedNodesFromOutput(data: any): AnimgraphNode[] {
//   return []
// }

// export function extractReferencedNodesFromJoin(data: any): AnimgraphNode[] {
//   return []
// }

export function extractReferencedNodesFromPoseBlendMethodBoneBranch(data: any): AnimgraphNode[] {
  return []
}

// This function is now implemented in a separate extractor file
// export function extractReferencedNodesFromExpressionDataAny(data: any): AnimgraphNode[] {
//   return []
// }

// These functions use flatten_animAnimNode_any and have no referenced nodes
export function extractReferencedNodesFromAnimStateTransitionConditionHasAnimation(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromAnimStateTransitionConditionFloatFeature(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromAnimStateTransitionConditionFloatVariable(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromAnimStateTransitionConditionWrapperValue(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromAnimStateTransitionConditionAnimEnd(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromAnimStateTransitionConditionTimed(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromAnimStateTransitionConditionIntEdgeToFeature(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromAnimStateTransitionConditionExternalEvent(data: any): AnimgraphNode[] {
  return []
}

// This function is now implemented in a separate extractor file
// export function extractReferencedNodesFromAnimStateTransitionConditionCompositeSimultaneous(data: any): AnimgraphNode[] {
//   return []
// }

export function extractReferencedNodesFromAnimStateTransitionConditionIntFeature(data: any): AnimgraphNode[] {
  return []
}

export function extractReferencedNodesFromAnimStateTransitionConditionBoolFeature(data: any): AnimgraphNode[] {
  return []
}

// This function is now implemented in a separate extractor file
// export function extractReferencedNodesFromAnimStateMachineConditionalEntry(data: any): AnimgraphNode[] {
//   return []
// }

export function extractReferencedNodesFromAnimStateTransitionInterpolatorBlend(data: any): AnimgraphNode[] {
  return []
}

// These functions are now implemented in separate extractor files
// export function extractReferencedNodesFromAnimStateTransitionDescription(data: any): AnimgraphNode[] {
//   return []
// }

// export function extractReferencedNodesFromPoseLink(data: any): AnimgraphNode[] {
//   return []
// }

// export function extractReferencedNodesFromFloatLink(data: any): AnimgraphNode[] {
//   return []
// }

// export function extractReferencedNodesFromBoolLink(data: any): AnimgraphNode[] {
//   return []
// }

// export function extractReferencedNodesFromIntLink(data: any): AnimgraphNode[] {
//   return []
// }

// export function extractReferencedNodesFromVectorLink(data: any): AnimgraphNode[] {
//   return []
// }
