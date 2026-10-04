import * as d3 from 'd3'
import * as dagre from 'dagre'

/**
 * Graph renderer using D3.js and Dagre for layout
 */
export class GraphRenderer {
  constructor(svgElement, graphData) {
    this.svg = d3.select(svgElement)
    this.graphData = graphData
    this.simulation = null
    this.zoom = null
    this.tooltip = null
    
    // Graph dimensions
    this.width = 800
    this.height = 600
    
    this.init()
  }

  /**
   * Initialize the renderer
   */
  init() {
    console.log('GraphRenderer.init() called')
    console.log('Graph data:', this.graphData)
    console.log('SVG element:', this.svg)
    
    this.setupSVG()
    console.log('SVG setup completed')
    
    this.setupZoom()
    console.log('Zoom setup completed')
    
    this.setupTooltip()
    console.log('Tooltip setup completed')
    
    this.createGraph()
    console.log('Graph creation completed')
  }

  /**
   * Setup SVG container
   */
  setupSVG() {
    // Clear existing content
    this.svg.selectAll('*').remove()
    
    // Set dimensions
    this.svg
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${this.width} ${this.height}`)
    
    // Create main group for zoom
    this.mainGroup = this.svg.append('g')
      .attr('class', 'main-group')
    
    // Create groups for different elements
    this.linksGroup = this.mainGroup.append('g')
      .attr('class', 'links')
    
    this.nodesGroup = this.mainGroup.append('g')
      .attr('class', 'nodes')
  }

  /**
   * Setup zoom behavior
   */
  setupZoom() {
    this.zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        this.mainGroup.attr('transform', event.transform)
      })
    
    this.svg.call(this.zoom)
  }

  /**
   * Setup tooltip
   */
  setupTooltip() {
    this.tooltip = d3.select('body').append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('pointer-events', 'none')
  }

  /**
   * Create and render the graph
   */
  createGraph() {
    console.log('createGraph() called')
    console.log('this.graphData:', this.graphData)
    console.log('this.graphData.nodes:', this.graphData.nodes)
    
    if (!this.graphData || !this.graphData.nodes) {
      console.log('Missing graphData or nodes, returning early')
      return
    }

    console.log('Creating Dagre graph...')
    // Create Dagre graph for layout
    const g = new dagre.graphlib.Graph()
    g.setGraph({
      rankdir: 'TB',
      nodesep: 50,
      ranksep: 100,
      marginx: 50,
      marginy: 50
    })
    g.setDefaultEdgeLabel(() => ({}))

    console.log('Adding nodes to Dagre...')
    // Add nodes to Dagre
    this.graphData.nodes.forEach(node => {
      const nodeSize = this.getNodeSize(node)
      g.setNode(node.id, {
        width: nodeSize.width,
        height: nodeSize.height,
        label: this.getNodeLabel(node)
      })
    })

    // Add edges to Dagre
    this.graphData.connections.forEach(connection => {
      g.setEdge(connection.source, connection.target)
    })

    // Calculate layout
    dagre.layout(g)

    // Extract positions from Dagre
    const nodes = this.graphData.nodes.map(node => {
      const dagreNode = g.node(node.id)
      return {
        ...node,
        x: dagreNode.x,
        y: dagreNode.y,
        width: dagreNode.width,
        height: dagreNode.height
      }
    })

    // Render nodes
    this.renderNodes(nodes)
    
    // Render edges
    this.renderEdges(this.graphData.connections, nodes)
    
    // Center the graph
    this.centerGraph()
  }

  /**
   * Render nodes
   * @param {Array} nodes - Nodes with positions
   */
  renderNodes(nodes) {
    const nodeSelection = this.nodesGroup
      .selectAll('.node')
      .data(nodes, d => d.id)

    // Remove old nodes
    nodeSelection.exit().remove()

    // Create new nodes
    const nodeEnter = nodeSelection.enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.x},${d.y})`)

    // Add node rectangles
    nodeEnter.append('rect')
      .attr('width', d => d.width)
      .attr('height', d => d.height)
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('class', 'node-rect')
      .style('fill', d => this.getNodeColor(d))
      .style('stroke', '#4a4a6a')
      .style('stroke-width', 2)

