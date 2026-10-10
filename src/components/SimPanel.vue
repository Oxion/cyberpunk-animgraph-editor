<template>
  <div class="flex h-full min-h-0 flex-1 flex-col gap-2 text-xs text-foreground">
    <div class="flex shrink-0 flex-wrap items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        :variant="snapshot.playing ? 'default' : 'secondary'"
        class="h-7 rounded-sm px-2.5 text-xs"
        @click="emit('toggle')"
      >
        {{ snapshot.playing ? 'Pause' : 'Play' }}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        class="h-7 rounded-sm px-2.5 text-xs"
        @click="emit('step')"
      >
        Step
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        class="h-7 rounded-sm px-2.5 text-xs"
        @click="emit('reset')"
      >
        Reset
      </Button>
      <div class="ml-auto flex shrink-0 items-center gap-1">
        <Button
          type="button"
          size="sm"
          :variant="active ? 'default' : 'secondary'"
          class="h-7 rounded-sm px-2.5 text-xs"
          @click="emit('toggle-active')"
        >
          {{ active ? 'Deactivate' : 'Activate' }}
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
              @select="setSampleWarningsEnabled?.(!sampleWarningsEnabled)"
            >
              <TriangleAlert class="size-3.5" />
              Sample warnings
              <Check v-if="sampleWarningsEnabled" class="ml-auto size-3.5 opacity-80" />
            </DropdownMenuItem>
            <DropdownMenuItem
              class="gap-2 text-xs"
              @select="setUpdateWarningsEnabled?.(!updateWarningsEnabled)"
            >
              <TriangleAlert class="size-3.5" />
              Update warnings
              <Check v-if="updateWarningsEnabled" class="ml-auto size-3.5 opacity-80" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <div class="flex shrink-0 flex-wrap items-center gap-2 text-muted-foreground">
      <span class="font-data shrink-0">t={{ snapshot.time.toFixed(2) }}s · f={{ simFrame }}</span>
      <PropertyNumberSlider
        class="min-w-[140px] flex-1"
        label="Speed (fps)"
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

    <Tabs v-model="activeTab" class="flex min-h-0 flex-1 flex-col gap-1.5">
      <div ref="mainTabsRowEl">
        <TabsList class="grid h-8 w-full shrink-0 grid-cols-3 rounded-sm bg-muted/60 p-0.5">
          <TabsTrigger
            value="events"
            class="h-7 gap-1 rounded-sm px-1 text-[11px]"
            title="Events"
            aria-label="Events"
          >
            <Zap class="size-3.5 shrink-0" :size="14" />
            <span v-if="!mainTabsIconOnly" class="truncate">Events</span>
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

      <TabsContent value="events" class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
        <div class="flex shrink-0 flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            :variant="eventValueEnabled ? 'default' : 'secondary'"
            class="h-7 w-7 shrink-0 rounded-sm px-0"
            title="Toggle anim event value"
            aria-label="Toggle anim event value"
            :aria-pressed="eventValueEnabled"
            @click="eventValueEnabled = !eventValueEnabled"
          >
            <SlidersHorizontal class="size-3.5" :size="14" />
          </Button>
          <Input
            class="h-7 min-w-[80px] flex-1 rounded-sm text-xs"
            placeholder="event name"
            :model-value="eventDraft"
            @update:model-value="(v) => emit('update:eventDraft', String(v ?? ''))"
          />
          <ButtonGroup class="shrink-0">
            <Button type="button" size="sm" variant="secondary" class="h-7 rounded-sm px-2 text-xs" @click="emit('fireExternal')">
              Ext
            </Button>
            <Button type="button" size="sm" variant="secondary" class="h-7 rounded-sm px-2 text-xs" @click="onFireAnimEvent">
              Anim
            </Button>
            <Button type="button" size="sm" variant="secondary" class="h-7 rounded-sm px-2 text-xs" @click="emit('fireAnimEnd')">
              AnimEnd
            </Button>
          </ButtonGroup>
        </div>
        <PropertyNumberSlider
          v-if="eventValueEnabled"
          class="w-full shrink-0"
          label="Anim value"
          :model-value="eventValueDraft"
          :slider-min="0"
          :slider-max="1"
          :step="0.01"
          :decimals="3"
          @update:model-value="(v) => emit('update:eventValueDraft', v)"
        />
        <Input
          v-if="discovered.events.length"
          class="h-7 shrink-0 rounded-sm text-xs"
          placeholder="Filter events"
          v-model="eventsFilter"
        />
        <div v-if="filteredEvents.length" class="flex min-h-0 flex-1 flex-wrap content-start gap-1 overflow-y-auto">
          <Button
            v-for="ev in filteredEvents"
            :key="ev"
            type="button"
            size="xs"
            :variant="eventDraft === ev ? 'default' : 'outline'"
            class="h-6 rounded-sm px-2 text-[11px]"
            @click="emit('update:eventDraft', ev)"
          >
            {{ ev }}
          </Button>
        </div>
        <p v-else-if="discovered.events.length" class="m-0 text-[11px] text-muted-foreground">No matching events</p>
        <p v-else class="m-0 text-[11px] text-muted-foreground">No discovered events</p>
      </TabsContent>

      <TabsContent value="values" class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
        <Tabs v-model="valuesSubTab" class="flex min-h-0 flex-1 flex-col gap-1.5">
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
                  v-if="discovered.wrappers.length"
                  class="shrink-0 opacity-70"
                  :class="valuesTabsIconOnly ? 'text-[10px]' : 'ml-0.5'"
                >{{ discovered.wrappers.length }}</span>
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
                filteredBoolFeatures.length
              "
              class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
            >
              <PropertyNumberControl
                v-for="f in filteredFeatures"
                :key="`${f.feature}.${f.property}`.toLowerCase()"
                :label="`${f.feature}.${f.property}`"
                :model-value="featureValue(f.feature, f.property)"
                :decimals="2"
                @update:model-value="(v) => onFeatureValue(f.feature, f.property, v)"
              />
              <PropertyBoolToggle
                v-for="f in filteredBoolFeatures"
                :key="`b-${f.feature}.${f.property}`.toLowerCase()"
                :label="`${f.feature}.${f.property}`"
                :model-value="boolFeatureValue(f.feature, f.property)"
                @update:model-value="(v) => onBoolFeatureValue(f.feature, f.property, v)"
              />
              <PropertyVecBlock
                v-for="f in filteredVectorFeatures"
                :key="`v-${f.feature}.${f.property}`.toLowerCase()"
                :label="`${f.feature}.${f.property}`"
                :axes="vector4Axes"
                :target="vectorFeatureTarget(f.feature, f.property)"
                @change="(p) => onVectorFeatureAxis(f.feature, f.property, p.axis, p.value)"
              />
              <PropertyVecBlock
                v-for="f in filteredQuatFeatures"
                :key="`q-${f.feature}.${f.property}`.toLowerCase()"
                :label="`quat ${f.feature}.${f.property}`"
                :axes="vector4Axes"
                :target="quatFeatureTarget(f.feature, f.property)"
                @change="(p) => onQuatFeatureAxis(f.feature, f.property, p.axis, p.value)"
              />
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
              <PropertyNumberControl
                v-for="name in filteredFloatVars"
                :key="`f-${name}`"
                :label="name"
                :model-value="floatVars[name] ?? 0"
                :decimals="2"
                @update:model-value="(v) => onFloatValue(name, v)"
              />
              <PropertyVecBlock
                v-for="name in filteredVectorVars"
                :key="`vv-${name}`"
                :label="`vec ${name}`"
                :axes="vector4Axes"
                :target="vectorVarTarget(name)"
                @change="(p) => onVectorVarAxis(name, p.axis, p.value)"
              />
              <PropertyVecBlock
                v-for="name in filteredQuatVars"
                :key="`qv-${name}`"
                :label="`quat ${name}`"
                :axes="vector4Axes"
                :target="quatVarTarget(name)"
                @change="(p) => onQuatVarAxis(name, p.axis, p.value)"
              />
              <PropertyNumberControl
                v-for="name in filteredIntVars"
                :key="`i-${name}`"
                :label="name"
                :model-value="intVars[name] ?? 0"
                :decimals="0"
                @update:model-value="(v) => onIntValue(name, v)"
              />
              <PropertyBoolToggle
                v-for="name in filteredBoolVars"
                :key="`b-${name}`"
                :label="name"
                :model-value="boolVars[name] === true"
                @update:model-value="(v) => onBoolValue(name, v)"
              />
            </div>
            <p v-else-if="hasAnyVars" class="m-0 text-[11px] text-muted-foreground">No matching vars</p>
            <p v-else class="m-0 text-[11px] text-muted-foreground">No float / vector / int / bool vars</p>
          </TabsContent>

          <TabsContent value="wrappers" class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
            <Input
              v-if="discovered.wrappers.length"
              class="h-7 shrink-0 rounded-sm text-xs"
              placeholder="Filter wrappers"
              v-model="wrappersFilter"
            />
            <div v-if="filteredWrappers.length" class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              <PropertyNumberSlider
                v-for="name in filteredWrappers"
                :key="name"
                :label="name"
                :model-value="wrapperWeights[name] ?? 0"
                :value-min="0"
                :value-max="1"
                :slider-min="0"
                :slider-max="1"
                :step="0.01"
                :decimals="2"
                @update:model-value="(v) => onWrapperWeight(name, v)"
              />
            </div>
            <p v-else-if="discovered.wrappers.length" class="m-0 text-[11px] text-muted-foreground">No matching wrappers</p>
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
              <PropertyNumberControl
                v-for="name in filteredTagVars"
                :key="`t-${name}`"
                :label="name"
                :model-value="tagValues[name] ?? 0"
                :decimals="2"
                @update:model-value="(v) => onTagValue(name, v)"
              />
            </div>
            <p v-else-if="hasAnyTagValues" class="m-0 text-[11px] text-muted-foreground">No matching tags</p>
            <p v-else class="m-0 text-[11px] text-muted-foreground">No TagValue tags from graph</p>
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="resources" class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
        <Tabs v-model="resourcesSubTab" class="flex min-h-0 flex-1 flex-col gap-1.5">
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
                  v-if="clipStats.entryCount"
                  class="shrink-0 opacity-70"
                  :class="resourcesTabsIconOnly ? 'text-[10px]' : 'ml-0.5'"
                >{{ clipStats.entryCount }}</span>
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
                  v-if="animDbStats.dbCount"
                  class="shrink-0 opacity-70"
                  :class="resourcesTabsIconOnly ? 'text-[10px]' : 'ml-0.5'"
                >{{ animDbStats.dbCount }}</span>
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
                  v-if="rigEntries.length"
                  class="shrink-0 opacity-70"
                  :class="resourcesTabsIconOnly ? 'text-[10px]' : 'ml-0.5'"
                >{{ rigEntries.length }}</span>
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
              {{ clipStats.entryCount }} sets · {{ clipStats.clipCount }} clips ·
              {{ clipStats.eventCount }} events
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
            v-if="setupEntries.length"
            class="flex max-h-[42%] shrink-0 flex-col gap-1.5 overflow-y-auto"
          >
            <AnimSetupEntryCard
              v-for="entry in setupEntries"
              :key="entry.id"
              :entry="entry"
              :pose="poseForEntry(entry.id)"
              :wrapper-draft="wrapperAddDraftById[entry.id] ?? ''"
              :get-clip-glb-info="getClipGlbInfo"
              :list-glb-anim-names="listGlbAnimNames"
              @update:priority="(v) => onEntryPriority(entry.id, v)"
              @update:wrapper-draft="(v) => setWrapperAddDraft(entry.id, v)"
              @pick-glb="pickGlbForEntry(entry.id)"
              @clear-glb="props.clearAnimsetGlb(entry.id)"
              @add-wrapper="addEntryWrapper(entry.id)"
              @remove-wrapper="(wn) => removeEntryWrapper(entry.id, wn)"
              @remove="applyRemoveEntry(entry.id)"
            />
          </div>

          <div v-if="clipNames.length" class="flex shrink-0 flex-wrap items-center gap-1.5">
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
              :class="expandedClipName === name ? 'bg-muted/40' : ''"
            >
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left hover:bg-muted/60"
                @click="toggleClipExpand(name)"
              >
                <span
                  class="shrink-0 rounded-sm px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide"
                  :class="
                    isClipActive(name)
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-muted text-muted-foreground'
                  "
                >
                  {{ isClipActive(name) ? 'on' : 'off' }}
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
                v-if="expandedClipName === name && expandedClipDetail"
                class="mx-1 mb-1 mt-0.5 max-h-[40vh] overflow-y-auto rounded-sm border border-border bg-canvas px-2 py-1.5 text-[10px] text-muted-foreground"
              >
                <p class="font-data m-0 mb-1 text-foreground">
                  {{ expandedClipDetail.name }} · {{ expandedClipDetail.duration.toFixed(3) }}s
                  · {{ expandedClipDetail.events.length }} evt
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
                <div v-if="expandedClipSets.length" class="mb-1.5 flex flex-col gap-0.5">
                  <p class="m-0 text-[9px] uppercase tracking-wide text-muted-foreground/80">
                    In sets
                  </p>
                  <div
                    v-for="s in expandedClipSets"
                    :key="s.entryId"
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
                        getClipGlbInfo(name, s.entryId)
                          ? 'bg-violet-500/20 text-violet-300'
                          : 'bg-muted text-muted-foreground'
                      "
                    >
                      <template v-if="getClipGlbInfo(name, s.entryId)">
                        glb {{ getClipGlbInfo(name, s.entryId)!.duration.toFixed(2) }}s
                      </template>
                      <template v-else>no glb</template>
                    </span>
                    <span class="font-data shrink-0 text-[9px]">
                      pri {{ s.priority }} · {{ s.duration.toFixed(2) }}s · {{ s.eventCount }}e
                    </span>
                  </div>
                </div>
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
              </div>
            </div>
          </div>
          <p v-else-if="!clipNames.length" class="m-0 text-[11px] text-muted-foreground">
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
              {{ animDbStats.dbCount }} DB · {{ animDbStats.rowCount }} rows
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
            v-if="animDatabases.length"
            class="flex shrink-0 flex-col gap-1 overflow-y-auto rounded-sm border border-border bg-canvas p-1.5"
            :class="selectedAnimDb ? 'max-h-[30%]' : 'max-h-[50%]'"
          >
            <button
              v-for="db in animDatabases"
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
                @click.stop="props.removeAnimDatabase(db.pathKey)"
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
          <p v-else-if="!animDatabases.length" class="m-0 text-[11px] text-muted-foreground">
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
              {{ rigEntries.length }} loaded · Sample uses active only
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
          <div v-if="rigEntries.length" class="flex shrink-0 flex-col gap-1 overflow-y-auto max-h-[30%]">
            <div
              v-for="entry in rigEntries"
              :key="entry.id"
              class="flex items-center gap-1.5 rounded-sm border border-border/60 px-1.5 py-1"
            >
              <Button
                type="button"
                size="sm"
                :variant="entry.active ? 'default' : 'secondary'"
                class="h-6 shrink-0 rounded-sm px-2 text-[10px]"
                @click="props.setActiveRig(entry.id)"
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
                @click="props.removeRig(entry.id)"
              >
                ×
              </Button>
            </div>
          </div>
          <p v-else class="m-0 text-[11px] text-muted-foreground">
            Load player_woman_skeleton.rig.json (or other animRig) for Sample / masks.
          </p>

          <template v-if="activeRigBones.length">
            <Input
              class="h-7 shrink-0 rounded-sm text-xs"
              placeholder="Filter bones / parts"
              v-model="rigBonesFilter"
            />
            <div class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              <p class="m-0 text-[9px] uppercase tracking-wide text-muted-foreground/80">
                Bones ({{ filteredRigBones.length }}/{{ activeRigBones.length }})
              </p>
              <p
                v-for="bone in filteredRigBones"
                :key="bone"
                class="font-data m-0 truncate px-1 text-[11px]"
              >
                {{ bone }}
              </p>
              <p
                v-if="activeRigParts.length"
                class="m-0 mt-1 text-[9px] uppercase tracking-wide text-muted-foreground/80"
              >
                Parts ({{ filteredRigParts.length }}/{{ activeRigParts.length }})
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
              v-model="entityTagDraft"
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
                  :model-value="entityTags[name] === true"
                  @update:model-value="(v) => onEntityTag(name, v)"
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
import { computed, ref, type Ref } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import {
  Activity,
  Bone,
  Box,
  Database,
  Film,
  Info,
  Layers,
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
import type {
  AnimSetupEntryView,
  ClipLibraryStats,
  ClipMeta,
  ClipSetMembership,
} from '../utils/sim/clipLibrary'
import type { ClipPoseSetView } from '../utils/sim/clipPoseLibrary'
import type { RigEntryView } from '../utils/sim/rigResource'
import { DEFAULT_SIM_FPS } from '../utils/sim/SimClock'
import type { AnimDatabase, AnimDatabaseStats } from '../utils/sim/animDatabase'
import type { SimSnapshot } from '../utils/sim/simTypes'
import { Check, EllipsisVertical, TriangleAlert } from '@lucide/vue'
import {
  openSimSkeletonWindow,
  openSimStatusWindow,
  windowUiStateByType,
  type AppWindowUiState,
} from '../stores/appWindows'
import AnimSetupEntryCard from '@/components/sim/AnimSetupEntryCard.vue'
import {
  PropertyBoolToggle,
  PropertyNumberControl,
  PropertyNumberSlider,
  PropertyVecBlock,
} from '@/components/nodeDetails'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const props = defineProps<{
  snapshot: SimSnapshot
  active: boolean
  discovered: {
    features: Array<{ feature: string; property: string }>
    vectorFeatures?: Array<{ feature: string; property: string }>
    quatFeatures?: Array<{ feature: string; property: string }>
    boolFeatures?: Array<{ feature: string; property: string }>
    floatVars: string[]
    vectorVars?: string[]
    quatVars?: string[]
    boolVars: string[]
    intVars: string[]
    wrappers: string[]
    events: string[]
    tags?: string[]
    entityTags?: string[]
  }
  eventDraft: string
  eventValueDraft: number
  featureDrafts: Record<string, number>
  vectorFeatureDrafts?: Record<string, { x: number; y: number; z: number; w: number }>
  quatFeatureDrafts?: Record<string, { x: number; y: number; z: number; w: number }>
  boolFeatureDrafts?: Record<string, boolean>
  floatVars: Record<string, number>
  vectorVars?: Record<string, { x: number; y: number; z: number; w: number }>
  quatVars?: Record<string, { x: number; y: number; z: number; w: number }>
  boolVars: Record<string, boolean>
  intVars: Record<string, number>
  tagValues: Record<string, number>
  entityTags: Record<string, boolean>
  wrapperWeights: Record<string, number>
  clipStats: ClipLibraryStats
  clipNames: string[]
  setupEntries: AnimSetupEntryView[]
  animDbStats: AnimDatabaseStats
  animDatabases: AnimDatabase[]
  rigEntries: RigEntryView[]
  activeRigBones: string[]
  activeRigParts: string[]
  clipPoseSets: ClipPoseSetView[]
  getClipGlbInfo: (
    clipName: string,
    setupEntryId?: string | null
  ) => { name: string; duration: number } | null
  listGlbAnimNames: (setupEntryId: string) => string[]
  resolveClip: (name: string) => ClipMeta | undefined
  lookupClip: (name: string) => ClipMeta | undefined
  isClipActive: (name: string) => boolean
  listClipSets: (name: string) => ClipSetMembership[]
  loadAnimsetJson: (
    json: unknown,
    sourceLabel?: string,
    options?: { priority?: number; variableNames?: string[] }
  ) => number
  loadAnimsetGlb: (
    buffer: ArrayBuffer,
    sourceLabel: string,
    setupEntryId?: string | null
  ) => Promise<number> | number
  clearAnimsetGlb: (setupEntryId: string) => void
  loadRigJson: (json: unknown, sourceLabel?: string) => string
  removeRig: (id: string) => void
  setActiveRig: (id: string | null) => void
  sampleWarningsEnabled?: boolean
  setSampleWarningsEnabled?: (on: boolean) => void
  updateWarningsEnabled?: boolean
  setUpdateWarningsEnabled?: (on: boolean) => void
  loadAnimDatabaseJson: (json: object, sourceLabel?: string) => string
  removeAnimDatabase: (pathKey: string) => void
  updateSetupEntry: (
    id: string,
    patch: { priority?: number; variableNames?: string[]; tags?: string[] }
  ) => void
  removeSetupEntry: (id: string) => void
  applyFeature: (feature: string, property: string, value: number) => void
  applyBoolFeature?: (feature: string, property: string, value: boolean) => void
  applyVectorFeatureAxis?: (
    feature: string,
    property: string,
    axis: 'x' | 'y' | 'z' | 'w',
    value: number
  ) => void
  applyQuatFeatureAxis?: (
    feature: string,
    property: string,
    axis: 'x' | 'y' | 'z' | 'w',
    value: number
  ) => void
  applyFloatVar: (name: string, value: number) => void
  applyVectorVarAxis?: (name: string, axis: 'x' | 'y' | 'z' | 'w', value: number) => void
  resolveVectorVarValue?: (name: string) => { x: number; y: number; z: number; w: number }
  applyQuatVarAxis?: (name: string, axis: 'x' | 'y' | 'z' | 'w', value: number) => void
  resolveQuatVarValue?: (name: string) => { x: number; y: number; z: number; w: number }
  applyBoolVar: (name: string, value: boolean) => void
  applyIntVar: (name: string, value: number) => void
  applyTagValue: (name: string, value: number) => void
  applyEntityTag: (name: string, present: boolean) => void
  removeEntityTag: (name: string) => void
  applyWrapperWeight: (name: string, value: number) => void
  resolveFeatureValue: (feature: string, property: string) => number
  resolveBoolFeatureValue?: (feature: string, property: string) => boolean
  resolveVectorFeatureValue?: (
    feature: string,
    property: string
  ) => { x: number; y: number; z: number; w: number }
  resolveQuatFeatureValue?: (
    feature: string,
    property: string
  ) => { x: number; y: number; z: number; w: number }
}>()

const emit = defineEmits<{
  'update:eventDraft': [string]
  'update:eventValueDraft': [number]
  toggle: []
  'toggle-active': []
  step: []
  reset: []
  setSpeed: [number]
  fireExternal: [string?]
  fireAnimEvent: [name?: string, value?: number]
  fireAnimEnd: []
}>()

const activeTab = ref<'events' | 'values' | 'resources'>('events')
const valuesSubTab = ref<'features' | 'vars' | 'wrappers' | 'tags'>('features')
const resourcesSubTab = ref<'sets' | 'db' | 'rig' | 'entity'>('sets')
const eventValueEnabled = ref(false)

function onFireAnimEvent() {
  const value =
    eventValueEnabled.value && Number.isFinite(props.eventValueDraft)
      ? props.eventValueDraft
      : undefined
  emit('fireAnimEvent', undefined, value)
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
const entityTagDraft = ref('')
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
const expandedClipName = ref('')
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
const wrapperAddDraftById = ref<Record<string, string>>({})

const clipPoseAnimCount = computed(() =>
  (props.clipPoseSets ?? []).reduce((n, s) => n + s.animCount, 0)
)

const poseByEntryId = computed(() => {
  const m = new Map<string, (typeof props.clipPoseSets)[number]>()
  for (const s of props.clipPoseSets ?? []) {
    if (s.setupEntryId) m.set(s.setupEntryId, s)
  }
  return m
})

const poseForEntry = (entryId: string) => poseByEntryId.value.get(entryId)

const matchesQuery = (text: string, query: string) => {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return text.toLowerCase().includes(q)
}

/** Sim HUD frame index (matches Step = 1/60s). Anim content stays 30fps separately. */
const simFrame = computed(() => Math.floor(props.snapshot.time * DEFAULT_SIM_FPS))

const localeCmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })

