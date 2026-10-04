/**
 * Purpose-based groups for node type picker (search + category tabs).
 * Classification is prefix/heuristic on diagramNodeType — independent of NodeDefinition.
 */

export type NodeTypeGroupId =
  | 'diagram'
  | 'blend'
  | 'branch'
  | 'math'
  | 'state-machine'
  | 'animation'
  | 'transform'
  | 'input'
  | 'converter'
  | 'value'
  | 'other'

export type NodeTypeGroupDef = {
  id: NodeTypeGroupId
  label: string
}

/** Display order for tabs / All-view section headers. */
export const NODE_TYPE_GROUPS: readonly NodeTypeGroupDef[] = [
  { id: 'diagram', label: 'Diagram' },
  { id: 'blend', label: 'Blend' },
  { id: 'branch', label: 'Branch' },
  { id: 'math', label: 'Math' },
  { id: 'state-machine', label: 'State Machine' },
  { id: 'animation', label: 'Animation' },
  { id: 'transform', label: 'Transform' },
  { id: 'input', label: 'Input' },
  { id: 'converter', label: 'Converter' },
  { id: 'value', label: 'Value' },
  { id: 'other', label: 'Other' },
] as const

const GROUP_LABEL = Object.fromEntries(
  NODE_TYPE_GROUPS.map((g) => [g.id, g.label])
) as Record<NodeTypeGroupId, string>

export function nodeTypeGroupLabel(id: NodeTypeGroupId): string {
  return GROUP_LABEL[id]
}

/**
 * Map a selectable diagram / animgraph type to a purpose group.
 * Order of checks matters (more specific before broad Input/Value).
 */
export function classifyNodeType(diagramNodeType: string): NodeTypeGroupId {
  const t = diagramNodeType

  if (
    t === 'PropertyGroup' ||
    t === 'Group' ||
    t === 'Note'
  ) {
    return 'diagram'
  }

  if (
    t.includes('StateTransition') ||
    t.includes('ConditionalEntry') ||
    t.includes('StateMachine') ||
    t.includes('StateFrozen') ||
    t.endsWith('_State') ||
    t.includes('animAnimNode_State') ||
    t.includes('DiagramTransitionWrapper') ||
    t.includes('DiagramConditionWrapper')
  ) {
    return 'state-machine'
  }

  if (
    t.includes('animAnimNode_Switch') ||
    t.includes('animAnimNode_StaticSwitch') ||
    t.includes('StaticSwitch')
  ) {
    return 'branch'
  }

  if (t.includes('Blend') || t.includes('PoseBlend')) {
    return 'blend'
  }

  if (
    t.includes('MathExpression') ||
    t.includes('FloatMath') ||
    t.includes('FloatComparator') ||
    t.includes('FloatJoin') ||
    t.includes('FloatLatch') ||
    t.includes('DampFloat') ||
    t.includes('CurveFloat') ||
    t.includes('SpringDamp') ||
    t.includes('FloatClamp') ||
    t.includes('FloatInterpolation') ||
    t.includes('VectorInterpolation') ||
    t.includes('QuaternionInterpolation') ||
    t.includes('CriticalSpring') ||
    t.includes('FloatCumulative') ||
    t.includes('ValueBySpeed') ||
    t.includes('DampVector') ||
    t.includes('VectorJoin') ||
    t.includes('VectorWsToMs')
  ) {
    return 'math'
  }

  if (
    t.includes('SkAnim') ||
    t.includes('SkDuration') ||
    t.includes('SkOneShot') ||
    t.includes('SkPhase') ||
    t.includes('SkSpeed') ||
    t.includes('SkFrame') ||
    t.includes('AnimDatabase')
  ) {
    return 'animation'
  }

  if (
    t.includes('TranslateBone') ||
    t.includes('RotateBone') ||
    t.includes('SetBone') ||
    t.includes('SnapToTerrain') ||
    t.includes('Constraint') ||
    t.includes('IkRequest') ||
    t.includes('animAnimNode_Ik2') ||
    t.includes('TrackSetter') ||
    t.includes('FloatTrackModifier') ||
    t.includes('AdditionalFloat') ||
    t.includes('AdditionalTransform') ||
    t.includes('ParentTransform') ||
    t.includes('GraphSlot') ||
    t.includes('LookAt') ||
    t.includes('Inertialization') ||
    t.includes('MixerSlot') ||
    t.includes('FPPCamera') && !t.includes('SharedVar') ||
    t.includes('Workspot') ||
    t.includes('SourceChannel') ||
    t.includes('StackTransforms') ||
    t.includes('StackTracks') ||
    t.includes('StagePose') ||
    t.includes('animAnimNode_Stage')
  ) {
    return 'transform'
  }

  if (t.includes('Converter')) {
    return 'converter'
  }

  if (
    t.includes('Input') ||
    t.includes('FloatConstant') ||
    t.includes('QuaternionConstant') ||
    t.includes('FloatVariable') ||
    t.includes('BoolVariable') ||
    t.includes('IntVariable') ||
    t.includes('NameHashConstant') ||
    t.includes('FPPCameraSharedVar') ||
    t.includes('FloatRandom') ||
    t.includes('animAnimNode_Timer')
  ) {
    return 'input'
  }

  if (
    t.includes('TagValue') ||
    t.includes('EventValue') ||
    t.includes('WrapperValue') ||
    t.includes('expressionData') ||
    t.includes('animAnimNode_Event') ||
    t.includes('animAnimNode_Signal') ||
    t.includes('IdentityPose') ||
    t.includes('ReferencePose') ||
    t.includes('animAnimNode_Output') ||
    t.includes('animAnimNode_Join')
  ) {
    return 'value'
  }

  return 'other'
}
