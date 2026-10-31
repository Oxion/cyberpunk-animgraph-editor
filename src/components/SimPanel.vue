<template>
  <div class="flex h-full min-h-0 flex-1 flex-col gap-2 text-xs text-foreground">
    <div class="flex shrink-0 flex-wrap items-center gap-1.5">
      <template v-if="animgraphSimLiveBridgeActiveComputed">
        <span
          class="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
          :title="liveBridgeStatusTitleComputed"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            :class="liveBridgeStatusDiscClassComputed"
            aria-hidden="true"
          />
          {{ liveBridgeStatusLabelComputed }}
        </span>
      </template>
      <template v-else>
        <Button
          type="button"
          size="sm"
          :variant="simPlayingRef ? 'default' : 'secondary'"
          class="h-7 rounded-sm px-2.5 text-xs"
          :aria-pressed="simPlayingRef"
          @click="sim.toggle"
        >
          {{ simPlayingRef ? 'Pause' : 'Play' }}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          class="h-7 rounded-sm px-2.5 text-xs"
          @click="sim.step"
        >
          Step
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          class="h-7 rounded-sm px-2.5 text-xs"
          @click="sim.reset"
        >
          Reset
        </Button>
      </template>
      <div class="ml-auto flex shrink-0 items-center gap-1">
        <Button
          type="button"
          size="sm"
          :variant="simActiveRef || animgraphSimLiveBridgeActiveComputed ? 'default' : 'secondary'"
          class="h-7 rounded-sm px-2.5 text-xs"
          @click="onToggleActivationOrLiveBridge"
        >
          {{
            simActiveRef || animgraphSimLiveBridgeActiveComputed ? 'Deactivate' : 'Activate'
          }}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              class="h-7 w-7 shrink-0 rounded-sm px-0"
              title="Sim options"
            >
              <EllipsisVertical class="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="min-w-48">
            <DropdownMenuItem
              class="gap-2 text-xs"
              @select="onToggleLiveBridge"
            >
              <Network class="size-3.5" />
              Live Bridge
              <Check
                v-if="animgraphSimLiveBridgeActiveComputed"
                class="ml-auto size-3.5 opacity-80"
              />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              class="gap-2 text-xs"
              @select="onToggleUpdateWarningsEnabled"
            >
              <TriangleAlert class="size-3.5" />
              Update warnings
              <Check v-if="simUpdateWarningsEnabledRef" class="ml-auto size-3.5 opacity-80" />
            </DropdownMenuItem>
            <DropdownMenuItem
              class="gap-2 text-xs"
              @select="onToggleSampleWarningsEnabled"
            >
              <TriangleAlert class="size-3.5" />
              Sample warnings
              <Check v-if="simSampleWarningsEnabledRef" class="ml-auto size-3.5 opacity-80" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <div class="flex shrink-0 flex-wrap items-center gap-2 text-muted-foreground">
      <span class="font-data shrink-0">t={{ simSnapshotRef.time.toFixed(2) }}s · f={{ simFrame }}</span>
      <PropertyNumberSlider
        class="min-w-[140px] flex-1"
        label="Speed (fps)"
        :disabled="animgraphSimLiveBridgeActiveComputed"
        :model-value="simSpeedFps"
        :value-min="0"
        :value-max="DEFAULT_SIM_FPS * 100"
        :slider-min="0"
        :slider-max="DEFAULT_SIM_FPS * 4"
        :step="1"
        :decimals="0"
        @update:model-value="onSpeedFps"
      />
      <Button
        type="button"
        size="icon-xs"
        variant="outline"
        title="Reset speed to default fps"
        :disabled="simSpeedFps === DEFAULT_SIM_FPS"
        @click="onSpeedFps(DEFAULT_SIM_FPS)"
      >
        <RotateCcw class="size-3.5" :size="14" />
      </Button>
    </div>

    <Separator />

    <ButtonGroup class="w-full [&>*]:min-w-0 [&>*]:flex-1">
      <Button
        type="button"
        size="sm"
        :variant="simStatusBtnVariant"
        class="h-7 gap-1.5 px-2.5 text-xs"
        :class="simStatusBtnClass"
        :title="simStatusBtnTitle"
        @click="openSimStatusWindow()"
      >
        <Activity class="size-3.5 shrink-0" :size="14" />
        Status
      </Button>
      <Button
        type="button"
        size="sm"
        :variant="hasActiveRig ? simSkeletonBtnVariant : 'secondary'"
        class="h-7 gap-1.5 px-2.5 text-xs"
        :class="hasActiveRig ? simSkeletonBtnClass : 'opacity-80 text-muted-foreground'"
        :title="simSkeletonBtnTitle"
        :aria-disabled="!hasActiveRig"
        @click="onSkeletonClick"
      >
        <span
          v-if="!hasActiveRig"
          role="button"
          tabindex="0"
          class="inline-flex shrink-0 rounded-sm hover:text-foreground"
          title="Go to Resources → Rig to load a .rig.json"
          @click.stop="goToRigResources"
          @keydown.enter.stop.prevent="goToRigResources"
          @keydown.space.stop.prevent="goToRigResources"
        >
          <Info class="size-3.5" :size="14" />
        </span>
        <Bone v-else class="size-3.5 shrink-0" :size="14" />
        Skeleton
      </Button>
    </ButtonGroup>

    <Separator />

    <Tabs v-model="activeTabRef" class="flex min-h-0 flex-1 flex-col gap-1.5">
      <div ref="mainTabsRowEl">
        <TabsList class="grid h-8 w-full shrink-0 grid-cols-4 rounded-sm bg-muted/60 p-0.5">
          <TabsTrigger
            value="diagrams"
            class="h-7 gap-1 rounded-sm px-1 text-[11px]"
            title="Diagrams"
            aria-label="Diagrams"
          >
            <Network class="size-3.5 shrink-0" :size="14" />
            <span v-if="!mainTabsIconOnly" class="truncate">Diagrams</span>
          </TabsTrigger>
          <TabsTrigger
            value="control"
            class="h-7 gap-1 rounded-sm px-1 text-[11px]"
            title="Control"
            aria-label="Control"
          >
            <Gamepad2 class="size-3.5 shrink-0" :size="14" />
            <span v-if="!mainTabsIconOnly" class="truncate">Control</span>
          </TabsTrigger>
          <TabsTrigger
            value="values"
            class="h-7 gap-1 rounded-sm px-1 text-[11px]"
            title="Values"
            aria-label="Values"
          >
            <SlidersHorizontal class="size-3.5 shrink-0" :size="14" />
            <span v-if="!mainTabsIconOnly" class="truncate">Values</span>
          </TabsTrigger>
          <TabsTrigger
            value="resources"
            class="h-7 gap-1 rounded-sm px-1 text-[11px]"
            title="Resources"
            aria-label="Resources"
          >
            <Package class="size-3.5 shrink-0" :size="14" />
            <span v-if="!mainTabsIconOnly" class="truncate">Resources</span>
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent
        value="diagrams"
        class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden"
      >
        <p class="m-0 shrink-0 text-[10px] text-muted-foreground">
          GraphSlot execution: assign a project diagram to root and each slot.
        </p>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <div v-if="!diagramSlotRows.length" class="px-1 py-1 text-[11px] text-muted-foreground">
            No runners — load a project diagram.
          </div>
          <div v-else class="flex flex-col gap-0.5">
            <div
              v-for="row in diagramSlotRows"
              :key="row.key"
              class="flex min-w-0 items-center"
              :title="row.title"
            >
              <span
                v-for="d in row.depth"
                :key="d"
                class="relative w-5 shrink-0 self-stretch"
                aria-hidden="true"
              >
                <span
                  class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-hairline"
                />
              </span>
              <span
                v-if="row.hasChildren"
                class="relative flex w-5 shrink-0 items-center justify-center self-stretch"
                aria-hidden="true"
              >
                <span class="size-1.5 rounded-full bg-muted-foreground" />
              </span>
              <PropertyEnumSelect
                class="min-w-0 flex-1"
                :label="row.label"
                :model-value="row.diagramId"
                :options="diagramSelectOptions"
                :option-labels="DIAGRAM_OPTION_LABELS"
                @update:model-value="(value) => onDiagramSlotSelect(row, value)"
              />
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent
        value="control"
        class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden"
      >
        <Tabs v-model="controlSubTabRef" class="flex min-h-0 flex-1 flex-col gap-1.5">
          <div ref="controlTabsRowEl">
            <TabsList class="grid h-8 w-full shrink-0 grid-cols-2 rounded-sm bg-muted/60 p-0.5">
              <TabsTrigger
                value="events"
                class="h-7 gap-1 rounded-sm px-1 text-[11px]"
                title="Events"
                aria-label="Events"
              >
                <Zap class="size-3.5 shrink-0" :size="14" />
                <span v-if="!controlTabsIconOnly" class="truncate">Events</span>
              </TabsTrigger>
              <TabsTrigger
                value="drivers"
                class="h-7 gap-1 rounded-sm px-1 text-[11px]"
                title="Drivers"
                aria-label="Drivers"
              >
                <Cpu class="size-3.5 shrink-0" :size="14" />
                <span v-if="!controlTabsIconOnly" class="truncate">Drivers</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="events"
            class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden"
          >
            <div class="flex shrink-0 flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                :variant="eventValueEnabledRef ? 'default' : 'secondary'"
                class="h-7 w-7 shrink-0 rounded-sm px-0"
                title="Toggle anim event value"
                aria-label="Toggle anim event value"
                :aria-pressed="eventValueEnabledRef"
                @click="eventValueEnabledRef = !eventValueEnabledRef"
              >
                <SlidersHorizontal class="size-3.5" :size="14" />
              </Button>
              <Input
                class="h-7 min-w-[80px] flex-1 rounded-sm text-xs"
                placeholder="event name"
                v-model="eventNameDraftRef"
              />
              <ButtonGroup class="shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  class="h-7 rounded-sm px-2 text-xs"
                  @click="onFireExternalEvent"
                >
                  Ext
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  class="h-7 rounded-sm px-2 text-xs"
                  @click="onFireAnimEvent"
                >
                  Anim
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  class="h-7 rounded-sm px-2 text-xs"
                  @click="sim.fireAnimEnd()"
                >
                  AnimEnd
                </Button>
              </ButtonGroup>
            </div>
            <PropertyNumberSlider
              v-if="eventValueEnabledRef"
              class="w-full shrink-0"
              label="Anim value"
              v-model="eventValueDraftRef"
              :slider-min="0"
              :slider-max="1"
              :step="0.01"
              :decimals="3"
            />
            <Input
              v-if="simDiscovered.eventNames.length"
              class="h-7 shrink-0 rounded-sm text-xs"
              placeholder="Filter events"
              v-model="eventsFilter"
            />
            <div
              v-if="filteredEvents.length"
              class="flex min-h-0 flex-1 flex-wrap content-start gap-1 overflow-y-auto"
            >
              <Button
                v-for="ev in filteredEvents"
                :key="ev"
                type="button"
                size="xs"
                :variant="eventNameDraftRef === ev ? 'default' : 'outline'"
                class="h-6 rounded-sm px-2 text-[11px]"
                @click="onEventNameSelect(ev)"
              >
                {{ ev }}
              </Button>
            </div>
            <p
              v-else-if="simDiscovered.eventNames.length"
              class="m-0 text-[11px] text-muted-foreground"
            >
              No matching events
            </p>
            <p v-else class="m-0 text-[11px] text-muted-foreground">No discovered events</p>
          </TabsContent>

          <TabsContent
            value="drivers"
            class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden"
          >
            <SimDriversPanel />
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="values" class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
        <Tabs v-model="valuesSubTabRef" class="flex min-h-0 flex-1 flex-col gap-1.5">
          <div ref="valuesTabsRowEl">
            <TabsList class="grid h-8 w-full shrink-0 grid-cols-4 rounded-sm bg-muted/60 p-0.5">
              <TabsTrigger
                value="features"
                class="h-7 gap-1 rounded-sm px-1 text-[11px]"
                title="Features"
                aria-label="Features"
              >
                <Sparkles class="size-3.5 shrink-0" :size="14" />
                <span v-if="!valuesTabsIconOnly" class="truncate">Features</span>
                <span
                  v-if="featuresTabCount"
                  class="shrink-0 opacity-70"
                  :class="valuesTabsIconOnly ? 'text-[10px]' : 'ml-0.5'"
                >{{ featuresTabCount }}</span>
              </TabsTrigger>
              <TabsTrigger
                value="vars"
                class="h-7 gap-1 rounded-sm px-1 text-[11px]"
                title="Vars"
                aria-label="Vars"
              >
                <Variable class="size-3.5 shrink-0" :size="14" />
                <span v-if="!valuesTabsIconOnly" class="truncate">Vars</span>
                <span
                  v-if="varsCount"
                  class="shrink-0 opacity-70"
                  :class="valuesTabsIconOnly ? 'text-[10px]' : 'ml-0.5'"
                >{{ varsCount }}</span>
              </TabsTrigger>
              <TabsTrigger
                value="wrappers"
                class="h-7 gap-1 rounded-sm px-1 text-[11px]"
                title="Wrap"
                aria-label="Wrap"
              >
                <Layers class="size-3.5 shrink-0" :size="14" />
                <span v-if="!valuesTabsIconOnly" class="truncate">Wrap</span>
                <span
                  v-if="simDiscovered.wrapperNames.length"
                  class="shrink-0 opacity-70"
                  :class="valuesTabsIconOnly ? 'text-[10px]' : 'ml-0.5'"
                >{{ simDiscovered.wrapperNames.length }}</span>
              </TabsTrigger>
              <TabsTrigger
                value="tags"
                class="h-7 gap-1 rounded-sm px-1 text-[11px]"
                title="Tags"
                aria-label="Tags"
              >
                <Tags class="size-3.5 shrink-0" :size="14" />
                <span v-if="!valuesTabsIconOnly" class="truncate">Tags</span>
                <span
                  v-if="tagsCount"
                  class="shrink-0 opacity-70"
                  :class="valuesTabsIconOnly ? 'text-[10px]' : 'ml-0.5'"
                >{{ tagsCount }}</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="features" class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
            <Input
              v-if="featuresTabCount"
              class="h-7 shrink-0 rounded-sm text-xs"
              placeholder="Filter features"
              v-model="featuresFilter"
            />
            <div
              v-if="
                filteredFeatures.length ||
                filteredVectorFeatures.length ||
                filteredQuatFeatures.length ||
                filteredBoolFeatures.length ||
                filteredStringFeatures.length
              "
              class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
            >
              <div
                v-for="f in filteredFeatures"
                :key="`${f.feature}.${f.property}`.toLowerCase()"
                class="flex items-center gap-1"
              >
                <div class="min-w-0 flex-1">
                  <PropertyNumberControl
                    :label="`${f.feature}.${f.property}`"
                    :model-value="draftNumericFeatureValueGetterComputed(f.feature, f.property)"
                    :decimals="2"
                    @update:model-value="(v) => onNumericFeatureValueChange(f.feature, f.property, v)"
                  />
                </div>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  class="size-[26px] shrink-0 rounded-sm text-muted-foreground"
                  title="Reset"
                  :aria-label="`Reset ${f.feature}.${f.property}`"
                  :disabled="!isDraftNumericFeaturePopulated(f.feature, f.property)"
                  @click="onResetNumericFeatureValue(f.feature, f.property)"
                >
                  <RotateCcw :size="12" />
                </Button>
              </div>
              <div
                v-for="f in filteredBoolFeatures"
                :key="`b-${f.feature}.${f.property}`.toLowerCase()"
                class="flex items-center gap-1"
              >
                <div class="min-w-0 flex-1">
                  <PropertyBoolToggle
                    :label="`${f.feature}.${f.property}`"
                    :model-value="draftBoolFeatureValueGetterComputed(f.feature, f.property)"
                    @update:model-value="(v) => onBoolFeatureValueChange(f.feature, f.property, v)"
                  />
                </div>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  class="size-[26px] shrink-0 rounded-sm text-muted-foreground"
                  title="Reset"
                  :aria-label="`Reset ${f.feature}.${f.property}`"
                  :disabled="!isDraftBoolFeaturePopulated(f.feature, f.property)"
                  @click="onResetBoolFeatureValue(f.feature, f.property)"
                >
                  <RotateCcw :size="12" />
                </Button>
              </div>
              <div
                v-for="f in filteredStringFeatures"
                :key="`s-${f.feature}.${f.property}`.toLowerCase()"
                class="flex items-center gap-1"
              >
                <div class="min-w-0 flex-1">
                  <PropertyTextField
                    :label="`${f.feature}.${f.property}`"
                    :model-value="draftStringFeatureValueGetterComputed(f.feature, f.property)"
                    placeholder="None"
                    @update:model-value="(v) => onStringFeatureValueChange(f.feature, f.property, v)"
                  />
                </div>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  class="size-[26px] shrink-0 rounded-sm text-muted-foreground"
                  title="Reset"
                  :aria-label="`Reset ${f.feature}.${f.property}`"
                  :disabled="!isDraftStringFeaturePopulated(f.feature, f.property)"
                  @click="onResetStringFeatureValue(f.feature, f.property)"
                >
                  <RotateCcw :size="12" />
                </Button>
              </div>
              <PropertyVecBlock
                v-for="f in filteredVectorFeatures"
                :key="`v-${f.feature}.${f.property}`.toLowerCase()"
                :label="`${f.feature}.${f.property}`"
                :axes="vector4Axes"
                :target="draftVectorFeatureValueGetterComputed(f.feature, f.property)"
                @change="(p) => onVectorFeatureAxisValueChange(f.feature, f.property, p.axis, p.value)"
              >
                <template #actions>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="secondary"
                    class="size-[22px] shrink-0 rounded-sm text-muted-foreground"
                    title="Reset"
                    :aria-label="`Reset ${f.feature}.${f.property}`"
                    :disabled="!isDraftVectorFeaturePopulated(f.feature, f.property)"
                    @click="onResetVectorFeatureValue(f.feature, f.property)"
                  >
                    <RotateCcw :size="12" />
                  </Button>
                </template>
              </PropertyVecBlock>
              <PropertyVecBlock
                v-for="f in filteredQuatFeatures"
                :key="`q-${f.feature}.${f.property}`.toLowerCase()"
                :label="`quat ${f.feature}.${f.property}`"
                :axes="vector4Axes"
                :target="draftQuatFeatureValueGetterComputed(f.feature, f.property)"
                @change="(p) => onQuatFeatureAxisValueChange(f.feature, f.property, p.axis, p.value)"
              >
                <template #actions>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="secondary"
                    class="size-[22px] shrink-0 rounded-sm text-muted-foreground"
                    title="Reset"
                    :aria-label="`Reset quat ${f.feature}.${f.property}`"
                    :disabled="!isDraftQuatFeaturePopulated(f.feature, f.property)"
                    @click="onResetQuatFeatureValue(f.feature, f.property)"
                  >
                    <RotateCcw :size="12" />
                  </Button>
                </template>
              </PropertyVecBlock>
            </div>
            <p v-else-if="featuresTabCount" class="m-0 text-[11px] text-muted-foreground">No matching features</p>
            <p v-else class="m-0 text-[11px] text-muted-foreground">No features</p>
          </TabsContent>

          <TabsContent value="vars" class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
            <Input
              v-if="hasAnyVars"
              class="h-7 shrink-0 rounded-sm text-xs"
              placeholder="Filter vars"
              v-model="varsFilter"
            />
            <div v-if="hasFilteredVars" class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              <div
                v-for="name in filteredFloatVars"
                :key="`f-${name}`"
                class="flex items-center gap-1"
              >
                <div class="min-w-0 flex-1">
                  <PropertyNumberControl
                    :label="name"
                    :model-value="draftFloatVarValueGetterComputed(name)"
                    :decimals="2"
                    @update:model-value="(v) => onFloatVarValueChange(name, v)"
                  />
                </div>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  class="size-[26px] shrink-0 rounded-sm text-muted-foreground"
                  title="Reset"
                  :aria-label="`Reset ${name}`"
                  :disabled="!isDraftFloatVarPopulated(name)"
                  @click="onResetFloatVarValue(name)"
                >
                  <RotateCcw :size="12" />
                </Button>
              </div>
              <div
                v-for="name in filteredIntVars"
                :key="`i-${name}`"
                class="flex items-center gap-1"
              >
                <div class="min-w-0 flex-1">
                  <PropertyNumberControl
                    :label="name"
                    :model-value="draftIntVarValueGetterComputed(name)"
                    :decimals="0"
                    @update:model-value="(v) => onIntVarValueChange(name, v)"
                  />
                </div>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  class="size-[26px] shrink-0 rounded-sm text-muted-foreground"
                  title="Reset"
                  :aria-label="`Reset ${name}`"
                  :disabled="!isDraftIntVarPopulated(name)"
                  @click="onResetIntVarValue(name)"
                >
                  <RotateCcw :size="12" />
                </Button>
              </div>
              <div
                v-for="name in filteredBoolVars"
                :key="`b-${name}`"
                class="flex items-center gap-1"
              >
                <div class="min-w-0 flex-1">
                  <PropertyBoolToggle
                    :label="name"
                    :model-value="draftBoolVarValueGetterComputed(name)"
                    @update:model-value="(v) => onBoolVarValueChange(name, v)"
                  />
                </div>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  class="size-[26px] shrink-0 rounded-sm text-muted-foreground"
                  title="Reset"
                  :aria-label="`Reset ${name}`"
                  :disabled="!isDraftBoolVarPopulated(name)"
                  @click="onResetBoolVarValue(name)"
                >
                  <RotateCcw :size="12" />
                </Button>
              </div>
              <PropertyVecBlock
                v-for="name in filteredVectorVars"
                :key="`vv-${name}`"
                :label="`vec ${name}`"
                :axes="vector4Axes"
                :target="draftVectorVarValueGetterComputed(name)"
                @change="(p) => onVectorVarAxisValueChange(name, p.axis, p.value)"
              >
                <template #actions>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="secondary"
                    class="size-[22px] shrink-0 rounded-sm text-muted-foreground"
                    title="Reset"
                    :aria-label="`Reset vec ${name}`"
                    :disabled="!isDraftVectorVarPopulated(name)"
                    @click="onResetVectorVarValue(name)"
                  >
                    <RotateCcw :size="12" />
                  </Button>
                </template>
              </PropertyVecBlock>
              <PropertyVecBlock
                v-for="name in filteredQuatVars"
                :key="`qv-${name}`"
                :label="`quat ${name}`"
                :axes="vector4Axes"
                :target="draftQuatVarValueGetterComputed(name)"
                @change="(p) => onQuatVarAxisValueChange(name, p.axis, p.value)"
              >
                <template #actions>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="secondary"
                    class="size-[22px] shrink-0 rounded-sm text-muted-foreground"
                    title="Reset"
                    :aria-label="`Reset quat ${name}`"
                    :disabled="!isDraftQuatVarPopulated(name)"
                    @click="onResetQuatVarValue(name)"
                  >
                    <RotateCcw :size="12" />
                  </Button>
                </template>
              </PropertyVecBlock>
            </div>
            <p v-else-if="hasAnyVars" class="m-0 text-[11px] text-muted-foreground">No matching vars</p>
            <p v-else class="m-0 text-[11px] text-muted-foreground">No float / vector / int / bool vars</p>
          </TabsContent>

          <TabsContent value="wrappers" class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
            <Input
              v-if="simDiscovered.wrapperNames.length"
              class="h-7 shrink-0 rounded-sm text-xs"
              placeholder="Filter wrappers"
              v-model="wrappersFilter"
            />
            <div v-if="filteredWrappers.length" class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              <div
                v-for="name in filteredWrappers"
                :key="name"
                class="flex items-center gap-1"
              >
                <div class="min-w-0 flex-1">
                  <PropertyNumberSlider
                    :label="name"
                    :model-value="draftWrapperWeightValueGetterComputed(name)"
                    :value-min="0"
                    :value-max="1"
                    :slider-min="0"
                    :slider-max="1"
                    :step="0.01"
                    :decimals="2"
                    @update:model-value="(v) => onWrapperWeightValueChange(name, v)"
                  />
                </div>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  class="size-[26px] shrink-0 rounded-sm text-muted-foreground"
                  title="Reset"
                  :aria-label="`Reset ${name}`"
                  :disabled="!isDraftWrapperWeightPopulated(name)"
                  @click="onResetWrapperWeightValue(name)"
                >
                  <RotateCcw :size="12" />
                </Button>
              </div>
            </div>
            <p v-else-if="simDiscovered.wrapperNames.length" class="m-0 text-[11px] text-muted-foreground">No matching wrappers</p>
            <p v-else class="m-0 text-[11px] text-muted-foreground">
              No wrappers from graph or anim setup
            </p>
          </TabsContent>

          <TabsContent value="tags" class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
            <Input
              v-if="hasAnyTagValues"
              class="h-7 shrink-0 rounded-sm text-xs"
              placeholder="Filter tags"
              v-model="tagsFilter"
            />
            <div v-if="filteredTagVars.length" class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              <div
                v-for="name in filteredTagVars"
                :key="`t-${name}`"
                class="flex items-center gap-1"
              >
                <div class="min-w-0 flex-1">
                  <PropertyNumberControl
                    :label="name"
                    :model-value="draftTagValueGetterComputed(name)"
                    :decimals="2"
                    @update:model-value="(v) => onTagValueValueChange(name, v)"
                  />
                </div>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  class="size-[26px] shrink-0 rounded-sm text-muted-foreground"
                  title="Reset"
                  :aria-label="`Reset ${name}`"
                  :disabled="!isDraftTagValuePopulated(name)"
                  @click="onResetTagValueValue(name)"
                >
                  <RotateCcw :size="12" />
                </Button>
              </div>
            </div>
            <p v-else-if="hasAnyTagValues" class="m-0 text-[11px] text-muted-foreground">No matching tags</p>
            <p v-else class="m-0 text-[11px] text-muted-foreground">No TagValue tags from graph</p>
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="resources" class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
        <Tabs v-model="resourcesSubTabRef" class="flex min-h-0 flex-1 flex-col gap-1.5">
          <div ref="resourcesTabsRowEl">
            <TabsList class="grid h-8 w-full shrink-0 grid-cols-4 rounded-sm bg-muted/60 p-0.5">
              <TabsTrigger
                value="sets"
                class="h-7 gap-1 rounded-sm px-1 text-[11px]"
                title="Anim sets"
                aria-label="Anim sets"
              >
                <Film class="size-3.5 shrink-0" :size="14" />
                <span v-if="!resourcesTabsIconOnly" class="truncate">Anim sets</span>
                <span
                  v-if="simClipStatsRef.entryCount"
                  class="shrink-0 opacity-70"
                  :class="resourcesTabsIconOnly ? 'text-[10px]' : 'ml-0.5'"
                >{{ simClipStatsRef.entryCount }}</span>
              </TabsTrigger>
              <TabsTrigger
                value="db"
                class="h-7 gap-1 rounded-sm px-1 text-[11px]"
                title="Anim DB"
                aria-label="Anim DB"
              >
                <Database class="size-3.5 shrink-0" :size="14" />
                <span v-if="!resourcesTabsIconOnly" class="truncate">Anim DB</span>
                <span
                  v-if="simAnimDbStatsRef.dbCount"
                  class="shrink-0 opacity-70"
                  :class="resourcesTabsIconOnly ? 'text-[10px]' : 'ml-0.5'"
                >{{ simAnimDbStatsRef.dbCount }}</span>
              </TabsTrigger>
              <TabsTrigger
                value="rig"
                class="h-7 gap-1 rounded-sm px-1 text-[11px]"
                title="Rig"
                aria-label="Rig"
              >
                <Bone class="size-3.5 shrink-0" :size="14" />
                <span v-if="!resourcesTabsIconOnly" class="truncate">Rig</span>
                <span
                  v-if="simRigEntriesRef.length"
                  class="shrink-0 opacity-70"
                  :class="resourcesTabsIconOnly ? 'text-[10px]' : 'ml-0.5'"
                >{{ simRigEntriesRef.length }}</span>
              </TabsTrigger>
              <TabsTrigger
                value="entity"
                class="h-7 gap-1 rounded-sm px-1 text-[11px]"
                title="Entity"
                aria-label="Entity"
              >
                <Box class="size-3.5 shrink-0" :size="14" />
                <span v-if="!resourcesTabsIconOnly" class="truncate">Entity</span>
                <span
                  v-if="entityTagsCount"
                  class="shrink-0 opacity-70"
                  :class="resourcesTabsIconOnly ? 'text-[10px]' : 'ml-0.5'"
                >{{ entityTagsCount }}</span>
              </TabsTrigger>
            </TabsList>
          </div>

        <!-- Anim sets -->
        <TabsContent value="sets" class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
          <input
            ref="animsetFileInput"
            type="file"
            accept=".json,application/json"
            class="hidden"
            @change="onAnimsetFile"
          />
          <input
            ref="animsetGlbFileInput"
            type="file"
            accept=".glb,model/gltf-binary"
            class="hidden"
            @change="onAnimsetGlbFile"
          />
          <div class="flex shrink-0 items-center gap-1.5">
            <p class="font-data m-0 min-w-0 flex-1 text-[11px] text-muted-foreground">
              {{ simClipStatsRef.entryCount }} sets · {{ simClipStatsRef.clipCount }} clips ·
              {{ simClipStatsRef.eventCount }} events
              <span v-if="clipPoseAnimCount">
                · {{ clipPoseAnimCount }} glb anims
              </span>
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              class="h-7 w-7 shrink-0 rounded-sm px-0"
              title="Load .anims.json"
              aria-label="Load .anims.json"
              @click="animsetFileInput?.click()"
            >
              <UploadIcon class="size-3.5" :size="14" />
            </Button>
          </div>
          <p v-if="clipsError" class="m-0 text-[11px] text-destructive">{{ clipsError }}</p>

          <div
            v-if="simAnimSetEntriesRef.length"
            class="flex max-h-[42%] shrink-0 flex-col gap-1.5 overflow-y-auto"
          >
            <AnimSetupEntryCard
              v-for="entry in simAnimSetEntriesRef"
              :key="entry.id"
              :entry="entry"
              :pose="poseForEntry(entry)"
              :get-clip-glb-info="simGetClipGlbInfo"
              :list-glb-anim-names="simListGlbAnimNames"
              @update:priority="(piority) => onAnimSetEntryPriorityUpdate(entry.id, piority)"
              @remove="onAnimSetEntryRemove(entry.id)"
              @pick-glb="onAnimSetEntryGLBPickerRequest(entry.id)"
              @clear-glb="onAnimSetEntryGLBClear(entry.id)"
              :wrapper-draft="draftWrapperVariableNameByanimSetEntryIdRef[entry.id] ?? ''"
              @update:wrapper-draft="(newVariableNameDraft) => onAnimSetEntryWrapperNewVariableNameDraft(entry.id, newVariableNameDraft)"
              @add-wrapper="onAnimSetEntryWrapperVariableAdd(entry.id)"
              @remove-wrapper="(wrapperVariableName) => onAnimSetEntryWrapperVariableRemove(entry.id, wrapperVariableName)"
            />
          </div>

          <div v-if="simClipNamesRef.length" class="flex shrink-0 flex-wrap items-center gap-1.5">
            <Input
              class="h-7 min-w-[80px] flex-1 rounded-sm text-xs"
              placeholder="Filter clips"
              v-model="clipsFilter"
            />
            <div class="flex shrink-0 gap-0.5 rounded-sm bg-muted/60 p-0.5">
              <Button
                v-for="opt in clipActiveFilterOptions"
                :key="opt.value"
                type="button"
                size="xs"
                :variant="clipsActiveFilter === opt.value ? 'default' : 'ghost'"
                class="h-6 rounded-sm px-2 text-[10px]"
                @click="clipsActiveFilter = opt.value"
              >
                {{ opt.label }}
              </Button>
            </div>
          </div>
          <div v-if="filteredClips.length" class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            <div
              v-for="name in filteredClips"
              :key="name"
              class="rounded-sm"
              :class="expandedClipNameRef === name ? 'bg-muted/40' : ''"
            >
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left hover:bg-muted/60"
                @click="toggleClipExpand(name)"
              >
                <span
                  class="shrink-0 rounded-sm px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide"
                  :class="
                    simIsClipActive(name)
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-muted text-muted-foreground'
                  "
                >
                  {{ simIsClipActive(name) ? 'on' : 'off' }}
                </span>
                <span class="min-w-0 flex-1 truncate text-[11px]">{{ name }}</span>
                <span
                  v-if="clipHasGlb(name)"
                  class="shrink-0 rounded-sm bg-violet-500/20 px-1 py-0.5 text-[9px] font-medium uppercase text-violet-300"
                  title="Has glb pose in resolving set"
                >
                  glb
                </span>
                <span class="font-data shrink-0 text-[10px] text-muted-foreground">
                  {{ formatClipDur(name) }}
                </span>
              </button>
              <div
                v-if="expandedClipNameRef === name && expandedClipDetail"
                class="mx-1 mb-1 mt-0.5 max-h-[40vh] overflow-y-auto rounded-sm border border-border bg-canvas px-2 py-1.5 text-[10px] text-muted-foreground"
              >
                <p class="font-data m-0 mb-1 text-foreground">
                  {{ expandedClipDetail.name }} · {{ expandedClipDetail.duration.toFixed(3) }}s
                  <template v-if="expandedClipAnimSetMemberships.length > 1">
                    · {{ expandedClipAnimSetMemberships.length }} sets
                  </template>
                  <template v-else>
                    · {{ expandedClipDetail.events.length }} evt
                  </template>
                  <span
                    class="ml-1 rounded-sm px-1 py-0.5 text-[9px] font-medium uppercase"
                    :class="
                      expandedClipIsActive
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-muted text-muted-foreground'
                    "
                  >
                    {{ expandedClipIsActive ? 'resolvable' : 'gated' }}
                  </span>
                  <span
                    v-if="expandedClipGlb"
                    class="ml-1 rounded-sm px-1 py-0.5 text-[9px] font-medium uppercase bg-violet-500/20 text-violet-300"
                  >
                    glb {{ expandedClipGlb.duration.toFixed(3) }}s
                  </span>
                  <span
                    v-else
                    class="ml-1 rounded-sm px-1 py-0.5 text-[9px] font-medium uppercase bg-muted text-muted-foreground"
                  >
                    no glb
                  </span>
                </p>
                <div v-if="expandedClipAnimSetMemberships.length" class="mb-1.5 flex flex-col gap-1.5">
                  <p class="m-0 text-[9px] uppercase tracking-wide text-muted-foreground/80">
                    In sets
                  </p>
                  <div
                    v-for="s in expandedClipAnimSetMemberships"
                    :key="s.entryId"
                    class="flex min-w-0 flex-col gap-0.5"
                  >
                    <div
                      class="flex min-w-0 items-center gap-1.5"
                      :title="`${s.entryId} · pri ${s.priority}`"
                    >
                      <span
                        class="shrink-0 rounded-sm px-1 py-0.5 text-[9px] font-medium uppercase"
                        :class="
                          s.resolves
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : s.active
                              ? 'bg-sky-500/15 text-sky-400'
                              : 'bg-muted text-muted-foreground'
                        "
                      >
                        {{ s.resolves ? 'win' : s.active ? 'on' : 'off' }}
                      </span>
                      <span class="min-w-0 flex-1 truncate text-[10px] text-foreground">
                        {{ s.sourceLabel }}
                      </span>
                      <span
                        class="shrink-0 rounded-sm px-1 py-0.5 text-[9px] font-medium uppercase"
                        :class="
                          simGetClipGlbInfo(name, s.poseSetId)
                            ? 'bg-violet-500/20 text-violet-300'
                            : 'bg-muted text-muted-foreground'
                        "
                      >
                        <template v-if="simGetClipGlbInfo(name, s.poseSetId)">
                          glb {{ simGetClipGlbInfo(name, s.poseSetId)!.duration.toFixed(2) }}s
                        </template>
                        <template v-else>no glb</template>
                      </span>
                      <span class="font-data shrink-0 text-[9px]">
                        pri {{ s.priority }} · {{ s.duration.toFixed(2) }}s · {{ s.eventCount }}e
                      </span>
                    </div>
                    <div class="ml-1 border-l border-border/60 pl-1.5">
                      <p
                        v-for="(ev, i) in clipEventsForEntry(name, s.entryId)"
                        :key="`${s.entryId}-${ev.name}-${ev.time}-${i}`"
                        class="font-data m-0 truncate"
                        :title="ev.type"
                      >
                        t={{ ev.time.toFixed(3) }} {{ ev.name }}
                        <span v-if="ev.value != null">={{ ev.value }}</span>
                      </p>
                      <p
                        v-if="!clipEventsForEntry(name, s.entryId).length"
                        class="m-0 text-muted-foreground/80"
                      >
                        No events
                      </p>
                    </div>
                  </div>
                </div>
                <template v-else>
                  <p
                    v-for="(ev, i) in expandedClipDetail.events"
                    :key="`${ev.name}-${ev.time}-${i}`"
                    class="font-data m-0 truncate"
                    :title="ev.type"
                  >
                    t={{ ev.time.toFixed(3) }} {{ ev.name }}
                    <span v-if="ev.value != null">={{ ev.value }}</span>
                  </p>
                  <p v-if="!expandedClipDetail.events.length" class="m-0">No events</p>
                </template>
              </div>
            </div>
          </div>
          <p v-else-if="!simClipNamesRef.length" class="m-0 text-[11px] text-muted-foreground">
            Load WolvenKit .anims.json — each file = AnimSetupEntry (priority + variableNames)
          </p>
        </TabsContent>

        <!-- Anim databases -->
        <TabsContent value="db" class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
          <input
            ref="animDbFileInput"
            type="file"
            accept=".json,application/json"
            class="hidden"
            @change="onAnimDbFile"
          />
          <div class="flex shrink-0 items-center gap-1.5">
            <p class="font-data m-0 min-w-0 flex-1 text-[11px] text-muted-foreground">
              {{ simAnimDbStatsRef.dbCount }} DB · {{ simAnimDbStatsRef.rowCount }} rows
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              class="h-7 w-7 shrink-0 rounded-sm px-0"
              title="Load .csv.json"
              aria-label="Load .csv.json"
              @click="animDbFileInput?.click()"
            >
              <UploadIcon class="size-3.5" :size="14" />
            </Button>
          </div>
          <p v-if="animDbError" class="m-0 text-[11px] text-destructive">{{ animDbError }}</p>

          <div
            v-if="simAnimDatabasesRef.length"
            class="flex shrink-0 flex-col gap-1 overflow-y-auto rounded-sm border border-border bg-canvas p-1.5"
            :class="selectedAnimDb ? 'max-h-[30%]' : 'max-h-[50%]'"
          >
            <button
              v-for="db in simAnimDatabasesRef"
              :key="db.pathKey"
              type="button"
              class="flex w-full items-center gap-1.5 rounded-sm border px-1.5 py-1 text-left"
              :class="
                selectedAnimDb?.pathKey === db.pathKey
                  ? 'border-border bg-muted/50'
                  : 'border-border/60 hover:bg-muted/40'
              "
              @click="selectedAnimDbKey = db.pathKey"
            >
              <span class="min-w-0 flex-1 truncate text-[11px]" :title="db.pathKey">
                {{ db.label }}
              </span>
              <span class="font-data shrink-0 text-[10px] text-muted-foreground">
                {{ db.inputCount }}in · {{ db.rows.length }}
              </span>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                class="h-5 w-5 shrink-0 rounded-sm p-0 text-[10px] text-muted-foreground"
                title="Remove database"
                @click.stop="onRemoveAnimDatabase(db.pathKey)"
              >
                ×
              </Button>
            </button>
          </div>

          <template v-if="selectedAnimDb">
            <Input
              class="h-7 shrink-0 rounded-sm text-xs"
              placeholder="Filter rows (inputs / anim name)"
              v-model="animDbRowsFilter"
            />
            <p class="font-data m-0 text-[10px] text-muted-foreground">
              headers:
              {{ selectedAnimDb.headers.length ? selectedAnimDb.headers.join(' · ') : '—' }}
            </p>
            <div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
              <div
                v-for="(row, ri) in filteredAnimDbRows"
                :key="`${selectedAnimDb.pathKey}-${ri}`"
                class="rounded-sm px-1 py-0.5 hover:bg-muted/40"
              >
                <div class="flex min-w-0 items-baseline gap-2">
                  <span class="font-data shrink-0 text-[10px] text-muted-foreground">
                    [{{ formatAnimDbInputs(row.inputs) }}]
                  </span>
                  <span class="min-w-0 flex-1 truncate text-[11px] text-foreground" :title="row.animationName">
                    {{ row.animationName }}
                  </span>
                  <span
                    v-if="row.fallbackAnimationName && row.fallbackAnimationName !== row.animationName"
                    class="font-data max-w-[30%] shrink-0 truncate text-[9px] text-muted-foreground"
                    :title="`fallback ${row.fallbackAnimationName}`"
                  >
                    fb:{{ row.fallbackAnimationName }}
                  </span>
                </div>
              </div>
              <p
                v-if="!filteredAnimDbRows.length"
                class="m-0 px-1 text-[11px] text-muted-foreground"
              >
                No matching rows
              </p>
            </div>
          </template>
          <p v-else-if="!simAnimDatabasesRef.length" class="m-0 text-[11px] text-muted-foreground">
            Load WolvenKit C2dArray .csv.json (e.g. player_melee_attacks.csv.json)
          </p>
          <p v-else class="m-0 text-[11px] text-muted-foreground">Select a database above</p>
        </TabsContent>

        <!-- Rig palette -->
        <TabsContent value="rig" class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
          <input
            ref="rigFileInput"
            type="file"
            accept=".json,application/json"
            class="hidden"
            @change="onRigFile"
          />
          <div class="flex shrink-0 items-center gap-1.5">
            <p class="font-data m-0 min-w-0 flex-1 text-[11px] text-muted-foreground">
              {{ simRigEntriesRef.length }} loaded · Sample uses active only
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              class="h-7 w-7 shrink-0 rounded-sm px-0"
              title="Load .rig.json"
              aria-label="Load .rig.json"
              @click="rigFileInput?.click()"
            >
              <UploadIcon class="size-3.5" :size="14" />
            </Button>
          </div>
          <p v-if="rigError" class="m-0 text-[11px] text-destructive">{{ rigError }}</p>
          <div v-if="simRigEntriesRef.length" class="flex shrink-0 flex-col gap-1 overflow-y-auto max-h-[30%]">
            <div
              v-for="entry in simRigEntriesRef"
              :key="entry.id"
              class="flex items-center gap-1.5 rounded-sm border border-border/60 px-1.5 py-1"
            >
              <Button
                type="button"
                size="sm"
                :variant="entry.active ? 'default' : 'secondary'"
                class="h-6 shrink-0 rounded-sm px-2 text-[10px]"
                @click="onSetActiveRig(entry.id)"
              >
                {{ entry.active ? 'active' : 'set' }}
              </Button>
              <span class="min-w-0 flex-1 truncate text-[11px]" :title="entry.sourceLabel">
                {{ entry.sourceLabel }}
              </span>
              <span class="font-data shrink-0 text-[10px] text-muted-foreground">
                {{ entry.boneCount }}b · {{ entry.partCount }}p
              </span>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                class="h-5 w-5 shrink-0 rounded-sm p-0 text-[10px] text-muted-foreground"
                title="Remove rig"
                @click="onRemoveRig(entry.id)"
              >
                ×
              </Button>
            </div>
          </div>
          <p v-else class="m-0 text-[11px] text-muted-foreground">
            Load player_woman_skeleton.rig.json (or other animRig) for Sample / masks.
          </p>

          <template v-if="simActiveRigBonesRef.length">
            <Input
              class="h-7 shrink-0 rounded-sm text-xs"
              placeholder="Filter bones / parts"
              v-model="rigBonesFilter"
            />
            <div class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              <p class="m-0 text-[9px] uppercase tracking-wide text-muted-foreground/80">
                Bones ({{ filteredRigBones.length }}/{{ simActiveRigBonesRef.length }})
              </p>
              <p
                v-for="bone in filteredRigBones"
                :key="bone"
                class="font-data m-0 truncate px-1 text-[11px]"
              >
                {{ bone }}
              </p>
              <p
                v-if="simActiveRigPartsRef.length"
                class="m-0 mt-1 text-[9px] uppercase tracking-wide text-muted-foreground/80"
              >
                Parts ({{ filteredRigParts.length }}/{{ simActiveRigPartsRef.length }})
              </p>
              <p
                v-for="part in filteredRigParts"
                :key="`p-${part}`"
                class="font-data m-0 truncate px-1 text-[10px] text-muted-foreground"
              >
                {{ part }}
              </p>
            </div>
          </template>
        </TabsContent>

        <!-- Entity tags (StaticSwitch Component/Visual/Rig mock) — saved in project -->
        <TabsContent value="entity" class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
          <div class="flex shrink-0 items-center gap-1">
            <Input
              class="h-7 min-w-0 flex-1 rounded-sm text-xs"
              placeholder="Add entity tag"
              v-model="additionEntityTagNameRef"
              @keydown.enter.prevent="onAddEntityTag"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              class="h-7 shrink-0 rounded-sm px-2 text-xs"
              @click="onAddEntityTag"
            >
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              :variant="entityTagsEditMode ? 'default' : 'secondary'"
              class="h-7 w-7 shrink-0 rounded-sm p-0"
              :title="entityTagsEditMode ? 'Done editing' : 'Edit tags'"
              :aria-label="entityTagsEditMode ? 'Done editing' : 'Edit tags'"
              :aria-pressed="entityTagsEditMode"
              @click="entityTagsEditMode = !entityTagsEditMode"
            >
              <PencilIcon :size="12" />
            </Button>
          </div>
          <Input
            v-if="hasAnyEntityTags"
            class="h-7 shrink-0 rounded-sm text-xs"
            placeholder="Filter entity tags"
            v-model="entityTagsFilter"
          />
          <div v-if="filteredEntityTags.length" class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            <div
              v-for="name in filteredEntityTags"
              :key="`et-${name}`"
              class="flex items-center gap-1"
            >
              <div class="min-w-0 flex-1">
                <PropertyBoolToggle
                  :label="name"
                  :model-value="draftEntityTagValueGetterComputed(name)"
                  @update:model-value="(v) => onEntityTagValueChange(name, v)"
                />
              </div>
              <Button
                v-if="entityTagsEditMode"
                type="button"
                size="icon-xs"
                variant="secondary"
                class="size-[26px] shrink-0 rounded-sm text-muted-foreground hover:text-destructive"
                title="Remove tag"
                :aria-label="`Remove ${name}`"
                @click="onRemoveEntityTag(name)"
              >
                <TrashIcon :size="12" />
              </Button>
            </div>
          </div>
          <p v-else-if="hasAnyEntityTags" class="m-0 text-[11px] text-muted-foreground">No matching entity tags</p>
          <p v-else class="m-0 text-[11px] text-muted-foreground">
            Mock Component / Visual / Rig tags for StaticSwitch. Saved with the project.
          </p>
        </TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import {
  PropertyBoolToggle,
  PropertyEnumSelect,
  PropertyNumberControl,
  PropertyNumberSlider,
  PropertyTextField,
  PropertyVecBlock,
} from '@/components/nodeDetails'
import AnimSetupEntryCard from '@/components/sim/AnimSetupEntryCard.vue'
import SimDriversPanel from '@/components/sim/drivers/SimDriversPanel.vue'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { makeFeatureKey } from '@/composables/sim/features'
import { IDENTITY_QUAT_VEC4, ZERO_VEC4 } from '@/utils/sim'
import { Check, EllipsisVertical, TriangleAlert } from '@lucide/vue'
import { useResizeObserver } from '@vueuse/core'
import {
  Activity,
  Bone,
  Box,
  Cpu,
  Database,
  Film,
  Gamepad2,
  Info,
  Layers,
  Network,
  Package,
  PencilIcon,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Tags,
  TrashIcon,
  UploadIcon,
  Variable,
  Zap,
} from 'lucide-vue-next'
import { computed, ref, watch, type Ref } from 'vue'
import {
  addEntityTagName as animgraphSimAddEntityTagName,
  discovered as animgraphSimDiscovered,
  liveBridge as animgraphSimLiveBridge,
  removeEntityTagName as animgraphSimRemoveEntityTagName,
  draftBoard,
  eventNameDraftRef,
  eventValueDraftRef,
  sim,
} from '../stores/animgraphSim'
import {
  openSimSkeletonWindow,
  openSimStatusWindow,
  windowUiStateByType,
  type AppWindowUiState,
} from '../stores/appWindows'
import { listDiagramIds, projectRef } from '../stores/graphProject'
import type { ClipPoseSetView } from '../utils/sim/clipPoseLibrary'
import { DEFAULT_SIM_FPS } from '../utils/sim/SimClock'

