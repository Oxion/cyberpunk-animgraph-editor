<template>
  <ScrollArea class="h-full min-h-0">
    <div ref="bodyRef" class="flex flex-col gap-4 p-3 text-xs text-foreground">
      <p class="m-0 text-[11px] text-muted-foreground">
        Target: {{ targetLabel }}
      </p>
      <p v-if="!stats" class="m-0 text-[11px] text-muted-foreground">
        Renderer is gone (view closed) or not ready yet.
      </p>
      <p v-else-if="!stats.ready" class="m-0 text-[11px] text-muted-foreground">
        Renderer is not ready yet.
      </p>

      <template v-else>
        <section>
          <h3 class="m-0 mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Nodes
          </h3>
          <div class="flex flex-col gap-1">
            <div class="stat-row">
              <span>Mounted (tile cull)</span>
              <span class="font-data" :class="{ 'stat-warn': overMounted }">
                {{ stats.mountedNodes }}
              </span>
            </div>
            <div class="stat-row">
              <span>In viewport (AABB)</span>
              <span class="font-data">{{ stats.inViewportNodes }}</span>
            </div>
            <div class="stat-row">
              <span>On nodesLayer</span>
              <span class="font-data">{{ stats.nodesOnLayer }}</span>
            </div>
            <div class="stat-row">
              <span>Staged (off-stage)</span>
              <span class="font-data">{{ stats.nodesStaged }}</span>
            </div>
            <div class="stat-row">
              <span>Pixi groups / graph</span>
              <span class="font-data">{{ stats.pixiGroups }} / {{ stats.graphNodes }}</span>
            </div>
          </div>
          <p v-if="overMounted" class="stat-warn mt-2 mb-0 text-[11px]">
            Mounted ≫ viewport AABB — tiles are coarser than the screen.
          </p>
        </section>

        <section>
          <h3 class="m-0 mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Viewport
          </h3>
          <div class="flex flex-col gap-1">
            <div class="stat-row">
              <span>Zoom</span>
              <span class="font-data">{{ stats.zoom.toFixed(3) }}</span>
            </div>
            <div class="stat-row">
              <span>CSS px</span>
              <span class="font-data">
                {{ Math.round(stats.viewportCssW) }} × {{ Math.round(stats.viewportCssH) }}
              </span>
            </div>
            <div class="stat-row">
              <span>World</span>
              <span class="font-data">
                {{ Math.round(stats.viewportWorldW) }} × {{ Math.round(stats.viewportWorldH) }}
              </span>
            </div>
          </div>
        </section>

        <section>
          <h3 class="m-0 mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Tiles
          </h3>
          <div class="flex flex-col gap-1">
            <div class="stat-row">
              <span>Size</span>
              <span class="font-data">{{ stats.tileSize }}</span>
            </div>
            <div class="stat-row">
              <span>Visible / indexed</span>
              <span class="font-data">{{ stats.visibleTiles }} / {{ stats.totalTiles }}</span>
            </div>
            <div class="stat-row">
              <span>Oversized</span>
              <span class="font-data">{{ stats.oversizedNodes }}</span>
            </div>
          </div>
        </section>

        <section>
          <h3 class="m-0 mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Connections
          </h3>
          <div class="flex flex-col gap-1">
            <div class="stat-row">
              <span>On layer / total</span>
              <span class="font-data">
                {{ stats.connectionsOnLayer }} / {{ stats.connectionsTotal }}
              </span>
            </div>
          </div>
        </section>

        <section>
          <h3 class="m-0 mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Draw
          </h3>
          <div class="flex flex-col gap-1">
            <div class="stat-row">
              <span>Visible objects</span>
              <span class="font-data">{{ stats.visibleDisplayObjects }}</span>
            </div>
            <div class="stat-row">
              <span>Visible Text / Graphics / other</span>
              <span class="font-data">
                {{ stats.visibleText }} / {{ stats.visibleGraphics }} / {{ stats.visibleOther }}
              </span>
            </div>
            <div class="stat-row">
              <span>Visible text textures</span>
              <span class="font-data">{{ stats.visibleTextTextures }}</span>
            </div>
            <div class="stat-row">
              <span>Visible node groups</span>
              <span class="font-data">{{ stats.visibleNodeGroups }}</span>
            </div>
            <div class="stat-row">
              <span>Visible cached / uncached</span>
              <span class="font-data">
                {{ stats.visibleCachedNodes }} / {{ stats.visibleUncachedNodes }}
              </span>
            </div>
            <div class="stat-row">
              <span>Hitchhikers hidden / visible</span>
              <span class="font-data" :class="{ 'stat-warn': stats.hitchhikersVisible > 0 }">
                {{ stats.hitchhikersHidden }} / {{ stats.hitchhikersVisible }}
              </span>
            </div>
            <div class="stat-row">
              <span>Backbuffer</span>
              <span class="font-data">
                {{ Math.round(stats.backbufferW) }} × {{ Math.round(stats.backbufferH) }}
                @{{ stats.resolution }}
              </span>
            </div>
            <div class="stat-row">
              <span>Antialias</span>
              <span class="font-data">{{ stats.antialias ? 'on' : 'off' }}</span>
            </div>
          </div>
          <p v-if="stats.hitchhikersVisible > 0" class="stat-warn mt-2 mb-0 text-[11px]">
            Hitchhikers visible &gt; 0 — nested off-tile nodes are still drawn.
          </p>
        </section>

        <section>
          <h3 class="m-0 mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Pixi
          </h3>
          <div class="flex flex-col gap-1">
            <div class="stat-row">
              <span>Ticker</span>
              <span class="font-data">{{ stats.tickerStarted ? 'on' : 'off' }}</span>
            </div>
            <div class="stat-row">
              <span>FPS / frame</span>
              <span class="font-data">
                {{ Math.round(stats.fps) }} / {{ stats.deltaMs.toFixed(1) }}ms
              </span>
            </div>
            <div class="stat-row">
              <span>World display objects (tree)</span>
              <span class="font-data">{{ stats.worldDisplayObjects }}</span>
            </div>
            <div class="stat-row">
              <span>Text LOD cached</span>
              <span class="font-data">{{ stats.textLodCached }}</span>
            </div>
            <div class="stat-row">
              <span>Mode</span>
              <span class="font-data">{{ modeLabel }}</span>
            </div>
          </div>
        </section>
      </template>
    </div>
  </ScrollArea>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { PixiRenderStats } from '../utils/PixiGraphRenderer'

