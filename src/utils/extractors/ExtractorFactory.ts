import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromRoot } from './RootExtractor'
import { extractReferencedNodesFromBlend2 } from './Blend2Extractor'
import { extractReferencedNodesFromStateMachine } from './StateMachineExtractor'
import { extractReferencedNodesFromFloatMathOp } from './FloatMathOpExtractor'
import { extractReferencedNodesFromFloatComparator } from './FloatComparatorExtractor'
import { extractReferencedNodesFromBlendAdditive } from './BlendAdditiveExtractor'
import { extractReferencedNodesFromBlendMultiple } from './BlendMultipleExtractor'
import { extractReferencedNodesFromBlendOverride } from './BlendOverrideExtractor'
import { extractReferencedNodesFromFloatJoin, extractReferencedNodesFromFloatLatch, extractReferencedNodesFromDampFloat, extractReferencedNodesFromCurveFloatValue, extractReferencedNodesFromSpringDamp } from './SimpleExtractors'
import { extractReferencedNodesFromSwitch } from './SwitchExtractor'
import { extractReferencedNodesFromState } from './StateExtractor'
import { extractReferencedNodesFromStateFrozen } from './StateFrozenExtractor'
import { extractReferencedNodesFromTranslateBone } from './TranslateBoneExtractor'
import { extractReferencedNodesFromSetBoneTransform } from './SetBoneTransformExtractor'
import { extractReferencedNodesFromSkFrameAnim } from './SkFrameAnimExtractor'
import { extractReferencedNodesFromStage } from './StageExtractor'
import { extractReferencedNodesFromJoin } from './JoinExtractor'
import { extractReferencedNodesFromOutput } from './OutputExtractor'
import { extractReferencedNodesFromTimer, extractReferencedNodesFromFloatInput, extractReferencedNodesFromFloatConstant, extractReferencedNodesFromFloatVariable, extractReferencedNodesFromFloatRandom, extractReferencedNodesFromBoolInput, extractReferencedNodesFromIntInput, extractReferencedNodesFromTagValue, extractReferencedNodesFromEventValue, extractReferencedNodesFromWrapperValue, extractReferencedNodesFromEvent, extractReferencedNodesFromSignal, extractReferencedNodesFromIdentityPoseTerminator, extractReferencedNodesFromPoseBlendMethodBoneBranch, extractReferencedNodesFromSkPhaseAnim, extractReferencedNodesFromSkAnim, extractReferencedNodesFromAnimStateTransitionConditionHasAnimation, extractReferencedNodesFromAnimStateTransitionConditionFloatFeature, extractReferencedNodesFromAnimStateTransitionConditionFloatVariable, extractReferencedNodesFromAnimStateTransitionConditionWrapperValue, extractReferencedNodesFromAnimStateTransitionConditionAnimEnd, extractReferencedNodesFromAnimStateTransitionConditionTimed, extractReferencedNodesFromAnimStateTransitionConditionIntEdgeToFeature, extractReferencedNodesFromAnimStateTransitionConditionExternalEvent, extractReferencedNodesFromAnimStateTransitionConditionIntFeature, extractReferencedNodesFromAnimStateTransitionConditionBoolFeature, extractReferencedNodesFromAnimStateTransitionInterpolatorBlend } from './NoReferenceExtractors'
import { extractReferencedNodesFromFloatClamp } from './FloatClampExtractor'
import { extractReferencedNodesFromFloatInterpolation } from './FloatInterpolationExtractor'
import { extractReferencedNodesFromBoolToFloatConverter } from './BoolToFloatConverterExtractor'
import { extractReferencedNodesFromIntToFloatConverter } from './IntToFloatConverterExtractor'
import { extractReferencedNodesFromMathExpressionFloat } from './MathExpressionFloatExtractor'
import { extractReferencedNodesFromMathExpressionVector } from './MathExpressionVectorExtractor'
import { extractReferencedNodesFromMathExpressionNodeData } from './MathExpressionNodeDataExtractor'
import { extractReferencedNodesFromAnimDatabase } from './AnimDatabaseExtractor'
import { extractReferencedNodesFromSkDurationAnim } from './SkDurationAnimExtractor'
import { extractReferencedNodesFromSkOneShotAnim } from './SkOneShotAnimExtractor'
import { extractReferencedNodesFromSkPhaseWithDurationAnim } from './SkPhaseWithDurationAnimExtractor'
import { extractReferencedNodesFromSkSpeedAnim } from './SkSpeedAnimExtractor'
import { extractReferencedNodesFromStagePoseEntry } from './StagePoseEntryExtractor'
import { extractReferencedNodesFromCriticalSpringDamp } from './CriticalSpringDampExtractor'
import { extractReferencedNodesFromSkipConsoleBegin } from './SkipConsoleBeginExtractor'
import { extractReferencedNodesFromSkipConsoleEnd } from './SkipConsoleEndExtractor'
import { extractReferencedNodesFromExpressionDataAny } from './ExpressionDataAnyExtractor'
import { extractReferencedNodesFromAnimStateTransitionConditionCompositeSimultaneous } from './AnimStateTransitionConditionCompositeSimultaneousExtractor'
import { extractReferencedNodesFromAnimStateMachineConditionalEntry } from './AnimStateMachineConditionalEntryExtractor'
import { extractReferencedNodesFromAnimStateTransitionDescription } from './AnimStateTransitionDescriptionExtractor'
import { extractReferencedNodesFromPoseLink } from './PoseLinkExtractor'
import { extractReferencedNodesFromFloatLink } from './FloatLinkExtractor'
import { extractReferencedNodesFromBoolLink } from './BoolLinkExtractor'
import { extractReferencedNodesFromIntLink } from './IntLinkExtractor'
import { extractReferencedNodesFromVectorLink } from './VectorLinkExtractor'

