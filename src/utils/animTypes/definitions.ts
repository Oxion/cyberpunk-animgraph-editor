import type { AnimTypeDef } from './types'

/** Scalar / string field types (not in Codeware RTTI dump). */
const PRIMITIVE_TYPE_DEFINITIONS: Record<string, AnimTypeDef> = {
  bool01: { kind: 'bool01' },
  int: { kind: 'int' },
  float: { kind: 'float' },
  string: { kind: 'string' },
  cname: { kind: 'cname' },
  resourcePath: { kind: 'resourcePath' },
  object: { kind: 'object' },
  unknown: { kind: 'unknown' },
}

/** Engine structs referenced by RTTI fields but absent from Codeware export. */
const ENGINE_STRUCT_SUPPLEMENT: Record<string, AnimTypeDef> = {
  Vector3: {
    kind: 'struct',
    fields: [
      { key: 'X', type: 'float' },
      { key: 'Y', type: 'float' },
      { key: 'Z', type: 'float' },
    ],
  },
  Vector4: {
    kind: 'struct',
    fields: [
      { key: 'X', type: 'float' },
      { key: 'Y', type: 'float' },
      { key: 'Z', type: 'float' },
      { key: 'W', type: 'float' },
    ],
  },
  Quaternion: {
    kind: 'struct',
    fields: [
      { key: 'i', type: 'float' },
      { key: 'j', type: 'float' },
      { key: 'k', type: 'float' },
      { key: 'r', type: 'float' },
    ],
  },
  /** RED4 rRef / raRef JSON shape (`DepotPath` + `Flags`). */
  ResourceReferenceFlags: {
    kind: 'enum',
    values: ['Default', 'Soft', 'Embedded'],
  },
  ResourceReference: {
    kind: 'struct',
    fields: [
      { key: 'DepotPath', type: 'resourcePath' },
      { key: 'Flags', type: 'ResourceReferenceFlags' },
    ],
  },
}