const {
  active: simActiveRef,
  playing: simPlayingRef,
  speedRef: simSpeedRef,
  snapshot: simSnapshotRef,
  getPrimaryRunner: simGetPrimaryRunner,
  getRootRunnerId: simGetRootRunnerId,
  listSlotRunners: simListSlotRunners,
  setRunnerDiagramId: simSetRunnerDiagramId,
  setSlotDiagramId: simSetSlotDiagramId,
  runnersRev: simRunnersRevRef,
  discovered: simDiscoveredRef,
  clipStats: simClipStatsRef,
  clipNames: simClipNamesRef,
  setupEntries: simAnimSetEntriesRef,
  animDbStats: simAnimDbStatsRef,
  animDatabases: simAnimDatabasesRef,
  rigEntries: simRigEntriesRef,
  activeRigBones: simActiveRigBonesRef,
  activeRigParts: simActiveRigPartsRef,
  clipPoseSets: simClipPoseSetsRef,
  updateWarningsEnabled: simUpdateWarningsEnabledRef,
  sampleWarningsEnabled: simSampleWarningsEnabledRef,
  getClipGlbInfo: simGetClipGlbInfo,
  listGlbAnimNames: simListGlbAnimNames,
  isClipActive: simIsClipActive,
} = sim

const animgraphSimLiveBridgeActiveComputed = animgraphSimLiveBridge.activeComputed
const animgraphSimLiveBridgeStatusRef = animgraphSimLiveBridge.connectionStatusRef