    // Add node labels
    nodeEnter.append('text')
      .attr('x', d => d.width / 2)
      .attr('y', d => d.height / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('class', 'node-label')
      .style('fill', '#ffffff')
      .style('font-size', '12px')
      .style('font-weight', '500')
      .text(d => this.getNodeLabel(d))

    // Add node type labels
    nodeEnter.append('text')
      .attr('x', d => d.width / 2)
      .attr('y', d => d.height - 8)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('class', 'node-type')
      .style('fill', '#b0b0c0')
      .style('font-size', '10px')
      .text(d => this.getNodeTypeLabel(d))

    // Add event handlers
    nodeEnter
      .on('mouseover', (event, d) => this.showTooltip(event, d))
      .on('mouseout', () => this.hideTooltip())
      .on('click', (event, d) => this.selectNode(event, d))

    // Update existing nodes
    nodeSelection
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .select('.node-rect')
      .style('fill', d => this.getNodeColor(d))
  }

  /**
   * Render edges
   * @param {Array} connections - Connection data
   * @param {Array} nodes - Nodes with positions
   */
  renderEdges(connections, nodes) {
    const nodeMap = new Map(nodes.map(node => [node.id, node]))
    
    const linkSelection = this.linksGroup
      .selectAll('.link')
      .data(connections, d => d.id)

    // Remove old links
    linkSelection.exit().remove()

    // Create new links
    const linkEnter = linkSelection.enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', d => this.createLinkPath(d, nodeMap))
      .style('fill', 'none')
      .style('stroke', '#6a6a8a')
      .style('stroke-width', 2)
      .style('marker-end', 'url(#arrowhead)')

    // Update existing links
    linkSelection
      .attr('d', d => this.createLinkPath(d, nodeMap))
  }

  /**
   * Create path for a link
   * @param {Object} connection - Connection data
   * @param {Map} nodeMap - Map of node IDs to nodes
   * @returns {string} SVG path string
   */
  createLinkPath(connection, nodeMap) {
    const source = nodeMap.get(connection.source)
    const target = nodeMap.get(connection.target)
    
    if (!source || !target) return ''

    const sourceX = source.x + source.width / 2
    const sourceY = source.y + source.height
    const targetX = target.x + target.width / 2
    const targetY = target.y

    // Create curved path
    const controlPoint1X = sourceX
    const controlPoint1Y = sourceY + (targetY - sourceY) * 0.3
    const controlPoint2X = targetX
    const controlPoint2Y = targetY - (targetY - sourceY) * 0.3

    return `M ${sourceX} ${sourceY} C ${controlPoint1X} ${controlPoint1Y} ${controlPoint2X} ${controlPoint2Y} ${targetX} ${targetY}`
  }

  /**
   * Get node size based on type
   * @param {Object} node - Node data
   * @returns {Object} Size object
   */
  getNodeSize(node) {
    const baseSize = { width: 120, height: 60 }
    
    switch (node.type) {
      case 'animAnimNode_Root':
        return { width: 100, height: 50 }
      case 'animAnimNode_Output':
        return { width: 100, height: 50 }
      case 'animAnimNode_StateMachine':
        return { width: 150, height: 80 }
      case 'animAnimNode_Blend2':
        return { width: 140, height: 70 }
      case 'animAnimNode_BlendMultiple':
        return { width: 160, height: 80 }
      case 'animAnimNode_VectorInput':
        return { width: 130, height: 60 }
      case 'animAnimNode_FloatInput':
        return { width: 130, height: 60 }
      case 'animAnimNode_SetBoneTransform':
        return { width: 150, height: 70 }
      case 'animAnimNode_TranslateBone':
        return { width: 150, height: 70 }
      default:
        return baseSize
    }
  }

  /**
   * Get node color based on type
   * @param {Object} node - Node data
   * @returns {string} Color string
   */
  getNodeColor(node) {
    switch (node.type) {
      case 'animAnimNode_Root':
        return '#00ff88'
      case 'animAnimNode_Output':
        return '#ff6b6b'
      case 'animAnimNode_StateMachine':
        return '#4ecdc4'
      case 'animAnimNode_Blend2':
      case 'animAnimNode_BlendMultiple':
        return '#45b7d1'
      case 'animAnimNode_VectorInput':
      case 'animAnimNode_FloatInput':
        return '#96ceb4'
      case 'animAnimNode_SetBoneTransform':
      case 'animAnimNode_TranslateBone':
        return '#feca57'
      case 'animAnimNode_SkAnim':
        return '#ff9ff3'
      default:
        return '#6c5ce7'
    }
  }

  /**
   * Get node label
   * @param {Object} node - Node data
   * @returns {string} Label text
   */
  getNodeLabel(node) {
    if (node.metadata.parameterName) {
      return node.metadata.parameterName
    }
    
    if (node.metadata.value) {
      return node.metadata.value
    }
    
    return node.id
  }