/** RTTI animgraph types (classes, structs, enums). Generated from Codeware Imports. */
const RTTI_TYPE_DEFINITIONS: Record<string, AnimTypeDef> = {
  'IKChainSettings': {
    kind: 'struct',
    fields: [
    { key: 'chainName', type: 'cname' },
    { key: 'enableFloatTrack', type: 'cname' },
    { key: 'ikEndPointOffset', type: 'Vector3' },
    { key: 'ikEndRotationOffset', type: 'Quaternion' },
  ],
  },
  'ISerializable': {
    kind: 'class',
    fields: [],
  },
  'animLookAtPartInfo': {
    kind: 'struct',
    fields: [
    { key: 'partName', type: 'cname' },
    { key: 'defaultPositionBoneName', type: 'cname' },
  ],
  },
  'animLookAtPartsDependency': {
    kind: 'struct',
    fields: [
    { key: 'masterPart', type: 'cname' },
    { key: 'slavePart', type: 'cname' },
    { key: 'angle', type: 'float' },
    { key: 'speedToTargetFactor', type: 'float' },
    { key: 'speedToTargetByAngleCurve', type: 'CurveDataFloat' },
    { key: 'verticalPullSpeedFactor', type: 'float' },
    { key: 'verticalPullSpeedByAngleCurve', type: 'CurveDataFloat' },
    { key: 'horizontalPullSpeedFactor', type: 'float' },
    { key: 'horizontalPullSpeedByAngleCurve', type: 'CurveDataFloat' },
    { key: 'pullScaleBySquareSizeFactor', type: 'float' },
    { key: 'pullScaleBySquareSizeCurve', type: 'CurveDataFloat' },
    { key: 'innerSquareScale', type: 'float' },
    { key: 'innerSquareColor', type: 'Color' },
    { key: 'outerSquareColor', type: 'Color' },
  ],
  },
  'animLookAtStateMachineSettings': {
    kind: 'struct',
    fields: [
    { key: 'partName', type: 'cname' },
    { key: 'partAlias', type: 'cname' },
    { key: 'sphereAttachmentBone', type: 'cname' },
    { key: 'sphereRadius', type: 'float' },
    { key: 'followingSpeedFactor', type: 'float' },
    { key: 'followingSpeedByAngleCurve', type: 'CurveDataFloat' },
    { key: 'enableFloatTrack', type: 'cname' },
    { key: 'eyesOverrideFloatTrack', type: 'cname' },
    { key: 'transitionSpeedMultiplier', type: 'float' },
    { key: 'blendWeightPowFactor', type: 'float' },
    { key: 'coneLimitReached', type: 'cname' },
    { key: 'allowToBlendBehindBack', type: 'bool01' },
  ],
  },
  'Color': {
    kind: 'struct',
    fields: [
    { key: 'Red', type: 'int', range: { min: 0, max: 255, step: 1 } },
    { key: 'Green', type: 'int', range: { min: 0, max: 255, step: 1 } },
    { key: 'Blue', type: 'int', range: { min: 0, max: 255, step: 1 } },
    { key: 'Alpha', type: 'int', range: { min: 0, max: 255, step: 1 } },
  ],
  },
  'QsTransform': {
    kind: 'struct',
    fields: [
    { key: 'Translation', type: 'Vector4' },
    { key: 'Rotation', type: 'Quaternion' },
    { key: 'Scale', type: 'Vector4' },
  ],
  },
  'curveEInterpolationType': {
    kind: 'enum',
    values: ['Constant', 'Linear', 'BezierQuadratic', 'BezierCubic', 'Hermite'],
  },
  'curveESegmentsLinkType': {
    kind: 'enum',
    values: ['ESLT_Normal', 'ESLT_Smooth', 'ESLT_SmoothSymmetric'],
  },
  'CurveKeyFloat': {
    kind: 'struct',
    fields: [
    { key: 'Point', type: 'float' },
    { key: 'Value', type: 'float' },
  ],
  },
  'CurveDataFloat': {
    kind: 'struct',
    fields: [
    { key: 'InterpolationType', type: 'curveEInterpolationType' },
    { key: 'LinkType', type: 'curveESegmentsLinkType' },
    { key: 'Elements', type: { array: 'CurveKeyFloat' } },
  ],
  },
  'animAdditionalFloatTrackContainer': {
    kind: 'struct',
    fields: [
    { key: 'entries', type: { array: 'animAdditionalFloatTrackEntry' } },
    { key: 'overwriteExistingValues', type: 'bool01' },
  ],
  },
  'animAdditionalFloatTrackEntry': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [
    { key: 'name', type: 'cname' },
    { key: 'trackInfo', type: 'animFloatTrackInfo' },
    { key: 'values', type: 'CurveDataFloat' },
  ],
  },
  'animAdditionalTransformContainer': {
    kind: 'struct',
    fields: [
    { key: 'entries', type: { array: { ref: 'animAdditionalTransformEntry' } } },
  ],
  },
  'animAdditionalTransformEntry': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [
    { key: 'transformInfo', type: 'animTransformInfo' },
    { key: 'value', type: 'QsTransform' },
  ],
  },
  'animAnimDatabaseCollectionEntry': {
    kind: 'struct',
    fields: [
    { key: 'name', type: 'cname' },
    { key: 'animDatabase', type: 'ResourceReference' },
    { key: 'overrideAnimDatabase', type: 'ResourceReference' },
  ],
  },
  'animAnimFeatureEvent': {
    kind: 'struct',
    fields: [],
  },
  'animAnimFeatureUpdateWorkspot': {
    kind: 'class',
    parent: 'AnimFeature',
    fields: [
    { key: 'animName', type: 'cname' },
    { key: 'recordID', type: 'int' },
    { key: 'updateCounter', type: 'int' },
    { key: 'boolsAsFlags', type: 'int' },
    { key: 'animBlendTime', type: 'float' },
    { key: 'forcedBlendIn', type: 'float' },
    { key: 'forceAnimTime', type: 'float' },
    { key: 'timeScale', type: 'float' },
    { key: 'animationStartTime', type: 'float' },
    { key: 'isPaused', type: 'bool01' },
    { key: 'isLooped', type: 'bool01' },
    { key: 'isExitAnim', type: 'bool01' },
    { key: 'enableMotion', type: 'bool01' },
    { key: 'isActive', type: 'bool01' },
    { key: 'isAnimValid', type: 'bool01' },
    { key: 'slotNameHash', type: 'int' },
    { key: 'facialKeyWeight', type: 'float' },
    { key: 'facialIdleAnimation', type: 'cname' },
    { key: 'facialIdleKeyAnimation', type: 'cname' },
    { key: 'globalBlendDuration', type: 'float' },
    { key: 'globalBlendIn', type: 'bool01' },
  ],
  },
  'animAnimFeature_AIActionAnimation': {
    kind: 'class',
    parent: 'AnimFeature_AIAction',
    fields: [
    { key: 'animFeatureName', type: 'cname' },
  ],
  },
  'animAnimFeature_Crowd': {
    kind: 'class',
    parent: 'AnimFeature',
    fields: [
    { key: 'stopType', type: 'int' },
    { key: 'speedType', type: 'int' },
    { key: 'speedOverrideType', type: 'int' },
    { key: 'bumpDirection', type: 'int' },
    { key: 'threatSource', type: 'int' },
    { key: 'locomotionState', type: 'int' },
    { key: 'bumpSourceLocation', type: 'int' },
    { key: 'lookAtAngle', type: 'float' },
    { key: 'fearStage', type: 'int' },
    { key: 'startType', type: 'int' },
    { key: 'startDirectionAngle', type: 'float' },
    { key: 'animTime', type: 'float' },
    { key: 'isBlocked', type: 'bool01' },
    { key: 'bumpType', type: 'int' },
    { key: 'fleeType', type: 'int' },
    { key: 'randomVariation', type: 'float' },
    { key: 'animScale', type: 'float' },
    { key: 'slopeRatio', type: 'float' },
    { key: 'distanceToPlayer2D', type: 'float' },
    { key: 'angleToPlayer', type: 'float' },
  ],
  },
  'animAnimFeature_CrowdLocomotion': {
    kind: 'class',
    parent: 'AnimFeature',
    fields: [
    { key: 'speed', type: 'float' },
    { key: 'slopeAngle', type: 'float' },
    { key: 'isCrowd', type: 'bool01' },
  ],
  },
  'animAnimFeature_DangleExternalInput': {
    kind: 'class',
    parent: 'AnimFeature',
    fields: [
    { key: 'fictitiousAccelerationWs', type: 'Vector4' },
  ],
  },
  'animAnimFeature_EditorOnlyPredictiveLookAt': {
    kind: 'class',
    parent: 'AnimFeature',
    fields: [
    { key: 'isEnabled', type: 'bool01' },
    { key: 'target', type: 'Vector4' },
    { key: 'suppress', type: 'float' },
    { key: 'mode', type: 'int' },
  ],
  },
  'animAnimFeature_Interaction': {
    kind: 'class',
    parent: 'AnimFeature',
    fields: [
    { key: 'interactionDuration', type: 'float' },
    { key: 'interactionStage', type: 'int' },
  ],
  },
  'animAnimFeature_NPCExploration': {
    kind: 'class',
    parent: 'AnimFeature',
    fields: [
    { key: 'explorationType', type: 'int' },
    { key: 'state', type: 'int' },
    { key: 'movementType', type: 'int' },
    { key: 'isEvenLoop', type: 'bool01' },
    { key: 'playbackTime', type: 'float' },
  ],
  },
  'animAnimFeature_SmartObject': {
    kind: 'class',
    parent: 'AnimFeature',
    fields: [
    { key: 'state', type: 'int' },
    { key: 'privateAnimationName', type: 'cname' },
  ],
  },
  'animAnimFeature_VehiclePassengerAnimSetup': {
    kind: 'class',
    parent: 'AnimFeature',
    fields: [
    { key: 'enableAdditiveAnim', type: 'bool01' },
    { key: 'additiveScale', type: 'float' },
  ],
  },
  'animAnimFeature_WeaponUser': {
    kind: 'class',
    parent: 'AnimFeature',
    fields: [
    { key: 'ikLeftHandLocalPosition', type: 'Vector4' },
    { key: 'ikRightHandLocalPosition', type: 'Vector4' },
  ],
  },
  'animAnimGraph': {
    kind: 'class',
    parent: 'CResource',
    fields: [
    { key: 'rootNode', type: { ref: 'animAnimNode_Root' } },
    { key: 'variables', type: { ref: 'animAnimVariableContainer' } },
    { key: 'animFeatures', type: { array: 'animAnimFeatureEntry' } },
    { key: 'timeDeltaMultiplier', type: 'float' },
    { key: 'isPaused', type: 'bool01' },
    { key: 'oneFrameToggle', type: 'bool01' },
    { key: 'hasMixerSlot', type: 'bool01' },
    { key: 'additionalAnimDatabases', type: { array: 'animAnimDatabaseCollectionEntry' } },
    { key: 'nodesToInit', type: { array: { ref: 'animAnimNode_Base' } } },
    { key: 'useLunaticMode', type: 'bool01' },
    { key: 'useAnimCommands', type: 'bool01' },
    { key: 'useAnimCommandsForCrowd', type: 'bool01' },
    { key: 'useAnimStaticCommands', type: 'bool01' },
    { key: 'staticCommandsRig', type: 'ResourceReference' },
    { key: 'hackAlwaysSample', type: 'bool01' },
  ],
  },
  'animAnimGraphDebugState': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [
    { key: 'nodes', type: { array: 'animAnimNodeDebugState' } },
  ],
  },
  'animAnimGraphExternalEvent': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [
    { key: 'eventName', type: 'cname' },
  ],
  },
  'animAnimMathExpressionFloatSocket': {
    kind: 'struct',
    fields: [
    { key: 'link', type: 'animFloatLink' },
    { key: 'expressionVarId', type: 'int' },
    { key: 'inputFloatTrack', type: 'animNamedTrackIndex' },
  ],
  },
  'animAnimMathExpressionQuaternionSocket': {
    kind: 'struct',
    fields: [
    { key: 'link', type: 'animQuaternionLink' },
    { key: 'expressionVarId', type: 'int' },
  ],
  },
  'animAnimMathExpressionVectorSocket': {
    kind: 'struct',
    fields: [
    { key: 'link', type: 'animVectorLink' },
    { key: 'expressionVarId', type: 'int' },
  ],
  },
  'animAnimMultiBoolToFloatEntry': {
    kind: 'struct',
    fields: [
    { key: 'group', type: 'cname' },
    { key: 'name', type: 'cname' },
  ],
  },
  'animAnimNodeDebugState': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [
    { key: 'nodeId', type: 'int' },
    { key: 'active', type: 'bool01' },
  ],
  },
  'animAnimNodeSourceChannel_AnimFeatureQsTransform': {
    kind: 'class',
    parent: 'animIAnimNodeSourceChannel_QsTransform',
    fields: [],
  },
  'animAnimNodeSourceChannel_AnimFeatureQuat': {
    kind: 'class',
    parent: 'animIAnimNodeSourceChannel_Quat',
    fields: [],
  },
  'animAnimNodeSourceChannel_AnimFeatureVector': {
    kind: 'class',
    parent: 'animIAnimNodeSourceChannel_Vector',
    fields: [],
  },
  'animAnimNodeSourceChannel_FloatTrack': {
    kind: 'class',
    parent: 'animIAnimNodeSourceChannel_Float',
    fields: [
    { key: 'floatTrack', type: 'animNamedTrackIndex' },
    { key: 'useComplementValue', type: 'bool01' },
  ],
  },
  'animAnimNodeSourceChannel_OrientationVector': {
    kind: 'class',
    parent: 'animIAnimNodeSourceChannel_Vector',
    fields: [
    { key: 'transformIndex', type: 'animTransformIndex' },
    { key: 'inputTransformIndex', type: 'animTransformIndex' },
    { key: 'up', type: 'Vector3' },
  ],
  },
  'animAnimNodeSourceChannel_ReferenceTransformVector': {
    kind: 'class',
    parent: 'animIAnimNodeSourceChannel_Vector',
    fields: [
    { key: 'transformIndex', type: 'animTransformIndex' },
  ],
  },
  'animAnimNodeSourceChannel_SocketQsTransform': {
    kind: 'class',
    parent: 'animIAnimNodeSourceChannel_QsTransform',
    fields: [],
  },
  'animAnimNodeSourceChannel_SocketQuat': {
    kind: 'class',
    parent: 'animIAnimNodeSourceChannel_Quat',
    fields: [],
  },
  'animAnimNodeSourceChannel_SocketVector': {
    kind: 'class',
    parent: 'animIAnimNodeSourceChannel_Vector',
    fields: [],
  },
  'animAnimNodeSourceChannel_StaticQsTransform': {
    kind: 'class',
    parent: 'animIAnimNodeSourceChannel_QsTransform',
    fields: [
    { key: 'data', type: 'QsTransform' },
  ],
  },
  'animAnimNodeSourceChannel_StaticQuat': {
    kind: 'class',
    parent: 'animIAnimNodeSourceChannel_Quat',
    fields: [
    { key: 'data', type: 'Quaternion' },
  ],
  },
  'animAnimNodeSourceChannel_StaticVector': {
    kind: 'class',
    parent: 'animIAnimNodeSourceChannel_Vector',
    fields: [
    { key: 'data', type: 'Vector4' },
  ],
  },
  'animAnimNodeSourceChannel_TransformQsTransform': {
    kind: 'class',
    parent: 'animIAnimNodeSourceChannel_QsTransform',
    fields: [
    { key: 'transformIndex', type: 'animTransformIndex' },
  ],
  },
  'animAnimNodeSourceChannel_TransformQuat': {
    kind: 'class',
    parent: 'animIAnimNodeSourceChannel_Quat',
    fields: [
    { key: 'transformIndex', type: 'animTransformIndex' },
  ],
  },
  'animAnimNodeSourceChannel_TransformVector': {
    kind: 'class',
    parent: 'animIAnimNodeSourceChannel_Vector',
    fields: [
    { key: 'transformIndex', type: 'animTransformIndex' },
  ],
  },
  'animAnimNodeSourceChannel_WeightedQsTransform': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [
    { key: 'channel', type: { ref: 'animIAnimNodeSourceChannel_QsTransform' } },
    { key: 'weight', type: 'float' },
  ],
  },
  'animAnimNodeSourceChannel_WeightedQuat': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [
    { key: 'channel', type: { ref: 'animIAnimNodeSourceChannel_Quat' } },
    { key: 'weight', type: 'float' },
    { key: 'weightLink', type: 'animFloatLink' },
    { key: 'weightFloatTrack', type: 'animNamedTrackIndex' },
  ],
  },
  'animAnimNodeSourceChannel_WeightedVector': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [
    { key: 'channel', type: { ref: 'animIAnimNodeSourceChannel_Vector' } },
    { key: 'weight', type: 'float' },
    { key: 'weightLink', type: 'animFloatLink' },
    { key: 'weightFloatTrack', type: 'animNamedTrackIndex' },
  ],
  },
  'animAnimNode_AddIkRequest': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'ikChain', type: 'cname' },
    { key: 'targetBone', type: 'animTransformIndex' },
    { key: 'positionOffset', type: 'Vector3' },
    { key: 'rotationOffset', type: 'Quaternion' },
    { key: 'poleVector', type: 'animPoleVectorDetails' },
    { key: 'weightPosition', type: 'float' },
    { key: 'weightRotation', type: 'float' },
    { key: 'blendTimeIn', type: 'float' },
    { key: 'blendTimeOut', type: 'float' },
    { key: 'priority', type: 'int' },
  ],
  },
  'animAnimNode_AddSnapToTerrainIkRequest': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'animDeltaZ', type: 'animFloatLink' },
    { key: 'leftFootRequest', type: 'animSnapToTerrainIkRequest' },
    { key: 'rightFootRequest', type: 'animSnapToTerrainIkRequest' },
    { key: 'hipsRequest', type: 'animHipsIkRequest' },
  ],
  },
  'animAnimNode_AdditionalFloatTrack': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'poseInputNode', type: 'animPoseLink' },
    { key: 'additionalTracks', type: 'animAdditionalFloatTrackContainer' },
  ],
  },
  'animAnimNode_AdditionalTransform': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'additionalTransforms', type: 'animAdditionalTransformContainer' },
  ],
  },
  'animAnimNode_AimConstraint': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'areSourceChannelsResaved', type: 'bool01' },
    { key: 'targetTransforms', type: { array: { ref: 'animAnimNodeSourceChannel_WeightedVector' } } },
    { key: 'targetTransform', type: 'animTransformIndex' },
    { key: 'upTransform', type: { ref: 'animIAnimNodeSourceChannel_Vector' } },
    { key: 'transformIndex', type: 'animTransformIndex' },
    { key: 'forwardAxisLS', type: 'Vector3' },
    { key: 'upAxisLS', type: 'Vector3' },
    { key: 'weightMode', type: 'animConstraintWeightMode' },
    { key: 'weight', type: 'float' },
    { key: 'weightFloatTrack', type: 'animNamedTrackIndex' },
  ],
  },
  'animAnimNode_AimConstraint_ObjectRotationUp': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'targetTransform', type: 'animTransformIndex' },
    { key: 'upTransform', type: 'animTransformIndex' },
    { key: 'upTransformVector', type: 'Vector3' },
    { key: 'transformIndex', type: 'animTransformIndex' },
    { key: 'forwardAxisLS', type: 'Vector3' },
    { key: 'upAxisLS', type: 'Vector3' },
    { key: 'weightMode', type: 'animConstraintWeightMode' },
    { key: 'weight', type: 'float' },
    { key: 'weightFloatTrack', type: 'animNamedTrackIndex' },
  ],
  },
  'animAnimNode_AimConstraint_ObjectUp': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'targetTransform', type: 'animTransformIndex' },
    { key: 'upTransform', type: 'animTransformIndex' },
    { key: 'transformIndex', type: 'animTransformIndex' },
    { key: 'forwardAxisLS', type: 'Vector3' },
    { key: 'upAxisLS', type: 'Vector3' },
    { key: 'weightMode', type: 'animConstraintWeightMode' },
    { key: 'weight', type: 'float' },
    { key: 'weightFloatTrack', type: 'animNamedTrackIndex' },
  ],
  },
  'animAnimNode_AnimDatabase': {
    kind: 'class',
    parent: 'animAnimNode_SkPhaseWithDurationAnim',
    fields: [
    { key: 'animDataBase', type: 'animAnimDatabaseCollectionEntry' },
    { key: 'inputLinks', type: { array: 'animIntLink' } },
  ],
  },
  'animAnimNode_AnimSetTagValue': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'tags', type: 'redTagList' },
  ],
  },
  'animAnimNode_AnimSlot': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'inputLink', type: 'animPoseLink' },
  ],
  },
  'animAnimNode_ApplyCorrectivePoseRBF': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'rbfCoefficient', type: 'float' },
    { key: 'rbfPowValue', type: 'float' },
    { key: 'correctiveFrame', type: 'float' },
    { key: 'correctives', type: { array: 'animCorrectivePoseEntry' } },
  ],
  },
  'animAnimNode_Base': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [
    { key: 'id', type: 'int' },
  ],
  },
  'animAnimNode_BaseSwitch': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'blendTime', type: 'float' },
    { key: 'timeWarpingEnabled', type: 'bool01' },
    { key: 'syncMethod', type: { ref: 'animISyncMethod' } },
    { key: 'inputNodes', type: { array: 'animPoseLink' } },
    { key: 'canRequestInertialization', type: 'bool01' },
  ],
  },
  'animAnimNode_Blend2': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'minInputValue', type: 'float' },
    { key: 'maxInputValue', type: 'float' },
    { key: 'timeWarpingEnabled', type: 'bool01' },
    { key: 'syncMethod', type: { ref: 'animISyncMethod' } },
    { key: 'firstInputNode', type: 'animPoseLink' },
    { key: 'secondInputNode', type: 'animPoseLink' },
    { key: 'weightNode', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_BlendAdditive': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'biasValue', type: 'float' },
    { key: 'scaleValue', type: 'float' },
    { key: 'additiveType', type: 'animEAnimGraphAdditiveType' },
    { key: 'timeWarpingEnabled', type: 'bool01' },
    { key: 'blendTracks', type: 'animEBlendTracksMode' },
    { key: 'syncMethod', type: { ref: 'animISyncMethod' } },
    { key: 'inputNode', type: 'animPoseLink' },
    { key: 'addedInputNode', type: 'animPoseLink' },
    { key: 'weightNode', type: 'animFloatLink' },
    { key: 'postProcess', type: { ref: 'animIAnimNode_PostProcess' } },
    { key: 'weightPreviousFrameFloatTrack', type: 'animNamedTrackIndex' },
    { key: 'weightPreviousFrameFloatTrackDefaultValue', type: 'float' },
    { key: 'maskName', type: 'cname' },
  ],
  },
  'animAnimNode_BlendByMaskDynamic': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'base', type: 'animPoseLink' },
    { key: 'blend', type: 'animPoseLink' },
    { key: 'mask', type: 'animIntLink' },
    { key: 'weight', type: 'animFloatLink' },
    { key: 'masks', type: { array: 'cname' } },
    { key: 'syncMethod', type: { ref: 'animISyncMethod' } },
  ],
  },
  'animAnimNode_BlendFromPose': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'blendTime', type: 'float' },
    { key: 'blendType', type: 'animEBlendTypeLBC' },
    { key: 'customBlendCurve', type: 'CurveDataFloat' },
    { key: 'mode', type: 'animEBlendFromPoseMode' },
    { key: 'requestedByTag', type: 'cname' },
  ],
  },
  'animAnimNode_BlendMultiple': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'inputValues', type: { array: 'float' } },
    { key: 'sortedInputValues', type: { array: 'float' } },
    { key: 'minWeight', type: 'float' },
    { key: 'maxWeight', type: 'float' },
    { key: 'radialBlending', type: 'bool01' },
    { key: 'timeWarpingEnabled', type: 'bool01' },
    { key: 'syncMethod', type: { ref: 'animISyncMethod' } },
    { key: 'motionProvider', type: { ref: 'animIMotionTableProvider' } },
    { key: 'weightNode', type: 'animFloatLink' },
    { key: 'inputNodes', type: { array: 'animPoseLink' } },
  ],
  },
  'animAnimNode_BlendOverride': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'inputNode', type: 'animPoseLink' },
    { key: 'overrideInputNode', type: 'animPoseLink' },
    { key: 'weightNode', type: 'animFloatLink' },
    { key: 'bones', type: { array: 'animOverrideBlendBoneInfo' } },
    { key: 'blendAllTracks', type: 'bool01' },
    { key: 'blendTrackMode', type: 'animEBlendTracksMode' },
    { key: 'tracks', type: { array: 'animOverrideBlendTrackInfo' } },
    { key: 'getDeltaMotionFromOverride', type: 'bool01' },
    { key: 'timeWarpingEnabled', type: 'bool01' },
    { key: 'syncMethod', type: { ref: 'animISyncMethod' } },
    { key: 'blendMethod', type: { ref: 'animIPoseBlendMethod' } },
    { key: 'postProcess', type: { ref: 'animIAnimNode_PostProcess' } },
  ],
  },
  'animAnimNode_BlendSpace': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'inputLinks', type: { array: 'animFloatLink' } },
    { key: 'blendSpace', type: 'animAnimNode_BlendSpace_InternalsBlendSpace' },
    { key: 'progressLink', type: 'animFloatLink' },
    { key: 'fireAnimEndEvent', type: 'bool01' },
    { key: 'animEndEventName', type: 'cname' },
    { key: 'isLooped', type: 'bool01' },
  ],
  },
  'animAnimNode_BlendSpace_InternalsBlendSpace': {
    kind: 'struct',
    fields: [
    { key: 'spaceDimension', type: 'int' },
    { key: 'coordinatesDescriptions', type: { array: 'animAnimNode_BlendSpace_InternalsBlendSpaceCoordinateDescription' } },
    { key: 'spacePoints', type: { array: 'animAnimNode_BlendSpace_InternalsBlendSpacePoint' } },
    { key: 'boundaryPointsCount', type: 'int' },
    { key: 'fireAnimEndEvent', type: 'bool01' },
    { key: 'animEndEventName', type: 'cname' },
    { key: 'isLooped', type: 'bool01' },
    { key: 'needsRuntimeTriangulation', type: 'bool01' },
    { key: 'wasRuntimeTriangulationResaveDone', type: 'bool01' },
    { key: 'cachedSpacePoints_coordinates', type: { array: 'float' } },
    { key: 'cachedSpaceSimplexes_pointsIndices', type: { array: 'int' } },
    { key: 'cachedSamplesForGridPoints_simplexIndex', type: { array: 'int' } },
    { key: 'cachedSamplesForGridPoints_weightsForPoints', type: { array: 'float' } },
  ],
  },
  'animAnimNode_BlendSpace_InternalsBlendSpaceCoordinateDescription': {
    kind: 'struct',
    fields: [
    { key: 'name', type: 'cname' },
    { key: 'minValue', type: 'float' },
    { key: 'maxValue', type: 'float' },
    { key: 'gridDivisionsCount', type: 'int' },
  ],
  },
  'animAnimNode_BlendSpace_InternalsBlendSpacePoint': {
    kind: 'struct',
    fields: [
    { key: 'animationName', type: 'cname' },
    { key: 'useFixedCoordinates', type: 'bool01' },
    { key: 'fixedCoordinates', type: { array: 'float' } },
    { key: 'useStaticPose', type: 'bool01' },
    { key: 'staticPoseTime', type: 'float' },
    { key: 'staticPoseProgress', type: 'float' },
  ],
  },
  'animAnimNode_BoolConstant': {
    kind: 'class',
    parent: 'animAnimNode_BoolValue',
    fields: [
    { key: 'value', type: 'bool01' },
  ],
  },
  'animAnimNode_BoolInput': {
    kind: 'class',
    parent: 'animAnimNode_BoolValue',
    fields: [
    { key: 'group', type: 'cname' },
    { key: 'name', type: 'cname' },
  ],
  },
  'animAnimNode_BoolJoin': {
    kind: 'class',
    parent: 'animAnimNode_BoolValue',
    fields: [
    { key: 'input', type: 'animBoolLink' },
  ],
  },
  'animAnimNode_BoolLatch': {
    kind: 'class',
    parent: 'animAnimNode_BoolValue',
    fields: [
    { key: 'input', type: 'animBoolLink' },
  ],
  },
  'animAnimNode_BoolToFloatConverter': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'inputNode', type: 'animBoolLink' },
  ],
  },
  'animAnimNode_BoolValue': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [],
  },
  'animAnimNode_BoolVariable': {
    kind: 'class',
    parent: 'animAnimNode_BoolValue',
    fields: [
    { key: 'variableName', type: 'cname' },
  ],
  },
  'animAnimNode_ConditionalSegmentBegin': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'condition', type: 'animConditionalSegmentCondition' },
  ],
  },
  'animAnimNode_ConditionalSegmentEnd': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [],
  },
  'animAnimNode_ConeLimit': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'coneTransform', type: 'animTransformIndex' },
    { key: 'constrainedTransform', type: 'animTransformIndex' },
    { key: 'coneAxisLs', type: 'Vector3' },
    { key: 'coneAxisNormalizedLs', type: 'Vector3' },
    { key: 'coneOffsetMs', type: 'Vector3' },
    { key: 'coneOffsetMsLink', type: 'animVectorLink' },
    { key: 'marginEaseOutCurve', type: 'CurveDataFloat' },
    { key: 'limit1', type: 'float' },
    { key: 'limit1Link', type: 'animFloatLink' },
    { key: 'limit1FloatTrack', type: 'animNamedTrackIndex' },
    { key: 'paraboloidRadius1', type: 'float' },
    { key: 'limit2', type: 'float' },
    { key: 'limit2Link', type: 'animFloatLink' },
    { key: 'limit2FloatTrack', type: 'animNamedTrackIndex' },
    { key: 'paraboloidRadius2', type: 'float' },
    { key: 'limit3', type: 'float' },
    { key: 'limit3Link', type: 'animFloatLink' },
    { key: 'limit3FloatTrack', type: 'animNamedTrackIndex' },
    { key: 'paraboloidRadius3', type: 'float' },
    { key: 'limit4', type: 'float' },
    { key: 'limit4Link', type: 'animFloatLink' },
    { key: 'limit4FloatTrack', type: 'animNamedTrackIndex' },
    { key: 'paraboloidRadius4', type: 'float' },
    { key: 'coneLimitReached', type: 'animNamedTrackIndex' },
    { key: 'debug', type: 'bool01' },
    { key: 'colorfulCone', type: 'bool01' },
    { key: 'applyDebugConeScalling', type: 'bool01' },
  ],
  },
  'animAnimNode_Container': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'nodes', type: { array: { ref: 'animAnimNode_Base' } } },
  ],
  },
  'animAnimNode_CoordinateFromVector': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'vectorCoodrinateType', type: 'animVectorCoordinateType' },
    { key: 'input', type: 'animVectorLink' },
  ],
  },
  'animAnimNode_CriticalSpringDamp': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'smoothTime', type: 'float' },
    { key: 'useRange', type: 'bool01' },
    { key: 'rangeMin', type: 'float' },
    { key: 'rangeMax', type: 'float' },
    { key: 'useRawTime', type: 'bool01' },
    { key: 'inputNode', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_CurveFloatValue': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'curveData', type: 'CurveDataFloat' },
    { key: 'argument', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_CurvePathSlot': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'input', type: 'animPoseLink' },
  ],
  },
  'animAnimNode_CurveVectorValue': {
    kind: 'class',
    parent: 'animAnimNode_VectorValue',
    fields: [
    { key: 'curveData', type: 'CurveDataVector4' },
    { key: 'argument', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_DampFloat': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'defaultIncreaseSpeed', type: 'float' },
    { key: 'defaultDecreaseSpeed', type: 'float' },
    { key: 'startFromDefaultValue', type: 'bool01' },
    { key: 'defaultInitialValue', type: 'float' },
    { key: 'wrapAroundRange', type: 'bool01' },
    { key: 'rangeMin', type: 'float' },
    { key: 'rangeMax', type: 'float' },
    { key: 'inputNode', type: 'animFloatLink' },
    { key: 'increaseSpeedNode', type: 'animFloatLink' },
    { key: 'decreaseSpeedNode', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_DampQuaternion': {
    kind: 'class',
    parent: 'animAnimNode_QuaternionValue',
    fields: [
    { key: 'defaultRotationSpeed', type: 'float' },
    { key: 'defaultInitialValue', type: 'EulerAngles' },
    { key: 'inputNode', type: 'animQuaternionLink' },
    { key: 'initialValueNode', type: 'animQuaternionLink' },
    { key: 'rotationSpeedNode', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_DampVector': {
    kind: 'class',
    parent: 'animAnimNode_VectorValue',
    fields: [
    { key: 'defaultIncreaseSpeed', type: 'Vector4' },
    { key: 'defaultDecreaseSpeed', type: 'Vector4' },
    { key: 'startFromDefaultValue', type: 'bool01' },
    { key: 'defaultInitialValue', type: 'Vector4' },
    { key: 'inputNode', type: 'animVectorLink' },
    { key: 'increaseSpeedNode', type: 'animVectorLink' },
    { key: 'decreaseSpeedNode', type: 'animVectorLink' },
  ],
  },
  'animAnimNode_Dangle': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'dangleConstraint', type: { ref: 'animDangleConstraint_Simulation' } },
  ],
  },
  'animAnimNode_DirectConnConstraint': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'sourceTransform', type: { ref: 'animIAnimNodeSourceChannel_QsTransform' } },
    { key: 'isSourceTransformResaved', type: 'bool01' },
    { key: 'sourceTransformIndex', type: 'animTransformIndex' },
    { key: 'transformIndex', type: 'animTransformIndex' },
    { key: 'posX', type: 'bool01' },
    { key: 'posY', type: 'bool01' },
    { key: 'posZ', type: 'bool01' },
    { key: 'rotX', type: 'bool01' },
    { key: 'rotY', type: 'bool01' },
    { key: 'rotZ', type: 'bool01' },
    { key: 'scaleX', type: 'bool01' },
    { key: 'scaleY', type: 'bool01' },
    { key: 'scaleZ', type: 'bool01' },
    { key: 'weight', type: 'float' },
    { key: 'weightNode', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_DirectionToEuler': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'inputNode', type: 'animVectorLink' },
    { key: 'initialForwardVector', type: 'Vector4' },
    { key: 'conversionType', type: 'animEDirectionToEuler' },
  ],
  },
  'animAnimNode_DisableLunaticMode': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [],
  },
  'animAnimNode_DisableSleepMode': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'forceUpdate', type: 'bool01' },
  ],
  },
  'animAnimNode_Drag': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'sourceBone', type: 'animTransformIndex' },
    { key: 'outTargetBone', type: 'animTransformIndex' },
    { key: 'simulationFps', type: 'float' },
    { key: 'sourceSpeedMultiplier', type: 'float' },
    { key: 'hasOvershoot', type: 'bool01' },
    { key: 'overshootDuration', type: 'float' },
    { key: 'overshootDetectionMinSpeed', type: 'float' },
    { key: 'overshootDetectionMaxSpeed', type: 'float' },
    { key: 'useSteps', type: 'bool01' },
    { key: 'stepsTargetSpeedMultiplier', type: 'float' },
    { key: 'timeBetweenSteps', type: 'float' },
    { key: 'timeInStep', type: 'float' },
  ],
  },
  'animAnimNode_EnumSwitch': {
    kind: 'class',
    parent: 'animAnimNode_InputSwitch',
    fields: [
    { key: 'enumName', type: 'cname' },
  ],
  },
  'animAnimNode_Event': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'eventName', type: 'cname' },
    { key: 'defaultValue', type: 'float' },
    { key: 'eventValue', type: 'float' },
  ],
  },
  'animAnimNode_EventValue': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'eventName', type: 'cname' },
    { key: 'defaultValue', type: 'float' },
  ],
  },
  'animAnimNode_ExplorationAdjuster': {
    kind: 'class',
    parent: 'animAnimNode_MotionAdjuster',
    fields: [
    { key: 'targetPosition2', type: 'animVectorLink' },
    { key: 'targetDirection2', type: 'animVectorLink' },
    { key: 'totalTimeToAdjust2', type: 'animFloatLink' },
    { key: 'targetPosition3', type: 'animVectorLink' },
    { key: 'targetDirection3', type: 'animVectorLink' },
    { key: 'totalTimeToAdjust3', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_EyesLookAt': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'targetALink', type: 'animVectorLink' },
    { key: 'weightALink', type: 'animFloatLink' },
    { key: 'targetBLink', type: 'animVectorLink' },
    { key: 'weightBLink', type: 'animFloatLink' },
    { key: 'transitionWeightLink', type: 'animFloatLink' },
    { key: 'leftEye', type: 'animTransformIndex' },
    { key: 'rightEye', type: 'animTransformIndex' },
    { key: 'head', type: 'animTransformIndex' },
    { key: 'forwardDirection', type: 'animAxis' },
  ],
  },
  'animAnimNode_EyesReset': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [],
  },
  'animAnimNode_EyesTracksLookAt': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'eyeTransform', type: 'animTransformIndex' },
    { key: 'leftTrack', type: 'animNamedTrackIndex' },
    { key: 'rightTrack', type: 'animNamedTrackIndex' },
    { key: 'upTrack', type: 'animNamedTrackIndex' },
    { key: 'downTrack', type: 'animNamedTrackIndex' },
    { key: 'debug', type: 'bool01' },
  ],
  },
  'animAnimNode_FPPCamera': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [],
  },
  'animAnimNode_FPPCameraSharedVar': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [],
  },
  'animAnimNode_FacialMixerSlot': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'lookAtDefinitions', type: { array: 'animLookAtAnimationDefinition' } },
  ],
  },
  'animAnimNode_FacialSharedMetaPose': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [],
  },
  'animAnimNode_FloatClamp': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'min', type: 'float' },
    { key: 'max', type: 'float' },
    { key: 'inputNode', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_FloatComparator': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'firstValue', type: 'float' },
    { key: 'secondValue', type: 'float' },
    { key: 'trueValue', type: 'float' },
    { key: 'falseValue', type: 'float' },
    { key: 'operation', type: 'animEAnimGraphCompareFunc' },
    { key: 'firstInputLink', type: 'animFloatLink' },
    { key: 'secondInputLink', type: 'animFloatLink' },
    { key: 'trueInputLink', type: 'animFloatLink' },
    { key: 'falseInputLink', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_FloatConstant': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'value', type: 'float' },
  ],
  },
  'animAnimNode_FloatCumulative': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'clamp', type: 'bool01' },
    { key: 'resetOnActivation', type: 'bool01' },
    { key: 'normalize180', type: 'bool01' },
    { key: 'defaultValue', type: 'float' },
    { key: 'resetExternalEventName', type: 'cname' },
    { key: 'inputNode', type: 'animFloatLink' },
    { key: 'minValue', type: 'animFloatLink' },
    { key: 'maxValue', type: 'animFloatLink' },
    { key: 'resetSpeed', type: 'animFloatLink' },
    { key: 'override', type: 'animBoolLink' },
    { key: 'curValue', type: 'animFloatLink' },
    { key: 'normalize180Input', type: 'animBoolLink' },
  ],
  },
  'animAnimNode_FloatInput': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'group', type: 'cname' },
    { key: 'name', type: 'cname' },
  ],
  },
  'animAnimNode_FloatInterpolation': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'x1', type: 'float' },
    { key: 'x2', type: 'float' },
    { key: 'y1', type: 'float' },
    { key: 'y2', type: 'float' },
    { key: 'interpolationType', type: 'animEAnimGraphMathInterpolation' },
    { key: 'inputNode', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_FloatJoin': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'input', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_FloatLatch': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'input', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_FloatMathOp': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'operationType', type: 'animEAnimGraphMathOp' },
    { key: 'firstInputNode', type: 'animFloatLink' },
    { key: 'secondInputNode', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_FloatRandom': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'rand', type: 'bool01' },
    { key: 'cooldown', type: 'float' },
    { key: 'min', type: 'float' },
    { key: 'max', type: 'float' },
  ],
  },
  'animAnimNode_FloatTimeDependentSinus': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'min', type: 'float' },
    { key: 'max', type: 'float' },
    { key: 'frequencyFactor', type: 'float' },
    { key: 'phaseFactor', type: 'float' },
  ],
  },
  'animAnimNode_FloatToBoolConverter': {
    kind: 'class',
    parent: 'animAnimNode_BoolValue',
    fields: [
    { key: 'inputNode', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_FloatToIntConverter': {
    kind: 'class',
    parent: 'animAnimNode_IntValue',
    fields: [
    { key: 'inputNode', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_FloatTrackDirectConnConstraint': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'floatTrackIndex', type: 'animNamedTrackIndex' },
    { key: 'transformIndex', type: 'animTransformIndex' },
    { key: 'channel', type: 'animTransformChannel' },
    { key: 'mulFactor', type: 'float' },
    { key: 'weight', type: 'float' },
    { key: 'weightNode', type: 'animFloatLink' },
    { key: 'mulFactorNode', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_FloatTrackModifier': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'floatTrack', type: 'animNamedTrackIndex' },
    { key: 'operationType', type: 'animFloatTrackOperationType' },
    { key: 'inputFloatTrack', type: 'animNamedTrackIndex' },
    { key: 'poseInputNode', type: 'animPoseLink' },
    { key: 'floatInputNode', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_FloatTrackModifierMarkUnstable': {
    kind: 'class',
    parent: 'animAnimNode_FloatTrackModifier',
    fields: [
    { key: 'requiredQualityDistanceCategory', type: 'int' },
  ],
  },
  'animAnimNode_FloatValue': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [],
  },
  'animAnimNode_FloatValueDebugProvider': {
    kind: 'struct',
    fields: [
    { key: 'isEnabled', type: 'bool01' },
    { key: 'min', type: 'float' },
    { key: 'max', type: 'float' },
    { key: 'progress', type: 'float' },
    { key: 'auto', type: 'bool01' },
    { key: 'speed', type: 'float' },
    { key: 'wrap', type: 'bool01' },
  ],
  },
  'animAnimNode_FloatVariable': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'variableName', type: 'cname' },
  ],
  },
  'animAnimNode_FloorIk': {
    kind: 'class',
    parent: 'animAnimNode_FloorIkBase',
    fields: [
    { key: 'pelvis', type: 'animSBehaviorConstraintNodeFloorIKVerticalBoneData' },
    { key: 'legs', type: 'animSBehaviorConstraintNodeFloorIKLegsData' },
    { key: 'leftLegIK', type: 'animSTwoBonesIKSolverData' },
    { key: 'rightLegIK', type: 'animSTwoBonesIKSolverData' },
  ],
  },
  'animAnimNode_FloorIkBase': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'requiredAnimEvent', type: 'cname' },
    { key: 'blockAnimEvent', type: 'cname' },
    { key: 'canBeDisabledDueToFrameRate', type: 'bool01' },
    { key: 'useFixedVersion', type: 'bool01' },
    { key: 'slopeAngleDamp', type: 'float' },
    { key: 'common', type: 'animSBehaviorConstraintNodeFloorIKCommonData' },
  ],
  },
  'animAnimNode_FootStepAdjuster': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'leftToeName', type: 'animTransformIndex' },
    { key: 'rightToeName', type: 'animTransformIndex' },
    { key: 'leftFootName', type: 'animTransformIndex' },
    { key: 'rightFootName', type: 'animTransformIndex' },
    { key: 'leftCalfName', type: 'animTransformIndex' },
    { key: 'rightCalfName', type: 'animTransformIndex' },
    { key: 'leftThighName', type: 'animTransformIndex' },
    { key: 'rightThighName', type: 'animTransformIndex' },
    { key: 'pelvisBoneName', type: 'animTransformIndex' },
    { key: 'calfHingeAxis', type: 'Vector4' },
    { key: 'IKBlendTime', type: 'float' },
    { key: 'pelvisAdjustmentBlendSpeed', type: 'float' },
    { key: 'adjustPelvisVertically', type: 'bool01' },
    { key: 'stepAdjustmentInterval', type: 'float' },
    { key: 'controlValueNode', type: 'animFloatLink' },
    { key: 'controlVectorNode', type: 'animVectorLink' },
  ],
  },
  'animAnimNode_FootStepScaling': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'hipsIndex', type: 'animTransformIndex' },
    { key: 'leftFootIKIndex', type: 'animTransformIndex' },
    { key: 'rightFootIKIndex', type: 'animTransformIndex' },
    { key: 'inputSpeed', type: 'animFloatLink' },
    { key: 'weight', type: 'animFloatLink' },
    { key: 'Params', type: 'animfssBodyOfflineParams' },
  ],
  },
  'animAnimNode_ForegroundSegmentBegin': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [],
  },
  'animAnimNode_ForegroundSegmentEnd': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'isAlwaysEnabledForHighEndHardware', type: 'bool01' },
  ],
  },
  'animAnimNode_FrozenFrame': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'maxFramesFrozen', type: 'int' },
    { key: 'triggerEventName', type: 'cname' },
    { key: 'clearEventName', type: 'cname' },
  ],
  },
  'animAnimNode_GenerateIkAnimFeatureData': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'ikChainSettings', type: { array: 'IKChainSettings' } },
  ],
  },
  'animAnimNode_GraphSlot': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'name', type: 'cname' },
    { key: 'dontDeactivateInput', type: 'bool01' },
    { key: 'inputLink', type: 'animPoseLink' },
  ],
  },
  'animAnimNode_GraphSlotConditions': {
    kind: 'class',
    parent: 'animAnimNode_GraphSlot',
    fields: [
    { key: 'conditions', type: { array: 'animGraphSlotCondition' } },
  ],
  },
  'animAnimNode_GraphSlotInput': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [],
  },
  'animAnimNode_GraphSlot_Test': {
    kind: 'class',
    parent: 'animAnimNode_GraphSlot',
    fields: [
    { key: 'graph_TEST', type: 'ResourceReference' },
    { key: 'copyAnimInputsAtAttachTime', type: 'bool01' },
  ],
  },
  'animAnimNode_HumanIk': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'ikTargetsControllers', type: { array: 'animTEMP_IKTargetsControllerBodyType' } },
  ],
  },
  'animAnimNode_IdentityPoseTerminator': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [],
  },
  'animAnimNode_Ik2': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'firstBone', type: 'animTransformIndex' },
    { key: 'secondBone', type: 'animTransformIndex' },
    { key: 'endBone', type: 'animTransformIndex' },
    { key: 'hingeAxis', type: 'animAxis' },
    { key: 'minHingeAngleDegrees', type: 'float' },
    { key: 'maxHingeAngleDegrees', type: 'float' },
    { key: 'firstBoneIkGain', type: 'float' },
    { key: 'secondBoneIkGain', type: 'float' },
    { key: 'endBoneIkGain', type: 'float' },
    { key: 'enforceEndPosition', type: 'bool01' },
    { key: 'enforceEndOrientation', type: 'bool01' },
    { key: 'endBoneOffsetPositionLS', type: 'Vector4' },
    { key: 'bone', type: 'animTransformIndex' },
    { key: 'floatTrack', type: 'animNamedTrackIndex' },
    { key: 'inputPoseNode', type: 'animPoseLink' },
    { key: 'weightNode', type: 'animFloatLink' },
    { key: 'endTargetPositionNode', type: 'animVectorLink' },
    { key: 'endTargetOrientationNode', type: 'animQuaternionLink' },
  ],
  },
  'animAnimNode_Ik2Constraint': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'inputTarget', type: { ref: 'animIAnimNodeSourceChannel_Vector' } },
    { key: 'inputPoleVector', type: { ref: 'animIAnimNodeSourceChannel_Vector' } },
    { key: 'inputTargetOrientation', type: { ref: 'animAnimNodeSourceChannel_WeightedQuat' } },
    { key: 'firstBoneIndex', type: 'animTransformIndex' },
    { key: 'secondBoneIndex', type: 'animTransformIndex' },
    { key: 'endBoneIndex', type: 'animTransformIndex' },
    { key: 'hingeAxis', type: 'animAxis' },
    { key: 'twistValue', type: 'float' },
    { key: 'weight', type: 'float' },
    { key: 'weightFloatTrack', type: 'animNamedTrackIndex' },
    { key: 'weightNode', type: 'animFloatLink' },
    { key: 'twistNode', type: 'animFloatLink' },
    { key: 'maxHingeAngle', type: 'float' },
  ],
  },
  'animAnimNode_Inertialization': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'safeMode', type: 'bool01' },
    { key: 'transformsCountUpperBound', type: 'int' },
    { key: 'tracksCountUpperBound', type: 'int' },
    { key: 'rotationLimits', type: { array: 'animInertializationRotationLimit' } },
  ],
  },
  'animAnimNode_InputSwitch': {
    kind: 'class',
    parent: 'animAnimNode_BaseSwitch',
    fields: [
    { key: 'selectIntNode', type: 'animIntLink' },
    { key: 'selectFloatNode', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_IntConstant': {
    kind: 'class',
    parent: 'animAnimNode_IntValue',
    fields: [
    { key: 'value', type: 'int' },
  ],
  },
  'animAnimNode_IntInput': {
    kind: 'class',
    parent: 'animAnimNode_IntValue',
    fields: [
    { key: 'group', type: 'cname' },
    { key: 'name', type: 'cname' },
  ],
  },
  'animAnimNode_IntJoin': {
    kind: 'class',
    parent: 'animAnimNode_IntValue',
    fields: [
    { key: 'input', type: 'animIntLink' },
  ],
  },
  'animAnimNode_IntLatch': {
    kind: 'class',
    parent: 'animAnimNode_IntValue',
    fields: [
    { key: 'input', type: 'animIntLink' },
  ],
  },
  'animAnimNode_IntToFloatConverter': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'inputNode', type: 'animIntLink' },
  ],
  },
  'animAnimNode_IntValue': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [],
  },
  'animAnimNode_IntVariable': {
    kind: 'class',
    parent: 'animAnimNode_IntValue',
    fields: [
    { key: 'variableName', type: 'cname' },
  ],
  },
  'animAnimNode_Join': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'input', type: 'animPoseLink' },
  ],
  },
  'animAnimNode_LODBegin': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'levelOfDetail', type: 'int' },
  ],
  },
  'animAnimNode_LODEnd': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'inputLink', type: 'animPoseLink' },
  ],
  },
  'animAnimNode_LocoState': {
    kind: 'class',
    parent: 'animAnimNode_State',
    fields: [
    { key: 'type', type: 'animLocoStateType' },
    { key: 'locoTag', type: 'cname' },
  ],
  },
  'animAnimNode_LocomotionAdjuster': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'targetPosition', type: 'animVectorLink' },
    { key: 'targetDirection', type: 'animVectorLink' },
    { key: 'initialForwardVector', type: 'Vector4' },
    { key: 'blendSpeedPos', type: 'float' },
    { key: 'blendSpeedPosMin', type: 'float' },
    { key: 'blendSpeedRot', type: 'float' },
    { key: 'maxDistance', type: 'float' },
  ],
  },
  'animAnimNode_LocomotionAdjusterOnEvent': {
    kind: 'class',
    parent: 'animAnimNode_LocomotionAdjuster',
    fields: [
    { key: 'locomotionFeatureName', type: 'cname' },
    { key: 'targetAnimationName', type: 'cname' },
    { key: 'startAdjustmentAfterAnimEvent', type: 'cname' },
  ],
  },
  'animAnimNode_LocomotionMachine': {
    kind: 'class',
    parent: 'animAnimNode_StateMachine',
    fields: [
    { key: 'usePlanner', type: 'bool01' },
    { key: 'group', type: 'cname' },
    { key: 'logic', type: 'cname' },
    { key: 'requestId', type: 'cname' },
    { key: 'distance', type: 'cname' },
    { key: 'duration', type: 'cname' },
    { key: 'motion', type: 'cname' },
    { key: 'state', type: 'cname' },
    { key: 'transitionTime', type: 'float' },
    { key: 'numVariants', type: 'int' },
  ],
  },
  'animAnimNode_LocomotionSwitch': {
    kind: 'class',
    parent: 'animAnimNode_Switch',
    fields: [
    { key: 'audioTagsPerInput', type: { array: 'cname' } },
  ],
  },
  'animAnimNode_LookAt': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'transform', type: 'animTransformIndex' },
    { key: 'forwardAxis', type: 'animAxis' },
    { key: 'useLimits', type: 'bool01' },
    { key: 'limitAxis', type: 'animAxis' },
    { key: 'limitAngle', type: 'float' },
    { key: 'targetNode', type: 'animVectorLink' },
    { key: 'weightNode', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_LookAtApplyVehicleRestrictions': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'group', type: 'cname' },
    { key: 'name', type: 'cname' },
    { key: 'referenceBone', type: 'animTransformIndex' },
  ],
  },
  'animAnimNode_LookAtController': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'E3_HACK_offset', type: 'animVectorLink' },
    { key: 'orderedBodyParts', type: { array: 'animLookAtPartInfo' } },
    { key: 'stateMachinesSettings', type: { array: 'animLookAtStateMachineSettings' } },
    { key: 'bodyPartsDependencies', type: { array: 'animLookAtPartsDependency' } },
    { key: 'substepTime', type: 'float' },
    { key: 'isFacial', type: 'bool01' },
  ],
  },
  'animAnimNode_LookAtPose360': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'speedInDegreesPerSecond', type: 'float' },
    { key: 'angleOffsetNode', type: 'animFloatLink' },
    { key: 'targetAngleOffsetNode', type: 'animFloatLink' },
    { key: 'weightNode', type: 'animFloatLink' },
    { key: 'animEndEventName', type: 'cname' },
    { key: 'animation', type: 'cname' },
    { key: 'durationCut', type: 'float' },
  ],
  },
  'animAnimNode_LookAtPose360Direction': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'angleOffset', type: 'float' },
    { key: 'defaultValue', type: 'float' },
    { key: 'negateOutput', type: 'bool01' },
  ],
  },
  'animAnimNode_MaskReset': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'weightNode', type: 'animFloatLink' },
    { key: 'transforms', type: { array: 'animTransformIndex' } },
  ],
  },
  'animAnimNode_MathExpressionFloat': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'expressionData', type: 'animMathExpressionNodeData' },
    { key: 'expressionString', type: 'string' },
  ],
  },
  'animAnimNode_MathExpressionPose': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'expressionData', type: 'animMathExpressionNodeData' },
    { key: 'expressionString', type: 'string' },
    { key: 'outputFloatTrack', type: 'animNamedTrackIndex' },
  ],
  },
  'animAnimNode_MathExpressionQuaternion': {
    kind: 'class',
    parent: 'animAnimNode_QuaternionValue',
    fields: [
    { key: 'expressionData', type: 'animMathExpressionNodeData' },
    { key: 'expressionString', type: 'string' },
  ],
  },
  'animAnimNode_MathExpressionVector': {
    kind: 'class',
    parent: 'animAnimNode_VectorValue',
    fields: [
    { key: 'expressionData', type: 'animMathExpressionNodeData' },
    { key: 'expressionString', type: 'string' },
  ],
  },
  'animAnimNode_MixerSlot': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'maxNormalAnimEntriesCount', type: 'int' },
    { key: 'maxAdditiveAnimEntriesCount', type: 'int' },
    { key: 'maxOverrideAnimEntriesCount', type: 'int' },
  ],
  },
  'animAnimNode_MotionAdjuster': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'inputNode', type: 'animPoseLink' },
    { key: 'targetPosition', type: 'animVectorLink' },
    { key: 'targetDirection', type: 'animVectorLink' },
    { key: 'totalTimeToAdjust', type: 'animFloatLink' },
    { key: 'forwardVector', type: 'Vector4' },
  ],
  },
  'animAnimNode_MotionTableSwitch': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [],
  },
  'animAnimNode_MultiBoolToFloatValue': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'allMustBeTrue', type: 'bool01' },
    { key: 'onTrue', type: 'float' },
    { key: 'onFalse', type: 'float' },
    { key: 'inputsData', type: { array: 'animAnimMultiBoolToFloatEntry' } },
  ],
  },
  'animAnimNode_MultipleParentConstraint': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'parentsTransform', type: { array: { ref: 'animIAnimNodeSourceChannel_QsTransform' } } },
    { key: 'parentsWeight', type: { array: { ref: 'animIAnimNodeSourceChannel_Float' } } },
    { key: 'areSourceChannelsResaved', type: 'bool01' },
    { key: 'parentsTransforms', type: { array: 'animAnimNode_MultipleParentConstraint_ParentInfo' } },
    { key: 'transformIndex', type: 'animTransformIndex' },
    { key: 'interpolationType', type: 'animEInterpolationType' },
    { key: 'weightMode', type: 'animConstraintWeightMode' },
    { key: 'weight', type: 'float' },
    { key: 'weightFloatTrack', type: 'animNamedTrackIndex' },
  ],
  },
  'animAnimNode_MultipleParentConstraint_ParentInfo': {
    kind: 'struct',
    fields: [
    { key: 'parentTransform', type: 'animTransformIndex' },
    { key: 'parentWeightMode', type: 'animConstraintWeightMode' },
    { key: 'parentStaticWeight', type: 'float' },
    { key: 'parentTrackWeight', type: 'animNamedTrackIndex' },
    { key: 'useComplementWeight', type: 'bool01' },
    { key: 'useOffset', type: 'bool01' },
    { key: 'offset', type: 'QsTransform' },
  ],
  },
  'animAnimNode_NPCExploration': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [],
  },
  'animAnimNode_NameHashConstant': {
    kind: 'class',
    parent: 'animAnimNode_IntValue',
    fields: [
    { key: 'value', type: 'cname' },
  ],
  },
  'animAnimNode_OnePoseInput': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'inputLink', type: 'animPoseLink' },
  ],
  },
  'animAnimNode_OrientConstraint': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'areSourceChannelsResaved', type: 'bool01' },
    { key: 'inputTransforms', type: { array: { ref: 'animAnimNodeSourceChannel_WeightedQuat' } } },
    { key: 'preprocessedWeights', type: { array: 'float' } },
    { key: 'inputWeightedTransforms', type: { array: 'animAnimNode_OrientConstraint_WeightedTransform' } },
    { key: 'transformIndex', type: 'animTransformIndex' },
    { key: 'weightMode', type: 'animConstraintWeightMode' },
    { key: 'weight', type: 'float' },
    { key: 'weightFloatTrack', type: 'animNamedTrackIndex' },
  ],
  },
  'animAnimNode_OrientConstraint_WeightedTransform': {
    kind: 'struct',
    fields: [
    { key: 'transform', type: 'animTransformIndex' },
    { key: 'weight', type: 'float' },
  ],
  },
  'animAnimNode_Output': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'node', type: 'animPoseLink' },
  ],
  },
  'animAnimNode_ParentConstraint': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'parentTransform', type: { ref: 'animIAnimNodeSourceChannel_QsTransform' } },
    { key: 'isParentTransformResaved', type: 'bool01' },
    { key: 'parentTransformIndex', type: 'animTransformIndex' },
    { key: 'transformIndex', type: 'animTransformIndex' },
    { key: 'interpolationType', type: 'animEInterpolationType' },
    { key: 'weight', type: 'float' },
    { key: 'weightFloatTrack', type: 'animNamedTrackIndex' },
    { key: 'useBoneReferencePoseAsDefaultOffset', type: 'bool01' },
    { key: 'weightNode', type: 'animFloatLink' },
    { key: 'offsetTranslationLS', type: 'animVectorLink' },
    { key: 'offsetEulerRotationLS', type: 'animVectorLink' },
  ],
  },
  'animAnimNode_ParentTransform': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'mapping', type: { array: 'animAnimTransformMappingEntry' } },
  ],
  },
  'animAnimNode_PointConstraint': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'areSourceChannelsResaved', type: 'bool01' },
    { key: 'inputTransforms', type: { array: { ref: 'animAnimNodeSourceChannel_WeightedVector' } } },
    { key: 'preprocessedWeights', type: { array: 'float' } },
    { key: 'inputWeightedTransforms', type: { array: 'animAnimNode_PointConstraint_WeightedTransform' } },
    { key: 'transformIndex', type: 'animTransformIndex' },
    { key: 'weightMode', type: 'animConstraintWeightMode' },
    { key: 'weight', type: 'float' },
    { key: 'weightFloatTrack', type: 'animNamedTrackIndex' },
  ],
  },
  'animAnimNode_PointConstraint_WeightedTransform': {
    kind: 'struct',
    fields: [
    { key: 'transform', type: 'animTransformIndex' },
    { key: 'weight', type: 'float' },
  ],
  },
  'animAnimNode_Pose360': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'angle', type: 'animFloatLink' },
    { key: 'animation', type: 'cname' },
  ],
  },
  'animAnimNode_PoseCorrection': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [],
  },
  'animAnimNode_PoseLsToMs': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [],
  },
  'animAnimNode_PoseMsToLs': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [],
  },
  'animAnimNode_PostProcess_Footlock': {
    kind: 'class',
    parent: 'animIAnimNode_PostProcess',
    fields: [],
  },
  'animAnimNode_QuaternionConstant': {
    kind: 'class',
    parent: 'animAnimNode_QuaternionValue',
    fields: [
    { key: 'value', type: 'Quaternion' },
  ],
  },
  'animAnimNode_QuaternionInput': {
    kind: 'class',
    parent: 'animAnimNode_QuaternionValue',
    fields: [
    { key: 'group', type: 'cname' },
    { key: 'name', type: 'cname' },
  ],
  },
  'animAnimNode_QuaternionInterpolation': {
    kind: 'class',
    parent: 'animAnimNode_QuaternionValue',
    fields: [
    { key: 'interpolationType', type: 'animQuaternionInterpolationType' },
    { key: 'firstInput', type: 'animQuaternionLink' },
    { key: 'secondInput', type: 'animQuaternionLink' },
    { key: 'weight', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_QuaternionJoin': {
    kind: 'class',
    parent: 'animAnimNode_QuaternionValue',
    fields: [
    { key: 'input', type: 'animQuaternionLink' },
  ],
  },
  'animAnimNode_QuaternionLatch': {
    kind: 'class',
    parent: 'animAnimNode_QuaternionValue',
    fields: [
    { key: 'input', type: 'animQuaternionLink' },
  ],
  },
  'animAnimNode_QuaternionValue': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [],
  },
  'animAnimNode_QuaternionVariable': {
    kind: 'class',
    parent: 'animAnimNode_QuaternionValue',
    fields: [
    { key: 'variableName', type: 'cname' },
  ],
  },
  'animAnimNode_QuaternionWsToMs': {
    kind: 'class',
    parent: 'animAnimNode_QuaternionValue',
    fields: [
    { key: 'quaternionWs', type: 'animQuaternionLink' },
  ],
  },
  'animAnimNode_RagdollControl': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'blendInDuration', type: 'float' },
    { key: 'blendOutDuration', type: 'float' },
    { key: 'inputPoseNode', type: 'animPoseLink' },
  ],
  },
  'animAnimNode_RagdollPose': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [],
  },
  'animAnimNode_ReadIkRequest': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'ikChain', type: 'cname' },
    { key: 'outTransform', type: 'animTransformIndex' },
  ],
  },
  'animAnimNode_ReferencePoseTerminator': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [],
  },
  'animAnimNode_Retarget': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'refRig', type: 'ResourceReference' },
    { key: 'postProcess', type: { ref: 'animIAnimNode_PostProcess' } },
  ],
  },
  'animAnimNode_Root': {
    kind: 'class',
    parent: 'animAnimNode_Container',
    fields: [
    { key: 'outputNode', type: 'animPoseLink' },
  ],
  },
  'animAnimNode_RotateBone': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'inputNode', type: 'animPoseLink' },
    { key: 'angleNode', type: 'animFloatLink' },
    { key: 'minValueNode', type: 'animFloatLink' },
    { key: 'maxValueNode', type: 'animFloatLink' },
    { key: 'bone', type: 'animTransformIndex' },
    { key: 'axis', type: 'animETransformAxis' },
    { key: 'scale', type: 'float' },
    { key: 'biasAngle', type: 'float' },
    { key: 'minAngle', type: 'float' },
    { key: 'maxAngle', type: 'float' },
    { key: 'clampRotation', type: 'bool01' },
    { key: 'useIncrementalMode', type: 'bool01' },
    { key: 'resetOnActivation', type: 'bool01' },
    { key: 'inModelSpace', type: 'bool01' },
  ],
  },
  'animAnimNode_RotateBoneByQuaternion': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'inputNode', type: 'animPoseLink' },
    { key: 'quaternionNode', type: 'animQuaternionLink' },
    { key: 'bone', type: 'animTransformIndex' },
    { key: 'useIncrementalMode', type: 'bool01' },
    { key: 'resetOnActivation', type: 'bool01' },
  ],
  },
  'animAnimNode_RotationLimit': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'constrainedTransform', type: 'animTransformIndex' },
    { key: 'limitOnX', type: 'animSmoothFloatClamp' },
    { key: 'limitOnY', type: 'animSmoothFloatClamp' },
    { key: 'limitOnZ', type: 'animSmoothFloatClamp' },
    { key: 'useEyesLookAtBlendWeight', type: 'bool01' },
    { key: 'weightLink', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_RuntimeSwitch': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'condition', type: { ref: 'animIRuntimeCondition' } },
    { key: 'True', type: 'animPoseLink' },
    { key: 'False', type: 'animPoseLink' },
  ],
  },
  'animAnimNode_SelectiveJoin': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [],
  },
  'animAnimNode_Sermo': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [],
  },
  'animAnimNode_SetBoneOrientation': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'bone', type: 'animTransformIndex' },
    { key: 'orientationMs', type: 'animQuaternionLink' },
  ],
  },
  'animAnimNode_SetBonePosition': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'bone', type: 'animTransformIndex' },
    { key: 'positionMs', type: 'animVectorLink' },
  ],
  },
  'animAnimNode_SetBoneTransform': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'entries', type: { array: 'animSetBoneTransformEntry' } },
  ],
  },
  'animAnimNode_SetDrivenKey': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'inputLink', type: 'animPoseLink' },
    { key: 'provider', type: { ref: 'animAnimNode_SetDrivenKey_InternalsISetDrivenKeyEntryProvider' } },
  ],
  },
  'animAnimNode_SetDrivenKey_InternalsEChannelType': { kind: 'enum', values: ['FloatTrack', 'TransX', 'TransY', 'TransZ', 'RotEulZ_Pitch', 'RotEulX_Roll', 'RotEulY_Yaw', 'ScaleX', 'ScaleY', 'ScaleZ', 'RotQuatX', 'RotQuatY', 'RotQuatZ', 'RotQuatW'] },
  'animAnimNode_SetDrivenKey_InternalsEntry': {
    kind: 'struct',
    fields: [
    { key: 'curve', type: 'CurveDataFloat' },
    { key: 'inChannelName', type: 'cname' },
    { key: 'outChannelName', type: 'cname' },
    { key: 'inChanelType', type: 'animAnimNode_SetDrivenKey_InternalsEChannelType' },
    { key: 'outChanelType', type: 'animAnimNode_SetDrivenKey_InternalsEChannelType' },
  ],
  },
  'animAnimNode_SetDrivenKey_InternalsISetDrivenKeyEntryProvider': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animAnimNode_SetDrivenKey_InternalsSetDrivenKeyEntryProviderInline': {
    kind: 'class',
    parent: 'animAnimNode_SetDrivenKey_InternalsISetDrivenKeyEntryProvider',
    fields: [
    { key: 'entries', type: { array: 'animAnimNode_SetDrivenKey_InternalsEntry' } },
  ],
  },
  'animAnimNode_SetRequiredDistanceCategory': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'requiredQualityDistanceCategory', type: 'int' },
  ],
  },
  'animAnimNode_SetRequiredDistanceCategoryByBone': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'bone', type: 'animTransformIndex' },
  ],
  },
  'animAnimNode_SetTrackRange': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'min', type: 'float' },
    { key: 'max', type: 'float' },
    { key: 'oldMin', type: 'float' },
    { key: 'oldMax', type: 'float' },
    { key: 'minLink', type: 'animFloatLink' },
    { key: 'maxLink', type: 'animFloatLink' },
    { key: 'oldMinLink', type: 'animFloatLink' },
    { key: 'oldMaxLink', type: 'animFloatLink' },
    { key: 'track', type: 'animNamedTrackIndex' },
    { key: 'debug', type: 'bool01' },
  ],
  },
  'animAnimNode_SharedMetaPose': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'weightLink', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_SharedMetaPoseAdditive': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'weightLink', type: 'animFloatLink' },
    { key: 'additiveType', type: 'animEAnimGraphAdditiveType' },
    { key: 'blendTracks', type: 'animEBlendTracksMode' },
    { key: 'convertParentPoseToAdditive', type: 'bool01' },
  ],
  },
  'animAnimNode_Signal': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'blendIn', type: 'float' },
    { key: 'blendOut', type: 'float' },
    { key: 'startEvent', type: 'cname' },
    { key: 'endEvent', type: 'cname' },
    { key: 'defaultState', type: 'bool01' },
    { key: 'cooldown', type: 'float' },
  ],
  },
  'animAnimNode_SimpleBounce': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'areChannelsResaved', type: 'bool01' },
    { key: 'outputDriverTrack', type: 'animNamedTrackIndex' },
    { key: 'debug', type: 'bool01' },
    { key: 'startTransform', type: 'animTransformIndex' },
    { key: 'endTransform', type: 'animTransformIndex' },
    { key: 'multiplier', type: 'float' },
    { key: 'negativeMultiplier', type: 'float' },
    { key: 'smoothStep', type: 'float' },
    { key: 'offset', type: 'float' },
    { key: 'delay', type: 'float' },
    { key: 'transformOutputs', type: { array: 'animSimpleBounceTransformOutput' } },
    { key: 'trackOutputs', type: { array: 'animSimpleBounceTrackOutput' } },
  ],
  },
  'animAnimNode_SimpleSpline': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'areSourceChannelsResaved', type: 'bool01' },
    { key: 'startTransform', type: 'animTransformIndex' },
    { key: 'middleTransform', type: 'animTransformIndex' },
    { key: 'endTransform', type: 'animTransformIndex' },
    { key: 'constrainedTransform', type: 'animTransformIndex' },
    { key: 'progressMode', type: 'animConstraintWeightMode' },
    { key: 'defaultProgress', type: 'float' },
    { key: 'progressTrack', type: 'animNamedTrackIndex' },
  ],
  },
  'animAnimNode_SkAnim': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'animation', type: 'cname' },
    { key: 'applyMotion', type: 'bool01' },
    { key: 'isLooped', type: 'bool01' },
    { key: 'resume', type: 'bool01' },
    { key: 'collectEvents', type: 'bool01' },
    { key: 'fireAnimLoopEvent', type: 'bool01' },
    { key: 'animLoopEventName', type: 'cname' },
    { key: 'clipFront', type: 'float' },
    { key: 'clipEnd', type: 'float' },
    { key: 'clipFrontByEvent', type: 'cname' },
    { key: 'clipEndByEvent', type: 'cname' },
    { key: 'pushDataByTag', type: 'cname' },
    { key: 'popDataByTag', type: 'cname' },
    { key: 'pushSafeCutTag', type: 'cname' },
    { key: 'convertToAdditive', type: 'bool01' },
    { key: 'motionProvider', type: { ref: 'animIMotionTableProvider' } },
    { key: 'applyInertializationOnAnimSetSwap', type: 'bool01' },
  ],
  },
  'animAnimNode_SkAnimAdjuster': {
    kind: 'class',
    parent: 'animAnimNode_SkAnim',
    fields: [
    { key: 'targetPositionWs', type: 'animVectorLink' },
    { key: 'targetDirectionWs', type: 'animVectorLink' },
    { key: 'initialForwardVector', type: 'Vector4' },
    { key: 'startAdjustmentEventName', type: 'cname' },
    { key: 'endAdjustmentEventName', type: 'cname' },
  ],
  },
  'animAnimNode_SkAnimContinue': {
    kind: 'class',
    parent: 'animAnimNode_SkAnim',
    fields: [
    { key: 'Input', type: 'animPoseLink' },
    { key: 'popSafeCutTag', type: 'cname' },
  ],
  },
  'animAnimNode_SkAnimDecorator': {
    kind: 'class',
    parent: 'animAnimNode_SkAnim',
    fields: [
    { key: 'Fallback', type: 'animPoseLink' },
  ],
  },
  'animAnimNode_SkAnimSlot': {
    kind: 'class',
    parent: 'animAnimNode_SkAnim',
    fields: [
    { key: 'forFacialIdle', type: 'bool01' },
  ],
  },
  'animAnimNode_SkDurationAnim': {
    kind: 'class',
    parent: 'animAnimNode_SkAnim',
    fields: [
    { key: 'Duration', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_SkFrameAnim': {
    kind: 'class',
    parent: 'animAnimNode_SkAnim',
    fields: [
    { key: 'progressLink', type: 'animFloatLink' },
    { key: 'timeLink', type: 'animFloatLink' },
    { key: 'frameLink', type: 'animFloatLink' },
    { key: 'fireAnimEndOnceOnAnimEnd', type: 'bool01' },
  ],
  },
  'animAnimNode_SkFrameAnimByTrack': {
    kind: 'class',
    parent: 'animAnimNode_SkFrameAnim',
    fields: [
    { key: 'progressFloatTrack', type: 'animNamedTrackIndex' },
    { key: 'timeFloatTrack', type: 'animNamedTrackIndex' },
    { key: 'frameFloatTrack', type: 'animNamedTrackIndex' },
    { key: 'inputWithTracks', type: 'animPoseLink' },
  ],
  },
  'animAnimNode_SkOneShotAnim': {
    kind: 'class',
    parent: 'animAnimNode_SkAnim',
    fields: [
    { key: 'Input', type: 'animPoseLink' },
    { key: 'blendIn', type: 'float' },
    { key: 'blendOut', type: 'float' },
  ],
  },
  'animAnimNode_SkPhaseAnim': {
    kind: 'class',
    parent: 'animAnimNode_SkAnim',
    fields: [
    { key: 'phase', type: 'cname' },
  ],
  },
  'animAnimNode_SkPhaseSlotWithDurationAnim': {
    kind: 'class',
    parent: 'animAnimNode_SkPhaseWithDurationAnim',
    fields: [
    { key: 'animFeatureName', type: 'cname' },
    { key: 'actionAnimDatabaseRef', type: 'ResourceReference' },
  ],
  },
  'animAnimNode_SkPhaseWithDurationAnim': {
    kind: 'class',
    parent: 'animAnimNode_SkPhaseAnim',
    fields: [
    { key: 'durationLink', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_SkPhaseWithSpeedAnim': {
    kind: 'class',
    parent: 'animAnimNode_SkPhaseAnim',
    fields: [
    { key: 'speedLink', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_SkSpeedAnim': {
    kind: 'class',
    parent: 'animAnimNode_SkAnim',
    fields: [
    { key: 'Speed', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_SkSyncedMasterAnim': {
    kind: 'class',
    parent: 'animAnimNode_SkSpeedAnim',
    fields: [
    { key: 'syncTag', type: 'cname' },
  ],
  },
  'animAnimNode_SkSyncedMasterAnimByTime': {
    kind: 'class',
    parent: 'animAnimNode_SkFrameAnim',
    fields: [
    { key: 'syncTag', type: 'cname' },
  ],
  },
  'animAnimNode_SkSyncedSlaveAnim': {
    kind: 'class',
    parent: 'animAnimNode_SkAnim',
    fields: [
    { key: 'syncTag', type: 'cname' },
  ],
  },
  'animAnimNode_SkipConsoleBegin': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [],
  },
  'animAnimNode_SkipConsoleEnd': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'inputLink', type: 'animPoseLink' },
  ],
  },
  'animAnimNode_SkipPerformanceModeBegin': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [],
  },
  'animAnimNode_SkipPerformanceModeEnd': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'inputLink', type: 'animPoseLink' },
  ],
  },
  'animAnimNode_SpringDamp': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'massFactor', type: 'float' },
    { key: 'springFactor', type: 'float' },
    { key: 'dampFactor', type: 'float' },
    { key: 'startFromDefaultValue', type: 'bool01' },
    { key: 'defaultInitialValue', type: 'float' },
    { key: 'wrapAroundRange', type: 'bool01' },
    { key: 'rangeMin', type: 'float' },
    { key: 'rangeMax', type: 'float' },
    { key: 'timeStep', type: 'float' },
    { key: 'inputNode', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_StackTracksExtender': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'tag', type: 'cname' },
    { key: 'newTracks', type: { array: 'animFloatTrackInfo' } },
  ],
  },
  'animAnimNode_StackTracksShrinker': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'tag', type: 'cname' },
  ],
  },
  'animAnimNode_StackTransformsExtender': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'tag', type: 'cname' },
    { key: 'transformInfos', type: { array: 'animTransformInfo' } },
    { key: 'snapMethods', type: { array: 'animStackTransformsExtender_SnapToBoneMethod' } },
    { key: 'snapToReferenceValues', type: { array: 'bool01' } },
    { key: 'snapTargetBones', type: { array: 'animTransformIndex' } },
    { key: 'offsetToReferenceValues', type: { array: 'bool01' } },
    { key: 'offsetSpaceBones', type: { array: 'animTransformIndex' } },
    { key: 'offsets', type: { array: 'QsTransform' } },
  ],
  },
  'animAnimNode_StackTransformsShrinker': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'tag', type: 'cname' },
  ],
  },
  'animAnimNode_Stage': {
    kind: 'class',
    parent: 'animAnimNode_Container',
    fields: [
    { key: 'inputPoses', type: { array: 'animPoseLink' } },
  ],
  },
  'animAnimNode_StageFloatEntry': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [],
  },
  'animAnimNode_StagePoseEntry': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'inputName', type: 'cname' },
    { key: 'parentInput', type: 'animPoseLink' },
  ],
  },
  'animAnimNode_State': {
    kind: 'class',
    parent: 'animAnimNode_Container',
    fields: [
    { key: 'name', type: 'cname' },
    { key: 'outTransitionIndices', type: { array: 'int' } },
    { key: 'preventTransitionsInActivationFrame', type: 'bool01' },
    { key: 'tags', type: { array: 'cname' } },
    { key: 'requiredQualityDistanceCategory', type: 'int' },
  ],
  },
  'animAnimNode_StateFrozen': {
    kind: 'class',
    parent: 'animAnimNode_State',
    fields: [],
  },
  'animAnimNode_StateMachine': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'states', type: { array: { ref: 'animAnimNode_State' } } },
    { key: 'frozenState', type: { ref: 'animAnimNode_StateFrozen' } },
    { key: 'transitions', type: { array: { ref: 'animAnimStateTransitionDescription' } } },
    { key: 'conditionalEntries', type: { array: { ref: 'animAnimStateMachineConditionalEntry' } } },
    { key: 'globalTransitions', type: { array: { ref: 'animAnimStateTransitionDescription' } } },
    { key: 'anyStateInterpolator', type: { ref: 'animIAnimStateTransitionInterpolator' } },
    { key: 'defaultStateIndex', type: 'int' },
    { key: 'notifyOnEnterState', type: 'bool01' },
  ],
  },
  'animAnimNode_StaticSwitch': {
    kind: 'class',
    parent: 'animAnimNode_MotionTableSwitch',
    fields: [
    { key: 'condition', type: { ref: 'animIStaticCondition' } },
    { key: 'motionProvider', type: { ref: 'animIMotionTableProvider' } },
    { key: 'True', type: 'animPoseLink' },
    { key: 'False', type: 'animPoseLink' },
  ],
  },
  'animAnimNode_SuspensionLimit': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'constrainedTransform', type: 'animTransformIndex' },
    { key: 'radiusTrack', type: 'animNamedTrackIndex' },
    { key: 'deviationTrack', type: 'animNamedTrackIndex' },
    { key: 'axis', type: 'animAxis' },
  ],
  },
  'animAnimNode_Switch': {
    kind: 'class',
    parent: 'animAnimNode_MotionTableSwitch',
    fields: [
    { key: 'numInputs', type: 'int' },
    { key: 'blendTime', type: 'float' },
    { key: 'timeWarpingEnabled', type: 'bool01' },
    { key: 'syncMethod', type: { ref: 'animISyncMethod' } },
    { key: 'motionProvider', type: { ref: 'animIMotionTableProvider' } },
    { key: 'weightNode', type: 'animFloatLink' },
    { key: 'inputNodes', type: { array: 'animPoseLink' } },
    { key: 'pushDataByTag', type: 'cname' },
    { key: 'canRequestInertialization', type: 'bool01' },
  ],
  },
  'animAnimNode_TagSwitch': {
    kind: 'class',
    parent: 'animAnimNode_BaseSwitch',
    fields: [
    { key: 'tags', type: { array: 'cname' } },
  ],
  },
  'animAnimNode_TagValue': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'tag', type: 'cname' },
    { key: 'defaultValue', type: 'float' },
    { key: 'oneMinus', type: 'bool01' },
  ],
  },
  'animAnimNode_Timer': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [],
  },
  'animAnimNode_TrackSetter': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'track', type: 'animNamedTrackIndex' },
    { key: 'value', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_TrajectoryFromMetaPose': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'metaPoseTrajectoryLs', type: 'animTransformIndex' },
  ],
  },
  'animAnimNode_TransformConstant': {
    kind: 'class',
    parent: 'animAnimNode_TransformValue',
    fields: [
    { key: 'pos', type: 'Vector4' },
    { key: 'rotation', type: 'Quaternion' },
    { key: 'scale', type: 'Vector4' },
  ],
  },
  'animAnimNode_TransformInterpolation': {
    kind: 'class',
    parent: 'animAnimNode_TransformValue',
    fields: [
    { key: 'interpolationType', type: 'animQuaternionInterpolationType' },
    { key: 'firstInput', type: 'animTransformLink' },
    { key: 'secondInput', type: 'animTransformLink' },
    { key: 'weight', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_TransformJoin': {
    kind: 'class',
    parent: 'animAnimNode_TransformValue',
    fields: [
    { key: 'input', type: 'animTransformLink' },
  ],
  },
  'animAnimNode_TransformLatch': {
    kind: 'class',
    parent: 'animAnimNode_TransformValue',
    fields: [
    { key: 'input', type: 'animTransformLink' },
  ],
  },
  'animAnimNode_TransformRotator': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'transform', type: 'animTransformIndex' },
    { key: 'axis', type: 'Vector3' },
    { key: 'valueScale', type: 'float' },
    { key: 'clamp', type: 'bool01' },
    { key: 'angleMin', type: 'float' },
    { key: 'angleMax', type: 'float' },
    { key: 'angleValueNode', type: 'animFloatLink' },
    { key: 'angleSpeedNode', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_TransformToTrack': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'floatTrack', type: 'int' },
    { key: 'floatTrackIndex', type: 'animNamedTrackIndex' },
    { key: 'outputTransform', type: 'int' },
    { key: 'transformIndex', type: 'animTransformIndex' },
    { key: 'channel', type: 'animTransformChannel' },
    { key: 'mulFactor', type: 'float' },
    { key: 'weight', type: 'float' },
    { key: 'weightNode', type: 'animFloatLink' },
    { key: 'mulFactorNode', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_TransformValue': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [],
  },
  'animAnimNode_TransformVariable': {
    kind: 'class',
    parent: 'animAnimNode_TransformValue',
    fields: [
    { key: 'variableName', type: 'cname' },
  ],
  },
  'animAnimNode_TranslateBone': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'inputNode', type: 'animPoseLink' },
    { key: 'inputTranslation', type: 'animVectorLink' },
    { key: 'scale', type: 'Vector4' },
    { key: 'biasValue', type: 'Vector4' },
    { key: 'bone', type: 'animTransformIndex' },
    { key: 'useIncrementalMode', type: 'bool01' },
    { key: 'resetOnActivation', type: 'bool01' },
  ],
  },
  'animAnimNode_TranslationLimit': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'constrainedTransform', type: 'animTransformIndex' },
    { key: 'parentTransform', type: 'animTransformIndex' },
    { key: 'limitOnXAxis', type: 'animFloatClamp' },
    { key: 'limitOnYAxis', type: 'animFloatClamp' },
    { key: 'limitOnZAxis', type: 'animFloatClamp' },
  ],
  },
  'animAnimNode_TriggerBranch': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'base', type: 'animPoseLink' },
    { key: 'overlay', type: 'animPoseLink' },
    { key: 'blendIn', type: 'float' },
    { key: 'blendOut', type: 'float' },
    { key: 'startEvent', type: 'cname' },
    { key: 'endEvent', type: 'cname' },
    { key: 'cooldown', type: 'float' },
  ],
  },
  'animAnimNode_TwistConstraint': {
    kind: 'class',
    parent: 'animAnimNode_OnePoseInput',
    fields: [
    { key: 'frontAxis', type: 'animAxis' },
    { key: 'transformA', type: 'animTransformIndex' },
    { key: 'transformB', type: 'animTransformIndex' },
    { key: 'outputs', type: { array: 'animTwistOutput' } },
    { key: 'debug', type: 'bool01' },
  ],
  },
  'animAnimNode_ValueBySpeed': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'defaultValue', type: 'float' },
    { key: 'clampType', type: 'animClampType' },
    { key: 'rangeMin', type: 'float' },
    { key: 'rangeMax', type: 'float' },
    { key: 'resetOnActivation', type: 'bool01' },
    { key: 'speed', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_VectorConstant': {
    kind: 'class',
    parent: 'animAnimNode_VectorValue',
    fields: [
    { key: 'value', type: 'Vector4' },
  ],
  },
  'animAnimNode_VectorInput': {
    kind: 'class',
    parent: 'animAnimNode_VectorValue',
    fields: [
    { key: 'group', type: 'cname' },
    { key: 'name', type: 'cname' },
  ],
  },
  'animAnimNode_VectorInterpolation': {
    kind: 'class',
    parent: 'animAnimNode_VectorValue',
    fields: [
    { key: 'firstInput', type: 'animVectorLink' },
    { key: 'secondInput', type: 'animVectorLink' },
    { key: 'weight', type: 'animFloatLink' },
  ],
  },
  'animAnimNode_VectorJoin': {
    kind: 'class',
    parent: 'animAnimNode_VectorValue',
    fields: [
    { key: 'input', type: 'animVectorLink' },
  ],
  },
  'animAnimNode_VectorLatch': {
    kind: 'class',
    parent: 'animAnimNode_VectorValue',
    fields: [
    { key: 'input', type: 'animVectorLink' },
  ],
  },
  'animAnimNode_VectorValue': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [],
  },
  'animAnimNode_VectorVariable': {
    kind: 'class',
    parent: 'animAnimNode_VectorValue',
    fields: [
    { key: 'variableName', type: 'cname' },
  ],
  },
  'animAnimNode_VectorWsToMs': {
    kind: 'class',
    parent: 'animAnimNode_VectorValue',
    fields: [
    { key: 'type', type: 'animEVectorWsToMsType' },
    { key: 'vectorWs', type: 'animVectorLink' },
  ],
  },
  'animAnimNode_WorkspotAnim': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'collectEvents', type: 'bool01' },
    { key: 'inputLink', type: 'animPoseLink' },
  ],
  },
  'animAnimNode_WorkspotHub': {
    kind: 'class',
    parent: 'animAnimNode_Base',
    fields: [
    { key: 'additionalLinkIds', type: { array: 'WorkEntryId' } },
    { key: 'additionalLinks', type: { array: 'animPoseLink' } },
    { key: 'animLoopEventName', type: 'cname' },
    { key: 'isCoverHubHack', type: 'bool01' },
    { key: 'eventFilterType', type: 'animEventFilterType' },
    { key: 'mainEmotionalState', type: 'cname' },
    { key: 'emotionalExpression', type: 'cname' },
    { key: 'facialKeyWeight', type: 'float' },
    { key: 'facialIdleMaleAnimation', type: 'cname' },
    { key: 'facialIdleKey_MaleAnimation', type: 'cname' },
    { key: 'facialIdleFemaleAnimation', type: 'cname' },
    { key: 'facialIdleKey_FemaleAnimation', type: 'cname' },
  ],
  },
  'animAnimNode_WrapperValue': {
    kind: 'class',
    parent: 'animAnimNode_FloatValue',
    fields: [
    { key: 'wrapperNames', type: { array: 'cname' } },
    { key: 'logicOp', type: 'animEAnimGraphLogicOp' },
    { key: 'oneMinus', type: 'bool01' },
  ],
  },
  'animAnimStateInterpolationType': { kind: 'enum', values: ['Linear', 'EaseIn', 'EaseOut', 'EaseInOut'] },
  'animAnimStateMachineConditionalEntry': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [
    { key: 'targetStateIndex', type: 'int' },
    { key: 'condition', type: { ref: 'animIAnimStateTransitionCondition' } },
    { key: 'isEnabled', type: 'bool01' },
    { key: 'priority', type: 'int' },
    { key: 'isForcedToTrue', type: 'bool01' },
  ],
  },
  'animAnimStateTransitionCondition_AnimEnd': {
    kind: 'class',
    parent: 'animIAnimStateTransitionCondition',
    fields: [
    { key: 'eventName', type: 'cname' },
  ],
  },
  'animAnimStateTransitionCondition_AnimEvent': {
    kind: 'class',
    parent: 'animIAnimStateTransitionCondition',
    fields: [
    { key: 'eventName', type: 'cname' },
  ],
  },
  'animAnimStateTransitionCondition_AnyAnimEnd': {
    kind: 'class',
    parent: 'animIAnimStateTransitionCondition',
    fields: [],
  },
  'animAnimStateTransitionCondition_BoolEdgeFeature': {
    kind: 'class',
    parent: 'animIAnimStateTransitionCondition',
    fields: [
    { key: 'featureName', type: 'cname' },
    { key: 'featurePropertyName', type: 'cname' },
  ],
  },
  'animAnimStateTransitionCondition_BoolFeature': {
    kind: 'class',
    parent: 'animIAnimStateTransitionCondition',
    fields: [
    { key: 'compareValue', type: 'bool01' },
    { key: 'featureName', type: 'cname' },
    { key: 'featurePropertyName', type: 'cname' },
  ],
  },
  'animAnimStateTransitionCondition_BoolVariable': {
    kind: 'class',
    parent: 'animIAnimStateTransitionCondition',
    fields: [
    { key: 'variableName', type: 'cname' },
    { key: 'compareValue', type: 'bool01' },
  ],
  },
  'animAnimStateTransitionCondition_CompositeSimultaneous': {
    kind: 'class',
    parent: 'animIAnimStateTransitionCondition',
    fields: [
    { key: 'conditions', type: { array: { ref: 'animIAnimStateTransitionCondition' } } },
  ],
  },
  'animAnimStateTransitionCondition_ExternalEvent': {
    kind: 'class',
    parent: 'animIAnimStateTransitionCondition',
    fields: [
    { key: 'eventName', type: 'cname' },
  ],
  },
  'animAnimStateTransitionCondition_FloatFeature': {
    kind: 'class',
    parent: 'animIAnimStateTransitionCondition',
    fields: [
    { key: 'compareValue', type: 'float' },
    { key: 'featureName', type: 'cname' },
    { key: 'featurePropertyName', type: 'cname' },
    { key: 'compareFunc', type: 'animCompareFunc' },
  ],
  },
  'animAnimStateTransitionCondition_FloatVariable': {
    kind: 'class',
    parent: 'animIAnimStateTransitionCondition',
    fields: [
    { key: 'variableName', type: 'cname' },
    { key: 'compareValue', type: 'float' },
    { key: 'compareFunc', type: 'animCompareFunc' },
  ],
  },
  'animAnimStateTransitionCondition_FootPhaseEvent': {
    kind: 'class',
    parent: 'animIAnimStateTransitionCondition',
    fields: [
    { key: 'footPhase', type: 'animEFootPhase' },
  ],
  },
  'animAnimStateTransitionCondition_HasAnimation': {
    kind: 'class',
    parent: 'animIAnimStateTransitionCondition',
    fields: [
    { key: 'animationName', type: 'cname' },
  ],
  },
  'animAnimStateTransitionCondition_IntEdgeFeature': {
    kind: 'class',
    parent: 'animIAnimStateTransitionCondition',
    fields: [
    { key: 'featureName', type: 'cname' },
    { key: 'featurePropertyName', type: 'cname' },
  ],
  },
  'animAnimStateTransitionCondition_IntEdgeFromToFeature': {
    kind: 'class',
    parent: 'animAnimStateTransitionCondition_IntEdgeFeature',
    fields: [
    { key: 'fromValue', type: 'int' },
    { key: 'toValue', type: 'int' },
  ],
  },
  'animAnimStateTransitionCondition_IntEdgeGreaterFromZeroFeature': {
    kind: 'class',
    parent: 'animAnimStateTransitionCondition_IntEdgeFeature',
    fields: [
    { key: 'greaterThenValue', type: 'int' },
  ],
  },
  'animAnimStateTransitionCondition_IntEdgeToFeature': {
    kind: 'class',
    parent: 'animAnimStateTransitionCondition_IntEdgeFeature',
    fields: [
    { key: 'toValue', type: 'int' },
  ],
  },
  'animAnimStateTransitionCondition_IntFeature': {
    kind: 'class',
    parent: 'animIAnimStateTransitionCondition',
    fields: [
    { key: 'compareValue', type: 'int' },
    { key: 'featureName', type: 'cname' },
    { key: 'featurePropertyName', type: 'cname' },
    { key: 'compareFunc', type: 'animCompareFunc' },
  ],
  },
  'animAnimStateTransitionCondition_IntVariable': {
    kind: 'class',
    parent: 'animIAnimStateTransitionCondition',
    fields: [
    { key: 'variableName', type: 'cname' },
    { key: 'compareValue', type: 'int' },
    { key: 'compareFunc', type: 'animCompareFunc' },
  ],
  },
  'animAnimStateTransitionCondition_ModifiedFloatVariable': {
    kind: 'class',
    parent: 'animIAnimStateTransitionCondition',
    fields: [
    { key: 'variableName', type: 'cname' },
    { key: 'compareValue', type: 'float' },
    { key: 'compareFunc', type: 'animCompareFunc' },
  ],
  },
  'animAnimStateTransitionCondition_Timed': {
    kind: 'class',
    parent: 'animIAnimStateTransitionCondition',
    fields: [
    { key: 'timeToFireTransition', type: 'float' },
  ],
  },
  'animAnimStateTransitionCondition_WrapperValue': {
    kind: 'class',
    parent: 'animIAnimStateTransitionCondition',
    fields: [
    { key: 'wrapperName', type: 'cname' },
    { key: 'checkIfWrapperIsSet', type: 'bool01' },
  ],
  },
  'animAnimStateTransitionDescription': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [
    { key: 'targetStateIndex', type: 'int' },
    { key: 'condition', type: { ref: 'animIAnimStateTransitionCondition' } },
    { key: 'isEnabled', type: 'bool01' },
    { key: 'interpolator', type: { ref: 'animIAnimStateTransitionInterpolator' } },
    { key: 'duration', type: 'float' },
    { key: 'priority', type: 'int' },
    { key: 'syncMethod', type: { ref: 'animISyncMethod' } },
    { key: 'isForcedToTrue', type: 'bool01' },
    { key: 'supportBlendFromPose', type: 'bool01' },
    { key: 'canRequestInertialization', type: 'bool01' },
    { key: 'animFeatureName', type: 'cname' },
    { key: 'actionAnimDatabaseRef', type: 'ResourceReference' },
    { key: 'isOutTransitionFromAction', type: 'bool01' },
  ],
  },
  'animAnimStateTransitionInterpolator_Blend': {
    kind: 'class',
    parent: 'animIAnimStateTransitionInterpolator',
    fields: [
    { key: 'interpolationType', type: 'animAnimStateInterpolationType' },
  ],
  },
  'animAnimTransformMappingEntry': {
    kind: 'struct',
    fields: [
    { key: 'from', type: 'cname' },
    { key: 'to', type: 'cname' },
    { key: 'weightTrack', type: 'cname' },
  ],
  },
  'animAnimVariable': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [
    { key: 'name', type: 'cname' },
  ],
  },
  'animAnimVariableBool': {
    kind: 'class',
    parent: 'animAnimVariable',
    fields: [
    { key: 'value', type: 'bool01' },
    { key: 'default', type: 'bool01' },
  ],
  },
  'animAnimVariableContainer': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [
    { key: 'boolVariables', type: { array: { ref: 'animAnimVariableBool' } } },
    { key: 'intVariables', type: { array: { ref: 'animAnimVariableInt' } } },
    { key: 'floatVariables', type: { array: { ref: 'animAnimVariableFloat' } } },
    { key: 'vectorVariables', type: { array: { ref: 'animAnimVariableVector' } } },
    { key: 'quaternionVariables', type: { array: { ref: 'animAnimVariableQuaternion' } } },
    { key: 'transformVariables', type: { array: { ref: 'animAnimVariableTransform' } } },
  ],
  },
  'animAnimVariableFloat': {
    kind: 'class',
    parent: 'animAnimVariable',
    fields: [
    { key: 'value', type: 'float' },
    { key: 'default', type: 'float' },
    { key: 'min', type: 'float' },
    { key: 'max', type: 'float' },
  ],
  },
  'animAnimVariableInt': {
    kind: 'class',
    parent: 'animAnimVariable',
    fields: [
    { key: 'value', type: 'int' },
    { key: 'default', type: 'int' },
    { key: 'min', type: 'int' },
    { key: 'max', type: 'int' },
  ],
  },
  'animAnimVariableQuaternion': {
    kind: 'class',
    parent: 'animAnimVariable',
    fields: [
    { key: 'roll', type: 'float' },
    { key: 'pitch', type: 'float' },
    { key: 'yaw', type: 'float' },
    { key: 'default', type: 'Quaternion' },
  ],
  },
  'animAnimVariableTransform': {
    kind: 'class',
    parent: 'animAnimVariable',
    fields: [
    { key: 'value', type: 'QsTransform' },
    { key: 'default', type: 'QsTransform' },
  ],
  },
  'animAnimVariableVector': {
    kind: 'class',
    parent: 'animAnimVariable',
    fields: [
    { key: 'x', type: 'float' },
    { key: 'y', type: 'float' },
    { key: 'z', type: 'float' },
    { key: 'w', type: 'float' },
    { key: 'default', type: 'Vector4' },
    { key: 'min', type: 'Vector4' },
    { key: 'max', type: 'Vector4' },
  ],
  },
  'animAnimsetWithOverridesTagCondition': {
    kind: 'class',
    parent: 'animIRuntimeCondition',
    fields: [
    { key: 'animsetTags', type: 'redTagList' },
  ],
  },
  'animAxis': { kind: 'enum', values: ['X', 'Y', 'Z', 'NegativeX', 'NegativeY', 'NegativeZ'] },
  'animBoolLink': {
    kind: 'struct',
    fields: [
    { key: 'node', type: { wref: 'animAnimNode_BoolValue' } },
  ],
  },
  'animClampType': { kind: 'enum', values: ['None', 'Clamp', 'WrappedClamp'] },
  'animCollisionRoundedShape': {
    kind: 'struct',
    fields: [
    { key: 'bone', type: 'animTransformIndex' },
    { key: 'transformLS', type: 'QsTransform' },
    { key: 'roundedCornerRadius', type: 'float' },
    { key: 'xBoxExtent', type: 'float' },
    { key: 'yBoxExtent', type: 'float' },
    { key: 'zBoxExtent', type: 'float' },
  ],
  },
  'animCompareFunc': { kind: 'enum', values: ['Equal', 'NotEqual', 'Less', 'LessEqual', 'Greater', 'GreaterEqual'] },
  'animComponentTagCondition': {
    kind: 'class',
    parent: 'animIStaticCondition',
    fields: [
    { key: 'animTag', type: 'cname' },
  ],
  },
  'animConditionalSegmentCondition': {
    kind: 'struct',
    fields: [
    { key: 'lod', type: 'int' },
    { key: 'group', type: 'cname' },
    { key: 'name', type: 'cname' },
    { key: 'animFeatureValue', type: 'bool01' },
  ],
  },
  'animConstraintWeightMode': { kind: 'enum', values: ['Static', 'FloatTrack'] },
  'animCorrectivePoseEntry': {
    kind: 'struct',
    fields: [
    { key: 'comparePose', type: 'cname' },
    { key: 'correctivePose', type: 'cname' },
    { key: 'jointsToCompare', type: { array: 'cname' } },
    { key: 'enabled', type: 'bool01' },
  ],
  },
  'animDangleConstraint_Simulation': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [
    { key: 'collisionRoundedShapes', type: { array: 'animCollisionRoundedShape' } },
    { key: 'jsonCollisionShapes', type: 'ResourceReference' },
    { key: 'jsonCollisionShapesLoadedSuccessfully', type: 'bool01' },
    { key: 'alpha', type: 'float' },
    { key: 'rotateParentToLookAtDangle', type: 'bool01' },
    { key: 'parentRotationAltersTransformsOfDangleAndItsChildren', type: 'bool01' },
    { key: 'parentRotationAltersTransformsOfNonDanglesAndItsChildren', type: 'bool01' },
    { key: 'dangleAltersTransformsOfItsChildren', type: 'bool01' },
  ],
  },
  'animDangleConstraint_SimulationDyng': {
    kind: 'class',
    parent: 'animDangleConstraint_Simulation',
    fields: [
    { key: 'HACK_checkDangleTeleport', type: 'bool01' },
    { key: 'substepTime', type: 'float' },
    { key: 'solverIterations', type: 'int' },
    { key: 'particlesContainer', type: 'animDyngParticlesContainer' },
    { key: 'dyngConstraint', type: { ref: 'animIDyngConstraint' } },
  ],
  },
  'animDyngConstraintCone': {
    kind: 'class',
    parent: 'animIDyngConstraint',
    fields: [
    { key: 'constrainedBone', type: 'animTransformIndex' },
    { key: 'coneAttachmentBone', type: 'animTransformIndex' },
    { key: 'coneTransformLS', type: 'QsTransform' },
    { key: 'constraintType', type: 'animPendulumConstraintType' },
    { key: 'halfOfMaxApertureAngle', type: 'float' },
    { key: 'projectionType', type: 'animPendulumProjectionType' },
    { key: 'collisionCapsuleRadius', type: 'float' },
    { key: 'collisionCapsuleHeightExtent', type: 'float' },
  ],
  },
  'animDyngConstraintEllipsoid': {
    kind: 'class',
    parent: 'animIDyngConstraint',
    fields: [
    { key: 'bone', type: 'animTransformIndex' },
    { key: 'ellipsoidTransformLS', type: 'QsTransform' },
    { key: 'constraintRadius', type: 'float' },
    { key: 'constraintScale1', type: 'float' },
    { key: 'constraintScale2', type: 'float' },
  ],
  },
  'animDyngConstraintLink': {
    kind: 'class',
    parent: 'animIDyngConstraint',
    fields: [
    { key: 'bone1', type: 'animTransformIndex' },
    { key: 'bone2', type: 'animTransformIndex' },
    { key: 'linkType', type: 'animDyngConstraintLinkType' },
    { key: 'lengthLowerBoundRatioPercentage', type: 'float' },
    { key: 'lengthUpperBoundRatioPercentage', type: 'float' },
    { key: 'lookAtAxis', type: 'Vector3' },
  ],
  },
  'animDyngConstraintLinkType': { kind: 'enum', values: ['KeepFixedDistance', 'KeepVariableDistance', 'Greater', 'Closer'] },
  'animDyngConstraintMulti': {
    kind: 'class',
    parent: 'animIDyngConstraint',
    fields: [
    { key: 'innerConstraints', type: { array: { ref: 'animIDyngConstraint' } } },
  ],
  },
  'animDyngParticle': {
    kind: 'struct',
    fields: [
    { key: 'mass', type: 'float' },
    { key: 'damping', type: 'float' },
    { key: 'pullForceFactor', type: 'float' },
    { key: 'isFree', type: 'bool01' },
    { key: 'bone', type: 'animTransformIndex' },
    { key: 'collisionCapsuleRadius', type: 'float' },
    { key: 'collisionCapsuleHeightExtent', type: 'float' },
    { key: 'collisionCapsuleAxisLS', type: 'Vector3' },
    { key: 'projectionType', type: 'animDyngParticleProjectionType' },
  ],
  },
  'animDyngParticleProjectionType': { kind: 'enum', values: ['Disabled', 'ShortestPath', 'Directed'] },
  'animDyngParticlesContainer': {
    kind: 'struct',
    fields: [
    { key: 'externalForceWS', type: 'Vector3' },
    { key: 'externalForceWsLink', type: 'animVectorLink' },
    { key: 'particles', type: { array: 'animDyngParticle' } },
    { key: 'gravityWS', type: 'float' },
  ],
  },
  'animEAnimGraphAdditiveType': { kind: 'enum', values: ['AGAT_Local', 'AGAT_Ref'] },
  'animEAnimGraphCompareFunc': { kind: 'enum', values: ['AGCF_Equal', 'AGCF_NotEqual', 'AGCF_Less', 'AGCF_LessEqual', 'AGCF_Greater', 'AGCF_GreaterEqual'] },
  'animEAnimGraphLogicOp': { kind: 'enum', values: ['AGLO_Or', 'AGLO_And'] },
  'animEAnimGraphMathInterpolation': { kind: 'enum', values: ['AGMI_LINEAR', 'AGMI_SIN', 'AGMI_BEZIER'] },
  'animEAnimGraphMathOp': { kind: 'enum', values: ['AGMO_Add', 'AGMO_Subtract', 'AGMO_Multiply', 'AGMO_Divide', 'AGMO_SafeDivide', 'AGMO_ATan', 'AGMO_AngleDiff', 'AGMO_Length', 'AGMO_Abs'] },
  'animEBlendFromPoseMode': { kind: 'enum', values: ['BFPM_AlwaysOnActivation', 'BFPM_RequestedByTag'] },
  'animEBlendTracksMode': { kind: 'enum', values: ['AGBT_BasePose', 'AGBT_Interpolate', 'AGBT_Add'] },
  'animEBlendTypeLBC': { kind: 'enum', values: ['Linear', 'Smoothstep', 'CustomCurve'] },
  'animEDirectionToEuler': { kind: 'enum', values: ['Pitch', 'Yaw', 'Roll'] },
  'animEFootPhase': { kind: 'enum', values: ['RightUp', 'RightForward', 'LeftUp', 'LeftForward', 'NotConsidered'] },
  'animEInterpolationType': { kind: 'enum', values: ['Lerp', 'Slerp'] },
  'animETransformAxis': { kind: 'enum', values: ['X_Axis', 'Y_Axis', 'Z_Axis'] },
  'animEVectorWsToMsType': { kind: 'enum', values: ['Position', 'Direction'] },
  'animEventFilterType': { kind: 'enum', values: ['Default', 'AlwaysCollect', 'Solo', 'Mute'] },
  'animFloatClamp': {
    kind: 'struct',
    fields: [
    { key: 'useMin', type: 'bool01' },
    { key: 'min', type: 'float' },
    { key: 'useMax', type: 'bool01' },
    { key: 'max', type: 'float' },
  ],
  },
  'animFloatLink': {
    kind: 'struct',
    fields: [
    { key: 'node', type: { wref: 'animAnimNode_FloatValue' } },
  ],
  },
  'animFloatTrackInfo': {
    kind: 'struct',
    fields: [
    { key: 'name', type: 'cname' },
    { key: 'referenceValue', type: 'float' },
  ],
  },
  'animFloatTrackOperationType': { kind: 'enum', values: ['Override', 'Multiply', 'Add', 'Subtract', 'SubtractSwapped', 'WeightComplement'] },
  'animGraphSlotCondition': {
    kind: 'struct',
    fields: [
    { key: 'condition', type: { ref: 'animIStaticCondition' } },
    { key: 'graph', type: 'ResourceReference' },
  ],
  },
  'animHipsIkRequest': {
    kind: 'struct',
    fields: [
    { key: 'leftLegIkChain', type: 'cname' },
    { key: 'rightLegIkChain', type: 'cname' },
    { key: 'hipsTransformIndex', type: 'animTransformIndex' },
    { key: 'leftFootTransformIndex', type: 'animTransformIndex' },
    { key: 'rightFootTransformIndex', type: 'animTransformIndex' },
  ],
  },
  'animIAnimBreakpoint': {
    kind: 'struct',
    fields: [
    { key: 'enabled', type: 'bool01' },
  ],
  },
  'animIAnimDebuggerCommand': {
    kind: 'struct',
    fields: [],
  },
  'animIAnimNodeSourceChannel_Float': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animIAnimNodeSourceChannel_QsTransform': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animIAnimNodeSourceChannel_Quat': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animIAnimNodeSourceChannel_Vector': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animIAnimNode_PostProcess': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [
    { key: 'isEnabled', type: 'bool01' },
  ],
  },
  'animIAnimStateTransitionCondition': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animIAnimStateTransitionInterpolator': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animIAnimationBuffer': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animIDyngConstraint': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animIMotionExtraction': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animIMotionTableProvider': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [
    { key: 'id', type: 'int' },
    { key: 'parentId', type: 'int' },
    { key: 'type', type: 'animMotionTableType' },
    { key: 'action', type: 'animMotionTableAction' },
    { key: 'parentStaticSwitchBranch', type: 'animParentStaticSwitchBranch' },
  ],
  },
  'animIPoseBlendMethod': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animIRuntimeCondition': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animIStaticCondition': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animISyncMethod': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animInertializationFloatClamp': {
    kind: 'struct',
    fields: [
    { key: 'isActive', type: 'bool01' },
    { key: 'min', type: 'float' },
    { key: 'max', type: 'float' },
  ],
  },
  'animInertializationRotationLimit': {
    kind: 'struct',
    fields: [
    { key: 'constrainedTransform', type: 'animTransformIndex' },
    { key: 'limitOnX', type: 'animInertializationFloatClamp' },
    { key: 'limitOnY', type: 'animInertializationFloatClamp' },
    { key: 'limitOnZ', type: 'animInertializationFloatClamp' },
  ],
  },
  'animIntLink': {
    kind: 'struct',
    fields: [
    { key: 'node', type: { wref: 'animAnimNode_IntValue' } },
  ],
  },
  'animLocoStateType': { kind: 'enum', values: ['LS_Pre', 'LS_Loop'] },
  'animLookAtAdditionalPreset': {
    kind: 'class',
    parent: 'IScriptable',
    fields: [],
  },
  'animLookAtAdditionalPreset_BothArms': {
    kind: 'class',
    parent: 'animLookAtAdditionalPreset',
    fields: [
    { key: 'rightHanded', type: 'bool01' },
    { key: 'softLimitAngle', type: 'float' },
  ],
  },
  'animLookAtAdditionalPreset_Eyes': {
    kind: 'class',
    parent: 'animLookAtAdditionalPreset',
    fields: [
    { key: 'softLimitAngle', type: 'float' },
  ],
  },
  'animLookAtAdditionalPreset_FullControl': {
    kind: 'class',
    parent: 'animLookAtAdditionalPreset',
    fields: [
    { key: 'useRightHand', type: 'bool01' },
    { key: 'attachHandToOtherOne', type: 'bool01' },
    { key: 'limits', type: 'LookAtLimits' },
    { key: 'suppress', type: 'float' },
    { key: 'mode', type: 'int' },
  ],
  },
  'animLookAtAdditionalPreset_LeftArm': {
    kind: 'class',
    parent: 'animLookAtAdditionalPreset',
    fields: [
    { key: 'isAiming', type: 'bool01' },
    { key: 'softLimitAngle', type: 'float' },
  ],
  },
  'animLookAtAdditionalPreset_RightArm': {
    kind: 'class',
    parent: 'animLookAtAdditionalPreset',
    fields: [
    { key: 'isAiming', type: 'bool01' },
    { key: 'softLimitAngle', type: 'float' },
  ],
  },
  'animLookAtAnimationDefinition': {
    kind: 'struct',
    fields: [
    { key: 'minTransitionDuration', type: 'float' },
    { key: 'playAnimProbability', type: 'float' },
    { key: 'animDelay', type: 'float' },
    { key: 'animations', type: { array: 'cname' } },
  ],
  },
  'animLookAtParams_Add': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animLookAtParams_Remove': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animLookAtParams_UpdatePositions': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animLookAtPreset': {
    kind: 'class',
    parent: 'IScriptable',
    fields: [],
  },
  'animLookAtPreset_DroneHorizontal': {
    kind: 'class',
    parent: 'animLookAtPreset',
    fields: [
    { key: 'softLimitDegrees', type: 'float' },
    { key: 'hardLimitDegrees', type: 'float' },
    { key: 'hardLimitDistance', type: 'float' },
    { key: 'backLimitDegrees', type: 'float' },
    { key: 'suppress', type: 'float' },
    { key: 'mode', type: 'int' },
  ],
  },
  'animLookAtPreset_DroneVertical': {
    kind: 'class',
    parent: 'animLookAtPreset',
    fields: [
    { key: 'softLimitDegrees', type: 'float' },
    { key: 'hardLimitDegrees', type: 'float' },
    { key: 'hardLimitDistance', type: 'float' },
    { key: 'backLimitDegrees', type: 'float' },
    { key: 'suppress', type: 'float' },
    { key: 'mode', type: 'int' },
  ],
  },
  'animLookAtPreset_Eyes': {
    kind: 'class',
    parent: 'animLookAtPreset',
    fields: [
    { key: 'softLimitAngle', type: 'float' },
  ],
  },
  'animLookAtPreset_EyesHead': {
    kind: 'class',
    parent: 'animLookAtPreset',
    fields: [
    { key: 'suppressHeadAnimation', type: 'float' },
    { key: 'headMobility', type: 'float' },
    { key: 'softLimitAngle', type: 'float' },
  ],
  },
  'animLookAtPreset_EyesHeadWithBodyAttached': {
    kind: 'class',
    parent: 'animLookAtPreset',
    fields: [
    { key: 'suppressHeadAnimation', type: 'float' },
    { key: 'headMobility', type: 'float' },
    { key: 'suppressChestAnimation', type: 'float' },
    { key: 'chestMobility', type: 'float' },
    { key: 'softLimitAngle', type: 'float' },
  ],
  },
  'animLookAtPreset_EyesHeadWithBodyFree': {
    kind: 'class',
    parent: 'animLookAtPreset',
    fields: [
    { key: 'suppressHeadAnimation', type: 'float' },
    { key: 'headMobility', type: 'float' },
    { key: 'suppressChestAnimation', type: 'float' },
    { key: 'chestMobility', type: 'float' },
    { key: 'softLimitAngle', type: 'float' },
  ],
  },
  'animLookAtPreset_EyesHeadWithBodyFreeForFollower': {
    kind: 'class',
    parent: 'animLookAtPreset',
    fields: [
    { key: 'suppressHeadAnimation', type: 'float' },
    { key: 'headMobility', type: 'float' },
    { key: 'suppressChestAnimation', type: 'float' },
    { key: 'chestMobility', type: 'float' },
    { key: 'softLimitAngle', type: 'float' },
  ],
  },
  'animLookAtPreset_EyesHeadWithoutSuppress': {
    kind: 'class',
    parent: 'animLookAtPreset',
    fields: [
    { key: 'headMobility', type: 'float' },
    { key: 'softLimitAngle', type: 'float' },
  ],
  },
  'animLookAtPreset_FullControl': {
    kind: 'class',
    parent: 'animLookAtPreset',
    fields: [
    { key: 'limits', type: 'LookAtLimits' },
    { key: 'eyesSuppress', type: 'float' },
    { key: 'eyesMode', type: 'int' },
    { key: 'headSuppress', type: 'float' },
    { key: 'headMode', type: 'int' },
    { key: 'headSquareScale', type: 'float' },
    { key: 'chestSuppress', type: 'float' },
    { key: 'chestMode', type: 'int' },
    { key: 'chestSquareScale', type: 'float' },
  ],
  },
  'animLookAtRequestForPart': {
    kind: 'struct',
    fields: [
    { key: 'bodyPart', type: 'cname' },
    { key: 'request', type: 'LookAtRequest' },
    { key: 'attachLeftHandToRightHand', type: 'int' },
    { key: 'attachRightHandToLeftHand', type: 'int' },
  ],
  },
  'animLookAtVehicleRestrictionParams': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animMathExpressionNodeData': {
    kind: 'struct',
    fields: [
    { key: 'expression', type: { ref: 'mathExprExpression' } },
    { key: 'floatSockets', type: { array: 'animAnimMathExpressionFloatSocket' } },
    { key: 'vectorSockets', type: { array: 'animAnimMathExpressionVectorSocket' } },
    { key: 'quaternionSockets', type: { array: 'animAnimMathExpressionQuaternionSocket' } },
  ],
  },
  'animMotionTableAction': { kind: 'enum', values: ['MTA_None', 'MTA_Start', 'MTA_Stop', 'MTA_Move', 'MTA_TurnInPlace', 'MTA_TransitionToBackward', 'MTA_BackwardMove', 'MTA_TransitionFromBackward', 'MTA_StrafeLeft', 'MTA_StrafeRight', 'MTA_ForwardToStrafeLeft', 'MTA_ForwardToStrafeRight', 'MTA_StrafeLeftToForward', 'MTA_StrafeRightToForward', 'MTA_BackwardToStrafeLeft', 'MTA_BackwardToStrafeRight', 'MTA_StrafeLeftToBackward', 'MTA_StrafeRightToBackward', 'MTA_BackwardStart', 'MTA_BackwardStop', 'MTA_StrafeLeftStart', 'MTA_StrafeLeftStop', 'MTA_StrafeRightStart', 'MTA_StrafeRightStop', 'MTA_ForwardToWalk', 'MTA_ForwardToJog', 'MTA_ForwardToSprint', 'MTA_HardStopLeftLeg', 'MTA_HardStopRightLeg', 'MTA_RepositionForward', 'MTA_RepositionLeft', 'MTA_RepositionRight', 'MTA_RepositionBackward', 'MTA_Custom', 'MTA_CrowdMove', 'MTA_CrowdMoveSlopes', 'MTA_CrowdMoveStairs', 'MTA_StrafeLeftToStrafeRight', 'MTA_StrafeRightToStrafeLeft', 'MTA_CrowdRelaxedStop', 'MTA_CrowdHardStop', 'MTA_CrowdSprintStop', 'MTA_CrowdFleeStopFront', 'MTA_CrowdFleeStopBack', 'MTA_CrowdRelaxedStart', 'MTA_CrowdFleeStartIdle', 'MTA_CrowdFleeStartMotion', 'MTA_CrowdDirectionalStartFast'] },
  'animMotionTableProvider_Animation': {
    kind: 'class',
    parent: 'animIMotionTableProvider',
    fields: [],
  },
  'animMotionTableProvider_Default': {
    kind: 'class',
    parent: 'animIMotionTableProvider',
    fields: [],
  },
  'animMotionTableProvider_MasterSlaveBlend': {
    kind: 'class',
    parent: 'animIMotionTableProvider',
    fields: [
    { key: 'masterInputIdx', type: 'int' },
  ],
  },
  'animMotionTableProvider_MultiBlend': {
    kind: 'class',
    parent: 'animIMotionTableProvider',
    fields: [],
  },
  'animMotionTableProvider_StaticSwitch': {
    kind: 'class',
    parent: 'animIMotionTableProvider',
    fields: [],
  },
  'animMotionTableType': { kind: 'enum', values: ['MTT_None', 'MTT_Walk', 'MTT_Jog', 'MTT_Sprint', 'MTT_Custom'] },
  'animMotionTag': { kind: 'enum', values: ['MT_Invalid', 'Walk', 'Jog', 'Sprint'] },
  'animMotionWrapper': {
    kind: 'struct',
    fields: [],
  },
  'animNamedTrackIndex': {
    kind: 'struct',
    fields: [
    { key: 'name', type: 'cname' },
  ],
  },
  'animOverrideBlendBoneInfo': {
    kind: 'struct',
    fields: [
    { key: 'transformIndex', type: 'animTransformIndex' },
    { key: 'weight', type: 'float' },
  ],
  },
  'animOverrideBlendTrackInfo': {
    kind: 'struct',
    fields: [
    { key: 'track', type: 'animNamedTrackIndex' },
    { key: 'weight', type: 'float' },
  ],
  },
  'animParentStaticSwitchBranch': { kind: 'enum', values: ['None', 'TrueBranch', 'FalseBranch'] },
  'animPendulumConstraintType': { kind: 'enum', values: ['Cone', 'HingePlane', 'HalfCone'] },
  'animPendulumProjectionType': { kind: 'enum', values: ['Disabled', 'ShortestPathRotational', 'DirectedRotational'] },
  'animPoleVectorDetails': {
    kind: 'struct',
    fields: [
    { key: 'targetBone', type: 'animTransformIndex' },
    { key: 'positionOffset', type: 'Vector3' },
  ],
  },
  'animPoseBlendMethod_BoneBranch': {
    kind: 'class',
    parent: 'animIPoseBlendMethod',
    fields: [
    { key: 'bones', type: { array: 'animOverrideBlendBoneInfo' } },
  ],
  },
  'animPoseBlendMethod_Mask': {
    kind: 'class',
    parent: 'animIPoseBlendMethod',
    fields: [
    { key: 'maskName', type: 'cname' },
  ],
  },
  'animPoseInfoLogger': {
    kind: 'struct',
    fields: [
    { key: 'enabled', type: 'bool01' },
    { key: 'showStackTransformsCount', type: 'bool01' },
    { key: 'showStackTracksCount', type: 'bool01' },
    { key: 'entries', type: { array: { ref: 'animPoseInfoLoggerEntry' } } },
  ],
  },
  'animPoseInfoLoggerEntry': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [],
  },
  'animPoseInfoLoggerEntry_FloatTrack': {
    kind: 'class',
    parent: 'animPoseInfoLoggerEntry',
    fields: [
    { key: 'floatTrack', type: 'animNamedTrackIndex' },
    { key: 'showOnlyWhenPositive', type: 'bool01' },
  ],
  },
  'animPoseInfoLoggerEntry_Transform': {
    kind: 'class',
    parent: 'animPoseInfoLoggerEntry',
    fields: [
    { key: 'transform', type: 'animTransformIndex' },
    { key: 'logInModelSpace', type: 'bool01' },
  ],
  },
  'animPoseLink': {
    kind: 'struct',
    fields: [
    { key: 'node', type: { wref: 'animAnimNode_Base' } },
  ],
  },
  'animQuaternionInterpolationType': { kind: 'enum', values: ['Linear', 'Spherical'] },
  'animQuaternionLink': {
    kind: 'struct',
    fields: [
    { key: 'node', type: { wref: 'animAnimNode_QuaternionValue' } },
  ],
  },
  'animRigTagCondition': {
    kind: 'class',
    parent: 'animIStaticCondition',
    fields: [
    { key: 'tag', type: 'cname' },
  ],
  },
  'animSBehaviorConstraintNodeFloorIKCommonData': {
    kind: 'struct',
    fields: [
    { key: 'gravityCentreBone', type: 'animTransformIndex' },
    { key: 'rootRotationBlendTime', type: 'float' },
    { key: 'verticalVelocityOffsetUpBlendTime', type: 'float' },
    { key: 'verticalVelocityOffsetDownBlendTime', type: 'float' },
    { key: 'slidingOnSlopeBlendTime', type: 'float' },
  ],
  },
  'animSBehaviorConstraintNodeFloorIKLegsData': {
    kind: 'struct',
    fields: [
    { key: 'verticalOffsetBlendUpTime', type: 'float' },
    { key: 'verticalOffsetBlendDownTime', type: 'float' },
  ],
  },
  'animSBehaviorConstraintNodeFloorIKVerticalBoneData': {
    kind: 'struct',
    fields: [
    { key: 'bone', type: 'animTransformIndex' },
    { key: 'offsetToDesiredBlendTime', type: 'float' },
    { key: 'verticalOffsetBlendTime', type: 'float' },
    { key: 'stiffness', type: 'float' },
  ],
  },
  'animSTwoBonesIKSolverData': {
    kind: 'struct',
    fields: [
    { key: 'upperBone', type: 'animTransformIndex' },
    { key: 'jointBone', type: 'animTransformIndex' },
    { key: 'subLowerBone', type: 'animTransformIndex' },
    { key: 'lowerBone', type: 'animTransformIndex' },
    { key: 'ikBone', type: 'animTransformIndex' },
    { key: 'limitToLengthPercentage', type: 'float' },
    { key: 'reverseBend', type: 'bool01' },
    { key: 'allowToLock', type: 'bool01' },
    { key: 'autoSetupDirs', type: 'bool01' },
    { key: 'jointSideWeightUpper', type: 'float' },
    { key: 'jointSideWeightJoint', type: 'float' },
    { key: 'jointSideWeightLower', type: 'float' },
  ],
  },
  'animSetBoneTransformEntry': {
    kind: 'struct',
    fields: [
    { key: 'transformToChange', type: 'animTransformIndex' },
    { key: 'setMethod', type: 'animSetBoneTransformEntry_SetMethod' },
    { key: 'snapToReference', type: 'bool01' },
    { key: 'sourceBone', type: 'animTransformIndex' },
    { key: 'offsetToReference', type: 'bool01' },
    { key: 'offsetSpaceBone', type: 'animTransformIndex' },
    { key: 'offset', type: 'QsTransform' },
  ],
  },
  'animSetBoneTransformEntry_SetMethod': { kind: 'enum', values: ['NoSnapping', 'WholeTransform', 'TranslationOnly', 'RotationOnly'] },
  'animSimpleBounceTrackOutput': {
    kind: 'struct',
    fields: [
    { key: 'targetTrack', type: 'animNamedTrackIndex' },
    { key: 'multiplier', type: 'float' },
  ],
  },
  'animSimpleBounceTransformOutput': {
    kind: 'struct',
    fields: [
    { key: 'targetTransform', type: 'animTransformIndex' },
    { key: 'parentTransform', type: 'animTransformIndex' },
    { key: 'targetTransformChannel', type: 'animTransformChannel' },
    { key: 'multiplier', type: 'float' },
    { key: 'channelEntries', type: { array: 'animSimpleBounceTransformOutput_ChannelEntry' } },
  ],
  },
  'animSimpleBounceTransformOutput_ChannelEntry': {
    kind: 'struct',
    fields: [
    { key: 'transformChannel', type: 'animTransformChannel' },
    { key: 'multiplier', type: 'float' },
  ],
  },
  'animSmoothFloatClamp': {
    kind: 'struct',
    fields: [
    { key: 'min', type: 'float' },
    { key: 'max', type: 'float' },
    { key: 'marginEaseOutCurve', type: 'CurveDataFloat' },
  ],
  },
  'animSnapToTerrainIkRequest': {
    kind: 'struct',
    fields: [
    { key: 'ikChain', type: 'cname' },
    { key: 'footTransformIndex', type: 'animTransformIndex' },
    { key: 'poleVectorRefTransformIndex', type: 'animTransformIndex' },
    { key: 'enableFootLockFloatTrack', type: 'animNamedTrackIndex' },
  ],
  },
  'animStackTransformsExtender_SnapToBoneMethod': { kind: 'enum', values: ['NoSnapping', 'WholeTransform', 'TranslationOnly', 'RotationOnly'] },
  'animSyncMethodByEvent': {
    kind: 'class',
    parent: 'animISyncMethod',
    fields: [
    { key: 'eventName', type: 'cname' },
  ],
  },
  'animSyncMethodByFootPhase': {
    kind: 'class',
    parent: 'animISyncMethod',
    fields: [],
  },
  'animSyncMethodByProgress': {
    kind: 'class',
    parent: 'animISyncMethod',
    fields: [],
  },
  'animSyncMethodLocomotion': {
    kind: 'class',
    parent: 'animISyncMethod',
    fields: [
    { key: 'locomotionFeatureName', type: 'cname' },
    { key: 'accelStopTimeEvent', type: 'cname' },
  ],
  },
  'animTEMP_IKTargetsControllerBodyType': {
    kind: 'struct',
    fields: [
    { key: 'genderTag', type: 'cname' },
    { key: 'bodyTypeTag', type: 'cname' },
    { key: 'ikChainSettings', type: { array: 'IKChainSettings' } },
  ],
  },
  'animTransformChannel': { kind: 'enum', values: ['PosX', 'PosY', 'PosZ', 'RotX', 'RotY', 'RotZ', 'ScaleX', 'ScaleY', 'ScaleZ'] },
  'animTransformIndex': {
    kind: 'struct',
    fields: [
    { key: 'name', type: 'cname' },
  ],
  },
  'animTransformInfo': {
    kind: 'struct',
    fields: [
    { key: 'name', type: 'cname' },
    { key: 'parentName', type: 'cname' },
    { key: 'referenceTransformLs', type: 'QsTransform' },
  ],
  },
  'animTransformLink': {
    kind: 'struct',
    fields: [
    { key: 'node', type: { wref: 'animAnimNode_TransformValue' } },
  ],
  },
  'animTwistOutput': {
    kind: 'struct',
    fields: [
    { key: 'positiveScale', type: 'float' },
    { key: 'negativeScale', type: 'float' },
    { key: 'twistAxis', type: 'animAxis' },
    { key: 'twistedTransform', type: 'animTransformIndex' },
    { key: 'outputAngleTrack', type: 'animNamedTrackIndex' },
  ],
  },
  'animVectorCoordinateType': { kind: 'enum', values: ['X', 'Y', 'Z', 'W'] },
  'animVectorLink': {
    kind: 'struct',
    fields: [
    { key: 'node', type: { wref: 'animAnimNode_VectorValue' } },
  ],
  },
  'animVisualTagCondition': {
    kind: 'class',
    parent: 'animIStaticCondition',
    fields: [
    { key: 'visualTag', type: 'cname' },
  ],
  },
  'animfssBodyOfflineParams': {
    kind: 'struct',
    fields: [
    { key: 'HipsTilt', type: 'float' },
    { key: 'HipsShift', type: 'float' },
    { key: 'LegsPullFactorMin', type: 'float' },
    { key: 'LegsPullFactorMax', type: 'float' },
    { key: 'LegLengthAdjustment', type: 'float' },
    { key: 'LegMaxStretchOffset', type: 'float' },
    { key: 'LegMaxStretchAdjustment', type: 'float' },
  ],
  },
  'mathExprExpression': {
    kind: 'class',
    parent: 'ISerializable',
    fields: [
    { key: 'tokenData', type: { array: 'int' } },
    { key: 'valuesData', type: { array: 'float' } },
    { key: 'returnVarType', type: 'int' },
  ],
  },
  'redTagList': {
    kind: 'struct',
    fields: [
    { key: 'tags', type: { array: 'cname' } },
  ],
  },
}

export const ANIMGRAPH_TYPE_DEFINITIONS: Record<string, AnimTypeDef> = {
  ...PRIMITIVE_TYPE_DEFINITIONS,
  ...ENGINE_STRUCT_SUPPLEMENT,
  ...RTTI_TYPE_DEFINITIONS,
}

ANIMGRAPH_TYPE_DEFINITIONS['EInterpolationType'] = ANIMGRAPH_TYPE_DEFINITIONS['animEInterpolationType']
ANIMGRAPH_TYPE_DEFINITIONS['EBlendTypeLBC'] = ANIMGRAPH_TYPE_DEFINITIONS['animEBlendTypeLBC']
ANIMGRAPH_TYPE_DEFINITIONS['AnimStateInterpolationType'] = ANIMGRAPH_TYPE_DEFINITIONS['animAnimStateInterpolationType']
