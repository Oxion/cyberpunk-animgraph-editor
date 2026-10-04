<template>
  <div class="details-accordion">
    <section
      v-if="typeDetailsPanel"
      class="details-accordion__section"
      :class="{ 'details-accordion__section--open': nodeDetailsSections.typeDetails }"
    >
      <button
        type="button"
        class="details-accordion__header"
        @click="toggleNodeDetailsSection('typeDetails')"
      >
        <span>{{ typeDetailsPanel.title }}</span>
        <ChevronDownIcon class="details-accordion__chevron" :size="14" />
      </button>
      <div v-show="nodeDetailsSections.typeDetails" class="details-accordion__body">
        <component
          :is="typeDetailsPanel.component"
          :key="selectedNode?.id ?? typeDetailsPanel.title"
        />
      </div>
    </section>

    <section
      class="details-accordion__section"
      :class="{ 'details-accordion__section--open': nodeDetailsSections.general }"
    >
      <button type="button" class="details-accordion__header" @click="toggleNodeDetailsSection('general')">
        <span>General</span>
        <ChevronDownIcon class="details-accordion__chevron" :size="14" />
      </button>
      <div v-show="nodeDetailsSections.general" class="details-accordion__body">
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
      </div>
    </section>

    <section
      class="details-accordion__section"
      :class="{ 'details-accordion__section--open': nodeDetailsSections.transform }"
    >
      <button type="button" class="details-accordion__header" @click="toggleNodeDetailsSection('transform')">
        <span>Transform</span>
        <ChevronDownIcon class="details-accordion__chevron" :size="14" />
      </button>
      <div v-show="nodeDetailsSections.transform" class="details-accordion__body">
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
      </div>
    </section>

    <section
      class="details-accordion__section"
      :class="{ 'details-accordion__section--open': nodeDetailsSections.connections }"
    >
      <button type="button" class="details-accordion__header" @click="toggleNodeDetailsSection('connections')">
        <span>
          Connections
          <span v-if="selectedNodeConnectionCount > 0" class="details-accordion__badge">{{ selectedNodeConnectionCount }}</span>
        </span>
        <ChevronDownIcon class="details-accordion__chevron" :size="14" />
      </button>
      <div v-show="nodeDetailsSections.connections" class="details-accordion__body">
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
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { ArrowRightIcon, ChevronDownIcon, TrashIcon } from 'lucide-vue-next'
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
  nodeDetailsSections,
  toggleNodeDetailsSection,
  selectedNodeConnectionCount,
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
.details-accordion {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.details-accordion__section {
  border: 1px solid #1f1f1f;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: #303030;
}

.details-accordion__header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  background: #383838;
  border: none;
  color: #e6e6e6;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

.details-accordion__header:hover {
  background: #3e3e3e;
  color: #fff;
}

.details-accordion__section--open .details-accordion__header {
  border-bottom: 1px solid #1f1f1f;
  color: #e6e6e6;
}

.details-accordion__chevron {
  flex-shrink: 0;
  opacity: 0.7;
  transition: transform 0.2s ease;
}

.details-accordion__section--open .details-accordion__chevron {
  transform: rotate(180deg);
}

.details-accordion__body {
  padding: 10px 12px;
}

.details-accordion__badge {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--muted);
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 500;
}
</style>
