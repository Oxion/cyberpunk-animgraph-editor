<template>
  <div class="app">
    <!-- Header -->
    <header class="header">
      <div class="header-content">
        <div class="header-left">
          <div class="header-brand" title="Animgraph Editor">
            <Workflow class="header-brand-icon" :size="20" aria-hidden="true" />
            <span class="sr-only">Animgraph Editor</span>
          </div>
          <AppMenubar
            :filename="currentLoadedPath"
            :can-undo="canUndo"
            :can-redo="canRedo"
            :can-delete-selection="canDeleteSelection"
            :can-move-sm-state-up="canMoveSmStateUp"
            :can-move-sm-state-down="canMoveSmStateDown"
            :can-layout-sm-states-group="canLayoutSmStatesGroupSelected"
            :undo-title="undoTitle"
            :redo-title="redoTitle"
            v-model:graph-info="showGraphInfoCard"
            :sim-open="showSimCard"
            :debug-mode="debugMode"
            @load-sample="loadSampleData"
            @open="openWelcomePanel"
            @add-animgraph="openAddAnimgraphDialog"
            @save="saveCurrentGraph"
            @save-as="showSaveAsDialog = true"
            @export="showExportDialog = true"
            @undo="undoGraphAction"
            @redo="redoGraphAction"
            @delete="deleteSelection"
            @deselect-all="deselectAll"
            @select-children="selectChildren"
            @move-sm-state-up="moveActiveSelectedSmStateByDelta(-1)"
            @move-sm-state-down="moveActiveSelectedSmStateByDelta(1)"
            @layout-sm-states-group="layoutActiveSelectedSmStatesGroup"
            @toggle-sim="toggleSimCard"
            @toggle-tool="toggleAppTool"
            @open-render-stats="openRenderStatsForActive"
            @about="showAboutDialog = true"
          />
          <Button
            v-if="hasProject"
            type="button"
            size="icon-sm"
            variant="ghost"
            class="header-canvas-focus size-7 shrink-0 rounded-sm p-0 [&_svg]:size-4"
            :class="{ 'header-canvas-focus--on': diagramHotkeyFocus }"
            :title="canvasFocusTitle"
            :aria-label="canvasFocusTitle"
            :aria-pressed="diagramHotkeyFocus"
            @click="focusActiveDiagram"
          >
            <FocusIcon :size="16" aria-hidden="true" />
          </Button>
        </div>

        <HeaderNodeSearch
          v-if="hasProject && activeDiagramId"
          :diagram-id="activeDiagramId"
        />

        <div class="header-right">
          <Button
            v-if="hasProject"
            type="button"
            size="icon"
            variant="ghost"
            class="size-8 rounded-sm p-0 [&_svg]:size-5"
            :title="sidebarVisible ? 'Hide sidebar' : 'Show sidebar'"
            @click="sidebarVisible = !sidebarVisible"
          >
            <PanelRightClose v-if="sidebarVisible" :size="20" />
            <PanelRightOpen v-else :size="20" />
          </Button>
          <ElectronWindowControls />
        </div>
      </div>
    </header>

    <div class="workspace">
    <!-- Main Content -->
    <main class="main-content">
      <!-- Graph View -->
      <section class="graph-section">
        <div class="graph-container" ref="graphContainer">
          <div
            v-if="!hasProject && !loadingRef"
            class="empty-state"
          >
            <AppWelcomePanel
              v-model:layout-mode="directChildrenLayoutMode"
              :busy="loadingFromServer || loadingRef"
              @close="closeWelcomePanel"
            />
          </div>
          
          <div v-if="loadingRef && !hasProject" class="loading-state">
            <DiagramLoadingOverlay label="Processing animgraph..." />
          </div>
          <div
            v-if="hasProject"
            ref="bodyHostEl"
            class="graph-view"
            :class="{ 'graph-view--focused': bodyHasDiagramFocus }"
            tabindex="0"
            data-diagram-focus-host
            title="Click to focus graph"
            @pointerdown="onBodyHostPointerDown"
            @focus="onBodyHostFocus"
            @blur="onBodyHostBlur"
          >
            <div
              v-for="diagramId in listDiagramIds"
              :key="diagramId"
              :ref="(el) => bindDiagramCanvasEl(diagramId, el)"
              class="graph-canvas"
              v-show="activeDiagramId === diagramId"
            />

            <DiagramLoadingOverlay v-if="hasProject && !diagramViewReadyRef" />

            <template v-for="body in bodyViews" :key="body.id">
              <GraphViewLayer
                v-for="entry in bodyOverlayEntries(body)"
                :key="`${body.id}:${entry.id}`"
                v-show="isBodyStackTop(body, entry)"
                :view="entry"
                :preview="body.preview"
                :breadcrumb-items="bodyViewBreadcrumbItems(body)"
                :close-label="body.closable ? 'Close' : '← Back'"
                :show-chrome="!sidebarVisible"
                @close="onBodyLayerClose(body)"
                @pin="body.closable ? pinBodyView(body.id) : undefined"
                @action="(actionId) => onBodyViewAction(body.id, actionId)"
                @jump="(index) => jumpToIndex(index, body.id)"
              >
                <LensWindowContent
                  v-if="entry.kind === 'graph-scope' && entry.payload.scopeRootId && getRenderData(entry.projectDiagramId)"
                  :ref="(el) => bindDiagramViewRef(entry.id, el)"
                  :graph-data="getRenderData(entry.projectDiagramId)!"
                  :root-node-id="entry.payload.scopeRootId"
                  :hide-scope-root="Boolean(entry.payload.hideScopeRoot)"
                  :present-op="getGraphViewPresentOps(entry, getRenderData(entry.projectDiagramId)!)"
                  :right-inset="bodyPresentRightInset"
                  :active="isBodyStackTop(body, entry)"
                  @node-select="(ids, primary) => handleBodyViewNodeSelect(entry.id, ids, primary)"
                  @open-scope="(nodeId) => pushScopeIntoBody(entry.projectDiagramId, body.id, nodeId)"
                  @pin-connect="(payload) => onViewPinConnect(entry.projectDiagramId, payload)"
                  @pin-rewire="(payload) => onViewPinRewire(entry.projectDiagramId, payload)"
                  @ready="() => onDiagramViewReady(entry.id)"
                />
                <StateLinksViewContent
                  v-else-if="entry.kind === 'state-links' && entry.payload.stateNodeId && getRenderData(entry.projectDiagramId)"
                  :ref="(el) => bindDiagramViewRef(entry.id, el)"
                  :graph-data="getRenderData(entry.projectDiagramId)!"
                  :state-node-id="entry.payload.stateNodeId"
                  :active="isBodyStackTop(body, entry)"
                  @node-select="(ids, primary) => handleBodyViewNodeSelect(entry.id, ids, primary)"
                  @open-scope="(nodeId) => pushScopeIntoBody(entry.projectDiagramId, body.id, nodeId)"
                  @pin-connect="(payload) => onViewPinConnect(entry.projectDiagramId, payload)"
                  @pin-rewire="(payload) => onViewPinRewire(entry.projectDiagramId, payload)"
                  @ready="() => onDiagramViewReady(entry.id)"
                />
                <StateMachineRingWindowContent
                  v-else-if="entry.kind === 'sm-ring' && entry.payload.stateMachineNodeId && getRenderData(entry.projectDiagramId)"
                  :graph-data="getRenderData(entry.projectDiagramId)!"
                  :state-machine-node-id="entry.payload.stateMachineNodeId"
                  :sim-highlight="simRingHighlightFor(entry.payload.stateMachineNodeId)"
                />
              </GraphViewLayer>
            </template>
          </div>

          <!-- Sidebar overlay -->
          <AppSidebar
            v-if="hasProject && sidebarVisible"
            v-model:sidebar-el="sidebarElRef"
            v-model:sidebar-cards-el="sidebarCardsElRef"
            :sidebar-resizing="sidebarResizing"
            :sidebar-style="sidebarStyle"
            :on-sidebar-resize-start="onSidebarResizeStart"
          >
            <GraphViewChromeCard
              v-if="sidebarGraphViewChrome"
              :view="sidebarGraphViewChrome.view"
              :preview="sidebarGraphViewChrome.preview"
              :close-label="sidebarGraphViewChrome.closeLabel"
              @close="onSidebarGraphViewChromeClose"
              @action="onSidebarGraphViewChromeAction"
              @pin="onSidebarGraphViewChromePin"
            />

            <GraphInfoPanel
              v-if="showGraphInfoCard"
              v-model:collapsed="graphInfoPanelCollapsed"
              v-model:height="graphInfoPanelHeight"
              :total-nodes="graphStats.totalNodes"
              :node-type-count="graphStats.nodeTypes.length"
              :file-size-label="formatFileSize(fileSize)"
              :fill="sidebarFillPanelId === 'graphInfo'"
              :min-height="SIDEBAR_PANEL_MIN.graphInfo"
              :max-height="sidebarPanelMaxHeights.graphInfo"
              @close="toggleGraphInfoCard"
            />

            <SidebarPanel
              v-if="showSimCard"
              title="Simulation"
              closable
              v-model:collapsed="simPanelCollapsed"
              v-model:height="simPanelHeight"
              :fill="sidebarFillPanelId === 'sim'"
              :min-height="SIDEBAR_PANEL_MIN.sim"
              :max-height="sidebarPanelMaxHeights.sim"
              @close="toggleSimCard"
            >
              <SimPanel
                :snapshot="simSnapshotRef"
                :active="simActive"
                :discovered="simDiscovered"
                :event-draft="simEventDraft"
                :feature-drafts="simFeatureDrafts"
                :vector-feature-drafts="simVectorFeatureDrafts"
                :quat-feature-drafts="simQuatFeatureDrafts"
                :bool-feature-drafts="simBoolFeatureDrafts"
                :float-vars="simFloatVarDrafts"
                :vector-vars="simVectorVarDrafts"
                :quat-vars="simQuatVarDrafts"
                :bool-vars="simBoolVarDrafts"
                :int-vars="simIntVarDrafts"
                :tag-values="simTagValueDrafts"
                :entity-tags="simEntityTagDrafts"
                :wrapper-weights="simWrapperWeightDrafts"
                :clip-stats="simClipStats"
                :clip-names="simClipNames"
                :setup-entries="simSetupEntries"
                :anim-db-stats="simAnimDbStats"
                :anim-databases="simAnimDatabases"
                :rig-entries="simRigEntries"
                :active-rig-bones="simActiveRigBones"
                :active-rig-parts="simActiveRigParts"
                :clip-pose-sets="simClipPoseSets"
                :get-clip-glb-info="simGetClipGlbInfo"
                :list-glb-anim-names="simListGlbAnimNames"
                :resolve-clip="simGetClip"
                :lookup-clip="simLookupClip"
                :is-clip-active="simIsClipActive"
                :list-clip-sets="simListClipSets"
                :load-animset-json="simLoadAnimsetJson"
                :load-animset-glb="simLoadAnimsetGlb"
                :clear-animset-glb="simClearAnimsetGlb"
                :load-rig-json="simLoadRigJson"
                :remove-rig="simRemoveRig"
                :set-active-rig="simSetActiveRig"
                :clear-rig-library="simClearRigLibrary"
                :set-pose-inspect-bones="simSetPoseInspectBones"
                :sample-warnings-enabled="simSampleWarningsEnabled"
                :set-sample-warnings-enabled="simSetSampleWarningsEnabled"
                :load-anim-database-json="simLoadAnimDatabaseJson"
                :remove-anim-database="simRemoveAnimDatabase"
                :update-setup-entry="simUpdateSetupEntry"
                :remove-setup-entry="simRemoveSetupEntry"
                :apply-feature="simSetFeature"
                :apply-bool-feature="simSetBoolFeature"
                :apply-vector-feature-axis="simSetVectorFeatureAxis"
                :apply-quat-feature-axis="simSetQuatFeatureAxis"
                :apply-float-var="simSetFloatVar"
                :apply-vector-var-axis="simSetVectorVarAxis"
                :resolve-vector-var-value="simDraftVectorVarValue"
                :apply-quat-var-axis="simSetQuatVarAxis"
                :resolve-quat-var-value="simDraftQuatVarValue"
                :apply-bool-var="simSetBoolVar"
                :apply-int-var="simSetIntVar"
                :apply-tag-value="simSetTagValue"
                :apply-entity-tag="simSetEntityTag"
                :remove-entity-tag="simRemoveEntityTag"
                :apply-wrapper-weight="simSetWrapperWeight"
                :resolve-feature-value="simDraftFeatureValue"
                :resolve-bool-feature-value="simDraftBoolFeatureValue"
                :resolve-vector-feature-value="simDraftVectorFeatureValue"
                :resolve-quat-feature-value="simDraftQuatFeatureValue"
                @update:event-draft="simEventDraft = $event"
                @toggle="simToggle"
                @toggle-active="simToggleActive"
                @step="simStep"
                @reset="simReset"
                @set-speed="simSetSpeed"
                @fire-external="simFireExternal"
                @fire-anim-event="simFireAnimEvent"
                @fire-anim-end="simFireAnimEnd"
                @clear-clips="simClearClipLibrary"
                @clear-anim-db="simClearAnimDatabaseLibrary"
                @open-skeleton="openSimSkeletonFromPanel"
              />
            </SidebarPanel>

            <ToolsPanel
              v-if="focusedTool"
              ref="toolsPanelRef"
              v-model:collapsed="toolsPanelCollapsed"
              v-model:height="toolsPanelHeight"
              :fill="sidebarFillPanelId === 'tools'"
              :min-height="SIDEBAR_PANEL_MIN.tools"
              :max-height="sidebarPanelMaxHeights.tools"
              :resolve-select-inputs-new-count="resolveSelectInputsNewCount"
              @move-start="beginGrabMove"
              @move-confirm="confirmGrabMove"
              @move-cancel="cancelGrabMove"
              @move-clear-axis-lock="clearGrabAxisLock"
              @move-set-axis-lock="setGrabAxisLock"
              @resize-start="beginResize"
              @resize-confirm="confirmResize"
              @resize-cancel="cancelResize"
              @resize-clear-side-lock="clearResizeSideLock"
              @resize-set-side-lock="setResizeSideLock"
              @add-node="onToolsAddNode"
              @paste-nodes="pasteNodes"
              @add-connection="onToolsCreateConnection"
              @arrange-inputs-select-all="selectAllIncomingConnections"
              @arrange-inputs-deselect-all="deselectAllIncomingConnections"
              @arrange-inputs-toggle="onToolsArrangeInputsToggle"
              @arrange-inputs="onToolsArrangeInputs"
              @select-inputs-add="onToolsSelectInputsAdd"
              @arrange-selection="onToolsArrangeSelection"
              @attach-create="createAttachHandleActionForUI"
              @attach-clear="clearAttachHandleAction"
              @attach-data-from-selected="onToolsAttachDataFromSelected"
              @attach-run="onToolsAttachRun"
            />

            <NodeDetailsPanel
              v-model:collapsed="detailsPanelCollapsed"
              v-model:height="detailsPanelHeight"
              :title="nodeDetailsTitle"
              :has-selection="!!selectedNodeRef"
              :open-scope-title="selectedNodeOpenScopeTitle"
              :fill="sidebarFillPanelId === 'details'"
              :min-height="SIDEBAR_PANEL_MIN.details"
              :max-height="sidebarPanelMaxHeights.details"
              @open-body="() => openLensFromSelection('body')"
              @open-lens="openLensWindowFromSelection"
              @pan-to="panToSelectedNode"
            />
          </AppSidebar>
        </div>
      </section>
    </main>

    <!-- Windows above body layers + sidebar so State Links stays clickable while previewing -->
    <div class="app-windows-layer">
      <AppWindow
        v-for="win in visibleWindows"
        :key="win.id"
        :title="win.title"
        :x="win.x"
        :y="win.y"
        :width="win.width"
        :height="win.height"
        :z-index="win.zIndex"
        :minimized="win.minimized"
        :maximized="win.maximized"
        :preview="win.preview"
        :active="activeWindowId === win.id && !win.minimized"
        :closable="true"
        @close="onWindowClose(win.id)"
        @focus="onWindowFocus(win.id)"
        @key-focus="onWindowKeyFocus(win.id)"
        @key-blur="onWindowKeyBlur(win.id)"
        @minimize="minimizeWindow(win.id)"
        @maximize="() => toggleMaximizeWindow(win.id)"
        @update:rect="(rect) => updateWindowRect(win.id, rect)"
      >
        <template #toolbar-actions>
          <button
            v-if="win.preview"
            type="button"
            class="app-window-toolbar-btn app-window-toolbar-btn--wide"
            title="Pin window (keep open; next preview opens separately)"
            @pointerdown.stop
            @click="pinWindow(win.id)"
          >
            Pin
          </button>
          <button
            v-if="win.type !== 'settings' && win.type !== 'render-stats' && win.type !== 'sim-skeleton'"
            type="button"
            class="app-window-toolbar-btn"
            title="Fit view"
            @pointerdown.stop
            @click="fitAppWindow(win.id)"
          >
            ⊡
          </button>
        </template>
        <SettingsWindowContent
          v-if="win.type === 'settings'"
          :connection-settings="connectionSettings"
          :grid-settings="gridSettings"
          :debug-tiles="debugTiles"
          :debug-layout-containers="debugLayoutContainers"
          :debug-mode="debugMode"
          :text-lod-cache-screen-px="textLodCacheScreenPx"
          :has-graph="hasProject"
          @update:connection-settings="onConnectionSettingsFromWindow"
          @update:grid-settings="onGridSettingsFromWindow"
          @update:debug-tiles="onDebugTilesFromWindow"
          @update:debug-layout-containers="onDebugLayoutContainersFromWindow"
          @update:debug-mode="onDebugModeFromWindow"
          @update:text-lod-cache-screen-px="onTextLodCacheScreenPxFromWindow"
          @open-render-stats="openRenderStatsForActive"
        />
        <RenderStatsWindowContent
          v-else-if="win.type === 'render-stats'"
          :target-label="win.payload.label"
          :get-stats="() => getRenderStatsForWindow(win)"
          @content-height="(h) => sizeWindowToContent(win.id, h)"
        />
        <SimSkeletonWindowContent
          v-else-if="win.type === 'sim-skeleton'"
          :diagram-id="win.payload.diagramId"
          :minimized="win.minimized"
          :get-pose="(source) => getSimSkeletonPose(source)"
        />
        <div
          v-else-if="win.type === 'lens' && windowRenderData(win.id) && windowLensTop(win.id)"
          class="app-window-stack-host"
        >
          <LensWindowContent
            :ref="(el) => bindWindowDiagramRef(win.id, el)"
            :graph-data="windowRenderData(win.id)!"
            :root-node-id="windowLensTop(win.id)!.payload.scopeRootId"
            :hide-scope-root="Boolean(windowLensTop(win.id)!.payload.hideScopeRoot)"
            :present-op="getGraphViewPresentOps(windowLensTop(win.id)!, windowRenderData(win.id)!)"
            @node-select="(ids, primary) => handleWindowLensNodeSelect(windowDiagramId(win.id), ids, primary)"
            @open-scope="(nodeId) => pushScopeIntoWindow(win.id, nodeId)"
            @pin-connect="(payload) => onViewPinConnect(windowDiagramId(win.id), payload)"
            @pin-rewire="(payload) => onViewPinRewire(windowDiagramId(win.id), payload)"
            @ready="updateConnectionSettings"
          />
          <GraphViewBreadcrumb
            v-if="windowStackBreadcrumbItems(win.id).length > 1"
            :items="windowStackBreadcrumbItems(win.id)"
            @jump="(index) => jumpWindowStack(win.id, index)"
          />
        </div>
        <div
          v-else-if="win.type === 'state-links' && windowRenderData(win.id)"
          class="app-window-stack-host"
        >
          <StateLinksViewContent
            v-if="windowStackTopKind(win.id) === 'state-links'"
            :ref="(el) => bindWindowDiagramRef(win.id, el)"
            :graph-data="windowRenderData(win.id)!"
            :state-node-id="win.payload.stateNodeId"
            @node-select="(ids, primary) => handleWindowLensNodeSelect(windowDiagramId(win.id), ids, primary)"
            @open-scope="(diagramNodeId) => openStateLinksRootChild(win.id, diagramNodeId)"
            @pin-connect="(payload) => onViewPinConnect(windowDiagramId(win.id), payload)"
            @pin-rewire="(payload) => onViewPinRewire(windowDiagramId(win.id), payload)"
            @ready="updateConnectionSettings"
          />
          <LensWindowContent
            v-else-if="windowLensTop(win.id)"
            :ref="(el) => bindWindowDiagramRef(win.id, el)"
            :graph-data="windowRenderData(win.id)!"
            :root-node-id="windowLensTop(win.id)!.payload.scopeRootId"
            :hide-scope-root="Boolean(windowLensTop(win.id)!.payload.hideScopeRoot)"
            :present-op="getGraphViewPresentOps(windowLensTop(win.id)!, windowRenderData(win.id)!)"
            @node-select="(ids, primary) => handleWindowLensNodeSelect(windowDiagramId(win.id), ids, primary)"
            @open-scope="(nodeId) => pushScopeIntoWindow(win.id, nodeId)"
            @pin-connect="(payload) => onViewPinConnect(windowDiagramId(win.id), payload)"
            @pin-rewire="(payload) => onViewPinRewire(windowDiagramId(win.id), payload)"
            @ready="updateConnectionSettings"
          />
          <GraphViewBreadcrumb
            v-if="windowStackBreadcrumbItems(win.id).length > 1"
            :items="windowStackBreadcrumbItems(win.id)"
            @jump="(index) => jumpWindowStack(win.id, index)"
          />
        </div>
        <StateMachineRingWindowContent
          v-else-if="win.type === 'sm-ring' && windowRenderData(win.id)"
          :ref="(el) => bindWindowDiagramRef(win.id, el)"
          :graph-data="windowRenderData(win.id)!"
          :state-machine-node-id="win.payload.stateMachineNodeId"
          :sim-highlight="simRingHighlightFor(win.payload.stateMachineNodeId)"
        />
      </AppWindow>
    </div>

    <AppTaskbar
      :diagram-items="diagramTaskbarItems"
      :body-items="bodyViewTaskbarItems"
      :window-items="taskbarItems"
      @select="onTaskbarSelect"
      @select-diagram="onTaskbarSelectDiagram"
    />
    </div>

    <!-- Tooltip -->
    <div v-if="tooltip.show" class="tooltip" :style="tooltipStyle">
      <div class="tooltip-content">
        <strong>{{ tooltip.title }}</strong>
        <p>{{ tooltip.content }}</p>
      </div>
    </div>

    <Dialog v-model:open="showSaveAsDialog">
      <DialogContent class="flex w-[min(40rem,calc(100vw-2rem))] max-h-[min(720px,calc(100vh-var(--app-header-h)-var(--app-taskbar-h)-2rem))] max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-hidden rounded-sm border-border bg-card p-4 sm:max-w-[40rem]">
        <DialogHeader class="flex shrink-0 flex-row items-start gap-2.5 space-y-0 text-left">
          <SaveIcon class="mt-0.5 size-7 shrink-0 text-foreground" aria-hidden="true" />
          <div class="min-w-0 flex-1 gap-0">
            <DialogTitle class="text-[15px] leading-tight">
              Save As
            </DialogTitle>
            <DialogDescription class="text-[11px] leading-snug">
              Choose a folder and filename for the project JSON.
            </DialogDescription>
          </div>
        </DialogHeader>
        <FileBrowser
          class="min-h-0 min-w-0 flex-1"
          mode="save-as"
          :busy="loadingFromServer"
          :initial-path="saveAsInitialPath"
          @confirm="handleSaveAs"
        />
      </DialogContent>
    </Dialog>

    <AppExportDialog
      :busy="loadingFromServer || loadingRef"
      :initial-path="saveAsInitialPath"
    />

    <AppAboutDialog v-model:open="showAboutDialog" />

    <Dialog
      :open="showWelcomeOpen"
      @update:open="(open) => (open ? openWelcomePanel() : closeWelcomePanel())"
    >
      <DialogContent
        class="flex w-[min(40rem,calc(100vw-2rem))] max-h-[min(720px,calc(100vh-var(--app-header-h)-var(--app-taskbar-h)-2rem))] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none sm:max-w-[40rem] [&>button]:hidden"
      >
        <DialogHeader class="sr-only">
          <DialogTitle>Open Animgraph</DialogTitle>
          <DialogDescription>
            Open a project, or create one from animgraph / render JSON.
          </DialogDescription>
        </DialogHeader>
        <AppWelcomePanel
          host="dialog"
          v-model:layout-mode="directChildrenLayoutMode"
          :busy="loadingFromServer || loadingRef"
          @close="closeWelcomePanel"
        />
      </DialogContent>
    </Dialog>

    <Dialog
      :open="showAddAnimgraphDialog"
      @update:open="(open) => (open ? openAddAnimgraphDialog() : closeAddAnimgraphDialog())"
    >
      <DialogContent
        class="flex w-[min(40rem,calc(100vw-2rem))] max-h-[min(720px,calc(100vh-var(--app-header-h)-var(--app-taskbar-h)-2rem))] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none sm:max-w-[40rem] [&>button]:hidden"
      >
        <DialogHeader class="sr-only">
          <DialogTitle>Add Animgraph</DialogTitle>
          <DialogDescription>
            Import animgraph, render export, or one diagram from a project into the current project.
          </DialogDescription>
        </DialogHeader>
        <AppWelcomePanel
          mode="add"
          host="dialog"
          v-model:layout-mode="directChildrenLayoutMode"
          :busy="loadingFromServer || loadingRef"
          @close="closeAddAnimgraphDialog"
        />
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FocusIcon, PanelRightClose, PanelRightOpen, SaveIcon, Workflow } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import AppMenubar from './components/AppMenubar.vue'
import AppAboutDialog from './components/AppAboutDialog.vue'
import AppExportDialog from './components/AppExportDialog.vue'
import ElectronWindowControls from './components/ElectronWindowControls.vue'
import AppSidebar from './components/AppSidebar.vue'
import AppTaskbar from './components/AppTaskbar.vue'
import AppWelcomePanel from './components/AppWelcomePanel.vue'
import FileBrowser from './components/FileBrowser.vue'
import AppWindow from './components/AppWindow.vue'
import DiagramLoadingOverlay from './components/DiagramLoadingOverlay.vue'
import HeaderNodeSearch from './components/HeaderNodeSearch.vue'
import GraphInfoPanel from './components/GraphInfoPanel.vue'
import GraphViewChromeCard from './components/GraphViewChromeCard.vue'
import GraphViewBreadcrumb from './components/GraphViewBreadcrumb.vue'
import GraphViewLayer from './components/GraphViewLayer.vue'
import LensWindowContent from './components/LensWindowContent.vue'
import NodeDetailsPanel from './components/NodeDetailsPanel.vue'
import RenderStatsWindowContent from './components/RenderStatsWindowContent.vue'
import SimSkeletonWindowContent from './components/SimSkeletonWindowContent.vue'
import SettingsWindowContent from './components/SettingsWindowContent.vue'
import SidebarPanel from './components/SidebarPanel.vue'
import SimPanel from './components/SimPanel.vue'
import StateLinksViewContent from './components/StateLinksViewContent.vue'
import StateMachineRingWindowContent from './components/StateMachineRingWindowContent.vue'
import ToolsPanel from './components/ToolsPanel.vue'
import { useAnimgraphSim } from './composables/useAnimgraphSim'
import {
  flushPendingHandleFieldEditImpl,
  notifySelectedHandleDataChanged,
  recordHandleFieldEdit,
  recordHandleFieldsEdit,
  removePinArraySlot,
  renamePinHandleId,
  reorderPinArraySlot,
  selectedHandleData,
  setupNodeDetailsContext,
  snapshotHandleField,
  snapshotHandleFields,
  type NodeDetailsSection,
} from './composables/useNodeDetailsContext'
import {
  bindGraphDocument,
  closeWelcomePanel,
  closeAddAnimgraphDialog,
  currentLoadedPath,
  diagramViewReadyRef,
  fileSize,
  formatFileSize,
  handleSaveAs,
  loadingFromServer,
  loadingRef,
  loadSampleData,
  openWelcomePanel,
  openAddAnimgraphDialog,
  bindDiagramCanvasEl,
  saveCurrentGraph,
  showSaveAsDialog,
  showAddAnimgraphDialog,
  showExportDialog,
  showWelcomeOpen,
} from './composables/useGraphDocument'
import {
  bindGraphNavigation,
  graphScopePresentation,
  handleBodyViewNodeSelect,
  handleMainGraphNodeSelect,
  handleNodeSelect,
  handleWindowLensNodeSelect,
  navigateToNode,
  onBodyViewAction,
  openLensForNode,
  openLensFromSelection,
  openLensWindowFromSelection,
  openSmRingFromSelection,
  pushScopeIntoBody,
  selectedStateMachineInfo,
} from './composables/useGraphNavigation'
import { SIDEBAR_EDGE_OFFSET, SIDEBAR_PANEL_MIN, useSidebarLayout } from './composables/useSidebarLayout'
import { useWorkspace } from './composables/useWorkspace'
import {
  activeWindowId,
  closeWindow,
  focusWindow,
  minimizeWindow,
  openRenderStatsWindow,
  openSimSkeletonWindow,
  openStateLinksWindow,
  pinWindow,
  sizeWindowToContent,
  taskbarItems,
  toggleMaximizeWindow,
  updateWindowRect,
  windows,
  isWindowForActiveDiagram,
} from './stores/appWindows'
import {
  activeBodyViewId,
  activateBodyView,
  closeBodyView,
  currentView,
  graphViewStackRef,
  isDiagramRootBody,
  isDiagramRootBodyId,
  jumpToIndex,
  MAIN_BODY_ID,
  parallelBodyViews,
  pinBodyView,
  popEntry,
  setViewSelection,
  toggleBodyView,
  bodyViewRoot,
  activeBodyView,
  bodyViews,
} from './stores/bodyViews'
import {
  bindDiagramViewRef,
  forEachDiagramViewRenderer,
  forEachMainDiagramRenderer,
  getActiveDiagramRenderer,
  getDiagramViewApi,
  getDiagramViewRenderer,
  focusedDiagramSurface,
  isStateLinksRootContext,
  isStateLinksRootViewFocused,
  MAIN_RENDERER_ID,
  mainDiagramRenderer as graphRenderer,
  notifyDiagramViewReady,
  syncBodyRendererActivity,
} from './stores/diagramRenderers'
import {
  applyGraphSelection,
  nodeDescriptionRef,
  nodePositionRef,
  nodeSizeRef,
  selectedIncomingConnectionsRef,
  selectedNodeRef,
  selectedNodeConnectionsComputed,
  selectedNodeIdsRef,
  setSelectionClearedHandler,
} from './stores/graphSession'
import {
  activeDiagramId,
  getActiveRenderData,
  getRenderData,
  hasDiagramId,
  hasProject,
  listDiagramIds,
  requireActiveDiagramId,
  setActiveDiagramId,
} from './stores/graphProject'
import { presentActiveDiagram } from './stores/projectViewSession'
import {
  canRedo,
  canUndo,
  commitLayoutCapture,
  commitPositionCapture,
  graphHistory,
  graphHistoryState,
  handleDataRevision,
  historyRevisionRef,
  installGraphHistoryRuntime,
  pushDescriptionHistory,
  redoGraphAction,
  redoTitle,
  runWithLayoutHistory,
  trackLayoutBeforeChange,
  undoGraphAction,
  undoTitle,
} from './stores/graphHistory'
import {
  updateActiveNodes,
} from './stores/graphPaint'
import {
  arrangeSelectedNodesWithElk,
  beginGrabMove,
  beginResize,
  bindMoveResizeSession,
  cancelGrabMove,
  cancelResize,
  clearGrabAxisLock,
  clearResizeSideLock,
  confirmGrabMove,
  confirmResize,
  detachModalPointerListeners,
  moveInputNodesOnly,
  moveSelectedNodeByDelta,
  setGrabAxisLock,
  setResizeSideLock,
  trackLastPointerClient,
} from './composables/tools/moveResizeSession'
import {
  createConnection,
  deleteConnection,
  handlePinConnect,
  handlePinRewire,
} from './stores/graphWireRecord'
import {
  attachHandleAction,
  clearAttachHandleAction,
  createAttachHandleAction,
  createAttachHandleActionForUI,
} from './composables/tools/useAttachHandleTool'
import {
  addNewNode,
} from './stores/graphNodeCrud'
import {
  autoResizeParents,
  pressedArrowKeys,
} from './stores/modalGestureUi'
import { formatAddNodeDenial } from './components/tools/addNodeCopy'
import {
  bindGraphMutations,
  canLayoutSmStatesGroup,
  layoutActiveSelectedSmStatesGroup,
  layoutSelectedSmStatesGroup,
  moveActiveSelectedSmStateByDelta,
  moveSmStateToIndex,
} from './stores/graphMutations'
import { bodyOverlayEntries, bodyViewBreadcrumbs, bodyViewTop, type DiagramBodyView } from './types/DiagramBodyView'
import {
  getWindowStack,
  getWindowStackTop,
  jumpWindowStack,
  popWindowStack,
  pushWindowStack,
  windowStackRevision,
} from './stores/windowStacks'
import type { GraphViewEntry, GraphViewSelection } from './types/GraphView'
import { registerAllToolRunners } from './stores/registerAllToolRunners'
import {
  activeToolsRegistry,
  focusedTool,
  toolManager,
} from './stores/toolManager'
import {
  moveToolState,
  resizeToolState,
} from './stores/tools'
import type { AppWindowState, RenderStatsWindowPayload } from './types/AppWindow'
import type { AnimgraphNode } from './utils/graph/animgraphTypes'
import type { DiagramConnection, RenderData } from './utils/graph/diagramTypes'
import { MAIN_DIAGRAM_ID } from './utils/graph/diagramTypes'
import type { DirectChildrenLayoutMode } from './utils/graph/DirectChildrenLayout'
import { getConnectionKey } from './utils/graph/diagramModel'
import { NodeDefinitionRegistry } from './utils/NodeDefinition'
import { PixiGraphRenderer } from './utils/PixiGraphRenderer'
import {
  buildStateMachineRingPresentation,
  DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE,
  DIAGRAM_TRANSITION_WRAPPER_TYPE,
  isStateMachineDiagramRoot,
  isStateOverviewLeaf,
  resolveStateMachineInfoNode
} from './utils/graph/DiagramConversion'
import { type ArrangeSelectionAlgorithm, type ElkLayeredVariant } from './utils/graph/ElkGraphLayout'
import {
  canDeleteNode,
} from './utils/graph/deleteNodePlan'
import {
  DEFAULT_DIAGRAM_GRID_SETTINGS,
  setDiagramGridSettings,
  type DiagramGridSettings,
} from './utils/graph/diagramDotGrid'
import {
  readDiagramGroupLabel,
  readDiagramNoteText,
} from './utils/graph/diagramFrameNodes'
import {
  applyDiagramNodeDescription,
  applyDiagramNodeSize,
  applyDiagramNoteText,
} from './utils/graph/diagramNodeEdits'
import {
  applyResizeParentCascade,
  captureResizeCascadeBaselines,
  type ResizeLayoutDelta,
} from './utils/graph/resizeCascade'
import {
  canMoveSmStateByDelta,
  resolveLiveStateIndex,
} from './utils/graph/smStateSlot'
import { buildAppContext } from './when'
import {
  deleteSelection,
  deselectAll,
  pasteNodes,
  registerAppCommands,
  selectChildren,
} from './appCommands'
import { toggleAppTool } from './stores/appToolSelect'
import { whenEnabled, liveInProgressTool } from './stores/appContext'
import { hotkeyRegistry } from './stores/hotkeyBindings'
import {
  createGraphScopeView
} from './utils/views/viewRegistry'
import { getGraphViewPresentOps } from './utils/windows/presentOps'
import { isFocusLeavingHost } from './utils/dom/focusDiagramHost'

