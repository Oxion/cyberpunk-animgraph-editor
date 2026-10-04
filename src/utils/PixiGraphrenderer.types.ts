import { Graphics } from "pixi.js"
import type { DiagramText } from "./graph/pixiText"

/** Live Pixi/tile counters for the Render Stats window. */
export type PixiRenderStats = {
  ready: boolean
  zoom: number
  tileSize: number
  viewportCssW: number
  viewportCssH: number
  viewportWorldW: number
  viewportWorldH: number
  totalTiles: number
  visibleTiles: number
  oversizedNodes: number
  graphNodes: number
  pixiGroups: number
  mountedNodes: number
  inViewportNodes: number
  nodesOnLayer: number
  nodesStaged: number
  connectionsTotal: number
  connectionsOnLayer: number
  worldDisplayObjects: number
  textLodCached: number
  tickerStarted: boolean
  fps: number
  deltaMs: number
  suspended: boolean
  visibleDisplayObjects: number
  visibleText: number
  visibleGraphics: number
  visibleOther: number
  visibleTextTextures: number
  visibleNodeGroups: number
  visibleCachedNodes: number
  visibleUncachedNodes: number
  hitchhikersHidden: number
  hitchhikersVisible: number
  backbufferW: number
  backbufferH: number
  resolution: number
  antialias: boolean
}

export type NodeElsContainer = {
  connections: Set<Graphics>
  graphics: Set<Graphics>
  texts: Set<DiagramText>
}