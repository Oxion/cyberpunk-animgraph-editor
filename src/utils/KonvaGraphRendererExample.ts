/**
 * Example usage of KonvaGraphRenderer
 */

import { KonvaGraphRenderer } from './KonvaGraphRenderer'
import type { RenderData, RenderNode } from './graph/diagramTypes'
import { emptyChildSlots } from './graph/nodeChildSlots'

// Example function to create a sample graph
export function createSampleGraphData(): RenderData {
  const nodes: RenderNode[] = [
    {
      id: 'node1',
      type: 'animAnimNode_StateMachine',
      data: { name: 'State Machine 1' },
      position: { x: 100, y: 100 },
      size: { width: 120, height: 80 },
      childSlots: emptyChildSlots(),
      metadata: {},
      bounds: { x: 100, y: 100, width: 120, height: 80 },
      isContainer: false,
      isGroup: false,
      zIndex: 0,
      color: '#ff6b6b',
      backgroundColor: '#ffe0e0',
      borderColor: '#333',
      borderWidth: 1,
      borderRadius: 4,
      visible: true,
      opacity: 1,
      scale: 1,
      rotation: 0
    },
    {
      id: 'node2',
      type: 'animAnimNode_Blend2',
      data: { name: 'Blend 2' },
      position: { x: 300, y: 100 },
      size: { width: 120, height: 80 },
      childSlots: emptyChildSlots(),
      metadata: {},
      bounds: { x: 300, y: 100, width: 120, height: 80 },
      isContainer: false,
      isGroup: false,
      zIndex: 0,
      color: '#4ecdc4',
      backgroundColor: '#e0f7f7',
      borderColor: '#333',
      borderWidth: 1,
      borderRadius: 4,
      visible: true,
      opacity: 1,
      scale: 1,
      rotation: 0
    },
    {
      id: 'node3',
      type: 'animAnimNode_FloatInput',
      data: { name: 'Float Input' },
      position: { x: 200, y: 250 },
      size: { width: 120, height: 80 },
      childSlots: emptyChildSlots(),
      metadata: {},
      bounds: { x: 200, y: 250, width: 120, height: 80 },
      isContainer: false,
      isGroup: false,
      zIndex: 0,
      color: '#ff9ff3',
      backgroundColor: '#ffe0f7',
      borderColor: '#333',
      borderWidth: 1,
      borderRadius: 4,
      visible: true,
      opacity: 1,
      scale: 1,
      rotation: 0
    }
  ]

  const allNodes = new Map<string, RenderNode>()
  nodes.forEach(node => {
    allNodes.set(node.id, node)
  })

  return {
    rootNodes: nodes,
    allNodes: allNodes,
    connections: [
      {
        from: 'node1',
        to: 'node2',
        type: 'connection',
        pinName: 'Output',
        data: {}
      },
      {
        from: 'node2',
        to: 'node3',
        type: 'connection',
        pinName: 'Input',
        data: {}
      }
    ]
  }
}

// Example function to initialize KonvaGraphRenderer
export function initializeKonvaRenderer(containerId: string): KonvaGraphRenderer | null {
  const container = document.getElementById(containerId) as HTMLDivElement
  if (!container) {
    console.error(`Container with id '${containerId}' not found`)
    return null
  }

  // Create sample graph data
  const graphData = createSampleGraphData()

  // Create renderer
  const renderer = new KonvaGraphRenderer(container, graphData)

  // Set up event handlers
  renderer.setOnNodeSelect((nodeId) => {
    console.log('Selected node:', nodeId)
    if (nodeId) {
      // Animate selection
      renderer.animateNodeSelection(nodeId)
    }
  })

  // Configure renderer
  renderer.setGridLayout(120, 80, 20)
  renderer.setShowConnections(true)
  renderer.setConnectionOpacity(0.8)
  renderer.setShowConnectionLabels(true)
  renderer.setShowConnectionArrows(true)

  // Enable animations
  renderer.setAnimationsEnabled(true)
  renderer.setAnimationDuration(300)

  // Center view on all nodes
  renderer.centerOnAllNodes()

  return renderer
}

// Example function to demonstrate usage
export function demonstrateKonvaRenderer() {
  // Initialize renderer
  const renderer = initializeKonvaRenderer('graph-container')
  if (!renderer) return

  // Example: Pan to specific node
  setTimeout(() => {
    renderer.panToNodeWithZoom('node2', 2.0)
  }, 2000)

  // Example: Animate view transition
  setTimeout(() => {
    renderer.animateViewTransition({
      zoom: 0.5,
      panX: 100,
      panY: 100
    })
  }, 4000)

  // Example: Reset view
  setTimeout(() => {
    renderer.resetView()
  }, 6000)

  return renderer
}