const { bodyViewTaskbarItems } = useWorkspace()

const bodyViewBreadcrumbItems = (body: DiagramBodyView) => bodyViewBreadcrumbs(body)

const isBodyStackTop = (body: DiagramBodyView, entry: GraphViewEntry) =>
  activeBodyViewId.value === body.id && !body.minimized && bodyViewTop(body).id === entry.id

const onBodyLayerClose = (body: DiagramBodyView) => {
  if (body.closable) closeBodyView(body.id)
  else popEntry(body.id)
}

// Touch revision so window stack template updates.
void windowStackRevision

const windowLensTop = (windowId: string): GraphViewEntry<'graph-scope'> | null => {
  const top = getWindowStackTop(windowId)
  return top?.kind === 'graph-scope' ? top : null
}

const windowStackTopKind = (windowId: string) => getWindowStackTop(windowId)?.kind ?? null

const windowStackBreadcrumbItems = (windowId: string) =>
  getWindowStack(windowId).map((entry, index) => ({
    index,
    id: entry.id,
    crumb: entry.crumb,
    kind: entry.kind,
  }))

const resolveMainDiagramId = () => {
  const body = activeBodyView.value
  if (isDiagramRootBody(body)) {
    return bodyViewRoot(body).projectDiagramId
  }
  return activeDiagramId.value ?? MAIN_BODY_ID
}