const liveBridgeStatusDiscClassComputed = computed(() => {
  switch (animgraphSimLiveBridgeStatusRef.value) {
    case 'connected':
      return 'bg-emerald-500'
    case 'connecting':
      return 'bg-amber-500'
    case 'error':
      return 'bg-red-500'
    default:
      return 'bg-red-500'
  }
})

const liveBridgeStatusLabelComputed = computed(() => {
  switch (animgraphSimLiveBridgeStatusRef.value) {
    case 'connected':
      return 'Connected'
    case 'connecting':
      return 'Connecting…'
    case 'error':
      return 'Error'
    default:
      return 'Disconnected'
  }
})

const liveBridgeStatusTitleComputed = computed(() => {
  switch (animgraphSimLiveBridgeStatusRef.value) {
    case 'connected':
      return 'Connected to game animgraph bridge'
    case 'connecting':
      return 'Connecting to game animgraph bridge…'
    case 'error':
      return 'Live Bridge error'
    default:
      return 'No connection to game animgraph bridge'
  }
})

const onToggleLiveBridge = () => {
  if (animgraphSimLiveBridgeActiveComputed.value) {
    animgraphSimLiveBridge.disconnect()
  } else {
    animgraphSimLiveBridge.connect()
  }
}

const onToggleActivationOrLiveBridge = () => {
  if (animgraphSimLiveBridgeActiveComputed.value) {
    animgraphSimLiveBridge.disconnect()
    return
  }
  sim.toggleActivation()
}