  /**
   * Get node type label
   * @param {Object} node - Node data
   * @returns {string} Type label
   */
  getNodeTypeLabel(node) {
    return node.type.replace('animAnimNode_', '')
  }

  /**
   * Show tooltip
   * @param {Event} event - Mouse event
   * @param {Object} node - Node data
   */
  showTooltip(event, node) {
    const [x, y] = d3.pointer(event)
    
    this.tooltip
      .style('opacity', 1)
      .html(`
        <div>
          <strong>${node.type}</strong><br>
          ID: ${node.id}<br>
          ${node.metadata.parameterName ? `Parameter: ${node.metadata.parameterName}<br>` : ''}
          ${node.metadata.inputType ? `Input Type: ${node.metadata.inputType}<br>` : ''}
          ${node.metadata.transformType ? `Transform: ${node.metadata.transformType}<br>` : ''}
          Inputs: ${node.inputs.length}<br>
          Outputs: ${node.outputs.length}
        </div>
      `)
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 10) + 'px')
  }

  /**
   * Hide tooltip
   */
  hideTooltip() {
    this.tooltip.style('opacity', 0)
  }

  /**
   * Select node
   * @param {Event} event - Click event
   * @param {Object} node - Node data
   */
  selectNode(event, node) {
    // Remove previous selection
    this.nodesGroup.selectAll('.node').classed('selected', false)
    
    // Select current node
    d3.select(event.currentTarget).classed('selected', true)
    
    // Emit selection event (can be handled by parent component)
    this.onNodeSelect?.(node)
  }

  /**
   * Center the graph
   */
  centerGraph() {
    const bbox = this.mainGroup.node().getBBox()
    const scale = Math.min(
      (this.width - 100) / bbox.width,
      (this.height - 100) / bbox.height
    )
    
    const transform = d3.zoomIdentity
      .translate(
        (this.width - bbox.width * scale) / 2 - bbox.x * scale,
        (this.height - bbox.height * scale) / 2 - bbox.y * scale
      )
      .scale(scale)
    
    this.svg.call(this.zoom.transform, transform)
  }

  /**
   * Filter nodes by type
   * @param {Array} nodeTypes - Array of node types to show
   */
  filterNodes(nodeTypes) {
    this.nodesGroup.selectAll('.node')
      .style('opacity', d => nodeTypes.includes(d.type) ? 1 : 0.3)
    
    this.linksGroup.selectAll('.link')
      .style('opacity', d => {
        const sourceNode = this.graphData.nodes.find(n => n.id === d.source)
        const targetNode = this.graphData.nodes.find(n => n.id === d.target)
        return (nodeTypes.includes(sourceNode?.type) && nodeTypes.includes(targetNode?.type)) ? 1 : 0.1
      })
  }

  /**
   * Search nodes by text
   * @param {string} searchTerm - Search term
   */
  searchNodes(searchTerm) {
    if (!searchTerm) {
      this.nodesGroup.selectAll('.node').style('opacity', 1)
      this.linksGroup.selectAll('.link').style('opacity', 1)
      return
    }
    
    const term = searchTerm.toLowerCase()
    
    this.nodesGroup.selectAll('.node')
      .style('opacity', d => {
        const matches = 
          d.type.toLowerCase().includes(term) ||
          d.id.toLowerCase().includes(term) ||
          (d.metadata.parameterName && d.metadata.parameterName.toLowerCase().includes(term))
        return matches ? 1 : 0.2
      })
  }

  /**
   * Highlight nodes using specific parameters
   * @param {Array} parameters - Array of parameter names
   */
  highlightParameterNodes(parameters) {
    this.nodesGroup.selectAll('.node')
      .style('stroke-width', d => {
        const usesParameter = parameters.some(param => 
          d.metadata.parameterName === param || d.data?.$value === param
        )
        return usesParameter ? 4 : 2
      })
      .style('stroke', d => {
        const usesParameter = parameters.some(param => 
          d.metadata.parameterName === param || d.data?.$value === param
        )
        return usesParameter ? '#ff6b6b' : '#4a4a6a'
      })
  }

  /**
   * Set node selection callback
   * @param {Function} callback - Callback function
   */
  onNodeSelect(callback) {
    this.onNodeSelect = callback
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.tooltip) {
      this.tooltip.remove()
    }
    if (this.simulation) {
      this.simulation.stop()
    }
  }
}