const filteredEvents = computed(() =>
  props.discovered.events
    .filter((ev) => matchesQuery(ev, eventsFilter.value))
    .slice()
    .sort(localeCmp)
)
const vector4Axes = ['X', 'Y', 'Z', 'W'] as const

const featuresTabCount = computed(
  () =>
    props.discovered.features.length +
    (props.discovered.vectorFeatures?.length ?? 0) +
    (props.discovered.quatFeatures?.length ?? 0) +
    (props.discovered.boolFeatures?.length ?? 0)
)

const filteredFeatures = computed(() =>
  props.discovered.features
    .filter((f) => matchesQuery(`${f.feature}.${f.property}`, featuresFilter.value))
    .slice()
    .sort((a, b) => {
      const byFeat = localeCmp(a.feature, b.feature)
      if (byFeat !== 0) return byFeat
      return localeCmp(a.property, b.property)
    })
)

const filteredBoolFeatures = computed(() =>
  (props.discovered.boolFeatures ?? [])
    .filter((f) => matchesQuery(`${f.feature}.${f.property}`, featuresFilter.value))
    .slice()
    .sort((a, b) => {
      const byFeat = localeCmp(a.feature, b.feature)
      if (byFeat !== 0) return byFeat
      return localeCmp(a.property, b.property)
    })
)