const activeTabRef = ref<'diagrams' | 'control' | 'values' | 'resources'>('diagrams')
const controlSubTabRef = ref<'events' | 'drivers'>('events')
const valuesSubTabRef = ref<'features' | 'vars' | 'wrappers' | 'tags'>('features')
const resourcesSubTabRef = ref<'sets' | 'db' | 'rig' | 'entity'>('sets')
const eventValueEnabledRef = ref(false)

const DIAGRAM_OPTION_LABELS: Readonly<Record<string, string>> = { '': 'None' }
const diagramSelectOptions = computed(() => ['', ...listDiagramIds.value])
/** Bump when slot topology / assignments change (Maps are not reactive). */
const diagramSlotsRev = ref(0)
const bumpDiagramSlots = () => {
  diagramSlotsRev.value++
}

watch(
  [projectRef, listDiagramIds, simRunnersRevRef],
  () => bumpDiagramSlots(),
  { deep: false }
)

type DiagramSlotRow = {
  key: string
  parentRunnerId: string
  /** Live child runner; omitted for None slots. Root always uses root id. */
  runnerId?: string
  slotName: string
  diagramId: string
  label: string
  title: string
  depth: number
  hasChildren: boolean
}

const diagramSlotRows = computed((): DiagramSlotRow[] => {
  void diagramSlotsRev.value
  void projectRef.value
  void simRunnersRevRef.value
  const rootId = simGetRootRunnerId()
  const root = simGetPrimaryRunner()
  const rootSlots = root?.diagramId ? simListSlotRunners(rootId) : []
  const rows: DiagramSlotRow[] = [
    {
      key: `root:${rootId}`,
      parentRunnerId: rootId,
      runnerId: rootId,
      slotName: '',
      diagramId: root?.diagramId ?? '',
      label: 'root',
      title: root ? `root (${rootId})` : `root (${rootId}) · None`,
      depth: 0,
      hasChildren: rootSlots.length > 0,
    },
  ]
  if (!root?.diagramId) return rows
  // DFS so nested slots appear directly under their parent (not after siblings).
  const visited = new Set<string>([rootId])
  const visit = (parentId: string, depth: number) => {
    for (const slot of simListSlotRunners(parentId)) {
      const childSlots =
        slot.diagramId && slot.runnerId ? simListSlotRunners(slot.runnerId) : []
      rows.push({
        key: `${parentId}/${slot.slotName}`,
        parentRunnerId: parentId,
        runnerId: slot.runnerId || undefined,
        slotName: slot.slotName,
        diagramId: slot.diagramId ?? '',
        label: slot.slotName,
        title: slot.runnerId
          ? `${slot.slotName} → ${slot.runnerId}`
          : `${slot.slotName} → None`,
        depth: depth + 1,
        hasChildren: childSlots.length > 0,
      })
      if (slot.diagramId && slot.runnerId && !visited.has(slot.runnerId)) {
        visited.add(slot.runnerId)
        visit(slot.runnerId, depth + 1)
      }
    }
  }
  visit(rootId, 0)
  return rows
})

