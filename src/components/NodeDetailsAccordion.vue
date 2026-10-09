<template>
  <div class="details-tabs">
    <TabsContent
      v-if="typeDetailsPanel"
      value="typeDetails"
      class="mt-0 data-[state=inactive]:hidden"
    >
      <component
        :is="typeDetailsPanel.component"
        :key="selectedNode?.id ?? typeDetailsPanel.title"
      />
    </TabsContent>

    <TabsContent value="general" class="mt-0 data-[state=inactive]:hidden">
      <FieldGroup class="gap-3">
        <PropertyReadonlyRow label="Node ID" :value="selectedNode!.id" copyable />
        <PropertyReadonlyRow label="Type" :value="selectedNode!.type" copyable />

        <Field class="gap-1.5">
          <FieldLabel for="node-description" class="text-xs">
            Description
          </FieldLabel>
          <Textarea
            id="node-description"
            v-model="nodeDescription"
            placeholder="Add a description for this node..."
            class="min-h-[4.5rem] text-xs"
            rows="3"
            @input="onDescriptionChange"
          />
          <Button
            size="sm"
            class="w-full"
            :disabled="!nodeDescription.trim()"
            @click="saveNodeDescription"
          >
            Save Description
          </Button>
        </Field>

        <Button
          v-if="isViteDev"
          size="sm"
          variant="secondary"
          class="w-full"
          @click="logSelectedNodeData"
        >
          Log Node Data
        </Button>
      </FieldGroup>
    </TabsContent>

    <TabsContent value="transform" class="mt-0 data-[state=inactive]:hidden">
      <FieldGroup class="gap-2">
        <PropertyNumberControl
          label="Pos X"
          :model-value="nodePosition.x"
          @update:model-value="onPosX"
        />
        <PropertyNumberControl
          label="Pos Y"
          :model-value="nodePosition.y"
          @update:model-value="onPosY"
        />
        <PropertyNumberControl
          label="Width"
          :model-value="nodeSize.width"
          :value-min="50"
          @update:model-value="onWidth"
        />
        <PropertyNumberControl
          label="Height"
          :model-value="nodeSize.height"
          :value-min="30"
          @update:model-value="onHeight"
        />
      </FieldGroup>
    </TabsContent>

    <TabsContent value="connections" class="mt-0 data-[state=inactive]:hidden">
      <FieldGroup class="gap-3">
        <Field orientation="horizontal" class="items-center gap-2">
          <Checkbox
            id="connections-edit-mode"
            v-model="connectionsEditMode"
          />
          <FieldLabel for="connections-edit-mode" class="text-xs font-normal">
            Edit
          </FieldLabel>
        </Field>

        <div class="prop-list">
          <div class="prop-list__head">
            <span>Incoming</span>
          </div>
          <div v-if="incomingConnections.length === 0" class="prop-list__empty">none</div>
          <div
            v-for="(conn, index) in incomingConnections"
            :key="`in-${getConnectionKey(conn)}`"
            class="prop-list__row"
          >
            <span
              class="prop-list__index"
              :style="{ minWidth: `${incomingIndexCh}ch` }"
            >{{ index }}</span>
            <span class="prop-list__label" :title="conn.from">{{ conn.from }}</span>
            <span class="prop-list__pin">{{ conn.pinName || '—' }}</span>
            <div class="prop-list__actions">
              <button
                type="button"
                class="prop-list__icon-btn"
                title="Go to source"
                aria-label="Go to source"
                @click="panToConnectedNode(conn, true)"
              >
                <ArrowRightIcon :size="12" />
              </button>
              <button
                v-if="connectionsEditMode"
                type="button"
                class="prop-list__icon-btn prop-list__icon-btn--danger"
                title="Delete connection"
                aria-label="Delete connection"
                @click="confirmDeleteConnection(conn)"
              >
                <TrashIcon :size="12" />
              </button>
            </div>
          </div>
        </div>

        <div class="prop-list">
          <div class="prop-list__head">
            <span>Outgoing</span>
          </div>
          <div v-if="outgoingConnections.length === 0" class="prop-list__empty">none</div>
          <div
            v-for="(conn, index) in outgoingConnections"
            :key="`out-${getConnectionKey(conn)}`"
            class="prop-list__row"
          >
            <span
              class="prop-list__index"
              :style="{ minWidth: `${outgoingIndexCh}ch` }"
            >{{ index }}</span>
            <span class="prop-list__label" :title="conn.to">{{ conn.to }}</span>
            <span class="prop-list__pin">{{ conn.pinName || '—' }}</span>
            <div class="prop-list__actions">
              <button
                type="button"
                class="prop-list__icon-btn"
                title="Go to target"
                aria-label="Go to target"
                @click="panToConnectedNode(conn, false)"
              >
                <ArrowRightIcon :size="12" />
              </button>
              <button
                v-if="connectionsEditMode"
                type="button"
                class="prop-list__icon-btn prop-list__icon-btn--danger"
                title="Delete connection"
                aria-label="Delete connection"
                @click="confirmDeleteConnection(conn)"
              >
                <TrashIcon :size="12" />
              </button>
            </div>
          </div>
        </div>
      </FieldGroup>
    </TabsContent>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { ArrowRightIcon, TrashIcon } from 'lucide-vue-next'
import {
  PropertyNumberControl,
  PropertyReadonlyRow,
  resolveDiagramDetailsPanel,
} from './nodeDetails'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { NodeDetailsContext } from '../composables/useNodeDetailsContext'
import { nodeDetailsContextKey } from '../composables/useNodeDetailsContext'
import { getConnectionKey } from '../utils/graph/diagramModel'

const {
  selectedNode,
  nodeDescription,
  onDescriptionChange,
  saveNodeDescription,
  logSelectedNodeData,
  nodePosition,
  applyNodePosition,
  selectedNodeConnectionsComputed,
  nodeSize,
  applyNodeSize,
  panToConnectedNode,
  connectionsEditMode,
  confirmDeleteConnection,
} = inject<NodeDetailsContext>(nodeDetailsContextKey)!

const isViteDev = import.meta.env.DEV

const typeDetailsPanel = computed(() =>
  resolveDiagramDetailsPanel(selectedNode.value?.type)
)

const onPosX = (v: number) => {
  if (v === nodePosition.value.x) return
  nodePosition.value.x = v
  applyNodePosition()
}

const onPosY = (v: number) => {
  if (v === nodePosition.value.y) return
  nodePosition.value.y = v
  applyNodePosition()
}

const onWidth = (v: number) => {
  if (v === nodeSize.value.width) return
  nodeSize.value.width = v
  applyNodeSize()
}

const onHeight = (v: number) => {
  if (v === nodeSize.value.height) return
  nodeSize.value.height = v
  applyNodeSize()
}

const incomingConnections = computed(
  () => selectedNodeConnectionsComputed.value?.incoming ?? []
)
const outgoingConnections = computed(
  () => selectedNodeConnectionsComputed.value?.outgoing ?? []
)

const incomingIndexCh = computed(() =>
  String(Math.max(0, incomingConnections.value.length - 1)).length
)
const outgoingIndexCh = computed(() =>
  String(Math.max(0, outgoingConnections.value.length - 1)).length
)
</script>

<style scoped>
.details-tabs {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
</style>