const diagramTaskbarItems = computed(() =>
  listDiagramIds.value.map((id) => ({
    id,
    title: id,
    type: 'diagram',
    minimized: false,
    active: activeDiagramId.value === id,
  }))
)

const visibleWindows = computed(() =>
  windows.value.filter((w) => isWindowForActiveDiagram(w, activeDiagramId.value))
)

const windowDiagramId = (windowId: string) =>
  getWindowStackTop(windowId)?.projectDiagramId ??
  activeDiagramId.value ??
  MAIN_BODY_ID

const windowRenderData = (windowId: string): RenderData | null =>
  getRenderData(windowDiagramId(windowId))

const onViewPinConnect = (
  diagramId: string,
  payload: { fromNodeId: string; toNodeId: string; pinName: string }
) => {
  handlePinConnect(diagramId, payload)
}

const onViewPinRewire = (diagramId: string, payload: Parameters<typeof handlePinRewire>[1]) => {
  handlePinRewire(diagramId, payload)
}

const isDiagramWindowType = (type: string) => type === 'lens' || type === 'state-links'

const onWindowFocus = (windowId: string) => {
  focusWindow(windowId)
  const id = windowDiagramId(windowId)
  if (getRenderData(id)) setActiveDiagramId(id)
}

const onWindowKeyFocus = (windowId: string) => {
  const win = windows.value.find((w) => w.id === windowId)
  if (win && isDiagramWindowType(win.type)) {
    focusedDiagramSurface.value = { kind: 'window', windowId }
  } else {
    focusedDiagramSurface.value = null
  }
  const el = document.activeElement
  focusHostEl.value = el instanceof HTMLDivElement ? el : null
  updateGraphInteractionGate()
}