function onDiagramSlotSelect(row: DiagramSlotRow, diagramId: string) {
  const nextDiagramId = diagramId || null
  if (row.runnerId === simGetRootRunnerId()) {
    simSetRunnerDiagramId(row.runnerId, nextDiagramId)
  } else {
    simSetSlotDiagramId(row.parentRunnerId, row.slotName, nextDiagramId)
  }
  bumpDiagramSlots()
}

function onEventNameSelect(eventName: string) {
  eventNameDraftRef.value = eventName
}

function onFireExternalEvent() {
  sim.fireExternal(eventNameDraftRef.value)
}

function onFireAnimEvent() {
  const eventValue = eventValueEnabledRef.value && Number.isFinite(eventValueDraftRef.value)
    ? eventValueDraftRef.value
    : undefined
  sim.fireAnimEvent(eventNameDraftRef.value, eventValue)
}

/** Below this tabs-row width, show icons only. */
const TABS_ICON_ONLY_MAX_WIDTH = 360

function observeTabsIconOnly(
  el: Ref<HTMLElement | null>,
  iconOnly: Ref<boolean>
) {
  useResizeObserver(el, (entries) => {
    const width = entries[0]?.contentRect.width ?? 0
    iconOnly.value = width > 0 && width < TABS_ICON_ONLY_MAX_WIDTH
  })
}

