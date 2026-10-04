/**
 * Example of using the new DOM-like render structure
 */

import type { RenderData, RenderNode } from './graph/diagramTypes'
import { AnimgraphParser } from './AnimgraphParser'
import { forEachDirectChild, getDirectChildren, walkSubtree } from './graph/nodeChildSlots'

export class RenderExample {
  private parser: AnimgraphParser

  constructor() {
    this.parser = new AnimgraphParser()
  }

  /**
   * Parse animgraph data and create render structure
   * @param animgraphData - Raw animgraph JSON data
   * @returns Render data ready for visualization
   */
  async parseForRender(animgraphData: any): Promise<RenderData> {
    return this.parser.parseForRender(animgraphData)
  }

  /**
   * Render all nodes to console (for debugging)
   * @param renderData - Render data to display
   */
  debugRender(renderData: RenderData): void {
    console.log('=== RENDER STRUCTURE ===')
    console.log(`Total nodes: ${renderData.allNodes.size}`)
    console.log(`Bounds: x=${renderData.bounds.x}, y=${renderData.bounds.y}, w=${renderData.bounds.width}, h=${renderData.bounds.height}`)
    console.log('')
    
    renderData.rootNodes.forEach((rootNode, index) => {
      console.log(`Root Node ${index + 1}:`)
      this.debugRenderNode(rootNode, 0)
    })
  }

  /**
   * Recursively render a node and its children
   * @param node - Node to render
   * @param depth - Current depth for indentation
   */
  private debugRenderNode(node: RenderNode, depth: number): void {
    const indent = '  '.repeat(depth)
    const type = node.isGroup ? `[GROUP: ${node.type}]` : `[NODE: ${node.type}]`
    const size = `${node.size.width}x${node.size.height}`
    const pos = `(${node.position.x}, ${node.position.y})`
    
    console.log(`${indent}${type} ${node.id} ${size} ${pos}`)
    
    if (node.isGroup) {
      const kids = getDirectChildren(node)
      console.log(`${indent}  Group: ${node.metadata?.propertyName ?? node.type} (${kids.length} nodes)`)
      console.log(`${indent}  Layout: ${node.layout}, Spacing: ${node.spacing}`)
    }
    
    const kids = getDirectChildren(node)
    if (kids.length > 0) {
      console.log(`${indent}  Children (${kids.length}):`)
      kids.forEach(child => {
        this.debugRenderNode(child, depth + 1)
      })
    }
  }

  /**
   * Get all nodes that should be rendered (visible nodes)
   * @param renderData - Render data
   * @returns Array of visible render nodes
   */
  getVisibleNodes(renderData: RenderData): RenderNode[] {
    const visibleNodes: RenderNode[] = []
    
    const collectVisible = (node: RenderNode) => {
      if (node.visible && node.opacity > 0) {
        visibleNodes.push(node)
      }
      forEachDirectChild(node, collectVisible)
    }
    
    renderData.rootNodes.forEach(collectVisible)
    return visibleNodes
  }

  /**
   * Get nodes by type
   * @param renderData - Render data
   * @param nodeType - Type to filter by
   * @returns Array of nodes of specified type
   */
  getNodesByType(renderData: RenderData, nodeType: string): RenderNode[] {
    const nodes: RenderNode[] = []
    
    renderData.rootNodes.forEach((root) => {
      walkSubtree(root, (node) => {
        if (node.type === nodeType) nodes.push(node)
      })
    })
    
    return nodes
  }

  /**
   * Get all groups in the render data
   * @param renderData - Render data
   * @returns Array of group nodes
   */
  getGroups(renderData: RenderData): RenderNode[] {
    const groups: RenderNode[] = []
    
    renderData.rootNodes.forEach((root) => {
      walkSubtree(root, (node) => {
        if (node.isGroup) groups.push(node)
      })
    })
    
    return groups
  }

  /**
   * Calculate total area covered by all nodes
   * @param renderData - Render data
   * @returns Total area in pixels
   */
  calculateTotalArea(renderData: RenderData): number {
    return renderData.bounds.width * renderData.bounds.height
  }

  /**
   * Find node at specific coordinates
   * @param renderData - Render data
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns Node at coordinates or null
   */
  findNodeAt(renderData: RenderData, x: number, y: number): RenderNode | null {
    const checkNode = (node: RenderNode): RenderNode | null => {
      const bounds = node.bounds
      if (x >= bounds.x && x <= bounds.x + bounds.width &&
          y >= bounds.y && y <= bounds.y + bounds.height) {
        return node
      }
      
      // Check children (most specific first)
      const kids = getDirectChildren(node)
      for (let i = kids.length - 1; i >= 0; i--) {
        const found = checkNode(kids[i])
        if (found) return found
      }
      
      return null
    }
    
    for (const rootNode of renderData.rootNodes) {
      const found = checkNode(rootNode)
      if (found) return found
    }
    
    return null
  }
}