const onWindowKeyBlur = (windowId: string) => {
  const surface = focusedDiagramSurface.value
  if (surface?.kind === 'window' && surface.windowId === windowId) {
    focusedDiagramSurface.value = null
  }
  suppressNextGraphInteraction.value = false
  updateGraphInteractionGate()
}

const diagramIdForViewId = (viewId: string): string => {
  for (const body of bodyViews.value) {
    for (const entry of bodyOverlayEntries(body)) {
      if (entry.id === viewId) return entry.projectDiagramId
    }
  }
  for (const win of windows.value) {
    for (const entry of getWindowStack(win.id)) {
      if (entry.id === viewId) return entry.projectDiagramId
    }
  }
  return resolveMainDiagramId()
}

const pushScopeIntoWindow = (windowId: string, diagramNodeId: string) => {
  const diagramId = windowDiagramId(windowId)
  const diagramNode = getRenderData(diagramId)?.allNodes.get(diagramNodeId)
  if (!diagramNode) return
  const { label, stateMachineNodeId, hideScopeRoot } = graphScopePresentation(diagramId, diagramNode)
  const entry = createGraphScopeView({
    scopeRootId: diagramNode.id,
    label,
    stateMachineNodeId,
    hideScopeRoot,
    projectDiagramId: diagramId,
  })
  pushWindowStack(windowId, entry)
}

const openStateLinksRootChild = (windowId: string, nodeId: string) => {
  const node = windowRenderData(windowId)?.allNodes.get(nodeId)
  if (!node) return
  if (
    node.type !== DIAGRAM_TRANSITION_WRAPPER_TYPE &&
    node.type !== DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE
  ) {
    return
  }
  pushScopeIntoWindow(windowId, nodeId)
}

const onWindowClose = (windowId: string) => {
  const stack = getWindowStack(windowId)
  if (stack.length > 1) {
    popWindowStack(windowId)
    return
  }
  closeWindow(windowId)
}

// Reactive data
const graphContainer = ref<HTMLElement | null>(null)
const bodyHostEl = ref<HTMLDivElement | null>(null)
const focusHostEl = ref<HTMLDivElement | null>(null)

const bodyHasDiagramFocus = computed(() => focusedDiagramSurface.value?.kind === 'body')

const diagramHotkeyFocus = computed(() => {
  const surface = focusedDiagramSurface.value
  if (!surface) return false
  if (surface.kind === 'body') return true
  const win = windows.value.find((w) => w.id === surface.windowId)
  return Boolean(win && isDiagramWindowType(win.type))
})

const suppressNextGraphInteraction = ref(false)

/** Host element for modal G/S focus restore. */
const graphCanvas = computed(() => focusHostEl.value)
    

const {
  snapshot: simSnapshotRef,
  discovered: simDiscovered,
  eventDraft: simEventDraft,
  featureDrafts: simFeatureDrafts,
  vectorFeatureDrafts: simVectorFeatureDrafts,
  quatFeatureDrafts: simQuatFeatureDrafts,
  boolFeatureDrafts: simBoolFeatureDrafts,
  floatVarDrafts: simFloatVarDrafts,
  vectorVarDrafts: simVectorVarDrafts,
  quatVarDrafts: simQuatVarDrafts,
  boolVarDrafts: simBoolVarDrafts,
  intVarDrafts: simIntVarDrafts,
  tagValueDrafts: simTagValueDrafts,
  entityTagDrafts: simEntityTagDrafts,
  wrapperWeightDrafts: simWrapperWeightDrafts,
  toggle: simToggle,
  step: simStep,
  reset: simReset,
  toggleActive: simToggleActive,
  deactivate: simDeactivate,
  setSpeed: simSetSpeed,
  fireExternal: simFireExternal,
  fireAnimEvent: simFireAnimEvent,
  fireAnimEnd: simFireAnimEnd,
  setFloatVar: simSetFloatVar,
  setVectorVarAxis: simSetVectorVarAxis,
  draftVectorVarValue: simDraftVectorVarValue,
  setQuatVarAxis: simSetQuatVarAxis,
  draftQuatVarValue: simDraftQuatVarValue,
  setBoolVar: simSetBoolVar,
  setIntVar: simSetIntVar,
  setTagValue: simSetTagValue,
  setEntityTag: simSetEntityTag,
  removeEntityTag: simRemoveEntityTag,
  setWrapperWeight: simSetWrapperWeight,
  setFeature: simSetFeature,
  setBoolFeature: simSetBoolFeature,
  setVectorFeatureAxis: simSetVectorFeatureAxis,
  setQuatFeatureAxis: simSetQuatFeatureAxis,
  draftFeatureValue: simDraftFeatureValue,
  draftBoolFeatureValue: simDraftBoolFeatureValue,
  draftVectorFeatureValue: simDraftVectorFeatureValue,
  draftQuatFeatureValue: simDraftQuatFeatureValue,
  clipStats: simClipStats,
  clipNames: simClipNames,
  setupEntries: simSetupEntries,
  animDbStats: simAnimDbStats,
  animDatabases: simAnimDatabases,
  rigEntries: simRigEntries,
  activeRigBones: simActiveRigBones,
  activeRigParts: simActiveRigParts,
  clipPoseSets: simClipPoseSets,
  getClipGlbInfo: simGetClipGlbInfo,
  listGlbAnimNames: simListGlbAnimNames,
  getClip: simGetClip,
  lookupClip: simLookupClip,
  isClipActive: simIsClipActive,
  listClipSets: simListClipSets,
  loadAnimsetJson: simLoadAnimsetJson,
  loadAnimsetGlb: simLoadAnimsetGlb,
  clearAnimsetGlb: simClearAnimsetGlb,
  clearClipLibrary: simClearClipLibrary,
  loadRigJson: simLoadRigJson,
  removeRig: simRemoveRig,
  setActiveRig: simSetActiveRig,
  clearRigLibrary: simClearRigLibrary,
  setPoseInspectBones: simSetPoseInspectBones,
  sampleWarningsEnabled: simSampleWarningsEnabled,
  setSampleWarningsEnabled: simSetSampleWarningsEnabled,
  setStackCaptureHandleIds: simSetStackCaptureHandleIds,
  loadAnimDatabaseJson: simLoadAnimDatabaseJson,
  clearAnimDatabaseLibrary: simClearAnimDatabaseLibrary,
  removeAnimDatabase: simRemoveAnimDatabase,
  updateSetupEntry: simUpdateSetupEntry,
  removeSetupEntry: simRemoveSetupEntry,
  rebind: simRebind,
  active: simActive,
  snapshotForDiagram: simSnapshotForDiagram,
  snapshotsByDiagram: simSnapshotsByDiagram,
  getProjectSimResources: simGetProjectSimResources,
  applyProjectSimResources: simApplyProjectSimResources,
  getSkeletonViewPose: simGetSkeletonViewPose,
} = useAnimgraphSim()