const mainTabsRowEl = ref<HTMLElement | null>(null)
const mainTabsIconOnly = ref(false)
observeTabsIconOnly(mainTabsRowEl, mainTabsIconOnly)

const controlTabsRowEl = ref<HTMLElement | null>(null)
const controlTabsIconOnly = ref(false)
observeTabsIconOnly(controlTabsRowEl, controlTabsIconOnly)

const valuesTabsRowEl = ref<HTMLElement | null>(null)
const valuesTabsIconOnly = ref(false)
observeTabsIconOnly(valuesTabsRowEl, valuesTabsIconOnly)

const resourcesTabsRowEl = ref<HTMLElement | null>(null)
const resourcesTabsIconOnly = ref(false)
observeTabsIconOnly(resourcesTabsRowEl, resourcesTabsIconOnly)
const eventsFilter = ref('')
const featuresFilter = ref('')
const varsFilter = ref('')
const tagsFilter = ref('')

const entityTagsFilter = ref('')
const additionEntityTagNameRef = ref('')
const entityTagsEditMode = ref(false)

const wrappersFilter = ref('')
const clipsFilter = ref('')
const animDbRowsFilter = ref('')
const selectedAnimDbKey = ref('')
const clipsActiveFilter = ref<'all' | 'active' | 'inactive'>('all')
const clipActiveFilterOptions = [
  { value: 'all' as const, label: 'All' },
  { value: 'active' as const, label: 'On' },
  { value: 'inactive' as const, label: 'Off' },
]
const expandedClipNameRef = ref('')
const clipsError = ref('')
const animDbError = ref('')
const rigError = ref('')
const rigBonesFilter = ref('')
const animsetFileInput = ref<HTMLInputElement | null>(null)
const animsetGlbFileInput = ref<HTMLInputElement | null>(null)
const glbTargetEntryId = ref<string | null>(null)
const animDbFileInput = ref<HTMLInputElement | null>(null)
const rigFileInput = ref<HTMLInputElement | null>(null)
/** Per-entry draft for adding a wrapper name chip. */
const draftWrapperVariableNameByanimSetEntryIdRef = ref<Record<string, string>>({})

const clipPoseAnimCount = computed(() => {
  return simClipPoseSetsRef.value.reduce((n, s) => n + s.animCount, 0)
})

const clipPoseSetIdToClipPoseSetViewMapComputed = computed(() => {
  const clipPoseSetIdToClipPoseSetViewMap = new Map<string, ClipPoseSetView>()
  for (const clipPoseSetView of simClipPoseSetsRef.value) {
    clipPoseSetIdToClipPoseSetViewMap.set(clipPoseSetView.id, clipPoseSetView)
  }
  return clipPoseSetIdToClipPoseSetViewMap
})

const poseForEntry = (entry: { poseSetId: string | null }) => {
  if (!entry.poseSetId) return undefined
  return clipPoseSetIdToClipPoseSetViewMapComputed.value.get(entry.poseSetId)
}

const matchesQuery = (text: string, query: string) => {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return text.toLowerCase().includes(q)
}

/** Sim HUD frame index (matches Step = 1/60s). Anim content stays 30fps separately. */
const simFrame = computed(() => Math.floor(simSnapshotRef.value.time * DEFAULT_SIM_FPS))

const localeCmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })

const simDiscovered = simDiscoveredRef.value

const filteredEvents = computed(() => {
  return simDiscovered.eventNames
    .filter((ev) => matchesQuery(ev, eventsFilter.value))
    .slice()
    .sort(localeCmp)
})
const vector4Axes = ['X', 'Y', 'Z', 'W'] as const

const featuresTabCount = computed(() => {
  return simDiscovered.floatFeatures.length +
    simDiscovered.vectorFeatureKeysSet.size +
    simDiscovered.quatFeatureKeysSet.size +
    simDiscovered.boolFeatureKeysSet.size +
    simDiscovered.stringFeatureKeysSet.size
})

const filteredFeatures = computed(() => {
  return simDiscovered.floatFeatures
    .filter((f) => matchesQuery(`${f.feature}.${f.property}`, featuresFilter.value))
    .slice()
    .sort((a, b) => {
      const byFeat = localeCmp(a.feature, b.feature)
      if (byFeat !== 0) return byFeat
      return localeCmp(a.property, b.property)
    })
})

const filteredBoolFeatures = computed(() => {
  return simDiscovered.boolFeatures
    .filter((f) => matchesQuery(`${f.feature}.${f.property}`, featuresFilter.value))
    .slice()
    .sort((a, b) => {
      const byFeat = localeCmp(a.feature, b.feature)
      if (byFeat !== 0) return byFeat
      return localeCmp(a.property, b.property)
    })
})

const filteredStringFeatures = computed(() => {
  return simDiscovered.stringFeatures
    .filter((f) => matchesQuery(`${f.feature}.${f.property}`, featuresFilter.value))
    .slice()
    .sort((a, b) => {
      const byFeat = localeCmp(a.feature, b.feature)
      if (byFeat !== 0) return byFeat
      return localeCmp(a.property, b.property)
    })
})

const filteredVectorFeatures = computed(() => {
  return simDiscovered.vectorFeatures
    .filter((f) => matchesQuery(`${f.feature}.${f.property}`, featuresFilter.value))
    .slice()
    .sort((a, b) => {
      const byFeat = localeCmp(a.feature, b.feature)
      if (byFeat !== 0) return byFeat
      return localeCmp(a.property, b.property)
    })
})

const filteredQuatFeatures = computed(() => {
  return simDiscovered.quatFeatures
    .filter((f) => matchesQuery(`${f.feature}.${f.property}`, featuresFilter.value))
    .slice()
    .sort((a, b) => {
      const byFeat = localeCmp(a.feature, b.feature)
      if (byFeat !== 0) return byFeat
      return localeCmp(a.property, b.property)
    })
})

const filteredFloatVars = computed(() => {
  return simDiscovered.floatVarNames
    .filter((name) => matchesQuery(name, varsFilter.value))
    .slice()
    .sort(localeCmp)
})
const filteredVectorVars = computed(() => {
  return simDiscovered.vectorVarNames
    .filter((name) => matchesQuery(name, varsFilter.value))
    .slice()
    .sort(localeCmp)
})
const filteredQuatVars = computed(() => {
  return simDiscovered.quatVarNames
    .filter((name) => matchesQuery(name, varsFilter.value))
    .slice()
    .sort(localeCmp)
})
const filteredBoolVars = computed(() => {
  return simDiscovered.boolVarNames
    .filter((name) => matchesQuery(name, varsFilter.value))
    .slice()
    .sort(localeCmp)
})
const filteredIntVars = computed(() => {
  return simDiscovered.intVarNames
    .filter((name) => matchesQuery(name, varsFilter.value))
    .slice()
    .sort(localeCmp)
})
const filteredTagVars = computed(() => {
  return simDiscovered.tagNames
    .filter((name) => matchesQuery(name, tagsFilter.value))
    .slice()
    .sort(localeCmp)
})
const varsCount = computed(() => {
  return simDiscovered.floatVarNames.length +
    simDiscovered.vectorVarNames.length +
    simDiscovered.quatVarNames.length +
    simDiscovered.boolVarNames.length +
    simDiscovered.intVarNames.length
})

