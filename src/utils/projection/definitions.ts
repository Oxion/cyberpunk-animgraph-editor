import type { NestedPinSpec, ProjectionDef } from './types'

const MATH_EXPRESSION_SOCKET_PINS: readonly NestedPinSpec[] = [
  {
    name: 'floatSockets',
    path: ['expressionData', 'floatSockets'],
    elementType: 'animAnimMathExpressionFloatSocket',
    linkType: 'animFloatLink',
    containerType: 'animMathExpressionNodeData',
  },
  {
    name: 'quaternionSockets',
    path: ['expressionData', 'quaternionSockets'],
    elementType: 'animAnimMathExpressionQuaternionSocket',
    linkType: 'animQuaternionLink',
    containerType: 'animMathExpressionNodeData',
  },
  {
    name: 'vectorSockets',
    path: ['expressionData', 'vectorSockets'],
    elementType: 'animAnimMathExpressionVectorSocket',
    linkType: 'animVectorLink',
    containerType: 'animMathExpressionNodeData',
  },
]

function mathExpressionProjection(): ProjectionDef {
  return { extraPins: MATH_EXPRESSION_SOCKET_PINS }
}

const AUX: ProjectionDef = { appearance: 'aux' }
const EMBEDDED: ProjectionDef = { appearance: 'embedded' }

export const PROJECTION_DEFINITIONS: Record<string, ProjectionDef> = {
  animAnimNode_MathExpressionFloat: mathExpressionProjection(),
  animAnimNode_MathExpressionVector: mathExpressionProjection(),
  animAnimNode_MathExpressionPose: mathExpressionProjection(),
  animAnimNode_MathExpressionQuaternion: mathExpressionProjection(),

  animPoseBlendMethod_BoneBranch: AUX,
  animPoseBlendMethod_Mask: AUX,
  animSyncMethodByProgress: AUX,
  animAnimStateTransitionCondition_AnimEnd: AUX,
  animAnimStateTransitionCondition_ExternalEvent: AUX,
  animAnimStateTransitionCondition_BoolFeature: AUX,
  animAnimStateTransitionCondition_AnimEvent: AUX,
  animAnimStateTransitionCondition_CompositeSimultaneous: {
    fields: { conditions: 'pin' },
  },
  animAnimStateMachineConditionalEntry: {
    appearance: 'aux',
    fields: { condition: 'pin' },
    wrap: 'DiagramConditionalEntryWrapper',
  },
  animAnimStateTransitionInterpolator_Blend: AUX,
  animAnimStateTransitionDescription: {
    appearance: 'aux',
    fields: { condition: 'pin', interpolator: 'pin' },
    wrap: 'DiagramTransitionWrapper',
  },
  animAnimNode_expressionData_any: { pins: ['expressionData'] },

  mathExprExpression: EMBEDDED,
  animAnimVariableContainer: EMBEDDED,
  animAnimVariableBool: EMBEDDED,
  animAnimVariableFloat: EMBEDDED,
  animAnimVariableInt: EMBEDDED,
  animAnimVariableVector: EMBEDDED,
  animPoseInfoLoggerEntry_FloatTrack: EMBEDDED,
  animAdditionalTransformEntry: EMBEDDED,

  animAnimNode_AimConstraint: {
    fields: { 
      upTransform: 'embed',
      targetTransforms: 'pin',
    },
  },
  animAnimNode_MultipleParentConstraint: {
    fields: {
      parentsTransform: 'embed',
      parentsWeight: 'embed',
    },
  },
  animAnimNode_OrientConstraint: {
    fields: {
      inputTransforms: 'pin',
    },
  },
  animAnimNode_ParentConstraint: {
    fields: {
      parentTransform: 'embed',
    },
  },
  animAnimNode_PointConstraint: {
    fields: {
      inputTransforms: 'pin',
    },
  },

  animAnimNodeSourceChannel_WeightedVector: {
    fields: {
      channel: 'embed',
    },
  },
  animAnimNodeSourceChannel_WeightedQuat: {
    fields: {
      channel: 'embed',
    },
  },

  animAnimNode_Ik2Constraint: {
    fields: {
      inputPoleVector: 'embed',
      inputTarget: 'embed',
    },
  },
  animAnimNode_StaticSwitch: {
    fields: {
      condition: 'embed',
    },
  }
}
