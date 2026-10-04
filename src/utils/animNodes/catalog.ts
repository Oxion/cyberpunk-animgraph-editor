import type { NodeDefinition } from '../NodeDefinition'

/** Node-layer catalog. Pin vs contain is projection. */
export const NODE_DEFINITION_ENTRIES: ReadonlyArray<readonly [string, NodeDefinition]> = [
    // Root node
    ['animAnimNode_Root', {
      fieldConstraints: {
        nodes: {
          uniqueTypes: ['animAnimNode_Output'],
          order: 'output-first',
        },
      },
      description: 'Root node with no inputs, has child nodes'
    }],

    // Blend nodes
    ['animAnimNode_Blend2', {
      description: 'Blends two input nodes with sync method and weight control',
      dataTemplate: {
        "$type": "animAnimNode_Blend2",
        "firstInputNode": {
          "$type": "animPoseLink",
          "node": null
        },
        "maxInputValue": 1,
        "minInputValue": 0,
        "secondInputNode": {
          "$type": "animPoseLink",
          "node": null
        },
        "syncMethod": null,
        "timeWarpingEnabled": 0,
        "weightNode": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],

    ['animAnimNode_BlendAdditive', {
      description: 'Additive blend of two input nodes'
    }],

    ['animAnimNode_BlendMultiple', {
      description: 'Blends multiple input nodes with weights'
    }],

    ['animAnimNode_BlendOverride', {
      description: 'Override blend with base and override inputs',
      dataTemplate: {
        "$type": "animAnimNode_BlendOverride",
        "blendAllTracks": 1,
        "blendMethod": null,
        "blendTrackMode": "AGBT_Interpolate",
        "bones": [],
        "getDeltaMotionFromOverride": 0,
        "id": 4294967295,
        "inputNode": {
          "$type": "animPoseLink",
          "node": null
        },
        "overrideInputNode": {
          "$type": "animPoseLink",
          "node": null
        },
        "postProcess": null,
        "syncMethod": null,
        "timeWarpingEnabled": 0,
        "tracks": [],
        "weightNode": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],

    ['animAnimNode_BlendFromPose', {
      description: 'Blend from previous pose on activation',
      dataTemplate: {
        "$type": "animAnimNode_BlendFromPose",
        "blendTime": 0,
        "blendType": "Linear",
        "customBlendCurve": {
          "InterpolationType": "Linear",
          "LinkType": "ESLT_Normal",
          "Elements": []
        },
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "mode": "BFPM_AlwaysOnActivation",
        "requestedByTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        }
      }
    }],

    ['animAnimNode_SharedMetaPose', {
      description: 'Shared meta pose with weight',
      dataTemplate: {
        "$type": "animAnimNode_SharedMetaPose",
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "weightLink": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],

    ['animAnimNode_SharedMetaPoseAdditive', {
      description: 'Shared meta pose additive blend with weight',
      dataTemplate: {
        "$type": "animAnimNode_SharedMetaPoseAdditive",
        "additiveType": "AGAT_Local",
        "blendTracks": "AGBT_Interpolate",
        "convertParentPoseToAdditive": 0,
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "weightLink": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],

    ['animAnimNode_BlendByMaskDynamic', {
      description: 'Dynamic mask blend of two poses',
      dataTemplate: {
        "$type": "animAnimNode_BlendByMaskDynamic",
        "base": {
          "$type": "animPoseLink",
          "node": null
        },
        "blend": {
          "$type": "animPoseLink",
          "node": null
        },
        "id": 4294967295,
        "mask": {
          "$type": "animIntLink",
          "node": null
        },
        "masks": [],
        "syncMethod": null,
        "weight": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],

    // Math operation nodes
    ['animAnimNode_FloatMathOp', {
      description: 'Mathematical operation on two float inputs'
    }],

    ['animAnimNode_FloatComparator', {
      description: 'Compares two float inputs'
    }],

    ['animAnimNode_FloatJoin', {
      description: 'Joins float input'
    }],

    ['animAnimNode_VectorJoin', {
      description: 'Joins vector input',
      dataTemplate: {
        "$type": "animAnimNode_VectorJoin",
        "id": 4294967295,
        "input": {
          "$type": "animVectorLink",
          "node": null
        }
      }
    }],

    ['animAnimNode_FloatLatch', {
      description: 'Latches float input',
      dataTemplate: {
        "$type": "animAnimNode_FloatLatch",
        "id": 4294967295,
        "input": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],

    ['animAnimNode_DampFloat', {
      description: 'Damps float input'
    }],

    ['animAnimNode_DampVector', {
      description: 'Damps vector input',
      dataTemplate: {
        "$type": "animAnimNode_DampVector",
        "defaultDecreaseSpeed": {
          "$type": "Vector4",
          "W": 0,
          "X": 0,
          "Y": 0,
          "Z": 0
        },
        "defaultIncreaseSpeed": {
          "$type": "Vector4",
          "W": 0,
          "X": 0,
          "Y": 0,
          "Z": 0
        },
        "defaultInitialValue": {
          "$type": "Vector4",
          "W": 0,
          "X": 0,
          "Y": 0,
          "Z": 0
        },
        "decreaseSpeedNode": {
          "$type": "animVectorLink",
          "node": null
        },
        "id": 4294967295,
        "increaseSpeedNode": {
          "$type": "animVectorLink",
          "node": null
        },
        "inputNode": {
          "$type": "animVectorLink",
          "node": null
        },
        "startFromDefaultValue": 0
      }
    }],

    ['animAnimNode_CurveFloatValue', {
      description: 'Applies curve to float argument',
      dataTemplate: {
        "$type": "animAnimNode_CurveFloatValue",
        "argument": {
          "$type": "animFloatLink",
          "node": null
        },
        "id": 4294967295
      }
    }],

    ['animAnimNode_SpringDamp', {
      description: 'Applies spring damping to input'
    }],

    ['animAnimNode_FloatCumulative', {
      description: 'Accumulates float input over time',
      dataTemplate: {
        "$type": "animAnimNode_FloatCumulative",
        "clamp": 0,
        "curValue": {
          "$type": "animFloatLink",
          "node": null
        },
        "defaultValue": 0,
        "id": 4294967295,
        "inputNode": {
          "$type": "animFloatLink",
          "node": null
        },
        "maxValue": {
          "$type": "animFloatLink",
          "node": null
        },
        "minValue": {
          "$type": "animFloatLink",
          "node": null
        },
        "normalize180": 0,
        "normalize180Input": {
          "$type": "animBoolLink",
          "node": null
        },
        "override": {
          "$type": "animBoolLink",
          "node": null
        },
        "resetExternalEventName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "resetOnActivation": 0,
        "resetSpeed": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],

    ['animAnimNode_ValueBySpeed', {
      description: 'Float value driven by speed',
      dataTemplate: {
        "$type": "animAnimNode_ValueBySpeed",
        "clampType": "None",
        "defaultValue": 0,
        "id": 4294967295,
        "rangeMax": 0,
        "rangeMin": 0,
        "resetOnActivation": 0,
        "speed": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],

    // State machine nodes
    ['animAnimNode_StateMachine', {
      description: 'State machine with multiple input categories',
      dataTemplate: {
        "$type": "animAnimNode_StateMachine",
        "anyStateInterpolator": null,
        "conditionalEntries": [],
        "defaultStateIndex": 0,
        "frozenState": null,
        "globalTransitions": [],
        "id": 4294967295,
        "notifyOnEnterState": 0,
        "states": [],
        "transitions": []
      }
    }],

    ['animAnimNode_State', {
      fieldConstraints: {
        nodes: {
          uniqueTypes: ['animAnimNode_Output'],
          requireTypes: ['animAnimNode_Output'],
          order: 'output-first',
        },
      },
      description: 'State container; pose graph lives in child nodes',
      dataTemplate: {
        "$type": "animAnimNode_State",
        "id": 4294967295,
        "name": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "nodes": [],
        "outTransitionIndices": [],
        "preventTransitionsInActivationFrame": 0,
        "requiredQualityDistanceCategory": 4,
        "tags": []
      }
    }],

    ['animAnimNode_StateFrozen', {
      fieldConstraints: {
        nodes: {
          uniqueTypes: ['animAnimNode_Output'],
          requireTypes: ['animAnimNode_Output'],
          order: 'output-first',
        },
      },
      description: 'Frozen state with node inputs',
      // Engine: SM.frozenState scalar — not a member of SM.states.
      allowedParentSlots: [
        { parentType: 'animAnimNode_StateMachine', slot: 'frozenState' },
      ],
      dataTemplate: {
        "$type": "animAnimNode_StateFrozen",
        "id": 4294967295,
        "name": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "nodes": [],
        "outTransitionIndices": [],
        "preventTransitionsInActivationFrame": 0,
        "requiredQualityDistanceCategory": 4,
        "tags": []
      }
    }],

    ['animAnimNode_Switch', {
      description: 'Switch node with multiple inputs and weight control',
      fieldConstraints: {
        blendTime: { range: { min: 0, max: 10, step: 0.01 } },
        numInputs: {
          derivedFrom: { kind: 'arrayLength', key: 'inputNodes' },
        },
      },
      dataTemplate: {
        "$type": "animAnimNode_Switch",
        "blendTime": 0,
        "canRequestInertialization": 0,
        "id": 4294967295,
        "inputNodes": [
          {
            "$type": "animPoseLink",
            "node": null
          }
        ],
        "motionProvider": null,
        "numInputs": 3,
        "poseInfoLogger": null,
        "pushDataByTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "syncMethod": null,
        "timeWarpingEnabled": 0,
        "weightNode": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],

    // Animation nodes
    ['animAnimNode_SkAnim', {
      description: 'Animation node with no connections',
      dataTemplate: {
        "$type": "animAnimNode_SkAnim",
        "animation": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "animLoopEventName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "applyInertializationOnAnimSetSwap": 1,
        "applyMotion": 1,
        "clipEnd": 0,
        "clipEndByEvent": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "clipFront": 0,
        "clipFrontByEvent": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "collectEvents": 1,
        "convertToAdditive": 0,
        "fireAnimLoopEvent": 0,
        "id": 4294967295,
        "isLooped": 0,
        "motionProvider": null,
        "popDataByTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "pushDataByTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "pushSafeCutTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "resume": 0
      }
    }],

    ['animAnimNode_SkDurationAnim', {
      description: 'Duration-based animation with duration input'
    }],

    ['animAnimNode_SkOneShotAnim', {
      description: 'One-shot animation with input trigger'
    }],

    ['animAnimNode_SkPhaseAnim', {
      description: 'Phase animation with no connections'
    }],

    ['animAnimNode_SkPhaseWithDurationAnim', {
      description: 'Phase animation with duration link',
      dataTemplate: {
        "$type": "animAnimNode_SkPhaseWithDurationAnim",
        "animation": {
          "$type": "CName",
          "$storage": "string",
          "$value": "equip"
        },
        "animLoopEventName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "active_reload_end"
        },
        "applyInertializationOnAnimSetSwap": 1,
        "applyMotion": 1,
        "clipEnd": 0,
        "clipEndByEvent": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "clipFront": 0,
        "clipFrontByEvent": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "collectEvents": 1,
        "convertToAdditive": 0,
        "durationLink": {
          "$type": "animFloatLink",
          "node": null
        },
        "fireAnimLoopEvent": 1,
        "id": 4294967295,
        "isLooped": 0,
        "motionProvider": null,
        "phase": {
          "$type": "CName",
          "$storage": "string",
          "$value": "active"
        },
        "popDataByTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "pushDataByTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "pushSafeCutTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "resume": 0
      }
    }],

    ['animAnimNode_SkSpeedAnim', {
      description: 'Speed-controlled animation',
      dataTemplate: {
        "$type": "animAnimNode_SkSpeedAnim",
        "animation": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "animLoopEventName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "applyInertializationOnAnimSetSwap": 1,
        "applyMotion": 1,
        "clipEnd": 0,
        "clipEndByEvent": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "clipFront": 0,
        "clipFrontByEvent": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "collectEvents": 1,
        "convertToAdditive": 0,
        "fireAnimLoopEvent": 1,
        "id": 4294967295,
        "isLooped": 0,
        "motionProvider": null,
        "popDataByTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "pushDataByTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "pushSafeCutTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "resume": 0,
        "Speed": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],

    ['animAnimNode_SkFrameAnim', {
      description: 'Frame-based animation with frame, progress and time links'
    }],

    // Stage and pose nodes
    ['animAnimNode_Stage', {
      fieldConstraints: {
        nodes: {
          uniqueTypes: ['animAnimNode_Output'],
          requireTypes: ['animAnimNode_Output'],
          order: 'output-first',
        },
      },
      description: 'Stage container with pose input array',
      dataTemplate: {
        "$type": "animAnimNode_Stage",
        "id": 4294967295,
        "inputPoses": [
          {
            "$type": "animPoseLink",
            "node": null
          }
        ],
        "nodes": []
      }
    }],

    ['animAnimNode_StagePoseEntry', {
      description: 'Stage pose entry with parent input'
    }],

    ['animAnimNode_Join', {
      description: 'Join node combining multiple inputs'
    }],

    ['animAnimNode_Output', {
      description: 'Output node with single input',
      // Engine: Container treats nodes[0] as the output node (State / StateFrozen / Root).
      allowedParentSlots: [
        { parentType: 'animAnimNode_State', slot: 'nodes' },
        { parentType: 'animAnimNode_StateFrozen', slot: 'nodes' },
        { parentType: 'animAnimNode_Root', slot: 'nodes' },
      ],
      dataTemplate: {
        "$type": "animAnimNode_Output",
        "id": 4294967295,
        "node": {
          "$type": "animPoseLink",
          "node": null
        }
      }
    }],

    // Transform nodes
    ['animAnimNode_TranslateBone', {
      description: 'Bone translation with input node and translation input'
    }],

    ['animAnimNode_SetBoneTransform', {
      description: 'Bone transform setting with input'
    }],
    ['animAnimNode_StackTransformsShrinker', {
      description: 'Stack transforms shrinker with input'
    }],
    ['animAnimNode_StackTransformsExtender', {
      description: 'Stack transforms extender with input',
      fieldConstraints: {
        transformInfos: { sameLength: 'transforms' },
        snapMethods: { sameLength: 'transforms' },
        snapToReferenceValues: { sameLength: 'transforms' },
        snapTargetBones: { sameLength: 'transforms' },
        offsetToReferenceValues: { sameLength: 'transforms' },
        offsetSpaceBones: { sameLength: 'transforms' },
        offsets: { sameLength: 'transforms' },
      },
    }],
    ['animAnimNode_StackTracksShrinker', {
      description: 'Stack tracks shrinker with input'
    }],
    ['animAnimNode_StackTracksExtender', {
      description: 'Stack tracks extender with input'
    }],
    ['animAnimNode_RotateBone', {
      description: 'Rotate bone with input'
    }],
    ['animAnimNode_SetBonePosition', {
      description: 'Set bone position with input'
    }],
    ['animAnimNode_SetBoneOrientation', {
      description: 'Set bone orientation with input',
      dataTemplate: {
        "$type": "animAnimNode_SetBoneOrientation",
        "bone": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "orientationMs": {
          "$type": "animQuaternionLink",
          "node": null
        }
      }
    }],

    // Input nodes (no inputs, only children)
    ['animAnimNode_Timer', {
      description: 'Timer node with no connections'
    }],

    ['animAnimNode_FloatInput', {
      description: 'Float input node with no connections',
      dataTemplate: {
        "$type": "animAnimNode_FloatInput",
        "group": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "id": 4294967295,
        "name": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        }
      }
    }],

    ['animAnimNode_FloatConstant', {
      description: 'Float constant node with no connections',
      dataTemplate: {
        "$type": "animAnimNode_FloatConstant",
        "id": 4294967295,
        "value": 0
      }
    }],

    ['animAnimNode_FloatVariable', {
      description: 'Float variable node with no connections',
      dataTemplate: {
        "$type": "animAnimNode_FloatVariable",
        "id": 4294967295,
        "variableName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
      }
    }],

    ['animAnimNode_BoolVariable', {
      description: 'Boolean variable',
      dataTemplate: {
        "$type": "animAnimNode_BoolVariable",
        "id": 4294967295,
        "variableName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        }
      }
    }],

    ['animAnimNode_IntVariable', {
      description: 'Integer variable',
      dataTemplate: {
        "$type": "animAnimNode_IntVariable",
        "id": 4294967295,
        "variableName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        }
      }
    }],

    ['animAnimNode_FloatRandom', {
      description: 'Float random node with no connections'
    }],

    ['animAnimNode_BoolInput', {
      description: 'Boolean input node with no connections'
    }],

    ['animAnimNode_IntInput', {
      description: 'Integer input node with no connections',
      dataTemplate: {
        "$type": "animAnimNode_IntInput",
        "group": {
          "$type": "CName",
          "$storage": "string",
          "$value": "RandomSync"
        },
        "id": 4294967295,
        "name": {
          "$type": "CName",
          "$storage": "string",
          "$value": "value"
        }
      }
    }],
    ['animAnimNode_QuaternionInput', {
      description: 'Quaternion input node with no connections'
    }],
    ['animAnimNode_QuaternionConstant', {
      description: 'Quaternion constant',
      dataTemplate: {
        "$type": "animAnimNode_QuaternionConstant",
        "id": 4294967295,
        "value": {
          "$type": "Quaternion",
          "i": 0,
          "j": 0,
          "k": 0,
          "r": 1
        }
      }
    }],
    ['animAnimNode_NameHashConstant', {
      description: 'Name hash constant',
      dataTemplate: {
        "$type": "animAnimNode_NameHashConstant",
        "id": 4294967295,
        "value": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        }
      }
    }],
    ['animAnimNode_FPPCameraSharedVar', {
      description: 'FPP camera shared float',
      dataTemplate: {
        "$type": "animAnimNode_FPPCameraSharedVar",
        "id": 4294967295
      }
    }],

    // Converter nodes
    ['animAnimNode_BoolToFloatConverter', {
      description: 'Boolean to float converter'
    }],

    ['animAnimNode_IntToFloatConverter', {
      description: 'Integer to float converter',
      dataTemplate: {
        "$type": "animAnimNode_IntToFloatConverter",
        "id": 4294967295,
        "inputNode": {
          "$type": "animIntLink",
          "node": null
        }
      }
    }],

    ['animAnimNode_FloatToIntConverter', {
      description: 'Float to integer converter',
      dataTemplate: {
        "$type": "animAnimNode_FloatToIntConverter",
        "id": 4294967295,
        "inputNode": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],

    ['animAnimNode_FloatClamp', {
      description: 'Float clamping with input'
    }],

    ['animAnimNode_FloatInterpolation', {
      description: 'Float interpolation with input'
    }],

    ['animAnimNode_VectorInterpolation', {
      description: 'Interpolates two vectors',
      dataTemplate: {
        "$type": "animAnimNode_VectorInterpolation",
        "firstInput": {
          "$type": "animVectorLink",
          "node": null
        },
        "id": 4294967295,
        "secondInput": {
          "$type": "animVectorLink",
          "node": null
        },
        "weight": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],

    ['animAnimNode_QuaternionInterpolation', {
      description: 'Interpolates two quaternions',
      dataTemplate: {
        "$type": "animAnimNode_QuaternionInterpolation",
        "firstInput": {
          "$type": "animQuaternionLink",
          "node": null
        },
        "id": 4294967295,
        "interpolationType": "Linear",
        "secondInput": {
          "$type": "animQuaternionLink",
          "node": null
        },
        "weight": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],

    ['animAnimNode_VectorWsToMs', {
      description: 'Converts world-space vector to model space',
      dataTemplate: {
        "$type": "animAnimNode_VectorWsToMs",
        "id": 4294967295,
        "type": "Position",
        "vectorWs": {
          "$type": "animVectorLink",
          "node": null
        }
      }
    }],

    // Math expression nodes
    ['animAnimNode_MathExpressionFloat', {
      description: 'Float math expression with expression data'
    }],

    ['animAnimNode_MathExpressionVector', {
      description: 'Vector math expression with expression data'
    }],

    ['animAnimNode_MathExpressionNodeData', {
      description: 'Math expression node data with multiple socket types'
    }],

    // Animation database
    ['animAnimNode_AnimDatabase', {
      description: 'Animation database with input links and duration'
    }],

    // Value nodes
    ['animAnimNode_TagValue', {
      description: 'Tag value node with no connections'
    }],

    ['animAnimNode_EventValue', {
      description: 'Event value node with no connections'
    }],

    ['animAnimNode_WrapperValue', {
      description: 'Wrapper value node with no connections',
      dataTemplate: {
        "$type": "animAnimNode_WrapperValue",
        "id": 4294967295,
        "logicOp": "AGLO_Or",
        "oneMinus": 0,
        "wrapperNames": [
          {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        ]
      }
    }],

    ['animAnimNode_Event', {
      description: 'Event node with no connections'
    }],

    ['animAnimNode_Signal', {
      description: 'Signal node with no connections'
    }],

    ['animAnimNode_IdentityPoseTerminator', {
      description: 'Identity pose terminator with no connections'
    }],

    ['animAnimNode_ReferencePoseTerminator', {
      description: 'Reference pose terminator with no connections',
      dataTemplate: {
        "$type": "animAnimNode_ReferencePoseTerminator",
        "id": 4294967295
      }
    }],

    // Pose blend method
    ['animPoseBlendMethod_BoneBranch', {
      description: 'Bone branch pose blend method with no connections',
      dataTemplate: {
        "$type": "animPoseBlendMethod_BoneBranch",
        "bones": []
      }
    }],

    ['animPoseBlendMethod_Mask', {
      description: 'Mask pose blend method',
      dataTemplate: {
        "$type": "animPoseBlendMethod_Mask",
        "maskName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        }
      }
    }],

    ['animSyncMethodByProgress', {
      description: 'Sync by animation progress',
      dataTemplate: {
        "$type": "animSyncMethodByProgress"
      }
    }],

    ['mathExprExpression', {
      description: 'Compiled math expression',
      dataTemplate: {
        "$type": "mathExprExpression",
        "returnVarType": 0,
        "tokenData": [],
        "valuesData": []
      }
    }],

    ['animAnimVariableContainer', {
      description: 'Graph variable container',
      dataTemplate: {
        "$type": "animAnimVariableContainer",
        "boolVariables": [],
        "floatVariables": [],
        "intVariables": [],
        "quaternionVariables": [],
        "transformVariables": [],
        "vectorVariables": []
      }
    }],

    ['animAnimVariableBool', {
      description: 'Graph bool variable',
      dataTemplate: {
        "$type": "animAnimVariableBool",
        "default": 0,
        "name": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "value": 0
      }
    }],

    ['animAnimVariableFloat', {
      description: 'Graph float variable',
      dataTemplate: {
        "$type": "animAnimVariableFloat",
        "default": 0,
        "max": 0,
        "min": 0,
        "name": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "value": 0
      }
    }],

    ['animAnimVariableInt', {
      description: 'Graph int variable',
      dataTemplate: {
        "$type": "animAnimVariableInt",
        "default": 0,
        "max": 0,
        "min": 0,
        "name": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "value": 0
      }
    }],

    ['animAnimVariableVector', {
      description: 'Graph vector variable',
      dataTemplate: {
        "$type": "animAnimVariableVector",
        "default": {
          "$type": "Vector4",
          "W": 0,
          "X": 0,
          "Y": 0,
          "Z": 0
        },
        "max": {
          "$type": "Vector4",
          "W": 0,
          "X": 0,
          "Y": 0,
          "Z": 0
        },
        "min": {
          "$type": "Vector4",
          "W": 0,
          "X": 0,
          "Y": 0,
          "Z": 0
        },
        "name": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "w": 0,
        "x": 0,
        "y": 0,
        "z": 0
      }
    }],

    ['animPoseInfoLoggerEntry_FloatTrack', {
      description: 'Pose info logger float track entry',
      dataTemplate: {
        "$type": "animPoseInfoLoggerEntry_FloatTrack",
        "floatTrack": {
          "$type": "animNamedTrackIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "showOnlyWhenPositive": 0
      }
    }],

    ['animAdditionalTransformEntry', {
      description: 'Additional transform entry',
      dataTemplate: {
        "$type": "animAdditionalTransformEntry",
        "transformInfo": {
          "$type": "animTransformInfo",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          },
          "parentName": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          },
          "referenceTransformLs": {
            "$type": "QsTransform",
            "Rotation": {
              "$type": "Quaternion",
              "i": 0,
              "j": 0,
              "k": 0,
              "r": 1
            },
            "Scale": {
              "$type": "Vector4",
              "W": 1,
              "X": 1,
              "Y": 1,
              "Z": 1
            },
            "Translation": {
              "$type": "Vector4",
              "W": 1,
              "X": 0,
              "Y": 0,
              "Z": 0
            }
          }
        },
        "value": {
          "$type": "QsTransform",
          "Rotation": {
            "$type": "Quaternion",
            "i": 0,
            "j": 0,
            "k": 0,
            "r": 1
          },
          "Scale": {
            "$type": "Vector4",
            "W": 1,
            "X": 1,
            "Y": 1,
            "Z": 1
          },
          "Translation": {
            "$type": "Vector4",
            "W": 1,
            "X": 0,
            "Y": 0,
            "Z": 0
          }
        }
      }
    }],

    // Expression data
    ['animAnimNode_expressionData_any', {
      description: 'Expression data node with expression data'
    }],

    // State transition conditions
    ['animAnimStateTransitionCondition_HasAnimation', {
      description: 'Has animation condition with no connections'
    }],

    ['animAnimStateTransitionCondition_FloatFeature', {
      description: 'Float feature condition with no connections'
    }],

    ['animAnimStateTransitionCondition_FloatVariable', {
      description: 'Float variable condition with no connections'
    }],

    ['animAnimStateTransitionCondition_WrapperValue', {
      description: 'Wrapper value condition with no connections'
    }],

    ['animAnimStateTransitionCondition_AnimEnd', {
      description: 'Animation end condition with no connections',
      dataTemplate: {
        "$type": "animAnimStateTransitionCondition_AnimEnd",
        "eventName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        }
      }
    }],

    ['animAnimStateTransitionCondition_Timed', {
      description: 'Timed condition with no connections'
    }],

    ['animAnimStateTransitionCondition_IntEdgeToFeature', {
      description: 'Integer edge to feature condition with no connections'
    }],

    ['animAnimStateTransitionCondition_ExternalEvent', {
      description: 'External event condition with no connections',
      dataTemplate: {
        $type: "animAnimStateTransitionCondition_ExternalEvent",
        eventName: {
          $type: 'CName', 
          $storage: 'string', 
          $value: 'None'
        }
      }
    }],

    ['animAnimStateTransitionCondition_CompositeSimultaneous', {
      description: 'Composite simultaneous condition with conditions input'
    }],

    ['animAnimStateTransitionCondition_IntFeature', {
      description: 'Integer feature condition with no connections'
    }],

    ['animAnimStateTransitionCondition_BoolFeature', {
      description: 'Boolean feature condition with no connections',
      dataTemplate: {
        "$type": "animAnimStateTransitionCondition_BoolFeature",
        "compareValue": 1,
        "featureName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "featurePropertyName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        }
      }
    }],

    // State machine conditional entry
    ['animAnimStateMachineConditionalEntry', {
      description: 'State machine conditional entry with condition input',
      dataTemplate: {
        "$type":"animAnimStateMachineConditionalEntry",
        "condition": null,
        "isEnabled": 1,
        "isForcedToTrue": 0,
        "priority": 0,
        "targetStateIndex": 0
      }
    }],

    // State transition interpolator
    ['animAnimStateTransitionInterpolator_Blend', {
      description: 'Blend interpolator with no connections',
      dataTemplate: {
        "$type": "animAnimStateTransitionInterpolator_Blend",
        "interpolationType": "Linear"
      }
    }],

    // State transition description
    ['animAnimStateTransitionDescription', {
      description: 'State transition description with condition and interpolator inputs',
      dataTemplate: {
        "$type": "animAnimStateTransitionDescription",
        "actionAnimDatabaseRef": {
          "DepotPath": {
            "$type": "ResourcePath",
            "$storage": "uint64",
            "$value": "0"
          },
          "Flags": "Default"
        },
        "animFeatureName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "canRequestInertialization": 0,
        "condition": null,
        "duration": 0,
        "interpolator": null,
        "isEnabled": 1,
        "isForcedToTrue": 0,
        "isOutTransitionFromAction": 0,
        "priority": 20,
        "supportBlendFromPose": 0,
        "syncMethod": null,
        "targetStateIndex": 1
      }
    }],

    // Link nodes
    ['animPoseLink', {
      description: 'Pose link with node input'
    }],

    ['animFloatLink', {
      description: 'Float link with node input'
    }],

    ['animBoolLink', {
      description: 'Boolean link with node input'
    }],

    ['animIntLink', {
      description: 'Integer link with node input'
    }],

    ['animVectorLink', {
      description: 'Vector link with node input'
    }],

    // Skip console nodes
    ['animAnimNode_SkipConsoleBegin', {
      description: 'Skip console begin with input link'
    }],

    ['animAnimNode_SkipConsoleEnd', {
      description: 'Skip console end with input link'
    }],

    // Critical spring damp
    ['animAnimNode_CriticalSpringDamp', {
      description: 'Critical spring damp with input node'
    }],

    ['animAnimNode_OrientConstraint', {
      description: 'Orient constraint with input',
      dataTemplate: {
        "$type": "animAnimNode_OrientConstraint",
        "areSourceChannelsResaved": 0,
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "inputTransforms": [],
        "inputWeightedTransforms": [],
        "preprocessedWeights": [],
        "transformIndex": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "weight": 1,
        "weightFloatTrack": {
          "$type": "animNamedTrackIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "weightMode": "Static"
      }
    }],
    ['animAnimNode_Ik2Constraint', {
      description: 'Two-bone IK constraint',
      dataTemplate: {
        "$type": "animAnimNode_Ik2Constraint",
        "endBoneIndex": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "firstBoneIndex": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "hingeAxis": "X",
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "inputPoleVector": null,
        "inputTarget": null,
        "inputTargetOrientation": null,
        "maxHingeAngle": 0,
        "secondBoneIndex": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "twistNode": {
          "$type": "animFloatLink",
          "node": null
        },
        "twistValue": 0,
        "weight": 1,
        "weightFloatTrack": {
          "$type": "animNamedTrackIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "weightNode": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],
    ['animAnimNode_AddSnapToTerrainIkRequest', {
      description: 'Adds snap-to-terrain IK requests',
      dataTemplate: {
        "$type": "animAnimNode_AddSnapToTerrainIkRequest",
        "animDeltaZ": {
          "$type": "animFloatLink",
          "node": null
        },
        "hipsRequest": {
          "$type": "animHipsIkRequest",
          "hipsTransformIndex": {
            "$type": "animTransformIndex",
            "name": {
              "$type": "CName",
              "$storage": "string",
              "$value": "None"
            }
          },
          "leftFootTransformIndex": {
            "$type": "animTransformIndex",
            "name": {
              "$type": "CName",
              "$storage": "string",
              "$value": "None"
            }
          },
          "leftLegIkChain": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          },
          "rightFootTransformIndex": {
            "$type": "animTransformIndex",
            "name": {
              "$type": "CName",
              "$storage": "string",
              "$value": "None"
            }
          },
          "rightLegIkChain": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "leftFootRequest": {
          "$type": "animSnapToTerrainIkRequest",
          "enableFootLockFloatTrack": {
            "$type": "animNamedTrackIndex",
            "name": {
              "$type": "CName",
              "$storage": "string",
              "$value": "None"
            }
          },
          "footTransformIndex": {
            "$type": "animTransformIndex",
            "name": {
              "$type": "CName",
              "$storage": "string",
              "$value": "None"
            }
          },
          "ikChain": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          },
          "poleVectorRefTransformIndex": {
            "$type": "animTransformIndex",
            "name": {
              "$type": "CName",
              "$storage": "string",
              "$value": "None"
            }
          }
        },
        "rightFootRequest": {
          "$type": "animSnapToTerrainIkRequest",
          "enableFootLockFloatTrack": {
            "$type": "animNamedTrackIndex",
            "name": {
              "$type": "CName",
              "$storage": "string",
              "$value": "None"
            }
          },
          "footTransformIndex": {
            "$type": "animTransformIndex",
            "name": {
              "$type": "CName",
              "$storage": "string",
              "$value": "None"
            }
          },
          "ikChain": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          },
          "poleVectorRefTransformIndex": {
            "$type": "animTransformIndex",
            "name": {
              "$type": "CName",
              "$storage": "string",
              "$value": "None"
            }
          }
        }
      }
    }],
    ['animAnimNode_FloatTrackModifier', {
      description: 'Modifies a float track on the pose',
      dataTemplate: {
        "$type": "animAnimNode_FloatTrackModifier",
        "floatInputNode": {
          "$type": "animFloatLink",
          "node": null
        },
        "floatTrack": {
          "$type": "animNamedTrackIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "id": 4294967295,
        "inputFloatTrack": {
          "$type": "animNamedTrackIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "operationType": "Override",
        "poseInputNode": {
          "$type": "animPoseLink",
          "node": null
        }
      }
    }],
    ['animAnimNode_TrackSetter', {
      description: 'Sets a named float track on the pose',
      dataTemplate: {
        "$type": "animAnimNode_TrackSetter",
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "track": {
          "$type": "animNamedTrackIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "value": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],
    ['animAnimNode_AdditionalFloatTrack', {
      description: 'Adds extra float tracks to the pose',
      dataTemplate: {
        "$type": "animAnimNode_AdditionalFloatTrack",
        "additionalTracks": {
          "$type": "animAdditionalFloatTrackContainer",
          "entries": [],
          "overwriteExistingValues": 0
        },
        "id": 4294967295,
        "poseInputNode": {
          "$type": "animPoseLink",
          "node": null
        }
      }
    }],
    ['animAnimNode_AdditionalTransform', {
      description: 'Adds extra transforms to the pose',
      dataTemplate: {
        "$type": "animAnimNode_AdditionalTransform",
        "additionalTransforms": {
          "$type": "animAdditionalTransformContainer",
          "entries": []
        },
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        }
      }
    }],
    ['animAnimNode_PointConstraint', {
      description: 'Point constraint',
      dataTemplate: {
        "$type": "animAnimNode_PointConstraint",
        "areSourceChannelsResaved": 0,
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "inputTransforms": [],
        "inputWeightedTransforms": [],
        "preprocessedWeights": [],
        "transformIndex": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "weight": 1,
        "weightFloatTrack": {
          "$type": "animNamedTrackIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "weightMode": "Static"
      }
    }],
    ['animAnimNode_MultipleParentConstraint', {
      description: 'Multiple parent constraint',
      dataTemplate: {
        "$type": "animAnimNode_MultipleParentConstraint",
        "areSourceChannelsResaved": 0,
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "interpolationType": "Lerp",
        "parentsTransform": [],
        "parentsTransforms": [],
        "parentsWeight": [],
        "transformIndex": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "weight": 1,
        "weightFloatTrack": {
          "$type": "animNamedTrackIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "weightMode": "Static"
      }
    }],
    ['animAnimNode_DirectConnConstraint', {
      description: 'Direct connection constraint',
      dataTemplate: {
        "$type": "animAnimNode_DirectConnConstraint",
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "isSourceTransformResaved": 0,
        "posX": 1,
        "posY": 1,
        "posZ": 1,
        "rotX": 1,
        "rotY": 1,
        "rotZ": 1,
        "scaleX": 0,
        "scaleY": 0,
        "scaleZ": 0,
        "sourceTransform": null,
        "sourceTransformIndex": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "transformIndex": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "weight": 1,
        "weightNode": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],
    ['animAnimNode_ParentTransform', {
      description: 'Remaps parent transforms',
      dataTemplate: {
        "$type": "animAnimNode_ParentTransform",
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "mapping": []
      }
    }],
    ['animAnimNode_GraphSlot', {
      description: 'Named graph slot passthrough',
      dataTemplate: {
        "$type": "animAnimNode_GraphSlot",
        "dontDeactivateInput": 0,
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "name": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        }
      }
    }],
    ['animAnimNode_GraphSlot_Test', {
      description: 'Graph slot with a test subgraph',
      dataTemplate: {
        "$type": "animAnimNode_GraphSlot_Test",
        "copyAnimInputsAtAttachTime": 0,
        "dontDeactivateInput": 0,
        "graph_TEST": {
          "DepotPath": {
            "$type": "ResourcePath",
            "$storage": "uint64",
            "$value": "0"
          },
          "Flags": "Default"
        },
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "name": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        }
      }
    }],
    ['animAnimNode_AddIkRequest', {
      description: 'Adds an IK request to the pose',
      dataTemplate: {
        "$type": "animAnimNode_AddIkRequest",
        "blendTimeIn": 0,
        "blendTimeOut": 0,
        "id": 4294967295,
        "ikChain": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "poleVector": {
          "$type": "animPoleVectorDetails",
          "positionOffset": {
            "$type": "Vector3",
            "X": 0,
            "Y": 0,
            "Z": 0
          },
          "targetBone": {
            "$type": "animTransformIndex",
            "name": {
              "$type": "CName",
              "$storage": "string",
              "$value": "None"
            }
          }
        },
        "positionOffset": {
          "$type": "Vector3",
          "X": 0,
          "Y": 0,
          "Z": 0
        },
        "priority": 0,
        "rotationOffset": {
          "$type": "Quaternion",
          "i": 0,
          "j": 0,
          "k": 0,
          "r": 1
        },
        "targetBone": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "weightPosition": 1,
        "weightRotation": 1
      }
    }],
    ['animAnimNode_ReadIkRequest', {
      description: 'Reads an IK request onto a transform',
      dataTemplate: {
        "$type": "animAnimNode_ReadIkRequest",
        "id": 4294967295,
        "ikChain": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "outTransform": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        }
      }
    }],
    ['animAnimNode_Ik2', {
      description: 'Two-bone IK',
      dataTemplate: {
        "$type": "animAnimNode_Ik2",
        "bone": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "endBone": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "endBoneIkGain": 1,
        "endBoneOffsetPositionLS": {
          "$type": "Vector4",
          "W": 1,
          "X": 0,
          "Y": 0,
          "Z": 0
        },
        "endTargetOrientationNode": {
          "$type": "animQuaternionLink",
          "node": null
        },
        "endTargetPositionNode": {
          "$type": "animVectorLink",
          "node": null
        },
        "enforceEndOrientation": 0,
        "enforceEndPosition": 1,
        "firstBone": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "firstBoneIkGain": 1,
        "floatTrack": {
          "$type": "animNamedTrackIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "hingeAxis": "X",
        "id": 4294967295,
        "inputPoseNode": {
          "$type": "animPoseLink",
          "node": null
        },
        "maxHingeAngleDegrees": 180,
        "minHingeAngleDegrees": 0,
        "secondBone": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "secondBoneIkGain": 1,
        "weightNode": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],
    ['animAnimNode_Inertialization', {
      description: 'Inertialization of pose changes',
      dataTemplate: {
        "$type": "animAnimNode_Inertialization",
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "rotationLimits": [],
        "safeMode": 1,
        "tracksCountUpperBound": 0,
        "transformsCountUpperBound": 0
      }
    }],
    ['animAnimNode_MixerSlot', {
      description: 'Mixer slot for layered anims',
      dataTemplate: {
        "$type": "animAnimNode_MixerSlot",
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "maxAdditiveAnimEntriesCount": 1,
        "maxNormalAnimEntriesCount": 1,
        "maxOverrideAnimEntriesCount": 1
      }
    }],
    ['animAnimNode_FPPCamera', {
      description: 'First-person camera pose',
      dataTemplate: {
        "$type": "animAnimNode_FPPCamera",
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        }
      }
    }],
    ['animAnimNode_GenerateIkAnimFeatureData', {
      description: 'Generates IK anim feature data',
      dataTemplate: {
        "$type": "animAnimNode_GenerateIkAnimFeatureData",
        "id": 4294967295,
        "ikChainSettings": [],
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        }
      }
    }],
    ['animAnimNode_LookAtController', {
      description: 'Look-at controller',
      dataTemplate: {
        "$type": "animAnimNode_LookAtController",
        "E3_HACK_offset": {
          "$type": "animVectorLink",
          "node": null
        },
        "bodyPartsDependencies": [],
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "isFacial": 0,
        "orderedBodyParts": [],
        "stateMachinesSettings": [],
        "substepTime": 0
      }
    }],
    ['animAnimNode_LookAtApplyVehicleRestrictions', {
      description: 'Applies vehicle look-at restrictions',
      dataTemplate: {
        "$type": "animAnimNode_LookAtApplyVehicleRestrictions",
        "group": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "name": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "referenceBone": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        }
      }
    }],
    ['animAnimNode_WorkspotHub', {
      description: 'Workspot animation hub',
      dataTemplate: {
        "$type": "animAnimNode_WorkspotHub",
        "additionalLinkIds": [],
        "additionalLinks": [],
        "animLoopEventName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "emotionalExpression": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "eventFilterType": "Default",
        "facialIdleFemaleAnimation": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "facialIdleKey_FemaleAnimation": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "facialIdleKey_MaleAnimation": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "facialIdleMaleAnimation": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "facialKeyWeight": 0,
        "id": 4294967295,
        "isCoverHubHack": 0,
        "mainEmotionalState": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        }
      }
    }],
    ['animAnimNode_ParentConstraint', {
      description: 'Parent constraint with source-channel child',
      dataTemplate: {
        "$type": "animAnimNode_ParentConstraint",
        "id": 4294967295,
        "inputLink": {
          "$type": "animPoseLink",
          "node": null
        },
        "interpolationType": "Lerp",
        "isParentTransformResaved": 0,
        "offsetEulerRotationLS": {
          "$type": "animVectorLink",
          "node": null
        },
        "offsetTranslationLS": {
          "$type": "animVectorLink",
          "node": null
        },
        "parentTransform": null,
        "parentTransformIndex": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "transformIndex": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "useBoneReferencePoseAsDefaultOffset": 0,
        "weight": 1,
        "weightFloatTrack": {
          "$type": "animNamedTrackIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "weightNode": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],
    ['animAnimNode_FloatTrackDirectConnConstraint', {
      description: 'Float track direct conn constraint with input'
    }],
    ['animAnimNode_VectorConstant', {
      description: 'Vector constant',
      dataTemplate: {
        "$type": "animAnimNode_VectorConstant",
        "id": 4294967295,
        "value": {
          "$type": "Vector4",
          "W": 0,
          "X": 0,
          "Y": 0,
          "Z": 0
        }
      }
    }],
    ['animAnimStateTransitionCondition_AnimEvent', {
      description: 'Anim event condition with no connections',
      dataTemplate: {
        $type: 'animAnimStateTransitionCondition_AnimEvent',
        eventName: {
          $type: 'CName',
          $storage: 'string',
          $value: 'None',
        },
      },
    }],
    ['animAnimNode_VectorInput', {
      description: 'Vector input'
    }],
    ['animAnimNode_AnimSetTagValue', {
      description: 'Anim set tag value'
    }],
    ['animAnimNode_CoordinateFromVector', {
      description: 'Coordinate from vector'
    }],
    ['animAnimNode_CurveVectorValue', {
      description: 'Curve vector value'
    }],
    ['animAnimNode_FloatTimeDependentSinus', {
      description: 'Float time dependent sinus'
    }],
    ['animAnimStateTransitionCondition_AnyAnimEnd', {
      description: 'Any anim end condition with no connections'
    }],
    ['animAnimNode_VectorVariable', {
      description: 'Vector variable'
    }],
    ['animAnimNodeSourceChannel_TransformQsTransform', {
      description: 'Transform qs transform'
    }],
    ['animAnimNode_MathExpressionPose', {
      description: 'Math expression pose with input',
    }],
    ['animAnimNode_AimConstraint', {
      description: 'Aim constraint with input'
    }],
    ['animAnimNode_TransformToTrack', {
      description: 'Transform to track with input'
    }],
    ['animAnimNodeSourceChannel_WeightedVector', {
      description: 'Weighted vector with input'
    }],
    ['animAnimNodeSourceChannel_WeightedQuat', {
      description: 'Weighted quaternion source channel',
      dataTemplate: {
        "$type": "animAnimNodeSourceChannel_WeightedQuat",
        "channel": null,
        "weight": 1,
        "weightFloatTrack": {
          "$type": "animNamedTrackIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "weightLink": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],
    ['animAnimNodeSourceChannel_OrientationVector', {
      description: 'Orientation vector'
    }],
    ['animAnimNodeSourceChannel_TransformVector', {
      description: 'Transform vector'
    }],
    ['animAnimNodeSourceChannel_TransformQuat', {
      description: 'Transform quaternion source channel',
      dataTemplate: {
        "$type": "animAnimNodeSourceChannel_TransformQuat",
        "transformIndex": {
          "$type": "animTransformIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        }
      }
    }],
    ['animAnimNodeSourceChannel_FloatTrack', {
      description: 'Float track source channel',
      dataTemplate: {
        "$type": "animAnimNodeSourceChannel_FloatTrack",
        "floatTrack": {
          "$type": "animNamedTrackIndex",
          "name": {
            "$type": "CName",
            "$storage": "string",
            "$value": "None"
          }
        },
        "useComplementValue": 0
      }
    }],
    ['animAnimNode_SkPhaseWithSpeedAnim', {
      description: 'Phase with speed anim with speed link'
    }],
    ['animAnimNode_StaticSwitch', {
      description: 'Static switch'
    }],
    ['animComponentTagCondition', {
      description: 'Component tag condition'
    }],
    ['animRigTagCondition', {
      description: 'Rig tag condition',
      dataTemplate: {
        "$type": "animRigTagCondition",
        "tag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        }
      }
    }],

    // Previously missing catalog rows (materialize warn / Add UI)
    ['animAnimNode_AimConstraint_ObjectRotationUp', {
      description: 'Aim constraint with object rotation up'
    }],
    ['animAnimNode_ApplyCorrectivePoseRBF', {
      description: 'Apply corrective pose via RBF'
    }],
    ['animAnimNode_BlendSpace', {
      description: 'Blend space with float inputs and progress link'
    }],
    ['animAnimNode_ConditionalSegmentBegin', {
      description: 'Conditional segment begin marker'
    }],
    ['animAnimNode_ConditionalSegmentEnd', {
      description: 'Conditional segment end marker'
    }],
    ['animAnimNode_ConeLimit', {
      description: 'Cone rotation limit on transform'
    }],
    ['animAnimNode_DirectionToEuler', {
      description: 'Convert direction vector to Euler floats'
    }],
    ['animAnimNode_DisableLunaticMode', {
      description: 'Disable lunatic mode for pose subtree'
    }],
    ['animAnimNode_EnumSwitch', {
      description: 'Switch pose inputs by enum selection',
      fieldConstraints: {
        blendTime: { range: { min: 0, max: 10, step: 0.01 } },
      },
      dataTemplate: {
        "$type": "animAnimNode_EnumSwitch",
        "blendTime": 0,
        "canRequestInertialization": 0,
        "enumName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "id": 4294967295,
        "inputNodes": [
          {
            "$type": "animPoseLink",
            "node": null
          }
        ],
        "selectFloatNode": {
          "$type": "animFloatLink",
          "node": null
        },
        "selectIntNode": {
          "$type": "animIntLink",
          "node": null
        },
        "syncMethod": null,
        "timeWarpingEnabled": 0
      }
    }],
    ['animAnimNode_FootStepScaling', {
      description: 'Foot step scaling adjuster'
    }],
    ['animAnimNode_ForegroundSegmentBegin', {
      description: 'Foreground segment begin marker'
    }],
    ['animAnimNode_ForegroundSegmentEnd', {
      description: 'Foreground segment end marker'
    }],
    ['animAnimNode_IntJoin', {
      description: 'Joins int input',
      dataTemplate: {
        "$type": "animAnimNode_IntJoin",
        "id": 4294967295,
        "input": {
          "$type": "animIntLink",
          "node": null
        }
      }
    }],
    ['animAnimNode_IntLatch', {
      description: 'Latches int input',
      dataTemplate: {
        "$type": "animAnimNode_IntLatch",
        "id": 4294967295,
        "input": {
          "$type": "animIntLink",
          "node": null
        }
      }
    }],
    ['animAnimNode_LODBegin', {
      description: 'LOD segment begin marker'
    }],
    ['animAnimNode_LODEnd', {
      description: 'LOD segment end marker'
    }],
    ['animAnimNode_MultiBoolToFloatValue', {
      description: 'Maps multiple bool inputs to a float value'
    }],
    ['animAnimNode_NPCExploration', {
      description: 'NPC exploration pose node'
    }],
    ['animAnimNode_PoseCorrection', {
      description: 'Pose correction post-process'
    }],
    ['animAnimNode_PostProcess_Footlock', {
      description: 'Footlock post-process for blends'
    }],
    ['animAnimNode_RagdollControl', {
      description: 'Ragdoll control blend'
    }],
    ['animAnimNode_RotationLimit', {
      description: 'Rotation limit on transform'
    }],
    ['animAnimNode_RuntimeSwitch', {
      description: 'Runtime condition switch between True/False poses'
    }],
    ['animAnimNode_SetTrackRange', {
      description: 'Set named track range on pose'
    }],
    ['animAnimNode_SkipPerformanceModeBegin', {
      description: 'Skip performance mode begin marker'
    }],
    ['animAnimNode_SkipPerformanceModeEnd', {
      description: 'Skip performance mode end marker'
    }],
    ['animAnimNode_SkPhaseSlotWithDurationAnim', {
      description: 'Phase slot animation with duration and action database',
      dataTemplate: {
        "$type": "animAnimNode_SkPhaseSlotWithDurationAnim",
        "actionAnimDatabaseRef": {
          "DepotPath": {
            "$type": "ResourcePath",
            "$storage": "uint64",
            "$value": "0"
          },
          "Flags": "Default"
        },
        "animFeatureName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "animation": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "animLoopEventName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "applyInertializationOnAnimSetSwap": 1,
        "applyMotion": 1,
        "clipEnd": 0,
        "clipEndByEvent": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "clipFront": 0,
        "clipFrontByEvent": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "collectEvents": 1,
        "convertToAdditive": 0,
        "durationLink": {
          "$type": "animFloatLink",
          "node": null
        },
        "fireAnimLoopEvent": 1,
        "id": 4294967295,
        "isLooped": 0,
        "motionProvider": null,
        "phase": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "popDataByTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "pushDataByTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "pushSafeCutTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "resume": 0
      }
    }],
    ['animAnimNode_SkSyncedMasterAnim', {
      description: 'Synced master speed animation',
      dataTemplate: {
        "$type": "animAnimNode_SkSyncedMasterAnim",
        "animation": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "animLoopEventName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "applyInertializationOnAnimSetSwap": 1,
        "applyMotion": 1,
        "clipEnd": 0,
        "clipEndByEvent": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "clipFront": 0,
        "clipFrontByEvent": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "collectEvents": 1,
        "convertToAdditive": 0,
        "fireAnimLoopEvent": 1,
        "id": 4294967295,
        "isLooped": 0,
        "motionProvider": null,
        "popDataByTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "pushDataByTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "pushSafeCutTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "resume": 0,
        "Speed": {
          "$type": "animFloatLink",
          "node": null
        },
        "syncTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        }
      }
    }],
    ['animAnimNode_SkSyncedMasterAnimByTime', {
      description: 'Synced master frame/time animation',
      dataTemplate: {
        "$type": "animAnimNode_SkSyncedMasterAnimByTime",
        "animation": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "animLoopEventName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "applyInertializationOnAnimSetSwap": 1,
        "applyMotion": 1,
        "clipEnd": 0,
        "clipEndByEvent": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "clipFront": 0,
        "clipFrontByEvent": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "collectEvents": 1,
        "convertToAdditive": 0,
        "fireAnimEndOnceOnAnimEnd": 0,
        "fireAnimLoopEvent": 0,
        "frameLink": {
          "$type": "animFloatLink",
          "node": null
        },
        "id": 4294967295,
        "isLooped": 0,
        "motionProvider": null,
        "popDataByTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "progressLink": {
          "$type": "animFloatLink",
          "node": null
        },
        "pushDataByTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "pushSafeCutTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "resume": 0,
        "syncTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "timeLink": {
          "$type": "animFloatLink",
          "node": null
        }
      }
    }],
    ['animAnimNode_SkSyncedSlaveAnim', {
      description: 'Synced slave animation',
      dataTemplate: {
        "$type": "animAnimNode_SkSyncedSlaveAnim",
        "animation": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "animLoopEventName": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "applyInertializationOnAnimSetSwap": 1,
        "applyMotion": 1,
        "clipEnd": 0,
        "clipEndByEvent": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "clipFront": 0,
        "clipFrontByEvent": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "collectEvents": 1,
        "convertToAdditive": 0,
        "fireAnimLoopEvent": 0,
        "id": 4294967295,
        "isLooped": 0,
        "motionProvider": null,
        "popDataByTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "pushDataByTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "pushSafeCutTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        },
        "resume": 0,
        "syncTag": {
          "$type": "CName",
          "$storage": "string",
          "$value": "None"
        }
      }
    }],
    ['animAnimNode_TwistConstraint', {
      description: 'Twist constraint on transform chain'
    }],
    ['animAnimsetWithOverridesTagCondition', {
      description: 'Runtime condition: animset has override tags',
      dataTemplate: {
        "$type": "animAnimsetWithOverridesTagCondition",
        "animsetTags": {
          "$type": "redTagList",
          "tags": []
        }
      }
    }],
    ['animMotionTableProvider_Animation', {
      description: 'Motion table provider from animation'
    }],
    ['animMotionTableProvider_Default', {
      description: 'Default motion table provider'
    }],
    ['animMotionTableProvider_MasterSlaveBlend', {
      description: 'Master/slave blend motion table provider'
    }],
    ['animMotionTableProvider_MultiBlend', {
      description: 'Multi-blend motion table provider'
    }],
    ['animMotionTableProvider_StaticSwitch', {
      description: 'Static switch motion table provider'
    }],
    ['animSyncMethodByFootPhase', {
      description: 'Sync by foot phase',
      dataTemplate: {
        "$type": "animSyncMethodByFootPhase"
      }
    }],

    ['animAnimNode_Dangle', {
      description: 'Dangle simulation with constraint'
    }],
    ['animAnimNode_PoseLsToMs', {
      description: 'Convert pose from local to model space'
    }],
    ['animAnimNode_PoseMsToLs', {
      description: 'Convert pose from model to local space'
    }],
    ['animDangleConstraint_SimulationDyng', {
      description: 'Dyng particle dangle simulation'
    }],
    ['animDyngConstraintCone', {
      description: 'Dyng cone constraint'
    }],
    ['animDyngConstraintEllipsoid', {
      description: 'Dyng ellipsoid constraint'
    }],
    ['animDyngConstraintLink', {
      description: 'Dyng link constraint between bones'
    }],
    ['animDyngConstraintMulti', {
      description: 'Compound dyng constraint container'
    }],
  ]