const props = defineProps<{
  getStats: () => PixiRenderStats | null
  targetLabel: string
}>()

const emit = defineEmits<{
  contentHeight: [height: number]
}>()

const bodyRef = ref<HTMLElement | null>(null)
const stats = ref<PixiRenderStats | null>(null)
let pollId: ReturnType<typeof setInterval> | null = null

const overMounted = computed(() => {
  const s = stats.value
  if (!s?.ready) return false
  return s.mountedNodes > s.inViewportNodes * 2 + 8
})

const modeLabel = computed(() => {
  const s = stats.value
  if (!s) return '—'
  const parts: string[] = []
  if (s.suspended) parts.push('suspended')
  if (s.lensMode) parts.push('lens')
  else parts.push('main')
  return parts.join(' · ')
})

const refresh = () => {
  stats.value = props.getStats()
}

const emitContentHeight = () => {
  const el = bodyRef.value
  if (!el) return
  emit('contentHeight', el.scrollHeight)
}

onMounted(() => {
  refresh()
  pollId = setInterval(refresh, 250)
  void nextTick(() => emitContentHeight())
})

watch(
  () => stats.value?.ready,
  (ready) => {
    if (ready) void nextTick(() => emitContentHeight())
  }
)

onUnmounted(() => {
  if (pollId != null) clearInterval(pollId)
})
</script>

<style scoped>
.stat-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.stat-row > span:first-child {
  color: var(--muted-foreground, #c8c8dc);
}

.stat-warn {
  color: #e6b450;
}
</style>