const filteredVectorFeatures = computed(() =>
  (props.discovered.vectorFeatures ?? [])
    .filter((f) => matchesQuery(`${f.feature}.${f.property}`, featuresFilter.value))
    .slice()
    .sort((a, b) => {
      const byFeat = localeCmp(a.feature, b.feature)
      if (byFeat !== 0) return byFeat
      return localeCmp(a.property, b.property)
    })
)

const filteredQuatFeatures = computed(() =>
  (props.discovered.quatFeatures ?? [])
    .filter((f) => matchesQuery(`${f.feature}.${f.property}`, featuresFilter.value))
    .slice()
    .sort((a, b) => {
      const byFeat = localeCmp(a.feature, b.feature)
      if (byFeat !== 0) return byFeat
      return localeCmp(a.property, b.property)
    })
)
const filteredFloatVars = computed(() =>
  props.discovered.floatVars
    .filter((name) => matchesQuery(name, varsFilter.value))
    .slice()
    .sort(localeCmp)
)
const filteredVectorVars = computed(() =>
  (props.discovered.vectorVars ?? [])
    .filter((name) => matchesQuery(name, varsFilter.value))
    .slice()
    .sort(localeCmp)
)
const filteredQuatVars = computed(() =>
  (props.discovered.quatVars ?? [])
    .filter((name) => matchesQuery(name, varsFilter.value))
    .slice()
    .sort(localeCmp)
)
const filteredBoolVars = computed(() =>
  (props.discovered.boolVars ?? [])
    .filter((name) => matchesQuery(name, varsFilter.value))
    .slice()
    .sort(localeCmp)
)
const filteredIntVars = computed(() =>
  (props.discovered.intVars ?? [])
    .filter((name) => matchesQuery(name, varsFilter.value))
    .slice()
    .sort(localeCmp)
)
const filteredTagVars = computed(() =>
  (props.discovered.tags ?? [])
    .filter((name) => matchesQuery(name, tagsFilter.value))
    .slice()
    .sort(localeCmp)
)
const filteredEntityTags = computed(() =>
  (props.discovered.entityTags ?? [])
    .filter((name) => matchesQuery(name, entityTagsFilter.value))
    .slice()
    .sort(localeCmp)
)
const varsCount = computed(
  () =>
    props.discovered.floatVars.length +
    (props.discovered.vectorVars?.length ?? 0) +
    (props.discovered.quatVars?.length ?? 0) +
    (props.discovered.boolVars?.length ?? 0) +
    (props.discovered.intVars?.length ?? 0)
)
const hasAnyTagValues = computed(() => (props.discovered.tags?.length ?? 0) > 0)
const hasAnyEntityTags = computed(() => (props.discovered.entityTags?.length ?? 0) > 0)
const entityTagsCount = computed(() => props.discovered.entityTags?.length ?? 0)
const tagsCount = computed(() => props.discovered.tags?.length ?? 0)
const hasAnyVars = computed(() => varsCount.value > 0)
const hasFilteredVars = computed(
  () =>
    filteredFloatVars.value.length > 0 ||
    filteredVectorVars.value.length > 0 ||
    filteredQuatVars.value.length > 0 ||
    filteredBoolVars.value.length > 0 ||
    filteredIntVars.value.length > 0
)
const filteredWrappers = computed(() =>
  props.discovered.wrappers
    .filter((name) => matchesQuery(name, wrappersFilter.value))
    .slice()
    .sort(localeCmp)
)
const filteredClips = computed(() => {
  const q = clipsFilter.value
  return props.clipNames.filter((name) => {
    if (!matchesQuery(name, q)) return false
    if (clipsActiveFilter.value === 'all') return true
    const on = props.isClipActive(name)
    return clipsActiveFilter.value === 'active' ? on : !on
  })
})