const hasAnyTagValues = computed(() => {
  return simDiscovered.tagNames.length > 0
})
const tagsCount = computed(() => {
  return simDiscovered.tagNames.length
})
const hasAnyVars = computed(() => {
  return varsCount.value > 0
})
const hasFilteredVars = computed(() => {
  return filteredFloatVars.value.length > 0 ||
    filteredVectorVars.value.length > 0 ||
    filteredQuatVars.value.length > 0 ||
    filteredBoolVars.value.length > 0 ||
    filteredIntVars.value.length > 0
})
const filteredWrappers = computed(() => {
  return simDiscovered.wrapperNames
    .filter((name) => matchesQuery(name, wrappersFilter.value))
    .slice()
    .sort(localeCmp)
})
const filteredClips = computed(() => {
  const q = clipsFilter.value
  return simClipNamesRef.value.filter((name) => {
    if (!matchesQuery(name, q)) return false
    if (clipsActiveFilter.value === 'all') return true
    
    const on = simIsClipActive(name)
    return clipsActiveFilter.value === 'active' ? on : !on
  })
})

const formatAnimDbInputs = (inputs: Array<number | string>) =>
  inputs.map((v) => String(v)).join(',')

const selectedAnimDb = computed(() => {
  const list = simAnimDatabasesRef.value
  if (!list.length) return undefined
  return list.find((d) => d.pathKey === selectedAnimDbKey.value) ?? list[0]
})

const filteredAnimDbRows = computed(() => {
  const db = selectedAnimDb.value
  if (!db) return []
  const q = animDbRowsFilter.value.trim().toLowerCase()
  if (!q) return db.rows
  return db.rows.filter((row) => {
    const inputs = formatAnimDbInputs(row.inputs).toLowerCase()
    return (
      inputs.includes(q) ||
      row.animationName.toLowerCase().includes(q) ||
      row.fallbackAnimationName.toLowerCase().includes(q)
    )
  })
})

const expandedClipAnimSetMemberships = computed(() => {
  if (!expandedClipNameRef.value) return []
  return sim.listClipSets(expandedClipNameRef.value)
})

const expandedClipGlb = computed(() => {
  const name = expandedClipNameRef.value
  if (!name) return

  const win = expandedClipAnimSetMemberships.value.find((membership) => membership.resolves)
  return sim.getClipGlbInfo(name, win?.poseSetId ?? null)
})

const expandedClipDetail = computed(() => {
  if (!expandedClipNameRef.value) return
  return sim.lookupClip(expandedClipNameRef.value)
})

const expandedClipIsActive = computed(() => {
  if (!expandedClipNameRef.value) return false
  return sim.isClipActive(expandedClipNameRef.value)
})

const clipHasGlb = (name: string) => {
  return sim.getClipGlbInfo(name) != null
}

const filteredRigBones = computed(() => {
  const q = rigBonesFilter.value
  return simActiveRigBonesRef.value.filter((b) => matchesQuery(b, q))
})

const filteredRigParts = computed(() => {
  const q = rigBonesFilter.value
  return simActiveRigPartsRef.value.filter((p) => matchesQuery(p, q))
})

const toggleClipExpand = (name: string) => {
  expandedClipNameRef.value = expandedClipNameRef.value === name ? '' : name
}

/** Button chrome: closed | minimized | open (default / maximized / forward). */
const windowToggleBtnVariant = (s: AppWindowUiState) => {
  if (s === 'closed') return 'secondary' as const
  if (s === 'minimized') return 'outline' as const
  return 'default' as const
}

const windowToggleBtnClass = (s: AppWindowUiState) => {
  if (s === 'minimized') return 'opacity-80 text-muted-foreground'
  return undefined
}

const windowToggleBtnTitle = (s: AppWindowUiState, label: string) => {
  if (s === 'forward') return `${label} window is focused`
  if (s === 'maximized') return `Bring maximized ${label.toLowerCase()} forward`
  if (s === 'default') return `Bring ${label.toLowerCase()} window forward`
  if (s === 'minimized') return `Restore ${label.toLowerCase()} window`
  return `Open ${label.toLowerCase()} window`
}

const simStatusUiState = computed(() => windowUiStateByType('sim-status'))
const simStatusBtnVariant = computed(() => windowToggleBtnVariant(simStatusUiState.value))
const simStatusBtnClass = computed(() => windowToggleBtnClass(simStatusUiState.value))
const simStatusBtnTitle = computed(() =>
  windowToggleBtnTitle(simStatusUiState.value, 'Sim status')
)

const hasActiveRig = computed(() => simActiveRigBonesRef.value.length > 0)

const simSkeletonUiState = computed(() => windowUiStateByType('sim-skeleton'))
const simSkeletonBtnVariant = computed(() => windowToggleBtnVariant(simSkeletonUiState.value))
const simSkeletonBtnClass = computed(() => windowToggleBtnClass(simSkeletonUiState.value))
const simSkeletonBtnTitle = computed(() => {
  if (!hasActiveRig.value) {
    return 'Load a .rig.json under Resources → Rig to open the skeleton preview'
  }
  return windowToggleBtnTitle(simSkeletonUiState.value, 'Sim skeleton')
})

const goToRigResources = () => {
  activeTabRef.value = 'resources'
  resourcesSubTabRef.value = 'rig'
}

const onSkeletonClick = () => {
  if (!hasActiveRig.value) return
  openSimSkeletonWindow()
}

// #region Values

const draftNumericFeatureValueGetterComputed = computed(() => {
  const numericFeatureByKey = draftBoard.numericFeatureByKeyRef.value
  return (feature: string, property: string) => {
    return numericFeatureByKey[makeFeatureKey(feature, property)] ?? 0
  }
})

const isDraftNumericFeaturePopulated = computed(() => {
  void draftBoard.numericFeaturesRevisionRef.value
  const populated = draftBoard.populatedNumericFeatureKeyToFeatureMap
  return (feature: string, property: string) => {
    return populated.has(makeFeatureKey(feature, property))
  }
})

const draftStringFeatureValueGetterComputed = computed(() => {
  const stringFeatureByKey = draftBoard.stringFeatureByKeyRef.value
  return (feature: string, property: string) => {
    return stringFeatureByKey[makeFeatureKey(feature, property)] ?? ''
  }
})

const isDraftStringFeaturePopulated = computed(() => {
  void draftBoard.stringFeaturesRevisionRef.value
  const populated = draftBoard.populatedStringFeatureKeyToFeatureMap
  return (feature: string, property: string) => {
    return populated.has(makeFeatureKey(feature, property))
  }
})

const draftBoolFeatureValueGetterComputed = computed(() => {
  const booleanFeatureByKey = draftBoard.booleanFeatureByKeyRef.value
  return (feature: string, property: string) => {
    return booleanFeatureByKey[makeFeatureKey(feature, property)] ?? false
  }
})

const isDraftBoolFeaturePopulated = computed(() => {
  void draftBoard.booleanFeaturesRevisionRef.value
  const populated = draftBoard.populatedBooleanFeatureKeyToFeatureMap
  return (feature: string, property: string) => {
    return populated.has(makeFeatureKey(feature, property))
  }
})

const draftVectorFeatureValueGetterComputed = computed(() => {
  const vectorFeatureByKey = draftBoard.vectorFeatureByKeyRef.value
  return (feature: string, property: string) => {
    const value = vectorFeatureByKey[makeFeatureKey(feature, property)] ?? ZERO_VEC4
    return { X: value.x, Y: value.y, Z: value.z, W: value.w }
  }
})

const isDraftVectorFeaturePopulated = computed(() => {
  void draftBoard.vectorFeaturesRevisionRef.value
  const populated = draftBoard.populatedVectorFeatureKeyToFeatureMap
  return (feature: string, property: string) => {
    return populated.has(makeFeatureKey(feature, property))
  }
})

const draftQuatFeatureValueGetterComputed = computed(() => {
  const quatFeatureByKey = draftBoard.quatFeatureByKeyRef.value
  return (feature: string, property: string) => {
    const value = quatFeatureByKey[makeFeatureKey(feature, property)] ?? IDENTITY_QUAT_VEC4
    return { X: value.x, Y: value.y, Z: value.z, W: value.w }
  }
})

const isDraftQuatFeaturePopulated = computed(() => {
  void draftBoard.quatFeaturesRevisionRef.value
  const populated = draftBoard.populatedQuatFeatureKeyToFeatureMap
  return (feature: string, property: string) => {
    return populated.has(makeFeatureKey(feature, property))
  }
})

const onNumericFeatureValueChange = (feature: string, property: string, value: number) => {
  draftBoard.setNumericFeatureValue(feature, property, value)
}

const onResetNumericFeatureValue = (feature: string, property: string) => {
  draftBoard.clearNumericFeatureValue(feature, property)
}

const onStringFeatureValueChange = (feature: string, property: string, raw: string) => {
  draftBoard.setStringFeatureValue(feature, property, raw)
}

const onResetStringFeatureValue = (feature: string, property: string) => {
  draftBoard.clearStringFeatureValue(feature, property)
}

const onBoolFeatureValueChange = (feature: string, property: string, value: boolean) => {
  draftBoard.setBooleanFeatureValue(feature, property, value)
}

const onResetBoolFeatureValue = (feature: string, property: string) => {
  draftBoard.clearBooleanFeatureValue(feature, property)
}

const onVectorFeatureAxisValueChange = (
  feature: string,
  property: string,
  axis: string,
  value: number
) => {
  const key = axis.toLowerCase()
  if (key !== 'x' && key !== 'y' && key !== 'z' && key !== 'w') return
  draftBoard.setVectorFeatureAxisValue(feature, property, key, value)
}

const onResetVectorFeatureValue = (feature: string, property: string) => {
  draftBoard.clearVectorFeatureValue(feature, property)
}

const onQuatFeatureAxisValueChange = (
  feature: string,
  property: string,
  axis: string,
  value: number
) => {
  const key = axis.toLowerCase()
  if (key !== 'x' && key !== 'y' && key !== 'z' && key !== 'w') return
  draftBoard.setQuatFeatureAxisValue(feature, property, key, value)
}

const onResetQuatFeatureValue = (feature: string, property: string) => {
  draftBoard.clearQuatFeatureValue(feature, property)
}

const draftFloatVarValueGetterComputed = computed(() => {
  const floatVarByKey = draftBoard.floatVarByKeyRef.value
  return (name: string) => {
    return floatVarByKey[name] ?? 0
  }
})

const isDraftFloatVarPopulated = computed(() => {
  void draftBoard.floatVarsRevisionRef.value
  const populated = draftBoard.populatedFloatVarNamesSet
  return (name: string) => populated.has(name)
})

const draftIntVarValueGetterComputed = computed(() => {
  const intVarByKey = draftBoard.intVarByKeyRef.value
  return (name: string) => {
    return intVarByKey[name] ?? 0
  }
})

const isDraftIntVarPopulated = computed(() => {
  void draftBoard.intVarsRevisionRef.value
  const populated = draftBoard.populatedIntVarNamesSet
  return (name: string) => populated.has(name)
})

const draftBoolVarValueGetterComputed = computed(() => {
  const boolVarByKey = draftBoard.boolVarByKeyRef.value
  return (name: string) => {
    return boolVarByKey[name] ?? false
  }
})

