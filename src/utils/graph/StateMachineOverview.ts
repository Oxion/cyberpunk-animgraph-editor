import type { RenderNode } from './diagramTypes'
import { forEachDirectChild, getChildSlot } from './nodeChildSlots'

/** Diagram PropertyGroup order under an SM root (materialize rewrite + overview). */
export const STATE_MACHINE_SECTIONS = [
  'anyStateInterpolator',
  'frozenState',
  'conditionalEntries',
  'globalTransitions',
  'transitions',
  'states',
] as const

export type StateMachineSectionId = (typeof STATE_MACHINE_SECTIONS)[number]

export interface StateMachineSectionInfo {
  id: StateMachineSectionId
  label: string
  present: boolean
  count: number
}

export function getStateMachineSections(node: RenderNode): StateMachineSectionInfo[] {
  const groupByProperty = new Map<string, RenderNode>()
  forEachDirectChild(node, (child) => {
    const name = (child.metadata?.propertyName ?? child.metadata?.smDiagramRole) as
      | string
      | undefined
    if (name) {
      groupByProperty.set(name, child)
    }
  })

  return STATE_MACHINE_SECTIONS.map((id) => {
    const group = groupByProperty.get(id)
    return {
      id,
      label: id,
      present: Boolean(group),
      count: group ? getChildSlot(group).length : 0,
    }
  })
}

export function computeStateMachineOverviewSize(sectionCount: number): { width: number; height: number } {
  const rowH = 22
  const headerH = 52
  const pad = 16
  return {
    width: 300,
    height: headerH + sectionCount * rowH + pad,
  }
}