watch(
  () => {
    const node = selectedNodeRef.value
    const handleId = (node?.data?.originalNodeId as string | undefined) ?? ''
    return handleId || null
  },
  (handleId) => {
    simSetStackCaptureHandleIds(handleId ? [handleId] : [])
  },
  { immediate: true }
)

const directChildrenLayoutMode = ref<DirectChildrenLayoutMode>('tidy-tree')




const canDeleteSelection = computed(() => {
  if (!whenEnabled('canDeleteSelection')) return false
  const node = selectedNodeRef.value
  const data = getActiveRenderData()
  if (!node || !data) return false
  return canDeleteNode(node, { handlesRegistry: data.handlesRegistry }).ok
})

const saveAsInitialPath = computed(() => {
  const filePath = currentLoadedPath.value
  if (!filePath) return null
  const match = /^(.*?)[/\\][^/\\]+$/.exec(filePath)
  if (!match) return null
  const dir = match[1]
  if (/^[A-Za-z]:$/.test(dir)) return `${dir}\\`
  return dir || null
})

const canMoveSmStateUp = computed(() => {
  if (!whenEnabled('graphEditable')) return false
  historyRevisionRef.value
  const id = selectedNodeRef.value?.id
  const data = getActiveRenderData()
  const diagramId = activeDiagramId.value
  if (!id || !data || !diagramId) return false
  return canMoveSmStateByDelta(data, id, -1)
})

const canMoveSmStateDown = computed(() => {
  if (!whenEnabled('graphEditable')) return false
  historyRevisionRef.value
  const id = selectedNodeRef.value?.id
  const data = getActiveRenderData()
  if (!id || !data) return false
  return canMoveSmStateByDelta(data, id, 1)
})

const canLayoutSmStatesGroupSelected = computed(() => {
  if (!whenEnabled('graphEditable')) return false
  historyRevisionRef.value
  const id = selectedNodeRef.value?.id
  const diagramId = activeDiagramId.value
  if (!id || !diagramId) return false
  return canLayoutSmStatesGroup(diagramId, id)
})

const onTaskbarSelectDiagram = (diagramId: string) => {
  if (!hasDiagramId(diagramId)) return
  setActiveDiagramId(diagramId)
  activateBodyView(diagramId)
  presentActiveDiagram(diagramId)
}

const onTaskbarSelect = (id: string) => {
  if (isDiagramRootBodyId(id) || parallelBodyViews.value.some((s) => s.id === id)) {
    toggleBodyView(id)
    return
  }
  // Keep body view open — windows sit on top for continued State Links clicking.
  focusWindow(id)
}

const onDiagramViewReady = (viewId: string) => {
  syncBodyRendererActivity()
  updateGraphInteractionGate()
  const renderer = getDiagramViewRenderer(viewId)
  const diagramId = diagramIdForViewId(viewId)
  renderer?.setOnPinConnect((payload) => handlePinConnect(diagramId, payload))
  renderer?.setOnPinRewire((payload) => handlePinRewire(diagramId, payload))
  notifyDiagramViewReady(viewId)
  applyConnectionSettingsToRenderer(renderer)
  applySimOverlayToAllRenderers()
}

const canvasFocusTitle = computed(() =>
  diagramHotkeyFocus.value
    ? 'Canvas focused — graph hotkeys (G, S, arrows, Delete) are active. Click to refocus.'
    : 'Canvas not focused — graph hotkeys are off. Click to focus the canvas.'
)

const focusActiveDiagram = () => {
  const surface = focusedDiagramSurface.value
  if (surface?.kind === 'window') {
    focusHostEl.value?.focus({ preventScroll: true })
    return
  }
  bodyHostEl.value?.focus({ preventScroll: true })
}

const onBodyHostFocus = () => {
  focusedDiagramSurface.value = { kind: 'body' }
  focusHostEl.value = bodyHostEl.value
  updateGraphInteractionGate()
}

const onBodyHostBlur = (event: FocusEvent) => {
  if (!isFocusLeavingHost(event, bodyHostEl.value)) return
  if (focusedDiagramSurface.value?.kind === 'body') {
    focusedDiagramSurface.value = null
  }
  suppressNextGraphInteraction.value = false
  updateGraphInteractionGate()
}

const onBodyHostPointerDown = () => {
  if (focusedDiagramSurface.value?.kind !== 'body') {
    suppressNextGraphInteraction.value = true
  }
  bodyHostEl.value?.focus({ preventScroll: true })
}

const emptyGraphSelection: GraphViewSelection = { nodeIds: [], primaryNodeId: null }

/** Persisted selection of the active body stack top. */
const activeGraphSelection = computed(() => currentView.value.selection ?? emptyGraphSelection)

watch(
  [
    () => activeGraphSelection.value.primaryNodeId,
    () => activeGraphSelection.value.nodeIds.join('\0'),
    () => currentView.value.projectDiagramId,
  ],
  ([primaryNodeId, idsJoined, diagramId]) => {
    applyGraphSelection(
      diagramId,
      primaryNodeId,
      idsJoined ? idsJoined.split('\0') : []
    )
  }
)

const restoreGraphSelection = () => {
  const sel = activeGraphSelection.value
  getActiveDiagramRenderer()?.setSelectedNodes(sel.nodeIds, sel.primaryNodeId, true)
}

watch(
  [
    () => currentView.value.id,
    () => currentView.value.kind,
    () => activeBodyViewId.value,
    () => graphViewStackRef.value.map((e) => e.id).join('|'),
    () => parallelBodyViews.value.map((s) => s.id).join('|'),
  ],
  () => {
    syncBodyRendererActivity()
    restoreGraphSelection()
    updateGraphInteractionGate()
  }
)

const fitAppWindow = (windowId: string) => {
  getDiagramViewApi(windowId)?.fitView?.()
}

const debugTiles = ref(false)
const debugLayoutContainers = ref(false)
const debugMode = ref(false)
/** Debug override for text LOD cache threshold (CSS px); null = auto. */
const textLodCacheScreenPx = ref<number | null>(null)

const resolveActiveRenderStatsTarget = (): RenderStatsWindowPayload | null => {
  const focused = windows.value.find(
    (w) =>
      w.id === activeWindowId.value &&
      !w.minimized &&
      (w.type === 'lens' || w.type === 'state-links')
  )
  if (focused) {
    return { source: 'window', sourceId: focused.id, label: focused.title }
  }

  const top = currentView.value
  if (top.kind === 'graph-scope' || top.kind === 'state-links') {
    return { source: 'body', sourceId: top.id, label: top.title }
  }

  if (graphRenderer.value || hasProject.value) {
    return { source: 'main', sourceId: 'main', label: 'Main' }
  }
  return null
}

const getRenderStatsForWindow = (win: AppWindowState) => {
  if (win.type !== 'render-stats') return null
  const { source, sourceId } = win.payload
  if (source === 'main') {
    return getDiagramViewRenderer(MAIN_RENDERER_ID)?.getRenderStats() ?? null
  }
  return getDiagramViewRenderer(sourceId)?.getRenderStats() ?? null
}

const openRenderStatsForActive = () => {
  const target = resolveActiveRenderStatsTarget()
  if (!target) return
  openRenderStatsWindow(target)
}

const getSimSkeletonPose = (source: 'full' | 'active' | 'atNode') => {
  const handleId = (selectedNodeRef.value?.data?.originalNodeId as string | undefined) ?? null
  return simGetSkeletonViewPose(source, {
    activeDiagramId: requireActiveDiagramIdSafe(),
    captureHandleId: handleId,
  })
}

const requireActiveDiagramIdSafe = (): string | null => {
  try {
    return requireActiveDiagramId()
  } catch {
    return null
  }
}

const openSimSkeletonFromPanel = () => {
  openSimSkeletonWindow({ diagramId: requireActiveDiagramIdSafe() ?? 'main' })
}

// Connection settings
const connectionSettings = reactive({
  highlightSelectedNodeConnections: true,
  selectedNodeConnectionColor: '#ffffff',
  selectedNodeConnectionOverlayAmount: 0.4,
  selectedNodeConnectionOpacity: 1.0,
  selectedNodeConnectionWidth: 3
})

const gridSettings = reactive({ ...DEFAULT_DIAGRAM_GRID_SETTINGS })

// Settings panels visibility
const showGraphInfoCard = ref(false)
const showSimCard = ref(false)
const showAboutDialog = ref(false)

const applySimOverlayToAllRenderers = () => {
  const live = simActive.value

  // Soft-suspended Main canvases keep their own diagram snapshot.
  forEachMainDiagramRenderer((renderer, diagramId) => {
    renderer.applySimOverlay(live ? simSnapshotForDiagram(diagramId) : undefined)
  })

  forEachDiagramViewRenderer((renderer, viewId) => {
    // Active Main already painted above via forEachMainDiagramRenderer.
    if (viewId === MAIN_RENDERER_ID) return
    let diagramId = activeDiagramId.value ?? MAIN_DIAGRAM_ID
    if (viewId.startsWith('win_')) {
      diagramId = windowDiagramId(viewId)
    } else {
      const body = bodyViews.value.find((v) => v.id === viewId)
      if (body) diagramId = bodyViewTop(body).projectDiagramId
    }
    renderer.applySimOverlay(live ? simSnapshotForDiagram(diagramId) : undefined)
  })
}

const bindWindowDiagramRef = (windowId: string, el: unknown) => {
  bindDiagramViewRef(windowId, el)
  if (el) applySimOverlayToAllRenderers()
}

watch(
  () =>
    [simSnapshotRef.value, simSnapshotsByDiagram.value, showSimCard.value, simActive.value] as const,
  () => {
    // Sync: Play publishes from rAF; deferred overlay raced and skipped frames.
    // Empty nodeDelta early-return then left badges stuck until Step.
    try {
      applySimOverlayToAllRenderers()
    } catch (err) {
      console.warn('Sim overlay apply failed', err)
    }
  },
  { flush: 'sync' }
)

const toolsPanelRef = ref<InstanceType<typeof ToolsPanel> | null>(null)
registerAllToolRunners()
registerAppCommands()

