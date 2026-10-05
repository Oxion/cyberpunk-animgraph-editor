/**
 * Logical diagram types: RenderNode tree, diagram connections, serialized export.
 * Runtime helpers live in `diagramModel.ts`.
 * Below: animgraphTypes (raw handles).
 */

import type { LayoutDebugContainer } from './DirectChildrenLayout'
import type { AnimgraphData, AnimgraphNode } from './animgraphTypes'
import type { AnimClipSetupJson } from '../sim/clipLibrary'
import type { AnimDatabaseLibraryJson } from '../sim/animDatabase'

/** Roots: world/stage; children: local offset to parent. */
export interface RenderNode {
  id: string
  type: string
  data: {
    originalNodeId?: string
    /** Contain field → inline diagram node id(s). Parallel to Data array order. */
    inlines?: Record<string, string | string[]>
    [key: string]: any
  }
  position: { x: number; y: number }
  size: { width: number; height: number }
  /**
   * Named child lists. Default hierarchy lives in `childSlots.children`
   * (see DEFAULT_CHILD_SLOT). Overview chrome uses `overview`.
   */
  childSlots: Record<string, RenderNode[]>
  parent?: RenderNode
  /** Slot name on parent that holds this node. */
  parentSlot?: string
  metadata: Record<string, any>
  description?: string

  bounds: { x: number; y: number; width: number; height: number }
  isContainer: boolean
  isGroup: boolean
  groupType?: string
  /** Child packing for PropertyGroup / wrapper. */
  layout?: 'horizontal' | 'vertical' | 'grid' | 'flow'
  spacing?: number
  padding?: { top: number; right: number; bottom: number; left: number }
  zIndex: number
  /** Cola compound input boxes for debug overlay. Local to this node. Not saved. */
  layoutDebugContainers?: LayoutDebugContainer[]

  color?: string
  backgroundColor?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number

  visible: boolean
  opacity: number
  scale: number
  rotation: number
}

export interface DiagramConnection {
  from: string
  to: string
  type: string
  pinName?: string
  /**
   * Cross-view diagram wiring. Overview edge is `from → host` (both painted);
   * `originalTo` names the real sink.
   */
  metadata?: {
    originalFrom?: string
    originalTo?: string
  }
}

/** Cross-view diagram connection with required logical endpoints. */
export type CrossViewConnection = DiagramConnection & {
  metadata: {
    originalFrom: string
    originalTo: string
  }
}

export interface RenderData {
  rootNodes: RenderNode[]
  allNodes: Map<string, RenderNode>
  connections: DiagramConnection[]
  metadata: Record<string, any>
  nodeTypes: Set<string>
  bounds: { x: number; y: number; width: number; height: number }
  handlesRegistry: Map<string, AnimgraphNode>
  originalAnimgraph: AnimgraphData
  /**
   * Handles that live in handlesRegistry but are NOT part of animgraph nodesToInit /
   * wired graph yet (e.g. conditions before path to TransitionDescription).
   */
  floatingHandleIds?: Set<string>
}

export interface SerializedRenderNode {
  id: string
  type: string
  data: {
    originalNodeId?: string
    inlines?: Record<string, string | string[]>
  }
  position: { x: number; y: number }
  size: { width: number; height: number }

  /** Named child refs by slot (`children` default, `overview`, …). */
  childSlots: Record<string, { id: string; type: string }[]>
  parentSlot?: string

  metadata: Record<string, any>
  description?: string

  bounds: { x: number; y: number; width: number; height: number }
  isContainer: boolean
  isGroup: boolean
  groupType?: string
  zIndex: number

  color?: string
  backgroundColor?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number

  visible: boolean
  opacity: number
  scale: number
  rotation: number

  groupName?: string
  groupNodes?: { id: string; type: string }[]
  layout?: string
  spacing?: number
  padding?: { top: number; right: number; bottom: number; left: number }
}

/** Exported editor diagram JSON (serializable). */
export interface AnimgraphVisualizerData {
  rootNodeIds: string[]
  nodes: SerializedRenderNode[]
  connections: DiagramConnection[]
  metadata: Record<string, any>
  nodeTypes: string[]
  bounds: { x: number; y: number; width: number; height: number }
  /** Unwrapped animgraph (HandleRefId stubs). Full payloads live in `handlesRegistry`. */
  originalAnimgraph: AnimgraphData
  /** Flat handle payloads (HandleId + Data). */
  handlesRegistry: AnimgraphNode[]
  /** Floating handle ids (subset of handlesRegistry). */
  floatingHandleIds?: string[]
}

/** One animgraph diagram inside a multi-diagram project. */
export interface ProjectDiagram {
  id: string
  data: RenderData
}

/** In-memory project: list of isolated RenderData diagrams. */
export interface AnimgraphProject {
  /** Root / primary diagram id (taskbar "Main"; changeable later via project settings). */
  mainDiagramId: string
  diagrams: ProjectDiagram[]
}

/** Serialized project file (each diagram = existing editor export shape). */
export interface AnimgraphProjectFile {
  type: 'animgraph-project'
  version?: number
  /** Root / primary diagram id. */
  mainDiagramId: string
  diagrams: { id: string; data: AnimgraphVisualizerData }[]
  /** Compact clip setup (animClipSetup) — optional; shared across diagrams. */
  clipSetup?: AnimClipSetupJson
  /** Compact anim database library — optional; shared across diagrams. */
  animDatabaseLibrary?: AnimDatabaseLibraryJson
  /**
   * Offline StaticSwitch entity tags (Component/Visual/Rig mock).
   * name → present; shared across diagrams.
   */
  entityTags?: Record<string, boolean>
}

/** Default id suggestion for the first diagram; not a hard requirement. */
export const MAIN_DIAGRAM_ID = 'main'