const isDraftBoolVarPopulated = computed(() => {
  void draftBoard.boolVarsRevisionRef.value
  const populated = draftBoard.populatedBoolVarNamesSet
  return (name: string) => populated.has(name)
})

const draftVectorVarValueGetterComputed = computed(() => {
  const vectorVarByKey = draftBoard.vectorVarByKeyRef.value
  return (name: string) => {
    const value = vectorVarByKey[name] ?? ZERO_VEC4
    return { X: value.x, Y: value.y, Z: value.z, W: value.w }
  }
})

const isDraftVectorVarPopulated = computed(() => {
  void draftBoard.vectorVarsRevisionRef.value
  const populated = draftBoard.populatedVectorVarNamesSet
  return (name: string) => populated.has(name)
})

const draftQuatVarValueGetterComputed = computed(() => {
  const quatVarByKey = draftBoard.quatVarByKeyRef.value
  return (name: string) => {
    const value = quatVarByKey[name] ?? IDENTITY_QUAT_VEC4
    return { X: value.x, Y: value.y, Z: value.z, W: value.w }
  }
})

const isDraftQuatVarPopulated = computed(() => {
  void draftBoard.quatVarsRevisionRef.value
  const populated = draftBoard.populatedQuatVarNamesSet
  return (name: string) => populated.has(name)
})

const onFloatVarValueChange = (name: string, value: number) => {
  draftBoard.setFloatVarValue(name, value)
}

const onResetFloatVarValue = (name: string) => {
  draftBoard.clearFloatVarValue(name)
}

const onIntVarValueChange = (name: string, value: number) => {
  draftBoard.setIntVarValue(name, value)
}

const onResetIntVarValue = (name: string) => {
  draftBoard.clearIntVarValue(name)
}

const onBoolVarValueChange = (name: string, value: boolean) => {
  draftBoard.setBoolVarValue(name, value)
}

const onResetBoolVarValue = (name: string) => {
  draftBoard.clearBoolVarValue(name)
}

const onVectorVarAxisValueChange = (name: string, axis: string, value: number) => {
  const key = axis.toLowerCase()
  if (key !== 'x' && key !== 'y' && key !== 'z' && key !== 'w') return
  draftBoard.setVectorVarAxisValue(name, key, value)
}

const onResetVectorVarValue = (name: string) => {
  draftBoard.clearVectorVarValue(name)
}

const onQuatVarAxisValueChange = (name: string, axis: string, value: number) => {
  const key = axis.toLowerCase()
  if (key !== 'x' && key !== 'y' && key !== 'z' && key !== 'w') return
  draftBoard.setQuatVarAxisValue(name, key, value)
}

const onResetQuatVarValue = (name: string) => {
  draftBoard.clearQuatVarValue(name)
}

const draftWrapperWeightValueGetterComputed = computed(() => {
  const wrapperWeightByKey = draftBoard.wrapperWeightByKeyRef.value
  return (name: string) => {
    return wrapperWeightByKey[name] ?? 0
  }
})

const isDraftWrapperWeightPopulated = computed(() => {
  void draftBoard.wrapperWeightsRevisionRef.value
  const populated = draftBoard.populatedWrapperWeightNamesSet
  return (name: string) => populated.has(name)
})

const onWrapperWeightValueChange = (name: string, value: number) => {
  draftBoard.setWrapperWeightValue(name, value)
}

const onResetWrapperWeightValue = (name: string) => {
  draftBoard.clearWrapperWeightValue(name)
}

const draftTagValueGetterComputed = computed(() => {
  const tagValueByKey = draftBoard.tagValueByKeyRef.value
  return (name: string) => {
    return tagValueByKey[name] ?? 0
  }
})

const isDraftTagValuePopulated = computed(() => {
  void draftBoard.tagValuesRevisionRef.value
  const populated = draftBoard.populatedTagValueNamesSet
  return (name: string) => populated.has(name)
})

const onTagValueValueChange = (name: string, value: number) => {
  draftBoard.setTagValueValue(name, value)
}

const onResetTagValueValue = (name: string) => {
  draftBoard.clearTagValueValue(name)
}

// #endregion

// #region Resources

const filteredEntityTags = computed(() => {
  return animgraphSimDiscovered.entityTagsInfoComputed.value.entityTagNames
    .filter((name) => matchesQuery(name, entityTagsFilter.value))
    .slice()
    .sort(localeCmp)
})

const entityTagsCount = computed(() => {
  return animgraphSimDiscovered.entityTagsInfoComputed.value.entityTagNames.length
})

const hasAnyEntityTags = computed(() => {
  return entityTagsCount.value > 0
})

const formatClipDur = (name: string) => {
  const c = sim.lookupClip(name)
  return c ? `${c.duration.toFixed(2)}s` : '—'
}

const clipEventsForEntry = (name: string, entryId: string) => {
  return sim.getClipInEntry(name, entryId)?.events ?? []
}

const draftEntityTagValueGetterComputed = computed(() => {
  const entityTagByKey = draftBoard.entityTagByKeyRef.value
  return (name: string) => {
    return entityTagByKey[name] ?? false
  }
})

const onEntityTagValueChange = (name: string, value: boolean) => {
  draftBoard.setEntityTagValue(name, value)
}

const onAddEntityTag = () => {
  const name = additionEntityTagNameRef.value.trim()
  if (!name || name === 'None') return

  draftBoard.setEntityTagValue(name, true)
  animgraphSimAddEntityTagName(name)
  additionEntityTagNameRef.value = ''
}

const onRemoveEntityTag = (name: string) => {
  draftBoard.setEntityTagValue(name, false)
  animgraphSimRemoveEntityTagName(name)
}

const onRemoveAnimDatabase = (pathKey: string) => {
  sim.removeAnimDatabase(pathKey)
}

// #endregion

/** Display/edit sim clock speed as frames per second (1× = DEFAULT_SIM_FPS). */
const simSpeedFps = computed(() => simSpeedRef.value * DEFAULT_SIM_FPS)

const onSpeedFps = (fps: number) => {
  if (!Number.isFinite(fps)) return
  sim.setSpeed(fps / DEFAULT_SIM_FPS)
}

const onToggleUpdateWarningsEnabled = () => {
  sim.setUpdateWarningsEnabled(!sim.updateWarningsEnabled.value)
}

const onToggleSampleWarningsEnabled = () => {
  sim.setSampleWarningsEnabled(!sim.sampleWarningsEnabled.value)
}

const onSetActiveRig = (rigId: string | null) => {
  sim.setActiveRig(rigId)
}

const onRemoveRig = (rigId: string) => {
  sim.removeRig(rigId)
}

const onAnimSetEntryPriorityUpdate = (animSetEntryId: string, priority: number) => {
  sim.updateSetupEntry(animSetEntryId, { priority })
}

const onAnimSetEntryRemove = (animSetEntryId: string) => {
  sim.removeSetupEntry(animSetEntryId)
}

const onAnimSetEntryGLBPickerRequest = (animSetEntryId: string) => {
  glbTargetEntryId.value = animSetEntryId
  animsetGlbFileInput.value?.click()
}

const onAnimSetEntryGLBClear = (animSetEntryId: string) => {
  sim.clearAnimsetGlb(animSetEntryId)
}

const onAnimSetEntryWrapperNewVariableNameDraft = (animSetEntryId: string, newVariableNameDraft: string) => {
  draftWrapperVariableNameByanimSetEntryIdRef.value = { 
    ...draftWrapperVariableNameByanimSetEntryIdRef.value, 
    [animSetEntryId]: newVariableNameDraft,
  }
}

const onAnimSetEntryWrapperVariableAdd = (animSetEntryId: string) => {
  const newWrapperVariableName = (draftWrapperVariableNameByanimSetEntryIdRef.value[animSetEntryId] ?? '').trim()
  if (!newWrapperVariableName || newWrapperVariableName === 'None') return
  
  const animSetEntry = simAnimSetEntriesRef.value.find((e) => e.id === animSetEntryId)
  if (!animSetEntry) return

  draftWrapperVariableNameByanimSetEntryIdRef.value = { 
    ...draftWrapperVariableNameByanimSetEntryIdRef.value, 
    [animSetEntryId]: '',
  }
  
  const newWrapperVariableNameLowerCase = newWrapperVariableName.toLowerCase()
  if (animSetEntry.variableNames.some((varName) => varName.toLowerCase() === newWrapperVariableNameLowerCase)) {
    return
  }

  sim.updateSetupEntry(animSetEntryId, { variableNames: [...animSetEntry.variableNames, newWrapperVariableName] })
}

const onAnimSetEntryWrapperVariableRemove = (animSetEntryId: string, wrapperVariableName: string) => {
  const animSetEntry = simAnimSetEntriesRef.value.find((e) => e.id === animSetEntryId)
  if (!animSetEntry) return
  sim.updateSetupEntry(animSetEntryId, {
    variableNames: animSetEntry.variableNames.filter((n) => n !== wrapperVariableName),
  })
}



const onAnimsetFile = async (ev: Event) => {
  clipsError.value = ''
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const text = await file.text()
    const json = JSON.parse(text) as unknown
    const result = sim.loadAnimsetJson(json, file.name)
    if (!result) clipsError.value = 'No clips found in file'
  } catch (err) {
    clipsError.value = err instanceof Error ? err.message : String(err)
  }
}

const onAnimsetGlbFile = async (ev: Event) => {
  clipsError.value = ''
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const setupId = glbTargetEntryId.value
  glbTargetEntryId.value = null
  if (!file || !setupId) return
  try {
    const buf = await file.arrayBuffer()
    const animSetGLBAnimCount = await sim.loadAnimsetGlb(buf, file.name, setupId)
    if (!animSetGLBAnimCount) clipsError.value = 'No animations found in GLB'
  } catch (err) {
    clipsError.value = err instanceof Error ? err.message : String(err)
  }
}

const onRigFile = async (ev: Event) => {
  rigError.value = ''
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const text = await file.text()
    const json = JSON.parse(text) as unknown
    sim.loadRigJson(json, file.name)
    resourcesSubTabRef.value = 'rig'
  } catch (err) {
    rigError.value = err instanceof Error ? err.message : String(err)
  }
}

const onAnimDbFile = async (ev: Event) => {
  animDbError.value = ''
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const text = await file.text()
    const json: unknown = JSON.parse(text)
    if (!json || typeof json !== 'object') {
      animDbError.value = 'Anim database JSON must be an object'
      return
    }
    const pathKey = sim.loadAnimDatabaseJson(json, file.name)
    if (!pathKey) animDbError.value = 'No rows found in anim database'
    else {
      resourcesSubTabRef.value = 'db'
      selectedAnimDbKey.value = pathKey
    }
  } catch (err) {
    animDbError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>
