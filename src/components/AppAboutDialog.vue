<script setup lang="ts">
import { Workflow } from 'lucide-vue-next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import pkg from '../../package.json'

const open = defineModel<boolean>('open', { default: false })

const appName = pkg.build?.productName ?? 'Animgraph Editor'
const version = pkg.version
const author = pkg.author
const license = pkg.license
const githubUrl = 'https://github.com/Oxion'
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent
      class="w-[min(22rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] gap-3 rounded-sm border-border bg-card p-4 sm:max-w-[22rem]"
    >
      <DialogHeader class="flex flex-row items-start gap-2.5 space-y-0 text-left">
        <Workflow class="mt-0.5 size-7 shrink-0 text-foreground" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <DialogTitle class="text-[15px] leading-tight">
            {{ appName }}
          </DialogTitle>
          <DialogDescription class="text-[11px] leading-snug">
            About this application
          </DialogDescription>
        </div>
      </DialogHeader>

      <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt class="text-muted-foreground">Version</dt>
        <dd class="m-0 font-mono text-foreground">{{ version }}</dd>
        <dt class="text-muted-foreground">Author</dt>
        <dd class="m-0 text-foreground">{{ author }}</dd>
        <dt class="text-muted-foreground">GitHub</dt>
        <dd class="m-0">
          <a
            :href="githubUrl"
            class="text-foreground underline-offset-2 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            github.com/Oxion
          </a>
        </dd>
        <dt class="text-muted-foreground">License</dt>
        <dd class="m-0 text-foreground">{{ license }}</dd>
      </dl>
    </DialogContent>
  </Dialog>
</template>