const formatAnimDbInputs = (inputs: Array<number | string>) =>
  inputs.map((v) => String(v)).join(',')

const selectedAnimDb = computed(() => {
  const list = props.animDatabases ?? []
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

const expandedClipDetail = computed(() =>
  expandedClipName.value ? props.lookupClip(expandedClipName.value) : undefined
)
const expandedClipIsActive = computed(() =>
  expandedClipName.value ? props.isClipActive(expandedClipName.value) : false
)
const expandedClipSets = computed(() =>
  expandedClipName.value ? props.listClipSets(expandedClipName.value) : []
)
const expandedClipGlb = computed(() => {
  const name = expandedClipName.value
  if (!name) return null
  const win = expandedClipSets.value.find((s) => s.resolves)
  return props.getClipGlbInfo(name, win?.entryId ?? null)
})

const clipHasGlb = (name: string) => {
  const win = props.listClipSets(name).find((s) => s.resolves)
  if (win) return props.getClipGlbInfo(name, win.entryId) != null
  // gated / no winner — any linked set still useful as existence hint
  return props.getClipGlbInfo(name) != null
}

const filteredRigBones = computed(() => {
  const q = rigBonesFilter.value
  return (props.activeRigBones ?? []).filter((b) => matchesQuery(b, q))
})

const filteredRigParts = computed(() => {
  const q = rigBonesFilter.value
  return (props.activeRigParts ?? []).filter((p) => matchesQuery(p, q))
})

const toggleClipExpand = (name: string) => {
  expandedClipName.value = expandedClipName.value === name ? '' : name
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

const hasActiveRig = computed(() => (props.activeRigBones?.length ?? 0) > 0)

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
  activeTab.value = 'resources'
  resourcesSubTab.value = 'rig'
}

const onSkeletonClick = () => {
  if (!hasActiveRig.value) return
  openSimSkeletonWindow()
}

const featureValue = (feature: string, property: string) =>
  props.resolveFeatureValue(feature, property)

const boolFeatureValue = (feature: string, property: string) =>
  props.resolveBoolFeatureValue?.(feature, property) === true

const vectorFeatureTarget = (feature: string, property: string) => {
  const v = props.resolveVectorFeatureValue?.(feature, property) ?? {
    x: 0,
    y: 0,
    z: 0,
    w: 0,
  }
  // PropertyVecBlock expects engine-style axis keys (X/Y/Z/W)
  return { X: v.x, Y: v.y, Z: v.z, W: v.w }
}

const quatFeatureTarget = (feature: string, property: string) => {
  const v = props.resolveQuatFeatureValue?.(feature, property) ?? {
    x: 0,
    y: 0,
    z: 0,
    w: 1,
  }
  return { X: v.x, Y: v.y, Z: v.z, W: v.w }
}

const formatClipDur = (name: string) => {
  const c = props.lookupClip(name)
  return c ? `${c.duration.toFixed(2)}s` : '—'
}

const onFeatureValue = (feature: string, property: string, raw: string | number) => {
  const value = Number(raw)
  if (!Number.isFinite(value)) return
  props.applyFeature(feature, property, value)
}

const onBoolFeatureValue = (feature: string, property: string, value: boolean) => {
  props.applyBoolFeature?.(feature, property, value === true)
}

const onVectorFeatureAxis = (
  feature: string,
  property: string,
  axis: string,
  raw: string | number
) => {
  const value = Number(raw)
  if (!Number.isFinite(value)) return
  const key = axis.toLowerCase()
  if (key !== 'x' && key !== 'y' && key !== 'z' && key !== 'w') return
  props.applyVectorFeatureAxis?.(feature, property, key, value)
}

const onQuatFeatureAxis = (
  feature: string,
  property: string,
  axis: string,
  raw: string | number
) => {
  const value = Number(raw)
  if (!Number.isFinite(value)) return
  const key = axis.toLowerCase()
  if (key !== 'x' && key !== 'y' && key !== 'z' && key !== 'w') return
  props.applyQuatFeatureAxis?.(feature, property, key, value)
}

const onFloatValue = (name: string, raw: string | number) => {
  const value = Number(raw)
  if (!Number.isFinite(value)) return
  props.applyFloatVar(name, value)
}

const vectorVarTarget = (name: string) => {
  const v = props.resolveVectorVarValue?.(name) ??
    props.vectorVars?.[name] ?? { x: 0, y: 0, z: 0, w: 0 }
  return { X: v.x, Y: v.y, Z: v.z, W: v.w }
}

const onVectorVarAxis = (name: string, axis: string, raw: string | number) => {
  const value = Number(raw)
  if (!Number.isFinite(value)) return
  const key = axis.toLowerCase()
  if (key !== 'x' && key !== 'y' && key !== 'z' && key !== 'w') return
  props.applyVectorVarAxis?.(name, key, value)
}

const quatVarTarget = (name: string) => {
  const v = props.resolveQuatVarValue?.(name) ??
    props.quatVars?.[name] ?? { x: 0, y: 0, z: 0, w: 1 }
  return { X: v.x, Y: v.y, Z: v.z, W: v.w }
}

const onQuatVarAxis = (name: string, axis: string, raw: string | number) => {
  const value = Number(raw)
  if (!Number.isFinite(value)) return
  const key = axis.toLowerCase()
  if (key !== 'x' && key !== 'y' && key !== 'z' && key !== 'w') return
  props.applyQuatVarAxis?.(name, key, value)
}

const onIntValue = (name: string, raw: string | number) => {
  const value = Number(raw)
  if (!Number.isFinite(value)) return
  props.applyIntVar(name, value)
}

const onBoolValue = (name: string, value: boolean) => {
  props.applyBoolVar(name, value)
}

const onTagValue = (name: string, raw: string | number) => {
  const value = Number(raw)
  if (!Number.isFinite(value)) return
  props.applyTagValue(name, value)
}

const onEntityTag = (name: string, present: boolean) => {
  props.applyEntityTag(name, present)
}

const onAddEntityTag = () => {
  const name = entityTagDraft.value.trim()
  if (!name || name === 'None') return
  props.applyEntityTag(name, true)
  entityTagDraft.value = ''
}

const onRemoveEntityTag = (name: string) => {
  props.removeEntityTag(name)
}

const onWrapperWeight = (name: string, raw: string | number) => {
  const value = Number(raw)
  if (!Number.isFinite(value)) return
  props.applyWrapperWeight(name, value)
}

/** Display/edit sim clock speed as frames per second (1× = DEFAULT_SIM_FPS). */
const simSpeedFps = computed(() => props.snapshot.speed * DEFAULT_SIM_FPS)

const onSpeedFps = (fps: number) => {
  if (!Number.isFinite(fps)) return
  emit('setSpeed', fps / DEFAULT_SIM_FPS)
}

const onEntryPriority = (id: string, raw: string | number) => {
  const value = Number(raw)
  if (!Number.isFinite(value)) return
  props.updateSetupEntry(id, { priority: value })
}

const setWrapperAddDraft = (id: string, raw: string) => {
  wrapperAddDraftById.value = { ...wrapperAddDraftById.value, [id]: raw }
}

const addEntryWrapper = (id: string) => {
  const entry = props.setupEntries.find((e) => e.id === id)
  if (!entry) return
  const name = (wrapperAddDraftById.value[id] ?? '').trim()
  if (!name || name === 'None') return
  if (entry.variableNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
    wrapperAddDraftById.value = { ...wrapperAddDraftById.value, [id]: '' }
    return
  }
  props.updateSetupEntry(id, { variableNames: [...entry.variableNames, name] })
  wrapperAddDraftById.value = { ...wrapperAddDraftById.value, [id]: '' }
}

const removeEntryWrapper = (id: string, name: string) => {
  const entry = props.setupEntries.find((e) => e.id === id)
  if (!entry) return
  props.updateSetupEntry(id, {
    variableNames: entry.variableNames.filter((n) => n !== name),
  })
}

const applyRemoveEntry = (id: string) => {
  props.removeSetupEntry(id)
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
    const n = props.loadAnimsetJson(json, file.name)
    if (!n) clipsError.value = 'No clips found in file'
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
    const n = await props.loadAnimsetGlb(buf, file.name, setupId)
    if (!n) clipsError.value = 'No animations found in GLB'
  } catch (err) {
    clipsError.value = err instanceof Error ? err.message : String(err)
  }
}

const pickGlbForEntry = (entryId: string) => {
  glbTargetEntryId.value = entryId
  animsetGlbFileInput.value?.click()
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
    props.loadRigJson(json, file.name)
    resourcesSubTab.value = 'rig'
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
    const pathKey = props.loadAnimDatabaseJson(json, file.name)
    if (!pathKey) animDbError.value = 'No rows found in anim database'
    else {
      resourcesSubTab.value = 'db'
      selectedAnimDbKey.value = pathKey
    }
  } catch (err) {
    animDbError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>
