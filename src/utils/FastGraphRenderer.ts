/**
 * Fast Graph Renderer using WebGL and optimizations for large graphs
 */

import type { DiagramConnection, RenderData, RenderNode } from './graph/diagramTypes'
import { ParsedData, ParsedNode } from './AnimgraphParser'
import {
  forEachDirectChild,
  getDirectChildren,
} from './graph/nodeChildSlots'
import { fillCanvasDotGrid, subscribeDiagramGridSettings } from './graph/diagramDotGrid'

// Type definitions
interface LODLevel {
  level: number
  nodes: ClusterNode[]
  maxDistance: number
}

interface ClusterNode extends RenderNode {
  clusterSize: number
  nodes: RenderNode[]
  clusterColor: number[]  // RGB color for clustering
}

interface WebGLBuffers {
  position: WebGLBuffer | null
  color: WebGLBuffer | null
  size: WebGLBuffer | null
  type: WebGLBuffer | null
}

export class FastGraphRenderer {
  private canvas: HTMLCanvasElement
  private graphData: RenderData
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null
  private program: WebGLProgram | null
  private buffers: WebGLBuffers
  private textures: Record<string, WebGLTexture | null>

  // Performance settings
  private maxVisibleNodes: number
  private clusterThreshold: number
  private lodLevels: number

  // View state
  private zoom: number
  private panX: number
  private panY: number
  private viewportWidth: number
  private viewportHeight: number

  // For testing: force Canvas 2D mode
  private forceCanvas2D: boolean

  // Canvas 2D context
  private ctx: CanvasRenderingContext2D | null
  private clusteredNodes: ClusterNode[]
  private lodData: LODLevel[]
  private nodeCount: number
  private resizeObserver: ResizeObserver | null
  private unsubGrid: (() => void) | null = null

  // Grid layout parameters
  private cellWidth: number = 80
  private cellHeight: number = 60
  private cellsGap: number = 4

  // Connection rendering settings
  private showConnections: boolean = true
  private connectionOpacity: number = 0.8
  private connectionLabels: boolean = true
  private connectionArrows: boolean = true
  
  // Selected node connection highlighting
  private highlightSelectedNodeConnections: boolean = true
  private selectedNodeConnectionColor: string = '#ff6b6b' // Red color for selected node connections
  private selectedNodeConnectionOpacity: number = 1.0
  private selectedNodeConnectionWidth: number = 3

  // Hierarchical rendering settings
  private hierarchicalRendering: boolean = true
  private showHierarchicalContainers: boolean = true
  private containerPadding: number = 20
  private containerBorderWidth: number = 2
  
  // Property grouping settings
  private showPropertyGroups: boolean = true
  private propertyGroupLabels: boolean = true
  private propertyGroupSpacing: number = 15
  private propertyGroupBorderWidth: number = 1

  // Node selection settings
  private selectedNodeId: string | null = null
  private onNodeSelect: ((nodeId: string | null) => void) | null = null

  constructor(canvasElement: HTMLCanvasElement, graphData: RenderData) {
    this.canvas = canvasElement
    this.graphData = graphData
    this.gl = null
    this.program = null
    this.buffers = {
      position: null,
      color: null,
      size: null,
      type: null
    }
    this.textures = {}

    // Performance settings
    this.maxVisibleNodes = 200
    this.clusterThreshold = 50
    this.lodLevels = 3

    // View state
    this.zoom = 1.0
    this.panX = 0
    this.panY = 0
    this.viewportWidth = 800
    this.viewportHeight = 600

    // For testing: force Canvas 2D mode
    this.forceCanvas2D = true

    // Canvas 2D properties
    this.ctx = null
    this.clusteredNodes = []
    this.lodData = []
    this.nodeCount = 0
    this.resizeObserver = null

    this.init()
    this.unsubGrid = subscribeDiagramGridSettings(() => {
      if (this.ctx) this.renderCanvas2D()
    })
  }

  /**
   * Set grid layout parameters
   * @param cellWidth - Width of each cell
   * @param cellHeight - Height of each cell
   * @param cellsGap - Gap between cells
   */
  public setGridLayout(cellWidth: number, cellHeight: number, cellsGap: number): void {
    this.cellWidth = cellWidth
    this.cellHeight = cellHeight
    this.cellsGap = cellsGap
    console.log(`Grid layout updated: ${cellWidth}x${cellHeight}, gap: ${cellsGap}`)
  }

  /**
   * Get all nodes from either ParsedData or RenderData
   */
  private getAllNodes(): RenderNode[] {
    const allNodes: RenderNode[] = []
    const processNode = (node: RenderNode) => {
      allNodes.push(node)
      forEachDirectChild(node, processNode)
    }
    this.graphData.rootNodes.forEach(processNode)
    return allNodes
  }

  /**
   * Get node color in hex format
   */
  private getNodeColorHex(type: string): string {
    const colors: Record<string, string> = {
      'animAnimNode_StateMachine': '#ff6b6b',
      'animAnimNode_Blend2': '#4ecdc4',
      'animAnimNode_BlendMultiple': '#45b7d1',
      'animAnimNode_Switch': '#96ceb4',
      'animAnimNode_SkAnim': '#feca57',
      'animAnimNode_FloatInput': '#ff9ff3',
      'animAnimNode_IntInput': '#54a0ff',
      'animAnimNode_MathExpressionFloat': '#5f27cd'
    }
    return colors[type] || '#95a5a6'
  }

