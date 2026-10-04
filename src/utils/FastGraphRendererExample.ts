/**
 * Example of using FastGraphRenderer with RenderData
 */

import type { RenderData } from './graph/diagramTypes'
import { AnimgraphParser } from './AnimgraphParser'
import { FastGraphRenderer } from './FastGraphRenderer'

export class FastGraphRendererExample {
  private parser: AnimgraphParser
  private renderer: FastGraphRenderer | null = null

  constructor() {
    this.parser = new AnimgraphParser()
  }

  /**
   * Initialize renderer with canvas and animgraph data
   * @param canvas - HTML canvas element
   * @param animgraphData - Raw animgraph JSON data
   */
  initializeRenderer(canvas: HTMLCanvasElement, animgraphData: any): void {
    console.log('Initializing FastGraphRenderer with RenderData...')
    
    // Parse data into RenderData structure
    const renderData = this.parser.parseForRender(animgraphData)
    console.log('RenderData created:', renderData)
    
    // Create renderer with RenderData
    this.renderer = new FastGraphRenderer(canvas, renderData)
    
    console.log('FastGraphRenderer initialized successfully')
  }

  /**
   * Initialize renderer with ParsedData (backward compatibility)
   * @param canvas - HTML canvas element
   * @param parsedData - Parsed animgraph data
   */
  initializeRendererWithParsedData(canvas: HTMLCanvasElement, parsedData: any): void {
    console.log('Initializing FastGraphRenderer with ParsedData...')
    
    // Create renderer with ParsedData
    this.renderer = new FastGraphRenderer(canvas, parsedData)
    
    console.log('FastGraphRenderer initialized with ParsedData')
  }

  /**
   * Get renderer instance
   */
  getRenderer(): FastGraphRenderer | null {
    return this.renderer
  }

  /**
   * Set grid layout
   * @param cellWidth - Width of each cell
   * @param cellHeight - Height of each cell
   * @param cellsGap - Gap between cells
   */
  setGridLayout(cellWidth: number, cellHeight: number, cellsGap: number): void {
    if (this.renderer) {
      this.renderer.setGridLayout(cellWidth, cellHeight, cellsGap)
    }
  }

  /**
   * Set zoom level
   * @param zoom - Zoom level (0.1 to 5.0)
   * @param cursorX - Optional cursor X position for zoom
   * @param cursorY - Optional cursor Y position for zoom
   */
  setZoom(zoom: number, cursorX?: number, cursorY?: number): void {
    if (this.renderer) {
      this.renderer.setZoom(zoom, cursorX, cursorY)
    }
  }

  /**
   * Set pan position
   * @param x - X pan position
   * @param y - Y pan position
   */
  setPan(x: number, y: number): void {
    if (this.renderer) {
      this.renderer.setPan(x, y)
    }
  }

  /**
   * Center view on all nodes
   */
  centerOnAllNodes(): void {
    if (this.renderer) {
      this.renderer.centerOnAllNodes()
    }
  }

  /**
   * Reset view to default
   */
  resetView(): void {
    if (this.renderer) {
      this.renderer.resetView()
    }
  }

  /**
   * Toggle hierarchical rendering
   */
  toggleHierarchicalRendering(): void {
    if (this.renderer) {
      this.renderer.toggleHierarchicalRendering()
    }
  }

  /**
   * Set hierarchical rendering
   * @param enabled - Whether to enable hierarchical rendering
   */
  setHierarchicalRendering(enabled: boolean): void {
    if (this.renderer) {
      this.renderer.setHierarchicalRendering(enabled)
    }
  }

  /**
   * Get current view state
   */
  getViewState(): { zoom: number, panX: number, panY: number } | null {
    if (this.renderer) {
      return this.renderer.getViewState()
    }
    return null
  }

  /**
   * Set view state
   * @param state - View state to set
   */
  setViewState(state: { zoom: number, panX: number, panY: number }): void {
    if (this.renderer) {
      this.renderer.setViewState(state)
    }
  }

  /**
   * Get hierarchical settings
   */
  getHierarchicalSettings(): any {
    if (this.renderer) {
      return this.renderer.getHierarchicalSettings()
    }
    return null
  }

  /**
   * Get hierarchical info
   */
  getHierarchicalInfo(): any {
    if (this.renderer) {
      return this.renderer.getHierarchicalInfo()
    }
    return null
  }

  /**
   * Cleanup renderer
   */
  destroy(): void {
    if (this.renderer) {
      this.renderer.destroy()
      this.renderer = null
    }
  }
}

// Example usage function
export function createFastGraphRendererExample(canvas: HTMLCanvasElement, animgraphData: any): FastGraphRendererExample {
  const example = new FastGraphRendererExample()
  example.initializeRenderer(canvas, animgraphData)
  return example
}