/**
 * Factory for getting the appropriate extractor function based on node type
 */
export class ExtractorFactory {
  private static extractors: Map<string, (data: any) => AnimgraphNode[]> = new Map([
    ['animAnimNode_Root', extractReferencedNodesFromRoot],
    ['animAnimNode_Blend2', extractReferencedNodesFromBlend2],
    ['animAnimNode_StateMachine', extractReferencedNodesFromStateMachine],
    ['animAnimNode_FloatMathOp', extractReferencedNodesFromFloatMathOp],
    ['animAnimNode_FloatComparator', extractReferencedNodesFromFloatComparator],
    ['animAnimNode_BlendAdditive', extractReferencedNodesFromBlendAdditive],
    ['animAnimNode_BlendMultiple', extractReferencedNodesFromBlendMultiple],
    ['animAnimNode_BlendOverride', extractReferencedNodesFromBlendOverride],
    ['animAnimNode_FloatJoin', extractReferencedNodesFromFloatJoin],
    ['animAnimNode_FloatLatch', extractReferencedNodesFromFloatLatch],
    ['animAnimNode_DampFloat', extractReferencedNodesFromDampFloat],
    ['animAnimNode_CurveFloatValue', extractReferencedNodesFromCurveFloatValue],
    ['animAnimNode_SpringDamp', extractReferencedNodesFromSpringDamp],
    ['animAnimNode_Switch', extractReferencedNodesFromSwitch],
    ['animAnimNode_State', extractReferencedNodesFromState],
    ['animAnimNode_StateFrozen', extractReferencedNodesFromStateFrozen],
    ['animAnimNode_TranslateBone', extractReferencedNodesFromTranslateBone],
    ['animAnimNode_SetBoneTransform', extractReferencedNodesFromSetBoneTransform],
    ['animAnimNode_SkFrameAnim', extractReferencedNodesFromSkFrameAnim],
    ['animAnimNode_Stage', extractReferencedNodesFromStage],
    ['animAnimNode_Join', extractReferencedNodesFromJoin],
    ['animAnimNode_Output', extractReferencedNodesFromOutput],
    ['animAnimNode_Timer', extractReferencedNodesFromTimer],
    ['animAnimNode_FloatInput', extractReferencedNodesFromFloatInput],
    ['animAnimNode_FloatConstant', extractReferencedNodesFromFloatConstant],
    ['animAnimNode_FloatVariable', extractReferencedNodesFromFloatVariable],
    ['animAnimNode_FloatRandom', extractReferencedNodesFromFloatRandom],
    ['animAnimNode_FloatClamp', extractReferencedNodesFromFloatClamp],
    ['animAnimNode_FloatInterpolation', extractReferencedNodesFromFloatInterpolation],
    ['animAnimNode_BoolInput', extractReferencedNodesFromBoolInput],
    ['animAnimNode_IntInput', extractReferencedNodesFromIntInput],
    ['animAnimNode_BoolToFloatConverter', extractReferencedNodesFromBoolToFloatConverter],
    ['animAnimNode_IntToFloatConverter', extractReferencedNodesFromIntToFloatConverter],
    ['animAnimNode_MathExpressionFloat', extractReferencedNodesFromMathExpressionFloat],
    ['animAnimNode_MathExpressionVector', extractReferencedNodesFromMathExpressionVector],
    ['animAnimNode_MathExpressionNodeData', extractReferencedNodesFromMathExpressionNodeData],
    ['animAnimNode_AnimDatabase', extractReferencedNodesFromAnimDatabase],
    ['animAnimNode_SkDurationAnim', extractReferencedNodesFromSkDurationAnim],
    ['animAnimNode_SkOneShotAnim', extractReferencedNodesFromSkOneShotAnim],
    ['animAnimNode_SkPhaseAnim', extractReferencedNodesFromSkPhaseAnim],
    ['animAnimNode_SkPhaseWithDurationAnim', extractReferencedNodesFromSkPhaseWithDurationAnim],
    ['animAnimNode_SkSpeedAnim', extractReferencedNodesFromSkSpeedAnim],
    ['animAnimNode_SkAnim', extractReferencedNodesFromSkAnim],
    ['animAnimNode_StagePoseEntry', extractReferencedNodesFromStagePoseEntry],
    ['animAnimNode_CriticalSpringDamp', extractReferencedNodesFromCriticalSpringDamp],
    ['animAnimNode_SkipConsoleBegin', extractReferencedNodesFromSkipConsoleBegin],
    ['animAnimNode_SkipConsoleEnd', extractReferencedNodesFromSkipConsoleEnd],
    ['animAnimNode_TagValue', extractReferencedNodesFromTagValue],
    ['animAnimNode_EventValue', extractReferencedNodesFromEventValue],
    ['animAnimNode_WrapperValue', extractReferencedNodesFromWrapperValue],
    ['animAnimNode_Event', extractReferencedNodesFromEvent],
    ['animAnimNode_Signal', extractReferencedNodesFromSignal],
    ['animAnimNode_IdentityPoseTerminator', extractReferencedNodesFromIdentityPoseTerminator],
    ['animPoseBlendMethod_BoneBranch', extractReferencedNodesFromPoseBlendMethodBoneBranch],
    ['animAnimNode_expressionData_any', extractReferencedNodesFromExpressionDataAny],
    ['animAnimStateTransitionCondition_HasAnimation', extractReferencedNodesFromAnimStateTransitionConditionHasAnimation],
    ['animAnimStateTransitionCondition_FloatFeature', extractReferencedNodesFromAnimStateTransitionConditionFloatFeature],
    ['animAnimStateTransitionCondition_FloatVariable', extractReferencedNodesFromAnimStateTransitionConditionFloatVariable],
    ['animAnimStateTransitionCondition_WrapperValue', extractReferencedNodesFromAnimStateTransitionConditionWrapperValue],
    ['animAnimStateTransitionCondition_AnimEnd', extractReferencedNodesFromAnimStateTransitionConditionAnimEnd],
    ['animAnimStateTransitionCondition_Timed', extractReferencedNodesFromAnimStateTransitionConditionTimed],
    ['animAnimStateTransitionCondition_IntEdgeToFeature', extractReferencedNodesFromAnimStateTransitionConditionIntEdgeToFeature],
    ['animAnimStateTransitionCondition_ExternalEvent', extractReferencedNodesFromAnimStateTransitionConditionExternalEvent],
    ['animAnimStateTransitionCondition_CompositeSimultaneous', extractReferencedNodesFromAnimStateTransitionConditionCompositeSimultaneous],
    ['animAnimStateTransitionCondition_IntFeature', extractReferencedNodesFromAnimStateTransitionConditionIntFeature],
    ['animAnimStateTransitionCondition_BoolFeature', extractReferencedNodesFromAnimStateTransitionConditionBoolFeature],
    ['animAnimStateMachineConditionalEntry', extractReferencedNodesFromAnimStateMachineConditionalEntry],
    ['animAnimStateTransitionInterpolator_Blend', extractReferencedNodesFromAnimStateTransitionInterpolatorBlend],
    ['animAnimStateTransitionDescription', extractReferencedNodesFromAnimStateTransitionDescription],
    ['animPoseLink', extractReferencedNodesFromPoseLink],
    ['animFloatLink', extractReferencedNodesFromFloatLink],
    ['animBoolLink', extractReferencedNodesFromBoolLink],
    ['animIntLink', extractReferencedNodesFromIntLink],
    ['animVectorLink', extractReferencedNodesFromVectorLink],
  ])

  /**
   * Get the appropriate extractor function for a given node type
   * @param nodeType - The type of the node
   * @returns Function that extracts referenced nodes from data, or null if no extractor found
   */
  static getExtractor(nodeType: string): ((data: any) => AnimgraphNode[]) | null {
    return this.extractors.get(nodeType) || null
  }

  /**
   * Extract referenced nodes using the appropriate extractor
   * @param data - The node data
   * @param nodeType - The type of the node
   * @returns Array of referenced nodes
   */
  static extractReferencedNodes(data: any, nodeType: string): AnimgraphNode[] {
    const extractor = this.getExtractor(nodeType)
    if (extractor) {
      return extractor(data)
    }
    
    // Default: return empty array if no extractor found
    console.warn(`No extractor found for node type: ${nodeType}`)
    return []
  }
}
