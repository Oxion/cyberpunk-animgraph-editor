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
      <Button
        type="button"
        size="sm"
        :variant="active ? 'default' : 'secondary'"
        class="ml-auto h-7 rounded-sm px-2.5 text-xs"
        @click="emit('toggle-active')"
      >
        {{ active ? 'Deactivate' : 'Activate' }}
      </Button>
    </div>

    <div class="flex shrink-0 flex-wrap items-center gap-3 text-muted-foreground">
      <span class="font-data">t={{ snapshot.time.toFixed(2) }}s · f={{ simFrame }}</span>
      <div class="flex min-w-[160px] flex-1 items-center gap-2">
        <Label class="shrink-0 text-[11px] text-muted-foreground">Speed</Label>
        <Slider
          class="flex-1"
          :model-value="[snapshot.speed]"
          :min="0.25"
          :max="4"
          :step="0.25"
          @update:model-value="onSpeedSlider"
        />
        <span class="font-data w-10 shrink-0 text-right">{{ snapshot.speed.toFixed(2) }}×</span>
      </div>
    </div>

    <div
      class="max-h-40 shrink-0 overflow-y-auto rounded-sm border border-border bg-canvas px-2 py-1.5 text-[11px] text-muted-foreground"
    >
      <div v-if="!statusRows.length" class="font-data text-muted-foreground/70">No active path</div>
      <div v-else class="flex flex-col gap-1">
        <div
          v-for="row in statusRows"
          :key="row.key"
          class="flex min-w-0 items-baseline gap-2"
        >
          <span class="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/80">
            {{ row.kind }}
          </span>
          <span class="font-data min-w-0 flex-1 truncate text-foreground" :title="row.detail">
            {{ row.label }}
          </span>
          <span
            v-if="row.meta"
            class="font-data shrink-0 text-[10px]"
            :class="row.tone === 'danger' ? 'text-destructive' : row.tone === 'warn' ? 'text-amber-500' : ''"
          >{{ row.meta }}</span>
        </div>
      </div>
      <div
        v-if="statusFoot.length"
        class="mt-1 flex flex-wrap gap-1 border-t border-border/60 pt-1"
      >
        <span
          v-for="chip in statusFoot"
          :key="chip"
          class="font-data rounded-sm bg-muted/50 px-1 py-0.5 text-[10px]"
        >
          {{ chip }}
        </span>
      </div>
    </div>

    <Tabs v-model="activeTab" class="flex min-h-0 flex-1 flex-col gap-1.5">
      <TabsList class="grid h-8 w-full shrink-0 grid-cols-3 rounded-sm bg-muted/60 p-0.5">
        <TabsTrigger value="events" class="h-7 rounded-sm px-1 text-[11px]">
          Events
        </TabsTrigger>
        <TabsTrigger value="values" class="h-7 rounded-sm px-1 text-[11px]">
          Values
        </TabsTrigger>
        <TabsTrigger value="resources" class="h-7 rounded-sm px-1 text-[11px]">
          Resources
        </TabsTrigger>
      </TabsList>

      <TabsContent value="events" class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
        <div class="flex shrink-0 flex-wrap items-center gap-1.5">
          <Input
            class="h-7 min-w-[80px] flex-1 rounded-sm text-xs"
            placeholder="event name"
            :model-value="eventDraft"
            @update:model-value="(v) => emit('update:eventDraft', String(v ?? ''))"
          />
          <Button type="button" size="sm" variant="secondary" class="h-7 rounded-sm px-2 text-xs" @click="emit('fireExternal')">
            Ext
          </Button>
          <Button type="button" size="sm" variant="secondary" class="h-7 rounded-sm px-2 text-xs" @click="emit('fireAnimEvent')">
            Anim
          </Button>
          <Button type="button" size="sm" variant="secondary" class="h-7 rounded-sm px-2 text-xs" @click="emit('fireAnimEnd')">
            AnimEnd
          </Button>
        </div>
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
          <TabsList class="grid h-8 w-full shrink-0 grid-cols-4 rounded-sm bg-muted/60 p-0.5">
            <TabsTrigger value="features" class="h-7 rounded-sm px-1 text-[11px]">
              Features
              <span v-if="discovered.features.length" class="ml-1 opacity-70">{{ discovered.features.length }}</span>
            </TabsTrigger>
            <TabsTrigger value="vars" class="h-7 rounded-sm px-1 text-[11px]">
              Vars
              <span v-if="varsCount" class="ml-1 opacity-70">{{ varsCount }}</span>
            </TabsTrigger>
            <TabsTrigger value="wrappers" class="h-7 rounded-sm px-1 text-[11px]">
              Wrap
              <span v-if="discovered.wrappers.length" class="ml-1 opacity-70">{{ discovered.wrappers.length }}</span>
            </TabsTrigger>
            <TabsTrigger value="tags" class="h-7 rounded-sm px-1 text-[11px]">
              Tags
              <span v-if="tagsCount" class="ml-1 opacity-70">{{ tagsCount }}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="features" class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
            <Input
              v-if="discovered.features.length"
              class="h-7 shrink-0 rounded-sm text-xs"
              placeholder="Filter features"
              v-model="featuresFilter"
            />
            <div v-if="filteredFeatures.length" class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              <PropertyNumberControl
                v-for="f in filteredFeatures"
                :key="`${f.feature}.${f.property}`.toLowerCase()"
                :label="`${f.feature}.${f.property}`"
                :model-value="featureValue(f.feature, f.property)"
                :decimals="2"
                @update:model-value="(v) => onFeatureValue(f.feature, f.property, v)"
              />
            </div>
            <p v-else-if="discovered.features.length" class="m-0 text-[11px] text-muted-foreground">No matching features</p>
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
            <p v-else class="m-0 text-[11px] text-muted-foreground">No float / int / bool vars</p>
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
              v-if="hasAnyTags"
              class="h-7 shrink-0 rounded-sm text-xs"
              placeholder="Filter tags"
              v-model="tagsFilter"
            />
            <div v-if="filteredTagVars.length" class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              <div v-for="name in filteredTagVars" :key="`t-${name}`" class="flex items-center gap-2">
                <Label class="min-w-0 flex-1 truncate text-[11px] font-normal text-muted-foreground">{{ name }}</Label>
                <Input
                  type="number"
                  step="0.1"
                  class="h-7 w-[72px] shrink-0 rounded-sm text-xs"
                  :model-value="tagValues[name] ?? 0"
                  @update:model-value="(v) => onTagValue(name, v)"
                />
              </div>
            </div>
            <p v-else-if="hasAnyTags" class="m-0 text-[11px] text-muted-foreground">No matching tags</p>
            <p v-else class="m-0 text-[11px] text-muted-foreground">
              No TagValue tags from graph
            </p>
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="resources" class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
        <Tabs v-model="resourcesSubTab" class="flex min-h-0 flex-1 flex-col gap-1.5">
          <TabsList class="grid h-8 w-full shrink-0 grid-cols-2 rounded-sm bg-muted/60 p-0.5">
            <TabsTrigger value="sets" class="h-7 rounded-sm px-1 text-[11px]">
              Anim sets
              <span v-if="clipStats.entryCount" class="ml-1 opacity-70">{{ clipStats.entryCount }}</span>
            </TabsTrigger>
            <TabsTrigger value="db" class="h-7 rounded-sm px-1 text-[11px]">
              Anim DB
              <span v-if="animDbStats.dbCount" class="ml-1 opacity-70">{{ animDbStats.dbCount }}</span>
            </TabsTrigger>
          </TabsList>

        <!-- Anim sets -->
        <TabsContent value="sets" class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
          <div class="flex shrink-0 flex-wrap items-center gap-1.5">
            <input
              ref="animsetFileInput"
              type="file"
              accept=".json,application/json"
              class="hidden"
              @change="onAnimsetFile"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              class="h-7 rounded-sm px-2 text-xs"
              @click="animsetFileInput?.click()"
            >
              Load .anims.json
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              class="h-7 rounded-sm px-2 text-xs"
              :disabled="!clipStats.entryCount"
              @click="emit('clearClips')"
            >
              Clear sets
            </Button>
          </div>
          <p v-if="clipsError" class="m-0 text-[11px] text-destructive">{{ clipsError }}</p>
          <p class="font-data m-0 text-[11px] text-muted-foreground">
            {{ clipStats.entryCount }} sets · {{ clipStats.clipCount }} clips ·
            {{ clipStats.eventCount }} events
          </p>

          <div
            v-if="setupEntries.length"
            class="flex max-h-[42%] shrink-0 flex-col gap-1.5 overflow-y-auto rounded-sm border border-border bg-canvas p-1.5"
          >
            <div
              v-for="entry in setupEntries"
              :key="entry.id"
              class="rounded-sm border border-border/60 px-1.5 py-1.5"
            >
              <div class="flex items-center gap-1.5">
                <span
                  class="shrink-0 rounded-sm px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide"
                  :class="
                    entry.active
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-muted text-muted-foreground'
                  "
                >
                  {{ entry.active ? 'active' : 'off' }}
                </span>
                <span class="min-w-0 flex-1 truncate text-[11px]" :title="entry.sourceLabel">
                  {{ entry.sourceLabel }}
                </span>
                <span class="font-data shrink-0 text-[10px] text-muted-foreground">
                  {{ entry.clipCount }}
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  class="h-5 w-5 shrink-0 rounded-sm p-0 text-[10px] text-muted-foreground"
                  title="Remove entry"
                  @click="applyRemoveEntry(entry.id)"
                >
                  ×
                </Button>
              </div>

              <div class="mt-1.5">
                <PropertyNumberSlider
                  label="Priority"
                  :model-value="entry.priority"
                  :value-min="0"
                  :value-max="255"
                  :slider-min="0"
                  :slider-max="255"
                  :step="1"
                  :decimals="0"
                  @update:model-value="(v) => onEntryPriority(entry.id, v)"
                />
              </div>

              <div class="mt-1.5 flex flex-col gap-1">
                <Label class="text-[10px] text-muted-foreground">Set tags</Label>
                <div v-if="entry.tags?.length" class="flex flex-wrap content-start gap-1">
                  <span
                    v-for="tg in entry.tags"
                    :key="tg"
                    class="font-data rounded-sm bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    :title="tg"
                  >
                    {{ tg }}
                  </span>
                </div>
                <p v-else class="m-0 text-[10px] text-muted-foreground">No set tags</p>
              </div>

              <div class="mt-1.5 flex flex-col gap-1">
                <Label class="text-[10px] text-muted-foreground">Wrappers (variableNames)</Label>
                <div class="flex items-center gap-1">
                  <Input
                    class="h-7 min-w-0 flex-1 rounded-sm text-xs"
                    placeholder="wrapper name"
                    :model-value="wrapperAddDraftById[entry.id] ?? ''"
                    @update:model-value="(v) => setWrapperAddDraft(entry.id, String(v ?? ''))"
                    @keydown.enter.prevent="addEntryWrapper(entry.id)"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    class="h-7 shrink-0 rounded-sm px-2 text-xs"
                    @click="addEntryWrapper(entry.id)"
                  >
                    +
                  </Button>
                </div>
                <div
                  v-if="entry.variableNames.length"
                  class="flex flex-wrap content-start gap-1"
                >
                  <Button
                    v-for="wn in entry.variableNames"
                    :key="wn"
                    type="button"
                    size="xs"
                    variant="outline"
                    class="h-6 rounded-sm px-2 text-[11px]"
                    :title="`Remove ${wn}`"
                    @click="removeEntryWrapper(entry.id, wn)"
                  >
                    {{ wn }} ×
                  </Button>
                </div>
                <p v-else class="m-0 text-[10px] text-muted-foreground">
                  Empty = always active
                </p>
              </div>
            </div>
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
          <div class="flex shrink-0 flex-wrap items-center gap-1.5">
            <input
              ref="animDbFileInput"
              type="file"
              accept=".json,application/json"
              class="hidden"
              @change="onAnimDbFile"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              class="h-7 rounded-sm px-2 text-xs"
              @click="animDbFileInput?.click()"
            >
              Load .csv.json
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              class="h-7 rounded-sm px-2 text-xs"
              :disabled="!animDbStats.dbCount"
              @click="emit('clearAnimDb')"
            >
              Clear DBs
            </Button>
          </div>
          <p v-if="animDbError" class="m-0 text-[11px] text-destructive">{{ animDbError }}</p>
          <p class="font-data m-0 text-[11px] text-muted-foreground">
            {{ animDbStats.dbCount }} DB · {{ animDbStats.rowCount }} rows
          </p>

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
        </Tabs>
      </TabsContent>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type {
  AnimSetupEntryView,
  ClipLibraryStats,
  ClipMeta,
  ClipSetMembership,
} from '../utils/sim/clipLibrary'
import { DEFAULT_SIM_FPS } from '../utils/sim/SimClock'
import type { AnimDatabase, AnimDatabaseStats } from '../utils/sim/animDatabase'
import type { SimSnapshot } from '../utils/sim/simTypes'
import { SimInputBoard } from '../utils/sim/SimInputBoard'
import {
  PropertyBoolToggle,
  PropertyNumberControl,
  PropertyNumberSlider,
} from '@/components/nodeDetails'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const props = defineProps<{
  snapshot: SimSnapshot
  active: boolean
  discovered: {
    features: Array<{ feature: string; property: string }>
    floatVars: string[]
    boolVars: string[]
    intVars: string[]
    wrappers: string[]
    events: string[]
  tags?: string[]
  }
  eventDraft: string
  featureDrafts: Record<string, number>
  floatVars: Record<string, number>
  boolVars: Record<string, boolean>
  intVars: Record<string, number>
  tagValues: Record<string, number>
  wrapperWeights: Record<string, number>
  clipStats: ClipLibraryStats
  clipNames: string[]
  setupEntries: AnimSetupEntryView[]
  animDbStats: AnimDatabaseStats
  animDatabases: AnimDatabase[]
  resolveClip: (name: string) => ClipMeta | undefined
  lookupClip: (name: string) => ClipMeta | undefined
  isClipActive: (name: string) => boolean
  listClipSets: (name: string) => ClipSetMembership[]
  loadAnimsetJson: (
    json: unknown,
    sourceLabel?: string,
    options?: { priority?: number; variableNames?: string[] }
  ) => number
  loadAnimDatabaseJson: (json: object, sourceLabel?: string) => string
  removeAnimDatabase: (pathKey: string) => void
  updateSetupEntry: (
    id: string,
    patch: { priority?: number; variableNames?: string[]; tags?: string[] }
  ) => void
  removeSetupEntry: (id: string) => void
  applyFeature: (feature: string, property: string, value: number) => void
  applyFloatVar: (name: string, value: number) => void
  applyBoolVar: (name: string, value: boolean) => void
  applyIntVar: (name: string, value: number) => void
  applyTagValue: (name: string, value: number) => void
  applyWrapperWeight: (name: string, value: number) => void
  resolveFeatureValue: (feature: string, property: string) => number
}>()