const {
  sidebarWidth,
  sidebarVisible,
  sidebarResizing,
  sidebarStyle,
  sidebarElRef,
  sidebarCardsElRef,
  graphInfoPanelCollapsed,
  graphInfoPanelHeight,
  simPanelCollapsed,
  simPanelHeight,
  toolsPanelCollapsed,
  toolsPanelHeight,
  detailsPanelCollapsed,
  detailsPanelHeight,
  sidebarFillPanelId,
  sidebarPanelMaxHeights,
  onSidebarResizeStart,
  onWindowResize,
  dispose: disposeSidebarLayout,
} = useSidebarLayout({
  getContainerWidth: () => graphContainer.value?.clientWidth ?? window.innerWidth,
  visibility: () => ({
    graphInfo: showGraphInfoCard.value,
    sim: showSimCard.value,
    tools: hasProject.value && (focusedTool.value != null || toolManager.getActiveToolIds().length > 0),
    details: hasProject.value,
  }),
  chromeBarVisible: () => currentView.value.kind !== 'main',
  fillSinglePanel: () => selectedNodeRef.value != null,
})
void activeToolsRegistry

const PRESENT_SIDEBAR_GAP = 12
const bodyPresentRightInset = computed(
  () =>
    sidebarVisible.value
      ? sidebarWidth.value + SIDEBAR_EDGE_OFFSET + PRESENT_SIDEBAR_GAP
      : 16
)

const nodeDetailsSections = reactive<Record<NodeDetailsSection, boolean>>({
  general: true,
  transform: false,
  connections: false,
  typeDetails: true,
})

const toggleNodeDetailsSection = (section: NodeDetailsSection) => {
  nodeDetailsSections[section] = !nodeDetailsSections[section]
}

const selectedNodeConnectionCount = computed(() => {
  if (!selectedNodeConnectionsComputed.value) return 0
  return selectedNodeConnectionsComputed.value.incoming.length + selectedNodeConnectionsComputed.value.outgoing.length
})

const nodeDetailsTitle = computed(() => {
  if (selectedNodeIdsRef.value.length > 1) {
    return `Node Details · ${selectedNodeIdsRef.value.length} nodes`
  }
  return selectedNodeRef.value ? `Node Details · ${selectedNodeRef.value.id}` : 'Node Details'
})

const sidebarGraphViewChrome = computed(() => {
  const body = activeBodyView.value
  const top = currentView.value
  if (top.kind === 'main') return null
  return {
    bodyId: body.id,
    closable: body.closable,
    view: top,
    preview: body.preview,
    closeLabel: body.closable ? 'Close' : '← Back',
  }
})

const onSidebarGraphViewChromeClose = () => {
  const chrome = sidebarGraphViewChrome.value
  if (!chrome) return
  if (chrome.closable) closeBodyView(chrome.bodyId)
  else popEntry(chrome.bodyId)
}

const onSidebarGraphViewChromeAction = (actionId: string) => {
  const chrome = sidebarGraphViewChrome.value
  if (!chrome) return
  onBodyViewAction(chrome.bodyId, actionId)
}

const onSidebarGraphViewChromePin = () => {
  const chrome = sidebarGraphViewChrome.value
  if (chrome?.closable) pinBodyView(chrome.bodyId)
}

const connectionsEditMode = ref(false)

const resolveSelectInputsNewCount = (recursive: boolean) => {
  const data = getActiveRenderData()
  if (!data || selectedNodeIdsRef.value.length === 0) return 0
  const selectedSet = new Set(selectedNodeIdsRef.value)
  const inputIds = collectInputNodeIds(selectedNodeIdsRef.value, data.connections, recursive)
  return inputIds.filter((id) => !selectedSet.has(id)).length
}

const onToolsAddNode = (payload: { id: string; type: string; slotName?: string }) => {
  if (!whenEnabled('graphEditable')) return
  {
    const result = addNewNode(requireActiveDiagramId(), payload.id, payload.type, payload.slotName)
    if (!result.ok) {
      if (result.message) alert(result.message)
      else alert(formatAddNodeDenial(result.reasons, { diagramNodeType: result.diagramNodeType }))
    }
  }
}

const onToolsCreateConnection = (payload: {
  fromId: string
  toId: string
  pinName: string
}) => {
  if (!whenEnabled('graphEditable')) return
  const result = createConnection(
    requireActiveDiagramId(),
    payload.fromId,
    payload.toId,
    payload.pinName
  )
  if (!result.ok && result.message) alert(result.message)
}

const onToolsArrangeInputsToggle = (key: string, checked: boolean) => {
  if (checked) selectedIncomingConnectionsRef.value.add(key)
  else selectedIncomingConnectionsRef.value.delete(key)
}

const onToolsArrangeInputs = (payload: { margin: number; spacing: number }) => {
  if (!whenEnabled('graphEditable')) return
  moveInputNodesOnly(requireActiveDiagramId(), payload.margin, payload.spacing)
}

const onToolsSelectInputsAdd = (recursive: boolean) => {
  if (!whenEnabled('graphEditable')) return
  addInputNodesToSelection(recursive)
}

const onToolsArrangeSelection = async (payload: {
  algorithm: ArrangeSelectionAlgorithm
  layeredVariant: ElkLayeredVariant
  nodeNodeSpacing: number
  layerSpacing: number
  forceIterations: number
}) => {
  if (!whenEnabled('graphEditable')) return
  await arrangeSelectedNodesWithElk(requireActiveDiagramId(), payload)
}

const onToolsAttachDataFromSelected = () => {
  if (!whenEnabled('graphEditable')) return
  attachHandleAction.value?.dataFromSelected()
}

const onToolsAttachRun = () => {
  if (!whenEnabled('graphEditable')) return
  attachHandleAction.value?.run()
}

const updateGraphInteractionGate = () => {
  const gate = () => {
    if (!diagramHotkeyFocus.value) return false
    if (moveToolState.session || resizeToolState.session) return false
    if (suppressNextGraphInteraction.value) {
      suppressNextGraphInteraction.value = false
      return false
    }
    return true
  }
  graphRenderer.value?.setInteractionGate(gate)
  const active = getActiveDiagramRenderer()
  const allowPinDrag = !isStateLinksRootViewFocused()
  graphRenderer.value?.setAllowPinDrag(allowPinDrag)
  if (active && active !== graphRenderer.value) {
    active.setInteractionGate(gate)
    active.setAllowPinDrag(allowPinDrag)
  }
}

watch(diagramHotkeyFocus, () => {
  updateGraphInteractionGate()
})

watch(windowStackRevision, () => {
  updateGraphInteractionGate()
})

watch(
  () =>
    windows.value
      .map((w) => `${w.id}:${w.minimized ? 1 : 0}`)
      .join('|'),
  () => {
    const surface = focusedDiagramSurface.value
    if (surface?.kind !== 'window') return
    const win = windows.value.find((w) => w.id === surface.windowId)
    if (!win || win.minimized) focusedDiagramSurface.value = null
  }
)

const tooltip = reactive({
  show: false,
  title: '',
  content: '',
  x: 0,
  y: 0
})

// Computed properties
const graphStats = computed(() => {
  const data = getRenderData(resolveMainDiagramId())
  if (!data) return { totalNodes: 0, nodeTypes: [] }

  const nodes = Array.from(data.allNodes.values()) || []
  const nodeTypes = [...new Set(nodes.map((node) => node.type).filter(Boolean))]
  
  return {
    totalNodes: nodes.length,
    nodeTypes
  }
})

const tooltipStyle = computed(() => ({
  left: tooltip.x + 'px',
  top: tooltip.y + 'px'
}))

const selectedNodeOpenScopeTitle = computed(() => {
  if (!selectedNodeRef.value) return 'Open children view'
  if (isStateMachineDiagramRoot(selectedNodeRef.value)) {
    return 'Open SM children view'
  }
  if (isStateOverviewLeaf(selectedNodeRef.value)) {
    return 'Open State children view'
  }
  if (selectedNodeRef.value.type === DIAGRAM_TRANSITION_WRAPPER_TYPE) {
    return 'Open transition view'
  }
  if (selectedNodeRef.value.type === DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE) {
    return 'Open conditional entry view'
  }
  return 'Open children view'
})

const canOpenStateAppliedLinks = computed(() => {
  const node = selectedNodeRef.value
  const data = getActiveRenderData()
  if (!node || !data) return false
  if (!isStateOverviewLeaf(node) && node.type !== 'animAnimNode_State') return false
  return resolveLiveStateIndex(data, node) !== null
})

const openStateAppliedLinksFromSelection = () => {
  const data = getActiveRenderData()
  if (!selectedNodeRef.value || !data || !canOpenStateAppliedLinks.value) return
  const node = selectedNodeRef.value
  const smInfo = resolveStateMachineInfoNode(node, data.allNodes)
  const stateIndex = resolveLiveStateIndex(data, node)
  const label =
    stateIndex !== null
      ? `State ${node.id} [${stateIndex}] · links`
      : `${node.id} · links`

  openStateLinksWindow({
    stateNodeId: node.id,
    rootLabel: label,
    stateMachineNodeId: smInfo?.id,
    projectDiagramId: requireActiveDiagramId(),
  }, {
    preview: true,
  })
}

const selectedStateMachineRing = computed(() => {
  const sm = selectedStateMachineInfo.value
  const data = getActiveRenderData()
  if (!sm || !data) return null
  return buildStateMachineRingPresentation(sm, data)
})

const simRingHighlightFor = (smNodeId: string | undefined | null) => {
  const data = getActiveRenderData()
  if (!showSimCard.value || !smNodeId || !data) return null
  const node = data.allNodes.get(smNodeId)
  const handleId =
    (node?.data?.originalNodeId as string | undefined) ??
    smNodeId
  const st = simSnapshotRef.value.sms[handleId]
  if (!st) return null
  const handles = data.handlesRegistry
  const eligibleEdges = new Set<string>()
  for (const tid of st.eligibleTransitionIds) {
    const t = handles.get(tid)
    const to = Number(t?.Data?.targetStateIndex)
    if (Number.isFinite(to) && to >= 0) {
      eligibleEdges.add(`${st.activeStateIndex}->${to}`)
    }
  }
  const firingTo =
    st.isInTransition && st.targetStateIndex != null
      ? st.targetStateIndex
      : null
  return {
    activeStateIndex: st.activeStateIndex,
    targetStateIndex: firingTo,
    transitionProgress: st.isInTransition ? st.transitionProgress : undefined,
    firingEdge: firingTo != null ? `${st.activeStateIndex}->${firingTo}` : null,
    eligibleEdges,
  }
}

// Methods
const toggleGraphInfoCard = () => {
  showGraphInfoCard.value = !showGraphInfoCard.value
}

const toggleSimCard = () => {
  showSimCard.value = !showSimCard.value
  if (!showSimCard.value) {
    simDeactivate()
    applySimOverlayToAllRenderers()
  }
}

// Node selection methods
const collectInputNodeIds = (
  seedIds: Iterable<string>,
  connections: DiagramConnection[],
  recursive: boolean
): string[] => {
  const collected = new Set<string>()
  let frontier = new Set(seedIds)
  const expanded = new Set<string>()

  while (frontier.size > 0) {
    const nextFrontier = new Set<string>()
    for (const nodeId of frontier) {
      if (expanded.has(nodeId)) continue
      expanded.add(nodeId)

      for (const conn of connections) {
        if (conn.to !== nodeId) continue
        collected.add(conn.from)
        if (recursive && !expanded.has(conn.from)) {
          nextFrontier.add(conn.from)
        }
      }
    }
    frontier = nextFrontier
  }

  return [...collected]
}