  /**
   * Convert hex color to RGB array
   */
  private hexToRgb(hex: string): number[] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (result) {
      return [
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255
      ]
    }
    return [0.5, 0.5, 0.5] // Default gray
  }

  /**
   * Get node background color in hex format
   */
  private getNodeBackgroundColorHex(type: string): string {
    const colors: Record<string, string> = {
      'animAnimNode_StateMachine': '#ffe0e0',
      'animAnimNode_Blend2': '#e0f7f7',
      'animAnimNode_BlendMultiple': '#e0f2ff',
      'animAnimNode_Switch': '#e8f5e8',
      'animAnimNode_SkAnim': '#fff8e0',
      'animAnimNode_FloatInput': '#ffe0f7',
      'animAnimNode_IntInput': '#e0f0ff',
      'animAnimNode_MathExpressionFloat': '#f0e8ff'
    }
    return colors[type] || '#f8f9fa'
  }

  /**
   * Get current grid layout parameters
   */
  public getGridLayout(): { cellWidth: number, cellHeight: number, cellsGap: number } {
    return {
      cellWidth: this.cellWidth,
      cellHeight: this.cellHeight,
      cellsGap: this.cellsGap
    }
  }

  /**
   * Initialize WebGL context and shaders
   */
  private init(): void {
    console.log('FastGraphRenderer.init() called')

    // For testing: force Canvas 2D mode
    if (this.forceCanvas2D) {
      console.log('Forcing Canvas 2D mode for testing')
      this.fallbackToCanvas2D()
      return
    }

    try {
      this.setupWebGL()
      this.setupShaders()
      this.setupBuffers()
      this.createOptimizedGraph()
      console.log('FastGraphRenderer initialized successfully')

      // Force initial render
      if (this.nodeCount > 0) {
        this.render()
      }
    } catch (error) {
      console.error('Failed to initialize FastGraphRenderer:', error)
      this.fallbackToCanvas2D()
    }
  }

  /**
   * Setup WebGL context
   */
  private setupWebGL(): void {
    const glContext = this.canvas.getContext('webgl2') ||
      this.canvas.getContext('webgl') ||
      this.canvas.getContext('experimental-webgl')

    if (!glContext || !(glContext instanceof WebGLRenderingContext || glContext instanceof WebGL2RenderingContext)) {
      throw new Error('WebGL not supported')
    }

    this.gl = glContext

    // Set canvas size
    this.canvas.width = this.canvas.clientWidth
    this.canvas.height = this.canvas.clientHeight
    this.viewportWidth = this.canvas.width
    this.viewportHeight = this.canvas.height

    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    this.gl.enable(this.gl.BLEND)
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA)
  }

  /**
   * Setup shaders for node and edge rendering
   */
  private setupShaders(): void {
    if (!this.gl) {
      console.warn('WebGL context not available, falling back to Canvas 2D')
      this.fallbackToCanvas2D()
      return
    }

    const vertexShaderSource = `
      attribute vec2 a_position;
      attribute vec3 a_color;
      attribute float a_size;
      attribute float a_type;
      
      uniform mat3 u_transform;
      uniform float u_zoom;
      
      varying vec3 v_color;
      varying float v_type;
      
      void main() {
        vec2 position = (u_transform * vec3(a_position, 1.0)).xy;
        gl_Position = vec4(position * u_zoom, 0.0, 1.0);
        gl_PointSize = a_size * u_zoom;
        v_color = a_color;
        v_type = a_type;
      }
    `

    const fragmentShaderSource = `
      precision mediump float;
      
      varying vec3 v_color;
      varying float v_type;
      
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        
        float alpha = 1.0 - smoothstep(0.4, 0.5, dist);
        gl_FragColor = vec4(v_color, alpha);
      }
    `

    this.program = this.createProgram(vertexShaderSource, fragmentShaderSource)
    if (this.program) {
      this.gl.useProgram(this.program)
    } else {
      console.warn('Failed to create WebGL program, falling back to Canvas 2D')
      this.fallbackToCanvas2D()
      return
    }
  }

  /**
   * Create WebGL program from shader sources
   */
  private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram | null {
    if (!this.gl) return null

    const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexSource)
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentSource)

    if (!vertexShader || !fragmentShader) return null

    const program = this.gl.createProgram()
    if (!program) return null

    this.gl.attachShader(program, vertexShader)
    this.gl.attachShader(program, fragmentShader)
    this.gl.linkProgram(program)

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      console.error('Program link error:', this.gl.getProgramInfoLog(program))
      return null
    }

    return program
  }

  /**
   * Create WebGL shader
   */
  private createShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null

    const shader = this.gl.createShader(type)
    if (!shader) return null

    this.gl.shaderSource(shader, source)
    this.gl.compileShader(shader)

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', this.gl.getShaderInfoLog(shader))
      return null
    }

    return shader
  }

  /**
   * Setup vertex buffers
   */
  private setupBuffers(): void {
    if (!this.gl) {
      console.warn('WebGL context not available, falling back to Canvas 2D')
      this.fallbackToCanvas2D()
      return
    }

    // Position buffer
    this.buffers.position = this.gl.createBuffer()
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.position)

    // Color buffer
    this.buffers.color = this.gl.createBuffer()
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.color)

    // Size buffer
    this.buffers.size = this.gl.createBuffer()
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.size)

    // Type buffer
    this.buffers.type = this.gl.createBuffer()
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.type)
  }

  /**
   * Create optimized graph with clustering and LOD
   */
  private createOptimizedGraph(): void {
    console.log('Creating optimized graph...')

    // Get all nodes (either from RenderData or ParsedData)
    const allNodes = this.getAllNodes()
    console.log('Total nodes to process:', allNodes.length)

    // Cluster nodes for performance
    this.clusteredNodes = this.clusterNodes(allNodes)
    console.log('Clustered nodes:', this.clusteredNodes.length)

    // Create LOD levels
    this.lodData = this.createLODLevels(this.clusteredNodes)
    console.log('LOD levels created:', this.lodData.length)

    // Prepare WebGL data
    this.prepareWebGLData()
  }

  /**
   * Cluster nearby nodes to reduce rendering load
   */
  private clusterNodes(nodes: RenderNode[]): ClusterNode[] {
    if (nodes.length <= this.maxVisibleNodes) {
      // Convert RenderNode[] to ClusterNode[] when no clustering needed
      return nodes.map(node => ({
        ...node,
        clusterSize: 1,
        nodes: [node],
        clusterColor: [0.5, 0.5, 0.5]
      }))
    }

    const clusters: ClusterNode[] = []
    const visited = new Set<number>()

    // Simple distance-based clustering
    for (let i = 0; i < nodes.length; i++) {
      if (visited.has(i)) continue

      const cluster = [nodes[i]]
      visited.add(i)

      for (let j = i + 1; j < nodes.length; j++) {
        if (visited.has(j)) continue

        // Calculate distance (simplified)
        const distance = Math.abs(i - j)
        if (distance < this.clusterThreshold) {
          cluster.push(nodes[j])
          visited.add(j)
        }
      }

      if (cluster.length > 1) {
        // Create cluster node
        const clusterNode: ClusterNode = {
          ...nodes[i],
          id: `cluster_${clusters.length}`,
          type: 'Cluster',
          position: this.calculateClusterCenter(cluster),
          size: { width: 120, height: 80 },
          clusterSize: cluster.length,
          nodes: cluster,
          clusterColor: this.getClusterColor(cluster.length)
        }
        clusters.push(clusterNode)
      } else {
        clusters.push({ ...nodes[i], clusterSize: 1, nodes: [nodes[i]], clusterColor: [0.5, 0.5, 0.5] })
      }
    }

    return clusters
  }

  /**
   * Calculate center position for a cluster
   */
  private calculateClusterCenter(nodes: RenderNode[]): { x: number; y: number } {
    const x = nodes.reduce((sum, node) => sum + (node.position?.x || 0), 0) / nodes.length
    const y = nodes.reduce((sum, node) => sum + (node.position?.y || 0), 0) / nodes.length
    return { x, y }
  }

  /**
   * Get color for cluster based on size
   */
  private getClusterColor(size: number): number[] {
    const colors = [
      [0.2, 0.6, 0.8], // Blue
      [0.8, 0.4, 0.2], // Orange
      [0.6, 0.8, 0.2], // Green
      [0.8, 0.2, 0.6], // Pink
      [0.4, 0.8, 0.8]  // Cyan
    ]
    return colors[size % colors.length]
  }

  /**
   * Get color for node type (returns RGB values 0-1)
   */
  private getNodeColor(type: string): number[] {
    const colorMap: Record<string, number[]> = {
      'animAnimNode_Root': [0.0, 1.0, 0.5],      // Green
      'animAnimNode_Output': [1.0, 0.4, 0.4],    // Red
      'animAnimNode_Blend2': [0.3, 0.7, 0.8],   // Blue
      'animAnimNode_BlendMultiple': [0.3, 0.7, 0.8], // Blue
      'animAnimNode_VectorInput': [0.6, 0.8, 0.7],   // Light green
      'animAnimNode_FloatInput': [0.6, 0.8, 0.7],    // Light green
      'animAnimNode_SetBoneTransform': [1.0, 0.8, 0.3], // Yellow
      'animAnimNode_TranslateBone': [1.0, 0.8, 0.3],   // Yellow
      'animAnimNode_StateMachine': [0.8, 0.4, 0.8],    // Purple
      'Cluster': [1.0, 0.8, 0.3],                      // Yellow
      'Unknown': [0.4, 0.4, 0.8]                       // Blue-gray
    }

    return colorMap[type] || [0.5, 0.5, 0.5] // Default gray
  }

  /**
   * Create Level-of-Detail data
   */
  private createLODLevels(nodes: ClusterNode[]): LODLevel[] {
    const levels: LODLevel[] = []

    // Level 0: All nodes (highest detail)
    levels.push({
      level: 0,
      nodes: nodes,
      maxDistance: Infinity
    })

    // Level 1: Medium detail (every 2nd node)
    if (nodes.length > 100) {
      levels.push({
        level: 1,
        nodes: nodes.filter((_, i) => i % 2 === 0),
        maxDistance: 100
      })
    }

    // Level 2: Low detail (every 5th node)
    if (nodes.length > 50) {
      levels.push({
        level: 2,
        nodes: nodes.filter((_, i) => i % 5 === 0),
        maxDistance: 50
      })
    }

    return levels
  }

  /**
   * Prepare data for WebGL rendering
   */
  private prepareWebGLData(): void {
    if (!this.gl) return

    const positions: number[] = []
    const colors: number[] = []
    const sizes: number[] = []
    const types: number[] = []

    // Use appropriate LOD level based on zoom
    const lodLevel = this.getLODLevel()

    // Safety check for LOD data
    if (!this.lodData || !this.lodData[lodLevel] || !this.lodData[lodLevel].nodes) {
      console.error('Invalid LOD data at level:', lodLevel, 'LOD data:', this.lodData)
      return
    }

    const nodes = this.lodData[lodLevel].nodes
    console.log('Preparing WebGL data for', nodes.length, 'nodes at LOD level', lodLevel)

    nodes.forEach(node => {
      // Use ClusterNode position and size directly
      const pos = node.position
      const nodeSize = node.size

      // Scale positions to be visible in WebGL viewport
      const scaledX = pos.x * 0.01  // Scale down for WebGL
      const scaledY = pos.y * 0.01

      positions.push(scaledX, scaledY)

      // Get color from ClusterNode or fallback to type-based color
      const color = node.clusterColor || (node.color ? this.hexToRgb(node.color) : this.getNodeColor(node.type))
      colors.push(...color)

      // Use ClusterNode size or fallback
      const size = nodeSize ? Math.max(nodeSize.width, nodeSize.height) : 1
      sizes.push(size * 0.1) // Scale down for WebGL

      const type = this.getNodeTypeValue(node.type)
      types.push(type)

      console.log(`WebGL cluster node ${node.id}: pos(${scaledX}, ${scaledY}), color(${color}), size(${size * 0.1}), clusterSize(${node.clusterSize})`)
    })

    // Update WebGL buffers
    this.updateBuffer(this.buffers.position, new Float32Array(positions))
    this.updateBuffer(this.buffers.color, new Float32Array(colors))
    this.updateBuffer(this.buffers.size, new Float32Array(sizes))
    this.updateBuffer(this.buffers.type, new Float32Array(types))

    this.nodeCount = nodes.length
    console.log('WebGL data prepared successfully for', this.nodeCount, 'nodes')
  }

  /**
   * Update WebGL buffer with new data
   */
  private updateBuffer(buffer: WebGLBuffer | null, data: Float32Array): void {
    if (!this.gl || !buffer) return

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.DYNAMIC_DRAW)
  }

  /**
   * Get appropriate LOD level based on zoom
   */
  private getLODLevel(): number {
    // Ensure we have valid LOD data
    if (!this.lodData || this.lodData.length === 0) {
      return 0
    }

    if (this.zoom > 2.0) return 0      // High detail
    if (this.zoom > 0.5) return Math.min(1, this.lodData.length - 1)      // Medium detail
    return Math.min(2, this.lodData.length - 1)                            // Low detail
  }

  /**
   * Get numeric value for node type
   */
  private getNodeTypeValue(type: string): number {
    const typeMap: Record<string, number> = {
      'animAnimNode_Root': 1.0,
      'animAnimNode_Output': 2.0,
      'animAnimNode_Blend2': 3.0,
      'animAnimNode_VectorInput': 4.0,
      'Cluster': 5.0,
      'Unknown': 0.0
    }
    return typeMap[type] || 0.0
  }

  /**
   * Render the graph
   */
  private render(): void {
    if (!this.gl || !this.program) return

    // Check if we have data to render
    if (!this.nodeCount || this.nodeCount === 0) {
      console.log('No nodes to render, skipping WebGL render')
      return
    }

    // Clear canvas
    this.gl.clearColor(0.102, 0.102, 0.102, 1.0)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)

    // Update transform matrix
    const transform = [
      this.zoom, 0, this.panX,
      0, this.zoom, this.panY,
      0, 0, 1
    ]

    const transformLocation = this.gl.getUniformLocation(this.program, 'u_transform')
    if (transformLocation) {
      this.gl.uniformMatrix3fv(transformLocation, false, transform)
    }

    const zoomLocation = this.gl.getUniformLocation(this.program, 'u_zoom')
    if (zoomLocation) {
      this.gl.uniform1f(zoomLocation, this.zoom)
    }

    // Bind attributes
    this.bindAttributes()

    // Draw nodes
    this.gl.drawArrays(this.gl.POINTS, 0, this.nodeCount)
    console.log('WebGL rendered', this.nodeCount, 'nodes')
  }

  /**
   * Bind vertex attributes
   */
  private bindAttributes(): void {
    if (!this.gl || !this.program) return

    // Position attribute
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.position)
    const positionLocation = this.gl.getAttribLocation(this.program, 'a_position')
    this.gl.enableVertexAttribArray(positionLocation)
    this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0)

    // Color attribute
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.color)
    const colorLocation = this.gl.getAttribLocation(this.program, 'a_color')
    this.gl.enableVertexAttribArray(colorLocation)
    this.gl.vertexAttribPointer(colorLocation, 3, this.gl.FLOAT, false, 0, 0)

    // Size attribute
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.size)
    const sizeLocation = this.gl.getAttribLocation(this.program, 'a_size')
    this.gl.enableVertexAttribArray(sizeLocation)
    this.gl.vertexAttribPointer(sizeLocation, 1, this.gl.FLOAT, false, 0, 0)

    // Type attribute
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.type)
    const typeLocation = this.gl.getAttribLocation(this.program, 'a_type')
    this.gl.enableVertexAttribArray(typeLocation)
    this.gl.vertexAttribPointer(typeLocation, 1, this.gl.FLOAT, false, 0, 0)
  }

  /**
   * Handle zoom
   */
  public setZoom(zoom: number, cursorX?: number, cursorY?: number): void {
    const newZoom = Math.max(0.1, Math.min(5.0, zoom))

    if (cursorX !== undefined && cursorY !== undefined && newZoom !== this.zoom) {
      // Zoom to specific cursor position
      this.zoomToPosition(newZoom, cursorX, cursorY)
    } else {
      // Simple zoom from center
      this.zoom = newZoom

      if (this.forceCanvas2D || !this.gl) {
        // Canvas 2D mode: re-render with new zoom
        this.renderCanvas2D()
      } else {
        // WebGL mode: update LOD and render
        this.prepareWebGLData()
        if (this.nodeCount > 0) {
          this.render()
        }
      }
    }
  }

  /**
   * Zoom to specific position (cursor position)
   */
  public zoomToPosition(zoom: number, cursorX: number, cursorY: number): void {
    const newZoom = Math.max(0.1, Math.min(5.0, zoom))

    if (newZoom !== this.zoom) {
      // Calculate the world position under cursor before zoom
      // Convert screen coordinates to world coordinates
      const worldX = (cursorX - this.panX) / this.zoom
      const worldY = (cursorY - this.panY) / this.zoom

      // Update zoom
      this.zoom = newZoom

      // Adjust pan so that the world position under cursor stays the same
      this.panX = cursorX - worldX * this.zoom
      this.panY = cursorY - worldY * this.zoom

      if (this.forceCanvas2D || !this.gl) {
        this.renderCanvas2D()
      } else if (this.nodeCount > 0) {
        this.render()
      }
    }
  }

  /**
   * Zoom by factor relative to cursor position
   */
  public zoomByFactor(factor: number, cursorX: number, cursorY: number): void {
    const newZoom = Math.max(0.1, Math.min(5.0, this.zoom * factor))
    this.zoomToPosition(newZoom, cursorX, cursorY)
  }

  /**
   * Handle pan
   */
  public setPan(x: number, y: number): void {
    this.panX = x
    this.panY = y

    if (this.forceCanvas2D || !this.gl) {
      // Canvas 2D mode: re-render with new pan
      this.renderCanvas2D()
    } else if (this.nodeCount > 0) {
      // WebGL mode: render
      this.render()
    }
  }

  /**
   * Check if there are nodes outside the visible area
   */
  public hasNodesOutsideViewport(): boolean {
    const nodes = this.clusteredNodes.length > 0 ? this.clusteredNodes : this.getAllNodes().map(node => ({
      ...node,
      clusterSize: 1,
      nodes: [node],
      clusterColor: [0.5, 0.5, 0.5]
    }))
    const centerX = this.canvas.width / 2
    const centerY = this.canvas.height / 2

    return nodes.some(node => {
      let x: number, y: number

      if (node.position && typeof node.position.x === 'number' && typeof node.position.y === 'number') {
        x = centerX + (node.position.x - 60) * 2 * this.zoom + this.panX
        y = centerY + (node.position.y - 15) * 2 * this.zoom + this.panY
      } else {
        // Use grid layout logic
        const nodeWidth = this.cellWidth * this.zoom
        const nodeHeight = this.cellHeight * this.zoom
        const cellPadding = this.cellsGap * this.zoom
        const cellWidth = nodeWidth + cellPadding
        const cellHeight = nodeHeight + cellPadding

        const colsPerRow = Math.ceil(Math.sqrt(nodes.length))
        const index = nodes.indexOf(node)
        const row = Math.floor(index / colsPerRow)
        const col = index % colsPerRow

        const gridWidth = colsPerRow * cellWidth
        const gridHeight = Math.ceil(nodes.length / colsPerRow) * cellHeight
        const startX = (this.canvas.width - gridWidth) / 2
        const startY = (this.canvas.height - gridHeight) / 2

        x = startX + (col * cellWidth) + (cellWidth / 2) + this.panX
        y = startY + (row * cellHeight) + (cellHeight / 2) + this.panY
      }

      // Check if node is outside viewport (with some margin)
      const margin = 50
      return x < -margin || x > this.canvas.width + margin ||
        y < -margin || y > this.canvas.height + margin
    })
  }

  /**
   * Center view on all nodes (fit to viewport)
   */
  public centerOnAllNodes(): void {
    const nodes = this.clusteredNodes.length > 0 ? this.clusteredNodes : this.getAllNodes().map(node => ({
      ...node,
      clusterSize: 1,
      nodes: [node],
      clusterColor: [0.5, 0.5, 0.5]
    }))
    if (nodes.length === 0) return

    const centerX = this.canvas.width / 2
    const centerY = this.canvas.height / 2

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    nodes.forEach(node => {
      let x: number, y: number

      if (node.position && typeof node.position.x === 'number' && typeof node.position.y === 'number') {
        x = (node.position.x - 60) * 2
        y = (node.position.y - 15) * 2
      } else {
        // Use grid layout logic
        const nodeWidth = this.cellWidth
        const nodeHeight = this.cellHeight
        const cellPadding = this.cellsGap
        const cellWidth = nodeWidth + cellPadding
        const cellHeight = nodeHeight + cellPadding

        const colsPerRow = Math.ceil(Math.sqrt(nodes.length))
        const index = nodes.indexOf(node)
        const row = Math.floor(index / colsPerRow)
        const col = index % colsPerRow

        const gridWidth = colsPerRow * cellWidth
        const gridHeight = Math.ceil(nodes.length / colsPerRow) * cellHeight
        const startX = (this.canvas.width - gridWidth) / 2
        const startY = (this.canvas.height - gridHeight) / 2

        x = startX + (col * cellWidth) + (cellWidth / 2)
        y = startY + (row * cellHeight) + (cellHeight / 2)
      }

      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    })

    // Calculate the center of all nodes
    const nodesCenterX = (minX + maxX) / 2
    const nodesCenterY = (minY + maxY) / 2

    // Calculate pan offset to center nodes
    const panOffsetX = centerX - nodesCenterX
    const panOffsetY = centerY - nodesCenterY

    // Set pan to center all nodes
    this.setPan(panOffsetX, panOffsetY)
  }

  /**
   * Get viewport bounds for debugging
   */
  public getViewportBounds(): { minX: number, minY: number, maxX: number, maxY: number } {
    return {
      minX: -this.panX,
      minY: -this.panY,
      maxX: this.canvas.width - this.panX,
      maxY: this.canvas.height - this.panY
    }
  }

  /**
   * Draw connections between nodes
   */
  private drawNodeConnections(): void {
    if (!this.ctx || !this.graphData.connections || !this.showConnections) return

    const connections = this.graphData.connections

    // Draw all connections in a single loop
    connections.forEach(connection => {
      // Check if this connection involves the selected node
      const isSelectedConnection = this.selectedNodeId !== null && 
        (connection.from === this.selectedNodeId || connection.to === this.selectedNodeId)
      
      // Pass the selection state to drawConnection
      this.drawConnection(connection, isSelectedConnection && this.highlightSelectedNodeConnections)
    })

    // Reset line dash
    this.ctx.setLineDash([])
  }

  /**
   * Calculate edge points for node connection
   */
  private calculateNodeEdgePoints(nodePos: { x: number, y: number }, node: RenderNode, otherNodePos: { x: number, y: number }, otherNode: RenderNode): { x: number, y: number } {
    const nodeWidth = (node.size?.width || 120) * this.zoom
    const nodeHeight = (node.size?.height || 80) * this.zoom
    const otherNodeWidth = (otherNode.size?.width || 120) * this.zoom
    const otherNodeHeight = (otherNode.size?.height || 80) * this.zoom

    // Node bounds
    const nodeLeft = nodePos.x
    const nodeRight = nodePos.x + nodeWidth
    const nodeTop = nodePos.y
    const nodeBottom = nodePos.y + nodeHeight
    const nodeCenterX = nodePos.x + nodeWidth / 2
    const nodeCenterY = nodePos.y + nodeHeight / 2

    // Other node bounds
    const otherLeft = otherNodePos.x
    const otherRight = otherNodePos.x + otherNodeWidth
    const otherTop = otherNodePos.y
    const otherBottom = otherNodePos.y + otherNodeHeight
    const otherCenterX = otherNodePos.x + otherNodeWidth / 2
    const otherCenterY = otherNodePos.y + otherNodeHeight / 2

    // Calculate direction vector from this node to other node
    const dx = otherCenterX - nodeCenterX
    const dy = otherCenterY - nodeCenterY
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance === 0) {
      // If nodes are at same position, use center
      return { x: nodeCenterX, y: nodeCenterY }
    }

    // Normalize direction vector
    const dirX = dx / distance
    const dirY = dy / distance

    // Calculate intersection point with node edge
    let edgeX = nodeCenterX
    let edgeY = nodeCenterY

    // Check which edge the line intersects
    if (Math.abs(dirX) > Math.abs(dirY)) {
      // Intersects left or right edge
      if (dirX > 0) {
        // Right edge
        edgeX = nodeRight
        edgeY = nodeCenterY + (nodeRight - nodeCenterX) * dirY / dirX
      } else {
        // Left edge
        edgeX = nodeLeft
        edgeY = nodeCenterY + (nodeLeft - nodeCenterX) * dirY / dirX
      }
    } else {
      // Intersects top or bottom edge
      if (dirY > 0) {
        // Bottom edge
        edgeY = nodeBottom
        edgeX = nodeCenterX + (nodeBottom - nodeCenterY) * dirX / dirY
      } else {
        // Top edge
        edgeY = nodeTop
        edgeX = nodeCenterX + (nodeTop - nodeCenterY) * dirX / dirY
      }
    }

    // Clamp to node bounds
    edgeX = Math.max(nodeLeft, Math.min(nodeRight, edgeX))
    edgeY = Math.max(nodeTop, Math.min(nodeBottom, edgeY))

    return { x: edgeX, y: edgeY }
  }

  /**
   * Draw a single connection between two nodes
   */
  private drawConnection(connection: DiagramConnection, isSelectedConnection: boolean = false): void {
    if (!this.ctx) return

    // Find source and target nodes
    const sourceNode = this.graphData.allNodes.get(connection.from)
    const targetNode = this.graphData.allNodes.get(connection.to)

    if (!sourceNode || !targetNode || !sourceNode.position || !targetNode.position) {
      console.warn(`Connection ${connection.from} -> ${connection.to}: missing nodes or positions`)
      return
    }

    // Convert node positions to screen coordinates
    const sourcePos = this.renderNodeToScreen(sourceNode)
    const targetPos = this.renderNodeToScreen(targetNode)

    if (!sourcePos || !targetPos) return

    // Calculate connection points (edges of nodes)
    const sourceEdgePoints = this.calculateNodeEdgePoints(sourcePos, sourceNode, targetPos, targetNode)
    const targetEdgePoints = this.calculateNodeEdgePoints(targetPos, targetNode, sourcePos, sourceNode)
    
    const sourceX = sourceEdgePoints.x
    const sourceY = sourceEdgePoints.y
    const targetX = targetEdgePoints.x
    const targetY = targetEdgePoints.y

    // Set connection style based on selection state
    if (isSelectedConnection) {
      // Draw selected node connections with highlight style
      this.ctx.strokeStyle = this.selectedNodeConnectionColor
      this.ctx.lineWidth = this.selectedNodeConnectionWidth * this.zoom
    } else {
      // Draw regular connections
      this.ctx.strokeStyle = `rgba(0, 255, 136, ${this.connectionOpacity})`
      this.ctx.lineWidth = 2 * this.zoom
    }
    
    this.ctx.setLineDash([])

    // Draw connection line
    this.ctx.beginPath()
    this.ctx.moveTo(sourceX, sourceY)
    this.ctx.lineTo(targetX, targetY)
    this.ctx.stroke()

    // Draw arrow if enabled
    if (this.connectionArrows) {
      this.drawConnectionArrow(sourceX, sourceY, targetX, targetY, isSelectedConnection)
    }

    // Draw connection label if enabled
    if (this.connectionLabels && connection.pinName) {
      const connectionId = `${connection.from}-${connection.to}`
      this.drawConnectionLabel(connection.pinName, sourceX, sourceY, targetX, targetY, connectionId)
    }
  }

  /**
   * Draw arrow at the end of connection
   */
  private drawConnectionArrow(sourceX: number, sourceY: number, targetX: number, targetY: number, isSelectedConnection: boolean = false): void {
    if (!this.ctx) return

    const arrowSize = 8 * this.zoom
    const angle = Math.atan2(targetY - sourceY, targetX - sourceX)

    // Use different color for selected connections
    if (isSelectedConnection) {
      this.ctx.fillStyle = this.selectedNodeConnectionColor
    } else {
      this.ctx.fillStyle = `rgba(0, 255, 136, ${this.connectionOpacity})`
    }
    
    this.ctx.beginPath()
    this.ctx.moveTo(targetX, targetY)
    this.ctx.lineTo(
      targetX - arrowSize * Math.cos(angle - Math.PI / 6),
      targetY - arrowSize * Math.sin(angle - Math.PI / 6)
    )
    this.ctx.lineTo(
      targetX - arrowSize * Math.cos(angle + Math.PI / 6),
      targetY - arrowSize * Math.sin(angle + Math.PI / 6)
    )
    this.ctx.closePath()
    this.ctx.fill()
  }

  /**
   * Draw connection label with offset along connection line to prevent overlap
   */
  private drawConnectionLabel(label: string, sourceX: number, sourceY: number, targetX: number, targetY: number, connectionId?: string): void {
    if (!this.ctx) return

    const midX = (sourceX + targetX) / 2
    const midY = (sourceY + targetY) / 2

    // Calculate connection direction vector
    const dx = targetX - sourceX
    const dy = targetY - sourceY
    const length = Math.sqrt(dx * dx + dy * dy)
    
    if (length === 0) return

    // Normalize direction vector
    const dirX = dx / length
    const dirY = dy / length

    // Generate stable offset based on connection ID or label content
    const stableSeed = connectionId || label
    const seed = this.hashString(stableSeed)
    const randomOffset = (seed % 100) / 100 // 0 to 1
    const offsetDistance = (0.2 + randomOffset * 0.6) * length // 20-80% along the line
    const offsetDirection = (seed % 2) === 0 ? 1 : -1 // Random direction along line

    // Apply offset along connection line (not perpendicular)
    const offsetX = dirX * offsetDistance * offsetDirection
    const offsetY = dirY * offsetDistance * offsetDirection

    // Calculate final label position
    let labelX = midX + offsetX
    let labelY = midY + offsetY

    // Ensure label stays within connection bounds
    const minX = Math.min(sourceX, targetX)
    const maxX = Math.max(sourceX, targetX)
    const minY = Math.min(sourceY, targetY)
    const maxY = Math.max(sourceY, targetY)

    // Clamp label position to connection bounds
    labelX = Math.max(minX, Math.min(maxX, labelX))
    labelY = Math.max(minY, Math.min(maxY, labelY))

    const fontSize = Math.max(8, 10 * this.zoom)
    this.ctx.font = `${fontSize}px Arial`
    this.ctx.fillStyle = `rgba(255, 255, 255, ${this.connectionOpacity})`
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'

    // Add background for better readability
    const textMetrics = this.ctx.measureText(label)
    const padding = 4 * this.zoom
    const bgWidth = textMetrics.width + padding * 2
    const bgHeight = fontSize + padding * 2

    this.ctx.fillStyle = `rgba(0, 0, 0, ${this.connectionOpacity * 0.7})`
    this.ctx.fillRect(labelX - bgWidth / 2, labelY - bgHeight / 2, bgWidth, bgHeight)

    this.ctx.fillStyle = `rgba(255, 255, 255, ${this.connectionOpacity})`
    this.ctx.fillText(label, labelX, labelY)
  }

  /**
   * Simple hash function for deterministic random offset
   */
  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }

  /**
   * Draw a single node
   */
  private drawNode(node: RenderNode, x: number, y: number): void {
    if (!this.ctx) return

    const nodeId = node.id || 'Unknown'
    const nodeType = node.type || 'Unknown'

    // Node size that scales with zoom
    const nodeWidth = this.cellWidth * this.zoom
    const nodeHeight = this.cellHeight * this.zoom
    const cornerRadius = Math.max(4, 8 * this.zoom)

    // Font sizes that scale with zoom
    const baseFontSize = 12
    const baseTypeFontSize = 10
    const fontSize = Math.max(8, baseFontSize * this.zoom)
    const typeFontSize = Math.max(6, baseTypeFontSize * this.zoom)

    // Truncate text to fit fixed node size
    this.ctx.font = `${fontSize}px Arial`
    const idText = nodeId.length > 6 ? nodeId.slice(0, 6) + '...' : nodeId

    this.ctx.font = `${typeFontSize}px Arial`
    const typeText = nodeType.length > 50 ? nodeType.slice(0, 50) + '...' : nodeType

    // Draw rounded rectangle block
    this.ctx.fillStyle = this.getNodeColorHex(nodeType)
    this.ctx.beginPath()

    // Top-left to top-right
    this.ctx.moveTo(x - nodeWidth / 2 + cornerRadius, y - nodeHeight / 2)
    this.ctx.lineTo(x + nodeWidth / 2 - cornerRadius, y - nodeHeight / 2)
    this.ctx.quadraticCurveTo(x + nodeWidth / 2, y - nodeHeight / 2, x + nodeWidth / 2, y - nodeHeight / 2 + cornerRadius)

    // Top-right to bottom-right
    this.ctx.lineTo(x + nodeWidth / 2, y + nodeHeight / 2 - cornerRadius)
    this.ctx.quadraticCurveTo(x + nodeWidth / 2, y + nodeHeight / 2, x + nodeWidth / 2 - cornerRadius, y + nodeHeight / 2)

    // Bottom-right to bottom-left
    this.ctx.lineTo(x - nodeWidth / 2 + cornerRadius, y + nodeHeight / 2)
    this.ctx.quadraticCurveTo(x - nodeWidth / 2, y + nodeHeight / 2, x - nodeWidth / 2, y + nodeHeight / 2 - cornerRadius)

    // Bottom-left to top-left
    this.ctx.lineTo(x - nodeWidth / 2, y - nodeHeight / 2 + cornerRadius)
    this.ctx.quadraticCurveTo(x - nodeWidth / 2, y - nodeHeight / 2, x - nodeWidth / 2 + cornerRadius, y - nodeHeight / 2)

    this.ctx.closePath()
    this.ctx.fill()

    // Add border
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.lineWidth = 2
    this.ctx.stroke()

    // Draw label inside the block
    this.ctx.fillStyle = '#ffffff'
    this.ctx.font = `${fontSize}px Arial`
    this.ctx.textAlign = 'center'
    this.ctx.fillText(idText, x, y - 2)

    // Draw node type inside the block
    this.ctx.fillStyle = '#cccccc'
    this.ctx.font = `${typeFontSize}px Arial`
    this.ctx.fillText(typeText, x, y + fontSize + 2)
  }

  /**
   * Fallback to Canvas 2D if WebGL fails
   */
  private fallbackToCanvas2D(): void {
    console.log('Falling back to Canvas 2D rendering')

    const ctx2d = this.canvas.getContext('2d')
    if (!ctx2d) {
      console.error('Failed to get Canvas 2D context')
      return
    }

    this.ctx = ctx2d

    // Set canvas to full container size
    this.resizeCanvas()

    // Initialize basic data structures for Canvas 2D mode
    this.clusteredNodes = []
    this.lodData = [{
      level: 0,
      nodes: [],
      maxDistance: Infinity
    }]
    this.nodeCount = this.graphData.allNodes.size

    // Set up resize observer to automatically resize canvas
    this.setupResizeObserver()

    // Set up mouse event handlers for tooltips
    // this.setupMouseEvents()

    this.renderCanvas2D()
  }

  /**
   * Render using Canvas 2D (fallback)
   */
  private renderCanvas2D(): void {
    if (!this.ctx) return

    // Clear canvas
    fillCanvasDotGrid(this.ctx, this.canvas.width, this.canvas.height, this.panX, this.panY, this.zoom)

    this.renderRenderDataHierarchical(this.graphData)

    // Draw connections between nodes
    this.drawNodeConnections()
  }

  /**
   * Render RenderData with hierarchical structure
   */
  private renderRenderDataHierarchical(renderData: RenderData): void {
    if (!this.ctx) return

    // Render each root node and its hierarchy
    renderData.rootNodes.forEach((rootNode, index) => {
      this.renderRenderNode(rootNode, 0)
    })
  }

  /**
   * Render a single RenderNode and its children recursively
   */
  private renderRenderNode(node: RenderNode, depth: number): void {
    if (!this.ctx || !node.visible || node.opacity <= 0) return

    // Calculate screen position
    const screenPos = this.renderNodeToScreen(node)
    if (!screenPos) return

    // Apply opacity
    this.ctx.save()
    this.ctx.globalAlpha = node.opacity

    // Draw the node
    this.drawRenderNode(node, screenPos.x, screenPos.y, depth)

    // Draw children recursively
    forEachDirectChild(node, (child) => {
      this.renderRenderNode(child, depth + 1)
    })

    this.ctx.restore()
  }

  /**
   * Convert RenderNode position to screen coordinates
   */
  private renderNodeToScreen(node: RenderNode): { x: number, y: number } | null {
    if (!node.position) return null

    // Apply zoom and pan transformations
    const x = node.position.x * this.zoom + this.panX
    const y = node.position.y * this.zoom + this.panY

    return { x, y }
  }

  /**
   * Draw a RenderNode on canvas
   */
  private drawRenderNode(node: RenderNode, x: number, y: number, depth: number): void {
    if (!this.ctx) return

    const nodeId = node.id || 'Unknown'
    const nodeType = node.type || 'Unknown'
    const isSelected = this.selectedNodeId === nodeId

    // Use RenderNode size or fallback
    const nodeWidth = (node.size?.width || 120) * this.zoom
    const nodeHeight = (node.size?.height || 80) * this.zoom
    const cornerRadius = Math.max(4, 8 * this.zoom)

    // Convert top-left coordinates to center coordinates
    const centerX = x + nodeWidth / 2
    const centerY = y + nodeHeight / 2

    // Font sizes that scale with zoom
    const baseFontSize = 12
    const baseTypeFontSize = 10
    const fontSize = Math.max(8, baseFontSize * this.zoom)
    const typeFontSize = Math.max(6, baseTypeFontSize * this.zoom)

    // Truncate text to fit fixed node size
    this.ctx.font = `${fontSize}px Arial`
    const idText = nodeId.length > 50 ? nodeId.slice(0, 50) + '...' : nodeId

    this.ctx.font = `${typeFontSize}px Arial`
    const typeText = nodeType.length > 50 ? nodeType.slice(0, 50) + '...' : nodeType

    // Draw selection highlight if selected
    if (isSelected) {
      this.ctx.save()
      this.ctx.strokeStyle = '#00ff88'
      this.ctx.lineWidth = 4 * this.zoom
      this.ctx.setLineDash([8 * this.zoom, 4 * this.zoom])
      
      // Draw selection border around the node
      this.ctx.strokeRect(x - 4, y - 4, nodeWidth + 8, nodeHeight + 8)
      this.ctx.restore()
    }

    // Draw background with RenderNode color
    this.ctx.fillStyle = node.backgroundColor || this.getNodeColorHex(nodeType)
    this.ctx.beginPath()

    // Top-left to top-right
    this.ctx.moveTo(x + cornerRadius, y)
    this.ctx.lineTo(x + nodeWidth - cornerRadius, y)
    this.ctx.quadraticCurveTo(x + nodeWidth, y, x + nodeWidth, y + cornerRadius)

    // Top-right to bottom-right
    this.ctx.lineTo(x + nodeWidth, y + nodeHeight - cornerRadius)
    this.ctx.quadraticCurveTo(x + nodeWidth, y + nodeHeight, x + nodeWidth - cornerRadius, y + nodeHeight)

    // Bottom-right to bottom-left
    this.ctx.lineTo(x + cornerRadius, y + nodeHeight)
    this.ctx.quadraticCurveTo(x, y + nodeHeight, x, y + nodeHeight - cornerRadius)

    // Bottom-left to top-left
    this.ctx.lineTo(x, y + cornerRadius)
    this.ctx.quadraticCurveTo(x, y, x + cornerRadius, y)

    this.ctx.closePath()
    this.ctx.fill()

    // Add border with RenderNode color (thicker if selected)
    this.ctx.strokeStyle = isSelected ? '#00ff88' : (node.borderColor || node.color || '#333')
    this.ctx.lineWidth = (isSelected ? 3 : (node.borderWidth || 1)) * this.zoom
    this.ctx.stroke()

    // Draw label inside the block (centered)
    this.ctx.fillStyle = node.color || '#ffffff'
    this.ctx.font = `${fontSize}px Arial`
    this.ctx.textAlign = 'center'
    this.ctx.fillText(idText, centerX, (getDirectChildren(node).length ? y + 16 : centerY))

    // Draw node type inside the block (centered)
    this.ctx.fillStyle = '#cccccc'
    this.ctx.font = `${typeFontSize}px Arial`
    this.ctx.fillText(typeText, centerX, (getDirectChildren(node).length ? y + 16 : centerY) + fontSize + 2)

    // Draw depth indicator for groups (top-left corner)
    if (node.isGroup) {
      this.ctx.fillStyle = '#ff6b6b'
      this.ctx.font = `${Math.max(8, 10 * this.zoom)}px Arial`
      this.ctx.textAlign = 'left'
      this.ctx.fillText(`[G${depth}]`, x + 5, y + 15)
    }
  }

  /**
   * Draw a container node with its grouped children recursively
   */
  private drawRecursiveContainerNode(
    parentNode: RenderNode, 
    parentPos: { x: number, y: number }, 
    centerX: number, 
    centerY: number,
    depth: number
  ): void {
    if (!this.ctx) return

    // Calculate actual container bounds based on children content
    const containerBounds = this.calculateActualContainerBounds(parentNode, parentPos, centerX, centerY, depth)

    // Draw container background with depth-based styling
    this.drawGroupedContainerBackground(containerBounds, parentNode.type, depth)

    // Draw parent node at the top of the container
    this.drawNode(parentNode, parentPos.x, parentPos.y - containerBounds.height / 2 + 40)

    // Draw property groups recursively
    this.drawPropertyGroupsInContainerRecursive(parentNode, containerBounds, centerX, centerY, depth)
  }

  /**
   * Calculate actual container bounds based on children content
   */
  private calculateActualContainerBounds(
    parentNode: RenderNode,
    parentPos: { x: number, y: number },
    centerX: number,
    centerY: number,
    depth: number
  ): { minX: number, minY: number, maxX: number, maxY: number, width: number, height: number } {
    // Use RenderNode size for container bounds
    const width = parentNode.size.width * this.zoom
    const height = parentNode.size.height * this.zoom
    return {
      minX: parentPos.x,
      minY: parentPos.y,
      maxX: parentPos.x + width,
      maxY: parentPos.y + height,
      width,
      height
    }

  }

  /**
   * Draw container background for grouped nodes with depth-based styling
   */
  private drawGroupedContainerBackground(
    bounds: { minX: number, minY: number, maxX: number, maxY: number, width: number, height: number },
    nodeType: string,
    depth: number = 0
  ): void {
    if (!this.ctx) return

    // Enhanced depth-based colors for nested containers
    const depthColors = [
      { 
        bg: 'rgba(30, 30, 50, 0.9)', 
        border: '#4a6a8a', 
        title: 'rgba(50, 70, 110, 0.95)',
        shadow: 'rgba(0, 0, 0, 0.3)',
        gradient: ['rgba(40, 40, 60, 0.9)', 'rgba(20, 20, 40, 0.9)']
      }, // Level 0
      { 
        bg: 'rgba(40, 40, 60, 0.9)', 
        border: '#5a7a9a', 
        title: 'rgba(60, 80, 120, 0.95)',
        shadow: 'rgba(0, 0, 0, 0.25)',
        gradient: ['rgba(50, 50, 70, 0.9)', 'rgba(30, 30, 50, 0.9)']
      }, // Level 1
      { 
        bg: 'rgba(50, 50, 70, 0.9)', 
        border: '#6a8aaa', 
        title: 'rgba(70, 90, 130, 0.95)',
        shadow: 'rgba(0, 0, 0, 0.2)',
        gradient: ['rgba(60, 60, 80, 0.9)', 'rgba(40, 40, 60, 0.9)']
      }, // Level 2
      { 
        bg: 'rgba(60, 60, 80, 0.9)', 
        border: '#7a9aba', 
        title: 'rgba(80, 100, 140, 0.95)',
        shadow: 'rgba(0, 0, 0, 0.15)',
        gradient: ['rgba(70, 70, 90, 0.9)', 'rgba(50, 50, 70, 0.9)']
      }, // Level 3+
    ]
    
    const colors = depthColors[Math.min(depth, depthColors.length - 1)]

    // Draw shadow first
    this.ctx.save()
    this.ctx.shadowColor = colors.shadow
    this.ctx.shadowBlur = 8 * this.zoom
    this.ctx.shadowOffsetX = 2 * this.zoom
    this.ctx.shadowOffsetY = 2 * this.zoom

    // Create gradient background
    const gradient = this.ctx.createLinearGradient(
      bounds.minX, bounds.minY, 
      bounds.minX, bounds.maxY
    )
    gradient.addColorStop(0, colors.gradient[0])
    gradient.addColorStop(1, colors.gradient[1])

    // Container background with gradient
    this.ctx.fillStyle = gradient
    this.ctx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height)

    this.ctx.restore()

    // Enhanced container border with rounded corners
    this.ctx.strokeStyle = colors.border
    this.ctx.lineWidth = (3 + depth) * this.zoom
    this.ctx.setLineDash([])
    
    const cornerRadius = 8 * this.zoom
    this.drawRoundedRect(bounds.minX, bounds.minY, bounds.width, bounds.height, cornerRadius)
    this.ctx.stroke()

    // Container title background with gradient
    const titleHeight = 35 * this.zoom
    const titleGradient = this.ctx.createLinearGradient(
      bounds.minX, bounds.minY, 
      bounds.minX, bounds.minY + titleHeight
    )
    titleGradient.addColorStop(0, colors.title)
    titleGradient.addColorStop(1, colors.bg)
    
    this.ctx.fillStyle = titleGradient
    this.ctx.fillRect(bounds.minX, bounds.minY, bounds.width, titleHeight)

    // Title border
    this.ctx.strokeStyle = colors.border
    this.ctx.lineWidth = 1 * this.zoom
    this.ctx.strokeRect(bounds.minX, bounds.minY, bounds.width, titleHeight)

    // Container title text with enhanced styling
    this.ctx.fillStyle = '#ffffff'
    this.ctx.font = `bold ${15 * this.zoom}px Arial`
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    
    // Add text shadow
    this.ctx.save()
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
    this.ctx.shadowBlur = 2 * this.zoom
    this.ctx.shadowOffsetX = 1 * this.zoom
    this.ctx.shadowOffsetY = 1 * this.zoom
    
    const titleText = depth > 0 
      ? `${'  '.repeat(depth)}${nodeType.replace('animAnimNode_', '')}`
      : nodeType.replace('animAnimNode_', '')
      
    this.ctx.fillText(
      titleText, 
      bounds.minX + bounds.width / 2, 
      bounds.minY + titleHeight / 2
    )
    
    this.ctx.restore()

    // Add depth indicator dots
    if (depth > 0) {
      this.ctx.fillStyle = colors.border
      const dotSize = 3 * this.zoom
      const dotSpacing = 8 * this.zoom
      const startX = bounds.minX + 10 * this.zoom
      const dotY = bounds.minY + titleHeight / 2
      
      for (let i = 0; i < depth; i++) {
        this.ctx.beginPath()
        this.ctx.arc(startX + i * dotSpacing, dotY, dotSize, 0, 2 * Math.PI)
        this.ctx.fill()
      }
    }
  }

  /**
   * Draw a rounded rectangle
   */
  private drawRoundedRect(x: number, y: number, width: number, height: number, radius: number): void {
    if (!this.ctx) return
    
    this.ctx.beginPath()
    this.ctx.moveTo(x + radius, y)
    this.ctx.lineTo(x + width - radius, y)
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    this.ctx.lineTo(x + width, y + height - radius)
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    this.ctx.lineTo(x + radius, y + height)
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    this.ctx.lineTo(x, y + radius)
    this.ctx.quadraticCurveTo(x, y, x + radius, y)
    this.ctx.closePath()
  }

  /**
   * Draw property groups inside a container recursively
   */
  private drawPropertyGroupsInContainerRecursive(
    parentNode: RenderNode,
    containerBounds: { minX: number, minY: number, maxX: number, maxY: number, width: number, height: number },
    centerX: number,
    centerY: number,
    depth: number
  ): void {
    if (!this.ctx) return

    // For RenderNode, we don't have property groups, just render children directly
    const children = getDirectChildren(parentNode)
    
    if (children.length === 0) return

    // Draw children directly using their pre-calculated positions
    children.forEach((childNode) => {
      // Use the pre-calculated position from the layout algorithm
      const childPos = this.getNodePosition(childNode, centerX, centerY)
      if (!childPos) {
        console.warn(`Child node ${childNode.id} has no position, skipping`)
        return
      }

      // Check if this child node has its own children (recursive container)
      const hasGrandChildren = getDirectChildren(childNode).length > 0
      
      if (hasGrandChildren) {
        // This child is also a container - draw it as a nested container
        this.drawRecursiveContainerNode(childNode, childPos, centerX, centerY, depth + 1)
      } else {
        // This child is a leaf node - draw normally
        this.drawNode(childNode, childPos.x, childPos.y)
      }
    })

    // Draw internal connections within this container
    this.drawInternalConnections(parentNode, containerBounds, centerX, centerY)
  }

  /**
   * Draw internal connections within a container
   */
  private drawInternalConnections(
    parentNode: RenderNode,
    containerBounds: { minX: number, minY: number, maxX: number, maxY: number, width: number, height: number },
    centerX: number,
    centerY: number
  ): void {
    if (!this.ctx) return

    // Get all child nodes of this parent
    const childNodes = getDirectChildren(parentNode)
    
    if (childNodes.length < 2) return // Need at least 2 nodes to draw connections

    // Draw connections between child nodes within the container
    this.ctx.strokeStyle = 'rgba(0, 255, 136, 0.6)' // Green color for internal connections
    this.ctx.lineWidth = 1 * this.zoom
    this.ctx.setLineDash([5 * this.zoom, 5 * this.zoom]) // Dashed line for internal connections

    childNodes.forEach((fromNode) => {
      const fromPos = this.getNodePosition(fromNode, centerX, centerY)
      if (!fromPos) return

      // Draw connections to other child nodes
      childNodes.forEach((toNode) => {
        if (fromNode.id === toNode.id) return

        const toPos = this.getNodePosition(toNode, centerX, centerY)
        if (!toPos) return

        // Draw connection line (no bounds checking - allow connections to extend beyond container)
        if (this.ctx) {
          this.ctx.beginPath()
          this.ctx.moveTo(fromPos.x, fromPos.y)
          this.ctx.lineTo(toPos.x, toPos.y)
          this.ctx.stroke()
        }

        // Draw arrow at the end
        this.drawConnectionArrow(fromPos.x, fromPos.y, toPos.x, toPos.y)
      })
    })

    // Reset line dash
    this.ctx.setLineDash([])
  }


  /**
   * Get node position for rendering
   * This method only uses pre-calculated positions from the layout algorithm
   */
  private getNodePosition(node: RenderNode, centerX: number, centerY: number): { x: number, y: number } | null {
    if (node.position && typeof node.position.x === 'number' && typeof node.position.y === 'number') {
      // Use the pre-calculated position from the layout algorithm
      // Apply zoom and pan transformations
      const x = node.position.x * this.zoom + this.panX
      const y = node.position.y * this.zoom + this.panY
      return { x, y }
    }
    return null
  }

  /**
   * Draw property group label
   */
  private drawPropertyGroupLabel(propertyName: string, x: number, y: number): void {
    if (!this.ctx) return

    const fontSize = Math.max(11, 13 * this.zoom)
    this.ctx.font = `bold ${fontSize}px Arial`
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'top'

    // Add enhanced background for better readability
    const textMetrics = this.ctx.measureText(propertyName)
    const padding = 6 * this.zoom
    const bgWidth = textMetrics.width + padding * 2
    const bgHeight = fontSize + padding * 2

    // Create gradient background
    const gradient = this.ctx.createLinearGradient(
      x - bgWidth / 2, y,
      x - bgWidth / 2, y + bgHeight
    )
    gradient.addColorStop(0, 'rgba(80, 100, 140, 0.9)')
    gradient.addColorStop(1, 'rgba(60, 80, 120, 0.9)')

    // Draw background with rounded corners
    this.ctx.fillStyle = gradient
    this.drawRoundedRect(x - bgWidth / 2, y, bgWidth, bgHeight, 4 * this.zoom)
    this.ctx.fill()

    // Draw border
    this.ctx.strokeStyle = 'rgba(120, 140, 180, 0.8)'
    this.ctx.lineWidth = 1 * this.zoom
    this.drawRoundedRect(x - bgWidth / 2, y, bgWidth, bgHeight, 4 * this.zoom)
    this.ctx.stroke()

    // Draw text with shadow
    this.ctx.save()
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
    this.ctx.shadowBlur = 1 * this.zoom
    this.ctx.shadowOffsetX = 1 * this.zoom
    this.ctx.shadowOffsetY = 1 * this.zoom
    
    this.ctx.fillStyle = '#ffffff'
    this.ctx.fillText(propertyName, x, y + padding)
    
    this.ctx.restore()
  }

  /**
   * Resize canvas to match parent container
   */
  private resizeCanvas(): void {
    const container = this.canvas.parentElement
    let newWidth: number, newHeight: number

    if (container) {
      // Use parent element dimensions directly
      newWidth = container.clientWidth
      newHeight = container.clientHeight
    } else {
      newWidth = this.canvas.clientWidth || 800
      newHeight = this.canvas.clientHeight || 600
    }

    // Only resize if dimensions actually changed
    if (this.canvas.width !== newWidth || this.canvas.height !== newHeight) {
      this.canvas.width = newWidth
      this.canvas.height = newHeight
    }
  }

  /**
   * Set up resize observer to automatically resize canvas
   */
  private setupResizeObserver(): void {
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        this.resizeCanvas()
        this.renderCanvas2D()
      })

      const container = this.canvas.parentElement
      if (container) {
        this.resizeObserver.observe(container)
      }
    }
  }

  /**
   * Hide tooltip
   */
  private hideTooltip(): void {
    const tooltip = document.getElementById('node-tooltip')
    if (tooltip) {
      tooltip.style.display = 'none'
    }
  }

  /**
   * Reset view to default position and zoom
   */
  public resetView(): void {
    this.zoom = 1.0
    this.panX = 0
    this.panY = 0
    this.renderCanvas2D()
  }

  /**
   * Pan to specific coordinates
   */
  public panTo(x: number, y: number): void {
    this.setPan(x, y)
  }

  /**
   * Pan to specific node by ID
   */
  public panToNode(nodeId: string): boolean {
    const node = this.graphData.allNodes.get(nodeId)
    if (!node || !node.position) {
      console.warn(`Node with ID '${nodeId}' not found or has no position`)
      return false
    }

    // Use original node coordinates
    const nodeX = node.position.x
    const nodeY = node.position.y

    // Calculate pan offset to center the node on screen
    const centerX = this.canvas.width / 2
    const centerY = this.canvas.height / 2
    
    // Calculate required pan to center the node (without using current pan)
    const targetPanX = centerX - (nodeX * this.zoom)
    const targetPanY = centerY - (nodeY * this.zoom)

    // Apply pan
    this.setPan(targetPanX, targetPanY)
    
    return true
  }

  /**
   * Pan to specific node by ID with zoom
   */
  public panToNodeWithZoom(nodeId: string, zoom: number = 1.5): boolean {
    const node = this.graphData.allNodes.get(nodeId)
    if (!node || !node.position) {
      console.warn(`Node with ID '${nodeId}' not found or has no position`)
      return false
    }

    // Use original node coordinates
    const nodeX = node.position.x
    const nodeY = node.position.y

    // Calculate pan offset to center the node on screen
    const centerX = this.canvas.width / 2
    const centerY = this.canvas.height / 2
    
    // Calculate required pan to center the node using original coordinates
    const targetPanX = centerX - (nodeX * zoom)
    const targetPanY = centerY - (nodeY * zoom)

    // Apply zoom and pan
    this.setZoom(zoom, centerX, centerY)
    this.setPan(targetPanX, targetPanY)
    
    return true
  }


  /**
   * Get current view state
   */
  public getViewState(): { zoom: number, panX: number, panY: number } {
    return {
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY
    }
  }

  /**
   * Set view state
   */
  public setViewState(state: { zoom: number, panX: number, panY: number }): void {
    this.zoom = Math.max(0.1, Math.min(5.0, state.zoom))
    this.panX = state.panX
    this.panY = state.panY
    this.renderCanvas2D()
  }

  /**
   * Connection rendering controls
   */
  public setShowConnections(show: boolean): void {
    this.showConnections = show
    this.renderCanvas2D()
  }

  public setConnectionOpacity(opacity: number): void {
    this.connectionOpacity = Math.max(0.1, Math.min(1.0, opacity))
    this.renderCanvas2D()
  }

  public setShowConnectionLabels(show: boolean): void {
    this.connectionLabels = show
    this.renderCanvas2D()
  }

  public setShowConnectionArrows(show: boolean): void {
    this.connectionArrows = show
    this.renderCanvas2D()
  }

  /**
   * Set whether to highlight connections of selected node
   */
  public setHighlightSelectedNodeConnections(highlight: boolean): void {
    this.highlightSelectedNodeConnections = highlight
    this.renderCanvas2D()
  }

  /**
   * Set color for selected node connections
   */
  public setSelectedNodeConnectionColor(color: string): void {
    this.selectedNodeConnectionColor = color
    this.renderCanvas2D()
  }

  /**
   * Set opacity for selected node connections
   */
  public setSelectedNodeConnectionOpacity(opacity: number): void {
    this.selectedNodeConnectionOpacity = Math.max(0.1, Math.min(1.0, opacity))
    this.renderCanvas2D()
  }

  /**
   * Set width for selected node connections
   */
  public setSelectedNodeConnectionWidth(width: number): void {
    this.selectedNodeConnectionWidth = Math.max(1, Math.min(10, width))
    this.renderCanvas2D()
  }

  public getConnectionSettings(): {
    showConnections: boolean
    connectionOpacity: number
    connectionLabels: boolean
    connectionArrows: boolean
    highlightSelectedNodeConnections: boolean
    selectedNodeConnectionColor: string
    selectedNodeConnectionOpacity: number
    selectedNodeConnectionWidth: number
  } {
    return {
      showConnections: this.showConnections,
      connectionOpacity: this.connectionOpacity,
      connectionLabels: this.connectionLabels,
      connectionArrows: this.connectionArrows,
      highlightSelectedNodeConnections: this.highlightSelectedNodeConnections,
      selectedNodeConnectionColor: this.selectedNodeConnectionColor,
      selectedNodeConnectionOpacity: this.selectedNodeConnectionOpacity,
      selectedNodeConnectionWidth: this.selectedNodeConnectionWidth
    }
  }

  /**
   * Filter connections by type
   */
  public filterConnectionsByType(types: string[]): void {
    if (!this.graphData.connections) return

    const filteredConnections = this.graphData.connections.filter(conn =>
      types.includes(conn.type)
    )

    // Temporarily replace connections for rendering
    const originalConnections = this.graphData.connections
    this.graphData.connections = filteredConnections

    // Re-render
    this.renderCanvas2D()

    // Restore original connections
    this.graphData.connections = originalConnections
  }

  /**
   * Filter connections to show only parent relationships
   */
  public showOnlyParentConnections(): void {
    this.filterConnectionsByType(['parent'])
  }

  /**
   * Filter connections to show only child relationships
   */
  public showOnlyChildConnections(): void {
    this.filterConnectionsByType(['child'])
  }

  /**
   * Show all connection types
   */
  public showAllConnections(): void {
    this.renderCanvas2D()
  }

  /**
   * Get node hierarchy information
   */
  public getNodeHierarchy(nodeId: string): {
    parents: RenderNode[]
    children: RenderNode[]
    depth: number
    isRoot: boolean
    isLeaf: boolean
  } {
    const allNodes = this.getAllNodes()
    const node = allNodes.find(n => n.id === nodeId)
    
    if (!node) {
      return { parents: [], children: [], depth: 0, isRoot: true, isLeaf: true }
    }
    
    // For RenderData, hierarchy is based on parent-child relationships
    const parents = node.parent ? [node.parent] : []
    const children = getDirectChildren(node)
    
    // Calculate depth by traversing up to root
    let depth = 0
    let currentNode = node
    const visited = new Set<string>()
    
    while (currentNode.parent && !visited.has(currentNode.id)) {
      visited.add(currentNode.id)
      currentNode = currentNode.parent
      depth++
    }
    
    const isRoot = !node.parent
    const isLeaf = children.length === 0
    
    return { parents, children, depth, isRoot, isLeaf }
  }

  /**
   * Get connection statistics
   */
  public getConnectionStats(): {
    total: number
    byType: Record<string, number>
    types: string[]
    parentConnections: number
    childConnections: number
  } {
    if (!this.graphData.connections) {
      return { total: 0, byType: {}, types: [], parentConnections: 0, childConnections: 0 }
    }

    const byType: Record<string, number> = {}
    const types = new Set<string>()
    let parentConnections = 0
    let childConnections = 0

    this.graphData.connections.forEach(conn => {
      const type = conn.type || 'unknown'
      byType[type] = (byType[type] || 0) + 1
      types.add(type)
      
      if (type === 'parent') {
        parentConnections++
      } else if (type === 'child') {
        childConnections++
      }
    })

    return {
      total: this.graphData.connections.length,
      byType,
      types: Array.from(types),
      parentConnections,
      childConnections
    }
  }

  /**
   * Convert screen coordinates to graph coordinates
   */
  public screenToGraph(screenX: number, screenY: number): { x: number, y: number } {
    // Convert screen coordinates to world coordinates
    const graphX = (screenX - this.panX) / this.zoom
    const graphY = (screenY - this.panY) / this.zoom

    return { x: graphX, y: graphY }
  }

  /**
   * Convert graph coordinates to screen coordinates
   */
  public graphToScreen(graphX: number, graphY: number): { x: number, y: number } {
    // Apply zoom and pan
    const screenX = graphX * this.zoom + this.panX
    const screenY = graphY * this.zoom + this.panY

    return { x: screenX, y: screenY }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.unsubGrid?.()
    this.unsubGrid = null
    if (this.gl) {
      if (this.program) {
        this.gl.deleteProgram(this.program)
      }
      Object.values(this.buffers).forEach(buffer => {
        if (buffer) {
          this.gl!.deleteBuffer(buffer)
        }
      })
    }

    // Clean up resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    }

    // Clean up tooltip
    this.hideTooltip()
    const tooltip = document.getElementById('node-tooltip')
    if (tooltip) {
      tooltip.remove()
    }
  }

  /**
   * Create a new hierarchical layout
   */
  public createHierarchicalLayout(): void {
    // This method can be called to trigger a new hierarchical layout
    // The actual layout creation is done in AnimgraphParser
    this.renderCanvas2D()
  }

  /**
   * Toggle hierarchical rendering mode
   */
  public toggleHierarchicalRendering(): void {
    this.hierarchicalRendering = !this.hierarchicalRendering
    console.log('Hierarchical rendering:', this.hierarchicalRendering ? 'enabled' : 'disabled')
    this.renderCanvas2D()
  }

  /**
   * Set hierarchical rendering mode
   */
  public setHierarchicalRendering(enabled: boolean): void {
    this.hierarchicalRendering = enabled
    console.log('Hierarchical rendering:', enabled ? 'enabled' : 'disabled')
    this.renderCanvas2D()
  }

  /**
   * Toggle hierarchical container display
   */
  public toggleHierarchicalContainers(): void {
    this.showHierarchicalContainers = !this.showHierarchicalContainers
    console.log('Hierarchical containers:', this.showHierarchicalContainers ? 'enabled' : 'disabled')
    this.renderCanvas2D()
  }

  /**
   * Set hierarchical container display
   */
  public setShowHierarchicalContainers(show: boolean): void {
    this.showHierarchicalContainers = show
    console.log('Hierarchical containers:', show ? 'enabled' : 'disabled')
    this.renderCanvas2D()
  }

  /**
   * Set container padding
   */
  public setContainerPadding(padding: number): void {
    this.containerPadding = Math.max(5, Math.min(50, padding))
    console.log('Container padding set to:', this.containerPadding)
    this.renderCanvas2D()
  }

  /**
   * Set container border width
   */
  public setContainerBorderWidth(width: number): void {
    this.containerBorderWidth = Math.max(1, Math.min(10, width))
    console.log('Container border width set to:', this.containerBorderWidth)
    this.renderCanvas2D()
  }

  /**
   * Get hierarchical rendering settings
   */
  public getHierarchicalSettings(): {
    hierarchicalRendering: boolean
    showHierarchicalContainers: boolean
    containerPadding: number
    containerBorderWidth: number
  } {
    return {
      hierarchicalRendering: this.hierarchicalRendering,
      showHierarchicalContainers: this.showHierarchicalContainers,
      containerPadding: this.containerPadding,
      containerBorderWidth: this.containerBorderWidth
    }
  }

  /**
   * Get hierarchical structure information
   */
  public getHierarchicalInfo(): {
    totalNodes: number
    parentNodes: number
    childNodes: number
    standaloneNodes: number
    maxChildrenPerParent: number
    averageChildrenPerParent: number
  } {
    const nodes = this.clusteredNodes.length > 0 ? this.clusteredNodes : this.getAllNodes().map(node => ({
      ...node,
      clusterSize: 1,
      nodes: [node],
      clusterColor: [0.5, 0.5, 0.5]
    }))
    const parentNodes = nodes.filter(node => getDirectChildren(node).length > 0)
    const childNodes = nodes.filter(node => getDirectChildren(node).length === 0)
    
    // Calculate standalone nodes (nodes without children that aren't children of other nodes)
    const standaloneNodes = childNodes.filter(childNode => {
      return !parentNodes.some(parent => getDirectChildren(parent).some(child => child.id === childNode.id))
    })

    const maxChildrenPerParent = parentNodes.reduce((max, parent) => 
      Math.max(max, getDirectChildren(parent).length), 0)
    
    const averageChildrenPerParent = parentNodes.length > 0 
      ? parentNodes.reduce((sum, parent) => sum + getDirectChildren(parent).length, 0) / parentNodes.length
      : 0

    return {
      totalNodes: nodes.length,
      parentNodes: parentNodes.length,
      childNodes: childNodes.length,
      standaloneNodes: standaloneNodes.length,
      maxChildrenPerParent,
      averageChildrenPerParent
    }
  }

  /**
   * Property group rendering controls
   */
  public setShowPropertyGroups(show: boolean): void {
    this.showPropertyGroups = show
    console.log('Property groups:', show ? 'enabled' : 'disabled')
    this.renderCanvas2D()
  }

  public setPropertyGroupLabels(show: boolean): void {
    this.propertyGroupLabels = show
    console.log('Property group labels:', show ? 'enabled' : 'disabled')
    this.renderCanvas2D()
  }

  public setPropertyGroupSpacing(spacing: number): void {
    this.propertyGroupSpacing = Math.max(5, Math.min(50, spacing))
    console.log('Property group spacing set to:', this.propertyGroupSpacing)
    this.renderCanvas2D()
  }

  public setPropertyGroupBorderWidth(width: number): void {
    this.propertyGroupBorderWidth = Math.max(1, Math.min(5, width))
    console.log('Property group border width set to:', this.propertyGroupBorderWidth)
    this.renderCanvas2D()
  }

  public getPropertyGroupSettings(): {
    showPropertyGroups: boolean
    propertyGroupLabels: boolean
    propertyGroupSpacing: number
    propertyGroupBorderWidth: number
  } {
    return {
      showPropertyGroups: this.showPropertyGroups,
      propertyGroupLabels: this.propertyGroupLabels,
      propertyGroupSpacing: this.propertyGroupSpacing,
      propertyGroupBorderWidth: this.propertyGroupBorderWidth
    }
  }

  /**
   * Get property group information for a specific node
   */
  public getNodePropertyGroups(nodeId: string): {
    propertyGroups: string[]
    totalGroups: number
    totalChildren: number
    childrenByProperty: Record<string, string[]>
  } {
    const allNodes = this.getAllNodes()
    const node = allNodes.find(n => n.id === nodeId)
    if (!node) {
      return { propertyGroups: [], totalGroups: 0, totalChildren: 0, childrenByProperty: {} }
    }

    const childrenByProperty = {} // RenderNode doesn't have childrenByProperty
    const propertyGroups = Object.keys(childrenByProperty)
    const totalChildren = getDirectChildren(node).length

    return {
      propertyGroups,
      totalGroups: propertyGroups.length,
      totalChildren,
      childrenByProperty
    }
  }

  /**
   * Set callback for node selection
   */
  public setOnNodeSelect(callback: (nodeId: string | null) => void): void {
    this.onNodeSelect = callback
  }

  /**
   * Get currently selected node ID
   */
  public getSelectedNodeId(): string | null {
    return this.selectedNodeId
  }

  /**
   * Set selected node
   */
  public setSelectedNode(nodeId: string | null): void {
    this.selectedNodeId = nodeId
    if (this.onNodeSelect) {
      this.onNodeSelect(nodeId)
    }
    this.renderCanvas2D()
  }

  /**
   * Get node at screen coordinates
   */
  public getNodeAtScreenPosition(screenX: number, screenY: number): RenderNode | null {
    const allNodes = this.getAllNodes()
    
    // Convert screen coordinates to graph coordinates
    const graphX = (screenX - this.panX) / this.zoom
    const graphY = (screenY - this.panY) / this.zoom

    // Find node at this position (check from back to front for proper z-ordering)
    for (let i = allNodes.length - 1; i >= 0; i--) {
      const node = allNodes[i]
      if (!node.position) continue

      const nodeWidth = (node.size?.width || 120) * this.zoom
      const nodeHeight = (node.size?.height || 80) * this.zoom
      
      const nodeScreenX = node.position.x * this.zoom + this.panX
      const nodeScreenY = node.position.y * this.zoom + this.panY
      
      // Check if click is within node bounds
      if (screenX >= nodeScreenX && screenX <= nodeScreenX + nodeWidth &&
          screenY >= nodeScreenY && screenY <= nodeScreenY + nodeHeight) {
        return node
      }
    }

    return null
  }

  /**
   * Get connections for a specific node
   */
  public getNodeConnections(nodeId: string): {
    incoming: DiagramConnection[]
    outgoing: DiagramConnection[]
    all: DiagramConnection[]
  } {
    if (!this.graphData.connections) {
      return { incoming: [], outgoing: [], all: [] }
    }

    const incoming = this.graphData.connections.filter(conn => conn.to === nodeId)
    const outgoing = this.graphData.connections.filter(conn => conn.from === nodeId)
    const all = [...incoming, ...outgoing]

    return { incoming, outgoing, all }
  }

  /**
   * Pan to a connected node
   */
  public panToConnectedNode(connection: DiagramConnection, isIncoming: boolean): boolean {
    const targetNodeId = isIncoming ? connection.from : connection.to
    return this.panToNode(targetNodeId)
  }

  /**
   * Log node data to console
   */
  public logNodeData(nodeId: string): void {
    const node = this.graphData.allNodes.get(nodeId)
    if (!node) {
      console.warn(`Node with ID '${nodeId}' not found`)
      return
    }

    const connections = this.getNodeConnections(nodeId)
    
    console.group(`Node Data: ${nodeId}`)
    console.log('Basic Info:', {
      id: node.id,
      type: node.type,
      position: node.position,
      size: node.size
    })
    console.log('Data:', node.data)
    console.log('Metadata:', node.metadata)
    console.log('Connections:', {
      total: connections.all.length,
      incoming: connections.incoming.length,
      outgoing: connections.outgoing.length,
      incomingConnections: connections.incoming,
      outgoingConnections: connections.outgoing
    })
    console.log('Hierarchy:', this.getNodeHierarchy(nodeId))
    console.groupEnd()
  }

  /**
   * Public method to trigger a re-render of the graph
   */
  public render(): void {
    if (this.forceCanvas2D || !this.gl) {
      this.renderCanvas2D()
    } else if (this.nodeCount > 0) {
      this.render()
    }
  }
}