const emit = defineEmits<{
  'update:eventDraft': [string]
  toggle: []
  'toggle-active': []
  step: []
  reset: []
  setSpeed: [number]
  fireExternal: [string?]
  fireAnimEvent: [string?]
  fireAnimEnd: []
  clearClips: []
  clearAnimDb: []
}>()

const activeTab = ref<'events' | 'values' | 'resources'>('events')
const valuesSubTab = ref<'features' | 'vars' | 'wrappers' | 'tags'>('features')
const resourcesSubTab = ref<'sets' | 'db'>('sets')
const eventsFilter = ref('')
const featuresFilter = ref('')
const varsFilter = ref('')
const tagsFilter = ref('')
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
const animsetFileInput = ref<HTMLInputElement | null>(null)
const animDbFileInput = ref<HTMLInputElement | null>(null)
/** Per-entry draft for adding a wrapper name chip. */
const wrapperAddDraftById = ref<Record<string, string>>({})

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
const filteredFloatVars = computed(() =>
  props.discovered.floatVars
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
const varsCount = computed(
  () =>
    props.discovered.floatVars.length +
    (props.discovered.boolVars?.length ?? 0) +
    (props.discovered.intVars?.length ?? 0)
)
const tagsCount = computed(() => props.discovered.tags?.length ?? 0)
const hasAnyVars = computed(() => varsCount.value > 0)
const hasAnyTags = computed(() => tagsCount.value > 0)
const hasFilteredVars = computed(
  () =>
    filteredFloatVars.value.length > 0 ||
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

const toggleClipExpand = (name: string) => {
  expandedClipName.value = expandedClipName.value === name ? '' : name
}

type StatusRow = {
  key: string
  kind: string
  label: string
  meta?: string
  detail?: string
  tone?: 'danger' | 'warn'
}

/** Compact HUD rows — all active clips + SMs (scroll in panel). */
const statusRows = computed((): StatusRow[] => {
  const rows: StatusRow[] = []
  const st = props.snapshot.status
  if (st?.rootHandleId) {
    rows.push({
      key: 'root',
      kind: 'root',
      label: st.rootHandleId,
      detail: st.rootHandleId,
    })
  }
  for (const c of st?.clips ?? []) {
    const resolve = c.resolve ?? 'ok'
    let meta: string
    let tone: StatusRow['tone']
    if (resolve === 'ok') {
      meta = `${c.time.toFixed(2)}s · ${(c.progress * 100).toFixed(0)}%`
    } else if (resolve === 'gated') {
      meta = 'GATED'
      tone = 'warn'
    } else if (resolve === 'no-lib') {
      meta = 'NO LIB'
      tone = 'warn'
    } else if (resolve === 'no-db') {
      meta = 'NO DB'
      tone = 'warn'
    } else if (resolve === 'empty') {
      meta = 'EMPTY'
      tone = 'danger'
    } else {
      meta = 'MISSING'
      tone = 'danger'
    }
    rows.push({
      key: `clip-${c.handleId}`,
      kind: 'clip',
      label: `${c.animName} · #${c.handleId}`,
      meta,
      tone,
      detail: `${c.animName} @ ${c.handleId} (${resolve})`,
    })
  }
  const nodes = props.snapshot.nodes
  for (const [id, sm] of Object.entries(props.snapshot.sms)) {
    if (!nodes[id]?.active) continue
    const trans = sm.isInTransition
      ? `→${sm.targetStateIndex ?? '?'} ${(sm.transitionProgress * 100).toFixed(0)}%`
      : undefined
    const bits: string[] = []
    if (sm.eligibleTransitionIds.length) bits.push(`elig ${sm.eligibleTransitionIds.length}`)
    if (sm.instantChainLength > 1) bits.push(`×${sm.instantChainLength}`)
    rows.push({
      key: `sm-${id}`,
      kind: 'sm',
      label: `${id} · state ${sm.activeStateIndex}`,
      meta: [trans, bits.join(' ')].filter(Boolean).join(' · ') || undefined,
      detail: id,
    })
  }
  return rows
})

const statusFoot = computed((): string[] => {
  const chips: string[] = []
  let wraps = 0
  for (const [name, val] of Object.entries(props.wrapperWeights)) {
    if ((val ?? 0) < SimInputBoard.WRAPPER_ACTIVE_THRESHOLD) continue
    chips.push(`w:${name}`)
    if (++wraps >= 4) break
  }
  let feats = 0
  for (const [key, val] of Object.entries(props.featureDrafts)) {
    const n = Number(val)
    if (!Number.isFinite(n) || n === 0) continue
    const sep = key.indexOf('\0')
    const label = sep >= 0 ? `${key.slice(0, sep)}.${key.slice(sep + 1)}` : key
    chips.push(`${label}=${n}`)
    if (++feats >= 4) break
  }
  const activeSets = props.setupEntries.filter((e) => e.active).length
  if (props.clipStats.entryCount) {
    chips.push(`sets ${activeSets}/${props.clipStats.entryCount}`)
  }
  return chips
})

const featureValue = (feature: string, property: string) =>
  props.resolveFeatureValue(feature, property)

const formatClipDur = (name: string) => {
  const c = props.lookupClip(name)
  return c ? `${c.duration.toFixed(2)}s` : '—'
}

const onFeatureValue = (feature: string, property: string, raw: string | number) => {
  const value = Number(raw)
  if (!Number.isFinite(value)) return
  props.applyFeature(feature, property, value)
}

const onFloatValue = (name: string, raw: string | number) => {
  const value = Number(raw)
  if (!Number.isFinite(value)) return
  props.applyFloatVar(name, value)
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

const onWrapperWeight = (name: string, raw: string | number) => {
  const value = Number(raw)
  if (!Number.isFinite(value)) return
  props.applyWrapperWeight(name, value)
}

const onSpeedSlider = (value: number[] | undefined) => {
  const n = value?.[0]
  if (typeof n === 'number' && Number.isFinite(n)) emit('setSpeed', n)
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