const addInputNodesToSelection = (recursive = false) => {
  const active = getActiveDiagramRenderer()
  const data = getActiveRenderData()
  if (!data || !active || selectedNodeIdsRef.value.length === 0) return

  const merged = new Set(selectedNodeIdsRef.value)
  for (const id of collectInputNodeIds(
    selectedNodeIdsRef.value,
    data.connections,
    recursive
  )) {
    merged.add(id)
  }

  const mergedIds = [...merged]
  const primaryId = selectedNodeRef.value?.id && merged.has(selectedNodeRef.value.id)
    ? selectedNodeRef.value.id
    : mergedIds[0] ?? null

  active.setSelectedNodes(mergedIds, primaryId)
  setViewSelection(currentView.value.id, { nodeIds: mergedIds, primaryNodeId: primaryId })
}

const panToSelectedNode = () => {
  if (selectedNodeRef.value) {
    void navigateToNode(requireActiveDiagramId(), selectedNodeRef.value.id)
  }
}

const logSelectedNodeData = () => {
  if (selectedNodeRef.value) {
    console.log(`Node ${selectedNodeRef.value.id} data:`, selectedNodeRef.value)
  } else {
    console.warn(`Node not selected`)
  }
}

const panToConnectedNode = (connection: DiagramConnection, isIncoming: boolean) => {
  const targetNodeId = isIncoming ? connection.from : connection.to
  void navigateToNode(requireActiveDiagramId(), targetNodeId)
}

// Connection selection methods
const selectAllIncomingConnections = () => {
  if (selectedNodeConnectionsComputed.value) {
    selectedNodeConnectionsComputed.value.incoming.forEach(conn => {
      selectedIncomingConnectionsRef.value.add(getConnectionKey(conn))
    })
  }
}

const deselectAllIncomingConnections = () => {
  selectedIncomingConnectionsRef.value.clear()
}

// Node description methods
const onDescriptionChange = () => {
  // Optional: Add real-time validation or formatting here
}

const saveNodeDescription = () => {
  if (!selectedNodeRef.value || !nodeDescriptionRef.value.trim()) return

  const nodeId = selectedNodeRef.value.id
  const before = selectedNodeRef.value.description || ''
  const after = nodeDescriptionRef.value.trim()

  selectedNodeRef.value.description = after
  const diagramId = requireActiveDiagramId()
  const data = getRenderData(diagramId)
  const node = data?.allNodes.get(nodeId)
  if (node && data) {
    applyDiagramNodeDescription(node, after, data)
    if (selectedNodeRef.value !== node) {
      selectedNodeRef.value.description = after
      if (node.size) {
        selectedNodeRef.value.size = { ...node.size }
        nodeSizeRef.value = { ...node.size }
      }
    }
  }

  updateActiveNodes([nodeId], { contentChangedIds: new Set([nodeId]) })
  pushDescriptionHistory(diagramId, nodeId, before, after)
}

const saveNodeText = (text: string) => {
  if (!selectedNodeRef.value) return
  const nodeId = selectedNodeRef.value.id
  const before = readDiagramNoteText(selectedNodeRef.value)
  const after = text
  if (before === after) return

  const applyText = (value: string) => {
    const diagramId = requireActiveDiagramId()
    const diagramData = getRenderData(diagramId)
    if (!diagramData) return

    const node = diagramData.allNodes.get(nodeId)
    if (!node) return

    applyDiagramNoteText(diagramData, node, value)
    if (selectedNodeRef.value?.id === nodeId) {
      selectedNodeRef.value.metadata = { ...selectedNodeRef.value.metadata, text: value }
      if (node.size) {
        selectedNodeRef.value.size = { ...node.size }
        nodeSizeRef.value = { ...node.size }
      }
    }
    updateActiveNodes([nodeId], { contentChangedIds: new Set([nodeId]) })
  }

  applyText(after)
  if (graphHistoryState.isApplying) return
  graphHistory.push({
    label: 'Edit note text',
    undo: () => {
      graphHistoryState.isApplying = true
      try {
        applyText(before)
      } finally {
        graphHistoryState.isApplying = false
      }
    },
    redo: () => {
      graphHistoryState.isApplying = true
      try {
        applyText(after)
      } finally {
        graphHistoryState.isApplying = false
      }
    },
  })
}

const saveNodeLabel = (label: string) => {
  if (!selectedNodeRef.value) return
  const nodeId = selectedNodeRef.value.id
  const before = readDiagramGroupLabel(selectedNodeRef.value)
  const after = label
  if (before === after) return

  const applyLabel = (value: string) => {
    const node = getActiveRenderData()?.allNodes.get(nodeId)
    if (!node) return
    node.metadata = { ...node.metadata, label: value }
    if (selectedNodeRef.value?.id === nodeId) {
      selectedNodeRef.value.metadata = { ...selectedNodeRef.value.metadata, label: value }
    }
    updateActiveNodes([nodeId], { contentChangedIds: new Set([nodeId]) })
  }

  applyLabel(after)
  if (graphHistoryState.isApplying) return
  graphHistory.push({
    label: 'Edit group label',
    undo: () => {
      graphHistoryState.isApplying = true
      try {
        applyLabel(before)
      } finally {
        graphHistoryState.isApplying = false
      }
    },
    redo: () => {
      graphHistoryState.isApplying = true
      try {
        applyLabel(after)
      } finally {
        graphHistoryState.isApplying = false
      }
    },
  })
}

// Update connection settings
const applyConnectionSettingsToRenderer = (renderer: PixiGraphRenderer | null | undefined) => {
  if (!renderer) return
  renderer.setHighlightSelectedNodeConnections(connectionSettings.highlightSelectedNodeConnections)
  renderer.setSelectedNodeConnectionColor(connectionSettings.selectedNodeConnectionColor)
  renderer.setSelectedNodeConnectionOverlayAmount(connectionSettings.selectedNodeConnectionOverlayAmount)
  renderer.setSelectedNodeConnectionOpacity(connectionSettings.selectedNodeConnectionOpacity)
  renderer.setSelectedNodeConnectionWidth(connectionSettings.selectedNodeConnectionWidth)
}

const updateConnectionSettings = () => {
  forEachDiagramViewRenderer((renderer) => {
    applyConnectionSettingsToRenderer(renderer)
  })
}

const onConnectionSettingsFromWindow = (value: {
  highlightSelectedNodeConnections: boolean
  selectedNodeConnectionColor: string
  selectedNodeConnectionOverlayAmount: number
  selectedNodeConnectionWidth: number
  selectedNodeConnectionOpacity: number
}) => {
  Object.assign(connectionSettings, value)
  updateConnectionSettings()
}

const onGridSettingsFromWindow = (value: DiagramGridSettings) => {
  Object.assign(gridSettings, setDiagramGridSettings(value))
}

// Update debug settings
const updateDebugSettings = () => {
  forEachDiagramViewRenderer((renderer) => {
    renderer.setShowDebugTiles(debugTiles.value)
    renderer.setShowDebugLayoutContainers?.(debugLayoutContainers.value)
    renderer.setDebugTextLodCacheScreenPx(textLodCacheScreenPx.value)
  })
}

const onDebugTilesFromWindow = (value: boolean) => {
  debugTiles.value = value
  updateDebugSettings()
}

const onDebugLayoutContainersFromWindow = (value: boolean) => {
  debugLayoutContainers.value = value
  updateDebugSettings()
}

const onDebugModeFromWindow = (value: boolean) => {
  debugMode.value = value
}

const onTextLodCacheScreenPxFromWindow = (value: number | null) => {
  textLodCacheScreenPx.value = value
  updateDebugSettings()
}

// Node size management
const updateNodeSize = () => {
  const data = getActiveRenderData()
  if (!selectedNodeRef.value || !data) return

  trackLayoutBeforeChange(selectedNodeRef.value)
  applyDiagramNodeSize(selectedNodeRef.value, nodeSizeRef.value)

  if (data.allNodes.has(selectedNodeRef.value.id)) {
    const nodeInMap = data.allNodes.get(selectedNodeRef.value.id)
    if (nodeInMap && nodeInMap !== selectedNodeRef.value) {
      applyDiagramNodeSize(nodeInMap, nodeSizeRef.value)
    }
  }
}

const applyNodeSize = () => {
  if (!selectedNodeRef.value || !getActiveRenderData()) return

  const diagramId = requireActiveDiagramId()
  runWithLayoutHistory(diagramId, 'Resize node', () => {
    const originalSize = {
      width: selectedNodeRef.value!.size.width,
      height: selectedNodeRef.value!.size.height,
    }

    const delta: ResizeLayoutDelta = {
      dx: 0,
      dy: 0,
      dw: nodeSizeRef.value.width - originalSize.width,
      dh: nodeSizeRef.value.height - originalSize.height,
    }

    const affectedNodeIds = new Set<string>()
    affectedNodeIds.add(selectedNodeRef.value!.id)

    const cascadeBaselines = captureResizeCascadeBaselines(getRenderData(diagramId)!, [
      selectedNodeRef.value!.id,
    ])

    updateNodeSize()

    applyResizeParentCascade(
      getRenderData(diagramId)!,
      selectedNodeRef.value!,
      delta,
      cascadeBaselines,
      {
        growParents: autoResizeParents.value,
        moveParentNeighbours: false,
        onBeforeLayoutMutate: trackLayoutBeforeChange,
      }
    ).forEach((id) => affectedNodeIds.add(id))

    selectedNodeRef.value!.size.width = nodeSizeRef.value.width
    selectedNodeRef.value!.size.height = nodeSizeRef.value.height

    if (affectedNodeIds.size > 0) {
      updateActiveNodes(Array.from(affectedNodeIds))
    }
  })
}

const applyNodePosition = () => {
  if (!selectedNodeRef.value || !getActiveRenderData()) return
  
  const originalPosition = {
    x: selectedNodeRef.value.position.x,
    y: selectedNodeRef.value.position.y
  }
  
  const positionDelta = {
    x: nodePositionRef.value.x - originalPosition.x,
    y: nodePositionRef.value.y - originalPosition.y
  }
  
  // Use the existing moveSelectedNodeByDelta function
  // This will automatically update nodePosition.value to match the actual position
  moveSelectedNodeByDelta(requireActiveDiagramId(), positionDelta.x, positionDelta.y)
}

// Setup canvas controls (zoom, pan)
const setupCanvasControls = (_canvas: HTMLDivElement, _renderer: PixiGraphRenderer) => {
  // PixiGraphRenderer handles pan, zoom, and node selection on its canvas
}

bindMoveResizeSession({
  graphCanvas,
  updateGraphInteractionGate,
})

// Keyboard shortcuts — bindings are data; handlers live in commands/handlers.ts
const ARROW_MOVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

const handleKeydown = (event: KeyboardEvent) => {
  const ctx = buildAppContext({
    event,
    diagramHostFocused: diagramHotkeyFocus.value,
    diagramEditable: hasProject.value && !isStateLinksRootContext(),
    focusedTool: focusedTool.value ?? '',
    activeToolCount: toolManager.getActiveToolIds().length,
    inProgressTool: liveInProgressTool(),
    hasSelection: selectedNodeIdsRef.value.length > 0,
    hasGraph: hasProject.value,
  })
  hotkeyRegistry.handleKeydown(event, ctx)
}

