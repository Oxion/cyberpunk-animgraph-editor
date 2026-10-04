import { computed, ref, shallowRef } from 'vue'
import {
  MAIN_DIAGRAM_ID,
  type AnimgraphProject,
  type ProjectDiagram,
  type RenderData,
} from '../utils/graph/diagramTypes'

/** Multi-diagram project: source of truth for all RenderData. */

export const projectRef = shallowRef<AnimgraphProject | null>(null)
export const activeDiagramId = ref<string | null>(null)

export const hasProject = computed(() => (projectRef.value?.diagrams.length ?? 0) > 0)

export const listDiagramIds = computed(() =>
  (projectRef.value?.diagrams ?? []).map((d) => d.id)
)

export const mainDiagramId = computed(
  () => projectRef.value?.mainDiagramId ?? MAIN_DIAGRAM_ID
)

export function getDiagramById(diagramId: string): ProjectDiagram | null {
  return projectRef.value?.diagrams.find((d) => d.id === diagramId) ?? null
}

export function getRenderData(diagramId: string): RenderData | null {
  return getDiagramById(diagramId)?.data ?? null
}

export function requireRenderData(diagramId: string): RenderData {
  const data = getRenderData(diagramId)
  if (!data) {
    throw new Error(`No RenderData for diagramId="${diagramId}"`)
  }
  return data
}

export function hasDiagramId(diagramId: string): boolean {
  return getDiagramById(diagramId) != null
}

export function setActiveDiagramId(diagramId: string | null) {
  if (diagramId == null) {
    activeDiagramId.value = null
    return
  }
  if (!hasDiagramId(diagramId)) {
    console.warn(`setActiveDiagramId: unknown diagramId="${diagramId}"`)
    return
  }
  activeDiagramId.value = diagramId
}

/** Resolve active diagram for hotkeys; null if none. */
export function getActiveRenderData(): RenderData | null {
  const id = activeDiagramId.value
  return id ? getRenderData(id) : null
}

export function requireActiveDiagramId(): string {
  const id = activeDiagramId.value
  if (!id) throw new Error('No activeDiagramId')
  return id
}

export function createEmptyProject(mainId: string = MAIN_DIAGRAM_ID): AnimgraphProject {
  return { mainDiagramId: mainId, diagrams: [] }
}

export function resetProject() {
  activeDiagramId.value = null
  projectRef.value = null
}

/**
 * Replace project contents. Sets active to preferredId or mainDiagramId or first.
 */
export function setProject(project: AnimgraphProject, preferredActiveId?: string | null) {
  if (!project.mainDiagramId?.trim()) {
    throw new Error('Project mainDiagramId is required')
  }
  if (!project.diagrams.some((d) => d.id === project.mainDiagramId)) {
    throw new Error(
      `Project mainDiagramId="${project.mainDiagramId}" is not in diagrams`
    )
  }
  const ids = project.diagrams.map((d) => d.id)
  if (ids.length === 0) {
    activeDiagramId.value = null
    projectRef.value = project
    return
  }
  const preferred =
    preferredActiveId && ids.includes(preferredActiveId)
      ? preferredActiveId
      : ids.includes(project.mainDiagramId)
        ? project.mainDiagramId
        : ids[0]!
  activeDiagramId.value = preferred
  projectRef.value = project
}

export function addDiagram(id: string, data: RenderData): void {
  if (!id.trim()) throw new Error('Diagram id must be non-empty')
  if (hasDiagramId(id)) throw new Error(`Diagram id already exists: "${id}"`)

  const project = projectRef.value ?? createEmptyProject(id)
  const next: AnimgraphProject = {
    mainDiagramId: project.mainDiagramId || id,
    diagrams: [...project.diagrams, { id, data }],
  }
  if (activeDiagramId.value == null) {
    activeDiagramId.value = id
  }
  projectRef.value = next
}

/** Force Vue to notice in-place mutation of a diagram's RenderData tree. */
export function touchProject() {
  const p = projectRef.value
  if (p) projectRef.value = { diagrams: [...p.diagrams], mainDiagramId: p.mainDiagramId }
}

export function removeDiagram(diagramId: string): boolean {
  const project = projectRef.value
  if (!project) return false
  const idx = project.diagrams.findIndex((d) => d.id === diagramId)
  if (idx < 0) return false
  if (project.diagrams.length <= 1) {
    resetProject()
    return true
  }
  if (diagramId === project.mainDiagramId) {
    console.warn('removeDiagram: cannot remove main diagram; change mainDiagramId first')
    return false
  }
  const next: AnimgraphProject = {
    mainDiagramId: project.mainDiagramId,
    diagrams: project.diagrams.filter((d) => d.id !== diagramId),
  }
  const nextActive =
    activeDiagramId.value === diagramId
      ? next.mainDiagramId
      : activeDiagramId.value
  activeDiagramId.value = nextActive
  projectRef.value = next
  return true
}