const handleKeyup = (event: KeyboardEvent) => {
  if (!ARROW_MOVE_KEYS.has(event.key)) return
  if (moveToolState.session) {
    pressedArrowKeys.delete(event.key)
    return
  }
  pressedArrowKeys.delete(event.key)
  if (pressedArrowKeys.size === 0) {
    try {
      const diagramId = requireActiveDiagramId()
      commitPositionCapture(diagramId)
      commitLayoutCapture(diagramId)
    } catch {
      /* no active diagram */
    }
  }
}

installGraphHistoryRuntime({
  flushModalToolSessions: () => {
    if (moveToolState.session) {
      cancelGrabMove()
      return true
    }
    if (resizeToolState.session) {
      cancelResize()
      return true
    }
    return false
  },
})

setSelectionClearedHandler(() => {
  handleNodeSelect(null, [])
  getActiveDiagramRenderer()?.setSelectedNodes([], null, true)
})

const closeParallelBodiesScopedToDeleted = (deletedIds: ReadonlySet<string>) => {
  const toClose = parallelBodyViews.value
    .filter((body) => {
      const top = bodyViewTop(body)
      const scopeRootId =
        top.kind === 'graph-scope' ? top.payload.scopeRootId : undefined
      return typeof scopeRootId === 'string' && deletedIds.has(scopeRootId)
    })
    .map((body) => body.id)
  for (const id of toClose) closeBodyView(id)
}


bindGraphMutations({
  closeParallelBodiesScopedToDeleted,
})

const confirmDeleteConnection = (conn: DiagramConnection) => {
  if (!connectionsEditMode.value) return

  const connectionInfo = conn.pinName ? `${conn.from} → ${conn.to} (${conn.pinName})` : `${conn.from} → ${conn.to}`
  
  if (confirm(`Are you sure you want to delete this connection?\n\n${connectionInfo}\n\nYou can undo this action (Ctrl+Z).`)) {
    deleteConnection(requireActiveDiagramId(), conn)
  }
}

setupNodeDetailsContext({
  selectedNode: selectedNodeRef,
  nodeDescription: nodeDescriptionRef,
  onDescriptionChange,
  saveNodeDescription,
  saveNodeText,
  saveNodeLabel,
  logSelectedNodeData,
  nodeDetailsSections,
  toggleNodeDetailsSection,
  selectedNodeConnectionCount,
  nodePosition: nodePositionRef,
  applyNodePosition,
  selectedNodeConnectionsComputed,
  nodeSize: nodeSizeRef,
  applyNodeSize,
  panToConnectedNode,
  connectionsEditMode,
  confirmDeleteConnection,
  selectedStateMachineRing,
  openSmRingFromSelection,
  canOpenStateAppliedLinks,
  openStateAppliedLinksFromSelection,
  selectedHandleData,
  handleDataRevision,
  notifySelectedHandleDataChanged,
  snapshotHandleField,
  snapshotHandleFields,
  recordHandleFieldEdit: (key, before, options) =>
    recordHandleFieldEdit(requireActiveDiagramId(), key, before, options),
  recordHandleFieldsEdit: (keys, before) =>
    recordHandleFieldsEdit(requireActiveDiagramId(), keys, before),
  handlesRegistry: computed(() => getActiveRenderData()?.handlesRegistry ?? null),
  allNodes: computed(() => getActiveRenderData()?.allNodes ?? null),
  removePinArraySlot: (inputName, index) =>
    removePinArraySlot(requireActiveDiagramId(), inputName, index),
  reorderPinArraySlot: (inputName, index, delta) =>
    reorderPinArraySlot(requireActiveDiagramId(), inputName, index, delta),
  renamePinHandleId: (oldId, newId) =>
    renamePinHandleId(requireActiveDiagramId(), oldId, newId),
  moveSmStateToIndex: (stateId, toIndex) =>
    moveSmStateToIndex(requireActiveDiagramId(), stateId, toIndex),
  moveSelectedSmStateByDelta: (delta) => moveActiveSelectedSmStateByDelta(delta),
  canMoveSmStateUp,
  canMoveSmStateDown,
  canLayoutSmStatesGroup: canLayoutSmStatesGroupSelected,
  layoutSelectedSmStatesGroup: () => layoutSelectedSmStatesGroup(requireActiveDiagramId()),
})

bindGraphDocument({
  directChildrenLayoutMode,
  updateGraphInteractionGate,
  setupCanvasControls,
  updateDebugSettings,
  updateConnectionSettings,
  handleMainGraphNodeSelect,
  openLensForNode: (node, host) => openLensForNode(resolveMainDiagramId(), node, host),
  handlePinConnect: (payload) => handlePinConnect(resolveMainDiagramId(), payload),
  handlePinRewire: (payload) => handlePinRewire(resolveMainDiagramId(), payload),
  simReset,
  simRebind,
  getProjectSimResources: simGetProjectSimResources,
  applyProjectSimResources: simApplyProjectSimResources,
})
bindGraphNavigation({})

const animgraphEditorRef = {
  get graphData() { return getActiveRenderData() },
  get selectedNode() { return selectedNodeRef.value },
  get selectedNodeAnimgraphNode() {
    const selectedNodeValue = selectedNodeRef.value
    const data = getActiveRenderData()
    if (!data || !selectedNodeValue) return undefined
    return data.handlesRegistry.get(selectedNodeValue.data.originalNodeId ?? '')
  },
  get a() { return attachHandleAction.value },
  createAttachAnimgraphHandleAction() {
    return createAttachHandleAction(requireActiveDiagramId())
  },
  ensureSelectedNodeHandleChildrenOrder(childrenPropName: string) {
    const selectedNodeValue = selectedNodeRef.value
    if (!selectedNodeValue) return

    this.ensureHandleChildrenOrder(selectedNodeValue.data.originalNodeId ?? '', childrenPropName)
  },
  ensureHandleChildrenOrder(handle: AnimgraphNode | string, childrenPropName: string) {
    const data = getActiveRenderData()
    if (!data) return

    const _handle = typeof handle === 'string' ? data.handlesRegistry.get(handle) : handle
    if (!_handle) return

    const handleChildrenHandler = NodeDefinitionRegistry.getHandleTypeChildrenHandler(_handle.Data.$type, childrenPropName)
    if (handleChildrenHandler) {
      handleChildrenHandler.ensureOrder(data.handlesRegistry, _handle, childrenPropName)
    }
  }
}

watch(selectedNodeRef, (newVal) => {
  flushPendingHandleFieldEditImpl()
  if (typeof window !== 'undefined') {
    // @ts-ignore
    window.$n = newVal
    // @ts-ignore
    window.$nh = getActiveRenderData()?.handlesRegistry.get(newVal?.data.originalNodeId ?? '')
  }
})

// Lifecycle
onMounted(() => {
  // Add keyboard event listener
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('keyup', handleKeyup)
  document.addEventListener('pointermove', trackLastPointerClient, { passive: true })
  window.addEventListener('resize', onWindowResize)

  // @ts-ignore
  window.animgraphEditor = animgraphEditorRef
  // @ts-ignore
  window.$ae = animgraphEditorRef
})

// Cleanup
onUnmounted(() => {
  toolManager.deactivateAll()
  if (moveToolState.session) {
    cancelGrabMove()
  }
  if (resizeToolState.session) {
    cancelResize()
  }
  detachModalPointerListeners()
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('keyup', handleKeyup)
  document.removeEventListener('pointermove', trackLastPointerClient)
  window.removeEventListener('resize', onWindowResize)
  disposeSidebarLayout()
})
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1d1d1d;
}

.workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.app-windows-layer {
  position: absolute;
  inset: 0;
  bottom: 40px;
  pointer-events: none;
  /* Above body layers and sidebar — State Links stays interactive */
  z-index: 50;
}

.app-windows-layer > * {
  pointer-events: auto;
}

.app-window-stack-host {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.app-window-stack-host > :first-child {
  flex: 1;
  min-height: 0;
}

.app-window-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 4px;
  background: #2a3545;
  color: #c8d8e8;
  font-size: 14px;
  line-height: 1;
}

.app-window-toolbar-btn:hover:not(:disabled) {
  background: #3a4a60;
}

.app-window-toolbar-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.app-window-toolbar-btn--wide {
  width: auto;
  min-width: 24px;
  padding: 0 8px;
  font-size: 11px;
}

.header {
  background: #383838;
  border-bottom: 1px solid #1f1f1f;
  padding: 4px 10px;
  /* Electron frameless: empty header chrome drags; controls opt out. */
  -webkit-app-region: drag;
  app-region: drag;
}

.header :is(button, input, textarea, select, a, [role='menubar'], [role='menu'], .window-controls),
.header-node-search {
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.header-right {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
}

.header-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  color: #e6e6e6;
}

.header-brand-icon {
  display: block;
}

.header-canvas-focus {
  color: #8a8a8a;
}

.header-canvas-focus:hover {
  color: #b8b8b8;
}

.header-canvas-focus--on,
.header-canvas-focus--on:hover {
  color: #ffffff;
}

.main-content {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.graph-section {
  flex: 1;
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.graph-container {
  display: flex;
  flex: 1;
  position: relative;
  min-height: 0;
}

/* Graph view — full bleed of main body (no inset card) */
.graph-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: none;
  border-radius: 0;
  position: relative;
  outline: none;
  /* Trap internal z-index (body stack layers) so floating windows can sit above */
  z-index: 0;
  isolation: isolate;
}

.graph-canvas {
  width: 100%;
  height: 100%;
  cursor: grab;
  background: #1a1a1a;
  position: relative;
  overflow: hidden;
  outline: none;
}

.graph-view--focused {
  box-shadow: inset 0 0 0 2px rgba(0, 122, 204, 0.5);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  flex: 1;
  height: 100%;
  color: #b0b0c0;
  text-align: center;
}

/* Anchor welcome at the top of a centered max-height slot (560px), so height changes grow down. */
.empty-state::before {
  content: '';
  flex: 0 0 max(0px, calc((100% - min(560px, calc(100% - 32px))) / 2));
  width: 100%;
  pointer-events: none;
}

.loading-state {
  position: relative;
  flex: 1;
  height: 100%;
  min-height: 0;
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: #303030;
  border: 1px solid #1f1f1f;
  border-radius: var(--radius-md);
  min-width: 400px;
  max-width: 600px;
  max-height: 80vh;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}

.dialog-header {
  padding: 8px 12px;
  border-bottom: 1px solid #1f1f1f;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #383838;
}

.dialog-header h3 {
  margin: 0;
  color: #e6e6e6;
  font-size: 13px;
  font-weight: 600;
}

.dialog-close {
  color: #999;
}

.dialog-close:hover {
  color: #e6e6e6;
}

.dialog-body {
  padding: 12px;
  max-height: 60vh;
  overflow-y: auto;
  background: #303030;
  color: #e6e6e6;
}

.dialog-footer {
  padding: 8px 12px;
  border-top: 1px solid #1f1f1f;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  background: #383838;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #ccc;
  font-weight: 500;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #fff;
  font-size: 14px;
}

.form-input:focus {
  outline: none;
  border-color: #4772b3;
  box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
}

@media (max-width: 768px) {
  .dialog {
    min-width: 90vw;
    margin: 20px;
  }
}
</style>
